/**
 * Unit tests for DefaultInstanceManager
 */
import DefaultInstanceManager from '../../src/instance/defaultInstanceManager';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Create mock socket outside to share across tests
const mockSocket = {
  setTimeout: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
  connect: vi.fn(),
};

vi.mock('net', () => {
  return {
    Socket: vi.fn(() => mockSocket),
  };
});

describe('DefaultInstanceManager', () => {
  beforeEach(() => {
    DefaultInstanceManager.resetInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDefaultPort', () => {
    it('should return undefined initially', () => {
      const manager = DefaultInstanceManager.getInstance();
      expect(manager.getDefaultPort()).toBeUndefined();
    });
  });

  describe('setDefaultPort', () => {
    it('should return the port after setting it', () => {
      const manager = DefaultInstanceManager.getInstance();
      const testPort = 4096;

      manager.setDefaultPort(testPort);
      expect(manager.getDefaultPort()).toBe(testPort);
    });

    it('should allow updating the port', () => {
      const manager = DefaultInstanceManager.getInstance();

      manager.setDefaultPort(4096);
      expect(manager.getDefaultPort()).toBe(4096);

      manager.setDefaultPort(8080);
      expect(manager.getDefaultPort()).toBe(8080);
    });
  });

  describe('clearDefault', () => {
    it('should reset port to undefined', () => {
      const manager = DefaultInstanceManager.getInstance();

      manager.setDefaultPort(4096);
      expect(manager.getDefaultPort()).toBe(4096);

      manager.clearDefault();
      expect(manager.getDefaultPort()).toBeUndefined();
    });
  });

  describe('isValid', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return false when no port is set', async () => {
      const manager = DefaultInstanceManager.getInstance();
      expect(manager.getDefaultPort()).toBeUndefined();

      const result = await manager.isValid();
      expect(result).toBe(false);
    });

    it('should return false when port is not running (mock socket)', async () => {
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          setTimeout(() => callback({ code: 'ECONNREFUSED' }), 0);
        }
        return mockSocket;
      });

      const manager = DefaultInstanceManager.getInstance();
      manager.setDefaultPort(4096);

      const result = await manager.isValid();
      expect(result).toBe(false);
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should return true when port is running', async () => {
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
        return mockSocket;
      });

      const manager = DefaultInstanceManager.getInstance();
      manager.setDefaultPort(4096);

      const result = await manager.isValid();
      expect(result).toBe(true);
      expect(mockSocket.destroy).toHaveBeenCalled();
    });
  });

  describe('resetInstance', () => {
    it('should reset the singleton', () => {
      const manager1 = DefaultInstanceManager.getInstance();
      manager1.setDefaultPort(4096);

      DefaultInstanceManager.resetInstance();

      const manager2 = DefaultInstanceManager.getInstance();

      expect(manager1).not.toBe(manager2);
      expect(manager2.getDefaultPort()).toBeUndefined();
    });
  });

  describe('singleton behavior', () => {
    it('should return the same instance on multiple getInstance calls', () => {
      const manager1 = DefaultInstanceManager.getInstance();
      const manager2 = DefaultInstanceManager.getInstance();

      expect(manager1).toBe(manager2);
    });
  });
});
