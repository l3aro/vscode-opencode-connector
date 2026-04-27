import { ConnectionService } from '../connection/connectionService';
import { InstanceManager } from '../instance/instanceManager';

import * as vscode from 'vscode';

/**
 * Resolve the workspace folder for the currently active editor file.
 * Falls back to the first workspace folder if no editor is active.
 */
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
 * Core logic: given a resolved workspace path, find an existing OpenCode instance
 * or spawn a new one, always opening it as an editor tab.
 *
 * Used by both `handleOpenNewInstance` (from the editor title button) and
 * `handleOpenInOpencode` (from the Explorer context menu).
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
        // Check for an existing OpenCode process that serves this workspace
        const existingPort = await connectionService.findPortForWorkspace(workspacePath);

        if (existingPort !== undefined) {
          // Try to show the tracked terminal (we already know about it)
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

          // Instance is running but no tracked terminal — open a new editor-tab
          // terminal that re-attaches to the existing port
          // (if the process is orphaned from a disposed terminal, spawning creates a duplicate)
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

        // No existing instance — spawn a fresh one for this workspace
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
 * Handle the "Open New Instance" editor title button command.
 * Detects the workspace from the active editor file and delegates to openOpencodeForWorkspace.
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
