/**
 * OpenCode Connector VSCode Extension
 * Provides integration between VS Code and OpenCode AI assistant
 */
import { OpenCodeClient } from './api/openCodeClient';
import { ConfigManager } from './config';
import { ContextManager } from './context/contextManager';
import { InstanceManager } from './instance/instanceManager';
import {
  OpenCodeCodeActionProvider,
  formatPromptForDiagnostic,
} from './providers/codeActionProvider';
import { WorkspaceUtils } from './utils/workspace';

import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Check if running in a remote session (SSH, WSL, Containers, Dev Pods)
 * @returns true if running in a remote environment
 */
function isRemoteSession(): boolean {
  return vscode.env.remoteName !== undefined;
}

/**
 * Normalize and compare filesystem paths across platforms.
 * Handles: path separators, trailing slashes, remote path formats.
 * @param serverPath - Path returned by OpenCode server
 * @param localPath - Path from VSCode workspace
 * @returns true if paths refer to the same directory
 */
function pathsMatch(serverPath: string, localPath: string): boolean {
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

/**
 * Global extension state
 */
let configManager: ConfigManager | undefined;
let openCodeClient: OpenCodeClient | undefined;
let instanceManager: InstanceManager | undefined;
let contextManager: ContextManager | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
/** Port of the currently connected OpenCode instance */
let connectedPort: number | undefined;
/** Last auto-spawn error for user-facing messages */
let lastAutoSpawnError: string | undefined;
/** Status bar item for transient notifications */
let statusBarItem: vscode.StatusBarItem | undefined;
/** Log output channel for extension logs */
let outputChannel: vscode.LogOutputChannel | undefined;

/**
 * Discover a running OpenCode instance serving the current workspace directory.
 * Scans running processes, verifies each with GET /path, and matches against workspace CWD.
 * If a match is found, creates/updates the global client to use that port.
 * @param retries - Number of retry attempts (default: 3)
 * @param delayMs - Delay between retries in ms (default: 2000)
 * @returns true if connected, false if no matching instance found
 */
async function discoverAndConnect(retries: number = 3, delayMs: number = 2000): Promise<boolean> {
  if (!instanceManager) {
    return false;
  }

  // Get the workspace directory to match against
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }
  const workspaceDir = workspaceFolders[0].uri.fsPath;

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (attempt > 1) {
      outputChannel?.info(
        `[discoverAndConnect] Retry ${attempt}/${retries} after ${delayMs}ms delay...`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // Scan for running opencode processes
    const processes = await instanceManager.scanForProcesses();
    outputChannel?.info(
      `[discoverAndConnect] Attempt ${attempt}: Found ${processes.length} OpenCode process(es): ${processes.map(p => p.port).join(', ')}`
    );

    if (processes.length === 0) {
      // No processes found, try again
      continue;
    }

    // Deduplicate ports
    const uniquePorts = [...new Set(processes.map(p => p.port))];

    // For each port, verify it's an OpenCode server serving our directory
    for (const port of uniquePorts) {
      try {
        outputChannel?.info(`[discoverAndConnect] Checking port ${port}...`);
        const tempClient = new OpenCodeClient({ port, timeout: 3000, maxRetries: 0 });
        const pathInfo = await tempClient.getPath();
        tempClient.destroy();

        outputChannel?.info(
          `[discoverAndConnect] Port ${port} server dir: "${pathInfo.directory}" vs workspace: "${workspaceDir}"`
        );

        const matches = pathsMatch(pathInfo.directory, workspaceDir);
        outputChannel?.info(`[discoverAndConnect] Paths match: ${matches}`);

        // Normalize paths for comparison (platform-aware)
        if (matches) {
          // Found a match — update the global client
          if (connectedPort !== port) {
            if (openCodeClient) {
              openCodeClient.destroy();
            }
            openCodeClient = new OpenCodeClient({ port });
            connectedPort = port;

            outputChannel?.info(`OpenCode Connector: auto-connected to instance on port ${port}`);
          }
          return true;
        }
      } catch (err) {
        // This port isn't a valid OpenCode server, skip
        outputChannel?.warn(`[discoverAndConnect] Port ${port} error: ${(err as Error).message}`);
        continue;
      }
    }
  }

  // Exhausted all retries
  outputChannel?.info(
    '[discoverAndConnect] No OpenCode processes found after retries, will attempt auto-spawn'
  );
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

        outputChannel?.info(
          `OpenCode Connector: spawned and connected to instance on port ${port}`
        );
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
async function waitForServer(
  port: number,
  retries: number = 30,
  delay: number = 1000
): Promise<boolean> {
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
  extensionContext = context;

  // Create log output channel for user-accessible logging (View → Output → OpenCode Connector)
  try {
    outputChannel = vscode.window.createOutputChannel('OpenCode Connector', { log: true });
    context.subscriptions.push(outputChannel);
    outputChannel.info('OpenCode Connector extension is now active');
  } catch (err) {
    // Fallback: use console if OutputChannel fails (e.g., early activation)
    console.error('Failed to create output channel:', err);
  }

  try {
    // Initialize configuration manager (singleton)
    configManager = ConfigManager.getInstance(extensionUri);

    // Initialize OpenCode client
    const port = configManager.getPort();
    openCodeClient = new OpenCodeClient({ port });

    // Initialize instance manager (singleton)
    instanceManager = InstanceManager.getInstance(configManager);

    // Set up logger for InstanceManager to use the OutputChannel
    if (outputChannel) {
      instanceManager.setLogger({
        info: (msg: string) => outputChannel.info(msg),
        warn: (msg: string) => outputChannel.warn(msg),
        error: (msg: string) => outputChannel.error(msg),
      });
    }

    // Initialize context manager
    contextManager = new ContextManager({
      debounceMs: 500,
      trackDiagnostics: true,
      trackSelection: true,
      trackDocuments: true,
    });

    // Wire context manager - state tracked internally, sent to OpenCode via explicit commands
    contextManager.initialize(() => {
      // State tracked internally - sent to OpenCode via explicit commands
    });

    // Create status bar item for transient notifications
    statusBarItem = vscode.window.createStatusBarItem(
      'opencode-connector',
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.name = 'OpenCode Connector';
    statusBarItem.command = 'opencodeConnector.addToPrompt';
    statusBarItem.tooltip = 'Click to add active file to OpenCode prompt';
    statusBarItem.text = '$(go-to-file) OpenCode';
    statusBarItem.show();
    extensionContext?.subscriptions.push(statusBarItem);

    // Register extension commands
    registerCommands();

    // Register CodeActionProvider for all languages
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
      '*',
      new OpenCodeCodeActionProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }
    );
    extensionContext?.subscriptions.push(codeActionProvider);

    // Register workspace change handler
    registerWorkspaceHandlers();

    // Eagerly discover and connect in background so first command is instant
    discoverAndConnect().catch(() => {
      // Silently ignore — ensureConnected() will retry on-demand
    });

    outputChannel?.info(
      'OpenCode Connector fully initialized' +
        (isRemoteSession() ? ` [Remote: ${vscode.env.remoteName}]` : ' [Local]')
    );
  } catch (err) {
    outputChannel?.error(`Failed to initialize OpenCode Connector: ${(err as Error).message}`);
    // Extension remains active but may have reduced functionality
  }
}

function showTransientNotification(message: string): void {
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

/**
 * Register VSCode commands
 */
function registerCommands(): void {
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
        await vscode.window.showInformationMessage(`OpenCode instance running on port ${port}`);
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
            await vscode.window.showErrorMessage(`Failed to start instance: ${spawnResult.error}`);
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

      const message =
        `Workspace: ${name}\n` + `Roots: ${roots}\n` + `Multi-root: ${roots > 1 ? 'Yes' : 'No'}`;

      await vscode.window.showInformationMessage(message);
    }
  );

  // Alias commands with 'opencode.' prefix (same handlers as 'opencodeConnector.' prefix)
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
        await vscode.window.showInformationMessage(`OpenCode instance running on port ${port}`);
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
            await vscode.window.showErrorMessage(`Failed to start instance: ${spawnResult.error}`);
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

      const message =
        `Workspace: ${name}\n` + `Roots: ${roots}\n` + `Multi-root: ${roots > 1 ? 'Yes' : 'No'}`;

      await vscode.window.showInformationMessage(message);
    }
  );

  // Add file reference to OpenCode prompt
  const addFileCommand = vscode.commands.registerCommand(
    'opencodeConnector.addToPrompt',
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
        const port = openCodeClient.getPort();
        const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'unknown';
        outputChannel?.info(`[addToPrompt] Sending to port ${port}, cwd: ${workspaceDir}`);
        outputChannel?.debug(`[addToPrompt] Content: "${ref}"`);
        const result = await openCodeClient.appendPrompt(ref);
        outputChannel?.debug(`[addToPrompt] Result: ${result}`);
        showTransientNotification(`Sent: ${ref}`);
      } catch (err) {
        await vscode.window.showErrorMessage(`Failed to send reference: ${(err as Error).message}`);
      }
    }
  );

  const opencodeAddFileCommand = vscode.commands.registerCommand(
    'opencode.addToPrompt',
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
        const port = openCodeClient.getPort();
        const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'unknown';
        outputChannel?.info(`[addToPrompt] Sending to port ${port}, cwd: ${workspaceDir}`);
        outputChannel?.debug(`[addToPrompt] Content: "${ref}"`);
        const result = await openCodeClient.appendPrompt(ref);
        outputChannel?.debug(`[addToPrompt] Result: ${result}`);
        showTransientNotification(`Sent: ${ref}`);
      } catch (err) {
        await vscode.window.showErrorMessage(`Failed to send reference: ${(err as Error).message}`);
      }
    }
  );

  // Explain and Fix code action command
  const explainAndFixCommand = vscode.commands.registerCommand(
    'opencodeConnector.explainAndFix',
    async (diagnostic: vscode.Diagnostic, uri: vscode.Uri) => {
      const connected = await ensureConnected();
      if (!connected || !openCodeClient) {
        const msg = lastAutoSpawnError
          ? `OpenCode auto-spawn failed: ${lastAutoSpawnError}`
          : 'No OpenCode instance found. Run `opencode --port <port>` in your project directory.';
        await vscode.window.showErrorMessage(msg);
        return;
      }

      try {
        // Format the prompt using the diagnostic
        const prompt = formatPromptForDiagnostic(diagnostic, uri, uriInfo =>
          vscode.workspace.asRelativePath(uriInfo.fsPath)
        );
        await openCodeClient.appendPrompt(prompt);
        showTransientNotification(`Sent explanation request for diagnostic`);
      } catch (err) {
        await vscode.window.showErrorMessage(
          `Failed to send explanation: ${(err as Error).message}`
        );
      }
    }
  );

  // Alias explainAndFix command with 'opencode.' prefix
  const opencodeExplainAndFixCommand = vscode.commands.registerCommand(
    'opencode.explainAndFix',
    async (diagnostic: vscode.Diagnostic, uri: vscode.Uri) => {
      const connected = await ensureConnected();
      if (!connected || !openCodeClient) {
        const msg = lastAutoSpawnError
          ? `OpenCode auto-spawn failed: ${lastAutoSpawnError}`
          : 'No OpenCode instance found. Run `opencode --port <port>` in your project directory.';
        await vscode.window.showErrorMessage(msg);
        return;
      }

      try {
        // Format the prompt using the diagnostic
        const prompt = formatPromptForDiagnostic(diagnostic, uri, uriInfo =>
          vscode.workspace.asRelativePath(uriInfo.fsPath)
        );
        await openCodeClient.appendPrompt(prompt);
        showTransientNotification(`Sent explanation request for diagnostic`);
      } catch (err) {
        await vscode.window.showErrorMessage(
          `Failed to send explanation: ${(err as Error).message}`
        );
      }
    }
  );

  // Push all subscriptions for cleanup
  extensionContext?.subscriptions.push(
    statusCommand,
    workspaceCommand,
    opencodeCheckInstanceCommand,
    opencodeShowWorkspaceCommand,
    addFileCommand,
    opencodeAddFileCommand,
    explainAndFixCommand,
    opencodeExplainAndFixCommand
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
  const workspaceFoldersChange = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const workspaceInfo = WorkspaceUtils.detectWorkspace();
    outputChannel?.info(
      `Workspace changed: ${workspaceInfo.rootCount} root(s), primary: ${workspaceInfo.primaryRoot?.name || 'none'}`
    );
  });

  // Handle configuration changes
  const configChange = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('opencode')) {
      outputChannel?.info('OpenCode configuration changed');

      // Update client if port changed
      if (configManager && openCodeClient) {
        const newPort = configManager.getPort();
        if (newPort !== openCodeClient.getPort()) {
          openCodeClient = new OpenCodeClient({ port: newPort });
        }
      }
    }
  });

  extensionContext?.subscriptions.push(workspaceFoldersChange, configChange);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  outputChannel?.info('OpenCode Connector extension is now deactivated');

  // Cleanup in reverse order
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
