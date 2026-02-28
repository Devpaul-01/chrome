/**
 * Component tests for MessageHistory.tsx
 *
 * Strategy: mock `useMessageHistory` from the hooks module and the websocket
 * client so the component is isolated from I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../../api/websocket', () => ({
  default: { on: vi.fn(() => vi.fn()) },
}));

const mockLoadHistory = vi.fn();
const mockDeleteMessage = vi.fn();
const mockSetFilterStatus = vi.fn();
const mockSetSearchQuery = vi.fn();
const mockSetExpandedId = vi.fn();

const defaultHookReturn = {
  isLoading: false,
  error: null,
  filterStatus: 'all' as const,
  setFilterStatus: mockSetFilterStatus,
  searchQuery: '',
  setSearchQuery: mockSetSearchQuery,
  expandedId: null,
  setExpandedId: mockSetExpandedId,
  loadHistory: mockLoadHistory,
  deleteMessage: mockDeleteMessage,
  filteredMessages: [],
  stats: { total: 0, sent: 0, delivered: 0, failed: 0 },
  trends: vi.fn(() => ({ volume: [], successRate: [] })),
  live: false,
};

vi.mock('../hooks/useMessages', () => ({
  useMessageHistory: vi.fn(),
  useMessageQueue: vi.fn(() => ({
    messages: [],
    isLoading: false,
    error: null,
    successMessage: null,
    expandedId: null,
    setExpandedId: vi.fn(),
    loadQueue: vi.fn(),
    cancelMessage: vi.fn(),
    retryMessage: vi.fn(),
    editMessage: vi.fn(),
    live: false,
  })),
}));

import { useMessageHistory } from '../hooks/useMessages';
import MessageHistory from '../components/MessageHistory';
import type { MessageHistoryItem } from '../hooks/useMessages';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<MessageHistoryItem> = {}): MessageHistoryItem {
  return {
    id: 'hist-1',
    friend_name: 'Alice Smith',
    friend_profile_url: 'https://facebook.com/alice',
    birthday_date: '1990-06-15',
    message_content: 'Happy Birthday Alice!',
    sent_at: new Date(Date.now() - 3_600_000).toISOString(), // 1 hour ago
    status: 'delivered',
    ...overrides,
  };
}

function mockHook(partial: Partial<typeof defaultHookReturn> = {}) {
  vi.mocked(useMessageHistory).mockReturnValue({
    ...defaultHookReturn,
    ...partial,
  } as ReturnType<typeof useMessageHistory>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook();
  });

  // --- Loading state --------------------------------------------------------

  it('shows a spinner when isLoading is true', () => {
    mockHook({ isLoading: true });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show a spinner when not loading', () => {
    mockHook({ isLoading: false });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // --- Error banner ---------------------------------------------------------

  it('shows error message when error is set', () => {
    mockHook({ error: 'Failed to load history' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('Failed to load history')).toBeInTheDocument();
  });

  // --- Empty states ---------------------------------------------------------

  it('shows "No message history" when no messages and no filters active', () => {
    mockHook({ filteredMessages: [], searchQuery: '', filterStatus: 'all' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('No message history')).toBeInTheDocument();
  });

  it('shows "No matching messages" when search query is active', () => {
    mockHook({ filteredMessages: [], searchQuery: 'bob', filterStatus: 'all' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('No matching messages')).toBeInTheDocument();
  });

  it('shows "No matching messages" when status filter is active', () => {
    mockHook({ filteredMessages: [], searchQuery: '', filterStatus: 'failed' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('No matching messages')).toBeInTheDocument();
  });

  // --- Stats summary (non-compact) -----------------------------------------

  it('shows Total / Sent / Delivered / Failed stats in full mode', () => {
    mockHook({
      stats: { total: 10, sent: 3, delivered: 6, failed: 1 },
      filteredMessages: [],
    });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('hides the stats grid in compact mode', () => {
    mockHook({ stats: { total: 5, sent: 2, delivered: 2, failed: 1 } });
    render(<MessageHistory onClose={vi.fn()} compact />);
    // "Total" label only exists in the stats grid
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });

  // --- Filters (non-compact) ------------------------------------------------

  it('renders the search input in full mode', () => {
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument();
  });

  it('hides the search input in compact mode', () => {
    render(<MessageHistory onClose={vi.fn()} compact />);
    expect(screen.queryByPlaceholderText(/search by name/i)).not.toBeInTheDocument();
  });

  it('renders All / Sent / Delivered / Failed filter buttons in full mode', () => {
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sent$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delivered$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^failed$/i })).toBeInTheDocument();
  });

  it('calls setSearchQuery when typing in the search box', async () => {
    const user = userEvent.setup();
    render(<MessageHistory onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/search by name/i), 'Bob');
    expect(mockSetSearchQuery).toHaveBeenCalled();
  });

  it('calls setFilterStatus("sent") when Sent filter is clicked', async () => {
    const user = userEvent.setup();
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^sent$/i }));
    expect(mockSetFilterStatus).toHaveBeenCalledWith('sent');
  });

  it('calls setFilterStatus("failed") when Failed filter is clicked', async () => {
    const user = userEvent.setup();
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^failed$/i }));
    expect(mockSetFilterStatus).toHaveBeenCalledWith('failed');
  });

  // --- Message list ---------------------------------------------------------

  it('renders a message row with the friend name and status badge', () => {
    mockHook({ filteredMessages: [makeMessage()] });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('delivered')).toBeInTheDocument();
  });

  it('renders sent status badge', () => {
    mockHook({ filteredMessages: [makeMessage({ status: 'sent' })] });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('sent')).toBeInTheDocument();
  });

  it('renders failed status badge', () => {
    mockHook({ filteredMessages: [makeMessage({ status: 'failed' })] });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('renders multiple message rows', () => {
    mockHook({
      filteredMessages: [
        makeMessage({ id: '1', friend_name: 'Alice' }),
        makeMessage({ id: '2', friend_name: 'Bob' }),
        makeMessage({ id: '3', friend_name: 'Carol' }),
      ],
    });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  // --- Expand / collapse details --------------------------------------------

  it('calls setExpandedId when Details toggle is clicked', async () => {
    const user = userEvent.setup();
    mockHook({ filteredMessages: [makeMessage({ id: 'hist-x' })] });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /details/i }));
    expect(mockSetExpandedId).toHaveBeenCalledWith('hist-x');
  });

  it('shows message content in expanded view', () => {
    const msg = makeMessage({ id: 'expand-me' });
    mockHook({ filteredMessages: [msg], expandedId: 'expand-me' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('Happy Birthday Alice!')).toBeInTheDocument();
  });

  it('shows "Hide" toggle label when row is expanded', () => {
    const msg = makeMessage({ id: 'expand-me' });
    mockHook({ filteredMessages: [msg], expandedId: 'expand-me' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  it('shows error_message in expanded view when present', () => {
    const msg = makeMessage({ id: 'err-msg', status: 'failed', error_message: 'Post limit reached' });
    mockHook({ filteredMessages: [msg], expandedId: 'err-msg' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText(/post limit reached/i)).toBeInTheDocument();
  });

  // --- Delete action --------------------------------------------------------

  it('calls deleteMessage with message id when Delete is clicked in expanded view', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'del-me' });
    mockHook({ filteredMessages: [msg], expandedId: 'del-me' });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(mockDeleteMessage).toHaveBeenCalledWith('del-me');
  });

  // --- Profile link ---------------------------------------------------------

  it('renders View Profile link pointing to friend_profile_url in expanded view', () => {
    const msg = makeMessage({ id: 'vp-test' });
    mockHook({ filteredMessages: [msg], expandedId: 'vp-test' });
    render(<MessageHistory onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: /view profile/i });
    expect(link).toHaveAttribute('href', 'https://facebook.com/alice');
  });

  // --- Compact mode ---------------------------------------------------------

  it('renders friend name and status badge in compact mode', () => {
    mockHook({ filteredMessages: [makeMessage()] });
    render(<MessageHistory onClose={vi.fn()} compact />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('delivered')).toBeInTheDocument();
  });

  it('renders a "View" link in compact mode pointing to friend_profile_url', () => {
    mockHook({ filteredMessages: [makeMessage()] });
    render(<MessageHistory onClose={vi.fn()} compact />);
    const link = screen.getByRole('link', { name: /^view$/i });
    expect(link).toHaveAttribute('href', 'https://facebook.com/alice');
  });

  it('renders a Del button in compact mode that calls deleteMessage', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'compact-del' });
    mockHook({ filteredMessages: [msg] });
    render(<MessageHistory onClose={vi.fn()} compact />);
    await user.click(screen.getByRole('button', { name: /^del$/i }));
    expect(mockDeleteMessage).toHaveBeenCalledWith('compact-del');
  });

  // --- Refresh button -------------------------------------------------------

  it('calls loadHistory when the Refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(mockLoadHistory).toHaveBeenCalled();
  });
});
