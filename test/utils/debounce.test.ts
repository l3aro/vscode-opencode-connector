/**
 * Unit tests for debounce utility with fake timers
 */
import { debounce, debounceLeading, debounceWithOptions } from '../../src/utils/debounce';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 300);

    debouncedFunc();
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should only call function once when invoked multiple times within wait period', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 300);

    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the debounced function', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 300);

    debouncedFunc('arg1', 'arg2', { key: 'value' });

    vi.advanceTimersByTime(300);
    expect(func).toHaveBeenCalledWith('arg1', 'arg2', { key: 'value' });
  });

  it('should preserve context (this) binding', () => {
    const context = { value: 'test' };
    const func = vi.fn(function (this: any) {
      return this.value;
    });
    const debouncedFunc = debounce(func, 300);

    debouncedFunc.call(context);

    vi.advanceTimersByTime(300);
    expect(func).toHaveReturnedWith('test');
  });

  it('should reset timer when called again before wait period expires', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 300);

    debouncedFunc();
    vi.advanceTimersByTime(200);
    expect(func).not.toHaveBeenCalled();

    debouncedFunc();
    vi.advanceTimersByTime(200);
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should execute with the latest arguments', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 300);

    debouncedFunc('first');
    debouncedFunc('second');
    debouncedFunc('third');

    vi.advanceTimersByTime(300);
    expect(func).toHaveBeenCalledTimes(1);
    expect(func).toHaveBeenCalledWith('third');
  });
});

describe('debounceLeading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute on leading edge immediately', () => {
    const func = vi.fn();
    const debouncedFunc = debounceLeading(func, 300);

    debouncedFunc();
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should not execute again within wait period', () => {
    const func = vi.fn();
    const debouncedFunc = debounceLeading(func, 300);

    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should execute trailing call after wait period', () => {
    const func = vi.fn();
    const debouncedFunc = debounceLeading(func, 300);

    debouncedFunc(); // Leading executes immediately

    vi.advanceTimersByTime(100);
    debouncedFunc(); // Stored for trailing

    vi.advanceTimersByTime(200);
    expect(func).toHaveBeenCalledTimes(1); // Still only leading

    vi.advanceTimersByTime(100); // Complete wait period
    expect(func).toHaveBeenCalledTimes(2); // Trailing executes
  });
});

describe('debounceWithOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute on trailing edge by default', () => {
    const func = vi.fn();
    const debouncedFunc = debounceWithOptions(func, 300);

    debouncedFunc();
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should execute on leading edge when leading is true', () => {
    const func = vi.fn();
    const debouncedFunc = debounceWithOptions(func, 300, { leading: true });

    debouncedFunc();
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should not execute trailing when trailing is false and leading is false', () => {
    const func = vi.fn();
    const debouncedFunc = debounceWithOptions(func, 300, { leading: false, trailing: false });

    debouncedFunc();
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(func).not.toHaveBeenCalled();
  });

  it('should support both leading and trailing', () => {
    const func = vi.fn();
    const debouncedFunc = debounceWithOptions(func, 300, { leading: true, trailing: true });

    debouncedFunc(); // Leading
    expect(func).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    debouncedFunc(); // Should not call (still in wait period)

    vi.advanceTimersByTime(200);
    expect(func).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100); // Wait for trailing
    expect(func).toHaveBeenCalledTimes(2);
  });
});

describe('debounce behavior edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle zero wait time', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 0);

    debouncedFunc();
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should handle very short wait time', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 10);

    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple rapid calls with different wait times', () => {
    const func1 = vi.fn();
    const func2 = vi.fn();

    const debounced1 = debounce(func1, 100);
    const debounced2 = debounce(func2, 200);

    debounced1();
    debounced2();

    vi.advanceTimersByTime(100);
    expect(func1).toHaveBeenCalledTimes(1);
    expect(func2).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(func2).toHaveBeenCalledTimes(1);
  });
});
