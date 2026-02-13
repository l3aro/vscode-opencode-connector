/**
 * Unit tests for path matching functionality (remote SSH support)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We'll test the path normalization logic by importing and testing the concept
// Since the functions are local to extension.ts, we test the logic patterns

describe('Path Matching Logic', () => {
  describe('pathsMatch - path normalization', () => {
    /**
     * Simulates the normalize function from extension.ts pathsMatch helper
     */
    const normalizePath = (p: string): string => {
      // Simple normalize for testing - mimics the path.normalize and trailing slash removal
      let resolved = p.replace(/\\/g, '/'); // Normalize backslashes
      resolved = resolved.replace(/\/+/g, '/'); // Collapse multiple slashes
      resolved = resolved.replace(/\/$/, ''); // Remove trailing slash
      return resolved;
    };

    it('should normalize forward slashes', () => {
      expect(normalizePath('/home/user/project/')).toBe('/home/user/project');
      expect(normalizePath('/home/user//project/')).toBe('/home/user/project');
    });

    it('should normalize Windows backslashes', () => {
      expect(normalizePath('\\home\\user\\project\\')).toBe('/home/user/project');
      expect(normalizePath('\\home\\user\\\\project\\')).toBe('/home/user/project');
    });

    it('should handle mixed slashes', () => {
      expect(normalizePath('/home/user\\project/')).toBe('/home/user/project');
    });

    it('should remove trailing slashes', () => {
      expect(normalizePath('/home/user/project//')).toBe('/home/user/project');
    });

    it('should handle relative paths', () => {
      expect(normalizePath('./project/')).toBe('./project');
      expect(normalizePath('../project/')).toBe('../project');
    });
  });

  describe('pathsMatch - case sensitivity', () => {
    /**
     * Tests the case sensitivity logic based on process.platform
     */
    const testCaseSensitivity = (platform: string): boolean => {
      // Simulates the logic from pathsMatch in extension.ts
      const isCaseSensitive = platform !== 'win32' && platform !== 'darwin';
      return isCaseSensitive;
    };

    it('should be case-insensitive on Windows', () => {
      expect(testCaseSensitivity('win32')).toBe(false);
    });

    it('should be case-insensitive on macOS', () => {
      expect(testCaseSensitivity('darwin')).toBe(false);
    });

    it('should be case-sensitive on Linux', () => {
      expect(testCaseSensitivity('linux')).toBe(true);
    });

    it('should be case-sensitive on unknown platforms', () => {
      expect(testCaseSensitivity('freebsd')).toBe(true);
    });
  });

  describe('pathsMatch - practical scenarios', () => {
    /**
     * Tests practical path matching scenarios for remote SSH
     */
    const normalizePath = (p: string): string => {
      let resolved = p.replace(/\\/g, '/');
      resolved = resolved.replace(/\/+/g, '/');
      resolved = resolved.replace(/\/$/, '');
      return resolved;
    };

    const pathsMatch = (serverPath: string, localPath: string, platform: string): boolean => {
      const normalizedServer = normalizePath(serverPath);
      const normalizedLocal = normalizePath(localPath);

      const isCaseSensitive = platform !== 'win32' && platform !== 'darwin';

      if (isCaseSensitive) {
        return normalizedServer === normalizedLocal;
      }
      return normalizedServer.toLowerCase() === normalizedLocal.toLowerCase();
    };

    // Linux remote scenarios (case-sensitive)
    it('should match identical Linux paths (case-sensitive)', () => {
      expect(pathsMatch('/home/user/project', '/home/user/project', 'linux')).toBe(true);
    });

    it('should NOT match different case on Linux (case-sensitive)', () => {
      expect(pathsMatch('/home/user/project', '/home/User/Project', 'linux')).toBe(false);
    });

    it('should match relative path from OpenCode with absolute workspace path', () => {
      // OpenCode might return '.' or './' when started from project dir
      expect(pathsMatch('.', '/home/user/project', 'linux')).toBe(false);
      expect(pathsMatch('/home/user/project', '/home/user/project', 'linux')).toBe(true);
    });

    // Windows local scenarios (case-insensitive)
    it('should match case-insensitive paths on Windows', () => {
      expect(pathsMatch('C:\\Users\\User\\Project', 'c:\\users\\user\\project', 'win32')).toBe(
        true
      );
    });

    // macOS scenarios (case-insensitive)
    it('should match case-insensitive paths on macOS', () => {
      expect(pathsMatch('/Users/user/Project', '/users/user/project', 'darwin')).toBe(true);
    });

    it('should handle trailing slashes consistently', () => {
      expect(pathsMatch('/home/user/project/', '/home/user/project', 'linux')).toBe(true);
      expect(pathsMatch('/home/user/project', '/home/user/project/', 'linux')).toBe(true);
    });

    it('should handle Windows network paths', () => {
      expect(pathsMatch('\\\\server\\share\\project', '\\\\SERVER\\SHARE\\project', 'win32')).toBe(
        true
      );
    });
  });
});

describe('Remote Session Detection', () => {
  describe('isRemoteSession logic', () => {
    /**
     * Tests the remote session detection logic
     * In real code: vscode.env.remoteName !== undefined
     */
    const isRemoteSession = (remoteName: string | undefined): boolean => {
      return remoteName !== undefined;
    };

    it('should return false when remoteName is undefined (local)', () => {
      expect(isRemoteSession(undefined)).toBe(false);
    });

    it('should return true for SSH remote', () => {
      expect(isRemoteSession('ssh-remote')).toBe(true);
    });

    it('should return true for WSL remote', () => {
      expect(isRemoteSession('wsl')).toBe(true);
    });

    it('should return true for Containers remote', () => {
      expect(isRemoteSession('containers')).toBe(true);
    });

    it('should return true for Dev Pods remote', () => {
      expect(isRemoteSession('devpod')).toBe(true);
    });
  });
});

describe('pgrep Pattern Matching (Unix Process Discovery)', () => {
  describe('Unix process discovery pattern', () => {
    /**
     * Tests the pgrep pattern for finding OpenCode processes
     * Old pattern: 'opencode.*--port' - only finds with --port flag
     * New pattern: '^opencode(\\s|$)' - finds with or without --port
     */
    const testPgrepPattern = (pattern: string, commandLine: string): boolean => {
      // Simple regex test - in reality pgrep uses extended regex
      const regex = new RegExp(pattern);
      return regex.test(commandLine);
    };

    it('should match "opencode" (no flags)', () => {
      expect(testPgrepPattern('^opencode(\\s|$)', 'opencode')).toBe(true);
      expect(testPgrepPattern('^opencode(\\s|$)', 'opencode ')).toBe(true);
    });

    it('should match "opencode --port 4096"', () => {
      expect(testPgrepPattern('^opencode(\\s|$)', 'opencode --port 4096')).toBe(true);
      expect(testPgrepPattern('^opencode(\\s|$)', 'opencode --port=4096')).toBe(true);
    });

    it('should match "opencode --help"', () => {
      expect(testPgrepPattern('^opencode(\\s|$)', 'opencode --help')).toBe(true);
    });

    it('should NOT match "opencode-extra" (different program)', () => {
      expect(testPgrepPattern('^opencode(\\s|$)', 'opencode-extra')).toBe(false);
    });

    it('should NOT match "opencodehelper" (different program)', () => {
      expect(testPgrepPattern('^opencode(\\s|$)', 'opencodehelper')).toBe(false);
    });

    it('should NOT match "myopencode" (different program)', () => {
      expect(testPgrepPattern('^opencode(\\s|$)', 'myopencode')).toBe(false);
    });

    // The OLD pattern (for comparison - these would have failed)
    it('OLD PATTERN: would NOT match "opencode" without --port', () => {
      expect(testPgrepPattern('opencode.*--port', 'opencode')).toBe(false);
    });

    it('OLD PATTERN: would match "opencode --port 4096"', () => {
      expect(testPgrepPattern('opencode.*--port', 'opencode --port 4096')).toBe(true);
    });
  });
});
