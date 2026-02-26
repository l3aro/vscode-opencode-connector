import { ConnectionService } from '../connection/connectionService';

import * as vscode from 'vscode';

export async function handleCheckInstance(connectionService: ConnectionService): Promise<void> {
  const configManager = connectionService.getConfigManager();
  const port = configManager?.getPort() || 4096;
  const result = await connectionService.getRunningInstance(port);

  if (result.isRunning) {
    await vscode.window.showInformationMessage(`OpenCode instance running on port ${port}`);
  } else {
    const choice = await vscode.window.showWarningMessage(
      `No OpenCode instance detected on port ${port}`,
      'Start Instance'
    );

    if (choice === 'Start Instance') {
      const spawnResult = await connectionService.spawnInstance(port);
      if (spawnResult.success) {
        await vscode.window.showInformationMessage('OpenCode instance started');
      } else {
        await vscode.window.showErrorMessage(`Failed to start instance: ${spawnResult.error}`);
      }
    }
  }
}
