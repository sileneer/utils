# Handover

**Updated 2026-10-15 for the locally implemented PLANNING §14 batches A, B, C1, C2,
the §14.7 security activity record and the §14.7 TOTP second factor.**
The full account/UI acceptance below is dated **2026-10-09**; the
documentation release
uses normal CI/CD and read-only revision/health checks, with separate evidence. Runtime contracts:
[ARCHITECTURE](ARCHITECTURE.md); operations: [DEPLOYMENT](DEPLOYMENT.md);
UI: [DESIGN](DESIGN.md); decisions: [PLANNING](PLANNING.md) §11–13; improvement plan
and batch results: [PLANNING](PLANNING.md) §14.

## 1. Authorization

The owner approved and completed account/chat improvements, runtime AI config
publication and site-wide accounts (PR #7 A+B+C plus D). Those approvals remain
settled. The owner subsequently approved merging the documentation into main
on 2026-10-11, including its normal push-to-main CI/CD rollout. This does not
authorize provider calls or new features. On 2026-10-13 the owner authorized
**local implementation of PLANNING §14 batch A**, and on 2026-10-14
**local implementation of batch B** (account preferences plus the personal usage
overview), **local implementation and isolated verification of C2** (personal
data export) and **local technical verification, protocol design, implementation
and simulated acceptance of C1** (secure email change). On 2026-10-14 the owner also
authorized **local implementation of the minimal security activity record from
PLANNING §14.7** and **local design, implementation and full recovery acceptance of the
§14.7 TOTP second factor**. None of these approvals
covers D, and none covers publication. Batches A, B, C2, C1, the activity record and
TOTP are
implemented locally and unmerged; production still runs the §13 release. **No production
account has two-factor enabled**, and enabling it for the owner account is separately
unapproved. Exporting production
data, account deletion, changing a real account's email, real mail sending and paid
AI calls remain unapproved. Off-machine backup uploads and
pruning remain unapproved. Paid acceptance allowance/limits are in §4/§7.

## 2. Checkout and release position

Current local branch: `codex/account-improvement-plan-20261013`, based on `e209d59`
(the PR #8 squash merge). The checkout started clean.

**Batch A is committed locally as `058ca4c`**
(`feat(auth): clarify account operations and failure recovery`):
`src/components/auth/` (`account-center`, `account-form`, `account-menu`,
`account-provider`, new `password-field`), `src/app/login/page.tsx`,
`src/lib/auth/` (`events`, `navigation`, new `errors`), both `messages/*.json`,
`tests/account.test.cjs`, `tests/auth-preview.cjs` and four docs. It changed no
dependency, schema, migration, env, Docker or CI file, and no server-side auth
handler, so the ARCHITECTURE §5 server contract was unchanged.

**Batch B is committed locally as `1b648ed`**
(`feat(auth): add account preferences and a personal usage overview`): new
`migrations/004-account-preferences.sql`, `src/lib/auth/preferences.ts`,
`src/lib/theme-device.ts` and `src/lib/unsaved.ts`, plus edits to
`account-center`, `account-provider`, `account-handler`, `errors`,
`i18n/locale.ts`, `theme-provider`, `theme-toggle`, `language-switcher`, both
`messages/*.json`, the docs, and two migration-count assertions.

**Batch C2 is committed locally as `4c14e7d`**
(`feat(auth): add personal data export`): new `src/lib/auth/export.ts` and
`tests/export.test.cjs`, plus edits to `account-handler`, `account-center`, both
`messages/*.json` and the four docs. It adds no migration, dependency, env, Docker or
CI change, and touches no server-side auth handler beyond the account wrapper's own
routing.

**Batch C1 is committed locally as `4d08dec`** (`feat(auth): add secure email change`):
new `migrations/005-email-change.sql`, `src/lib/auth/email-change.ts`,
`src/lib/auth/turnstile.ts`, `src/components/auth/challenge.tsx` and
`tests/email-change.test.cjs`, plus edits to `account-center`, `account-form`,
`account-handler`, `account-provider`, `errors`, `handler`, `mail`, both
`messages/*.json`, the four docs and two migration-count assertions (now derived from
the `migrations/` directory instead of a literal). It changes no dependency, env,
Docker or CI file, does not widen the `/api/auth` allowlist and does not configure the
library's `changeEmail`. It does alter the **shared** `Challenge` component and the
extracted Turnstile verification helper used by the public login/register/reset forms,
so those paths are regression-covered by `tests/account.test.cjs` and
`tests/auth.test.cjs` rather than left untouched. Nothing was pushed, merged,
deployed or production-tested for any batch. Existing ignored `.zcode/`, data and investigations
are preserved. Planning notes and fixture evidence for all five passes (disposable databases,
generated-credential seeding, fault-injection launchers, generated export artefacts and
screenshots) live under ignored `data/investigation/account-plan-20261013/`,
`data/investigation/account-batch-a-20261013/`,
`data/investigation/account-batch-b-20261014/`,
`data/investigation/account-c2-20261014/` and
`data/investigation/account-c1-20261014/` and
`data/investigation/account-activity-20261014/`. Generated fixture credentials are
deleted after each QA pass.

**The §14.7 minimal security activity record is committed locally as `1590981`**
(`feat(auth): record confirmed security changes`), on top of `4d08dec`: new
`migrations/006-security-events.sql`, `src/lib/auth/security-events.ts` and
`tests/security-events.test.cjs`, plus edits to `account-handler.ts`,
`email-change.ts`, `account-center.tsx`, both `messages/*.json` and the five docs. It
adds no dependency, env, Docker or CI change, does not widen the `/api/auth` allowlist,
and changes no existing table.

**The §14.7 TOTP second factor is committed locally as `PENDING`**
(`feat(auth): add a TOTP second factor`), on top of `1590981`: new
`migrations/007-two-factor.sql`, `src/lib/auth/two-factor.ts`,
`src/lib/auth/two-factor-handler.ts`, `src/app/api/2fa/[...action]/route.ts` and
`tests/two-factor.test.cjs`, plus edits to `options.mjs` (the plugin itself),
`handler.ts` (sign-in now reports `twoFactorRequired`), `account-handler.ts`,
`account-center.tsx`, `account-form.tsx`, `account-provider.tsx`, `errors.ts`, both
`messages/*.json` and the four docs. It adds no dependency and no env change, and it
does **not** widen the `/api/auth` allowlist: every `/two-factor/*` library path stays
unreachable from a browser, and the only second-factor surfaces are the new
`/api/2fa/verify`, `/api/2fa/recovery` and the four `/api/account/2fa/*` wrapper routes.
`007-two-factor.sql` is generated verbatim from the locked plugin and is purely additive
(`user.twoFactorEnabled` default 0 plus the `twoFactor` table and its two indexes), so
existing accounts are untouched and rollback needs no data restore. Nothing was pushed,
merged or deployed, and no production account has two-factor enabled.

PLANNING section 14 remains the canonical home for the improvement plan; §14.9,
§14.10, §14.11, §14.12, §14.13 and §14.14 record what batches A, B, C2, C1, the
activity record and the TOTP second factor actually changed.
ARCHITECTURE §5/§7/§8 and DESIGN
§5.10–§5.15 describe the implemented client contract (section anchors, the
`reauth=1` copy variant, safe error codes and their per-section mapping in
`src/lib/auth/errors.ts`, the two-layer theme keys, the preference priority, the
personal usage wrapper, the export document contract, the two-code email-change
protocol, the desensitized security event vocabulary with its retention window, and the
two-factor invariant, challenge surface, recovery-code rules and the
`BETTER_AUTH_SECRET` stability requirement).

[Documentation PR #8](https://github.com/sileneer/utils/pull/8) publishes the
shared agent instructions and living-doc refresh, based on `70f5a78`, to `main`.
Only documentation changes: no application, dependency, schema or env changes.
The owner approved publication after reviewing the local commit `ded6a1d`.
The exact accepted PR head, merge/deploy run and actual running revision/health
are recorded in ignored `data/investigation/docs-maintenance-20261011/release-receipt.json`.
Verify that receipt and GitHub status before treating the release as complete;
a merge alone is not deployment evidence. Private QA files remain ignored;
the owner-deleted mistaken-task investigation is excluded.

[PR #7](https://github.com/sileneer/utils/pull/7) passed exact-head gates at
`15e43fd` and squash-merged as `98f6149`. Feature deployment run
[37998131093](https://github.com/sileneer/utils/actions/runs/37998131093) passed.
The final acceptance-doc revision `70f5a78` passed test/image/deploy in
[37999098351](https://github.com/sileneer/utils/actions/runs/37999098351).
This run/PR status was rechecked on 2026-10-11; actual runtime/data/UI acceptance
was last performed on 2026-10-09. Do not infer today's host state from CI alone.

Private dated proofs: ignored `data/investigation/site-account/review-receipt.json`
and `release-receipt.json`. This maintenance's plan/checks live in ignored
`data/investigation/docs-maintenance-20261011/`. Never commit databases, book cache,
browser/session evidence, screenshots, `.env` or owner-owned agent files.

## 3. Canonical implementation map

- ARCHITECTURE §3 owns agent tools/SSE/message details; §5 owns public accounts,
  ownership, safe return paths, security lifecycle, preference/usage wrappers, the
  personal export contract, the two-code email-change protocol, the security activity
  record, the TOTP second factor and future-module integration; §7 owns locale
  resolution; §8 owns runtime provider/env config, including the
  `BETTER_AUTH_SECRET` stability requirement; §10 owns administrator aggregates.
- DESIGN §5.6–5.15 owns chat/source/account/admin patterns, the batch A
  account-operations clarifications, the batch B preferences/usage-card
  patterns, the C2 export card, the C1 email-change card, the security
  activity card and the two-factor enrolment/challenge/recovery card. Account forms use
  registered primitives; there
  is no adopted `ui/form` component, and `ui/select` is now used for the preference
  and export-scope choices.
- DEPLOYMENT §8/§11–12 owns release checks, service setup and backup operations.
- PLANNING §11–14 owns decisions, deferred account features and the §14
  improvement plan with its batch A/B/C1/C2 and security-activity implementation
  results. GOTCHAS owns
  debugging lessons. AGENTS is the shared rulebook; CLAUDE imports it.

## 4. Next actions

Batches A, B, C2 and C1 are implemented locally (§2, PLANNING
§14.9/§14.10/§14.11/§14.12) and await the owner's review and a separate publication
decision; nothing may be merged or deployed on this authorization. Batches A, B, C2
and C1 are committed, C1 as `4d08dec`. The §14.7 minimal security activity record is
committed on top of it as `1590981` (§2, PLANNING §14.13), and the §14.7 TOTP second
factor as `PENDING` (§2, PLANNING §14.14). D remains an
unapproved proposal in §14. Do not
start new features or publish any batch without subsequent authorization.

Two-factor leaves the deliberate open items that this authorization could not cover:

- **No real device or real authenticator app was used.** Every code in the browser pass
  was computed in-page from the base32 setup key the card displays (base32-decode, then
  HMAC-SHA1 over those bytes — the same construction the locked library verifies with),
  which proves the displayed key yields codes the server accepts, but not that a specific
  phone app does. On-device enrolment, its keyboard/IME behaviour and password-manager
  autofill of `one-time-code` remain to be accepted by the owner on real hardware.
- **Enabling two-factor for the owner's own production account is unapproved and has not
  been done**, and it should not be done from an agent session: the owner types the
  password and codes on the site, and the consequence (losing the device *and* every
  recovery code has no self-service or support path) deserves a deliberate first run.
- `BETTER_AUTH_SECRET` is now key material, not a regenerable value: it encrypts stored
  TOTP secrets and recovery codes, so rotating it would leave every two-factor user
  unable to complete sign-in. Any future key-rotation procedure must be designed before
  the value changes (ARCHITECTURE §8).

C1 leaves one deliberate open item: **real mail delivery for the three
`change-email*` purposes has never been exercised** — this authorization covered
simulated acceptance only, and the Brevo adapter is unchanged apart from the new
purposes. Before any publication, a separately scoped check should confirm that a
code reaches a real old and a real new mailbox, that the two subjects and bodies read
correctly to a human, and that the retired-address notice arrives; the loopback pass
could only inspect the request bodies the fixture intercepted.

The batch B visual gap noted here earlier is now largely closed, and two of its open
questions were settled during the C2 pass:

- The in-app Browser surface became available again, so the account page — which
  carries batch B's preferences and usage cards — was measured across all twelve
  locale × theme × width combinations **with the applied theme class asserted on
  every run**, and full-page images were captured and read.
- Keyboard operation of the `ui/select` triggers works: Enter opened the listbox,
  ArrowDown plus Enter chose an option, the dependent download links updated and a
  visible focus ring remained. The earlier "could not be opened" result was an
  artefact of the hidden surface, not a defect.
- **Correction to the batch B record in §7:** that matrix drove the theme through the
  `theme` localStorage key, which batch B itself retired in favour of
  `utils_theme_device`/`utils_theme_applied`. Its light/dark axis therefore did not
  test what it claimed. It has been re-measured for C2 with per-run class
  assertions; the batch B numbers should be read from the C2 entry, not the B one.
  Per-combination image review of batch B's two cards at 768px and in the remaining
  locale/theme pairs is still open visual QA.

Two batch A follow-ups are recorded rather than silently fixed, because they sit
outside the approved scope: the registration page still shows the signed-in hint
worded for re-login ("Continue, or enter your password again to refresh your
login") even though that form creates a new account, and every login session row
uses the desktop monitor glyph including inferred mobile browsers. Neither is a
security defect.

No publication decision remains pending for the previous PR #7/D or documentation PR #8.
Use PR #8 and its release receipt (§2) for the documentation release outcome.
Do not trigger further main pushes merely to copy private acceptance evidence.
Independent follow-ups remain:

- Diagnose model continuation timeout before using the **five unused turns** from
  the later, separately authorized six-turn real QA allowance. Its first attempt
  timed out. The earlier original allowance was exhausted; do not mix the budgets,
  retry automatically, change models or extend limits to manufacture a pass.
- Physical phone keyboard/IME/source-return, cross-device production reset,
  long-context/source-faithfulness and mail-header acceptance remain distinct.
- Observe the next natural scheduled backup execution. Off-machine destination,
  ownership, upload and retention/pruning need separate decisions (DEPLOYMENT §12).

## 5. Last accepted production data and backup (2026-10-09)

Coherent pre-release backup: `/app/data/backups/release-20261009-site-account.sqlite`
(mode 600), created with zero active requests. Integrity/FK checks passed and all
baseline account/session/chat/message/usage/metadata rows were internally compared
and exactly preserved. Owner verification/admin role, histories, quota, model
catalog, retained source versions and persistent SDK mount were retained; private
env remained mode 600 and owned by `utils-deploy`. Existing backup script/schedule
were preserved. No DB replacement, off-machine upload or pruning occurred.
These are dated acceptance results, not current row-count/health guarantees.

## 6. QA cleanup and private evidence

The disposable port-3001 preview and both owned QA browsers were stopped/closed
at release completion. The 2026-10-13 disposable account preview and its named
QA browser were also stopped/closed after investigation. Batch A QA ran its own
loopback preview on 3001/3002 against a dedicated fixture database; before it
started, three stale `agent-browser` sessions were found still open — including
`utils-batcha` left running by the earlier batch A pass — and all three were
closed. The batch A preview process was stopped only after its command line was
read back and confirmed to be the fixture launcher, and both loopback ports were
then verified free. Its generated credential file was deleted; the disposable
database, fault-injection launcher and screenshots remain local, ignored and
unavailable in production. Two empty stray files (`k` and `{`) left at the
repository root by an earlier session's shell typo were removed. Batch B QA then
reused the same loopback pair (3001 app, 3002 fixture outbox) against its own
dedicated fixture database under `data/investigation/account-batch-b-20261014/`,
with AI configured only against a discard loopback base URL and a fixture key so no
provider is reachable; that preview was stopped and its generated credential file
deleted the same way, after its command line was read back and confirmed. Batch C2 QA
used two further dedicated fixture databases — `data/investigation/account-c2-20261014/fixture/`
to generate export artefacts without a server, and `.../ui/` for the browser pass —
and its loopback preview was likewise stopped only after verifying its command line,
with both ports then confirmed free and its credentials deleted. Batch C1 QA used a
separate fixture database under `data/investigation/account-c1-20261014/ui/` on its own
loopback pair (3011 app, 3012 fixture outbox and mail-fault switch), with AI disabled
and no provider credential, and a second disposable database per automated test file.
Its launcher processes were stopped only after their command lines were read back and
confirmed, both ports were then verified free, and the generated credential file was
deleted. Two throwaway schema-probe scripts and their `data/schema-probe*.sqlite*`
databases created earlier in the same pass were removed once they had answered the
question they were built for. The security-activity pass used a sixth dedicated fixture
database under `data/investigation/account-activity-20261014/ui/` on its own loopback
pair (3021 app, 3022 outbox and Turnstile stub); its launcher processes were stopped
only after their command lines were read back and confirmed, both ports were then
verified free with no socket left in LISTENING, and its generated credential file was
deleted. That pass also used two fixture-only helpers: one that inserts a single
`email_change` row so the masked-address line could be inspected without re-driving the
C1 flow, and one that ages or expires the run's own session row so the card's
stale-login state could be seen against the real server. Both operate only on the
throwaway database and neither deletes application data. Screenshots are
outside Git. The owner
logged in normally; no production cookies were exported, captured or minted.

The two-factor pass used a seventh dedicated fixture database under
`data/investigation/account-totp-20261014/ui/` on its own loopback pair (3023 app, 3024
outbox and Turnstile stub), with AI disabled, no provider credential and intercepted
mail/challenge. That launcher keeps a runtime-generated `auth-secret.txt` instead of
drawing a new secret each start, because the plugin encrypts the stored TOTP secret and
recovery codes with `BETTER_AUTH_SECRET` and a regenerated value would silently make the
fixture account unable to sign in — the same reason production rotation is now a designed
change rather than a fix (ARCHITECTURE §8). The launcher was stopped only after its
command line had been read back and confirmed to be the fixture launcher, both ports were
then verified free, and the fixture database, generated secret, fixture password, setup
key and issued recovery codes are deleted with it. Screenshots and the throwaway
`totp.cjs`/probe helpers stay local and ignored. No production cookie or session was
exported, captured or minted, and no production account has two-factor enabled.

## 7. Verification and limits

**Previous feature/release acceptance (2026-10-09):** 75 regressions, including
12 new real-library/SQLite account checks, local lint/full build/typecheck and
exact-head PR image/security gates passed. Safe identity/session projection,
wrong password/OTP and foreign-session rejection, account isolation, rotation,
cancellation timeout and stale authorization were covered.

Disposable UI QA covered registration/verification/login return path, profile,
password change, second-browser revocation, closed-reader logout, other-tab
invalidation and query preservation. Production D checked public/protected routes,
normal owner/admin account/session access, retained history/quota/model config
and home/reader/About account entries. Both locales/themes at 360px and desktop
were inspected without page overflow; live account axe reported zero violations
or incomplete checks. Local modal manual focus/keyboard/contrast checks passed.
This is browser emulation, not physical-device acceptance.

No production account mutation, real mail or paid AI call was made for PR #7/D.
Account publication does not close independent model-quality acceptance: the later
real QA attempt timed out after successful retrieval before final answer/token
result. Source fidelity, unsupported-condition and long-context checks remain
unpassed; continuation cause is unresolved (GOTCHAS §C).

**Previous documentation maintenance (2026-10-11):** source/package contracts and
GitHub release status reconciled; obsolete provider/form/activation instructions
and duplicate documentation corrected. All 50 relative links, 13 anchors and
20 route source paths passed checks; `git diff --check` and the full production
build/typecheck/standalone sanitization passed. Default `npm run lint` failed on
18 CommonJS import errors in existing ignored private QA helpers; the application
source lint with `data/**` excluded passed (GOTCHAS §F). This is not a claim that
the default local scan passed. Feature tests were not rerun for docs-only changes.
Those local checks preceded the publication approval. PR #8 clean-checkout
lint/tests/image gates and the normal deployment must pass; dated release
results and read-only runtime/health checks live in the private receipt (§2).
No new full account/browser acceptance, credential mutation or paid AI QA is
part of this documentation publication.

**Planning baseline investigation (2026-10-13, superseded by the implementation
record below):** source/routes/translations and prior deferred scope reconciled
against `e209d59`. A fresh full production build/typecheck/standalone sanitization
passed with the installed Node 24.19.0. The first sandboxed attempt failed on SWC
cache ownership; the normal-host build passed without dependency/config changes.
Default `npm run lint` failed with 19 pre-existing CommonJS-import errors in
ignored private QA helpers; application lint with `data/**` excluded passed. A
loopback fixture database with intercepted mail/challenge and AI disabled showed
eight account layouts free of horizontal overflow, and the >24h path, a successful
normal password reauthentication and a cancelled single-session revoke dialog were
observed. The reauthentication path works; its signed-in return option and normal
form were the confusing part, not an authentication defect.

**Batch A local implementation verification (2026-10-13):** 80 regressions pass,
including one new account file case proving verification and password-reset codes
are isolated by purpose, that a consumed reset code cannot be replayed, and that
each purpose rejects the other's code; plus the previously added stale-target 404,
batch-revocation scope, per-account/per-path rate limiting and per-section error
mapping checks. `npm run build` (typecheck + standalone sanitization) exits 0 and
`npx eslint src` is clean. Default `npm run lint` still fails with the same 19
pre-existing CommonJS-import errors in six ignored `data/investigation/**` private
QA helpers — unchanged in count and location, and none from this work; the new
fixture helpers carry the same `require` disable header the existing ones use, so
they add nothing. This is reported as two separate results, not a default-lint pass.

Browser QA used a fresh loopback-only fixture database, runtime-generated
credentials, intercepted mail/challenge and AI disabled; no production account,
cookie, session or data was touched. Verified in the running UI: summary card with
anchors and back-to-site; profile clean/dirty/saving/saved states with trim
comparison and no request when unchanged; a same-frame triple click now issuing one
write instead of three; cross-tab rename raising a conflict through a real
`storage` event while the local draft survives, with both resolutions working;
password form collapsed by default, focusing the first field on open, show/hide with
`aria-pressed` and a 40px target, and the Caps Lock hint appearing only for a key
event reporting the modifier and clearing on blur; wrong password, rate limiting
(429 `rate_limited`), and an injected transport failure each producing distinct
copy, with the unconfirmed case re-reading account/session state and never claiming
success or retrying the write; session counts, current-first ordering, three
same-browser rows carrying distinguishable accessible names, single/batch dialogs
with their own scope wording, focus returning to the initiating button on cancel and
Escape and to the section heading after a confirmed revoke, a stale target reported
as already signed out rather than a password error, and a successful password change
revoking the other six sessions while the current one stayed signed in; the >24h
state offering in-place re-verification from both the password and sessions
sections, the `reauth=1` login variant with its own title/description/action and no
competing "continue" affordance, and the return landing on `#security` with the
alert gone; a fully invalidated identity clearing the private list and offering
plain login; an injected account-service failure preserving the known identity with
a working retry; registration surviving an injected mail failure with
purpose-correct guidance and completing through resend plus verification; a reset
second step with a read-only address, a start-over that drops the old code and
password, and an injected challenge-verification failure returning to step one with
its own message.

Twelve combinations (en/zh × light/dark × 360/768/1280px) rendered with a 78-character
mixed-script display name and a long address: no horizontal overflow and no
interactive target below 40px in any of them. Screenshots were captured and
inspected as images, not only measured: zh/light/360 full page, en/dark/1280 full
page, en/light/360 with the password form expanded and the Caps Lock hint shown,
and zh/dark/360 with the batch-revoke dialog open. axe-core 4.10.2 reported zero
violations and zero incomplete checks on the account page and on the expanded
security panel; the open dialog reported one `color-contrast` *incomplete* (axe
cannot composite the translucent backdrop), resolved by direct measurement —
title 15.6:1, body 6.27:1, primary action 8.18:1, page helper text 6.27:1. Real Tab
keys moved focus input → show/hide → cancel inside the trap with a visible focus
ring, and Escape restored the initiating control.

Limits of this record: all widths and the mobile rows are browser emulation inside
a same-origin frame, not a physical phone, so on-device keyboard/IME behaviour is
unverified. The Caps Lock and transport-failure paths were driven by a genuine
dispatched key event and an injected `fetch` rejection respectively, not by a
hardware modifier key or a real network cut. The Turnstile widget's expired and
script-load-failure states could not be injected without network interception, so
their rendering is code-verified only; the always-passing Cloudflare test key and
the injected siteverify failure were exercised for real. No real mail was sent and
no paid AI call was made — both allowances and the outstanding items in §4 are
unchanged. Nothing here is production or deployment acceptance.

**Batch B local implementation verification (2026-10-14):** 90 regressions pass,
including 10 new cases in `tests/preferences.test.cjs` on a dedicated isolated
database: preferences are absent until explicitly saved and both-null clears
remove the row; writes reject bad enums, empty bodies, foreign origins and any
attempt to submit `role`, `status`, `email`, `emailVerified` or another `userId`;
a login older than 24 hours keeps preferences and usage while session listing still
returns 403; two accounts cannot see or overwrite each other's choices; anonymous
reads are 401; an inactive account loses its presentation layer and regains it when
reactivated; AI-off reports `service: disabled` with `limit: 0` rather than a spent
quota; the usage projection reuses the existing settlement rules exactly (today's
complete/failed/stopped count, `released` excluded, yesterday excluded, other owner
isolated, UTC-day reset, and only the six known fields); preference writes are rate
limited per account and path without corrupting stored state; and re-running
migrations is repeatable while preserving every user, account, session,
verification, conversation, message, usage and preference row. Two existing
migration-count assertions moved from 3 to 4 because of the new migration.
`npm run build` (typecheck + standalone sanitization) exits 0 and `npx eslint src`
is clean. Default `npm run lint` still fails with the same 19 pre-existing
CommonJS-import errors in six ignored `data/investigation/**` private QA helpers —
unchanged in count and location, none from this work, and the new fixture helpers
carry the same `require` disable header the existing ones use. This is reported as
two separate results, not a default-lint pass.

Browser QA ran against a fresh loopback fixture database with runtime-generated
credentials, intercepted mail/challenge and AI configured only against a discard
loopback base URL, so no provider could be reached. Verified in the running UI:
saving theme `dark` from the account centre applied it while leaving
`utils_theme_device` untouched; the header theme control then recorded `light` on
the device, kept the account value applied, and named the active override in its
menu instead of silently doing nothing; saving language `zh` while the profile
nickname held an unsaved draft did **not** reload, preserved the draft and said the
change applies on the next reload; after a reload the document rendered Chinese
(`zh-CN`) with the device cookie still `en`; a second same-origin document that
saved `light` was adopted by the first without a reload (applied class, stored
value and the other tab's trigger all followed) while an in-progress local edit in
the first document survived a later external save; a fresh account with no saved
choices signed in without uploading anything and kept the device layer; logging out
restored the independent device theme and, on the next navigation, the device
language, so neither account value leaked. The usage card loaded lazily on first
expand and reported 2 of 5 remaining from seeded rows (a `released` row and a
yesterday row correctly excluded), the reset instant with its local time-zone label,
the existing request-count scope note and a reader link; an injected 503 produced a
card-only message with a working retry while identity, profile, sessions and
preferences all stayed usable; an injected `enabled: false` payload read "AI is
currently switched off for everyone", not a spent quota, and showed no counts.
axe-core 4.10.2 reported zero violations and zero incomplete checks on the account
page with the usage card expanded and both selects present. Twelve combinations
(en/zh × light/dark × 360/768/1280px) rendered with no horizontal overflow and no
interactive target below 40px.

Limits of this batch B record: **the screenshot review required by AGENTS "Definition
of done" 3 did not happen** — the in-app Browser surface reported
`visibilityState=hidden` with no positive viewport, so `take_screenshot` was
refused; the `agent-browser` CLI stalled again as in batch A. Layout was therefore
verified by measured geometry inside a same-origin frame, not by looking at images,
and the keyboard opening of the new `ui/select` triggers could not be confirmed
(synthetic Enter/Space did not reach Radix on the hidden surface, which does not by
itself indicate a defect). Re-run the visual pass with a visible browser surface
before accepting this batch. Widths remain browser emulation, not a physical device.
No real mail, no provider call and no production access occurred; both paid AI
allowances are unchanged. Nothing here is production or deployment acceptance.

**Superseded part of the batch B record:** its twelve-combination matrix set
`localStorage.theme`, a key batch B itself retired in favour of
`utils_theme_device`/`utils_theme_applied`, so the light/dark axis of that particular
run did not exercise what it claimed. The overflow and 40px-target numbers stand (they
were measured on the actually rendered page), but the theme split should be taken from
the C2 re-measurement below, which asserts the applied class on every run. The two
things this entry called unverified — screenshot review and `ui/select` keyboard
operation — were both completed during the C2 pass and are recorded there.

**Batch C2 local implementation verification (2026-10-14):** 100 regressions pass,
including 10 new cases in `tests/export.test.cjs` on a dedicated isolated database:
anonymous export is 401 and a login older than 24 hours is `reauth_required` on both
endpoints while session listing keeps the same gate; the whole query surface is
rejected before any SQL for an unknown parameter, a bad format, a non-UUID
conversation, a malformed or inverted date range, or combining a conversation with a
range; an account with no conversations still exports its profile; the document
carries scope, counts, completeness, limits and the explicit exclusion list; a
conversation owned by somebody else is `not_found` and another account's titles,
content and address never appear; **the serialized body is checked against the real
stored values** — the credential hash, the live session token, the current OTP, the
provider and auth secrets, the native SDK session id and the raw `usage_json` column —
and none of them appears in either format; a turn left `streaming` with no owning live
query is reported as `failed`/`interrupted` rather than complete, a genuinely released
reservation keeps its own status, and a turn with no usage row yields no token figures
at all; exceeding the conversation ceiling returns 413 with a `too_large` summary and
**no** `Content-Disposition`, while narrowing to one conversation or one month
produces a complete document whose stated scope matches exactly what it contains;
responses are `no-store`, `vary: Cookie` and attachment-named with a date only; and a
table-by-table snapshot before and after exporting, and again after re-running
migrations, is unchanged. `npm run build` exits 0 and `npx eslint src` is clean.
Default `npm run lint` still fails with the same 19 pre-existing CommonJS-import
errors in six ignored `data/investigation/**` private QA helpers — unchanged in count
and location, none from this work. Reported as two separate results, not a
default-lint pass.

Artefacts were generated for a person to read, not only to assert on: three seeded
accounts (one with a mixed-script conversation, one archived needing rebuild, one
failed turn with empty content, one released reservation, and a control account whose
data must not appear) produced a summary, a full JSON export, a full Markdown export,
a single-conversation Markdown export, a second account's JSON and an empty-account
JSON under ignored `data/investigation/account-c2-20261014/artifacts/`. The Markdown
and the JSON structure, counts, ordering, scope statements and exclusion footer were
read directly. Reading the Markdown found a real defect the assertions had missed: the
pinned-source-context line failed to close its inline code span and leaked a stray
quote character; it is fixed and now asserted.

Browser QA used a fresh loopback fixture database with runtime-generated credentials,
intercepted mail and AI disabled. Verified in the running UI: the export card is
collapsed by default and loads its summary on first expand, reporting 2 conversations,
4 messages and 2 usage records with the activity span; narrowing to one conversation
rewrites both download links to carry that id, disables the date fields through their
fieldset with an explanatory line, and the fetched document reports
`scope.kind: conversation` with exactly that conversation; clearing the narrowing and
choosing a UTC month range instead produces `scope.kind: dateRange` selecting only the
archived September conversation; the privacy note states the no-store, non-shareable,
non-storage and exclusion guarantees. Twelve combinations (en/zh × light/dark ×
360/768/1280px) rendered the expanded card with no horizontal overflow and no
interactive target below 40px, **with the applied `dark`/`light` class asserted on
every run** after the batch B key mistake was found; page geometry was identical
between themes. Three images were captured and read: the en/light/360 expanded card
(head and lower half) and a full-page zh/dark/1280 of the whole account centre.
axe-core 4.10.2 reported zero violations and zero incomplete checks on the account page
and on the export card alone. Keyboard operation of the `ui/select` triggers was
confirmed with real keys: Enter opened the listbox, ArrowDown and Enter selected an
option, the download links updated and `:focus-visible` kept a visible outline.

Limits of this C2 record: the over-limit 413 path and the suggested-segment buttons
were exercised by regression tests, not by rendering an account above the ceiling in
the browser; the browser pass used a two-conversation fixture. Widths remain
same-origin-frame browser emulation, not a physical device, and downloads were
verified by fetching the exact link URLs the card renders rather than by inspecting
files in the browser's download manager. No production data was exported, no real mail
was sent and no paid AI call was made; both allowances are unchanged. Nothing here is
production or deployment acceptance.

**Batch C1 local implementation verification (2026-10-14):** `npm test` runs 118
cases across eight files, all passing, including 18 new
`tests/email-change.test.cjs` cases on a dedicated disposable database with an
intercepted mail outbox. They cover: two purpose-scoped codes issued to the right
mailboxes and never crossed; a started transaction leaving address, sessions and
history untouched; a confirmed pair rewriting only the address while preserving
`user.id`, role, status, name, createdAt, conversation/message/usage ownership and
signing out every session; single-use consumption (a replay is refused because the
committing session is itself revoked); swapped and half-present code pairs; the
fifth wrong code closing the budget with its own cause and correct codes then failing
to revive it; expiry closing the transaction; cross-account refusal of
resend/cancel/verify plus `stale_target` when the signing-in address moves behind the
request; exactly one live transaction per account and an identical generic answer when
the target is already held; a target registered between start and commit aborting as
`email_taken` with sessions intact; per-side resend rotation; idempotent cancel; a
failed send leaving no confirmable transaction; an unconfirmed AI stop returning 409
with the address and sessions unchanged and the transaction retryable; a notification
failure reported apart from the committed change; the password/fresh-session/challenge
prerequisites; and the change-email mail family exhausting its own budget while the
password-reset reserve still answers. Codes are asserted absent from the database.

Browser QA used a fresh loopback fixture database (ports 3011/3012), runtime-generated
credentials, intercepted mail with a switchable send fault, AI disabled and no provider
credential. Verified in the running UI: the card is collapsed by default and joins the
summary navigation; the idle form states the two-code rule and the old-mailbox
limitation; a started transaction shows the masked target, a live countdown, per-slot
attempt counts, resend, cancel and the two code fields; a wrong code reports its own
cause and decrements only that slot's budget while the draft is kept; the commit dialog
names the sign-out consequence; a successful commit replaces the signed-in page with
the new address, the all-sessions-signed-out explanation and login as the only next
step, and signing in with the new address then works. A cancelled request returns the
card to the idle form; a send failure reports "email could not be sent, address
unchanged"; a target already held by another account is accepted generically at start
and only refused at commit with the account untouched; an expired request falls back to
the form with its own wording. Twelve combinations (en/zh × light/dark ×
360/768/1280px) rendered the expanded card with **the applied `dark`/`light` class and
`html[lang]` asserted on every run**, no horizontal overflow and no interactive target
below 40px; four images were captured and read (en/light/360, en/light/1280,
zh/dark/360, en/dark/1280) plus the expired-state capture. Real Tab moved focus from
the trigger into the password field with a visible `:focus-visible` ring.

Three defects were found only in the browser and fixed: the shared `Challenge` widget
never left "loading" inside a collapsed card (§GOTCHAS "A lazy script tag never reports
ready"); the pending panel had no challenge of its own, so every resend was refused
with 403; and the trigger's masked-address badge overlapped its label at 360px. The
client resend cooldown was also aligned to the server's per-minute bucket.

Limits of this C1 record: **real mail delivery was not exercised** — the fixture
intercepts Brevo, so only the request bodies and the recorded purposes/codes were
inspected, and no message was ever delivered to a real mailbox. The Cloudflare widget
could not complete in this sandbox (its challenge endpoint is unreachable here), so the
browser pass substituted a loopback stub for `api.js`'s `render()` contract while the
server still verified every submitted token through the intercepted `siteverify` call;
the widget's own loading/expired/failed states remain as batch A recorded them on the
auth forms. Widths are same-origin-frame emulation, not a physical device. The
unconfirmed-stop path was driven with a local active-query stub under a shortened
timeout, not with a paid provider request. No production account's address was
changed, no real mail was sent and no paid AI call was made; both allowances are
unchanged. Nothing here is production or deployment acceptance.

**Security activity local implementation verification (2026-10-14):** 130 regressions
pass across nine files, all green, including 12 new `tests/security-events.test.cjs`
cases on their own disposable database. They cover: an account with three live sessions
and no operations having an empty list, so nothing is inferred from sessions; a refused
password change writing nothing and a confirmed one writing exactly one event with no
second revocation row (and that the caller stays signed in on a rotated session);
single versus batch revocation as distinct kinds carrying the real affected count, a
retry against a gone target writing nothing, and a zero-affected batch writing nothing
even though the call itself succeeds; the current session refusing to be revoked without
producing an event; an email change recording once with a masked target and never the
plaintext address, while a wrong code, an unconfirmed AI stop and an `email_taken`
collision all record nothing and leave the account and its sessions untouched; a sweep
of the whole table for the run's password, every issued code, every live session token,
both raw User-Agent strings and the unmasked target, all absent; retention hiding an
expired row and pruning it on the next write; the 100-row cap keeping the newest entries
while leaving another account's rows alone; two accounts reading only their own events
with seven different scope-widening or `admin=true` query strings all returning the
caller's own rows; the read refusing anonymous callers and a 25-hour-old login; and the
`kind` vocabulary being closed both by the writer and by the table's CHECK constraint.

Browser QA used a fresh loopback fixture database (3021 app, 3022 outbox and Turnstile
stub), runtime-generated credentials, intercepted mail and AI disabled. Verified in the
running UI: the card is collapsed by default and joins the summary navigation; the empty
state says "no recorded activity yet" with the explicit note that earlier operations are
not shown, while the same account's session card still lists live sessions — the two
claims stay separate; after real operations performed through the forms (a password
change, a single revocation and a batch revocation, each confirmed through its dialog
with the current password) the list shows every kind with its local time and zone label,
the inferred device, the batch's session count and the masked new address; the trigger
reports the entry count; the stale-login state renders the re-verification alert pointing
at `/login?returnTo=/account#activity&reauth=1` and shows no rows. Twelve combinations
(en/zh × light/dark × 360/768/1280px) rendered the expanded card with **the applied
`dark`/`light` class and `html[lang]` asserted on every run**, no horizontal overflow and
no interactive target below 40px; four images were captured and read (en/light/360,
zh/light/360, en/light/1280 desktop list, zh/dark/1280) plus the empty and stale-login
states. Real Tab moved focus from the trigger to the reload button with a visible
`:focus-visible` ring, and the accessibility tree exposes the trigger as
`expandable expanded` with an accessible name including the count.

One defect was found only in the browser and fixed: the card's timestamp formatter
combined `dateStyle`/`timeStyle` with `timeZoneName`, which Chrome rejects, and because
it threw during render it took the whole account page down to the error boundary — see
GOTCHAS "dateStyle cannot be combined with timeZoneName".

Limits of this record: the card's **network-failure branch was not visually confirmed** —
the attempt to intercept that one request from the page did not take effect, and
re-entering the fixture password to re-establish a session was declined, so that alert
and its retry button are covered by code inspection and by the identical shipped pattern
on the usage and export cards, not by a screenshot. The `email_change` row visible in the
browser screenshots was inserted directly into the throwaway fixture database in exactly
the shape the commit writes, so the masked-address line could be reviewed without
re-driving the C1 flow; the flow-produced row is covered by the regression tests instead.
axe-core was not re-run for this card. Widths remain same-origin-frame browser
emulation, not a physical device. No production account was touched, no real notification
mail was sent, no new-device or unusual-location detection was added, and no paid AI call
was made; both allowances are unchanged. Nothing here is production or deployment
acceptance.

**Two-factor local implementation verification (2026-10-15):** 151 regressions pass
across ten files, all green, including 21 new `tests/two-factor.test.cjs` cases on their
own disposable database. They cover: the migration matching what the locked plugin asks
for and an account predating 2FA being untouched by it; `enable` issuing a secret and ten
recovery codes while enabling nothing; `confirm` revoking every session and recording
exactly one event; a pending challenge being **no identity anywhere** — every account read
401, `/api/agent/conversations` and `/api/agent/stop` 401, the session view returning no
conversation and no user, and chat refusing to reach the model — with those same routes
answering normally once the code is accepted; the challenge-completed login still naming
its own device; a challenge being single-use, expiring on its own, and a wrong code
minting no session; failures accumulating across challenges until ten lock the account,
after which even a **correct** code is refused; the plugin's own three-per-ten-seconds cap
reporting as throttling rather than as a wrong code and consuming neither the challenge
nor its budget; the clock window accepting one period either side and rejecting two;
recovery codes each working once and never standing in for a TOTP or the reverse;
regeneration invalidating the whole previous set and demanding the live factor; disabling
needing the password **and** the factor and then signing everything out; a recovery code
substituting for a lost device; **neither a password reset nor a password change bypassing
the factor**; no library `/two-factor/*` path being reachable from the public door; the
challenge surface rejecting `trustDevice`, `disableSession` and any extra field and never
issuing a trust-device cookie; an already-signed-in window being unable to answer a
challenge, which is exactly the branch where the library applies no attempt limit; factor
material never stored or recorded in the clear; management writes needing a login inside
24 hours while status does not; two accounts keeping their factors apart; and the email
change still working with the factor on and leaving it on.

Browser QA used a fresh loopback fixture database (3023 app, 3024 outbox and Turnstile
stub), a persisted runtime-generated auth secret, intercepted mail and AI disabled.
Verified in the running UI: an account with no second factor still signs straight in;
enrolment runs as three labelled steps with the card reading **Not confirmed** until the
code is accepted, the confirm action held until the "I have stored these codes" toggle is
pressed, and the setup key, provisioning URI and plaintext codes gone from the DOM the
moment enrolment completes; enabling and disabling each replace the signed-in page with
their own outcome notice; a real sign-in stops at the challenge, where `/api/account`
answers `{"user":null}`, sessions and conversations answer 401 and the agent session view
reports `authed: false` with no messages — and the same fetches succeed once a code
computed **in the browser from the displayed base32 key** is accepted; a spent recovery
code is refused with its own wording while the challenge stays open; a recovery code signs
in at the challenge; replacing the codes keeps the session alive and shows exactly one new
set; disabling demands the factor as well as the password and then signs everything out; a
**second window** sitting on a signed-in account page cleared itself to "log in again"
through the cross-tab broadcast the moment the first window disabled the factor; wrong
code, throttled and exhausted states each read differently, and the exhausted state removes
the code fields and offers only a fresh sign-in. Twenty-four combinations (en/zh ×
light/dark × 360/768/1280px) were rendered for the two new surfaces — the account card and
the sign-in challenge — with **the applied `dark`/`light` class and `html[lang]` asserted
on every run**, no horizontal overflow and no interactive target below 40px. Images were
captured and read for the challenge step (three widths in both locales and themes, plus the
throttled state), the enrolment panel with its key and code list, the enabled card, both
outcome notices and the reissued-codes panel. axe-core 4.10.2 reported zero violations and
zero incomplete checks on the two-factor section during enrolment and on the whole login
card at the challenge step. Real Tab moved code field → verify button (44px,
`:focus-visible` matching with the theme ring shadow) → recovery field, and Enter inside the
code field completed the sign-in.

Five defects were found only by looking and measuring, not by asserting: the
reissued-codes panel had no branch for an already-enabled account, so the card rendered
**empty** after a regeneration; the login form's "you are already signed in" banner stayed
above the challenge and contradicted it, and the challenge wording claimed the browser had
no session at all rather than that *this request* had none; the 52-character setup key was
unreadable at 360px in a single-line input, so it is now a wrapping selectable field with
its own copy control; the plugin creates the post-challenge session without request
context, which would have made **every** two-factor login read as "Unknown" in the
sessions list and the security record, so the wrapper writes the login's own user agent
back; and the plugin's three-per-ten-seconds cap surfaced as "wrong code" — measured, the
challenge closed on the eighth bunched submission rather than the fifth, because the
attempts that hit the cap never reached the counter — so a library 429 is now reported as
throttling and the contract text states the measured bound.

Limits of this record: **no real phone or authenticator app was used.** Every code came
from an in-page RFC 6238 computation over the base32 key the card displays, which proves
the displayed key yields codes the server accepts but is not on-device acceptance; the
owner's own production account has not been enrolled and enrolling it is separately
unapproved. The 600-second challenge expiry was exercised by aging the row in the fixture,
not by waiting ten minutes, and the physical-device keyboard, password-manager autofill of
`one-time-code` and IME behaviour remain unverified. No real mail was involved (this
feature sends none by design), no paid AI call was made, and nothing was merged, pushed or
deployed. Nothing here is production or deployment acceptance.
