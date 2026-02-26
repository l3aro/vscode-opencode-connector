import { WorkspaceUtils } from '../utils/workspace';

import * as vscode from 'vscode';

export async function handleShowWorkspace(): Promise<void> {
  const workspaceInfo = WorkspaceUtils.detectWorkspace();
  const name = WorkspaceUtils.getWorkspaceName();
  const roots = workspaceInfo.rootCount;

  const message =
    `Workspace: ${name}\n` + `Roots: ${roots}\n` + `Multi-root: ${roots > 1 ? 'Yes' : 'No'}`;

  await vscode.window.showInformationMessage(message);
}
