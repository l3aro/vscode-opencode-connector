// @ts-check
const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--watch') === false;

async function build() {
  const context = await esbuild.context({
    platform: 'node',
    target: 'node16',
    bundle: true,
    sourcemap: !production,
    minify: production,
    outdir: 'out',
    entryPoints: ['src/extension.ts'],
    external: ['vscode'],
    loader: {
      '.node': 'copy',
    },
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        production ? 'production' : 'development'
      ),
    },
  });

  // Also build the test runner and suite
  const testContext = await esbuild.context({
    platform: 'node',
    target: 'node16',
    bundle: true,
    sourcemap: !production,
    minify: production,
    outdir: 'out/test',
    entryPoints: [
      'test/runTest.ts',
      'test/suite/index.ts',
    ],
    external: [
      '@vscode/test-electron',
      'vscode',
      'mocha',
      'glob',
    ],
    loader: {
      '.node': 'copy',
    },
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        production ? 'production' : 'development'
      ),
    },
  });

  if (production) {
    await context.rebuild();
    await context.dispose();
    await testContext.rebuild();
    await testContext.dispose();
    console.log('Build completed successfully');
  } else {
    await context.watch();
    await testContext.watch();
    console.log('Watching for changes...');
  }
}

build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
