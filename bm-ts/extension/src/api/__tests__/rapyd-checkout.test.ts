import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Rapyd checkout API contract', () => {
  const BASE = 'http://localhost:8000';
  const TOKEN = 'access-token';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  function successfulCheckout() {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          checkout_attempt_id: 'attempt-rapyd-1',
          payment_id: 'payment-rapyd-1',
          provider: 'rapyd',
          provider_payment_id: 'checkout_rapyd_1',
          provider_order_id: 'BM-RAPYD-attempt-rapyd-1',
          status: 'NEW',
          checkout_url: 'https://sandboxcheckout.rapyd.net/test',
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

  it('sends only the server-owned plan code and the idempotency key', async () => {
    const { createRapydCheckout } = await import('../client');
    successfulCheckout();

    await createRapydCheckout(BASE, TOKEN, 'monthly', 'idem-rapyd-001');

    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${BASE}/api/payments/rapyd/checkout`);
    expect((options as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      plan_code: 'monthly',
    });
    expect((options as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'Idempotency-Key': 'idem-rapyd-001',
    });
  });

  it('keeps Rapyd idempotency keys independent by plan', async () => {
    const { createRapydCheckout } = await import('../client');

    successfulCheckout();
    await createRapydCheckout(BASE, TOKEN, 'monthly', 'monthly:rapyd:key');

    successfulCheckout();
    await createRapydCheckout(BASE, TOKEN, 'yearly', 'yearly:rapyd:key');

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'monthly:rapyd:key',
    });
    expect((calls[1][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'yearly:rapyd:key',
    });
    expect(JSON.parse(String((calls[0][1] as RequestInit).body))).toEqual({
      plan_code: 'monthly',
    });
    expect(JSON.parse(String((calls[1][1] as RequestInit).body))).toEqual({
      plan_code: 'yearly',
    });
  });
});
