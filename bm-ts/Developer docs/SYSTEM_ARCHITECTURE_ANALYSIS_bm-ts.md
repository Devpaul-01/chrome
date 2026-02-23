# BirthdayMessaging (bm-ts) System Architecture Analysis


**Generated:** February 1, 2026  
**Last Updated:** February 23, 2026  
**Version:** 0.9.0  
**System Type:** Full-Stack Web Application with Browser Extension


> **Implementation Status:** ✅ **Phase 1, Phase 2 & Facebook Automation Complete** — Backend runs fully containerized in Docker with 17 registered routers, 13 database models, and all 13 tables in DDL. Extension has 35 React component files (23 imported in App.tsx, App.tsx refactored to 698 lines with 8 extracted hook files + AppContext) with real-time WebSocket updates, comprehensive accessibility, and a fully implemented Facebook automation pipeline: gender-aware DM sending, timeline posting, advance/follow-up modes, contact sync, and per-day deduplication. Background service worker handles **64 message types** across 15 categories.

---

## 0.8.0 Evaluation Summary (as of February 21, 2026)

**bm-ts** is a robust, modernized system for automating Facebook birthday messages, with a fully implemented automation pipeline. The project demonstrates:

- **High code quality and maintainability**: TypeScript and Pydantic enforce type safety; async FastAPI and SQLAlchemy 2.0 provide scalable backend performance.
- **Security best practices**: JWT rotation, Argon2 password hashing, and Stripe webhook verification are implemented.
- **Accessibility**: The extension meets WCAG 2.1 AA, with keyboard navigation, screen reader support, and focus management.
- **Real-time features**: WebSocket-based updates for queue, history, and dashboard are fully functional.
- **Developer experience**: Docker Compose, Vite, and comprehensive documentation support rapid onboarding and development.
- **Automation pipeline complete**: The extension can scrape the Facebook birthdays feed, select gender-appropriate DMs from stored templates, post to friend timelines, archive conversations, sync contacts, and avoid duplicate sends — with advance/follow-up modes based on `days_in_advance`.

**Key Gaps and Risks:**

- **Testing coverage is incomplete**: Only basic backend tests exist for auth and templates; Phase 2 features, extension functionality, and E2E tests have no automated coverage.
- **Email service not configured**: Password reset tokens are logged to console only — users cannot recover accounts without a configured email provider.
- **SMTP passwords stored in plaintext**: `smtp_configs.password` is stored unencrypted in the database — must be encrypted before any production deployment.
- **`/send-birthday-message` is a stub**: Backend `POST /send-birthday-message` returns `{"status": "sent"}` without logic. Actual sending is handled client-side by the content script automation pipeline.
- **Production infrastructure absent**: No CI/CD, monitoring, HTTPS configuration, or Chrome Web Store listing.

**Actionable Recommendations:**

1. **Implement email delivery**: Replace the console-log placeholder in `app/services/password_reset.py` with SendGrid, SES, or real SMTP sending.
2. **Encrypt SMTP passwords**: Add encryption at rest for `smtp_configs.password` before first production user.
3. **Increase test coverage**: Add pytest tests for all Phase 2 routers; add Vitest/Jest for extension background handlers; add Playwright E2E.
4. **Productionize deployment**: Managed PostgreSQL, HTTPS reverse proxy, CI/CD, and monitoring.
5. **Prepare Chrome Web Store listing**: Complete manifest metadata, screenshots, and privacy policy.

**Overall Assessment:**

bm-ts is a feature-complete, development-ready system with a fully operational automation pipeline. Both Phase 1 and Phase 2 are fully implemented with all 17 routers registered, all 13 models and tables active, and the full frontend wired to every backend feature. The Facebook automation pipeline is end-to-end: the content script scrapes the birthday feed, selects gender-appropriate templates from the backend, sends DMs and timeline posts, archives conversations, syncs contacts, and enforces per-day deduplication. The architecture is solid — async FastAPI, type-safe TypeScript, WCAG 2.1 AA accessibility, and WebSocket real-time updates. The primary remaining work is production hardening (email, encryption, testing, deployment) rather than feature development.

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
- ✅ **Database Schema**: 13 tables and 5 enums complete in both `models.py` and `ddl.sql`
- ✅ **API Endpoints**: 17 registered routers with ~64 HTTP endpoints + 1 WebSocket endpoint
- ✅ **Rate Limiting**: `slowapi` middleware; password-reset endpoint is rate-limited per IP (1/min, 5/hr, 20/hr on outer key)
- ✅ **WebSocket Real-Time**: Live updates for queue, history, dashboard, and notifications
- ✅ **JWT Authentication**: Access/refresh token system with secure rotation
- ✅ **Password Reset**: Complete flow (request, token validation, reset, change password)
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
- ✅ **SMTP Configuration**: Per-user SMTP settings (`/smtp/config`)
- ✅ **Frontend UI**: 35 React component files (23 directly imported in App.tsx, 698 lines; logic extracted to 8 hook files + `AppContext.tsx`)
- ✅ **Accessibility**: WCAG 2.1 Level AA — keyboard shortcuts, screen reader support, focus management, live regions
- ✅ **Content Scripts**: Full Facebook automation pipeline — birthday feed scraping, gender-aware DM sending, timeline posting, conversation archiving, contact sync, advance/follow-up modes, per-day deduplication
- ✅ **Automation Orchestration**: `handleAutomationScan` fetches templates/posts/contacts, groups by `days_in_advance`, opens `/birthdays` tab, dispatches `automation.runFull` payload to content script
- ⏳ **Build Status**: Extension source complete; `dist/` gitignored (build with `npm run build`)

**⚠️ Known Gaps (non-blocking for development):**

| Gap | Detail |
|-----|--------|
| Email service | Password reset tokens are logged to console only — no email is sent |
| SMTP password encryption | Stored in plaintext in `smtp_configs` — must encrypt before production |
| `POST /send-birthday-message` | Backend stub returns `{"status":"sent"}`; actual sending is handled by the content script automation pipeline |
| Test coverage | Only `test_auth.py` and `test_templates.py` exist; no Phase 2 or extension tests |
| CI/CD and monitoring | Not configured |

**System Status:**
- ✅ Development-ready with Docker Compose
- ⏳ Email service needs configuration (password reset currently logs to console)
- ⏳ SMTP passwords need encryption before production
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
│  │  35 comps    │  │   Worker      │  │  (Facebook)    │         │
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
- **Database Initialization**: DDL auto-applied via Docker init script
- **API Documentation**: Markdown contracts + Swagger UI at `/docs`

---

## 2. Backend Architecture

### 2.1 Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app (17 routers registered)
│   ├── api/
│   │   ├── deps.py                # get_current_user dependency
│   │   └── routers/
│   │       ├── auth.py            # Authentication + password reset + profile/account ✅
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
│   │   ├── config.py              # Pydantic Settings (env-based)
│   │   ├── jwt.py                 # JWT token creation/decoding (access + refresh)
│   │   ├── security.py            # Argon2 password hashing (passlib CryptContext)
│   │   ├── logging.py             # Basic logging setup (setup_logging())
│   │   └── rate_limiter.py        # slowapi rate limiter; per-IP key function
│   ├── db/
│   │   ├── base.py                # SQLAlchemy declarative_base()
│   │   ├── models.py              # 13 ORM models (373 lines)
│   │   ├── session.py             # AsyncSession factory, get_db() dependency
│   │   ├── database.py            # Alternative engine/session module
│   │   ├── connect_db.py          # Standalone DB connection script
│   │   └── db_config.py           # Env-based DB URL construction
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
│   │   ├── password_reset.py      # Token creation/verification, email placeholder (console log)
│   │   ├── stripe.py              # Stripe checkout, webhook handling
│   │   └── templates.py           # Message composition from segments
│   └── tests/                     # Pytest test suite
│       ├── test_auth.py
│       ├── test_templates.py
│       └── async_test_db.py
├── alembic.ini                    # Present but not actively used
├── docker-compose.yml             # PostgreSQL + backend services
├── Dockerfile                     # Backend container definition
├── deploy.sh                      # Production deployment script
├── pyproject.toml                 # Python dependencies (includes slowapi, alembic)
└── README.md
```

### 2.2 Database Schema

**DDL Status:** ✅ Complete — `ddl.sql` defines all 13 tables, 5 enums, and 2 extensions.

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

**17 routers registered in `main.py`** plus a `/health` GET and a stub `POST /send-birthday-message`:

| Router | Prefix | Description |
|--------|--------|-------------|
| `auth` | `/auth` | Authentication, password reset, profile, account deletion (9 endpoints) |
| `smtp` | `/smtp` | SMTP configuration (2 endpoints) |
| `templates` | `/templates` | Template segment CRUD (4 endpoints) |
| `subscription` | `/subscription` | Subscription management (2 endpoints) |
| `webhook` | `/stripe` | Stripe webhooks (1 endpoint) |
| `schedules` | `/api` | Birthday schedules (4 endpoints) |
| `messages` | `/api` | Message queue + history (7 endpoints) |
| `dashboard` | `/api` | Dashboard analytics (1 endpoint) |
| `websocket` | *(none)* | WebSocket at `/ws` (1 endpoint) |
| `contacts` | `/api` | Contact CRUD + bulk import (6 endpoints) |
| `message_groups` | `/api` | Message group CRUD (5 endpoints) |
| `message_templates` | `/api` | Complete template CRUD (5 endpoints) |
| `posts` | `/api` | Post template CRUD (5 endpoints) |
| `images` | `/api` | User image library (5 endpoints) |
| `birthday_configs` | `/api` | Birthday automation configs (6 endpoints) |

**Total: ~64 HTTP endpoints + 1 WebSocket endpoint**

#### Authentication (`/auth`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/register` | POST | No | Create user, return tokens |
| `/auth/login` | POST | No | Validate credentials, return tokens |
| `/auth/refresh` | POST | No | Rotate both tokens |
| `/auth/me` | GET | Bearer | Get current user profile |
| `/auth/request-password-reset` | POST | No | Request reset email (rate-limited) |
| `/auth/reset-password` | POST | No | Reset password with token |
| `/auth/change-password` | POST | Bearer | Change password (authenticated) |
| `/auth/profile` | PUT | Bearer | Update name/timezone (stored in metadata) |
| `/auth/account` | DELETE | Bearer | Permanently delete account and all data |

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

#### Subscription (`/subscription`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/subscription/status` | GET | Bearer | Get subscription status |
| `/subscription/create-checkout-session` | POST | Bearer | Create Stripe checkout |

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
| `/api/images/` | POST | Bearer | Store image by URL |
| `/api/images/upload-file` | POST | Bearer | Store base64 image (max 5 MB) |
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
│   │   ├── client.ts              # Type-safe HTTP client (760 lines, 52 functions)
│   │   └── websocket.ts           # WebSocket singleton client (235 lines)
│   ├── background/
│   │   └── index.ts               # Service worker (750 lines, 64 message types)
│   ├── content/
│   │   ├── index.ts               # Content script coordinator (618 lines)
│   │   ├── api.ts                 # Content→background bridge (7 lines)
│   │   ├── messenger.ts           # Messenger automation (511 lines)
│   │   └── timeline.ts            # Timeline posting automation (575 lines)
│   ├── popup/
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Main SPA orchestrator (698 lines, 4 tabs, 17 view modes)
│   │   ├── api.ts                 # Popup→background bridge (7 lines)
│   │   ├── popup.css              # Component styles + brand theme
│   │   ├── context/
│   │   │   └── AppContext.tsx      # Auth state, toast, tab/view routing context
│   │   ├── hooks/
│   │   │   ├── useApi.ts           # React hook for messaging
│   │   │   ├── useContacts.ts      # Contact CRUD + import modal state
│   │   │   ├── useImageLibrary.ts  # Image library state
│   │   │   ├── useMessages.tsx     # Queue/history state
│   │   │   ├── useMessageTemplates.ts # Complete template state
│   │   │   ├── usePostComposer.ts  # Post creation state
│   │   │   ├── useSMTPConfig.ts    # SMTP config state
│   │   │   └── useTemplateSegments.ts # Segment CRUD state
│   │   └── components/            # 35 component files (23 imported in App.tsx)
│   └── utils/
│       ├── accessibility.ts       # A11y utilities (216 lines, 8 functions)
│       ├── automation.ts          # Chrome storage config, alarms scheduling
│       ├── bridge.ts              # chrome.runtime.sendMessage typed wrapper
│       ├── errors.ts              # Error hierarchy (AppError, NetworkError, etc.)
│       ├── logger.ts              # Dev-only console logger with emoji prefixes
│       ├── message.ts             # Message composition, anti-ban delay (5–15s)
│       ├── messages.ts            # BackgroundMessage discriminated union types
│       └── storage.ts             # Chrome storage helpers for tokens/URL
├── popup.html                     # Single-page popup entry
├── package.json
├── tsconfig.json                  # ES2022, react-jsx, strict
├── vite.config.ts                 # Multi-entry: popup, background, content
├── tailwind.config.js
└── postcss.config.js
```

### 3.2 Component Inventory (35 files)

| Component | Purpose | Imported in App.tsx |
|-----------|---------|:-------------------:|
| `AccountManagement.tsx` | Profile update, timezone, logout, delete account | ✅ |
| `AuthForm.tsx` | Login/register with validation | ✅ |
| `AutomationSettings.tsx` | Chrome alarms configuration | sub-component |
| `BirthdayCalendar.tsx` | Calendar grid + list view of contacts' birthdays | ✅ |
| `ChangePassword.tsx` | Authenticated password change | ✅ |
| `Config.tsx` | Backend URL configuration | sub-component |
| `ContactForm.tsx` | Add/edit contact form | ✅ |
| `ContactList.tsx` | Contact management with search | ✅ |
| `Dashboard.tsx` | Statistics and metrics display | ✅ |
| `DashboardCharts.tsx` | Chart visualisations (used inside Dashboard) | sub-component |
| `DashboardStatsCard.tsx` | Individual stats card (used inside Dashboard) | sub-component |
| `ErrorBoundary.tsx` | React error boundary | ✅ |
| `FacebookPostPreview.tsx` | Live post preview (used inside PostEditor) | sub-component |
| `ForgotPassword.tsx` | Password reset request | ✅ |
| `GenderFilter.tsx` | Gender-based filter UI | sub-component |
| `ImageManager.tsx` | Image URL/base64 upload and management | ✅ |
| `ImportContactsModal.tsx` | Bulk import contacts (JSON/VCF/CSV) | ✅ |
| `KeywordInserter.tsx` | Template placeholder helper `{First_Name}` etc. | sub-component |
| `MessageGroups.tsx` | Message group CRUD | ✅ |
| `MessageHistory.tsx` | Searchable sent message log | ✅ |
| `MessageQueue.tsx` | Pending message management | ✅ |
| `MessageTemplates.tsx` | Complete message template list view | sub-component |
| `PostEditor.tsx` | Post creation/edit with font customisation | ✅ |
| `PostList.tsx` | Post management | ✅ |
| `ScheduleSettings.tsx` | Birthday schedule configuration | sub-component |
| `SchedulingSettings.tsx` | Scheduling settings wrapper | ✅ |
| `SegmentEditor.tsx` | Inline template segment editor | sub-component |
| `SMTPSettings.tsx` | SMTP server configuration form | ✅ |
| `Spinner.tsx` | Loading spinner | ✅ |
| `SubscriptionPanel.tsx` | Stripe subscription status and checkout | ✅ |
| `TabbedDashboard.tsx` | Multi-tab dashboard layout wrapper | sub-component |
| `TemplateCreator.tsx` | Create/update complete message templates | ✅ |
| `TemplateGallery.tsx` | Browse/select saved templates | sub-component |
| `TemplateList.tsx` | CRUD for template segments (GREETING/BODY/CLOSING) | ✅ |
| `Toast.tsx` | Toast notifications | ✅ |

**23 components** are directly imported in `App.tsx`; the remaining 12 are used as sub-components within others.

### 3.3 Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "BirthdayMessaging",
  "version": "0.1.0",
  "permissions": ["storage", "scripting", "activeTab", "tabs", "alarms"],
  "host_permissions": ["https://*.facebook.com/*"],
  "action": { "default_popup": "popup.html", "default_title": "BirthdayMessaging" },
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://*.facebook.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "web_accessible_resources": [{
    "resources": ["assets/*"],
    "matches": ["https://*.facebook.com/*"]
  }],
  "icons": { "128": "images/Birthday_messaging-logo.png" }
}
```

### 3.4 App.tsx View Management

**17 ViewMode states:**
`main`, `change-password`, `scheduling`, `queue`, `history`, `analytics`, `message-templates`, `posts`, `groups`, `images`, `contacts`, `add-contact`, `edit-contact`, `birthday-calendar`, `smtp-settings`, `account-management`, `subscription`

**4-Tab Navigation with Dropdowns:**
- **Home**: Dashboard quick-stats (contacts count, upcoming birthdays, analytics shortcut)
- **Contacts** (2 dropdown items): Manage Contacts, Birthday Calendar
- **Messages** (5 dropdown items): Message Templates, Timeline Posts, Scheduling, Analytics, Image Library
- **Account** (4 dropdown items): Profile, Change Password, SMTP Settings, Subscription, Sign Out

### 3.5 Background Service Worker (750 lines)

**64 message types** handled via switch/case dispatch:

| Category | Message Types |
|----------|--------------|
| Auth (10) | `auth.register`, `auth.login`, `auth.refresh`, `auth.logout`, `auth.requestPasswordReset`, `auth.resetPassword`, `auth.changePassword`, `auth.me`, `auth.updateProfile`, `auth.deleteAccount` |
| Templates (4) | `templates.list`, `templates.create`, `templates.update`, `templates.delete` |
| Subscription (2) | `subscription.status`, `subscription.checkout` |
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

**Token Management:**
- Stores access/refresh tokens in `chrome.storage.local`
- Auto-refresh on 401 errors (transparent to callers)
- `config.getWSConfig` converts HTTP URL to WebSocket URL for popup connection

### 3.6 API Client (760 lines)

**52 exported functions:**

| Category | Functions |
|----------|-----------|
| Auth (9) | `register`, `login`, `refreshToken`, `me`, `requestPasswordReset`, `resetPassword`, `changePassword`, `updateUserProfile`, `deleteUserAccount` |
| Templates (4) | `listTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate` |
| Subscription (2) | `subscriptionStatus`, `createCheckoutSession` |
| Schedules (4) | `listSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule` |
| Messages (6) | `listQueuedMessages`, `updateQueuedMessage`, `cancelQueuedMessage`, `retryQueuedMessage`, `listMessageHistory`, `deleteMessageHistory` |
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

**index.ts (618 lines)** — Main coordinator + full automation loop:
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

**messenger.ts (511 lines)** — Messenger automation:
- Archive/unarchive conversations
- MutationObserver for reply monitoring
- Programmatic message sending

**timeline.ts (575 lines)** — Timeline posting:
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
| `db` | `postgres:15` | 5432 | Init with `ddl.sql`, volume `postgres_data` |
| `backend` | Built from Dockerfile | 8000 | Depends on db, reads `.env` |

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
- **Revocation**: Rotate `JWT_SECRET_KEY` to invalidate all (no per-token blacklist)

### 6.2 API Security
- **CORS**: `chrome-extension://*`, `http://localhost:3000`
- **Input Validation**: Pydantic schemas for all requests/responses
- **SQL Injection**: SQLAlchemy parameterized queries
- **Authorization**: All queries filtered by authenticated user's `user_id`
- **Rate Limiting**: `slowapi` middleware is initialized in `main.py`. The password-reset endpoint carries three stacked `@limiter.limit()` decorators: `1/minute`, `5/hour`, and `20/hour` (global). Key function uses remote IP address. The `/send-birthday-message` stub also has a `1/45seconds` per-user limit.

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

### 7.2 Accessibility Utilities (`utils/accessibility.ts`, 216 lines)

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

### 8.2 Frontend (`src/api/websocket.ts`, 235 lines)

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
| Backend auth | ✅ Basic | `test_auth.py` |
| Backend templates | ✅ Basic | `test_templates.py` |
| Backend schedules/messages/dashboard | ❌ TODO | |
| Extension unit tests | ❌ None | No test framework configured |
| E2E tests | ❌ None | No Playwright/Puppeteer |

### 9.2 Running Tests

```bash
cd backend
pip install -e .[test]
pytest
pytest --cov=app --cov-report=html
```

### 9.3 Manual Testing

- **Popup**: Load extension, test all 17 view modes
- **Content Script**: Navigate to Facebook, verify overlay and automation
- **Background**: Check service worker console (`chrome://extensions` → Inspect)
- **WebSocket**: Verify real-time updates appear in dashboard/queue/history

---

## 10. Production Gaps & Future Work

### 10.1 Known Code Gaps

All features are registered and implemented. The following are gaps within the existing codebase:

| Gap | Location | Impact |
|-----|----------|--------|
| Email delivery not implemented | `app/services/password_reset.py` | Password reset unusable by real users |
| SMTP passwords stored in plaintext | `app/db/models.py` SMTPConfig | Security risk in production |
| `POST /send-birthday-message` is a stub | `app/main.py` | Backend endpoint non-functional; content script handles sending directly |

### 10.2 Testing Gaps

| Layer | Coverage | Files |
|-------|----------|-------|
| Backend auth | ✅ Basic | `test_auth.py` |
| Backend templates | ✅ Basic | `test_templates.py` |
| Backend Phase 2 routers | ❌ None | No test files |
| Extension unit tests | ❌ None | No test framework configured |
| E2E tests | ❌ None | No Playwright/Puppeteer |

### 10.3 Production Infrastructure Gaps
- No email service configured (SendGrid, SES, or SMTP)
- No CI/CD pipeline (no GitHub Actions)
- No monitoring or alerting
- No HTTPS configuration or reverse proxy
- No Chrome Web Store listing
- Production deployment script (`deploy.sh`) present but not verified
- Alembic configured but migration workflow not documented

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
| `alembic` | ≥1.13 | Database migrations (configured, not actively used) |

**Test:** `pytest ≥8`, `pytest-asyncio ≥0.21`, `httpx ≥0.27`, `pytest-cov ≥4`

### 11.2 Extension (`package.json`)

**Runtime (3):** `react ^18.2.0`, `react-dom ^18.2.0`, `react-calendar ^6.0.0`

**Dev (20):** typescript, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/postcss, postcss, autoprefixer, lightningcss, vite-plugin-lightningcss, @types/chrome, @types/react, @types/react-dom, eslint, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, eslint-plugin-react, eslint-plugin-react-hooks, eslint-config-prettier, eslint-plugin-prettier, prettier

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
| **Database** | 4 tables, integer PKs | 13 tables, UUID PKs, soft-delete |
| **Payments** | None | Full Stripe integration + webhooks |
| **Frontend** | 12 HTML pages, minified jQuery (~3.5MB) | 1-page React SPA, 35 components (~210KB) |
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
| Backend LOC | ~3000 Python |
| Extension LOC | ~7000 TypeScript/React |
| Database | 13 tables, 5 enums, 25+ indexes |
| API Endpoints | ~64 HTTP + 1 WebSocket (17 routers) |
| Component Files | 35 (23 directly in App.tsx) |
| Background Message Types | 64 |
| API Client Functions | 52 |
| Accessibility Utilities | 8 functions |
| Runtime Dependencies | 13 Python + 3 npm |

### Strengths
1. **Type Safety**: TypeScript + Pydantic catches errors at compile time
2. **Async Architecture**: FastAPI + SQLAlchemy async for high concurrency
3. **Security**: JWT rotation, Argon2 hashing, Stripe webhook verification
4. **Real-Time**: WebSocket updates for queue/history/dashboard
5. **Accessibility**: WCAG 2.1 AA with keyboard shortcuts, screen reader support
6. **Developer Experience**: Docker Compose, Vite HMR, Swagger UI

### Remaining Work for Production
1. Configure email service for password reset (`app/services/password_reset.py`)
2. Encrypt SMTP passwords at rest before first real user
3. Comprehensive test coverage (Phase 2 routes, extension, E2E)
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
