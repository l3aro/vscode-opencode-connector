import * as vscode from 'vscode';
import { ConnectionService } from '../connection/connectionService';
import { handleAddToPrompt } from './addToPrompt';
import { handleAddMultipleFiles } from './addMultipleFiles';
import { handleCheckInstance } from './checkInstance';
import { handleShowWorkspace } from './showWorkspace';

/**
 * Show a QuickPick menu with available OpenCode commands.
 */
export async function showStatusBarMenu(
  connectionService: ConnectionService,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const items: vscode.QuickPickItem[] = [
    {
      label: '$(file-add) Add Current File to Prompt',
      description: 'Send the current file reference to OpenCode',
    },
    {
      label: '$(files) Select Files to Add',
      description: 'Choose multiple files to add to the prompt',
    },
    {
      label: '$(debug-start) Check Instance Status',
      description: 'Check if OpenCode is running and connected',
    },
    {
      label: '$(folder-opened) Show Workspace',
      description: 'Display the current workspace information',
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an OpenCode action...',
  });

  if (!selected) {
    return;
  }

  // Execute the selected command
  switch (selected.label) {
    case '$(file-add) Add Current File to Prompt':
      await handleAddToPrompt(connectionService, outputChannel);
      break;
    case '$(files) Select Files to Add':
      await handleAddMultipleFiles(connectionService, outputChannel);
      break;
    case '$(debug-start) Check Instance Status':
      await handleCheckInstance(connectionService);
      break;
    case '$(folder-opened) Show Workspace':
      await handleShowWorkspace();
      break;
  }
}
