import { ConnectionService } from '../connection/connectionService';
import { formatPromptForDiagnostic } from '../providers/codeActionProvider';

import * as vscode from 'vscode';

function showTransientNotification(message: string): void {
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

export async function handleExplainAndFix(
  connectionService: ConnectionService,
  outputChannel: vscode.LogOutputChannel,
  diagnostic: vscode.Diagnostic,
  uri: vscode.Uri
): Promise<void> {
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
    const prompt = formatPromptForDiagnostic(diagnostic, uri, uriInfo =>
      vscode.workspace.asRelativePath(uriInfo.fsPath)
    );
    await openCodeClient.appendPrompt(prompt);
    showTransientNotification(`Sent explanation request for diagnostic`);

    const configManager = connectionService.getConfigManager();
    if (configManager.getAutoFocusTerminal()) {
      try {
        await connectionService.focusTerminal();
      } catch {
        // Silently ignore focus errors
      }
    }
  } catch (err) {
    await vscode.window.showErrorMessage(`Failed to send explanation: ${(err as Error).message}`);
  }
}
