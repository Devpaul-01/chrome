/**
 * Tests for src/utils/automation.ts
 *
 * The chrome.storage.local and chrome.alarms mocks are provided globally by
 * src/test-setup.ts.  Each test starts with a clean in-memory store.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getAutomationConfig,
  saveAutomationConfig,
  updateAutomationEnabled,
  updateCheckInterval,
  updateLastCheck,
  updateMaxMessages,
  getSentToday,
  addToSentToday,
  clearSentToday,
  getActionDelayMinutes,
  setActionDelayMinutes,
  type AutomationConfig,
} from '../automation';

// ---------------------------------------------------------------------------
// getAutomationConfig — defaults
// ---------------------------------------------------------------------------

describe('getAutomationConfig', () => {
  it('returns default config when nothing is stored', async () => {
    const config = await getAutomationConfig();
    expect(config.enabled).toBe(false);
    expect(config.checkInterval).toBe(60);
    expect(config.lastCheck).toBeNull();
    expect(config.nextCheck).toBeNull();
    expect(config.maxMessages).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// saveAutomationConfig / getAutomationConfig round-trip
// ---------------------------------------------------------------------------

describe('saveAutomationConfig', () => {
  it('persists and retrieves a custom config', async () => {
    const cfg: AutomationConfig = {
      enabled: true,
      checkInterval: 30,
      lastCheck: '2026-01-01T00:00:00.000Z',
      nextCheck: '2026-01-01T00:30:00.000Z',
      maxMessages: 5,
    };
    await saveAutomationConfig(cfg);
    const loaded = await getAutomationConfig();
    expect(loaded).toEqual(cfg);
  });
});

// ---------------------------------------------------------------------------
// updateAutomationEnabled
// ---------------------------------------------------------------------------

describe('updateAutomationEnabled', () => {
  it('sets enabled=true and schedules an alarm', async () => {
    const config = await updateAutomationEnabled(true);
    expect(config.enabled).toBe(true);
    expect(config.nextCheck).not.toBeNull();
    expect(chrome.alarms.create).toHaveBeenCalledOnce();
  });

  it('sets enabled=false and clears the alarm', async () => {
    // First enable, then disable
    await updateAutomationEnabled(true);
    const config = await updateAutomationEnabled(false);
    expect(config.enabled).toBe(false);
    expect(config.nextCheck).toBeNull();
    expect(chrome.alarms.clear).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateCheckInterval
// ---------------------------------------------------------------------------

describe('updateCheckInterval', () => {
  it('updates checkInterval in storage', async () => {
    await saveAutomationConfig({
      enabled: false,
      checkInterval: 60,
      lastCheck: null,
      nextCheck: null,
      maxMessages: 0,
    });
    const result = await updateCheckInterval(15);
    expect(result.checkInterval).toBe(15);
    const stored = await getAutomationConfig();
    expect(stored.checkInterval).toBe(15);
  });

  it('reschedules alarm when automation is enabled', async () => {
    // Save enabled config first
    await saveAutomationConfig({
      enabled: true,
      checkInterval: 60,
      lastCheck: null,
      nextCheck: null,
      maxMessages: 0,
    });
    await updateCheckInterval(20);
    expect(chrome.alarms.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateLastCheck
// ---------------------------------------------------------------------------

describe('updateLastCheck', () => {
  it('sets lastCheck to today ISO string', async () => {
    await updateLastCheck();
    const config = await getAutomationConfig();
    expect(config.lastCheck).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// updateMaxMessages
// ---------------------------------------------------------------------------

describe('updateMaxMessages', () => {
  it('clamps negative values to 0', async () => {
    const result = await updateMaxMessages(-5);
    expect(result.maxMessages).toBe(0);
  });

  it('floors decimal values', async () => {
    const result = await updateMaxMessages(3.9);
    expect(result.maxMessages).toBe(3);
  });

  it('accepts 0 (unlimited)', async () => {
    const result = await updateMaxMessages(0);
    expect(result.maxMessages).toBe(0);
  });

  it('persists the value', async () => {
    await updateMaxMessages(10);
    const stored = await getAutomationConfig();
    expect(stored.maxMessages).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getSentToday / addToSentToday / clearSentToday
// ---------------------------------------------------------------------------

describe('getSentToday', () => {
  it('returns empty array on fresh store', async () => {
    expect(await getSentToday()).toEqual([]);
  });
});

describe('addToSentToday / getSentToday', () => {
  it('adds a friend id and retrieves it', async () => {
    await addToSentToday('alice_profile_url');
    const list = await getSentToday();
    expect(list).toContain('alice_profile_url');
  });

  it('does not add the same id twice', async () => {
    await addToSentToday('alice');
    await addToSentToday('alice');
    const list = await getSentToday();
    expect(list.filter((x) => x === 'alice')).toHaveLength(1);
  });

  it('accumulates multiple distinct ids', async () => {
    await addToSentToday('alice');
    await addToSentToday('bob');
    const list = await getSentToday();
    expect(list).toContain('alice');
    expect(list).toContain('bob');
    expect(list).toHaveLength(2);
  });

  it('resets list when the stored date is not today', async () => {
    // Write a record with a past date directly via the mock
    const key = 'bm_sent_today';
    await new Promise<void>((resolve) => {
      chrome.storage.local.set(
        { [key]: { date: '2020-01-01', ids: ['old_friend'] } },
        resolve,
      );
    });
    // getSentToday should see the stale date and return []
    const list = await getSentToday();
    expect(list).toEqual([]);
  });
});

describe('clearSentToday', () => {
  it('empties the list', async () => {
    await addToSentToday('alice');
    await clearSentToday();
    expect(await getSentToday()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getActionDelayMinutes / setActionDelayMinutes
// ---------------------------------------------------------------------------

describe('getActionDelayMinutes', () => {
  it('defaults to 1', async () => {
    expect(await getActionDelayMinutes()).toBe(1);
  });
});

describe('setActionDelayMinutes', () => {
  it('stores and retrieves the value', async () => {
    await setActionDelayMinutes(3);
    expect(await getActionDelayMinutes()).toBe(3);
  });

  it('clamps values below 1 to 1', async () => {
    await setActionDelayMinutes(0);
    expect(await getActionDelayMinutes()).toBe(1);
  });

  it('clamps values above 5 to 5', async () => {
    await setActionDelayMinutes(10);
    expect(await getActionDelayMinutes()).toBe(5);
  });

  it('rounds non-integer values', async () => {
    await setActionDelayMinutes(2.6);
    expect(await getActionDelayMinutes()).toBe(3);
  });
});
