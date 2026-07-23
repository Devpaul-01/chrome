/**
 * Tests for src/api/client.ts
 *
 * The module runs in the background service worker context in production,
 * but is fully testable in Node/jsdom because it only uses `fetch` and
 * standard ES features (no chrome.* APIs at the module level).
 *
 * We stub `globalThis.fetch` with `vi.fn()` to control responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../client';

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

describe('ApiError', () => {
  it('creates an error with status and data', () => {
    const err = new ApiError(404, { detail: 'Not found' });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.data).toEqual({ detail: 'Not found' });
    expect(err.message).toBe('Not found');
  });

  it('falls back to "API request failed" when detail is absent', () => {
    const err = new ApiError(500, {});
    expect(err.message).toBe('API request failed');
  });

  it('handles non-object data gracefully', () => {
    const err = new ApiError(400, 'plain string');
    expect(err.message).toBe('API request failed');
  });
});

// ---------------------------------------------------------------------------
// request() — tested indirectly through exported API functions.
//
// We import the login function as a representative of all API functions that
// call request() internally, and verify that fetch is called with the correct
// arguments and that errors are surfaced correctly.
// ---------------------------------------------------------------------------

describe('API request helpers (via login)', () => {
  // Lazily import login after fetch stub is in place
  const BASE = 'http://localhost:8000';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws ApiError for 401 response', async () => {
    const { login } = await import('../client');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      login(BASE, { email: 'bad@example.com', password: 'wrongpass' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('resolves with token bundle on 200', async () => {
    const { login } = await import('../client');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'acc_tok', refresh_token: 'ref_tok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await login(BASE, { email: 'user@example.com', password: 'Pass1234' });
    expect(result.access_token).toBe('acc_tok');
    expect(result.refresh_token).toBe('ref_tok');
  });

  it('sends requests to the correct URL', async () => {
    const { login } = await import('../client');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'a', refresh_token: 'b' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await login(BASE, { email: 'user@example.com', password: 'Pass1234' });

    const [calledUrl] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toBe(`${BASE}/auth/login`);
  });

  it('allows extra time for password verification during login', async () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const { login } = await import('../client');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'a', refresh_token: 'b' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await login(BASE, { email: 'user@example.com', password: 'Pass1234' });

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    timeoutSpy.mockRestore();
  });

  it('includes Authorization header when access token is provided', async () => {
    const { getDashboardStats } = await import('../client');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          total_messages_sent: 0,
          messages_sent_today: 0,
          messages_sent_this_week: 0,
          messages_sent_this_month: 0,
          success_rate: 0,
          friends_with_upcoming_birthdays: 0,
          queued_messages: 0,
          automation_enabled: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await getDashboardStats(BASE, 'my_access_token');

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer my_access_token',
    });
  });
});
