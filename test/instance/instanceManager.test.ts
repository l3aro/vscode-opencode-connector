/**
 * Tests for InstanceManager
 */
import { ConfigManager } from '../../src/config';
import {
  InstanceManager,
  PlatformUtils,
  checkInstanceSync,
} from '../../src/instance/instanceManager';

import * as net from 'net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock vscode module
const mockVscode = {
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn().mockImplementation((key: string) => {
        const configs: Record<string, unknown> = {
          port: 3000,
          binaryPath: '',
        };
        return configs[key] ?? null;
      }),
      update: vi.fn().mockResolvedValue(undefined),
    }),
  },
};

vi.mock('vscode', () => mockVscode);

// Mock config manager factory
const createMockConfigManager = (
  port: number = 3000,
  binaryPath: string = 'opencode'
): ConfigManager => {
  return {
    getPort: () => port,
    getBinaryPath: () => binaryPath,
    setPort: () => Promise.resolve(),
    setBinaryPath: () => Promise.resolve(),
    getDefaults: () => ({ port: 3000, binaryPath: '' }),
  } as unknown as ConfigManager;
};

describe('InstanceManager', () => {
  let instanceManager: InstanceManager;
  let mockConfigManager: ReturnType<typeof createMockConfigManager>;

  beforeEach(() => {
    InstanceManager.resetInstance();
    mockConfigManager = createMockConfigManager(3000, 'opencode');
    instanceManager = InstanceManager.getInstance(mockConfigManager as unknown as ConfigManager);
  });

  afterEach(() => {
    InstanceManager.resetInstance();
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = InstanceManager.getInstance(mockConfigManager);
      const instance2 = InstanceManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create a new instance when config is provided and no instance exists', () => {
      InstanceManager.resetInstance();
      const instance = InstanceManager.getInstance(mockConfigManager);
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(InstanceManager);
    });
  });

  describe('resetInstance', () => {
    it('should reset the singleton instance', () => {
      const instance1 = InstanceManager.getInstance(mockConfigManager);
      InstanceManager.resetInstance();
      const newMockConfig = createMockConfigManager(3001, 'opencode');
      const instance2 = InstanceManager.getInstance(newMockConfig);
      expect(instance1).not.toBe(instance2);
    });

    it('should allow creating a new instance after reset', () => {
      const instance1 = InstanceManager.getInstance(mockConfigManager);
      InstanceManager.resetInstance();
      const instance2 = InstanceManager.getInstance(mockConfigManager);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('getBinaryPath', () => {
    it('should return the configured binary path', () => {
      const binaryPath = '/custom/path/opencode';
      InstanceManager.resetInstance();
      const testConfig = createMockConfigManager(3000, binaryPath);
      const testManager = InstanceManager.getInstance(testConfig);
      expect(testManager.getBinaryPath()).toBe(binaryPath);
    });
  });

  describe('getPort', () => {
    it('should return the configured port', () => {
      const port = 4000;
      InstanceManager.resetInstance();
      const testConfig = createMockConfigManager(port, 'opencode');
      const testManager = InstanceManager.getInstance(testConfig);
      expect(testManager.getPort()).toBe(port);
    });
  });
});

describe('PlatformUtils', () => {
  describe('isWindows', () => {
    it('should correctly detect Windows platform', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(PlatformUtils.isWindows()).toBe(true);
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(PlatformUtils.isWindows()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('getShellPrefix', () => {
    it('should return cmd /c for Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const result = PlatformUtils.getShellPrefix();
      expect(result.command).toBe('cmd');
      expect(result.args).toEqual(['/c']);
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return sh -c for Unix', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const result = PlatformUtils.getShellPrefix();
      expect(result.command).toBe('sh');
      expect(result.args).toEqual(['-c']);
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('getCommandWithExtension', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should add .cmd extension on Windows for regular commands', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(PlatformUtils.getCommandWithExtension('opencode')).toBe('opencode.cmd');
    });

    it('should not modify commands ending with .js on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(PlatformUtils.getCommandWithExtension('script.js')).toBe('script.js');
    });

    it('should not modify commands ending with .exe on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(PlatformUtils.getCommandWithExtension('program.exe')).toBe('program.exe');
    });

    it('should not add extension on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(PlatformUtils.getCommandWithExtension('opencode')).toBe('opencode');
    });
  });
});

describe('InstanceManager Integration Tests', () => {
  beforeEach(() => {
    InstanceManager.resetInstance();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    InstanceManager.resetInstance();
    vi.restoreAllMocks();
  });

  describe('singleton behavior', () => {
    it('should maintain state across method calls', () => {
      const config = createMockConfigManager(5000, 'test-binary');
      const manager1 = InstanceManager.getInstance(config);
      const config2 = createMockConfigManager(6000, 'test-binary-2');
      const manager2 = InstanceManager.getInstance(config2);
      expect(manager1).toBe(manager2);
      expect(manager1.getPort()).toBe(5000);
    });

    it('should allow proper reset and recreation', () => {
      const config1 = createMockConfigManager(7000, 'binary1');
      const manager1 = InstanceManager.getInstance(config1);
      InstanceManager.resetInstance();
      const config2 = createMockConfigManager(8000, 'binary2');
      const manager2 = InstanceManager.getInstance(config2);
      expect(manager1).not.toBe(manager2);
      expect(manager2.getPort()).toBe(8000);
      expect(manager2.getBinaryPath()).toBe('binary2');
    });

    it('should properly isolate test state with reset', () => {
      {
        const config = createMockConfigManager(9000, 'first-binary');
        const manager = InstanceManager.getInstance(config);
        expect(manager.getPort()).toBe(9000);
        InstanceManager.resetInstance();
      }
      {
        InstanceManager.resetInstance();
        const config = createMockConfigManager(10000, 'second-binary');
        const manager = InstanceManager.getInstance(config);
        expect(manager.getPort()).toBe(10000);
        expect(manager.getBinaryPath()).toBe('second-binary');
      }
    });
  });
});
