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
    await vscode.window.showWarningMessage('OpenCode: No active file or selection to reference');
    return;
  }

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
    const workspaceDir = workspacePath ?? 'unknown';
    outputChannel.info(`Sending to port ${port}, cwd: ${workspaceDir}`);
    outputChannel.debug(`Content: "${ref}"`);
    const result = await openCodeClient.appendPrompt(ref);
    outputChannel.debug(`Result: ${result}`);
    showTransientNotification(`Sent: ${ref}`);

    if (connectionService.getConfigManager().getAutoFocusTerminal()) {
      try {
        const focused = await connectionService.focusTerminal();
        outputChannel.debug(`Terminal focus result: ${focused}`);
      } catch (err) {
        outputChannel.warn(`Terminal focus error: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    await vscode.window.showErrorMessage(`Failed to send selection: ${(err as Error).message}`);
  }
}
