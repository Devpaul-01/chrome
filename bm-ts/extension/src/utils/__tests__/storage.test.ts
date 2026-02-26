/**
 * Tests for src/utils/storage.ts
 *
 * The chrome.storage.local mock is provided globally by src/test-setup.ts.
 * Each test runs against a fresh in-memory store (cleared in afterEach).
 */

import { describe, it, expect } from 'vitest';
import {
  getTokens,
  saveTokens,
  clearTokens,
  getBackendUrl,
  setBackendUrl,
  STORAGE_KEYS,
} from '../storage';

// ---------------------------------------------------------------------------
// getTokens / saveTokens
// ---------------------------------------------------------------------------

describe('saveTokens / getTokens', () => {
  it('stores and retrieves access and refresh tokens', async () => {
    await saveTokens({ accessToken: 'acc_123', refreshToken: 'ref_456' });
    const tokens = await getTokens();
    expect(tokens.accessToken).toBe('acc_123');
    expect(tokens.refreshToken).toBe('ref_456');
  });

  it('returns undefined when no tokens saved', async () => {
    const tokens = await getTokens();
    expect(tokens.accessToken).toBeUndefined();
    expect(tokens.refreshToken).toBeUndefined();
  });

  it('can update tokens by calling saveTokens again', async () => {
    await saveTokens({ accessToken: 'old', refreshToken: 'old_r' });
    await saveTokens({ accessToken: 'new', refreshToken: 'new_r' });
    const tokens = await getTokens();
    expect(tokens.accessToken).toBe('new');
    expect(tokens.refreshToken).toBe('new_r');
  });
});

// ---------------------------------------------------------------------------
// clearTokens
// ---------------------------------------------------------------------------

describe('clearTokens', () => {
  it('removes both token keys from storage', async () => {
    await saveTokens({ accessToken: 'a', refreshToken: 'b' });
    await clearTokens();
    const tokens = await getTokens();
    expect(tokens.accessToken).toBeUndefined();
    expect(tokens.refreshToken).toBeUndefined();
  });

  it('is safe to call when no tokens exist', async () => {
    await expect(clearTokens()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getBackendUrl / setBackendUrl
// ---------------------------------------------------------------------------

describe('getBackendUrl', () => {
  it('defaults to localhost:8000 when no URL is stored', async () => {
    const url = await getBackendUrl();
    expect(url).toBe('http://localhost:8000');
  });

  it('returns the custom URL after setBackendUrl', async () => {
    await setBackendUrl('https://api.example.com');
    const url = await getBackendUrl();
    expect(url).toBe('https://api.example.com');
  });
});

describe('setBackendUrl', () => {
  it('persists the URL and resolves without a value', async () => {
    await expect(setBackendUrl('https://custom.server')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// STORAGE_KEYS contract
// ---------------------------------------------------------------------------

describe('STORAGE_KEYS', () => {
  it('exposes the expected keys', () => {
    expect(STORAGE_KEYS.accessToken).toBe('bm_access_token');
    expect(STORAGE_KEYS.refreshToken).toBe('bm_refresh_token');
    expect(STORAGE_KEYS.backendUrl).toBe('bm_backend_url');
  });
});
