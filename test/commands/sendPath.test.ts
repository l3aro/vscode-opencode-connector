import {
  formatAbsolutePath,
  formatPaths,
  formatRelativePath,
  isDirectory,
} from '../../src/utils/pathUtils';

import * as path from 'path';
import { describe, expect, it } from 'vitest';

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

  describe('formatAbsolutePath', () => {
    it('should add @ prefix to file paths', () => {
      const result = formatAbsolutePath('/home/user/project/src/index.ts');
      expect(result).toBe('@/home/user/project/src/index.ts');
    });

    it('should add @ prefix and trailing slash for directories', () => {
      const result = formatAbsolutePath('/home/user/project/src');
      expect(result).toBe('@/home/user/project/src' + path.sep);
    });
  });

  describe('formatPaths', () => {
    it('should not add trailing slash for files', () => {
      const resources = [{ fsPath: '/home/user/project/src/index.ts' }];
      const result = formatPaths(resources);
      expect(result).toBe('@/home/user/project/src/index.ts');
    });

    it('should add @ prefix and trailing slash for directories', () => {
      const resources = [{ fsPath: '/home/user/project/src' }];
      const result = formatPaths(resources);
      expect(result).toBe('@/home/user/project/src' + path.sep);
    });

    it('should separate multiple paths with newlines', () => {
      const resources = [
        { fsPath: '/home/user/project/src/index.ts' },
        { fsPath: '/home/user/project/src/utils.ts' },
      ];
      const result = formatPaths(resources);
      expect(result).toBe('@/home/user/project/src/index.ts\n@/home/user/project/src/utils.ts');
    });

    it('should handle mixed files and directories', () => {
      const resources = [
        { fsPath: '/home/user/project/src/index.ts' },
        { fsPath: '/home/user/project/src/utils' },
      ];
      const result = formatPaths(resources);
      expect(result).toBe(
        '@/home/user/project/src/index.ts\n@/home/user/project/src/utils' + path.sep
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
      expect(result).toBe('@/home/user/project/main.ts');
    });
  });

  describe('formatRelativePath', () => {
    it('should add @ prefix to relative file paths', () => {
      const result = formatRelativePath('src/index.ts', false);
      expect(result).toBe('@src/index.ts');
    });

    it('should add @ prefix and trailing slash for relative directories', () => {
      const result = formatRelativePath('src', true);
      expect(result).toBe('@src' + path.sep);
    });

    it('should handle nested paths', () => {
      const result = formatRelativePath('src/utils/helpers.ts', false);
      expect(result).toBe('@src/utils/helpers.ts');
    });
  });
});
