# Cloudflare Email Integration Change Manifest

## Added

- `app/services/notification_templates.py` — production transactional templates with plain-text and HTML alternatives.
- `alembic/versions/p5q6r7s8t9u0_add_notification_body_text.py` — adds plain-text body storage to the durable outbox.
- `CLOUDFLARE_EMAIL_PRODUCTION.md` — deployment and lifecycle acceptance runbook.
- `SANITIZATION_AND_HANDOFF.md` — sanitization and secret-handling record.

## Modified

- `app/core/config.py` — Cloudflare SMTP, sender, account URL, and support settings.
- `app/db/models.py` — `NotificationOutbox.body_text`.
- `app/services/notification_providers.py` — production `CloudflareSMTPEmailProvider`; SendGrid retained as an optional fallback.
- `app/services/notifications.py` — lifecycle emails now render through centralized production templates and deliver multipart text/HTML.
- `.env.example` — sanitized placeholders plus Cloudflare production variables.

## Existing lifecycle preserved

The existing BTCPay webhook already enqueues lifecycle notifications only after authoritative full settlement and entitlement grant. This integration preserves that transaction boundary, idempotency, early-renewal behavior, worker retry/dead-letter logic, and full-payment-only entitlement rule.

## Validation performed

- Python AST/syntax validation passed for all modified Python files.
- Template smoke test passed for activation subject, payment rendering, HTML generation, and account link.
- Full pytest execution could not be completed in the artifact environment because the project runtime dependencies (including `passlib` and `sendgrid`) are not installed there. Run the repository test suite in the project Docker image or development environment before deployment.
