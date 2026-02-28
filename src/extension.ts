/**
 * OpenCode Connector VSCode Extension
 * Provides integration between VS Code and OpenCode AI assistant
 */
import {
  handleAddMultipleFiles,
  handleAddToPrompt,
  handleCheckInstance,
  handleSelectDefaultInstance,
  handleSendDebugContext,
  handleSendPath,
  handleSendRelativePath,
  handleShowWorkspace,
  showStatusBarMenu,
} from './commands';
import { ConfigManager } from './config';
import { ConnectionService, isRemoteSession } from './connection/connectionService';
import { DefaultInstanceManager } from './instance/defaultInstanceManager';
import { InstanceManager } from './instance/instanceManager';
import { OpenCodeCodeActionProvider } from './providers/codeActionProvider';
import { StatusBarManager } from './statusBar';
import { WorkspaceUtils } from './utils/workspace';

import * as vscode from 'vscode';

/**
 * Global extension state
 */
let configManager: ConfigManager | undefined;
let connectionService: ConnectionService | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let statusBarManager: StatusBarManager | undefined;
let outputChannel: vscode.LogOutputChannel | undefined;

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
    context?.subscriptions?.push(outputChannel);
    outputChannel?.info('OpenCode Connector extension is now active');
  } catch (err) {
    // Fallback: use console if OutputChannel fails (e.g., early activation)
    console.error('Failed to create output channel:', err);
  }

  try {
    // Initialize configuration manager (singleton)
    configManager = ConfigManager.getInstance(extensionUri);

    // Initialize instance manager (singleton)
    const instanceManager = InstanceManager.getInstance(configManager);

    // Set up logger for InstanceManager to use the OutputChannel
    if (outputChannel) {
      const channel = outputChannel;
      instanceManager.setLogger({
        info: (msg: string) => channel.info(msg),
        warn: (msg: string) => channel.warn(msg),
        error: (msg: string) => channel.error(msg),
      });
    }

    // Initialize connection service
    connectionService = new ConnectionService(configManager, instanceManager, outputChannel);

    // Initialize status bar manager for connection status
    statusBarManager = StatusBarManager.getInstance();
    statusBarManager.initialize(context);

    // Subscribe to connection state changes FIRST (before other init that might fail)
    const connectionStateSub = connectionService.onDidChangeConnectionState(event => {
      statusBarManager?.updateConnectionStatus(event.connected, event.port);
    });
    extensionContext?.subscriptions?.push(connectionStateSub);

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
    extensionContext?.subscriptions?.push(codeActionProvider);

    // Register workspace change handlers
    registerWorkspaceHandlers();

    // Eagerly discover and connect in background so first command is instant
    connectionService
      .discoverAndConnect()
      .then(connected => {
        statusBarManager?.updateConnectionStatus(connected, connectionService?.getPort());
      })
      .catch(() => {
        // Silently ignore — ensureConnected() will retry on-demand
        statusBarManager?.updateConnectionStatus(false);
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

/**
 * Register VSCode commands
 */
function registerCommands(): void {
  if (!connectionService || !outputChannel) {
    return;
  }

  // Check instance status command
  const statusCommand = vscode.commands.registerCommand(
    'opencodeConnector.checkInstance',
    async () => handleCheckInstance(connectionService!)
  );

  // Show workspace info command
  const workspaceCommand = vscode.commands.registerCommand(
    'opencodeConnector.showWorkspace',
    async () => handleShowWorkspace()
  );

  // Add file reference to OpenCode prompt
  const addFileCommand = vscode.commands.registerCommand(
    'opencodeConnector.addToPrompt',
    async () => handleAddToPrompt(connectionService!, outputChannel!)
  );

  // Multi-file picker command
  const addMultipleFilesCommand = vscode.commands.registerCommand(
    'opencodeConnector.addMultipleFiles',
    async () => handleAddMultipleFiles(connectionService!, outputChannel!)
  );

  // Status bar menu command
  const statusBarMenuCommand = vscode.commands.registerCommand(
    'opencodeConnector.showStatusBarMenu',
    async () => showStatusBarMenu(connectionService!, outputChannel!)
  );

  // Select default instance command
  const selectDefaultInstanceCommand = vscode.commands.registerCommand(
    'opencodeConnector.selectDefaultInstance',
    async () => handleSelectDefaultInstance(connectionService!, outputChannel!)
  );

  // Send debug context command
  const sendDebugContextCommand = vscode.commands.registerCommand(
    'opencodeConnector.sendDebugContext',
    async () => handleSendDebugContext(connectionService!, outputChannel!)
  );

  // Send path command (from context menu)
  const sendPathCommand = vscode.commands.registerCommand(
    'opencodeConnector.sendPath',
    async (...resources: vscode.Uri[]) => {
      const uris =
        resources.length > 0 && Array.isArray(resources[resources.length - 1])
          ? (resources[resources.length - 1] as unknown as vscode.Uri[])
          : resources;
      await handleSendPath(connectionService!, outputChannel!, uris);
    }
  );

  // Send relative path command (from context menu)
  const sendRelativePathCommand = vscode.commands.registerCommand(
    'opencodeConnector.sendRelativePath',
    async (...resources: vscode.Uri[]) => {
      const uris =
        resources.length > 0 && Array.isArray(resources[resources.length - 1])
          ? (resources[resources.length - 1] as unknown as vscode.Uri[])
          : resources;
      await handleSendRelativePath(connectionService!, outputChannel!, uris);
    }
  );

  // Push all subscriptions for cleanup
  extensionContext?.subscriptions?.push(
    statusCommand,
    workspaceCommand,
    addFileCommand,
    addMultipleFilesCommand,
    statusBarMenuCommand,
    selectDefaultInstanceCommand,
    sendDebugContextCommand,
    sendPathCommand,
    sendRelativePathCommand
  );
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
    DefaultInstanceManager.getInstance().clearDefault();
    outputChannel?.info('Cleared default instance due to workspace change');
  });

  // Handle configuration changes
  const configChange = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('opencode')) {
      outputChannel?.info('OpenCode configuration changed');
    }
  });

  extensionContext?.subscriptions?.push(workspaceFoldersChange, configChange);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  outputChannel?.info('OpenCode Connector extension is now deactivated');

  // Cleanup in reverse order
  if (connectionService) {
    const client = connectionService.getClient();
    if (client) {
      client.destroy();
    }
    connectionService = undefined;
  }

  // Reset singletons
  InstanceManager.resetInstance();
  configManager = undefined;
}
