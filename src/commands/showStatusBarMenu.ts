import { ConnectionService } from '../connection/connectionService';
import { DefaultInstanceManager } from '../instance/defaultInstanceManager';
import { handleAddMultipleFiles } from './addMultipleFiles';
import { handleAddToPrompt } from './addToPrompt';
import { handleCheckInstance } from './checkInstance';
import { handleSelectDefaultInstance } from './selectDefaultInstance';
import { handleShowWorkspace } from './showWorkspace';

import * as vscode from 'vscode';

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
    {
      label: '$(star) Select Default Instance',
      description: 'Choose a default OpenCode instance for this workspace',
    },
  ];

  // Add "Clear Default Instance" only if a default is set
  const defaultManager = DefaultInstanceManager.getInstance();
  if (defaultManager.getDefaultPort() !== undefined) {
    items.push({
      label: '$(trash) Clear Default Instance',
      description: 'Remove the default instance selection',
    });
  }

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
    case '$(star) Select Default Instance':
      await handleSelectDefaultInstance(connectionService, outputChannel);
      break;
    case '$(trash) Clear Default Instance':
      DefaultInstanceManager.getInstance().clearDefault();
      await vscode.window.showInformationMessage('Default instance cleared');
      break;
  }
}
