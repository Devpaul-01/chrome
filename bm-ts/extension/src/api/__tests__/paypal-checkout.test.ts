import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PayPal recurring checkout API contract', () => {
  const BASE = 'http://localhost:8000';
  const TOKEN = 'access-token';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  function successfulCheckout() {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          checkout_attempt_id: 'attempt-paypal-1',
          payment_id: 'payment-paypal-1',
          provider: 'paypal',
          provider_payment_id: null,
          provider_order_id: 'ORDER-PAYPAL-1',
          status: 'CREATED',
          checkout_url: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-PAYPAL-1',
          amount: '9.70',
          currency: 'USD',
          plan_code: 'monthly',
          billing_term_months: 1,
          reused: false,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  it('sends only the server-owned plan code and idempotency key', async () => {
    const { createPayPalCheckout } = await import('../client');
    successfulCheckout();

    await createPayPalCheckout(BASE, TOKEN, 'monthly', 'idem-paypal-001');

    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${BASE}/api/payments/paypal/subscription/checkout`);
    expect((options as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({ plan_code: 'monthly' });
    expect((options as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'Idempotency-Key': 'idem-paypal-001',
    });
  });

  it('keeps PayPal idempotency keys independent by plan', async () => {
    const { createPayPalCheckout } = await import('../client');

    successfulCheckout();
    await createPayPalCheckout(BASE, TOKEN, 'monthly', 'monthly:paypal:key');

    successfulCheckout();
    await createPayPalCheckout(BASE, TOKEN, 'yearly', 'yearly:paypal:key');

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'monthly:paypal:key',
    });
    expect((calls[1][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'yearly:paypal:key',
    });
  });
});
