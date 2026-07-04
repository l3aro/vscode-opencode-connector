import { OpenCodeEventClient, OpenCodeEventClientCallbacks } from '../api/openCodeEventClient';
import { SessionStatusEvent } from '../types';

import * as vscode from 'vscode';

interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface NotificationConfig {
  getNotificationsEnabled(): boolean;
}

interface NotificationServiceDependencies {
  createEventClient?: (
    callbacks: OpenCodeEventClientCallbacks
  ) => Pick<OpenCodeEventClient, 'start' | 'stop'>;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  cooldownMs?: number;
  now?: () => number;
}

const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 8000;
const DEFAULT_IDLE_COOLDOWN_MS = 1500;

/**
 * Manages OpenCode task completion notifications for the active runtime port.
 */
export class NotificationService {
  private readonly createEventClient: NotificationServiceDependencies['createEventClient'];
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly eventClient: Pick<OpenCodeEventClient, 'start' | 'stop'>;
  private activePort: number | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectAttempt = 0;
  private readonly activeSessions = new Set<string>();
  private lastNotificationAt = 0;

  /**
   * Create a notification service.
   * @param config - Extension configuration access
   * @param outputChannel - User-visible log channel
   * @param dependencies - Test seams and timing overrides
   */
  constructor(
    private readonly config: NotificationConfig,
    private readonly outputChannel: Logger | undefined,
    dependencies: NotificationServiceDependencies = {}
  ) {
    this.createEventClient =
      dependencies.createEventClient ??
      (callbacks => new OpenCodeEventClient(callbacks, { logger: this.outputChannel }));
    this.reconnectDelayMs = dependencies.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.maxReconnectDelayMs = dependencies.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    this.cooldownMs = dependencies.cooldownMs ?? DEFAULT_IDLE_COOLDOWN_MS;
    this.now = dependencies.now ?? (() => Date.now());
    this.eventClient = this.createEventClient({
      onEvent: event => this.handleEvent(event),
      onDisconnect: error => this.handleDisconnect(error),
    });
  }

  /**
   * Sync notification listening to the current active runtime port.
   * @param port - Active runtime port, or undefined when disconnected
   */
  public syncConnection(port?: number): void {
    if (this.activePort === port) {
      return;
    }

    const previousPort = this.activePort;
    this.activePort = port;
    if (previousPort !== undefined) {
      this.stopListening(previousPort);
    } else {
      this.resetListenerState();
    }

    if (port !== undefined && this.config.getNotificationsEnabled()) {
      this.startListening(port);
    }
  }

  /**
   * Reload notification behavior after a settings change.
   */
  public reloadSettings(): void {
    if (this.activePort !== undefined) {
      this.stopListening(this.activePort);
    } else {
      this.resetListenerState();
    }

    if (!this.config.getNotificationsEnabled()) {
      this.outputChannel?.info('OpenCode notifications disabled; listener remains stopped');
      return;
    }

    if (this.activePort !== undefined) {
      this.startListening(this.activePort);
    }
  }

  /**
   * Dispose notification resources.
   */
  public dispose(): void {
    if (this.activePort !== undefined) {
      this.stopListening(this.activePort);
    } else {
      this.resetListenerState();
    }
  }

  private handleEvent(event: { type: string; properties: Record<string, unknown> }): void {
    if (!this.config.getNotificationsEnabled()) {
      this.outputChannel?.info(
        `Ignoring notification event while disabled: ${JSON.stringify({ type: event.type, properties: event.properties })}`
      );
      return;
    }

    if (event.type !== 'session.status') {
      this.outputChannel?.info(`Ignoring non-session.status event type=${event.type}`);
      return;
    }

    // A valid domain event proves the stream recovered, so reset the reconnect
    // backoff to the base delay for any future disconnect.
    this.reconnectAttempt = 0;

    const sessionStatusEvent = event as SessionStatusEvent;
    const status = sessionStatusEvent.properties.status?.type;
    const sessionID = sessionStatusEvent.properties.sessionID;
    const sessionKey = sessionID ?? '<unknown>';

    this.outputChannel?.info(
      `Observed session.status=${status ?? 'unknown'} on port ${this.activePort ?? 'unknown'} for session ${sessionID}`
    );

    if (!status || status === 'idle') {
      const sessionWasActive = this.activeSessions.has(sessionKey);
      if (status === 'idle' && sessionWasActive && this.isOutsideCooldown()) {
        this.outputChannel?.info(
          `Notification decision=notify reason=active-to-idle transition session=${sessionID}`
        );
        this.lastNotificationAt = this.now();
        this.activeSessions.delete(sessionKey);
        void this.showCompletionNotification();
      } else {
        this.outputChannel?.info(
          `Notification decision=ignore reason=${
            !status
              ? 'missing-status'
              : !sessionWasActive
                ? 'idle-without-prior-active'
                : 'cooldown-active'
          } session=${sessionID}`
        );
      }
      return;
    }

    this.outputChannel?.info(
      `Notification decision=ignore reason=non-idle-status:${status} session=${sessionID}`
    );
    this.activeSessions.add(sessionKey);
  }

  private handleDisconnect(error?: Error): void {
    if (error) {
      this.outputChannel?.warn(`Notification stream disconnected: ${error.message}`);
    }

    if (!this.config.getNotificationsEnabled() || this.activePort === undefined) {
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.reconnectDelayMs * Math.pow(2, this.reconnectAttempt - 1),
      this.maxReconnectDelayMs
    );
    this.outputChannel?.info(
      `Scheduling OpenCode notification listener reconnect on port ${this.activePort} in ${delay}ms`
    );
    this.reconnectTimer = setTimeout(() => {
      if (!this.config.getNotificationsEnabled() || this.activePort === undefined) {
        return;
      }

      this.outputChannel?.info(
        `Starting OpenCode notification listener on port ${this.activePort}`
      );
      this.eventClient.start(this.activePort);
    }, delay);
  }

  private resetStreamState(): void {
    this.activeSessions.clear();
    this.lastNotificationAt = 0;
  }

  private resetListenerState(): void {
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    this.resetStreamState();
  }

  private stopListening(port: number): void {
    this.resetListenerState();
    this.outputChannel?.info(`Stopping OpenCode notification listener on port ${port}`);
    this.eventClient.stop();
  }

  private startListening(port: number): void {
    this.outputChannel?.info(`Starting OpenCode notification listener on port ${port}`);
    this.eventClient.start(port);
  }

  private async showCompletionNotification(): Promise<void> {
    try {
      await vscode.window.showInformationMessage('OpenCode task complete.');
    } catch (err) {
      this.outputChannel?.error(
        `Failed to show OpenCode completion notification: ${(err as Error).message}`
      );
    }
  }

  private isOutsideCooldown(): boolean {
    return this.lastNotificationAt === 0 || this.now() - this.lastNotificationAt >= this.cooldownMs;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}

export default NotificationService;
