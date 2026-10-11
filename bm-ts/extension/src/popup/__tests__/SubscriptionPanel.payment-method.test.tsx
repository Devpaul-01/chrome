import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionPanel from '../components/SubscriptionPanel';
import { sendBackgroundMessage } from '../api';

vi.mock('../api', () => ({
  sendBackgroundMessage: vi.fn(),
}));

const sendMessageMock = vi.mocked(sendBackgroundMessage);

const activeSubscription = {
  status: 'ACTIVE',
  is_active: true,
  plan: 'monthly',
  cancel_at_period_end: false,
  in_grace_period: false,
};

describe('SubscriptionPanel payment-method selection', () => {
  beforeEach(() => {
    sendMessageMock.mockImplementation(async (message: unknown) => {
      const typedMessage = message as { type?: string };
      if (typedMessage.type === 'subscription.status') return activeSubscription;
      if (typedMessage.type === 'subscription.checkout') {
        return { checkout_url: 'https://btcpay.test/i/test-invoice' };
      }
      return {};
    });
    Object.defineProperty(chrome, 'tabs', { configurable: true, value: { create: vi.fn().mockResolvedValue(undefined) } });
  });

  it.each([
    ['Bitcoin (BTC)', 'bitcoin'],
    ['Monero (XMR)', 'monero'],
    ['PayPal', 'paypal'],
  ] as const)('clicking %s sends payment_method=%s without stale state', async (label, expectedMethod) => {
    const user = userEvent.setup();
    render(<SubscriptionPanel />);

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledWith({ type: 'subscription.status' }));

    const renewalButton = await screen.findByRole('button', { name: /renew monthly early/i });
    await user.click(renewalButton);

    const paymentButton = await screen.findByRole('button', { name: new RegExp(label.replace(/[()]/g, '\\$&'), 'i') });
    await user.click(paymentButton);

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription.checkout',
          payload: expect.objectContaining({
            plan: 'monthly',
            payment_method: expectedMethod,
          }),
        }),
      );
    });
  });  it('does not expose Rapyd as a customer-facing payment method', async () => {
    const user = userEvent.setup();
    render(<SubscriptionPanel />);
    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledWith({ type: 'subscription.status' }));
    const renewalButton = await screen.findByRole('button', { name: /renew monthly early/i });
    await user.click(renewalButton);
    expect(screen.queryByRole('button', { name: /credit \/ debit card/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/powered by rapyd/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /paypal/i })).toBeInTheDocument();
  });


});
