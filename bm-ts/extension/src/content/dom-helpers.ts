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
