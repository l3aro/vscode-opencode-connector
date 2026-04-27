import { ConnectionService } from '../connection/connectionService';
import { WorkspaceUtils } from '../utils/workspace';

import * as vscode from 'vscode';

function showTransientNotification(message: string): void {
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

export async function handleAddSelectionToPrompt(
  connectionService: ConnectionService,
  outputChannel: vscode.LogOutputChannel
): Promise<void> {
  const ref = WorkspaceUtils.getActiveFileRef();
  if (!ref) {
    await vscode.window.showWarningMessage('No active file or selection to reference');
    return;
  }

  // Connect to the OpenCode instance that serves the active file's workspace.
  const activeEditor = vscode.window.activeTextEditor;
  const workspacePath = activeEditor
    ? vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath
    : undefined;

  const connected = workspacePath
    ? await connectionService.ensureConnectedForWorkspace(workspacePath)
    : await connectionService.ensureConnected();

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
    outputChannel.info(`[addSelectionToPrompt] Sending to port ${port}, cwd: ${workspaceDir}`);
    outputChannel.debug(`[addSelectionToPrompt] Content: "${ref}"`);
    const result = await openCodeClient.appendPrompt(ref);
    outputChannel.debug(`[addSelectionToPrompt] Result: ${result}`);
    showTransientNotification(`Sent: ${ref}`);

    const configManager = connectionService.getConfigManager();
    if (configManager.getAutoFocusTerminal()) {
      outputChannel.debug(
        `[addSelectionToPrompt] Auto-focus enabled, attempting to focus terminal`
      );
      try {
        const focused = await connectionService.focusTerminal();
        outputChannel.debug(`[addSelectionToPrompt] Terminal focus result: ${focused}`);
      } catch (err) {
        outputChannel.warn(
          `[addSelectionToPrompt] Terminal focus error: ${(err as Error).message}`
        );
      }
    } else {
      outputChannel.debug(`[addSelectionToPrompt] Auto-focus disabled in config`);
    }
  } catch (err) {
    await vscode.window.showErrorMessage(`Failed to send selection: ${(err as Error).message}`);
  }
}
