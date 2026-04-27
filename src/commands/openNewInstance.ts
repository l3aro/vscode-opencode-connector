import { ConnectionService } from '../connection/connectionService';
import { InstanceManager } from '../instance/instanceManager';

import * as vscode from 'vscode';

function resolveActiveWorkspace(): vscode.WorkspaceFolder | undefined {
  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor) {
    const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (folder) {
      return folder;
    }
  }

  return vscode.workspace.workspaceFolders?.[0];
}

/**
 * Find or spawn an OpenCode instance for the given workspace path,
 * opening it as an editor tab.
 */
export async function openOpencodeForWorkspace(
  workspacePath: string,
  connectionService: ConnectionService,
  instanceManager: InstanceManager,
  outputChannel: vscode.LogOutputChannel
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'OpenCode: Opening instance…',
      cancellable: false,
    },
    async () => {
      try {
        const existingPort = await connectionService.findPortForWorkspace(workspacePath);

        if (existingPort !== undefined) {
          const trackedTerminal = instanceManager.getTerminalForPort(existingPort);

          if (trackedTerminal) {
            outputChannel.info(
              `[openOpencodeForWorkspace] Focusing tracked terminal for port ${existingPort}`
            );
            trackedTerminal.show(false);
            vscode.window.setStatusBarMessage(
              `$(check) Resumed OpenCode on port ${existingPort}`,
              4000
            );
            return;
          }

          outputChannel.info(
            `[openOpencodeForWorkspace] No tracked terminal for port ${existingPort}, opening editor tab`
          );
          await instanceManager.spawnInTerminal(existingPort, {
            cwd: workspacePath,
            asEditor: true,
          });
          vscode.window.setStatusBarMessage(
            `$(check) Reconnected to OpenCode on port ${existingPort}`,
            4000
          );
          return;
        }

        outputChannel.info(
          `[openOpencodeForWorkspace] No existing instance for "${workspacePath}", spawning new one`
        );
        const port = await instanceManager.findAvailablePort();
        await instanceManager.spawnInTerminal(port, {
          cwd: workspacePath,
          asEditor: true,
        });
        outputChannel.info(`[openOpencodeForWorkspace] New instance started on port ${port}`);
        vscode.window.setStatusBarMessage(`$(check) OpenCode started on port ${port}`, 4000);
      } catch (err) {
        outputChannel.error(`[openOpencodeForWorkspace] Failed: ${(err as Error).message}`);
        await vscode.window.showErrorMessage(`Failed to open OpenCode: ${(err as Error).message}`);
      }
    }
  );
}

/**
 * Handle the "Open New Instance" command from the editor title button.
 */
export async function handleOpenNewInstance(
  connectionService: ConnectionService,
  instanceManager: InstanceManager,
  outputChannel: vscode.LogOutputChannel
): Promise<void> {
  const workspaceFolder = resolveActiveWorkspace();

  if (!workspaceFolder) {
    await vscode.window.showWarningMessage(
      'OpenCode: No workspace folder detected. Open a project folder first.'
    );
    return;
  }

  outputChannel.info(`[openNewInstance] Target workspace: "${workspaceFolder.uri.fsPath}"`);
  await openOpencodeForWorkspace(
    workspaceFolder.uri.fsPath,
    connectionService,
    instanceManager,
    outputChannel
  );
}
