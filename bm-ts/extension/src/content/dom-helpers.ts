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
          `[BM] Retry ${attempt + 1}/${maxRetries} after ${Math.round(backoffDelay)}ms: ${
            lastError.message
          }`,
        );
        await delay(backoffDelay);
      }
    }
  }
  throw lastError;
}

/**
 * Simulate a realistic mouse-click on an element by dispatching a full
 * pointer-event sequence (mouseover → mousedown → mouseup → click) with
 * plausible coordinates derived from the element's bounding rect.
 *
 * Raw `.click()` dispatches a `MouseEvent` with `(clientX=0, clientY=0)` and
 * no preceding pointer events — a trivially detectable automation signal.
 */
export async function simulateClick(element: HTMLElement): Promise<void> {
  const rect = element.getBoundingClientRect();
  // Pick a random point inside the element (avoid exact centre)
  const x = rect.left + rect.width * (0.3 + Math.random() * 0.4);
  const y = rect.top + rect.height * (0.3 + Math.random() * 0.4);

  const shared: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x + window.screenX,
    screenY: y + window.screenY,
    button: 0,
    buttons: 1,
  };

  element.dispatchEvent(new MouseEvent('mouseover', { ...shared, buttons: 0 }));
  await delay(30 + Math.random() * 50); // brief hover
  element.dispatchEvent(new MouseEvent('mousedown', shared));
  await delay(40 + Math.random() * 80); // human press duration
  element.dispatchEvent(new MouseEvent('mouseup', { ...shared, buttons: 0 }));
  element.dispatchEvent(new MouseEvent('click', { ...shared, buttons: 0 }));
}

/**
 * Simulate casual browsing behaviour between automated actions.
 *
 * Performs 2–4 small scroll movements with random pauses, mimicking a user
 * glancing at the feed between birthday messages.  This breaks the "send-only"
 * behavioural fingerprint that pure automation produces.
 *
 * Should be called between message sends inside the automation loop.
 */
export async function simulateBrowsing(): Promise<void> {
  const scrollCount = 2 + Math.floor(Math.random() * 3); // 2–4 scrolls
  for (let i = 0; i < scrollCount; i++) {
    const scrollAmount = 100 + Math.floor(Math.random() * 300); // 100–400px
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    await delay(800 + Math.random() * 2200); // 0.8–3s between scrolls
  }
  // Occasionally scroll back up a bit (30% chance) — humans overshoot
  if (Math.random() < 0.3) {
    window.scrollBy({ top: -(50 + Math.random() * 150), behavior: 'smooth' });
    await delay(500 + Math.random() * 1000);
  }
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
              const newTarget = document.querySelector<HTMLElement>('[role="log"], [role="main"]');
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

// ---------------------------------------------------------------------------
// Selector health-check
// ---------------------------------------------------------------------------

/**
 * Probe key Facebook DOM selectors and return a diagnostic report.
 *
 * Call once after page load on birthday-related pages to detect if Facebook
 * has changed their DOM structure.  The result is logged as a console warning
 * and can optionally be surfaced to the user via the activity log.
 */
export interface SelectorHealthReport {
  page: string;
  passed: string[];
  failed: string[];
  score: number; // 0–1
}

export function runSelectorHealthCheck(): SelectorHealthReport {
  const url = window.location.href;
  const probes: { label: string; selectors: string[] }[] = [];

  // Only probe selectors relevant to the current page
  if (url.includes('/birthdays') || url.includes('/friends/birthdays')) {
    probes.push(
      {
        label: 'birthday-card',
        selectors: ["div[data-pagelet*='Birthday']", "[role='feed'] div[role='article']"],
      },
      { label: 'friend-name', selectors: ['strong > span', 'strong', "[role='heading'] span"] },
      { label: 'profile-link', selectors: ["a[href*='facebook.com/']"] },
    );
  }

  if (url.includes('/messages')) {
    probes.push(
      { label: 'textbox', selectors: ["[role='textbox']", "div[contenteditable='true']"] },
      {
        label: 'send-button',
        selectors: ["button[aria-label='Send']", "div[aria-label='Send'] button"],
      },
    );
  }

  // Generic probes (all pages)
  probes.push(
    { label: 'main-content', selectors: ['[role="main"]'] },
    {
      label: 'message-button',
      selectors: [
        "div[aria-label='Message']",
        "a[aria-label='Message']",
        "[role='button'][aria-label*='Message']",
      ],
    },
  );

  const passed: string[] = [];
  const failed: string[] = [];

  for (const probe of probes) {
    const found = probe.selectors.some((s) => document.querySelector(s) !== null);
    (found ? passed : failed).push(probe.label);
  }

  const score = probes.length > 0 ? passed.length / probes.length : 1;

  if (failed.length > 0) {
    console.warn(
      `[BM Health] Selector health-check: ${passed.length}/${probes.length} passed. ` +
        `Failed: ${failed.join(', ')}. Facebook may have updated their DOM.`,
    );
  }

  return { page: url, passed, failed, score };
}
