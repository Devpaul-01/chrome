/**
 * Component tests for MessageQueue.tsx
 *
 * Strategy: mock `useMessageQueue` from the hooks module so the component is
 * completely isolated from I/O. The global chrome stub is inherited from
 * test-setup.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../../api/websocket', () => ({
  default: { on: vi.fn(() => vi.fn()) },
}));

const mockLoadQueue = vi.fn();
const mockCancelMessage = vi.fn();
const mockRetryMessage = vi.fn();
const mockEditMessage = vi.fn();
const mockSetExpandedId = vi.fn();

const defaultHookReturn = {
  messages: [],
  isLoading: false,
  error: null,
  successMessage: null,
  expandedId: null,
  setExpandedId: mockSetExpandedId,
  loadQueue: mockLoadQueue,
  cancelMessage: mockCancelMessage,
  retryMessage: mockRetryMessage,
  editMessage: mockEditMessage,
};

vi.mock('../hooks/useMessages', () => ({
  useMessageQueue: vi.fn(),
  useMessageHistory: vi.fn(() => ({
    trends: vi.fn(() => ({ volumeData: [], successData: [] })),
    live: false,
    stats: null,
  })),
}));

import { useMessageQueue } from '../hooks/useMessages';
import MessageQueue from '../components/MessageQueue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QueuedMessage = {
  id: string;
  friend_name: string;
  friend_profile_url: string;
  birthday_date: string;
  scheduled_send_time: string;
  message_content: string;
  status: 'pending' | 'processing' | 'failed';
  created_at: string;
  error_message?: string;
};

function makeMessage(overrides: Partial<QueuedMessage> = {}): QueuedMessage {
  return {
    id: 'msg-1',
    friend_name: 'Alice Smith',
    friend_profile_url: 'https://facebook.com/alice',
    birthday_date: '1990-06-15',
    scheduled_send_time: new Date(Date.now() + 3_600_000).toISOString(),
    message_content: 'Happy Birthday Alice!',
    status: 'pending',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockHook(partial: Partial<typeof defaultHookReturn> = {}) {
  vi.mocked(useMessageQueue).mockReturnValue({ ...defaultHookReturn, ...partial } as ReturnType<typeof useMessageQueue>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook();
  });

  // --- Loading state --------------------------------------------------------

  it('shows a spinner when isLoading is true', () => {
    mockHook({ isLoading: true });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show spinner when isLoading is false', () => {
    mockHook({ isLoading: false });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // --- Empty state ----------------------------------------------------------

  it('shows "No messages in queue" when messages array is empty', () => {
    mockHook({ messages: [] });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByText(/no messages in queue/i)).toBeInTheDocument();
  });

  it('shows supporting empty-state description text', () => {
    mockHook({ messages: [] });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(
      screen.getByText(/messages will appear here when scheduled/i),
    ).toBeInTheDocument();
  });

  // --- Error / success banners ----------------------------------------------

  it('shows error message when error is set', () => {
    mockHook({ error: 'Failed to load queue' });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByText('Failed to load queue')).toBeInTheDocument();
  });

  it('shows success message when successMessage is set', () => {
    mockHook({ successMessage: 'Message cancelled successfully' });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByText('Message cancelled successfully')).toBeInTheDocument();
  });

  // --- Message list rendering -----------------------------------------------

  it('renders a message row with the friend name', () => {
    mockHook({ messages: [makeMessage()] });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows pending status badge', () => {
    // Use exact lowercase match: badge text is 'pending', grid label is 'Pending'
    mockHook({ messages: [makeMessage({ status: 'pending' })] });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows processing status badge', () => {
    mockHook({ messages: [makeMessage({ status: 'processing' })] });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByText('processing')).toBeInTheDocument();
  });

  it('shows failed status badge', () => {
    // Use exact lowercase match: badge text is 'failed', grid label is 'Failed'
    mockHook({ messages: [makeMessage({ status: 'failed' })] });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  // --- Summary grid ---------------------------------------------------------

  it('shows Total / Pending / Failed counts in full mode', () => {
    const messages: QueuedMessage[] = [
      makeMessage({ id: '1', status: 'pending' }),
      makeMessage({ id: '2', status: 'pending' }),
      makeMessage({ id: '3', status: 'failed' }),
    ];
    mockHook({ messages });
    render(<MessageQueue onClose={vi.fn()} />);

    // Total=3, Pending=2, Failed=1
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('hides the summary grid in compact mode', () => {
    const messages = [makeMessage()];
    mockHook({ messages });
    render(<MessageQueue onClose={vi.fn()} compact />);

    // "Total" label only exists inside the summary grid — never appears in badges or elsewhere
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });

  // --- Actions --------------------------------------------------------------

  it('calls cancelMessage with the message id when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'abc', status: 'pending' });
    // Cancel button is only rendered when the row is expanded (non-compact full view)
    mockHook({ messages: [msg], expandedId: 'abc' });
    render(<MessageQueue onClose={vi.fn()} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);
    expect(mockCancelMessage).toHaveBeenCalledWith('abc');
  });

  it('shows Retry button only for failed messages', () => {
    // Expand both rows; only the failed one should have a Retry button
    mockHook({
      messages: [
        makeMessage({ id: '1', status: 'pending' }),
        makeMessage({ id: '2', friend_name: 'Bob Jones', status: 'failed' }),
      ],
      expandedId: '2', // Only expand the failed message
    });
    render(<MessageQueue onClose={vi.fn()} />);

    // Should be exactly one Retry button — for the failed message
    const retryBtns = screen.getAllByRole('button', { name: /retry/i });
    expect(retryBtns).toHaveLength(1);
  });

  it('calls retryMessage with the message id when Retry is clicked', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'xyz', status: 'failed' });
    // Expand the message so the Retry button is visible
    mockHook({ messages: [msg], expandedId: 'xyz' });
    render(<MessageQueue onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRetryMessage).toHaveBeenCalledWith('xyz');
  });

  it('renders a profile link pointing to friend_profile_url', () => {
    const msg = makeMessage({ id: 'profile-test' });
    // Profile link is only visible in expanded section
    mockHook({ messages: [msg], expandedId: 'profile-test' });
    render(<MessageQueue onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: /profile/i });
    expect(link).toHaveAttribute('href', 'https://facebook.com/alice');
  });

  // --- Refresh button -------------------------------------------------------

  it('calls loadQueue when the Refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<MessageQueue onClose={vi.fn()} />);

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshBtn);
    expect(mockLoadQueue).toHaveBeenCalled();
  });

  // --- Expand / collapse details -------------------------------------------

  it('calls setExpandedId when the Details toggle is clicked', async () => {
    const user = userEvent.setup();
    mockHook({ messages: [makeMessage({ id: 'msg-x' })] });
    render(<MessageQueue onClose={vi.fn()} />);

    const detailsBtn = screen.getByRole('button', { name: /details/i });
    await user.click(detailsBtn);
    expect(mockSetExpandedId).toHaveBeenCalledWith('msg-x');
  });

  it('shows message content when that message is expanded (expandedId matches)', () => {
    const msg = makeMessage({ id: 'msg-expand' });
    mockHook({ messages: [msg], expandedId: 'msg-expand' });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByDisplayValue('Happy Birthday Alice!')).toBeInTheDocument();
  });

  // --- Multiple messages ----------------------------------------------------

  it('renders multiple messages in the list', () => {
    mockHook({
      messages: [
        makeMessage({ id: '1', friend_name: 'Alice' }),
        makeMessage({ id: '2', friend_name: 'Bob' }),
        makeMessage({ id: '3', friend_name: 'Carol' }),
      ],
    });
    render(<MessageQueue onClose={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });
});
