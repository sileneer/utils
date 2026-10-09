# Handover

**Written 2026-10-09 for local C+D review.** Pinned-source previews, bounded
retrieval improvements and expanded/mobile reading are implemented on
`codex/chat-sources-reading`. This commit contains matching code, tests and docs.
The owner approved C+D publication on 2026-10-09; PR/image acceptance and deployment\nare in progress. New real provider requests remain a separate approval.

Runtime: [ARCHITECTURE](ARCHITECTURE.md). Operations:
[DEPLOYMENT](DEPLOYMENT.md). Debugging: [GOTCHAS](GOTCHAS.md).
Binding UI: [DESIGN](DESIGN.md). Decisions: [PLANNING](PLANNING.md).

## 1. Position and authorization

Public verified-email/password accounts, the owner's selected administrator and
AI activation were approved previously. The owner confirmed registration,
logout/login and password reset. Do not request those approvals again.

A+B shipped through [PR #2](https://github.com/sileneer/utils/pull/2).
The owner requested PLANNING §12 C+D local implementation, reviewed the local\nresult, then explicitly approved publication on 2026-10-09.
E/admin/backup work remains separate. The prior six real AI acceptance calls
are exhausted; this batch made zero new real provider calls. Mock streams and
offline source reads are the evidence, not model-quality acceptance.

## 2. Working tree and release position

Branch `codex/chat-sources-reading` starts at `0ef6b53`. The focused local commit
includes the C+D implementation and documentation; no push, PR, merge or deployment
was performed for this batch. Ignore `data/investigation/chat-cd/`, cached books,
disposable databases, local helper scripts and user-owned `.zcode/`.
`.env.example` remains the only tracked environment file.

Previously verified production: `0ef6b53`, following the A+B feature squash
`ba733a6` and its release record.
[Feature CI/CD](https://github.com/sileneer/utils/actions/runs/37924300942) and
[release-record CI/CD](https://github.com/sileneer/utils/actions/runs/37925992128)
were green. Production was not rechecked or modified in this C+D turn.
A future publication needs its own green image/CI/deployment and actual runtime
verification; do not infer them from local build success.

## 3. Implementation map

ARCHITECTURE §2/§3/§6 owns the source-preview API, numbered-entry search,
pinned iframe navigation and page-local reading state. DESIGN §5.6.3 registered
the CitationPreview wrapper and reading interactions before use. No dependency,
base component, token, database migration, host setting or deployment guard changed.
PLANNING §12 records the fixed retrieval comparison, residual miss and quality limits.

## 4. Next work, in order

1. Owner review of the local preview, then explicit publication approval. Publish
   through a focused PR, normal acceptance/CI, merge and actual production checks.
   Local C+D is implemented; publication is the remaining release gate.
2. Real answer fidelity, unsupported-condition checks, long-context growth and
   SDK resume/performance measurement require a fresh bounded provider allowance.
   Offline retrieval scores and canned responses do not establish those results.
3. Actual phone keyboard/IME, occlusion and safe areas need physical-device checks.
   Desktop viewport emulation is not evidence of a real software keyboard.
4. E/admin visibility and backup protection are separate future work. Previous
   manual backup/isolated restore passed; first naturally scheduled run and
   off-machine storage/retention are still pending. Do not upload/prune private
   data without the separate owner choices.

## 5. Previously shipped service state

A+B migration 003 was applied with integrity_check ok, no foreign-key violations
and original account fields, 4 conversations, 16 message rows and 8 usage rows
preserved against the pre-release backup. AI was enabled with the existing
100 per-user / 2000 global daily limits. Those are prior release observations;
this batch did not inspect or change production data/configuration.

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

No local Docker is available. Linux Node 22/image/SDK/startup acceptance and
production-source availability for this change await the separate release workflow.

## 8. Independent record inconsistencies

DESIGN §12's historical morphicons/next-intl/Prettier record and old Git/date/
pipeline proposals remain independent. DEPLOYMENT is the operations authority;
reconcile current state before reusing old receipts.
