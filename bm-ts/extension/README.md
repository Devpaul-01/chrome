# BirthdayMessaging Chrome Extension

This Manifest V3 extension provides the Chrome UI and Facebook automation layer for BirthdayMessaging. It proxies all API calls through the background service worker to conform with the frozen backend contract and keeps tokens in `chrome.storage.local` per the security guidance.

## Build

```bash
npm install
npm run build
```

The build command runs Vite and emits `dist/{popup.html,background.js,content.js,...}` plus copies `public/manifest.json` into `dist`. Load the resulting `dist` folder as an unpacked extension via Chrome: go to `chrome://extensions`, enable Developer Mode, and point to `extension/dist`.

## Development

During development use `npm run dev` (starts Vite dev server, but Chrome extensions must still be loaded as unpacked and configured to point to the dev server). Typically you work in `popup.html` via `vite` and copy the built files into the extension directory.

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
