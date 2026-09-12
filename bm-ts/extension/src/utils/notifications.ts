/**
 * notifications.ts — Chrome notification helpers for automation status.
 *
 * Uses chrome.notifications API to show OS-level notifications when:
 *  - Automation scan completes (success / partial / failure)
 *  - Automation is paused by failsafe (rate limit, backoff, emergency stop)
 *  - A new extension version is available
 */

const ICON_PATH = 'images/Birthday_messaging-logo.png';

/**
 * Check if the notifications permission is available.
 * It's an optional permission so we must check before using.
 */
function hasNotificationsApi(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.notifications !== 'undefined' &&
    typeof chrome.notifications.create === 'function'
  );
}

export interface NotificationOptions {
  id?: string;
  title: string;
  message: string;
  /** Defaults to 'basic' */
  type?: chrome.notifications.TemplateType;
  /** Override default icon */
  iconUrl?: string;
}

/**
 * Show a Chrome notification. No-ops if the notifications permission
 * is not available (graceful degradation).
 */
export function showNotification(options: NotificationOptions): void {
  if (!hasNotificationsApi()) return;

  const notificationId = options.id ?? `bm-${Date.now()}`;

  chrome.notifications.create(notificationId, {
    type: options.type ?? 'basic',
    iconUrl: options.iconUrl ?? ICON_PATH,
    title: options.title,
    message: options.message,
  });
}

// ---------------------------------------------------------------------------
// Pre-built notification helpers
// ---------------------------------------------------------------------------

export function notifyAutomationComplete(messagesSent: number): void {
  showNotification({
    id: 'bm-automation-complete',
    title: 'BirthdayMessaging — Automation Complete',
    message:
      messagesSent > 0
        ? `Sent ${messagesSent} birthday message${messagesSent === 1 ? '' : 's'} successfully.`
        : 'Automation scan finished — no messages to send right now.',
  });
}

export function notifyAutomationFailed(reason: string): void {
  showNotification({
    id: 'bm-automation-failed',
    title: 'BirthdayMessaging — Automation Issue',
    message: reason,
  });
}

export function notifyAutomationPaused(reason: string): void {
  showNotification({
    id: 'bm-automation-paused',
    title: 'BirthdayMessaging — Automation Paused',
    message: reason,
  });
}

export function notifyUpdateAvailable(currentVersion: string, latestVersion: string): void {
  showNotification({
    id: 'bm-update-available',
    title: 'BirthdayMessaging — Update Available',
    message: `A new version (${latestVersion}) is available. You are running ${currentVersion}.`,
  });
}
