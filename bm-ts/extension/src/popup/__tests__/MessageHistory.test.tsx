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
const mockSetStartDate = vi.fn();
const mockSetEndDate = vi.fn();
const mockGoToPage = vi.fn();

const defaultHookReturn = {
  isLoading: false,
  error: null as string | null,
  filterStatus: 'all' as 'all' | 'sent' | 'delivered' | 'failed',
  setFilterStatus: mockSetFilterStatus,
  searchQuery: '',
  setSearchQuery: mockSetSearchQuery,
  startDate: '',
  setStartDate: mockSetStartDate,
  endDate: '',
  setEndDate: mockSetEndDate,
  expandedId: null as string | null,
  setExpandedId: mockSetExpandedId,
  loadHistory: mockLoadHistory,
  deleteMessage: mockDeleteMessage,
  messages: [] as MessageHistoryItem[],
  filteredMessages: [] as MessageHistoryItem[],
  stats: { total: 0, sent: 0, delivered: 0, failed: 0 },
  page: 1,
  pageSize: 25,
  totalItems: 0,
  totalPages: 1,
  goToPage: mockGoToPage,
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

function mockHook(partial: Partial<ReturnType<typeof useMessageHistory>> = {}) {
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

  it('shows "No matching messages" when startDate is active', () => {
    mockHook({
      filteredMessages: [],
      searchQuery: '',
      filterStatus: 'all',
      startDate: '2024-01-01',
    });
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

  // --- Date range filters --------------------------------------------------

  it('renders From and To date inputs in full mode', () => {
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
  });

  it('hides date inputs in compact mode', () => {
    render(<MessageHistory onClose={vi.fn()} compact />);
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End date')).not.toBeInTheDocument();
  });

  it('calls setStartDate when start date input changes', async () => {
    const user = userEvent.setup();
    render(<MessageHistory onClose={vi.fn()} />);
    const startInput = screen.getByLabelText('Start date');
    await user.type(startInput, '2024-01-01');
    expect(mockSetStartDate).toHaveBeenCalled();
  });

  it('calls setEndDate when end date input changes', async () => {
    const user = userEvent.setup();
    render(<MessageHistory onClose={vi.fn()} />);
    const endInput = screen.getByLabelText('End date');
    await user.type(endInput, '2024-12-31');
    expect(mockSetEndDate).toHaveBeenCalled();
  });

  it('shows the clear date range button when startDate is set', () => {
    mockHook({ startDate: '2024-01-01' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /clear date range/i })).toBeInTheDocument();
  });

  it('calls both setStartDate and setEndDate with empty string when clear button clicked', async () => {
    const user = userEvent.setup();
    mockHook({ startDate: '2024-01-01' });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /clear date range/i }));
    expect(mockSetStartDate).toHaveBeenCalledWith('');
    expect(mockSetEndDate).toHaveBeenCalledWith('');
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

  // --- Export CSV ----------------------------------------------------------

  it('shows Export CSV button when messages are present in full mode', () => {
    mockHook({ filteredMessages: [makeMessage()] });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /export.*csv/i })).toBeInTheDocument();
  });

  it('hides Export CSV button when no messages', () => {
    mockHook({ filteredMessages: [] });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /export.*csv/i })).not.toBeInTheDocument();
  });

  it('hides Export CSV button in compact mode', () => {
    mockHook({ filteredMessages: [makeMessage()] });
    render(<MessageHistory onClose={vi.fn()} compact />);
    expect(screen.queryByRole('button', { name: /export.*csv/i })).not.toBeInTheDocument();
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

  it('calls setExpandedId when Expand toggle is clicked', async () => {
    const user = userEvent.setup();
    mockHook({ filteredMessages: [makeMessage({ id: 'hist-x' })] });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^expand$/i }));
    expect(mockSetExpandedId).toHaveBeenCalledWith('hist-x');
  });

  it('shows message content in expanded inline panel', () => {
    const msg = makeMessage({ id: 'expand-me' });
    mockHook({ filteredMessages: [msg], expandedId: 'expand-me' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText('Happy Birthday Alice!')).toBeInTheDocument();
  });

  it('shows "Hide" toggle label when row is expanded', () => {
    const msg = makeMessage({ id: 'expand-me' });
    mockHook({ filteredMessages: [msg], expandedId: 'expand-me' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^hide$/i })).toBeInTheDocument();
  });

  it('shows error_message in expanded inline panel when present', () => {
    const msg = makeMessage({
      id: 'err-msg',
      status: 'failed',
      error_message: 'Post limit reached',
    });
    mockHook({ filteredMessages: [msg], expandedId: 'err-msg' });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByText(/post limit reached/i)).toBeInTheDocument();
  });

  // --- Delete action (expanded inline panel) --------------------------------

  it('calls deleteMessage with message id when Delete is clicked in expanded view', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'del-me' });
    mockHook({ filteredMessages: [msg], expandedId: 'del-me' });
    render(<MessageHistory onClose={vi.fn()} />);
    // The expanded inline panel has a Delete button
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(mockDeleteMessage).toHaveBeenCalledWith('del-me');
  });

  // --- Profile link (expanded inline panel) ---------------------------------

  it('renders View Profile link pointing to friend_profile_url in expanded view', () => {
    const msg = makeMessage({ id: 'vp-test' });
    mockHook({ filteredMessages: [msg], expandedId: 'vp-test' });
    render(<MessageHistory onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: /view profile/i });
    expect(link).toHaveAttribute('href', 'https://facebook.com/alice');
  });

  // --- Details modal --------------------------------------------------------

  it('opens details modal when Details button is clicked', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'modal-test' });
    mockHook({ filteredMessages: [msg] });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /view details for alice smith/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('details modal shows message content', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'modal-content', message_content: 'Hello Modal World!' });
    mockHook({ filteredMessages: [msg] });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /view details for alice smith/i }));
    expect(screen.getByText('Hello Modal World!')).toBeInTheDocument();
  });

  it('details modal shows error when present', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'modal-err', status: 'failed', error_message: 'Rate limit hit' });
    mockHook({ filteredMessages: [msg] });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /view details for alice smith/i }));
    expect(screen.getByText(/rate limit hit/i)).toBeInTheDocument();
  });

  it('closes details modal when Close button is clicked', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'modal-close' });
    mockHook({ filteredMessages: [msg] });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /view details for alice smith/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes details modal when ✕ button is clicked', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'modal-x' });
    mockHook({ filteredMessages: [msg] });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /view details for alice smith/i }));
    await user.click(screen.getByRole('button', { name: /close details/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls deleteMessage from details modal and closes modal', async () => {
    const user = userEvent.setup();
    const msg = makeMessage({ id: 'modal-del' });
    mockHook({ filteredMessages: [msg] });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /view details for alice smith/i }));
    // Delete inside modal
    const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    await user.click(deleteButtons[deleteButtons.length - 1]);
    expect(mockDeleteMessage).toHaveBeenCalledWith('modal-del');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  // --- Pagination controls --------------------------------------------------

  it('hides pagination when totalPages is 1', () => {
    mockHook({ filteredMessages: [makeMessage()], totalPages: 1 });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /previous page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls when totalPages > 1', () => {
    mockHook({ filteredMessages: [makeMessage()], totalPages: 3, page: 2, totalItems: 75 });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
    expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument();
    expect(screen.getByText(/75 total/i)).toBeInTheDocument();
  });

  it('Prev button calls goToPage(page - 1)', async () => {
    const user = userEvent.setup();
    mockHook({ filteredMessages: [makeMessage()], totalPages: 3, page: 2 });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /previous page/i }));
    expect(mockGoToPage).toHaveBeenCalledWith(1);
  });

  it('Next button calls goToPage(page + 1)', async () => {
    const user = userEvent.setup();
    mockHook({ filteredMessages: [makeMessage()], totalPages: 3, page: 2 });
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(mockGoToPage).toHaveBeenCalledWith(3);
  });

  it('Prev button is disabled on page 1', () => {
    mockHook({ filteredMessages: [makeMessage()], totalPages: 3, page: 1 });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it('Next button is disabled on last page', () => {
    mockHook({ filteredMessages: [makeMessage()], totalPages: 3, page: 3 });
    render(<MessageHistory onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('hides pagination in compact mode even when totalPages > 1', () => {
    mockHook({ filteredMessages: [makeMessage()], totalPages: 5, page: 2 });
    render(<MessageHistory onClose={vi.fn()} compact />);
    expect(screen.queryByRole('button', { name: /previous page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });

  // --- Refresh button -------------------------------------------------------

  it('calls loadHistory when the Refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<MessageHistory onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(mockLoadHistory).toHaveBeenCalled();
  });
});
