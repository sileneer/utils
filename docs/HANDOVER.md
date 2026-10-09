# Handover

**Written 2026-10-09 during operations/remaining-acceptance implementation.**
C+D remains live at verified OCI revision `8ea3c78`. The new operations batch
is on `codex/chat-operations` and has not been published.

Runtime: [ARCHITECTURE](ARCHITECTURE.md). Operations/backup activation:
[DEPLOYMENT](DEPLOYMENT.md). Binding UI: [DESIGN](DESIGN.md).
Decisions, fixed retrieval results and approval scope: [PLANNING](PLANNING.md) §12.

## 1. Position and authorization

The owner requested completion of remaining quality, backup, administration,
mobile and account/context checks. Implement this batch and prepare a reviewable
PR; publication still follows PLANNING §12.7. Do not reuse C+D publication approval.
Owner account, verified email/password flow, administrator and AI activation were
approved previously. Registration, login and password reset passed owner testing.
Do not request those settled approvals again.

A fresh real AI acceptance budget is at most six turns, with no automatic retries.
Zero have run in this batch. The independent Chrome session `utils-e-live` is at
production login; owner-operated login is pending. Never mint/export production
sessions or bypass the normal route with SDK calls.

## 2. Working tree and release position

Base main is `8ea3c7811eb745a09d3173f1003841b112051ab8`. C+D was published through
[PR #3](https://github.com/sileneer/utils/pull/3), with feature image acceptance
37953518834 and CI/CD 37953929046; matching-record CI/CD 37955293934 also passed.
Actual production container revision matched the record and was healthy again
in this investigation. Implementation and matching docs are committed and pushed through draft
[PR #4](https://github.com/sileneer/utils/pull/4). The working tree is clean.
Use that PR exact-head checks as the current Linux/image acceptance authority;
the matching receipt lives under ignored investigation evidence.
Do not merge/deploy until this batch is separately approved.

Keep `data/investigation/chat-e/` and earlier investigation folders, cached book
files, disposable SQLite databases, browser receipts and `.zcode/` out of Git.
Only `.env.example` may be tracked. No production credentials are used locally.

## 3. Implementation map

ARCHITECTURE §10 owns administrator aggregate definitions, current-role checks,
reported/missing metrics and backup status contract. DESIGN §5.8 registered the
OperationsDashboard before use. DEPLOYMENT §12 owns host-script rollout and the
owner-reviewable off-machine storage proposal. PLANNING §12.9 records the scope
and retrieval result. No dependency or database migration was introduced.

Other changes: account-menu administrator link; focus/keyboard-only visual
viewport handling; multi-term proximity tie-break; real local two-session reset
revocation; Linux final-image backup-status/restore acceptance.

## 4. Next work, in order

1. Inspect exact-head PR acceptance and its receipt before publication. Reviewable local
   admin page is http://localhost:3000/admin (disposable verified mock account).
   Source/chat preview is http://localhost:3001/htlb (explicit canned responses).
2. Await owner login to the independent production browser, then run the bounded
   six-turn answer/source/unsupported-condition/long-context checklist through
   normal authenticated routes. Store sanitized results under ignored evidence.
3. Await actual phone keyboard/IME/source-return report. Desktop emulation is
   completed but does not establish physical software-keyboard behavior.
4. Owner must select off-machine destination/ownership before creating storage,
   granting IAM, uploading private account/chat data or setting retention. The
   concrete GCS proposal is ready; no bucket/upload/pruning was performed.
5. Seek separate publication approval for this reviewable batch. After release,
   synchronize the matching host backup script and verify once as described in
   DEPLOYMENT §12; preserve existing cron, private permissions and deploy guards.

## 5. Verified production backup/data state

The naturally scheduled 2026-10-09 03:15 UTC backup exists, mode 600, SQLite
integrity ok and zero foreign-key issues. Cron execution and private log were
verified. An independent restore into a unique private temporary directory
preserved every user/account/conversation/message/usage row exactly. Counts were
1/1/4/16/8. SDK resume IDs were cleared in the restored copy only; live database
was unchanged. The created restore directory was removed after checks.

Production schema remains 001-auth, 002-product, 003-chat-history. AI remains
enabled at 100 per-user / 2000 global daily limits. Environment permissions remain
600; no configuration/quota change or real AI request occurred in this batch.
The new status-manifest script has not been installed in production; an older
installation will correctly show unavailable until the matching rollout runs.

## 6. Local preview and evidence handling

Isolated app launcher: `data/investigation/chat-e/preview-app.cjs`; fake local mail
and CAPTCHA, AI/quotas disabled, disposable `qa-final.sqlite`. Proxy:
`tests/preview.cjs` on loopback 3001, never imported into the production image.
These fixtures are not evidence of real authentication delivery/model behavior.

PID/log files in the investigation folder own the processes. Verify the recorded
PID's current command line before stopping it. Stop the owned standalone before
rebuilding its output on Windows, wait for HTTP readiness before starting QA.
Final screenshots with `e-final-` prefixes are outside Git in the permitted
visualization folder. Do not publish disposable session values or raw production
browser/provider data in docs, PRs or logs.

## 7. Verification state and limits

56 automatic regressions pass, including current active/verified/admin role
isolation, bounded aggregates/missing data, percentile sample thresholds,
truncation, stale/interrupted/malformed backup manifests, coherent backup restore,
two independent local sessions revoked on password reset, viewport guards and
multi-term ranking. Local lint and complete production build/type checks passed;
final formatting was rechecked successfully before commit. No local Docker is available;
Linux Node 22/final-image checks must run at the exact PR head.

Final local admin UI was inspected in English/Chinese, light/dark and at
360/768/1280px, without horizontal page overflow; action controls are 40px high.
Period switches clear prior data; failed refresh retains a labeled previous
snapshot; truncated windows show incomplete totals. Settled full-page axe checks
reported 42 passes, zero violations/incomplete in English light and Chinese dark.
The initial menu-transition audit was discarded and repeated after it settled.

Local canned-chat regression verified Chinese composition/229 does not send,
touch Enter makes a newline, and a simulated 430px keyboard leaves input visible.
It used one canned stream, zero real model calls. Multi-line draft and expanded
source survive source/return; same-viewport source-return scroll difference was zero (2293px before/after).
Physical phone and authenticated real AI/context acceptance remain pending.

Fixed retrieval comparison and limits live in PLANNING §12.8/§12.9; no test cases
or gold locators were changed. A 20/20 retrieval score is not model-quality proof.

## 8. Independent gaps

Off-machine protection is not enabled. Real cross-device production reset,
mail authentication headers/other inboxes, physical phone behavior and long-context
SDK measurement remain distinct from the local regressions. Historical DESIGN
records and docs-only workflow filtering remain independent; DEPLOYMENT is the
operations authority. Do not infer external acceptance from mock or unit checks.
