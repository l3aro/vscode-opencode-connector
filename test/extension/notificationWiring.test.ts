import { activate, deactivate } from '../../src/extension';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const extensionState = {
  connectionService: {
    onDidChangeConnectionState: vi.fn(),
    discoverAndConnect: vi.fn(async () => false),
    getPort: vi.fn(() => undefined),
    getClient: vi.fn(() => undefined),
  },
  configManager: {
    getNotificationsEnabled: vi.fn(() => true),
    setNotificationsEnabled: vi.fn(async () => undefined),
  },
  outputChannel: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    dispose: vi.fn(),
  },
  connectionHandler: undefined as
    | ((event: { connected: boolean; port?: number }) => void)
    | undefined,
  configurationHandler: undefined as
    | ((event: { affectsConfiguration(section: string): boolean }) => void)
    | undefined,
  eventCallbacks: undefined as
    | {
        onEvent(event: { type: string; properties: Record<string, unknown> }): void;
        onDisconnect(error?: Error): void;
      }
    | undefined,
  eventClientStart: vi.fn(),
  eventClientStop: vi.fn(),
};

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => extensionState.outputChannel),
    showInformationMessage: vi.fn(async () => undefined),
  },
  workspace: {
    onDidChangeConfiguration: vi.fn(handler => {
      extensionState.configurationHandler = handler;
      return { dispose: vi.fn() };
    }),
    onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
  },
  languages: {
    registerCodeActionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  },
  env: {
    remoteName: undefined,
  },
  CodeActionKind: {
    QuickFix: {},
  },
}));

vi.mock('../../src/notifications/notificationService', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/notifications/notificationService')
  >('../../src/notifications/notificationService');

  return {
    ...actual,
    NotificationService: vi.fn((configManager, outputChannel) => {
      return new actual.NotificationService(configManager, outputChannel, {
        createEventClient: callbacks => {
          extensionState.eventCallbacks = callbacks;

          return {
            start: extensionState.eventClientStart,
            stop: extensionState.eventClientStop,
          };
        },
      });
    }),
  };
});

vi.mock('../../src/connection/connectionService', () => ({
  ConnectionService: vi.fn(() => ({
    ...extensionState.connectionService,
    onDidChangeConnectionState: vi.fn(handler => {
      extensionState.connectionHandler = handler;
      return { dispose: vi.fn() };
    }),
  })),
  isRemoteSession: vi.fn(() => false),
}));

vi.mock('../../src/config', () => ({
  ConfigManager: {
    getInstance: vi.fn(() => extensionState.configManager),
  },
}));

vi.mock('../../src/instance/instanceManager', () => ({
  InstanceManager: {
    getInstance: vi.fn(() => ({
      setLogger: vi.fn(),
    })),
    resetInstance: vi.fn(),
  },
}));

vi.mock('../../src/statusBar', () => ({
  StatusBarManager: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn(),
      updateConnectionStatus: vi.fn(),
    })),
  },
}));

vi.mock('../../src/providers/codeActionProvider', () => ({
  OpenCodeCodeActionProvider: vi.fn(),
}));

vi.mock('../../src/instance/defaultInstanceManager', () => ({
  DefaultInstanceManager: {
    getInstance: vi.fn(() => ({
      clearDefault: vi.fn(),
    })),
  },
}));

vi.mock('../../src/commands', () => ({
  handleAddMultipleFiles: vi.fn(),
  handleAddSelectionToPrompt: vi.fn(),
  handleAddToPrompt: vi.fn(),
  handleCheckInstance: vi.fn(),
  handleOpenInOpencode: vi.fn(),
  handleOpenNewInstance: vi.fn(),
  handleSelectDefaultInstance: vi.fn(),
  handleSendDebugContext: vi.fn(),
  handleSendPath: vi.fn(),
  handleSendRelativePath: vi.fn(),
  handleShowWorkspace: vi.fn(),
  handleToggleNotifications: vi.fn(),
  showStatusBarMenu: vi.fn(),
}));

describe('notification wiring in extension', () => {
  const createSessionStatusEvent = (status: string) => ({
    type: 'session.status',
    properties: {
      sessionID: 'session-1',
      status: { type: status },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    extensionState.connectionHandler = undefined;
    extensionState.configurationHandler = undefined;
    extensionState.eventCallbacks = undefined;
    extensionState.eventClientStart.mockReset();
    extensionState.eventClientStop.mockReset();
    extensionState.configManager.getNotificationsEnabled.mockReturnValue(true);
  });

  it('enables notification behavior only after configuration is turned on', async () => {
    const { window } = await import('vscode');
    extensionState.configManager.getNotificationsEnabled.mockReturnValue(false);

    activate({} as never, { subscriptions: [] } as never);
    extensionState.connectionHandler?.({ connected: true, port: 4300 });
    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('working'));
    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(window.showInformationMessage).not.toHaveBeenCalled();

    extensionState.configManager.getNotificationsEnabled.mockReturnValue(true);
    extensionState.configurationHandler?.({
      affectsConfiguration: section =>
        section === 'opencode' || section === 'opencode.notificationsEnabled',
    });
    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('working'));
    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(extensionState.eventClientStop).toHaveBeenCalledTimes(1);
    expect(extensionState.eventClientStart).toHaveBeenCalledOnce();
    expect(extensionState.eventClientStart).toHaveBeenCalledWith(4300);
    expect(window.showInformationMessage).toHaveBeenCalledWith('OpenCode task complete.');
  });

  it('follows runtime port changes and ignores stale activity from the previous active connection', async () => {
    const { window } = await import('vscode');

    activate({} as never, { subscriptions: [] } as never);

    extensionState.connectionHandler?.({ connected: true, port: 4300 });
    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('working'));
    extensionState.connectionHandler?.({ connected: true, port: 4301 });
    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(window.showInformationMessage).not.toHaveBeenCalled();

    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('working'));
    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(extensionState.eventClientStart).toHaveBeenNthCalledWith(1, 4300);
    expect(extensionState.eventClientStart).toHaveBeenNthCalledWith(2, 4301);
    expect(window.showInformationMessage).toHaveBeenCalledWith('OpenCode task complete.');
  });

  it('reloads notifications when the notificationsEnabled setting changes', () => {
    activate({} as never, { subscriptions: [] } as never);
    extensionState.connectionHandler?.({ connected: true, port: 4300 });

    extensionState.configurationHandler?.({
      affectsConfiguration: section =>
        section === 'opencode' || section === 'opencode.notificationsEnabled',
    });

    expect(extensionState.eventClientStop).toHaveBeenCalledTimes(1);
  });

  it('does not reset the notification stream for unrelated opencode configuration changes', async () => {
    const { window } = await import('vscode');

    activate({} as never, { subscriptions: [] } as never);
    extensionState.connectionHandler?.({ connected: true, port: 4300 });
    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('working'));

    // An unrelated setting (e.g. opencode.port) still logs but must not reload
    // the notification listener, which would reset in-flight stream state.
    extensionState.configurationHandler?.({
      affectsConfiguration: section => section === 'opencode' || section === 'opencode.port',
    });

    expect(extensionState.eventClientStop).not.toHaveBeenCalled();

    extensionState.eventCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(window.showInformationMessage).toHaveBeenCalledWith('OpenCode task complete.');
  });

  it('syncs notifications with connection-state changes and disposes on deactivate', () => {
    activate({} as never, { subscriptions: [] } as never);

    extensionState.connectionHandler?.({ connected: true, port: 4300 });
    extensionState.connectionHandler?.({ connected: false });
    deactivate();

    expect(extensionState.eventClientStart).toHaveBeenNthCalledWith(1, 4300);
    expect(extensionState.eventClientStop).toHaveBeenCalledTimes(2);
  });
});
