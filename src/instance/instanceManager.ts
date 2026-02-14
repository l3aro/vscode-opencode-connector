/**
 * Platform-aware Instance Manager for OpenCode
 * Handles detection of running instances and spawning new instances
 */
import * as child_process from 'child_process';

import { ConfigManager } from '../config';
import { WorkspaceUtils } from '../utils/workspace';

import * as net from 'net';
import * as vscode from 'vscode';

/**
 * Result of checking if an instance is running
 */
export interface InstanceCheckResult {
  /** Whether an instance is currently running on the port */
  isRunning: boolean;
  /** The port that was checked */
  port: number;
  /** Error message if check failed */
  error?: string;
}

/**
 * Result of spawning a new instance
 */
export interface SpawnResult {
  /** Whether the spawn was successful */
  success: boolean;
  /** The child process reference */
  process?: child_process.ChildProcess;
  /** Error message if spawn failed */
  error?: string;
}

/**
 * Platform detection utilities
 */
export const PlatformUtils = {
  /**
   * Check if running on Windows
   */
  isWindows: (): boolean => {
    return process.platform === 'win32';
  },

  /**
   * Get the shell command prefix for spawning commands
   * Windows: 'cmd /c'
   * Unix: 'sh -c'
   */
  getShellPrefix: (): { command: string; args: string[] } => {
    if (process.platform === 'win32') {
      return { command: 'cmd', args: ['/c'] };
    }
    return { command: 'sh', args: ['-c'] };
  },

  /**
   * Get the command to execute a binary
   * On Windows, this ensures .cmd extension is used for node scripts
   */
  getCommandWithExtension: (command: string): string => {
    if (process.platform === 'win32') {
      // Add .cmd extension if not already present (common for npm/node scripts)
      if (command.endsWith('.js') || command.endsWith('.exe')) {
        return command;
      }
      // For node/npm scripts, prefer .cmd on Windows
      return `${command}.cmd`;
    }
    return command;
  },
};

/**
 * Discovered OpenCode process with its port
 */
export interface DiscoveredProcess {
  pid: number;
  port: number;
}

/**
 * Logger interface for extension logging
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Instance Manager for OpenCode
 * Provides methods to detect running instances and spawn new ones
 */
export class InstanceManager {
  private static instance: InstanceManager;
  private configManager: ConfigManager;
  private logger?: Logger;

  private constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Set logger for output
   */
  public setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Get singleton instance of InstanceManager
   */
  public static getInstance(configManager?: ConfigManager): InstanceManager {
    if (!InstanceManager.instance && configManager) {
      InstanceManager.instance = new InstanceManager(configManager);
    }
    return InstanceManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    InstanceManager.instance = undefined as unknown as InstanceManager;
  }

  /**
   * Check if an OpenCode instance is running on the configured port
   * @param port - Optional port to check (uses config default if not provided)
   * @returns Promise<InstanceCheckResult>
   */
  public async getRunningInstance(port?: number): Promise<InstanceCheckResult> {
    const targetPort = port ?? this.configManager.getPort();

    return new Promise(resolve => {
      const socket = new net.Socket();

      // Set a timeout for the connection attempt
      socket.setTimeout(2000);

      socket.on('connect', () => {
        // Successfully connected - port is in use
        socket.destroy();
        resolve({
          isRunning: true,
          port: targetPort,
        });
      });

      socket.on('timeout', () => {
        // Connection timed out - port is likely not accessible
        socket.destroy();
        resolve({
          isRunning: false,
          port: targetPort,
          error: 'Connection timed out',
        });
      });

      socket.on('error', (err: Error & { code?: string }) => {
        // Handle different error types
        if (err.code === 'EADDRINUSE') {
          // Port is in use by another process
          resolve({
            isRunning: true,
            port: targetPort,
          });
        } else if (err.code === 'ECONNREFUSED') {
          // Connection refused - nothing listening on this port
          resolve({
            isRunning: false,
            port: targetPort,
            error: 'Connection refused',
          });
        } else if (err.code === 'ENOTFOUND') {
          // Host not found - invalid hostname
          resolve({
            isRunning: false,
            port: targetPort,
            error: 'Host not found',
          });
        } else {
          // Other error
          resolve({
            isRunning: false,
            port: targetPort,
            error: err.message,
          });
        }
      });

      // Attempt to connect
      socket.connect(targetPort, 'localhost');
    });
  }

  /**
   * Spawn a new OpenCode instance
   * @param port - Optional port to use (uses config default if not provided)
   * @returns Promise<SpawnResult>
   */
  public async spawnInstance(port?: number): Promise<SpawnResult> {
    const targetPort = port ?? this.configManager.getPort();
    const binaryPath = this.configManager.getBinaryPath();

    // Determine the command to run
    const command = binaryPath || 'opencode';
    const commandWithExtension = PlatformUtils.getCommandWithExtension(command);

    // Build the full command with arguments
    const fullCommand = `${commandWithExtension} --port ${targetPort}`;

    // Create spawn options based on platform
    const spawnOptions: child_process.SpawnOptions = {
      detached: true,
      stdio: 'pipe',
    };

    // On Windows, use cmd /c to properly handle command parsing
    // On Unix, use sh -c for consistency
    if (process.platform === 'win32') {
      spawnOptions.shell = true;
    }

    return new Promise(resolve => {
      let spawnedProcess: child_process.ChildProcess | undefined;
      let spawnResolved = false;

      // Timeout for spawn event
      const spawnTimeout = setTimeout(() => {
        if (!spawnResolved) {
          spawnResolved = true;
          resolve({
            success: false,
            error: 'Process spawn timed out',
          });
        }
      }, 5000);

      try {
        if (process.platform === 'win32') {
          // Windows: Use cmd /c for proper command parsing
          spawnedProcess = child_process.spawn('cmd', ['/c', fullCommand], spawnOptions);
        } else {
          // Unix: Use sh -c for shell command execution
          spawnedProcess = child_process.spawn('sh', ['-c', fullCommand], spawnOptions);
        }

        // Handle spawn event (process successfully started)
        spawnedProcess.on('spawn', () => {
          if (spawnResolved) return;
          spawnResolved = true;
          clearTimeout(spawnTimeout);

          // Unref the child process so it can run independently
          spawnedProcess?.unref();

          resolve({
            success: true,
            process: spawnedProcess,
          });
        });

        // Handle spawn errors
        spawnedProcess.on('error', err => {
          if (spawnResolved) return;
          spawnResolved = true;
          clearTimeout(spawnTimeout);
          resolve({
            success: false,
            error: `Failed to spawn process: ${err.message}`,
          });
        });

        // Handle process exit (for detached processes, exit immediately usually means error)
        spawnedProcess.on('exit', (code, signal) => {
          if (code !== null && code !== 0) {
            this.logger?.warn(`OpenCode process exited with code ${code} (signal: ${signal})`);
          }
        });
      } catch (err) {
        if (!spawnResolved) {
          spawnResolved = true;
          clearTimeout(spawnTimeout);
          resolve({
            success: false,
            error: `Failed to spawn OpenCode: ${(err as Error).message}`,
          });
        }
      }
    });
  }

  /**
   * Ensure an OpenCode instance is running
   * Checks for existing instance, spawns one if needed
   * @param port - Optional port to use
   * @returns Promise<SpawnResult>
   */
  public async ensureInstance(port?: number): Promise<SpawnResult> {
    const targetPort = port ?? this.configManager.getPort();

    // First, check if an instance is already running
    const checkResult = await this.getRunningInstance(targetPort);

    if (checkResult.isRunning) {
      return {
        success: true,
        error: undefined,
      };
    }

    // No instance running, spawn a new one
    return this.spawnInstance(targetPort);
  }

  /**
   * Get the binary path being used
   */
  public getBinaryPath(): string {
    return this.configManager.getBinaryPath();
  }

  /**
   * Get the configured port
   */
  public getPort(): number {
    return this.configManager.getPort();
  }

  /**
   * Scan for running OpenCode processes and their listening ports.
   * Platform-aware: uses pgrep+lsof on Unix, PowerShell on Windows.
   * @returns Array of discovered processes with PIDs and ports
   */
  public async scanForProcesses(): Promise<DiscoveredProcess[]> {
    try {
      if (PlatformUtils.isWindows()) {
        return await this.scanProcessesWindows();
      }
      return await this.scanProcessesUnix();
    } catch {
      return [];
    }
  }

  /**
   * Scan for OpenCode processes on Unix (Linux/macOS)
   */
  private scanProcessesUnix(): Promise<DiscoveredProcess[]> {
    return new Promise(resolve => {
      // Find PIDs of opencode processes
      // Match opencode at word boundary or after path separator
      // Matches: "opencode", "opencode --port 4096", "/usr/bin/opencode", "./opencode"
      // Does NOT match: "opencode-extra", "opencodehelper", "my-opencode-tool"
      const pgrep = child_process.spawn('pgrep', ['-f', '(^|/)opencode($|\\s)']);

      this.logger?.info('[scanProcessesUnix] Running pgrep for opencode processes');

      let stdout = '';

      pgrep.stdout.on('data', data => {
        stdout += data.toString();
      });
      pgrep.on('error', err => {
        this.logger?.warn(`[scanProcessesUnix] pgrep error: ${err.message}`);
        resolve([]);
      });
      pgrep.on('close', code => {
        if (code !== 0 && code !== 1) {
          // code 1 means no processes found (which is fine)
          this.logger?.warn(`[scanProcessesUnix] pgrep exited with code ${code}`);
        }

        const pids = stdout
          .trim()
          .split('\n')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n));

        this.logger?.info(`[scanProcessesUnix] Found PIDs: ${pids.join(', ') || 'none'}`);

        if (pids.length === 0) {
          resolve([]);
          return;
        }

        // For each PID, find its listening port via lsof
        const results: DiscoveredProcess[] = [];
        let pending = pids.length;

        for (const pid of pids) {
          const lsof = child_process.spawn('lsof', [
            '-w',
            '-iTCP',
            '-sTCP:LISTEN',
            '-P',
            '-n',
            '-a',
            '-p',
            String(pid),
          ]);
          let lsofOut = '';

          lsof.stdout.on('data', data => {
            lsofOut += data.toString();
          });
          lsof.on('error', () => {
            pending--;
            if (pending === 0) resolve(results);
          });
          lsof.on('close', () => {
            for (const line of lsofOut.split('\n')) {
              if (line.startsWith('COMMAND')) continue; // skip header
              const parts = line.trim().split(/\s+/);
              // lsof format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
              // NAME is like "127.0.0.1:4096" or "*:4096"
              const namePart = parts[8];
              if (namePart) {
                const portMatch = namePart.match(/:(\d+)$/);
                if (portMatch) {
                  const port = parseInt(portMatch[1], 10);
                  if (!isNaN(port)) {
                    results.push({ pid, port });
                  }
                }
              }
            }
            pending--;
            if (pending === 0) {
              this.logger?.info(
                `[scanProcessesUnix] Found processes with ports: ${JSON.stringify(results)}`
              );
              resolve(results);
            }
          });
        }
      });
    });
  }

  /**
   * Scan for OpenCode processes on Windows using native commands.
   * Runs tasklist + netstat in parallel (~200-300ms) instead of PowerShell (~1-2s).
   */
  private scanProcessesWindows(): Promise<DiscoveredProcess[]> {
    return new Promise(resolve => {
      this.logger?.info('[scanProcessesWindows] Running tasklist and netstat');

      let tasklistOut = '';
      let netstatOut = '';
      let completed = 0;
      let errored = 0;

      const checkComplete = (): void => {
        completed++;
        if (completed < 2) return;

        if (errored >= 2) {
          this.logger?.warn('[scanProcessesWindows] Both commands errored');
          resolve([]);
          return;
        }

        // Parse tasklist CSV — find PIDs of opencode processes
        // CSV format: "ImageName","PID","SessionName","Session#","MemUsage"
        const opencodePids = new Set<number>();
        for (const line of tasklistOut.split('\n')) {
          if (line.toLowerCase().includes('opencode')) {
            const csvParts = line.split('","');
            if (csvParts.length >= 2) {
              const pid = parseInt(csvParts[1], 10);
              if (!isNaN(pid)) {
                opencodePids.add(pid);
              }
            }
          }
        }

        this.logger?.info(
          `[scanProcessesWindows] Found PIDs: ${[...opencodePids].join(', ') || 'none'}`
        );

        if (opencodePids.size === 0) {
          resolve([]);
          return;
        }

        // Parse netstat — find listening ports for those PIDs
        // Format: TCP    127.0.0.1:4096    0.0.0.0:0    LISTENING    12345
        const results: DiscoveredProcess[] = [];
        for (const line of netstatOut.split('\n')) {
          if (!line.includes('LISTENING')) continue;
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (opencodePids.has(pid)) {
            const addrPart = parts[1];
            const portMatch = addrPart?.match(/:(\d+)$/);
            if (portMatch) {
              results.push({ pid, port: parseInt(portMatch[1], 10) });
            }
          }
        }

        this.logger?.info(
          `[scanProcessesWindows] Found processes with ports: ${JSON.stringify(results)}`
        );
        resolve(results);
      };

      // Run both commands in parallel for speed
      const tasklist = child_process.spawn('cmd', ['/c', 'tasklist /FO CSV /NH']);
      tasklist.stdout.on('data', d => {
        tasklistOut += d.toString();
      });
      tasklist.on('error', () => {
        errored++;
        checkComplete();
      });
      tasklist.on('close', () => checkComplete());

      const netstat = child_process.spawn('cmd', ['/c', 'netstat -ano -p TCP']);
      netstat.stdout.on('data', d => {
        netstatOut += d.toString();
      });
      netstat.on('error', () => {
        errored++;
        checkComplete();
      });
      netstat.on('close', () => checkComplete());
    });
  }

  /**
   * Check if a specific port is available for use
   * @param port - Port number to check
   * @returns Promise<boolean> - true if port is available, false if in use
   */
  public checkPortAvailable(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const socket = new net.Socket();

      socket.setTimeout(1000);

      socket.on('connect', () => {
        // Port is in use - someone is listening
        socket.destroy();
        resolve(false);
      });

      socket.on('timeout', () => {
        // Timeout means port is likely available (nothing responding)
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (err: Error & { code?: string }) => {
        // Connection refused means port is available
        // EADDRINUSE would mean port is in use (but connect event should catch this)
        if (err.code === 'ECONNREFUSED') {
          socket.destroy();
          resolve(true);
        } else {
          // Other errors - assume port is available for safety
          socket.destroy();
          resolve(true);
        }
      });

      socket.connect(port, 'localhost');
    });
  }

  /**
   * Find the first available port in a given range
   * @param startPort - Start of port range (default: 4096)
   * @param endPort - End of port range (default: 5096)
   * @returns Promise<number> - First available port found
   * @throws Error if no ports are available in the range
   */
  public async findAvailablePort(
    startPort: number = 4096,
    endPort: number = 5096
  ): Promise<number> {
    for (let port = startPort; port <= endPort; port++) {
      const isAvailable = await this.checkPortAvailable(port);
      if (isAvailable) {
        return port;
      }
    }

    throw new Error(
      `No available ports in range ${startPort}-${endPort}. Please close unused sessions and retry.`
    );
  }

  /**
   * Spawn an OpenCode instance in a VSCode Integrated Terminal
   * @param port - Port number to use for the instance
   * @returns Promise<void>
   */
  public async spawnInTerminal(port: number): Promise<void> {
    const workspacePath = this.getWorkspacePath();
    const workspaceHash = WorkspaceUtils.getWorkspaceHash(workspacePath);
    const terminalName = `OpenCode: ${workspaceHash}`;
    const binaryPath = this.configManager.getBinaryPath() || 'opencode';
    // Don't use getCommandWithExtension here — the integrated terminal shell
    // resolves binaries via PATH naturally (handles .exe, aliases, etc.)
    const fullCommand = `${binaryPath} --port ${port}`;

    // Check for existing terminal with the same name
    const existingTerminal = vscode.window.terminals.find(t => t.name === terminalName);

    if (existingTerminal) {
      // Send Ctrl+C to stop any previous process
      // On Windows, multiple Ctrl+C or a small delay might be needed
      existingTerminal.sendText('\x03');

      // Small delay to ensure shell processes the interrupt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send the new command
      existingTerminal.sendText(fullCommand);
    } else {
      // Create a new terminal, make it visible and focused
      const terminal = vscode.window.createTerminal({ name: terminalName });
      terminal.show(false);

      // Wait for shell to initialize before sending the command
      await new Promise(resolve => setTimeout(resolve, 500));

      terminal.sendText(fullCommand);
    }
  }

  /**
   * Get the workspace path for the current context
   * @returns Workspace path string
   */
  private getWorkspacePath(): string {
    return WorkspaceUtils.getWorkspacePath();
  }
}

export default InstanceManager;
