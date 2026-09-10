"""Production notification worker.

Supports bounded batch processing, graceful SIGTERM/SIGINT shutdown, stale-lease
recovery, and controlled dead-letter requeue.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import uuid

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.services.notification_providers import validate_notification_runtime_config
from app.services.notifications import process_notification_batch, requeue_failed_notification
from app.services.worker_heartbeat import record_worker_failure, record_worker_started, record_worker_success

logger = logging.getLogger(__name__)


async def run_once(limit: int) -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        result = await process_notification_batch(db=db, limit=limit)
        logger.info("notification_worker_batch", extra={"event": "notification_worker_batch", **result})
        return result


async def requeue_one(notification_id: uuid.UUID, actor: str) -> None:
    async with AsyncSessionLocal() as db:
        row = await requeue_failed_notification(
            db=db,
            notification_id=notification_id,
            actor=actor,
        )
        logger.info(
            "notification_requeued",
            extra={
                "event": "notification_requeued",
                "notification_id": str(row.id),
                "requeue_count": row.requeue_count,
            },
        )


async def run_forever(limit: int, interval: int) -> None:
    validate_notification_runtime_config()
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def request_shutdown(sig_name: str) -> None:
        if not stop_event.is_set():
            logger.info("notification_worker_shutdown_requested", extra={"event": "notification_worker_shutdown_requested", "signal": sig_name})
            stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, request_shutdown, sig.name)
        except NotImplementedError:
            signal.signal(sig, lambda *_args, s=sig: request_shutdown(s.name))

    logger.info("notification_worker_started", extra={"event": "notification_worker_started", "batch_size": limit, "interval_seconds": interval})
    async with AsyncSessionLocal() as db:
        await record_worker_started(db, "notification-worker")

    while not stop_event.is_set():
        try:
            result = await run_once(limit)
            async with AsyncSessionLocal() as db:
                await record_worker_success(db, "notification-worker", result)
        except asyncio.CancelledError:
            raise
        except Exception:
            # Do not log exception text here; lower-level provider/client
            # exceptions may contain sensitive values.
            logger.error("notification_worker_batch_failed", extra={"event": "notification_worker_batch_failed"})
            try:
                async with AsyncSessionLocal() as db:
                    await record_worker_failure(db, "notification-worker")
            except Exception:
                logger.error("notification_worker_heartbeat_failed", extra={"event": "notification_worker_heartbeat_failed"})

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass

    logger.info("notification_worker_stopped", extra={"event": "notification_worker_stopped"})


def main() -> None:
    parser = argparse.ArgumentParser(description="BirthdayMessaging notification worker")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Process one batch and exit")
    mode.add_argument("--requeue", metavar="NOTIFICATION_ID", help="Requeue one terminal FAILED notification")
    parser.add_argument("--actor", default="operator", help="Audit label used with --requeue")
    parser.add_argument("--limit", type=int, default=settings.notification_worker_batch_size)
    parser.add_argument("--interval", type=int, default=settings.notification_worker_interval_seconds)
    args = parser.parse_args()

    validate_notification_runtime_config()
    if args.requeue:
        asyncio.run(requeue_one(uuid.UUID(args.requeue), args.actor))
    elif args.once:
        asyncio.run(run_once(max(1, args.limit)))
    else:
        asyncio.run(run_forever(max(1, args.limit), max(1, args.interval)))


if __name__ == "__main__":
    main()
