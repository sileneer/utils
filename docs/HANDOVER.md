# Handover

**Written 2026-10-09 after approved PR #5 publication and online env changes.**
Runtime: [ARCHITECTURE](ARCHITECTURE.md). Operations: [DEPLOYMENT](DEPLOYMENT.md).
Binding UI: [DESIGN](DESIGN.md). Decisions and approval scope: [PLANNING](PLANNING.md) §12.

## 1. Position and authorization

The owner approved merging PR #5 and completing online configuration. This includes
the necessary registry-cache release repair. Owner account, administrator, verified
email/password registration/login/reset and AI activation were approved previously;
do not request those settled approvals again. No paid AI call was made for this release.
The earlier six-turn real acceptance budget has one timeout and five unused turns.
Never mint/export production sessions or bypass normal authentication. Off-machine
uploads and pruning remain unapproved.

## 2. Working tree and release position

[PR #5](https://github.com/sileneer/utils/pull/5) passed exact-head Linux/image
acceptance at `5de4f4a` in [37987342058](https://github.com/sileneer/utils/actions/runs/37987342058)
and merged as `69904b6`. Its first deployment and failed-job retry hit Docker Hub
429 before image build; deploy stayed skipped and the prior image remained healthy.
[PR #6](https://github.com/sileneer/utils/pull/6) repaired this with shared registry
cache configuration; exact-head `4000e1e` passed [37990334329](https://github.com/sileneer/utils/actions/runs/37990334329),
GitGuardian and qlty, then merged as `57d7ac89e0bb9a72d6698b90a996093be4f98b2f`.
Normal CI/CD [37990663912](https://github.com/sileneer/utils/actions/runs/37990663912)
passed all jobs. Actual production OCI matched that revision and was running/healthy
after the health-checked env-only recreation. Publication and host env changes are complete.
This matching documentation commit follows the same normal CI/CD; its final exact
runtime revision/run and sanitized proof are kept in ignored
`data/investigation/ai-env/release-receipt.json`. No dependency or migration was added.

Keep investigation folders, cached book files, disposable databases, browser receipts
and `.zcode/` out of Git. Only `.env.example` may be tracked; production secrets stay
on the server. Do not publish raw sessions, transcripts or credentials.

## 3. Implementation map

ARCHITECTURE §3/§8 owns runtime configuration, safe public projection, SDK mapping
and historical-model behavior; DEPLOYMENT §12 owns env refresh/rollback. The server
now uses AI_API_KEY only, with old token assignments removed; its value is unchanged.
The existing endpoint, default, auxiliary overrides, auth/mail/CAPTCHA settings and
100 per-user / 2000 global limits were preserved. AI_MODELS contains the five choices
from the commented template. The private host env remains 600, owned by utils-deploy.
Runtime parser alias compatibility remains available to other self-deployments.
DEPLOYMENT §2 owns the shared registry-cache workflow; all image/health/keyless
publication guards remain intact. Existing picker styling is registered in DESIGN §5.6.
ARCHITECTURE §10 and DEPLOYMENT §12 own the published administrator/backup contracts.

## 4. Next work, in order

1. Diagnose model continuation after successful search before spending any of the
   five remaining real acceptance turns. Preserve deadline, guards and no-retry budget.
2. Await actual phone keyboard/IME/source-return evidence. Desktop emulation does
   not establish physical software-keyboard behavior.
3. Owner must choose off-machine destination/ownership before storage/IAM/upload
   or retention actions. The concrete GCS proposal lives in DEPLOYMENT §12.
4. Verify the next natural execution of the installed backup producer; its manual
   execution passed, while the prior producer had separate natural-run evidence.
5. Cross-device production reset, mail headers/other inboxes and long-context
   SDK measurement remain distinct from completed local regressions.

## 5. Data and backup state

Fresh coherent private release backup: `/app/data/backups/release-20261009-ai-env.sqlite`
(600), made before host changes with zero active requests, integrity ok and no FK issues.
After deployment/recreation all original rows across user/account/session/verification/
conversation/message/usage/metadata tables were compared internally and preserved exactly.
Account identity, verified state, role/status and schema versions were preserved.
Saved source versions and SDK mount remain present. No production database was replaced.
Host backup script and existing 03:15 UTC cron remain active; administrator backup status
is fresh. No off-machine copy or pruning was activated.

## 6. Local preview and evidence

Isolated app launcher: `data/investigation/ai-env/preview-app.cjs`; disposable auth/mail/
CAPTCHA/provider config, AI/quotas disabled, separate SQLite. Loopback proxy on 3001:
`tests/preview.cjs`, never imported into production. Verify recorded PID command lines
before stopping owned processes; stop the standalone before rebuilding on Windows.
Local and live screenshots remain outside Git in the permitted visualization folder.
The independent `utils-env-release` Chrome session was normally logged in by the owner;
only readonly catalog/history/availability/admin checks were made. No cookies were exported.

## 7. Verification state and limits

63 regressions, local lint and complete production build/type checks passed. Both accepted
PR heads and normal release CI ran Linux native SQLite/SDK/final-image persistence/restore/
runtime-env acceptance. Configuration tests cover quoted JSON dotenv loading, canonical/
legacy precedence, custom/removed models, safe metadata, SDK mapping, selected slots and
failure before quota/SDK. Client chunks contain no provider env names or configured endpoint.
Anonymous production probes pass health/reading 200, private APIs 401, admin login redirect,
exact safe no-store catalog projection, pinned source 200 and invalid source 400.
Normal authenticated readonly APIs return 200/no-store with all five models, unchanged
default, history and quota use, administrator access and fresh backup status.
Published picker was inspected at 360px in light/dark and at desktop width; no page overflow.
Local custom-default/preference/removed-model tests passed English light/Chinese dark.
One local canned stream verified per-message model display, not real AI quality.
Local dark axe had zero violations and one manual modal-focus check; no zero-incomplete
full-audit claim. Previous administrator mobile audits passed, but this env release adds
no new administrator UI. Desktop keyboard/IME/source-return emulation passed previously.

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
