import { SSEEvent, SessionStatusEvent } from '../types';
import { getEventUrl } from './openCodeClient';

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

/**
 * Callbacks emitted by the event-stream client.
 */
export interface OpenCodeEventClientCallbacks {
  /** Handles parsed SSE events from OpenCode. */
  onEvent(event: SSEEvent | SessionStatusEvent): void;
  /** Handles unexpected stream termination. */
  onDisconnect(error?: Error): void;
}

/**
 * Raw stream handlers provided to the low-level transport.
 */
export interface OpenCodeEventStreamHandlers {
  /** Handles raw text chunks from the event stream. */
  onChunk(chunk: string): void;
  /** Handles stream termination from the transport. */
  onDisconnect(error?: Error): void;
}

/**
 * Active SSE stream connection.
 */
export interface OpenCodeEventStreamConnection {
  /** Close the underlying stream connection. */
  close(): void;
}

interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Factory contract used to open an SSE stream.
 */
export type OpenCodeEventStreamFactory = (
  url: string,
  handlers: OpenCodeEventStreamHandlers
) => OpenCodeEventStreamConnection;

interface OpenCodeEventClientDependencies {
  createStream?: OpenCodeEventStreamFactory;
  logger?: Logger;
}

const NOOP_LOGGER: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * SSE client for the OpenCode `/event` endpoint.
 */
export class OpenCodeEventClient {
  private readonly createStream: OpenCodeEventStreamFactory;
  private readonly logger: Logger;
  private connection: OpenCodeEventStreamConnection | undefined;
  private buffer = '';
  private stopped = true;
  private generation = 0;

  /**
   * Create a new SSE client.
   * @param callbacks - Event and disconnect callbacks
   * @param dependencies - Optional transport overrides for testing
   */
  constructor(
    private readonly callbacks: OpenCodeEventClientCallbacks,
    dependencies: OpenCodeEventClientDependencies = {}
  ) {
    this.createStream = dependencies.createStream ?? createNodeEventStream;
    this.logger = dependencies.logger ?? NOOP_LOGGER;
  }

  /**
   * Start listening on the provided runtime port.
   * @param port - Active OpenCode runtime port
   */
  public start(port: number): void {
    this.stop();
    this.stopped = false;
    this.buffer = '';
    // Capture a per-connection generation so a late/asynchronous disconnect
    // from a previous connection (e.g. ECONNRESET after request.destroy())
    // cannot clobber the current connection or trigger a spurious reconnect.
    const generation = ++this.generation;
    this.connection = this.createStream(getEventUrl(port), {
      onChunk: chunk => {
        if (generation !== this.generation || this.stopped) {
          return;
        }

        this.handleChunk(chunk);
      },
      onDisconnect: error => {
        if (generation !== this.generation) {
          // Stale disconnect from a connection that has already been replaced
          // by a newer start() (or torn down by stop()). Ignore it entirely.
          return;
        }

        this.connection = undefined;
        this.buffer = '';

        if (!this.stopped) {
          this.callbacks.onDisconnect(error);
        }
      },
    });
  }

  /**
   * Stop the current event-stream connection.
   */
  public stop(): void {
    this.stopped = true;
    this.buffer = '';
    this.connection?.close();
    this.connection = undefined;
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;

    while (true) {
      const boundary = this.findFrameBoundary();
      if (!boundary) {
        return;
      }

      const rawFrame = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary.length);
      this.emitFrame(rawFrame);
    }
  }

  /**
   * Locate the next SSE frame boundary in the buffer, supporting both LF (`\n\n`)
   * and CRLF (`\r\n\r\n`) separators. Returns the earliest boundary along with the
   * length of the separator to consume.
   */
  private findFrameBoundary(): { index: number; length: number } | undefined {
    const lfIndex = this.buffer.indexOf('\n\n');
    const crlfIndex = this.buffer.indexOf('\r\n\r\n');

    if (lfIndex === -1 && crlfIndex === -1) {
      return undefined;
    }

    // Prefer the CRLF boundary when it is not later than the LF boundary so the
    // full `\r\n\r\n` separator (including the leading `\r`) is consumed.
    if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex <= lfIndex)) {
      return { index: crlfIndex, length: 4 };
    }

    return { index: lfIndex, length: 2 };
  }

  private emitFrame(rawFrame: string): void {
    const lines = rawFrame.split(/\r?\n/);
    const data = lines
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim())
      .join('\n');

    const sseEventName =
      lines
        .find(line => line.startsWith('event:'))
        ?.slice('event:'.length)
        .trim() || 'message';

    if (!lines.some(line => line.startsWith('event:'))) {
      this.logger.info('SSE frame omitted event line; defaulting to SSE event "message"');
    }

    if (!data) {
      this.logger.warn('Ignoring SSE frame without data payload');
      return;
    }

    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      const domainType = typeof parsed.type === 'string' ? parsed.type : undefined;
      const properties = parsed.properties;

      if (!domainType || typeof properties !== 'object' || properties === null) {
        this.logger.warn('Ignoring malformed SSE frame payload');
        return;
      }

      this.logger.info(`Parsed OpenCode event: sseEvent=${sseEventName} type=${domainType}`);
      this.callbacks.onEvent({
        type: domainType,
        properties: properties as Record<string, unknown>,
      });
    } catch {
      this.logger.warn('Ignoring malformed SSE frame');
    }
  }
}

/**
 * Open an SSE stream using Node's native HTTP(S) clients.
 * @param urlString - Absolute event-stream URL
 * @param handlers - Transport event handlers
 * @returns Active stream connection
 */
export function createNodeEventStream(
  urlString: string,
  handlers: OpenCodeEventStreamHandlers
): OpenCodeEventStreamConnection {
  const url = new URL(urlString);
  const transport = url.protocol === 'https:' ? https : http;
  const request = transport.request(
    url,
    {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
      },
    },
    response => {
      response.setEncoding('utf8');
      response.on('data', chunk => {
        handlers.onChunk(chunk);
      });
      response.on('end', () => {
        handlers.onDisconnect();
      });
      response.on('error', error => {
        handlers.onDisconnect(error);
      });
    }
  );

  request.on('error', error => {
    handlers.onDisconnect(error);
  });
  request.end();

  return {
    close: () => {
      request.destroy();
    },
  };
}

export default OpenCodeEventClient;
