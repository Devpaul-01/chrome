/**
 * test-setup.ts — Global test environment configuration.
 *
 * Imported by Vitest before every test file runs (configured via
 * vitest.config.ts `setupFiles`). Responsibilities:
 *   • Install @testing-library/jest-dom matchers
 *   • Mount a global `chrome` stub so utility modules can be imported outside
 *     a real Chrome extension environment
 *   • Reset all mocks between tests via afterEach
 */

import '@testing-library/jest-dom';
import * as axeMatchers from 'vitest-axe/matchers';
import { afterEach, vi, expect } from 'vitest';
import type { AxeMatchers } from 'vitest-axe/matchers';

// Augment Vitest's Assertion interface with vitest-axe matchers
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

// Register vitest-axe matchers (toHaveNoViolations)
expect.extend(axeMatchers);

// ---------------------------------------------------------------------------
// Chrome Extension API stub
// ---------------------------------------------------------------------------
// chrome.storage.local — backed by a simple in-memory Map so tests can read
// back values written by the code under test without touching real storage.
const _store = new Map<string, unknown>();

// Shared helper that returns the matching store entries for the given key(s)
function _storeGet(keys: string | string[] | null): Record<string, unknown> {
  if (keys === null) {
    // Return all entries
    return Object.fromEntries(_store.entries());
  }
  const keyList = typeof keys === 'string' ? [keys] : keys;
  const result: Record<string, unknown> = {};
  for (const k of keyList) {
    if (_store.has(k)) result[k] = _store.get(k);
  }
  return result;
}

const storageMock = {
  // Supports both the Promise API (MV3) and callback API (MV2):
  //   Promise:  await chrome.storage.local.get(key)
  //   Callback: chrome.storage.local.get(key, (result) => { ... })
  get: vi.fn(
    (
      keys: string | string[] | null,
      callback?: (result: Record<string, unknown>) => void,
    ): Promise<Record<string, unknown>> | void => {
      const result = _storeGet(keys);
      if (typeof callback === 'function') {
        callback(result);
        return;
      }
      return Promise.resolve(result);
    },
  ),
  set: vi.fn((items: Record<string, unknown>, callback?: () => void): Promise<void> | void => {
    for (const [k, v] of Object.entries(items)) {
      _store.set(k, v);
    }
    if (typeof callback === 'function') {
      callback();
      return;
    }
    return Promise.resolve();
  }),
  remove: vi.fn((keys: string | string[], callback?: () => void): Promise<void> | void => {
    const keyList = typeof keys === 'string' ? [keys] : keys;
    for (const k of keyList) _store.delete(k);
    if (typeof callback === 'function') {
      callback();
      return;
    }
    return Promise.resolve();
  }),
  clear: vi.fn((callback?: () => void): Promise<void> | void => {
    _store.clear();
    if (typeof callback === 'function') {
      callback();
      return;
    }
    return Promise.resolve();
  }),
};

// chrome.alarms
const alarmsMock = {
  create: vi.fn(),
  clear: vi.fn().mockResolvedValue(true),
  onAlarm: { addListener: vi.fn() },
};

// chrome.runtime
const runtimeMock = {
  sendMessage: vi.fn(),
  onMessage: { addListener: vi.fn() },
  onInstalled: { addListener: vi.fn() },
  getManifest: vi.fn(() => ({ version: '0.1.0' })),
};

// chrome.notifications
const notificationsMock = {
  create: vi.fn(),
  clear: vi.fn(),
  onClicked: { addListener: vi.fn() },
};

// Attach to globalThis so any module that accesses `chrome.*` finds the mock
(globalThis as unknown as Record<string, unknown>).chrome = {
  storage: { local: storageMock },
  alarms: alarmsMock,
  runtime: runtimeMock,
  notifications: notificationsMock,
};

// ---------------------------------------------------------------------------
// Cleanup between tests
// ---------------------------------------------------------------------------
afterEach(() => {
  _store.clear();
  vi.clearAllMocks();
});
