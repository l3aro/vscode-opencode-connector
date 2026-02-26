import { OpenCodeClient } from '../api/openCodeClient';
import { ConfigManager } from '../config';
import { DefaultInstanceManager } from '../instance/defaultInstanceManager';
import { InstanceManager } from '../instance/instanceManager';

import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Logger interface for output channel
 */
interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Connection state change event
 */
export interface ConnectionStateEvent {
  connected: boolean;
  port?: number;
}

/**
 * Connection Service for OpenCode
 * Manages connection lifecycle: discovery, auto-spawn, and fallback
 */
export class ConnectionService {
  private client: OpenCodeClient | undefined;
  private connectedPort: number | undefined;
  private lastAutoSpawnError: string | undefined;

  private configManager: ConfigManager;
  private instanceManager: InstanceManager;
  private outputChannel: Logger | undefined;

  // Event emitter for connection state changes
  private _onDidChangeConnectionState = new vscode.EventEmitter<ConnectionStateEvent>();
  public readonly onDidChangeConnectionState = this._onDidChangeConnectionState.event;

  constructor(
    configManager: ConfigManager,
    instanceManager: InstanceManager,
    outputChannel?: Logger
  ) {
    this.configManager = configManager;
    this.instanceManager = instanceManager;
    this.outputChannel = outputChannel;
  }

  /**
   * Discover a running OpenCode instance serving the current workspace directory.
   * Scans running processes, verifies each with GET /path, and matches against workspace CWD.
   * If a match is found, creates/updates the global client to use that port.
   * @param delayMs - Delay between retries in ms (default: 2000)
   * @returns true if connected, false if no matching instance found
   */
  async discoverAndConnect(retries: number = 3, delayMs: number = 2000): Promise<boolean> {
    // Get the workspace directory to match against
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }
    const workspaceDir = workspaceFolders[0].uri.fsPath;

    for (let attempt = 1; attempt <= retries; attempt++) {
      if (attempt > 1) {
        this.outputChannel?.info(
          `[discoverAndConnect] Retry ${attempt}/${retries} after ${delayMs}ms delay...`
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Scan for running opencode processes
      const processes = await this.instanceManager.scanForProcesses();
      this.outputChannel?.info(
        `[discoverAndConnect] Attempt ${attempt}: Found ${processes.length} OpenCode process(es): ${processes.map(p => p.port).join(', ')}`
      );

      if (processes.length === 0) {
        // No processes found, try again (server may be starting)
        continue;
      }

      // Deduplicate ports
      const uniquePorts = [...new Set(processes.map(p => p.port))];

      // Track if any process matched our workspace
      let foundMatchingProcess = false;

      // For each port, verify it's an OpenCode server serving our directory
      for (const port of uniquePorts) {
        try {
          this.outputChannel?.debug(`[discoverAndConnect] Checking port ${port}...`);
          const tempClient = new OpenCodeClient({ port, timeout: 3000, maxRetries: 0 });
          const pathInfo = await tempClient.getPath();
          tempClient.destroy();

          this.outputChannel?.debug(
            `[discoverAndConnect] Port ${port} server dir: "${pathInfo.directory}" vs workspace: "${workspaceDir}"`
          );

          const matches = pathsMatch(pathInfo.directory, workspaceDir);
          this.outputChannel?.debug(`[discoverAndConnect] Paths match: ${matches}`);

          // Normalize paths for comparison (platform-aware)
          if (matches) {
            foundMatchingProcess = true;
            // Found a match — update the global client
            if (this.connectedPort !== port) {
              if (this.client) {
                this.client.destroy();
              }
              this.client = new OpenCodeClient({ port });
              this.connectedPort = port;

              this.outputChannel?.info(
                `OpenCode Connector: auto-connected to instance on port ${port}`
              );
            }
            return true;
          }
        } catch (err) {
          // This port isn't a valid OpenCode server, skip
          this.outputChannel?.warn(
            `[discoverAndConnect] Port ${port} error: ${(err as Error).message}`
          );
          continue;
        }
      }

      // If processes were found but none matched our workspace, no point retrying
      if (!foundMatchingProcess) {
        this.outputChannel?.info(
          '[discoverAndConnect] Processes found but none match workspace, giving up'
        );
        break;
      }
    }

    // Exhausted all retries
    this.outputChannel?.info(
      '[discoverAndConnect] No OpenCode processes found after retries, will attempt auto-spawn'
    );
    return false;
  }

  /**
   * Wait for the OpenCode server to be ready on a specific port
   * @param port - Port to check
   * @param retries - Number of retry attempts (default: 30)
   * @param delay - Delay between retries in ms (default: 1000)
   * @returns true if server is ready, false if timeout
   */
  async waitForServer(port: number, retries: number = 30, delay: number = 1000): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Create a temporary client to test the server
        const tempClient = new OpenCodeClient({ port, timeout: 1000, maxRetries: 0 });

        // Use getPath() as a health check (it tests the /path endpoint)
        await tempClient.getPath();
        tempClient.destroy();

        // Server is ready
        return true;
      } catch {
        // Server not ready yet, wait and retry
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Timeout - server never became ready
    return false;
  }

  /**
   * Ensure we're connected to an OpenCode instance.
   * Tries: current client → auto-discovery → auto-spawn → configured port.
   * @returns true if connected
   */
  async ensureConnected(): Promise<boolean> {
    // 0. Check for default port from previous session
    const defaultPort = DefaultInstanceManager.getInstance().getDefaultPort();
    if (defaultPort !== undefined) {
      const isValid = await DefaultInstanceManager.getInstance().isValid();
      if (isValid) {
        // Check if it serves the current workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const currentWorkspaceDir = workspaceFolders[0].uri.fsPath;
          try {
            const tempClient = new OpenCodeClient({
              port: defaultPort,
              timeout: 3000,
              maxRetries: 0,
            });
            const pathInfo = await tempClient.getPath();
            tempClient.destroy();

            if (pathsMatch(pathInfo.directory, currentWorkspaceDir)) {
              // Default port is valid and serves current workspace - connect directly
              if (this.client) {
                this.client.destroy();
              }
              this.client = new OpenCodeClient({ port: defaultPort });
              this.connectedPort = defaultPort;

              this.outputChannel?.info(`Using default instance on port ${defaultPort}`);
              this._onDidChangeConnectionState.fire({ connected: true, port: defaultPort });
              return true;
            }
            // Default port is valid but serves different workspace - clear and continue
            this.outputChannel?.info(
              `Default instance on port ${defaultPort} serves different workspace, clearing`
            );
            DefaultInstanceManager.getInstance().clearDefault();
          } catch {
            // Default port is valid but not responding to getPath - clear and continue
            this.outputChannel?.info(
              `Default instance on port ${defaultPort} not responding, clearing`
            );
            DefaultInstanceManager.getInstance().clearDefault();
          }
        }
      } else {
        // Default port is not valid (no instance running) - clear and continue
        this.outputChannel?.info(`Default instance invalid, clearing`);
        DefaultInstanceManager.getInstance().clearDefault();
      }
    }

    // 1. Check if current client is still alive AND serving the correct workspace
    if (this.client) {
      try {
        const connected = await this.client.testConnection();
        if (connected) {
          // Client is alive — verify it's serving the current workspace
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders && workspaceFolders.length > 0) {
            const currentWorkspaceDir = workspaceFolders[0].uri.fsPath;
            const pathInfo = await this.client.getPath();
            if (pathsMatch(pathInfo.directory, currentWorkspaceDir)) {
              this._onDidChangeConnectionState.fire({ connected: true, port: this.connectedPort });
              return true;
            }
            // Client is alive but serving wrong workspace — destroy and re-discover
            this.client.destroy();
            this.client = undefined;
            this.connectedPort = undefined;
          }
        }
      } catch {
        // Current client is dead, try discovery
      }
    }

    // 2. Auto-discover from running processes
    const discovered = await this.discoverAndConnect();
    if (discovered) {
      this._onDidChangeConnectionState.fire({ connected: true, port: this.connectedPort });
      return true;
    }

    // 3. Auto-spawn new instance if discovery failed
    this.lastAutoSpawnError = undefined;
    try {
      // Find an available port
      const port = await this.instanceManager.findAvailablePort();

      // Spawn in terminal
      await this.instanceManager.spawnInTerminal(port);

      // Wait for server to be ready
      const serverReady = await this.waitForServer(port);

      if (serverReady) {
        // Additional settling delay — the HTTP server responds before the TUI
        // is fully initialized. Without this, the first appendPrompt is dropped.
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Update the client to use the new port
        if (this.client) {
          this.client.destroy();
        }
        this.client = new OpenCodeClient({ port });
        this.connectedPort = port;

        this.outputChannel?.info(
          `OpenCode Connector: spawned and connected to instance on port ${port}`
        );
        this._onDidChangeConnectionState.fire({ connected: true, port });
        return true;
      } else {
        this.lastAutoSpawnError = `Spawned OpenCode on port ${port} but it did not become ready within 30s. Check the "OpenCode" terminal for errors.`;
      }
    } catch (err) {
      this.lastAutoSpawnError = `Auto-spawn failed: ${(err as Error).message}`;
      // Continue to fallback
    }

    // 4. Fall back to configured port
    const port = this.configManager.getPort() ?? 4096;
    if (!this.client || this.client.getPort() !== port) {
      if (this.client) {
        this.client.destroy();
      }
      this.client = new OpenCodeClient({ port });
      this.connectedPort = port;
    }

    // Test the fallback
    try {
      const connected = await this.client.testConnection();
      if (connected) {
        this._onDidChangeConnectionState.fire({ connected: true, port });
      }
      return connected;
    } catch {
      return false;
    }
  }

  /**
   * Get the current OpenCodeClient instance
   * @returns The current client or undefined
   */
  getClient(): OpenCodeClient | undefined {
    return this.client;
  }

  /**
   * Get the currently connected port
   * @returns The current port or undefined
   */
  getPort(): number | undefined {
    return this.connectedPort;
  }

  /**
   * Get the last auto-spawn error message
   * @returns Error message or undefined
   */
  getLastAutoSpawnError(): string | undefined {
    return this.lastAutoSpawnError;
  }

  /**
   * Check if an OpenCode instance is running on a specific port
   * @param port - Port to check
   * @returns Result indicating if instance is running
   */
  async getRunningInstance(port: number): Promise<{ isRunning: boolean; pid?: number }> {
    return this.instanceManager.getRunningInstance(port);
  }

  /**
   * Spawn a new OpenCode instance
   * @param port - Port to run the instance on
   * @returns Result indicating success or error
   */
  async spawnInstance(port: number): Promise<{ success: boolean; error?: string }> {
    return this.instanceManager.spawnInstance(port);
  }

  /**
   * Get the InstanceManager instance
   * @returns The instance manager
   */
  getInstanceManager(): InstanceManager {
    return this.instanceManager;
  }

  /**
   * Get the ConfigManager instance
   * @returns The config manager
   */
  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  /**
   * Focus the integrated terminal
   * @returns true if successful
   */
  async focusTerminal(): Promise<boolean> {
    return this.instanceManager.focusTerminal();
  }

  /**
   * Disconnect from the current OpenCode instance.
   * Destroys the client and clears the connection state.
   */
  disconnect(): void {
    if (this.client) {
      this.client.destroy();
      this.client = undefined;
      this.connectedPort = undefined;
      this.outputChannel?.info('OpenCode Connector: disconnected');
      this._onDidChangeConnectionState.fire({ connected: false });
    }
  }

  dispose(): void {
    this._onDidChangeConnectionState.dispose();
  }

  /**
   * Check if currently connected to an OpenCode instance.
   * @returns true if connected
   */
  isConnected(): boolean {
    return this.client !== undefined;
  }
}

/**
 * Check if running in a remote session (SSH, WSL, Containers, Dev Pods)
 * @returns true if running in a remote environment
 */
export function isRemoteSession(): boolean {
  return vscode.env.remoteName !== undefined;
}

/**
 * Normalize and compare filesystem paths across platforms.
 * Handles: path separators, trailing slashes, remote path formats.
 * @param serverPath - Path returned by OpenCode server
 * @param localPath - Path from VSCode workspace
 * @returns true if paths refer to the same directory
 */
export function pathsMatch(serverPath: string, localPath: string): boolean {
  // Normalize: resolve to absolute, remove trailing separators, lowercase if case-insensitive
  const normalize = (p: string): string => {
    // Resolve relative paths to absolute (handles "." and "./")
    let resolved = path.resolve(p);
    // Normalize separators to platform default
    resolved = path.normalize(resolved);
    // Remove trailing slashes
    resolved = resolved.replace(/[\\/]+$/, '');
    return resolved;
  };

  const normalizedServer = normalize(serverPath);
  const normalizedLocal = normalize(localPath);

  // On case-insensitive filesystems (Windows, macOS), use case-insensitive comparison
  // On case-sensitive filesystems (Linux, most remote servers), use case-sensitive comparison
  const isCaseSensitive = process.platform !== 'win32' && process.platform !== 'darwin';

  if (isCaseSensitive) {
    return normalizedServer === normalizedLocal;
  }
  return normalizedServer.toLowerCase() === normalizedLocal.toLowerCase();
}

export default ConnectionService;
