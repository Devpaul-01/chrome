/**
 * Component tests for Dashboard.tsx
 *
 * Strategy: mock the hooks (useMessageQueue, useMessageHistory) and the
 * websocket client so the component is isolated. chrome.runtime.sendMessage
 * is provided by the global test-setup stub.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Stub out heavy/stateful sub-components so assertions stay focused
vi.mock('../components/DashboardCharts', () => ({
  default: () => <div data-testid="dashboard-charts" />,
}));
vi.mock('../components/MessageQueue', () => ({
  default: () => <div data-testid="message-queue" />,
}));
vi.mock('../components/MessageHistory', () => ({
  default: () => <div data-testid="message-history" />,
}));
vi.mock('../components/DashboardStatsCard', () => ({
  default: ({ title, value }: { title: string; value: number }) => (
    <div data-testid={`stat-${title.replace(/\s+/g, '-').toLowerCase()}`}>{value}</div>
  ),
}));

// Stub WebSocket client — we just need no-op subscriptions
vi.mock('../../api/websocket', () => ({
  default: { on: vi.fn(() => vi.fn()) },
}));

// Provide a stable default return for both hooks
// Use null stats to avoid collisions with mockStats numeric values
const mockHistoryHook = {
  trends: vi.fn(() => ({ volumeData: [], successData: [] })),
  live: false,
  stats: null,
};
const mockQueueHook = { live: false };

vi.mock('../hooks/useMessages', () => ({
  useMessageHistory: () => mockHistoryHook,
  useMessageQueue: () => mockQueueHook,
}));

// Import after mocks are registered
import Dashboard, { type DashboardStats } from '../components/Dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockStats: DashboardStats = {
  total_messages_sent: 42,
  messages_sent_today: 5,
  messages_sent_this_week: 18,
  messages_sent_this_month: 38,
  success_rate: 92,
  friends_with_upcoming_birthdays: 7,
  queued_messages: 3,
  automation_enabled: true,
  next_scheduled_check: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min from now
};

function setupSendMessage(response: unknown) {
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a spinner while loading stats', async () => {
    // Never resolve so the component stays in loading state
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<Dashboard onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument(); // Spinner
  });

  it('shows an error message when the runtime call rejects', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Service unavailable'),
    );
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/service unavailable/i)).toBeInTheDocument());
  });

  it('renders the success rate hero card when stats load', async () => {
    setupSendMessage(mockStats);
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('92%')).toBeInTheDocument());
  });

  it('renders key stat cards (Total Sent, Today, This Week, This Month)', async () => {
    setupSendMessage(mockStats);
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('stat-total-sent')).toBeInTheDocument());
    expect(screen.getByTestId('stat-total-sent').textContent).toBe('42');
    expect(screen.getByTestId('stat-today').textContent).toBe('5');
    expect(screen.getByTestId('stat-this-week').textContent).toBe('18');
    expect(screen.getByTestId('stat-this-month').textContent).toBe('38');
  });

  it('shows upcoming birthdays and queued messages', async () => {
    setupSendMessage(mockStats);
    render(<Dashboard onClose={vi.fn()} />);
    // Upcoming birthdays (7) and queued messages (3) are plain divs, not DashboardStatsCard.
    // With stats.failed set to null in the mock hook, '3' no longer collides.
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows automation as Active when automation_enabled=true', async () => {
    setupSendMessage(mockStats);
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/✓ active/i)).toBeInTheDocument());
  });

  it('shows automation as Inactive when automation_enabled=false', async () => {
    setupSendMessage({ ...mockStats, automation_enabled: false });
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/○ inactive/i)).toBeInTheDocument());
  });

  it('shows "Not scheduled" when next_scheduled_check is absent', async () => {
    setupSendMessage({ ...mockStats, automation_enabled: true, next_scheduled_check: undefined });
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Not scheduled')).toBeInTheDocument());
  });

  it('shows "Unable to load statistics" when stats is null after loading', async () => {
    setupSendMessage(null);
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/unable to load statistics/i)).toBeInTheDocument());
  });

  it('calls sendMessage again when Refresh button is clicked', async () => {
    setupSendMessage(mockStats);
    const user = userEvent.setup();
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('92%')).toBeInTheDocument());

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshBtn);

    // Initial mount + 1 manual refresh = 2 calls
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('renders the DashboardCharts stub after stats load', async () => {
    setupSendMessage(mockStats);
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('dashboard-charts')).toBeInTheDocument());
  });

  it('formats next check time as "Soon" when check is < 1 minute away', async () => {
    setupSendMessage({
      ...mockStats,
      automation_enabled: true,
      next_scheduled_check: new Date(Date.now() + 30_000).toISOString(), // 30 seconds
    });
    render(<Dashboard onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Soon')).toBeInTheDocument());
  });
});
