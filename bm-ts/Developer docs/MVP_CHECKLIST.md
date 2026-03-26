


**Last Updated:** March 26, 2026  
**Status:** Pre-MVP — Phase 1 and Phase 2 backend complete, Facebook automation pipeline fully implemented, MessageQueue/History UI enhancements complete, onboarding wizard + contextual help tooltips implemented, frontend testing framework expanded (271 tests across 14 files), security hardening pass completed (XSS fix, SQL injection protection, rate limiting on login/register, JWT validation, WebSocket auth, SMTP masking, Stripe redirect validation — Mar 4, 2026), SendGrid email service integrated for password reset (asyncio import bug fixed Mar 9, 2026), full codebase audit with metric corrections (Mar 17, 2026), Help & Tips panel + OnboardingWizard UI polish: glassmorphism, brand-consistent text, improved spacing, removed redundant Help & Shortcuts footer section (Mar 10, 2026), privacy policy + terms of service created, frontend CI pipeline configured, user documentation (Quick Start, FAQ, Troubleshooting Guide) created (Mar 18, 2026), email verification system implemented (Mar 18, 2026), user sessions management implemented (Mar 19, 2026), subscription cancel/reactivate/change-plan/billing-portal endpoints implemented and tested, backend testing expanded to ~91 tests across 11 files (Mar 19–24, 2026), comprehensive security hardening pass #2 (20 fixes — session invalidation on password reset/change, WebSocket access-token + session enforcement, timing oracle fix, atomic token consumption, JWT iss/aud claims, email_verified + account lockout enforcement, CORS/CSP/Cache-Control tightening, CSS selector injection fix, manifest CSP, audit log enrichment — Mar 26, 2026)

---

## Executive Summary (as of March 17, 2026)

This checklist tracks all tasks required to make bm-ts a production-ready MVP. The system is robust and well-architected, with Phase 1 features fully implemented and integrated. Phase 2 backend features are scaffolded (models, routers, and tables exist) but require activation and full wiring to the frontend. Production infrastructure, comprehensive testing, and user-facing polish are still pending.

**Current Strengths:**
- ✅ Core backend API with 15 routers and 71 HTTP endpoints + 1 WebSocket (all Phase 1 and Phase 2 routers registered; includes email verification, session list/revoke, subscription cancel/reactivate/change-plan/billing-portal)
- ✅ Chrome extension with React UI, 38 components, real-time updates, and accessibility
- ✅ Docker-based development environment (Dockerfile + docker-compose.yml with PostgreSQL)
- ✅ Database schema and models complete for all Phase 1 and Phase 2
- ✅ Strong security (JWT rotation + secret validation + iss/aud claims, Argon2, Stripe webhooks, rate limiting on login/register/refresh, XSS/SQL injection/CSS selector injection hardening, WebSocket access-token + session-validated auth, SMTP password masking, security headers middleware + Permissions-Policy + Cache-Control, input sanitization on all text schemas, session invalidation on password reset/change, email_verified + account lockout enforcement in auth dependency, timing oracle protection on login, atomic token consumption with SELECT FOR UPDATE, explicit CSP in extension manifest)
- ✅ Accessibility (WCAG 2.1 AA)
- ✅ Documentation is comprehensive and up to date
- ✅ Facebook automation pipeline fully implemented — birthday scraping, gender-aware DM + timeline post, advance/follow-up modes, deduplication, archiving

**Remaining Gaps:**
- ✅ `/send-birthday-message` backend endpoint is a non-functional stub but now requires authentication (extension content scripts handle actual sending)
- ✅ SMTP passwords encrypted at rest using Fernet symmetric encryption (passwords also masked in API responses via `SMTPConfigOut.model_post_init`)
- ⚠️ No production deployment infrastructure
- ✅ Backend testing expanded: ~91 tests across 11 files (auth 9, contacts 10, messages 17, password_reset 7, dashboard 5, schedules 9, templates 2, subscription 13, webhook 10, email_verification 9) — conftest.py with async fixtures in place
- ✅ Extension testing: ~271 tests across 14 files (unit + component), all passing
- ✅ Alembic migrations fully populated — 5 migration files: initial schema (14 tables), `a1b2c3d4e5f6` (revoked_tokens), `b2c3d4e5f6g7` (account lockout columns, Mar 12), `c3d4e5f6g7h8` (email_verification_tokens + email_verified column, Mar 18), `d4e5f6g7h8i9` (user_sessions table, Mar 19) — **17 tables total**
- ⚠️ No CI/CD pipeline or monitoring
- ✅ SendGrid email service fully configured (Mar 14, 2026): `email_from_address`, `password_reset_url_base`, and `sendgrid_api_key` fields in `config.py` Settings; `password_reset.py` uses `settings.*` for all three
- ✅ Security headers middleware (HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, Permissions-Policy, Cache-Control on auth routes) — Mar 14 + Mar 26, 2026
- ✅ Input sanitization applied to all text fields across 6 Pydantic schema files — Mar 14, 2026
- ✅ SMTP encryption key validator rejects placeholder values at startup — Mar 14, 2026
- ✅ Stripe API key placeholder validation warns at startup — Mar 26, 2026
- ✅ JWT secret key < 32 chars now rejected (was only warning) — Mar 26, 2026

**Actionable Next Steps:**
1. ~~Encrypt SMTP passwords at rest before production~~  DONE — Fernet symmetric encryption implemented in `encryption.py`; SMTP router encrypts on save, masks on read; `smtp_encryption_key` validated at startup
2. Increase test coverage (Phase 2 backend, E2E)
3. Set up production deployment, CI/CD, and monitoring
4. Prepare documentation and onboarding for production users

---

## 🔴 Critical Blockers (Must Fix Before Any Deployment)

### 1. ~~Complete Database Schema (ddl.sql)~~  RESOLVED
**Status:**  Complete — Schema maintained via `models.py` (15 ORM models) + Alembic migrations. Original `ddl.sql` superseded.

---

### 2. ~~Implement Email Service for Password Reset~~  Complete
**Status:**  Fully Implemented (Mar 14, 2026) — SendGrid SDK integrated; all config fields (`email_from_address`, `password_reset_url_base`, `sendgrid_api_key`) in `config.py` Settings.

**Remaining pre-production tasks:**
- [x] Test email delivery in development with real SendGrid API key
- [x] Document email setup in DEVELOPMENT_GUIDE.md  (SendGrid setup section added)
- [x] Improve HTML email template (branding, responsive design)  (branded responsive table-based HTML with CTA button, footer, and fallback link)

---

## 🗄️ Database Layer

### Schema & Migrations
- [x] Define 17 models in models.py (User, SubscriptionRecord, TemplateSegment, BirthdaySchedule, MessageQueue, MessageHistory, PasswordResetToken, RevokedToken — Phase 1; Contact, MessageGroup, Post, UserImage, BirthdayConfig, SMTPConfig, MessageTemplate — Phase 2; EmailVerificationToken, UserSession — Mar 2026)
- [x] Complete ddl.sql with all tables  (14 tables including Phase 2: posts, message_groups, user_images, birthday_configs, smtp_configs, message_templates)
- [x] Add database indexes for performance:
  - [x] Index on `message_queue.user_id` (idx_queue_user_status)
  - [x] Index on `message_queue.scheduled_send_time` (idx_queue_scheduled_time)
  - [x] Index on `message_queue.status` (idx_queue_user_status)
  - [x] Index on `message_history.user_id` (idx_history_user_sent, idx_history_user_status)
  - [x] Index on `message_history.sent_at` (idx_history_user_sent)
  - [x] Index on `password_reset_tokens.token` (idx_reset_token_expires)
  - [x] Index on `password_reset_tokens.expires_at` (idx_reset_token_expires)
- [x] Set up Alembic properly for schema migrations: 
  - [x] Alembic config file exists (alembic.ini)
  - [x] Comprehensive initial migration fully populated (`78efe19bc04e_initial_schema.py`) — creates all 14 tables; both `upgrade()` and `downgrade()` implemented
  - [x] `a1b2c3d4e5f6_create_revoked_tokens.py` — adds `revoked_tokens` table
  - [x] `b2c3d4e5f6g7_add_account_lockout.py` — adds `failed_login_count` + `locked_until` to users (Mar 12, 2026)
  - [x] `c3d4e5f6g7h8_add_email_verification.py` — adds `email_verified` column + `email_verification_tokens` table with indexes (Mar 18, 2026)
  - [x] `d4e5f6g7h8i9_add_user_sessions.py` — adds `user_sessions` table (Mar 19, 2026)
  - [ ] Test migration up/down
  - [x] Document migration workflow in DEVELOPMENT_GUIDE.md  (Alembic workflow + SendGrid email setup added)

### Data Integrity
- [x] Add foreign key constraints with proper CASCADE behavior  (`ondelete='CASCADE'` on all child-table FKs in migration)
- [x] Add CHECK constraints for enum values  (PostgreSQL ENUMs: `segment_type_enum`, `message_status_enum`, `subscription_status_enum`, `gender_enum`, `birthday_mode_enum`)
- [x] Add NOT NULL constraints where appropriate  (`nullable=False` on required columns across all 14 tables)
- [x] Add UNIQUE constraints (e.g., user email, reset tokens)  (CITEXT unique email, unique schedule per user+days, unique active subscription per user, unique SMTP config per user, unique birthday config per user+mode+offset)
- [ ] Test constraint violations return proper 400 errors

### Database Operations
- [ ] Add database backup strategy
- [ ] Document restore procedures
- [x] Add health check query for monitoring  (`GET /health` now pings database with `SELECT 1`)
- [ ] Consider connection pooling tuning for production

---

## 🐍 Backend Layer

### Phase 1 Features (Active) - Completion Tasks

#### Authentication System
- [x] JWT access/refresh token flow
- [x] Registration endpoint
- [x] Login endpoint  
- [x] Token refresh endpoint
- [x] Change password endpoint
- [x] Implement email verification for new users  (`POST /auth/request-email-verification` + `POST /auth/verify-email`; `email_verification.py` service; `email_verified` column on User; Alembic migration `c3d4e5f6g7h8`; 9 tests in `test_email_verification.py` — Mar 18, 2026)
- [x] Add rate limiting to auth endpoints  (slowapi implemented: `/register` 5/min; `/login` 5/min + 20/hr; `/request-password-reset` 1/min + 5/hr + 20/hr; `/send-birthday-message` 1/45seconds; `/refresh` 30/min — Mar 26, 2026)
- [x] Add account lockout after failed login attempts  (5 failures → 15 min lockout; `failed_login_count` + `locked_until` columns + Alembic migration)
- [x] Add session management (list active sessions, revoke)  (`GET /auth/sessions` + `DELETE /auth/sessions/{id}`; `UserSession` model; Alembic migration `d4e5f6g7h8i9`; 2 integration tests in `test_auth.py` — Mar 19, 2026)

#### Password Reset Flow
- [x] Request password reset endpoint
- [x] Reset password endpoint
- [x] Token generation and validation
- [x] Email sending implementation (SendGrid integrated, Mar 14, 2026)
- [x] Add rate limiting  (1/minute + 5/hour + 20/hour stacked on `request-password-reset` in auth.py)
- [ ] Add URL expiration validation in frontend

#### Template Management
- [x] CRUD endpoints for template segments
- [x] Segment types (GREETING, BODY, CLOSING)
- [x] Add template validation (min/max length) - content must not be empty
- [x] Add template preview endpoint (`POST /templates/preview` — composes sample message from user's segments)
- [ ] Add bulk import/export for templates
- [ ] Add template usage statistics

#### Subscription Management
- [x] Stripe subscription creation
- [x] Webhook handling for subscription events
- [x] Subscription status checking
- [x] Add subscription cancellation flow  (`POST /subscription/cancel`; tested in `test_subscription.py`)
- [x] Add subscription plan upgrade/downgrade  (`POST /subscription/change-plan`; tested in `test_subscription.py`)
- [x] Add grace period handling  (status returns `in_grace_period: true`; tested in `test_subscription.py`)
- [x] Add billing portal access  (`POST /subscription/billing-portal`; tested in `test_subscription.py`)
- [x] Add subscription reactivation  (`POST /subscription/reactivate`; tested in `test_subscription.py`)
- [ ] Add failed payment retry logic  (webhook handles `payment_failed` event but no automatic retry scheduling)
- [x] Test all webhook events  (`test_webhook.py` — 10 tests cover missing/invalid signature, subscription.created, subscription.updated cancel + plan-change, subscription.deleted, payment.failed, unknown customer — Mar 2026)

#### Birthday Scheduling
- [x] CRUD endpoints for schedules
- [x] Days before/after configuration (days_before field)
- [x] Enable/disable toggle
- [x] Add schedule validation (unique constraint on user_id + days_before)
- [ ] Add bulk schedule import
- [ ] Add schedule preview (show next run date)

#### Message Queue Management
- [x] Create queued message
- [x] List queued messages
- [x] Update message status
- [x] Retry failed message
- [x] Cancel message
- [x] Add bulk operations (cancel all, retry all failed)  (frontend bulk retry/cancel implemented; backend endpoint pending)
- [ ] Add message priority levels
- [ ] Add schedule conflict detection

#### Message History
- [x] List message history
- [x] Search by name/status
- [x] Delete history item
- [x] Add pagination (currently no limit)  (page/page_size params, MessageHistoryPage response)
- [x] Add date range filtering  (start_date/end_date query params on history endpoint)
- [x] Add export to CSV  (backend `GET /api/messages/history/export` returns CSV StreamingResponse; frontend CSV export also implemented)
- [ ] Add analytics aggregation

#### Dashboard
- [x] Statistics endpoint
- [ ] Add more metrics (success rate, failure reasons)
- [ ] Add time-series data (messages per day/week/month)
- [ ] Add subscription revenue metrics

### Phase 2 Features (Backend Complete) - Frontend Integration & Enhancement Tasks

**STATUS UPDATE (Feb 14, 2026):**  All Phase 2 routers now registered, models defined, and database schema complete. Backend-frontend integration issues resolved.

#### Birthday Configs
**Status:**  Router registered, model complete, database schema complete

- [x] Create `BirthdayConfig` model in models.py 
- [x] Create database table in ddl.sql 
- [x] Register router in main.py 
- [x] Add relationship to message_groups and posts 
- [ ] Test all CRUD endpoints (manual/automated testing needed)
- [ ] Add gender filter validation in API
- [ ] Add archive toggle functionality testing
- [ ] Frontend integration testing

#### Posts (Timeline Posts)
**Status:**  Router registered, model complete with font fields, database schema complete

- [x] Create `Post` model in models.py 
- [x] Create database table in ddl.sql (includes font_family, font_size, font_color)
- [x] Register router in main.py 
- [x] Add font customization fields (font_family, font_size, font_color) 
- [x] Gender enum standardization 
- [ ] Implement image upload/storage (currently just URL storage)
- [ ] Add image validation (size, format, dimensions)
- [ ] Add post preview endpoint
- [ ] Test gender filtering
- [x] Test font customization features  (PostEditor.tsx with font_family/font_size/font_color fields; FacebookPostPreview.tsx renders preview)

#### Message Groups
**Status:**  Router registered, model complete, database schema complete

- [x] Create `MessageGroup` model in models.py 
- [x] Create database table in ddl.sql 
- [x] Register router in main.py 
- [ ] Test segment_ids array handling
- [ ] Add validation that segment_ids exist
- [ ] Add gender filter validation
- [ ] Frontend integration testing

#### Images (User Image Library)
**Status:** Router registered, model complete, database schema complete

- [x] Create `UserImage` model in models.py 
- [x] Create database table in ddl.sql 
- [x] Register router in main.py 
- [ ] Implement actual file upload (currently just URL storage)
- [ ] Set up image storage (S3, CloudFlare R2, or local volume)
- [ ] Add image processing (resize, optimize, thumbnails)
- [ ] Add image deletion (cleanup storage)
- [ ] Add usage tracking (which posts use which images)

#### Message Templates (Complete Templates)
**Status:**  Router registered, model complete with gender enum, database schema complete

- [x] Create `MessageTemplate` model in models.py 
- [x] Create database table in ddl.sql 
- [x] Register router in main.py 
- [x] Gender enum standardization (uses GenderEnum with ALL value) 
- [ ] Test all CRUD endpoints
- [x] Frontend integration for complete message templates  (TemplateCreator.tsx, TemplateGallery.tsx, useMessageTemplates.ts hook — full CRUD wired)

#### SMTP Configuration
**Status:**  Router registered and separated, model complete, database schema complete

- [x] Create `SMTPConfig` model in models.py 
- [x] Create database table in ddl.sql 
- [x] Separate SMTP router from auth router 
- [x] Register router in main.py 
- [ ] Test SMTP configuration endpoints
- [x] Frontend integration with SMTPSettings component  (SMTPSettings.tsx + useSMTPConfig.ts hook — get/update SMTP config wired)

### API Quality & Error Handling
- [x] Standardize DELETE responses across all endpoints  (All return 200 + {status: "deleted"})
- [x] Add proper HTTP status codes for DELETE operations 
- [ ] Standardize error responses across all endpoints (non-DELETE)
- [ ] Add request validation error messages
- [ ] Add request/response logging
- [ ] Add API versioning strategy (v1, v2)
- [ ] Add OpenAPI/Swagger documentation review
- [ ] Test all error cases (network, database, validation)

### Security Hardening
- [x] Add CORS configuration validation  (CORSMiddleware configured with `cors_origins` from pydantic settings; supports env override; methods/headers restricted to explicit allowlist — Mar 26, 2026)
- [x] Add request rate limiting  (slowapi implemented — rate-limited by Facebook user ID on auth and send-message endpoints; `/auth/refresh` rate-limited 30/min — Mar 26, 2026)
- [x] Add input sanitization for all text fields  (reusable `sanitize_text()` in `validators.py` applied to 6 schema files — Mar 14, 2026)
- [x] Add SQL injection protection  (SQLAlchemy ORM parameterized queries throughout)
- [x] Add XSS prevention  (input sanitization via `sanitize_text()` on all text schemas; React auto-escapes output; content script `innerHTML` uses `escapeHtml()` helper — Mar 26, 2026)
- [x] Add CSS selector injection prevention  (`CSS.escape()` applied to user-controlled values in `querySelector` calls in `messenger.ts` — Mar 26, 2026)
- [x] Add security headers (HSTS, CSP, etc.)  (`SecurityHeadersMiddleware` — HSTS, X-Frame-Options, X-Content-Type-Options, CSP (no unsafe-inline), Referrer-Policy, Permissions-Policy, Cache-Control no-store on `/auth` routes — Mar 14 + Mar 26, 2026)
- [x] Add explicit CSP in extension manifest  (`content_security_policy.extension_pages` — Mar 26, 2026)
- [ ] Add API key rotation mechanism
- [x] Implement audit logging for sensitive operations  (`AuditLogMiddleware` logs login, register, password change, account delete, SMTP config update, session revoke, data export; prefix matching for dynamic route segments — Mar 26, 2026)
- [x] Add JWT `iss`/`aud` claims  (tokens include `iss: birthdaymessaging`, `aud: birthdaymessaging`; validated on decode — Mar 26, 2026)
- [x] Enforce email verification and account lockout in auth dependency  (`get_current_user` now checks `email_verified` and `locked_until` — Mar 26, 2026)
- [x] Add timing oracle protection on login  (dummy Argon2 hash when user not found prevents user enumeration — Mar 26, 2026)
- [x] Add session invalidation on password reset  (all active sessions revoked after password reset — Mar 26, 2026)
- [x] Add session invalidation on password change  (all other sessions revoked, current session preserved — Mar 26, 2026)
- [x] Add password max_length validation  (`max_length=128` on register, reset, and change password schemas — Mar 26, 2026)
- [x] Fix WebSocket auth to enforce access token type + session validation  (`ensure_token_type(ACCESS)` + session revocation check; removed insecure query-string token path — Mar 26, 2026)
- [x] Add atomic token consumption  (`SELECT FOR UPDATE` on password reset and email verification token queries to prevent race conditions — Mar 26, 2026)
- [x] Add auth to `/send-birthday-message` endpoint  (`Depends(get_current_user)` — Mar 26, 2026)
- [x] Fix data-export missing model imports  (added `TemplateSegment`, `MessageTemplate`, `BirthdaySchedule`, `Contact`, `MessageQueue`, `MessageHistory` — Mar 26, 2026)
- [x] Add Stripe API key placeholder validation  (warns at startup if using default placeholder — Mar 26, 2026)
- [x] Reject short JWT secret keys  (`< 32 chars` now raises `ValueError` instead of warning — Mar 26, 2026)
- [ ] Add JWT secret rotation strategy

### Performance Optimization
- [ ] Add database query optimization (N+1 queries)
- [ ] Add response caching where appropriate
- [ ] Add database connection pooling configuration
- [ ] Add async operation optimization
- [ ] Load test API endpoints (100+ concurrent users)
- [ ] Profile slow endpoints and optimize

---

## 🎨 Frontend/Extension Layer

### Extension Build & Configuration
- [x] TypeScript + React setup
- [x] Vite build configuration
- [x] Manifest V3 structure
- [x] Build extension: `npm run build`  **Successfully builds to dist/ folder**
- [x] Test built extension loads in Chrome
- [ ] Add build to CI/CD pipeline
- [ ] Add versioning automation (package.json → manifest.json)
- [x] Add extension icon and branding assets (Birthday_messaging-logo.png exists)
- [ ] Test extension in incognito mode
- [ ] Test extension with multiple Google accounts
- [x] Enhanced navigation with dropdown menus  **4 comprehensive tab dropdowns**
- [x] All advanced features accessible via navigation  **5 shortcuts in MessagesHub** (Message Templates, Timeline Posts, Scheduling, Analytics, Image Library)

### Authentication UI
- [x] Login form component (AuthForm)
- [x] Registration form component (AuthForm)
- [x] Forgot password form (ForgotPassword component)
- [x] Change password form (ChangePassword component)
- [x] Add form validation feedback (email & password validation implemented)
- [x] Add loading states for all forms
- [ ] Add "remember me" functionality
- [x] Add password strength indicator (password validation exists)
- [x] Add email validation before submit
- [x] Test token refresh flow (implemented in background/index.ts)
- [x] Add logout confirmation
- [x] Handle expired session gracefully

### Dashboard UI
- [x] TabbedDashboard component
- [x] Dashboard stats display (Dashboard component)
- [x] Add real-time updates via WebSocket (implemented Feb 10, 2026)
  - [x] WebSocket endpoint (`/ws`) with JWT authentication
  - [x] Real-time message queue updates
  - [x] Real-time message history updates
  - [x] Real-time dashboard stats updates
  - [x] Auto-reconnect with exponential backoff
  - [x] Keep-alive ping/pong mechanism
  - [x] See REALTIME_FEATURES.md for full documentation
- [x] Enhanced Dashboard visual design (implemented Feb 10, 2026)
  - [x] Borderless cards with glass-morphism effect
  - [x] Emoji indicators for all stats (📊 🎯 📬 ⭐ 📅 📈 🎂 ⏳ ⚙️)
  - [x] Increased spacing for better visual balance (gap-4, mb-6, p-4/p-5/p-6)
  - [x] Consistent styling aligned with popup theme
  - [x] Larger success rate hero card with improved typography
  - [x] Labels above numbers for better readability
- [x] Enhanced tab navigation system (implemented Feb 11, 2026) ✨ **NEW**
  - [x] 4-tab layout (Home, Contacts, Messages, Account)
  - [x] Account dropdown menu (Profile, SMTP Settings, Subscription, Sign Out)
  - [x] State-driven view navigation across all features
- [ ] Add date range selector for stats
- [x] Add charts/graphs for metrics  (DashboardCharts component implemented with volume and success rate trend lines)
- [ ] Add export functionality
- [ ] Improve responsive design
- [ ] Add dark mode support

### User Education & Training UI
- [x] Welcome/Onboarding Flow  (OnboardingWizard component, Mar 3, 2026)
  - [x] Welcome modal on first launch 
  - [x] Multi-step onboarding wizard (5 steps) 
  - [x] Progress indicator for onboarding 
  - [x] Skip option with confirmation 
  - [x] Mark onboarding as complete in user preferences  (bm_onboarding_complete in chrome.storage.local)
- [ ] Interactive Product Tour
  - [ ] Spotlight/highlight key UI elements
  - [ ] Step-by-step feature walkthrough
  - [ ] Tooltip bubbles with next/previous buttons
  - [ ] Tour progress indicator
  - [ ] Re-trigger tour from help menu
- [x] In-App Help System (partial )
  - [x] Help icon/button in header/navigation  (❓ Help & Tips footer button in App.tsx, Mar 10, 2026)
  - [x] Contextual help tooltips (? icons)  (HelpTooltip component, Mar 3, 2026)
  - [ ] Search help articles (in-app)
- [ ] Tutorial Components
  - [ ] Template creation tutorial (guided mode)
  - [ ] Schedule setup tutorial (interactive)
  - [ ] Contact import tutorial (step-by-step)
  - [ ] Automation test tutorial (safe mode)
- [ ] Feature Discovery
  - [x] "Tips & Tricks" notification system  (FeatureTip component — dismissible contextual tip banners per-tab, persisted via `chrome.storage.local`)
- [ ] Embedded Help Resources
  - [ ] FAQ accordion component
  - [ ] Video tutorial player (embedded)
  - [ ] Help article preview cards
  - [ ] Support chat widget (optional)

### Template Management UI
- [x] TemplateCreator component
- [x] TemplateList component
- [x] TemplateGallery component
- [x] Add template preview
- [ ] Add drag-and-drop reordering
- [ ] Add template import/export
- [x] Add merge tag documentation/help (KeywordInserter component exists)
- [x] Add character count  (SegmentEditor shows `{length} / {maxLength} characters` per field — greeting 300, sentiment 1000, closing 300)
- [ ] Add template duplication

### Schedule Settings UI
- [x] ScheduleSettings component
- [ ] Add calendar view for schedules
- [ ] Add schedule preview (next run dates)
- [ ] Add bulk schedule operations
- [ ] Add schedule conflict warnings
- [ ] Add timezone configuration

### Automation UI
- [x] AutomationSettings component
- [x] Add automation status indicator  (shows Active/Inactive status, last check, next check times — loaded on mount; not WebSocket-pushed)
- [x] Add pause/resume automation  (Emergency Stop 🛑 with 24-hour cooldown + clear button, beyond simple enable/disable)
- [x] Add automation logs viewer  (collapsible Activity Log section with color-coded entries by level, clear-log button)
- [x] Add manual trigger button  (Run Check Now implemented)
- [x] Add Max Messages Per Run control  (numeric input wired to automation.setMaxMessages)
- [x] Add Clear Sent-Today button  (resets deduplication list for the day)
- [ ] Add automation test mode (dry run)
- [x] Improve error messaging  (error/success banners, emergency stop UI with red alerts, rate-limit warning text)

### Message Queue UI
- [x] MessageQueue component
- [ ] Add real-time status updates
- [x] Add bulk operations (select multiple)  (checkboxes, select-all, Retry Selected, Cancel Selected)
- [x] Add filtering by status  (status filter dropdown)
- [x] Add sorting by date  (sort direction toggle)
- [x] Add message preview modal 
- [x] Add retry all failed button 

### Message History UI
- [x] MessageHistory component
- [x] Add pagination  (server-side pagination with Prev/Next controls)
- [x] Add advanced search filters  (date range + status filter + search)
- [x] Add date range picker  (From/To date inputs wired to backend)
- [x] Add export to CSV  (current page exported as Blob download)
- [x] Add message details modal 
- [ ] Add graphs/charts for history

### Subscription UI
- [x] SubscriptionPanel component
- [x] Add plan comparison table  (side-by-side Monthly $4.99/mo vs Yearly $39.99/yr with savings badge; grid-based plan cards with pricing, cycle info, yearly equivalent, "CURRENT" badges)
- [x] Add payment method management  (delegated to Stripe billing portal via "Manage Payment Methods" button)
- [x] Add billing history  (delegated to Stripe billing portal via "View Billing History" button)
- [x] Add cancellation flow with feedback  (cancel button → confirmation modal with optional reason textarea (500 char limit), reactivation option for `cancel_at_period_end` subscriptions)
- [ ] Add proration preview for upgrades  (change-plan modal shows generic Stripe proration message but no calculated amount preview)
- [ ] Test Stripe checkout flow end-to-end

### Content Script (Facebook Automation)
- [x] Birthday friend detection (gatherBirthdayFriends in content/index.ts)
- [x] Message sending automation (sendMessageToFriend, sendComposedMessageToFriend, sendMessageFromProfile)
- [x] Timeline posting (timeline.ts — postToTimeline, submitPost with Enter-key fallback)
- [x] Messenger archiving (messenger.ts — archiveConversation)
- [x] Full automation loop (runFullAutomation — 2-phase: birthday feed + advance/follow-up contacts)
- [x] Gender-aware template + post selection (selectTemplate, selectPost with priority: exact → neutral → any)
- [x] Keyword resolution (resolveKeywords: [Tag Person] → name, [Today] → date, [Image] → stripped)
- [x] Advance/follow-up mode (days_in_advance > 0 early, < 0 follow-up; contacts matched by birthday MM-DD)
- [x] Deduplication (sent-today guard) (getSentToday/addToSentToday in utils/automation.ts)
- [x] Contact sync (upsert) (syncContactsFromFriends — create new + update existing by profile URL)
- [x] Full-screen automation overlay (showAutomationOverlay/hideAutomationOverlay)
- [x] Add anti-detection delays (randomDelay already implemented)
- [x] Add support for Facebook birthdays page  (openOrFocusFacebookBirthdaysTab opens /birthdays)
- [x] Add image attachment for timeline posts  (postToTimeline supports imageUrl)
- [x] Add Nifty Images merge tag replacement  (resolveKeywords + timeline.ts NiftyImages support)
- [ ] Improve friend detection reliability (handle Facebook UI changes)
- [ ] Add error recovery for automation failures
- [ ] Test with various Facebook layouts (mobile, desktop, different languages)
- [ ] Test archiving/unarchiving flow
- [ ] Add mutation observer stability improvements

### Background Service Worker
- [x] API client integration (background/index.ts has all API calls)
- [x] Token management (ensureTokens, refreshTokensFlow implemented)
- [x] Automation orchestration fully implemented (handleAutomationScan: fetches templates/posts/contacts, groups by days_in_advance, opens FB birthdays tab, dispatches automation.runFull)
- [x] Add alarm-based scheduling (chrome.alarms.create/onAlarm.addListener implemented in background/index.ts and utils/automation.ts)
- [x] Sent-today deduplication (getSentToday, addToSentToday, clearSentToday in utils/automation.ts)
- [x] Max messages config (maxMessages field in AutomationConfig, updateMaxMessages helper, threaded into automation payload)
- [x] New background message types (automation.recordSent, automation.setMaxMessages, automation.clearSentToday; failsafe category with 8 message types — 72 total message types)
- [ ] Add notification for automation status
- [ ] Add offline support (queue requests)
- [ ] Add crash recovery
- [ ] Test persistent state management
- [ ] Add update check and notification

### Contact Management UI ✨ **NEW** (Scaffolded Feb 11, 2026)
- [x] ContactList component - display, search, import, add, edit, delete
- [x] ContactForm component - add/edit contact with validation
- [x] Gender selector in ContactForm  (MALE / FEMALE / NEUTRAL — used by automation for template selection)
- [x] ImportContactsModal - import from JSON, VCF, CSV with drag-and-drop
- [x] BirthdayCalendar component - calendar and list views
- [x] Backend Contact model and router registered 
- [ ] Test contact CRUD operations end-to-end
- [ ] Test import functionality with sample files
- [ ] Add contact birthday reminders
- [ ] Add contact grouping/tagging

### Account Management UI ✨ **NEW** (Scaffolded Feb 11, 2026)
- [x] AccountManagement component - profile, timezone, logout, delete account
- [x] SMTPSettings component - SMTP configuration form
- [x] Backend SMTP router registered and separated 
- [x] Backend SMTPConfig model complete 
- [x] Backend API endpoint for profile updates  (`PUT /auth/profile` implemented — name/timezone stored in metadata)
- [x] Backend API endpoint for account deletion  (`DELETE /auth/account` implemented)
- [ ] Test profile update flow
- [ ] Test SMTP configuration end-to-end
- [x] Test account deletion with confirmation  (account deletion now requires `current_password` for security)

### Extension Quality
- [x] Add loading states for all API calls (implemented with Spinner component)
- [x] Add error handling for all user actions (errors.ts, Toast, ErrorBoundary)
- [x] Add input validation everywhere (email, password, content validation)
- [x] Add keyboard navigation support (implemented Feb 10, 2026)
- [x] Tab navigation with visible focus indicators
- [x] Keyboard shortcuts (Alt+H, Alt+D, Alt+L, Esc)
- [x] Skip links for keyboard users
- [x] Logical tab order throughout extension
- [x] Add accessibility (ARIA labels, semantic HTML) (implemented Feb 10, 2026)
- [x] WCAG 2.1 Level AA compliance
- [x] ARIA attributes (roles, labels, states, properties)
- [x] Screen reader support with live regions
- [x] Semantic HTML landmarks (header, main, nav, footer)
- [x] Form accessibility with proper labels and error associations
- [x] Focus management and trap focus utilities
- [x] Reduced motion and high contrast support
- [x] Accessibility utility functions
- [x] See ACCESSIBILITY.md for full documentation
- [x] Enhanced visual polish (in progress - Feb 10-11, 2026)
- [x] Dashboard component with modern styling (completed Feb 10)
- [x] Tab navigation with dropdown menus (completed Feb 11) 
- [x] Contact management UI scaffolded (completed Feb 11) 
- [x] Birthday Calendar UI scaffolded (completed Feb 11) 
- [x] SMTP Settings UI scaffolded (completed Feb 11) 
- [x] Account Management UI scaffolded (completed Feb 11) 
- [x] MessageQueue component enhancements  (bulk ops, status filter, sort, preview modal, retry all failed, Mar 3, 2026)
- [x] MessageHistory component enhancements  (pagination, date range, CSV export, details modal, Mar 3, 2026)
- [ ] TemplateCreator / TemplateGallery / TemplateList component enhancements
- [ ] AuthForm component enhancements
- [x] New UI components added (Mar 2026): DashboardStatsCard, FacebookPostPreview, FeatureTip, GenderFilter, HelpPanel, HomeControls, MessagesHub, PostEditor, PostList, SchedulingSettings
- [x] New utility modules added (Mar 2026): bridge.ts (background-content messaging), failsafe.ts, image.ts, logger.ts, messages.ts
- [x] New content-script modules added (Mar 2026): content/api.ts, content/dom-helpers.ts
- [ ] Add internationalization (i18n) support
- [ ] Test on different screen sizes
- [x] Test keyboard shortcuts (Alt+H, Alt+D, Alt+L, Esc implemented)
- [x] Add user onboarding flow (first-time setup)  (OnboardingWizard, Mar 3, 2026)

---

## 🚀 DevOps & Infrastructure

### Development Environment
- [x] Docker setup for backend (Dockerfile exists)
- [x] Docker compose configuration (docker-compose.yml with db + backend)
- [x] PostgreSQL 15 container configured
- [x] Database initialization with ddl.sql (mounted to /docker-entrypoint-initdb.d/)
- [x] Environment variable configuration (.env.example exists)
- [x] Health check endpoint (/health)

### Production Environment Setup
**Priority:** P0 - REQUIRED FOR LAUNCH  
**Status:** 🔴 Not Started

#### Cloud Infrastructure
- [ ] Choose cloud provider (AWS, GCP, Azure, DigitalOcean, Render, Fly.io)
- [ ] Set up production database (PostgreSQL 15+ managed service)
- [ ] Set up backend hosting (container service or VM)
- [ ] Set up domain and SSL certificates
- [ ] Set up CDN (if needed for static assets)
- [ ] Set up object storage for images (S3, R2, etc.)

#### Database Production Setup
- [ ] Create production database cluster
- [ ] Configure connection pooling (PgBouncer or similar)
- [ ] Set up automatic backups (daily minimum)
- [ ] Test backup restore procedure
- [ ] Set up replica for read queries (optional)
- [ ] Configure database monitoring and alerts
- [ ] Run `alembic upgrade head` against production database
- [ ] Verify all tables and indexes created

#### Backend Production Deployment
- [ ] Build production Docker image
- [ ] Push image to container registry (Docker Hub, ECR, GCR)
- [ ] Deploy container to production environment
- [ ] Configure environment variables (.env production values)
- [ ] Set up secrets management (AWS Secrets Manager, Vault, etc.)
- [ ] Configure health check endpoint
- [ ] Set up HTTPS/TLS (Let's Encrypt or managed certificates)
- [ ] Configure reverse proxy (nginx, Caddy, or cloud load balancer)
- [ ] Test API accessible from internet

#### Environment Configuration
- [x] Create .env.production template  (all env vars documented with generation instructions)
- [ ] Set production JWT_SECRET_KEY (generate strong random key)
- [ ] Configure production DATABASE_URL
- [ ] Set production Stripe keys (live mode)
- [ ] Configure Stripe webhook endpoint (with live secret)
- [ ] Set production CORS_ORIGINS (published extension ID)
- [ ] Configure email service for production  SendGrid SDK integrated; needs production API key + domain verification
- [ ] Set LOG_LEVEL to WARNING or ERROR

### Monitoring & Observability
**Priority:** P1 - LAUNCH REQUIREMENT  
**Status:** 🔴 Not Started

- [ ] Set up application logging (structured logs)
- [ ] Set up log aggregation (CloudWatch, GCP Logs, Datadog, etc.)
- [ ] Set up error tracking (Sentry, Rollbar, etc.)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, etc.)
- [ ] Set up performance monitoring (APM)
- [ ] Create alerting rules:
  - [ ] API downtime alert
  - [ ] Database connection failure
  - [ ] High error rate (>5% 5xx responses)
  - [ ] Slow response times (>2s p95)
  - [ ] Failed payments
  - [ ] Email delivery failures
- [ ] Set up metrics dashboard (Grafana, Datadog, etc.)
- [ ] Add business metrics tracking:
  - [ ] Daily active users
  - [ ] Messages sent per day
  - [ ] Subscription conversions
  - [ ] Churn rate

### CI/CD Pipeline
**Priority:** P1 - REQUIRED FOR SUSTAINABLE DEVELOPMENT  
**Status:** 🔴 Not Implemented (No .github/workflows directory exists)

#### Backend CI/CD
- [ ] Set up Gitea Actions (or GitLab CI, CircleCI)
- [ ] Add automated testing on PR:
  - [ ] Run pytest for all tests
  - [ ] Run linting (ruff, black, mypy)
  - [ ] Check code coverage (>80% target)
- [ ] Add automated build on merge to main:
  - [ ] Build Docker image
  - [ ] Tag with git commit SHA
  - [ ] Push to container registry
- [ ] Add automated deployment:
  - [ ] Deploy to staging environment
  - [ ] Run integration tests
  - [ ] Deploy to production (manual approval or auto)
- [ ] Add rollback mechanism

#### Extension CI/CD
- [x] Set up frontend CI pipeline:  (.gitea/workflows/frontend-ci.yaml — Mar 18, 2026)
  - [x] Run TypeScript compilation check
  - [x] Run ESLint
  - [x] Run Prettier check
  - [x] Run npm build
- [x] Add automated extension packaging:  (Mar 18, 2026)
  - [x] Build extension zip
  - [x] Upload to artifacts
- [ ] Add Chrome Web Store publishing:
  - [ ] Set up Web Store API credentials
  - [ ] Automate version bumping
  - [ ] Submit for review (manual approval)

### Security & Compliance
- [x] Run security audit on dependencies (npm audit, safety)  (npm audit --audit-level=high in frontend-ci.yaml — Mar 18, 2026; picomatch high-severity vulnerability fixed via `npm audit fix` — Mar 26, 2026)
- [ ] Set up dependency vulnerability scanning
- [x] Add OWASP security headers  (7 headers via `SecurityHeadersMiddleware` — HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, Permissions-Policy, Cache-Control — Mar 14 + Mar 26, 2026)
- [x] Implement GDPR compliance features:  (Mar 18, 2026)
  - [x] User data export  (GET /auth/data-export returns JSON with all user data)
  - [x] User data deletion (right to be forgotten)  (DELETE /auth/account already implemented)
  - [x] Privacy policy  (extension/privacy-policy.html)
  - [x] Terms of service  (extension/terms-of-service.html)
  - [ ] Cookie consent (if using tracking)
- [ ] Create security incident response plan
- [ ] Set up bug bounty program (optional, post-launch)

### Performance & Scalability
- [ ] Load test backend (simulate 100+ concurrent users)
- [ ] Set up auto-scaling rules (if using cloud)
- [ ] Optimize database queries (add indexes, query plans)
- [ ] Set up caching layer (Redis) if needed
- [ ] Configure CDN for static assets
- [ ] Test database backup/restore speed
- [ ] Plan for horizontal scaling (multiple backend instances)

### Documentation
- [ ] Create production deployment guide
- [ ] Document environment variable requirements
- [ ] Document backup/restore procedures
- [ ] Document rollback procedures
- [ ] Create runbook for common issues:
  - [ ] Database connection failures
  - [ ] API downtime
  - [ ] Stripe webhook failures
  - [ ] Email delivery issues
- [ ] Create on-call rotation guide
- [ ] Document monitoring dashboard access

---

## 🧪 Testing

### Backend Testing
**Priority:** P1 - REQUIRED FOR CONFIDENCE  
**Status:**  Expanded Coverage (~91 tests across 11 files; unit + API integration tests; conftest.py with shared async fixtures)

#### Unit Tests
- [x] Basic auth tests (test_auth.py — 9 tests: access token type, refresh token validation, refresh token JTI presence, session_id in access token, token rotation/revocation, revoke endpoint, concurrent refresh reuse detection, login creates session + list endpoint marks current, revoke session blocks access — Mar 19, 2026)
- [x] Basic template tests (test_templates.py — 2 tests: empty segment validation, message composition)
- [x] Add tests for schedules router  (test_schedules.py — 9 tests)
- [x] Add tests for messages router  (test_messages.py — 17 tests: queue list/create/update/cancel/retry, history pagination/search/status-filter/date-range/delete)
- [x] Add tests for dashboard router  (test_dashboard.py — 5 tests)
- [x] Add tests for subscription router  (`test_subscription.py` — 13 tests: status no-sub/active/grace-period/past-due, cancel, reactivate, change-plan same+upgrade, billing-portal, change-plan no-active-sub — Mar 2026)
- [x] Add tests for webhook router  (`test_webhook.py` — 10 tests: missing sig, invalid sig, unhandled event, subscription.created, subscription.updated cancel/plan-change, subscription.deleted, payment.failed, no-subscription, unknown customer — Mar 2026)
- [x] Add tests for email verification service  (`test_email_verification.py` — 9 tests: create token, store hash, verify valid/invalid/expired, mark used, used-token-blocked, request endpoint triggers send, verify endpoint marks verified — Mar 18, 2026)
- [x] Add tests for password reset service  (test_password_reset.py — 7 tests)
- [ ] Target: >80% code coverage

#### Integration Tests
- [ ] Test full auth flow (register → login → refresh → change password)
- [ ] Test password reset flow (request → email → reset)
- [ ] Test template CRUD flow
- [ ] Test schedule creation and execution
- [ ] Test message queue flow (create → send → history)
- [ ] Test Stripe subscription flow (checkout → webhook → status)
- [ ] Test webhook signature verification
- [ ] Test token expiration and refresh

#### Database Tests
- [ ] Test migrations (up and down)
- [ ] Test foreign key constraints
- [ ] Test cascade deletes
- [ ] Test unique constraints
- [ ] Test enum constraints
- [ ] Test concurrent operations

#### API Contract Tests
- [ ] Test all endpoints return correct status codes
- [ ] Test all endpoints validate required fields
- [ ] Test all endpoints return correct schema
- [ ] Test pagination works correctly
- [ ] Test filtering works correctly
- [ ] Test sorting works correctly

### Frontend/Extension Testing
**Priority:** P1 - USER EXPERIENCE CRITICAL  
**Status:**  Comprehensive — ~271 tests across 14 files, all passing (Mar 24, 2026)

**Setup complete (Feb 25, 2026):**
-  Vitest + jsdom + @testing-library/react installed
-  `vitest.config.ts` configured with jsdom environment, coverage thresholds (70% lines/functions)
-  `src/test-setup.ts` — global Chrome API stub (storage.local Promise + callback dual-mode, alarms, runtime)
-  Test scripts added: `npm test`, `npm run test:watch`, `npm run test:coverage`
-  13 test files, 251 tests, all passing (verified Mar 17, 2026)

#### Unit Tests
- [x] Add Jest/Vitest configuration  (Vitest + jsdom, Feb 25, 2026)
- [x] Test API client functions  (`src/api/__tests__/client.test.ts` — 7 tests: ApiError, login, auth headers)
- [x] Test storage utilities  (`src/utils/__tests__/storage.test.ts` — 9 tests: tokens, backend URL)
- [x] Test message composition logic  (`src/utils/__tests__/message.test.ts` — 22 tests: shufflePick, composeMessage, selectTemplate, selectPost, resolveKeywords, assembleMessageFromTemplate)
- [x] Test automation utilities  (`src/utils/__tests__/automation.test.ts` — 22 tests: config, dedup, alarms, delays)
- [x] Test error handling utilities  (`src/utils/__tests__/errors.test.ts` — 30 tests: error hierarchy, parseApiError, getErrorMessage, isRetryableError, validation)

#### Component Tests
- [x] Test Spinner component  (renders, size prop, optional message — moved to `components.test.tsx`, Mar 2026)
- [x] Test Toast component  (renders, auto-close, manual close, all types — `components.test.tsx`)
- [x] Test ErrorBoundary component  (catches errors, custom fallback, try-again button — `components.test.tsx`)
- [x] Test AuthForm component  (login/register toggle, inputs, validation display, spinner on submit, message display, forgot-password link — `components.test.tsx`)
- [x] Test Dashboard component  (`src/popup/__tests__/Dashboard.test.tsx` — 12 tests: loading/error/stats/automation-status/refresh, Feb 25, 2026)
- [x] Test TemplateCreator component  (`src/popup/__tests__/TemplateCreator.test.tsx` — 14 tests: form fields, validation, submit/cancel/preview, gender select, initialData, Feb 25, 2026)
- [x] Test MessageQueue component  (`src/popup/__tests__/MessageQueue.test.tsx` — 19 tests: status filter, sort, bulk ops, retry-all-failed, preview modal, Mar 3, 2026)
- [x] Test TemplateGallery component  (`src/popup/__tests__/TemplateGallery.test.tsx` — 22 tests: template rendering, badges, edit/delete actions, Feb 25, 2026)
- [x] Test MessageHistory component  (`src/popup/__tests__/MessageHistory.test.tsx` — 51 tests: date range, CSV export, details modal, pagination, Mar 3, 2026)
- [x] Test HelpTooltip component  (`src/popup/__tests__/HelpTooltip.test.tsx` — 10 tests: render, hover/focus show/hide, accessibility, Mar 3, 2026)
- [x] Test OnboardingWizard component  (`src/popup/__tests__/OnboardingWizard.test.tsx` — 14 tests: navigation, step content, progress bar, complete/skip, Mar 3, 2026)
- [ ] Test all form validation
- [ ] Test error states
- [ ] Test loading states

#### Integration Tests
- [ ] Test login flow end-to-end
- [ ] Test template creation flow
- [ ] Test message sending flow
- [ ] Test subscription flow
- [ ] Test content script automation

#### E2E Tests (Critical User Flows)
- [ ] Set up Playwright or Puppeteer
- [ ] Test: Install extension → register → login
- [ ] Test: Create template → save → use in message
- [ ] Test: Subscribe → verify active → cancel
- [ ] Test: Add schedule → verify in queue
- [ ] Test: Automation scan → detect birthdays → send messages
- [ ] Test: View message history → filter → export

#### Browser Compatibility
- [ ] Test in Chrome (latest stable)
- [ ] Test in Chrome (previous version)
- [ ] Test in Chromium-based browsers (Edge, Brave)
- [ ] Test on different operating systems (Windows, macOS, Linux)

### Manual Testing Checklist (Pre-Launch)
- [ ] Fresh install and onboarding flow
- [ ] All forms submit correctly
- [ ] All validation messages display correctly
- [ ] Error handling works (network errors, invalid inputs)
- [ ] Loading states display correctly
- [ ] Extension popup renders correctly
- [ ] Content script detects birthdays on Facebook
- [ ] Messages send correctly on Facebook
- [ ] Timeline posts work correctly
- [ ] Archiving works correctly
- [ ] Stripe checkout completes successfully
- [ ] Webhook updates subscription status
- [ ] Password reset email delivers and works
- [ ] Token refresh works automatically
- [ ] Logout works correctly
- [ ] Analytics/stats display correctly

---

## 📋 Chrome Web Store Listing

### Pre-Submission Requirements
**Priority:** P0 - REQUIRED FOR PUBLICATION  
**Status:** 🔴 Not Started

- [ ] Build production extension (npm run build)
- [ ] Test built extension thoroughly
- [ ] Create Chrome Web Store developer account ($5 one-time fee)
- [ ] Prepare extension listing (Legacy extension already exists in Chrome Web Store, the new build must replace it as an updated version/rebrand):
  - [ ] Extension name and description (detailed)
  - [ ] Short description (132 chars max)
  - [ ] Category selection
  - [ ] Privacy policy URL (required)
  - [ ] Support email
- [ ] Create promotional images:
  - [ ] Small tile icon (128x128)
  - [ ] Large tile icon (440x280)
  - [ ] Marquee image (1400x560)
  - [ ] Screenshots (1280x800 or 640x400, 5 max recommended)
- [ ] Create interactive tutorial
- [ ] Prepare permissions justification document
- [ ] Review and comply with Chrome Web Store Program Policies

### Privacy & Permissions
- [x] Write privacy policy (required):  (extension/privacy-policy.html — Mar 18, 2026)
  - [x] Explain data collection
  - [x] Explain data usage
  - [x] Explain data sharing (if any)
  - [x] Explain user rights (access, deletion)
- [x] Justify each permission:  (all 6 permissions table in privacy-policy.html — Mar 18, 2026)
  - [x] `storage` - Save user preferences and auth tokens
  - [x] `scripting` - Inject content scripts on Facebook
  - [x] `activeTab` - Access current tab for automation
  - [x] `tabs` - Query Facebook tabs for automation
  - [x] `alarms` - Schedule periodic birthday checks
  - [x] `host_permissions` (facebook.com) - Automate birthday messages
- [x] Add "What's New" section for updates  (WhatsNew.tsx modal, version-gated via chrome.storage.local — Mar 18, 2026)

---

## 📝 Documentation

### User Documentation
- [ ] Create comprehensive user guide (how to use extension):
  - [ ] Installation instructions (Chrome Web Store)
  - [ ] Setup wizard walkthrough (step-by-step)
  - [x] Quick start guide (5-minute setup)  (extension/quick-start.html — Mar 18, 2026)
  - [ ] Creating templates guide (with examples)
  - [ ] Using merge tags and personalization
  - [ ] Setting up schedules (timing strategies)
  - [ ] Understanding automation (how it works)
  - [ ] Managing message queue and history
  - [ ] Contact management (import/export)
  - [ ] Timeline posts and image customization
  - [ ] SMTP configuration (for notifications)
  - [ ] Subscription plans explanation and comparison
  - [x] Troubleshooting common issues  (extension/troubleshooting.html — Mar 18, 2026)
  - [ ] Best practices for engagement
  - [ ] Privacy and permissions explanation
- [x] Create FAQ document  (extension/faq.html — Mar 18, 2026)
  - [x] What data does the extension collect?
  - [x] How does automation work?
  - [x] Why do I need a subscription?
  - [x] How do I cancel my subscription?
  - [x] How do I pause automation?
  - [x] What happens if Facebook changes its layout?
  - [x] How do I import contacts?
  - [x] How do I reset my password?
  - [x] What are merge tags?
  - [x] Can I have multiple templates?
  - [x] Why didn't a message send on a friend's birthday?
- [ ] Create interactive tutorials (in-app)
  - [ ] Product tour on first login
  - [ ] Template creation wizard
  - [ ] Schedule setup wizard
  - [ ] Contact import wizard

### Developer Documentation
- [x] SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md (comprehensive)
- [x] DEVELOPMENT_GUIDE.md (setup instructions)
- [x] BACKEND_TESTING_GUIDE.md (API testing)
- [x] BACKEND_INTEGRATION_SUMMARY.md (Phase 1 implementation)
- [x] API_ENDPOINTS_NEW_FEATURES.md (Phase 2 features)
- [ ] Add API reference documentation (Swagger/OpenAPI)
- [ ] Add code commenting for complex logic
- [ ] Add architecture decision records (ADRs)
- [ ] Add troubleshooting guide for developers

### Operations Documentation
- [ ] Create deployment guide (step-by-step production setup)
- [ ] Create monitoring guide (where to look for issues)
- [ ] Create incident response guide (what to do when things break)
- [ ] Create backup/restore guide
- [ ] Create scaling guide (how to handle growth)

---

## 🎯 MVP Definition & Launch Criteria

### What Makes This an MVP?

**Core Value Proposition:**
> "Users can automatically send personalized birthday messages to Facebook friends with minimal effort, powered by a subscription-based service."

**Must-Have Features for MVP:**
1. ✅ User account creation and authentication (implemented in auth router)
2. ✅ Password reset via email (SendGrid fully configured Mar 14, 2026 — `EMAIL_FROM_ADDRESS`, `PASSWORD_RESET_URL_BASE`, and `SENDGRID_API_KEY` all in `config.py` Settings)
3. ✅ Create and manage message templates (full CRUD implemented)
4. ✅ Set up birthday schedules (days before/after) (full CRUD implemented)
5. ✅ Automated birthday detection on Facebook (gatherBirthdayFriends implemented)
6. ✅ Automated message sending (sendMessageToFriend implemented)
7. ✅ Message queue management (full CRUD implemented)
8. ✅ Message history tracking (list, search, delete implemented)
9. ✅ Subscription payment via Stripe (checkout session + webhook implemented)
10. ✅ Basic dashboard with statistics (getDashboardStats implemented)
11. ✅ Backend-frontend integration (API paths aligned, schemas consistent, DELETE standardized) 

**Launch Blockers (Must Complete):**
- [x] Fix database schema (ddl.sql completeness)  Resolved
- [x] Fix backend-frontend integration (API paths, schemas, methods)  Resolved (Phases 1-3)
- [x] Standardize DELETE responses across API  Resolved
- [x] Align database schema with models (post fonts, gender enum)  Resolved
- [x] Register all Phase 2 routers  Resolved
- [x] Implement email service for password reset  (SendGrid, Mar 9, 2026)
- [ ] Deploy backend to production
- [ ] Deploy database to production
- [ ] Configure production Stripe webhooks
- [ ] Build and test extension in production mode
- [ ] Publish extension to Chrome Web Store
- [ ] Test end-to-end user flow in production
- [ ] Set up monitoring and alerts
- [x] Create privacy policy and terms of service  (extension/privacy-policy.html + extension/terms-of-service.html — Mar 18, 2026)
- [x] Create minimal user documentation:  (Mar 18, 2026)
  - [x] Quick start guide (5-minute setup)  (extension/quick-start.html)
  - [x] Basic FAQ (10-15 common questions)  (extension/faq.html)
  - [x] Troubleshooting guide (common issues)  (extension/troubleshooting.html)
- [x] Implement basic onboarding flow:  (Mar 3, 2026)
  - [x] Welcome screen on first launch 
  - [x] Essential setup wizard (templates + schedule) 
  - [x] Contextual help tooltips on key features 

**Post-MVP (Can Launch Without):**
- Image upload/storage implementation (currently URL-based)
- Advanced analytics and reporting
- Mobile app
- Support for other social networks
- Advanced automation features
- Referral program
- Template preview and bulk operations
- Advanced testing coverage
- Interactive product tours and advanced training
- Video tutorials and comprehensive help center
- In-depth user guides and best practices documentation

### Success Metrics for MVP Launch
- [ ] Define success metrics:
  - [ ] Number of registered users (target: 100 in first month)
  - [ ] Number of paid subscribers (target: 10 in first month)
  - [ ] Number of messages sent (target: 1000 in first month)
  - [ ] Extension retention rate (target: >50% weekly active)
  - [ ] Customer support tickets (target: <5% of users)
  - [ ] Onboarding completion rate (target: >70%)
  - [ ] Time to first message sent (target: <10 minutes)
  - [ ] User activation rate (completed setup + sent 1st message)
- [ ] Set up analytics tracking for metrics
- [ ] Create dashboard to monitor metrics

---

## 📊 Priority Matrix

### Now 
1. 🔴 Deploy production infrastructure
2. ✅ Write privacy policy and terms  (completed Mar 18, 2026)
3. 🔴 End-to-end testing
4. ✅ Create quick start guide, FAQ, and troubleshooting guide  (completed Mar 18, 2026)
5. ✅ Email verification system  (completed Mar 18, 2026)
6. ✅ User session management  (completed Mar 19, 2026)
7. ✅ Subscription management (cancel/reactivate/change-plan/billing-portal)  (completed Mar 2026)

### Soon 
1. 🟡 CI/CD pipeline setup
2. 🟡 Monitoring and alerting
3. 🟡 Chrome Web Store submission
4. ~~User documentation (FAQ, troubleshooting)~~  ✅ Completed Mar 18, 2026
5. 🟡 Load testing

### Later 
1. 🟢 Phase 2 feature enhancements (image upload/storage, advanced testing, frontend integration)
2. 🟢 Advanced testing (E2E, performance)
3. 🟢 Mobile app
4. 🟢 Analytics improvements
5. 🟢 Internationalization
6. 🟢 Comprehensive training materials (video tutorials, interactive tours)
7. 🟢 Advanced help center and knowledge base

### Nice to Have
1. ⚪ Dark mode
2. ⚪ Referral program
3. ⚪ Advanced automation features
4. ⚪ Social network integration beyond Facebook
5. ⚪ AI-powered message suggestions

---

## 🚦 Current Blockers & Dependencies

### Critical Blockers
1. **Production Infrastructure** — No cloud provider, domain, or managed PostgreSQL set up yet
2. ~~**Privacy Policy & Terms of Service** — Required for Chrome Web Store submission~~  ✅ Created Mar 18, 2026
3. ~~**Email Verification** — Users could register with unverified emails~~  ✅ Implemented Mar 18, 2026
4. ~~**Session Management** — No way to view or revoke active login sessions~~  ✅ Implemented Mar 19, 2026

### External Dependencies
1. **Stripe Account** — Required for payments (can use test mode for now)
2. **Cloud Provider** — Required for production hosting
3. **Chrome Web Store Account** — Required for extension publishing ($5 fee)
4. **Domain Name** — Required for production API (if using custom domain)

### Technical Debt
1. Backend test coverage at ~91 tests across 11 files (auth 9, contacts 10, messages 17, password_reset 7, dashboard 5, schedules 9, templates 2, subscription 13, webhook 10, email_verification 9); target >80% coverage remaining (smtp, birthday_configs, message_groups, posts, images still untested)
2. ~~No CI/CD pipeline~~  Frontend CI pipeline created (.gitea/workflows/frontend-ci.yaml)
3. No production monitoring or error tracking service
4. Image upload/storage not implemented (URL-based currently)
5. ~~No comprehensive help documentation or FAQ~~  Quick Start, FAQ, and Troubleshooting Guide created (extension/quick-start.html, faq.html, troubleshooting.html — Mar 18, 2026)
6. ~~SMTP passwords encrypted at rest using Fernet symmetric encryption; API responses masked~~  Resolved
7. `/send-birthday-message` backend endpoint is a non-functional stub (content scripts handle actual sending)
8. No content script or background service worker tests
9. Frontend CSV export is client-side only (browser Blob); backend `GET /api/messages/history/export` endpoint exists but is not called by the frontend

---

## 📞 Next Steps

### Immediate Actions (This Week)
1. [ ] Verify SendGrid email delivery end-to-end in development
2. [ ] Start production infrastructure setup (cloud provider, managed PostgreSQL)
3. [ ] Increase backend test coverage (integration tests for auth, templates, contacts)

### Short Term (Next 2 Weeks)
1. [ ] Complete production deployment (container hosting, domain, TLS)
2. [x] Write privacy policy and terms of service  (extension/privacy-policy.html + extension/terms-of-service.html — Mar 18, 2026)
3. [ ] Create Chrome Web Store listing
4. [ ] Set up monitoring and alerting
5. [ ] Run end-to-end testing
6. [x] Create quick start guide (5-minute setup)  (extension/quick-start.html — Mar 18, 2026)
7. [x] Draft basic FAQ (10-15 questions)  (extension/faq.html — Mar 18, 2026)

### Medium Term
1. [ ] Submit to Chrome Web Store
2. [ ] Set up CI/CD pipeline
3. [ ] Add content script and background worker tests
4. [ ] Complete user documentation (guides, FAQ, troubleshooting)
5. ~~Encrypt SMTP passwords at rest~~  Already done (Fernet encryption in `encryption.py`)
6. [ ] Launch to small beta group

---

## Notes

- This checklist assumes you're targeting a production launch
- Prioritize based on your team size and timeline
- MVP should be minimal but functional and polished
- Monitor user feedback closely after launch
- Iterate quickly based on user needs
- Consider soft launch with beta testers before public launch

**Last Updated:** March 24, 2026
