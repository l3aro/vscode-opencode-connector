import * as path from 'path';
import { describe, expect, it } from 'vitest';

function isDirectory(filePath: string): boolean {
  if (filePath.endsWith('/') || filePath.endsWith('\\')) {
    return true;
  }

  const basename = path.basename(filePath);
  return !basename.includes('.');
}

function formatPaths(resources: { fsPath: string }[]): string {
  const paths = resources.map(uri => {
    const filePath = uri.fsPath;
    if (isDirectory(filePath)) {
      return filePath + path.sep;
    }
    return filePath;
  });

  return paths.join('\n');
}

describe('sendPath utilities', () => {
  describe('isDirectory', () => {
    it('should return true for path ending with /', () => {
      expect(isDirectory('/home/user/project/src/')).toBe(true);
    });

    it('should return true for path ending with \\', () => {
      expect(isDirectory('C:\\Users\\project\\src\\')).toBe(true);
    });

    it('should return true for path with no extension', () => {
      expect(isDirectory('/home/user/project/src')).toBe(true);
    });

    it('should return false for file with extension', () => {
      expect(isDirectory('/home/user/project/src/index.ts')).toBe(false);
    });

    it('should return false for file with multiple dots', () => {
      expect(isDirectory('/home/user/project/src/app.component.ts')).toBe(false);
    });
  });

  describe('formatPaths', () => {
    it('should not add trailing slash for files', () => {
      const resources = [{ fsPath: '/home/user/project/src/index.ts' }];
      const result = formatPaths(resources);
      expect(result).toBe('/home/user/project/src/index.ts');
    });

    it('should add trailing slash for directories', () => {
      const resources = [{ fsPath: '/home/user/project/src' }];
      const result = formatPaths(resources);
      expect(result).toBe('/home/user/project/src' + path.sep);
    });

    it('should separate multiple paths with newlines', () => {
      const resources = [
        { fsPath: '/home/user/project/src/index.ts' },
        { fsPath: '/home/user/project/src/utils.ts' },
      ];
      const result = formatPaths(resources);
      expect(result).toBe('/home/user/project/src/index.ts\n/home/user/project/src/utils.ts');
    });

    it('should handle mixed files and directories', () => {
      const resources = [
        { fsPath: '/home/user/project/src/index.ts' },
        { fsPath: '/home/user/project/src/utils' },
      ];
      const result = formatPaths(resources);
      expect(result).toBe(
        '/home/user/project/src/index.ts\n/home/user/project/src/utils' + path.sep
      );
    });

    it('should handle empty array', () => {
      const resources: { fsPath: string }[] = [];
      const result = formatPaths(resources);
      expect(result).toBe('');
    });

    it('should handle single file', () => {
      const resources = [{ fsPath: '/home/user/project/main.ts' }];
      const result = formatPaths(resources);
      expect(result).toBe('/home/user/project/main.ts');
    });
  });
});
