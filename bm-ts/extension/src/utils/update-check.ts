/**
 * update-check.ts — Version comparison and update notification.
 *
 * Checks the extension's current version against a known latest version
 * (stored in chrome.storage.local or fetched from the backend) and fires
 * a notification when an update is available.
 */

import { notifyUpdateAvailable } from './notifications';

const LAST_KNOWN_VERSION_KEY = 'bm_latest_known_version';
const UPDATE_CHECK_TIMESTAMP_KEY = 'bm_update_check_timestamp';

/** Minimum interval between update checks (12 hours). */
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Compare two semver version strings. Returns:
 *  - negative if a < b
 *  - 0 if a === b
 *  - positive if a > b
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Get the currently installed version from the manifest. */
export function getCurrentVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '0.0.0';
  }
}

/** Persist the latest known version so we don't repeat notifications. */
export async function setLatestKnownVersion(version: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_KNOWN_VERSION_KEY]: version });
}

/** Retrieve the latest known version from storage. */
export async function getLatestKnownVersion(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_KNOWN_VERSION_KEY);
  return (result[LAST_KNOWN_VERSION_KEY] as string | undefined) ?? null;
}

/**
 * Set a backend URL-based latest version and check if the user should be
 * notified. Call this with a version string received from the backend's
 * `/api/v1/version` endpoint (or similar).
 *
 * Returns true if an update notification was fired.
 */
export async function checkForUpdate(latestVersion: string): Promise<boolean> {
  const current = getCurrentVersion();

  if (compareVersions(current, latestVersion) >= 0) {
    // Current version is up-to-date (or newer)
    return false;
  }

  // Check if we already notified for this version
  const lastNotified = await getLatestKnownVersion();
  if (lastNotified && compareVersions(lastNotified, latestVersion) >= 0) {
    return false;
  }

  await setLatestKnownVersion(latestVersion);
  notifyUpdateAvailable(current, latestVersion);
  return true;
}

/**
 * Returns true if enough time has passed since the last update check.
 */
export async function shouldCheckForUpdate(): Promise<boolean> {
  const result = await chrome.storage.local.get(UPDATE_CHECK_TIMESTAMP_KEY);
  const lastCheck = result[UPDATE_CHECK_TIMESTAMP_KEY] as number | undefined;
  if (!lastCheck) return true;
  return Date.now() - lastCheck > CHECK_INTERVAL_MS;
}

/**
 * Record that an update check was performed.
 */
export async function recordUpdateCheck(): Promise<void> {
  await chrome.storage.local.set({ [UPDATE_CHECK_TIMESTAMP_KEY]: Date.now() });
}

/**
 * Handle the chrome.runtime.onInstalled event to show a post-update
 * notification when the extension is updated.
 */
export function handleInstallOrUpdate(details: chrome.runtime.InstalledDetails): void {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    import('./notifications').then(({ showNotification }) => {
      showNotification({
        id: 'bm-welcome',
        title: 'Welcome to BirthdayMessaging',
        message: 'Sign in or create an account to get started.',
      });
    });
    return;
  }

  if (details.reason === 'update' && details.previousVersion) {
    const current = getCurrentVersion();
    if (compareVersions(current, details.previousVersion) > 0) {
      // Extension was just updated
      import('./notifications').then(({ showNotification }) => {
        showNotification({
          id: 'bm-updated',
          title: 'BirthdayMessaging Updated',
          message: `Updated from v${details.previousVersion} to v${current}.`,
        });
      });
    }
  }
}
