# Frontend Integration Summary

**Last Updated:** March 5, 2026  
**Version:** 0.1.0  
**Scope:** Complete architecture of the Chrome MV3 extension — covering the popup React app, background service worker, content scripts, build toolchain, state management, and how each layer communicates.

---

## Overview

The BirthdayMessaging frontend is a Chrome Manifest V3 extension built with **React 18**, **TypeScript**, **Tailwind CSS 4**, and **Vite 7**. It consists of three isolated runtime contexts that communicate via Chrome's message-passing API:

```
┌────────────────────────────────────────────────────────────────┐
│  Popup (React SPA)                                             │
│  popup/main.tsx → App → AppProvider → AppShell                 │
│  Styled with Tailwind CSS, rendered in action popup window     │
│  Sends BackgroundMessage via sendBackgroundMessage()           │
└──────────────────────┬─────────────────────────────────────────┘
                       │ chrome.runtime.sendMessage
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Background Service Worker (background/index.ts, 815 lines)    │
│  Receives BackgroundMessage, dispatches to api/client.ts       │
│  Manages auth tokens, automation alarms, WebSocket lifecycle   │
│  Returns { success: true, data } or { success: false, error }  │
└──────────────────────┬─────────────────────────────────────────┘
                       │ fetch()
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  FastAPI Backend  (http://localhost:8000 in dev)               │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  Content Script (content/index.ts, 743 lines)                  │
│  Injected into facebook.com/* at document_idle                 │
│  DOM scraping, overlay UI, Messenger automation, timeline posts│
│  Communicates with background via sendContentMessage()         │
└────────────────────────────────────────────────────────────────┘
```

---

## Build & Toolchain

| Tool | Version | Purpose |
|---|---|---|
| Vite | ^7.3.1 | Build tool with multi-entry config (popup, background, content) |
| React | ^18.2.0 | Popup UI framework |
| TypeScript | ^5.5.6 | Full strict typing across all contexts |
| Tailwind CSS | ^4.1.18 | Utility-first CSS via PostCSS plugin |
| LightningCSS | ^1.9.0 | CSS minification / transforms via Vite plugin |
| Vitest | ^4.0.18 | Unit & component testing with `@testing-library/react` |
| ESLint | ^8.44.0 | Linting with `@typescript-eslint` + Prettier integration |

### Build Outputs

Vite produces three entry bundles into `dist/`:

| Entry | Source | Output | Purpose |
|---|---|---|---|
| `popup` | `popup.html` | `popup.js` + `popup.html` | React popup SPA |
| `background` | `src/background/index.ts` | `background.js` | MV3 service worker |
| `content` | `src/content/index.ts` | `content.js` | Facebook content script |

Additional outputs: `chunks/*.js` (shared code), `assets/*` (CSS, images).

### npm Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Dev server (HMR for popup only) |
| `build` | `vite build` | Production build |
| `build:watch` | `vite build --watch` | Rebuild on file changes |
| `reload` | `npm run build && echo ...` | Build + reminder to reload in `chrome://extensions/` |
| `test` | `vitest run` | Run tests once |
| `test:watch` | `vitest` | Watch mode testing |
| `test:coverage` | `vitest run --coverage` | Coverage report (v8 provider) |
| `lint` | `eslint ...` | Lint all TS/TSX/JS/JSX files |
| `lint:fix` | `eslint ... --fix` | Auto-fix lint issues |
| `format` | `prettier --write ...` | Format all source files |

---

## Extension Manifest (MV3)

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "scripting", "activeTab", "tabs", "alarms"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://*.facebook.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "host_permissions": [
    "https://*.facebook.com/*",
    "http://localhost/*",
    "https://localhost/*"
  ]
}
```

| Permission | Used By | Purpose |
|---|---|---|
| `storage` | All contexts | `chrome.storage.local` for tokens, config, automation state |
| `alarms` | Background | Periodic birthday-check automation alarm |
| `tabs` | Background | Open/query Facebook birthday tabs for automation |
| `activeTab` | Background | Inject content script on current tab |
| `scripting` | Background | Programmatic script injection |

---

## Directory Structure

```
extension/src/
├── api/
│   ├── client.ts          # 863 lines — HTTP client (52 exported functions, all types)
│   ├── websocket.ts       # 243 lines — WebSocket client class with auto-reconnect
│   └── __tests__/
├── background/
│   └── index.ts           # 815 lines — Service worker: message router, auth, automation
├── content/
│   ├── index.ts           # 743 lines — Content script: overlay, automation, scraper
│   ├── api.ts             # Bridge to background via chrome.runtime.sendMessage
│   ├── dom-helpers.ts     # waitForElement(), delay() helpers
│   ├── messenger.ts       # 483 lines — Messenger archive/unarchive automation
│   └── timeline.ts        # 562 lines — Timeline post automation with image support
├── popup/
│   ├── main.tsx           # React root mount
│   ├── App.tsx            # 694 lines — Root component, view routing, tab navigation
│   ├── api.ts             # sendBackgroundMessage() bridge
│   ├── popup.css          # Tailwind-powered styles
│   ├── context/
│   │   └── AppContext.tsx  # Global auth/UI state provider
│   ├── hooks/             # Domain-specific React hooks
│   │   ├── useContacts.ts
│   │   ├── useImageLibrary.ts
│   │   ├── useMessages.tsx
│   │   ├── useMessageTemplates.ts
│   │   ├── usePostComposer.ts
│   │   ├── useSMTPConfig.ts
│   │   └── useTemplateSegments.ts
│   ├── components/        # 36 React components
│   └── __tests__/
└── utils/
    ├── accessibility.ts   # Screen reader announcements, focus trapping
    ├── automation.ts      # Automation config CRUD via chrome.storage.local
    ├── bridge.ts          # sendExtensionMessage() with retry for sleeping workers
    ├── errors.ts          # Error class hierarchy + parseApiError()
    ├── image.ts           # Canvas image composition for Facebook posts
    ├── logger.ts          # Dev-only structured logger
    ├── message.ts         # Message composition, keyword resolution, gender selection
    ├── messages.ts        # Discriminated-union message type definitions
    └── storage.ts         # Token & config persistence via chrome.storage.local
```

---

## Message-Passing Architecture

### Type-Safe Message Bus

All inter-context communication uses a discriminated union (`BackgroundMessage`) defined in `utils/messages.ts`. This gives full TypeScript narrowing in the background `handleMessage` switch and type safety at every call site.

```typescript
// From popup (popup/api.ts):
sendBackgroundMessage<UserProfile>({ type: 'auth.me' })

// From content script (content/api.ts):
sendContentMessage<TemplateSegment[]>({ type: 'templates.list' })

// Both delegate to:
sendExtensionMessage(message)  // utils/bridge.ts
```

### Bridge Layer (`utils/bridge.ts`)

The bridge wraps `chrome.runtime.sendMessage` with:

1. **Response envelope** — every response is `{ success: boolean, data?, error? }`
2. **Timeout protection** — 20s callback timeout, 25s hard deadline
3. **Sleeping worker retry** — if the MV3 service worker is asleep, waits 300ms and retries (up to 2 retries)
4. **Error propagation** — non-success responses are rejected as `Error` with `status` and `data` properties

### Background Response Guard

The background service worker enforces a 15s hard guard timer on every `handleMessage` call. If the handler does not resolve within 15s, the worker sends `{ success: false, error: { status: 504 } }` to prevent Chrome from killing the service worker (MV3 can terminate workers after ~30s with open `sendResponse` handles).

### Content Script Messages

The background can send messages **to** the content script via `chrome.tabs.sendMessage`:

| Content Script Message | Purpose |
|---|---|
| `automation.scan` | Trigger overlay friend-list refresh |
| `automation.runFull` | Dispatch full automation payload to content script |
| `contacts.scrapeFromPage` | Request birthday contact scraping from DOM |

---

## Popup Architecture

### Component Tree

```
App
└─ ErrorBoundary
   └─ AppProvider (context: auth, toast, view, tabs, WebSocket)
      └─ AppShell (consumes context + domain hooks)
         ├─ TabNavigation (Home | Contacts | Messages | Account)
         ├─ View Router (state-driven, no URL routing)
         └─ Modals (ImportContactsModal, TemplateCreator, OnboardingWizard)
```

### State Management (`AppContext`)

The `AppProvider` in `context/AppContext.tsx` provides global state via React Context:

| State | Type | Description |
|---|---|---|
| `user` | `UserProfile \| null` | Authenticated user profile; `null` = logged out |
| `isInitializing` | `boolean` | `true` while the initial `auth.me` call is in flight |
| `viewMode` | `ViewMode` (21 values) | Current sub-view within the active tab |
| `activeTab` | `TabType` | Bottom nav: `home`, `contacts`, `messages`, `account` |
| `showToast()` | function | Imperatively show a toast notification |
| `handleLogout()` | function | Clears tokens, disconnects WebSocket, resets state |
| `refreshUser()` | function | Re-fetch user profile & reconnect WebSocket |

**View modes** (21 total): `main`, `change-password`, `schedules`, `scheduling`, `automation`, `message-templates`, `queue`, `history`, `analytics`, `posts`, `post-list`, `groups`, `images`, `contacts`, `add-contact`, `edit-contact`, `import-contacts`, `birthday-calendar`, `smtp-settings`, `account-management`, `subscription`.

Navigation is entirely state-driven — there are no browser routes. All view transitions go through `setViewMode()`.

### Domain Hooks

Each data domain has its own custom hook that encapsulates loading, CRUD, and error handling:

| Hook | Domain | Key Responsibilities |
|---|---|---|
| `useContacts` | Contacts | Load, add, update, delete, import, bulk create contacts |
| `useMessageTemplates` | Message Templates | Load, create, update, delete full message templates |
| `useTemplateSegments` | Legacy Segments | Load, create, update, delete individual greeting/body/closing segments |
| `usePostComposer` | Timeline Posts | Form state, image composition, post creation |
| `useSMTPConfig` | SMTP Settings | Load and save SMTP configuration |
| `useImageLibrary` | Image Library | Load, upload (base64), delete images; 20-image cap |
| `useMessages` | Queue & History | Real-time queue/history via WebSocket subscriptions |

All hooks follow the same patterns:
- Load data on mount when `user` is set (via `useEffect([user])`)
- Clear data when `user` becomes `null` (logout/delete)
- Use `sendBackgroundMessage()` for all API calls
- Forward errors to `showToast()` from `useAppContext()`
- Expose `isSubmitting` and `message` for form UI feedback

### Popup Components (36 total)

| Component | File | Description |
|---|---|---|
| `AccountManagement` | `AccountManagement.tsx` | Profile editing, timezone, account deletion |
| `AuthForm` | `AuthForm.tsx` | Login / register form |
| `AutomationSettings` | `AutomationSettings.tsx` | Enable/disable automation, interval, max messages |
| `BirthdayCalendar` | `BirthdayCalendar.tsx` | Calendar view of contacts' birthdays (`react-calendar`) |
| `ChangePassword` | `ChangePassword.tsx` | Current + new password form |
| `ContactForm` | `ContactForm.tsx` | Add / edit contact form |
| `ContactList` | `ContactList.tsx` | Searchable contact list with edit/delete |
| `Dashboard` | `Dashboard.tsx` | Analytics overview with stat cards |
| `DashboardCharts` | `DashboardCharts.tsx` | Chart components for dashboard |
| `DashboardStatsCard` | `DashboardStatsCard.tsx` | Individual stat card widget |
| `ErrorBoundary` | `ErrorBoundary.tsx` | React error boundary with fallback UI |
| `FacebookPostPreview` | `FacebookPostPreview.tsx` | Preview of composed Facebook post |
| `ForgotPassword` | `ForgotPassword.tsx` | Password reset request form |
| `GenderFilter` | `GenderFilter.tsx` | Gender selection dropdown/filter |
| `HelpTooltip` | `HelpTooltip.tsx` | Contextual help tooltip |
| `HomeControls` | `HomeControls.tsx` | Home tab: quick actions, contact count, calendar link |
| `ImageLibraryPicker` | `ImageLibraryPicker.tsx` | Image selection from library for templates/posts |
| `ImageManager` | `ImageManager.tsx` | Full image library CRUD with upload |
| `ImportContactsModal` | `ImportContactsModal.tsx` | Facebook scraper trigger + CSV import modal |
| `KeywordInserter` | `KeywordInserter.tsx` | Insert `[Tag Person]`, `[Today]`, `[Image]` merge tags |
| `MessageGroups` | `MessageGroups.tsx` | Message group CRUD (gender + segment combo) |
| `MessageHistory` | `MessageHistory.tsx` | Sent message history with search/filter |
| `MessageQueue` | `MessageQueue.tsx` | Pending messages with edit/cancel/retry |
| `MessagesHub` | `MessagesHub.tsx` | Messages tab landing page with navigation cards |
| `OnboardingWizard` | `OnboardingWizard.tsx` | First-time user setup wizard |
| `PostEditor` | `PostEditor.tsx` | Timeline post composer with font controls + image |
| `PostList` | `PostList.tsx` | List of saved timeline posts |
| `ScheduleSettings` | `ScheduleSettings.tsx` | Birthday schedule configuration |
| `SchedulingSettings` | `SchedulingSettings.tsx` | Advanced scheduling + automation controls |
| `SegmentEditor` | `SegmentEditor.tsx` | Inline edit for legacy template segments |
| `SMTPSettings` | `SMTPSettings.tsx` | SMTP host/port/credentials form |
| `Spinner` | `Spinner.tsx` | Loading spinner with size variants |
| `SubscriptionPanel` | `SubscriptionPanel.tsx` | Stripe subscription status + checkout |
| `TemplateCreator` | `TemplateCreator.tsx` | Full message template form (greeting/sentiment/closing/image/gender/days) |
| `TemplateGallery` | `TemplateGallery.tsx` | Browse/edit/delete saved message templates |
| `Toast` | `Toast.tsx` | Toast notification component (success/error/warning/info) |

---

## Background Service Worker

### Initialisation Sequence

1. **Auth state check** — `initializeAuthState()` reads stored tokens, calls `GET /auth/me` to verify, and attempts a token refresh on 401. Clears tokens if both fail.
2. **Automation restore** — `initializeAutomation()` re-schedules Chrome Alarms if automation was previously enabled (alarms do not survive extension restart).

### Message Handling Flow

```
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  1. Reject messages from other extensions (sender.id check)
  2. Start 15s guard timer → sendResponse({ success: false, status: 504 }) on timeout
  3. handleMessage(request) → Promise<BackgroundResponse>
  4a. On success → sendResponse({ success: true, data: response })
  4b. On error  → sendResponse({ success: false, error: { status, message, data } })
  return true;  // keep port open for async
})
```

### Auth Token Management

| Function | Purpose |
|---|---|
| `ensureTokens(baseUrl)` | Returns valid `TokenBundle`, auto-refreshing if access token is missing |
| `refreshTokensFlow(refresh, baseUrl)` | Calls `POST /auth/refresh`, persists new pair to `chrome.storage.local` |
| `withAuth(fn)` | Executes `fn(accessToken, baseUrl)`, retries once on 401 with fresh token |
| `runAuthAware(call)` | Convenience alias for `withAuth()` used throughout `handleMessage` |

Token storage keys in `chrome.storage.local`:
- `bm_access_token` — JWT access token
- `bm_refresh_token` — JWT refresh token
- `bm_backend_url` — configurable backend URL (default: `http://localhost:8000`)

### Automation Engine

The background worker orchestrates the automation scan:

1. **Alarm fires** → `chrome.alarms.onAlarm` listener checks if automation is enabled
2. **`handleAutomationScan()`** fetches message templates, posts, and contacts from the backend in parallel
3. Partitions templates by `days_in_advance`:
   - `=== 0` → current-day templates (for live birthday feed friends)
   - `> 0` → advance templates (N days before birthday)
   - `< 0` → follow-up templates (N days after birthday)
4. Matches contacts to templates using `getContactsForDaysInAdvance()` (MM-DD date comparison)
5. Opens/focuses a Facebook birthday tab
6. Sends `automation.runFull` message to the content script with the full payload

Automation config is stored in `chrome.storage.local` under `automation_config`:

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Master on/off toggle |
| `checkInterval` | `number` | `60` | Minutes between checks |
| `lastCheck` | `string \| null` | `null` | ISO timestamp of last check |
| `nextCheck` | `string \| null` | `null` | ISO timestamp of next scheduled check |
| `maxMessages` | `number` | `0` | Max messages per run (0 = unlimited) |

Additional storage keys:
- `bm_sent_today` — `{ date: "YYYY-MM-DD", ids: string[] }` deduplication record
- `bm_action_delay_minutes` — per-action delay (1–5 minutes, default 1)

---

## Content Script

### Injection & Lifecycle

Injected into all `https://*.facebook.com/*` pages at `document_idle`. On load:
1. Creates the sidebar overlay UI (friend list, status, Send/Refresh buttons)
2. Scrapes birthday friend entries from the DOM (`gatherBirthdayFriends()`)
3. Loads template segments from the backend via `sendContentMessage`
4. Checks clipboard permission and shows a warning banner if denied

### Overlay UI

A fixed-position sidebar (`#bm-overlay`) that:
- Lists detected birthday friends with profile links
- Shows a status line for operation feedback  
- Provides "Send to all" (manual) and "Refresh" buttons
- Z-index `2147483647` to stay above Facebook's UI

### Automation Run (`runFullAutomation`)

Receives an `AutomationRunPayload` from the background and executes three phases:

**Phase 1 — Current-Day Friends:**
- Scrapes birthday friends from the live Facebook birthday feed
- For each friend: selects a gender-matched template, composes the DM, sends via Messenger dialog
- Optionally posts to their timeline (if `makePost` feature flag is on)
- Archives the conversation after sending
- Records the friend as "sent today" via `automation.recordSent`
- Syncs newly discovered friends into the backend contacts list

**Phase 2 — Advance Contacts (days_in_advance > 0):**
- Iterates pre-matched contacts from the `advanceEntries` payload
- Navigates to each contact's Facebook profile, clicks Message, sends DM
- Same post/archive/record flow as Phase 1

**Phase 3 — Follow-Up Contacts (days_in_advance < 0):**
- Same as Phase 2 but for follow-up templates

**Anti-Ban Measures:**
- Configurable per-action delay (1–5 min, ±20% jitter)
- Random delay between manual sends (5–15 seconds)
- Manual send capped at 5 messages per session (`MAX_MESSAGES_PER_SESSION`)
- Full-screen automation overlay shown during runs to prevent user interaction

### Facebook DOM Interaction

| Module | Lines | Functions |
|---|---|---|
| `content/index.ts` | 743 | `gatherBirthdayFriends()`, `fillMessageAndSend()`, `openMessageDialog()`, `scrapeBirthdayContactsFromPage()` |
| `content/messenger.ts` | 483 | `archiveConversation()`, conversation lookup, MutationObserver for replies |
| `content/timeline.ts` | 562 | `postToTimeline()`, `navigateToProfile()`, `openPostComposer()`, Nifty Images merge tags |
| `content/dom-helpers.ts` | 33 | `waitForElement(selector, timeout)`, `delay(ms)` |

### Contact Scraper

`scrapeBirthdayContactsFromPage()` extracts contacts from the Facebook birthday page:

1. **Strategy 1:** Searches `div[data-pagelet*='Birthday']` containers for profile links
2. **Strategy 2:** Walks the full page, tracking section headings for date context
3. **Date parsing:** Handles "Today", "Tomorrow", "January 15", "15 Jan", month abbreviations
4. **Profile URL normalization:** Strips query params, handles `/profile.php?id=` format
5. **Deduplication:** Tracks seen profile URLs to avoid duplicates

Returns `ScrapedContact[]` with `{ name, facebook_profile_url, birthday? }`.

---

## API Client Layer (`api/client.ts`)

863 lines exporting 52 functions and all TypeScript interfaces. Every function follows the signature:

```typescript
(baseUrl: string, accessToken?: string, ...args) => Promise<T>
```

### Central HTTP Dispatcher

```typescript
async function request<T>(baseUrl, path, method, body?, accessToken?): Promise<T>
```

- Injects `Authorization: Bearer <token>` header when token is provided
- Sets `Content-Type: application/json`
- 10-second `AbortController` timeout on every request
- Throws `ApiError { status, data }` on non-2xx responses
- Parses response body as JSON (handles empty bodies)

### Exported Interfaces

| Interface | Used By |
|---|---|
| `RegisterPayload` | Auth registration |
| `TokenResponse` | Auth token pair responses |
| `UserProfile` | User account data |
| `TemplateSegment` | Legacy greeting/body/closing segments |
| `SubscriptionStatus` | Stripe subscription state |
| `CheckoutSessionRequest/Response` | Stripe checkout |
| `BirthdaySchedule` | Schedule timing config |
| `QueuedMessage` | Pending message in queue |
| `MessageHistoryItem/Page` | Sent message history with pagination |
| `DashboardStats` | Analytics dashboard data |
| `Contact` | Facebook friend contact record |
| `MessageGroup` | Group of template segments by gender |
| `Post` | Timeline post with optional image/font styling |
| `UserImage` | Uploaded image metadata |
| `SMTPConfig` | SMTP email configuration |
| `MessageTemplate` | Full message template (greeting/sentiment/closing/image/days/gender) |
| `BirthdayConfig` | Birthday automation config entry |

---

## WebSocket Integration (`api/websocket.ts`)

Singleton `WebSocketClient` class providing real-time updates:

### Connection Lifecycle

1. Popup mounts → `AppProvider.connectWebSocket()` requests WS config from background
2. Background returns `{ wsUrl, token }` (converts `http://` to `ws://`)
3. Client connects to `ws://<backend>/ws` **without** token in URL
4. On open, sends `{ type: 'auth', token }` as first message (avoids leaking JWT to logs/proxies)
5. Starts 30-second ping timer (`{ type: 'ping' }`)

### Reconnection Strategy

- Max 5 attempts
- Linear backoff: `3000ms × attemptNumber`
- Stops if `disconnect()` is called intentionally

### Event Subscriptions

| Event Type | Consumed By | Trigger |
|---|---|---|
| `message_queue_update` | `useMessageQueue` hook | Queue mutations (create/update/delete) |
| `message_history_update` | `useMessageHistory` hook | History mutations |
| `dashboard_update` | Dashboard component | Stat changes |
| `notification` | — | Server-pushed alerts |
| `connected` | — | Connection established |

Hooks subscribe with `wsClient.on(event, callback)` which returns an unsubscribe function used in `useEffect` cleanup.

---

## Utility Modules

### `utils/errors.ts` — Error Handling

Class hierarchy:
```
AppError (base)
├── NetworkError       (NETWORK_ERROR, retryable)
├── AuthenticationError (AUTH_ERROR, 401)
├── ValidationError    (VALIDATION_ERROR, 400)
└── ServerError        (SERVER_ERROR, 500, retryable)
```

`parseApiError(error)` converts raw API errors into structured `AppError` instances with user-friendly messages. Handles FastAPI's `{ detail: string | ValidationItem[] }` format.

`getErrorMessage(error)` extracts a display-ready string from any error shape. `logError(error, context)` logs with context prefix.

### `utils/message.ts` — Message Composition

| Function | Purpose |
|---|---|
| `composeMessage(greetings, bodies, closings)` | Random-pick one segment from each type, join with spaces |
| `selectTemplate(templates, gender)` | Gender-aware template selection: exact match → `'all'` → any |
| `selectPost(posts, gender)` | Gender-aware post selection: exact match → `NEUTRAL` → any |
| `resolveKeywords(text, friend)` | Replace `[Tag Person]` → name, `[Today]` → date, strip `[Image]` |
| `assembleMessageFromTemplate(template, friend)` | Compose greeting + sentiment + closing with keyword resolution |
| `randomDelay(min?, max?)` | Promise-based random wait (default 5–15s) |

### `utils/image.ts` — Canvas Image Composition

`composeImageFromUrl(src, text, font, size, color)` creates a Facebook-sized (1080×1350) image with:
- Source image scaled to cover with aspect-ratio preservation
- Gradient overlay at the bottom for text legibility
- Word-wrapped centred text with configurable font/size/colour
- Returns base64 JPEG data URL

### `utils/accessibility.ts` — A11y Utilities

| Function | Purpose |
|---|---|
| `announceToScreenReader(msg, priority)` | ARIA live region announcements (debounced for polite, immediate for assertive) |
| `getFocusableElements(container)` | Query all tabbable elements within a container |
| `trapFocus(container)` | Keyboard focus trap for modals/dialogs (Tab/Shift+Tab cycling) |

### `utils/storage.ts` — Chrome Storage Abstraction

| Function | Storage Key | Description |
|---|---|---|
| `getTokens()` | `bm_access_token`, `bm_refresh_token` | Read JWT token pair |
| `saveTokens(bundle)` | Same | Persist token pair |
| `clearTokens()` | Same | Remove tokens (logout) |
| `getBackendUrl()` | `bm_backend_url` | Backend URL (default: `http://localhost:8000`) |
| `setBackendUrl(url)` | Same | Validates scheme (HTTPS or `http://localhost` only) |
| `getOnboardingComplete()` | `bm_onboarding_complete` | Onboarding wizard completion flag |
| `setOnboardingComplete(v)` | Same | Mark onboarding done |

### `utils/logger.ts` — Development Logger

Structured console logger with `[BM Background]` prefix. Suppresses `info`, `debug`, and `success` in production builds via `import.meta.env.MODE`.

---

## Keyboard Shortcuts

Global shortcuts registered in `AppProvider` via `keydown` listener:

| Shortcut | Action | Condition |
|---|---|---|
| `Alt+L` | Logout | Authenticated |
| `Alt+H` | Navigate to Home | Authenticated, not already on main |
| `Alt+D` | Navigate to Dashboard | Authenticated |
| `Esc` | Return to main view | Authenticated, in a sub-view |

---

## Data Flow Examples

### Login Flow

```
1. User submits email/password in AuthForm
2. AppShell.handleAuthSubmit() calls:
     sendBackgroundMessage({ type: 'auth.login', payload: { email, password } })
3. bridge.ts sends chrome.runtime.sendMessage with retry logic
4. Background handleMessage('auth.login'):
     → login(baseUrl, payload) via api/client.ts
     → POST /auth/login to backend
     → Receives { access_token, refresh_token, token_type }
     → saveTokens() to chrome.storage.local
     → Returns token response
5. Popup receives success → refreshUser():
     → sendBackgroundMessage({ type: 'auth.me' })
     → Sets user in AppContext
     → connectWebSocket() establishes WS connection
6. Toast: "Welcome back!"
```

### Automation Scan Flow

```
1. Chrome Alarm fires ('birthday-check-alarm')
2. Background checks automation config → enabled
3. handleAutomationScan():
     a. Parallel fetch: templates, posts, contacts from backend
     b. Partition templates by days_in_advance
     c. Match contacts to templates by birthday date offset
     d. openOrFocusFacebookBirthdaysTab() — background tab
     e. Wait for tab to load (up to 15s)
     f. chrome.tabs.sendMessage(tabId, { type: 'automation.runFull', payload })
4. Content script receives message → runFullAutomation(payload):
     a. Phase 1: Scrape live birthday feed → DM + post + archive each friend
     b. Phase 2: Process advance contacts → navigate to profile → DM
     c. Phase 3: Process follow-up contacts → same as Phase 2
     d. Each send → recordSent back to background → chrome.storage.local
5. updateLastCheck() in background
```

### Contact Facebook Scrape Flow

```
1. User clicks "Import from Facebook" in ImportContactsModal
2. sendBackgroundMessage({ type: 'contacts.scrapeFromFacebook' })
3. Background finds a Facebook birthday tab (3-tier priority):
     → /birthdays page → /friends?sk=friends_with_upcoming_birthdays → any FB tab
4. chrome.tabs.sendMessage(tabId, { type: 'contacts.scrapeFromPage' })
5. Content script runs scrapeBirthdayContactsFromPage():
     → Parses DOM for profile links + birthday dates
     → Returns ScrapedContact[] via sendResponse
6. Popup receives contacts → displays for user review → bulk creates via contacts.bulkCreate
```

---

## chrome.storage.local Keys Summary

| Key | Type | Written By | Read By |
|---|---|---|---|
| `bm_access_token` | `string` | Background (auth flows) | Background (API calls) |
| `bm_refresh_token` | `string` | Background (auth flows) | Background (token refresh) |
| `bm_backend_url` | `string` | Popup (config UI) | Background, Popup |
| `bm_onboarding_complete` | `boolean` | Popup (wizard dismiss) | Popup (wizard gate) |
| `automation_config` | `AutomationConfig` | Background (automation) | Background, Popup |
| `bm_sent_today` | `SentTodayRecord` | Content script (via bg) | Background (automation) |
| `bm_action_delay_minutes` | `number` (1–5) | Popup (settings) | Content script |
| `bm_feature_flags` | `{ makePost, sendMessage }` | Popup (settings) | Content script |

---

## Testing Setup

- **Framework:** Vitest 4.x with `jsdom` environment
- **Libraries:** `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
- **Coverage:** v8 provider via `@vitest/coverage-v8`
- **Setup file:** `src/test-setup.ts`
- **Test locations:** `src/api/__tests__/`, `src/popup/__tests__/`, `src/utils/__tests__/`

---

## Integration Totals

| Layer | Count |
|---|---|
| Popup React components | 36 |
| Custom hooks | 7 |
| View modes (popup navigation states) | 21 |
| Background message types (backend-calling) | 47 |
| Background message types (local-only) | 17 |
| **Total `BackgroundMessage` types** | **64** |
| Content script message types | 3 |
| `api/client.ts` exported functions | 52 |
| `api/client.ts` exported interfaces | 30+ |
| WebSocket event types | 5 |
| `chrome.storage.local` keys | 8 |
| Chrome permissions | 5 |
| npm dependencies (runtime) | 3 |
| npm dependencies (dev) | 21 |

---

## Known Gaps & Production TODOs

- SMTP password stored **unencrypted** in backend (tracked separately)
- `useMessages` hook calls `chrome.runtime.sendMessage` directly instead of `sendBackgroundMessage` (inconsistency; works but bypasses bridge retry logic)
- Clipboard permission banner is content-script UI only — no surfacing to popup
- WebSocket reconnection is linear backoff (not exponential); max 5 attempts then stops
- Feature flags (`bm_feature_flags`) have no admin UI — must be set manually in storage
- Content script overlay uses inline styles rather than CSS classes (fragile, no Tailwind)
- No E2E testing framework configured (unit tests only)
