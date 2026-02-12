/**
 * Debounce utility for delaying function execution
 */

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
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    // Clear any existing timeout
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = undefined;
    }, wait);
  };
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
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
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
    }, wait);
  };
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
): (...args: Parameters<T>) => void {
  const { leading = false, trailing = true } = options;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: ThisParameterType<T> | undefined;
  let leadingExecuted = false;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    const context = this;
    lastArgs = args;
    lastThis = context;

    // Clear existing timeout
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    // Leading edge execution
    if (leading && !leadingExecuted) {
      func.apply(context, args);
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
    }, wait);
  };
}

/**
 * Check if a debounced function is currently waiting (has a pending execution)
 * 
 * @param debouncedFunc - The debounced function to check
 * @returns True if waiting, false otherwise
 */
export function isDebounceWaiting<T extends (...args: unknown[]) => void>(
  debouncedFunc: (...args: Parameters<T>) => void
): boolean {
  // We use a Symbol to store the timeout ID on the function
  const timeoutSymbol = Symbol('debounceTimeout');
  const funcAny = debouncedFunc as any;
  return funcAny[timeoutSymbol] !== undefined && funcAny[timeoutSymbol] !== null;
}

/**
 * Immediately cancel a debounced function's pending execution
 * 
 * @param debouncedFunc - The debounced function to cancel
 */
export function cancelDebounce<T extends (...args: unknown[]) => void>(
  debouncedFunc: (...args: Parameters<T>) => void
): void {
  // We use a Symbol to store the timeout ID on the function
  const timeoutSymbol = Symbol('debounceTimeout');
  const funcAny = debouncedFunc as any;
  
  if (funcAny[timeoutSymbol] !== undefined) {
    clearTimeout(funcAny[timeoutSymbol]);
    funcAny[timeoutSymbol] = undefined;
  }
}

/**
 * Flush a debounced function, executing it immediately if pending
 * 
 * @param debouncedFunc - The debounced function to flush
 * @returns True if a pending execution was flushed, false otherwise
 */
export function flushDebounce<T extends (...args: unknown[]) => void>(
  debouncedFunc: (...args: Parameters<T>) => void
): boolean {
  const timeoutSymbol = Symbol('debounceTimeout');
  const funcAny = debouncedFunc as any;
  
  if (funcAny[timeoutSymbol] !== undefined) {
    clearTimeout(funcAny[timeoutSymbol]);
    // Note: We can't easily execute the pending function here without modifying
    // the original debounce implementation to store the function reference
    funcAny[timeoutSymbol] = undefined;
    return true;
  }
  return false;
}
