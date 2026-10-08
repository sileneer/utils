# Handover

**Written 2026-10-08: PR #1 merged and the verified-email account version
successfully deployed. AI remains disabled. Real owner registration and later
Agent acceptance remain outstanding. Owner-requested password-policy follow-up
is implemented and locally verified; verify its latest main CI/live revision.**

Runtime contracts: [ARCHITECTURE](ARCHITECTURE.md). Operations:
[DEPLOYMENT](DEPLOYMENT.md). Debugging: [GOTCHAS](GOTCHAS.md). Design:
[DESIGN](DESIGN.md). Decisions: [PLANNING](PLANNING.md). Replace this handover
at the next session; keep sections 2, 4 and 7 current.

## 1. Position and authorization

The owner approved the AI Chat implementation and public email accounts:
anyone may register, daily login uses email/password, registration verifies
email with a six-digit code, and old unowned chats are explicitly not migrated.
On 2026-10-08 the owner explicitly approved merging PR #1 and deploying,
with AI kept off. Do not ask these approvals again or enable AI during this release.
The subsequent owner request changes new-password requirements; its decision
is in PLANNING §11.8 and its runtime contract in ARCHITECTURE.

[PR #1](https://github.com/sileneer/utils/pull/1) was squash-merged as
`b57f458b45d3c2ab5906f86223413862350f9a19`. Its exact reviewed head was
`df2f21c9e72d9072f6d3a01375478db739a1eb78`, with all checks successful.
[Release CI/CD](https://github.com/sileneer/utils/actions/runs/37791515867)
passed test, final-image acceptance/publication and keyless IAP deployment.
Live runtime and public-route verification passed. Release evidence is in §7.

## 2. Working tree

Local `main` includes the merged account/chat implementation and this focused
password-policy follow-up: auth options/route validation, registration/reset
form validation, localized hints, auth regression tests and canonical docs.
No dependency, schema, secret or AI activation changes are included. After
committing this work, verify its full main CI/CD run and actual live revision
before ending the session. Local lint, 28 tests and full build passed.

The former submission branch is `codex/verified-email-chat`. Integration
`c14b114`, dependency-stage Docker fix `854192c` and documentation head
`df2f21c` are preserved there; PR #1 is merged, not a draft waiting for approval.
`.env.example` is the only tracked env file. Ignored `data/` contains local
QA databases/cache/evidence; do not import old JSON chats, stage these artifacts
or remove user-owned `.zcode/` files.

## 3. Implementation and operations map

ARCHITECTURE §3–8 describes verified sessions, owned SQLite chats, quotas and
restricted book tools. DESIGN §5.6–5.7 records introduced UI/dependencies.
PLANNING §10–11 records decisions. DEPLOYMENT §11 covers service configuration,
migration, explicit owner promotion, backup and restore. GOTCHAS §I–J records
native packaging and auth/preview discoveries.

The shared passcode endpoint returns 410. First signup never gains admin.
Server `.env` remains mode 600, owned by utils-deploy; no secrets were copied
locally or committed. Production compose keeps the persistent data mount and
loopback-only ingress. Cloudflare client-IP trust is explicitly authorized
and now applies in the recreated container. Preserve this ingress boundary.

## 4. Next work, in order

1. **Owner-operated real account acceptance.** Open `/register`, enter the
   intended email and a password meeting ARCHITECTURE's policy directly in the website,
   complete Turnstile if prompted, verify the received code, then explicitly
   log in and log out. Do not collect passwords or OTPs in chat. Production
   Turnstile loaded and displayed automatic widget success; the app's real
   server-side hostname/token validation awaits a submitted signup. Test reset
   mail and session revocation separately with the owner. Do not create an
   account or promote the first signup automatically.
2. **Owner bootstrap after verification.** Use DEPLOYMENT §11's admin command
   only for the explicitly designated verified, active owner account.
3. **Install backup scheduling and off-machine protection.** The backup script
   and restore procedures are prepared, not installed. Do not claim a volume
   alone protects against VM loss. Keep backups private and test restoration.
4. **Later AI acceptance and activation.** Keep `AI_ENABLED=0` under the latest
   instruction. Prepared quotas do not enable AI. Before separately authorized
   activation, execute PLANNING §10.5's bounded real SDK lookup/follow-up/resume/
   stop sequence and verify tool/ownership/quota behavior. No paid Agent call
   has been made for this account release. Preserve the default model.
5. **Physical phone keyboard/IME.** Browser emulation does not prove keyboard
   occlusion, safe-area handling or Chinese composition on a real phone.

## 5. Owner decisions and service readiness

| Item | State |
| --- | --- |
| Public signup, password login, registration OTP | Approved and deployed; real owner end-to-end flow pending |
| Old chats | Explicitly skipped |
| Domain/sender | Brevo API confirms authenticated/verified domain, active `lzhdev <noreply@auth.lzhdev.com>` and relay readiness |
| Turnstile | Real keys configured; invalid-token rejection verified; production widget loads; submitted signup/hostname success pending |
| Real diagnostic mail | Exactly one authorized Gmail test delivered; owner confirmed inbox receipt; headers not inspected |
| Env permissions/origin | Mode 600, utils-deploy; intended HTTPS origin and auth secret length verified |
| AI policy | Owner requested generous limits; initial policy in PLANNING §11.8 prepared; AI remains off |
| Merge/deploy | Explicitly approved and completed for PR #1 |
| Independent decisions | External VM IP, docs-only workflow filtering, Windows Docker and earlier “Tencent” meaning remain unresolved; do not expand this task |

## 6. Local preview and evidence handling

Regular production preview runs on loopback port 3000 from the current
application build; server credentials were not copied locally, so local account
services fail closed. The dedicated account/chat QA launchers were stopped;
they use simulated networks and are never deployed or imported by the product.
Keep screenshots outside Git in the visualization directory below.

Windows Node shims are broken. Prepend
`C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.19.0`.
Native SWC rejects sandbox cache ownership; approved host-context builds work.
No Docker exists locally, and registered WSL Ubuntu failed to start with
insufficient system resources. Do not alter ACLs or build on the 1 GB VM.

## 7. Verification state

**Passed:**

- Password-policy follow-up: local lint, 28 tests and full production build/
  type-check/static generation/standalone sanitization passed. Tests prove an
  eight-character letter/digit password registers and logs in, an eight-character
  reset password (including a symbol) succeeds and revokes the old session;
  short/missing-letter/missing-digit/overlong/non-string inputs are rejected
  for signup/reset before mail or account side effects. Invalid reset passwords
  do not consume the valid reset OTP. Production acceptance must use this
  follow-up's exact revision. Prior initial-release CI passed its 27-test suite.
- Full PR image acceptance at `854192c` and exact head `df2f21c`; original
  dependency toolchain failure is fixed (GOTCHAS §J). Release CI ran the same
  complete image/startup/migration/persistence/backup-restore gate before publishing.
- Actual release container revision matched `b57f458`, was running and healthy,
  retained `/opt/utils/data` at `/app/data`, and had `AI_ENABLED=0` and intended
  origin/client-IP configuration. Database migrations 001/002 applied;
  SQLite 3.53.4, WAL, mode 600, integrity ok, zero foreign-key errors. At initial
  live acceptance there were zero users and zero AI-usage records. Deployment
  health passed at check 4/30; ephemeral-key cleanup job succeeded.
- Cache-busted public `/`, `/htlb`, login/register/verify/reset pages returned
  200. Health ok; auth-config available with real public site key; auth-config
  and session no-store. Anonymous session sanitized; private history/chat 401,
  retired passcode 410, forbidden framework GET 404; old-style cookie did not
  authenticate. Evidence: ignored `data/investigation/production-release.json`.
- Production login and registration were inspected at 360 px in light/dark;
  English and Chinese sampled. Compact real Turnstile fits and displayed
  automatic client-widget success without agent interaction. No registration,
  password, code or CAPTCHA submission was performed by the agent. Earlier
  isolated UI flow also covered signup/verify/login/reader/logout with mocked
  mail/CAPTCHA; earlier chat screenshots at 360/768/1280 used simulated answers.
- Real auth/SQLite tests include OTP expiry/attempt/rotation/single-use/races,
  password login, reset revocation, session cookies, cross-user isolation,
  origin/route restrictions, persistent limits/atomic quotas, migrations and
  coherent backup restore. SDK-tool/environment restrictions were mocked;
  Linux image smoke executed the SDK binary offline, not an AI query.
- Earlier 34-section source hashes matched upstream
  `e73cb638b27f12a422546e5c09cadcac6fce03fe`; ignored source-parity receipt retained.
- One authorized Brevo diagnostic returned 201 and matching delivered event;
  owner confirmed Gmail inbox. Protected idempotent receipt is
  `/opt/utils/mail-acceptance/gmail-20261008.json`, mode 600 in a 700 ops directory.
  Do not resend this diagnostic automatically or publish its recipient.

Screenshots: `C:\Users\elvis\.codex\visualizations\2026\10\07\01a11742-72fa-7913-b98f-70e25820f214`,
`production-*.jpg` for actual deployed UI; `auth-*.jpg` and `chat-new-*.jpg` for
previous simulated local acceptance.

**Still unverified:** full production signup/OTP/login/reset and server-side
successful Turnstile hostname validation; actual DKIM/SPF/DMARC message headers;
other mailbox providers; real paid SDK/Agent sequence; physical mobile keyboard;
installed backup scheduler/off-machine copies. These remain explicit acceptance
work, not proof inferred from a green deploy or a diagnostic email.

## 8. Independent record inconsistencies

DESIGN §12's duplicate morphicons/omitted next-intl/Prettier claim, historical
Git/date mismatch and older superseded pipeline proposals remain separate.
DEPLOYMENT is the operational authority. This task did not open or copy the
previously mentioned credential in an external unversioned note. Recover from
live files and current checks, using prior notes as leads rather than proof.
