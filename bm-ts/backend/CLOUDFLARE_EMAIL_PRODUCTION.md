# BirthdayMessaging Cloudflare Email Production Integration

## Architecture

A settled payment remains the source of entitlement truth. The BTCPay webhook grants or extends access and persists notification intent in the same database transaction. The notification worker delivers email asynchronously through the configured provider. Email delivery failure therefore cannot reverse a valid payment or active entitlement.

`BTCPay webhook -> payment ledger -> entitlement -> notification outbox -> notification worker -> Cloudflare SMTP -> recipient`

## Production provider configuration

Use the following deployment environment variables:

```text
NOTIFICATION_PROVIDER=cloudflare_smtp
EMAIL_FROM_NAME=BirthdayMessaging
EMAIL_FROM_ADDRESS=bmfb@birthdaymessaging.com
CLOUDFLARE_SMTP_HOST=smtp.mx.cloudflare.net
CLOUDFLARE_SMTP_PORT=465
CLOUDFLARE_SMTP_USERNAME=api_token
CLOUDFLARE_EMAIL_API_TOKEN=<production secret>
CLOUDFLARE_SMTP_TIMEOUT_SECONDS=30
ACCOUNT_URL=https://birthdaymessaging.com
SUPPORT_EMAIL=support@birthdaymessaging.com
```

The Cloudflare token is an SMTP password. Store it only in the deployment platform's secret/environment-variable store. Do not place it in source files, repository history, local test scripts, screenshots, logs, or support attachments.

Create a fresh production Email Sending token before final deployment. After the fresh token is deployed and a controlled send succeeds, revoke any token exposed during manual testing.

## Database migration

The provider now sends multipart email with a plain-text and HTML alternative. `NotificationOutbox` therefore stores `body_text` in addition to `body_html`.

Before starting the updated worker:

```text
alembic upgrade head
```

Migration: `p5q6r7s8t9u0_add_notification_body_text.py`.

## Templates

Production subscription templates are centralized in:

`app/services/notification_templates.py`

Current lifecycle templates:

- subscription activation
- subscription renewal
- 30-day renewal reminder
- 7-day renewal reminder
- 1-day renewal reminder
- subscription expiration

Each template renders plain text and HTML. Plan, amount, currency, start date, and expiration date come from authoritative backend records rather than client input.

## Payment lifecycle behavior

Full BTCPay settlement:

1. Validate and deduplicate webhook delivery.
2. Mark the payment transaction settled.
3. Grant or extend entitlement.
4. Enqueue activation/renewal and scheduled lifecycle notifications.
5. Commit payment, entitlement, webhook state, and outbox intent together.
6. Return the webhook response.
7. Worker claims due notifications independently and sends through Cloudflare.

Partial payment must not:

- mark the local transaction settled;
- grant or extend entitlement;
- enqueue an activation email;
- grant paid units or features.

Email provider failure must not change payment or entitlement status.

## Worker startup

Run the worker as an independent long-running process using the same production environment variables and database as the backend:

```text
python -m app.services.notification_worker
```

For a controlled single batch:

```text
python -m app.services.notification_worker --once
```

The worker includes bounded batches, processing leases, retry/backoff, dead-letter state, safe requeue, and privacy-safe structured logging.

## Production lifecycle acceptance test

After deployment:

1. Confirm Cloudflare Email Sending remains Enabled / Configured.
2. Confirm the fresh token is stored in the deployment secret store.
3. Run `alembic upgrade head`.
4. Restart backend and worker.
5. Create a controlled monthly checkout using an approved test account.
6. Complete the invoice in full.
7. Confirm one settled `payment_transactions` row.
8. Confirm one active `access_entitlements` row.
9. Confirm one immediate `subscription_activated` outbox row plus applicable future reminders and expiration notification.
10. Run or observe the worker and confirm the activation row becomes `SENT`.
11. Correlate `provider_message_id` with the Cloudflare Email Sending Activity Log.
12. Confirm recipient delivery and authentication results.
13. Redeliver the same BTCPay logical webhook and confirm no duplicate entitlement and no duplicate activation outbox row.
14. Perform an early renewal and confirm the new entitlement begins at the prior coverage boundary rather than the renewal purchase time.
15. Temporarily use an invalid provider credential only in an isolated test environment and confirm a valid settled payment still leaves entitlement active while notification delivery retries/fails independently.

## Microsoft deliverability incident

Do not change the existing Cloudflare Email Sending SPF/DKIM/DMARC configuration while the open provider case is being investigated solely to force Microsoft inbox placement. Gmail has validated the Cloudflare DKIM path, while Microsoft has reproducibly failed both Cloudflare-generated DKIM signatures and assigned Junk placement. Track this independently from application integration.
