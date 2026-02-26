import * as vscode from 'vscode';

/**
 * Status bar manager for OpenCode connection indicator.
 * Shows connection status in the VSCode status bar.
 */
export class StatusBarManager {
  private static instance: StatusBarManager;
  private statusBarItem: vscode.StatusBarItem | undefined;
  private isConnected: boolean = false;

  private constructor() {}

  /**
   * Get singleton instance of StatusBarManager.
   */
  public static getInstance(): StatusBarManager {
    if (!StatusBarManager.instance) {
      StatusBarManager.instance = new StatusBarManager();
    }
    return StatusBarManager.instance;
  }

  /**
   * Initialize the status bar item.
   * Should be called during extension activation.
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.statusBarItem = vscode.window.createStatusBarItem(
      'opencode-connector-status',
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.name = 'OpenCode Connection Status';
    this.statusBarItem.command = 'opencodeConnector.showStatusBarMenu';
    this.statusBarItem.tooltip = 'Click to manage OpenCode connection';

    // Set initial disconnected state
    this.updateConnectionStatus(false);

    this.statusBarItem.show();
    context?.subscriptions?.push(this.statusBarItem);
  }

  /**
   * Update the connection status display.
   * @param connected - Whether OpenCode is connected
   */
  public updateConnectionStatus(connected: boolean): void {
    this.isConnected = connected;

    if (this.statusBarItem) {
      // Status bar text with icon - show different text based on connection state
      this.statusBarItem.text = connected
        ? '$(circle-filled) OpenCode'
        : '$(circle-outline) OpenCode';

      // Color based on connection state
      if (connected) {
        this.statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.prominentBackground'
        );
      } else {
        this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
        this.statusBarItem.backgroundColor = undefined;
      }
    }
  }

  /**
   * Get current connection status.
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Dispose of the status bar item.
   */
  public dispose(): void {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = undefined;
    }
    StatusBarManager.instance = undefined as unknown as StatusBarManager;
  }

  /**
   * Reset the singleton instance (useful for testing).
   */
  public static resetInstance(): void {
    StatusBarManager.instance = undefined as unknown as StatusBarManager;
  }
}

export default StatusBarManager;
