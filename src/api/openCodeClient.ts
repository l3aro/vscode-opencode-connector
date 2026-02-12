/**
 * HTTP Client for OpenCode API communication
 * Handles connection, retries, and error handling
 */
import {
  AgentInfo,
  CommandInfo,
  HealthResponse,
  MessageInput,
  PathResponse,
  SessionInfo,
  TuiPublishEvent,
  VcsInfo,
} from '../types';
import {
  OpenCodeApiError,
  OpenCodeClientError,
  OpenCodeConnectionTimeoutError,
  OpenCodeError,
  OpenCodeInvalidResponseError,
  OpenCodeServerError,
  OpenCodeUnavailableError,
  isRetryableError,
} from './errors';

import axios, { AxiosError, AxiosInstance } from 'axios';
import axiosRetry, { IAxiosRetryConfig } from 'axios-retry';

/**
 * Configuration options for OpenCodeClient
 */
export interface OpenCodeClientConfig {
  /** Hostname where OpenCode is running (default: '127.0.0.1') */
  host?: string;
  /** Port number for OpenCode (default: 4096) */
  port?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum retry attempts for failed requests (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default: 500) */
  retryDelay?: number;
  /** Maximum retry delay in milliseconds (default: 10000) */
  maxRetryDelay?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<OpenCodeClientConfig> = {
  host: '127.0.0.1',
  port: 4096,
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 500,
  maxRetryDelay: 10000,
};

/**
 * OpenCode HTTP Client
 * Provides typed methods for communicating with OpenCode API
 */
export class OpenCodeClient {
  private client: AxiosInstance;
  private config: Required<OpenCodeClientConfig>;
  private baseUrl: string;

  /**
   * Create a new OpenCodeClient instance
   * @param config - Optional configuration overrides
   */
  constructor(config: OpenCodeClientConfig = {}) {
    this.config = {
      host: config.host ?? DEFAULT_CONFIG.host,
      port: config.port ?? DEFAULT_CONFIG.port,
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
      maxRetries: config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryDelay: config.retryDelay ?? DEFAULT_CONFIG.retryDelay,
      maxRetryDelay: config.maxRetryDelay ?? DEFAULT_CONFIG.maxRetryDelay,
    };

    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.setupRetryInterceptor();
  }

  /**
   * Get the base URL for API calls
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get the configured port
   */
  public getPort(): number {
    return this.config.port;
  }

  /**
   * Get the configured host
   */
  public getHost(): string {
    return this.config.host;
  }

  /**
   * Setup axios-retry with custom configuration
   */
  private setupRetryInterceptor(): void {
    const retryConfig: IAxiosRetryConfig = {
      retries: this.config.maxRetries,
      retryDelay: retryCount => {
        // Exponential backoff with jitter
        const delay = Math.min(
          this.config.retryDelay * Math.pow(2, retryCount - 1),
          this.config.maxRetryDelay
        );
        // Add random jitter (±20%)
        const jitter = delay * 0.2 * (Math.random() * 2 - 1);
        return Math.max(0, delay + jitter);
      },
      retryCondition: error => {
        return isRetryableError(error);
      },
      shouldResetTimeout: true,
    };

    axiosRetry(this.client, retryConfig);

    // Add error transformation interceptor
    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        throw this.transformError(error);
      }
    );
  }

  /**
   * Transform axios error to custom OpenCode error
   */
  private transformError(error: AxiosError): OpenCodeError {
    const { code, response, config: reqConfig } = error;
    const endpoint = reqConfig?.url || 'unknown';
    const port = this.config.port;

    // Network errors
    if (!response) {
      switch (code) {
        case 'ECONNREFUSED':
          return new OpenCodeUnavailableError(port, error);
        case 'ECONNRESET':
          return new OpenCodeUnavailableError(port, error);
        case 'ETIMEDOUT':
        case 'ECONNABORTED':
          return new OpenCodeConnectionTimeoutError(port, this.config.timeout);
        case 'ENOTFOUND':
          return new OpenCodeUnavailableError(port, error);
        default: {
          // Return an unavailable error for unknown network issues
          return new OpenCodeUnavailableError(port, error);
        }
      }
    }

    // HTTP errors
    const statusCode = response.status;
    const responseBody = response.data
      ? typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data)
      : undefined;

    if (statusCode >= 400 && statusCode < 500) {
      return new OpenCodeClientError(statusCode, endpoint, responseBody);
    }

    if (statusCode >= 500) {
      // 501 Not Implemented is not retryable
      const isRetryable = statusCode !== 501;
      return new OpenCodeServerError(statusCode, endpoint, isRetryable, responseBody);
    }

    return new OpenCodeApiError(statusCode, endpoint, responseBody);
  }

  // ---------------------------------------------------------------------------
  // Global endpoints
  // ---------------------------------------------------------------------------

  /**
   * Check server health
   * GET /global/health
   */
  public async getHealth(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/global/health');
    const data = response.data;

    if (!data || typeof data.version !== 'string') {
      throw new OpenCodeInvalidResponseError(
        '/global/health',
        'Missing or invalid "version" field in response'
      );
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Path endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get server path information
   * GET /path
   */
  public async getPath(): Promise<PathResponse> {
    const response = await this.client.get<PathResponse>('/path');
    const data = response.data;

    if (!data || typeof data.home !== 'string') {
      throw new OpenCodeInvalidResponseError(
        '/path',
        'Missing or invalid "home" field in response'
      );
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // VCS endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get VCS (version control) information
   * GET /vcs
   */
  public async getVcs(): Promise<VcsInfo> {
    const response = await this.client.get<VcsInfo>('/vcs');
    const data = response.data;

    if (!data || typeof data.branch !== 'string') {
      throw new OpenCodeInvalidResponseError(
        '/vcs',
        'Missing or invalid "branch" field in response'
      );
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Session endpoints
  // ---------------------------------------------------------------------------

  /**
   * List all sessions
   * GET /session
   */
  public async listSessions(): Promise<SessionInfo[]> {
    const response = await this.client.get<SessionInfo[]>('/session');
    const data = response.data;

    if (!Array.isArray(data)) {
      throw new OpenCodeInvalidResponseError('/session', 'Expected array response');
    }

    return data;
  }

  /**
   * Get a specific session
   * GET /session/:id
   */
  public async getSession(sessionId: string): Promise<SessionInfo> {
    const response = await this.client.get<SessionInfo>(`/session/${sessionId}`);
    const data = response.data;

    if (!data || typeof data.id !== 'string') {
      throw new OpenCodeInvalidResponseError(
        `/session/${sessionId}`,
        'Missing or invalid "id" field in response'
      );
    }

    return data;
  }

  /**
   * Create a new session
   * POST /session
   */
  public async createSession(): Promise<SessionInfo> {
    const response = await this.client.post<SessionInfo>('/session');
    const data = response.data;

    if (!data || typeof data.id !== 'string') {
      throw new OpenCodeInvalidResponseError(
        '/session',
        'Missing or invalid "id" field in response'
      );
    }

    return data;
  }

  /**
   * Abort a session
   * POST /session/:id/abort
   */
  public async abortSession(sessionId: string): Promise<boolean> {
    const response = await this.client.post(`/session/${sessionId}/abort`);
    return response.data === true || !!response.data;
  }

  /**
   * Send a message to a session
   * POST /session/:id/message
   */
  public async sendMessage(sessionId: string, input: MessageInput): Promise<unknown> {
    const response = await this.client.post(`/session/${sessionId}/message`, input);
    return response.data;
  }

  /**
   * Get messages for a session
   * GET /session/:id/message
   */
  public async getMessages(sessionId: string): Promise<unknown[]> {
    const response = await this.client.get<unknown[]>(`/session/${sessionId}/message`);
    const data = response.data;

    if (!Array.isArray(data)) {
      throw new OpenCodeInvalidResponseError(
        `/session/${sessionId}/message`,
        'Expected array response'
      );
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Agent endpoints
  // ---------------------------------------------------------------------------

  /**
   * List available agents
   * GET /agent
   */
  public async listAgents(): Promise<AgentInfo[]> {
    const response = await this.client.get<AgentInfo[]>('/agent');
    const data = response.data;

    if (!Array.isArray(data)) {
      throw new OpenCodeInvalidResponseError('/agent', 'Expected array response');
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Command endpoints
  // ---------------------------------------------------------------------------

  /**
   * List available commands
   * GET /command
   */
  public async listCommands(): Promise<CommandInfo[]> {
    const response = await this.client.get<CommandInfo[]>('/command');
    const data = response.data;

    if (!Array.isArray(data)) {
      throw new OpenCodeInvalidResponseError('/command', 'Expected array response');
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // TUI endpoints
  // ---------------------------------------------------------------------------

  /**
   * Append text to the TUI prompt
   * POST /tui/append-prompt
   */
  public async appendPrompt(text: string): Promise<boolean> {
    const response = await this.client.post('/tui/append-prompt', { text });
    return response.data === true || !!response.data;
  }

  /**
   * Submit the current TUI prompt
   * POST /tui/submit-prompt
   */
  public async submitPrompt(): Promise<boolean> {
    const response = await this.client.post('/tui/submit-prompt');
    return response.data === true || !!response.data;
  }

  /**
   * Clear the current TUI prompt
   * POST /tui/clear-prompt
   */
  public async clearPrompt(): Promise<boolean> {
    const response = await this.client.post('/tui/clear-prompt');
    return response.data === true || !!response.data;
  }

  /**
   * Execute a command in the TUI
   * POST /tui/execute-command
   */
  public async executeCommand(command: string): Promise<boolean> {
    const response = await this.client.post('/tui/execute-command', { command });
    return response.data === true || !!response.data;
  }

  /**
   * Publish a TUI event
   * POST /tui/publish
   */
  public async publishTuiEvent(event: TuiPublishEvent): Promise<boolean> {
    const response = await this.client.post('/tui/publish', event);
    return response.data === true || !!response.data;
  }

  /**
   * Select a session in the TUI
   * POST /tui/select-session
   */
  public async selectSession(sessionId: string): Promise<boolean> {
    const response = await this.client.post('/tui/select-session', { sessionID: sessionId });
    return response.data === true || !!response.data;
  }

  // ---------------------------------------------------------------------------
  // Permission endpoints
  // ---------------------------------------------------------------------------

  /**
   * Reply to a permission request
   * POST /permission/:id/reply
   */
  public async replyPermission(
    permissionId: string,
    reply: 'once' | 'always' | 'reject'
  ): Promise<boolean> {
    const response = await this.client.post(`/permission/${permissionId}/reply`, { reply });
    return response.data === true || !!response.data;
  }

  // ---------------------------------------------------------------------------
  // Connection testing
  // ---------------------------------------------------------------------------

  /**
   * Test connection with a single attempt (no retries).
   * Uses a raw axios call to bypass the retry interceptor on this.client,
   * so a dead port returns false immediately instead of burning ~3.5s in retries.
   * @returns Promise<boolean>
   */
  public async testConnection(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/global/health`, {
        timeout: 2000,
        headers: { Accept: 'application/json' },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Destroy the client and cleanup resources
   */
  public destroy(): void {
    this.client.defaults.timeout = 0; // Cancel any pending requests
  }
}

export default OpenCodeClient;
