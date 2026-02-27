/**
 * Default Instance Manager for OpenCode
 * Singleton for session-only default port tracking (in-memory only)
 */
import * as net from 'net';

/**
 * Default Instance Manager for OpenCode
 * Tracks the default port for the session without persistent storage
 */
export class DefaultInstanceManager {
  private static instance: DefaultInstanceManager;
  private defaultPort: number | undefined;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance of DefaultInstanceManager
   */
  public static getInstance(): DefaultInstanceManager {
    if (!DefaultInstanceManager.instance) {
      DefaultInstanceManager.instance = new DefaultInstanceManager();
    }
    return DefaultInstanceManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    DefaultInstanceManager.instance = undefined as unknown as DefaultInstanceManager;
  }

  /**
   * Get the current default port
   * @returns The default port number, or undefined if not set
   */
  public getDefaultPort(): number | undefined {
    return this.defaultPort;
  }

  /**
   * Set the default port for the session
   * @param port - The port number to set as default
   */
  public setDefaultPort(port: number): void {
    this.defaultPort = port;
  }

  /**
   * Clear the default port
   */
  public clearDefault(): void {
    this.defaultPort = undefined;
  }

  /**
   * Check if the default port has a running OpenCode instance
   * @returns Promise<boolean> - true if instance is running, false otherwise
   */
  public async isValid(): Promise<boolean> {
    if (this.defaultPort === undefined) {
      return false;
    }

    const port = this.defaultPort;

    return new Promise(resolve => {
      const socket = new net.Socket();

      socket.setTimeout(2000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', (err: Error & { code?: string }) => {
        if (err.code === 'EADDRINUSE') {
          socket.destroy();
          resolve(true);
        } else if (err.code === 'ECONNREFUSED') {
          socket.destroy();
          resolve(false);
        } else {
          socket.destroy();
          resolve(false);
        }
      });

      socket.connect(port, 'localhost');
    });
  }
}

export default DefaultInstanceManager;
