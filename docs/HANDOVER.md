# Handover

**Written 2026-10-09 after feature deployment: approved A+B recovery/quota and
owned conversation history shipped through PR #2. Acceptance and CI/CD passed;
production runs feature commit ba733a6, migration 003 is applied, data preservation
and read-only browser/API checks passed. Zero new real AI requests were submitted.
This document is the release-record update; functional evidence below identifies
the exact deployed feature commit and run rather than assuming a later image.**

Runtime contracts: [ARCHITECTURE](ARCHITECTURE.md). Operations:
[DEPLOYMENT](DEPLOYMENT.md). Debugging: [GOTCHAS](GOTCHAS.md). Design:
[DESIGN](DESIGN.md). Decisions: [PLANNING](PLANNING.md). Rewrite at each handover;
keep sections 2, 4 and 7 current.

## 1. Position and authorization

The owner previously approved public verified-email/password accounts, explicitly
selected their verified administrator, and later enabled AI. Owner-operated
registration, logout/login and email password reset passed. Do not ask for those
approvals again. The exact administrator address is private operational input.
Per-message timing/token/progress details remain deployed from the previous release.

The 2026-10-09 approvals cover PLANNING §12 A+B implementation and publication.
C/D/E remain proposals. No additional agent-initiated real AI requests are authorized: the
previous six-request allowance is exhausted. Publication followed the local review.
Any fresh real-acceptance allowance remains separately bounded.

## 2. Working tree and release position

Local checkout: main, fast-forwarded to feature squash commit ba733a6.
[PR #2](https://github.com/sileneer/utils/pull/2) merged after all checks passed:
[pre-release acceptance](https://github.com/sileneer/utils/actions/runs/37923973527).
[CI/CD](https://github.com/sileneer/utils/actions/runs/37924300942) passed test,
final-image build/acceptance/publication and keyless IAP health-gated deployment.
The running container's OCI revision was ba733a64a19d8565c33774bfb9fa8a470590d1ae
and Docker health was healthy. No dependency, secret, pipeline or host configuration
was added. The matching release record is committed on main; future pushes still
require their own green pipeline and actual runtime verification.

`.env.example` is the only tracked env file. Ignored `data/investigation/chat-ab/`
contains disposable QA databases, scripts/logs and planning notes. Do not stage
it, import its data into the app, migrate retired unowned JSON chats, or remove
user-owned `.zcode/`. Other attached historical work remains untouched.

## 3. Implementation map

ARCHITECTURE §3/§5 owns the new availability/activity, terminal reconciliation,
owner-scoped list/search/rename/archive and local draft contracts. DESIGN §5.6.2
registered the project wrappers before use; PLANNING §12 owns scope/decisions.
DEPLOYMENT §11 owns migration/backup/rollback and preview operation. GOTCHAS owns
the rollback-column, Windows output-lock and settled-UI audit findings.

Migration 003 applied successfully on production with a coherent pre-003 backup. No release healthcheck, auth boundary,
keyless WIF pipeline, paid-call guard, model/tool policy or secret placement was
weakened. Book content and source-version requirements remain intact.

## 4. Next work, in order

1. A+B publication is complete. Do not redeploy or send model requests merely to
   repeat successful checks. Any future code/document push must pass its normal
   CI/CD and actual production checks. New real-provider/native-resume acceptance
   still needs a fresh bounded allowance; the previous six calls are exhausted.
2. C/D (source previews/retrieval quality and expanded reading) and E (admin/ops)
   remain separate proposals, not unfinished approved A+B work.
3. Preserve the prior real-acceptance boundary. Six calls covered search/read,
   citation navigation, Stop/SDK child exit and restored complete/stopped history.
   An additional administrator completion previously found in SQLite did not
   establish its browser/native-resume provenance and does not renew the allowance.
4. Off-machine backup storage/retention is still owner-dependent. Local daily
   scheduling, manual backup and isolated restore passed previously; the first
   naturally scheduled run has not been audited. No upload/pruning was authorized.
5. Physical phone keyboard/IME remains unverified. Desktop emulation does not
   prove keyboard occlusion, safe areas or composition on an actual device.

## 5. Service readiness

| Item | State |
| --- | --- |
| Accounts/admin | Previously deployed; owner-operated flows confirmed |
| Mail/Turnstile | Previously configured; diagnostic reached Gmail inbox and real signup passed |
| AI/message details | Existing activation/limits retained; saved details still readable; no new model call |
| Recovery/quota/history | Deployed in ba733a6; mock regressions plus live owned history/quota reads passed |
| Migration 003 | Applied; production integrity/FKs and original-record preservation passed |
| Backups | Previous manual backup/isolated restore passed; scheduled-run/off-machine audit still pending |
| Independent choices | External VM IP, docs-only workflow filtering, local Docker and earlier Tencent meaning remain unresolved |

## 6. Local preview and evidence handling

Review preview is deliberately left running at **http://localhost:3001/htlb**.
It uses the explicit QA mock account and canned responses/history; no real login
or provider is required. Mock history is in that fixture process's memory.
The upstream standalone app is on loopback port 3000 with AI/quotas disabled,
all provider/auth/mail/Turnstile secrets blank and an isolated `qa-final.sqlite`.
`tests/preview.cjs` and `/__qa/*` controls are never part of the product/image.

Recorded processes: standalone **32412**, mock fixture **28520**. Check their
command lines before stopping; PIDs may become stale. Stop the created standalone
before rebuilding `.next/standalone` on Windows. Launch receipt/logs are ignored
under `data/investigation/chat-ab/`; do not change ACLs or stop unrelated Node/app
processes. The two named agent-browser QA sessions were closed after inspection.

Fresh screenshots are outside Git under
`C:\Users\elvis\.codex\visualizations\2026\10\07\01a11742-72fa-7913-b98f-70e25820f214`,
with the `chat-ab-` prefix. Windows NVM/CUA startup caveats are in GOTCHAS; use the
installed native agent-browser CLI through the approved host context. No local
Docker is available; Linux/Node 22 final-image acceptance passed in CI.

## 7. Verification state

**Passed for this local implementation:**

- Final local lint (exit 0), all 42 regressions (no failures/skips) and full
  production build/type checks/standalone sanitization (exit 0). Existing auth,
  tool/env isolation, concurrency/Stop and source-version regressions remain green.
- Targeted tests: owned routes and trusted Origin, safe fields and foreign UUID
  rejection (including provisional activity), literal title search, tied-time
  keyset pagination, reversible archive/rename surviving final save, selected
  native resume, archived-send rejection before SDK/quota, read-only no-charge
  checks, UTC-day reset and pre-upstream release, bounded recovery/epoch cancellation
  and account/conversation draft keys. Pending activity stays live until registry
  release; interrupted records report interruption rather than a fabricated Stop.
- Real isolated SQLite upgrade from migrations 001/002: coherent pre-003 backup,
  original messages/source/native identifier/usage preserved, repeatable migration,
  integrity/FKs and old positional writes after upgrade. No production DB touched.
- Mock UI: default/title search, rename/validation, archive/restore/read-only
  archived view, new-chat and per-conversation draft return/reload, and same-account
  history in a second isolated browser. Stop shows confirming then actual saved
  terminal timing; failed Stop naturally completes without a false stopped state.
  Mid-generation refresh and dropped stream recover final content/statistics.
  Status failure reaches the bounded unknown state; manual checking recovers it.
  Mock counters showed these reads did not resubmit a model turn. Clipboard denial
  produces feedback; incomplete content has a distinct copy label.
- Fresh rendered light/dark and English/Chinese checks at 360px, plus 768/1280px
  layouts, were visually inspected with no horizontal page overflow. Settled axe
  audits: chat 31 passes / history and invalid rename form 24 / settings 17;
  zero violations and zero incomplete checks in those scoped final states.
  Scrollable code/table regions are keyboard focusable and references/settings
  have valid accessible names. Do not use an audit taken during entry animation
  as final color-contrast evidence.
- Direct final standalone HTTP probes: health 200, anonymous identity 200, history
  GET/PATCH and chat POST 401, auth configuration unavailable. The UI fixture is
  separate from these real fail-closed app endpoints. Zero new provider calls.

**Passed release evidence (2026-10-09):**

- PR #2 acceptance and feature CI/CD links above are green. Linux Node 22 lint,
  all 42 tests, complete production image build/type checks, non-root/native SQLite
  and offline SDK CLI, startup/private gates, restart persistence and coherent
  backup restoration passed before publication. No mail, challenge or paid AI calls.
- Created /app/data/backups/release-20261009-chat-ab.sqlite before deployment
  (mode 600). Automatic pre-003 backup is also mode 600, intact and schema 001/002.
  Production schema is 001/002/003, integrity_check ok, foreign_key_check empty.
  Compared to the release backup, all original 4 conversations, 16 message rows,
  8 usage rows and account identity/verification/role/status fields were preserved.
  Secret env stays mode 600 owned by utils-deploy; SDK volume persists. AI remains
  enabled with the existing 100 per-user / 2000 global daily limits.
- Fresh public health/home/reading/login probes returned 200. Anonymous identity
  remains authed:false/user:null; history GET/PATCH and chat/Stop POST returned 401.
  No protected data was returned; identity/history responses are no-store.
- Owner logged into the isolated release browser. Authenticated session/history
  reads returned 200, 4 saved conversations, today's personal remaining 100,
  empty negative search/archived results and 404 for an unknown conversation UUID.
  One selected owned conversation returned its 2 saved messages, completed answer
  statistics and revision without SDK identifiers. Usage rows stayed at 8.
  The history panel displayed the saved rows via an actual DOM-button click.
- Independent anonymous production Chrome at 360px: native controls, light/dark
  chat screenshots inspected, no horizontal overflow. Settled dark-chat scoped
  axe: 21 passes, zero violations/incomplete. Screenshots use chat-release-public-
  prefix in the same external visualization directory.

**Limitations and independent pending gates:** headed login-window native clicks
and screenshot/viewport commands had tool timeouts despite a healthy daemon;
DOM/API reads worked. Do not claim fresh logged-in visual/pointer acceptance from
those snapshots. Local mock logged-in visual checks above remain the evidence.
No new real provider/Stop/native-resume query, physical phone keyboard or
comprehensive focus-trap traversal was run. Cross-device reset revocation, mail
authentication headers, other mailboxes, naturally scheduled backup and
off-machine protection remain previous independent gaps.

## 8. Independent record inconsistencies

DESIGN §12's duplicate morphicons/omitted next-intl/Prettier claim and historical
Git/date/pipeline proposal inconsistencies remain separate. DEPLOYMENT is the
operations authority. Reconcile live state instead of treating old plans or
receipts as current proof.
