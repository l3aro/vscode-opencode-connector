import {
  OpenCodeEventClient,
  type OpenCodeEventStreamConnection,
  type OpenCodeEventStreamFactory,
} from '../../src/api/openCodeEventClient';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('OpenCodeEventClient', () => {
  let onEvent: ReturnType<typeof vi.fn>;
  let onDisconnect: ReturnType<typeof vi.fn>;
  let createStream: ReturnType<typeof vi.fn<OpenCodeEventStreamFactory>>;
  let logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let streamHandlers:
    | {
        onChunk(chunk: string): void;
        onDisconnect(error?: Error): void;
      }
    | undefined;
  let closeConnection: ReturnType<typeof vi.fn>;
  let connections: Array<{
    url: string;
    handlers: {
      onChunk(chunk: string): void;
      onDisconnect(error?: Error): void;
    };
    close: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    onEvent = vi.fn();
    onDisconnect = vi.fn();
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    closeConnection = vi.fn();
    streamHandlers = undefined;
    connections = [];
    createStream = vi.fn((url, handlers) => {
      const close = vi.fn();
      streamHandlers = handlers;
      closeConnection = close;
      connections.push({ url, handlers, close });
      return {
        close,
      } satisfies OpenCodeEventStreamConnection;
    });
  });

  it('emits the OpenCode domain event type from the JSON payload and ignores malformed frames', () => {
    const client = new OpenCodeEventClient(
      { onEvent, onDisconnect },
      {
        createStream,
        logger,
      }
    );

    client.start(4200);
    streamHandlers?.onChunk(
      'event: message\ndata: {"id":"evt-1","type":"session.status","properties":{"sessionID":"session-1","status":{"type":"busy"}}}\n\n' +
        'event: message\ndata: not-json\n\n'
    );

    expect(createStream).toHaveBeenCalledWith(
      'http://127.0.0.1:4200/event',
      expect.objectContaining({
        onChunk: expect.any(Function),
        onDisconnect: expect.any(Function),
      })
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'session.status',
      properties: {
        sessionID: 'session-1',
        status: { type: 'busy' },
      },
    });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Raw SSE chunk'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Raw SSE frame'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Parsed OpenCode event'));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring malformed SSE frame')
    );
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('reassembles chunked SSE frames before emitting the parsed domain event', () => {
    const client = new OpenCodeEventClient(
      { onEvent, onDisconnect },
      {
        createStream,
        logger,
      }
    );

    client.start(4300);
    streamHandlers?.onChunk(
      'event: message\ndata: {"id":"evt-2","type":"session.status","properties":{"sessionID":"session-2","status":{"type":"ret'
    );
    streamHandlers?.onChunk('ry"}}}\n\n');

    expect(onEvent).toHaveBeenCalledWith({
      type: 'session.status',
      properties: {
        sessionID: 'session-2',
        status: { type: 'retry' },
      },
    });
  });

  it('accepts frames without an SSE event line as default message events', () => {
    const client = new OpenCodeEventClient(
      { onEvent, onDisconnect },
      {
        createStream,
        logger,
      }
    );

    client.start(4301);
    streamHandlers?.onChunk(
      'data: {"id":"evt-3","type":"session.status","properties":{"sessionID":"session-3","status":{"type":"busy"}}}\n\n'
    );

    expect(onEvent).toHaveBeenCalledWith({
      type: 'session.status',
      properties: {
        sessionID: 'session-3',
        status: { type: 'busy' },
      },
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('defaulting to SSE event "message"')
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('"sseEvent":"message"'));
    expect(logger.warn.mock.calls.flat().join('\n')).not.toContain('without event line');
  });

  it('parses multi-line data-only frames using the JSON domain type', () => {
    const client = new OpenCodeEventClient(
      { onEvent, onDisconnect },
      {
        createStream,
        logger,
      }
    );

    client.start(4302);
    streamHandlers?.onChunk(
      'data: {"id":"evt-4",\ndata: "type":"session.status","properties":{"sessionID":"session-4","status":{"type":"idle"}}}\n\n'
    );

    expect(onEvent).toHaveBeenCalledWith({
      type: 'session.status',
      properties: {
        sessionID: 'session-4',
        status: { type: 'idle' },
      },
    });
  });

  it('ignores a late disconnect from a previous connection after a new start', () => {
    const client = new OpenCodeEventClient(
      { onEvent, onDisconnect },
      {
        createStream,
        logger,
      }
    );

    client.start(4600);
    const firstConnection = connections[0];

    client.start(4601);
    const secondConnection = connections[1];

    // A late/asynchronous disconnect from the OLD connection (e.g. ECONNRESET
    // after request.destroy()) must be ignored: it must neither trigger a
    // reconnect nor detach the current connection.
    firstConnection.handlers.onDisconnect(new Error('ECONNRESET'));

    expect(onDisconnect).not.toHaveBeenCalled();

    // The new connection is still the active one, so stop() closes it.
    client.stop();
    expect(secondConnection.close).toHaveBeenCalledTimes(1);
  });

  it('parses frames separated by CRLF boundaries across a split chunk', () => {
    const client = new OpenCodeEventClient(
      { onEvent, onDisconnect },
      {
        createStream,
        logger,
      }
    );

    client.start(4700);

    // First frame plus the start of the second, split in the middle of a \r\n
    // sequence (chunk 1 ends with "\r", chunk 2 begins with "\n").
    streamHandlers?.onChunk(
      'event: message\r\ndata: {"id":"evt-1","type":"session.status","properties":{"sessionID":"session-1","status":{"type":"busy"}}}\r\n\r'
    );
    streamHandlers?.onChunk(
      '\nevent: message\r\ndata: {"id":"evt-2","type":"session.status","properties":{"sessionID":"session-2","status":{"type":"idle"}}}\r\n\r\n'
    );

    expect(onEvent).toHaveBeenNthCalledWith(1, {
      type: 'session.status',
      properties: {
        sessionID: 'session-1',
        status: { type: 'busy' },
      },
    });
    expect(onEvent).toHaveBeenNthCalledWith(2, {
      type: 'session.status',
      properties: {
        sessionID: 'session-2',
        status: { type: 'idle' },
      },
    });
  });

  it('does not report a disconnect when the client is stopped locally', () => {
    const client = new OpenCodeEventClient(
      { onEvent, onDisconnect },
      {
        createStream,
        logger,
      }
    );

    client.start(4400);
    client.stop();
    streamHandlers?.onDisconnect(new Error('socket closed'));

    expect(closeConnection).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('reports disconnect callbacks for remote stream failures', () => {
    const client = new OpenCodeEventClient(
      { onEvent, onDisconnect },
      {
        createStream,
        logger,
      }
    );

    client.start(4500);
    const error = new Error('stream dropped');
    streamHandlers?.onDisconnect(error);

    expect(onDisconnect).toHaveBeenCalledWith(error);
  });
});
