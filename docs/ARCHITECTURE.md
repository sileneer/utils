# Architecture

How the running application is put together — routes, data flow, the agent
runtime, the on-disk state, and the environment contract.

**Runtime contract, 2026-10-09 (C+D released):** verified email/password accounts replace the
shared passcode. Current release and acceptance evidence: HANDOVER §1/§7.

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
| `/` | page | `src/app/page.tsx` | tool index from the registry (`src/lib/tools.ts`) |
| `/htlb` | page | `src/app/htlb/page.tsx` | reading shell + chat sidebar |
| `/htlb/book` | handler | `src/app/htlb/book/route.ts` | book HTML proxy, GET + POST (§6) |
| `/api/book/entry` | handler | `src/app/api/book/entry/route.ts` | public pinned entry title/excerpt, read-only GET (§6) |
| `/about` | page | `src/app/about/page.tsx` | |
| `/api/health` | handler | `src/app/api/health/route.ts` | container + deploy healthcheck; `DRILL_FAIL_HEALTH=1` → 503 |
| `/login`, `/register`, `/verify-email`, `/reset-password` | pages | `src/components/auth/account-form.tsx` | shared localized form |
| `/api/auth/[...all]` | handler | `src/lib/auth/handler.ts` | allowlisted password/OTP/logout POST endpoints only |
| `/api/auth-config` | handler | `src/app/api/auth-config/route.ts` | public runtime site key and configuration availability, no secrets |
| `/api/agent/auth` | handler | `src/app/api/agent/auth/route.ts` | retired: always 410 |
| `/api/agent/session` | handler | `src/app/api/agent/session/route.ts` | GET identity, personal availability, active turn / one owned transcript (§5) |
| `/api/agent/conversations` | handler | `src/app/api/agent/conversations/route.ts` | GET owned title search/history; PATCH rename/archive (§5) |
| `/api/agent/stop` | handler | `src/app/api/agent/stop/route.ts` | POST owner-scoped cancellation (§3) |
| `/api/agent/chat` | handler | `src/app/api/agent/chat/route.ts` | POST → SSE stream (§3) |

Repository layout beyond this: `src/components/` (`ui/` = shadcn registry,
`chat/`, `htlb/`, `layout/`, `icons/`), `src/lib/agent/`, `src/i18n/`,
`messages/{en,zh}.json`, `deploy/`, `.github/workflows/`.

## 3. Agent runtime

ReadingShell owns useChat; desktop ChatPanel and the mobile Radix Sheet share
the same transcript, draft, selected model, request and scroll position.

    POST /api/agent/chat
    { message, sessionId, turnId, model, revision, context? }
        -> authenticated server route -> SDK subprocess -> SenseNova
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
of the active conversation and logout await confirmation before proceeding.
Logout revokes its login session only after that confirmation. Transport
abort remains an additional signal, but proxy forwarding is not its sole gate.

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
provider env allowlist, never auth/mail/Turnstile secrets. Real SDK acceptance
of this new tool boundary remains an AI activation gate.
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
(title/archived_at) and owner/time/usage indexes. Legacy conversation
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

- Resolution order (`src/i18n/locale.ts`): `NEXT_LOCALE` cookie → `Accept-Language` negotiation (q-value sorted, `zh*`/`en*`) → `en`.
- All visible copy lives in `messages/en.json` + `messages/zh.json`, including `tools.<slug>.name/description`. `src/lib/tools.ts` is intentionally content-free (slug, category, status, icon only).
- `html[lang]` is `en` / `zh-CN` via `htmlLang()`; the header `LanguageSwitcher` writes the cookie and reloads.
- `getTranslations` must be imported from `next-intl/server` (GOTCHAS §F).
- Consequence: pages that read cookies/headers are dynamically rendered.

## 8. Environment contract

The container reads these; `.env.example` is the committed template, the real
values live in `/opt/utils/.env` (chmod 600) on the server.

| Variable | Read by | Purpose |
|---|---|---|
| `ANTHROPIC_AUTH_TOKEN` | server config, SDK | required provider token; existing `SENSENOVA_API_KEY` remains a compatible fallback; canonical token wins if both set |
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
