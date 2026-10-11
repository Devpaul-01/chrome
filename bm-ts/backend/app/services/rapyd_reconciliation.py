from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PaymentCheckoutAttempt, PaymentTransaction
from app.services import rapyd
from app.services.rapyd_settlement import settle_rapyd_payment_snapshot


class RapydReconciliationError(RuntimeError):
    """Retryable or structurally unsafe reconciliation failure."""


def _extract_payment_id(checkout: dict[str, Any]) -> str:
    payment = checkout.get("payment")
    if not isinstance(payment, dict):
        raise RapydReconciliationError("Rapyd checkout has no payment object.")

    payment_id = str(payment.get("id") or "").strip()
    if not payment_id.startswith("payment_"):
        raise RapydReconciliationError("Rapyd checkout has no valid payment id.")

    return payment_id


async def reconcile_rapyd_transaction(
    *,
    db: AsyncSession,
    transaction_id: UUID,
) -> dict[str, Any]:
    """Recover a Rapyd transaction when the normal webhook path was lost.

    Provider reads happen before settlement. Any provider/network exception is
    propagated so the worker can retry with backoff. Settlement itself uses the
    same locked/idempotent primitive as the authenticated webhook path.
    """
    tx = (
        await db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.id == transaction_id,
                PaymentTransaction.provider == "rapyd",
            )
        )
    ).scalar_one_or_none()

    if tx is None:
        return {"reconciled": False, "reason": "transaction_not_found"}

    if tx.status == "Settled" and tx.paid_at is not None:
        return {"reconciled": True, "reason": "already_settled"}

    attempt = (
        await db.execute(
            select(PaymentCheckoutAttempt).where(
                PaymentCheckoutAttempt.id == tx.checkout_attempt_id
            )
        )
    ).scalar_one_or_none()

    if attempt is None:
        raise RapydReconciliationError("Rapyd checkout attempt is missing.")

    checkout_id = str(attempt.provider_payment_id or "").strip()
    if not checkout_id.startswith("checkout_"):
        raise RapydReconciliationError("Rapyd checkout id is missing or invalid.")

    checkout = await rapyd.retrieve_checkout(checkout_id)
    payment_id = _extract_payment_id(checkout)
    payment = await rapyd.retrieve_payment(payment_id)

    reference = str(payment.get("merchant_reference_id") or "").strip()
    if reference != str(tx.provider_order_id):
        return {
            "reconciled": False,
            "reason": "merchant_reference_mismatch",
        }

    outcome = await settle_rapyd_payment_snapshot(
        db=db,
        payment=payment,
        source="reconciliation",
    )

    reason = str(outcome.get("reason") or "")
    settled = bool(outcome.get("settled"))

    # Caller/worker gets one atomic transaction boundary.
    await db.commit()

    return {
        "reconciled": settled,
        "reason": reason,
    }

async def reconcile_stale_rapyd_transactions(
    *,
    db: AsyncSession,
    now=None,
    limit: int = 50,
    stale_seconds: int = 120,
) -> dict[str, int]:
    """Reconcile a bounded batch of stale unresolved Rapyd transactions.

    PostgreSQL uses FOR UPDATE SKIP LOCKED so concurrent workers do not claim
    the same transaction. Provider/network failures remain retryable and do
    not fabricate financial truth. Verified non-final financial states remain
    unresolved and never grant entitlement.
    """
    from datetime import datetime, timedelta, timezone

    effective_now = now or datetime.now(timezone.utc)
    stale_before = effective_now - timedelta(seconds=max(30, int(stale_seconds)))
    batch_limit = max(1, min(int(limit), 500))

    stmt = (
        select(PaymentTransaction.id)
        .where(
            PaymentTransaction.provider == "rapyd",
            PaymentTransaction.status.in_(("NEW", "Processing")),
            PaymentTransaction.paid_at.is_(None),
            PaymentTransaction.updated_at <= stale_before,
        )
        .order_by(PaymentTransaction.updated_at.asc())
        .limit(batch_limit)
        .with_for_update(skip_locked=True)
    )

    transaction_ids = list((await db.execute(stmt)).scalars().all())

    result = {
        "scanned": len(transaction_ids),
        "settled": 0,
        "already_settled": 0,
        "unresolved": 0,
        "retryable": 0,
        "terminal": 0,
        "failed": 0,
    }

    for transaction_id in transaction_ids:
        try:
            outcome = await reconcile_rapyd_transaction(
                db=db,
                transaction_id=transaction_id,
            )
            reason = str(outcome.get("reason") or "")
            if outcome.get("reconciled") and reason == "already_settled":
                result["already_settled"] += 1
            elif outcome.get("reconciled"):
                result["settled"] += 1
            elif reason in {
                "financial_truth_not_final",
                "merchant_reference_mismatch",
                "payment_not_found",
                "payment_identity_already_bound",
                "missing_merchant_reference_id",
            }:
                result["unresolved"] += 1
            else:
                result["terminal"] += 1

        except (
            rapyd.RapydTransportError,
            rapyd.RapydRateLimitError,
            RapydReconciliationError,
        ):
            await db.rollback()
            result["retryable"] += 1

        except rapyd.RapydResponseError:
            await db.rollback()
            result["retryable"] += 1

        except rapyd.RapydProviderError as exc:
            await db.rollback()
            if exc.status_code == 429 or exc.status_code >= 500:
                result["retryable"] += 1
            else:
                result["terminal"] += 1

        except Exception:
            await db.rollback()
            result["failed"] += 1

    return result

async def ensure_reconciliation_job(
    *,
    db: AsyncSession,
    transaction_id: UUID,
    provider: str = "rapyd",
    now=None,
    max_attempts: int = 8,
):
    """Create or return one durable reconciliation job per payment transaction."""
    from datetime import datetime, timezone
    from app.db.models import PaymentReconciliationJob

    current = now or datetime.now(timezone.utc)
    job = (
        await db.execute(
            select(PaymentReconciliationJob)
            .where(PaymentReconciliationJob.transaction_id == transaction_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if job is not None:
        return job

    job = PaymentReconciliationJob(
        transaction_id=transaction_id,
        provider=provider,
        status="PENDING",
        attempts=0,
        max_attempts=max(1, int(max_attempts)),
        next_attempt_at=current,
        last_attempt_at=None,
        claim_expires_at=None,
        completed_at=None,
        dead_lettered_at=None,
        last_error_code=None,
        requeue_count=0,
        last_requeued_at=None,
        metadata_payload={},
        created_at=current,
        updated_at=current,
    )
    db.add(job)
    await db.flush()
    return job


def _retry_delay_seconds(attempts: int, *, retry_after: float | None = None) -> int:
    """Bounded exponential backoff. Provider Retry-After wins when larger."""
    computed = min(3600, 30 * (2 ** max(0, attempts - 1)))
    if retry_after is not None:
        try:
            computed = max(computed, int(float(retry_after)))
        except (TypeError, ValueError):
            pass
    return max(30, computed)


async def process_reconciliation_jobs(
    *,
    db: AsyncSession,
    now=None,
    limit: int = 50,
    lease_seconds: int = 300,
) -> dict[str, int]:
    """Claim and process a durable bounded batch with leases and dead-lettering.

    Claims are committed before any provider network call. This preserves the
    attempt counter and processing lease across provider failures, transaction
    rollbacks, and worker crashes. The entire selected batch is claimed before
    releasing row locks so concurrent workers cannot take later rows from the
    same batch after the first per-job commit.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import or_
    from app.db.models import PaymentReconciliationJob

    current = now or datetime.now(timezone.utc)
    lease = timedelta(seconds=max(30, int(lease_seconds)))
    batch_limit = max(1, min(int(limit), 500))

    stmt = (
        select(PaymentReconciliationJob)
        .where(
            PaymentReconciliationJob.provider == "rapyd",
            PaymentReconciliationJob.status.in_(("PENDING", "RETRY", "PROCESSING")),
            PaymentReconciliationJob.attempts < PaymentReconciliationJob.max_attempts,
            PaymentReconciliationJob.next_attempt_at <= current,
            or_(
                PaymentReconciliationJob.status != "PROCESSING",
                PaymentReconciliationJob.claim_expires_at.is_(None),
                PaymentReconciliationJob.claim_expires_at <= current,
            ),
        )
        .order_by(PaymentReconciliationJob.next_attempt_at.asc())
        .limit(batch_limit)
        .with_for_update(skip_locked=True)
    )

    jobs = (await db.execute(stmt)).scalars().all()
    result = {
        "claimed": len(jobs),
        "settled": 0,
        "already_settled": 0,
        "retry": 0,
        "unresolved": 0,
        "dead_lettered": 0,
        "failed": 0,
    }

    job_ids = []
    for job in jobs:
        job.status = "PROCESSING"
        job.claim_expires_at = current + lease
        job.last_attempt_at = current
        job.attempts += 1
        job.updated_at = current
        job_ids.append(job.id)
    if jobs:
        await db.commit()

    for job_id in job_ids:
        retry_after = None
        error_code = None
        terminal = False

        try:
            job = await db.get(PaymentReconciliationJob, job_id)
            if job is None:
                result["failed"] += 1
                continue

            outcome = await reconcile_rapyd_transaction(
                db=db,
                transaction_id=job.transaction_id,
            )
            reason = str(outcome.get("reason") or "")

            job = await db.get(
                PaymentReconciliationJob,
                job_id,
                populate_existing=True,
                with_for_update=True,
            )
            if job is None:
                result["failed"] += 1
                continue

            if outcome.get("reconciled"):
                job.status = "COMPLETED"
                job.completed_at = current
                job.claim_expires_at = None
                job.last_error_code = None
                job.updated_at = current
                result["settled" if reason != "already_settled" else "already_settled"] += 1
                await db.commit()
                continue

            if reason in {
                "financial_truth_not_final",
                "merchant_reference_mismatch",
                "payment_not_found",
                "payment_identity_already_bound",
                "missing_merchant_reference_id",
            }:
                error_code = reason
                result["unresolved"] += 1
            else:
                error_code = reason or "reconciliation_not_completed"

        except rapyd.RapydRateLimitError as exc:
            await db.rollback()
            job = await db.get(PaymentReconciliationJob, job_id, with_for_update=True)
            retry_after = exc.retry_after
            error_code = "rapyd_rate_limited"

        except rapyd.RapydTransportError:
            await db.rollback()
            job = await db.get(PaymentReconciliationJob, job_id, with_for_update=True)
            error_code = "rapyd_transport_error"

        except rapyd.RapydResponseError:
            await db.rollback()
            job = await db.get(PaymentReconciliationJob, job_id, with_for_update=True)
            error_code = "rapyd_response_error"

        except RapydReconciliationError:
            await db.rollback()
            job = await db.get(PaymentReconciliationJob, job_id, with_for_update=True)
            error_code = "rapyd_reconciliation_incomplete"

        except rapyd.RapydProviderError as exc:
            await db.rollback()
            job = await db.get(PaymentReconciliationJob, job_id, with_for_update=True)
            if exc.status_code == 429 or exc.status_code >= 500:
                error_code = "rapyd_provider_temporary"
            else:
                error_code = "rapyd_provider_terminal"
                terminal = True

        except Exception:
            await db.rollback()
            job = await db.get(PaymentReconciliationJob, job_id, with_for_update=True)
            error_code = "unexpected_reconciliation_error"
            result["failed"] += 1

        if job is None:
            result["failed"] += 1
            continue

        job.last_error_code = error_code
        job.claim_expires_at = None
        job.updated_at = current

        exhausted = job.attempts >= job.max_attempts
        if terminal or exhausted:
            job.status = "FAILED"
            job.dead_lettered_at = current
            result["dead_lettered"] += 1
        else:
            job.status = "RETRY"
            delay = _retry_delay_seconds(job.attempts, retry_after=retry_after)
            job.next_attempt_at = current + timedelta(seconds=delay)
            result["retry"] += 1

        await db.commit()

    return result
