import { useCallback, useEffect, useState } from 'react';
import type { CheckoutSessionRequest, SubscriptionStatus } from '../../api/client';
import { sendBackgroundMessage } from '../api';
import Spinner from './Spinner';

export default function SubscriptionPanel() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSubscriptionStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await sendBackgroundMessage<SubscriptionStatus>({
        type: 'subscription.status',
      });
      setSubscription(status);
    } catch (error) {
      // keep subscription null on error
      setSubscription(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  async function handleSubscriptionCheckout() {
    setIsSubmitting(true);
    try {
      const payload: CheckoutSessionRequest = {
        plan: selectedPlan,
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      };
      const result = await sendBackgroundMessage<{ checkout_url: string }>({
        type: 'subscription.checkout',
        payload,
      });
      // open checkout in new tab
      chrome.tabs.create({ url: result.checkout_url });
    } catch (error) {
      console.error('Subscription checkout failed', error);
    } finally {
      setIsSubmitting(false);
      void fetchSubscriptionStatus();
    }
  }

  return (
    <section className="card">
      <h2 className="text-lg font-semibold mb-5">Subscription</h2>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm">
            <span className="font-medium">Status:</span>{' '}
            {subscription ? (subscription.is_active ? 'Active' : 'Inactive') : 'Unknown'}
          </div>
          <div className="mb-3 text-sm">
            <span className="font-medium">Plan:</span> {subscription?.plan ?? 'n/a'}
          </div>
          <div className="mb-5 text-sm">
            <span className="font-medium">Renewal:</span>{' '}
            {subscription?.current_period_end ?? 'n/a'}
          </div>

          <div className="h-4" />

          <div className="flex gap-3 mb-5">
            <label className="flex-1">
              <input
                type="radio"
                name="plan"
                value="monthly"
                checked={selectedPlan === 'monthly'}
                onChange={() => setSelectedPlan('monthly')}
              />{' '}
              Monthly
            </label>
            <label className="flex-1">
              <input
                type="radio"
                name="plan"
                value="yearly"
                checked={selectedPlan === 'yearly'}
                onChange={() => setSelectedPlan('yearly')}
              />{' '}
              Yearly
            </label>
          </div>

          <div className="h-4" />

          <button
            onClick={handleSubscriptionCheckout}
            className="btn flex items-center justify-center gap-2"
            disabled={isSubmitting}
            aria-busy={isSubmitting ? 'true' : 'false'}
            aria-disabled={isSubmitting ? 'true' : 'false'}
          >
            {isSubmitting && <Spinner size="sm" />}
            {isSubmitting ? 'Preparing...' : 'Upgrade / Renew'}
          </button>
        </>
      )}
    </section>
  );
}
