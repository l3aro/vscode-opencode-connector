/**
 * Command to select a default OpenCode instance via QuickPick
 */
import { OpenCodeClient } from '../api/openCodeClient';
import { ConnectionService, pathsMatch } from '../connection/connectionService';
import { DefaultInstanceManager } from '../instance/defaultInstanceManager';
import { InstanceManager } from '../instance/instanceManager';

import * as vscode from 'vscode';

/**
 * Timeout for fetching session titles (in milliseconds)
 */
const TITLE_FETCH_TIMEOUT = 2000;

/**
 * Creates a promise that rejects after a specified timeout
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), ms);
  });
}

/**
 * Handle selecting a default OpenCode instance from available instances.
 * Shows a QuickPick with all running instances serving the current workspace.
 */
export async function handleSelectDefaultInstance(
  connectionService: ConnectionService,
  outputChannel: vscode.LogOutputChannel
): Promise<void> {
  const instanceManager = InstanceManager.getInstance();
  const defaultManager = DefaultInstanceManager.getInstance();

  // Scan for all running OpenCode processes
  const processes = await instanceManager.scanForProcesses();

  if (processes.length === 0) {
    await vscode.window.showInformationMessage('No running OpenCode instances found');
    return;
  }

  // Get current workspace directory
  const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceDir) {
    await vscode.window.showInformationMessage('No workspace folder open');
    return;
  }

  // Filter instances that serve the current workspace
  const workspaceInstances: { port: number; title: string }[] = [];

  for (const proc of processes) {
    const client = new OpenCodeClient({ port: proc.port });

    try {
      // Get the instance's working directory
      const pathInfo = await Promise.race([client.getPath(), createTimeout(TITLE_FETCH_TIMEOUT)]);

      if (pathInfo && pathsMatch(pathInfo.directory, workspaceDir)) {
        // Try to get session title
        let title = 'Default Session';
        try {
          const sessions = await Promise.race([
            client.listSessions(),
            createTimeout(TITLE_FETCH_TIMEOUT),
          ]);
          if (sessions && sessions.length > 0) {
            // Get the most recent session
            const sortedSessions = [...sessions].sort((a, b) => b.time.updated - a.time.updated);
            title = sortedSessions[0].title || 'Default Session';
          }
        } catch {
          // Title fetch failed - mark as unavailable
          title = 'unavailable';
        }

        workspaceInstances.push({ port: proc.port, title });
      }
    } catch {
      // Path check or timeout failed - skip this instance
      continue;
    }
  }

  if (workspaceInstances.length === 0) {
    await vscode.window.showInformationMessage('No OpenCode instances found for current workspace');
    return;
  }

  // Build QuickPick items
  const items: vscode.QuickPickItem[] = [
    {
      label: '$(close) Clear Default',
      description: 'Remove the default instance selection',
    },
    ...workspaceInstances.map(inst => ({
      label: `$(symbol-property) Port ${inst.port}: ${inst.title}`,
      description: `Connect to port ${inst.port}`,
      detail: inst.title === 'unavailable' ? 'Session title unavailable' : undefined,
    })),
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select default OpenCode instance',
    title: 'Select Default Instance',
  });

  if (!selected) {
    return;
  }

  // Handle clear default
  if (selected.label === '$(close) Clear Default') {
    defaultManager.clearDefault();
    await vscode.window.showInformationMessage('Default instance cleared');
    outputChannel.info('[selectDefaultInstance] Default instance cleared');
    return;
  }

  // Extract port from selected label
  const portMatch = selected.label.match(/Port (\d+)/);
  if (!portMatch) {
    return;
  }

  const selectedPort = parseInt(portMatch[1], 10);

  // Set as default
  defaultManager.setDefaultPort(selectedPort);
  outputChannel.info(`[selectDefaultInstance] Default port set to ${selectedPort}`);

  // Connect to the selected instance
  const connected = await connectionService.ensureConnected();

  if (connected) {
    await vscode.window.showInformationMessage(`Default instance set to port ${selectedPort}`);
  } else {
    const lastError = connectionService.getLastAutoSpawnError();
    const msg = lastError
      ? `Failed to connect: ${lastError}`
      : `Failed to connect to port ${selectedPort}`;
    await vscode.window.showErrorMessage(msg);
  }
}

export default handleSelectDefaultInstance;
