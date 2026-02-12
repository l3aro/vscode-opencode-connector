/**
 * Debounce utility for delaying function execution
 */

// Module-level symbol for storing timeout ID on debounced functions
const debounceTimeoutSymbol = Symbol('debounceTimeout');

type DebouncedFunction<T extends (...args: unknown[]) => void> = {
  (...args: Parameters<T>): void;
  [debounceTimeoutSymbol]?: ReturnType<typeof setTimeout> | undefined;
};

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns A new debounced function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const debounced = function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    // Clear any existing timeout
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = undefined;
      debounced[debounceTimeoutSymbol] = undefined;
    }, wait);

    // Store timeout ID for cancel/flush
    debounced[debounceTimeoutSymbol] = timeoutId;
  } as DebouncedFunction<T>;

  return debounced;
}

/**
 * Creates a debounced function with leading edge execution.
 * The function is invoked on the leading edge, not the trailing edge.
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns A new debounced function with leading edge
 */
export function debounceLeading<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  const debounced = function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    // If there's no existing timeout, execute immediately (leading edge)
    if (timeoutId === undefined) {
      func.apply(this, args);
    } else {
      // Store args for execution after wait period
      lastArgs = args;
    }

    // Clear any existing timeout
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    // Set timeout for trailing edge
    timeoutId = setTimeout(() => {
      // If we stored args from a call during the wait period, execute with those args
      if (lastArgs !== undefined) {
        func.apply(this, lastArgs);
        lastArgs = undefined;
      }
      timeoutId = undefined;
      debounced[debounceTimeoutSymbol] = undefined;
    }, wait);

    // Store timeout ID for cancel/flush
    debounced[debounceTimeoutSymbol] = timeoutId;
  } as DebouncedFunction<T>;

  return debounced;
}

/**
 * Debounce options interface
 */
export interface DebounceOptions {
  /** If true, execute on leading edge instead of trailing */
  leading?: boolean;
  /** If true, the timeout is cleared if the function is called again */
  trailing?: boolean;
}

/**
 * Advanced debounce function with options
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param options - Debounce options
 * @returns A new debounced function
 */
export function debounceWithOptions<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number,
  options: DebounceOptions = {}
): DebouncedFunction<T> {
  const { leading = false, trailing = true } = options;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: ThisParameterType<T> | undefined;
  let leadingExecuted = false;

  const debounced = function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    lastArgs = args;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastThis = this;

    // Clear existing timeout
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    // Leading edge execution
    if (leading && !leadingExecuted) {
      func.apply(this, args);
      leadingExecuted = true;
    }

    // Set timeout for trailing edge
    timeoutId = setTimeout(() => {
      if (trailing && !leading) {
        // For trailing-only, execute with stored args
        if (lastArgs !== undefined) {
          func.apply(lastThis!, lastArgs);
        }
      } else if (trailing && leading && lastArgs !== undefined) {
        // For both leading and trailing, execute with stored args if different
        // Only execute trailing if we had calls after leading
        func.apply(lastThis!, lastArgs);
      }
      timeoutId = undefined;
      leadingExecuted = false;
      debounced[debounceTimeoutSymbol] = undefined;
    }, wait);

    // Store timeout ID for cancel/flush
    debounced[debounceTimeoutSymbol] = timeoutId;
  } as DebouncedFunction<T>;

  return debounced;
}

/**
 * Check if a debounced function is currently waiting (has a pending execution)
 *
 * @param debouncedFunc - The debounced function to check
 * @returns True if waiting, false otherwise
 */
export function isDebounceWaiting<T extends (...args: unknown[]) => void>(
  debouncedFunc: DebouncedFunction<T>
): boolean {
  return debouncedFunc[debounceTimeoutSymbol] !== undefined;
}

/**
 * Immediately cancel a debounced function's pending execution
 *
 * @param debouncedFunc - The debounced function to cancel
 */
export function cancelDebounce<T extends (...args: unknown[]) => void>(
  debouncedFunc: DebouncedFunction<T>
): void {
  const timeoutId = debouncedFunc[debounceTimeoutSymbol];
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
    debouncedFunc[debounceTimeoutSymbol] = undefined;
  }
}

/**
 * Flush a debounced function, executing it immediately if pending
 *
 * @param debouncedFunc - The debounced function to flush
 * @returns True if a pending execution was flushed, false otherwise
 */
export function flushDebounce<T extends (...args: unknown[]) => void>(
  debouncedFunc: DebouncedFunction<T>
): boolean {
  const timeoutId = debouncedFunc[debounceTimeoutSymbol];
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
    debouncedFunc[debounceTimeoutSymbol] = undefined;
    return true;
  }
  return false;
}
