# Handover

**Written 2026-10-08: verified-email accounts are deployed. The owner confirmed
successful registration, logout/login and email password reset, and explicitly designated their registered account as
administrator; promotion is complete. Daily server backups and an isolated
restore drill passed. The owner now approved AI activation and up to six real
acceptance turns. AI is enabled at the approved limits after the smaller-payload
release. All six real requests have been used: a new grounded lookup completed,
and the final request was stopped with persisted usage and SDK termination.
Refresh restored the completed/stopped history; light/dark 360 px checks passed.
A new completed provider request after Stop was not exercised within this budget.**

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
The cancellation/persistence repair is committed and deployed as `3e2c6a1`;
[its full CI/CD passed](https://github.com/sileneer/utils/actions/runs/37808664282).
The smaller book-payload follow-up is committed/deployed as `1ed3310`;
[its full CI/CD passed](https://github.com/sileneer/utils/actions/runs/37827946769).
It adds targeted read offsets and pagination regressions. The prompt distinguishes
explicit conditions from inferences and directs relevant fragment reads. This
handover refresh changes documentation only; tracked implementation is committed.
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
2. **Preserve the AI acceptance boundary.** The six-request allowance is used.
   Current evidence covers real search/read completion, citation navigation,
   SDK startup/Stop/termination and restored complete/stopped history. The last
   request reused the completed native session before Stop; safe rebuild is now
   required. A further completed provider request after Stop, or a completed
   post-recreation native resume, would need an additional authorized request.
   Do not automatically retry or reset the counter. Local browser failure and
   the working independent-window fallback are recorded in GOTCHAS §J.
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
| AI | Enabled at prepared limits; six requests used; latest real lookup and server Stop passed, reload history restored |
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
- The smaller-payload follow-up passed lint, all 30 tests and full production
  build/type checks/standalone sanitization. Tests verify the search ceiling,
  hit locations, continued access to late entries and section pagination.
  Full CI/CD and actual revision verification passed for the follow-up; the
  origin/Docker container was healthy with AI off, exact quotas, both mounts,
  private file permissions, database integrity and verified admin preserved.
  Cache-busted public pages, account config, sanitized anonymous session, private
  chat/history/Stop rejection and retired-passcode rejection also passed.
- All six authorized real requests on the unchanged default model are used.
  Request 1 showed client Stop but DB timeout; request 2 completed search and
  citation navigation but added an unsupported bedtime condition. Request 3
  reached search/read in the prior native session after recreation, then timed
  out. Request 4 failed with rate_limited. These earlier failures are not passes.
  After the smaller-payload release, request 5 completed real search/read, saved
  usage and opened the matching section 3 entry 4 on revision `a18ee405`.
  Its answer did not repeat the unsupported bedtime cutoff direction.
  Request 6 was stopped through the UI: a bounded read-only monitor observed
  the actual SDK child, then its exit and terminal `stopped` usage. The child
  contained none of the protected server-secret variable names. Usage is now
  complete=2, failed=3, stopped=1; stopped usage is recorded. SQLite retains the
  completed answer and incomplete stopped answer, clears the native session ID
  and requires rebuild. No seventh request was issued.
- Refresh/reopen restored the completed/stopped conversation from the server.
  Model and input controls recovered; Retry was visible but not activated.
  Actual light/dark 360 x 800 screenshots were rendered and visually inspected,
  with readable messages, citations, Stop/Retry state and composer. The dark
  document width was exactly 360 px without horizontal overflow. The independent
  user-authenticated test window was restored to its original dimensions/theme
  and closed; no credentials or cookie/session-token exports were used.
  A new completed provider response after Stop remains outside this evidence.
- Guarded same-image activation at `0b766bb` passed origin/Docker health with the
  prepared 100 user/day and 2,000 global/day limits; AI remains enabled after the
  latest successful lookup/Stop checks. Release verification for this record
  must preserve that flag and the six-request count.
- The repaired image matched revision `3e2c6a1`, healthy origin and Docker health,
  exact positive quotas, loopback-only ingress, both persistent mounts, env mode
  600, DB mode 600, SDK mode 700, schema/integrity and the active verified admin.
  AI activation succeeded under guarded recreation, then was deliberately
  disabled again after the provider failure; the final AI-off recreation was
  healthy with the same image and quotas. The actual native SDK child probe
  during request 3 contained none of the protected server-secret variable names.
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
actual DKIM/SPF/DMARC message headers and other mailbox providers; a completed
provider response after Stop and completed native resume after recreation;
physical mobile keyboard; first scheduled backup run and
owner-controlled off-machine protection. A successful isolated restore proves
backup structure/data, not a live application restore or restored login flow.

## 8. Independent record inconsistencies

DESIGN §12's duplicate morphicons/omitted next-intl/Prettier claim, historical
Git/date mismatch and older superseded pipeline proposals remain separate.
DEPLOYMENT is the operational authority. Recover from live files and checks,
using historical notes as leads rather than proof.
