import { OpenCodeClient } from '../api/openCodeClient';
import { ConfigManager } from '../config';
import { DefaultInstanceManager } from '../instance/defaultInstanceManager';
import { InstanceManager } from '../instance/instanceManager';

import * as path from 'path';
import * as vscode from 'vscode';

interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

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
        this.outputChannel?.info(`Retry ${attempt}/${retries} after ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const processes = await this.instanceManager.scanForProcesses();
      this.outputChannel?.info(
        `Attempt ${attempt}: Found ${processes.length} OpenCode process(es): ${processes.map(p => p.port).join(', ')}`
      );

      if (processes.length === 0) {
        continue;
      }

      const uniquePorts = [...new Set(processes.map(p => p.port))];
      let foundMatchingProcess = false;

      for (const port of uniquePorts) {
        try {
          const tempClient = new OpenCodeClient({ port, timeout: 3000, maxRetries: 0 });
          const pathInfo = await tempClient.getPath();
          tempClient.destroy();

          this.outputChannel?.debug(
            `Port ${port} server dir: "${pathInfo.directory}" vs workspace: "${workspaceDir}"`
          );

          if (pathsMatch(pathInfo.directory, workspaceDir)) {
            foundMatchingProcess = true;
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
          this.outputChannel?.warn(`Port ${port} error: ${(err as Error).message}`);
          continue;
        }
      }

      if (!foundMatchingProcess) {
        this.outputChannel?.info('Processes found but none match workspace, giving up');
        break;
      }
    }

    this.outputChannel?.info('No OpenCode processes found after retries, will attempt auto-spawn');
    return false;
  }

  async waitForServer(port: number, retries: number = 30, delay: number = 1000): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const tempClient = new OpenCodeClient({ port, timeout: 1000, maxRetries: 0 });
        await tempClient.getPath();
        tempClient.destroy();
        return true;
      } catch {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    return false;
  }

  async findPortForWorkspace(workspacePath: string): Promise<number | undefined> {
    const processes = await this.instanceManager.scanForProcesses();
    const uniquePorts = [...new Set(processes.map(p => p.port))];

    for (const port of uniquePorts) {
      try {
        const tempClient = new OpenCodeClient({ port, timeout: 3000, maxRetries: 0 });
        const pathInfo = await tempClient.getPath();
        tempClient.destroy();

        this.outputChannel?.debug(
          `Port ${port} → "${pathInfo.directory}" vs target "${workspacePath}"`
        );

        if (pathsMatch(pathInfo.directory, workspacePath)) {
          this.outputChannel?.info(`Matched port ${port} for workspace "${workspacePath}"`);
          return port;
        }
      } catch {
        this.outputChannel?.debug(`Port ${port} did not respond`);
      }
    }

    return undefined;
  }

  /**
   * Ensure connection to the OpenCode instance serving the given workspace path.
   * Checks current client, scans for matching process, falls back to ensureConnected().
   */
  async ensureConnectedForWorkspace(workspacePath: string): Promise<boolean> {
    this.outputChannel?.info(`Target workspace: "${workspacePath}"`);

    if (this.client) {
      try {
        const alive = await this.client.testConnection();
        if (alive) {
          const pathInfo = await this.client.getPath();
          if (pathsMatch(pathInfo.directory, workspacePath)) {
            return true;
          }
          this.outputChannel?.info(
            `Current client serves "${pathInfo.directory}", scanning for better match`
          );
        }
      } catch {
        // Client is dead — fall through to discovery
      }
    }

    const port = await this.findPortForWorkspace(workspacePath);

    if (port !== undefined) {
      if (this.client) {
        this.client.destroy();
      }
      this.client = new OpenCodeClient({ port });
      this.connectedPort = port;
      this.outputChannel?.info(`Switched to port ${port} for workspace "${workspacePath}"`);
      this._onDidChangeConnectionState.fire({ connected: true, port });
      return true;
    }

    this.outputChannel?.info('No matching instance found, falling back to ensureConnected()');
    return this.ensureConnected();
  }

  /**
   * Ensure connection to an OpenCode instance.
   * Tries: current client → auto-discovery → auto-spawn → configured port.
   */
  async ensureConnected(): Promise<boolean> {
    const defaultPort = DefaultInstanceManager.getInstance().getDefaultPort();
    if (defaultPort !== undefined) {
      const isValid = await DefaultInstanceManager.getInstance().isValid();
      if (isValid) {
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
              if (this.client) {
                this.client.destroy();
              }
              this.client = new OpenCodeClient({ port: defaultPort });
              this.connectedPort = defaultPort;

              this.outputChannel?.info(`Using default instance on port ${defaultPort}`);
              this._onDidChangeConnectionState.fire({ connected: true, port: defaultPort });
              return true;
            }
            this.outputChannel?.info(
              `Default instance on port ${defaultPort} serves different workspace, clearing`
            );
            DefaultInstanceManager.getInstance().clearDefault();
          } catch {
            this.outputChannel?.info(
              `Default instance on port ${defaultPort} not responding, clearing`
            );
            DefaultInstanceManager.getInstance().clearDefault();
          }
        }
      } else {
        this.outputChannel?.info(`Default instance invalid, clearing`);
        DefaultInstanceManager.getInstance().clearDefault();
      }
    }

    if (this.client) {
      try {
        const connected = await this.client.testConnection();
        if (connected) {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders && workspaceFolders.length > 0) {
            const currentWorkspaceDir = workspaceFolders[0].uri.fsPath;
            const pathInfo = await this.client.getPath();
            if (pathsMatch(pathInfo.directory, currentWorkspaceDir)) {
              this._onDidChangeConnectionState.fire({ connected: true, port: this.connectedPort });
              return true;
            }
            this.client.destroy();
            this.client = undefined;
            this.connectedPort = undefined;
          }
        }
      } catch {
        // Current client is dead, try discovery
      }
    }

    const discovered = await this.discoverAndConnect();
    if (discovered) {
      this._onDidChangeConnectionState.fire({ connected: true, port: this.connectedPort });
      return true;
    }

    this.lastAutoSpawnError = undefined;
    try {
      const port = await this.instanceManager.findAvailablePort();
      await this.instanceManager.spawnInTerminal(port);
      const serverReady = await this.waitForServer(port);

      if (serverReady) {
        await new Promise(resolve => setTimeout(resolve, 2000));

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
    }

    const port = this.configManager.getPort() ?? 4096;
    if (!this.client || this.client.getPort() !== port) {
      if (this.client) {
        this.client.destroy();
      }
      this.client = new OpenCodeClient({ port });
      this.connectedPort = port;
    }

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

  getClient(): OpenCodeClient | undefined {
    return this.client;
  }

  getPort(): number | undefined {
    return this.connectedPort;
  }

  getLastAutoSpawnError(): string | undefined {
    return this.lastAutoSpawnError;
  }

  async getRunningInstance(port: number): Promise<{ isRunning: boolean; pid?: number }> {
    return this.instanceManager.getRunningInstance(port);
  }

  async spawnInstance(port: number): Promise<{ success: boolean; error?: string }> {
    return this.instanceManager.spawnInstance(port);
  }

  getInstanceManager(): InstanceManager {
    return this.instanceManager;
  }

  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  async focusTerminal(): Promise<boolean> {
    return this.instanceManager.focusTerminal(this.connectedPort);
  }

  /**
   * Disconnect from the current OpenCode instance.
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

  isConnected(): boolean {
    return this.client !== undefined;
  }
}

export function isRemoteSession(): boolean {
  return vscode.env.remoteName !== undefined;
}

export function normalizePath(p: string): string {
  let resolved = path.resolve(p);
  resolved = path.normalize(resolved);
  resolved = resolved.replace(/[\\/]+$/, '');
  return resolved;
}

export function pathsMatch(serverPath: string, localPath: string): boolean {
  if (!serverPath || !localPath) {
    return false;
  }

  const normalizedServer = normalizePath(serverPath);
  const normalizedLocal = normalizePath(localPath);

  const isCaseSensitive = process.platform !== 'win32' && process.platform !== 'darwin';

  const isParentOrEqual = (parent: string, child: string): boolean => {
    if (!parent || parent === '/') {
      return false;
    }

    let parentToCheck = parent;
    let childToCheck = child;

    if (!isCaseSensitive) {
      parentToCheck = parentToCheck.toLowerCase();
      childToCheck = childToCheck.toLowerCase();
    }

    if (childToCheck.startsWith(parentToCheck)) {
      const afterParent = childToCheck.slice(parentToCheck.length);
      return afterParent.length === 0 || afterParent[0] === path.sep || afterParent[0] === '/';
    }
    return false;
  };

  if (
    isParentOrEqual(normalizedServer, normalizedLocal) ||
    isParentOrEqual(normalizedLocal, normalizedServer)
  ) {
    return true;
  }

  if (isCaseSensitive) {
    return normalizedServer === normalizedLocal;
  }
  return normalizedServer.toLowerCase() === normalizedLocal.toLowerCase();
}

export default ConnectionService;
