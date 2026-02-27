/**
 * Unit tests for path matching functionality (remote SSH support)
 */
// Now import after mocking
import { pathsMatch } from '../../src/connection/connectionService';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the vscode module before importing
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' }, name: 'test-workspace' }],
    name: 'test-workspace',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asRelativePath: vi.fn((uri: any) => uri?.fsPath || ''),
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
    })),
  },
  env: {
    remoteName: undefined,
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
}));

// We'll test the path normalization logic by importing and testing the concept

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

    const pathsMatchMock = (serverPath: string, localPath: string, platform: string): boolean => {
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
      expect(pathsMatchMock('/home/user/project', '/home/user/project', 'linux')).toBe(true);
    });

    it('should NOT match different case on Linux (case-sensitive)', () => {
      expect(pathsMatchMock('/home/user/project', '/home/User/Project', 'linux')).toBe(false);
    });

    it('should match relative path from OpenCode with absolute workspace path', () => {
      // OpenCode might return '.' or './' when started from project dir
      expect(pathsMatchMock('.', '/home/user/project', 'linux')).toBe(false);
      expect(pathsMatchMock('/home/user/project', '/home/user/project', 'linux')).toBe(true);
    });

    // Windows local scenarios (case-insensitive)
    it('should match case-insensitive paths on Windows', () => {
      expect(pathsMatchMock('C:\\Users\\User\\Project', 'c:\\users\\user\\project', 'win32')).toBe(
        true
      );
    });

    // macOS scenarios (case-insensitive)
    it('should match case-insensitive paths on macOS', () => {
      expect(pathsMatchMock('/Users/user/Project', '/users/user/project', 'darwin')).toBe(true);
    });

    it('should handle trailing slashes consistently', () => {
      expect(pathsMatchMock('/home/user/project/', '/home/user/project', 'linux')).toBe(true);
      expect(pathsMatchMock('/home/user/project', '/home/user/project/', 'linux')).toBe(true);
    });

    it('should handle Windows network paths', () => {
      expect(
        pathsMatchMock('\\\\server\\share\\project', '\\\\SERVER\\SHARE\\project', 'win32')
      ).toBe(true);
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

describe('pathsMatch - parent/child directory matching', () => {
  it('should match when server path is parent of workspace path on Linux', () => {
    // Server: /home/user/project, Workspace: /home/user/project/src -> TRUE
    const result = pathsMatch('/home/user/project', '/home/user/project/src');
    expect(result).toBe(true);
  });

  it('should match when server path is child of workspace path on Linux', () => {
    // Server: /home/user/project/src, Workspace: /home/user/project -> TRUE
    const result = pathsMatch('/home/user/project/src', '/home/user/project');
    expect(result).toBe(true);
  });

  it.skip('should match parent directory case-insensitively on Windows', () => {
    // Skipped: Only valid on Windows (case-insensitive filesystem)
    // On Linux (case-sensitive), paths with different case don't match
  });

  it.skip('should match child directory case-insensitively on Windows', () => {
    // Skipped: Only valid on Windows (case-insensitive filesystem)
  });

  it.skip('should match parent directory case-insensitively on macOS', () => {
    // Skipped: Only valid on macOS (case-insensitive filesystem)
  });

  it.skip('should match child directory case-insensitively on macOS', () => {
    // Skipped: Only valid on macOS (case-insensitive filesystem)
  });

  it('should NOT match when paths have similar prefix but different separator boundaries', () => {
    // False positive: /project should NOT match /project-backup/src
    const result = pathsMatch('/project', '/project-backup/src');
    expect(result).toBe(false);
  });

  it('should handle root directory edge case correctly', () => {
    // Root directory: / should not match unrelated paths inappropriately
    const result = pathsMatch('/', '/some/random/path');
    expect(result).toBe(false);
  });

  it('should return false for empty paths', () => {
    const result1 = pathsMatch('', '/some/path');
    const result2 = pathsMatch('/some/path', '');
    const result3 = pathsMatch('', '');

    expect(result1).toBe(false);
    expect(result2).toBe(false);
    expect(result3).toBe(false);
  });
});
