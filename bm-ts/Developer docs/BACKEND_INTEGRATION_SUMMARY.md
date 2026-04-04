# Backend Integration Summary

**Last Updated:** April 4, 2026  
**Version:** 1.2.0  
**Scope:** How the Chrome extension integrates with the FastAPI backend — covering every API route, its corresponding `client.ts` function, and the background service worker message type that triggers it.

---

## Overview

The Chrome extension communicates with the backend exclusively through the background service worker (`background/index.ts`). The popup and content scripts never call the backend directly; they send typed `BackgroundMessage` objects via `chrome.runtime.sendMessage`. The background worker resolves them by calling functions from `api/client.ts`, which are plain `fetch`-based wrappers around the HTTP API.

```
Popup / Content Script
        │  chrome.runtime.sendMessage({ type: "..." })
        ▼
Background Service Worker (background/index.ts, 902 lines)
        │  calls api/client.ts functions
        ▼
FastAPI Backend  (http://localhost:8000 in dev)
        │  reads/writes via SQLAlchemy async
        ▼
PostgreSQL 15
```

---

## Authentication & Token Management

| Background Message | `client.ts` Function | HTTP Method + Path | Notes |
|---|---|---|---|
| `auth.register` | `register(payload)` | `POST /auth/register` | Returns `{ access_token, refresh_token, token_type }` |
| `auth.login` | `login(payload)` | `POST /auth/login` | Same response shape |
| `auth.refresh` | `refreshToken(token)` | `POST /auth/refresh` | Rotates both tokens; stored in `chrome.storage.local` |
| `auth.logout` | *(local only)* | — | Clears `chrome.storage.local`; no backend call |
| `auth.me` | `me()` | `GET /auth/me` | Returns user profile |
| `auth.requestPasswordReset` | `requestPasswordReset(email)` | `POST /auth/request-password-reset` | Rate-limited 1/min & 5/hr per IP |
| `auth.resetPassword` | `resetPassword(payload)` | `POST /auth/reset-password` | Token validated server-side |
| `auth.changePassword` | `changePassword(payload)` | `POST /auth/change-password` | Requires bearer token |
| `auth.updateProfile` | `updateUserProfile(payload)` | `PUT /auth/profile` | Updates `name` / `timezone` stored in JSON metadata |
| `auth.deleteAccount` | `deleteUserAccount()` | `DELETE /auth/account` | Cascades to all user data |
| `auth.requestEmailVerification` | `requestEmailVerification()` | `POST /auth/request-email-verification` | Sends verification email via SendGrid |
| `auth.verifyEmail` | *(direct POST)* | `POST /auth/verify-email` | Validates token, sets `email_verified = true` |
| `auth.sessions` | *(via auth.me flow)* | `GET /auth/sessions` | Lists active user sessions |
| `auth.revokeSession` | *(direct DELETE)* | `DELETE /auth/sessions/{id}` | Revokes a specific session |
| `auth.dataExport` | *(direct GET)* | `GET /auth/data-export` | Exports all user data as JSON |

**Token storage:** Access and refresh tokens are stored in `chrome.storage.local`. On every authenticated request `client.ts` reads the access token; if a 401 is returned the background worker fires `auth.refresh` automatically, stores the new pair, and retries the original request.

---

## SMTP Configuration

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `smtp.getConfig` | `getSMTPConfig()` | `GET /smtp/config` |
| `smtp.updateConfig` | `updateSMTPConfig(payload)` | `PUT /smtp/config` |

The backend uses an upsert pattern — `PUT /smtp/config` creates the row on first call and updates it on subsequent calls. Password is **encrypted at rest** using Fernet symmetric encryption (`encryption.py`). API responses mask the password as `"••••••••"`.

---

## Template Segments

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `templates.list` | `listTemplates(type?)` | `GET /templates/` |
| `templates.create` | `createTemplate(payload)` | `POST /templates/` |
| `templates.update` | `updateTemplate(id, payload)` | `PUT /templates/{id}` |
| `templates.delete` | `deleteTemplate(id)` | `DELETE /templates/{id}` |

Segment types: `GREETING`, `BODY`, `CLOSING`. Records are soft-deleted (`deleted_at` timestamp); the list endpoint filters them out by default.

---

## Birthday Schedules

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `schedules.list` | `listSchedules()` | `GET /api/schedules` |
| `schedules.create` | `createSchedule(payload)` | `POST /api/schedules` |
| `schedules.update` | `updateSchedule(id, payload)` | `PUT /api/schedules/{id}` |
| `schedules.delete` | `deleteSchedule(id)` | `DELETE /api/schedules/{id}` |

`days_before` must be unique per user — a duplicate value returns HTTP 400.

---

## Message Queue & History

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `messages.listQueue` | `listQueuedMessages()` | `GET /api/messages/queue` |
| `messages.updateQueued` | `updateQueuedMessage(id, payload)` | `PUT /api/messages/queue/{id}` |
| `messages.cancelQueued` | `cancelQueuedMessage(id)` | `DELETE /api/messages/queue/{id}` |
| `messages.retryQueued` | `retryQueuedMessage(id)` | `POST /api/messages/queue/{id}/retry` |
| `messages.listHistory` | `listMessageHistory(params?)` | `GET /api/messages/history` |
| `messages.deleteHistory` | `deleteMessageHistory(id)` | `DELETE /api/messages/history/{id}` |
| `messages.exportCsv` | `exportHistoryCsv()` | `GET /api/messages/history/export` |

The backend broadcasts a WebSocket event whenever the queue or history changes, so the popup updates without polling.

---

## Dashboard Analytics

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `dashboard.getStats` | `getDashboardStats()` | `GET /api/dashboard/stats` |

The `DashboardStats` interface in `client.ts` includes two fields that are **not** returned by the backend: `automation_enabled` and `next_scheduled_check`. The background worker merges these from `chrome.storage.local` before returning the response to the popup.

---

## Contacts

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `contacts.list` | `listContacts()` | `GET /api/contacts/` |
| `contacts.create` | `createContact(payload)` | `POST /api/contacts/` |
| `contacts.update` | `updateContact(id, payload)` | `PUT /api/contacts/{id}` |
| `contacts.delete` | `deleteContact(id)` | `DELETE /api/contacts/{id}` |
| `contacts.bulkCreate` | `bulkCreateContacts(payload)` | `POST /api/contacts/bulk` |
| `contacts.scrapeFromFacebook` | *(content script)* | — | Handled locally by content script; synced via `contacts.bulkCreate` |

---

## Message Groups

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `messageGroups.list` | `listMessageGroups()` | `GET /api/message-groups/` |
| `messageGroups.create` | `createMessageGroup(payload)` | `POST /api/message-groups/` |
| `messageGroups.update` | `updateMessageGroup(id, payload)` | `PUT /api/message-groups/{id}` |
| `messageGroups.delete` | `deleteMessageGroup(id)` | `DELETE /api/message-groups/{id}` |

---

## Posts

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `posts.list` | `listPosts(gender?)` | `GET /api/posts/` |
| `posts.create` | `createPost(payload)` | `POST /api/posts/` |
| `posts.update` | `updatePost(id, payload)` | `PUT /api/posts/{id}` |
| `posts.delete` | `deletePost(id)` | `DELETE /api/posts/{id}` |

Posts include optional font fields (`font_family`, `font_size`, `font_color`) for styled timeline posts.

---

## User Images

| Background Message | `client.ts` Function | HTTP Method + Path | Notes |
|---|---|---|---|
| `images.list` | `listImages()` | `GET /api/images/` | |
| `images.create` | `createImage(payload)` | `POST /api/images/upload` | `{ url: string }` — stores a URL reference |
| `images.uploadFile` | `uploadImageFile(payload)` | `POST /api/images/upload-file` | `{ data: string, mimeType: string, size: number }` base64; max 10 MB; stored as data URI |
| `images.delete` | `deleteImage(id)` | `DELETE /api/images/{id}` | |

---

## Birthday Configs

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `dashboard.getConfigs` | `listBirthdayConfigs(params?)` | `GET /api/birthday-configs` |
| `dashboard.toggleConfig` | `toggleBirthdayConfig(id)` | `PATCH /api/birthday-configs/{id}/toggle` |

Full CRUD is available through the API but only `list` and `toggle` are wired to background message types. Direct creation/editing is handled via the `BirthdayConfigsView` component which calls `client.ts` functions directly through the background message layer.

---

## Message Templates

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `messageTemplates.list` | `listMessageTemplates(gender?)` | `GET /api/message-templates` |
| `messageTemplates.create` | `createMessageTemplate(payload)` | `POST /api/message-templates` |
| `messageTemplates.get` | `getMessageTemplate(id)` | `GET /api/message-templates/{id}` |
| `messageTemplates.update` | `updateMessageTemplate(id, payload)` | `PUT /api/message-templates/{id}` |
| `messageTemplates.delete` | `deleteMessageTemplate(id)` | `DELETE /api/message-templates/{id}` |

---

## Subscription & Payments

| Background Message | `client.ts` Function | HTTP Method + Path |
|---|---|---|
| `subscription.status` | `subscriptionStatus()` | `GET /subscription/status` |
| `subscription.checkout` | `createCheckoutSession(payload)` | `POST /subscription/create-checkout-session` |
| `subscription.cancel` | `cancelSubscription()` | `POST /subscription/cancel` |
| `subscription.reactivate` | `reactivateSubscription()` | `POST /subscription/reactivate` |
| `subscription.changePlan` | `changeSubscriptionPlan(payload)` | `POST /subscription/change-plan` |
| `subscription.billingPortal` | `getBillingPortal()` | `POST /subscription/billing-portal` |

Stripe webhooks hit `POST /stripe/webhook` directly — the backend verifies the signature with `STRIPE_WEBHOOK_SECRET` and updates `subscription_records`.

---

## Automation (Local — No Backend Calls)

These messages are handled entirely within the extension and do **not** call the backend:

| Background Message | Storage Layer | Description |
|---|---|---|
| `automation.getConfig` | `chrome.storage.local` | Read `{ enabled, intervalMinutes, maxMessages }` |
| `automation.setEnabled` | `chrome.storage.local` | Toggle automation on/off |
| `automation.setInterval` | `chrome.storage.local` | Set check frequency (minutes) |
| `automation.setMaxMessages` | `chrome.storage.local` | Cap max sends per run |
| `automation.clearSentToday` | `chrome.storage.local` | Reset `SentTodayRecord` deduplication list |
| `automation.recordSent` | `chrome.storage.local` | Mark a profile URL as sent today |
| `automation.scanFacebook` | content script | Dispatch `automation.runFull` payload to active Facebook tab |

---

## Configuration

| Background Message | Description |
|---|---|
| `config.getBackendUrl` | Read stored backend base URL from `chrome.storage.local` |
| `config.setBackendUrl` | Persist custom backend URL (defaults to `http://localhost:8000`) |
| `config.getWSConfig` | Read WebSocket connection config |

---

## Real-Time WebSocket

The background service worker maintains a persistent WebSocket connection to `ws://<backend>/ws?token=<access_token>`. On disconnect it retries with exponential back-off. Incoming events are forwarded to the popup via `chrome.runtime.sendMessage`.

| WS Event | Triggered by |
|---|---|
| `queue_updated` | Any `/api/messages/queue` mutation |
| `history_updated` | Any `/api/messages/history` mutation |
| `dashboard_updated` | Any stat change on the backend |
| `notification` | Server-pushed alert |

See [REALTIME_FEATURES.md](REALTIME_FEATURES.md) for full connection lifecycle details.

---

## Error Handling Conventions

All `client.ts` functions throw on non-2xx responses. The thrown object is an `ApiError` with `status: number` and `message: string`. The background worker catches these and forwards `{ success: false, error: string }` to the sender.

| HTTP Status | Meaning |
|---|---|
| 401 | Token expired/invalid → auto-refresh attempted once |
| 404 | Resource not found |
| 400 | Business logic error (e.g. duplicate schedule `days_before`) |
| 422 | Pydantic validation failure (field type/constraint mismatch) |
| 429 | Rate limit hit (password-reset endpoint) |
| 500 | Unhandled server error |

---

## Integration Totals

| Layer | Count |
|---|---|
| HTTP endpoints | 78 |
| WebSocket endpoints | 1 |
| `client.ts` exported functions | 58 |
| Background message types that call the backend | 51 |
| Background message types that are local-only | 26 *(automation × 7, config × 3, failsafe × 8, logout × 1, scrape × 1, others × 6)* |
| **Total background message types** | **77** |
