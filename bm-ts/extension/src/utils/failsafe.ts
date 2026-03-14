/**
 * failsafe.ts — Fail-safe mechanisms for Meta/Facebook compliance.
 *
 * Implements:
 *  - Aggregate rate limiting (hourly / daily / weekly caps)
 *  - Emergency kill-switch (abort-in-progress flag + 24h cooldown)
 *  - Activity log (last 50 events visible in popup)
 *  - User-activity dependency (visibility + interaction checks)
 *  - Facebook restriction detection helpers
 *  - Confirmation mode setting
 *  - Escalating backoff on send failures
 */

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const RATE_LIMIT_KEY = 'bm_rate_limits';
const EMERGENCY_STOP_KEY = 'bm_emergency_stop';
const ACTIVITY_LOG_KEY = 'bm_activity_log';
const CONFIRMATION_MODE_KEY = 'bm_confirmation_mode';
const FAILURE_BACKOFF_KEY = 'bm_failure_backoff';

// ---------------------------------------------------------------------------
// Confirmation mode
// ---------------------------------------------------------------------------

export type ConfirmationMode = 'each' | 'session';

export async function getConfirmationMode(): Promise<ConfirmationMode> {
  const result = await chrome.storage.local.get(CONFIRMATION_MODE_KEY);
  const val = result[CONFIRMATION_MODE_KEY];
  if (val === 'each' || val === 'session') return val;
  return 'each'; // default: safest mode
}

export async function setConfirmationMode(mode: ConfirmationMode): Promise<void> {
  await chrome.storage.local.set({ [CONFIRMATION_MODE_KEY]: mode });
}

// ---------------------------------------------------------------------------
// Aggregate rate limiting
// ---------------------------------------------------------------------------

interface RateLimitRecord {
  /** Timestamps (ISO) of every message sent, pruned to 7-day window. */
  timestamps: string[];
}

// Caps aligned with MANIFEST_AND_FAILSAFE_PLAN.md (line 59):
// 1/hour, 3/day, 5/week.
const HOURLY_CAP = 1;
const DAILY_CAP = 3;
const WEEKLY_CAP = 5;

async function getRateLimitRecord(): Promise<RateLimitRecord> {
  const result = await chrome.storage.local.get(RATE_LIMIT_KEY);
  return result[RATE_LIMIT_KEY] ?? { timestamps: [] };
}

async function saveRateLimitRecord(record: RateLimitRecord): Promise<void> {
  await chrome.storage.local.set({ [RATE_LIMIT_KEY]: record });
}

/** Prune timestamps older than 7 days. */
function pruneTimestamps(timestamps: string[]): string[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return timestamps.filter((ts) => new Date(ts).getTime() > weekAgo);
}

function countInWindow(timestamps: string[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((ts) => new Date(ts).getTime() > cutoff).length;
}

export interface RateLimitStatus {
  allowed: boolean;
  reason?: string;
  hourly: { used: number; cap: number };
  daily: { used: number; cap: number };
  weekly: { used: number; cap: number };
}

export async function checkRateLimit(): Promise<RateLimitStatus> {
  const record = await getRateLimitRecord();
  const ts = pruneTimestamps(record.timestamps);

  const hourly = countInWindow(ts, 60 * 60 * 1000);
  const daily = countInWindow(ts, 24 * 60 * 60 * 1000);
  const weekly = ts.length;

  const status: RateLimitStatus = {
    allowed: true,
    hourly: { used: hourly, cap: HOURLY_CAP },
    daily: { used: daily, cap: DAILY_CAP },
    weekly: { used: weekly, cap: WEEKLY_CAP },
  };

  if (hourly >= HOURLY_CAP) {
    status.allowed = false;
    status.reason = `Hourly limit reached (${HOURLY_CAP} messages/hour). Wait before sending more.`;
  } else if (daily >= DAILY_CAP) {
    status.allowed = false;
    status.reason = `Daily limit reached (${DAILY_CAP} messages/day). Automation paused until tomorrow.`;
  } else if (weekly >= WEEKLY_CAP) {
    status.allowed = false;
    status.reason = `Weekly limit reached (${WEEKLY_CAP} messages/7 days). Try again later.`;
  }

  return status;
}

export async function recordMessageSent(): Promise<void> {
  const record = await getRateLimitRecord();
  record.timestamps = pruneTimestamps(record.timestamps);
  record.timestamps.push(new Date().toISOString());
  await saveRateLimitRecord(record);
}

export async function getRateLimitSummary(): Promise<RateLimitStatus> {
  return checkRateLimit();
}

// ---------------------------------------------------------------------------
// Emergency kill-switch
// ---------------------------------------------------------------------------

interface EmergencyStopState {
  active: boolean;
  /** ISO timestamp when the stop was triggered. */
  triggeredAt: string | null;
  /** ISO timestamp when the cooldown expires (if set). */
  cooldownUntil: string | null;
}

export async function getEmergencyStopState(): Promise<EmergencyStopState> {
  const result = await chrome.storage.local.get(EMERGENCY_STOP_KEY);
  return result[EMERGENCY_STOP_KEY] ?? { active: false, triggeredAt: null, cooldownUntil: null };
}

export async function triggerEmergencyStop(cooldownHours = 24): Promise<void> {
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + cooldownHours * 60 * 60 * 1000);
  await chrome.storage.local.set({
    [EMERGENCY_STOP_KEY]: {
      active: true,
      triggeredAt: now.toISOString(),
      cooldownUntil: cooldownUntil.toISOString(),
    },
  });
  // Clear any automation alarms immediately
  try {
    await chrome.alarms.clear('birthday-check-alarm');
  } catch {
    // alarms permission may not be granted yet
  }
  await addActivityLogEntry('emergency', 'Emergency stop activated — all automation paused');
}

export async function clearEmergencyStop(): Promise<void> {
  await chrome.storage.local.set({
    [EMERGENCY_STOP_KEY]: { active: false, triggeredAt: null, cooldownUntil: null },
  });
  await addActivityLogEntry('info', 'Emergency stop cleared — automation can resume');
}

export async function isEmergencyStopActive(): Promise<boolean> {
  const state = await getEmergencyStopState();
  if (!state.active) return false;
  // Check if cooldown has expired
  if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() < Date.now()) {
    await clearEmergencyStop();
    return false;
  }
  return true;
}

/** Flag checked by the content script automation loop to abort mid-run. */
const SHOULD_ABORT_KEY = 'bm_should_abort';

export async function setShouldAbort(abort: boolean): Promise<void> {
  await chrome.storage.local.set({ [SHOULD_ABORT_KEY]: abort });
}

export async function shouldAbort(): Promise<boolean> {
  const result = await chrome.storage.local.get(SHOULD_ABORT_KEY);
  return result[SHOULD_ABORT_KEY] === true;
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export type ActivityLogLevel = 'info' | 'send' | 'post' | 'warning' | 'error' | 'emergency';

export interface ActivityLogEntry {
  timestamp: string;
  level: ActivityLogLevel;
  message: string;
}

const MAX_LOG_ENTRIES = 50;

export async function getActivityLog(): Promise<ActivityLogEntry[]> {
  const result = await chrome.storage.local.get(ACTIVITY_LOG_KEY);
  return result[ACTIVITY_LOG_KEY] ?? [];
}

export async function addActivityLogEntry(
  level: ActivityLogLevel,
  message: string,
): Promise<void> {
  const log = await getActivityLog();
  log.unshift({
    timestamp: new Date().toISOString(),
    level,
    message,
  });
  // Keep only the most recent entries
  if (log.length > MAX_LOG_ENTRIES) log.length = MAX_LOG_ENTRIES;
  await chrome.storage.local.set({ [ACTIVITY_LOG_KEY]: log });
}

export async function clearActivityLog(): Promise<void> {
  await chrome.storage.local.remove(ACTIVITY_LOG_KEY);
}

// ---------------------------------------------------------------------------
// Escalating backoff on send failures
// ---------------------------------------------------------------------------

interface FailureBackoffState {
  consecutiveFailures: number;
  pausedUntil: string | null;
}

export async function getFailureBackoff(): Promise<FailureBackoffState> {
  const result = await chrome.storage.local.get(FAILURE_BACKOFF_KEY);
  return result[FAILURE_BACKOFF_KEY] ?? { consecutiveFailures: 0, pausedUntil: null };
}

async function saveFailureBackoff(state: FailureBackoffState): Promise<void> {
  await chrome.storage.local.set({ [FAILURE_BACKOFF_KEY]: state });
}

/**
 * Called after a message send fails. Implements escalating backoff:
 *   1st failure → 10 min pause
 *   2nd failure → 30 min pause
 *   3rd failure → 24 hour pause (auto emergency stop)
 *
 * Returns true if automation should be paused.
 */
export async function recordSendFailure(): Promise<{ shouldPause: boolean; pauseMinutes: number }> {
  const state = await getFailureBackoff();
  state.consecutiveFailures += 1;

  let pauseMinutes = 0;
  let shouldPause = false;

  if (state.consecutiveFailures >= 3) {
    pauseMinutes = 24 * 60;
    shouldPause = true;
    await triggerEmergencyStop(24);
    await addActivityLogEntry(
      'emergency',
      `3 consecutive send failures — automation paused for 24 hours`,
    );
  } else if (state.consecutiveFailures === 2) {
    pauseMinutes = 30;
    shouldPause = true;
    state.pausedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await addActivityLogEntry('warning', 'Second consecutive send failure — pausing for 30 minutes');
  } else {
    pauseMinutes = 10;
    shouldPause = true;
    state.pausedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await addActivityLogEntry('warning', 'Send failure detected — pausing for 10 minutes');
  }

  await saveFailureBackoff(state);
  return { shouldPause, pauseMinutes };
}

export async function recordSendSuccess(): Promise<void> {
  await saveFailureBackoff({ consecutiveFailures: 0, pausedUntil: null });
}

export async function isBackoffPaused(): Promise<boolean> {
  const state = await getFailureBackoff();
  if (!state.pausedUntil) return false;
  if (new Date(state.pausedUntil).getTime() < Date.now()) {
    // Pause expired, reset
    await saveFailureBackoff({ ...state, pausedUntil: null });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Facebook restriction detection
// ---------------------------------------------------------------------------

/** Strings Facebook shows when an account is restricted. */
const RESTRICTION_INDICATORS = [
  'temporarily blocked',
  'unusual activity',
  'confirm your identity',
  'you\'re temporarily restricted',
  'action blocked',
  'try again later',
  'we limit how often',
  'you can\'t use this feature',
  'your account has been locked',
];

/** URLs that indicate a checkpoint / restriction. */
const CHECKPOINT_URL_PATTERNS = [
  'facebook.com/checkpoint/',
  'facebook.com/help/contact/',
  'facebook.com/login/identify',
];

/**
 * Checks the current page for signs that Facebook has flagged/restricted the account.
 * Run from the content script after each send attempt.
 */
export function detectFacebookRestriction(): { restricted: boolean; reason?: string } {
  // Check URL
  const url = window.location.href.toLowerCase();
  for (const pattern of CHECKPOINT_URL_PATTERNS) {
    if (url.includes(pattern)) {
      return { restricted: true, reason: `Redirected to checkpoint: ${url}` };
    }
  }

  // Check page content for restriction indicators
  const bodyText = document.body?.innerText?.toLowerCase() ?? '';
  for (const indicator of RESTRICTION_INDICATORS) {
    if (bodyText.includes(indicator)) {
      // Verify it's in a prominent element (not just a random comment)
      const alertElements = document.querySelectorAll(
        '[role="alert"], [role="dialog"], [data-testid*="error"], [data-testid*="warning"]',
      );
      for (const el of alertElements) {
        if (el.textContent?.toLowerCase().includes(indicator)) {
          return { restricted: true, reason: `Facebook alert: "${indicator}"` };
        }
      }
      // Also check large headings
      const headings = document.querySelectorAll('h1, h2, h3, [role="heading"]');
      for (const h of headings) {
        if (h.textContent?.toLowerCase().includes(indicator)) {
          return { restricted: true, reason: `Facebook warning: "${indicator}"` };
        }
      }
    }
  }

  return { restricted: false };
}

// ---------------------------------------------------------------------------
// User activity tracking (content script side)
// ---------------------------------------------------------------------------

let lastUserInteraction = Date.now();

/** Call once from the content script to start tracking user interaction. */
export function initUserActivityTracking(): void {
  const update = () => {
    lastUserInteraction = Date.now();
  };
  document.addEventListener('click', update, { passive: true });
  document.addEventListener('scroll', update, { passive: true });
  document.addEventListener('keypress', update, { passive: true });
}

/** Returns true if the tab is visible and user interacted in the last 5 minutes. */
export function isUserActive(): boolean {
  if (document.visibilityState !== 'visible') return false;
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() - lastUserInteraction < fiveMinutes;
}

// ---------------------------------------------------------------------------
// Alarms permission helper (since alarms is now optional)
// ---------------------------------------------------------------------------

export async function requestAlarmsPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Ensure the permissions API is available before using it.
      if (
        typeof chrome === 'undefined' ||
        !chrome.permissions ||
        typeof chrome.permissions.contains !== 'function' ||
        typeof chrome.permissions.request !== 'function'
      ) {
        resolve(false);
        return;
      }

      chrome.permissions.contains({ permissions: ['alarms'] }, (has) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          // Permission check failed; treat as not granted.
          resolve(false);
          return;
        }

        if (has) {
          resolve(true);
          return;
        }

        chrome.permissions.request({ permissions: ['alarms'] }, (granted) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            // Permission request failed; treat as not granted.
            resolve(false);
            return;
          }

          resolve(Boolean(granted));
        });
      });
    } catch (_e) {
      // Any synchronous error (e.g., API not available) results in a safe fallback.
      resolve(false);
    }
  });
}

/** Alias kept for backwards-compatibility with background/index.ts */
export const ensureAlarmsPermission = requestAlarmsPermission;
