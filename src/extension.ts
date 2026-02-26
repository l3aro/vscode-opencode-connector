/**
 * OpenCode Connector VSCode Extension
 * Provides integration between VS Code and OpenCode AI assistant
 */
import {
  handleAddMultipleFiles,
  handleAddToPrompt,
  handleCheckInstance,
  handleExplainAndFix,
  handleShowWorkspace,
} from './commands';
import { ConfigManager } from './config';
import { ConnectionService, isRemoteSession } from './connection/connectionService';
import { ContextManager } from './context/contextManager';
import { InstanceManager } from './instance/instanceManager';
import { OpenCodeCodeActionProvider } from './providers/codeActionProvider';
import { WorkspaceUtils } from './utils/workspace';

import * as vscode from 'vscode';

/**
 * Global extension state
 */
let configManager: ConfigManager | undefined;
let connectionService: ConnectionService | undefined;
let contextManager: ContextManager | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
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
    context.subscriptions.push(outputChannel);
    outputChannel.info('OpenCode Connector extension is now active');
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
    connectionService.discoverAndConnect().catch(() => {
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
    async () => handleCheckInstance(connectionService!, outputChannel!)
  );

  // Show workspace info command
  const workspaceCommand = vscode.commands.registerCommand(
    'opencodeConnector.showWorkspace',
    async () => handleShowWorkspace(connectionService!, outputChannel!)
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

  // Explain and Fix code action command
  const explainAndFixCommand = vscode.commands.registerCommand(
    'opencodeConnector.explainAndFix',
    async (diagnostic: vscode.Diagnostic, uri: vscode.Uri) =>
      handleExplainAndFix(connectionService!, outputChannel!, diagnostic, uri)
  );

  // Alias commands with 'opencode.' prefix for compatibility
  const opencodeCheckInstanceCommand = vscode.commands.registerCommand(
    'opencode.checkInstance',
    async () => handleCheckInstance(connectionService!, outputChannel!)
  );

  const opencodeShowWorkspaceCommand = vscode.commands.registerCommand(
    'opencode.showWorkspace',
    async () => handleShowWorkspace(connectionService!, outputChannel!)
  );

  const opencodeAddToPromptCommand = vscode.commands.registerCommand(
    'opencode.addToPrompt',
    async () => handleAddToPrompt(connectionService!, outputChannel!)
  );

  const opencodeAddMultipleFilesCommand = vscode.commands.registerCommand(
    'opencode.addMultipleFiles',
    async () => handleAddMultipleFiles(connectionService!, outputChannel!)
  );

  const opencodeExplainAndFixCommand = vscode.commands.registerCommand(
    'opencode.explainAndFix',
    async (diagnostic: vscode.Diagnostic, uri: vscode.Uri) =>
      handleExplainAndFix(connectionService!, outputChannel!, diagnostic, uri)
  );

  // Push all subscriptions for cleanup
  extensionContext?.subscriptions.push(
    statusCommand,
    workspaceCommand,
    addFileCommand,
    addMultipleFilesCommand,
    explainAndFixCommand,
    opencodeCheckInstanceCommand,
    opencodeShowWorkspaceCommand,
    opencodeAddToPromptCommand,
    opencodeAddMultipleFilesCommand,
    opencodeExplainAndFixCommand
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
