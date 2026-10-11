"""Production Rapyd payment reconciliation worker."""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.services.rapyd_reconciliation import process_reconciliation_jobs
from app.services.worker_heartbeat import (
    record_worker_failure,
    record_worker_started,
    record_worker_success,
)

logger = logging.getLogger(__name__)
WORKER_NAME = "rapyd-reconciliation-worker"


async def run_once(limit: int) -> dict[str, int]:
    if not settings.rapyd_enabled:
        result = {"processed": 0, "disabled": 1}
        logger.info(
            "rapyd_reconciliation_disabled",
            extra={"event": "rapyd_reconciliation_disabled", **result},
        )
        return result
    async with AsyncSessionLocal() as db:
        result = await process_reconciliation_jobs(db=db, limit=limit)
    logger.info("rapyd_reconciliation_batch", extra={"event": "rapyd_reconciliation_batch", **result})
    return result


async def run_forever(limit: int, interval: int) -> None:
    if not settings.rapyd_enabled:
        logger.info(
            "rapyd_reconciliation_worker_disabled",
            extra={"event": "rapyd_reconciliation_worker_disabled"},
        )
        return

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def request_shutdown(sig_name: str) -> None:
        if not stop_event.is_set():
            logger.info(
                "rapyd_reconciliation_worker_shutdown_requested",
                extra={"event": "rapyd_reconciliation_worker_shutdown_requested", "signal": sig_name},
            )
            stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, request_shutdown, sig.name)
        except NotImplementedError:
            signal.signal(sig, lambda *_args, s=sig: request_shutdown(s.name))

    logger.info(
        "rapyd_reconciliation_worker_started",
        extra={"event": "rapyd_reconciliation_worker_started", "batch_size": limit, "interval_seconds": interval},
    )
    async with AsyncSessionLocal() as db:
        await record_worker_started(db, WORKER_NAME)

    while not stop_event.is_set():
        try:
            result = await run_once(limit)
            async with AsyncSessionLocal() as db:
                await record_worker_success(db, WORKER_NAME, result)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.error(
                "rapyd_reconciliation_worker_batch_failed",
                extra={"event": "rapyd_reconciliation_worker_batch_failed"},
            )
            try:
                async with AsyncSessionLocal() as db:
                    await record_worker_failure(db, WORKER_NAME)
            except Exception:
                logger.error(
                    "rapyd_reconciliation_worker_heartbeat_failed",
                    extra={"event": "rapyd_reconciliation_worker_heartbeat_failed"},
                )

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass

    logger.info("rapyd_reconciliation_worker_stopped", extra={"event": "rapyd_reconciliation_worker_stopped"})


def main() -> None:
    parser = argparse.ArgumentParser(description="BirthdayMessaging Rapyd reconciliation worker")
    parser.add_argument("--once", action="store_true", help="Process one bounded batch and exit")
    parser.add_argument("--limit", type=int, default=settings.rapyd_reconciliation_worker_batch_size)
    parser.add_argument("--interval", type=int, default=settings.rapyd_reconciliation_worker_interval_seconds)
    args = parser.parse_args()

    limit = min(500, max(1, args.limit))
    interval = max(1, args.interval)
    if args.once:
        print(asyncio.run(run_once(limit)))
    else:
        asyncio.run(run_forever(limit, interval))


if __name__ == "__main__":
    main()
