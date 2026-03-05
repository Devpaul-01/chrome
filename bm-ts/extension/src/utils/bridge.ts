/**
 * bridge.ts — Typed bridge between popup/content scripts and the background service worker.
 *
 * Chrome MV3 extensions communicate between contexts (popup, content script, background)
 * via `chrome.runtime.sendMessage`.  This module wraps that raw API into a single
 * Promise-based helper with proper error propagation.
 */

import type { BackgroundMessage } from './messages';

/** Envelope for every response sent back from `background/index.ts#handleMessage`. */
interface BackgroundResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    status: number;
    message: string;
    data?: unknown;
  };
}

/**
 * How long to wait for chrome.runtime.sendMessage to invoke its callback.
 *
 * The background `onMessage` listener now guarantees a response within 15 s via
 * its own guard timer, so 20 s is more than enough here while still giving a
 * fast, visible error when the backend is unreachable.
 */
const CALLBACK_TIMEOUT_MS = 20_000;
const HARD_TIMEOUT_MS = 25_000; // slightly longer than the per-attempt timeout

/** Returns true if the error looks like a sleeping MV3 service worker. */
function isWorkerSleeping(msg: string): boolean {
  return (
    msg.includes('Could not establish connection') ||
    msg.includes('Receiving end does not exist') ||
    msg.includes('Extension context invalidated')
  );
}

function attemptSend<T>(message: BackgroundMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Background message timed out'));
    }, CALLBACK_TIMEOUT_MS);

    chrome.runtime.sendMessage(message, (response: BackgroundResponse<T>) => {
      clearTimeout(timer);
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from background script'));
        return;
      }
      if (response.success) {
        resolve(response.data as T);
      } else {
        const err = new Error(response.error?.message ?? 'Unknown error');
        (err as any).status = response.error?.status;
        (err as any).data = response.error?.data;
        reject(err);
      }
    });
  });
}

/**
 * Sends a typed `BackgroundMessage` to the background service worker and returns
 * its response payload as a Promise.
 *
 * Automatically retries once if the service worker appears to be sleeping
 * (MV3 workers spin down after 30 s of inactivity; Chrome fires `lastError`
 * immediately in that case, so the retry adds minimal delay).
 *
 * Rejects if:
 * - The worker doesn't respond within `HARD_TIMEOUT_MS`
 * - `chrome.runtime.lastError` is set for a non-wakeup reason
 * - The background script returns `{ success: false }`
 */
export function sendExtensionMessage<T>(message: BackgroundMessage): Promise<T> {
  const deadline = Date.now() + HARD_TIMEOUT_MS;

  async function tryWithRetry(): Promise<T> {
    try {
      return await attemptSend<T>(message);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isWorkerSleeping(errMsg) && Date.now() < deadline) {
        // Chrome fires lastError immediately for a sleeping worker, then wakes
        // it. Workers typically start in 200-400 ms; wait 300 ms then retry.
        // If still not ready, wait another 500 ms and try once more.
        await new Promise((res) => setTimeout(res, 300));
        try {
          return await attemptSend<T>(message);
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          if (isWorkerSleeping(retryMsg) && Date.now() < deadline) {
            await new Promise((res) => setTimeout(res, 500));
            return await attemptSend<T>(message);
          }
          throw retryErr;
        }
      }
      throw err;
    }
  }

  // Apply a hard deadline across the entire operation.
  return Promise.race([
    tryWithRetry(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error('Background service worker did not respond in time')),
        HARD_TIMEOUT_MS,
      ),
    ),
  ]);
}
