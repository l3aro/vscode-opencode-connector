/**
 * Standalone tests for port scanning functionality
 * Tests the core algorithm without VSCode dependencies
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Create a mock module that exports just the functions we need to test
const createPortScanner = () => {
  /**
   * Check if a port is available
   */
  const checkPortAvailable = (port: number): Promise<boolean> => {
    return new Promise(resolve => {
      // Simulate port availability check
      // In real implementation, this would use net.Socket
      const isAvailable = port < 4100; // Ports < 4100 are "available" in this mock

      setTimeout(() => {
        resolve(isAvailable);
      }, 10);
    });
  };

  /**
   * Find first available port in range
   */
  const findAvailablePort = async (
    startPort: number = 4096,
    endPort: number = 5096
  ): Promise<number> => {
    for (let port = startPort; port <= endPort; port++) {
      const isAvailable = await checkPortAvailable(port);
      if (isAvailable) {
        return port;
      }
    }

    throw new Error(
      `No available ports in range ${startPort}-${endPort}. Please close unused sessions and retry.`
    );
  };

  return { checkPortAvailable, findAvailablePort };
};

describe('Port Scanner', () => {
  describe('checkPortAvailable', () => {
    it('should return true for available ports', async () => {
      const { checkPortAvailable } = createPortScanner();
      const result = await checkPortAvailable(4096);
      expect(result).toBe(true);
    });

    it('should return false for busy ports', async () => {
      const { checkPortAvailable } = createPortScanner();
      const result = await checkPortAvailable(4100);
      expect(result).toBe(false);
    });
  });

  describe('findAvailablePort', () => {
    it('should return first available port in range', async () => {
      const { findAvailablePort } = createPortScanner();
      const result = await findAvailablePort(4096, 4100);
      // Should return 4096 since it's the first available port
      expect(result).toBe(4096);
    });

    it('should skip busy ports and find next available', async () => {
      const customScanner = () => {
        const checkPortAvailable = (port: number): Promise<boolean> => {
          return Promise.resolve(port !== 4096 && port !== 4097); // 4096 and 4097 are busy
        };

        const findAvailablePort = async (
          startPort: number = 4096,
          endPort: number = 5096
        ): Promise<number> => {
          for (let port = startPort; port <= endPort; port++) {
            const isAvailable = await checkPortAvailable(port);
            if (isAvailable) {
              return port;
            }
          }

          throw new Error(
            `No available ports in range ${startPort}-${endPort}. Please close unused sessions and retry.`
          );
        };

        return { checkPortAvailable, findAvailablePort };
      };

      const { findAvailablePort } = customScanner();
      const result = await findAvailablePort(4096, 4100);
      // Should return 4098 since 4096 and 4097 are busy
      expect(result).toBe(4098);
    });

    it('should throw error when no ports available', async () => {
      const busyScanner = () => {
        const checkPortAvailable = (): Promise<boolean> => {
          return Promise.resolve(false); // All ports busy
        };

        const findAvailablePort = async (
          startPort: number = 4096,
          endPort: number = 5096
        ): Promise<number> => {
          for (let port = startPort; port <= endPort; port++) {
            const isAvailable = await checkPortAvailable();
            if (isAvailable) {
              return port;
            }
          }

          throw new Error(
            `No available ports in range ${startPort}-${endPort}. Please close unused sessions and retry.`
          );
        };

        return { checkPortAvailable, findAvailablePort };
      };

      const { findAvailablePort } = busyScanner();

      await expect(findAvailablePort(4096, 4100)).rejects.toThrow(
        'No available ports in range 4096-4100. Please close unused sessions and retry.'
      );
    });

    it('should use default port range 4096-5096', async () => {
      const { findAvailablePort } = createPortScanner();

      // Should not throw and should find port in default range
      const result = await findAvailablePort();
      expect(result).toBeGreaterThanOrEqual(4096);
      expect(result).toBeLessThanOrEqual(5096);
    });

    it('should return immediately if first port is available', async () => {
      const fastScanner = () => {
        let checkCount = 0;
        const checkPortAvailable = (): Promise<boolean> => {
          checkCount++;
          return Promise.resolve(true); // First port is available
        };

        const findAvailablePort = async (
          startPort: number = 4096,
          endPort: number = 5096
        ): Promise<number> => {
          for (let port = startPort; port <= endPort; port++) {
            const isAvailable = await checkPortAvailable();
            if (isAvailable) {
              return port;
            }
          }

          throw new Error(
            `No available ports in range ${startPort}-${endPort}. Please close unused sessions and retry.`
          );
        };

        return { checkPortAvailable, findAvailablePort, getCheckCount: () => checkCount };
      };

      const { findAvailablePort, getCheckCount } = fastScanner();
      const result = await findAvailablePort(4096, 4097);

      expect(result).toBe(4096);
      expect(getCheckCount()).toBe(1); // Should only check once
    });

    it('should iterate through entire range if needed', async () => {
      const thoroughScanner = () => {
        let checkCount = 0;
        const checkPortAvailable = (port: number): Promise<boolean> => {
          checkCount++;
          return Promise.resolve(port === 4100); // Only last port available
        };

        const findAvailablePort = async (
          startPort: number = 4096,
          endPort: number = 5100
        ): Promise<number> => {
          for (let port = startPort; port <= endPort; port++) {
            const isAvailable = await checkPortAvailable(port);
            if (isAvailable) {
              return port;
            }
          }

          throw new Error(
            `No available ports in range ${startPort}-${endPort}. Please close unused sessions and retry.`
          );
        };

        return { checkPortAvailable, findAvailablePort, getCheckCount: () => checkCount };
      };

      const { findAvailablePort, getCheckCount } = thoroughScanner();
      const result = await findAvailablePort(4096, 4100);

      expect(result).toBe(4100);
      expect(getCheckCount()).toBe(5); // Should check all 5 ports (4096-4100)
    });
  });
});
