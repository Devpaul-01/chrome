# BirthdayMessaging Chrome Extension

This Manifest V3 extension provides the Chrome UI and Facebook automation layer for BirthdayMessaging. It proxies all API calls through the background service worker to conform with the frozen backend contract and keeps tokens in `chrome.storage.local` per the security guidance.

## Architecture at a Glance

| Layer | Files | Lines |
|-------|-------|-------|
| React popup (34 components) | `src/popup/` | ~4,000 |
| Background service worker | `src/background/index.ts` | 780 |
| API client | `src/api/client.ts` | 825 (52 functions) |
| Content scripts | `src/content/` (5 files) | 1,839 |
| Hooks | `src/popup/hooks/` (7 files) | 1,013 |
| Utilities | `src/utils/` (9 files) | 1,086 |
| WebSocket client | `src/api/websocket.ts` | 225 |
| Tests | `src/popup/__tests__/` (11 files) | 214 tests |

**Total:** ~75 TypeScript/TSX files, ~15,000 lines.

## Build

```bash
npm install
npm run build
```

The build command runs Vite and emits `dist/{popup.html,background.js,content.js,...}` plus copies `public/manifest.json` into `dist`. Load the resulting `dist` folder as an unpacked extension via Chrome: go to `chrome://extensions`, enable Developer Mode, and point to `extension/dist`.

## Development

During development use `npm run dev` (starts Vite dev server, but Chrome extensions must still be loaded as unpacked and configured to point to the dev server). Typically you work in `popup.html` via `vite` and copy the built files into the extension directory.

## Testing

```bash
npm test            # Run all 214 tests
npm run test:watch  # Watch mode
```

Tests use Vitest 4.0 + @testing-library/react + jsdom. Coverage spans utilities, components, hooks, and API integration. See [FRONTEND_TEST_RESULTS.md](../Developer%20docs/FRONTEND_TEST_RESULTS.md) for breakdown.

## Key Features

- **64 background message types** (47 calling backend, 17 local-only)
- **Real-time WebSocket updates** — queue, history, dashboard, notifications
- **WCAG 2.1 AA accessibility** — keyboard navigation, ARIA labels, focus management, screen reader support
- **Facebook automation** — birthday detection, message/post composition, deduplication, advance/belated scheduling
- **Stripe subscription** — checkout session, webhook status updates

## Backend configuration

The default backend URL is `http://localhost:8000`. Open the popup, go to the “Backend URL” field, update the host (for example to a tunnel address), and click “Save backend URL”. The extension will persist the value and retry the session.

## Usage

1. Login or register via the popup to obtain access/refresh tokens.
2. Create or manage greeting/body/closing segments in the Templates area.
3. Check subscription status and hit “Upgrade / Renew” to launch the Stripe checkout session when necessary.
4. Open Facebook, use the overlay to scan birthday notifications, and confirm sends to avoid automation abuse.

## Known limitations

- The content script relies on Facebook DOM heuristics (`div[data-pagelet*="Birthday"]`, buttons with aria-labels containing "Message"); layout changes may require selector updates.
- Message insertion targets `div[role=\"textbox\"]` or `div[contenteditable='true']`; more complex editors could break the automation.
- Anti-ban precautions (delays, max per session, confirmation) are basic; monitor for rate-limiting and pause if Facebook complains.
- There is no Facebook Graph API usage or official automation API; the extension simulates button clicks and may fail if Facebook tightens automation detection.
