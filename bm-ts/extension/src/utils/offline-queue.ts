/**
 * offline-queue.ts — Offline request queue for graceful offline support.
 *
 * When the browser is offline, queues outbound API messages to chrome.storage.local.
 * When connectivity is restored, replays them in order.
 *
 * Only *write* operations (create, update, delete, POST-like) are queued because
 * read operations need live data and would return stale results.
 */

import type { BackgroundMessage } from './messages';
import { sendExtensionMessage } from './bridge';

const QUEUE_KEY = 'bm_offline_queue';

/** Prefixes of message types that are safe to queue and replay later. */
const QUEUEABLE_PREFIXES = [
  'messages.updateQueued',
  'messages.cancelQueued',
  'messages.retryQueued',
  'messages.deleteHistory',
  // 'messageGroups.create',  // Commented out — feature not currently needed
  // 'messageGroups.update',
  // 'messageGroups.delete',
  'posts.create',
  'posts.update',
  'posts.delete',
  'images.create',
  'images.delete',
  'messageTemplates.create',
  'messageTemplates.update',
  'messageTemplates.delete',
  'templates.create',
  'templates.update',
  'templates.delete',
  'smtp.updateConfig',
  'schedules.create',
  'schedules.update',
  'schedules.delete',
  'automation.recordSent',
  'automation.clearSentToday',
  'failsafe.triggerEmergencyStop',
  'failsafe.clearEmergencyStop',
  'failsafe.clearActivityLog',
  'failsafe.setConfirmationMode',
  'contacts.bulkCreate',
];

interface QueuedItem {
  message: BackgroundMessage;
  timestamp: number;
}

/** Returns true if the given message type is safe to queue for offline replay. */
export function isQueueable(messageType: string): boolean {
  return QUEUEABLE_PREFIXES.includes(messageType);
}

/** Get the current offline queue from storage. */
export async function getOfflineQueue(): Promise<QueuedItem[]> {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  return (result[QUEUE_KEY] as QueuedItem[] | undefined) ?? [];
}

/** Persist the queue to storage. */
async function saveQueue(queue: QueuedItem[]): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

/** Add a message to the offline queue. */
export async function enqueue(message: BackgroundMessage): Promise<void> {
  const queue = await getOfflineQueue();
  queue.push({ message, timestamp: Date.now() });
  await saveQueue(queue);
}

/** Clear the entire queue. */
export async function clearOfflineQueue(): Promise<void> {
  await chrome.storage.local.remove(QUEUE_KEY);
}

/** Number of items currently queued. */
export async function getQueueLength(): Promise<number> {
  const queue = await getOfflineQueue();
  return queue.length;
}

/**
 * Replay all queued messages in order. Removes successfully sent items.
 * Returns the count of successfully replayed messages.
 */
export async function replayQueue(): Promise<number> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return 0;

  const failed: QueuedItem[] = [];
  let successCount = 0;

  for (const item of queue) {
    try {
      await sendExtensionMessage(item.message);
      successCount++;
    } catch {
      failed.push(item);
    }
  }

  if (failed.length > 0) {
    await saveQueue(failed);
  } else {
    await clearOfflineQueue();
  }

  return successCount;
}

/**
 * Returns true if the browser appears to be online.
 * Falls back to `true` if `navigator.onLine` is not available (e.g., in service worker).
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Initialise online/offline listeners. Call once from the popup or content script.
 * When going back online, automatically replays the queue.
 */
export function initOfflineListeners(
  onReplayComplete?: (replayedCount: number) => void,
): () => void {
  const handler = async () => {
    if (navigator.onLine) {
      const count = await replayQueue();
      onReplayComplete?.(count);
    }
  };

  window.addEventListener('online', handler);

  // Return a cleanup function
  return () => {
    window.removeEventListener('online', handler);
  };
}
