# BirthdayMessaging Chrome Extension - V2

BirthdayMessaging V2 is a Manifest V3 Chrome extension providing the browser UI and Facebook automation layer for BirthdayMessaging.

## Architecture

The extension includes:

- React and TypeScript popup application
- Manifest V3 background service worker
- Facebook Messenger and Timeline automation content scripts
- Birthday detection and message/post composition
- Contacts, templates, scheduling, images, SMTP, dashboard, and account management
- WebSocket and API integration with the BirthdayMessaging V2 backend
- Payment and entitlement integration with the production BirthdayMessaging API
- Local Quick Start, FAQ, Troubleshooting, Privacy Policy, and Terms pages

Production API: `https://api-v2.birthdaymessaging.io`

Production builds remove localhost, loopback, and sslip.io development host permissions.

## Development environment

The currently validated dependency graph uses Node.js 22 and npm 12.

Install dependencies:

    npm ci

## Unit tests

    npm test -- --run

The accepted V2 baseline currently passes 430 extension tests.

## TypeScript

    npx tsc --noEmit

## Lint

    npm run lint

## Formatting

    npm run format

Formatting rules are defined in `.prettierrc`.

## Production build

    npm run build

The production build is emitted to `dist/` and includes `manifest.json`, `popup.html`, `welcome.html`, `background.js`, `content.js`, and the local documentation pages.

## End-to-end testing

Playwright configuration and a popup-shell smoke test are included.

    npm run test:e2e:list
    npm run test:e2e

A compatible Playwright browser runtime must be installed before browser execution.

## Facebook automation

The content-script layer includes Messenger and Timeline automation, DOM helpers, editor helpers, tracing, API bridging, failsafes, and scheduling-related behavior.

Facebook DOM changes may require selector maintenance.

## Payments

The V2 backend supports BTCPay-based Bitcoin and Monero payment flows and entitlement handling. Payment processing is implemented by the backend rather than directly in the extension.

Card, debit-card, and bank-payment integration is handled separately from the current BTC/XMR baseline.

## Documentation

Local documentation pages include:

- `quick-start.html`
- `faq.html`
- `troubleshooting.html`
- `privacy-policy.html`
- `terms-of-service.html`

These recovered documents originated from the earlier BirthdayMessaging extension baseline. Payment and legal language should be reviewed whenever payment providers or billing behavior change.

## Security

Never commit production secrets, `.env` files, private keys, API tokens, database backups, database dumps, or production credentials.

The V2 release process includes dependency auditing, secret scanning, tests, build validation, linting, and TypeScript validation.

## Accepted V2 baseline

The current release candidate has been validated with:

- 430 passing extension tests
- 424 passing backend tests
- successful production extension build
- successful TypeScript validation
- successful ESLint validation
- zero npm audit vulnerabilities
- production-only manifest host permissions
