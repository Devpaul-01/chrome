# BirthdayMessaging (bm-ts) — MVP Checklist

**Last Updated:** April 15, 2026
**Status:** Development-Complete / Pre-Production — All features implemented on both backend and frontend. Facebook automation pipeline fully functional. Production infrastructure, deployment, and Chrome Web Store submission are the remaining blockers.

---

## Executive Summary

This checklist tracks all remaining tasks required to ship bm-ts as a production-ready MVP. The application is **feature-complete for MVP scope** — all backend routers, database models, frontend components, content scripts, and the automation pipeline are built, tested, and wired together. The primary remaining work is **production infrastructure, deployment, and Chrome Web Store publication**.

### Verified Codebase Statistics (April 14, 2026)

| Metric | Count |
|--------|-------|
| Backend Routers | 15 active + 1 deactivated (+ 2 inline endpoints in main.py; message_groups deactivated) |
| Backend HTTP Endpoints | 75 active + 1 WebSocket (80 total defined incl. deactivated message_groups) |
| Backend ORM Models | 18 (18 tables, 5 enums, 34 indexes) |
| Backend Tests | 287 across 24 test files |
| Backend Runtime Dependencies | 16 (`aiosqlite` moved to `[project.optional-dependencies]` test group) |
| Backend LOC | ~5,324 Python |
| Alembic Migrations | 7 |
| Frontend Components | 40 (in components/) |
| Frontend Custom Hooks | 7 (across 7 files + 1 context) |
| Frontend Tests | 393 across 21 test files |
| Frontend Runtime Dependencies | 3 (React, ReactDOM, react-calendar) |
| API Client Functions | 60 |
| Background Message Types | 73 active (76 defined; 3 commented out) |
| Content Script Files | 5 (~4,095 lines) |
| Utility Files | 13 (~2,043 lines) |
| ViewMode States | 24 (18 active + 5 disabled/commented + 1 transitional) |
| CI/CD Workflows | 4 (Gitea Actions: frontend-ci, backend-ci, deploy, dependency-scan) |
| User-Facing HTML Pages | 6 |

### What Remains (Priority Order)

1. **P0 — Production Infrastructure** — Cloud provider, managed PostgreSQL, domain + TLS, environment configuration
2. **P0 — Chrome Web Store Submission** — Listing assets, permissions justification, production build testing
3. ~~**P1 — Backend Test CI**~~ — ✅ DONE (`backend-ci.yaml`: Ruff lint+format, pytest, pip-audit)
4. **P1 — Monitoring & Observability** — Error tracking, uptime monitoring, alerting
5. **P1 — End-to-End Testing** — Manual verification of all critical user flows in production
6. **P2 — Image Upload/Storage** — Currently URL-based; needs S3/R2 for actual file uploads
7. **P2 — Extended Test Coverage** — E2E (Playwright), expand background worker & hook tests, more integration tests
8. **P3 — Nice to Have** — Dark mode, i18n, interactive tutorials, analytics improvements

---

## P0 — Production Blockers (Must Complete Before Launch)

### 1. Production Infrastructure Setup
**Status:** Not Started

#### Cloud Infrastructure
- [ ] Choose cloud provider (Render, Fly.io, AWS, DigitalOcean)
- [ ] Set up managed PostgreSQL (15+)
- [ ] Set up backend hosting (container service)
- [ ] Set up domain and TLS/SSL certificates
- [ ] Set up object storage for images (S3, CloudFlare R2 — optional for MVP, URL-only is acceptable)

#### Database Production Setup
- [ ] Create production database instance
- [ ] Run `alembic upgrade head` against production database
- [ ] Verify all 18 tables and 32 indexes created
- [ ] Configure connection pooling (PgBouncer or provider-managed)
- [ ] Set up automatic backups (daily minimum)
- [ ] Test backup restore procedure

#### Backend Production Deployment
- [ ] Configure production environment variables:
  - [ ] `JWT_SECRET_KEY` (generate strong 64+ char random key)
  - [ ] `DATABASE_URL` (production PostgreSQL connection string)
  - [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (live mode)
  - [ ] `CORS_ORIGINS` (published extension ID + production domain)
  - [ ] `SENDGRID_API_KEY` (production key + domain verification)
  - [ ] `EMAIL_FROM_ADDRESS` + `PASSWORD_RESET_URL_BASE`
  - [ ] `SMTP_ENCRYPTION_KEY` (32-byte Fernet key)
  - [ ] `LOG_LEVEL` = WARNING or ERROR
- [ ] Set up secrets management (provider secrets, Vault, etc.)
- [ ] Build and push production Docker image
- [ ] Deploy container to production environment
- [ ] Configure HTTPS reverse proxy (Caddy, nginx, or cloud LB)
- [ ] Configure Stripe webhook endpoint with production URL
- [ ] Verify health check endpoint accessible (`GET /health`)
- [ ] Test API accessible from internet

#### End-to-End Production Verification
- [ ] Fresh user registration + email verification
- [ ] Login + token refresh flow
- [ ] Template creation + scheduling
- [ ] Stripe checkout (live test) + webhook receipt
- [ ] Password reset email delivery
- [ ] WebSocket real-time updates
- [ ] Extension popup renders correctly against production API
- [ ] Content script detects birthdays on Facebook
- [ ] Automation sends a test message

### 2. Chrome Web Store Submission
**Status:** Not Started — Legacy extension exists in Web Store; new build will replace it

- [ ] Build production extension (`npm run build`)
- [ ] Test built extension loads and functions correctly in Chrome
- [ ] Prepare listing assets:
  - [ ] Extension name and detailed description
  - [ ] Short description (132 chars max)
  - [ ] Category selection
  - [ ] Screenshots (1280x800 or 640x400, up to 5)
  - [ ] Small tile icon (128x128)
  - [ ] Large tile icon (440x280)
  - [ ] Marquee image (1400x560)
- [ ] Remove `localhost/*` from `host_permissions` in `manifest.json` before production build (Chrome Web Store will reject)
- [ ] Prepare permissions justification document:
  - `storage` — Save user preferences and auth tokens
  - `scripting` — Inject content scripts on Facebook
  - `activeTab` — Access current tab for automation
  - `tabs` — Query Facebook tabs for automation
  - `notifications` — OS-level alerts for automation events
  - `alarms` — Schedule periodic birthday checks
  - `clipboardWrite` — Fill message input fields and attach images via clipboard API
  - `host_permissions` (facebook.com) — Automate birthday messages
- [ ] Confirm privacy policy URL (already created: `privacy-policy.html`)
- [ ] Replace `[SUPPORT_EMAIL]` placeholder in `privacy-policy.html` and `terms-of-service.html`
- [ ] Add `clipboardWrite` justification to privacy policy (currently not documented; permission IS used)
- [ ] Set support email
- [ ] Submit for Chrome Web Store review

---

## P1 — High Priority (Required Shortly After Launch)

### 3. Backend Test CI Pipeline
**Status:** ✅ DONE (April 15, 2026)

- [x] Created `.gitea/workflows/backend-ci.yaml`:
  - [x] Run `pytest` on all 287 tests (24 files)
  - [x] Run linting (`ruff check` + `ruff format --check`)
  - [ ] Run type checking (`mypy`) — optional, not yet added
  - [ ] Report code coverage (`pytest-cov`, target >80%) — not yet added
- [x] Wired to run on PR to `main`/`develop`
- [x] Created `.gitea/workflows/dependency-scan.yaml` (pip-audit for Python CVE scanning)
- [x] Added pytest step to existing `deploy.yaml` pipeline

### 4. Monitoring & Observability
**Status:** Not Started

- [ ] Set up error tracking (Sentry or Rollbar)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, or provider-native)
- [ ] Set up structured logging + log aggregation
- [ ] Create alerting rules:
  - [ ] API downtime
  - [ ] Database connection failures
  - [ ] High error rate (>5% 5xx)
  - [ ] Slow response times (>2s p95)
  - [ ] Failed Stripe payments
  - [ ] SendGrid delivery failures

### 5. Alembic Migration Testing
- [ ] Test all 7 migrations up (upgrade) against clean PostgreSQL
- [ ] Test all 7 migrations down (downgrade)
- [ ] Document rollback procedure

### 6. Clarify / Remove Redundant `psycopg[binary]` Dependency
**Status:** Not Started

- [ ] Verify which parts of the codebase require `psycopg` (likely only Alembic sync scripts)
- [ ] If only Alembic, move `psycopg[binary]>=3.1` from `[project.dependencies]` to `[project.optional-dependencies]` dev/alembic group
- [ ] `asyncpg` remains as the async runtime driver and stays in core dependencies
- [ ] Update `backend/Dockerfile` if the psycopg install step changes

### 6b. Move `aiosqlite` to Optional (Test) Dependencies
**Status:** ✅ DONE (April 15, 2026)

- [x] Moved `aiosqlite>=0.20` from `[project.dependencies]` to `[project.optional-dependencies]` test group
- [x] Verified `pip install -e ".[test]"` still works for test runs

### 6c. Gunicorn Production Configuration
**Status:** Not Started — Dockerfile uses bare `gunicorn` command with no config file

- [ ] Create `gunicorn.conf.py` with production-appropriate settings (timeout, graceful-timeout, max-requests, max-requests-jitter)
- [ ] Update Dockerfile CMD to reference config file

---

## P2 — Medium Priority (Post-Launch Enhancements)

### 7. Image Upload/Storage
**Status:** URL-based only — `POST /images/upload-file` stores base64 data URIs directly in DB

- [ ] Set up cloud object storage (S3, CloudFlare R2, or local volume)
- [ ] Implement server-side upload -> storage pipeline
- [ ] Add image processing (resize, optimize, thumbnails)
- [ ] Add storage cleanup on image deletion
- [ ] Add image size/format/dimension validation

### 8. Extended Test Coverage

#### Backend Gaps
- [ ] Integration test: password reset flow (request -> email -> reset)
- [ ] Integration test: Stripe subscription flow (checkout -> webhook -> status)
- [ ] Database test: migration up/down verification
- [ ] Database test: concurrent operations
- [ ] API contract tests: pagination, filtering, sorting verification
- [ ] Target: >80% code coverage

#### Frontend/Extension Gaps
- [x] Background service worker tests (`background/__tests__/index.test.ts` — 9 tests)
- [x] Custom hook tests (`useMessages.test.ts` — 18 tests, `useImageLibrary.test.ts` — 10 tests)
- [ ] Expand background service worker test coverage (currently minimal)
- [ ] Add hook tests for remaining 5 untested hooks (`useContacts`, `usePostComposer`, `useSMTPConfig`, `useTemplateSegments`, `useMessageTemplates`)
- [ ] E2E testing framework (Playwright or Puppeteer)
- [ ] Critical E2E flows:
  - [ ] Install -> register -> login -> create template -> schedule -> verify
  - [ ] Automation scan -> detect birthdays -> send messages
  - [ ] Subscribe -> verify active -> cancel
- [ ] Browser compatibility testing (Chrome stable, Edge, Brave)

### 9. Content Script Resilience
- [ ] Add error recovery for automation failures (retry individual friend on DOM error)
- [ ] Add mutation observer stability improvements
- [ ] Test with various Facebook layouts (desktop, different languages)

### 10. Document / Re-enable Contact Management UI
**Status:** Intentionally Disabled

- Contact create/update/delete is commented out in `background/index.ts` and navigation in `App.tsx`
- Contacts are currently populated only via the automation scraping pipeline
- [ ] When ready to expose contact management to users, re-enable handlers in `background/index.ts` and restore `ContactForm`/`ContactList` navigation in `App.tsx`

### 11. Document / Re-enable SMTPSettings UI
**Status:** Intentionally Disabled

- `SMTPSettings.tsx` is imported but not accessible via navigation in `App.tsx`
- [ ] When SMTP-based sending is ready for users, restore the `smtp-settings` view entry in the Account dropdown navigation

---

## P3 — Low Priority (Nice to Have)

### 12. Feature Enhancements
- [ ] Template bulk import/export
- [ ] Template usage statistics
- [ ] Schedule preview (show next run dates)
- [ ] Subscription proration preview (actual Stripe API amount, not generic text)
- [ ] Dashboard time-series data (messages per day/week/month)
- [ ] Dark mode support
- [ ] Internationalization (i18n)
- [ ] `WhatsNew` component (referenced in docs but does not exist)
- [ ] Interactive product tour (spotlight UI elements)
- [ ] Template creation tutorial (guided mode)
- [ ] Video tutorials (embedded)
- [ ] In-app FAQ search


### 13. API & Backend Polish
- [ ] Standardize error responses across all non-DELETE endpoints
- [ ] API versioning strategy (v1, v2)
- [ ] JWT secret rotation strategy
- [ ] API key rotation mechanism
- [ ] Failed payment retry logic (Stripe webhook received but no automatic retry scheduling)
- [ ] Validate `segment_ids` exist in message group creation
- [ ] Database query optimization (N+1 queries)
- [ ] Response caching where appropriate
- [ ] Load testing (100+ concurrent users)

### 14. Operations Documentation
- [ ] Production deployment guide (step-by-step)
- [ ] Monitoring guide
- [ ] Incident response runbook
- [ ] Scaling guide

### 15. Comprehensive User Documentation
- [ ] Full user guide (installation, templates, schedules, automation, contacts, SMTP, subscriptions)
- [ ] Creating templates guide with examples
- [ ] Merge tags and personalization guide
- [ ] Automation setup and explanation
- [ ] Contact import/export guide

---

## Known Technical Debt

1. **`POST /send-birthday-message`** — Stub endpoint that returns **501 Not Implemented**. Content scripts handle actual sending. Kept for rate limiting and auth enforcement.
2. **`POST /images/upload-file`** — Stores base64 data URIs directly in DB (`# TODO: Upload to cloud storage`). Works but not scalable.
3. **Image storage** — All image handling is URL-based or base64-in-DB. No cloud object storage configured.
4. **Subscription proration** — `change-plan` modal shows generic Stripe proration message, no calculated amount preview from Stripe API.
5. **Redundant database drivers** — Both `asyncpg>=0.28` (async runtime) and `psycopg[binary]>=3.1` (sync) in runtime deps; `psycopg` may only be needed for Alembic and should move to optional deps.
6. **`localhost/*` in manifest.json `host_permissions`** — Development-only, must be removed before Chrome Web Store submission.
7. **CORS default extension ID** — `config.py` defaults CORS to legacy extension ID `cpobkmncaokclgimgcefglokgigjlcoj`. New published extension will have a different ID; must override via `CORS_ORIGINS` env var.
8. **`clipboardWrite` undocumented** — Permission is requested in manifest and actively used (message filling, image attachment), but not justified in `privacy-policy.html`.
9. **`[SUPPORT_EMAIL]` placeholders** — Both `privacy-policy.html` and `terms-of-service.html` contain `[SUPPORT_EMAIL]` placeholder text.
10. **No gunicorn config file** — Production Dockerfile uses bare `gunicorn` command without tuning for timeouts, graceful shutdown, or worker recycling.
11. **No Stripe test/live mode distinction** — `config.py` validates Stripe key isn't a placeholder but doesn't warn or block if test keys are used in production environment.

---

## Actionable Next Steps

### This Week
1. [ ] Choose cloud provider and provision infrastructure (database + backend hosting + domain)
2. [ ] Configure all production environment variables
3. [ ] Deploy backend and run Alembic migrations

### Next Week
4. [ ] Test end-to-end user flows against production API
5. [ ] Build production extension and test in Chrome
6. [ ] Prepare Chrome Web Store listing assets
7. [ ] Submit extension update to Chrome Web Store
8. [ ] Set up basic monitoring (Sentry + uptime check)

### Soon
9. [x] ~~Add backend test CI pipeline~~ (DONE — `backend-ci.yaml`, `dependency-scan.yaml`, pytest in `deploy.yaml`)
11. [ ] Expand test coverage (background worker, hooks, E2E)
12. [ ] Set up cloud image storage (if needed beyond URL-based)
13. [ ] Soft launch to beta group and iterate on feedback
