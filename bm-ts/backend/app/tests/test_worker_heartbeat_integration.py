"""Integration-style tests for worker heartbeat control flow."""

from unittest.mock import AsyncMock

import pytest

from app.services import notification_worker
from app.services import payment_checkout_recovery_worker


class _StopAfterWait:
    """Stop a worker loop after its first completed iteration."""

    def __init__(self):
        self._set = False

    def is_set(self):
        return self._set

    def set(self):
        self._set = True

    async def wait(self):
        self._set = True


@pytest.mark.asyncio
async def test_notification_success_records_success(monkeypatch):
    monkeypatch.setattr(
        notification_worker,
        "validate_notification_runtime_config",
        lambda: None,
    )
    monkeypatch.setattr(
        notification_worker,
        "run_once",
        AsyncMock(return_value={"processed": 3, "sent": 2, "failed": 1}),
    )

    started = AsyncMock()
    success = AsyncMock()
    failure = AsyncMock()
    monkeypatch.setattr(notification_worker, "record_worker_started", started)
    monkeypatch.setattr(notification_worker, "record_worker_success", success)
    monkeypatch.setattr(notification_worker, "record_worker_failure", failure)

    stop = _StopAfterWait()
    monkeypatch.setattr(notification_worker.asyncio, "Event", lambda: stop)

    await notification_worker.run_forever(limit=10, interval=1)

    started.assert_awaited_once()
    success.assert_awaited_once()
    failure.assert_not_awaited()
    assert success.await_args.args[1] == "notification-worker"
    assert success.await_args.args[2] == {
        "processed": 3,
        "sent": 2,
        "failed": 1,
    }


@pytest.mark.asyncio
async def test_notification_batch_failure_records_failure(monkeypatch):
    monkeypatch.setattr(
        notification_worker,
        "validate_notification_runtime_config",
        lambda: None,
    )
    monkeypatch.setattr(
        notification_worker,
        "run_once",
        AsyncMock(side_effect=RuntimeError("provider-secret-must-not-escape")),
    )

    started = AsyncMock()
    success = AsyncMock()
    failure = AsyncMock()
    monkeypatch.setattr(notification_worker, "record_worker_started", started)
    monkeypatch.setattr(notification_worker, "record_worker_success", success)
    monkeypatch.setattr(notification_worker, "record_worker_failure", failure)

    stop = _StopAfterWait()
    monkeypatch.setattr(notification_worker.asyncio, "Event", lambda: stop)

    await notification_worker.run_forever(limit=10, interval=1)

    started.assert_awaited_once()
    success.assert_not_awaited()
    failure.assert_awaited_once()
    assert failure.await_args.args[1] == "notification-worker"


@pytest.mark.asyncio
async def test_notification_heartbeat_failure_does_not_escape_loop(monkeypatch):
    monkeypatch.setattr(
        notification_worker,
        "validate_notification_runtime_config",
        lambda: None,
    )
    monkeypatch.setattr(
        notification_worker,
        "run_once",
        AsyncMock(side_effect=RuntimeError("batch failure")),
    )
    monkeypatch.setattr(
        notification_worker,
        "record_worker_started",
        AsyncMock(),
    )
    monkeypatch.setattr(
        notification_worker,
        "record_worker_failure",
        AsyncMock(side_effect=RuntimeError("heartbeat failure")),
    )

    stop = _StopAfterWait()
    monkeypatch.setattr(notification_worker.asyncio, "Event", lambda: stop)

    await notification_worker.run_forever(limit=10, interval=1)


@pytest.mark.asyncio
async def test_payment_success_records_success(monkeypatch):
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "validate_payment_production_config",
        lambda _settings: None,
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "_run_once",
        AsyncMock(return_value={"examined": 4, "recovered": 2}),
    )

    started = AsyncMock()
    success = AsyncMock()
    failure = AsyncMock()
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "record_worker_started",
        started,
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "record_worker_success",
        success,
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "record_worker_failure",
        failure,
    )

    stop = _StopAfterWait()
    monkeypatch.setattr(
        payment_checkout_recovery_worker.asyncio,
        "Event",
        lambda: stop,
    )

    await payment_checkout_recovery_worker._run_loop()

    started.assert_awaited_once()
    success.assert_awaited_once()
    failure.assert_not_awaited()
    assert success.await_args.args[1] == "payment-recovery-worker"
    assert success.await_args.args[2] == {"examined": 4, "recovered": 2}


@pytest.mark.asyncio
async def test_payment_batch_failure_records_failure(monkeypatch):
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "validate_payment_production_config",
        lambda _settings: None,
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "_run_once",
        AsyncMock(side_effect=RuntimeError("btcpay-secret-must-not-escape")),
    )

    started = AsyncMock()
    success = AsyncMock()
    failure = AsyncMock()
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "record_worker_started",
        started,
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "record_worker_success",
        success,
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "record_worker_failure",
        failure,
    )

    stop = _StopAfterWait()
    monkeypatch.setattr(
        payment_checkout_recovery_worker.asyncio,
        "Event",
        lambda: stop,
    )

    await payment_checkout_recovery_worker._run_loop()

    started.assert_awaited_once()
    success.assert_not_awaited()
    failure.assert_awaited_once()
    assert failure.await_args.args[1] == "payment-recovery-worker"


@pytest.mark.asyncio
async def test_payment_heartbeat_failure_does_not_escape_loop(monkeypatch):
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "validate_payment_production_config",
        lambda _settings: None,
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "_run_once",
        AsyncMock(side_effect=RuntimeError("batch failure")),
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "record_worker_started",
        AsyncMock(),
    )
    monkeypatch.setattr(
        payment_checkout_recovery_worker,
        "record_worker_failure",
        AsyncMock(side_effect=RuntimeError("heartbeat failure")),
    )

    stop = _StopAfterWait()
    monkeypatch.setattr(
        payment_checkout_recovery_worker.asyncio,
        "Event",
        lambda: stop,
    )

    await payment_checkout_recovery_worker._run_loop()