# Handover

**Written 2026-10-08: verified-email accounts are deployed. The owner confirmed
successful registration, logout/login and email password reset, and explicitly designated their registered account as
administrator; promotion is complete. Daily server backups and an isolated
restore drill passed. The owner now approved AI activation and up to six real
acceptance turns. AI is temporarily off while the observed cancellation problem
is repaired; the private SDK persistence mount is installed.**

Runtime contracts: [ARCHITECTURE](ARCHITECTURE.md). Operations:
[DEPLOYMENT](DEPLOYMENT.md). Debugging: [GOTCHAS](GOTCHAS.md). Design:
[DESIGN](DESIGN.md). Decisions: [PLANNING](PLANNING.md). Replace this handover
at the next session; keep sections 2, 4 and 7 current.

## 1. Position and authorization

The owner approved public email registration, password login and registration
verification; old unowned chats are explicitly not migrated. PR #1 was merged
and deployed under the explicit instruction to keep AI off. Do not ask those
approvals again. The owner's subsequent explicit activation approval supersedes
the earlier AI-off release instruction; its scope is recorded in PLANNING §11.8.

The owner subsequently requested an eight-character minimum with a letter and
digit, confirmed successful real registration/logout/login/email reset, and explicitly confirmed which
registered account should become administrator. The exact address is private
operational input, not public documentation. Promotion required a verified,
active account and completed successfully; first signup never gains admin.

## 2. Working tree

Local main includes deployed accounts, password policy and private daily backups.
Current changes add private persistent SDK storage, an owner-scoped Stop API,
process-wide single-query cancellation, browser stop notifications and regression
coverage. The book prompt distinguishes explicit conditions from inferences.
No dependency, schema, component or secret changes are included. Host compose was
updated through operator sudo while retaining its other settings; the pipeline
does not synchronize compose. Every main push runs full CI/CD and must be verified.

The former branch `codex/verified-email-chat` and merged
[PR #1](https://github.com/sileneer/utils/pull/1) remain available as history.
`.env.example` is the only tracked env file. Ignored `data/investigation/` contains
filtered operational scripts and release receipts; never stage them, import old
JSON chats, or remove user-owned `.zcode/` files.

## 3. Implementation and operations map

ARCHITECTURE §3–8 describes verified sessions, owned SQLite chats, quotas and
restricted book tools. DESIGN §5.6–5.7 records introduced UI/dependencies.
PLANNING §10–11 records decisions. DEPLOYMENT §11 covers configuration,
explicit owner promotion, the installed backup schedule and safe restoration.
GOTCHAS §I–J records native packaging, auth/preview and shell-transfer discoveries.

Provider/auth/mail secrets remain only on the server, with private env permissions.
The persistent volume, loopback-only ingress and approved Cloudflare client-IP
trust remain intact. Do not recursively chown the app volume to the deploy user.

## 4. Next work, in order

1. **Off-machine protection and backup lifecycle.** Daily local backups are now
   installed and a copied backup passed isolated restore checks. The first
   naturally scheduled run has not yet been observed. Select owner-controlled
   off-machine storage and retention before uploading private data or pruning
   existing backups. A same-VM backup does not protect against VM loss.
2. **Finish the authorized AI acceptance.** Publish the cancellation fix with AI
   off, then reactivate and finish lookup/read/follow-up, refresh/container resume,
   actual server-side Stop and recovery. Two of the maximum six requests have
   been sent; do not reset that count on deployment. Preserve the model and quotas.
   Disable AI again if a blocking failure remains; no further activation approval
   is needed within the owner's current authorization.
3. **Physical phone keyboard/IME.** Browser emulation does not prove keyboard
   occlusion, safe-area handling or Chinese composition on a real phone.

## 5. Owner decisions and service readiness

| Item | State |
| --- | --- |
| Account flows | Owner confirms registration/verification, logout/login and email password reset; DB corroborates verified active account |
| Administrator | Explicit owner designation confirmed; verified active account promoted |
| Password policy | Owner-requested policy deployed; ARCHITECTURE defines its contract |
| Domain/sender and Turnstile | Real services configured; diagnostic mail and actual registration succeeded; message headers not inspected |
| Backup scheduling | Installed and manual backup/isolated restore passed; first scheduled run still awaits observation |
| Off-machine copying and retention | Unconfigured; owner storage/lifecycle choice still needed |
| AI | Activation/at-most-six-turn acceptance approved; temporarily off during cancellation repair; two requests used |
| Independent decisions | External VM IP, docs-only workflow filtering, Windows Docker and earlier “Tencent” meaning remain unresolved |

## 6. Local preview and evidence handling

Regular production preview uses loopback port 3000; server credentials were not
copied locally, so local account services fail closed. Dedicated account/chat QA
launchers used simulated networks and were stopped; their databases are never
imported by the product. Screenshots remain outside Git under:
`C:\Users\elvis\.codex\visualizations\2026\10\07\01a11742-72fa-7913-b98f-70e25820f214`.

Windows Node shims are broken. Prepend
`C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.19.0`.
Native SWC rejects sandbox cache ownership; approved host-context builds work.
No local Docker is available; registered WSL Ubuntu failed to start with
insufficient resources. Do not alter ACLs or build on the 1 GB production VM.

## 7. Verification state

**Passed:**

- This operational change passed local lint, all 28 regression tests and the full
  production build/type checks/standalone sanitizer. It changes no UI or schema.
- Current cancellation regressions: lint, all 30 tests and the full production
  build/type checks/standalone sanitizer passed, including owner/
  Origin enforcement, cancellation without transport abort, early Stop, persistent
  stopped status and freed concurrency. Shared query state has an explicit
  QueryState annotation, verified by the complete production type check.
- Two real acceptance requests on the deployed default model: the first client
  Stop displayed stopped but DB ultimately recorded timeout; the second completed
  real `book.search`, saved usage and a citation to section 3 entry 4. Clicking
  the citation opened the matching original entry on revision `a18ee405`. The
  second answer added an unsupported bedtime condition, motivating explicit
  prompt separation of book conditions and inference. Follow-up read/resume/
  reliable server-side Stop remain to be verified on the repair.
- The SDK home mount is installed, uid 1001/mode 700. The completed SDK transcript
  exists separately from SQLite history. The earlier child-env alert was a
  diagnostic self-match, corrected; SDK env uses the supplied replacement map.
- Owner reports successful production registration, logout/login and email
  password reset. Read-only DB inspection found
  the designated account verified and active, with two active sessions. Explicit
  promotion completed; the restored backup independently confirms its admin role.
  No passwords, hashes, codes or session tokens were printed or copied locally.
- Consistent production backup and isolated restoration passed: integrity ok,
  zero foreign-key errors, both migrations present and the verified active owner
  still admin. Backup file mode 600/uid 1001; backup directory mode 700. The
  temporary restored copy was removed; the running DB was never replaced.
- Cron service is active, host timezone UTC, and exactly one daily backup job is
  installed for utils-deploy. The first planned run is 2026-10-09 03:15 UTC.
  Script/log/lock remain private. No old backups were deleted or uploaded.
- Before this operational change, actual runtime revision `0684e449` matched
  [successful CI/CD](https://github.com/sileneer/utils/actions/runs/37797265688).
  AI remained disabled, container healthy, mounted database in WAL mode with
  mode 600, integrity ok and zero foreign-key errors.
- Password-policy follow-up passed local lint, 28 tests and full build, plus
  [CI/CD](https://github.com/sileneer/utils/actions/runs/37795631458). Tests cover
  eight-character registration/login/reset, invalid new-password rejection before
  side effects, OTP preservation and session revocation. Production hint and
  light/dark 360 px UI were inspected. Bulk public negative probes encountered
  HTML 429; see GOTCHAS §J.
- Initial PR release passed test, full final-image acceptance and keyless IAP
  deployment. Image smoke covered offline SDK startup, native SQLite, migrations,
  persistence and backup restoration. Real auth tests cover OTP boundaries,
  sessions, cross-user isolation, quotas, route/origin restrictions and migrations.
- Cache-busted public pages, health, auth-config, anonymous session, private route
  rejection and retired-passcode rejection passed. Filtered current release
  receipt: ignored `data/investigation/production-release.json`.
- Exactly one authorized Brevo diagnostic was delivered to Gmail's inbox, confirmed
  by the owner. Private idempotent receipt remains in the server's operational
  directory; do not resend automatically or publish its recipient.
- Earlier source hashes matched the then-current upstream. Prior visual QA used
  simulated answers; current real-query evidence is recorded above.

**Still unverified:** cross-device production session revocation after reset;
actual DKIM/SPF/DMARC message headers and other mailbox providers; the remaining
real SDK read/resume/Stop sequence; physical mobile keyboard; first scheduled backup run and
owner-controlled off-machine protection. A successful isolated restore proves
backup structure/data, not a live application restore or restored login flow.

## 8. Independent record inconsistencies

DESIGN §12's duplicate morphicons/omitted next-intl/Prettier claim, historical
Git/date mismatch and older superseded pipeline proposals remain separate.
DEPLOYMENT is the operational authority. Recover from live files and checks,
using historical notes as leads rather than proof.
