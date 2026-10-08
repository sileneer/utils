# Handover

**Written 2026-10-08: approved AI Chat and public email accounts implemented
locally. Gmail delivery passed; higher AI quotas and full-image CI gates prepared.
Git check-branch/draft-PR work and Cloudflare IP preparation are authorized.
External acceptance and separate production release approval remain pending.**

Runtime contracts live in [ARCHITECTURE](ARCHITECTURE.md), operations in
[DEPLOYMENT](DEPLOYMENT.md), debugging in [GOTCHAS](GOTCHAS.md), design rules in
[DESIGN](DESIGN.md), and decisions in [PLANNING](PLANNING.md). Replace this file
at the next handoff; keep sections 2, 4 and 7 current.

## 1. Position and authorization

M1–M4 shipped before this task; production is still the previously shipped
version. The owner approved the complete local AI Chat plan (PLANNING §10)
and subsequently the public email-account implementation (PLANNING §11).
Public signup, email/password login, registration OTP, and skipping old chat
migration are confirmed. Do not ask these choices again.

Local implementation includes the account/database/mail integration and the
public book-agent permission boundary. On 2026-10-08 the owner explicitly
authorized the two presented actions: preparing Cloudflare client-IP trust and
committing/pushing a check branch with a draft PR. Merge and production deployment
remain separately unapproved. One explicitly authorized
real mail acceptance test has now run (section 7). No paid Agent call was made.

## 2. Working tree

The check branch is `codex/verified-email-chat`, based on `6cd9151`; remote main
was refreshed and matches that base. The authorized submission includes:

| Origin | Scope |
| --- | --- |
| Inherited documentation restructure | AGENTS, README, PLANNING; new ARCHITECTURE, DEPLOYMENT, GOTCHAS and HANDOVER |
| Approved AI Chat work | Reliable SSE/turn state, responsive Markdown answers, reader selection/citations, shared chat controller, book workspace, localized UI and regression fixtures |
| Approved accounts | Better Auth/SQLite, migrations and backup/admin/start scripts; registration/verification/login/reset forms; Brevo and Turnstile adapters; persistent limits, user-owned conversations and AI quota/tool boundaries |
| Supporting release preparation | DESIGN registration, package/lock, Docker/start changes, environment example, standalone artifact sanitization, isolated final-image smoke script, read-only PR acceptance workflow, publication gate and canonical documentation |

The approved changes are being reviewed for the first check-branch submission.
No production deployment has occurred. `.env.example` is the only tracked environment file; ignored
`data/` contains test databases, caches and local evidence. Do not import old
JSON conversations or expose the explicit QA fixtures.

## 3. Implementation map

See ARCHITECTURE §3–8 and DESIGN §5.6–5.7 for the current working-tree contracts.
PLANNING §10–11 records scope and choices; GOTCHAS §I–J records discoveries.
The shared passcode endpoint is retired locally. Account sessions and owned
chat history now use SQLite. Public users receive only the narrow book tools;
AI remains disabled unless explicit positive server quotas enable it.

Migration and restore/admin procedures, mail/DNS/Turnstile configuration and
remaining release checks are in DEPLOYMENT §11. Production still requires the
new environment configuration and acceptance before this work is released.

## 4. Next work, in order

1. **Finish owner service preparation.** The owner reports `BREVO_API_KEY`
   saved on 2026-10-08; its value was never displayed or copied locally. The
   owner's latest Brevo domain
   list screenshot confirms `auth.lzhdev.com` is **Authenticated** after the
   four public DNS records were supplied. Branding is not configured. The owner
   now reports sender status and Turnstile configuration saved. Server-only
   preflight confirms Brevo API access, authenticated/verified domain, active
   sender `lzhdev <noreply@auth.lzhdev.com>` and transactional relay enabled.
   IAP SSH stat confirms `/opt/utils/.env` already has mode 600 and owner
   `utils-deploy:utils-deploy`;
   no chmod was needed. Missing APP_URL and BETTER_AUTH_SECRET were added inside
   the server; the secret was generated there without output. MAIL_FROM_NAME
   was saved to match the verified sender, and the local adapter now honors it.
   The owner supplied a Gmail recipient and authorized one test mail. Brevo
   returned 201 and a delivered event; the owner then confirmed it arrived in
   the Gmail inbox. Do not send another mail automatically.
   Turnstile rejected an invalid token; actual widget success remains pending.
2. **Run the prepared full-image CI gate.** `tests/image-smoke.cjs` now checks
   final-image native loading/offline SDK executable, clean artifacts, non-root
   standalone startup/routes, migration, volume persistence across restart and
   backup restore. `.github/workflows/acceptance.yml` runs it on PRs with read-only
   permissions and no publish/deploy; the production workflow gates publication
   on the same check. These changes are local and have not run in Actions.
   No Windows Docker exists. WSL host enumeration found Ubuntu, but startup
   failed with insufficient system resources; do not build on the 1 GB VM
   (DEPLOYMENT §9). Git approval is now received: commit/push the check branch and
   create a draft PR, without merging to main or deploying.
3. **Complete service/Agent acceptance.** The owner requested more generous AI
   limits; initial values are recorded in PLANNING §11.8 and saved on the server.
   `AI_ENABLED=0` remains; production was not restarted. Production CAPTCHA
   success/hostname, complete registration/reset real mail, actual mail headers
   and real narrow Agent lookup/follow-up/restore/stop remain required.
   No simulated mail, CAPTCHA or SDK response proves these checks.
   Use the bounded real Agent sequence in PLANNING §10.5 after account access
   and quotas are configured; preserve the chosen default model. The earlier
   word “Tencent” is unconfirmed; do not configure Tencent Cloud on that assumption.
   The earlier automatic rejection of `TRUST_CLOUDFLARE_IP=1` was resolved by the
   owner's subsequent explicit authorization. The server script rechecked all
   published bindings are loopback-only and appended this entry, preserving the
   quota settings, disabled AI and mode 600. No container was restarted. Trust
   in `CF-Connecting-IP` depends on keeping the Tunnel/loopback-only ingress.
4. **Check a physical phone/software keyboard.** Emulated widths do not prove
   actual keyboard occlusion, safe-area behavior or Chinese IME composition.
5. **Prepare release only after gates are reconciled.** Review inherited docs,
   organize focused Conventional Commits and obtain the separate release
   authorization. Follow DEPLOYMENT §8/§11 for CI and live checks. Backup
   scheduling and off-machine copies are prepared procedures, not installed.

## 5. Waiting on the owner

| Item | State |
| --- | --- |
| AI Chat and email account local scope | Approved; implemented locally |
| Old chats | Explicitly skipped; no migration or automatic claim |
| Brevo key | Server-side API reads succeed; key never displayed or copied locally |
| Domain/sender/Turnstile | Domain and active sender/relay verified by API; Gmail inbox receipt passed; invalid-token rejection passed; real widget success pending |
| Server env permissions | Verified over IAP: mode 600, owner utils-deploy:utils-deploy; no repair needed |
| Mail identity / acceptance feedback | Sender name lzhdev synchronized; one authorized test delivered and owner confirmed Gmail inbox receipt |
| Public AI quota | Owner requested larger limits; initial policy in PLANNING §11.8 saved server-side, AI disabled |
| Cloudflare client IP trust | Explicitly authorized; loopback-only Docker binding rechecked and server env prepared; applies at later container recreation |
| “Tencent” meaning | Unconfirmed; no Tencent service configured |
| Commit/check-branch push/draft PR | Explicitly authorized; being prepared on codex/verified-email-chat |
| Merge/deploy | Separate authorization not received; not implied by approving a test branch/PR |
| Prior independent decisions | VM external IP, docs-only pipeline filtering, Docker on Windows and skills-loading meaning remain in PLANNING/DEPLOYMENT |

## 6. Local preview and tests

The regular production preview is restarted on loopback port 3000 from the
current build. Reading and login UI can be inspected there; server credentials
have not been copied locally. Unconfigured account services fail closed.

`tests/auth-preview.cjs` was used on loopback ports 3001/3002 for account UI
acceptance, then stopped. It uses a separate ignored SQLite database, fake mail
outbox and official CAPTCHA test keys. It is never imported by the app/image.
The earlier `tests/preview.cjs` provides canned chat responses for UI regression
only. Neither fixture is a deployed service or provider acceptance evidence.
Temporary QA browser tabs were closed and viewport overrides reset.

Windows Node shims are broken here. Prepend the actual Node 24.19.0 runtime:
`C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.19.0`.
Use the ignored repo-local npm cache if necessary. Native SWC rejects sandbox
cache ownership; the standard build runs in approved host context (GOTCHAS §I).
Do not weaken ACLs. No Docker is installed on the development machine.

## 7. Verification state

**Local checks passed on 2026-10-08:**

- `npm run lint`, `npm test` (27/27), and the complete `npm run build` including
  TypeScript/static generation and standalone sanitization. `git diff --check`
  also passes. CI has not run for these uncommitted changes.
- After adding the final-image gate, lint/test/build were rerun successfully;
  the standalone filename scan again found zero env/database/backup artifacts.
  Both workflow YAML files parse and the image smoke script passes Node syntax
  checking. This proves only preparation; Docker execution is still pending.
- Real pinned Better Auth and SQLite tests cover verified password login,
  hash-only OTP storage, expiry/wrong/replaced/single-use/concurrent codes,
  resend limits, rejected CAPTCHA, mail-failure recovery, reset revocation,
  logout, origin/auth-route restrictions and cookie properties. Mail and
  CAPTCHA networks are simulated only inside tests.
- Cross-user chat read/write denial, persistent limits and atomic AI quotas,
  migration idempotence, coherent SQLite backup/restore with integrity/FK
  checks, narrow book-tool bounds, secret environment exclusion, and mocked
  SDK tool restrictions. Windows native/standalone module loading passes;
  that is not a Linux container test.
- A subsequent bounded temporary official Node 22-slim container on the VM
  passed native SQLite loading, repeatable current migrations, 600 DB permission,
  unverified-login rejection, OTP verification, password login/HttpOnly cookie,
  and backup restore integrity/account checks. Versions: Node 22.23.3,
  better-auth 1.7.7, better-sqlite3 13.0.3, SQLite 3.53.4. It used the current
  database/migration/options sources with a minimal pinned direct-dependency
  manifest, isolated fake mail and temporary data; it did not build the entire
  app image or reproduce the whole production lockfile. Container and temporary
  files were removed. The official base image remains in Docker's cache.
- Production dependency audit reports zero vulnerabilities. Standalone output
  is checked for environment files and private data; Next's explicit `.env`
  copy is removed by the build sanitizer without reading secret contents.
- Browser account flow: signup → OTP verification → explicit password login →
  authenticated reader → logout; private visible state/draft clears on logout.
  Empty-password validation and both locales/themes at 360 px were checked.
  CAPTCHA adapts to compact width; sampled desktop forms were checked at
  1280 px. No horizontal overflow was observed.
- Prior chat UI regression used explicit canned responses in English/Chinese,
  light/dark at 360/768/1280 px, including answer formatting, draft preservation,
  interrupted streams, stable retry, mobile Sheet behavior, source selection
  and citation navigation. These do not prove new real SDK operation.
- Previous source parity checked all 34 Markdown hashes against upstream
  `e73cb638b27f12a422546e5c09cadcac6fce03fe`; evidence remains in ignored
  `data/investigation/source-parity.json`. The temporary checkout was removed.

Screenshots are outside Git under
`C:\Users\elvis\.codex\visualizations\2026\10\07\01a11742-72fa-7913-b98f-70e25820f214`:
`auth-*.jpg`, `chat-new-*.jpg`, and `chat-new-selection-context.jpg`.
Account CAPTCHA screenshots display the official test-key notice; email values
are disposable local examples. Chat answers in these images are simulated.

**Owner service evidence:** Brevo's domain list shows `auth.lzhdev.com`
Authenticated on 2026-10-08. This confirms the service's domain check, not
actual message delivery. Subsequent server-only API checks confirmed the domain
verified/authenticated, intended sender active and transactional relay enabled.
The configured production origin matches, all required auth/mail/Turnstile keys
are nonempty with no duplicate entries, and the auth secret meets minimum length.
Only booleans and intended public sender details were returned; no secrets were
displayed. Turnstile returned `invalid-input-response` for an intentionally bad
token. This negative check does not prove real widget/hostname success.

Subsequent server preparation appended the initial public AI quota settings
(PLANNING §11.8) and `AI_ENABLED=0`, preserving mode 600 and existing entries.
No production container restart or provider call occurred. After the owner
explicitly authorized Cloudflare-IP trust, a separate script verified loopback
bindings and appended `TRUST_CLOUDFLARE_IP=1`; no secrets were displayed and mode
600 was retained. The earlier rejected attempt did not execute; see section 4.

**Real mail acceptance, 2026-10-08:** the owner explicitly supplied one Gmail
recipient for a test. A server-side diagnostic sent one clearly labeled
non-login test-code email through Brevo; response 201 and the matching message's
`delivered` event confirm provider acceptance/delivery. The owner confirmed Gmail
inbox receipt. Actual DKIM/SPF/DMARC message-header inspection is not confirmed.
This was a direct mail-service test, not the complete app registration flow.
No OTP or key was printed or persisted. An idempotent protected receipt (600,
recipient HMAC and provider metadata only) is at
`/opt/utils/mail-acceptance/gmail-20261008.json`; it prevents duplicate sending.
The authorized address is kept out of public docs. Local diagnostic scripts are
ignored under data/investigation. The receipt directory is separate from the
container-owned application volume.

**SSH diagnosis, 2026-10-08:** read-only GCP checks show the VM RUNNING at the
expected IP and TCP 22 allowed only from IAP's range. A temporary loopback IAP
tunnel returned an OpenSSH greeting, then was stopped. No firewall/key/VM
changes were made. Direct-IP client timeout and correct access are documented
in GOTCHAS §D / DEPLOYMENT §5. A subsequent authenticated IAP SSH command read
only the env file's permission/owner metadata: mode 600, utils-deploy:utils-deploy.
No environment values were displayed and no permission change was needed.

**Not yet passed:** actual mail-header confirmation, full app signup
mail acceptance (other mailbox providers remain untested),
real Turnstile validation, real SDK/provider calls, physical mobile keyboard,
full Linux application-image/startup and restart acceptance, installed backup scheduling,
GitHub Actions and production verification. No paid Agent calls were made.
Historical production streaming through `6cd9151` does not validate this tree.

## 8. Independent record inconsistencies

Do not silently expand this task to these pre-existing issues:

- DESIGN §12 duplicates morphicons, omits next-intl and claims installed
  Prettier/class ordering although package.json has no such dependency.
- DESIGN/PLANNING's historical i18n date differs from the Git commit date.
- Older pipeline proposals in PLANNING §4.2/§6 describe superseded secret/SSH
  approaches. DEPLOYMENT is the current operational authority.
- Earlier handover mentioned a credential in an external unversioned agent
  note. This task did not open it or copy a value; no secret belongs in docs.

## 9. Recovering context

Read live Git/code and these canonical docs. Treat prior notes as leads, not
proof. Resume outstanding gates rather than repeating completed local work.
