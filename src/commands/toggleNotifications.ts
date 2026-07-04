import { ConfigManager } from '../config';

import * as vscode from 'vscode';

/**
 * Toggle OpenCode completion notifications on or off.
 * @param configManager - Extension configuration manager
 * @param outputChannel - User-visible log channel
 */
export async function handleToggleNotifications(
  configManager: ConfigManager,
  outputChannel: vscode.LogOutputChannel
): Promise<void> {
  const nextValue = !configManager.getNotificationsEnabled();

  try {
    await configManager.setNotificationsEnabled(nextValue);
    outputChannel.info(`OpenCode notifications ${nextValue ? 'enabled' : 'disabled'}.`);
    await vscode.window.showInformationMessage(
      `OpenCode notifications ${nextValue ? 'enabled' : 'disabled'}.`
    );
  } catch (err) {
    const message = `Failed to toggle notifications: ${(err as Error).message}`;
    outputChannel.error(message);
    await vscode.window.showErrorMessage(message);
  }
}

export default handleToggleNotifications;
