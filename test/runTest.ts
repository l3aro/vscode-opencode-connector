/**
 * VSCode Integration Test Runner
 * Uses @vscode/test-electron to run integration tests
 */
import * as vscodeTest from '@vscode/test-electron';

import * as path from 'path';

async function runTests(): Promise<void> {
  try {
    // The folder containing the extension manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the test runner script (compiled from this file)
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // The workspace folder for tests
    const workspaceFolder = path.resolve(__dirname, '../../test-workspace');

    // Download VS Code, unzip it and run the integration test
    await vscodeTest.runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspaceFolder,
        '--disable-extensions',
        '--disable-gpu',
        '--skip-release-notes',
      ],
      version: 'stable',
    });
  } catch (error) {
    console.error('Failed to run integration tests:', error);
    process.exit(1);
  }
}

runTests();
