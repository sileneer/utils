# Gotchas

Things that cost a debugging round, written down so nobody pays twice.
Format: **symptom → cause → fix**. Each entry is verified against current code
or a recorded incident; when a fix is already in the repo the entry says where.

- [A. Container image & the agent SDK](#a-container-image--the-agent-sdk)
- [B. Streaming & Cloudflare](#b-streaming--cloudflare)
- [C. SenseNova & model behaviour](#c-sensenova--model-behaviour)
- [D. GCP, IAM & the deploy pipeline](#d-gcp-iam--the-deploy-pipeline)
- [E. Server-side files & shell layering](#e-server-side-files--shell-layering)
- [F. Next.js, React & lint](#f-nextjs-react--lint)
- [G. i18n & icons](#g-i18n--icons)
- [H. External dashboards & third-party APIs](#h-external-dashboards--third-party-apis)

---

## A. Container image & the agent SDK

### Alpine silently drops the Claude Code CLI

**Symptom** the agent chat dies at runtime with `Native CLI binary not found`,
after a perfectly green build.
**Cause** `@anthropic-ai/claude-agent-sdk` ships its CLI as a *libc-gated optional
dependency* (`@anthropic-ai/claude-agent-sdk-linux-x64`). On musl/alpine, npm
skips the optional package without a word, so the image builds fine and only the
runtime notices.
**Fix** every stage uses `node:22-slim` (glibc) — see the Dockerfile's stage
comments. Never "optimize" the runner back to alpine.

### Next standalone tracing loses the SDK's sibling package

**Symptom** same `Native CLI binary not found`, this time on a glibc image.
**Cause** the SDK resolves that sibling optional package *dynamically* at runtime;
`@next/bundle-analyzer`-style tracing can't see a dynamic `require`, so the
directory is absent from `.next/standalone`.
**Fix** explicit `COPY --from=builder /app/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64 …`
in the runner stage (Dockerfile line ~40).

### Bundling the SDK breaks subprocess resolution

**Symptom** SDK starts but the CLI subprocess cannot find its own files.
**Cause** Next tries to bundle it.
**Fix** `serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"]` in
`next.config.ts`. Keep it.

### Empty directories are not in git

**Symptom** `COPY failed: directory … does not exist: /app/public` in CI, on a
commit that only deleted a file.
**Cause** git doesn't track empty dirs, so the build context has no `public/`.
**Fix** `public/robots.txt` exists on purpose. Don't delete the last file in a
directory the Dockerfile copies.

## B. Streaming & Cloudflare

### Cloudflare kills idle proxied streams at ~100 s

**Symptom** chat works locally, but on the live site the stream stops after the
`start` frame (~75 bytes) and the server logs
`Claude Code process aborted by user`. Reproducible only through the tunnel.
**Cause** the model thinks for longer than CF's ~100-second idle-connection
timeout; zero bytes flow between `start` and the first delta, so the edge drops
the connection and the drop propagates back as an abort.
**Fix** SSE **comment frames** as keepalives every 30 s
(`controller.enqueue(": keepalive\n\n")`), cleared in `finally`. This is why the
"hangs live but works locally" mystery needed two passes to solve.

### A wall-clock timeout is mandatory, not optional

**Symptom** a query appears hung for 10+ minutes with no output.
**Cause** the SDK retries upstream 429s internally with backoff and emits nothing
while doing so.
**Fix** `AGENT_QUERY_TIMEOUT_MS` (default 180 000) aborts the SDK's
`AbortController`, and the stream terminates with `{type:"error", code:"timeout"}`.

### `const` declared inside `try` is invisible in `finally`

**Symptom** CI fails with `TS2304: Cannot find name 'wallClock'` on code that
looked correct.
**Cause** block scoping — the timer was declared inside `try`, the
`clearTimeout` in `finally`.
**Fix** declare the timer (`let … Timeout | undefined`) before the `try`.

## C. SenseNova & model behaviour

### `ANTHROPIC_BASE_URL` must have NO `/v1` suffix

**Symptom** every request 404s.
**Cause** the SDK appends `/v1/messages` itself; `…/v1` becomes `…/v1/v1/messages`.
**Fix** `ANTHROPIC_BASE_URL=https://token.sensenova.cn`.

### The SDK replaces the subprocess environment

**Symptom** works in the shell, fails inside the agent: the CLI talks to
`api.anthropic.com` with no key.
**Cause** passing a partial `env` to `query()` **replaces** the child environment
rather than merging it.
**Original fix** inherited the complete environment and mapped the provider key.
**Account replacement:** complete inheritance would expose authentication/mail
secrets to public Agents. `agentEnvironment()` now carries only the explicit
runtime and provider allowlist, including base URL, PATH and HOME. Real SDK
acceptance is required when changing this list; do not restore the full spread.

### One query burns several API calls

**Symptom** `deepseek-flash` hits `inference exceeds tpm/rpm limit` almost
immediately on SenseNova's 公测 plan, even though a raw curl of the same model
succeeds.
**Cause** a single agent query costs multiple requests (main turn + tool rounds +
the SDK's other model slots), plus a 60 k-points/5 h rolling quota and tight
per-model RPM.
**Fix** pin every model slot in the server `.env`
(`ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_{SONNET,HAIKU,OPUS}_MODEL`), keep the
wall-clock bound, and let the user switch via the picker. Repeated test bursts
exhaust the window — budget your live verification attempts.

### Upstream rate-limit text arrives as a *message*, not an error

**Symptom** the assistant's reply in the chat is literally
`API Error: Request rejected (429) · inference exceeds tpm/rpm limit`.
**Cause** the SDK surfaces the throttle as assistant/result text, so it streams
like a normal answer and gets persisted to the session.
**Fix** regex-sniff both the `assistant` and `result` text
(`API Error|tpm/rpm|rate.?limit`), drop the exchange, and send
`{type:"error", code:"rate_limited"}` instead. See `errorCode()` in the chat route.

### Some models never emit partial stream events

**Symptom** certain models (GLM-5.2, DeepSeek) render an empty transcript even
though the answer arrived.
**Cause** no `includePartialMessages` deltas; the text only exists on the complete
`assistant`/`result` messages.
**Fix** tail-forward whatever the partials missed:
`if (text.length > assistantText.length) send text.slice(assistantText.length)`.
Belt-and-braces: the client also flushes accumulated text if the `done` frame
never arrives.

## D. GCP, IAM & the deploy pipeline

### A desktop SSH client times out against the public IP

**Symptom** connecting directly to the VM's external IP on port 22 times out
before any SSH authentication prompt.
**Cause** TCP 22 ingress accepts only IAP's source range. On 2026-10-08 the VM
was RUNNING with the expected IP; an IAP tunnel returned its OpenSSH greeting.
**Fix** use `gcloud compute ssh --tunnel-through-iap` (DEPLOYMENT §5). A desktop
client can instead connect to a loopback port forwarded by
`gcloud compute start-iap-tunnel`; it still needs a valid VM username/key.
No firewall or SSH-key change was needed to verify the transport.

### `iam.serviceAccountUser` on the *VM's* service account

**Symptom** `add-metadata` denied, two failed deploy runs.
**Cause** `compute.instances.setMetadata` on an instance running as a service
account requires `iam.serviceAccountUser` **on that compute SA**
(`970395615458-compute@developer.gserviceaccount.com`), not just the standard set.
**Fix** granted; it is part of the deploy identity's roles (DEPLOYMENT §2).

### `compute.projects.get` for `gcloud compute ssh`

**Symptom** deploy fails at the SSH step with a project-permission error.
**Cause** `gcloud compute ssh` reads project metadata to resolve IAP config.
**Fix** included in the custom `utilsInstanceDeploy` role.

### The guest-agent warning is a red herring

**Symptom** `Updating project ssh metadata... failed` during `gcloud compute ssh`.
**Cause** the guest agent tries to refresh *project*-level keys; instance-level
SSH still works.
**Fix** ignore — but do confirm the deploy actually ran.

### YAML plain scalars keep backslash continuations literally

**Symptom** a `run:` step executes nonsense like a stray `\` argument.
**Cause** plain (unquoted, single-line) YAML scalars do not fold `\`-continuations.
**Fix** use block scalars (`run: |`) for multi-line commands.

### Windows `scp`/`pscp` through the IAP tunnel

**Symptom** file transfer hangs on a host-key prompt, or fails outright.
**Cause** IAP tunnels plus interactive host-key checking don't mix on Windows.
**Fix** `gcloud compute ssh --command="echo <base64> | base64 -d > file"`
(DEPLOYMENT §7).

## E. Server-side files & shell layering

### CI never uploads `deploy.sh` or the compose file

**Symptom** you fixed `deploy.sh`, pushed, CI went green — and the behaviour on
the server did not change.
**Cause** the deploy job only *runs* `/opt/utils/deploy.sh`; the server copy is
hand-maintained.
**Fix** copy it over explicitly (DEPLOYMENT §7). Treat `/opt/utils` as a deploy
target that needs its own sync step.

### Multi-layer shell eats variable expansion

**Symptom** `CHAT_PASSCODE` arrived empty on the server; passcode gate rejected
everything; no error anywhere.
**Cause** expansion through *local bash → `gcloud compute ssh` → remote zsh*
layers silently consumed `$vars`.
**Fix** write **literal values** into `/opt/utils/.env`; never generate it with
interpolated heredocs across the tunnel.

### Compose `.env` ownership

**Symptom** mysterious deploy failure right after M3 came online (a real CI red).
**Cause** compose reads `/opt/utils/.env` as `utils-deploy`; wrong ownership made
it unreadable, so the container booted with empty config.
**Fix** chown to `utils-deploy`, chmod 600.

### Non-ASCII arguments from Git Bash

**Symptom** Chinese test prompts reach the API as `???`.
**Cause** Windows Git Bash mangles inline non-ASCII `curl` args.
**Fix** `--data-binary @utf8-file`. Real browsers use UTF-8 natively — this is a
test-harness artifact, not a product bug.

## F. Next.js, React & lint

### "Compiled successfully" is not a passing build

**Symptom** you grep the build log, see `✓ Compiled successfully`, and push —
while TypeScript errors failed the same job.
**Cause** Next prints that before the type-check phase.
**Fix** read the whole log tail / the Actions job status. Run `npm run build`
locally and require exit 0.

### `react-hooks/set-state-in-effect`

**Symptom** lint error: no synchronous `setState` inside `useEffect`.
**Cause** the common "read localStorage on mount" pattern.
**Fix** `useSyncExternalStore` for localStorage-backed prefs (model choice, and
anything else persisted) — see `chat-panel.tsx`.

### `serverExternalPackages` is required for any SDK that spawns a subprocess

Covered in §A; listed here because Next's bundler, not Docker, is where you'll
look first.

## G. i18n & icons

### `getTranslations` import path

**Symptom** runtime/server error importing `getTranslations`.
**Cause** it lives in `next-intl/server`, not `next-intl`.

### lucide-react v1 has no brand icons

**Symptom** `import { Github } from "lucide-react"` fails / renders nothing — bit
twice in one day.
**Cause** brand icons were removed from Lucide upstream; v1 doesn't ship them.
**Fix** `src/components/icons/github-icon.tsx` inline SVG. Don't reintroduce the
import.

### morphicons is an animation layer, not an icon set

**Cause/rule** static icons stay `lucide-react`; `MorphIcon` (fed by node data
from the vanilla `lucide` package) is *only* for genuine two-state transitions
(theme toggle). DESIGN.md §7 is binding; DESIGN.md's old "lucide-react icons
only" wording predates this and was corrected with the change.

### Locale resolution makes pages dynamic

**Symptom** build output shows site pages as ƒ (dynamic) instead of static.
**Cause** reading cookies/`accept-language` per request.
**Fix** none needed — accepted trade-off, documented in ARCHITECTURE §7.

## H. External dashboards & third-party APIs

### Cloudflare dashboard automation

Browser automation against the CF dashboard: **Playwright locator clicks time out**
(untrusted/hover-overlay issues) and `el.evaluate(click)` doesn't navigate the SPA.
Coordinate clicks do work. Also: the agent never types the owner's
password/2FA — the owner logs in themselves.

### healthchecks.io

- The `/accounts/signup` page returns **empty HTML** in this environment (bot/geo protection) → the owner used a magic-link login.
- Number inputs ignore in-browser keyboard events (Ctrl-A/Backspace dead, typing appends) → configure checks via the **API** instead (key under Settings → API Access).
- A `/fail` ping shows no fail flag in the pings-list API → trust the check's `status` field.

### Dependabot: `braces` advisory

Still open, no upstream fix for `braces ≤3.0.3`. Reachable only through the
build-time `shadcn` devDependency (so it's `devDependencies`, not runtime) — the
image ships without dev deps. Accepted risk, do not "fix" by moving it around.

### `gh` API rate limits

Heavy `gh` polling in a session hits the 5 000/hr cap; verification then has to
fall back to `curl` against the live site. Prefer `gh run watch` over repeated
status polls.

## I. Chat UI investigation (2026-10-07)

This section records the historical investigation, not shipped fixes. Runtime source
was at `6cd9151`. Public live UI was checked in the Codex browser in light/dark,
at desktop and 360 px widths, in English and Chinese. Authenticated answers,
real upstream error screens, and the mobile software keyboard were not tested:
the browser remained at the passcode gate. Prior backend verification remains
in HANDOVER; it does not prove the current browser experience.

**Local repair status:** the owner approved all three PLANNING §10 batches.
Implementation is in the working tree, with the contract in ARCHITECTURE §3–6
and design rules in DESIGN §5.6. Current test/preview evidence and remaining
gates are in HANDOVER §7. The causes/proposals below describe the original
version; they are not claims that the unshipped local code still has each defect.

### Repair-time traps

- **Showing selection actions during a drag moves the book:** inserting the
  parent action bar while pointer selection is still active shifts the iframe
  and can reduce a whole phrase to one character. Defer selection notification
  until pointer-up (or keyboard selection completion), then debounce it.
- **Cached iframe loads before hydration:** a one-shot ready message can be lost,
  leaving Send disabled. Use an explicit parent init / iframe ready handshake
  on both listener installation and iframe load.
- **A long cited entry hides its own title when centered:** clear all necessary
  filters (including dispute/todo), then use the reader's lazy-render-aware
  scroll helper with start alignment.
- **Legacy answers have no verified revision:** rebinding a later turn does not
  establish provenance for earlier answers. Keep per-message revisions and a
  plain-text citation fallback for unknown sources.
- **Cancellation while sources prepare:** aborting only the SDK cannot release
  a query waiting for Git/network preparation. Cancel that wait independently
  while retaining shared preparation for other readers.
- **Windows sandbox SWC cache:** the native compiler rejects the sandbox cache
  owner/DACL, although lint/test run normally. The standard build succeeds in
  the approved host execution context. Do not edit native binaries or relax
  directory protections as a workaround.

### Duplicate answers and mixed conversations

**Symptom** a normal nonempty response appears twice. Starting a new chat during
generation can put the previous answer in the new transcript.
**Cause** `chat-panel.tsx` appends `acc` on `done`, then appends it again after
EOF. `newChat()` clears state but neither cancels the request nor invalidates
its callbacks; the new-chat button stays enabled during generation.
**Evidence** an isolated Node harness extracted the actual `send()` and
`newChat()` functions, transpiled them with the installed TypeScript, and fed
mock SSE frames through their existing parser. `delta -> done -> EOF` produced
two assistant messages. Reset between `start` and `delta` produced two old
assistant messages in an otherwise empty transcript. This is a client-logic
reproduction, not a live model query or a React/browser integration test.
**Proposed fix** give each message/request stable identity, finalize once, and
cancel or invalidate an old request when switching conversations. Add a stop
control with explicit interrupted-message state.

### Silent stream termination and weak error recovery

**Symptom** a stream can finish with no answer and no error. A timed-out partial
answer looks like an ordinary completed assistant message. Busy errors leave
the attempted question in the transcript but clear the composer.
**Cause** EOF is accepted without checking for a terminal event; the fallback
flush does not distinguish success from failure. `setInput("")` runs before
the request is accepted. There is no retry control or message status field.
**Evidence** the same extracted-function harness reproduced empty EOF, partial
`delta -> error(timeout) -> EOF`, and HTTP 429 with those outcomes.
**Proposed fix** explicit submitted/streaming/completed/failed/interrupted states,
terminal-event checks, preserved drafts, and retry on the failed turn.

### Backend context resumes while visible history disappears

**Symptom** reload starts an empty visible transcript while the next request
can resume the previous SDK session. Closing/reopening the mobile drawer also
discards its local messages and draft.
**Cause** initialization restores only `htlb_chat_session_id`; the session
endpoint returns only `{authed}`. No route loads messages for display. The
desktop and mobile `ChatPanel` instances have independent state, and mobile is
conditionally mounted/unmounted by `ReadingShell`.
**Evidence** source inspection; authenticated browser reproduction pending.
**Proposed fix** own one conversation state above the responsive containers,
load authorized history, and preserve draft/scroll position across drawer use.

### Mobile drawer and small controls

**Symptom** at 360 px the chat title truncates while the model picker occupies
130 px. Model/new-chat/close controls are 28 px tall; new-chat and close are
28 x 28 px. Escape does not close the drawer. The background remains in the
accessibility tree rather than becoming a modal inert surface.
**Cause** a custom backdrop + absolutely positioned `aside` replaces the
already-adopted Sheet. It has no modal semantics/focus trap/Escape handler.
Header controls use compact button sizes. One toggle flips both desktop and
mobile visibility states, even though their surfaces have different lifecycles.
**Evidence** live screenshot, read-only DOM geometry, Escape key check, and
source inspection. Focus-trap keyboard traversal was not comprehensively tested.
**Proposed fix** reuse the existing Radix Sheet, retain shared conversation
state, meet DESIGN's >=40 px touch targets, and move the model control out of
the crowded mobile title row.

### Presentation and reader integration

**Observed/source-confirmed limitations**
- Locked state provides a passcode form in a mostly blank panel, without a
  capability preview. The greeting after unlock is one sentence, with no starter
  questions.
- Messages render raw strings with whitespace preservation: no Markdown,
  citation links/cards, copy action, or selectable structured source details.
- Each stream update forces scrolling to the bottom, even while the reader
  is reviewing an earlier reply. Composer is single-line and disabled during
  generation; there is no stop control or genuine tool-progress event.
- Model hints always use `m.hint.zh`, including under English UI. Hint and
  disclaimer sizes are 11 px, below DESIGN's 12 px floor. Icon-only chat
  controls lack the required Tooltip; the passcode and message inputs have
  placeholders but no explicit label wiring.
- The fixed reading shell hides the main site's visible language/theme controls;
  its own header supplies neither. The book has a separate theme button.
- No selected-text/current-section context is sent to chat. Citations cannot
  navigate the reading iframe. Live book entries already expose stable-looking
  anchors such as `#e-1-1`, so a bridge is feasible; filtering/lazy rendering
  still needs an explicit reveal-and-scroll contract.

**Additional source-consistency risk** book HTML refreshes daily, but the agent's
reader workspace returns immediately when its readiness marker exists. There
is no corresponding refresh/version handshake. The displayed book and the
agent's sources can therefore diverge; actual production divergence was not
measured in this investigation. A citation feature needs a shared source
revision or an explicitly displayed version difference.

## J. Public account implementation (2026-10-08)

### Better Auth background mail failures look successful

**Symptom** a rejected Brevo call still produced a successful OTP/register response.
**Cause** Better Auth 1.7.7's `runInBackgroundOrAwait` catches/logs task errors even
when awaiting; throwing in the mail callback is insufficient.
**Fix** request-local AsyncLocalStorage outcome around the awaited adapter/route.
Failed sending returns recoverable 503; no OTP/mail body/provider error logging.
Register does not auto-send through core/plugin hooks: one explicit bounded send
follows unverified signup, avoiding duplicate mails. Core sendOnSignUp/SignIn are
false, so ordinary/unverified password login cannot bypass CAPTCHA mail budgets.

### Native SQLite install and version

**Symptom** package installed but native binding unavailable.
**Cause** this npm runtime blocks unapproved package install scripts.
**Fix** reviewed `better-sqlite3@13.0.3` install script is explicitly approved in
package.json. Windows native query reported SQLite 3.53.4. This does not prove
Node 22 Debian image startup; the separate full-image gate is required.
Its actual result is recorded in HANDOVER §7.

The first complete-image PR run exposed an additional install difference:
`npm ci` with Node 22's npm 10.9.9 invoked `node-gyp rebuild`; Debian slim lacked
Python and failed before the app build, whereas the Ubuntu runner had the
toolchain. Supply Python, make and g++ only in the Docker dependency stage;
the runner remains compiler-free. Version 13 carries its own prebuild/loader
and no longer depends on `bindings` or `file-uri-to-path`; those absent packages
must not appear in explicit Docker COPY instructions. Package-level probes and
an existing Windows node_modules directory do not validate a clean image install.
Upstream [binding selection](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/binding.gyp)
and [node-gyp requirements](https://github.com/nodejs/node-gyp#on-unix) explain
the dependency-stage prerequisites; rerun the full-image gate after fixing them.

### Standalone includes local env even with tracing excludes

**Symptom** `.next/standalone/.env` existed after a green local build.
**Cause** Next explicitly copies `.env` / `.env.production` independently of
file-tracing exclusions. Importing a management CLI into routes also caused a
whole-project tracing warning.
**Fix** runtime database loader separated from management commands; tracing
excludes data/tests/env; `npm run build` finishes with the scoped artifact
sanitizer, removing env copies without reading their contents and rejecting a
traced data directory. Docker context independently excludes env/data. No image
or commit was produced during discovery. Do not copy `.next` directly before
the complete build command/artifact gate has finished.

### Turnstile flexible width is at least 300 px

**Symptom** CAPTCHA extended past the inner account form at 360 px viewport.
**Cause** card/page padding leaves under 300 px although viewport is wider.
**Fix** observe the real form container: compact widget below 300 px, flexible
above; theme and locale follow the website. Reflow resets challenge token.

### Browser screenshot timing

**Symptom** batch full-page screenshots showed a blank body immediately after
navigation despite a populated DOM snapshot.
**Fix** inspect the rendered viewport after settling and use the browser's
viewport screenshot API. Screenshots are JPEG, not PNG. Discard empty captures;
DOM width checks alone do not prove visual acceptance.

### Diagnostic HTTP client returns 403 while the application client succeeds

**Symptom** Python urllib's default requests to Brevo sender/domain endpoints
returned 403 during server preflight, although the owner had saved an API key.
**Finding** requests from the same server with the application's `node`
User-Agent returned 200, including authenticated domain, active sender and relay
status. The precise provider filtering reason was not established.
**Fix** use the application's request headers for readiness checks and filter
responses inside the server. A diagnostic 403 alone does not establish an
invalid key or an IP-allowlist block. Do not print keys or unfiltered responses.

### Deploy-user test receipts cannot be written into the app volume

**Symptom** the mail diagnostic could not create a receipt directory under
`/opt/utils/data`; the error occurred before any provider send request.
**Cause** the mounted application data has container ownership, separate from
the deploy user's ownership of the server env and operational files.
**Fix** use `/opt/utils/mail-acceptance` owned by utils-deploy, mode 700, with
600 receipts. Do not recursively chown the app data volume to fix a diagnostic.

### Registered WSL distribution is not an available Docker environment

**Symptom** normal sandbox WSL enumeration returned access denied. Host-context
enumeration found Ubuntu, but starting it returned
`Wsl/Service/CreateInstance/CreateVm/HCS/ERROR_NO_SYSTEM_RESOURCES`.
**Finding** a registered distribution does not establish a running Linux or
Docker environment. No Docker CLI exists in the Windows development environment.
**Action** do not change Windows resource/security settings or build on the 1 GB
production VM to work around it. Prepare the isolated full-image CI acceptance
in DEPLOYMENT §2; record the actual Actions result separately from local lint.

### Bulk public auth probes can return HTML 429

**Symptom** rapid CLI password-policy probes through Cloudflare returned an
HTML 429 for a reset request, causing JSON parsing to fail. A separate signup
request returned the expected JSON 400. `cf-mitigated` was absent; the exact
upstream rate-limit rule was not established.
**Finding** the deployed revision and health were correct. Bounded probes over
the authorized IAP/loopback path confirmed both invalid-password guards and
that valid eight-character signup still stops at the missing CAPTCHA. No
account, mail or AI call was created by these probes.
**Fix** inspect status/content-type before decoding JSON and pace public probes.
Use the protected origin for a batch of negative application checks, preserving
origin/auth/CAPTCHA validation. Do not weaken public protection or rate limits
to accommodate a diagnostic; origin checks do not prove a real browser signup.

### Raw Windows shell-script transfer fails before Bash starts

**Symptom** directly executing a manually transferred backup script returned 127:
`env: 'bash\r': No such file or directory`, although `bash -n` returned success.
**Cause** raw Windows working-tree bytes retained CRLF in the shebang; syntax
checking explicitly invokes Bash and does not exercise executable startup.
**Fix** normalize CRLF to LF at the transfer boundary, reject remaining carriage
returns, then test both syntax and direct execution before installing cron.
`.gitattributes` enforces LF for shell files in future checkouts. The failed run
installed no schedule; a successful backup and isolated restore preceded cron
installation. No production database replacement or app restart was needed.

### SDK transcript storage is separate from application persistence

**Finding** SQLite records SDK session IDs, while the SDK defaults to storing
transcripts under `~/.claude/projects`. The app's data mount alone does not
persist that home directory; container replacement loses the native session.
**Fix** persist the SDK config directory through the private additional mount in
DEPLOYMENT §11. Database-only restores invalidate native IDs and rebuild using
completed visible history. The SDK's [session documentation](https://code.claude.com/docs/en/sessions)
describes the independent transcript store. Real post-recreation resume must be
checked; persistent SQLite alone does not prove SDK resume.

### Process inspection can match its own diagnostic script

**Symptom** a runtime SDK environment probe reported protected server variable
names despite the actual native SDK child having none of them.
**Cause** matching the whole `/proc/*/cmdline` also matched the `node -e` probe,
whose script contained the SDK package name and inherited the app environment.
**Fix** identify the executable/launcher arguments rather than arbitrary script
text; exclude the probe itself. SDK 0.3.292 uses the supplied `options.env` as a
replacement. Inspect variable names only, never values. The initial diagnosis
was corrected; no credential value was printed by the probe.

### Host compose changes require the operator's sudo access

**Symptom** utils-deploy could read `/opt/utils/docker-compose.yml` but editing
the mount list returned permission denied.
**Cause** the host compose is root-owned and readable by the deploy user; this
differs from the private deploy-user-owned `.env`.
**Fix** edit the existing compose through operator sudo access, retain ownership
and all other configuration, and validate with `docker compose config --quiet`.
Do not change env permissions or recursively chown the application volume.

### Closing a browser stream does not prove upstream cancellation

**Symptom** production showed an immediate client-side stopped answer, but the
stored turn ultimately had `timeout`; cancelling the browser stream had not
produced a timely server-side stopped terminal state through the deployed proxy.
**Finding** the exact proxy propagation cause was not established. Direct mocked
request-signal tests passed and did not reproduce that production path.
**Fix** explicitly post an authenticated, same-origin, owner-scoped turn UUID to
the Stop handler described in ARCHITECTURE §3. Retain transport cancellation as
an additional signal. Check stored `stopped` status, SDK termination and a freed
query slot in real acceptance, rather than accepting the optimistic client label.

### Server maintenance can delay recreation and Docker health

**Symptom** image metadata checks and compose recreation exceeded bounded
operator timeouts; one transition returned public 502. Origin health could pass
while Docker health still reported starting or a five-second check timeout.
**Finding** concurrent Google OS maintenance/package processes and high I/O
pressure were observed on the 1 GB VM. A reported activation rollback failure
was followed by direct inspection confirming AI off and the container healthy.
**Action** inspect the actual flag, image, origin and Docker health after a
failed operation. Wait for resource pressure to ease before retrying the same
protected activation. Do not interrupt unrelated maintenance, lower health
gates or assume the generic gcloud SSH suggestion identifies a network fault.

### Large book tool results can amplify upstream rate limits

**Symptom** real queries timed out or returned rate_limited. Private SDK records
included TPM/RPM error text, tool results of roughly 16,000/12,000 characters,
and a subsequent input count of approximately 18,000 tokens. The precise
account/model limit and sole cause of the timeout were not established.
**Mitigation** bound search excerpts and paginated section reads as defined in
ARCHITECTURE §3, and return exact read offsets with search hits. This reduces
avoidable input without removing source access or changing model/auth/quotas.
Verify the smaller payload with the actual provider before declaring acceptance
passed. Remaining credits and app daily quotas do not override provider rate
limits; inspect owner-visible provider limits rather than silently increasing
app quotas or issuing unlimited retries.

### Windows CUA startup can fail while bundled runtime files are in use

**Symptom** both browser control and the default shell failed with
`helper_unknown_error: setup refresh had errors`; CUA also reported a trusted
Node process exiting unexpectedly. Filtered local sandbox logs identified an
`os error 32` sharing violation while opening `node_repl.exe`/`node.exe` to
refresh runtime access. A restart and a limited failed-kernel reset did not
provide a durable recovery; the exact broader runtime defect is unresolved.

**Fallback** the installed agent-browser CLI worked through the approved host
execution context, but auto-connect found no accessible Chrome. Open a separate
named headed session and let the owner log in directly on the product. This
allowed real UI acceptance without copying credentials, cookies or database
session tokens. Close only that created session after restoring its viewport
and theme. Do not change ACLs, weaken sandbox policy, kill unrelated Node/app
processes or treat client Stop alone as backend proof. Current evidence and
remaining acceptance boundaries belong in HANDOVER §7.

### NVM browser wrapper fails on multiword arguments

**Symptom** the NVM agent-browser wrapper interpreted part of its Author Software
path as a command when locator arguments contained spaces. Simple commands
worked. **Workaround** invoke the installed agent-browser native binary directly,
with normal PowerShell argument quoting. Do not change PATH/ACL policy globally.
For the local mock preview, first wait for the upstream app to return HTTP 200;
starting the fixture before the app listens causes a connection-refused exit.


### Additive columns can still break image rollback

**Finding** the prior session writer uses positional INSERT with six conversation
columns. Adding title/archive columns makes that older image unable to save chat
after rollback, although health can remain green. The unreleased A+B migration
was changed to a separate metadata table with unchanged legacy columns. Regression
checks execute old-style inserts after migration and read those rows through the
new code. Never infer backward compatibility from an additive ALTER alone.

### Windows standalone preview locks the next build output

**Symptom** next build fails EBUSY while replacing .next/standalone. **Cause**
the locally created standalone QA server is still running from that directory.
Stop only that recorded, command-line-verified process before rebuilding, then
restart it with the explicit isolated/AI-disabled QA environment. Wait for its
HTTP readiness before reopening the fixture page; early reload can show its 502
placeholder rather than the application.

### Audit overlays after their animation settles

Axe run immediately after opening a Radix overlay can report transient contrast
failures/incomplete checks from animated opacity/backdrop blending. Wait for that
overlay's animations to finish, then rerun and inspect computed foreground/background
and fresh screenshots. Settled audits resolved these transient findings; the
independent keyboard-scroll/ARIA-name findings were real and were fixed.

### Headed release-browser capture can stall on Windows

**Observed 2026-10-09** a named headed browser remained reachable for DOM/eval
reads, but native clicks did not update the expected panel and screenshot/viewport
commands timed out (os error 10060 / invalid EOF response). Doctor reported a
healthy daemon; the underlying cause was not established. A DOM-button click
opened the actual history panel, while a separate anonymous headless browser
completed native clicks, viewport changes and screenshot inspection. Do not
claim headed visual/pointer acceptance from a snapshot alone. Keep credentials
in the product; do not export cookies, alter ACLs or kill unrelated processes.
In PowerShell quote element references such as '@e11'; bare @e11 is splatting
and can produce a missing-argument error before the browser is called.
