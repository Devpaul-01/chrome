BirthdayMessaging Notification Worker Production Hardening
=========================================================

This package hardens the notification outbox in four important ways:

1. Stale PROCESSING recovery
   If a worker crashes after claiming a row, another worker can recover it
   after 15 minutes instead of leaving the notification stuck forever.

2. Concurrent idempotent enqueue
   The existing UNIQUE idempotency key remains authoritative, and a SAVEPOINT
   allows concurrent enqueue attempts to converge on one row without rolling
   back the caller's outer billing transaction.

3. Real PostgreSQL worker-race tests
   Uses an isolated PostgreSQL database plus NullPool to prove SKIP LOCKED
   behavior with independent sessions/connections.

4. Full backend regression
   The runner executes all backend tests after concurrency verification.

Important delivery guarantee:
The design remains at-least-once at the external email-provider boundary.
If SendGrid accepts a message and the worker crashes before recording SENT,
a later stale-claim recovery can resend the message. SendGrid's send API does
not provide a general idempotency key that can make this exactly-once.
