/**
 * Tests for src/utils/failsafe.ts
 *
 * The chrome.storage.local and chrome.alarms mocks are provided globally by
 * src/test-setup.ts.  Each test starts with a clean in-memory store.
 */

import { describe, it, expect } from 'vitest';
import {
  getConfirmationMode,
  setConfirmationMode,
  checkRateLimit,
  recordMessageSent,
  getRateLimitSummary,
  getEmergencyStopState,
  triggerEmergencyStop,
  clearEmergencyStop,
  isEmergencyStopActive,
  setShouldAbort,
  shouldAbort,
  getActivityLog,
  addActivityLogEntry,
  clearActivityLog,
  recordSendFailure,
  recordSendSuccess,
  isBackoffPaused,
} from '../failsafe';

// ---------------------------------------------------------------------------
// Confirmation mode
// ---------------------------------------------------------------------------

describe('confirmationMode', () => {
  it('defaults to "each" when nothing is stored', async () => {
    expect(await getConfirmationMode()).toBe('each');
  });

  it('persists "session" mode', async () => {
    await setConfirmationMode('session');
    expect(await getConfirmationMode()).toBe('session');
  });

  it('persists "each" mode', async () => {
    await setConfirmationMode('session');
    await setConfirmationMode('each');
    expect(await getConfirmationMode()).toBe('each');
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  it('allows sending when no messages have been sent', async () => {
    const status = await checkRateLimit();
    expect(status.allowed).toBe(true);
    expect(status.hourly.used).toBe(0);
    expect(status.daily.used).toBe(0);
    expect(status.weekly.used).toBe(0);
  });

  it('blocks after hourly cap (10/hour) is reached', async () => {
    // Send 10 messages to hit the hourly cap
    for (let i = 0; i < 10; i++) {
      await recordMessageSent();
    }
    const status = await checkRateLimit();
    expect(status.allowed).toBe(false);
    expect(status.reason).toContain('Hourly limit');
    expect(status.hourly.used).toBe(10);
    expect(status.hourly.cap).toBe(10);
  });

  it('blocks after daily cap (20/day) is reached', async () => {
    // Simulate 20 messages sent at different hours today (all outside the hourly window)
    const now = Date.now();
    const timestamps: string[] = [];
    for (let i = 0; i < 20; i++) {
      // Spread across 2-22 hours ago so none cluster within the 1-hour window
      timestamps.push(new Date(now - (2 + i) * 60 * 60 * 1000).toISOString());
    }
    await chrome.storage.local.set({ bm_rate_limits: { timestamps } });

    const status = await checkRateLimit();
    expect(status.allowed).toBe(false);
    expect(status.reason).toContain('Daily limit');
    expect(status.daily.used).toBe(20);
    expect(status.daily.cap).toBe(20);
  });

  it('blocks after weekly cap (50/week) is reached', async () => {
    const now = Date.now();
    // Spread 50 timestamps across the last 7 days, all outside the hourly and daily windows
    const timestamps: string[] = [];
    for (let i = 0; i < 50; i++) {
      // Spread evenly across ~2-7 days ago
      const hoursAgo = 48 + i * 2.4; // 48h to ~168h ago
      timestamps.push(new Date(now - hoursAgo * 60 * 60 * 1000).toISOString());
    }
    await chrome.storage.local.set({ bm_rate_limits: { timestamps } });

    const status = await checkRateLimit();
    expect(status.allowed).toBe(false);
    expect(status.reason).toContain('Weekly limit');
    expect(status.weekly.used).toBe(50);
    expect(status.weekly.cap).toBe(50);
  });

  it('prunes timestamps older than 7 days', async () => {
    const now = Date.now();
    const timestamps = [
      new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago — stale
      new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago — stale
    ];
    await chrome.storage.local.set({ bm_rate_limits: { timestamps } });

    const status = await checkRateLimit();
    expect(status.allowed).toBe(true);
    expect(status.weekly.used).toBe(0);
  });
});

describe('recordMessageSent', () => {
  it('adds a timestamp to the rate limit record', async () => {
    await recordMessageSent();
    const status = await checkRateLimit();
    expect(status.hourly.used).toBe(1);
  });

  it('accumulates timestamps across calls', async () => {
    // Simulate two sends at different times by writing directly
    const now = Date.now();
    const timestamps = [
      new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hrs ago
    ];
    await chrome.storage.local.set({ bm_rate_limits: { timestamps } });

    await recordMessageSent();
    const status = await checkRateLimit();
    expect(status.daily.used).toBe(2);
  });
});

describe('getRateLimitSummary', () => {
  it('returns the same data as checkRateLimit', async () => {
    await recordMessageSent();
    const summary = await getRateLimitSummary();
    const check = await checkRateLimit();
    expect(summary.allowed).toBe(check.allowed);
    expect(summary.hourly).toEqual(check.hourly);
  });
});

// ---------------------------------------------------------------------------
// Emergency stop
// ---------------------------------------------------------------------------

describe('emergencyStop', () => {
  it('defaults to inactive', async () => {
    const state = await getEmergencyStopState();
    expect(state.active).toBe(false);
    expect(state.triggeredAt).toBeNull();
    expect(state.cooldownUntil).toBeNull();
  });

  it('isEmergencyStopActive returns false when inactive', async () => {
    expect(await isEmergencyStopActive()).toBe(false);
  });

  it('triggerEmergencyStop activates the stop', async () => {
    await triggerEmergencyStop(1);
    const state = await getEmergencyStopState();
    expect(state.active).toBe(true);
    expect(state.triggeredAt).toBeTruthy();
    expect(state.cooldownUntil).toBeTruthy();
  });

  it('isEmergencyStopActive returns true after trigger', async () => {
    await triggerEmergencyStop(24);
    expect(await isEmergencyStopActive()).toBe(true);
  });

  it('clearEmergencyStop deactivates the stop', async () => {
    await triggerEmergencyStop(24);
    await clearEmergencyStop();
    expect(await isEmergencyStopActive()).toBe(false);
    const state = await getEmergencyStopState();
    expect(state.active).toBe(false);
  });

  it('triggerEmergencyStop adds an activity log entry', async () => {
    await triggerEmergencyStop(24);
    const log = await getActivityLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].level).toBe('emergency');
    expect(log[0].message).toContain('Emergency stop activated');
  });

  it('clearEmergencyStop adds an activity log entry', async () => {
    await triggerEmergencyStop(24);
    await clearEmergencyStop();
    const log = await getActivityLog();
    expect(log[0].level).toBe('info');
    expect(log[0].message).toContain('Emergency stop cleared');
  });

  it('auto-clears when cooldown expires', async () => {
    // Trigger with a cooldown that is already expired
    const pastCooldown = new Date(Date.now() - 1000).toISOString();
    await chrome.storage.local.set({
      bm_emergency_stop: {
        active: true,
        triggeredAt: new Date().toISOString(),
        cooldownUntil: pastCooldown,
      },
    });
    expect(await isEmergencyStopActive()).toBe(false);
  });

  it('clears birthday-check-alarm on trigger', async () => {
    await triggerEmergencyStop(24);
    expect(chrome.alarms.clear).toHaveBeenCalledWith('birthday-check-alarm');
  });
});

// ---------------------------------------------------------------------------
// Should abort flag
// ---------------------------------------------------------------------------

describe('shouldAbort', () => {
  it('defaults to false', async () => {
    expect(await shouldAbort()).toBe(false);
  });

  it('returns true after setShouldAbort(true)', async () => {
    await setShouldAbort(true);
    expect(await shouldAbort()).toBe(true);
  });

  it('returns false after setShouldAbort(false)', async () => {
    await setShouldAbort(true);
    await setShouldAbort(false);
    expect(await shouldAbort()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

describe('activityLog', () => {
  it('starts empty', async () => {
    expect(await getActivityLog()).toEqual([]);
  });

  it('addActivityLogEntry adds an entry at the front', async () => {
    await addActivityLogEntry('info', 'First message');
    await addActivityLogEntry('warning', 'Second message');
    const log = await getActivityLog();
    expect(log.length).toBe(2);
    expect(log[0].message).toBe('Second message');
    expect(log[0].level).toBe('warning');
    expect(log[1].message).toBe('First message');
  });

  it('entries have a timestamp', async () => {
    await addActivityLogEntry('send', 'Sent a message');
    const log = await getActivityLog();
    expect(log[0].timestamp).toBeTruthy();
    expect(new Date(log[0].timestamp).getTime()).toBeGreaterThan(0);
  });

  it('caps at 50 entries', async () => {
    for (let i = 0; i < 55; i++) {
      await addActivityLogEntry('info', `Entry ${i}`);
    }
    const log = await getActivityLog();
    expect(log.length).toBe(50);
    // Most recent entry should be Entry 54
    expect(log[0].message).toBe('Entry 54');
  });

  it('clearActivityLog removes all entries', async () => {
    await addActivityLogEntry('info', 'Hello');
    await clearActivityLog();
    expect(await getActivityLog()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Escalating failure backoff
// ---------------------------------------------------------------------------

describe('failureBackoff', () => {
  it('isBackoffPaused returns false initially', async () => {
    expect(await isBackoffPaused()).toBe(false);
  });

  it('1st failure → 10 min pause', async () => {
    const result = await recordSendFailure();
    expect(result.shouldPause).toBe(true);
    expect(result.pauseMinutes).toBe(10);
    expect(await isBackoffPaused()).toBe(true);
  });

  it('2nd consecutive failure → 30 min pause', async () => {
    await recordSendFailure();
    const result = await recordSendFailure();
    expect(result.shouldPause).toBe(true);
    expect(result.pauseMinutes).toBe(30);
  });

  it('3rd consecutive failure → 24 hr pause + emergency stop', async () => {
    await recordSendFailure();
    await recordSendFailure();
    const result = await recordSendFailure();
    expect(result.shouldPause).toBe(true);
    expect(result.pauseMinutes).toBe(24 * 60);
    expect(await isEmergencyStopActive()).toBe(true);
  });

  it('recordSendSuccess resets consecutive failures', async () => {
    await recordSendFailure();
    await recordSendFailure();
    await recordSendSuccess();
    // After success, next failure should be treated as 1st
    const result = await recordSendFailure();
    expect(result.pauseMinutes).toBe(10);
  });

  it('isBackoffPaused returns false after pause expires', async () => {
    // Manually set an expired pause
    await chrome.storage.local.set({
      bm_failure_backoff: {
        consecutiveFailures: 1,
        pausedUntil: new Date(Date.now() - 1000).toISOString(),
      },
    });
    expect(await isBackoffPaused()).toBe(false);
  });

  it('failure backoff adds activity log entries', async () => {
    await recordSendFailure();
    const log = await getActivityLog();
    expect(log.some((e) => e.level === 'warning' && e.message.includes('10 minutes'))).toBe(true);
  });
});
