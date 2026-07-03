import { ConnectionService } from '../../src/connection/connectionService';

import { beforeEach, describe, expect, it, vi } from 'vitest';

type ConnectionEvent = { connected: boolean; port?: number };

function getConnectionTestState(): {
  listeners: Set<(event: ConnectionEvent) => void>;
  defaultPort?: number;
  defaultIsValid?: boolean;
  clearDefault: ReturnType<typeof vi.fn>;
  clientBehaviors: Map<number, { testConnection?: boolean; getPath?: { directory: string } }>;
  createdClients: Array<{ port: number; destroyed: boolean }>;
} {
  const globalState = globalThis as unknown as {
    __connectionTestState?: {
      listeners: Set<(event: ConnectionEvent) => void>;
      defaultPort?: number;
      defaultIsValid?: boolean;
      clearDefault: ReturnType<typeof vi.fn>;
      clientBehaviors: Map<number, { testConnection?: boolean; getPath?: { directory: string } }>;
      createdClients: Array<{ port: number; destroyed: boolean }>;
    };
  };

  if (!globalState.__connectionTestState) {
    globalState.__connectionTestState = {
      listeners: new Set<(event: ConnectionEvent) => void>(),
      defaultPort: undefined,
      defaultIsValid: false,
      clearDefault: vi.fn(),
      clientBehaviors: new Map<
        number,
        { testConnection?: boolean; getPath?: { directory: string } }
      >(),
      createdClients: [],
    };
  }

  return globalState.__connectionTestState;
}

vi.mock('vscode', () => {
  const state = getConnectionTestState();

  return {
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace/app' } }],
    },
    env: {
      remoteName: undefined,
    },
    EventEmitter: vi.fn(() => ({
      event: (listener: (event: ConnectionEvent) => void) => {
        state.listeners.add(listener);
        return {
          dispose: () => state.listeners.delete(listener),
        };
      },
      fire: (event: ConnectionEvent) => {
        for (const listener of state.listeners) {
          listener(event);
        }
      },
      dispose: vi.fn(),
    })),
  };
});

vi.mock('../../src/instance/defaultInstanceManager', () => {
  const state = getConnectionTestState();

  state.clearDefault.mockImplementation(() => {
    state.defaultPort = undefined;
  });

  return {
    DefaultInstanceManager: {
      getInstance: () => ({
        getDefaultPort: () => state.defaultPort,
        isValid: vi.fn(async () => state.defaultIsValid ?? false),
        clearDefault: state.clearDefault,
      }),
    },
  };
});

vi.mock('../../src/api/openCodeClient', () => {
  const state = getConnectionTestState();

  return {
    OpenCodeClient: class MockOpenCodeClient {
      public readonly port: number;
      public destroyed = false;

      constructor(config?: { port?: number }) {
        this.port = config?.port ?? 4096;
        state.createdClients?.push(this);
      }

      public async getPath(): Promise<{ directory: string }> {
        return (
          state.clientBehaviors?.get(this.port)?.getPath ?? { directory: `/runtime/${this.port}` }
        );
      }

      public async testConnection(): Promise<boolean> {
        return state.clientBehaviors?.get(this.port)?.testConnection ?? false;
      }

      public getPort(): number {
        return this.port;
      }

      public destroy(): void {
        this.destroyed = true;
      }
    },
  };
});

describe('ConnectionService', () => {
  const mockState = getConnectionTestState();

  const outputChannel = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const configManager = {
    getPort: vi.fn(() => 4096),
  };

  const instanceManager = {
    scanForProcesses: vi.fn(async () => []),
    findAvailablePort: vi.fn(async () => 5001),
    spawnInTerminal: vi.fn(async () => undefined),
    getRunningInstance: vi.fn(async () => ({ isRunning: false })),
    spawnInstance: vi.fn(async () => ({ success: true })),
    focusTerminal: vi.fn(async () => true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.listeners.clear();
    mockState.defaultPort = undefined;
    mockState.defaultIsValid = false;
    mockState.clientBehaviors.clear();
    mockState.createdClients.length = 0;
  });

  it('emits a connection event when discoverAndConnect switches to a new active port', async () => {
    instanceManager.scanForProcesses.mockResolvedValueOnce([{ pid: 1, port: 4100 }]);
    mockState.clientBehaviors.set(4100, {
      getPath: { directory: '/workspace/app' },
    });

    const service = new ConnectionService(
      configManager as never,
      instanceManager as never,
      outputChannel
    );
    const listener = vi.fn();
    service.onDidChangeConnectionState(listener);

    await service.discoverAndConnect(1, 0);

    expect(listener).toHaveBeenCalledWith({ connected: true, port: 4100 });
    expect(service.getPort()).toBe(4100);
  });

  it('emits a disconnect event before reconnecting when the active port no longer matches the workspace', async () => {
    mockState.defaultPort = 4096;
    mockState.defaultIsValid = true;
    mockState.clientBehaviors.set(4096, {
      getPath: { directory: '/workspace/app' },
    });
    mockState.clientBehaviors.set(4200, {
      getPath: { directory: '/workspace/app' },
    });
    instanceManager.scanForProcesses.mockResolvedValueOnce([{ pid: 2, port: 4200 }]);

    const service = new ConnectionService(
      configManager as never,
      instanceManager as never,
      outputChannel
    );
    const listener = vi.fn();
    service.onDidChangeConnectionState(listener);

    await service.ensureConnected();

    mockState.clientBehaviors.set(4096, {
      testConnection: true,
      getPath: { directory: '/other/workspace' },
    });

    await service.ensureConnected();

    expect(listener.mock.calls).toContainEqual([{ connected: false }]);
    expect(listener.mock.calls).toContainEqual([{ connected: true, port: 4200 }]);
  });

  it('attaches to a known port and emits the connected state without scanning processes', async () => {
    const service = new ConnectionService(
      configManager as never,
      instanceManager as never,
      outputChannel
    );
    const listener = vi.fn();
    service.onDidChangeConnectionState(listener);

    const attached = await service.connectToKnownPort(4300);

    expect(attached).toBe(true);
    expect(service.getPort()).toBe(4300);
    expect(listener).toHaveBeenCalledWith({ connected: true, port: 4300 });
    // connectToKnownPort must not rely on discovery/auto-spawn.
    expect(instanceManager.scanForProcesses).not.toHaveBeenCalled();
    expect(instanceManager.findAvailablePort).not.toHaveBeenCalled();
  });

  it('re-emits the connected state when already attached to the same known port', async () => {
    const service = new ConnectionService(
      configManager as never,
      instanceManager as never,
      outputChannel
    );
    await service.connectToKnownPort(4300);

    const listener = vi.fn();
    service.onDidChangeConnectionState(listener);
    const attached = await service.connectToKnownPort(4300);

    expect(attached).toBe(true);
    expect(service.getPort()).toBe(4300);
    expect(listener).toHaveBeenCalledWith({ connected: true, port: 4300 });
  });

  it('emits the connected state exactly once when falling back to the configured port', async () => {
    // Discovery finds a non-matching process (breaks quickly without waits),
    // auto-spawn fails, then the configured-port fallback connects.
    instanceManager.scanForProcesses.mockResolvedValueOnce([{ pid: 9, port: 9999 }]);
    instanceManager.findAvailablePort.mockRejectedValueOnce(new Error('no port'));
    mockState.clientBehaviors.set(4096, { testConnection: true });

    const service = new ConnectionService(
      configManager as never,
      instanceManager as never,
      outputChannel
    );
    const listener = vi.fn();
    service.onDidChangeConnectionState(listener);

    const connected = await service.ensureConnected();

    expect(connected).toBe(true);
    expect(service.getPort()).toBe(4096);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ connected: true, port: 4096 });
  });
});
