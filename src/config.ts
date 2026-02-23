import * as vscode from 'vscode';

/**
 * Configuration manager for OpenCode VSCode extension.
 * Manages VSCode settings with default values.
 */
export class ConfigManager {
  private static instance: ConfigManager;
  public readonly extensionUri: vscode.Uri;

  private constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  /**
   * Get singleton instance of ConfigManager.
   */
  public static getInstance(extensionUri?: vscode.Uri): ConfigManager {
    if (!ConfigManager.instance && extensionUri) {
      ConfigManager.instance = new ConfigManager(extensionUri);
    }
    return ConfigManager.instance;
  }

  /**
   * Get OpenCode server port.
   * @returns Port number for OpenCode server connection (default: 4096)
   */
  public getPort(): number {
    const config = vscode.workspace.getConfiguration('opencode');
    return config.get<number>('port') ?? 4096;
  }

  /**
   * Get OpenCode binary path.
   * @returns Path to OpenCode binary (default: empty string)
   */
  public getBinaryPath(): string {
    const config = vscode.workspace.getConfiguration('opencode');
    return config.get<string>('binaryPath') ?? '';
  }

  /**
   * Get auto focus terminal setting.
   * @returns Whether to automatically focus the terminal when spawning OpenCode (default: true)
   */
  public getAutoFocusTerminal(): boolean {
    const config = vscode.workspace.getConfiguration('opencode');
    return config.get<boolean>('autoFocusTerminal') ?? true;
  }

  /**
   * Set OpenCode server port.
   * @param port - Port number to use
   */
  public setPort(port: number): Thenable<void> {
    const config = vscode.workspace.getConfiguration('opencode');
    return config.update('port', port, vscode.ConfigurationTarget.Global);
  }

  /**
   * Set OpenCode binary path.
   * @param binaryPath - Path to OpenCode binary
   */
  public setBinaryPath(binaryPath: string): Thenable<void> {
    const config = vscode.workspace.getConfiguration('opencode');
    return config.update('binaryPath', binaryPath, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get default configuration values.
   * @returns Object containing default values
   */
  public getDefaults(): {
    port: number;
    binaryPath: string;
    codeActionSeverityLevels: string[];
    autoFocusTerminal: boolean;
  } {
    return {
      port: 4096,
      binaryPath: '',
      codeActionSeverityLevels: ['error', 'warning', 'information', 'hint'],
      autoFocusTerminal: true,
    };
  }

  /**
   * Get code action severity levels.
   * @returns Array of severity levels that should trigger the "Explain and Fix" code action
   */
  public getCodeActionSeverityLevels(): string[] {
    const config = vscode.workspace.getConfiguration('opencode');
    return (
      config.get<string[]>('codeAction.severityLevels') ??
      this.getDefaults().codeActionSeverityLevels
    );
  }

  /**
   * Set code action severity levels.
   * @param levels - Array of severity levels
   */
  public setCodeActionSeverityLevels(levels: string[]): Thenable<void> {
    const config = vscode.workspace.getConfiguration('opencode');
    return config.update('codeAction.severityLevels', levels, vscode.ConfigurationTarget.Global);
  }
}

/**
 * Helper function to get configuration value with default.
 * @param section - Configuration section name
 * @param key - Configuration key
 * @param defaultValue - Default value if not set
 */
export function getConfigValue<T>(section: string, key: string, defaultValue: T): T {
  const config = vscode.workspace.getConfiguration(section);
  return config.get<T>(key) ?? defaultValue;
}

/**
 * Helper function to set configuration value.
 * @param section - Configuration section name
 * @param key - Configuration key
 * @param value - Value to set
 * @param target - Configuration target (global, workspace, etc.)
 */
export function setConfigValue<T>(
  section: string,
  key: string,
  value: T,
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
): Thenable<void> {
  const config = vscode.workspace.getConfiguration(section);
  return config.update(key, value, target);
}
