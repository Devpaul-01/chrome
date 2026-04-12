import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BillingPortalResponse,
  CancelSubscriptionResponse,
  ChangePlanResponse,
  CheckoutSessionRequest,
  SubscriptionStatus,
} from '../../api/client';
import { sendBackgroundMessage } from '../api';
import Spinner from './Spinner';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';

/* ─── plan pricing constants (update when Stripe prices change) ─────────── */
const PLANS = {
  monthly: { label: 'Monthly', price: '$4.99', cycle: 'per month', yearlyEquiv: '$59.88/yr' },
  yearly: { label: 'Yearly', price: '$39.99', cycle: 'per year', savings: 'Save 33%' },
} as const;

/* ─── helpers ───────────────────────────────────────────────────────────── */
function formatDate(iso?: string): string {
  if (!iso) return 'n/a';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type StatusBadge = { text: string; className: string };
function getStatusBadge(sub: SubscriptionStatus | null): StatusBadge {
  if (!sub) return { text: 'Unknown', className: 'bg-gray-100 text-gray-600' };
  if (sub.cancel_at_period_end)
    return { text: 'Cancels Soon', className: 'bg-yellow-100 text-yellow-800' };
  if (sub.in_grace_period) return { text: 'Past Due', className: 'bg-orange-100 text-orange-800' };
  switch (sub.status) {
    case 'ACTIVE':
      return { text: 'Active', className: 'bg-green-100 text-green-800' };
    case 'TRIALING':
      return { text: 'Trialing', className: 'bg-blue-100 text-blue-800' };
    case 'PAST_DUE':
      return { text: 'Past Due', className: 'bg-orange-100 text-orange-800' };
    case 'CANCELED':
      return { text: 'Canceled', className: 'bg-red-100 text-red-800' };
    default:
      return sub.is_active
        ? { text: 'Active', className: 'bg-green-100 text-green-800' }
        : { text: 'Inactive', className: 'bg-gray-100 text-gray-600' };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function SubscriptionPanel() {
  /* ── state ─────────────────────────────────────────────────────────────── */
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState('');
  const cancelDialogRef = useRef<HTMLDivElement>(null);

  // Change-plan modal
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [targetPlan, setTargetPlan] = useState<'monthly' | 'yearly'>('monthly');

  /* ── data fetching ─────────────────────────────────────────────────────── */
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await sendBackgroundMessage<SubscriptionStatus>({
        type: 'subscription.status',
      });
      setSubscription(status);
    } catch {
      setSubscription(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Auto-dismiss success messages
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 5000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // Focus-trap for cancel modal
  useEffect(() => {
    if (!showCancelModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCancelModal(false);
    };
    document.addEventListener('keydown', handler);
    cancelDialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [showCancelModal]);

  /* ── actions ───────────────────────────────────────────────────────────── */
  async function handleCheckout(plan: 'monthly' | 'yearly') {
    setActionLoading('checkout');
    setError(null);
    try {
      const payload: CheckoutSessionRequest = {
        plan,
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      };
      const result = await sendBackgroundMessage<{ checkout_url: string }>({
        type: 'subscription.checkout',
        payload,
      });
      chrome.tabs.create({ url: result.checkout_url });
    } catch {
      setError('Failed to start checkout. Please try again.');
    } finally {
      setActionLoading(null);
      void fetchStatus();
    }
  }

  async function handleCancel() {
    setActionLoading('cancel');
    setError(null);
    try {
      const res = await sendBackgroundMessage<CancelSubscriptionResponse>({
        type: 'subscription.cancel',
      });
      setSuccessMsg(res.message);
      setShowCancelModal(false);
      setCancelFeedback('');
      void fetchStatus();
    } catch {
      setError('Failed to cancel subscription. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReactivate() {
    setActionLoading('reactivate');
    setError(null);
    try {
      const res = await sendBackgroundMessage<CancelSubscriptionResponse>({
        type: 'subscription.reactivate',
      });
      setSuccessMsg(res.message);
      void fetchStatus();
    } catch {
      setError('Failed to reactivate subscription. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleChangePlan() {
    setActionLoading('changePlan');
    setError(null);
    try {
      const res = await sendBackgroundMessage<ChangePlanResponse>({
        type: 'subscription.changePlan',
        payload: { new_plan: targetPlan },
      });
      setSuccessMsg(res.message);
      setShowChangePlanModal(false);
      void fetchStatus();
    } catch {
      setError('Failed to change plan. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBillingPortal() {
    setActionLoading('billing');
    setError(null);
    try {
      const res = await sendBackgroundMessage<BillingPortalResponse>({
        type: 'subscription.billingPortal',
      });
      chrome.tabs.create({ url: res.portal_url });
    } catch {
      setError('Failed to open billing portal. Please set up a subscription first.');
    } finally {
      setActionLoading(null);
    }
  }

  /* ── derived ───────────────────────────────────────────────────────────── */
  const isActive = subscription?.is_active ?? false;
  const currentPlan = subscription?.plan;
  const badge = getStatusBadge(subscription);
  const isPendingCancel = subscription?.cancel_at_period_end ?? false;
  const hasStripeCustomer = !!subscription?.stripe_customer_id;

  /* ── render ────────────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <section className="card">
        <h2 className="text-lg font-semibold mb-5">Subscription</h2>
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {/* ─── Alerts ──────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="bg-red-100 border-l-4 border-red-400 text-red-800 px-4 py-3 rounded-lg text-sm"
          role="alert"
        >
          {error}
          <button
            className="float-right font-bold"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {successMsg && (
        <div
          className="bg-green-100 border-l-4 border-green-400 text-green-800 px-4 py-3 rounded-lg text-sm"
          role="status"
        >
          {successMsg}
        </div>
      )}

      {/* ─── Section 1: Current Status ───────────────────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">
          Subscription Status{' '}
          <HelpTooltip label="Your subscription status determines access to premium features. Active and Trialing subscriptions have full access. If your payment fails, you'll enter a grace period before losing access." />
        </h2>

        <FeatureTip
          tipId="subscription_overview"
          message="Choose a plan to unlock all features. You can switch between monthly and yearly plans anytime — charges are prorated."
        />
        <div className="flex items-center gap-3 mb-3">
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.className}`}
          >
            {badge.text}
          </span>
          {currentPlan && (
            <span className="text-sm text-gray-600 capitalize">{currentPlan} plan</span>
          )}
        </div>

        {subscription?.current_period_end && (
          <p className="text-sm text-gray-600 mb-1">
            {isPendingCancel ? 'Access until' : 'Renews on'}:{' '}
            <span className="font-medium">{formatDate(subscription.current_period_end)}</span>
          </p>
        )}

        {isPendingCancel && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800 mb-2">
              Your subscription will be canceled at the end of the current billing period. You can
              reactivate anytime before then.
            </p>
            <button
              onClick={handleReactivate}
              className="btn flex items-center justify-center gap-2 text-sm"
              disabled={actionLoading === 'reactivate'}
            >
              {actionLoading === 'reactivate' && <Spinner size="sm" />}
              {actionLoading === 'reactivate' ? 'Reactivating...' : 'Reactivate Subscription'}
            </button>
          </div>
        )}

        {subscription?.in_grace_period && (
          <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-sm text-orange-800">
              ⚠️ Your last payment failed. Please update your payment method to avoid losing access.
            </p>
          </div>
        )}
      </div>

      {/* ─── Section 2: Plan Comparison ──────────────────────────────────── */}
      <div className="card">
        <h3 className="text-base font-semibold mb-4">
          Plans{' '}
          <HelpTooltip label="Monthly is flexible with no commitment. Yearly saves 33% and is billed once per year. You can switch plans anytime — the difference is prorated on your next invoice." />
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {(
            Object.entries(PLANS) as Array<[keyof typeof PLANS, (typeof PLANS)[keyof typeof PLANS]]>
          ).map(([key, plan]) => {
            const isCurrent = currentPlan === key;
            return (
              <div
                key={key}
                className={`relative rounded-lg border-2 p-4 text-center transition-shadow ${
                  isCurrent
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:shadow-md'
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    CURRENT
                  </span>
                )}
                {'savings' in plan && (
                  <span className="absolute -top-2.5 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {plan.savings}
                  </span>
                )}
                <h4 className="font-semibold text-sm mb-1">{plan.label}</h4>
                <p className="text-xl font-bold text-gray-900 mb-0.5">{plan.price}</p>
                <p className="text-xs text-gray-500 mb-3">{plan.cycle}</p>
                {'yearlyEquiv' in plan && (
                  <p className="text-[10px] text-gray-400 mb-3">{plan.yearlyEquiv}</p>
                )}

                {isCurrent ? (
                  <span className="inline-block text-xs text-blue-600 font-medium">
                    ✓ Your plan
                  </span>
                ) : isActive ? (
                  <button
                    onClick={() => {
                      setTargetPlan(key);
                      setShowChangePlanModal(true);
                    }}
                    className="btn-outline-orange text-xs w-full"
                    disabled={!!actionLoading}
                  >
                    Switch to {plan.label}
                  </button>
                ) : (
                  <button
                    onClick={() => handleCheckout(key)}
                    className="btn-orange text-xs w-full"
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'checkout' ? (
                      <Spinner size="sm" />
                    ) : (
                      `Subscribe ${plan.label}`
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Section 3: Billing & Payment ────────────────────────────────── */}
      {hasStripeCustomer && (
        <div className="card">
          <h3 className="text-base font-semibold mb-3">
            Billing & Payment{' '}
            <HelpTooltip label="Opens the Stripe billing portal where you can update your credit card, view past invoices, and download receipts. All payment processing is handled securely by Stripe." />
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Manage your payment methods, view invoices, and download receipts via the Stripe billing
            portal.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleBillingPortal}
              className="btn flex-1 flex items-center justify-center gap-2 text-sm"
              disabled={actionLoading === 'billing'}
            >
              {actionLoading === 'billing' && <Spinner size="sm" />}
              Manage Payment Methods
            </button>
            <button
              onClick={handleBillingPortal}
              className="btn-outline-orange flex-1 flex items-center justify-center gap-2 text-sm"
              disabled={actionLoading === 'billing'}
            >
              View Billing History
            </button>
          </div>
        </div>
      )}

      {/* ─── Section 4: Cancel ───────────────────────────────────────────── */}
      {isActive && !isPendingCancel && (
        <div className="card">
          <h3 className="text-base font-semibold mb-2">Cancel Subscription</h3>
          <p className="text-xs text-gray-500 mb-3">
            You can cancel anytime. You&apos;ll retain access until the end of your current billing
            period.
          </p>
          <button
            onClick={() => setShowCancelModal(true)}
            className="btn-danger text-sm"
            disabled={!!actionLoading}
          >
            Cancel Subscription
          </button>
        </div>
      )}

      {/* ─── Cancel Confirmation Modal ───────────────────────────────────── */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            ref={cancelDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-modal-title"
            tabIndex={-1}
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 id="cancel-modal-title" className="text-lg font-semibold text-gray-900">
                Cancel Subscription
              </h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  You&apos;ll retain access to all features until{' '}
                  <strong>{formatDate(subscription?.current_period_end)}</strong>. After that, your
                  subscription will not renew.
                </p>
              </div>

              <div>
                <label
                  htmlFor="cancel-feedback"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  We&apos;d love to know why you&apos;re leaving{' '}
                  <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="cancel-feedback"
                  value={cancelFeedback}
                  onChange={(e) => setCancelFeedback(e.target.value)}
                  placeholder="What could we do better?"
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => setShowCancelModal(false)}
                className="btn text-sm"
                disabled={actionLoading === 'cancel'}
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancel}
                className="btn-danger flex items-center justify-center gap-2 text-sm"
                disabled={actionLoading === 'cancel'}
              >
                {actionLoading === 'cancel' && <Spinner size="sm" />}
                {actionLoading === 'cancel' ? 'Canceling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Change Plan Confirmation Modal ──────────────────────────────── */}
      {showChangePlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-plan-modal-title"
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 id="change-plan-modal-title" className="text-lg font-semibold text-gray-900">
                Change Plan
              </h3>
              <button
                onClick={() => setShowChangePlanModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-700">
                Switch from <strong className="capitalize">{currentPlan}</strong> to{' '}
                <strong className="capitalize">{targetPlan}</strong> ({PLANS[targetPlan].price}{' '}
                {PLANS[targetPlan].cycle}).
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  Stripe will automatically prorate your billing. You&apos;ll be charged or credited
                  the difference for the remainder of your current billing period.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => setShowChangePlanModal(false)}
                className="btn-outline-orange text-sm"
                disabled={actionLoading === 'changePlan'}
              >
                Go Back
              </button>
              <button
                onClick={handleChangePlan}
                className="btn-orange flex items-center justify-center gap-2 text-sm"
                disabled={actionLoading === 'changePlan'}
              >
                {actionLoading === 'changePlan' && <Spinner size="sm" />}
                {actionLoading === 'changePlan' ? 'Switching...' : 'Confirm Switch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
