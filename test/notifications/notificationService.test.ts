import { NotificationService } from '../../src/notifications/notificationService';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(async () => undefined),
  },
}));

describe('NotificationService', () => {
  let showInformationMessage: ReturnType<typeof vi.fn>;
  let outputChannel: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let createEventClient: ReturnType<typeof vi.fn>;
  let clientCallbacks:
    | {
        onEvent(event: { type: string; properties: Record<string, unknown> }): void;
        onDisconnect(error?: Error): void;
      }
    | undefined;
  let start: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;
  let getNotificationsEnabled: ReturnType<typeof vi.fn>;

  const createSessionStatusEvent = (status: string) => ({
    type: 'session.status',
    properties: {
      sessionID: 'session-1',
      status: { type: status },
    },
  });

  const createStatusEvent = (status: string, sessionID: string) => ({
    type: 'session.status',
    properties: {
      sessionID,
      status: { type: status },
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T13:00:00Z'));
    ({
      window: { showInformationMessage },
    } = await import('vscode'));
    outputChannel = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    start = vi.fn();
    stop = vi.fn();
    clientCallbacks = undefined;
    createEventClient = vi.fn(callbacks => {
      clientCallbacks = callbacks;
      return {
        start,
        stop,
      };
    });
    getNotificationsEnabled = vi.fn(() => true);
  });

  it('notifies once for a non-idle to idle transition and suppresses repeated idle events', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4100);
    clientCallbacks?.onEvent(createSessionStatusEvent('working'));
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(start).toHaveBeenCalledWith(4100);
    expect(showInformationMessage).toHaveBeenCalledTimes(1);
  });

  it('starts listening and notifies when enabled by configuration', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4101);
    clientCallbacks?.onEvent(createSessionStatusEvent('working'));
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(4101);
    expect(outputChannel.info).toHaveBeenCalledWith(
      expect.stringContaining('Starting OpenCode notification listener on port 4101')
    );
    expect(outputChannel.info).toHaveBeenCalledWith(
      expect.stringContaining('Observed session.status=working')
    );
    expect(outputChannel.info).toHaveBeenCalledWith(
      expect.stringContaining('Observed session.status=idle')
    );
    expect(outputChannel.info).toHaveBeenCalledWith(
      expect.stringContaining('Notification decision=notify')
    );
    expect(showInformationMessage).toHaveBeenCalledWith('OpenCode task complete.');
  });

  it('does not notify when idle arrives without prior work', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4100);
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(outputChannel.info).toHaveBeenCalledWith(
      expect.stringContaining('Notification decision=ignore')
    );
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('logs listener stop and ignored non-session events without changing behavior', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4202);
    clientCallbacks?.onEvent({
      type: 'session.created',
      properties: {
        sessionID: 'session-1',
      },
    });
    service.syncConnection(undefined);

    expect(outputChannel.info).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring non-session.status event type=session.created')
    );
    expect(outputChannel.info).toHaveBeenCalledWith(
      expect.stringContaining('Stopping OpenCode notification listener on port 4202')
    );
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('does not start listening when disabled by configuration', async () => {
    getNotificationsEnabled.mockReturnValue(false);

    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4200);

    expect(start).not.toHaveBeenCalled();
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('stops listening when disabled and resumes on the active port when re-enabled', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4200);
    getNotificationsEnabled.mockReturnValue(false);
    service.reloadSettings();
    getNotificationsEnabled.mockReturnValue(true);
    service.reloadSettings();

    expect(stop).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenNthCalledWith(1, 4200);
    expect(start).toHaveBeenNthCalledWith(2, 4200);
  });

  it('stops listening when disabled and ignores stale idle events until re-enabled', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4201);
    clientCallbacks?.onEvent(createSessionStatusEvent('working'));

    getNotificationsEnabled.mockReturnValue(false);
    service.reloadSettings();
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(showInformationMessage).not.toHaveBeenCalled();

    getNotificationsEnabled.mockReturnValue(true);
    service.reloadSettings();
    clientCallbacks?.onEvent(createSessionStatusEvent('working'));
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(start).toHaveBeenNthCalledWith(1, 4201);
    expect(start).toHaveBeenNthCalledWith(2, 4201);
    expect(showInformationMessage).toHaveBeenCalledTimes(1);
  });

  it('switches the listener to the new active runtime port', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4300);
    service.syncConnection(4301);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenNthCalledWith(1, 4300);
    expect(start).toHaveBeenNthCalledWith(2, 4301);
  });

  it('ignores activity from a previous active port after switching to a new runtime port', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4300);
    clientCallbacks?.onEvent(createSessionStatusEvent('working'));

    service.syncConnection(4301);
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(showInformationMessage).not.toHaveBeenCalled();

    clientCallbacks?.onEvent(createSessionStatusEvent('working'));
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));

    expect(showInformationMessage).toHaveBeenCalledTimes(1);
  });

  it('reconnects after a disconnect while notifications remain enabled', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
        reconnectDelayMs: 500,
      }
    );

    service.syncConnection(4400);
    clientCallbacks?.onDisconnect(new Error('socket dropped'));
    await vi.advanceTimersByTimeAsync(500);

    expect(start).toHaveBeenNthCalledWith(1, 4400);
    expect(start).toHaveBeenNthCalledWith(2, 4400);
  });

  it('backs off reconnect delays across consecutive disconnects', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
        reconnectDelayMs: 100,
        maxReconnectDelayMs: 400,
      }
    );

    service.syncConnection(4500);
    clientCallbacks?.onDisconnect(new Error('first drop'));
    await vi.advanceTimersByTimeAsync(100);
    clientCallbacks?.onDisconnect(new Error('second drop'));
    await vi.advanceTimersByTimeAsync(199);

    expect(start).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);

    expect(start).toHaveBeenCalledTimes(3);
    expect(start).toHaveBeenNthCalledWith(3, 4500);
  });

  it('tracks busy-to-idle transitions per session so concurrent sessions each notify', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
        cooldownMs: 0,
      }
    );

    service.syncConnection(4700);

    clientCallbacks?.onEvent(createStatusEvent('busy', 'session-A'));
    clientCallbacks?.onEvent(createStatusEvent('busy', 'session-B'));

    // Session A finishes first and must notify for its own transition.
    clientCallbacks?.onEvent(createStatusEvent('idle', 'session-A'));
    expect(showInformationMessage).toHaveBeenCalledTimes(1);

    // Session B's real completion must not be swallowed by A's notification.
    clientCallbacks?.onEvent(createStatusEvent('idle', 'session-B'));
    expect(showInformationMessage).toHaveBeenCalledTimes(2);
  });

  it('ignores idle for a session that was never active while active sessions still notify', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
        cooldownMs: 0,
      }
    );

    service.syncConnection(4701);

    clientCallbacks?.onEvent(createStatusEvent('busy', 'session-A'));
    clientCallbacks?.onEvent(createStatusEvent('idle', 'session-B'));

    expect(showInformationMessage).not.toHaveBeenCalled();

    clientCallbacks?.onEvent(createStatusEvent('idle', 'session-A'));

    expect(showInformationMessage).toHaveBeenCalledTimes(1);
  });

  it('resets reconnect backoff to the base delay after a valid event is received', async () => {
    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
        reconnectDelayMs: 100,
        maxReconnectDelayMs: 400,
      }
    );

    service.syncConnection(4800);

    clientCallbacks?.onDisconnect(new Error('drop 1'));
    await vi.advanceTimersByTimeAsync(100);

    clientCallbacks?.onDisconnect(new Error('drop 2'));
    await vi.advanceTimersByTimeAsync(200);

    expect(start).toHaveBeenCalledTimes(3);

    // A valid domain event proves the stream recovered; backoff resets to base.
    clientCallbacks?.onEvent(createSessionStatusEvent('working'));

    clientCallbacks?.onDisconnect(new Error('drop 3'));
    await vi.advanceTimersByTimeAsync(99);
    expect(start).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(start).toHaveBeenCalledTimes(4);
    expect(start).toHaveBeenNthCalledWith(4, 4800);
  });

  it('logs and swallows showInformationMessage failures', async () => {
    showInformationMessage.mockRejectedValueOnce(new Error('ui failed'));

    const service = new NotificationService(
      {
        getNotificationsEnabled,
      },
      outputChannel,
      {
        createEventClient,
      }
    );

    service.syncConnection(4600);
    clientCallbacks?.onEvent(createSessionStatusEvent('working'));
    clientCallbacks?.onEvent(createSessionStatusEvent('idle'));
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(outputChannel.error).toHaveBeenCalledWith(
      'Failed to show OpenCode completion notification: ui failed'
    );
  });
});
