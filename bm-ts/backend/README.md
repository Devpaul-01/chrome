# BirthdayMessaging V2 Backend

Production deployment package for the BirthdayMessaging FastAPI backend.

## Requirements

- Docker and Docker Compose for container deployment.
- Python 3.11 or newer for local development.
- PostgreSQL for production.
- BTCPay Server for Bitcoin and Monero payment processing.

## Environment configuration

Never commit real `.env` files, API keys, database passwords, webhook secrets, private keys, or production credentials.

For local development, copy `.env.example` to `.env` and replace the placeholder values.

For production, copy `.env.production.example` to `.env.production` on the deployment host and replace every `CHANGE_ME` value with a secure deployment-specific value.

The production template documents the database, JWT, notification, BTCPay, payment-plan, checkout-recovery, CORS, logging, Sentry, and optional Stripe settings used by the application.

## Compose files

- `docker-compose.yml` is the base/local development Compose definition.
- `docker-compose.production.yml` is the standalone production-oriented Compose definition.
- `docker-compose.isolated.yml` is an override file and is not intended to run by itself. Combine it with the base or production Compose definition when the isolated networking, container names, Traefik routing, and BTCPay integration network are required.

Examples:

```bash
cp .env.example .env
docker compose -f docker-compose.yml config
docker compose -f docker-compose.yml -f docker-compose.isolated.yml config
```

Production:

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.production.yml config
docker compose -f docker-compose.production.yml -f docker-compose.isolated.yml config
```

Do not run a production deployment until all placeholder values have been replaced and the production configuration validation passes.

## Database migrations

The backend image runs `alembic upgrade head` before Gunicorn starts. Review database backups and migration status before any production upgrade.

The current application expects PostgreSQL in production. Never point test or clean-room validation commands at the live production database.

## Background workers

BirthdayMessaging V2 runs two application workers in addition to the API:

- `notification-worker` processes durable notification outbox records and subscription lifecycle notifications.
- `payment-recovery-worker` reconciles stale or uncertain BTCPay checkout attempts and records worker heartbeats.

Both workers use the same application image and environment configuration as the backend.

## Payments

The backend owns payment processing. Browser clients must not receive BTCPay API credentials or webhook secrets.

Production BTCPay configuration includes the server URL, public checkout URL, store ID, API key, webhook secret, currency, server-controlled plan prices, and checkout-recovery controls. Production validation is fail-closed when required payment configuration is missing or unsafe.

## Notifications

Notification delivery supports the configured Cloudflare SMTP path and SendGrid provider. Provider credentials remain server-side. Worker retry, lease, batch, and shutdown settings are documented in `.env.production.example`.

## Security and source control

- Never commit `.env` or `.env.production`.
- Never commit database dumps, backups, wallet files, private keys, API tokens, or credentials.
- `.env.example` and `.env.production.example` contain placeholders only and are safe documentation templates.
- Keep payment credentials and notification-provider credentials server-side.
- Validate the Git diff and run secret scanning before every deployment-related commit.

## Validation before deployment

At minimum, verify:

```bash
pytest -q
alembic heads
docker compose -f docker-compose.production.yml config
```

Also verify the extension build/test gates and perform deployment-specific health checks before promoting a new release.
