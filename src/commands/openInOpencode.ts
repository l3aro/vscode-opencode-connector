import { ConnectionService } from '../connection/connectionService';
import { InstanceManager } from '../instance/instanceManager';
import { openOpencodeForWorkspace } from './openNewInstance';

import * as vscode from 'vscode';

/**
 * Handle the "Open in OpenCode" Explorer context menu command.
 *
 * Receives the right-clicked file or folder URI, resolves its workspace folder,
 * and delegates to openOpencodeForWorkspace which either focuses an existing
 * instance or spawns a new one — always as an editor tab.
 *
 * @param connectionService - Active connection service
 * @param instanceManager   - Instance manager for process scanning and spawning
 * @param outputChannel     - Log output channel
 * @param uri               - URI of the right-clicked file or folder
 */
export async function handleOpenInOpencode(
  connectionService: ConnectionService,
  instanceManager: InstanceManager,
  outputChannel: vscode.LogOutputChannel,
  uri: vscode.Uri
): Promise<void> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

  if (!workspaceFolder) {
    await vscode.window.showWarningMessage(
      'OpenCode: The selected item is not inside a workspace folder.'
    );
    return;
  }

  outputChannel.info(
    `[openInOpencode] Triggered for "${uri.fsPath}" → workspace: "${workspaceFolder.uri.fsPath}"`
  );

  await openOpencodeForWorkspace(
    workspaceFolder.uri.fsPath,
    connectionService,
    instanceManager,
    outputChannel
  );
}
