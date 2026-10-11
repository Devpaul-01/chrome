"""CLI worker for automatic BTCPay checkout reconciliation."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal

from app.db.session import AsyncSessionLocal
from app.services.payment_checkout_recovery import recover_stale_btcpay_checkouts
from app.services.payment_production_validation import validate_payment_production_config
from app.core.config import settings
from app.services.worker_heartbeat import record_worker_failure, record_worker_started, record_worker_success


logger = logging.getLogger(__name__)


async def _run_once() -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        result = await recover_stale_btcpay_checkouts(db=db)
    logger.info("btcpay_checkout_recovery_batch", extra=result)
    return result


async def _run_loop() -> None:
    validate_payment_production_config(settings)

    interval = int(os.getenv("PAYMENT_CHECKOUT_RECOVERY_INTERVAL_SECONDS", "60"))
    stop = asyncio.Event()

    loop = asyncio.get_running_loop()

    def request_stop() -> None:
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, request_stop)
        except (NotImplementedError, RuntimeError):
            pass

    async with AsyncSessionLocal() as db:
        await record_worker_started(db, "payment-recovery-worker")

    while not stop.is_set():
        try:
            result = await _run_once()
            async with AsyncSessionLocal() as db:
                await record_worker_success(db, "payment-recovery-worker", result)
        except Exception:
            # Do not emit exception text; provider/client exceptions may contain
            # credentials, URLs, or payment identifiers.
            logger.error("btcpay_checkout_recovery_batch_failed")
            try:
                async with AsyncSessionLocal() as db:
                    await record_worker_failure(db, "payment-recovery-worker")
            except Exception:
                logger.error("payment_recovery_worker_heartbeat_failed")

        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    if args.once:
        validate_payment_production_config(settings)
        print(asyncio.run(_run_once()))
    else:
        asyncio.run(_run_loop())


if __name__ == "__main__":
    main()
