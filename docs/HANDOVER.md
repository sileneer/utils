# Handover

**Written 2026-10-09 after the approved PR #7 publication and D acceptance.**
Runtime contracts: [ARCHITECTURE](ARCHITECTURE.md) §5. Operations:
[DEPLOYMENT](DEPLOYMENT.md). UI: [DESIGN](DESIGN.md) §5.9. Approved scope:
[PLANNING](PLANNING.md) §13.

## 1. Authorization

The owner approved A+B+C, then explicitly approved merging/publishing PR #7
and completing D. The feature is deployed and production account acceptance has
passed. This matching documentation update uses the same normal CI/CD; final
exact-head/runtime evidence is stored in the private release receipt below.
Previously settled account/admin/AI and env-release approvals remain settled.
Never mint/export production sessions or bypass normal authentication. Off-machine
backup uploads and pruning remain unapproved.

## 2. Checkout and release position

Checkout: `main`. [PR #7](https://github.com/sileneer/utils/pull/7) passed all
exact-head checks at `15e43fd` in
[37997563313](https://github.com/sileneer/utils/actions/runs/37997563313), with
GitGuardian and qlty green. It squash-merged as `98f6149`; normal CI/CD
[37998131093](https://github.com/sileneer/utils/actions/runs/37998131093) passed
test, accepted-image publication and deploy. The running OCI revision matched
that merge and was healthy. No dependency, schema or production env change.

Feature proof is in ignored `data/investigation/site-account/review-receipt.json`.
Final documentation revision/run, actual runtime and sanitized D acceptance live
in `data/investigation/site-account/release-receipt.json`. Check that receipt for
the final deployed revision; do not infer it from the feature merge alone.
Keep fixtures, databases, book cache, browser
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

PR #7 and D are complete; no feature publication decision remains pending.
Independent earlier follow-ups remain: continuation timeout diagnosis before
   spending five unused real acceptance turns; physical phone keyboard/IME/source
   return; off-machine backup destination/ownership; next natural backup execution;
   cross-device production reset and long-context/mail-header acceptance.

## 5. Production data and backup

A coherent pre-release backup was created with zero active requests at
`/app/data/backups/release-20261009-site-account.sqlite` (600). Post-deploy integrity
and FK checks passed; all baseline rows in user/account/session/verification and
chat/message/usage/metadata tables were compared internally and exactly preserved.
Owner verification/admin status, five histories and 18 messages, quota use,
model catalog, retained source versions and persistent SDK mount remain present.
The private env is still 600/owned by utils-deploy. No DB replacement, off-machine
copy or pruning. Existing backup script/schedule remain installed. Operations:
DEPLOYMENT §11–12.

## 6. Isolated preview

Disposable preview artifacts/fixtures remain ignored under
`data/investigation/site-account/`. Its standalone launcher/PID are recorded there;
verify command lines before stopping owned processes and stop before Windows
rebuilds. QA browsers were isolated; the production release browser
`utils-account-release-20261009` was normally logged in by the owner. No cookies
were exported, captured or minted. Anonymous acceptance used a separate browser.
Release screenshots are outside Git in the permitted visualization folder.
Temporary browsers/preview are cleaned up at completion; production is the
review target. Never expose the loopback fake outbox or its disposable fixtures.

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

Production D acceptance passed public home/about/reading/health, safe anonymous
account/catalog projection, protected account/admin redirects, private API 401s
and retained pinned-source behavior. The normally authenticated owner/admin
account and session display APIs passed safe/no-store checks; history count,
model catalog and quota availability matched the pre-release browser baseline.

Live home-to-account, closed-reader-to-account, reader/chat shared menus,
About entry and admin access passed. English/Chinese, light/dark 360px and desktop
screenshots were freshly inspected without horizontal overflow. Live account axe
reported zero violations/incomplete. Preferences were restored after inspection.
No production profile/password/session mutation, real mail or paid AI call was
performed for this release; destructive/sensitive workflows were exercised with
disposable credentials locally. No production cookies were exported.

Earlier real source-answer QA used one turn that timed out before final answer/
token data. Source fidelity, unsupported-condition and long-context acceptance
remain unpassed; continuation cause remains unknown (GOTCHAS §C). Five real
acceptance turns remain. D's account release completion does not close those
independent AI/physical-device/off-machine backup follow-ups.
