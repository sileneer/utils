# Handover

**Written 2026-10-09 during runtime AI environment configuration.**
PR #4 is published at verified production OCI revision `860157b`.
The configuration work is on `codex/ai-env-config`; it is not published.

Runtime: [ARCHITECTURE](ARCHITECTURE.md). Operations and backup procedures:
[DEPLOYMENT](DEPLOYMENT.md). Binding UI: [DESIGN](DESIGN.md).
Decisions, fixed retrieval results and approval scope: [PLANNING](PLANNING.md) §12.

## 1. Position and authorization

The owner explicitly approved merging and publishing PR #4. Publication and
matching host backup-script activation have completed. Owner account, verified
email/password flow, administrator and AI activation were approved previously;
registration, login and password reset passed owner testing. Do not request
those settled approvals again.

The owner now requests central runtime .env configuration of the AI endpoint,
token, default and picker catalog. Implementation and draft PR preparation are
authorized; publication follows the separate checkpoint in PLANNING §12.10.
The owner also requested generic API-key naming; AI_API_KEY is now preferred,
with existing aliases retained and the SDK child token mapped server-side.

The fresh real AI acceptance budget is at most six turns, with no automatic
retries. One was submitted through the normally authenticated independent Chrome
session `utils-e-live`; it timed out. Five remain unused. Acceptance was stopped
at that failure. Never mint/export production sessions or bypass the normal
route with direct SDK calls. Off-machine uploads and pruning remain unapproved.

## 2. Working tree and release position

[PR #4](https://github.com/sileneer/utils/pull/4) passed exact-head Linux/final-image
acceptance at `0ef87e2c33e4bfc7c85f4de3397b947954ba691d`, run
[37965890797](https://github.com/sileneer/utils/actions/runs/37965890797), plus
GitGuardian and qlty. Squash merge produced
`a7eb218228048848c6ee72dd65123c137f4d677a`; normal CI/CD
[37966769716](https://github.com/sileneer/utils/actions/runs/37966769716) passed.
Production OCI revision matched that feature commit and was running/healthy.
Matching documentation `860157b2a3af06ff55f080a2de45720e4d709f78` passed CI/CD
[37969859258](https://github.com/sileneer/utils/actions/runs/37969859258); actual
runtime revision matched and was healthy. Fresh private backup matched all eight
live account/auth/chat/usage tables. Original records remain preserved.

The runtime-config implementation and matching docs are committed/pushed through
[draft PR #5](https://github.com/sileneer/utils/pull/5). Inspect its exact-head
Linux/image checks before publication; its
receipt lives in ignored `data/investigation/ai-env/`. No dependency/migration,
production env edit, quota change, deployment or paid request occurred in this work.

Keep `data/investigation/chat-e/` and earlier investigation folders, cached book
files, disposable databases, browser receipts and `.zcode/` out of Git. Only
`.env.example` may be tracked. No production credentials are used locally.

## 3. Implementation map

New runtime config: ARCHITECTURE §3/§8 owns configuration, public projection and
historical-model behavior; DEPLOYMENT §12 owns env rollout; PLANNING §12.10 owns
its decision and approval boundary. Existing dropdown styling remains registered
in DESIGN §5.6, with localized neutral hints and unavailable/loading disabling.

Published operations: ARCHITECTURE §10 owns aggregate definitions, current-role checks,
reported/missing metrics and backup status contract. DESIGN §5.8 registered the
OperationsDashboard before use. DEPLOYMENT §12 owns host-script rollout and the
owner-reviewable off-machine storage proposal. PLANNING §12.9 records the scope
and retrieval result. No dependency or database migration was introduced.

Other changes: account-menu administrator link; focus/keyboard-only visual
viewport handling; multi-term proximity tie-break; real local two-session reset
revocation; Linux final-image backup-status/restore acceptance.

## 4. Next work, in order

1. Inspect the runtime-config draft PR and its Linux/image gate. On approved
   publication preserve the server key/base/default and auxiliary overrides;
   add the commented AI_MODELS catalog to the host .env to retain the existing
   five choices. Use DEPLOYMENT §12 rollout; no provider credentials are needed
   in Git/local QA, and no paid acceptance is implicit.
2. Diagnose model continuation after successful search results before spending
   any of the five remaining acceptance turns. Keep the existing deadline,
   authentication boundary, provider environment allowlist and no-retry budget.
   No root cause or model-quality/context acceptance has been established.
3. Await actual phone keyboard/IME/source-return report. Desktop emulation is
   complete but does not establish physical software-keyboard behavior.
4. Owner must select off-machine destination/ownership before creating storage,
   granting IAM, uploading private account/chat data or setting retention. The
   concrete GCS proposal is ready; no bucket/upload/pruning was performed.
5. Verify the next natural execution of the new backup producer. Manual execution
   passed; the previous producer's natural schedule is separate evidence.

## 5. Verified production backup/data state

The previous producer's naturally scheduled 2026-10-09 03:15 UTC backup was
verified with integrity ok, zero foreign-key issues and an isolated restoration
preserving every user/account/conversation/message/usage row. Counts were
1/1/4/16/8. SDK resume IDs were cleared in the restored copy only; live data was
unchanged and the temporary restore directory was removed.

Before PR #4 deployment a coherent private release backup was created at
`/app/data/backups/release-20261009-chat-e.sqlite` (600). Every original account,
conversation, message, usage and metadata row was preserved exactly after release;
account identity/verified/role/status values were compared internally. The first
QA turn added a conversation and failed exchange; only that conversation's title
was changed to identify the timeout. No existing chat was deleted or modified.

Matching `deploy/backup.sh` is installed at `/opt/utils/backup.sh`, owned by
utils-deploy (750); its previous version is retained as
`/opt/utils/backup.sh.pre-chat-e-20261009`. Cron is active, with the existing
03:15 UTC job and unchanged crontab. Manual execution as utils-deploy succeeded:
manifest complete, SQLite integrity ok, zero foreign-key issues, database/status
600 and directory 700. The authenticated dashboard reports fresh backup status.
No off-machine copy or pruning was activated.

Schema remains 001-auth, 002-product, 003-chat-history. AI remains enabled at
100 per-user / 2000 global daily limits; server environment is mode 600.
No configuration, quota, auth or deployment guard was changed during release.

## 6. Local preview and evidence handling

Isolated app launcher: `data/investigation/ai-env/preview-app.cjs`; fake local mail
and CAPTCHA/provider config, AI/quotas disabled, disposable `qa-env.sqlite`. Proxy:
`tests/preview.cjs` on loopback 3001, never imported into the production image.
These fixtures are not evidence of real authentication delivery/model behavior.

PID/log files in the investigation folder own the processes. Verify the recorded
PID's current command line before stopping it. Stop the owned standalone before
rebuilding its output on Windows; wait for readiness before starting QA.
Screenshots with `env-models-`, `e-final-` and `e-production-` prefixes are outside Git in the
permitted visualization folder. Do not publish session values, raw production
browser/provider data, private transcripts or credentials in docs, PRs or logs.

## 7. Verification state and limits

63 regressions, local lint and complete production build/type checks passed.
The generic-key delta covers nonblank alias precedence, runtime dotenv loading,
SDK child mapping and exclusion from public metadata.
New offline configuration checks cover a quoted JSON catalog loaded from a
disposable .env, canonical/legacy tokens, custom/removed models, safe public
projection, default fallback, slot overrides and failure before SDK/reservation.
Client chunks contain no provider env variable names or configured endpoint.
Linux image smoke asserts the new complete anonymous response shape, private
gates and same-image runtime model changes while preserving account/chat data.
Its exact-head run, including final acceptance status, is recorded in the ignored
PR receipt; no local Docker is available.
Current local model picker checks cover custom runtime defaults, preference
persistence and removed-ID fallback in English light/Chinese dark at 360px and
1280px desktop. One canned stream verified displayed per-message model metadata,
not real AI quality. Mobile dark axe had zero violations, with one manual check
for the existing modal focus guards; this is not a zero-incomplete full audit.
Production checks below belong to the already published PR #4, not this branch.
Coverage includes current active/verified/admin role isolation, bounded aggregates
and missing metrics, percentile thresholds, truncation, malformed/stale/interrupted
backup status, coherent restoration, two independent local sessions revoked on
password reset, viewport guards and multi-term ranking. Final-image acceptance
and normal deployment gates passed at the release commits listed in §2.

Production anonymous probes passed: health/reading 200, admin and conversation
API 401, session unauthenticated with no user, admin page redirect to login,
pinned-source entry 200 and invalid revision 400. Normal authenticated admin
access returned 200 with no-store, current quotas and fresh backup status.

Admin UI was inspected at 360px in English light/Chinese dark and at 1280px;
no horizontal page overflow. Settled production axe audits passed with 42 passes,
zero violations/incomplete in both mobile theme/language combinations. A theme
transition left a closed tooltip in the first dark audit; reloading and checking
the fully loaded dashboard cleared it before the final audit. Local UI also
passed 768px and loading/error/truncation states; controls are 40px high.

Local canned-chat regression verified Chinese composition/229 does not send,
touch Enter makes a newline, and a simulated 430px keyboard leaves input visible.
Multi-line draft/expanded source survive source return; same-viewport scroll
position was unchanged (2293px). These are desktop emulation, not physical phone
acceptance. Fixed retrieval comparison and limits live in PLANNING §12.8/§12.9.

The first production answer/source QA turn used deepseek-flash with pinned source
`bb25081b423091f9e22059aab6b4ed7343a2266d`. It timed out after 189592ms,
with first text at 22145ms and two search calls; no completed answer or reported
Token usage arrived. A sanitized inspection of this QA turn's native transcript
showed both searches returning non-error source results within about 0.5s of
their tool calls. The later model continuation did not finish before the deadline;
its root cause remains unknown. Container OOM was false and restart count zero;
post-query resource readings do not establish peak usage or upstream health.

The dashboard correctly reflected a failed request, missing Token sample, no
active request and a released concurrency slot. Five unused turns were retained,
with no retry or model switch. Source fidelity, unsupported-condition handling
and long-context acceptance remain unpassed. See GOTCHAS §C for diagnostic method.

## 8. Independent gaps

Off-machine protection is not enabled. Real cross-device production reset,
mail authentication headers/other inboxes, physical phone behavior and long-context
SDK measurement remain distinct from local regressions. Historical DESIGN records
and docs-only workflow filtering remain independent; DEPLOYMENT is the operations
authority. Do not infer external acceptance from mock, retrieval or unit checks.
