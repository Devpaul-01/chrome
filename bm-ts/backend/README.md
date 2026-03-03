# BirthdayMessaging Backend

Python FastAPI backend for the BirthdayMessaging Chrome extension. It exposes auth, template management, and Stripe subscription flows against a PostgreSQL schema managed by SQLAlchemy ORM models and Alembic migrations.

> **Note:** This backend runs entirely in Docker containers. No local Python environment is required.

## Requirements

- Docker Desktop
- Docker Compose
- Stripe test keys (see `.env.example`)

## Environment

Copy `.env.example` to `.env` and provide values before running the server:

```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/birthdaymessaging
JWT_SECRET_KEY=supersecret
STRIPE_API_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_monthly_id
STRIPE_PRICE_YEARLY=price_yearly_id
```

## Running locally

1. Ensure Docker Desktop is running
2. Copy `.env.example` to `.env` and configure values
3. Start both database and backend:
   ```bash
   docker-compose up -d
   ```
   
   The database schema (via Alembic migrations) is automatically applied on first run.
   
**Alternative - Production-like deployment:**
```bash
./deploy.sh
```

The backend will be available at `http://localhost:8000`

## Stripe Webhooks

Expose `POST /stripe/webhook` to Stripe using the test webhook secret and ensure the raw body is forwarded so the Stripe SDK can verify the signature.

## Testing

**Run tests inside Docker container:**
```bash
docker-compose exec backend pytest
```

**Or run tests with coverage:**
```bash
docker-compose exec backend pytest --cov=app --cov-report=term-missing
```

## Docker Architecture

- `Dockerfile` - Builds the FastAPI service container
- `docker-compose.yml` - Orchestrates both PostgreSQL and FastAPI containers
- `deploy.sh` - Production deployment script (pulls images, rebuilds, restarts)
- `ddl.sql` - Legacy reference; schema now managed by `app/db/models.py` + Alembic migrations (`alembic/versions/`)

**View logs:**
```bash
docker-compose logs backend --tail=50 --follow
docker-compose logs db --tail=50 --follow
```

**Restart services:**
```bash
docker-compose restart backend
docker-compose restart db
```

**Stop all:**
```bash
docker-compose down
```

## Notes

- The schema is defined in `app/db/models.py` (14 ORM models, 499 lines) and applied via Alembic migrations; do not alter table/column names or types without generating a new migration.
- Token rotation is handled entirely via JWT refresh tokens without persistence; to revoke tokens, rotate the `JWT_SECRET_KEY`.
- The Stripe service creates a customer for each user (if needed) before opening a Checkout session.
