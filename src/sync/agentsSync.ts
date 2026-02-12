/**
 * AGENTS.md Sync Module for OpenCode VSCode extension
 * Handles periodic synchronization of memory/context to AGENTS.md files
 */
import { OpenCodeClient } from '../api/openCodeClient';
import { WorkspaceUtils } from '../utils/workspace';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Type for setInterval/clearInterval to handle cross-environment compatibility
 * Node.js returns NodeJS.Timeout, DOM environments return number
 */
type TimerType = number | NodeJS.Timeout;

/**
 * Configuration for AGENTS.md sync
 */
export interface AgentsSyncConfig {
  /** Sync interval in milliseconds (default: 30000 = 30s) */
  syncIntervalMs?: number;
  /** Whether to sync on document save (default: true) */
  syncOnSave?: boolean;
  /** Whether to sync to all workspace roots (default: false) */
  syncToAllRoots?: boolean;
  /** Whether to enable verbose logging (default: false) */
  verboseLogging?: boolean;
}

/**
 * Default sync configuration
 */
const DEFAULT_CONFIG: Required<AgentsSyncConfig> = {
  syncIntervalMs: 30000,
  syncOnSave: true,
  syncToAllRoots: false,
  verboseLogging: false,
};

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Whether the sync was successful */
  success: boolean;
  /** Number of files synced */
  filesSynced: number;
  /** Any error message */
  error?: string;
  /** Timestamp of the sync */
  timestamp: number;
}

/**
 * AGENTS.md Sync Manager
 * Periodically fetches memory from OpenCode and writes to AGENTS.md files
 */
export class AgentsSyncManager {
  private config: Required<AgentsSyncConfig>;
  private openCodeClient: OpenCodeClient | null;
  private syncInterval: TimerType | null = null;
  private saveSubscription: vscode.Disposable | null = null;
  private isSyncing: boolean = false;
  private lastSyncResult: SyncResult | null = null;

  /**
   * Create a new AgentsSyncManager
   * @param openCodeClient - OpenCode client for API communication
   * @param config - Optional configuration overrides
   */
  constructor(openCodeClient: OpenCodeClient | null, config: AgentsSyncConfig = {}) {
    this.openCodeClient = openCodeClient;

    this.config = {
      syncIntervalMs: config.syncIntervalMs ?? DEFAULT_CONFIG.syncIntervalMs,
      syncOnSave: config.syncOnSave ?? DEFAULT_CONFIG.syncOnSave,
      syncToAllRoots: config.syncToAllRoots ?? DEFAULT_CONFIG.syncToAllRoots,
      verboseLogging: config.verboseLogging ?? DEFAULT_CONFIG.verboseLogging,
    };
  }

  /**
   * Start the sync manager
   * Begins periodic sync and optionally registers save listener
   */
  public start(): void {
    if (this.isSyncing) {
      this.log('Sync manager already running');
      return;
    }

    this.log('Starting AGENTS.md sync manager');

    // Start periodic sync
    this.startPeriodicSync();

    // Register save handler if enabled
    if (this.config.syncOnSave) {
      this.registerSaveHandler();
    }

    // Perform initial sync
    this.performSync().catch(err => {
      this.log(`Initial sync failed: ${err.message}`);
    });
  }

  /**
   * Stop the sync manager
   * Cleans up all subscriptions and intervals
   */
  public stop(): void {
    if (!this.isSyncing && !this.syncInterval && !this.saveSubscription) {
      this.log('Sync manager not running');
      return;
    }

    this.log('Stopping AGENTS.md sync manager');

    // Dispose interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Dispose save subscription
    if (this.saveSubscription) {
      this.saveSubscription.dispose();
      this.saveSubscription = null;
    }

    this.isSyncing = false;
  }

  /**
   * Perform a manual sync
   * @returns Promise<SyncResult>
   */
  public async performSync(): Promise<SyncResult> {
    const startTime = Date.now();
    let filesSynced = 0;
    let lastError: string | undefined;

    try {
      // Get workspace roots to sync to
      const workspaceInfo = WorkspaceUtils.detectWorkspace();
      if (!workspaceInfo.isWorkspaceOpen) {
        return {
          success: true,
          filesSynced: 0,
          error: undefined,
          timestamp: startTime,
        };
      }

      // Get AGENTS.md paths
      const agentsPaths = this.config.syncToAllRoots
        ? workspaceInfo.rootUris.map(uri => WorkspaceUtils.getAgentsMdPath(uri))
        : [WorkspaceUtils.getAgentsMdPath(workspaceInfo.primaryRoot?.uri.toString() || '')];

      // Fetch memory from OpenCode if client is available
      let memoryContent = '';
      if (this.openCodeClient) {
        try {
          memoryContent = await this.fetchMemoryFromOpenCode();
        } catch (err) {
          lastError = `Failed to fetch memory: ${(err as Error).message}`;
          this.log(lastError);
          // Continue with empty memory - sync should be resilient
          memoryContent = '';
        }
      }

      // Write to AGENTS.md files
      for (const agentsPath of agentsPaths) {
        if (!agentsPath) continue;

        try {
          await this.writeAgentsMd(agentsPath, memoryContent);
          filesSynced++;
        } catch (err) {
          lastError = `Failed to write ${agentsPath}: ${(err as Error).message}`;
          this.log(lastError);
        }
      }

      const result: SyncResult = {
        success: lastError === undefined,
        filesSynced,
        error: lastError,
        timestamp: Date.now(),
      };

      this.lastSyncResult = result;
      this.log(
        `Sync completed: ${filesSynced} files, ${
          result.success ? 'success' : 'errors'
        } (${Date.now() - startTime}ms)`
      );

      return result;
    } catch (err) {
      const errorMessage = (err as Error).message;
      const result: SyncResult = {
        success: false,
        filesSynced,
        error: errorMessage,
        timestamp: Date.now(),
      };

      this.lastSyncResult = result;
      this.log(`Sync failed: ${errorMessage}`);

      return result;
    }
  }

  /**
   * Get the last sync result
   * @returns Last sync result or null
   */
  public getLastSyncResult(): SyncResult | null {
    return this.lastSyncResult;
  }

  /**
   * Check if sync manager is running
   * @returns Whether the manager is active
   */
  public isRunning(): boolean {
    return this.syncInterval !== null;
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.performSync();
      } catch (err) {
        this.log(`Periodic sync error: ${(err as Error).message}`);
      }
    }, this.config.syncIntervalMs);

    this.isSyncing = true;
    this.log(`Periodic sync started (${this.config.syncIntervalMs}ms interval)`);
  }

  /**
   * Register handler for document save events
   */
  private registerSaveHandler(): void {
    if (this.saveSubscription) {
      this.saveSubscription.dispose();
    }

    this.saveSubscription = vscode.workspace.onDidSaveTextDocument(async document => {
      // Only sync on save if it's in a workspace
      if (!document.uri.fsPath) return;

      const workspaceInfo = WorkspaceUtils.detectWorkspace();
      if (!workspaceInfo.isWorkspaceOpen) return;

      // Check if saved document is in workspace
      if (WorkspaceUtils.isFileInWorkspace(document.uri)) {
        this.log(`Document saved: ${document.uri.fsPath}`);
        try {
          await this.performSync();
        } catch (err) {
          this.log(`Save sync error: ${(err as Error).message}`);
        }
      }
    });

    this.log('Save handler registered');
  }

  /**
   * Fetch memory/context from OpenCode
   * @returns Memory content as string
   */
  private async fetchMemoryFromOpenCode(): Promise<string> {
    if (!this.openCodeClient) {
      return '';
    }

    // Check server health
    const health = await this.openCodeClient.getHealth();

    if (!health.healthy) {
      return '';
    }

    // Get server path info for AGENTS.md content
    let pathInfo;
    try {
      pathInfo = await this.openCodeClient.getPath();
    } catch {
      // Path info is optional for basic sync
      pathInfo = null;
    }

    // Generate AGENTS.md content
    const version = health.version || 'unknown';
    const directory = pathInfo?.directory || 'unknown';

    return `# OpenCode Session

**Version**: ${version}
**Directory**: ${directory}
**Last Sync**: ${new Date().toISOString()}

## Active Context

- Connected to OpenCode VSCode Extension
- AGENTS.md sync enabled
- Periodic sync: ${this.config.syncIntervalMs}ms

## Notes

This file is automatically synced by the OpenCode Connector extension.
`;
  }

  /**
   * Write content to AGENTS.md file
   * @param filePath - Path to write to
   * @param content - Content to write
   */
  private async writeAgentsMd(filePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure directory exists
      const dir = path.dirname(filePath);

      fs.mkdir(dir, { recursive: true }, mkdirErr => {
        if (mkdirErr) {
          reject(mkdirErr);
          return;
        }

        // Write the file
        fs.writeFile(filePath, content, 'utf8', writeErr => {
          if (writeErr) {
            reject(writeErr);
            return;
          }
          resolve();
        });
      });
    });
  }

  /**
   * Log a message (if verbose logging is enabled)
   * @param message - Message to log
   */
  private log(message: string): void {
    if (this.config.verboseLogging) {
      console.log(`[AGENTS Sync] ${message}`);
    }
  }

  /**
   * Update the OpenCode client reference
   * @param client - New client instance or null
   */
  public updateClient(client: OpenCodeClient | null): void {
    this.openCodeClient = client;
  }

  /**
   * Dispose of the sync manager
   */
  public dispose(): void {
    this.stop();
  }
}

export default AgentsSyncManager;
