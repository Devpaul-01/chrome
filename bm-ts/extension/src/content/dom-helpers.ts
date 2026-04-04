/**
 * dom-helpers.ts — Shared DOM utility functions for content scripts.
 */

/**
 * Wait for an element to appear in the DOM.
 */
export async function waitForElement(
  selector: string,
  timeout = 10_000,
  parent: Document | HTMLElement = document,
): Promise<HTMLElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = parent.querySelector<HTMLElement>(selector);
    if (element) {
      return element;
    }
    await delay(100);
  }

  return null;
}

/**
 * Delay execution for specified milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Try multiple CSS selectors in order, returning the first match.
 * Falls back to an optional predicate-based search on a broad selector.
 */
export function trySelectors<T extends HTMLElement = HTMLElement>(
  selectors: string[],
  root: Document | HTMLElement = document,
  fallback?: { broadSelector: string; predicate: (el: Element) => boolean },
): T | null {
  for (const selector of selectors) {
    const el = root.querySelector<T>(selector);
    if (el) return el;
  }
  if (fallback) {
    const els = Array.from(root.querySelectorAll(fallback.broadSelector));
    return (els.find(fallback.predicate) as T) ?? null;
  }
  return null;
}

/**
 * Try multiple CSS selectors and return ALL matches across all selectors (deduplicated).
 */
export function trySelectorsAll<T extends HTMLElement = HTMLElement>(
  selectors: string[],
  root: Document | HTMLElement = document,
): T[] {
  const seen = new Set<T>();
  for (const selector of selectors) {
    root.querySelectorAll<T>(selector).forEach((el) => seen.add(el));
  }
  return Array.from(seen);
}

/**
 * Retry an async operation with exponential backoff.
 * @param fn        The async function to retry
 * @param maxRetries Maximum number of retry attempts (default 3)
 * @param baseDelay Initial delay in ms before first retry (default 1000)
 * @returns The result of the function, or throws the last error
 */
export async function retryOperation<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const jitter = Math.random() * 0.3 + 0.85; // 0.85–1.15
        const backoffDelay = baseDelay * Math.pow(2, attempt) * jitter;
        console.warn(
          `[BM] Retry ${attempt + 1}/${maxRetries} after ${Math.round(backoffDelay)}ms: ${lastError.message}`,
        );
        await delay(backoffDelay);
      }
    }
  }
  throw lastError;
}

/**
 * Creates a debounced version of the given function.
 * The function will only be called after `waitMs` has elapsed since the last invocation.
 */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, waitMs: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  }) as unknown as T;
}

/**
 * Creates a MutationObserver with stability improvements:
 * - Debounced callback to prevent rapid-fire processing
 * - Error handling in callback
 * - Automatic cleanup on target removal from DOM
 * - Returns a cleanup function
 */
export function createStableMutationObserver(
  callback: (mutations: MutationRecord[]) => void | Promise<void>,
  options: {
    debounceMs?: number;
    onError?: (err: Error) => void;
    reconnectOnDetach?: boolean;
  } = {},
): {
  observe: (target: HTMLElement, config: MutationObserverInit) => void;
  disconnect: () => void;
} {
  const { debounceMs = 200, onError, reconnectOnDetach = false } = options;
  let observer: MutationObserver | null = null;
  let currentTarget: HTMLElement | null = null;
  let currentConfig: MutationObserverInit | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let detachCheckInterval: ReturnType<typeof setInterval> | undefined;
  let disconnected = false;

  const wrappedCallback = (mutations: MutationRecord[]) => {
    if (disconnected) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const result = callback(mutations);
        // Handle async callbacks
        if (result instanceof Promise) {
          result.catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('[BM Observer] Async callback error:', error);
            onError?.(error);
          });
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[BM Observer] Callback error:', error);
        onError?.(error);
      }
    }, debounceMs);
  };

  observer = new MutationObserver(wrappedCallback);

  return {
    observe(target: HTMLElement, config: MutationObserverInit) {
      currentTarget = target;
      currentConfig = config;
      disconnected = false;
      observer?.observe(target, config);

      // Periodically check if target is still in DOM
      if (reconnectOnDetach) {
        detachCheckInterval = setInterval(() => {
          if (disconnected) return;
          if (currentTarget && !document.contains(currentTarget)) {
            console.warn('[BM Observer] Target detached from DOM');
            observer?.disconnect();
            // Try to find a replacement target
            if (currentConfig) {
              const newTarget = document.querySelector<HTMLElement>(
                '[role="log"], [role="main"]',
              );
              if (newTarget) {
                console.log('[BM Observer] Reconnecting to new target');
                currentTarget = newTarget;
                observer?.observe(newTarget, currentConfig);
              }
            }
          }
        }, 5000);
      }
    },
    disconnect() {
      disconnected = true;
      clearTimeout(debounceTimer);
      clearInterval(detachCheckInterval);
      observer?.disconnect();
      observer = null;
      currentTarget = null;
      currentConfig = null;
    },
  };
}
