/**
 * content/api.ts — Thin wrapper used by the content script to communicate with
 * the background service worker.
 *
 * Content scripts cannot call the backend directly (CORS) so every API call is
 * proxied through the background via `chrome.runtime.sendMessage`.
 * This module re-exports `sendExtensionMessage` under a content-script-specific
 * name to make intent clear at the call site.
 */

import type { BackgroundMessage } from '../utils/messages';
import { sendExtensionMessage } from '../utils/bridge';

/**
 * Sends a `BackgroundMessage` to the background service worker from within a
 * content script context and returns the typed response payload.
 */
export function sendContentMessage<T>(message: BackgroundMessage): Promise<T> {
  return sendExtensionMessage(message);
}
