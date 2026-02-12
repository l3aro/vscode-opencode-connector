/**
 * Custom error types for OpenCode API client
 */

import axios from 'axios';
export abstract class OpenCodeError extends Error {
  public code: string;
  constructor(
    message: string,
    code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'OpenCodeError';
    this.code = code;
  }
}

/**
 * Error thrown when the OpenCode instance is not available.
 * This could be because:
 * - The process is not running
 * - The port is not yet available
 * - Connection was refused
 */
export class OpenCodeUnavailableError extends OpenCodeError {
  constructor(port: number, originalError?: Error) {
    super(
      `OpenCode is not available on port ${port}`,
      'OPENCODE_UNAVAILABLE',
      originalError
    );
    this.name = 'OpenCodeUnavailableError';
  }
}

/**
 * Error thrown when the OpenCode instance is not responding properly.
 * This indicates a timeout or malformed response.
 */
export class OpenCodeConnectionTimeoutError extends OpenCodeError {
  constructor(port: number, timeoutMs: number) {
    super(
      `Connection to OpenCode on port ${port} timed out after ${timeoutMs}ms`,
      'OPENCODE_CONNECTION_TIMEOUT'
    );
    this.name = 'OpenCodeConnectionTimeoutError';
  }
}

/**
 * Error thrown when the API returns an unexpected status code.
 */
export class OpenCodeApiError extends OpenCodeError {
  constructor(
    public readonly statusCode: number,
    public readonly endpoint: string,
    public readonly responseBody?: string
  ) {
    super(
      `OpenCode API error on ${endpoint}: HTTP ${statusCode}`,
      'OPENCODE_API_ERROR'
    );
    this.name = 'OpenCodeApiError';
  }
}

/**
 * Error thrown when the API returns a 4xx client error.
 */
export class OpenCodeClientError extends OpenCodeApiError {
  constructor(
    statusCode: number,
    endpoint: string,
    responseBody?: string
  ) {
    super(statusCode, endpoint, responseBody);
    this.code = 'OPENCODE_CLIENT_ERROR';
    this.name = 'OpenCodeClientError';
  }
}

/**
 * Error thrown when the API returns a 5xx server error.
 * These errors are typically retryable.
 */
export class OpenCodeServerError extends OpenCodeApiError {
  constructor(
    statusCode: number,
    endpoint: string,
    public readonly isRetryable: boolean = true,
    responseBody?: string
  ) {
    super(statusCode, endpoint, responseBody);
    this.code = 'OPENCODE_SERVER_ERROR';
    this.name = 'OpenCodeServerError';
  }
}

/**
 * Error thrown when the OpenCode instance responds with an invalid payload.
 */
export class OpenCodeInvalidResponseError extends OpenCodeError {
  constructor(endpoint: string, details?: string) {
    super(
      `Invalid response from OpenCode at ${endpoint}${details ? ': ' + details : ''}`,
      'OPENCODE_INVALID_RESPONSE'
    );
    this.name = 'OpenCodeInvalidResponseError';
  }
}

/**
 * Error thrown when maximum retries have been exhausted.
 */
export class MaxRetriesExceededError extends OpenCodeError {
  constructor(
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(
      `Maximum retry attempts (${attempts}) exceeded`,
      'MAX_RETRIES_EXCEEDED',
      lastError
    );
    this.name = 'MaxRetriesExceededError';
  }
}

/**
 * Type guard to check if an error is an OpenCodeError.
 */
export function isOpenCodeError(error: unknown): error is OpenCodeError {
  return error instanceof OpenCodeError;
}

/**
 * Type guard to check if an error is retryable (server error).
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof OpenCodeServerError) {
    return error.isRetryable;
  }
  if (error instanceof OpenCodeUnavailableError) {
    return true;
  }
  if (error instanceof OpenCodeConnectionTimeoutError) {
    return true;
  }
  if (error instanceof axios.AxiosError) {
    // Retry on network errors and 5xx status codes
    if (error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND') {
      return true;
    }
    if (error.response?.status && error.response.status >= 500) {
      return true;
    }
  }
  return false;
}
