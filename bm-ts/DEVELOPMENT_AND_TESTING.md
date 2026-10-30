# BirthdayMessaging development and testing — PR #187 proposed replacement

## Supported modes

- **Audit:** `./startup.ps1 -Mode Audit`; read-only prerequisite review.
- **Extension:** `./startup.ps1 -Mode Extension`; requires prior approval for npm installation and local development build. Must use `dist-dev` and validate local-only routing.
- **FullStack:** disabled; separate authorization and implementation review required before enabling Docker creation/rebuilds.

## Isolation contract

Development and production use one source repository but different build outputs (`dist-dev` and `dist`), API origins, entitlements, and Chrome extension IDs. The development API is `http://127.0.0.1:8000`. No development build may silently fall back to `https://api-v2.birthdaymessaging.io`; the DEV manifest must not include that host permission. Production build behavior must remain unchanged.

## Evidence and QA

Capture source and manifest hashes, build exit code, full `dist` before/after hashes, development manifest and compiled routing checks, local health status, Chrome extension ID, login, entitlement, images, templates, posts, contacts/scanning, and console/service-worker errors. Produce one timestamped evidence ZIP for each execution. Do not include passwords, access tokens, private keys, or personal customer data.

## Payment testing

Use offline, temporary-credential tests with no provider network or real payments. The targeted Bitcoin/Monero idempotency regression and expiration/renewal acceptance remain outstanding until independently verified. Never use operational payment stagenet containers as test runners.

## Clean-machine acceptance

On an explicitly authorized fresh VM, verify prerequisite detection, approved installation, secure development-only configuration, startup, extension build, Chrome loading, local API, and functional QA. Do not mark the onboarding workflow end-to-end accepted before this test.

## Git and release controls

PR #187 is for onboarding. The v992/v997 frontend entitlement/request-guard fixes require their own focused reviewed promotion. No broad staging of unrelated local payment/backend files. Merge and deployment are distinct approvals; Chrome Web Store submission is separate.
