# Repository Sanitization and Engineering Handoff

## Sanitization performed on this handoff copy

This package was produced as a clean engineering handoff rather than an archival snapshot.

Removed from the handoff copy:

- assistant-specific context/export directories and filenames;
- assistant-specific instructions embedded in helper scripts/readme files;
- raw Microsoft `.eml` diagnostic evidence;
- one-off Cloudflare SMTP/DKIM diagnostic scripts;
- local and production `.env` files;
- BTCPay test-session and preflight artifacts;
- generated test-result/log/source-dump files likely to contain private operational data;
- backend backup snapshots containing historical environment files;
- repository `.git` history;
- dependency `node_modules` directories;
- historical reference archives that could contain removed artifacts.

The source tree retains `.env.example` only, with non-secret placeholders.

## Secret policy

Production credentials must be injected by the deployment platform. The following values must never be committed:

- Cloudflare Email Sending API token;
- BTCPay API key and webhook secret;
- Stripe secret/webhook keys if Stripe remains enabled;
- database passwords;
- JWT signing secret;
- SMTP encryption key;
- Sentry DSN if treated as internal deployment configuration.

If a credential has ever appeared in a screenshot, shell history, source file, support attachment, or shared archive, rotate it rather than relying on deletion alone.

## Repository history warning

This sanitized handoff copy does not contain `.git`. Removing a secret from the working tree does not remove it from any existing remote repository history. Before publishing or handing off the original repository, separately audit Git/Gitea history and rotate exposed credentials.
