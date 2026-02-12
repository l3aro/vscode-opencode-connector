/**
 * VSCode Integration Test Suite Index
 */

import * as path from 'path';
import Mocha from 'mocha';
import { globSync } from 'glob';

function run(): Promise<void> {
  return new Promise((resolve, reject) => {
    const mocha = new Mocha({
      ui: 'bdd',
      timeout: 30000,
      color: true,
    });

    const testsRoot = path.resolve(__dirname, '.');

    try {
      const files = globSync('**/*.test.ts', { cwd: testsRoot });

      if (files.length === 0) {
        console.log('No integration tests found.');
        resolve();
        return;
      }

      files.forEach((file: string) => {
        mocha.addFile(path.resolve(testsRoot, file));
      });

      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed`));
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { run };
