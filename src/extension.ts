/**
 * OpenCode Connector VSCode Extension
 * Provides integration between VS Code and OpenCode AI assistant
 */

import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { OpenCodeClient } from './api/openCodeClient';
import { InstanceManager } from './instance/instanceManager';
import { ContextManager } from './context/contextManager';
import { AgentsSyncManager } from './sync/agentsSync';
import { WorkspaceUtils } from './utils/workspace';

/**
 * Global extension state
 */
let configManager: ConfigManager | undefined;
let openCodeClient: OpenCodeClient | undefined;
let instanceManager: InstanceManager | undefined;
let contextManager: ContextManager | undefined;
let agentsSyncManager: AgentsSyncManager | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
/** Port of the currently connected OpenCode instance */
let connectedPort: number | undefined;
/** Last auto-spawn error for user-facing messages */
let lastAutoSpawnError: string | undefined;

/**
 * Discover a running OpenCode instance serving the current workspace directory.
 * Scans running processes, verifies each with GET /path, and matches against workspace CWD.
 * If a match is found, creates/updates the global client to use that port.
 * @returns true if connected, false if no matching instance found
 */
async function discoverAndConnect(): Promise<boolean> {
  if (!instanceManager) {
    return false;
  }

  // Get the workspace directory to match against
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }
  const workspaceDir = workspaceFolders[0].uri.fsPath;

  // Scan for running opencode processes
  const processes = await instanceManager.scanForProcesses();
  if (processes.length === 0) {
    return false;
  }

  // Deduplicate ports
  const uniquePorts = [...new Set(processes.map(p => p.port))];

  // For each port, verify it's an OpenCode server serving our directory
  for (const port of uniquePorts) {
    try {
      const tempClient = new OpenCodeClient({ port, timeout: 3000, maxRetries: 0 });
      const pathInfo = await tempClient.getPath();
      tempClient.destroy();

      // Normalize paths for comparison (Windows backslash vs forward slash)
      const serverDir = pathInfo.directory.replace(/\//g, '\\');
      const localDir = workspaceDir.replace(/\//g, '\\');

      if (serverDir.toLowerCase() === localDir.toLowerCase()) {
        // Found a match — update the global client
        if (connectedPort !== port) {
          if (openCodeClient) {
            openCodeClient.destroy();
          }
          openCodeClient = new OpenCodeClient({ port });
          connectedPort = port;

          if (agentsSyncManager) {
            agentsSyncManager.updateClient(openCodeClient);
          }

          console.log(`OpenCode Connector: auto-connected to instance on port ${port}`);
        }
        return true;
      }
    } catch {
      // This port isn't a valid OpenCode server, skip
      continue;
    }
  }

  return false;
}

/**
 * Ensure we're connected to an OpenCode instance.
 * Tries: current client → auto-discovery → auto-spawn → configured port.
 * @returns true if connected
 */
async function ensureConnected(): Promise<boolean> {
  // 1. Check if current client is still alive
  if (openCodeClient) {
    try {
      const connected = await openCodeClient.testConnection();
      if (connected) {
        return true;
      }
    } catch {
      // Current client is dead, try discovery
    }
  }

  // 2. Auto-discover from running processes
  const discovered = await discoverAndConnect();
  if (discovered) {
    return true;
  }

  // 3. Auto-spawn new instance if discovery failed
  lastAutoSpawnError = undefined;
  if (instanceManager) {
    try {
      // Find an available port
      const port = await instanceManager.findAvailablePort();
      
      // Spawn in terminal
      await instanceManager.spawnInTerminal(port);
      
      // Wait for server to be ready
      const serverReady = await waitForServer(port);
      
      if (serverReady) {
        // Additional settling delay — the HTTP server responds before the TUI
        // is fully initialized. Without this, the first appendPrompt is dropped.
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Update the client to use the new port
        if (openCodeClient) {
          openCodeClient.destroy();
        }
        openCodeClient = new OpenCodeClient({ port });
        connectedPort = port;
        
        if (agentsSyncManager) {
          agentsSyncManager.updateClient(openCodeClient);
        }
        
        console.log(`OpenCode Connector: spawned and connected to instance on port ${port}`);
        return true;
      } else {
        lastAutoSpawnError = `Spawned OpenCode on port ${port} but it did not become ready within 30s. Check the "OpenCode" terminal for errors.`;
      }
    } catch (err) {
      lastAutoSpawnError = `Auto-spawn failed: ${(err as Error).message}`;
      // Continue to fallback
    }
  }

  // 4. Fall back to configured port
  const port = configManager?.getPort() ?? 4096;
  if (!openCodeClient || openCodeClient.getPort() !== port) {
    if (openCodeClient) {
      openCodeClient.destroy();
    }
    openCodeClient = new OpenCodeClient({ port });
    connectedPort = port;
  }

  // Test the fallback
  try {
    return await openCodeClient.testConnection();
  } catch {
    return false;
  }
}

/**
 * Wait for the OpenCode server to be ready on a specific port
 * @param port - Port to check
 * @param retries - Number of retry attempts (default: 30)
 * @param delay - Delay between retries in ms (default: 1000)
 * @returns true if server is ready, false if timeout
 */
async function waitForServer(port: number, retries: number = 30, delay: number = 1000): Promise<boolean> {
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
 * Called when the extension is activated.
 * @param extensionUri - The URI of the extension's directory
 * @param context - The extension context
 */
export function activate(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
  console.log('OpenCode Connector extension is now active');
  extensionContext = context;

  try {
    // Initialize configuration manager (singleton)
    configManager = ConfigManager.getInstance(extensionUri);

    // Initialize OpenCode client
    const port = configManager.getPort();
    openCodeClient = new OpenCodeClient({ port });

    // Initialize instance manager (singleton)
    instanceManager = InstanceManager.getInstance(configManager);

    // Initialize context manager
    contextManager = new ContextManager({
      debounceMs: 500,
      trackDiagnostics: true,
      trackSelection: true,
      trackDocuments: true,
    });

    // Initialize AGENTS.md sync manager
    agentsSyncManager = new AgentsSyncManager(openCodeClient, {
      syncIntervalMs: 30000,
      syncOnSave: true,
      syncToAllRoots: false,
      verboseLogging: false,
    });

    // Wire context manager - state tracked internally, sent to OpenCode via explicit commands
    contextManager.initialize((_state) => {
      // State tracked internally - sent to OpenCode via explicit commands
    });

    // Start AGENTS.md sync
    agentsSyncManager.start();

    // Register extension commands
    registerCommands();

    // Register workspace change handler
    registerWorkspaceHandlers();

    // Eagerly discover and connect in background so first command is instant
    discoverAndConnect().catch(() => {
      // Silently ignore — ensureConnected() will retry on-demand
    });

    console.log('OpenCode Connector fully initialized');
  } catch (err) {
    console.error(`Failed to initialize OpenCode Connector: ${(err as Error).message}`);
    // Extension remains active but may have reduced functionality
  }
}

/**
 * Register VSCode commands
 */
function registerCommands(): void {
  // Force sync AGENTS.md command
  const syncCommand = vscode.commands.registerCommand(
    'opencodeConnector.syncAgents',
    async () => {
      if (!agentsSyncManager) {
        await vscode.window.showErrorMessage('Sync manager not initialized');
        return;
      }

      const result = await agentsSyncManager.performSync();
      if (result.success) {
        await vscode.window.showInformationMessage(
          `Synced ${result.filesSynced} AGENTS.md file(s)`
        );
      } else {
        await vscode.window.showErrorMessage(
          `Sync failed: ${result.error || 'Unknown error'}`
        );
      }
    }
  );

  // Check instance status command
  const statusCommand = vscode.commands.registerCommand(
    'opencodeConnector.checkInstance',
    async () => {
      if (!instanceManager) {
        await vscode.window.showErrorMessage('Instance manager not initialized');
        return;
      }

      const port = configManager?.getPort() || 3000;
      const result = await instanceManager.getRunningInstance(port);

      if (result.isRunning) {
        await vscode.window.showInformationMessage(
          `OpenCode instance running on port ${port}`
        );
      } else {
        const choice = await vscode.window.showWarningMessage(
          `No OpenCode instance detected on port ${port}`,
          'Start Instance'
        );

        if (choice === 'Start Instance' && instanceManager) {
          const spawnResult = await instanceManager.spawnInstance(port);
          if (spawnResult.success) {
            await vscode.window.showInformationMessage('OpenCode instance started');
          } else {
            await vscode.window.showErrorMessage(
              `Failed to start instance: ${spawnResult.error}`
            );
          }
        }
      }
    }
  );

  // Show workspace info command
  const workspaceCommand = vscode.commands.registerCommand(
    'opencodeConnector.showWorkspace',
    async () => {
      const workspaceInfo = WorkspaceUtils.detectWorkspace();
      const name = WorkspaceUtils.getWorkspaceName();
      const roots = workspaceInfo.rootCount;

      const message = `Workspace: ${name}\n` +
        `Roots: ${roots}\n` +
        `Multi-root: ${roots > 1 ? 'Yes' : 'No'}`;

      await vscode.window.showInformationMessage(message);
    }
  );

  // Alias commands with 'opencode.' prefix (same handlers as 'opencodeConnector.' prefix)
  const opencodeSyncAgentsCommand = vscode.commands.registerCommand(
    'opencode.syncAgents',
    async () => {
      if (!agentsSyncManager) {
        await vscode.window.showErrorMessage('Sync manager not initialized');
        return;
      }

      const result = await agentsSyncManager.performSync();
      if (result.success) {
        await vscode.window.showInformationMessage(
          `Synced ${result.filesSynced} AGENTS.md file(s)`
        );
      } else {
        await vscode.window.showErrorMessage(
          `Sync failed: ${result.error || 'Unknown error'}`
        );
      }
    }
  );

  const opencodeCheckInstanceCommand = vscode.commands.registerCommand(
    'opencode.checkInstance',
    async () => {
      if (!instanceManager) {
        await vscode.window.showErrorMessage('Instance manager not initialized');
        return;
      }

      const port = configManager?.getPort() || 3000;
      const result = await instanceManager.getRunningInstance(port);

      if (result.isRunning) {
        await vscode.window.showInformationMessage(
          `OpenCode instance running on port ${port}`
        );
      } else {
        const choice = await vscode.window.showWarningMessage(
          `No OpenCode instance detected on port ${port}`,
          'Start Instance'
        );

        if (choice === 'Start Instance' && instanceManager) {
          const spawnResult = await instanceManager.spawnInstance(port);
          if (spawnResult.success) {
            await vscode.window.showInformationMessage('OpenCode instance started');
          } else {
            await vscode.window.showErrorMessage(
              `Failed to start instance: ${spawnResult.error}`
            );
          }
        }
      }
    }
  );

  const opencodeShowWorkspaceCommand = vscode.commands.registerCommand(
    'opencode.showWorkspace',
    async () => {
      const workspaceInfo = WorkspaceUtils.detectWorkspace();
      const name = WorkspaceUtils.getWorkspaceName();
      const roots = workspaceInfo.rootCount;

      const message = `Workspace: ${name}\n` +
        `Roots: ${roots}\n` +
        `Multi-root: ${roots > 1 ? 'Yes' : 'No'}`;

      await vscode.window.showInformationMessage(message);
    }
  );

  // Add file reference to OpenCode prompt
  const addFileCommand = vscode.commands.registerCommand(
    'opencodeConnector.addFileToPrompt',
    async () => {
      const ref = getActiveFileRef();
      if (!ref) {
        await vscode.window.showWarningMessage('No active file to reference');
        return;
      }

      const connected = await ensureConnected();
      if (!connected || !openCodeClient) {
        const msg = lastAutoSpawnError
          ? `OpenCode auto-spawn failed: ${lastAutoSpawnError}`
          : 'No OpenCode instance found. Run `opencode --port <port>` in your project directory.';
        await vscode.window.showErrorMessage(msg);
        return;
      }

      try {
        await openCodeClient.appendPrompt(ref);
        await vscode.window.showInformationMessage(`Sent to OpenCode: ${ref}`);
      } catch (err) {
        await vscode.window.showErrorMessage(
          `Failed to send reference: ${(err as Error).message}`
        );
      }
    }
  );

  const opencodeAddFileCommand = vscode.commands.registerCommand(
    'opencode.addFileToPrompt',
    async () => {
      const ref = getActiveFileRef();
      if (!ref) {
        await vscode.window.showWarningMessage('No active file to reference');
        return;
      }

      const connected = await ensureConnected();
      if (!connected || !openCodeClient) {
        const msg = lastAutoSpawnError
          ? `OpenCode auto-spawn failed: ${lastAutoSpawnError}`
          : 'No OpenCode instance found. Run `opencode --port <port>` in your project directory.';
        await vscode.window.showErrorMessage(msg);
        return;
      }

      try {
        await openCodeClient.appendPrompt(ref);
        await vscode.window.showInformationMessage(`Sent to OpenCode: ${ref}`);
      } catch (err) {
        await vscode.window.showErrorMessage(
          `Failed to send reference: ${(err as Error).message}`
        );
      }
    }
  );

  // Push all subscriptions for cleanup
  extensionContext?.subscriptions.push(
    syncCommand,
    statusCommand,
    workspaceCommand,
    opencodeSyncAgentsCommand,
    opencodeCheckInstanceCommand,
    opencodeShowWorkspaceCommand,
    addFileCommand,
    opencodeAddFileCommand
  );
}

/**
 * Get the active file reference for OpenCode prompts.
 * Reads directly from VSCode API for reliability (no dependency on ContextManager event tracking).
 * Matches the official OpenCode VSCode SDK pattern.
 */
function getActiveFileRef(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    return undefined;
  }

  const document = activeEditor.document;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return undefined;
  }

  const relativePath = vscode.workspace.asRelativePath(document.uri);
  let ref = `@${relativePath}`;

  const selection = activeEditor.selection;
  if (!selection.isEmpty) {
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    if (startLine === endLine) {
      ref += `#L${startLine}`;
    } else {
      ref += `#L${startLine}-${endLine}`;
    }
  }

  return ref;
}

/**
 * Register workspace change handlers
 */
function registerWorkspaceHandlers(): void {
  // Handle workspace folder changes
  const workspaceFoldersChange = vscode.workspace.onDidChangeWorkspaceFolders(
    () => {
      const workspaceInfo = WorkspaceUtils.detectWorkspace();
      console.log(
        `Workspace changed: ${workspaceInfo.rootCount} root(s), primary: ${workspaceInfo.primaryRoot?.name || 'none'}`
      );

      // Trigger sync on workspace change
      if (agentsSyncManager) {
        agentsSyncManager.performSync().catch((err) => {
          console.log(`Workspace change sync failed: ${err.message}`);
        });
      }
    }
  );

  // Handle configuration changes
  const configChange = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration('opencode')) {
        console.log('OpenCode configuration changed');

        // Update client if port changed
        if (configManager && openCodeClient) {
          const newPort = configManager.getPort();
          if (newPort !== openCodeClient.getPort()) {
            openCodeClient = new OpenCodeClient({ port: newPort });
            if (agentsSyncManager) {
              agentsSyncManager.updateClient(openCodeClient);
            }
          }
        }
      }
    }
  );

  extensionContext?.subscriptions.push(workspaceFoldersChange, configChange);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  console.log('OpenCode Connector extension is now deactivated');

  // Cleanup in reverse order
  if (agentsSyncManager) {
    agentsSyncManager.stop();
    agentsSyncManager.dispose();
    agentsSyncManager = undefined;
  }

  if (contextManager) {
    contextManager.dispose();
    contextManager = undefined;
  }

  if (openCodeClient) {
    openCodeClient.destroy();
    openCodeClient = undefined;
  }

  // Reset singletons
  InstanceManager.resetInstance();
  configManager = undefined;
  instanceManager = undefined;
}
