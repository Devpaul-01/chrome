# Manifest Hardening & Fail-Safe Mechanisms for Facebook Birthday Extension

**Last Updated:** March 12, 2026

## TL;DR

The extension has been hardened with Meta-compliant fail-safe mechanisms that transform it from an "automation tool" (ban-risky) into an "assistive productivity tool" (allowed). The manifest now uses narrowly scoped permissions, the automation loop enforces human-in-the-loop confirmation, aggregate rate limits, Facebook restriction detection, user-activity gating, and an emergency kill-switch.

---

## Implementation Status

### Phase 1: Manifest Hardening — ✅ COMPLETE

All changes in `extension/public/manifest.json`:

| Change | Before | After |
|--------|--------|-------|
| `host_permissions` | `"https://*.facebook.com/*"` (all Facebook) | `birthdays*`, `messages/*`, `profile.php*` (3 narrow paths) |
| `content_scripts.matches` | `"https://*.facebook.com/*"` (all pages) | `birthdays*`, `messages/*` (2 specific pages) |
| `web_accessible_resources.matches` | `"https://*.facebook.com/*"` | `birthdays*`, `messages/*` |
| `description` | "Chrome extension that automates birthday messages…" | "Helps you remember and send personalized birthday wishes to your Facebook friends." |
| `homepage_url` | Not present | `"https://birthdaymessaging.app/privacy"` |
| `alarms` | In `permissions` (always granted) | Moved to `optional_permissions` (requested on demand) |

**Remaining permissions** (all justified):
- `storage` — local config, tokens, sent-today tracking, fail-safe state
- `scripting` — programmatic content script injection for profile pages
- `activeTab` — interact with the active Facebook tab
- `tabs` — query/open/focus Facebook birthday tabs

### Phase 2: Human-in-the-Loop Confirmation — ✅ COMPLETE

Implemented in `extension/src/content/index.ts` and `extension/src/utils/failsafe.ts`:

- **In-page confirmation modal** (`showSendConfirmation()`) displays before each automated send:
  - Shows friend name + message preview
  - Four buttons: **Send** / **Skip** / **Send All Remaining** / **Pause Automation**
  - "Send All Remaining" sets `skipConfirmation = true` for the rest of the run
  - "Pause Automation" triggers `setShouldAbort(true)` to halt the loop

- **Three confirmation modes** stored via `getConfirmationMode()` / `setConfirmationMode()`:
  - `each` (default) — confirm every message individually
  - `session` — confirm once per automation run, then proceed
  - `auto` — no confirmation (with prominent ban-risk warning in UI)

- **User-activity gating** via `initUserActivityTracking()` / `isUserActive()`:
  - Tracks `click`, `scroll`, `keypress` events (passive listeners)
  - Requires `document.visibilityState === 'visible'` AND user interaction within last 5 minutes
  - If inactive: automation defers and logs "user not active on page"

### Phase 3: Aggregate Rate Limiting — ✅ COMPLETE

Implemented in `extension/src/utils/failsafe.ts`:

| Limit | Window | Cap | Enforcement |
|-------|--------|-----|-------------|
| Hourly | Rolling 60 minutes | 1 message | `checkRateLimit()` before each send |
| Daily | Rolling 24 hours | 3 messages | Same — blocks with reason string |
| Weekly | Rolling 7 days | 5 messages | Same — timestamps auto-pruned |

- `recordMessageSent()` appends ISO timestamp on every successful send
- `checkRateLimit()` returns `{ allowed, reason, hourly, daily, weekly }` with usage counts
- Rate limit status displayed in popup with per-bucket usage bars
- When any limit is reached, automation halts with descriptive status message

### Phase 4: Facebook Restriction Detection — ✅ COMPLETE

Implemented in `extension/src/utils/failsafe.ts` and integrated in `extension/src/content/index.ts`:

**URL-based detection** — checks current URL against:
- `facebook.com/checkpoint/`
- `facebook.com/help/contact/`
- `facebook.com/login/identify`

**DOM-based detection** — scans `[role="alert"]`, `[role="dialog"]`, error test IDs, and headings for:
- "temporarily blocked", "unusual activity", "confirm your identity"
- "action blocked", "try again later", "we limit how often"
- "you can't use this feature", "your account has been locked", "you're temporarily restricted"

**Restriction check runs:**
1. Before the automation loop starts
2. Before each individual message send (via `preSendChecks()`)

If detected → immediate `triggerEmergencyStop(24)` + activity log entry.

**Escalating backoff** on send failures (`recordSendFailure()` / `recordSendSuccess()`):
- 1st consecutive failure → 10 minute pause
- 2nd consecutive failure → 30 minute pause
- 3rd consecutive failure → 24 hour auto-emergency-stop
- Any success resets the counter to 0

### Phase 5: Anti-Detection Improvements — ✅ PARTIALLY COMPLETE

**Implemented:**
- User-activity gating (visibility + interaction check) — see Phase 2
- Facebook restriction detection runs before each send — see Phase 4
- Content scripts only inject on `/birthdays` and `/messages/*` pages (no broad injection)

**Not yet implemented (future work):**
- User-triggered scrape button (currently scrapes on `refreshFriendList()` call)
- Scrape result caching (4-hour TTL)
- Message variation enforcement (minimum 3 templates warning)
- Alarm timing jitter (random 5–45 minute delay after alarm fires)
- Natural typing simulation (character-by-character insertion)

### Phase 6: Emergency Kill-Switch & User Controls — ✅ COMPLETE

**Emergency stop** implemented in `extension/src/utils/failsafe.ts`:
- `triggerEmergencyStop(cooldownHours)` — sets active flag, clears alarms, logs event
- `clearEmergencyStop()` — resets state, logs event
- `isEmergencyStopActive()` — checks active flag + auto-expires after cooldown
- Cooldown auto-expires (default 24 hours)

**Abort-in-progress** mechanism:
- `setShouldAbort(true)` flag stored in `chrome.storage.local`
- Content script checks `shouldAbort()` before each message in `preSendChecks()`
- Emergency stop sets abort flag AND disables automation via background handler

**Activity log** (`getActivityLog()` / `addActivityLogEntry()`):
- Last 50 events stored with timestamp + level + message
- Levels: `info`, `send`, `post`, `warning`, `error`, `emergency`
- Logged events include: DM sends, timeline posts, rate limit hits, failures, restriction detections, emergency stops, user pauses

**Popup UI** in `extension/src/popup/components/AutomationSettings.tsx`:
- 🛑 **"Pause All Activity"** red button — triggers emergency stop + disables automation
- Emergency stop banner with cooldown timer + "Clear" option
- **Confirmation mode selector** — 3 buttons with ban-risk warning for "Full auto"
- **Rate limit display** — hourly/daily/weekly usage with color-coded limits
- **Collapsible activity log** — scrollable list with color-coded entries + clear button

---

## Relevant Files

| File | Purpose | Changes Made |
|------|---------|--------------|
| `extension/public/manifest.json` | Permissions, content script matches, description | Narrowed permissions, rewritten description, added homepage_url, alarms → optional |
| `extension/src/utils/failsafe.ts` | **NEW** — all fail-safe mechanisms | Rate limiting, emergency stop, activity log, restriction detection, user activity, confirmation mode, backoff, alarms permission helper |
| `extension/src/utils/messages.ts` | Chrome message bus types | Added 8 fail-safe message types |
| `extension/src/content/index.ts` | Main automation loop | Added `preSendChecks()`, `showSendConfirmation()`, user-activity tracking, rate limit/restriction/abort checks before each send, activity logging on all events |
| `extension/src/background/index.ts` | Service worker | Added fail-safe message handlers, pre-scan checks (emergency stop, backoff, rate limits), alarms permission request on enable |
| `extension/src/popup/components/AutomationSettings.tsx` | Automation UI | Added emergency stop button/banner, confirmation mode selector, rate limit display, activity log viewer |

---

## New Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `failsafe.getEmergencyStop` | popup → background | Get emergency stop state |
| `failsafe.triggerEmergencyStop` | popup → background | Activate emergency stop + disable automation |
| `failsafe.clearEmergencyStop` | popup → background | Deactivate emergency stop |
| `failsafe.getActivityLog` | popup → background | Get activity log entries |
| `failsafe.clearActivityLog` | popup → background | Clear activity log |
| `failsafe.getRateLimits` | popup → background | Get rate limit usage/caps |
| `failsafe.getConfirmationMode` | popup → background | Get current confirmation mode |
| `failsafe.setConfirmationMode` | popup → background | Set confirmation mode (each/session/auto) |

---

## Automation Flow (Post-Hardening)

```
ALARM FIRES
  │
  ├─ Emergency stop active? → SKIP (log warning)
  ├─ Backoff pause active?  → SKIP (log warning)
  ├─ Rate limit reached?    → SKIP (log warning)
  │
  ├─ Reset abort flag
  ├─ Fetch templates, posts, contacts from backend
  ├─ Open Facebook /birthdays tab
  └─ Send automation.runFull → content script
       │
       ├─ Check rate limits → abort if exceeded
       ├─ Check user activity → defer if inactive
       ├─ Check Facebook restrictions → emergency stop if detected
       │
       └─ FOR EACH FRIEND:
            ├─ Check shouldAbort flag → break if set
            ├─ Check rate limit again → break if exceeded
            ├─ Check Facebook restriction → emergency stop if detected
            ├─ Check user activity → break if inactive
            │
            ├─ CONFIRMATION MODE:
            │    each → show modal (Send/Skip/SendAll/Pause)
            │    session → show modal once per run
            │    auto → skip modal
            │
            ├─ Send DM (if sendMessage flag on)
            ├─ Post to timeline (if makePost flag on)
            ├─ Archive conversation
            ├─ Record: rate limit timestamp + sentToday + activity log
            ├─ Reset failure backoff counter
            ├─ Wait random delay (1–5 min configurable)
            │
            └─ ON FAILURE:
                 ├─ Record failure (escalating backoff)
                 ├─ Log error to activity log
                 └─ Break if backoff says pause
```

---

## Verification Checklist

| # | Test | Status |
|---|------|--------|
| 1 | Load unpacked extension → content script only injects on `/birthdays` and `/messages/*` | Ready to test |
| 2 | Navigate to `facebook.com/marketplace` → confirm NO content script injection | Ready to test |
| 3 | Enable automation → trigger alarm → confirmation modal appears before any send | Ready to test |
| 4 | Send 10 messages → 11th blocked with "Daily limit reached" | Ready to test |
| 5 | Simulate 3 consecutive failures → 24-hour auto-pause activates | Ready to test |
| 6 | Click "Pause All Activity" mid-run → loop aborts within 1 action | Ready to test |
| 7 | Switch Facebook tab to background → automation defers until tab visible + user active | Ready to test |
| 8 | Production build succeeds | ✅ Verified (content.js 32.55 KB, background.js 20.01 KB) |

---

## Decisions Made

- **In-page modal over Chrome notifications** — avoids adding `notifications` permission; uses existing DOM overlay approach
- **Human-in-the-loop is default** — `each` confirmation mode is the default; `auto` mode shows explicit ban-risk warning
- **Rate limits are hard-coded conservatively** — 3/hour, 10/day, 25/week; typical human behavior is 3–5 birthday wishes per day
- **Emergency stop has auto-expiry** — 24-hour cooldown expires automatically so users don't get permanently locked out
- **Abort flag is storage-based** — allows background → content script communication for mid-run abort
- **`alarms` moved to optional_permissions** — requested programmatically only when user enables automation

## Remaining Work (Future Phases)

### P1 — Should implement before Chrome Web Store submission:
- Host privacy policy at `https://birthdaymessaging.app/privacy` (the URL declared in manifest)
- Add programmatic injection via `chrome.scripting.executeScript()` for timeline posting on profile pages (required since profiles are no longer in `content_scripts.matches`)
- Add message variation enforcement (warn if < 3 templates configured)

### P2 — Nice to have for anti-detection:
- Scrape result caching (4-hour TTL to avoid repeated DOM queries)
- User-triggered scrape button (replace auto-scrape on page load)
- Alarm timing jitter (random 5–45 min delay after alarm fires)
- Natural typing simulation (character-by-character or chunked insertion)
- Configurable daily/weekly caps in the UI (currently hard-coded)
