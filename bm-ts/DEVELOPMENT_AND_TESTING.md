# Development and testing — proposed restoration

## Source of truth
Gitea `ctmmediagroup/BIRTHDAYMESSAGING-LEGACY`, branch `main`. Baseline verified at `dda6a7f58f02e23219c08b9fa67705c9463b9fbc`, including PR #186. Refresh main before opening this restoration PR.

## Workstation onboarding
1. Clone the repository or create an isolated worktree from current main. Do not overwrite an existing dirty development checkout.
2. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\bm-ts\startup.ps1 -Mode Audit`.
3. Review prerequisites and explicitly approve any installation. `-Mode Extension` installs locked extension dependencies and runs `build:dev`.
4. `-Mode Extension -LaunchChrome` opens an isolated Chrome QA profile; confirm extension loaded under `chrome://extensions`.
5. Full-stack startup is **not enabled** until a reviewed Compose configuration verifies unique ports, named volumes, local-only network binding, development-only secrets, and migrations.

## Tests and acceptance
Run backend focused and full test suites, extension Vitest, TypeScript, build, and local health checks. A development-only checkout preview does not verify real PayPal, BTCPay or Monero billing. Never use production credentials in local tests.

## Git protections
Protected main; PR review; required CI; prevent force pushes; code-owner review for billing, auth, deployment and migrations; review changes to approval rules; signed commits if supported. Preserve historical files and document provenance.

## Known recovery patterns
Windows PowerShell 5.1 native stderr can throw `NativeCommandError`: run Git via `cmd.exe` with redirected streams and inspect exit code. Main-server SSH Git transport uses the dedicated Gitea key, not Windows HTTPS. A `git ls-remote` ref does not fetch the commit object. Avoid reapplying patches to modified worktrees. Verify Python test fixture timestamps and isolated plan catalog before treating failures as billing defects.
