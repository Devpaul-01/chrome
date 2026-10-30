# BirthdayMessaging development guide — PR #187 proposed replacement

## Safe first run

Start with `cd bm-ts` then `./startup.ps1 -Mode Audit` in PowerShell. Audit is a prerequisite check; it does not start Docker, install dependencies, or build an extension. Review its output before taking any additional action.

## Extension-only development

Use `./startup.ps1 -Mode Extension` only after reviewing the candidate startup script and explicitly approving its dependency-install/build behavior. The extension development build must use `npm run build:dev`, generate `bm-ts/extension/dist-dev`, and leave `bm-ts/extension/dist` unchanged. Load `dist-dev` via `chrome://extensions` > Developer mode > Load unpacked. Do not load `dist` for development.

The DEV extension must be visibly labeled `BirthdayMessaging FB - DEV`, use a separate Chrome extension ID, and permit only the approved local API `http://127.0.0.1:8000`. It must reject production API overrides and fail closed when entitlement verification fails. Never reuse production tokens or credentials for local development. An existing healthy local backend and development database may be reused only after confirming they are the intended resources.

## Infrastructure and secrets

FullStack mode is disabled in the proposed startup script. Do not use `docker compose up --build`, `down -v`, `prune`, `reset`, `clean`, or automatic migrations. Do not create images, containers, databases, repository copies, tunnels, or new credentials without separate authorization. Existing environment values, database volumes, and files must be preserved. Developers must receive authorized, development-only secrets via an approved secure channel, never from committed `.env` files.

## Acceptance

Confirm Audit preflight, development build output, production `dist` SHA-256 preservation, manifest permissions, DEV extension ID, local API health, development login and entitlement, saved images/templates/posts, contacts and scanning, and absence of new service-worker errors. Mark unavailable checks `NOT TESTED`, never `PASS`. A clean VM acceptance test remains outstanding until actually executed on an authorized VM.

## Release promotion

Push reviewed commits to Gitea, open a PR, obtain review and merge approval, then use the documented release/deployment workflow. A Git merge alone does not guarantee a production backend deployment or Chrome Web Store publication. Production extension packaging must use `dist`, not `dist-dev`, and requires explicit release approval.
