# BirthdayMessaging (bm-ts) System Architecture Analysis


**Generated:** February 1, 2026  
**Last Updated:** April 4, 2026  
**Version:** 1.5.1  
**System Type:** Full-Stack Web Application with Browser Extension


> **Implementation Status:** ✅ **Phase 1, Phase 2 & Facebook Automation Complete** — Backend runs fully containerized in Docker with 15 registered routers (+ 2 inline app routes), 17 database models, and 17 tables defined in `models.py` (449 lines) with 5 Alembic migrations. Extension has 38 React component files (26 imported in App.tsx, App.tsx at 840 lines with 7 extracted hook files + AppContext) with real-time WebSocket updates, comprehensive accessibility, and a fully implemented Facebook automation pipeline: gender-aware DM sending, timeline posting, advance/follow-up modes, contact sync, and per-day deduplication. Background service worker handles **77 message types** across 16 categories (902 lines). API client: 58 exported functions (882 lines). 22 ViewMode navigation states. Extension test suite: **294 tests** across 15 files. Backend test suite: **230 tests** across 25 files. Manifest hardened with Meta-compliant fail-safe mechanisms: human-in-the-loop confirmation, aggregate rate limiting (1/hr, 3/day, 5/week), Facebook restriction detection, user-activity gating, and emergency kill-switch. Security hardening pass #2 complete: session invalidation on password change/reset, WebSocket access-token + session enforcement, timing oracle fix, atomic token consumption, JWT iss/aud claims, email_verified + account lockout enforcement, CORS/CSP/Cache-Control tightening, CSS selector injection fix, manifest CSP, audit log enrichment.

---

## 1.5.0 Evaluation Summary (as of April 1, 2026)

**bm-ts** is a robust, modernized system for automating Facebook birthday messages, with a fully implemented automation pipeline. The project demonstrates:

- **High code quality and maintainability**: TypeScript and Pydantic enforce type safety; async FastAPI and SQLAlchemy 2.0 provide scalable backend performance.
- **Comprehensive security**: JWT rotation with iss/aud claims, Argon2 password hashing, Stripe webhook verification, security headers middleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cache-Control), input sanitization on all text schemas, session invalidation on password reset/change, WebSocket access-token + session validation, timing oracle protection, atomic token consumption, email_verified + account lockout enforcement, CSS selector injection prevention, audit logging.
- **Accessibility**: The extension meets WCAG 2.1 AA, with keyboard navigation, screen reader support, and focus management.
- **Real-time features**: WebSocket-based updates for queue, history, and dashboard are fully functional.
- **Developer experience**: Docker Compose, Vite, and comprehensive documentation support rapid onboarding and development.
- **Automation pipeline complete**: The extension can scrape the Facebook birthdays feed, select gender-appropriate DMs from stored templates, post to friend timelines, archive conversations, sync contacts, and avoid duplicate sends — with advance/follow-up modes based on `days_in_advance`.
- **Strong test coverage**: 230 backend tests across 25 files covering all routers, integration flows, API contracts, DB constraints, and core utilities. 294 extension tests across 15 files covering utilities, API client, and 10 component suites.

**Key Gaps and Risks:**

- **Email service fully configured**: SendGrid SDK integrated for password reset and email verification. All config fields in `config.py` Settings.
- **SMTP passwords encrypted at rest**: Fernet symmetric encryption implemented via `encryption.py`; SMTP router encrypts on save, masks on read.
- **`/send-birthday-message` is a stub**: Backend `POST /send-birthday-message` returns `{"status": "sent"}` without logic. Actual sending is handled client-side by the content script automation pipeline.
- **Production infrastructure absent**: No CI/CD (backend), monitoring, HTTPS configuration, or Chrome Web Store listing. Frontend CI pipeline exists (.gitea/workflows/frontend-ci.yaml).
- **No E2E tests**: No Playwright/Puppeteer test coverage.
- **6 pre-existing test failures**: 5 auth tests (KeyError: 'path' in session handling), 1 subscription test (billing portal message assertion mismatch).

**Actionable Recommendations:**

1. ~~**Fix email delivery config**~~: ✅ RESOLVED (Mar 14, 2026).
2. ~~**Encrypt SMTP passwords**~~: ✅ RESOLVED — Fernet symmetric encryption implemented.
3. **Fix 6 pre-existing test failures**: Auth session KeyError and subscription assertion mismatch.
4. **Increase test coverage**: Add E2E tests (Playwright); add background worker and hook tests; target >80% code coverage.
5. **Productionize deployment**: Managed PostgreSQL, HTTPS reverse proxy, CI/CD, and monitoring.
6. **Prepare Chrome Web Store listing**: Complete manifest metadata, screenshots, and privacy policy.

**Overall Assessment:**

bm-ts is a feature-complete, development-ready system with a fully operational automation pipeline. Both Phase 1 and Phase 2 are fully implemented with all 15 routers registered (plus 2 inline app routes), all 17 models and 17 tables active, and the full frontend wired to every backend feature. The Facebook automation pipeline is end-to-end: the content script scrapes the birthday feed, selects gender-appropriate templates from the backend, sends DMs and timeline posts, archives conversations, syncs contacts, and enforces per-day deduplication. The architecture is solid — async FastAPI, type-safe TypeScript, WCAG 2.1 AA accessibility, and WebSocket real-time updates. SendGrid email service is integrated for password reset and email verification. Email verification and user sessions management are implemented. Two comprehensive security hardening passes have been completed. Backend testing has expanded from 7 tests (2 files) to 230 tests (25 files) covering all routers and core utilities. The primary remaining work is production deployment and infrastructure setup rather than feature development.

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | January 2026 | Initial system architecture analysis |
| 0.2.0 | February 1, 2026 | **Phase 1 Implementation Complete** — Added 4 database tables, 15 API endpoints, 7 new frontend components. |
| 0.3.0 | February 7, 2026 | **Architecture Verification** — Updated to reflect actual implemented state. |
| 0.4.0 | February 11, 2026 | **Phase 2 UI Scaffolding Complete** — Added 6 new React components, enhanced tab navigation. 8th router (WebSocket) registered. |
| 0.5.0 | February 12, 2026 | **Full Documentation Audit** — Corrected password hashing (Argon2, not bcrypt), updated router count to 8, verified 29 components / 24 API client functions / 32 background message types. DDL confirmed complete with all 7 tables. Documented WebSocket/real-time architecture, accessibility utilities. Removed 3000+ lines of obsolete legacy migration scaffolding code (all features now implemented). |
| 0.6.0 | February 14–20, 2026 | **Phase 2 Full Activation** — All Phase 2 routers registered (contacts, message_groups, message_templates, posts, images, birthday_configs, smtp). 13 models and 13 tables active. Auth router extended with `PUT /auth/profile` and `DELETE /auth/account`. Rate limiting added via `slowapi`. API contract aligned (PATCH→PUT for schedules, standardised DELETE responses, `/api` prefixes). 35 extension component files; 49 API client functions; 59 background message types; App.tsx grew to 1477 lines. |
| 0.7.0 | February 20, 2026 | **Documentation Realignment** — Comprehensive audit corrected all stale counts and status flags to reflect the actually-implemented codebase. Identified remaining production gaps: email service, SMTP password encryption, stub endpoint, and test coverage. |
| 0.8.0 | February 21, 2026 | **Facebook Automation Pipeline Complete** — `runFullAutomation()` in content/index.ts: 2-phase loop (live birthday feed + advance/follow-up from contacts DB). Gender-aware `selectTemplate`/`selectPost` with priority (exact → neutral → any). `resolveKeywords` for `[Tag Person]`/`[Today]`/`[Image]`. `handleAutomationScan` rewritten: fetches all data, opens /birthdays tab, dispatches `automation.runFull`. Sent-today deduplication (`SentTodayRecord`, chrome.storage). `maxMessages` cap. `AutomationRunPayload` + `ContentScriptMessage` types. 3 new background message types — 62 total. `ContactForm` gender selector. `AutomationSettings` max-messages + clear-sent-today controls. `submitPost` Enter-key fallback. |
| 0.9.0 | February 23, 2026 | **Documentation Audit & Correction** — Full code audit correcting all stale counts. `dashboard.getConfigs` and `dashboard.toggleConfig` confirmed fully implemented (call `listBirthdayConfigs`/`toggleBirthdayConfig`). App.tsx refactored from 1477 → 698 lines with 8 extracted hook files (`useContacts`, `useSMTPConfig`, `useMessageTemplates`, `usePostComposer`, `useApi`, `useImageLibrary`, `useMessages`, `useTemplateSegments`) + `AppContext.tsx`. Corrected counts: background/index.ts 750 lines / 64 message types; client.ts 760 lines / 52 functions; content/index.ts 618 lines; navigation refactored to 4 tabs (Home/Contacts/Messages/Account) with 17 view modes. Removed stale TODO flags for dashboard config handlers. |
| 1.0.0 | February 24, 2026 | **Full Accuracy Audit** — Second code audit correcting remaining stale metrics. Model and table count corrected: 13 → **14** (models.py and ddl.sql both contain 14 entries; the 0.6.0 count of 13 was an off-by-one). Component count corrected: 35 → **38** (three previously undocumented components added to inventory: `HomeControls.tsx`, `ImageLibraryPicker.tsx`, `MessagesHub.tsx`; sub-component count updated from 12 → 15). Line counts corrected: background/index.ts 750 → **715**; client.ts 760 → **667**; content/index.ts 618 → **613**; App.tsx 698 → **651**. Images endpoint URL corrected in § 2.3 and BACKEND_INTEGRATION_SUMMARY (`POST /api/images/` → `POST /api/images/upload`). Evaluation summary and all metric tables updated to reflect verified counts. |
| 1.1.0 | March 1, 2026 | **Comprehensive Code Audit** — Full codebase re-verification corrected 30+ stale metrics across all documentation. Router count clarified: **15** `include_router()` calls + **2** inline app routes (not "17 routers"). `ddl.sql` confirmed removed from codebase — schema managed via `models.py` + Alembic. Component count corrected: 38 → **34** (4 phantom entries removed: `Config.tsx`, `MessageTemplates.tsx`, `TabbedDashboard.tsx`, `TemplateList.tsx`). Hook files corrected: 8 → **7** (`useApi` does not exist). Line counts corrected: App.tsx 651 → **668**; background/index.ts 715 → **780**; client.ts 667 → **825**; content/index.ts 613 → **741**; timeline.ts 575 → **562**; messenger.ts 511 → **483**; models.py 373 → **499**; accessibility.ts 216 → **237**. API client functions corrected: 52 → **52** (confirmed). Messages queue endpoint corrected: `PATCH` → **`PUT`**. Extension test suite documented: **214 tests** across 11 files (95 unit + 119 component). `db/` directory listing corrected: removed nonexistent `database.py`, `connect_db.py`, `db_config.py`; confirmed actual files: `base.py`, `models.py`, `session.py`. Removed phantom `async_test_db.py` from test listing. Python dependency count corrected: 13 → **14**. |
| 1.2.0 | March 9, 2026 | **Full Codebase Audit & Bug Fixes** — Fixed critical `import asyncio` bug in `password_reset.py` that caused `NameError` at runtime (reset emails silently failed). Removed hardcoded SendGrid credentials from source code comment. Updated stale TODO docstring to reflect actual SendGrid implementation. Component count corrected: 34 → **36** (35 in `components/` + `Toast.tsx`). Line counts re-verified: App.tsx 668 → **570**; background/index.ts 780 → **1,131**; client.ts 825 → **783**; content/index.ts 741 → **1,130**; timeline.ts 562 → **660**; messenger.ts 483 → **620**; models.py 499 → **589**; accessibility.ts 237 → **226**. Extension test suite corrected: 214/11 → **266 tests across 13 files** (95 unit + 171 component). Email service status upgraded from "not configured" to "SendGrid integrated". Python dependency count corrected: 14 → **15** (`sendgrid>=6.11` added). API client functions confirmed: **52**. Background message types confirmed: **64**. |
| 1.3.0 | March 13, 2026 | **Comprehensive Accuracy Audit** — Full line-by-line verification of every metric against actual codebase. Model/table count corrected: 14 → **15** (RevokedToken was undocumented, confirmed via separate Alembic migration `a1b2c3d4e5f6_create_revoked_tokens.py`). Component count corrected: 36 → **38** (38 .tsx files in `components/`). Background message types corrected: 64 → **72** across **15 categories** (added failsafe category with 8 message types). Line counts re-verified against terminal: App.tsx → **673**; background/index.ts → **865**; client.ts → **767**; content/index.ts → **892**; timeline.ts → **467**; messenger.ts → **461**; models.py → **404**; accessibility.ts → **211**. Extension tests corrected: 266 → **283** across 13 files (97 unit + 186 component). Backend tests corrected: 4 → **7** (5 in test_auth.py + 2 in test_templates.py). Utility files: 9 → **10** (added failsafe.ts at 370 lines; total ~1,484 lines). Manifest section updated to match actual manifest.json (3 `content_scripts.matches` patterns including profile.php, narrowed `host_permissions`, `alarms` in `optional_permissions`, `type: "module"` on service worker). **CRITICAL BUG IDENTIFIED**: `EMAIL_FROM_ADDRESS` and `PASSWORD_RESET_URL_BASE` are referenced in `password_reset.py` but NOT defined in `config.py` Settings — `send_reset_email()` will crash with `AttributeError`. Known code gaps and recommendations updated accordingly. |
| 1.4.0 | March 14, 2026 | **Security Hardening & Email Config Fix** — CRITICAL BUG FIXED: `EMAIL_FROM_ADDRESS`, `PASSWORD_RESET_URL_BASE`, and `SENDGRID_API_KEY` added to `config.py` Settings class; `password_reset.py` updated to use `settings.*` (removed `os.environ.get()`); `SMTP_ENCRYPTION_KEY` validator rejects placeholder `"generate-with-fernet"` at startup. New `SecurityHeadersMiddleware` in `security_headers.py` adds 5 OWASP headers (HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy). New `validators.py` with reusable `sanitize_text()` (strip, null-byte rejection, 10K max) applied to 6 schema files (auth, contact, post, message_template, smtp, template). SMTP GET/PUT endpoints now return masked password `"••••••••"` instead of real values. `.env.example` updated with all new env vars. |
| 1.5.0 | April 1, 2026 | **Comprehensive Codebase Audit** — Full re-verification of every metric against actual codebase. **Model/table count corrected: 15 → 17** (UserSession and EmailVerificationToken were undocumented; separate Alembic migrations exist for both). Auth router expanded: 9 → **15 endpoints** (added `/revoke`, `/sessions`, `DELETE /sessions/{id}`, `/request-email-verification`, `/verify-email`, `/data-export`). Subscription router expanded: 2 → **6 endpoints** (added `/cancel`, `/reactivate`, `/change-plan`, `/billing-portal`). Messages router expanded: 7 → **8** (added `/history/export`). Templates router: 4 → **5** (added `/preview`). **Total HTTP endpoints: 65 → 77** (75 router + 2 inline). **API client functions: 52 → 58** (882 lines, up from 767). **Background message types: 72 → 77** (902 lines, up from 865). **ViewMode states: 17 → 19** (added `schedules`, `automation`, `post-list`). App.tsx grew: 673 → **840** lines. AppContext.tsx: 164 → **180** lines. models.py: 404 → **449** lines. content/index.ts: 892 → **960** lines. **Backend tests massively expanded: 7 → 176 tests, 2 → 20 files** (all Phase 2 routers tested, integration tests, API contracts, DB constraints). **Extension tests: 283 → 297 tests, 13 → 15 files**. Service files: 3 → **4** (`email_verification.py` added). Schema files confirmed: **17**. SMTP passwords now encrypted at rest (Fernet). Email verification and user sessions fully implemented. Two security hardening passes complete. Known gap: 6 pre-existing test failures (5 auth KeyError:'path', 1 subscription assertion). |
| 1.5.1 | April 4, 2026 | **Documentation Accuracy Audit** — Corrected stale metrics across all developer docs. **Backend test count corrected: 176/20 → 230 tests across 25 files** (6 new test files added since v1.5.0: test_audit_log, test_encryption, test_rate_limiter, test_security_headers, test_stripe_service, test_validators). **Extension test count corrected: 297 → 294** (precise recount). **Auth router: 15 → 17 endpoints** (2 HTML pages for email verification + password reset excluded from OpenAPI schema). **Total HTTP endpoints: 77 → 78** (76 router + 2 inline). **ViewMode states: 19 → 22** (full recount from AppContext.tsx: `postLibrary`, `post-list`, `import-contacts` were uncounted). Content scripts total: ~1,893 lines. FRONTEND_INTEGRATION_SUMMARY updated: all line counts re-verified (client.ts 882, background 902, content 962, App.tsx 840, messenger 413, timeline 473), manifest.json corrected (`alarms` in optional\_permissions, narrowed content\_scripts.matches), `failsafe.ts` added to utils listing. BACKEND_INTEGRATION_SUMMARY updated: missing auth endpoints (email verification, sessions, data export), subscription endpoints (cancel/reactivate/change-plan/billing-portal), messages CSV export added; SMTP status corrected to Fernet-encrypted; totals table corrected. MVP_CHECKLIST: component count corrected 42 → 38, ORM model count 15 → 17. BACKEND_TESTING_GUIDE: email status updated from "not configured" to SendGrid. |

---

## Executive Summary

BirthdayMessaging (bm-ts) is a modernized Chrome extension system that automates personalized birthday messages on Facebook. The architecture consists of:

1. **Backend API**: FastAPI-based Python service with PostgreSQL persistence
2. **Chrome Extension**: TypeScript/React Manifest V3 extension with content script automation
3. **Real-Time Updates**: WebSocket-based live data synchronization
4. **Payment Integration**: Stripe subscription management
5. **Security**: JWT-based authentication with token rotation and Argon2 password hashing

The system follows a client-server architecture where the extension acts as a thin client, delegating all business logic, data persistence, and payment processing to the backend API.

### ✅ Implementation Status

**Fully Implemented and Active:**

- ✅ **Docker Containerization**: Backend and PostgreSQL run in Docker containers via docker-compose
- ✅ **Database Schema**: 17 tables and 5 enums defined in `models.py` (449 lines), managed via 5 Alembic migrations
- ✅ **API Endpoints**: 15 registered routers with 76 HTTP endpoints + 2 inline app routes + 1 WebSocket endpoint (78 HTTP + 1 WS total)
- ✅ **Rate Limiting**: `slowapi` middleware; password-reset endpoint is rate-limited per IP (1/min, 5/hr, 20/hr on outer key)
- ✅ **WebSocket Real-Time**: Live updates for queue, history, dashboard, and notifications
- ✅ **JWT Authentication**: Access/refresh token system with secure rotation
- ✅ **Password Reset**: Complete flow (request, token validation, reset, change password) via SendGrid
- ✅ **Email Verification**: Verification token flow for new users (`/request-email-verification`, `/verify-email`)
- ✅ **User Sessions**: Session list and revoke (`/sessions`, `DELETE /sessions/{id}`)
- ✅ **User Profile & Account**: `PUT /auth/profile` (name, timezone in metadata), `DELETE /auth/account`
- ✅ **Birthday Scheduling**: Days before/after configuration with enable/disable
- ✅ **Message Queue**: Full CRUD with view, edit, cancel, and retry capabilities
- ✅ **Message History**: Searchable log with filtering by name, status, and date
- ✅ **Dashboard Analytics**: Real-time statistics and metrics
- ✅ **Stripe Subscription**: Full lifecycle with webhook integration
- ✅ **Template Segments**: CRUD for greeting/body/closing with soft-delete
- ✅ **Contact Management**: Full CRUD + bulk import (`/api/contacts`)
- ✅ **Message Groups**: Named segment sets with gender targeting (`/api/message-groups`)
- ✅ **Message Templates**: Complete templates (greeting + sentiment + closing) (`/api/message-templates`)
- ✅ **Posts**: Timeline post templates with font customisation (`/api/posts`)
- ✅ **User Images**: URL/base64 image library (`/api/images`)
- ✅ **Birthday Configs**: Advanced automation (EARLY/ON_DAY/BELATED modes, gender filter, archive) (`/api/birthday-configs`)
- ✅ **SMTP Configuration**: Per-user SMTP settings with Fernet encryption at rest (`/smtp/config`)
- ✅ **Frontend UI**: 38 React component files (26 imported in App.tsx, 840 lines; logic extracted to 7 hook files + `AppContext.tsx`)
- ✅ **Accessibility**: WCAG 2.1 Level AA — keyboard shortcuts, screen reader support, focus management, live regions
- ✅ **Content Scripts**: Full Facebook automation pipeline — birthday feed scraping, gender-aware DM sending, timeline posting, conversation archiving, contact sync, advance/follow-up modes, per-day deduplication (5 files, ~1,893 lines)
- ✅ **Extension Testing**: 294 tests across 15 files (Vitest + Testing Library) covering utilities, API client, and 10 component suites
- ✅ **Automation Orchestration**: `handleAutomationScan` fetches templates/posts/contacts, groups by `days_in_advance`, opens `/birthdays` tab, dispatches `automation.runFull` payload to content script
- ⏳ **Build Status**: Extension source complete; `dist/` gitignored (build with `npm run build`)

**⚠️ Known Gaps (non-blocking for development):**

| Gap | Detail |
|-----|--------|
| Email service | ✅ SendGrid fully configured (Mar 14, 2026); `EMAIL_FROM_ADDRESS`, `PASSWORD_RESET_URL_BASE`, and `SENDGRID_API_KEY` all in `config.py` Settings |
| SMTP password encryption | ✅ Encrypted at rest via Fernet symmetric encryption (`encryption.py`); API responses mask passwords (`"••••••••"`) |
| `POST /send-birthday-message` | Backend stub returns `{"status":"sent"}`; actual sending is handled by the content script automation pipeline |
| Test coverage | Backend: **230 tests across 25 files** (all routers covered + core utilities); extension: **294 tests across 15 files**; no E2E tests; 6 pre-existing test failures |
| CI/CD and monitoring | Frontend CI exists (.gitea/workflows/frontend-ci.yaml); no backend CI/CD; no monitoring |

**System Status:**
- ✅ Development-ready with Docker Compose
- ✅ SendGrid email service fully configured for password reset and email verification (Mar 14, 2026) — all config fields in `config.py` Settings
- ✅ Security headers middleware active (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cache-Control)
- ✅ Input sanitization on all text schemas (6 files)
- ✅ SMTP passwords encrypted at rest via Fernet symmetric encryption
- ✅ Email verification and user sessions management implemented
- ✅ Comprehensive security hardening (2 passes — Mar 14 + Mar 26, 2026)
- ⏳ Production deployment pending infrastructure setup

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Backend Architecture](#2-backend-architecture)
3. [Chrome Extension Architecture](#3-chrome-extension-architecture)
4. [Data Flow & Interactions](#4-data-flow--interactions)
5. [Deployment & Operations](#5-deployment--operations)
6. [Security Architecture](#6-security-architecture)
7. [Accessibility](#7-accessibility)
8. [Real-Time WebSocket Architecture](#8-real-time-websocket-architecture)
9. [Testing Strategy](#9-testing-strategy)
10. [Production Gaps & Future Work](#10-production-gaps--future-work)
11. [Dependencies & Bill of Materials](#11-dependencies--bill-of-materials)
12. [API Contract Compliance](#12-api-contract-compliance)
13. [Legacy vs bm-ts Comparison](#13-legacy-vs-bm-ts-comparison)
14. [Conclusion](#14-conclusion)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Chrome Extension (Frontend)                   │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐         │
│  │   Popup UI   │  │  Background   │  │    Content     │         │
│  │   (React)    │◄─┤   Service     │  │    Scripts     │         │
│  │  38 comps    │  │   Worker      │  │  (Facebook)    │         │
│  └──────┬───────┘  └───────┬───────┘  └────────────────┘         │
│         │ WebSocket        │ API Calls                           │
└─────────┼──────────────────┼─────────────────────────────────────┘
          │                  │
          ▼ WSS              ▼ HTTPS
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python)                      │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐       │
│  │   Auth   │  │ Templates │  │Subscription│  │ Schedules│       │
│  │  Router  │  │  Router   │  │   Router   │  │  Router  │       │
│  └──────────┘  └───────────┘  └────────────┘  └──────────┘       │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐       │
│  │ Messages │  │ Dashboard │  │  Webhook   │  │WebSocket │       │
│  │  Router  │  │  Router   │  │   Router   │  │  Router  │       │
│  └──────────┘  └───────────┘  └────────────┘  └──────────┘       │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐       │
│  │ Contacts │  │  Posts &  │  │  Birthday  │  │  SMTP &  │       │
│  │  Router  │  │  Images   │  │  Configs   │  │  MsgTmpl │       │
│  └──────────┘  └───────────┘  └────────────┘  └──────────┘       │
│                      │                                           │
│           ┌──────────┴───────────┐                               │
│           │   Service Layer      │                               │
│           └──────────┬───────────┘                               │
│                      ▼                                           │
│           ┌──────────────────────┐                               │
│           │  SQLAlchemy 2.0 ORM  │                               │
│           │      (async)         │                               │
│           └──────────┬───────────┘                               │
└──────────────────────┼───────────────────────────────────────────┘
                       ▼
             ┌──────────────────────┐
             │   PostgreSQL 15+     │
             │  (pgcrypto, citext)  │
             └──────────────────────┘
                       ▲
                       │
             ┌──────────────────────┐
             │   Stripe Webhooks    │
             │ (Subscription Sync)  │
             └──────────────────────┘
```

### 1.2 Technology Stack
`popup.css`
#### Backend
- **Language**: Python 3.11+
- **Framework**: FastAPI 0.110+
- **ORM**: SQLAlchemy 2.0 (async)
- **Database**: PostgreSQL 15+ with asyncpg driver
- **Authentication**: JWT (python-jose), **Argon2** password hashing (passlib)
- **Payment**: Stripe SDK 5.0+
- **Server**: Uvicorn with standard extensions
- **Containerization**: Docker with docker-compose

#### Frontend (Chrome Extension)
- **Language**: TypeScript 5.5+
- **UI Framework**: React 18.2
- **Build Tool**: Vite 7.3
- **Styling**: Tailwind CSS 4.1, PostCSS with LightningCSS
- **Real-Time**: Custom WebSocket client with auto-reconnect
- **Manifest**: Chrome Extension Manifest V3
- **Package Manager**: npm

#### Infrastructure
- **Development**: Local Docker Compose (PostgreSQL + backend)
- **Database Initialization**: Alembic migrations applied on container startup
- **API Documentation**: Markdown contracts + Swagger UI at `/docs`

---

## 2. Backend Architecture

### 2.1 Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app (15 routers registered + 2 inline routes, 114 lines)
│   ├── api/
│   │   ├── deps.py                # get_current_user dependency (125 lines — Bearer token, JWT decode, token type, session validation, email_verified, account lockout)
│   │   └── routers/
│   │       ├── auth.py            # Authentication + password reset + email verification + sessions + profile/account + data export (641 lines, 15 endpoints) ✅
│   │       ├── templates.py       # Template segment CRUD ✅
│   │       ├── subscription.py    # Subscription management ✅
│   │       ├── webhook.py         # Stripe webhook handler ✅
│   │       ├── schedules.py       # Birthday schedule management ✅
│   │       ├── messages.py        # Message queue & history ✅
│   │       ├── dashboard.py       # Dashboard analytics ✅
│   │       ├── websocket.py       # WebSocket real-time updates ✅
│   │       ├── contacts.py        # Contact CRUD + bulk import ✅
│   │       ├── message_groups.py  # Message group management ✅
│   │       ├── message_templates.py # Complete message templates ✅
│   │       ├── posts.py           # Timeline post templates ✅
│   │       ├── images.py          # User image library ✅
│   │       ├── birthday_configs.py # Birthday automation configs ✅
│   │       └── smtp.py            # SMTP configuration ✅
│   ├── core/
│   │   ├── config.py              # Pydantic Settings (env-based; incl. sendgrid_api_key, email_from_address, password_reset_url_base, email_verification_url_base) (103 lines)
│   │   ├── jwt.py                 # JWT token creation/decoding (access + refresh, iss/aud claims) (68 lines)
│   │   ├── security.py            # Argon2 password hashing (passlib CryptContext) (17 lines)
│   │   ├── app_logging.py         # Basic logging setup (7 lines)
│   │   ├── audit_log.py           # AuditLogMiddleware for sensitive operations (56 lines)
│   │   ├── rate_limiter.py        # slowapi rate limiter; per-IP key function (27 lines)
│   │   ├── request_logging.py     # RequestLoggingMiddleware (method, path, status, duration, IP) (31 lines)
│   │   ├── security_headers.py    # SecurityHeadersMiddleware (HSTS, X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cache-Control) (28 lines)
│   │   ├── encryption.py          # Fernet symmetric encryption for SMTP passwords (7 lines)
│   │   └── validators.py          # Reusable input sanitization (sanitize_text: strip, null-byte rejection, 10K max) (20 lines)
│   ├── db/
│   │   ├── base.py                # SQLAlchemy declarative_base()
│   │   ├── models.py              # 17 ORM models (449 lines)
│   │   └── session.py             # AsyncSession factory, get_db() dependency
│   ├── schemas/
│   │   ├── auth.py                # RegisterRequest, LoginRequest, TokenResponse, UserProfile
│   │   ├── template.py            # TemplateSegmentCreate/Update/Out, SegmentTypeEnum
│   │   ├── subscription.py        # Subscription status/checkout schemas
│   │   ├── password_reset.py      # Password reset/change request schemas
│   │   ├── schedules.py           # Birthday schedule schemas
│   │   ├── messages.py            # Message queue/history schemas
│   │   ├── dashboard.py           # DashboardStats schema
│   │   ├── contact.py             # Contact CRUD schemas
│   │   ├── birthday_config.py     # BirthdayConfig schemas (BirthdayModeEnum: EARLY/ON_DAY/BELATED)
│   │   ├── post.py                # Post schemas with font fields
│   │   ├── message_group.py       # MessageGroup schemas
│   │   ├── user_image.py          # UserImage schemas
│   │   ├── smtp.py                # SMTPConfig schemas + UserProfileUpdate
│   │   └── message_template.py    # Complete message template schemas
│   ├── services/
│   │   ├── password_reset.py      # Token creation/verification, SendGrid email sending (134 lines)
│   │   ├── email_verification.py  # Email verification token lifecycle, SendGrid email (117 lines)
│   │   ├── stripe.py              # Stripe checkout, webhook handling (201 lines)
│   │   └── templates.py           # Message composition from segments (24 lines)
│   └── tests/                     # Pytest test suite (25 files, 230 tests)
│       ├── conftest.py            # Async fixtures, model event listeners for SQLite compat (185 lines)
│       ├── test_api_contracts.py  # Status codes, schemas, validation (14 tests)
│       ├── test_audit_log.py      # AuditLogMiddleware behavior (7 tests)
│       ├── test_auth.py           # JWT, sessions, revocation (11 tests)
│       ├── test_birthday_configs.py # CRUD, gender filter, constraints (13 tests)
│       ├── test_contacts.py       # CRUD, bulk import (10 tests)
│       ├── test_dashboard.py      # Stats endpoint (5 tests)
│       ├── test_db_constraints.py # FK cascades, unique constraints, enums (6 tests)
│       ├── test_email_verification.py # Token lifecycle, verify endpoint (9 tests)
│       ├── test_encryption.py     # Fernet encryption round-trip, key sensitivity (6 tests)
│       ├── test_images.py         # Upload, size validation (9 tests)
│       ├── test_integration.py    # Full auth + CRUD flows (4 tests)
│       ├── test_message_groups.py # CRUD, segment_ids (11 tests)
│       ├── test_message_templates.py # CRUD, gender filter (11 tests)
│       ├── test_messages.py       # Queue + history CRUD, pagination (17 tests)
│       ├── test_password_reset.py # Token lifecycle (7 tests)
│       ├── test_posts.py          # CRUD with font fields (11 tests)
│       ├── test_rate_limiter.py   # Key resolution, middleware attachment (5 tests)
│       ├── test_schedules.py      # CRUD (9 tests)
│       ├── test_security_headers.py # HSTS, CSP, Referrer-Policy, Permissions-Policy (8 tests)
│       ├── test_smtp.py           # Get/update, password masking (6 tests)
│       ├── test_stripe_service.py # Stripe helpers, cancel/reactivate/plan-change (16 tests)
│       ├── test_subscription.py   # Status, cancel, reactivate, change-plan (13 tests)
│       ├── test_templates.py      # Segment validation, composition (2 tests)
│       ├── test_validators.py     # Text sanitization, null-bytes, length limits (10 tests)
│       └── test_webhook.py        # Signature, events (10 tests)
├── alembic.ini                    # Present but not actively used
├── docker-compose.yml             # PostgreSQL + backend services
├── Dockerfile                     # Backend container definition
├── deploy.sh                      # Production deployment script
├── pyproject.toml                 # Python dependencies (includes slowapi, alembic)
└── README.md
```

### 2.2 Database Schema

**DDL Status:** ✅ Complete — 17 tables and 5 enums defined in `models.py` (449 lines). Schema applied via 5 Alembic migrations on container startup (`alembic upgrade head`).

#### Tables

**users**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `email` | CITEXT, UNIQUE | Case-insensitive |
| `password_hash` | TEXT | Argon2 hash |
| `stripe_customer_id` | TEXT | Stripe reference |
| `created_at`, `updated_at`, `last_login_at` | TIMESTAMPTZ | |
| `metadata` | JSONB | Extensible metadata |

**subscription_records**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `status` | subscription_status_enum | ACTIVE, TRIALING, PAST_DUE, CANCELED, etc. |
| `stripe_subscription_id`, `stripe_customer_id` | TEXT | |
| `price_id` | TEXT | Maps to monthly/yearly |
| `current_period_start/end` | TIMESTAMPTZ | |
| `cancel_at_period_end` | BOOLEAN | |
| `trial_end` | TIMESTAMPTZ | |
| Constraint | UNIQUE (user_id) WHERE status='ACTIVE' | One active sub per user |

**template_segments**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `segment_type` | segment_type_enum | GREETING, BODY, CLOSING |
| `label` | TEXT, nullable | User-friendly label |
| `content` | TEXT, NOT NULL | Min 1 char, trimmed |
| `deleted_at` | TIMESTAMPTZ | Soft-delete |

**birthday_schedules**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `days_before` | INTEGER | +N = before, 0 = on day, -N = after |
| `enabled` | BOOLEAN | |
| Constraint | UNIQUE(user_id, days_before) | |

**message_queue**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `friend_name`, `friend_profile_url` | TEXT | |
| `birthday_date`, `scheduled_send_time` | TIMESTAMPTZ | |
| `message_content` | TEXT | |
| `status` | message_status_enum | pending → processing → sent/delivered/failed |
| `error_message` | TEXT, nullable | |

**message_history**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `friend_name`, `friend_profile_url`, `birthday_date` | TEXT/TIMESTAMPTZ | |
| `message_content`, `sent_at` | TEXT/TIMESTAMPTZ | |
| `status` | message_status_enum | |
| `error_message` | TEXT, nullable | |

**password_reset_tokens**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `token` | VARCHAR(255), UNIQUE | Secure random |
| `expires_at` | TIMESTAMPTZ | 1-hour expiration |
| `used_at` | TIMESTAMPTZ, nullable | |

**email_verification_tokens** *(added Mar 18, 2026 via Alembic migration `c3d4e5f6g7h8`)*
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `token` | VARCHAR(255), UNIQUE | SHA-256 hashed |
| `expires_at` | TIMESTAMPTZ | |
| `used_at` | TIMESTAMPTZ, nullable | |

**user_sessions** *(added Mar 19, 2026 via Alembic migration `d4e5f6g7h8i9`)*
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `refresh_token_jti` | TEXT | Tracks refresh token JTI |
| `ip_address` | TEXT, nullable | Client IP at login |
| `user_agent` | TEXT, nullable | Browser/OS |
| `created_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | |
| `revoked_at` | TIMESTAMPTZ, nullable | Soft revoke |

#### Enums
- `segment_type_enum`: GREETING, BODY, CLOSING
- `subscription_status_enum`: ACTIVE, TRIALING, PAST_DUE, CANCELED, UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED
- `message_status_enum`: pending, processing, sent, delivered, failed
- `gender_enum`: MALE, FEMALE, NEUTRAL, ALL
- `birthday_mode_enum`: EARLY, ON_DAY, BELATED

#### Phase 2 Tables

**contacts**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `name` | TEXT | |
| `facebook_profile_url` | TEXT | |
| `birthday` | TIMESTAMPTZ | |
| `gender` | gender_enum, nullable | |
| `notes` | TEXT, nullable | |

**message_groups**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `name` | TEXT | |
| `gender` | gender_enum | MALE, FEMALE, NEUTRAL, ALL |
| `segment_ids` | JSONB | Array of template segment UUIDs |

**posts**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `content` | TEXT | |
| `image_url` | TEXT, nullable | |
| `gender` | gender_enum | |
| `is_default` | BOOLEAN | |
| `label` | TEXT, nullable | |
| `font_family` | TEXT | default 'Arial' |
| `font_size` | INTEGER | default 48 |
| `font_color` | TEXT | default '#ffffff' |

**user_images**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `url` | TEXT | URL or base64 data URI |
| `filename` | TEXT | |
| `size` | INTEGER | bytes |

**birthday_configs**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `mode` | birthday_mode_enum | EARLY, ON_DAY, BELATED |
| `days_offset` | INTEGER | Negative=early, 0=on day, positive=belated |
| `message_group_id` | UUID FK → message_groups | nullable, CASCADE |
| `post_id` | UUID FK → posts | nullable, SET NULL |
| `gender_filter` | gender_enum | |
| `archive_enabled` | BOOLEAN | |
| `enabled` | BOOLEAN | |
| Constraint | UNIQUE(user_id, mode, days_offset) | |

**smtp_configs**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users, UNIQUE | One per user |
| `host`, `username`, `password` | TEXT | ⚠️ password stored in plaintext |
| `port` | INTEGER | |
| `use_tls` | BOOLEAN | |
| `from_email`, `from_name` | TEXT | |

**message_templates**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `title` | TEXT | |
| `greeting` | TEXT | Opening text |
| `sentiment` | TEXT | Main body |
| `closing` | TEXT | Closing text |
| `image_url` | TEXT, nullable | |
| `days_in_advance` | INTEGER | default 0 |
| `gender` | gender_enum | default ALL |

#### Extensions
- `pgcrypto`: UUID generation
- `citext`: Case-insensitive email

### 2.3 API Endpoints

**15 routers registered in `main.py`** plus a `/health` GET and a stub `POST /send-birthday-message` (2 inline app routes):

| Router | Prefix | Description |
|--------|--------|-------------|
| `auth` | `/auth` | Authentication, password reset, email verification, sessions, profile, account, data export (17 endpoints; 2 are HTML pages excluded from OpenAPI schema) |
| `smtp` | `/smtp` | SMTP configuration (2 endpoints) |
| `templates` | `/templates` | Template segment CRUD + preview (5 endpoints) |
| `subscription` | `/subscription` | Subscription management, cancel, reactivate, change plan, billing portal (6 endpoints) |
| `webhook` | `/stripe` | Stripe webhooks (1 endpoint) |
| `schedules` | `/api` | Birthday schedules (4 endpoints) |
| `messages` | `/api` | Message queue + history + CSV export (8 endpoints) |
| `dashboard` | `/api` | Dashboard analytics (1 endpoint) |
| `websocket` | *(none)* | WebSocket at `/ws` (1 endpoint) |
| `contacts` | `/api` | Contact CRUD + bulk import (6 endpoints) |
| `message_groups` | `/api` | Message group CRUD (5 endpoints) |
| `message_templates` | `/api` | Complete template CRUD (5 endpoints) |
| `posts` | `/api` | Post template CRUD (5 endpoints) |
| `images` | `/api` | User image library (5 endpoints) |
| `birthday_configs` | `/api` | Birthday automation configs (6 endpoints) |

**Total: 78 HTTP endpoints (76 router + 2 inline app routes) + 1 WebSocket endpoint**

#### Authentication (`/auth`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/register` | POST | No | Create user, return tokens |
| `/auth/login` | POST | No | Validate credentials, return tokens |
| `/auth/refresh` | POST | No | Rotate both tokens |
| `/auth/revoke` | POST | Bearer | Revoke current refresh token |
| `/auth/sessions` | GET | Bearer | List active user sessions |
| `/auth/sessions/{id}` | DELETE | Bearer | Revoke a specific session |
| `/auth/me` | GET | Bearer | Get current user profile |
| `/auth/request-password-reset` | POST | No | Request reset email (rate-limited) |
| `/auth/request-email-verification` | POST | Bearer | Request email verification link |
| `/auth/verify-email` | POST | No | Verify email with token |
| `/auth/reset-password` | POST | No | Reset password with token |
| `/auth/change-password` | POST | Bearer | Change password (authenticated) |
| `/auth/profile` | PUT | Bearer | Update name/timezone (stored in metadata) |
| `/auth/account` | DELETE | Bearer | Permanently delete account and all data |
| `/auth/data-export` | GET | Bearer | Export all user data as JSON |

#### SMTP (`/smtp`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/smtp/config` | GET | Bearer | Retrieve SMTP configuration |
| `/smtp/config` | PUT | Bearer | Create or update SMTP configuration |

#### Templates (`/templates`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/templates/` | POST | Bearer | Create template segment |
| `/templates/` | GET | Bearer | List templates (optional type filter) |
| `/templates/{id}` | PUT | Bearer | Update template |
| `/templates/{id}` | DELETE | Bearer | Soft-delete template |
| `/templates/preview` | POST | Bearer | Compose sample message from segments |

#### Subscription (`/subscription`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/subscription/status` | GET | Bearer | Get subscription status |
| `/subscription/create-checkout-session` | POST | Bearer | Create Stripe checkout |
| `/subscription/cancel` | POST | Bearer | Cancel subscription at period end |
| `/subscription/reactivate` | POST | Bearer | Reactivate canceled subscription |
| `/subscription/change-plan` | POST | Bearer | Switch between monthly/yearly |
| `/subscription/billing-portal` | POST | Bearer | Get Stripe billing portal URL |

#### Webhook (`/stripe`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/stripe/webhook` | POST | Stripe Signature | Handle subscription events |

#### Schedules (`/api/schedules`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/schedules` | GET | Bearer | List schedules |
| `/api/schedules` | POST | Bearer | Create schedule |
| `/api/schedules/{id}` | PUT | Bearer | Update schedule (enabled toggle) |
| `/api/schedules/{id}` | DELETE | Bearer | Delete schedule |

#### Messages (`/api/messages`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/messages/queue` | GET | Bearer | List queued messages |
| `/api/messages/queue` | POST | Bearer | Create queued message |
| `/api/messages/queue/{id}` | PUT | Bearer | Update message content/time |
| `/api/messages/queue/{id}` | DELETE | Bearer | Cancel message |
| `/api/messages/queue/{id}/retry` | POST | Bearer | Retry failed message |
| `/api/messages/history` | GET | Bearer | List history (search/filter) |
| `/api/messages/history/{id}` | DELETE | Bearer | Delete history entry |
| `/api/messages/history/export` | GET | Bearer | Export full history as CSV |

#### Dashboard (`/api/dashboard`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/dashboard/stats` | GET | Bearer | Get analytics |

#### Contacts (`/api/contacts`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/contacts/` | POST | Bearer | Create contact |
| `/api/contacts/bulk` | POST | Bearer | Bulk create contacts |
| `/api/contacts/` | GET | Bearer | List contacts |
| `/api/contacts/{id}` | GET | Bearer | Get single contact |
| `/api/contacts/{id}` | PUT | Bearer | Update contact |
| `/api/contacts/{id}` | DELETE | Bearer | Delete contact |

#### Message Groups (`/api/message-groups`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/message-groups/` | POST | Bearer | Create group |
| `/api/message-groups/` | GET | Bearer | List groups (optional gender filter) |
| `/api/message-groups/{id}` | GET | Bearer | Get group |
| `/api/message-groups/{id}` | PUT | Bearer | Update group |
| `/api/message-groups/{id}` | DELETE | Bearer | Delete group |

#### Posts (`/api/posts`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/posts/` | POST | Bearer | Create post (with optional font fields) |
| `/api/posts/` | GET | Bearer | List posts (optional gender filter) |
| `/api/posts/{id}` | GET | Bearer | Get post |
| `/api/posts/{id}` | PUT | Bearer | Update post |
| `/api/posts/{id}` | DELETE | Bearer | Delete post |

#### Images (`/api/images`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/images/upload` | POST | Bearer | Store image by URL |
| `/api/images/upload-file` | POST | Bearer | Store base64 image (max 10 MB) |
| `/api/images/` | GET | Bearer | List images |
| `/api/images/{id}` | GET | Bearer | Get image |
| `/api/images/{id}` | DELETE | Bearer | Delete image |

#### Birthday Configs (`/api/birthday-configs`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/birthday-configs` | POST | Bearer | Create config |
| `/api/birthday-configs` | GET | Bearer | List configs (optional mode/enabled filter) |
| `/api/birthday-configs/{id}` | GET | Bearer | Get config |
| `/api/birthday-configs/{id}` | PUT | Bearer | Update config |
| `/api/birthday-configs/{id}/toggle` | PATCH | Bearer | Toggle enabled flag |
| `/api/birthday-configs/{id}` | DELETE | Bearer | Delete config |

#### Message Templates (`/api/message-templates`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/message-templates` | POST | Bearer | Create complete template |
| `/api/message-templates` | GET | Bearer | List templates (optional gender filter) |
| `/api/message-templates/{id}` | GET | Bearer | Get template |
| `/api/message-templates/{id}` | PUT | Bearer | Update template |
| `/api/message-templates/{id}` | DELETE | Bearer | Delete template |

#### WebSocket (`/ws`)
| Endpoint | Protocol | Auth | Description |
|----------|----------|------|-------------|
| `/ws` | WebSocket | JWT query param | Real-time event stream |

### 2.4 Configuration

**Environment Variables (.env):**
```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/birthdaymessaging
JWT_SECRET_KEY=<secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
STRIPE_API_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
CORS_ORIGINS=chrome-extension://*,http://localhost:3000
LOG_LEVEL=INFO
```

---

## 3. Chrome Extension Architecture

### 3.1 Project Structure

```
extension/
├── public/
│   ├── manifest.json              # MV3: storage, scripting, activeTab, tabs, alarms
│   └── images/
│       └── Birthday_messaging-logo.png
├── src/
│   ├── api/
│   │   ├── client.ts              # Type-safe HTTP client (882 lines, 58 functions)
│   │   └── websocket.ts           # WebSocket singleton client (207 lines)
│   ├── background/
│   │   └── index.ts               # Service worker (902 lines, 77 message types)
│   ├── content/
│   │   ├── index.ts               # Content script coordinator (960 lines)
│   │   ├── api.ts                 # Content→background bridge (18 lines)
│   │   ├── dom-helpers.ts         # waitForElement, delay (27 lines)
│   │   ├── messenger.ts           # Messenger automation (413 lines)
│   │   └── timeline.ts            # Timeline posting automation (473 lines)
│   ├── popup/
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Main SPA orchestrator (840 lines, 4 tabs, 19 view modes)
│   │   ├── api.ts                 # Popup→background bridge (7 lines)
│   │   ├── popup.css              # Component styles + brand theme (1,131 lines)
│   │   ├── context/
│   │   │   └── AppContext.tsx      # Auth state, toast, tab/view routing context (180 lines)
│   │   ├── hooks/
│   │   │   ├── useContacts.ts      # Contact CRUD + import modal state (188 lines)
│   │   │   ├── useImageLibrary.ts  # Image library state (80 lines)
│   │   │   ├── useMessages.tsx     # Queue/history state (284 lines)
│   │   │   ├── useMessageTemplates.ts # Complete template state (131 lines)
│   │   │   ├── usePostComposer.ts  # Post creation state (87 lines)
│   │   │   ├── useSMTPConfig.ts    # SMTP config state (53 lines)
│   │   │   └── useTemplateSegments.ts # Segment CRUD state (173 lines)
│   │   └── components/            # 38 component files (26 imported in App.tsx)
│   └── utils/
│       ├── accessibility.ts       # A11y utilities (211 lines, 9 functions)
│       ├── automation.ts          # Chrome storage config, alarms scheduling (127 lines)
│       ├── bridge.ts              # chrome.runtime.sendMessage typed wrapper (113 lines)
│       ├── errors.ts              # Error hierarchy (AppError, NetworkError, etc.) (173 lines)
│       ├── failsafe.ts            # Rate limiting, emergency stop, activity log, restriction detection (370 lines)
│       ├── image.ts               # Canvas image composition 1080×1350 (115 lines)
│       ├── logger.ts              # Dev-only console logger with emoji prefixes (28 lines)
│       ├── message.ts             # Message composition, gender-aware selection (82 lines)
│       ├── messages.ts            # BackgroundMessage discriminated union types (165 lines)
│       └── storage.ts             # Chrome storage helpers for tokens/URL (114 lines)
├── popup.html                     # Single-page popup entry
├── package.json
├── tsconfig.json                  # ES2022, react-jsx, strict
├── vite.config.ts                 # Multi-entry: popup, background, content
├── tailwind.config.js
└── postcss.config.js
```

### 3.2 Component Inventory (38 files)

| Component | Purpose | Imported in App.tsx |
|-----------|---------|:-------------------:|
| `AccountManagement.tsx` | Profile update, timezone, logout, delete account | ✅ |
| `AuthForm.tsx` | Login/register with validation | ✅ |
| `AutomationSettings.tsx` | Chrome alarms configuration, max messages, clear sent-today | sub-component |
| `BirthdayCalendar.tsx` | Calendar grid + list view of contacts' birthdays | ✅ |
| `ChangePassword.tsx` | Authenticated password change | ✅ |
| `ContactForm.tsx` | Add/edit contact form with gender selector | ✅ |
| `ContactList.tsx` | Contact management with search | ✅ |
| `Dashboard.tsx` | Statistics, metrics, WebSocket live updates | ✅ |
| `DashboardCharts.tsx` | SVG sparkline charts (volume + success-rate) | sub-component |
| `DashboardStatsCard.tsx` | Gradient stat card with 7 color variants | sub-component |
| `ErrorBoundary.tsx` | React error boundary with reset | ✅ |
| `FacebookPostPreview.tsx` | Canvas-rendered 1080×1350 image+text preview | sub-component |
| `ForgotPassword.tsx` | Password reset request | ✅ |
| `GenderFilter.tsx` | Inline pill or dropdown gender selector | sub-component |
| `HomeControls.tsx` | Master power toggle, feature switches, quick stats | ✅ |
| `ImageLibraryPicker.tsx` | Grid picker for selecting library images | sub-component |
| `ImageManager.tsx` | Image URL/base64 upload, resize, management (forwardRef) | ✅ |
| `ImportContactsModal.tsx` | Bulk import contacts (Facebook scrape, CSV/JSON/VCF) | ✅ |
| `KeywordInserter.tsx` | Template placeholder buttons ({First_Name}, [Image], etc.) | sub-component |
| `MessageGroups.tsx` | Message group CRUD with gender targeting (forwardRef) | ✅ |
| `MessageHistory.tsx` | Searchable sent message log with status badges | ✅ |
| `MessageQueue.tsx` | Pending message management with retry/cancel | ✅ |
| `MessagesHub.tsx` | Messages tab hub — SVG icon grid to sub-views | ✅ |
| `PostEditor.tsx` | Post creation/edit with font customisation, image library | ✅ |
| `PostList.tsx` | Post management with gender filter/group (forwardRef) | ✅ |
| `ScheduleSettings.tsx` | Birthday schedule configuration with UTC clock | sub-component |
| `SchedulingSettings.tsx` | Composite: ScheduleSettings + AutomationSettings | ✅ |
| `SegmentEditor.tsx` | Textarea with char counter + inline KeywordInserter | sub-component |
| `SMTPSettings.tsx` | SMTP server configuration form | ✅ |
| `Spinner.tsx` | Custom GIF loader with 3 sizes + optional message | ✅ |
| `SubscriptionPanel.tsx` | Stripe subscription status and checkout | ✅ |
| `TemplateCreator.tsx` | Create/update complete message templates | ✅ |
| `TemplateGallery.tsx` | Card grid of saved templates with badges, edit/delete | sub-component |
| `Toast.tsx` | Fixed-position notification with 4 types, auto-dismiss | ✅ |

**26 components** are directly imported in `App.tsx`; the remaining 12 are used as sub-components within others.

### 3.3 Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "BirthdayMessaging",
  "version": "0.1.0",
  "description": "Helps you remember and send personalized birthday wishes to your Facebook friends.",
  "homepage_url": "https://birthdaymessaging.app/privacy",
  "permissions": ["storage", "scripting", "activeTab", "tabs"],
  "optional_permissions": ["alarms"],
  "action": { "default_popup": "popup.html", "default_title": "BirthdayMessaging" },
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{
    "matches": [
      "https://www.facebook.com/birthdays*",
      "https://www.facebook.com/messages/*",
      "https://www.facebook.com/profile.php*"
    ],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "host_permissions": [
    "https://www.facebook.com/birthdays*",
    "https://www.facebook.com/messages/*",
    "https://www.facebook.com/profile.php*",
    "http://localhost/*",
    "https://localhost/*"
  ],
  "web_accessible_resources": [{
    "resources": ["assets/*"],
    "matches": ["https://www.facebook.com/*"]
  }],
  "icons": { "128": "images/Birthday_messaging-logo.png" }
}
```

### 3.4 App.tsx View Management

**22 ViewMode states:**
`main`, `change-password`, `schedules`, `scheduling`, `automation`, `message-templates`, `queue`, `history`, `analytics`, `posts`, `postLibrary`, `post-list`, `groups`, `images`, `contacts`, `add-contact`, `edit-contact`, `import-contacts`, `birthday-calendar`, `smtp-settings`, `account-management`, `subscription`

**4-Tab Navigation with Dropdowns:**
- **Home**: Dashboard quick-stats (contacts count, upcoming birthdays, analytics shortcut)
- **Contacts** (2 dropdown items): Manage Contacts, Birthday Calendar
- **Messages** (5 dropdown items): Message Templates, Timeline Posts, Scheduling, Analytics, Image Library
- **Account** (4 dropdown items): Profile, Change Password, SMTP Settings, Subscription, Sign Out

### 3.5 Background Service Worker (902 lines)

**77 message types** handled via switch/case dispatch:

| Category | Message Types |
|----------|--------------|
| Auth (11) | `auth.register`, `auth.login`, `auth.refresh`, `auth.logout`, `auth.requestPasswordReset`, `auth.requestEmailVerification`, `auth.resetPassword`, `auth.changePassword`, `auth.me`, `auth.updateProfile`, `auth.deleteAccount` |
| Templates (4) | `templates.list`, `templates.create`, `templates.update`, `templates.delete` |
| Subscription (6) | `subscription.status`, `subscription.checkout`, `subscription.cancel`, `subscription.reactivate`, `subscription.changePlan`, `subscription.billingPortal` |
| Config (3) | `config.getBackendUrl`, `config.setBackendUrl`, `config.getWSConfig` |
| Schedules (4) | `schedules.list`, `schedules.create`, `schedules.update`, `schedules.delete` |
| Automation (7) | `automation.getConfig`, `automation.setEnabled`, `automation.setInterval`, `automation.setMaxMessages`, `automation.clearSentToday`, `automation.recordSent`, `automation.scanFacebook` |
| Messages (6) | `messages.listQueue`, `messages.updateQueued`, `messages.cancelQueued`, `messages.retryQueued`, `messages.listHistory`, `messages.deleteHistory` |
| Dashboard (3) | `dashboard.getStats`, `dashboard.getConfigs`, `dashboard.toggleConfig` |
| Contacts (6) | `contacts.list`, `contacts.create`, `contacts.update`, `contacts.delete`, `contacts.bulkCreate`, `contacts.scrapeFromFacebook` |
| Message Groups (4) | `messageGroups.list`, `messageGroups.create`, `messageGroups.update`, `messageGroups.delete` |
| Posts (4) | `posts.list`, `posts.create`, `posts.update`, `posts.delete` |
| Images (4) | `images.list`, `images.create`, `images.uploadFile`, `images.delete` |
| SMTP (2) | `smtp.getConfig`, `smtp.updateConfig` |
| Message Templates (5) | `messageTemplates.list`, `messageTemplates.create`, `messageTemplates.get`, `messageTemplates.update`, `messageTemplates.delete` |
| Failsafe (8) | `failsafe.getEmergencyStop`, `failsafe.triggerEmergencyStop`, `failsafe.clearEmergencyStop`, `failsafe.getActivityLog`, `failsafe.clearActivityLog`, `failsafe.getRateLimits`, `failsafe.getConfirmationMode`, `failsafe.setConfirmationMode` |

**Token Management:**
- Stores access/refresh tokens in `chrome.storage.local`
- Auto-refresh on 401 errors (transparent to callers)
- `config.getWSConfig` converts HTTP URL to WebSocket URL for popup connection

### 3.6 API Client (882 lines)

**58 exported functions:**

| Category | Functions |
|----------|-----------|
| Auth (11) | `register`, `login`, `refreshToken`, `me`, `requestPasswordReset`, `requestEmailVerification`, `resetPassword`, `changePassword`, `updateUserProfile`, `deleteUserAccount` |
| Templates (4) | `listTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate` |
| Subscription (6) | `subscriptionStatus`, `createCheckoutSession`, `cancelSubscription`, `reactivateSubscription`, `changeSubscriptionPlan`, `getBillingPortal` |
| Schedules (4) | `listSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule` |
| Messages (7) | `listQueuedMessages`, `updateQueuedMessage`, `cancelQueuedMessage`, `retryQueuedMessage`, `listMessageHistory`, `deleteMessageHistory`, `exportHistoryCsv` |
| Dashboard (1) | `getDashboardStats` |
| Contacts (5) | `listContacts`, `createContact`, `updateContact`, `deleteContact`, `bulkCreateContacts` |
| Message Groups (4) | `listMessageGroups`, `createMessageGroup`, `updateMessageGroup`, `deleteMessageGroup` |
| Posts (4) | `listPosts`, `createPost`, `updatePost`, `deletePost` |
| Images (4) | `listImages`, `createImage`, `uploadImageFile`, `deleteImage` |
| SMTP (2) | `getSMTPConfig`, `updateSMTPConfig` |
| Message Templates (5) | `listMessageTemplates`, `createMessageTemplate`, `getMessageTemplate`, `updateMessageTemplate`, `deleteMessageTemplate` |
| Birthday Configs (2) | `listBirthdayConfigs`, `toggleBirthdayConfig` |

Plus `ApiError` class and 20+ exported interfaces/types.

### 3.7 Content Scripts

**index.ts (960 lines)** — Main coordinator + full automation loop:
- Overlay UI on Facebook pages (friend list, send-all button, status p)
- Birthday friend detection via DOM scraping (`div[data-pagelet*="Birthday"]`)
- `runFullAutomation(AutomationRunPayload)` — 2-phase loop:
  - Phase 1: current-day friends from live birthday feed (DM + timeline post + archive + contact sync)
  - Phase 2: advance/follow-up contacts from stored contacts list
- `scrapeBirthdayContactsFromPage()` — rich DOM scraper with date parsing, profile URL normalisation, section-heading context tracking
- `syncContactsFromFriends()` — upserts scraped friends into backend contacts
- `getContactGender()` — gender lookup by profile URL then by name
- `showAutomationOverlay()` / `hideAutomationOverlay()` — full-screen dimmer shown during each send
- Max messages cap, per-day deduplication guard (sentToday array)
- Responds to messages: `automation.scan`, `automation.runFull`, `contacts.scrapeFromPage`

**messenger.ts (413 lines)** — Messenger automation:
- Archive/unarchive conversations
- MutationObserver for reply monitoring
- Programmatic message sending

**timeline.ts (473 lines)** — Timeline posting:
- Facebook composer interaction
- Nifty Images merge tag support
- Clipboard image paste
- Batch posting with delays

### 3.8 Communication Flow

```
┌──────────────┐
│  Popup UI    │◄──── WebSocket events (real-time updates)
└──────┬───────┘
       │ chrome.runtime.sendMessage()
       ▼
┌────────────────────────┐
│ Background Service     │◄────┐
│      Worker            │     │ chrome.runtime.sendMessage()
└──────┬─────────────────┘     │
       │ fetch()               │
       ▼                       │
┌─────────────────┐     ┌─────┴──────────┐
│  Backend API    │     │ Content Script │
│  (FastAPI)      │     │ (Facebook DOM) │
└─────────────────┘     └────────────────┘
```

### 3.9 Build & Loading

```bash
npm run build       # Outputs to dist/: popup.html, popup.js, background.js, content.js, assets/
```

Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist/`

---

## 4. Data Flow & Interactions

### 4.1 User Registration
```
Popup → Background (auth.register) → POST /auth/register
→ Backend: hash password (Argon2), insert user, generate JWTs
→ Background: store tokens in chrome.storage.local
→ Popup: display authenticated UI, connect WebSocket
```

### 4.2 Template Creation
```
Popup → Background (templates.create) → POST /templates/ (Bearer)
→ Backend: validate JWT, validate content, insert into template_segments
→ Background → Popup: add to local template list
```

### 4.3 Automated Message Send
```
Content Script: scan Facebook DOM for birthday friends
→ Display overlay with friend list
→ User clicks "Send to All"
→ Background: fetch templates via GET /templates/
→ Content Script: for each friend:
   1. Select random GREETING + BODY + CLOSING segments
   2. Compose message with {name} substitution
   3. Click message button, wait for composer
   4. Insert text, click send, random delay 5–15s
→ Backend: POST /api/messages/queue (tracking)
→ WebSocket: broadcast queue/history/dashboard updates
```

### 4.4 Subscription Checkout
```
Popup → Background → POST /subscription/create-checkout-session
→ Backend: create Stripe customer, create Checkout Session
→ Open checkout_url in new tab → user completes payment
→ Stripe fires webhook → POST /stripe/webhook
→ Backend: verify signature, update subscription_records
```

### 4.5 Token Refresh
```
Background: API returns 401 → retrieve refresh token
→ POST /auth/refresh → generate new token pair
→ Save to chrome.storage.local → retry original request
(Transparent to popup/content script callers)
```

---

## 5. Deployment & Operations

### 5.1 Local Development

```powershell
cd bm-ts
.\startup.ps1        # Starts Docker (PostgreSQL + backend), builds extension
.\shutdown.ps1       # Stops all services
```

Backend auto-reloads on Python file saves. Frontend requires `npm run reload` + Chrome extension reload.

### 5.2 Docker Compose Services

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| `db` | `postgres:15` | 5432 | Volume `postgres_data` |
| `backend` | Built from Dockerfile | 8000 | Depends on db, reads `.env`, runs `alembic upgrade head` |

### 5.3 Production Checklist
- [ ] Managed PostgreSQL (RDS, Cloud SQL)
- [ ] Strong `JWT_SECRET_KEY`
- [ ] Live Stripe keys + webhook endpoint
- [ ] HTTPS via reverse proxy
- [ ] Set `CORS_ORIGINS` to published extension ID
- [ ] Configure email service for password reset
- [ ] Set `LOG_LEVEL=WARNING`

---

## 6. Security Architecture

### 6.1 Authentication
- **Password Hashing**: **Argon2** via `passlib[argon2]` (`CryptContext(schemes=["argon2"])`)
- **JWT Tokens**: HS256, access (15 min) + refresh (30 days), both rotated on refresh
- **Token Storage**: `chrome.storage.local` (Chrome-encrypted), background script only
- **Revocation**: `RevokedToken` model with per-token blacklist (tokens stored on logout/revoke); also rotate `JWT_SECRET_KEY` to invalidate all

### 6.2 API Security
- **CORS**: `chrome-extension://*`, `http://localhost:3000`
- **Input Validation**: Pydantic schemas for all requests/responses
- **SQL Injection**: SQLAlchemy parameterized queries
- **Authorization**: All queries filtered by authenticated user's `user_id`
- **Rate Limiting**: `slowapi` middleware is initialized in `main.py`. Auth endpoints carry stacked `@limiter.limit()` decorators: `/register` 5/min; `/login` 5/min + 20/hr; `/request-password-reset` 1/minute, 5/hour, and 20/hour (global); `/auth/refresh` 30/min. The `/send-birthday-message` stub also has a `1/45seconds` per-user limit. Key function uses remote IP address.

### 6.3 Stripe
- Webhook signature verification before processing
- One active subscription per user (database constraint)
- No payment data stored locally (Stripe handles cards)

### 6.4 Extension
- Content scripts in isolated world (no token access)
- Manifest V3 service worker (no persistent background)
- Explicit host permissions (Facebook only)

---

## 7. Accessibility

### 7.1 Compliance Target: WCAG 2.1 Level AA

**Keyboard Navigation:**
- `Alt+H` (home), `Alt+D` (dashboard), `Alt+L` (logout), `Esc` (close)
- Skip-to-main-content link
- Visible focus indicators (orange `#f08500`, 3px outline)
- Logical tab order

**Screen Reader Support:**
- ARIA attributes: `aria-label`, `aria-invalid`, `aria-busy`, `aria-pressed`, `aria-describedby`, `aria-live`
- Live regions for toast notifications and dynamic updates
- `announceToScreenReader()` utility for navigation and status changes

**Semantic HTML:**
- Landmarks: `<header>`, `<main>`, `<nav>`, `<footer>`
- Proper heading hierarchy, form labels, required field indicators

### 7.2 Accessibility Utilities (`utils/accessibility.ts`, 211 lines)

| Function | Purpose |
|----------|---------|
| `announceToScreenReader(message, priority)` | Live region announcements |
| `getFocusableElements(container)` | Query focusable DOM elements |
| `trapFocus(container)` | Modal focus trapping |
| `moveFocusTo(element)` | Focus + scroll into view |
| `generateId(prefix)` | Unique ARIA IDs |
| `prefersReducedMotion()` | Reduced motion detection |
| `handleEscapeKey(callback)` | Escape key handler factory |
| `handleKeyboardNavigation(options)` | Full keyboard nav (arrows, Enter, Space, Home, End) |

> See [ACCESSIBILITY.md](ACCESSIBILITY.md) for complete documentation.

---

## 8. Real-Time WebSocket Architecture

### 8.1 Backend (`app/api/routers/websocket.py`, 153 lines)

- **Endpoint**: `GET /ws?token=<jwt>`
- **ConnectionManager**: Per-user connection list, supports multiple simultaneous connections
- **Auth**: JWT token validated from query parameter
- **Keepalive**: Ping/pong handling

**4 broadcast functions** (called by message/dashboard routers on data changes):
| Function | Trigger |
|----------|---------|
| `broadcast_message_queue_update` | Queue CRUD operations |
| `broadcast_message_history_update` | History changes |
| `broadcast_dashboard_update` | Stats recalculation |
| `broadcast_notification` | General user notifications |

### 8.2 Frontend (`src/api/websocket.ts`, 225 lines)

- **Singleton**: `wsClient` instance
- **Auto-reconnect**: Exponential backoff, max 5 attempts, 3s base delay
- **Keepalive**: Ping every 30 seconds
- **Event subscription**: `wsClient.on('event_type', callback)` returns unsubscribe function

**Event Types:**
| Event | Data |
|-------|------|
| `connected` | Connection established |
| `message_queue_update` | `{ action, message, timestamp }` |
| `message_history_update` | `{ action, message, timestamp }` |
| `dashboard_update` | Full stats object |
| `notification` | `{ message, level }` |

### 8.3 Integration Flow
1. App.tsx authenticates user
2. Background provides WebSocket config via `config.getWSConfig` (converts `http://` → `ws://`, appends `/ws`)
3. App.tsx calls `wsClient.connect(wsUrl, token)`
4. Components subscribe to relevant events for auto-refresh

> See [REALTIME_FEATURES.md](REALTIME_FEATURES.md) for detailed event payloads.

---

## 9. Testing Strategy

### 9.1 Current State

| Layer | Coverage | Files |
|-------|----------|-------|
| Backend auth | ✅ Comprehensive | `test_auth.py` (9 tests) |
| Backend templates | ✅ Basic | `test_templates.py` (2 tests) |
| Backend contacts | ✅ Comprehensive | `test_contacts.py` (10 tests) |
| Backend schedules | ✅ Comprehensive | `test_schedules.py` (9 tests) |
| Backend messages | ✅ Comprehensive | `test_messages.py` (17 tests) |
| Backend dashboard | ✅ Good | `test_dashboard.py` (5 tests) |
| Backend subscription | ✅ Comprehensive | `test_subscription.py` (13 tests) |
| Backend webhook | ✅ Comprehensive | `test_webhook.py` (10 tests) |
| Backend email verification | ✅ Good | `test_email_verification.py` (9 tests) |
| Backend password reset | ✅ Good | `test_password_reset.py` (7 tests) |
| Backend birthday configs | ✅ Comprehensive | `test_birthday_configs.py` (13 tests) |
| Backend message groups | ✅ Comprehensive | `test_message_groups.py` (11 tests) |
| Backend message templates | ✅ Comprehensive | `test_message_templates.py` (11 tests) |
| Backend posts | ✅ Comprehensive | `test_posts.py` (11 tests) |
| Backend images | ✅ Good | `test_images.py` (9 tests) |
| Backend SMTP | ✅ Basic | `test_smtp.py` (6 tests) |
| Backend integration | ✅ Basic | `test_integration.py` (4 tests) |
| Backend API contracts | ✅ Good | `test_api_contracts.py` (14 tests) |
| Backend DB constraints | ✅ Basic | `test_db_constraints.py` (6 tests) |
| Extension utilities | ✅ Good | `message.test.ts`, `errors.test.ts`, `storage.test.ts`, `automation.test.ts` |
| Extension API client | ✅ Basic | `client.test.ts` (7 tests) |
| Extension components | ✅ Good | 10 component test files |
| Extension background worker | ❌ None | No tests |
| Extension hooks | ❌ None | No tests |
| E2E tests | ❌ None | No Playwright/Puppeteer |

**Known test failures:** 6 pre-existing failures (5 auth KeyError:'path' in session handling, 1 subscription billing portal assertion mismatch)

### 9.2 Running Tests

**Backend:**
```bash
cd backend
docker-compose exec backend pytest
docker-compose exec backend pytest --cov=app --cov-report=html
```

**Extension:**
```bash
cd extension
npm test              # Run all 294 tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report (70% thresholds)
```

### 9.3 Manual Testing

- **Popup**: Load extension, test all 19 view modes
- **Content Script**: Navigate to Facebook, verify overlay and automation
- **Background**: Check service worker console (`chrome://extensions` → Inspect)
- **WebSocket**: Verify real-time updates appear in dashboard/queue/history

---

## 10. Production Gaps & Future Work

### 10.1 Known Code Gaps

All features are registered and implemented. The following are gaps within the existing codebase:

| Gap | Location | Impact |
|-----|----------|--------|
| Email delivery config | ~~`app/core/config.py`~~ | ✅ RESOLVED (Mar 14, 2026) — `EMAIL_FROM_ADDRESS`, `PASSWORD_RESET_URL_BASE`, and `SENDGRID_API_KEY` fields added to Settings class; `SMTP_ENCRYPTION_KEY` validator rejects placeholder values |
| ~~SMTP passwords stored in plaintext~~ | ~~`app/db/models.py` SMTPConfig~~ | ✅ RESOLVED — Fernet symmetric encryption via `app/core/encryption.py`; `SMTP_ENCRYPTION_KEY` required in env; API-level masking also in place (GET/PUT return `"••••••••"`) |
| `POST /send-birthday-message` is a stub | `app/main.py` | Backend endpoint non-functional; content script handles sending directly |

### 10.2 Testing Gaps

| Layer | Coverage | Files |
|-------|----------|-------|
| Backend | ✅ Comprehensive | 20 test files, 177 test functions |
| Extension utilities | ✅ Good | 4 test files |
| Extension API client | ✅ Basic | 1 test file (7 tests) |
| Extension components | ✅ Good | 10 test files |
| Extension background worker | ❌ None | No tests |
| Extension hooks | ❌ None | No tests |
| E2E tests | ❌ None | No Playwright/Puppeteer |

**Known test failures:** 6 pre-existing failures (5 backend auth tests fail with `KeyError:'path'` in session handling, 1 subscription test assertion mismatch)

### 10.3 Production Infrastructure Gaps
- No CI/CD pipeline (no Gitea Actions)
- No monitoring or alerting
- No HTTPS configuration or reverse proxy
- No Chrome Web Store listing (New extension to replace existing extension in chrome store as new version- Speak to Alex)
- Production deployment script (`deploy.sh`) present but not verified
- Alembic actively used (5 migrations, 17 tables) — migration workflow not documented

---

## 11. Dependencies & Bill of Materials

### 11.1 Backend (`pyproject.toml`, requires-python ≥3.11)

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | ≥0.110 | Web framework |
| `uvicorn[standard]` | ≥0.22 | ASGI server |
| `sqlalchemy` | ≥2.0 | ORM (async) |
| `asyncpg` | ≥0.28 | PostgreSQL async driver |
| `psycopg[binary]` | ≥3.1 | PostgreSQL sync driver |
| `python-jose[cryptography]` | ≥3.3 | JWT |
| `passlib[argon2]` | ≥1.7 | Argon2 password hashing |
| `pydantic` | ≥2 | Data validation |
| `pydantic-settings` | ≥2 | Settings management |
| `email-validator` | ≥2 | Email validation |
| `stripe` | ≥5.0 | Stripe SDK |
| `python-dotenv` | ≥1.0 | Env loading |
| `slowapi` | ≥0.1.8 | Rate limiting |
| `sendgrid` | ≥6.11 | Email delivery (SendGrid SDK) |
| `alembic` | ≥1.13 | Database migrations (5 migrations, 17 tables) |
| `aiosqlite` | ≥0.20 | SQLite async driver (test DB) |
| `gunicorn` | ≥21.2 | Production WSGI/ASGI process manager |

**Test:** `pytest ≥8`, `pytest-asyncio ≥0.21`, `httpx ≥0.27`, `pytest-cov ≥4`

### 11.2 Extension (`package.json`)

**Runtime (3):** `react ^18.2.0`, `react-dom ^18.2.0`, `react-calendar ^6.0.0`

**Dev (22):** typescript, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/postcss, postcss, autoprefixer, lightningcss, vite-plugin-lightningcss, @types/chrome, @types/react, @types/react-dom, eslint, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, eslint-plugin-react, eslint-plugin-react-hooks, eslint-config-prettier, eslint-plugin-prettier, prettier, vitest, @testing-library/react

### 11.3 Infrastructure
- PostgreSQL 15+ (pgcrypto, citext)
- Docker 20.10+, docker-compose 2.0+

---

## 12. API Contract Compliance

[API_CONTRACT.md](API_CONTRACT.md) documents the frozen interface spec for core endpoints. The full mapping of every HTTP route to its `client.ts` function and background message type is in [BACKEND_INTEGRATION_SUMMARY.md](BACKEND_INTEGRATION_SUMMARY.md). WebSocket events are documented in [REALTIME_FEATURES.md](REALTIME_FEATURES.md).

**Contract compliance verified:**
- ✅ Register/Login return identical `TokenResponse` structure
- ✅ Access token 15 min, refresh 30 days
- ✅ Refresh rotates both tokens
- ✅ Template soft-delete via `deleted_at`
- ✅ Stripe webhook signature verification
- ✅ Error responses: 401 (auth), 404 (not found), 422 (validation), 400 (business logic)

---

## 13. Legacy vs bm-ts Comparison

| Aspect | Legacy (Flask) | bm-ts (FastAPI) |
|--------|---------------|-----------------|
| **Backend** | Flask (sync, WSGI) | FastAPI (async, ASGI) |
| **Auth** | Single hex token in DB | JWT access/refresh with rotation |
| **Password Hashing** | Werkzeug | Argon2 (passlib) |
| **Database** | 4 tables, integer PKs | 17 tables, UUID PKs, soft-delete |
| **Payments** | None | Full Stripe integration + webhooks |
| **Frontend** | 12 HTML pages, minified jQuery (~3.5MB) | 1-page React SPA, 38 components (~210KB) |
| **Types** | None | Full TypeScript + Pydantic |
| **Build** | Committed minified bundles | Vite source build (reproducible) |
| **Real-Time** | None | WebSocket live updates |
| **Accessibility** | ~22% WCAG | WCAG 2.1 AA with utilities |
| **Content Scripts** | Basic Facebook automation | Facebook + Messenger + Timeline + Full automation pipeline (gender-aware DMs, timeline posts, advance/follow-up, deduplication) |
| **Bundle Size** | ~3.5MB | ~210KB (94% smaller) |

---

## 14. Conclusion

### System Statistics

| Metric | Value |
|--------|-------|
| Backend LOC | ~4,860 Python |
| Extension LOC | ~15,097 TypeScript + 1,131 CSS |
| Database | 17 tables, 5 enums, 32 indexes |
| API Endpoints | 78 HTTP + 1 WebSocket (15 routers + 2 inline routes) |
| Component Files | 38 (26 directly in App.tsx) |
| Background Message Types | 77 |
| API Client Functions | 58 |
| Custom Hooks | 7 (996 lines) |
| Content Script Files | 5 (~1,893 lines) |
| Utility Files | 10 (~1,498 lines) |
| Accessibility Utilities | 9 functions (211 lines) |
| Extension Tests | 294 (15 files) |
| Backend Tests | 230 (25 files) |
| Runtime Dependencies | 17 Python + 3 npm |

### Strengths
1. **Type Safety**: TypeScript + Pydantic catches errors at compile time
2. **Async Architecture**: FastAPI + SQLAlchemy async for high concurrency
3. **Security**: JWT rotation, Argon2 hashing, Stripe webhook verification, **SecurityHeadersMiddleware** (8 headers), **SMTP Fernet encryption**, **input sanitization** (6 schema files), **account lockout**, **email verification**
4. **Real-Time**: WebSocket updates for queue/history/dashboard
5. **Accessibility**: WCAG 2.1 AA with keyboard shortcuts, screen reader support
6. **Developer Experience**: Docker Compose, Vite HMR, Swagger UI

### Remaining Work for Production
1. ~~**Fix email delivery config**~~: ✅ RESOLVED (Mar 14, 2026) — `EMAIL_FROM_ADDRESS`, `PASSWORD_RESET_URL_BASE`, and `SENDGRID_API_KEY` added to `config.py` Settings
2. ~~Encrypt SMTP passwords at rest~~ ✅ RESOLVED — Fernet encryption in `app/core/encryption.py`
3. Extension background worker tests, hook tests, and E2E test coverage
4. Deploy to production infrastructure (managed DB, HTTPS, CI/CD, monitoring)
5. Chrome Web Store listing

### Documentation Index
| Document | Purpose |
|----------|---------|
| [SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md](SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md) | This document |
| [API_CONTRACT.md](API_CONTRACT.md) | Frozen API interface spec (core endpoints) |
| [BACKEND_INTEGRATION_SUMMARY.md](BACKEND_INTEGRATION_SUMMARY.md) | Full HTTP→client.ts→background message type mapping; error handling conventions; integration totals |
| [BACKEND_TESTING_GUIDE.md](BACKEND_TESTING_GUIDE.md) | Testing setup |
| [REALTIME_FEATURES.md](REALTIME_FEATURES.md) | WebSocket event documentation |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | Accessibility features |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | Development setup and workflow |
| [MVP_CHECKLIST.md](MVP_CHECKLIST.md) | Production launch task tracking |
| [README.md](README.md) | Quick start guide |
