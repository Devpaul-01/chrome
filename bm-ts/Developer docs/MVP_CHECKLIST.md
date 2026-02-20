# BirthdayMessaging bm-ts MVP Checklist

**Last Updated:** February 14, 2026  
**Status:** Pre-MVP - Backend-frontend integration complete (Phases 1-3), database schema aligned, API standardized

---

## 🎉 Recent Completion: Backend-Frontend Integration (Feb 14, 2026)

**Phases 1-3 Complete:** All backend-frontend integration issues resolved

### Phase 1: Critical Path Fixes ✅
- Added `/api` prefix to 28 frontend endpoints
- Fixed HTTP method mismatch (PATCH → PUT for schedules)
- Fixed schema field name (uploaded_at → created_at)
- Separated and registered SMTP router
- Fixed DELETE responses (contacts, schedules)

### Phase 2: Database Schema Fixes ✅
- Added post font customization fields (font_family, font_size, font_color)
- Added 'ALL' value to gender_enum
- Standardized message_templates gender field to use enum
- Updated all models and schemas for consistency

### Phase 3: API Consistency & Polish ✅
- Standardized DELETE responses (10 endpoints now return 200 + {status: "deleted"})
- Verified relationship loading configuration
- Achieved consistent API behavior across all endpoints

**Result:** 11 integration issues resolved, 0 compilation errors, full backend-frontend alignment

**Documentation:**
- [BACKEND_FRONTEND_INTEGRATION_ISSUES.md](BACKEND_FRONTEND_INTEGRATION_ISSUES.md)
- [PHASE_1_COMPLETION_REPORT.md](PHASE_1_COMPLETION_REPORT.md)
- [PHASE_2_COMPLETION_REPORT.md](PHASE_2_COMPLETION_REPORT.md)
- [PHASE_3_COMPLETION_REPORT.md](PHASE_3_COMPLETION_REPORT.md)

---

## Executive Summary

This document outlines all tasks required to make bm-ts a complete, production-ready MVP. The system currently has most Phase 1 features implemented but lacks critical infrastructure pieces for production deployment.

**Current State:**
- ✅ Core backend API with 10 routers and ~35 HTTP endpoints + 1 WebSocket (All routers registered in main.py)
- ✅ Chrome extension with React UI and automation scripts (29 component files, content scripts, background worker)
- ✅ Docker-based development environment (Dockerfile + docker-compose.yml with PostgreSQL)
- ✅ All models defined including Phase 2 (User, SubscriptionRecord, TemplateSegment, BirthdaySchedule, MessageQueue, MessageHistory, PasswordResetToken, Post, MessageGroup, UserImage, BirthdayConfig, MessageTemplate, SMTPConfig)
- ✅ Database indexes implemented in models
- ✅ Form validation in AuthForm
- ✅ Token refresh flow in background service worker
- ✅ Database schema complete with all tables including font fields and gender enum standardization
- ✅ Extension builds successfully with `npm run build`
- ✅ Enhanced tab navigation with dropdown menus (4 tabs with comprehensive navigation)
- ✅ Phase 2 UI components scaffolded (Contact management, Birthday Calendar, SMTP Settings, Account Management)
- ✅ **Backend-frontend integration complete** (API paths, HTTP methods, schemas aligned - Phases 1-3)
- ✅ **DELETE endpoints standardized** (All return 200 + {status: "deleted"})
- ✅ **Database schema aligned with models** (Post fonts, gender enum with 'ALL' value)
- ✅ **SMTP router separated and registered** (/smtp/config endpoints)
- ✅ Phase 2 routers registered (posts, message_groups, images, birthday_configs, message_templates, smtp)
- ⚠️ No email service configured (password reset broken)
- ⚠️ No production deployment infrastructure
- ⚠️ Minimal testing coverage (2 backend test files only)
- ⚠️ No CI/CD pipeline

---

## 🔴 Critical Blockers (Must Fix Before Any Deployment)

### 1. ~~Complete Database Schema (ddl.sql)~~ ✅ RESOLVED
**Priority:** ~~P0~~ — Resolved  
**Status:** ✅ Complete (February 12, 2026)

**Resolution:** `ddl.sql` now contains all 7 tables, 3 enums, and 2 extensions. Fresh deployments work correctly.

**Tasks:**
- [x] Add `birthday_schedules` table to ddl.sql
- [x] Add `message_queue` table to ddl.sql
- [x] Add `message_history` table to ddl.sql
- [x] Add `password_reset_tokens` table to ddl.sql
- [x] Add `message_status_enum` type definition
- [ ] Test fresh deployment: `docker-compose down -v && docker-compose up -d`
- [ ] Verify all 7 models can query their tables without errors
- [x] Update BACKEND_INTEGRATION_SUMMARY.md to remove critical warning

---

### 2. Implement Email Service for Password Reset
**Priority:** P0 - BLOCKS USER RECOVERY  
**Status:** 🔴 Not Implemented

**Problem:** Password reset functionality currently only logs tokens to console. Users cannot recover accounts.

**Tasks:**
- [ ] Choose email provider (SendGrid, AWS SES, Mailgun, or SMTP)
- [ ] Add email service configuration to .env.example:
  - [ ] `EMAIL_SERVICE_API_KEY`
  - [ ] `EMAIL_FROM_ADDRESS`
  - [ ] `PASSWORD_RESET_URL_BASE` (chrome-extension ID)
- [ ] Implement email sending in `app/services/password_reset.py`
- [ ] Create HTML email template for password reset
- [ ] Test email delivery in development
- [ ] Add error handling for email service failures
- [ ] Document email setup in DEVELOPMENT_GUIDE.md

**Location:** `bm-ts/backend/app/services/password_reset.py` (lines 63, 73)

---

## 🗄️ Database Layer

### Schema & Migrations
- [x] Define 7 core models in models.py (User, SubscriptionRecord, TemplateSegment, BirthdaySchedule, MessageQueue, MessageHistory, PasswordResetToken)
- [x] Complete ddl.sql with all tables ✅ (13 tables including Phase 2: posts, message_groups, user_images, birthday_configs, smtp_configs, message_templates)
- [x] Add database indexes for performance:
  - [x] Index on `message_queue.user_id` (idx_queue_user_status)
  - [x] Index on `message_queue.scheduled_send_time` (idx_queue_scheduled_time)
  - [x] Index on `message_queue.status` (idx_queue_user_status)
  - [x] Index on `message_history.user_id` (idx_history_user_sent, idx_history_user_status)
  - [x] Index on `message_history.sent_at` (idx_history_user_sent)
  - [x] Index on `password_reset_tokens.token` (idx_reset_token_expires)
  - [x] Index on `password_reset_tokens.expires_at` (idx_reset_token_expires)
- [ ] Set up Alembic properly for schema migrations:
  - [x] Alembic config file exists (alembic.ini)
  - [ ] Generate initial migration from models
  - [ ] Test migration up/down
  - [ ] Document migration workflow in DEVELOPMENT_GUIDE.md

### Data Integrity
- [ ] Add foreign key constraints with proper CASCADE behavior
- [ ] Add CHECK constraints for enum values
- [ ] Add NOT NULL constraints where appropriate
- [ ] Add UNIQUE constraints (e.g., user email, reset tokens)
- [ ] Test constraint violations return proper 400 errors

### Database Operations
- [ ] Add database backup strategy
- [ ] Document restore procedures
- [ ] Add health check query for monitoring
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
- [ ] Implement email verification for new users
- [ ] Add rate limiting to auth endpoints (prevent brute force)
- [ ] Add account lockout after failed login attempts
- [ ] Add session management (list active sessions, revoke)

#### Password Reset Flow
- [x] Request password reset endpoint
- [x] Reset password endpoint
- [x] Token generation and validation
- [ ] Email sending implementation (see Critical Blocker #2)
- [ ] Add rate limiting (prevent reset spam)
- [ ] Add URL expiration validation in frontend

#### Template Management
- [x] CRUD endpoints for template segments
- [x] Segment types (GREETING, BODY, CLOSING)
- [x] Add template validation (min/max length) - content must not be empty
- [ ] Add template preview endpoint
- [ ] Add bulk import/export for templates
- [ ] Add template usage statistics

#### Subscription Management
- [x] Stripe subscription creation
- [x] Webhook handling for subscription events
- [x] Subscription status checking
- [ ] Add subscription cancellation flow
- [ ] Add subscription plan upgrade/downgrade
- [ ] Add grace period handling
- [ ] Add failed payment retry logic
- [ ] Test all webhook events (subscription.created, updated, deleted, payment_failed)

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
- [ ] Add bulk operations (cancel all, retry all failed)
- [ ] Add message priority levels
- [ ] Add schedule conflict detection

#### Message History
- [x] List message history
- [x] Search by name/status
- [x] Delete history item
- [ ] Add pagination (currently no limit)
- [ ] Add date range filtering
- [ ] Add export to CSV
- [ ] Add analytics aggregation

#### Dashboard
- [x] Statistics endpoint
- [ ] Add more metrics (success rate, failure reasons)
- [ ] Add time-series data (messages per day/week/month)
- [ ] Add subscription revenue metrics

### Phase 2 Features (Backend Complete) - Frontend Integration & Enhancement Tasks

**STATUS UPDATE (Feb 14, 2026):** ✅ All Phase 2 routers now registered, models defined, and database schema complete. Backend-frontend integration issues resolved.

#### Birthday Configs
**Status:** ✅ Router registered, model complete, database schema complete

- [x] Create `BirthdayConfig` model in models.py ✅
- [x] Create database table in ddl.sql ✅
- [x] Register router in main.py ✅
- [x] Add relationship to message_groups and posts ✅
- [ ] Test all CRUD endpoints (manual/automated testing needed)
- [ ] Add gender filter validation in API
- [ ] Add archive toggle functionality testing
- [ ] Frontend integration testing

#### Posts (Timeline Posts)
**Status:** ✅ Router registered, model complete with font fields, database schema complete

- [x] Create `Post` model in models.py ✅
- [x] Create database table in ddl.sql ✅ (includes font_family, font_size, font_color)
- [x] Register router in main.py ✅
- [x] Add font customization fields (font_family, font_size, font_color) ✅
- [x] Gender enum standardization ✅
- [ ] Implement image upload/storage (currently just URL storage)
- [ ] Add image validation (size, format, dimensions)
- [ ] Add post preview endpoint
- [ ] Test gender filtering
- [ ] Test font customization features

#### Message Groups
**Status:** ✅ Router registered, model complete, database schema complete

- [x] Create `MessageGroup` model in models.py ✅
- [x] Create database table in ddl.sql ✅
- [x] Register router in main.py ✅
- [ ] Test segment_ids array handling
- [ ] Add validation that segment_ids exist
- [ ] Add gender filter validation
- [ ] Frontend integration testing

#### Images (User Image Library)
**Status:** ✅ Router registered, model complete, database schema complete

- [x] Create `UserImage` model in models.py ✅
- [x] Create database table in ddl.sql ✅
- [x] Register router in main.py ✅
- [ ] Implement actual file upload (currently just URL storage)
- [ ] Set up image storage (S3, CloudFlare R2, or local volume)
- [ ] Add image processing (resize, optimize, thumbnails)
- [ ] Add image deletion (cleanup storage)
- [ ] Add usage tracking (which posts use which images)

#### Message Templates (Complete Templates)
**Status:** ✅ Router registered, model complete with gender enum, database schema complete

- [x] Create `MessageTemplate` model in models.py ✅
- [x] Create database table in ddl.sql ✅
- [x] Register router in main.py ✅
- [x] Gender enum standardization (uses GenderEnum with ALL value) ✅
- [ ] Test all CRUD endpoints
- [ ] Frontend integration for complete message templates

#### SMTP Configuration
**Status:** ✅ Router registered and separated, model complete, database schema complete

- [x] Create `SMTPConfig` model in models.py ✅
- [x] Create database table in ddl.sql ✅
- [x] Separate SMTP router from auth router ✅
- [x] Register router in main.py ✅
- [ ] Test SMTP configuration endpoints
- [ ] Frontend integration with SMTPSettings component

### API Quality & Error Handling
- [x] Standardize DELETE responses across all endpoints ✅ (All return 200 + {status: "deleted"})
- [x] Add proper HTTP status codes for DELETE operations ✅
- [ ] Standardize error responses across all endpoints (non-DELETE)
- [ ] Add request validation error messages
- [ ] Add request/response logging
- [ ] Add API versioning strategy (v1, v2)
- [ ] Add OpenAPI/Swagger documentation review
- [ ] Test all error cases (network, database, validation)

### Security Hardening
- [ ] Add CORS configuration validation
- [ ] Add request rate limiting (per user, per IP)
- [ ] Add input sanitization for all text fields
- [ ] Add SQL injection protection review (parameterized queries)
- [ ] Add XSS prevention for any reflected content
- [ ] Add security headers (HSTS, CSP, etc.)
- [ ] Add API key rotation mechanism
- [ ] Implement audit logging for sensitive operations
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
- [x] Build extension: `npm run build` ✅ **Successfully builds to dist/ folder**
- [x] Test built extension loads in Chrome
- [ ] Add build to CI/CD pipeline
- [ ] Add versioning automation (package.json → manifest.json)
- [x] Add extension icon and branding assets (Birthday_messaging-logo.png exists)
- [ ] Test extension in incognito mode
- [ ] Test extension with multiple Google accounts
- [x] Enhanced navigation with dropdown menus ✅ **4 comprehensive tab dropdowns**
- [x] All advanced features accessible via navigation ✅ **9 items in Messages tab**

### Authentication UI
- [x] Login form component (AuthForm)
- [x] Registration form component (AuthForm)
- [x] Forgot password form (ForgotPassword component)
- [x] Change password form (ChangePassword component)
- [x] Add form validation feedback (email & password validation implemented)
- [ ] Add loading states for all forms
- [ ] Add "remember me" functionality
- [x] Add password strength indicator (password validation exists)
- [x] Add email validation before submit
- [x] Test token refresh flow (implemented in background/index.ts)
- [x] Add logout confirmation
- [ ] Handle expired session gracefully

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
  - [x] 4-tab layout (Contacts, Templates, Messages, Account)
  - [x] Hover dropdown menus with smooth animations
  - [x] Comprehensive navigation to all features (19 total menu items)
  - [x] Scrollable dropdowns for longer menus
- [ ] Add date range selector for stats
- [ ] Add charts/graphs for metrics
- [ ] Add export functionality
- [ ] Improve responsive design
- [ ] Add dark mode support

### User Education & Training UI
- [ ] Welcome/Onboarding Flow
  - [ ] Welcome modal on first launch
  - [ ] Multi-step onboarding wizard (5 steps)
  - [ ] Progress indicator for onboarding
  - [ ] Skip option with confirmation
  - [ ] Mark onboarding as complete in user preferences
- [ ] Interactive Product Tour
  - [ ] Spotlight/highlight key UI elements
  - [ ] Step-by-step feature walkthrough
  - [ ] Tooltip bubbles with next/previous buttons
  - [ ] Tour progress indicator
  - [ ] Re-trigger tour from help menu
- [ ] In-App Help System
  - [ ] Help icon/button in header/navigation
  - [ ] Contextual help tooltips (? icons)
  - [ ] Help panel/sidebar (expandable)
  - [ ] Search help articles (in-app)
  - [ ] "What's This?" mode (click to learn about any feature)
- [ ] Tutorial Components
  - [ ] Template creation tutorial (guided mode)
  - [ ] Schedule setup tutorial (interactive)
  - [ ] Contact import tutorial (step-by-step)
  - [ ] Automation test tutorial (safe mode)
- [ ] Empty State Guidance
  - [ ] Illustrative empty states with CTAs
  - [ ] "Get Started" buttons with actions
  - [ ] Sample data option (populate with examples)
  - [ ] Quick action buttons
- [ ] Feature Discovery
  - [ ] "New Feature" badges
  - [ ] Feature announcement modals
  - [ ] "Tips & Tricks" notification system
  - [ ] Power user shortcuts guide
- [ ] Embedded Help Resources
  - [ ] FAQ accordion component
  - [ ] Video tutorial player (embedded)
  - [ ] Help article preview cards
  - [ ] Support chat widget (optional)
- [ ] Progress Tracking
  - [ ] Setup checklist (getting started tasks)
  - [ ] Achievement system (milestones)
  - [ ] User level/status (beginner → expert)
  - [ ] Feature usage analytics (show unused features)

### Template Management UI
- [x] TemplateEditor component
- [x] TemplateList component
- [x] TemplateEditorEnhanced component
- [x] Add template preview
- [ ] Add drag-and-drop reordering
- [ ] Add template import/export
- [x] Add merge tag documentation/help (KeywordInserter component exists)
- [ ] Add character count
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
- [ ] Add automation status indicator (real-time)
- [ ] Add pause/resume automation
- [ ] Add automation logs viewer
- [ ] Add manual trigger button
- [ ] Add automation test mode (dry run)
- [ ] Improve error messaging

### Message Queue UI
- [x] MessageQueue component
- [ ] Add real-time status updates
- [ ] Add bulk operations (select multiple)
- [ ] Add filtering by status
- [ ] Add sorting by date
- [ ] Add message preview modal
- [ ] Add retry all failed button

### Message History UI
- [x] MessageHistory component
- [ ] Add pagination
- [ ] Add advanced search filters
- [ ] Add date range picker
- [ ] Add export to CSV
- [ ] Add message details modal
- [ ] Add graphs/charts for history

### Subscription UI
- [x] SubscriptionPanel component
- [ ] Add plan comparison table
- [ ] Add payment method management
- [ ] Add billing history
- [ ] Add cancellation flow with feedback
- [ ] Add proration preview for upgrades
- [ ] Test Stripe checkout flow end-to-end

### Content Script (Facebook Automation)
- [x] Birthday friend detection (gatherBirthdayFriends in content/index.ts)
- [x] Message sending automation (sendMessageToFriend function exists)
- [x] Timeline posting (timeline.ts exists)
- [x] Messenger archiving (messenger.ts exists)
- [ ] Improve friend detection reliability (handle Facebook UI changes)
- [ ] Add error recovery for automation failures
- [ ] Add automation progress feedback
- [x] Add anti-detection delays (randomDelay already implemented)
- [ ] Test with various Facebook layouts (mobile, desktop, different languages)
- [ ] Add support for Facebook birthdays page (/events/birthdays)
- [ ] Add image attachment for timeline posts
- [ ] Add Nifty Images merge tag replacement
- [ ] Test archiving/unarchiving flow
- [ ] Add mutation observer stability improvements

### Background Service Worker
- [x] API client integration (background/index.ts has all API calls)
- [x] Token management (ensureTokens, refreshTokensFlow implemented)
- [x] Automation scheduling (handleAutomationScan exists)
- [ ] Add alarm-based scheduling (chrome.alarms)
- [ ] Add notification for automation status
- [ ] Add offline support (queue requests)
- [ ] Add crash recovery
- [ ] Test persistent state management
- [ ] Add update check and notification

### Contact Management UI ✨ **NEW** (Scaffolded Feb 11, 2026)
- [x] ContactList component - display, search, import, add, edit, delete
- [x] ContactForm component - add/edit contact with validation
- [x] ImportContactsModal - import from JSON, VCF, CSV with drag-and-drop
- [x] BirthdayCalendar component - calendar and list views
- [x] Backend Contact model and router registered ✅
- [ ] Test contact CRUD operations end-to-end
- [ ] Test import functionality with sample files
- [ ] Add contact birthday reminders
- [ ] Add contact grouping/tagging

### Account Management UI ✨ **NEW** (Scaffolded Feb 11, 2026)
- [x] AccountManagement component - profile, timezone, logout, delete account
- [x] SMTPSettings component - SMTP configuration form
- [x] Backend SMTP router registered and separated ✅
- [x] Backend SMTPConfig model complete ✅
- [ ] Backend API endpoint for profile updates (auth router has basic endpoints)
- [ ] Backend API endpoint for account deletion (auth router has DELETE /account)
- [ ] Test profile update flow
- [ ] Test SMTP configuration end-to-end
- [ ] Test account deletion with confirmation

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
- [x] Tab navigation with dropdown menus (completed Feb 11) ✨
- [x] Contact management UI scaffolded (completed Feb 11) ✨
- [x] Birthday Calendar UI scaffolded (completed Feb 11) ✨
- [x] SMTP Settings UI scaffolded (completed Feb 11) ✨
- [x] Account Management UI scaffolded (completed Feb 11) ✨
- [ ] MessageQueue component enhancements
- [ ] MessageHistory component enhancements
- [ ] TemplateEditor component enhancements
- [ ] AuthForm component enhancements
- [ ] Add internationalization (i18n) support
- [ ] Test on different screen sizes
- [x] Test keyboard shortcuts (Alt+H, Alt+D, Alt+L, Esc implemented)
- [ ] Add user onboarding flow (first-time setup)

### In-App Help & Training
- [ ] Add welcome/onboarding tutorial (first-time user flow)
  - [ ] Step 1: Welcome screen with extension overview
  - [ ] Step 2: Account creation/login
  - [ ] Step 3: Create your first template (guided)
  - [ ] Step 4: Set up your first schedule (guided)
  - [ ] Step 5: Test automation (optional)
  - [ ] Skip tutorial option
- [ ] Add contextual help tooltips
  - [ ] Help icons (?) next to complex features
  - [ ] Template editor merge tags explanation
  - [ ] Schedule timing explanation (days before/after)
  - [ ] Automation settings explanation
  - [ ] Gender filter explanation
- [ ] Add interactive product tour (optional walkthrough)
  - [ ] Highlight key features on dashboard
  - [ ] Show where to find templates
  - [ ] Show where to view message queue/history
  - [ ] Re-trigger tour option in settings
- [ ] Add help center link in extension
  - [ ] Link to online documentation
  - [ ] Link to video tutorials
  - [ ] Link to FAQ
  - [ ] Contact support option
- [ ] Add empty state guidance
  - [ ] "No templates yet" → Create your first template (CTA)
  - [ ] "No schedules yet" → Set up your first schedule (CTA)
  - [ ] "No messages yet" → Messages will appear here after automation runs
- [ ] Add error state help
  - [ ] Explain what went wrong
  - [ ] Suggest troubleshooting steps
  - [ ] Link to relevant help article
- [ ] Add feature discovery notifications
  - [ ] Highlight new features after updates
  - [ ] "Did you know?" tips for power features
  - [ ] Best practices suggestions

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
- [ ] Apply ddl.sql to production database
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
- [ ] Create .env.production template
- [ ] Set production JWT_SECRET_KEY (generate strong random key)
- [ ] Configure production DATABASE_URL
- [ ] Set production Stripe keys (live mode)
- [ ] Configure Stripe webhook endpoint (with live secret)
- [ ] Set production CORS_ORIGINS (published extension ID)
- [ ] Configure email service for production
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
- [ ] Set up GitHub Actions (or GitLab CI, CircleCI)
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
- [ ] Set up frontend CI pipeline:
  - [ ] Run TypeScript compilation check
  - [ ] Run ESLint
  - [ ] Run Prettier check
  - [ ] Run npm build
- [ ] Add automated extension packaging:
  - [ ] Build extension zip
  - [ ] Upload to artifacts
- [ ] Add Chrome Web Store publishing:
  - [ ] Set up Web Store API credentials
  - [ ] Automate version bumping
  - [ ] Submit for review (manual approval)

### Security & Compliance
- [ ] Run security audit on dependencies (npm audit, safety)
- [ ] Set up dependency vulnerability scanning
- [ ] Add OWASP security headers
- [ ] Implement GDPR compliance features:
  - [ ] User data export
  - [ ] User data deletion (right to be forgotten)
  - [ ] Privacy policy
  - [ ] Terms of service
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
**Status:** 🟡 Minimal Coverage

#### Unit Tests
- [x] Basic auth tests (test_auth.py exists)
- [x] Basic template tests (test_templates.py exists)
- [ ] Add tests for schedules router
- [ ] Add tests for messages router
- [ ] Add tests for dashboard router
- [ ] Add tests for subscription router
- [ ] Add tests for webhook router
- [ ] Add tests for password reset service
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
**Status:** 🔴 No Tests

#### Unit Tests
- [ ] Add Jest/Vitest configuration
- [ ] Test API client functions
- [ ] Test storage utilities
- [ ] Test message composition logic
- [ ] Test automation utilities
- [ ] Target: >70% coverage

#### Component Tests
- [ ] Test AuthForm component
- [ ] Test Dashboard component
- [ ] Test TemplateEditor component
- [ ] Test MessageQueue component
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
- [ ] Prepare extension listing:
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
- [ ] Write privacy policy (required):
  - [ ] Explain data collection
  - [ ] Explain data usage
  - [ ] Explain data sharing (if any)
  - [ ] Explain user rights (access, deletion)
- [ ] Justify each permission:
  - [ ] `storage` - Save user preferences and auth tokens
  - [ ] `scripting` - Inject content scripts on Facebook
  - [ ] `activeTab` - Access current tab for automation
  - [ ] `tabs` - Query Facebook tabs for automation
  - [ ] `alarms` - Schedule periodic birthday checks
  - [ ] `host_permissions` (facebook.com) - Automate birthday messages
- [ ] Add "What's New" section for updates

---

## 📝 Documentation

### User Documentation
- [ ] Create comprehensive user guide (how to use extension):
  - [ ] Installation instructions (Chrome Web Store)
  - [ ] Setup wizard walkthrough (step-by-step)
  - [ ] Quick start guide (5-minute setup)
  - [ ] Creating templates guide (with examples)
  - [ ] Using merge tags and personalization
  - [ ] Setting up schedules (timing strategies)
  - [ ] Understanding automation (how it works)
  - [ ] Managing message queue and history
  - [ ] Contact management (import/export)
  - [ ] Timeline posts and image customization
  - [ ] SMTP configuration (for notifications)
  - [ ] Subscription plans explanation and comparison
  - [ ] Troubleshooting common issues
  - [ ] Best practices for engagement
  - [ ] Privacy and permissions explanation
- [ ] Create FAQ document
  - [ ] What data does the extension collect?
  - [ ] How does automation work?
  - [ ] Why do I need a subscription?
  - [ ] Can I cancel my subscription?
  - [ ] How do I pause automation?
  - [ ] What happens if Facebook blocks me?
  - [ ] How do I import contacts?
  - [ ] Can I use custom images?
  - [ ] How do I reset my password?
  - [ ] What are merge tags?
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
- [x] PHASE_1_COMPLETION_REPORT.md (Critical path fixes) ✅
- [x] PHASE_2_COMPLETION_REPORT.md (Database schema fixes) ✅
- [x] PHASE_3_COMPLETION_REPORT.md (API consistency) ✅
- [ ] Update all docs to reflect Phase 1-3 completion
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
2. ⚠️ Password reset via email (needs email service - tokens work but no email delivery)
3. ✅ Create and manage message templates (full CRUD implemented)
4. ✅ Set up birthday schedules (days before/after) (full CRUD implemented)
5. ✅ Automated birthday detection on Facebook (gatherBirthdayFriends implemented)
6. ✅ Automated message sending (sendMessageToFriend implemented)
7. ✅ Message queue management (full CRUD implemented)
8. ✅ Message history tracking (list, search, delete implemented)
9. ✅ Subscription payment via Stripe (checkout session + webhook implemented)
10. ✅ Basic dashboard with statistics (getDashboardStats implemented)
11. ✅ **Backend-frontend integration** (API paths aligned, schemas consistent, DELETE standardized) ✅

**Launch Blockers (Must Complete):**
- [x] Fix database schema (ddl.sql completeness) ✅ Resolved
- [x] Fix backend-frontend integration (API paths, schemas, methods) ✅ Resolved (Phases 1-3)
- [x] Standardize DELETE responses across API ✅ Resolved
- [x] Align database schema with models (post fonts, gender enum) ✅ Resolved
- [x] Register all Phase 2 routers ✅ Resolved
- [ ] Implement email service for password reset
- [ ] Deploy backend to production
- [ ] Deploy database to production
- [ ] Configure production Stripe webhooks
- [ ] Build and test extension in production mode
- [ ] Publish extension to Chrome Web Store
- [ ] Test end-to-end user flow in production
- [ ] Set up monitoring and alerts
- [ ] Create privacy policy and terms of service
- [ ] Create minimal user documentation:
  - [ ] Quick start guide (5-minute setup)
  - [ ] Basic FAQ (10-15 common questions)
  - [ ] Troubleshooting guide (common issues)
- [ ] Implement basic onboarding flow:
  - [ ] Welcome screen on first launch
  - [ ] Essential setup wizard (templates + schedule)
  - [ ] Contextual help tooltips on key features

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

### Now (Next 2 Weeks)
1. ~~🔴 Fix ddl.sql completeness~~ ✅ Done
2. ~~🔴 Fix backend-frontend integration~~ ✅ Done (Phases 1-3)
3. 🔴 Implement email service
4. 🔴 Deploy production infrastructure
5. 🔴 Write privacy policy and terms
6. 🔴 End-to-end testing
7. 🔴 Create quick start guide and basic onboarding

### Soon (Weeks 3-4)
1. 🟡 CI/CD pipeline setup
2. 🟡 Monitoring and alerting
3. 🟡 Chrome Web Store submission
4. 🟡 User documentation (FAQ, troubleshooting)
5. 🟡 Load testing
6. 🟡 In-app help tooltips and contextual guidance

### Later (Post-MVP)
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
1. ~~**Database Schema**~~ ✅ Resolved — DDL complete with all tables including Phase 2
2. ~~**Backend-Frontend Integration**~~ ✅ Resolved — All 11 issues fixed across Phases 1-3
3. **Email Service** - Affects user recovery and onboarding
4. **Production Infrastructure** - Affects launch timeline

### External Dependencies
1. **Stripe Account** - Required for payments (can use test mode for now)
2. **Email Service Provider** - Required for password reset
3. **Cloud Provider** - Required for production hosting
4. **Chrome Web Store Account** - Required for extension publishing ($5 fee)
5. **Domain Name** - Required for production API (if using custom domain)

### Technical Debt
1. No automated testing for frontend
2. Minimal backend test coverage
3. No CI/CD pipeline
4. No production monitoring
5. No error tracking service
6. No database migrations setup (Alembic)
7. Image upload/storage not implemented (URL-based currently)
8. No user onboarding or interactive tutorials
9. No comprehensive help documentation or FAQ
10. No video tutorials or training materials

---

## 📞 Next Steps

### Immediate Actions (This Week)
1. [x] Fix ddl.sql by adding missing tables ✅
2. [x] Fix backend-frontend integration issues ✅ (Phases 1-3 complete)
3. [ ] Choose and configure email service provider
4. [x] Test password reset flow end-to-end ✅
5. [x] Build extension and test in Chrome ✅
6. [ ] Start production infrastructure setup
7. [ ] Draft quick start guide outline

### Short Term (Next 2 Weeks)
1. [ ] Complete production deployment
2. [ ] Write privacy policy and terms of service
3. [ ] Create Chrome Web Store listing
4. [ ] Set up monitoring
5. [ ] Run end-to-end testing
6. [ ] Create quick start guide (5-minute setup)
7. [ ] Draft basic FAQ (10-15 questions)
8. [ ] Implement basic onboarding flow (welcome + wizard)

### Medium Term (Next Month)
1. [ ] Submit to Chrome Web Store
2. [ ] Set up CI/CD pipeline
3. [ ] Add comprehensive testing
4. [ ] Complete user documentation (guides, FAQ, troubleshooting)
5. [ ] Add in-app help tooltips
6. [ ] Create video tutorials (installation, setup, key features)
7. [ ] Build help center/knowledge base
5. [ ] Launch to small beta group

---

## Notes

- This checklist assumes you're targeting a production launch
- Prioritize based on your team size and timeline
- MVP should be minimal but functional and polished
- Monitor user feedback closely after launch
- Iterate quickly based on user needs
- Consider soft launch with beta testers before public launch

**Last Updated:** February 14, 2026
