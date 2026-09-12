import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BTCPay checkout payment method contract', () => {
  const BASE = 'http://localhost:8000';
  const TOKEN = 'access-token';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  function successfulCheckout() {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          checkout_attempt_id: 'attempt-1',
          payment_id: 'payment-1',
          provider: 'btcpay',
          provider_payment_id: 'invoice-1',
          provider_order_id: 'order-1',
          status: 'New',
          checkout_url: 'https://btcpay.test/i/invoice-1',
          amount: '10.00',
          currency: 'USD',
          plan_code: 'monthly',
          billing_term_months: 1,
          reused: false,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
  }

  it('sends bitcoin as the selected payment method', async () => {
    const { createBTCPayCheckout } = await import('../client');
    successfulCheckout();

    await createBTCPayCheckout(BASE, TOKEN, 'monthly', 'bitcoin', 'idem-btc-001');

    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(url).toBe(`${BASE}/api/payments/btcpay/checkout`);
    expect((options as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      plan_code: 'monthly',
      payment_method: 'bitcoin',
    });
    expect((options as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'Idempotency-Key': 'idem-btc-001',
    });
  });

  it('sends monero as the selected payment method', async () => {
    const { createBTCPayCheckout } = await import('../client');
    successfulCheckout();

    await createBTCPayCheckout(BASE, TOKEN, 'monthly', 'monero', 'idem-xmr-001');

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      plan_code: 'monthly',
      payment_method: 'monero',
    });
    expect((options as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'idem-xmr-001',
    });
  });

  it('keeps bitcoin and monero idempotency keys independent at the API boundary', async () => {
    const { createBTCPayCheckout } = await import('../client');

    successfulCheckout();
    await createBTCPayCheckout(BASE, TOKEN, 'yearly', 'bitcoin', 'yearly:bitcoin:key');

    successfulCheckout();
    await createBTCPayCheckout(BASE, TOKEN, 'yearly', 'monero', 'yearly:monero:key');

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;

    const btcOptions = calls[0][1] as RequestInit;
    const xmrOptions = calls[1][1] as RequestInit;

    expect(btcOptions.headers).toMatchObject({
      'Idempotency-Key': 'yearly:bitcoin:key',
    });
    expect(xmrOptions.headers).toMatchObject({
      'Idempotency-Key': 'yearly:monero:key',
    });

    expect(JSON.parse(String(btcOptions.body)).payment_method).toBe('bitcoin');
    expect(JSON.parse(String(xmrOptions.body)).payment_method).toBe('monero');
  });
});
