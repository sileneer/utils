# Handover

**Written 2026-10-09 after C+D production verification.** Pinned-source previews,
bounded retrieval improvements and expanded/mobile reading shipped through
[PR #3](https://github.com/sileneer/utils/pull/3). Feature image `dd5b9f9` is verified
healthy in production. This matching documentation record follows the normal
CI/CD pipeline too; verify its exact main head and actual OCI revision before
reporting the final publication. New real provider requests remain separate.

Runtime: [ARCHITECTURE](ARCHITECTURE.md). Operations:
[DEPLOYMENT](DEPLOYMENT.md). Debugging: [GOTCHAS](GOTCHAS.md).
Binding UI: [DESIGN](DESIGN.md). Decisions: [PLANNING](PLANNING.md).

## 1. Position and authorization

Public verified-email/password accounts, the owner's selected administrator and
AI activation were approved previously. The owner confirmed registration,
logout/login and password reset. Do not request those approvals again.

A+B shipped through [PR #2](https://github.com/sileneer/utils/pull/2).
The owner requested PLANNING §12 C+D local implementation, reviewed the local
result, then explicitly approved publication on 2026-10-09.
E/admin/backup work remains separate. The prior six real AI acceptance calls
are exhausted; this batch made zero new real provider calls. Mock streams and
offline source reads are the evidence, not model-quality acceptance.

## 2. Working tree and release position

Main contains C+D feature squash `dd5b9f978948740c005c35c2b2985ba58526f6f8` and this
matching release record. The implementation branch was `codex/chat-sources-reading`
(local feature `33ca90a`, accepted PR head `9a95d30`). PR checks passed at that exact
head: [image acceptance](https://github.com/sileneer/utils/actions/runs/37953518834),
GitGuardian and qlty. The feature's
[CI/CD](https://github.com/sileneer/utils/actions/runs/37953929046) is green;
actual server OCI revision matched, with running/healthy container and public health 200.
The record commit still uses normal gates; its run/runtime receipt belongs in ignored
`data/investigation/chat-cd/` after verification. Do not substitute the feature run
for its deployment result.

This matching record changes documentation only; no implementation remains uncommitted.
Ignore `data/investigation/chat-cd/`, caches, disposable databases, helper scripts
and user-owned `.zcode/`. `.env.example` is the only tracked environment file.

## 3. Implementation map

ARCHITECTURE §2/§3/§6 owns the source-preview API, numbered-entry search,
pinned iframe navigation and page-local reading state. DESIGN §5.6.3 registered
the CitationPreview wrapper and reading interactions before use. No dependency,
base component, token, database migration, host setting or deployment guard changed.
PLANNING §12 records the fixed retrieval comparison, residual miss and quality limits.

## 4. Next work, in order

1. Real answer fidelity, unsupported-condition checks, long-context growth and
   SDK resume/performance measurement require a fresh bounded provider allowance.
   Offline retrieval scores and canned responses do not establish those results.
2. Actual phone keyboard/IME, occlusion and safe areas need physical-device checks.
   Desktop viewport emulation is not evidence of a real software keyboard.
3. E/admin visibility and backup protection are separate future work. Previous
   manual backup/isolated restore passed; first naturally scheduled run and
   off-machine storage/retention are still pending. Do not upload/prune private
   data without the separate owner choices.

## 5. Verified production service state

The coherent pre-C+D backup `/app/data/backups/release-20261009-chat-cd.sqlite`
was created before merge, mode 600. Baseline had zero pending/streaming messages.
After feature deployment, account id/email/verification/role/status and every
original conversation/message/usage/meta row matched the backup exactly.
Counts: 1 account, 4 conversations, 16 messages, 8 usage rows, 0 metadata rows.
Migrations remain 001-auth, 002-product, 003-chat-history; integrity_check ok,
foreign-key violations zero. No C+D migration or quota/config change occurred.
AI remains enabled, 100 per-user / 2000 global daily limits. SDK persistent
volume exists; server env remains mode 600, owned by utils-deploy.

Mail/Turnstile and owner-operated account flows passed previously.
Cross-device reset revocation, mail authentication headers/other mailboxes,
external VM IP, docs-only workflow filtering, local Docker and the earlier Tencent
meaning remain independent gaps.

## 6. Local preview and evidence handling

Review preview: **http://localhost:3001/htlb**, explicit mock account and canned
responses/history, with no real login or provider. `tests/preview.cjs` proxies
public source/page assets to the isolated standalone on loopback 3000; its
`/__qa/*` controls are never imported into the application/image.

The launcher and PID/log receipts are ignored under
`data/investigation/chat-cd/`. It blanks provider/auth/mail/Turnstile secrets,
sets AI and quotas to zero, and uses isolated `qa.sqlite` and `qa-data/`.
Check each recorded process's live command line before stopping. Stop the owned
standalone before rebuilding its output on Windows; wait for HTTP readiness
before starting the fixture. Reuse no production credentials or databases.

Fresh screenshots with `cd-` prefixes are outside Git in
`C:\Users\elvis\.codex\visualizations\2026\10\07\01a11742-72fa-7913-b98f-70e25820f214`.
Ignored planning/evidence files describe the test steps. Old-version UI checks used
intercepted local mock history and a verified cached book, not modified real chats.

## 7. Verification state

Local gates passed: lint, all **49** automatic regressions, complete production
build/type checks and standalone environment sanitization. New isolated checks
cover exact old/new source versions, malformed locators, missing items/versions,
bounded previews, response validation, source path restrictions, deterministic
title/section ranking, explicit synonyms, multiple terms and late read offsets.
Existing auth/ownership/quota/Stop/resume/tool-env tests remain green.

The fixed 20-case offline benchmark and limitation live in PLANNING §12.8.
It uses prepared source files without network or provider calls.

Mock native-browser checks passed for English/Chinese and light/dark, with
360/768/1280px layouts visually inspected and no page horizontal overflow.
Desktop expand/compact and mobile source/return preserve the shared draft and
message position; measured same-viewport return difference was zero. Disclosed
source text/open state survives Sheet remount. Old-version preview/full iframe
used the requested revision and anchor; wrong item and temporary fetch failure
showed fallback/retry. Keyboard Enter opens a reference; copy acknowledged success;
account identity/logout remains in its menu. Touch controls measured at least 40px.
Clipboard readback was denied by browser permissions and is not claimed.

Final standalone HTTP probes passed: health 200, anonymous identity without private
fields, protected history/chat/Stop 401 and pinned source 200/400/404/502 boundaries.
The standalone contains no .env artifact; only .env.example is tracked.

Settled mobile/tablet source/dialog axe audits: 31 passes, zero violations/incomplete.
One scrolled desktop audit had zero violations but an incomplete color-contrast
rule for obscured/offscreen text; do not describe it as full accessibility proof.
The mock counter stayed at one canned stream while these read-only operations ran.
No new provider, physical phone or full focus-trap traversal was tested.

Linux Node 22/final-image acceptance passed in PR and main CI, including offline
SDK executable checks, fail-closed startup, persistence and coherent backup restore.
No local Docker is available; no real provider request ran in those image checks.

Production read-only checks passed after feature deployment: health/reader/login 200,
anonymous session exposes no user, private history/chat/Stop 401, source preview
200/400/404/502 boundaries. Saved old source `a18ee40519ed34562ac12a8dc88e053a9c8a9973`
returned the exact revision and bounded original excerpt; its rendered source had
anchor e-8-18. Current source `bb25081b423091f9e22059aab6b4ed7343a2266d`
also returned its matching preview. This newer upstream source does not change the
frozen benchmark version or establish model quality on new content.

Fresh anonymous production browser screenshots at 360 and 1280px, light/dark,
were visually inspected with no page horizontal overflow. Logged-in citation,
draft/scroll return and history interactions were checked locally with explicit
mock history; this rollout did not perform a new authenticated user workflow or
send an AI message. New real provider calls: zero.

## 8. Independent record inconsistencies

DESIGN §12's historical morphicons/next-intl/Prettier record and old Git/date/
pipeline proposals remain independent. DEPLOYMENT is the operations authority;
reconcile current state before reusing old receipts.
