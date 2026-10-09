# Handover

**Written 2026-10-09: A+B recovery/quota and owned conversation history are
implemented locally; the owner approved publication on 2026-10-09 after review.
PR acceptance, merge and deployment are now in progress; new real AI calls remain excluded. Local lint, 42 regressions
and full production build/type checks passed. This handover belongs to the local
implementation commit. No push, deployment or new provider request was made.**

Runtime contracts: [ARCHITECTURE](ARCHITECTURE.md). Operations:
[DEPLOYMENT](DEPLOYMENT.md). Debugging: [GOTCHAS](GOTCHAS.md). Design:
[DESIGN](DESIGN.md). Decisions: [PLANNING](PLANNING.md). Rewrite at each handover;
keep sections 2, 4 and 7 current.

## 1. Position and authorization

The owner previously approved public verified-email/password accounts, explicitly
selected their verified administrator, and later enabled AI. Owner-operated
registration, logout/login and email password reset passed. Do not ask for those
approvals again. The exact administrator address is private operational input.
Per-message timing/token/progress details were deployed in the previous release.

The 2026-10-09 approvals cover PLANNING §12 A+B implementation and publication.
C/D/E remain proposals. No additional agent-initiated real AI requests are authorized: the
previous six-request allowance is exhausted. Review a concrete local result
before publication. Any fresh real-acceptance allowance remains separately bounded.

## 2. Working tree and release position

Local branch: `codex/chat-recovery-history`, based on `34013ad`. This local A+B
commit contains matching code/tests/docs and migration 003. No new dependency,
secret, key, auth bypass, provider access or pipeline change was introduced.
The branch has not been pushed. There is no new PR or new Actions run.

Last verified production release was `34013ad`, after the functional message-details
release `baf43e0`. Their successful Actions runs were
[functional](https://github.com/sileneer/utils/actions/runs/37851014391) and
[documentation release](https://github.com/sileneer/utils/actions/runs/37852020811).
Production was not inspected or modified this turn. Prior activation remains the
operational baseline; do not present it as a new runtime audit.

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

Migration 003 has not run on production. No release healthcheck, auth boundary,
keyless WIF pipeline, paid-call guard, model/tool policy or secret placement was
weakened. Book content and source-version requirements remain intact.

## 4. Next work, in order

1. Publication is approved: push the feature branch, open/attach PR, pass full CI
   including final-image acceptance, merge/deploy and verify actual production.
   A later real-model acceptance allowance must be explicitly bounded anew.
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
| AI/message details | Previously deployed/enabled; no runtime change or real call this turn |
| Recovery/quota/history | Local A+B implementation reviewed with isolated mocks/regressions; release pending |
| Migration 003 | Isolated legacy upgrade/backup/rollback-write compatibility passed; production pending |
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
Docker is available; image/Node 22 acceptance remains a later CI gate.

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

**Pending release/external gates:** no new Actions/image acceptance, merge,
production migration/runtime checks or real provider/native-container-recreation
acceptance was performed. No physical phone keyboard or comprehensive focus-trap
traversal was verified. Cross-device reset revocation, mail authentication headers,
other mailbox providers, naturally scheduled backup and off-machine protection
remain previous independent gaps. Historical production evidence is not evidence
that the new local changes are deployed.

## 8. Independent record inconsistencies

DESIGN §12's duplicate morphicons/omitted next-intl/Prettier claim and historical
Git/date/pipeline proposal inconsistencies remain separate. DEPLOYMENT is the
operations authority. Reconcile live state instead of treating old plans or
receipts as current proof.
