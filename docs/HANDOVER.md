# Handover

**Written 2026-10-08: public verified-email accounts and AI Chat are deployed.
The owner confirmed registration, logout/login and password reset, and their
verified account is administrator. Per-message timing/token/progress details are
now deployed after local checks, full CI/CD and production runtime verification.
AI remains enabled. Six agent-initiated real acceptance requests were used;
this message-details change added no provider requests.**

Runtime contracts: [ARCHITECTURE](ARCHITECTURE.md). Operations:
[DEPLOYMENT](DEPLOYMENT.md). Debugging: [GOTCHAS](GOTCHAS.md). Design:
[DESIGN](DESIGN.md). Decisions: [PLANNING](PLANNING.md). Rewrite this handover
at the next session; keep sections 2, 4 and 7 current.

## 1. Position and authorization

The owner approved public email/password registration with email verification;
old unowned chats are not migrated. PR #1 was merged and deployed with AI off.
Their later activation approval supersedes that instruction; see PLANNING §11.8.
Do not ask these approvals again. The requested password policy is deployed.
The owner explicitly selected their registered account as administrator; the
exact address is private operational input. First signup never becomes admin.

The owner requested per-message elapsed time, tokens and timely execution details.
The implementation uses reported per-turn main-loop usage and observable stages,
not fabricated progress, provider logs or cumulative session bills. Its contract
lives in ARCHITECTURE §3 and design registration in DESIGN §5.6.1.

## 2. Working tree

The functional message-details release is committed/deployed as `baf43e0`;
[its full CI/CD passed](https://github.com/sileneer/utils/actions/runs/37851014391).
It includes matching architecture/design/decision docs, explicit mock UI fixtures
and targeted regressions. No dependency or migration was added. This handover
update closes the release; final documentation-image Actions/runtime checks are
recorded in ignored `data/investigation/message-details-release.json`.

Local main includes accounts, password policy, private daily backups, persistent
SDK storage, explicit Stop and bounded book tools. The former
`codex/verified-email-chat` branch and merged
[PR #1](https://github.com/sileneer/utils/pull/1) remain as history.
`.env.example` is the only tracked env file. Ignored `data/investigation/`
contains filtered operational scripts and receipts; never stage it, import old
JSON chats, or remove user-owned `.zcode/`. No feature work is left uncommitted.

## 3. Implementation and operations map

ARCHITECTURE describes authentication, owned SQLite chats, quotas, restricted
book tools, SSE and metadata. DESIGN §5.6–5.7 records introduced UI/dependencies.
PLANNING §10–11 records decisions. DEPLOYMENT §11 owns configuration, owner
promotion, backups/restoration and SDK persistence. GOTCHAS §I–J owns the
packaging, auth/preview, Windows runtime and shell-transfer findings.

Provider/auth/mail secrets remain server-only with private env permissions.
The persistent mounts, loopback ingress and Cloudflare client-IP trust remain
intact. The pipeline does not synchronize host compose. Do not recursively
chown the app volume, alter ACLs or build on the 1 GB production VM.

## 4. Next work, in order

1. **Off-machine protection and backup lifecycle.** Daily local backups and an
   isolated restore drill passed. The first naturally scheduled run has not been
   observed. Select owner-controlled off-machine storage and retention before
   uploading private data or pruning backups. A same-VM copy cannot cover VM loss.
2. **Preserve the AI acceptance boundary.** All six agent-initiated requests are
   used. Evidence covers real search/read completion, citations, SDK startup,
   explicit Stop/termination and restored completed/stopped history. Do not
   issue further automated paid requests or retry/reset the allowance. A later
   completed admin turn exists, but its browser/native-resume path was not
   inspected and does not renew the agent allowance or prove those scenarios.
3. **Physical phone keyboard/IME.** Browser emulation does not prove keyboard
   occlusion, safe-area handling or Chinese composition on a real phone.

## 5. Owner decisions and service readiness

| Item | State |
| --- | --- |
| Account flows | Owner confirmed registration/verification, logout/login and email password reset |
| Administrator | Explicitly designated verified active account promoted |
| Mail/Turnstile | Configured; diagnostic mail and real signup passed; message headers not inspected |
| AI | Enabled at approved limits; earlier six-request acceptance evidence remains bounded |
| Message details | Deployed; local explicit mock UI and targeted regressions passed |
| Backups | Daily schedule installed; manual backup and isolated restore passed; first scheduled run unobserved |
| Off-machine protection | Owner storage/lifecycle choice still needed |
| Independent decisions | External VM IP, docs-only workflow filtering, Windows Docker and earlier Tencent meaning remain unresolved |

## 6. Local preview and evidence handling

Local QA used explicit mock account/chat networks, isolated databases and blank
provider/mail/auth/CAPTCHA secrets. The QA processes and created browser session
were stopped; their databases are never imported by the product. Screenshots
remain outside Git under:
`C:\Users\elvis\.codex\visualizations\2026\10\07\01a11742-72fa-7913-b98f-70e25820f214`.

Windows Node shims are broken; prepend the installed Node directory documented
in GOTCHAS. Native SWC rejects sandbox cache ownership; approved host-context
builds work. CUA/default-shell startup remains unreliable; the directly invoked
native agent-browser CLI is the working fallback. Do not kill unrelated runtime
processes. No local Docker is available; WSL failed with insufficient resources.

## 7. Verification state

**Passed for message details:**

- Local lint, all 33 regressions and full production build/type checks/standalone
  sanitization. Tests cover cache totals, missing versus zero, metadata allowlists,
  tool deduplication, history redaction, latest retry usage and stopped timing.
- Explicit local mock UI: live stage/seconds/tool counts, completed token breakdown,
  approximate Stop timing and final timing after reload. Fresh light/dark 360px
  screenshots were rendered and visually inspected without horizontal overflow.
  These are synthetic UI checks, not new provider requests.
- Functional release full CI/CD, including final-image acceptance and deployment.
  Production matched `baf43e0`, healthy Docker/origin/public health and reading
  page, approved positive quotas/AI enabled, both persistent mounts, private file
  permissions, unchanged migrations, DB integrity/FKs and verified active admin.
  The cache-busted public page includes the new detail labels. Final receipt
  location is §2; authenticated new-message provider statistics were not exercised.
- Runtime reconciliation found complete=3, failed=3, stopped=1. The additional
  completed administrator turn predates this feature release and has reported
  legacy usage but no new details. Its initiation/native-resume provenance was
  not established; this implementation did not send a seventh acceptance request.

**Earlier evidence retained:**

- Owner-operated account flows and explicit admin promotion passed. Real Brevo
  diagnostic reached Gmail's inbox. No passwords/hashes/codes/session tokens
  were printed or copied locally. Auth/image tests cover OTP, sessions, ownership,
  quotas, origin gates, native SQLite, migrations and backup restoration.
- Six agent-initiated real turns included failures/timeout/rate-limit and two
  completions. The later accepted lookup performed book search/read, opened the
  matching pinned citation and avoided the earlier unsupported bedtime condition.
  The last authorized turn reused the native session and was stopped through the
  UI; actual SDK-child exit and terminal stopped usage were observed. SQLite
  persisted the incomplete answer, invalidated the native ID and required rebuild.
- Refresh/reopen restored complete/stopped history. Actual light/dark 360px UI
  and citations were inspected. The owner-authenticated independent window was
  restored/closed without exporting credentials/cookies/session tokens.
- Consistent private backup and isolated restore passed integrity/FKs/migrations
  and retained verified admin. Temporary restore removed; live DB not replaced.
  Cron is active, UTC host, exactly one daily job; first planned run is
  2026-10-09 03:15 UTC. No old backups were deleted or uploaded.

**Still unverified:** cross-device reset revocation; DKIM/SPF/DMARC headers and
other mailbox providers; independently inspected completed provider response
after Stop/native resume after recreation; physical phone keyboard; first
scheduled backup; owner-controlled off-machine protection. An isolated restore
proves backup data/structure, not a live app restore or restored login flow.

## 8. Independent record inconsistencies

DESIGN §12's duplicate morphicons/omitted next-intl/Prettier claim, historical
Git/date mismatch and superseded pipeline proposals remain separate.
DEPLOYMENT is the operations authority. Recover from live state and checks,
using historical records as leads rather than current proof.
