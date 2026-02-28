import { ConnectionService } from '../connection/connectionService';
import { formatPaths } from '../utils/pathUtils';

import * as vscode from 'vscode';

/**
 * Show transient notification in status bar
 * @param message - Message to display
 */
function showTransientNotification(message: string): void {
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

export async function handleSendPath(
  connectionService: ConnectionService,
  outputChannel: vscode.LogOutputChannel,
  resources: vscode.Uri[]
): Promise<void> {
  if (!resources || resources.length === 0) {
    await vscode.window.showWarningMessage('No files or directories selected');
    return;
  }

  const connected = await connectionService.ensureConnected();
  const openCodeClient = connectionService.getClient();
  const lastAutoSpawnError = connectionService.getLastAutoSpawnError();

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
    const paths = formatPaths(resources);

    outputChannel.info(`[sendPath] Sending to port ${port}, cwd: ${workspaceDir}`);
    outputChannel.debug(`[sendPath] Content: "${paths}"`);

    const result = await openCodeClient.appendPrompt(paths);
    outputChannel.debug(`[sendPath] Result: ${result}`);

    const count = resources.length;
    showTransientNotification(`Sent ${count} path${count > 1 ? 's' : ''}`);

    const configManager = connectionService.getConfigManager();
    if (configManager.getAutoFocusTerminal()) {
      outputChannel.debug(`[sendPath] Auto-focus enabled, attempting to focus terminal`);
      try {
        const focused = await connectionService.focusTerminal();
        outputChannel.debug(`[sendPath] Terminal focus result: ${focused}`);
      } catch (err) {
        outputChannel.warn(`[sendPath] Terminal focus error: ${(err as Error).message}`);
      }
    } else {
      outputChannel.debug(`[sendPath] Auto-focus disabled in config`);
    }
  } catch (err) {
    await vscode.window.showErrorMessage(`Failed to send paths: ${(err as Error).message}`);
  }
}
