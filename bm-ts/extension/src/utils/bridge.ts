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
 * Sends a typed `BackgroundMessage` to the background service worker and returns
 * its response payload as a Promise.
 *
 * Rejects if:
 * - `chrome.runtime.lastError` is set (extension context invalidated, etc.)
 * - The background script returns `{ success: false }` — the rejection carries
 *   `.status` and `.data` extra properties mirroring the `ApiError` shape so
 *   callers can distinguish HTTP error codes.
 */
export function sendExtensionMessage<T>(message: BackgroundMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: BackgroundResponse<T>) => {
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
