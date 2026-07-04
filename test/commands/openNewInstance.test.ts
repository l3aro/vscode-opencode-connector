import { openOpencodeForWorkspace } from '../../src/commands/openNewInstance';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    withProgress: vi.fn(async (_options: unknown, task: (progress: unknown) => Promise<void>) =>
      task({ report: vi.fn() })
    ),
    setStatusBarMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  ProgressLocation: { Notification: 15 },
}));

function createDeps() {
  const connectionService = {
    findPortForWorkspace: vi.fn(async () => undefined as number | undefined),
    connectToKnownPort: vi.fn(async () => true),
  };
  const instanceManager = {
    getTerminalForPort: vi.fn(() => undefined as { show: (b: boolean) => void } | undefined),
    spawnInTerminal: vi.fn(async () => undefined),
    findAvailablePort: vi.fn(async () => 5005),
  };
  const outputChannel = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { connectionService, instanceManager, outputChannel };
}

describe('openOpencodeForWorkspace notification/connection wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches to a freshly spawned instance on its known port', async () => {
    const { connectionService, instanceManager, outputChannel } = createDeps();
    connectionService.findPortForWorkspace.mockResolvedValueOnce(undefined);
    instanceManager.findAvailablePort.mockResolvedValueOnce(5005);

    await openOpencodeForWorkspace(
      '/workspace/app',
      connectionService as never,
      instanceManager as never,
      outputChannel as never
    );

    expect(instanceManager.spawnInTerminal).toHaveBeenCalledWith(5005, {
      cwd: '/workspace/app',
      asEditor: true,
    });
    expect(connectionService.connectToKnownPort).toHaveBeenCalledWith(5005);
  });

  it('attaches to an existing instance with a tracked terminal (no re-spawn)', async () => {
    const { connectionService, instanceManager, outputChannel } = createDeps();
    connectionService.findPortForWorkspace.mockResolvedValueOnce(4096);
    const show = vi.fn();
    instanceManager.getTerminalForPort.mockReturnValueOnce({ show });

    await openOpencodeForWorkspace(
      '/workspace/app',
      connectionService as never,
      instanceManager as never,
      outputChannel as never
    );

    expect(show).toHaveBeenCalledWith(false);
    expect(instanceManager.spawnInTerminal).not.toHaveBeenCalled();
    expect(connectionService.connectToKnownPort).toHaveBeenCalledWith(4096);
  });

  it('attaches to an existing port without a tracked terminal without re-spawning', async () => {
    const { connectionService, instanceManager, outputChannel } = createDeps();
    connectionService.findPortForWorkspace.mockResolvedValueOnce(4096);
    instanceManager.getTerminalForPort.mockReturnValueOnce(undefined);

    await openOpencodeForWorkspace(
      '/workspace/app',
      connectionService as never,
      instanceManager as never,
      outputChannel as never
    );

    expect(instanceManager.spawnInTerminal).not.toHaveBeenCalled();
    expect(connectionService.connectToKnownPort).toHaveBeenCalledWith(4096);
  });
});
