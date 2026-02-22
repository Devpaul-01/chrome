# BirthdayMessaging (bm-ts) System Architecture Analysis

**Generated:** February 1, 2026  
**Last Updated:** February 12, 2026  
**Version:** 0.5.0  
**System Type:** Full-Stack Web Application with Browser Extension

> **Implementation Status:** ✅ **Phase 1 Complete, Phase 2 UI Scaffolded** — Backend runs fully containerized in Docker with 8 registered routers (including WebSocket), 7 database models, and all 7 tables in DDL. Extension has 29 React components with real-time WebSocket updates, comprehensive accessibility, and Phase 2 UI scaffolding.

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | January 2026 | Initial system architecture analysis |
| 0.2.0 | February 1, 2026 | **Phase 1 Implementation Complete** — Added 4 database tables, 15 API endpoints, 7 new frontend components. |
| 0.3.0 | February 7, 2026 | **Architecture Verification** — Updated to reflect actual implemented state. |
| 0.4.0 | February 11, 2026 | **Phase 2 UI Scaffolding Complete** — Added 6 new React components, enhanced tab navigation. 8th router (WebSocket) registered. |
| 0.5.0 | February 12, 2026 | **Full Documentation Audit** — Corrected password hashing (Argon2, not bcrypt), updated router count to 8, verified 29 components / 24 API client functions / 32 background message types. DDL confirmed complete with all 7 tables. Documented WebSocket/real-time architecture, accessibility utilities. Removed 3000+ lines of obsolete legacy migration scaffolding code (all features now implemented). |

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
- ✅ **Database Schema**: 7 tables complete in both models.py and ddl.sql
- ✅ **API Endpoints**: 8 registered routers with ~27 HTTP endpoints + 1 WebSocket endpoint
- ✅ **WebSocket Real-Time**: Live updates for queue, history, dashboard, and notifications
- ✅ **JWT Authentication**: Access/refresh token system with secure rotation
- ✅ **Password Reset**: Complete flow with email tokens (request, reset, change password)
- ✅ **Birthday Scheduling**: Days before/after configuration with enable/disable
- ✅ **Message Queue**: Full CRUD with view, edit, cancel, and retry capabilities
- ✅ **Message History**: Searchable log with filtering by name, status, and date
- ✅ **Dashboard Analytics**: Real-time statistics and metrics
- ✅ **Stripe Subscription**: Full subscription lifecycle with webhook integration
- ✅ **Template Management**: CRUD operations for greeting/body/closing segments with soft-delete
- ✅ **Frontend UI**: 29 React component files (25 actively imported in App.tsx, 1187 lines)
- ✅ **Accessibility**: WCAG 2.1 Level AA — keyboard shortcuts, screen reader support, focus management, live regions, accessibility utilities
- ✅ **Content Scripts**: Facebook birthday detection, Messenger automation, timeline posting
- ⏳ **Build Status**: Extension source complete; dist/ folder gitignored (build with `npm run build`)

**⚠️ Scaffolded But Not Active (Phase 2 Backend Features):**

| Feature | Router | Schema | Frontend | Model | Registered |
|---------|--------|--------|----------|-------|------------|
| Birthday Configs | `birthday_configs.py` | `birthday_config.py` | `Config.tsx` | ❌ Missing | ❌ No |
| Posts | `posts.py` | `post.py` | `PostEditor.tsx`, `PostList.tsx` | ❌ Missing | ❌ No |
| Message Groups | `message_groups.py` | `message_group.py` | `MessageGroups.tsx` | ❌ Missing | ❌ No |
| User Images | `images.py` | `user_image.py` | `ImageManager.tsx` | ❌ Missing | ❌ No |

**⚠️ Scaffolded UI (Backend Not Wired — All handlers have TODO markers):**
- Contact management (ContactList, ContactForm, ImportContactsModal, BirthdayCalendar)
- SMTP Settings
- Account Management (profile, timezone, delete account)

**System Status:**
- ✅ Development-ready with Docker Compose
- ⏳ Email service needs configuration (password reset currently logs to console)
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
10. [Unregistered Features & Future Work](#10-unregistered-features--future-work)
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
│  │  29 comps    │  │   Worker      │  │  (Facebook)    │         │
│  └──────┬───────┘  └───────┬───────┘  └────────────────┘         │
│         │ WebSocket         │ API Calls                          │
└─────────┼──────────────────┼─────────────────────────────────────┘
          │                  │
          ▼ WSS              ▼ HTTPS
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python)                      │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐      │
│  │   Auth   │  │ Templates │  │Subscription│  │ Schedules│      │
│  │  Router  │  │  Router   │  │   Router   │  │  Router  │      │
│  └──────────┘  └───────────┘  └────────────┘  └──────────┘      │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐      │
│  │ Messages │  │ Dashboard │  │  Webhook   │  │WebSocket │      │
│  │  Router  │  │  Router   │  │   Router   │  │  Router  │      │
│  └──────────┘  └───────────┘  └────────────┘  └──────────┘      │
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
│   ├── main.py                    # FastAPI app (8 routers registered)
│   ├── api/
│   │   ├── deps.py                # get_current_user dependency
│   │   └── routers/
│   │       ├── auth.py            # Authentication + password reset ✅
│   │       ├── templates.py       # Template CRUD ✅
│   │       ├── subscription.py    # Subscription management ✅
│   │       ├── webhook.py         # Stripe webhook handler ✅
│   │       ├── schedules.py       # Birthday schedule management ✅
│   │       ├── messages.py        # Message queue & history ✅
│   │       ├── dashboard.py       # Dashboard analytics ✅
│   │       ├── websocket.py       # WebSocket real-time updates ✅
│   │       ├── birthday_configs.py # ⚠️ NOT REGISTERED (no model)
│   │       ├── posts.py           # ⚠️ NOT REGISTERED (no model)
│   │       ├── message_groups.py  # ⚠️ NOT REGISTERED (no model)
│   │       └── images.py          # ⚠️ NOT REGISTERED (no model)
│   ├── core/
│   │   ├── config.py              # Pydantic Settings (env-based)
│   │   ├── jwt.py                 # JWT token creation/decoding (access + refresh)
│   │   ├── security.py            # Argon2 password hashing (passlib CryptContext)
│   │   └── logging.py             # Basic logging setup (setup_logging())
│   ├── db/
│   │   ├── base.py                # SQLAlchemy declarative_base()
│   │   ├── models.py              # 7 ORM models (196 lines)
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
│   │   ├── birthday_config.py     # ⚠️ (no corresponding model)
│   │   ├── post.py                # ⚠️ (no corresponding model)
│   │   ├── message_group.py       # ⚠️ (no corresponding model)
│   │   └── user_image.py          # ⚠️ (no corresponding model)
│   ├── services/
│   │   ├── password_reset.py      # Token creation/verification, email placeholder
│   │   ├── stripe.py              # Stripe checkout, webhook handling
│   │   └── templates.py           # Message composition from segments
│   └── tests/                     # Pytest test suite
├── alembic.ini                    # Present but not actively used
├── docker-compose.yml             # PostgreSQL + backend services
├── Dockerfile                     # Backend container definition
├── deploy.sh                      # Production deployment script
├── pyproject.toml                 # Python dependencies
└── README.md
```

### 2.2 Database Schema

**DDL Status:** ✅ Complete — `ddl.sql` defines all 7 tables, 3 enums, and 2 extensions.

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

#### Extensions
- `pgcrypto`: UUID generation
- `citext`: Case-insensitive email

### 2.3 API Endpoints

**8 routers registered in `main.py`:**

| Router | Prefix | Description |
|--------|--------|-------------|
| `auth` | `/auth` | Authentication + password reset (7 endpoints) |
| `templates` | `/templates` | Template CRUD (4 endpoints) |
| `subscription` | `/subscription` | Subscription management (2 endpoints) |
| `webhook` | `/stripe` | Stripe webhooks (1 endpoint) |
| `schedules` | `/api` | Birthday schedules (4 endpoints) |
| `messages` | `/api` | Message queue + history (7 endpoints) |
| `dashboard` | `/api` | Dashboard analytics (1 endpoint) |
| `websocket` | *(none)* | WebSocket at `/ws` (1 endpoint) |

**Total: ~27 HTTP endpoints + 1 WebSocket endpoint**

#### Authentication (`/auth`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/register` | POST | No | Create user, return tokens |
| `/auth/login` | POST | No | Validate credentials, return tokens |
| `/auth/refresh` | POST | No | Rotate both tokens |
| `/auth/me` | GET | Bearer | Get current user profile |
| `/auth/request-password-reset` | POST | No | Request reset email |
| `/auth/reset-password` | POST | No | Reset password with token |
| `/auth/change-password` | POST | Bearer | Change password (authenticated) |

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
| `/api/schedules/{id}` | PATCH | Bearer | Update schedule |
| `/api/schedules/{id}` | DELETE | Bearer | Delete schedule |

#### Messages (`/api/messages`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/messages/queue` | GET | Bearer | List queued messages |
| `/api/messages/queue` | POST | Bearer | Create queued message |
| `/api/messages/queue/{id}` | PATCH | Bearer | Update message |
| `/api/messages/queue/{id}` | DELETE | Bearer | Cancel message |
| `/api/messages/queue/{id}/retry` | POST | Bearer | Retry failed message |
| `/api/messages/history` | GET | Bearer | List history (search/filter) |
| `/api/messages/history/{id}` | DELETE | Bearer | Delete history entry |

#### Dashboard (`/api/dashboard`)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/dashboard/stats` | GET | Bearer | Get analytics |

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
│   ├── index.css                  # Tailwind directives + custom classes (117 lines)
│   ├── api/
│   │   ├── client.ts              # Type-safe HTTP client (303 lines, 24 functions)
│   │   └── websocket.ts           # WebSocket singleton client (235 lines)
│   ├── background/
│   │   └── index.ts               # Service worker (288 lines, 32 message types)
│   ├── content/
│   │   ├── index.ts               # Content script coordinator (238 lines)
│   │   ├── api.ts                 # Content→background bridge (7 lines)
│   │   ├── messenger.ts           # Messenger automation (511 lines)
│   │   └── timeline.ts            # Timeline posting automation (575 lines)
│   ├── popup/
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Main SPA orchestrator (1187 lines)
│   │   ├── api.ts                 # Popup→background bridge (7 lines)
│   │   ├── popup.css              # Component styles + brand theme (780 lines)
│   │   ├── hooks/
│   │   │   └── useApi.ts          # React hook for messaging
│   │   └── components/            # 29 component files (25 imported in App.tsx)
│   └── utils/
│       ├── accessibility.ts       # A11y utilities (216 lines, 8 functions)
│       ├── automation.ts          # Chrome storage config, alarms scheduling
│       ├── bridge.ts              # chrome.runtime.sendMessage typed wrapper
│       ├── errors.ts              # Error hierarchy (AppError, NetworkError, etc.)
│       ├── logger.ts              # Dev-only console logger with emoji prefixes
│       ├── message.ts             # Message composition, anti-ban delay (5–15s)
│       ├── messages.ts            # BackgroundMessage discriminated union types
│       └── storage.ts             # Chrome storage helpers for tokens/URL
├── popup.html                     # Single-page popup entry (14 lines)
├── package.json
├── tsconfig.json                  # ES2022, react-jsx, strict, path alias ~/
├── vite.config.ts                 # Multi-entry: popup, background, content
├── tailwind.config.js
└── postcss.config.js
```

### 3.2 Component Inventory (29 files)

| Component | Purpose | Imported in App.tsx |
|-----------|---------|:-------------------:|
| `AccountManagement.tsx` | Profile, timezone, logout, delete account | ✅ |
| `AuthForm.tsx` | Login/register with forgot-password link | ✅ |
| `AutomationSettings.tsx` | Chrome alarms configuration | ✅ |
| `BirthdayCalendar.tsx` | Calendar grid + list view | ✅ |
| `ChangePassword.tsx` | Authenticated password change | ✅ |
| `Config.tsx` | Backend URL configuration | ✅ |
| `ContactForm.tsx` | Add/edit contact form | ✅ |
| `ContactList.tsx` | Contact management with search | ✅ |
| `Dashboard.tsx` | Statistics and metrics display | ✅ |
| `ErrorBoundary.tsx` | React error boundary | ✅ |
| `ForgotPassword.tsx` | Password reset request | ✅ |
| `GenderFilter.tsx` | Gender-based filtering | ❌ |
| `ImageManager.tsx` | Image upload UI | ✅ |
| `ImportContactsModal.tsx` | Bulk import (JSON/VCF/CSV) | ✅ |
| `KeywordInserter.tsx` | Template placeholder helper | ❌ |
| `MessageGroups.tsx` | Group templates | ✅ |
| `MessageHistory.tsx` | Searchable sent message log | ✅ |
| `MessageQueue.tsx` | Pending message management | ✅ |
| `PostEditor.tsx` | Post creation UI | ✅ |
| `PostList.tsx` | Post management | ✅ |
| `ScheduleSettings.tsx` | Birthday schedule CRUD | ✅ |
| `SMTPSettings.tsx` | SMTP server configuration | ✅ |
| `Spinner.tsx` | Loading spinner | ✅ |
| `SubscriptionPanel.tsx` | Stripe subscription status | ✅ |
| `TabbedDashboard.tsx` | Multi-tab dashboard layout | ❌ |
| `TemplateEditor.tsx` | Create/update templates | ✅ |
| `TemplateEditorEnhanced.tsx` | Advanced template editing | ❌ |
| `TemplateList.tsx` | CRUD template segments | ✅ |
| `Toast.tsx` | Toast notifications | ✅ |

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

**18 ViewMode states:**
`main`, `change-password`, `schedules`, `automation`, `queue`, `history`, `dashboard`, `posts`, `post-list`, `groups`, `images`, `config`, `contacts`, `add-contact`, `edit-contact`, `import-contacts`, `birthday-calendar`, `smtp-settings`, `account-management`

**4-Tab Navigation with Dropdowns:**
- **Contacts** (4): Add Contact, Manage Contacts, Import Contacts, Birthday Calendar
- **Templates** (2): Add Template, View Templates
- **Messages** (9): Schedule Message, Automation, Queue, Sent Messages, Dashboard, Create Post, View Posts, Message Groups, Images
- **Account** (6): Profile, Change Password, SMTP Settings, Subscription, Advanced Config, Sign Out

### 3.5 Background Service Worker (288 lines)

**32 message types** handled via switch/case dispatch:

| Category | Message Types |
|----------|--------------|
| Auth (8) | `register`, `login`, `refresh`, `logout`, `requestPasswordReset`, `resetPassword`, `changePassword`, `me` |
| Templates (4) | `list`, `create`, `update`, `delete` |
| Subscription (2) | `status`, `checkout` |
| Config (3) | `getBackendUrl`, `setBackendUrl`, `getWSConfig` |
| Schedules (4) | `list`, `create`, `update`, `delete` |
| Automation (4) | `getConfig`, `setEnabled`, `setInterval`, `scanFacebook` |
| Messages (6) | `listQueue`, `updateQueued`, `cancelQueued`, `retryQueued`, `listHistory`, `deleteHistory` |
| Dashboard (1) | `getStats` |

**Token Management:**
- Stores access/refresh tokens in `chrome.storage.local`
- Auto-refresh on 401 errors (transparent to callers)
- `config.getWSConfig` converts HTTP URL to WebSocket URL for popup connection

### 3.6 API Client (303 lines)

**24 exported functions:**
`register`, `login`, `refreshToken`, `me`, `listTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `subscriptionStatus`, `createCheckoutSession`, `requestPasswordReset`, `resetPassword`, `changePassword`, `listSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule`, `listQueuedMessages`, `updateQueuedMessage`, `cancelQueuedMessage`, `retryQueuedMessage`, `listMessageHistory`, `deleteMessageHistory`, `getDashboardStats`

Plus `ApiError` class and 12 exported interfaces/types.

### 3.7 Content Scripts

**index.ts (238 lines)** — Coordinator:
- Overlay UI on Facebook pages
- Birthday friend detection via DOM scraping (`div[data-pagelet*="Birthday"]`)
- Auto-send with confirmation prompt
- Max 5 messages per session, random delays 5–15s

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
│  Backend API    │     │ Content Script  │
│  (FastAPI)      │     │ (Facebook DOM)  │
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

- **Popup**: Load extension, test all 18 view modes
- **Content Script**: Navigate to Facebook, verify overlay and automation
- **Background**: Check service worker console (`chrome://extensions` → Inspect)
- **WebSocket**: Verify real-time updates appear in dashboard/queue/history

---

## 10. Unregistered Features & Future Work

### 10.1 Phase 2 Backend Features (Code Exists, Not Active)

Each has a router file, schema file, and frontend component(s) but is missing:
- Database model in `models.py`
- Table definition in `ddl.sql`
- Router registration in `main.py`

**To activate any feature:**
1. Add model to `models.py`
2. Add table to `ddl.sql` (or create Alembic migration)
3. Register router in `main.py`: `app.include_router(feature.router, prefix="/api")`

| Feature | Description |
|---------|-------------|
| **Birthday Configs** | Advanced automation with modes (advance/normal/followup), gender filters, archive |
| **Posts** | Timeline post templates with images and gender targeting |
| **Message Groups** | Named sets of template segments with gender filtering |
| **User Images** | Image upload (URL/base64), 5MB limit, user library |

### 10.2 Scaffolded UI Without Backend

| Component | Purpose | Backend Needed |
|-----------|---------|---------------|
| ContactList + ContactForm + ImportContactsModal | Contact CRUD, bulk import | `/api/contacts` endpoints + `contacts` model |
| BirthdayCalendar | Calendar/list views | Contact data |
| SMTPSettings | SMTP configuration | `/api/smtp` endpoint + `smtp_configs` model |
| AccountManagement | Profile, timezone, delete | `/api/account` endpoints |

### 10.3 Production Gaps
- Email service for password reset (currently console logging)
- Rate limiting (no brute-force protection)
- CI/CD pipeline (no GitHub Actions)
- Comprehensive test coverage
- Production deployment infrastructure
- Chrome Web Store listing

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

**Test:** `pytest ≥8`, `pytest-asyncio ≥0.21`, `httpx ≥0.27`, `pytest-cov ≥4`

### 11.2 Extension (`package.json`)

**Runtime (2):** `react ^18.2.0`, `react-dom ^18.2.0`

**Dev (20):** typescript, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/postcss, postcss, autoprefixer, lightningcss, vite-plugin-lightningcss, @types/chrome, @types/react, @types/react-dom, eslint, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, eslint-plugin-react, eslint-plugin-react-hooks, eslint-config-prettier, eslint-plugin-prettier, prettier

### 11.3 Infrastructure
- PostgreSQL 15+ (pgcrypto, citext)
- Docker 20.10+, docker-compose 2.0+

---

## 12. API Contract Compliance

[API_CONTRACT.md](API_CONTRACT.md) documents the core endpoints (auth, templates, subscription). Phase 1 additions (schedules, messages, dashboard, password reset) are documented in [BACKEND_INTEGRATION_SUMMARY.md](BACKEND_INTEGRATION_SUMMARY.md). WebSocket events are documented in [REALTIME_FEATURES.md](REALTIME_FEATURES.md).

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
| **Database** | 4 tables, integer PKs | 7 tables, UUID PKs, soft-delete |
| **Payments** | None | Full Stripe integration + webhooks |
| **Frontend** | 12 HTML pages, minified jQuery (~3.5MB) | 1-page React SPA, 29 components (~210KB) |
| **Types** | None | Full TypeScript + Pydantic |
| **Build** | Committed minified bundles | Vite source build (reproducible) |
| **Real-Time** | None | WebSocket live updates |
| **Accessibility** | ~22% WCAG | WCAG 2.1 AA with utilities |
| **Content Scripts** | Basic Facebook automation | Facebook + Messenger + Timeline |
| **Bundle Size** | ~3.5MB | ~210KB (94% smaller) |

---

## 14. Conclusion

### System Statistics

| Metric | Value |
|--------|-------|
| Backend LOC | ~2000 Python |
| Extension LOC | ~5000 TypeScript/React |
| Database | 7 tables, 3 enums, 12+ indexes |
| API Endpoints | ~27 HTTP + 1 WebSocket (8 routers) |
| Component Files | 29 (25 active in App.tsx) |
| Background Message Types | 32 |
| API Client Functions | 24 |
| Accessibility Utilities | 8 functions |
| Runtime Dependencies | 12 Python + 2 npm |

### Strengths
1. **Type Safety**: TypeScript + Pydantic catches errors at compile time
2. **Async Architecture**: FastAPI + SQLAlchemy async for high concurrency
3. **Security**: JWT rotation, Argon2 hashing, Stripe webhook verification
4. **Real-Time**: WebSocket updates for queue/history/dashboard
5. **Accessibility**: WCAG 2.1 AA with keyboard shortcuts, screen reader support
6. **Developer Experience**: Docker Compose, Vite HMR, Swagger UI

### Remaining Work for Production
1. Configure email service for password reset
2. Deploy to production infrastructure
3. Add rate limiting, CI/CD, monitoring
4. Comprehensive test coverage
5. Chrome Web Store listing

### Documentation Index
| Document | Purpose |
|----------|---------|
| [SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md](SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md) | This document |
| [API_CONTRACT.md](API_CONTRACT.md) | Frozen API interface spec (core endpoints) |
| [BACKEND_INTEGRATION_SUMMARY.md](BACKEND_INTEGRATION_SUMMARY.md) | Phase 1 implementation details |
| [BACKEND_TESTING_GUIDE.md](BACKEND_TESTING_GUIDE.md) | Testing setup |
| [REALTIME_FEATURES.md](REALTIME_FEATURES.md) | WebSocket event documentation |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | Accessibility features |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | Development setup and workflow |
| [MVP_CHECKLIST.md](MVP_CHECKLIST.md) | Production launch task tracking |
| [README.md](README.md) | Quick start guide |
