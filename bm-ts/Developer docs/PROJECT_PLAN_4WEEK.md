# BirthdayMessaging bm-ts — 4-Week MVP Launch Project Plan

**Created:** February 24, 2026  
**Scope:** Production launch of bm-ts from development-complete to Chrome Web Store  
**Team Size:** 6 developers  
**Sprint Cadence:** 1-week sprints, stand-up Tuesday and Thursday, sprint review/retro Saturday

---

## 📊 Progress Summary (as of March 1, 2026)

> Week 1 starts March 3. Several planned tasks have been completed ahead of schedule during pre-sprint development.

| Area | Planned Tasks | Completed | Remaining | Notes |
|------|:---:|:---:|:---:|-------|
| **Alembic Migrations** (BrianK 3.1–3.4) | 4 | 4 | 0 | ✅ Single comprehensive migration `78efe19bc04e` fully populates all 14 tables |
| **Frontend Test Infra** (Bhagath 4.1–4.7) | 7 | 7 | 0 | ✅ 214 tests across 11 files, all passing |
| **Component Tests** (Bhagath 4.8–4.14) | 7 | 4 | 3 | ScheduleSettings, ContactForm, AutomationSettings still needed |
| **Data Integrity Constraints** | N/A | ✅ | 0 | FK CASCADE, ENUMs, NOT NULL, UNIQUE — all in migration |
| **Email Service** (BrianN 1.1–1.7) | 7 | 0 | 7 | P0 blocker — not started |
| **Production Infra** (Mohamed 2.1–2.7) | 7 | 0 | 7 | P0 blocker — not started |
| **Onboarding Flow** (Annamarie 5.1–5.6) | 6 | 0 | 6 | Not started |
| **Legal & Docs** (Rezene 6.1–6.7) | 7 | 0 | 7 | Not started |
| **Backend Test Expansion** (BrianK 3.5–3.7) | 3 | 0 | 3 | Not started |

**Net effect:** ~15 of ~48 Week 1–2 tasks pre-completed. BrianK and Bhagath have significant Week 1 capacity freed up for additional backend/component testing work.

---

## Starting Point

The codebase is **feature-complete for development**. This plan covers exclusively the work required to go from dev-complete to production-launched:

| Already Done | Still Required |
|---|---|
| All 15 routers registered, 64 endpoints | Email service (password reset broken) |
| 14 DB tables, Alembic migrations | SMTP password encryption at rest |
| Facebook automation pipeline complete | Production infrastructure (zero cloud config) |
| 34 React components, WCAG 2.1 AA | CI/CD pipeline (no `.github/workflows`) |
| Real-time WebSocket updates | Backend testing expansion (only 4 unit tests in 2 files) |
| JWT rotation, Argon2, Stripe webhooks | Chrome Web Store listing + privacy policy |
| Docker Compose dev environment | User onboarding flow |
| ~~Alembic initial migration body empty~~ ✅ Resolved (Feb 27) | User documentation |
| 214 extension tests across 11 files (95 unit + 119 component) ✅ | |
| Comprehensive Alembic migration fully populated (14 tables, ENUMs, indexes, FK CASCADE, unique constraints) ✅ | |
| Data integrity constraints in place (FK CASCADE, NOT NULL, UNIQUE, ENUMs) ✅ | |

---

## Team Roles

| Dev | Title | Domain |
|-----|-------|--------|
| **BrianN** | Backend Lead | Email service, security hardening, Alembic, load testing | (BrianN)
| **Mohamed** | DevOps / Infra | Cloud deployment, CI/CD, monitoring, HTTPS | (Mohamed)
| **BrianK** | Backend QA | All backend testing (Phase 1 + Phase 2, integration, DB) | (BrianK)
| **Bhagath** | Frontend QA | Extension testing (unit, component, E2E with Playwright) | (Bhagath)
| **Annamarie** | Extension UX | Onboarding flow, in-app help, UX polish | (Annamarie)
| **Rezene** | Product / Docs | Chrome Web Store, privacy policy, user documentation | (Rezene)

---

## Week 1 (Feb 24 – Feb 28) — Critical Blockers

**Sprint Goal:** Unblock production by resolving the two P0 security/functionality gaps and laying the deployment foundation.

### BrianN — Email Service & SMTP Encryption

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| 1.1 | Choose email provider and add to `pyproject.toml` | `pyproject.toml` | Recommend SendGrid (`sendgrid`) — single dependency, generous free tier |
| 1.2 | Add env vars to `.env.example`: `EMAIL_SERVICE_API_KEY`, `EMAIL_FROM_ADDRESS`, `PASSWORD_RESET_URL_BASE` | `.env.example` | `PASSWORD_RESET_URL_BASE` needs final Chrome extension ID |
| 1.3 | Implement `send_reset_email()` in `app/services/password_reset.py` — replace `print()` stubs with real sending | `app/services/password_reset.py` (lines 73–93) | Add HTML template; handle `Exception` → log + raise `HTTPException 503` |
| 1.4 | Create HTML email template for password reset | `app/services/email_templates/password_reset.html` | Plain-text fallback required |
| 1.5 | Encrypt SMTP passwords at rest — add Fernet or `pgcrypto` encryption before `smtp_configs.password` is written | `app/api/routers/smtp.py`, `app/db/models.py` | Symmetric key stored in env: `SMTP_ENCRYPTION_KEY` |
| 1.6 | Add `SMTP_ENCRYPTION_KEY` to `.env.example` and decrypt on read in SMTP router | `app/api/routers/smtp.py` | Must be transparent to frontend — still returns plaintext on GET |
| 1.7 | Manual smoke test: request password reset → check email received → reset password | local Docker | Block on this before Week 2 |

**Definition of Done:** Password reset emails deliver to inbox; SMTP passwords in DB are ciphertext; no plaintext credentials at rest.

---

### Mohamed — Production Infrastructure Foundation

| # | Task | Notes |
|---|------|-------|
| 2.1 | Choose cloud provider and create account | Recommend **Render** or **Fly.io** — fastest time to production for a small team; managed PostgreSQL included |
| 2.2 | Provision managed PostgreSQL 15 instance | Record connection string; separate prod DB from dev |
| 2.3 | Register domain and point DNS | Required for HTTPS and Chrome Web Store privacy policy URL |
| 2.4 | Obtain TLS certificate | Render/Fly handle this automatically; otherwise Let's Encrypt via Caddy |
| 2.5 | Create `.env.production` template (do NOT commit values) | Based on `.env.example`; document all required values |
| 2.6 | Run `alembic upgrade head` against production PostgreSQL | Verify all 14 tables and 5 enums created; spot-check indexes. Migration `78efe19bc04e_initial_schema.py` is fully populated and ready. |
| 2.7 | Build production Docker image locally and verify it starts against prod DB | Document any build differences from dev |

**Definition of Done:** Production PostgreSQL is live with schema applied; domain resolves; TLS cert valid; `.env.production` template documented.

---

### BrianK — ~~Alembic Migration &~~ Test Infrastructure

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| ~~3.1~~ | ~~Populate initial migration `upgrade()` with full DDL from `models.py`~~ | ~~`alembic/versions/`~~ | ✅ **DONE** — Consolidated into single comprehensive migration `78efe19bc04e_initial_schema.py` (289 lines, Feb 27). Creates all 14 tables, 5 ENUMs, indexes, FK CASCADE constraints, and unique constraints. Both `upgrade()` and `downgrade()` fully implemented. |
| ~~3.2~~ | ~~Implement matching `downgrade()`~~ | ~~Same file~~ | ✅ **DONE** — Included in `78efe19bc04e_initial_schema.py`. Drops all tables, indexes, and ENUMs in correct order. |
| ~~3.3~~ | ~~Verify migration chain~~ | | ✅ **DONE** — Old fragmented migrations (`a32e3aa11961` + `20260218_add_post_font_fields.py`) replaced by single migration. No chain to verify. |
| ~~3.4~~ | ~~Test `alembic upgrade head` / `downgrade base`~~ | `docker-compose` | ✅ **DONE** — Migration runs cleanly (verified Feb 27). |
| 3.5 | Set up pytest infrastructure for Phase 2 routers — shared fixtures (test DB, auth headers, test client) | `app/tests/conftest.py` | Inherit patterns from existing `test_auth.py` |
| 3.6 | Write tests for `contacts` router (create, list, get, update, delete, bulk import) | `app/tests/test_contacts.py` | |
| 3.7 | Write tests for `message_groups` router (CRUD) | `app/tests/test_message_groups.py` | |

**Definition of Done:** ~~`alembic upgrade head` / `downgrade base` pass cleanly~~ ✅ Done; contacts and message_groups tests pass with >80% router coverage.

---

### Bhagath — ~~Frontend Test Infrastructure~~ ✅ COMPLETE

> **All Week 1 frontend test tasks completed ahead of schedule.** 214 tests across 11 files, all passing (verified Mar 1, 2026).

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| ~~4.1~~ | ~~Add Vitest + React Testing Library~~ | `extension/package.json`, `vitest.config.ts` | ✅ **DONE** — Vitest + jsdom + @testing-library/react installed; `vitest.config.ts` configured with 70% coverage thresholds |
| ~~4.2~~ | ~~Create test directory structure~~ | `src/api/__tests__/`, `src/utils/__tests__/`, `src/popup/__tests__/` | ✅ **DONE** — 3 test directories with 11 test files |
| ~~4.3~~ | ~~Unit tests for `utils/message.ts`~~ | `src/utils/__tests__/message.test.ts` | ✅ **DONE** — 26 tests covering shufflePick, composeMessage, selectTemplate, selectPost, resolveKeywords, assembleMessageFromTemplate |
| ~~4.4~~ | ~~Unit tests for `utils/errors.ts`~~ | `src/utils/__tests__/errors.test.ts` | ✅ **DONE** — 31 tests covering error hierarchy, parseApiError, getErrorMessage, isRetryableError, validation |
| ~~4.5~~ | ~~Unit tests for `utils/automation.ts`~~ | `src/utils/__tests__/automation.test.ts` | ✅ **DONE** — 22 tests covering config, dedup, alarms, delays |
| ~~4.6~~ | ~~Chrome global mock~~ | `src/test-setup.ts` | ✅ **DONE** — Global Chrome API stub (storage.local Promise + callback dual-mode, alarms, runtime) |
| ~~4.7~~ | ~~Confirm `npm test` runs~~ | | ✅ **DONE** — `npm test`, `npm run test:watch`, `npm run test:coverage` all configured and passing |

**Also completed (beyond original scope):**
- `src/api/__tests__/client.test.ts` — 7 tests (ApiError, login, auth headers)
- `src/utils/__tests__/storage.test.ts` — 9 tests (tokens, backend URL)
- 6 component test files (see Week 2 updates)

**Definition of Done:** ✅ All criteria met. `npm test` runs cleanly; 214 tests pass; chrome mock infrastructure in place.

---

### Annamarie — Onboarding Flow Design & Welcome Screen

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| 5.1 | Design onboarding flow: 5 steps (Welcome → Templates → Schedule → Automation → Done) | Wireframes / notes | Keep it modal-based, dismissible at any step |
| 5.2 | Create `OnboardingModal.tsx` — overlay modal with step indicator and skip option | `src/popup/components/OnboardingModal.tsx` | Use existing `Spinner`, `Toast`, accessibility utilities |
| 5.3 | Step 1: Welcome screen — product overview, key benefits callout, "Get Started" / "Skip" buttons | Inside `OnboardingModal.tsx` | |
| 5.4 | Persist onboarding state in `chrome.storage.local` — `onboarding_completed: boolean` | `src/utils/storage.ts` | Add `ONBOARDING_COMPLETED` to `STORAGE_KEYS` |
| 5.5 | Wire `OnboardingModal` into `App.tsx` — show on first login if `onboarding_completed` is falsy | `src/popup/App.tsx` | Hide when `onboarding_completed = true` |
| 5.6 | Add "Re-launch setup wizard" option in `AccountManagement.tsx` settings | `src/popup/components/AccountManagement.tsx` | Resets `onboarding_completed` flag |

**Definition of Done:** New users see onboarding modal on first login; returning users do not; tour can be re-triggered from Account settings.

---

### Rezene — Legal, Store Account & Documentation Outline

| # | Task | Notes |
|---|------|-------|
| 6.1 | Create Chrome Web Store developer account ($5 one-time fee) | Required before any submission | (Speak to Alex, BM-TS must replace existing chrome listing as version update)
| 6.2 | Draft privacy policy covering: data collected, data usage, data sharing, user rights (access + deletion) | Must be hosted at a public URL (can use GitHub Pages or the production domain) |
| 6.3 | Draft Terms of Service — basic SaaS ToS covering subscription, acceptable use, liability limits | Same hosting requirement |
| 6.4 | Publish privacy policy and ToS to a publicly accessible URL | Required for Chrome Web Store and for the extension's `options_page` or settings link |
| 6.5 | Create outline for Quick Start Guide (5-minute setup): installation → register → create template → set schedule → test automation | Outline only this week; full content Week 2 |
| 6.6 | Create outline for FAQ (15 questions) | Draft questions; answers in Week 2 |
| 6.7 | Identify 5 key screenshots to capture once production is deployed | List the 5 screens; capture in Week 3 |

**Definition of Done:** Privacy policy and ToS live at a public URL; Chrome Web Store dev account active; documentation outlines approved.

---

## Week 2 (Mar 3 – Mar 7) — Deploy & Test Expansion

**Sprint Goal:** Backend deployed to production; CI/CD running; Phase 2 testing complete; onboarding wizard steps 2–4 implemented.

---

### BrianN — Production Backend Deployment Config

| # | Task | Notes |
|---|------|-------|
| 1.8 | Configure all production env vars — JWT secret (generate 64-byte random), Stripe live keys, CORS origin (extension ID), email service keys | Never commit; use provider secret manager |
| 1.9 | Configure Stripe live-mode webhook endpoint — register `https://yourdomain.com/stripe/webhook`, copy webhook secret | Test with `stripe listen` in staging first |
| 1.10 | Configure Stripe live-mode products/prices if not already created | Match the price IDs referenced in `subscription.py` |
| 1.11 | Add `LOG_LEVEL=WARNING` to production config; verify structured logging output | |
| 1.12 | Add OWASP security headers via FastAPI middleware — `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy` | Add as a custom middleware in `main.py` |
| 1.13 | Review all API endpoints for input sanitization — text fields should strip leading/trailing whitespace; reject null bytes | `app/api/routers/*.py` |

---

### Mohamed — CI/CD & Backend Production Deployment

| # | Task | Notes |
|---|------|-------|
| 2.8 | Deploy backend Docker container to production environment | Verify `GET /health` returns `{"status": "ok"}` from internet |
| 2.9 | Verify all 14 DB tables queryable from production backend (`GET /api/stats` as a smoke test after authenticating) | |
| 2.10 | Set up GitHub Actions workflow: **backend CI** — on PR: `pytest`, `ruff`, `mypy` checks | `.github/workflows/backend-ci.yml` |
| 2.11 | Set up GitHub Actions workflow: **extension CI** — on PR: `tsc --noEmit`, `eslint`, `npm run build` | `.github/workflows/extension-ci.yml` |
| 2.12 | Set up GitHub Actions workflow: **backend CD** — on merge to `main`: build Docker image, push to registry, deploy to production | `.github/workflows/backend-cd.yml` — require manual approval gate before prod deploy |
| 2.13 | Configure automatic daily database backup (managed service backup policy, or `pg_dump` cron job) | Target: 7-day retention minimum |

---

### BrianK — Phase 2 Backend Tests

| # | Task | File(s) |
|---|------|---------|
| 3.8 | Tests for `message_templates` router (CRUD, gender filter) | `test_message_templates.py` |
| 3.9 | Tests for `posts` router (CRUD, font field validation) | `test_posts.py` |
| 3.10 | Tests for `birthday_configs` router (CRUD, toggle endpoint) | `test_birthday_configs.py` |
| 3.11 | Tests for `images` router (upload URL, list, delete) | `test_images.py` |
| 3.12 | Tests for `schedules` router (CRUD, unique constraint on user+days_before) | `test_schedules.py` |
| 3.13 | Tests for `messages` router (queue CRUD, history, retry) | `test_messages.py` |
| 3.14 | Tests for `smtp` router (GET/PUT config, verify password encryption round-trip) | `test_smtp.py` |
| 3.15 | Tests for `dashboard` router (stats structure, correct counts) | `test_dashboard.py` |

**Target:** All Phase 2 routers covered; combined coverage with Phase 1 tests ≥ 75%.

---

### Bhagath — Extension Component Tests (Partially Complete)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| ~~4.8~~ | ~~Component tests for `AuthForm`~~ | `src/popup/__tests__/components.test.tsx` | ✅ **DONE** — Login/register toggle, inputs, validation, spinner on submit, message display |
| ~~4.9~~ | ~~Component tests for `Dashboard`~~ | `src/popup/__tests__/Dashboard.test.tsx` | ✅ **DONE** — 12 tests: loading/error/stats/automation-status/refresh |
| ~~4.10~~ | ~~Component tests for `TemplateCreator`~~ | `src/popup/__tests__/TemplateCreator.test.tsx` | ✅ **DONE** — 15 tests: form fields, validation, submit/cancel/preview, gender select, initialData |
| 4.11 | Component tests for `ScheduleSettings` — add/edit/delete, enable toggle | `__tests__/ScheduleSettings.test.tsx` | ⬜ Not started |
| 4.12 | Component tests for `ContactForm` — gender selector, create/update payloads | `__tests__/ContactForm.test.tsx` | ⬜ Not started |
| 4.13 | Component tests for `AutomationSettings` — max messages, clear sent-today | `__tests__/AutomationSettings.test.tsx` | ⬜ Not started |
| ~~4.14~~ | ~~Mock `api/client.ts` with Vitest `vi.mock`~~ | `src/test-setup.ts` | ✅ **DONE** — Chrome API mocks in global test setup; API mocking patterns established in existing component tests |

**Also completed (beyond original scope):**
- `MessageQueue.test.tsx` — 20 tests (empty/loading/list/badges/counts/cancel/retry/expand/refresh)
- `MessageHistory.test.tsx` — 28 tests (filter/search/expand, status badges)
- `TemplateGallery.test.tsx` — 22 tests (template rendering, badges, edit/delete actions)
- `components.test.tsx` — 22 tests (Spinner, Toast, ErrorBoundary, AuthForm)

---

### Annamarie — Onboarding Steps 2–4 & Contextual Help

| # | Task | File(s) |
|---|------|---------|
| 5.7 | Onboarding Step 2: Template creation — deep link to TemplateCreator with guided callout | `OnboardingModal.tsx` |
| 5.8 | Onboarding Step 3: Schedule setup — deep link to ScheduleSettings with explanation of days_before/after | `OnboardingModal.tsx` |
| 5.9 | Onboarding Step 4: Automation test — prompt user to run "Check Now", explain what it will do | `OnboardingModal.tsx` |
| 5.10 | Add `HelpTooltip.tsx` component — a reusable `?` icon with popover text | `src/popup/components/HelpTooltip.tsx` |
| 5.11 | Add `HelpTooltip` to: merge tag fields in `TemplateCreator`, days_before field in `ScheduleSettings`, gender filter in `ContactForm`, max messages in `AutomationSettings` | Various components | 4 tooltips minimum |
| 5.12 | Add empty state messages to `MessageQueue` ("No messages queued yet — automation will add messages here when it runs") and `MessageHistory` | `MessageQueue.tsx`, `MessageHistory.tsx` |

---

### Rezene — Quick Start Guide, FAQ & Store Listing Content

| # | Task | Notes |
|---|------|-------|
| 6.8 | Write complete Quick Start Guide — installation, register, create first template, set first schedule, run first automation check | Target: readable in 5 min, includes screenshots placeholders |
| 6.9 | Write complete FAQ (15 questions covering: data collection, automation mechanics, subscription, pause/resume, Facebook blocks, contacts, images, password reset, merge tags, SMTP) | |
| 6.10 | Write Chrome Web Store listing — long description (detailed, keyword-rich), short description (132 chars), category: `Productivity` | |
| 6.11 | Write permissions justification document for Chrome Web Store review — one paragraph per permission: `storage`, `scripting`, `activeTab`, `tabs`, `alarms`, host permission `facebook.com` | Reviewers scrutinize `scripting` + `facebook.com` heavily |
| 6.12 | Add privacy policy link and ToS link to extension settings page (`AccountManagement.tsx`) | Required for Chrome Web Store Policy compliance |

---

## Week 3 (Mar 10 – Mar 14) — Integration Testing & Polish

**Sprint Goal:** End-to-end flows verified in production/staging; Playwright E2E suite started; UX polish complete; store assets ready.

---

### BrianN — Integration Verification & Security Audit

| # | Task | Notes |
|---|------|-------|
| 1.14 | End-to-end test of password reset flow in production — confirm email delivers, link works, password resets | Blockers from Week 1 are now unblocked |
| 1.15 | Verify Stripe webhook in production — trigger test events with Stripe CLI, confirm subscription status updates | Test: `customer.subscription.updated`, `invoice.payment_failed` |
| 1.16 | Run `safety check` on Python dependencies — address any known CVEs | `pip install safety; safety check` |
| 1.17 | Run `npm audit` on extension dependencies — fix high/critical severity issues | `npm audit fix` for patchable items |
| 1.18 | Verify OWASP headers are present in production responses using `curl -I` | Check: `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options` |
| 1.19 | Parameterized query audit — scan all SQLAlchemy queries for any string interpolation into SQL | `grep -r "execute.*f'" backend/app/` — should be zero results |
| 1.20 | Load test: simulate 50 concurrent users with `locust` or `k6` — document p95 response times | Focus on `/auth/login`, `/api/queue`, `/api/history`, `/api/stats` |

---

### Mohamed — Monitoring, Staging, Rollback

| # | Task | Notes |
|---|------|-------|
| 2.14 | Set up Sentry for backend error tracking — `pip install sentry-sdk[fastapi]`, configure DSN in production env | Add to `main.py` startup |
| 2.15 | Set up UptimeRobot (free tier) — monitor `GET /health` every 5 min, alert on downtime | |
| 2.16 | Set up basic alerting rules — Sentry: alert on error rate > 5%; UptimeRobot: downtime email + SMS | |
| 2.17 | Create staging environment — deploy same Docker image to a staging slot with staging DB | Used for E2E testing and pre-production verification |
| 2.18 | Document rollback procedure — how to redeploy previous Docker image tag within 5 minutes | Add to `DEVELOPMENT_GUIDE.md` |
| 2.19 | Verify automated DB backup is running and test a manual restore to staging | Backup restore procedure must be documented |

---

### BrianK — Integration & Database Tests

| # | Task | File(s) |
|---|------|---------|
| 3.16 | Integration test: full auth flow (register → login → refresh → change password → logout) | `test_integration_auth.py` |
| 3.17 | Integration test: password reset flow (request → token validation → reset → login with new password) | `test_integration_password_reset.py` |
| 3.18 | Integration test: message queue flow (create → verify queued → update → cancel → retry) | `test_integration_messages.py` |
| 3.19 | Integration test: Stripe subscription flow (checkout session creation → simulate webhook → verify status update) | `test_integration_subscription.py` — mock Stripe API calls |
| 3.20 | DB constraint tests: foreign key violations (expect 422/409), unique constraint on `schedules(user_id, days_before)`, enum validation | `test_db_constraints.py` |
| 3.21 | Run full test suite and confirm coverage ≥ 80% on backend | `pytest --cov=app --cov-report=term-missing` |
| 3.22 | Document migration workflow in `DEVELOPMENT_GUIDE.md` — how to run `alembic upgrade head`, create new migrations | |

---

### Bhagath — Playwright E2E Setup & Critical Path Tests

| # | Task | Notes |
|---|------|-------|
| 4.15 | Install and configure Playwright with Chrome extension support | `npm install -D @playwright/test` — load unpacked extension in test browser context |
| 4.16 | E2E test: Install extension → register new user → verify dashboard loads | `e2e/auth.spec.ts` |
| 4.17 | E2E test: Login → create template segment (greeting) → save → verify in template list | `e2e/templates.spec.ts` |
| 4.18 | E2E test: Create birthday schedule → verify it appears in list → toggle enabled/disabled | `e2e/schedules.spec.ts` |
| 4.19 | E2E test: Subscribe via Stripe (use Stripe test card `4242 4242 4242 4242`) → verify active status | `e2e/subscription.spec.ts` |
| 4.20 | E2E test: View message queue — verify empty state message; create one via API; verify it appears | `e2e/messages.spec.ts` |
| 4.21 | Cross-browser: run all E2E tests in Chrome stable and Microsoft Edge | Playwright natively supports both |

---

### Annamarie — Onboarding Step 5 & UX Polish Sprint

| # | Task | File(s) |
|---|------|---------|
| 5.13 | Onboarding Step 5: Completion screen — summary of what's set up, "You're ready!" CTA to dashboard | `OnboardingModal.tsx` |
| 5.14 | Add step progress indicator to onboarding (e.g., 1 of 5 breadcrumb with filled dots) | `OnboardingModal.tsx` |
| 5.15 | `MessageQueue` enhancements — add status filter dropdown (All / Pending / Failed / Sent), add sort by date | `MessageQueue.tsx` |
| 5.16 | `MessageHistory` enhancements — add pagination (25 per page), add date range picker | `MessageHistory.tsx` |
| 5.17 | Add "Retry All Failed" button to `MessageQueue` (calls retry endpoint for each failed message) | `MessageQueue.tsx` |
| 5.18 | Feature discovery: add "New" badge to navigation items that have Phase 2 features (Posts, Message Groups, Birthday Configs) | `TabbedDashboard.tsx` or navigation component |
| 5.19 | Accessibility pass on all new components (OnboardingModal, HelpTooltip, new queue/history controls) — ARIA labels, focus trap in modal, keyboard-dismissible | Various |

---

### Rezene — Promotional Assets & Store Submission Prep

| # | Task | Notes |
|---|------|-------|
| 6.13 | Capture 5 screenshots from staging (1280×800): Dashboard, Template Creator, Schedule Settings, Automation in action, Contact list | Use staging environment from Dev 2 |
| 6.14 | Create Small tile icon 128×128 — use `Birthday_messaging-logo.png` as source | Resize/export; must be PNG |
| 6.15 | Create Large tile 440×280 and Marquee image 1400×560 — branded with product name and 1-line value prop | Use Figma / Canva; keep it simple |
| 6.16 | Create `WHATS_NEW.md` — "What's New" section for the store listing first version | Version 1.0 launch features |
| 6.17 | Add privacy policy and ToS link into extension manifest `options_page` or visible in `AccountManagement` | Inspect compliance with CWS policy §4 (user data) |
| 6.18 | Dry-run Chrome Web Store submission — upload the extension zip via the developer dashboard, fill in all fields, but **do not publish** — review and note any validation errors | Fix blockers before Week 4 |

---

## Week 4 (Mar 17 – Mar 21) — Launch Preparation & Soft Launch

**Sprint Goal:** Full test suite green; monitoring live; Chrome Web Store submission sent; soft launch to 10–20 beta users.

---

### BrianN — Performance, Final Hardening & Beta Support

| # | Task | Notes |
|---|------|-------|
| 1.21 | Review load test results from Week 3 — profile any endpoints with p95 > 1s | Common causes: missing indexes, N+1 queries, too much data returned without pagination |
| 1.22 | Add pagination to `GET /api/history` (currently returns all rows) — add `limit` + `offset` query params | `app/api/routers/messages.py` |
| 1.23 | Add database connection pool tuning for production — set `pool_size`, `max_overflow`, `pool_timeout` in `session.py` | Target: handle 50 concurrent users without connection exhaustion |
| 1.24 | Respond to any beta user bug reports — triage and fix P0/P1 items during the sprint | Coordinate with Dev 5 for UX issues |
| 1.25 | Create `.env.production` documentation in `DEVELOPMENT_GUIDE.md` — all required env vars with descriptions | |

---

### Mohamed — Monitoring Dashboard & Production Verification

| # | Task | Notes |
|---|------|-------|
| 2.20 | Set up Grafana Cloud (free tier) or equivalent for metrics — dashboard showing: request rate, error rate (5xx), p95 latency, DB connection pool usage | |
| 2.21 | Configure alerting: API downtime (>1 min) → PagerDuty/email; error rate > 5% → Slack/email; DB connection failure → immediate page | |
| 2.22 | Verify production end-to-end one final time as a new real user (not test data): register → subscribe → create template → create schedule → run automation check | Document as the golden-path checklist |
| 2.23 | Create runbook for common issues: DB connection failure, API downtime, Stripe webhook failure, email delivery failure | `Developer docs/RUNBOOK.md` |
| 2.24 | Set up log retention — ensure production logs are searchable for at least 30 days | CloudWatch, GCP Logs, or provider-native logging |

---

### BrianK — Coverage Gate, Regression & Docs

| # | Task | Notes |
|---|------|-------|
| 3.23 | Full test suite regression run — all tests must pass before soft launch sign-off | `pytest --cov=app` — target ≥ 80% |
| 3.24 | Run migration tests against a clean production-equivalent DB — `alembic upgrade head` then `downgrade base` | Confirms migrations are production-safe |
| 3.25 | Add `pytest` to GitHub Actions backend CI (confirm it was wired in Week 2 and runs in < 3 min) | If slow: split into unit and integration jobs |
| 3.26 | Add coverage badge to `backend/README.md` | `pytest-cov` + shields.io badge |
| 3.27 | Document API test patterns in `BACKEND_TESTING_GUIDE.md` — how to write tests for new routers going forward | Prevents regression as codebase grows |
| 3.28 | Write tests for `webhook.py` — Stripe signature validation (valid signature → 200, invalid → 403) | `test_webhook.py` |

---

### Bhagath — Full E2E Suite, Browser Compat & Accessibility Audit

| # | Task | Notes |
|---|------|-------|
| 4.22 | Full Playwright E2E suite run against **staging** environment — all tests must pass | Gate: no soft launch without green E2E |
| 4.23 | Browser compatibility: run E2E suite in Edge and Brave | Playwright `--project=chromium` covers all Chromium-based browsers |
| 4.24 | Manual accessibility audit of onboarding flow — run `axe-core` DevTools audit on the extension popup | Focus: OnboardingModal, HelpTooltip, new queue/history controls |
| 4.25 | Final `npm run build` — verify production bundle is clean (no TypeScript errors, no ESLint warnings) | |
| 4.26 | Package extension as `.zip` for Chrome Web Store upload | `npm run build && cd dist && zip -r ../extension.zip .` / PowerShell equivalent |
| 4.27 | Performance: check popup load time — should open within 300ms | Use Chrome DevTools Performance panel |

---

### Annamarie — Final UX, Beta Feedback Loop & Onboarding Analytics

| # | Task | Notes |
|---|------|-------|
| 5.20 | Implement `chrome.storage`-based `feature_flags` object — track which onboarding steps completed | Allows analytics without external service |
| 5.21 | Add "Did you know?" tip rotation in `AutomationSettings` — 3 rotating tips about max messages, deduplication, advance mode | Low effort, high discoverability |
| 5.22 | Conduct internal UX walkthrough with all 6 devs simulating a new user — note friction points | 30-minute session; capture issues in backlog |
| 5.23 | Fix top 3 friction points identified in internal UX walkthrough | Prioritize by severity |
| 5.24 | Add "What's New" modal for version 1.0 launch (shown once on update) — highlight top 3 features | Store last seen version in `chrome.storage.local` |
| 5.25 | Post-launch backlog: document all UX debt items that didn't make the sprint | Feed into v1.1 planning |

---

### Rezene — Chrome Web Store Submission & Beta Launch

| # | Task | Notes |
|---|------|-------|
| 6.19 | Final review of all Chrome Web Store assets — description, screenshots, icons, promotional tiles | Check CWS policy one more time |
| 6.20 | Upload final extension `.zip` to Chrome Web Store developer dashboard | Use the zip from Dev 4 |
| 6.21 | Submit for Chrome Web Store review | ⚠️ Review typically takes 1–3 business days for first submission; plan accordingly |
| 6.22 | Publish Quick Start Guide and FAQ to documentation site (GitHub Pages, Notion, or production domain subdirectory) | Required: accessible URL for in-app help links |
| 6.23 | Send beta invite emails to 10–20 selected testers — include Setup Guide link, feedback form | Soft launch, not public announcement |
| 6.24 | Set up a feedback channel (GitHub Issues template, Google Form, or Notion form) for beta testers | |
| 6.25 | Monitor beta feedback daily — triage and assign to appropriate dev | Daily 15-min triage session with Dev 1 |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Chrome Web Store review takes >3 days | High — normal for new extensions | Medium | Submit end of Week 3 instead of Week 4; factor into launch date |
| Stripe live-mode webhook misconfiguration | Medium | High — breaks subscriptions | Verify with Stripe CLI in staging before prod; test `payment_intent.succeeded` event manually |
| Email provider delivery issues (spam filtering) | Medium | High — blocks user recovery | Test with multiple email clients (Gmail, Outlook) in Week 1; configure SPF/DKIM records |
| Load test reveals DB bottleneck | Medium | Medium | Covered by Dev 1 Week 4 optimization; indexes already in place |
| SMTP password encryption key loss | Low | Critical — all SMTP configs inaccessible | Key derivation from master secret preferred; document key rotation procedure |
| Facebook UI changes break content script | Medium (ongoing) | High | Out of scope for this sprint; document as known ongoing maintenance risk |
| Beta testers find critical bugs in Week 4 | Medium | High | Reserve 20% of Dev 1 + Dev 5 capacity in Week 4 for bug fixes |

---

## Dependencies Between Developers

```
Mohamed (prod DB, Week 1) ──────────────────────────────► BrianN (connect prod DB, Week 2)
Mohamed (staging env, Week 3) ──────────────────────────► Bhagath (E2E against staging, Week 3–4)
BrianN (email service, Week 1) ────────────────────────► BrianK (pw-reset integration test, Week 3)
BrianN (SMTP encryption, Week 1) ──────────────────────► BrianK (SMTP round-trip test, Week 2)
Bhagath (extension .zip, Week 4) ───────────────────────► Rezene (store upload, Week 4)
Rezene (privacy policy URL, Week 1) ───────────────────► Annamarie (link in AccountManagement, Week 2)
BrianK (full test suite green, Week 4) ────────────────► Rezene (soft launch go/no-go, Week 4)
Bhagath (E2E suite green, Week 4) ──────────────────────► Rezene (soft launch go/no-go, Week 4)
```
**Resolved dependency:** ~~BrianK (Alembic migration, Week 1) → Mohamed (alembic upgrade head, Week 1)~~ ✅ Migration fully populated (Feb 27).
---

## Definition of Done for Soft Launch (Week 4 Gate)

All of the following must be true before soft launch proceeds:

- [ ] Password reset emails deliver reliably in production
- [ ] SMTP passwords stored as ciphertext in production DB
- [ ] Backend deployed to production with HTTPS, verified by `curl`
- [ ] All 14 DB tables queryable in production
- [ ] Stripe live-mode webhook verified (manual test event)
- [ ] `alembic upgrade head` passes on a clean DB ✅ *(Migration verified locally Feb 27; needs production verification)*
- [ ] Backend test coverage ≥ 80% (`pytest --cov`)
- [ ] All Playwright E2E tests pass against staging
- [ ] No high/critical npm audit vulnerabilities
- [ ] No known CVEs in Python dependencies (`safety check`)
- [ ] OWASP security headers present in production responses
- [ ] Onboarding flow works end-to-end (new user sees it; returning user does not)
- [ ] Privacy policy and ToS live at public URLs
- [ ] Chrome Web Store submission accepted (or under active review)
- [ ] Monitoring (Sentry + UptimeRobot) sending alerts
- [ ] Rollback procedure documented and tested
- [ ] Quick Start Guide and FAQ published

---

## Post-MVP Backlog (v1.1 and beyond)

Items explicitly deferred from this plan:

- Image upload/storage (S3/R2) — currently URL-based only
- ~~Alembic migration for initial schema~~ ✅ **Resolved Feb 27** — comprehensive migration `78efe19bc04e_initial_schema.py` (289 lines) fully populates all 14 tables, ENUMs, indexes, FK CASCADE constraints, unique constraints
- Advanced analytics (time-series, CSV export, success rate breakdown)
- Full internationalization (i18n)
- Interactive product tour (Shepherd.js or similar)
- Video tutorials
- Dark mode
- Pagination for all list endpoints (only history added in this plan)
- Account lockout after failed login attempts
- Session management (list/revoke active sessions)
- Mobile / responsive popup improvements
- AI-powered message suggestions

---

**Last Updated:** March 1, 2026
