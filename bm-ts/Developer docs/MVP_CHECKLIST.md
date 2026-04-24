# BirthdayMessaging (bm-ts) — MVP Checklist

**Last Updated:** April 24, 2026
**Status:** Live on self-hosted Coolify — Backend deployed, PostgreSQL running, TLS active. Chrome Web Store submission is the primary remaining blocker.

---

## Executive Summary

This checklist tracks all remaining tasks required to ship bm-ts as a production-ready MVP. The application is **feature-complete for MVP scope** — all backend routers, database models, frontend components, content scripts, and the automation pipeline are built, tested, and wired together. The primary remaining work is **production infrastructure, deployment, and Chrome Web Store publication**.

### What Remains (Priority Order)

1. **P0 — Chrome Web Store Submission** — Listing assets, permissions justification, production build testing
2. **P1 — Monitoring & Observability** — Sentry integrated (backend + popup); uptime monitoring and alerting still needed
3. **P1 — End-to-End Testing** — Manual verification of all critical user flows in production
4. **P2 — Image Upload/Storage** — Currently URL-based; needs S3/R2 for actual file uploads
5. **P2 — Extended Test Coverage** — E2E (Playwright), expand background worker & hook tests, more integration tests
6. **P3 — Nice to Have** — Dark mode, i18n, interactive tutorials, analytics improvements

---

## P0 — Production Blockers (Must Complete Before Launch)

### 1. Production Infrastructure Setup

**Status:** ✅ DONE (April 2026) — Self-hosted on Coolify

#### Backend Production Deployment

- [ ] Configure Stripe webhook endpoint with production URL

#### End-to-End Production Verification

- [x] Fresh user registration + email verification
- [x] Login + token refresh flow
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
  - [x] Small tile icon (128x128) — `Birthday_messaging-large_icon-white-cake-orange-BG.png` set in `manifest.json` at 128px
  - [ ] Large tile icon (440x280)
  - [ ] Marquee image (1400x560)
- [ ] Prepare permissions justification document:
  - `storage` — Save user preferences and auth tokens
  - `scripting` — Inject content scripts on Facebook
  - `activeTab` — Access current tab for automation
  - `tabs` — Query Facebook tabs for automation
  - `notifications` — OS-level alerts for automation events
  - `alarms` — Schedule periodic birthday checks
  - `clipboardWrite` — Fill message input fields and attach images via clipboard API
  - `host_permissions` (facebook.com) — Automate birthday messages
- [ ] Confirm privacy policy URL (already created: `privacy-policy.html`, referenced in `manifest.json` `homepage_url` as `https://birthdaymessaging.app/privacy`) ✅
- [ ] Set support email
- [ ] Submit for Chrome Web Store review

---

## P1 — High Priority (Required Shortly After Launch)

### 3. Backend Test CI Pipeline

**Status:** ✅ DONE (April 21, 2026)

- [ ] Run type checking (`mypy`) — optional, not yet added
- [x] `pytest-cov` available — already in `pyproject.toml` test dependencies; CI coverage reporting not yet wired up

### 4. Monitoring & Observability

**Status:** Partially Done (April 24, 2026)

- [x] Set up error tracking — Sentry integrated in backend (`sentry-sdk[fastapi]`, activated via `SENTRY_DSN` env var) and extension popup (`@sentry/browser`, activated via `VITE_SENTRY_DSN` build var)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, or provider-native)
- [x] Structured per-request logging — `RequestLoggingMiddleware` logs method, path, status code, duration, and client IP as structured `extra` fields on every request; plain-text format only (no JSON formatter)
- [x] JSON structured logging — `app_logging.py` now emits every log record as a single-line JSON object (April 24, 2026); ready for ingestion by Loki, Logtail, Datadog, etc.
- [ ] Set up external log aggregation (e.g. Loki, Logtail, or provider-native)
- [ ] Create alerting rules:
  - [ ] API downtime
  - [ ] Database connection failures
  - [ ] High error rate (>5% 5xx)
  - [ ] Slow response times (>2s p95)
  - [ ] Failed Stripe payments
  - [ ] SendGrid delivery failures

### 5. Alembic Migration Testing

- [ ] Test all 9 migrations up (upgrade) against clean PostgreSQL
- [ ] Test all 9 migrations down (downgrade)
- [ ] Document rollback procedure

---

## P2 — Medium Priority (Post-Launch Enhancements)

### 7. Image Upload/Storage

**Status:** URL-based only — `POST /images/upload-file` stores base64 data URIs directly in DB

- [ ] Set up cloud object storage (S3, CloudFlare R2, or local volume)
- [ ] Implement server-side upload -> storage pipeline
- [ ] Add image processing (resize, optimize, thumbnails)
- [ ] Add storage cleanup on image deletion
- [x] Add image MIME type + size validation — `upload-file` now rejects non-image MIME types and files >10 MB with appropriate HTTP status codes (April 24, 2026)

### 8. Extended Test Coverage

#### Backend Gaps

- [x] Integration test: password reset flow — `test_password_reset.py` covers token creation, storage, verification, expiry, and single-use enforcement (7 tests)
- [x] Integration test: Stripe subscription flow — `test_stripe_service.py`, `test_subscription.py`, and `test_webhook.py` cover checkout session creation, subscription lifecycle, plan changes, cancellation, and all webhook event types
- [ ] Database test: migration up/down verification
- [x] Database test: concurrent operations — `test_db_constraints.py` now includes a concurrent 5-insert test verifying no data corruption across independent sessions (April 24, 2026)
- [x] API contract tests: pagination, filtering, sorting verification — `test_api_contracts.py` has dedicated sections for pagination, filtering, and sorting
- [ ] Target: >80% code coverage

#### Frontend/Extension Gaps

- [x] Background service worker test coverage — `background/__tests__/index.test.ts` has 9 describe blocks covering sender ID guard, auth login/logout, profile processing, dashboard augmentation, 401 retry, emergency stop, and 15-second timeout sentinel
- [ ] Hook tests for `useContacts` / `useSMTPConfig` — these hooks do not yet exist; contact management and SMTP UI are intentionally disabled; revisit when features are re-enabled
- [ ] E2E testing framework (Playwright or Puppeteer)
- [ ] Critical E2E flows:
  - [ ] Install -> register -> login -> create template -> schedule -> verify
  - [ ] Automation scan -> detect birthdays -> send messages
  - [ ] Subscribe -> verify active -> cancel
- [ ] Browser compatibility testing (Chrome stable, Edge, Brave)

### 9. Content Script Resilience

- [x] Add error recovery for manual send — one failed friend is skipped (logged + status shown) rather than aborting the entire run (April 24, 2026)
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
- [x] Validate `group_id` ownership in message template create/update — `message_templates.py` now returns 404 if the referenced group does not belong to the current user (April 24, 2026)
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
2. **`POST /images/upload-file`** — Stores base64 data URIs directly in DB (`# TODO: Upload to cloud storage`). Works but not scalable. MIME type and size validation added (April 24, 2026).
3. **Image storage** — All image handling is URL-based or base64-in-DB. No cloud object storage configured.
4. **Subscription proration** — `change-plan` modal shows generic Stripe proration message, no calculated amount preview from Stripe API.
5. **CORS default extension ID** — `config.py` defaults CORS to legacy extension ID `cpobkmncaokclgimgcefglokgigjlcoj`. New published extension will have a different ID; must override via `CORS_ORIGINS` env var.
6. **Failed payment retry** — Stripe Smart Retries handle automatic retry scheduling. `invoice.payment_succeeded` webhook now recovers PAST_DUE → ACTIVE when a retry succeeds (April 24, 2026).


---

## Actionable Next Steps

1. [ ] Configure Stripe webhook endpoint with production URL
2. [ ] Verify all 18 DB tables and indexes exist in production
3. [ ] Test end-to-end user flows against production API
4. [ ] Build production extension and test in Chrome
5. [ ] Prepare Chrome Web Store listing assets
6. [ ] Submit extension update to Chrome Web Store
7. [x] Integrate Sentry error tracking (backend + popup) — activate by setting `SENTRY_DSN` / `VITE_SENTRY_DSN` in production
8. [ ] Set up uptime monitoring (UptimeRobot or provider-native)
9. [ ] Expand test coverage (background worker, hooks, E2E)
10. [ ] Set up cloud image storage (if needed beyond URL-based)
10. [ ] Soft launch to beta group and iterate on feedback
