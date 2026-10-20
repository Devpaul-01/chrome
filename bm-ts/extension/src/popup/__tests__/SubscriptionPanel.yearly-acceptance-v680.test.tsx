import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionPanel from '../components/SubscriptionPanel';
import { sendBackgroundMessage } from '../api';

vi.mock('../api', () => ({ sendBackgroundMessage: vi.fn() }));
const send = vi.mocked(sendBackgroundMessage);

describe('Yearly switch UI with simulated provider lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(chrome, 'tabs', {
      configurable: true,
      value: { create: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('keeps Monthly pending and displays Yearly only after confirmed status refresh', async () => {
    let confirmed = false;
    const status = () => ({
      status: 'ACTIVE', is_active: true,
      plan: confirmed ? 'yearly' : 'monthly',
      billing_provider: 'paypal',
      provider_subscription_id: 'I-SIMULATED-NOT-REAL',
      auto_renew: true,
      cancel_at_period_end: false,
      in_grace_period: false,
      next_billing_at: '2026-12-31T00:00:00Z',
    });
    send.mockImplementation(async (message: unknown) => {
      const m = message as { type?: string; payload?: { target_plan?: string } };
      if (m.type === 'subscription.status') return status();
      if (m.type === 'subscription.planSwitchIntent') {
        expect(m.payload?.target_plan).toBe('yearly');
        return { intent_id: 'INTENT-SIMULATED' };
      }
      if (m.type === 'subscription.paypalPlanRevise') {
        return { status: 'pending', requires_reconciliation: true, approval_url: null };
      }
      throw new Error('Unexpected message: ' + m.type);
    });

    render(<SubscriptionPanel />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /switch to yearly/i }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({
      type: 'subscription.paypalPlanRevise',
      payload: { intent_id: 'INTENT-SIMULATED' },
    }));
    expect(await screen.findByText(/current plan remains unchanged/i)).toBeInTheDocument();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'subscription.checkout' }));

    confirmed = true; // Controlled fake provider settlement; no backend write.
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(send.mock.calls.filter(([m]) => (m as {type?: string}).type === 'subscription.status').length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByText(/yearly plan/i)).toBeInTheDocument());
  });
});
