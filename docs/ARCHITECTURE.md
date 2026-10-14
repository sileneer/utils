# Architecture

How the running application is put together — routes, data flow, the agent
runtime, the on-disk state, and the environment contract.

**Runtime contract reviewed 2026-10-11:** site-wide verified email/password
accounts and server-configured AI. Current release and dated acceptance evidence:
[HANDOVER](HANDOVER.md) §2/§7; this document does not certify current live health.

- Ops, deploys, rollback, server access: **[DEPLOYMENT.md](DEPLOYMENT.md)**
- Things that broke and why: **[GOTCHAS.md](GOTCHAS.md)**
- UI/design rules: **[DESIGN.md](DESIGN.md)** (binding)
- Why these choices were made, alternatives rejected, roadmap: **[PLANNING.md](PLANNING.md)**

---

## 1. Shape of the product

utils is a **UI shell around server-side AI agents** (the owner's stated core
purpose). Everything that matters runs in one Next.js process on one small VM;
the browser is a thin client.

- **Next.js 16.3.8** App Router + React 19.2.8 + TypeScript, `output: 'standalone'`.
- **One container**, bound to `127.0.0.1:3100` on the VM, reached only through a Cloudflare Tunnel.
- **SQLite** for accounts, owned conversations and budgets; book files remain on
  the existing persistent volume. Better Auth 1.7.7 / better-sqlite3 13.0.3
  (SQLite 3.53.4 verified in the Linux image and production).
- **No middleware.** Each private route resolves a verified, active database
  session through `currentUser()`; book and tool pages remain public.
- Server routes that read cookies/headers render **dynamic (ƒ)** — expected, not a regression (see §7).

## 2. Route map

| Path | Type | Source | Notes |
|------|------|--------|-------|
| `/` | page | `src/app/page.tsx` | tool index and shared home account entry (`src/lib/tools.ts`, `HomeAccount`) |
| `/htlb` | page | `src/app/htlb/page.tsx` | reading shell + chat sidebar |
| `/htlb/book` | handler | `src/app/htlb/book/route.ts` | book HTML proxy, GET + POST (§6) |
| `/api/book/entry` | handler | `src/app/api/book/entry/route.ts` | public pinned entry title/excerpt, read-only GET (§6) |
| `/about` | page | `src/app/about/page.tsx` | |
| `/api/health` | handler | `src/app/api/health/route.ts` | container + deploy healthcheck; `DRILL_FAIL_HEALTH=1` → 503 |
| `/account` | page | `src/app/account/page.tsx` | verified active account center (`src/components/auth/account-center.tsx`) |
| `/admin` | page | `src/app/admin/page.tsx` | current administrator role required (§10) |
| `/api/admin/operations` | handler | `src/app/api/admin/operations/route.ts` | bounded read-only administrator aggregates (§10) |
| `/api/account`, `/api/account/[...action]` | handlers | `src/lib/auth/account-handler.ts` | safe site identity and scoped account management (§5) |
| `/login`, `/register`, `/verify-email`, `/reset-password` | pages | `src/components/auth/account-form.tsx` | shared localized form with validated site-local return path (§5) |
| `/api/auth/[...all]` | handler | `src/lib/auth/handler.ts` | allowlisted password/OTP/logout POST endpoints only |
| `/api/auth-config` | handler | `src/app/api/auth-config/route.ts` | public runtime site key and configuration availability, no secrets |
| `/api/agent/auth` | handler | `src/app/api/agent/auth/route.ts` | retired: always 410 |
| `/api/agent/session` | handler | `src/app/api/agent/session/route.ts` | GET identity, personal availability, active turn / one owned transcript (§5) |
| `/api/agent/conversations` | handler | `src/app/api/agent/conversations/route.ts` | GET owned title search/history; PATCH rename/archive (§5) |
| `/api/agent/stop` | handler | `src/app/api/agent/stop/route.ts` | POST owner-scoped cancellation (§3) |
| `/api/agent/chat` | handler | `src/app/api/agent/chat/route.ts` | POST → SSE stream (§3) |

Repository layout beyond this: `src/components/` (`ui/` = shadcn registry,
`auth/`, `chat/`, `htlb/`, `layout/`, `icons/`), `src/lib/auth/`,
`src/lib/agent/`, `src/i18n/`,
`messages/{en,zh}.json`, `deploy/`, `.github/workflows/`.

## 3. Agent runtime

ReadingShell owns useChat; desktop ChatPanel and the mobile Radix Sheet share
the same transcript, draft, selected model, request and scroll position.

    POST /api/agent/chat
    { message, sessionId, turnId, model, revision, context? }
        -> authenticated server route -> SDK subprocess -> configured compatible endpoint
        -> SSE -> one stable assistant message for that turn

**Gate and validation.** A verified, active user with a revocable Better Auth
session is required; old passcode cookies are ignored. Every transcript load
and write validates its owner. Message
length is 1–4000 characters; sessionId and turnId must be UUIDs. The requested
revision must be a hexadecimal commit identifier. Optional context contains
text (1–2000 characters), the same revision, and optional section/item numbers.
The model allowlist is enforced server-side, with the existing default fallback.
Session revision must match the requested revision; the server never silently
changes an existing conversation's source.

**Concurrency and cancellation.** One query slot is reserved after body parsing,
before any asynchronous source/session preparation. Another user receives HTTP
429 with error busy. Request abort and stream cancellation reach the same SDK
AbortController. The 180-second wall clock starts before preparation; an
abortable wait releases the query slot even while shared source preparation
continues for other readers. Thirty-second SSE comment keepalives remain.
Timers and the slot are released in finally. Client request epochs invalidate
late callbacks after confirmed termination, conversation/account changes or
unmount; there is no automatic paid retry.

Stop also posts the active turn UUID to `/api/agent/stop`, independently of the
stream's abort signal. The handler requires a verified active user and the exact
app Origin. Only that owner's matching turn can be aborted. Chat and Stop share
one process-wide query registry across route bundles; a bounded, 30-second stop
intent handles Stop arriving before chat registration. The SDK controller stops
the upstream process, persists `stopped`, discards native resume state, and
releases the slot in finally. Post-upstream stopped usage remains counted.
Stop acknowledgement/queued intent is not terminal proof. The client keeps the
transport open, then reconciles the matching owned turn through read-only GET:
at most 15 reads started within 30 seconds, spaced two seconds apart, each with
a five-second timeout. Disconnect/reopen uses the same bounded reconciliation.
Unconfirmed state offers manual checking and keeps switching blocked; no query
is resubmitted. Final history repairs timings/content. New-chat, open, archive
of the active conversation await confirmation before proceeding. Logout and
other account-security actions additionally use the server-side account fence
(§5), waiting for owner-wide query release before session/credential changes.
Transport abort remains an additional signal, not the sole cancellation gate.

**SSE contract** (src/lib/chat/protocol.ts):

| Event | Meaning |
|---|---|
| status / preparing | Preparing the saved turn and pinned source |
| start / sessionId / revision | Workspace is ready; identifies the conversation and source |
| status / searching | SDK reports actual tool use |
| status / answering | SDK reports answer text |
| delta / text | Append text to the existing assistant message |
| replace / text | Replace it with complete-block/final-result text |
| details / details | Allowlisted per-message model, timings, observed tool counts and reported turn tokens |
| done | Exactly one successful terminal event, after message/usage persistence |
| error / code | Exactly one failed/stopped terminal event; no following done |

The parser handles split UTF-8, LF/CRLF, comments and complete frames. EOF
without a terminal event is disconnected, even when partial text exists.
Unknown/malformed payloads fail; partial content remains visibly incomplete.
Complete SDK blocks use replace, avoiding unsafe length-based tail recovery.
Provider throttling text becomes rate_limited; timeout, stopped,
book_unavailable and agent_failed use safe codes rather than raw provider logs.

**SDK context.** A turn is saved before source preparation. needsRebuild is set
before a query and cleared only after successful persistence. Failed/stopped
turns discard sdkSessionId. Resume is used only for a known source version and
an uninterrupted completed session. Otherwise completed visible exchanges are
serialized as JSON context; failed partial answers are excluded. Retrying the
last failed turn reuses its turnId and replaces that exchange.

**SDK options.** The verified reader directory is cwd, not a sandbox. Built-in
tools are removed (`tools: []`), settings sources disabled and MCP configuration
strict. Only the in-process `book.search` and `book.read_section` tools are
allowed; `canUseTool` denies every other tool. Tools preload regular Markdown
files from the validated book directory, reject symlinks and expose literal
keyword search / integer section / bounded offsets, no paths, shell or network.
Search indexes numbered `### N. title` entries, excluding section footers. Queries
are case-insensitive literal terms, max 100 characters and six whitespace-separated
terms; all terms must match the entry. Four explicit alias groups cover 2FA,
diarrhea, insomnia and analgesic expressions. Exact/title matches rank first,
with at most two per section on the first pass, then deferred matches fill six
slots. For multi-term title-score ties, a sliding window ranks nearby occurrences of all
term groups ahead of widely separated mentions; section/item ties and entry
deduplication keep results reproducible.
Each excerpt is at most 480 characters; total output is at most 4,000 characters,
including title, section/item and offset locators for targeted reads. Section reads return up to 3,000 source characters
plus a continuation offset; pagination retains access to the full original.
The prompt directs the model to read relevant fragments using those locators,
try specific keywords when needed and explicitly say when the book has no basis
for an answer. It may not fabricate book positions from general knowledge. `maxTurns: 40`, partial
messages and the existing model remain. The child gets an explicit runtime/
provider env allowlist, never auth/mail/Turnstile secrets. Tool-boundary
regressions and real answer-quality acceptance are distinct; outstanding
provider/source-quality checks and authorization are tracked in HANDOVER §4/§7.
The prompt distinguishes conditions explicitly stated in the book from the
assistant's labeled inferences; correct citation navigation alone does not prove
that every statement is supported by that entry.

**Usage.** Atomically reserve one turn against user/global UTC-day limits before
SDK invocation. Pre-upstream failures release it; any attempted upstream query
counts even on timeout/partial failure. SDK usage/cost is stored when provided;
missing provider usage remains absent. The existing usage_json additionally
stores public per-attempt details (no schema change). Final details are saved
before the terminal SSE event; history joins only the requested conversation's
assistant turns and the authenticated owner's usage, selecting the latest
attempt by creation time/rowid. A retry replaces displayed attempt statistics,
not adds them together. History returns an explicit metadata allowlist, never
raw usage JSON, estimated cost, native IDs or SDK/provider logs. Legacy records
can recover reported token counts; missing old timings/model are not invented.

Server elapsed time runs from reservation through query completion/abort cleanup.
First-text time records the first visible nonempty text, not hidden reasoning.
Observed search/read tool IDs are deduplicated across partial/full SDK events;
only counts are exposed. Progress comes from actual SDK events. While terminal
confirmation is unavailable the UI retains an explicit recovery state, not a
fabricated stopped/complete result. Reconciliation supplies final server timing.
A rejected pre-stream send may retain labeled approximate frontend timing.

Tokens come from result.usage for this main-loop turn, including repeated tool
rounds/context. They exclude unreported auxiliary calls; result.modelUsage and
cost can contain resumed-session cumulative estimates and are not presented as
message totals/bills. Under the Anthropic-compatible usage contract, uncached
input, cache read and cache creation are distinct counts; total tokens adds
those plus output ([cache field definitions](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).
Missing values remain unavailable, including stopped/failed queries without a
usage result. Counts of zero are preserved when actually reported.
Limits apply to admin accounts too. AI fails closed
unless enabled with positive integer limits. This is a turn cap, not a precise
currency spending cap; provider limits still apply. Identity/status reads expose
only personal used/limit/remaining and next UTC midnight as resetAt, plus
ready/busy/quota/disabled availability. The UI formats resetAt in the browser
timezone. Global counts and other readers' identifiers are omitted. Availability
is a snapshot of app guards, not an upstream health/latency promise. Reads do
not reserve usage; the existing atomic send-time guard remains authoritative.

### Model allowlist

Runtime .env is the source of truth: ANTHROPIC_MODEL selects the default;
AI_MODELS supplies the picker allowlist and display names (environment contract
in §8). There is no compiled provider/model catalog or default. The existing
no-store session/status API exposes only modelConfig {defaultModel, models};
server-only config.ts keeps credentials/endpoint out of browser responses.
Missing/invalid provider configuration disables AI before reservation or SDK work,
while reading, authentication, history and deployment health remain available.

The picker keeps its secondary row, localized neutral default/alternative hints,
and htlb_chat_model:<user-id> preference. Restore/status refresh validates a saved
preference against the runtime list; a removed ID falls back to the configured
default. The server independently applies the same allowlist/default fallback.
Historical details validate bounded model-ID syntax separately, so removing a
model from the picker preserves that turn's metadata (unlisted names show the ID).
Hints do not claim measured speed, reliability or relative pricing.

## 4. Reader workspace and source versions

src/lib/book/source.ts prepares an immutable pair from the upstream release:

1. Parse the HTML's declared 正文提交 identifier; reject an unidentified source.
2. Resolve its full commit through the upstream GitHub commit API.
3. Fetch/check out that exact commit and verify HEAD. Copy book/, README.md and
   skills/life-decision-guide/SKILL.md into a clean reader workspace. The
   upstream maintainer-oriented CLAUDE.md never becomes the agent workspace.
4. Write HTML plus manifest in a unique staging directory, discard the temporary
   checkout, then atomically publish the version directory and current pointer.

Failed preparation never replaces a verified pair. Shared in-flight work is
deduplicated and retryable after failure. Old versions remain available for
existing sessions; there is no automatic version garbage collection yet.
ensureWorkspace(revision) resolves that pair and preserves the existing
exclusive-create onboarding marker in ~/.claude.json.

## 5. Sessions and on-disk state

`DATABASE_PATH` defaults to `cwd/data/utils.sqlite`, mounted in production at
`/app/data/utils.sqlite`. Runtime database opening is `src/lib/database.cjs`;
`scripts/database.cjs` applies versioned migrations before dev/start/standalone
serves requests. Build does not initialize databases. WAL, foreign keys and a
5-second busy timeout are enabled; no transaction spans mail/network/streaming.
Management and consistent backup/restore operations are in DEPLOYMENT §11.

Better Auth's generated schema is versioned in `migrations/001-auth.sql`:
`user`, `account`, `session`, `verification`, `rateLimit`. Product schema is in
`002-product.sql`: `conversations`, `messages`, `limits`, `mail_requests`,
`ai_usage`. `003-chat-history.sql` adds optional `conversation_meta`
(title/archived_at) and owner/time/usage indexes. `004-account-preferences.sql`
adds `user_preferences` (one row per `user.id`: nullable `theme`, nullable
`language`, `updated_at`), the only product table touched by batch B. A null
column means "no account choice" and falls through to the device layer; the
table stores presentation settings only and holds no role, status or verified
data, which remain server-only columns on `user`. `005-email-change.sql` adds
`email_changes`, the transactional state for the email-change flow described in
§5; it is independent of the `verification` table so a change-email code can never
collide with a registration or reset code. `006-security-events.sql` adds
`security_events`, the short desensitized record of confirmed security changes also
described in §5. Legacy conversation
columns stay unchanged so old-image positional writes remain compatible. A
missing title override falls back to the first user question (100 characters);
no model is called to name conversations. User role/status are server-only
fields. No first-user admin rule. Messages persist at preparation/termination,
not every token. Pending/streaming remains live only while the registry matches
owner, conversation and turn; otherwise history reports failed/interrupted, not
a user-requested Stop. Conversation/message replacement is one transaction.
Old JSON files are left untouched and never imported or claimed by UUID.

All paths are relative to AGENT_DATA_DIR (default cwd/data/agent):

| Path | Contents |
|---|---|
| sessions/<uuid>.json | retired files, ignored by account chat |
| versions/current.json | current full revision and last successful check time |
| versions/<revision>/manifest.json | verified source revision/preparation time |
| versions/<revision>/book.html | release HTML declaring that same source commit |
| versions/<revision>/reader/ | book Markdown, README and installed reader skill |

The SDK's native session transcripts are separate from SQLite's visible history.
Production mounts host `/opt/utils/data/sdk` at `/home/nextjs/.claude`, owned by
uid 1001 with directory mode 700, so recorded SDK session IDs remain resumable
after container replacement. Without this mount the default SDK home directory
is ephemeral, even though the app's SQLite conversations survive. These private
transcripts are never served to the browser. SQLite backups do not include them;
on database-only restoration invalidate saved SDK IDs and rebuild from completed
visible history rather than resuming an unavailable transcript.

GET /api/agent/session without id returns identity, personal availability and
that owner's active turn when present; with id it returns their visible messages,
source revision, title and archive state. It never returns native IDs or login
tokens. Unknown/foreign UUIDs return 404; an owned active request before its first
persisted exchange can return an empty provisional transcript. An existing
foreign row never qualifies for that exception. All private reads are no-store.

GET /api/agent/conversations accepts q (literal title substring, max 100),
archived=0|1 and an opaque cursor. Pages contain at most 20 safe summaries
(id/title/updatedAt/archived), sorted updated_at DESC then UUID DESC with keyset
pagination. Ownership is checked in SQL. PATCH accepts an owned UUID and title
(1–100 normalized characters) and/or boolean archived, with exact trusted Origin.
Archive is reversible and never deletes messages/usage/native context. Archived
conversations are readable but new chat requests reject before quota reservation.
Active archive/restore is rejected; final session saves cannot overwrite rename
or archive. Renaming does not change last-message activity time.

Current conversation/model preferences are local and account-scoped. Draft keys
are htlb_chat_draft:<user-id>:<conversation-id|new>; the old account-wide draft
migrates once to the selected scope. New-chat and switching preserve each draft.
Only saved conversations are cross-browser; drafts and scroll are local.
Identity changes clear private UI and invalidate stale callbacks. Logout revokes
the login and notifies other tabs while retaining that account's local selection
and drafts for a later login. Refresh restores saved history/draft and reconciles
active work; it does not resume the original SSE or send an automatic model turn.
Rejected pre-stream sends restore their unsent text.

### Site-wide account contract

The root AccountProvider reads GET /api/account independently of agent models,
quotas or mail availability. Response is {user:null} for anonymous/unverified/
inactive accounts, or a safe id/name/email/emailVerified/createdAt/isAdmin projection
from current database rows. Configuration/read failure is 503, not an anonymous
success. Responses are no-store and vary by Cookie. The same AccountMenu is used
in SiteHeader, the fullscreen reader toolbar and ChatPanel; HomeAccount provides
an additional entry. /account is server-gated and client state handles later expiry.

GET /api/account/sessions requires a login created within 24 hours (the explicit
framework freshAge); it exposes only noncredential row id, current marker, login/
expiry times and inferred browser/system. It never returns raw UA/IP/session token.
POST /profile accepts only name; POST /password accepts currentPassword/newPassword
and always revokes other sessions with current-cookie rotation; POST /sessions/revoke
accepts password and exactly one of an owned other row id or others:true. Security
mutations require fresh login plus current-password verification. Origin, JSON,
bounded bodies, per-account action limits and field allowlists apply. Generic
Better Auth mutation/session endpoints remain blocked by the public auth facade.
The wrapper forwards necessary Set-Cookie headers but discards raw library output.
Batch A needed no schema migration or new credential store; batch B adds only the
`user_preferences` table described in §5.

Preferences and personal usage are account-scoped presentation and read surfaces,
not security mutations: GET and POST `/api/account/preferences` and GET
`/api/account/usage` require only a current verified active identity, the same
freshness rule that gates session listing does not apply, and no password
re-verification is demanded. POST /preferences accepts only `theme` and
`language`, each either a permitted value (`system|light|dark`, `en|zh`) or an
explicit null that clears the stored choice; unknown fields, other roles/status
writes and oversized bodies are rejected by the existing allowlist, origin, JSON
and per-account-path limit checks. The response projects only the stored columns.

GET /api/account/usage returns exactly the existing `availability(user.id)`
projection — enabled, used, limit, remaining, resetAt and the ready/busy/quota/
disabled service state — computed by the same `usage.ts` rules the chat panel
already uses, so `released` rows are excluded and failed/stopped turns settle as
before. It reads only the caller's own rows, never another user's, calls no model,
does not require AI to be configured or enabled, and is not the administrator
aggregate of §10. Its failure affects only the usage card; identity, profile,
security operations and public reading are independent of it.

Server-side rendering resolves the account layer of theme and language through a
presentation-only lookup that returns both values as unset on any error, missing
table or anonymous visit; this path chooses what to display and is never an
authorization decision, which continues to run through `identity.ts`.

#### Email change

Changing the sign-in address is a product flow in `src/lib/auth/email-change.ts`,
not the library endpoint. Better Auth 1.7.7 ships `/email-otp/change-email`, but it
confirms only the session (no current password), keys its OTP to the
registration-purpose identifier when `verifyCurrentEmail` is enabled, has no
transaction identity, keeps the current session signed in after success, writes the
`user` row directly so the account-change AI fence never runs, checks uniqueness in a
read-then-write race, and reports "Email already in use". PLANNING §14.6 records that
verification. The endpoint stays unconfigured and outside the public auth allowlist.

`005-email-change.sql` adds `email_changes`: one row per request with its own uuid
`id`, `user_id`, `old_email_hash` (keyed digest of the address being retired),
plaintext `new_email` (needed to send and later commit it), `old_code_digest`,
`new_code_digest`, `old_attempts`, `new_attempts`, `status`
(`pending|cancelled|completed`), and `created_at`/`expires_at`. A partial unique index
on `new_email` while `status='pending'` is the race guard the library lacks.

**Two codes, one per mailbox.** `start` issues a separate six-digit code to the
current address (purpose `change-email-old`) and to the target
(`change-email-new`). Each side keeps its own digest and its own five-attempt budget,
and `verify` supplies both at once, so a code delivered to one mailbox can never
satisfy the other and the new address cannot authorize the change alone. Codes are
never stored or logged in the clear — only keyed digests — and comparison is
fixed-time. The attempt that exhausts a budget closes the transaction and reports
`attempts_exhausted` rather than inviting another try. The 600-second window is shared
and a resend renews it.

Routes are a `GET /api/account/email` pending-state read plus POSTs under
`/api/account/email/` (`start`, `resend`, `verify`, `cancel`), all taking the
wrapper's existing origin, JSON, body-size and per-route field-allowlist checks.
Every one requires a current verified active identity and a login inside 24 hours;
`start` additionally verifies the current password, and `start` and `resend` require
the same Turnstile challenge as the public send paths — so possession of the old
mailbox is never the only proof, and an account that cannot receive at its old address
is told plainly that this page cannot complete the change. `cancel` needs no password
and no challenge, so an in-flight request can always be abandoned.

`start` first cancels that account's own pending transactions, so exactly one is ever
live, and it answers identically whether or not the target is already someone's
address: nothing here confirms or denies a registration. A target that becomes
registered between `start` and `verify` is caught by the `user.email` unique
constraint at commit and returns `email_taken` with the account untouched. A request
whose signing-in address has since moved fails as `stale_target` without revealing
which condition matched.

Commit runs inside `withAccountChange`: the account's running AI request must reach a
confirmed terminal state before anything is written, so an unconfirmed stop returns
409 `stop_unconfirmed`, the address stays unchanged and the transaction reopens for
retry. On a confirmed stop one immediate transaction sets `user.email`,
`emailVerified` and `updatedAt` (ISO text, the format the library itself writes;
`account` has no email column, so the address lives only on `user`) and deletes every
session row for that user; the response is success but the client is signed out and
must log in with the new address. The stable `user.id` means role, profile,
conversation ownership, usage rows, preferences and retained source versions are
untouched — no second user is created and no history is migrated.

Send or verify failures keep the old address, and the account can retry. The
post-commit result notice to the retired address (purpose `change-email-notice`) is
reported separately from the identity change: it is attempted after the transaction
commits and its failure returns a success with `notified: false`, never a rolled-back
or repeated change, because the new address is already authoritative by then.

Limiter buckets are purpose-scoped so a change cannot starve recovery: three starts
per hour per account, one send per minute and three per hour keyed separately to the
old and the new address, a per-IP budget on these routes, and a shared daily mail
ceiling in `mail.ts` where the whole `change-email*` family is capped well below the
`forget-password` reserve. Failures are mapped to wrapper-only names —
`password_wrong`, `code_failed`, `attempts_exhausted`, `expired`, `not_found`,
`stale_target`, `already_completed`, `email_taken`, `email_same`, `rate_limited`,
`challenge_failed`, `mail_send_failed`, `stop_unconfirmed` — each with its own copy in
both locales, and none of them worded as a completed change.

In the Brevo adapter the family is three purposes — `change-email-old`,
`change-email-new` and `change-email-notice` — each with the same per-purpose ceiling
as registration mail, plus a shared daily cap across all three that is set well below
the `forget-password` reserve so a run of address changes cannot exhaust recovery.
`sendOTP` rejects any purpose outside its table, so an unregistered one fails closed.

#### Personal data export

GET `/api/account/export/summary` and GET `/api/account/export` return the caller's
own data as a private download. Both require a current verified active identity
**and** a login created within 24 hours — the same explicit freshAge gate that
protects session listing — because reading a whole history is a sensitive read, not
a routine page load; an older login gets `reauth_required` and the card offers the
in-place re-verification entry. Anonymous gets 401. These are reads: they take no
password, hold no account-change fence, and mutate nothing.

Query surface is allowlisted and validated before any SQL: `format` is `json` or
`markdown` (default `json`); `conversation` is an owned UUID; `from`/`to` are
`YYYY-MM-DD` UTC day bounds, `from` inclusive and `to` exclusive. Everything else,
including an unknown parameter, is `bad_request`. Ownership is enforced in SQL
against the caller's current `user.id`, so another account's conversation id is
`not_found` rather than forbidden, and no listing call can widen the scope.

All rows for one export are read inside a single SQLite transaction, so the result
is one consistent snapshot; `readBoundary` records the instant that snapshot was
taken and `generatedAt` the instant the body was assembled. After assembly the
handler re-checks the session that authorized it and discards the body with 401 if
the login was revoked, rotated or switched meanwhile, so a dead identity cannot
keep streaming an earlier user's data.

First release is bounded on purpose, with no queue, background job or unbounded
read: at most 200 conversations, 2000 messages and 8 MiB of serialized output per
response, counted before the body is built. Anything above that is reported as a
partial export — `complete: false`, `truncated: true` and a reason — and the caller
must request per-conversation or per-date segments. A segment always states its own
scope and is never described as a full snapshot; whole-account export at database
scale needs the separately designed controlled background job, private staging and
expiry from PLANNING §14.6 before it can be claimed.

The JSON document is versioned (`schemaVersion: 1`) and carries the scope, counts,
completeness and an explicit `excluded` list. Included: safe profile fields, saved
preferences, and each conversation's id, title, archive state, times, pinned source
revision, message positions/roles/content/timestamps/status/normalized error, the
pinned source context (bounded excerpt text, revision, section/item), and reported
per-turn usage through the same public `recordedDetails` allowlist the message
details UI already uses. Missing token or timing data stays absent — it is never
zero-filled, and cost is not computed, estimated or implied. Messages still pending
or streaming are reported with the existing active-turn normalization and marked as
of the export instant, never as completed.

Excluded and stated as such: password hashes and credential rows, verification
codes and OTP records, session tokens and session rows, native SDK session ids,
mail delivery records, rate-limit buckets, any other user's rows, private
environment values, SDK internal transcripts and the full book cache or version
workspace. Retained source revisions are referenced by identifier only; the export
never copies book content the user did not already pin into a message.

Responses are `no-store`, vary by Cookie, and carry `Content-Disposition: attachment`
with a filename that embeds no personal data. There is no shareable or guessable
public link, no token in a URL, and the browser stores nothing in
localStorage/sessionStorage: the card links directly to the endpoint so the file
goes to the download manager. Import, cross-account merge and any delete-on-export
behaviour are explicitly out of scope.

#### Security activity

A short, desensitized record of the account's own confirmed security changes
(PLANNING §14.7). It exists so a user can answer "did my account actually change,
when, and from what kind of device" — it is not an audit platform, an administrator
console or an incident trail, and it deliberately records nothing about logins.

**Login sessions are not a security log.** The session table describes access that is
live *now*; a revoked or expired row says nothing about what happened while it existed.
Events are therefore written only when an operation is confirmed, and no history is
backfilled, inferred or reconstructed from existing session rows. Accounts that
predate this table correctly show an empty list rather than an invented past.

`006-security-events.sql` adds `security_events`, one row per confirmed event:

| Column | Contents |
|---|---|
| `id` | generated uuid, so a retry cannot collide with or overwrite an earlier row |
| `user_id` | the subject, `ON DELETE CASCADE` |
| `kind` | `password_change` \| `email_change` \| `session_revoke_one` \| `session_revoke_others`, enforced by CHECK |
| `occurred_at` | epoch milliseconds of the confirmed change |
| `browser`, `system` | the two inferred labels from the existing `browserInfo` projection of the acting session's User-Agent — a controlled vocabulary, never the raw UA |
| `masked_email` | `email_change` only: the target address with its local part masked |
| `sessions_affected` | the two revoke kinds only: how many sessions actually went away |

Never stored, at any depth: passwords or hashes, verification or OTP codes, session or
CSRF tokens, cookies, raw User-Agent strings, IP addresses or any location, email
bodies, model or conversation content, and the full new address. The row is written
with the same keyed-digest discipline as the rest of the account layer and carries no
free-text field a client can populate.

Recording is tied to the real outcome, not to the request:

- `email_change` is inserted **inside** the same immediate transaction that moves
  `user.email` and deletes the sessions, so the change and its record commit or roll
  back together.
- `password_change`, `session_revoke_one` and `session_revoke_others` mutate through the
  library, which owns their transaction, so they are written **after** the wrapper has
  confirmed an OK response. A transport failure, a non-OK response, an unconfirmed AI
  stop or a rejected password writes nothing, and an unknown outcome is never recorded
  as success.
- Because the mutation is already durable at that point, a failed event insert after a
  confirmed change is swallowed rather than turned into an error: reporting a completed
  password change as failed would invite a retry that can no longer succeed.
  The asymmetry is deliberate — the record is best-effort *after* a confirmed change
  and never best-effort *before* one.
- A batch revoke counts the caller's other live sessions first and writes **nothing**
  when that count is zero, so a repeated click cannot manufacture an event for a
  change that did not happen. A single revoke that has already lost its target returns
  `not_found` upstream and likewise writes nothing.
- Changing a password also revokes other sessions, but it is one operation and is
  recorded once, as `password_change`; the revocation is part of its stated effect, not
  a second event.

GET `/api/account/activity` is the only read. It takes the wrapper's existing origin
and identity checks, requires a current verified active identity **and** a login inside
24 hours — the same gate as session listing, because this is security data — and
filters by the caller's own `user.id` in SQL, so the result cannot be widened by any
parameter. There is no administrator view in this scope and no query by address,
device or date; if one is ever added, administrator status continues to come only from
the server-side `role` column and never from a client-supplied field.

Retention is 180 days with a cap of 100 rows per account, both enforced in
`security_events.ts`: expired rows are pruned when a new event is written and the read
filters by age as well, so a row can neither outlive the window nor be hidden while it
still counts against the cap. Automatic cleanup applies to this table's own rows only.
It never deletes or trims accounts, sessions, chat history, pinned source versions,
book cache or backups, and it is not a general-purpose purge — the retention and
pruning questions in DEPLOYMENT §12 remain separate and unapproved.

lifecycle.ts coordinates logout/revocation/password changes per account across route
bundles. A fence blocks new query registration; a per-owner authorization version
also rejects requests that authenticated before the fence but register after it.
The supported single-process query registry aborts only that owner's active query
and waits up to 30 seconds for release after final persistence. Timeout/busy returns
409 without claiming a successful account change. Different accounts do not share
a logout serialization key or attempt bucket. Reset holds the fence across the OTP
flow; a database password-write hook stops only after the library authorizes the
OTP. Invalid OTP/current password/foreign target cannot cancel a live query. A
failed authorized reset may consume its OTP before cancellation timeout; request
another code. Framework session-revocation and password hashing remain in place.

Login destinations use navigation.ts's site-route allowlist. Login/register/verify/
reset links preserve safe returnTo, including reading query/hash; direct login
returns home. External/protocol-relative/encoded separator/control URLs and auth
loops fall back home. Authenticated visitors can continue or normally reauthenticate.
A `reauth=1` query variant on the login page only changes the title/description/
primary-action copy and keeps the same server contract; it is not an authorization
signal. Account center sections expose stable anchors (`#profile`, `#security`,
`#sessions`) used by reauthentication returnTo links and focus-independent jumps.
Account events synchronize the current window and localStorage peers: logout,
reset and expiry (`security`) invalidate the known identity immediately;
same-account security mutations such as session revocation or a password
change (`session`) refresh the identity without unmounting the open account UI,
so a closing dialog and its focus target survive; profile changes refresh
identity without cancelling a chat. Focus rechecks expiry. Failure preserves an
already known identity with a retry state. Chat keeps its own data/controller, uses
the shared identity and broadcasts 401 expiry; late callbacks remain epoch-scoped.

Wrapper error bodies use safe codes (`reauth_required`, `rate_limited`,
`not_found`, `unauthorized`, `stop_unconfirmed`, `account_busy`,
`service_unavailable`, `bad_request`, `invalid_origin`); client code maps them per
section (src/lib/auth/errors.ts) so a password failure, a profile failure, a
revoked target and an unconfirmed result stay distinct. A transport timeout or
disconnect is an unconfirmed outcome: the UI refreshes account/session state and
never reports success or automatically retries a security write. The wrapper
returns no retry timestamp, so the UI claims none.

New module integration:
- Declare whether its page is public, with private actions, or fully account-gated.
  Public reading/client-only utilities remain available anonymously.
- Use currentUser() from lib/auth/server for every private API/page; enforce
  user.id ownership on every read/write, and independently query admin role/status
  where needed. Shared UI is not an authorization boundary. Store data by stable
  user.id, never email or a browser role claim.
- Reuse useAccount/AccountMenu/accountLink; add any new return route to the explicit
  allowlist. Keep identity independent of module-specific data/availability.
- Paid/background actions must join the account fence and cancellation lifecycle;
  do not register work with an authorization result older than the owner's fence.
  No client-side provider call, cookie export or module-specific account database.

### Account and mail lifecycle

Register email/password/name -> unverified credential (no session) -> six-digit
email OTP -> verified -> explicit password login. Passwords use framework hashing
and 8–128 character validation with at least one ASCII letter and one digit for
registration/reset. Symbols are allowed; uppercase/lowercase mixing is optional.
Login accepts existing credentials without reapplying creation rules.
OTP expires in 600 seconds, allows five incorrect
attempts, rotates on resend and is atomically consumed; storage is an HMAC digest.
Verification and reset identifiers have different purposes. Reset revokes sessions.
Cookies are HttpOnly, host-only, SameSite=Lax, Secure with HTTPS baseURL; 14-day
database sessions, no cookie cache. Public auth GET endpoints and other POST
endpoints (including OTP-only login, link verification/reset, user mutation) are
not exposed. Fixed origin and JSON checks protect POST; passwords/tokens are not
returned. Registration/reset have generic account-existence responses.

Auth route IP and email limits persist in SQLite. One mail request/email/minute,
five/hour, plus purpose/IP attempt buckets and framework database rate limits.
Requests for the same normalized email serialize within the supported single
process, including resend/verify/reset. Turnstile server verification is required
before register/resend/request-reset; token hostname must match APP_URL. Development
ignores forwarded IP headers. TRUST_CLOUDFLARE_IP=1 is valid only behind the existing
loopback Tunnel binding; arbitrary X-Forwarded-For is never trusted.

The awaited Brevo HTTPS adapter reserves a conservative UTC daily budget (general
verification stops at 250 total requests, reset may use the reserve up to 280), below the provider free cap;
failures remain counted. Metadata includes keyed email digest, purpose, provider
message ID and reserved/accepted/failed state. No OTP/mail body is persisted or
logged. Accepted is not delivered. A request-local outcome catches Better Auth's
background-error swallowing and returns a recoverable 503 on mail failure.

## 6. Book proxy and browser bridge

GET /htlb/book prepares/revalidates the verified pair once per day, or resolves
an explicitly requested revision. It returns locally wrapped HTML with
x-book-revision and no-store. Failure falls back to the last verified pair;
without one it returns 502 book_unavailable. POST requests a refresh and returns
the revision actually served; retaining an old pair is not proof of an upstream
update. Legacy cache/reader/clone paths may remain on existing volumes but are
not used as an unverified fallback by this implementation.

The local wrapper injects src/lib/book/bridge.ts; it does not alter upstream.
Both sides validate origin and exact window source. An init/ready handshake
survives iframe completion before hydration; ready advertises the revision and
entry anchors. Selection offers Ask AI, sending at most 2000 characters from a
selected entry, with visible removable source context. Each send consumes that
explicit context once. Source navigation takes the message's revision and entry
anchor. If another source is displayed, the iframe loads the exact requested
cached revision. Navigation waits for a trusted ready event with that same
revision and actual anchor; missing source/anchor gets explicit feedback, never
a current-version substitute. The bridge clears necessary filters (including
dispute/todo), renders lazy cards, aligns the entry heading and highlights it.

ReadingShell retains compact/expanded desktop state, source disclosure state and
a return target (message ID and vertical offset within its scroll container).
Mobile navigation closes Sheet; Return to answer reopens it and restores the
same message position/draft. The previously expanded desktop view is restored
on return. Disclosure text/open state is page-local, keyed by message, revision
and anchor, shared across panel remounts; it is not stored in SQLite or sent to
the provider. Source-version mismatch continues to guard subsequent sends.
Theme messages sync our shell choice to the reader. Listener cleanup is explicit.

Citation parsing supports definite numbered sections/items and grouped items;
ambiguous/range references remain text. Definite references disclose a
CitationPreview on explicit action. GET /api/book/entry requires a full 40-hex
revision, section 1–34 and item 1–999. It calls getBook(requestedRevision) only,
reads one numbered regular Markdown section and returns its title, first 700
body characters, truncation flag, revision and locator. No-store responses are
400 for invalid input, 404 for an absent entry and 502 for unavailable/invalid
source. It exposes public book text, no filesystem path or account data, and
performs no model/usage operation.

The client fetches only an open disclosure, aborts at five seconds/on cleanup,
validates the returned version/locator and bounds, and renders escaped plain
text rather than active Markdown/HTML/images. Missing/unknown-version citations
show a localized fallback and retry; a successful preview offers the full
original. A location match does not certify the claim's factual accuracy.
The reader reports unavailable-source responses with a retry action. A source
change prompts a new conversation instead of mixing new book text into old SDK
context. All interface conventions live in DESIGN §5.6.

## 7. i18n

`next-intl` 4.14 in **cookie mode** — no URL locale prefix, no middleware, no proxy.

- Resolution order (`src/i18n/locale.ts`): explicit account preference →
  `NEXT_LOCALE` cookie → `Accept-Language` negotiation (q-value sorted, `zh*`/`en*`)
  → `en`. An account with no saved language changes nothing for the device, and an
  anonymous or unreadable-preferences visit falls straight through to the cookie.
  The account lookup is presentation-only and fails open to the device layer.
- All visible copy lives in `messages/en.json` + `messages/zh.json`, including `tools.<slug>.name/description`. `src/lib/tools.ts` is intentionally content-free (slug, category, status, icon only).
- `html[lang]` is `en` / `zh-CN` via `htmlLang()`; the header `LanguageSwitcher` writes the cookie and reloads, so it stays the device-layer control. The account centre's language choice writes the account preference instead and also reloads, warning first when a form holds unsaved edits.
- `getTranslations` must be imported from `next-intl/server` (GOTCHAS §F).
- Consequence: pages that read cookies/headers are dynamically rendered.

## 8. Environment contract

The container reads these; `.env.example` is the committed template, the real
values live in `/opt/utils/.env` (chmod 600) on the server.

| Variable | Read by | Purpose |
|---|---|---|
| `AI_API_KEY` | server config | required provider key; first nonblank value wins in order: `AI_API_KEY`, compatible `ANTHROPIC_AUTH_TOKEN`, legacy `SENSENOVA_API_KEY`; mapped to SDK `ANTHROPIC_AUTH_TOKEN` only in its child environment |
| `ANTHROPIC_BASE_URL` | server config, SDK | required HTTP(S) Anthropic-compatible endpoint; no credentials/query/fragment or `/v1` suffix; no implicit provider default |
| `ANTHROPIC_MODEL` | server config, picker, chat route | required default model ID; must belong to the configured catalog |
| `AI_MODELS` | server config | optional single-line JSON array of `{id,name}`, 1–20 unique IDs, at most 8192 characters; if omitted, offer only ANTHROPIC_MODEL with its ID as name |
| `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` | SDK | optional auxiliary-slot overrides; absent slots follow the selected main chat model |
| `APP_URL` | auth | fixed trusted origin/base URL; production `https://utils.lzhdev.com`, local default `http://localhost:3000` |
| `DATABASE_PATH` | database | default `<cwd>/data/utils.sqlite`; production `/app/data/utils.sqlite` |
| `BETTER_AUTH_SECRET` | auth, OTP/metadata digests | server-generated random secret, at least 32 characters |
| `BREVO_API_KEY` | mail | ordinary transactional HTTP API key |
| `MAIL_FROM`, `MAIL_REPLY_TO` | mail | authenticated sender email (required); real reply inbox (optional) |
| `MAIL_FROM_NAME` | mail | optional sender display name matching the chosen Brevo sender; defaults to `Utils` |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | auth form / server | public runtime widget key / server-only Siteverify key |
| `TRUST_CLOUDFLARE_IP` | auth handler | `1` only with loopback-only Tunnel ingress; default ignores forwarded IP |
| `AI_ENABLED`, `AI_USER_DAILY_LIMIT`, `AI_GLOBAL_DAILY_LIMIT` | usage | default disabled/0/0; explicit positive daily turn limits required |
| `AGENT_DATA_DIR` | workspace, book proxy | defaults to `<cwd>/data/agent` |
| `AGENT_QUERY_TIMEOUT_MS` | chat route | wall-clock bound per query, default 180 000 |
| `DRILL_FAIL_HEALTH` | `/api/health` | `1` → 503, to exercise the rollback path |
| `HEALTHCHECK_URL` | `deploy.sh` (not the app) | healthchecks.io ping |

Provider/config values are read at request time on the server, not as NEXT_PUBLIC
build constants. Model IDs are 1–128 characters (letters/digits first, then
letters/digits, dot, underscore, colon, slash or hyphen); names are 1–80 characters
without control characters. Public catalog projection discards extra fields.
The main SDK model option and ANTHROPIC_MODEL both receive the allowed selected
model; only explicit runtime/provider variables enter the child environment.
.env.example supplies commented setup examples, never credentials or image defaults.
Deployment refresh procedure lives in DEPLOYMENT §12.

`PORT=3000`, `HOSTNAME=0.0.0.0`, `HOME=/home/nextjs`, `NODE_ENV=production` are
set in the Dockerfile; the app runs as the non-root `nextjs` user (uid 1001).

## 9. Known limits (do not rediscover these)

- **One query at a time**, globally. Family use is fine; a second concurrent user gets "busy". A RAM upgrade or a sidecar agent process is the fix if concurrency ever matters.
- SQLite/conversation growth has no automatic retention policy; archive is reversible, with no deletion/cleanup job.
- Same-email serialization and global query busy state assume one Next process;
  multi-replica deployment needs a shared lock/coordinator and database migration.
- 1 GB VM: no builds on the VM (OOM), agent subprocess is the biggest memory consumer.
- Turn quotas are conservative; accurate provider billing depends on actual SDK
  usage data and provider budgets. Real service/SDK and deployment acceptance
  status lives in HANDOVER §7.

## 10. Administrator operations

GET `/api/admin/operations` and `/admin` resolve currentUser and independently
check the current SQLite role, verified-email flag and active status. A stored
session/browser role claim cannot grant access; ordinary accounts receive 403
from the API, anonymous accounts 401, and unauthorized pages redirect to login
or return not-found. Session identity adds only isAdmin for the menu link.
All private operation responses are no-store and vary by Cookie.

The explicit 24-hour/7-day period selects the latest 10,000 ai_usage attempts
with a truncation marker if more exist. Retries remain distinct attempts.
Complete/failed/stopped/released/reserved/unknown outcomes are counted separately.
Only recordedDetails' public numeric allowlist is aggregated: no message body,
email list, native ID, provider JSON, cost or credential is returned. Legacy/
missing usage is unavailable, not zero; cache field coverage has separate sample
counts. Timing excludes labeled estimates. Median averages the middle pair for
even samples; P95 uses nearest rank only with at least 20 samples. Aggregate
integer overflow fails the response safely. These are descriptive measurements,
not model rankings, bills or an upstream health promise.

The local backup reader consumes only a small regular `backups/status.json`
beside DATABASE_PATH, validating the version, state and numeric timestamps.
It returns allowlisted success/attempt times, size and verified-integrity flag,
never filenames, paths or raw errors. Complete success older than 36 hours is
stale; an attempt running for over 30 minutes is interrupted/failed; malformed
or missing records are unavailable. scripts/backup.cjs writes atomic mode-600
status and coherent SQLite backups, checks restored integrity/FKs, retains prior
success on failure and never prunes. Host rollout/restore and off-machine plan
live in DEPLOYMENT §11–12.

ReadingShell adjusts fixed mobile viewport bounds only for a focused text input
with an actual visual-height reduction, ignoring desktop resize and pinch zoom.
This retains existing controller/draft/source state; real-device acceptance is
recorded separately in HANDOVER.
