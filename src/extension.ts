/**
 * OpenCode Connector VSCode Extension
 * Provides integration between VS Code and OpenCode AI assistant
 */
import {
  handleAddMultipleFiles,
  handleAddToPrompt,
  handleCheckInstance,
  handleShowWorkspace,
  showStatusBarMenu,
} from './commands';
import { ConfigManager } from './config';
import { ConnectionService, isRemoteSession } from './connection/connectionService';
import { ContextManager } from './context/contextManager';
import { InstanceManager } from './instance/instanceManager';
import { OpenCodeCodeActionProvider } from './providers/codeActionProvider';
import { OpenCodeGutterActionProvider } from './providers/gutterActionProvider';
import { StatusBarManager } from './statusBar';
import { WorkspaceUtils } from './utils/workspace';

import * as vscode from 'vscode';

/**
 * Global extension state
 */
let configManager: ConfigManager | undefined;
let connectionService: ConnectionService | undefined;
let contextManager: ContextManager | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let gutterActionProvider: OpenCodeGutterActionProvider | undefined;
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

    // Initialize status bar manager for connection status
    statusBarManager = StatusBarManager.getInstance();
    statusBarManager.initialize(context);

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

    // Initialize and register Gutter Action Provider
    gutterActionProvider = new OpenCodeGutterActionProvider(extensionUri);
    extensionContext?.subscriptions?.push(gutterActionProvider);

    // Register gutter click handler command
    const gutterClickCommand = vscode.commands.registerCommand(
      'opencodeConnector.gutterClick',
      async (line: number) => {
        if (gutterActionProvider) {
          await gutterActionProvider.handleGutterClick(line, (cmd, ...args) => {
            vscode.commands.executeCommand(cmd, ...args);
          });
        }
      }
    );
    extensionContext?.subscriptions?.push(gutterClickCommand);

    // Register workspace change handlers
    registerWorkspaceHandlers();

    // Eagerly discover and connect in background so first command is instant
    connectionService
      .discoverAndConnect()
      .then(connected => {
        statusBarManager?.updateConnectionStatus(connected);
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

  // Push all subscriptions for cleanup
  extensionContext?.subscriptions?.push(
    statusCommand,
    workspaceCommand,
    addFileCommand,
    addMultipleFilesCommand,
    statusBarMenuCommand
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
  if (contextManager) {
    contextManager.dispose();
    contextManager = undefined;
  }

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
