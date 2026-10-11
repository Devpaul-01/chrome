/**
 * Unit tests for useMessageQueue and useMessageHistory hooks.
 *
 * Covers:
 *   - Initial load from background message
 *   - Queue filter/sort state transitions
 *   - Pagination in useMessageHistory
 *   - cancelMessage / retryMessage / editMessage queue mutations
 *   - WebSocket-driven live updates (created / updated / deleted actions)
 *   - filterStatus + searchQuery reset page to 1
 *   - computeTrends buckets
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- Mocks ----------------------------------------------------------------

vi.mock('../../../api/websocket', () => {
  const listeners: Record<string, ((data: unknown) => void)[]> = {};
  return {
    default: {
      on: vi.fn((event: string, cb: (data: unknown) => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(cb);
        // return unsubscribe
        return () => {
          listeners[event] = listeners[event].filter((fn) => fn !== cb);
        };
      }),
      _emit: (event: string, data: unknown) => {
        (listeners[event] ?? []).forEach((fn) => fn(data));
      },
    },
  };
});

const mockSendBg = vi.fn();
vi.mock('../../api', () => ({
  sendBackgroundMessage: (...args: unknown[]) => mockSendBg(...args),
}));

// wsClient reference for triggering WS events
import wsClient from '../../../api/websocket';
const ws = wsClient as unknown as { _emit: (e: string, d: unknown) => void };

import { useMessageQueue, useMessageHistory } from '../useMessages';

// ---- Helpers ---------------------------------------------------------------

function makeQueueMsg(id: string, overrides = {}) {
  return {
    id,
    friend_name: 'Alice',
    friend_profile_url: 'https://facebook.com/alice',
    birthday_date: '1990-05-01',
    scheduled_send_time: new Date(Date.now() + 3_600_000).toISOString(),
    message_content: 'Happy Birthday!',
    status: 'pending' as const,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeHistoryMsg(id: string, overrides = {}) {
  return {
    id,
    friend_name: 'Bob',
    friend_profile_url: 'https://facebook.com/bob',
    birthday_date: '1990-06-01',
    message_content: 'Happy Birthday Bob!',
    sent_at: new Date().toISOString(),
    status: 'sent' as const,
    ...overrides,
  };
}

// ============================================================================
// useMessageQueue
// ============================================================================

describe('useMessageQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads queue messages on mount', async () => {
    const msgs = [makeQueueMsg('q1'), makeQueueMsg('q2')];
    mockSendBg.mockResolvedValueOnce(msgs);

    const { result } = renderHook(() => useMessageQueue());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].id).toBe('q1');
  });

  it('sets error when load fails', async () => {
    mockSendBg.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useMessageQueue());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Network error');
    expect(result.current.messages).toHaveLength(0);
  });

  it('cancelMessage removes message from list', async () => {
    const msgs = [makeQueueMsg('q1'), makeQueueMsg('q2')];
    mockSendBg.mockResolvedValueOnce(msgs); // initial load
    mockSendBg.mockResolvedValueOnce(undefined); // cancel

    const { result } = renderHook(() => useMessageQueue());
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    await act(async () => {
      await result.current.cancelMessage('q1');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe('q2');
    expect(result.current.successMessage).toBe('Message cancelled');
  });

  it('editMessage updates message content in list', async () => {
    const msgs = [makeQueueMsg('q1')];
    mockSendBg.mockResolvedValueOnce(msgs); // load
    mockSendBg.mockResolvedValueOnce(undefined); // edit

    const { result } = renderHook(() => useMessageQueue());
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    await act(async () => {
      await result.current.editMessage('q1', 'Updated message');
    });

    expect(result.current.messages[0].message_content).toBe('Updated message');
    expect(result.current.successMessage).toBe('Message updated');
    expect(result.current.expandedId).toBeNull();
  });

  it('retryMessage reloads queue', async () => {
    const msgs = [makeQueueMsg('q1', { status: 'failed' as const })];
    mockSendBg
      .mockResolvedValueOnce(msgs) // initial load
      .mockResolvedValueOnce(undefined) // retry
      .mockResolvedValueOnce(msgs); // reload after retry

    const { result } = renderHook(() => useMessageQueue());
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    await act(async () => {
      await result.current.retryMessage('q1');
    });

    expect(result.current.successMessage).toBe('Message queued for retry');
  });

  it('WS created action triggers reload', async () => {
    mockSendBg
      .mockResolvedValueOnce([]) // initial load
      .mockResolvedValueOnce([makeQueueMsg('q-new')]); // reload

    const { result } = renderHook(() => useMessageQueue());
    await waitFor(() => expect(result.current.messages).toHaveLength(0));

    act(() => {
      ws._emit('message_queue_update', {
        action: 'created',
        message: makeQueueMsg('q-new'),
      });
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].id).toBe('q-new');
  });

  it('WS updated action patches message in-place', async () => {
    const original = makeQueueMsg('q1');
    mockSendBg.mockResolvedValueOnce([original]);

    const { result } = renderHook(() => useMessageQueue());
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      ws._emit('message_queue_update', {
        action: 'updated',
        message: { ...original, message_content: 'Updated via WS' },
      });
    });

    await waitFor(() => expect(result.current.messages[0].message_content).toBe('Updated via WS'));
  });

  it('WS deleted action removes message from list', async () => {
    const msgs = [makeQueueMsg('q1'), makeQueueMsg('q2')];
    mockSendBg.mockResolvedValueOnce(msgs);

    const { result } = renderHook(() => useMessageQueue());
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => {
      ws._emit('message_queue_update', { action: 'deleted', message: makeQueueMsg('q1') });
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].id).toBe('q2');
  });
});

// ============================================================================
// useMessageHistory
// ============================================================================

describe('useMessageHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads history page on mount', async () => {
    const items = [makeHistoryMsg('h1'), makeHistoryMsg('h2')];
    mockSendBg.mockResolvedValueOnce({ items, total: 2 });

    const { result } = renderHook(() => useMessageHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.totalItems).toBe(2);
  });

  it('supports legacy raw array response', async () => {
    const items = [makeHistoryMsg('h1')];
    mockSendBg.mockResolvedValueOnce(items); // raw array

    const { result } = renderHook(() => useMessageHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.totalItems).toBe(1);
  });

  it('setFilterStatus resets page to 1', async () => {
    // Seed with 50 items up front so totalPages = 2 and goToPage(2) succeeds
    const manyItems = Array.from({ length: 25 }, (_, i) => makeHistoryMsg(`h${i}`));
    mockSendBg.mockResolvedValue({ items: manyItems, total: 50 });

    const { result } = renderHook(() => useMessageHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Now totalPages = ceil(50/25) = 2,  goToPage(2) should succeed
    act(() => result.current.goToPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    // Changing filter resets page to 1
    act(() => result.current.setFilterStatus('failed'));
    await waitFor(() => expect(result.current.page).toBe(1));
  });

  it('setSearchQuery resets page to 1', async () => {
    const manyItems = Array.from({ length: 25 }, (_, i) => makeHistoryMsg(`h${i}`));
    mockSendBg.mockResolvedValue({ items: manyItems, total: 50 });

    const { result } = renderHook(() => useMessageHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.goToPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.setSearchQuery('alice'));
    await waitFor(() => expect(result.current.page).toBe(1));
  });

  it('deleteMessage removes item and decrements total', async () => {
    const items = [makeHistoryMsg('h1'), makeHistoryMsg('h2')];
    mockSendBg.mockResolvedValueOnce({ items, total: 2 }); // load
    mockSendBg.mockResolvedValueOnce(undefined); // delete

    // Mock window.confirm
    vi.stubGlobal('confirm', () => true);

    const { result } = renderHook(() => useMessageHistory());
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    await act(async () => {
      await result.current.deleteMessage('h1');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.totalItems).toBe(1);

    vi.unstubAllGlobals();
  });

  it('stats counts match item statuses', async () => {
    const items = [
      makeHistoryMsg('h1', { status: 'sent' as const }),
      makeHistoryMsg('h2', { status: 'delivered' as const }),
      makeHistoryMsg('h3', { status: 'failed' as const }),
      makeHistoryMsg('h4', { status: 'sent' as const }),
    ];
    mockSendBg.mockResolvedValueOnce({ items, total: 4 });

    const { result } = renderHook(() => useMessageHistory());
    await waitFor(() => expect(result.current.messages).toHaveLength(4));

    expect(result.current.stats.total).toBe(4);
    expect(result.current.stats.sent).toBe(2);
    expect(result.current.stats.delivered).toBe(1);
    expect(result.current.stats.failed).toBe(1);
  });

  it('computeTrends returns correct bucket count', async () => {
    mockSendBg.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => useMessageHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const trends = result.current.trends(7);
    expect(trends.volume).toHaveLength(7);
    expect(trends.successRate).toHaveLength(7);
  });

  it('WS created action triggers reload', async () => {
    mockSendBg
      .mockResolvedValueOnce({ items: [], total: 0 }) // initial
      .mockResolvedValueOnce({ items: [makeHistoryMsg('h-new')], total: 1 }); // reload

    const { result } = renderHook(() => useMessageHistory());
    await waitFor(() => expect(result.current.messages).toHaveLength(0));

    act(() => {
      ws._emit('message_history_update', {
        action: 'created',
        message: makeHistoryMsg('h-new'),
      });
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
  });

  it('WS deleted action removes item without reload', async () => {
    const items = [makeHistoryMsg('h1'), makeHistoryMsg('h2')];
    mockSendBg.mockResolvedValueOnce({ items, total: 2 });

    const { result } = renderHook(() => useMessageHistory());
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => {
      ws._emit('message_history_update', {
        action: 'deleted',
        message: makeHistoryMsg('h1'),
      });
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.totalItems).toBe(1);
  });

  it('totalPages is at least 1', async () => {
    mockSendBg.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => useMessageHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalPages).toBe(1);
  });
});
