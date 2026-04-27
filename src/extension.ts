/**
 * OpenCode Connector VSCode Extension
 * Provides integration between VS Code and OpenCode AI assistant
 */
import {
  handleAddMultipleFiles,
  handleAddSelectionToPrompt,
  handleAddToPrompt,
  handleCheckInstance,
  handleOpenInOpencode,
  handleOpenNewInstance,
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

  outputChannel = vscode.window.createOutputChannel('OpenCode Connector', { log: true });
  context.subscriptions.push(outputChannel);
  outputChannel.info('OpenCode Connector extension is now active');

  configManager = ConfigManager.getInstance(extensionUri);
  const instanceManager = InstanceManager.getInstance(configManager);

  instanceManager.setLogger({
    info: (msg: string) => outputChannel!.info(msg),
    warn: (msg: string) => outputChannel!.warn(msg),
    error: (msg: string) => outputChannel!.error(msg),
  });

  connectionService = new ConnectionService(configManager, instanceManager, outputChannel);

  statusBarManager = StatusBarManager.getInstance();
  statusBarManager.initialize(context);

  const connectionStateSub = connectionService.onDidChangeConnectionState(event => {
    statusBarManager!.updateConnectionStatus(event.connected, event.port);
  });
  extensionContext.subscriptions.push(connectionStateSub);

  registerCommands();

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    '*',
    new OpenCodeCodeActionProvider(),
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
  );
  extensionContext.subscriptions.push(codeActionProvider);

  registerWorkspaceHandlers();

  connectionService
    .discoverAndConnect()
    .then(connected => {
      statusBarManager!.updateConnectionStatus(connected, connectionService!.getPort());
    })
    .catch(() => {
      statusBarManager!.updateConnectionStatus(false);
    });

  outputChannel.info(
    'OpenCode Connector fully initialized' +
      (isRemoteSession() ? ` [Remote: ${vscode.env.remoteName}]` : ' [Local]')
  );
}

function registerCommands(): void {
  const statusCommand = vscode.commands.registerCommand(
    'opencodeConnector.checkInstance',
    async () => handleCheckInstance(connectionService!)
  );

  const workspaceCommand = vscode.commands.registerCommand(
    'opencodeConnector.showWorkspace',
    async () => handleShowWorkspace()
  );

  const addFileCommand = vscode.commands.registerCommand(
    'opencodeConnector.addToPrompt',
    async () => handleAddToPrompt(connectionService!, outputChannel!)
  );

  const addMultipleFilesCommand = vscode.commands.registerCommand(
    'opencodeConnector.addMultipleFiles',
    async () => handleAddMultipleFiles(connectionService!, outputChannel!)
  );

  const statusBarMenuCommand = vscode.commands.registerCommand(
    'opencodeConnector.showStatusBarMenu',
    async () => showStatusBarMenu(connectionService!, outputChannel!)
  );

  const selectDefaultInstanceCommand = vscode.commands.registerCommand(
    'opencodeConnector.selectDefaultInstance',
    async () => handleSelectDefaultInstance(connectionService!, outputChannel!)
  );

  const sendDebugContextCommand = vscode.commands.registerCommand(
    'opencodeConnector.sendDebugContext',
    async () => handleSendDebugContext(connectionService!, outputChannel!)
  );

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

  const instanceManager = InstanceManager.getInstance();
  const addSelectionToPromptCommand = vscode.commands.registerCommand(
    'opencodeConnector.addSelectionToPrompt',
    async () => handleAddSelectionToPrompt(connectionService!, outputChannel!)
  );

  const openNewInstanceCommand = vscode.commands.registerCommand(
    'opencodeConnector.openNewInstance',
    async () => handleOpenNewInstance(connectionService!, instanceManager, outputChannel!)
  );

  const openInOpencodeCommand = vscode.commands.registerCommand(
    'opencodeConnector.openInOpencode',
    async (uri: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) {
        await handleOpenInOpencode(connectionService!, instanceManager, outputChannel!, target);
      }
    }
  );

  extensionContext!.subscriptions.push(
    statusCommand,
    workspaceCommand,
    addFileCommand,
    addMultipleFilesCommand,
    statusBarMenuCommand,
    selectDefaultInstanceCommand,
    sendDebugContextCommand,
    sendPathCommand,
    sendRelativePathCommand,
    addSelectionToPromptCommand,
    openNewInstanceCommand,
    openInOpencodeCommand
  );
}

function registerWorkspaceHandlers(): void {
  const workspaceFoldersChange = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const workspaceInfo = WorkspaceUtils.detectWorkspace();
    outputChannel!.info(
      `Workspace changed: ${workspaceInfo.rootCount} root(s), primary: ${workspaceInfo.primaryRoot?.name || 'none'}`
    );
    DefaultInstanceManager.getInstance().clearDefault();
    outputChannel!.info('Cleared default instance due to workspace change');
  });

  const configChange = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('opencode')) {
      outputChannel!.info('OpenCode configuration changed');
    }
  });

  extensionContext!.subscriptions.push(workspaceFoldersChange, configChange);
}

export function deactivate(): void {
  outputChannel?.info('OpenCode Connector extension is now deactivated');

  const client = connectionService?.getClient();
  client?.destroy();
  connectionService = undefined;

  InstanceManager.resetInstance();
  configManager = undefined;
}
