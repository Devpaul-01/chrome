/**
 * Tests for content/dom-helpers.ts
 *
 * Covers:
 *  - waitForElement
 *  - delay
 *  - trySelectors / trySelectorsAll
 *  - retryOperation
 *  - debounce
 *  - createStableMutationObserver
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  delay,
  trySelectors,
  trySelectorsAll,
  retryOperation,
  debounce,
  createStableMutationObserver,
} from '../dom-helpers';

// ---------------------------------------------------------------------------
// delay
// ---------------------------------------------------------------------------

describe('delay', () => {
  it('resolves after the given milliseconds', async () => {
    vi.useFakeTimers();
    const p = delay(500);
    vi.advanceTimersByTime(500);
    await p; // should not reject
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// trySelectors
// ---------------------------------------------------------------------------

describe('trySelectors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the first matching element', () => {
    document.body.innerHTML = '<div id="a" role="button"></div>';
    const result = trySelectors(['#missing', '#a']);
    expect(result).toBe(document.getElementById('a'));
  });

  it('returns null when no selector matches', () => {
    document.body.innerHTML = '<div></div>';
    expect(trySelectors(['#nope', '.nada'])).toBeNull();
  });

  it('uses fallback predicate when selectors fail', () => {
    document.body.innerHTML = '<span class="btn">Post</span><span class="btn">Cancel</span>';
    const result = trySelectors(['#nonexistent'], document, {
      broadSelector: '.btn',
      predicate: (el) => el.textContent === 'Post',
    });
    expect(result?.textContent).toBe('Post');
  });

  it('respects custom root element', () => {
    document.body.innerHTML =
      '<div id="root"><span class="x">inner</span></div><span class="x">outer</span>';
    const root = document.getElementById('root')!;
    const result = trySelectors(['.x'], root);
    expect(result?.textContent).toBe('inner');
  });
});

// ---------------------------------------------------------------------------
// trySelectorsAll
// ---------------------------------------------------------------------------

describe('trySelectorsAll', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns deduplicated matches across selectors', () => {
    document.body.innerHTML = '<div class="a b"></div><div class="b"></div>';
    const results = trySelectorsAll(['.a', '.b']);
    expect(results).toHaveLength(2);
  });

  it('returns empty array when nothing matches', () => {
    document.body.innerHTML = '<div></div>';
    expect(trySelectorsAll(['.missing'])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// retryOperation
// ---------------------------------------------------------------------------

describe('retryOperation', () => {
  it('returns on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryOperation(fn, 3, 10);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail1')).mockResolvedValue('ok');
    const result = await retryOperation(fn, 3, 10);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(retryOperation(fn, 2, 10)).rejects.toThrow('always fails');
    // 1 initial + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('handles non-Error rejections', async () => {
    const fn = vi.fn().mockRejectedValue('string error');
    await expect(retryOperation(fn, 0, 10)).rejects.toThrow('string error');
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays execution until wait period elapses', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// createStableMutationObserver
// ---------------------------------------------------------------------------

describe('createStableMutationObserver', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="target"></div>';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an observer that can be disconnected', () => {
    const callback = vi.fn();
    const observer = createStableMutationObserver(callback);
    const target = document.getElementById('target')!;
    observer.observe(target, { childList: true });
    observer.disconnect();
    // No crash
  });

  it('calls onError when callback throws', async () => {
    vi.useRealTimers();
    const onError = vi.fn();
    const error = new Error('callback broke');
    const observer = createStableMutationObserver(
      () => {
        throw error;
      },
      { debounceMs: 0, onError },
    );
    const target = document.getElementById('target')!;
    observer.observe(target, { childList: true });

    // Trigger a mutation
    const child = document.createElement('span');
    target.appendChild(child);

    // Wait for the observer to fire + debounce
    await new Promise((r) => setTimeout(r, 50));

    expect(onError).toHaveBeenCalledWith(error);
    observer.disconnect();
  });

  it('does not fire callback after disconnect', async () => {
    vi.useRealTimers();
    const callback = vi.fn();
    const observer = createStableMutationObserver(callback, { debounceMs: 0 });
    const target = document.getElementById('target')!;
    observer.observe(target, { childList: true });
    observer.disconnect();

    target.appendChild(document.createElement('span'));
    await new Promise((r) => setTimeout(r, 50));

    expect(callback).not.toHaveBeenCalled();
  });

  it('accumulates mutations across rapid-fire calls and delivers them in one batch', async () => {
    vi.useRealTimers();
    const received: MutationRecord[][] = [];
    const observer = createStableMutationObserver(
      (mutations) => {
        received.push(mutations);
      },
      {
        debounceMs: 50,
      },
    );
    const target = document.getElementById('target')!;
    observer.observe(target, { childList: true });

    // Trigger 3 child additions in rapid succession
    target.appendChild(document.createElement('span'));
    target.appendChild(document.createElement('div'));
    target.appendChild(document.createElement('p'));

    // Wait for debounce window to close
    await new Promise((r) => setTimeout(r, 150));

    // Callback should have been invoked exactly once with all 3 mutations
    expect(received).toHaveLength(1);
    expect(received[0].length).toBe(3);

    observer.disconnect();
  });

  it('stops reconnecting and calls onError after maxReconnects is exceeded', () => {
    // beforeEach already applied vi.useFakeTimers()
    const onError = vi.fn();
    const target = document.getElementById('target')!;

    const observer = createStableMutationObserver(vi.fn(), {
      reconnectOnDetach: true,
      reconnectSelector: '.log-container',
      maxReconnects: 2,
      onError,
    });
    observer.observe(target, { childList: true });

    // Detach 1: remove original target, provide replacement → reconnects (count=1)
    target.remove();
    const r1 = document.createElement('div');
    r1.className = 'log-container';
    document.body.appendChild(r1);
    vi.advanceTimersByTime(5000);

    // Detach 2: remove r1, provide another replacement → reconnects (count=2)
    r1.remove();
    const r2 = document.createElement('div');
    r2.className = 'log-container';
    document.body.appendChild(r2);
    vi.advanceTimersByTime(5000);

    // Detach 3: remove r2 — count(2) >= maxReconnects(2) → onError called, interval cleared
    r2.remove();
    vi.advanceTimersByTime(5000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/2/);

    observer.disconnect();
  });

  it('uses a custom reconnectSelector when finding a replacement target', () => {
    // beforeEach already applied vi.useFakeTimers()
    document.body.innerHTML =
      '<div id="target"></div><div id="custom-replacement" class="custom-log"></div>';
    const target = document.getElementById('target')!;
    const querySpy = vi.spyOn(document, 'querySelector');

    const observer = createStableMutationObserver(vi.fn(), {
      reconnectOnDetach: true,
      reconnectSelector: '.custom-log',
    });
    observer.observe(target, { childList: true });

    // Remove target to trigger reconnect attempt
    target.remove();
    vi.advanceTimersByTime(5000);

    // The spy should have been called with the custom selector
    const reconnectCalls = querySpy.mock.calls.filter(([sel]) => sel === '.custom-log');
    expect(reconnectCalls.length).toBeGreaterThan(0);

    querySpy.mockRestore();
    observer.disconnect();
  });
});
