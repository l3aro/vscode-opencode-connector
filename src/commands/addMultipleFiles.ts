import { ConnectionService } from '../connection/connectionService';

import * as path from 'path';
import * as vscode from 'vscode';

function showTransientNotification(message: string): void {
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

export async function handleAddMultipleFiles(
  connectionService: ConnectionService,
  outputChannel: vscode.LogOutputChannel
): Promise<void> {
  const allTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

  const textEditorTabs = allTabs.filter(
    (tab): tab is vscode.Tab => tab.input instanceof vscode.TabInputText
  );

  if (textEditorTabs.length === 0) {
    await vscode.window.showInformationMessage('No open editor tabs found');
    return;
  }

  const items: vscode.QuickPickItem[] = textEditorTabs.map(tab => {
    const input = tab.input as vscode.TabInputText;
    const uri = input.uri;
    const fileName = vscode.workspace.asRelativePath(uri, false);
    const fullPath = uri.fsPath;

    const dirMatch = fileName.match(/^(.+?)[/\\][^/\\]+$/);
    const description = dirMatch ? dirMatch[1] + '/' : '';

    return {
      label: path.basename(fileName),
      description: description,
      detail: fullPath,
      picked: true,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: 'Select files to add to prompt',
    matchOnDescription: true,
    matchOnDetail: true,
    title: 'Select Files to Add to OpenCode',
  });

  if (!selected || selected.length === 0) {
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
    outputChannel.info(`[addMultipleFiles] Sending to port ${port}, cwd: ${workspaceDir}`);

    const refs = selected
      .map(item => {
        const relativePath = (item.description || '') + item.label;
        return `@${relativePath}`;
      })
      .join(' ');

    outputChannel.debug(`[addMultipleFiles] Sending: "${refs}"`);
    await openCodeClient.appendPrompt(refs);

    outputChannel.debug(`[addMultipleFiles] Sent ${selected.length} files`);
    showTransientNotification(`Sent ${selected.length} files to OpenCode`);
  } catch (err) {
    await vscode.window.showErrorMessage(`Failed to send references: ${(err as Error).message}`);
  }
}
