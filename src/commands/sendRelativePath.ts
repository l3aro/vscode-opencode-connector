import { ConnectionService } from '../connection/connectionService';

import * as path from 'path';
import * as vscode from 'vscode';

function showTransientNotification(message: string): void {
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

function isDirectory(filePath: string): boolean {
  if (filePath.endsWith('/') || filePath.endsWith('\\')) {
    return true;
  }

  const basename = path.basename(filePath);
  return !basename.includes('.');
}

function formatRelativePaths(resources: vscode.Uri[]): string {
  const paths = resources.map(uri => {
    const relativePath = vscode.workspace.asRelativePath(uri, false);

    let formatted = '@' + relativePath;
    if (isDirectory(uri.fsPath)) {
      formatted += path.sep;
    }
    return formatted;
  });

  return paths.join('\n');
}

export async function handleSendRelativePath(
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
    const paths = formatRelativePaths(resources);

    outputChannel.info(`[sendRelativePath] Sending to port ${port}, cwd: ${workspaceDir}`);
    outputChannel.debug(`[sendRelativePath] Content: "${paths}"`);

    const result = await openCodeClient.appendPrompt(paths);
    outputChannel.debug(`[sendRelativePath] Result: ${result}`);

    const count = resources.length;
    showTransientNotification(`Sent ${count} relative path${count > 1 ? 's' : ''}`);

    const configManager = connectionService.getConfigManager();
    if (configManager.getAutoFocusTerminal()) {
      outputChannel.debug(`[sendRelativePath] Auto-focus enabled, attempting to focus terminal`);
      try {
        const focused = await connectionService.focusTerminal();
        outputChannel.debug(`[sendRelativePath] Terminal focus result: ${focused}`);
      } catch (err) {
        outputChannel.warn(`[sendRelativePath] Terminal focus error: ${(err as Error).message}`);
      }
    } else {
      outputChannel.debug(`[sendRelativePath] Auto-focus disabled in config`);
    }
  } catch (err) {
    await vscode.window.showErrorMessage(`Failed to send paths: ${(err as Error).message}`);
  }
}
