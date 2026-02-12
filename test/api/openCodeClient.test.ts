/**
 * Unit tests for OpenCodeClient
 *
 * Tests the HTTP client that communicates with the OpenCode server API.
 * Uses vitest mocks for axios and axios-retry to test in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted before all imports)
// ---------------------------------------------------------------------------

vi.mock('axios-retry', () => ({
  default: vi.fn(),
  __esModule: true,
}));

vi.mock('axios', () => {
  class AxiosError extends Error {
    code?: string;
    response?: { status: number; data?: unknown };
    config?: Record<string, unknown>;
    isAxiosError = true;

    constructor(
      message?: string,
      code?: string,
      config?: Record<string, unknown>,
      _request?: unknown,
      response?: { status: number; data?: unknown },
    ) {
      super(message);
      this.name = 'AxiosError';
      this.code = code;
      this.config = config ?? {};
      this.response = response;
    }
  }

  return {
    default: {
      create: vi.fn(() => ({
        get: vi.fn(),
        post: vi.fn(),
        interceptors: { response: { use: vi.fn() } },
        defaults: { timeout: 30000 },
      })),
      isAxiosError: (err: unknown) => err instanceof AxiosError,
      AxiosError,
    },
    AxiosError,
    __esModule: true,
  };
});

// ---------------------------------------------------------------------------
// Imports (resolved against mocks above)
// ---------------------------------------------------------------------------

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { OpenCodeClient } from '../../src/api/openCodeClient';
import {
  OpenCodeUnavailableError,
  OpenCodeConnectionTimeoutError,
  OpenCodeClientError,
  OpenCodeServerError,
  OpenCodeInvalidResponseError,
} from '../../src/api/errors';

// Mocked AxiosError constructor — same class that errors.ts sees via axios.AxiosError
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockAxiosError = (axios as any).AxiosError as new (
  message?: string,
  code?: string,
  config?: Record<string, unknown>,
  request?: unknown,
  response?: { status: number; data?: unknown },
) => Error & {
  code?: string;
  response?: { status: number; data?: unknown };
  config?: Record<string, unknown>;
  isAxiosError: boolean;
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OpenCodeClient', () => {
  /** Mock axios instance returned by axios.create() */
  let mockHttp: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    interceptors: { response: { use: ReturnType<typeof vi.fn> } };
    defaults: { timeout: number };
  };

  /** Error interceptor captured from the client's setupRetryInterceptor */
  let errorInterceptor: (error: unknown) => never;

  // -- helpers ----------------------------------------------------------------

  /** Create a client and capture the response error interceptor */
  function createClient(config?: ConstructorParameters<typeof OpenCodeClient>[0]) {
    const client = new OpenCodeClient(config);
    const calls = mockHttp.interceptors.response.use.mock.calls;
    errorInterceptor = calls[calls.length - 1][1] as (error: unknown) => never;
    return client;
  }

  /** Create a mock network error (no HTTP response) */
  function networkError(code: string, message = 'Network error') {
    return new MockAxiosError(message, code, { url: '/test' });
  }

  /** Create a mock HTTP error (with status code) */
  function httpError(status: number, url = '/test', data: unknown = {}) {
    return new MockAxiosError(
      `HTTP ${status}`,
      'ERR_BAD_RESPONSE',
      { url },
      undefined,
      { status, data },
    );
  }

  // -- setup ------------------------------------------------------------------

  beforeEach(() => {
    vi.clearAllMocks();

    mockHttp = {
      get: vi.fn(),
      post: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
      defaults: { timeout: 30000 },
    };

    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue(mockHttp);
  });

  // ===========================================================================
  // constructor
  // ===========================================================================

  describe('constructor', () => {
    it('creates with default config (host 127.0.0.1, port 4096)', () => {
      const client = createClient();
      expect(client.getHost()).toBe('127.0.0.1');
      expect(client.getPort()).toBe(4096);
    });

    it('accepts custom config overrides', () => {
      const client = createClient({ host: '10.0.0.1', port: 7777, timeout: 5000 });
      expect(client.getHost()).toBe('10.0.0.1');
      expect(client.getPort()).toBe(7777);
    });

    it('builds correct base URL', () => {
      const client = createClient({ host: '192.168.1.5', port: 8080 });
      expect(client.getBaseUrl()).toBe('http://192.168.1.5:8080');
    });
  });

  // ===========================================================================
  // getHealth
  // ===========================================================================

  describe('getHealth', () => {
    it('returns health response on success', async () => {
      mockHttp.get.mockResolvedValueOnce({
        data: { healthy: true, version: '2.0.0' },
      });

      const client = createClient();
      const result = await client.getHealth();

      expect(mockHttp.get).toHaveBeenCalledWith('/global/health');
      expect(result).toEqual({ healthy: true, version: '2.0.0' });
    });

    it('throws OpenCodeInvalidResponseError for invalid response', async () => {
      mockHttp.get.mockResolvedValueOnce({ data: { healthy: true } }); // missing version
      const client = createClient();
      await expect(client.getHealth()).rejects.toThrow(OpenCodeInvalidResponseError);
    });

    it('throws OpenCodeUnavailableError on ECONNREFUSED', () => {
      createClient();
      expect(() => errorInterceptor(networkError('ECONNREFUSED'))).toThrow(
        OpenCodeUnavailableError,
      );
    });

    it('throws OpenCodeUnavailableError on ECONNRESET', () => {
      createClient();
      expect(() => errorInterceptor(networkError('ECONNRESET'))).toThrow(
        OpenCodeUnavailableError,
      );
    });

    it('throws OpenCodeConnectionTimeoutError on ETIMEDOUT', () => {
      createClient();
      expect(() => errorInterceptor(networkError('ETIMEDOUT'))).toThrow(
        OpenCodeConnectionTimeoutError,
      );
    });
  });

  // ===========================================================================
  // getPath
  // ===========================================================================

  describe('getPath', () => {
    it('returns path response on success', async () => {
      const paths = {
        home: '/home/user',
        state: '/home/user/.local/state',
        config: '/home/user/.config',
        worktree: '/projects/app',
        directory: '/projects/app',
      };
      mockHttp.get.mockResolvedValueOnce({ data: paths });

      const client = createClient();
      const result = await client.getPath();

      expect(mockHttp.get).toHaveBeenCalledWith('/path');
      expect(result).toEqual(paths);
    });

    it('throws OpenCodeInvalidResponseError for invalid response', async () => {
      mockHttp.get.mockResolvedValueOnce({ data: {} }); // missing home
      const client = createClient();
      await expect(client.getPath()).rejects.toThrow(OpenCodeInvalidResponseError);
    });
  });

  // ===========================================================================
  // listSessions
  // ===========================================================================

  describe('listSessions', () => {
    it('returns sessions array on success', async () => {
      const sessions = [
        { id: 's1', title: 'A', directory: '/tmp', time: { created: 1, updated: 2 } },
        { id: 's2', title: 'B', directory: '/tmp', time: { created: 3, updated: 4 } },
      ];
      mockHttp.get.mockResolvedValueOnce({ data: sessions });

      const client = createClient();
      const result = await client.listSessions();

      expect(mockHttp.get).toHaveBeenCalledWith('/session');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('s1');
    });

    it('throws OpenCodeInvalidResponseError for non-array response', async () => {
      mockHttp.get.mockResolvedValueOnce({ data: { sessions: [] } }); // object, not array
      const client = createClient();
      await expect(client.listSessions()).rejects.toThrow(OpenCodeInvalidResponseError);
    });
  });

  // ===========================================================================
  // appendPrompt
  // ===========================================================================

  describe('appendPrompt', () => {
    it('sends correct body {text} and returns true', async () => {
      mockHttp.post.mockResolvedValueOnce({ data: true });

      const client = createClient();
      const result = await client.appendPrompt('hello world');

      expect(mockHttp.post).toHaveBeenCalledWith('/tui/append-prompt', { text: 'hello world' });
      expect(result).toBe(true);
    });

    it('returns false on failure response', async () => {
      mockHttp.post.mockResolvedValueOnce({ data: false });

      const client = createClient();
      const result = await client.appendPrompt('test');

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // executeCommand
  // ===========================================================================

  describe('executeCommand', () => {
    it('sends correct body {command}', async () => {
      mockHttp.post.mockResolvedValueOnce({ data: true });

      const client = createClient();
      await client.executeCommand('/help');

      expect(mockHttp.post).toHaveBeenCalledWith('/tui/execute-command', { command: '/help' });
    });
  });

  // ===========================================================================
  // selectSession
  // ===========================================================================

  describe('selectSession', () => {
    it('sends correct body {sessionID} (capital D)', async () => {
      mockHttp.post.mockResolvedValueOnce({ data: true });

      const client = createClient();
      await client.selectSession('ses_123');

      expect(mockHttp.post).toHaveBeenCalledWith('/tui/select-session', {
        sessionID: 'ses_123',
      });
    });
  });

  // ===========================================================================
  // listAgents
  // ===========================================================================

  describe('listAgents', () => {
    it('returns agents array on success', async () => {
      const agents = [
        { name: 'coder', description: 'Primary agent', mode: 'primary' },
        { name: 'reviewer', description: 'Reviewer', mode: 'subagent' },
      ];
      mockHttp.get.mockResolvedValueOnce({ data: agents });

      const client = createClient();
      const result = await client.listAgents();

      expect(mockHttp.get).toHaveBeenCalledWith('/agent');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('coder');
    });
  });

  // ===========================================================================
  // listCommands
  // ===========================================================================

  describe('listCommands', () => {
    it('returns commands array on success', async () => {
      const commands = [
        { name: '/help', description: 'Show help', template: '', agent: 'coder' },
      ];
      mockHttp.get.mockResolvedValueOnce({ data: commands });

      const client = createClient();
      const result = await client.listCommands();

      expect(mockHttp.get).toHaveBeenCalledWith('/command');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('/help');
    });
  });

  // ===========================================================================
  // testConnection
  // ===========================================================================

  describe('testConnection', () => {
    it('returns true when server responds', async () => {
      mockHttp.get.mockResolvedValueOnce({ data: { healthy: true } });

      const client = createClient();
      expect(await client.testConnection()).toBe(true);
      expect(mockHttp.get).toHaveBeenCalledWith('/global/health', { timeout: 5000 });
    });

    it('returns false when server is down', async () => {
      mockHttp.get.mockRejectedValueOnce(networkError('ECONNREFUSED'));

      const client = createClient();
      expect(await client.testConnection()).toBe(false);
    });
  });

  // ===========================================================================
  // error handling (interceptor transformation)
  // ===========================================================================

  describe('error handling', () => {
    beforeEach(() => {
      createClient();
    });

    it('transforms ECONNREFUSED to OpenCodeUnavailableError', () => {
      expect(() => errorInterceptor(networkError('ECONNREFUSED'))).toThrow(
        OpenCodeUnavailableError,
      );
    });

    it('transforms ECONNRESET to OpenCodeUnavailableError', () => {
      expect(() => errorInterceptor(networkError('ECONNRESET'))).toThrow(
        OpenCodeUnavailableError,
      );
    });

    it('transforms ETIMEDOUT to OpenCodeConnectionTimeoutError', () => {
      expect(() => errorInterceptor(networkError('ETIMEDOUT'))).toThrow(
        OpenCodeConnectionTimeoutError,
      );
    });

    it('transforms 4xx to OpenCodeClientError', () => {
      expect(() => errorInterceptor(httpError(404, '/session/xyz'))).toThrow(
        OpenCodeClientError,
      );
    });

    it('transforms 5xx to OpenCodeServerError', () => {
      expect(() => errorInterceptor(httpError(503, '/session'))).toThrow(
        OpenCodeServerError,
      );
    });
  });

  // ===========================================================================
  // retry behavior
  // ===========================================================================

  describe('retry behavior', () => {
    let retryCondition: (error: unknown) => boolean;

    beforeEach(() => {
      createClient();
      const calls = (axiosRetry as unknown as ReturnType<typeof vi.fn>).mock.calls;
      retryCondition = calls[calls.length - 1][1].retryCondition;
    });

    it('retries on ECONNRESET', () => {
      expect(retryCondition(networkError('ECONNRESET'))).toBe(true);
    });

    it('retries on 500 errors', () => {
      expect(retryCondition(httpError(500))).toBe(true);
    });

    it('does not retry on 400 errors', () => {
      expect(retryCondition(httpError(400))).toBe(false);
    });
  });
});
