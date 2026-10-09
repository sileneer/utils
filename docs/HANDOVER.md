# Handover

**Written 2026-10-09 after implementing site-wide accounts.**
Runtime contracts: [ARCHITECTURE](ARCHITECTURE.md) §5. Operations:
[DEPLOYMENT](DEPLOYMENT.md). UI: [DESIGN](DESIGN.md) §5.9. Approved scope:
[PLANNING](PLANNING.md) §13.

## 1. Authorization

The owner approved implementing §13 A+B+C. Implementation and local verification
are complete. The feature PR is ready for review; merging and deployment still need
separate owner approval. Do not modify production during this account preview.
Previously settled account/admin/AI and env-release approvals remain settled.
Never mint/export production sessions or bypass normal authentication. Off-machine
backup uploads and pruning remain unapproved.

## 2. Checkout and release position

Branch: `codex/site-wide-account`, based on production main `7f9d17d`.
Draft [PR #7](https://github.com/sileneer/utils/pull/7) contains the feature, tests
and matching documentation. Its acceptance workflow is pending; no new dependency,
database schema or production env change. Production has not been changed by this
feature. Prior env-release proof lives in ignored
`data/investigation/ai-env/release-receipt.json`.

Feature PR acceptance builds/tests without publishing; inspect the current head
with `gh pr checks` before release. Local receipt/evidence lives in ignored
`data/investigation/site-account/`. Keep fixtures, databases, book cache, browser
receipts, screenshots, `.env` and `.zcode/` out of Git.

## 3. Implementation map

ARCHITECTURE §5 owns the identity projection, account APIs, safe return paths,
shared events and future-module integration recipe. DESIGN §5.9 registers the
shared entry and account center. PLANNING §13 owns scope and deferred features.
GOTCHAS owns authorized password-write cancellation and controlled-dialog focus.
All modules reuse the existing authentication/SQLite identity; UI state grants no
server access. Logout, password/reset and session revocation wait for account-wide
query release, and stale authenticated requests cannot reserve a paid turn later.

## 4. Next actions

1. Inspect exact-head PR Linux/native SQLite/SDK/final-image acceptance, GitGuardian
   and qlty. Review the local preview and request separate merge/deploy approval.
2. Once approved, use the existing keyless/health-checked release workflow, backup
   production state and verify normal account UI plus existing reading/chat/admin
   behavior. Do not spend paid AI calls just to verify account changes.
3. Independent earlier follow-ups remain: continuation timeout diagnosis before
   spending five unused real acceptance turns; physical phone keyboard/IME/source
   return; off-machine backup destination/ownership; next natural backup execution;
   cross-device production reset and long-context/mail-header acceptance.

## 5. Production data and backup

This feature has not touched production data. Prior coherent env-release backup
and preservation proof are in the private release receipt above. Existing host
backup cron and admin operations remain active; no off-machine copy or pruning
was enabled. Current operations and paths are documented in DEPLOYMENT §12.

## 6. Isolated preview

`http://localhost:3001/` runs the complete standalone with disposable SQLite and
mock mail/CAPTCHA/provider configuration, with AI disabled. Launcher:
`data/investigation/site-account/preview-app.cjs`; recorded PID: `app.pid` beside it.
Verify the process command line before stopping it. Stop this standalone before
rebuilding on Windows. Fake outbox/fixtures use loopback 3002; never expose or
commit their contents. Owned browser sessions are `utils-site-account-qa-20261009`
and `utils-site-account-secondary-20261009`. No production cookies were accessed.
Fresh screenshots live in the permitted visualization folder outside Git.

## 7. Verification and limits

75 regressions pass, including 12 new real-library/SQLite account integration
checks. Local lint and complete production build/typecheck pass. No provider
secret env names occur in client chunks. Security tests cover safe projection,
origin/field policy, foreign session IDs, wrong passwords/OTPs, account isolation,
password policy/rotation, cancellation timeout and concurrent/stale authorization.

Isolated browser acceptance passed registration/verification/login return path,
profile propagation, password confirmation/change, second-browser revocation,
reader logout with chat closed, other-tab invalidation and full return query.
Shared reader/chat menus were checked; English/Chinese, light/dark and 360px plus
desktop layout have no page overflow. Fresh account screenshots were inspected.
All account-page buttons are at least 40px. Account axe checks report zero
violations/incomplete; modal axe has zero violations and two manual checks.
Manual checks pass Tab containment, both cancel-focus targets and modal description
contrast (6.26:1). This is browser emulation, not physical-device acceptance.

No real emails, production mutations or paid AI calls were made for this feature.
PR/image CI and deployed feature acceptance must be confirmed separately. Earlier
real source-answer QA used one turn that timed out before final answer/token data;
source fidelity, unsupported-condition and long-context acceptance remain unpassed.
Its continuation cause remains unknown; see GOTCHAS §C. Five real turns remain.
