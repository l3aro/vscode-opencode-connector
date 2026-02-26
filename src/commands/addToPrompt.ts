import { ConnectionService } from '../connection/connectionService';
import { WorkspaceUtils } from '../utils/workspace';

import * as vscode from 'vscode';

function showTransientNotification(message: string): void {
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

export async function handleAddToPrompt(
  connectionService: ConnectionService,
  outputChannel: vscode.LogOutputChannel
): Promise<void> {
  const ref = WorkspaceUtils.getActiveFileRef();
  if (!ref) {
    await vscode.window.showWarningMessage('No active file to reference');
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
    outputChannel.info(`[addToPrompt] Sending to port ${port}, cwd: ${workspaceDir}`);
    outputChannel.debug(`[addToPrompt] Content: "${ref}"`);
    const result = await openCodeClient.appendPrompt(ref);
    outputChannel.debug(`[addToPrompt] Result: ${result}`);
    showTransientNotification(`Sent: ${ref}`);

    const configManager = connectionService.getConfigManager();
    if (configManager.getAutoFocusTerminal()) {
      outputChannel.debug(`[addToPrompt] Auto-focus enabled, attempting to focus terminal`);
      try {
        const focused = await connectionService.focusTerminal();
        outputChannel.debug(`[addToPrompt] Terminal focus result: ${focused}`);
      } catch (err) {
        outputChannel.warn(`[addToPrompt] Terminal focus error: ${(err as Error).message}`);
      }
    } else {
      outputChannel.debug(`[addToPrompt] Auto-focus disabled in config`);
    }
  } catch (err) {
    await vscode.window.showErrorMessage(`Failed to send reference: ${(err as Error).message}`);
  }
}
