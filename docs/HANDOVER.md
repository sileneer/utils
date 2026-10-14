# Handover

**Updated 2026-10-14 for the locally implemented PLANNING §14 batches A and B
(account operations, preferences and the personal usage overview).**
The full account/UI acceptance below is dated **2026-10-09**; the
documentation release
uses normal CI/CD and read-only revision/health checks, with separate evidence. Runtime contracts:
[ARCHITECTURE](ARCHITECTURE.md); operations: [DEPLOYMENT](DEPLOYMENT.md);
UI: [DESIGN](DESIGN.md); decisions: [PLANNING](PLANNING.md) §11–13; improvement plan
and batch A/B results: [PLANNING](PLANNING.md) §14.

## 1. Authorization

The owner approved and completed account/chat improvements, runtime AI config
publication and site-wide accounts (PR #7 A+B+C plus D). Those approvals remain
settled. The owner subsequently approved merging the documentation into main
on 2026-10-11, including its normal push-to-main CI/CD rollout. This does not
authorize provider calls or new features. On 2026-10-13 the owner authorized
**local implementation of PLANNING §14 batch A**, and on 2026-10-14
**local implementation of batch B** — account preferences and the personal usage
overview. Neither approval covers C1, C2 or D, and none of them covers
publication. Batches A and B are implemented locally and unmerged; production
still runs the §13 release. Off-machine backup uploads and
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

**Batch B is implemented in the working tree, still uncommitted**: new
`migrations/004-account-preferences.sql`, `src/lib/auth/preferences.ts`,
`src/lib/theme-device.ts`, `src/lib/unsaved.ts`, `tests/preferences.test.cjs`,
plus edits to `account-center`, `account-provider`, `account-handler`, `errors`,
`i18n/locale.ts`, `theme-provider`, `theme-toggle`, `language-switcher`, both
`messages/*.json`, the four docs, and two existing migration-count assertions in
`tests/auth.test.cjs` / `tests/history.test.cjs` that the new migration moves from
3 to 4. Nothing was pushed, merged, deployed or production-tested for either
batch. Existing ignored `.zcode/`, data and investigations are preserved.
Planning notes and fixture evidence for both batches (disposable databases,
generated-credential seeding, fault-injection launchers, screenshots) live under
ignored `data/investigation/account-plan-20261013/`,
`data/investigation/account-batch-a-20261013/` and
`data/investigation/account-batch-b-20261014/`. Generated fixture credentials are
deleted after each QA pass.

PLANNING section 14 remains the canonical home for the improvement plan; §14.9 and
§14.10 record what batches A and B actually changed. ARCHITECTURE §5/§7 and DESIGN
§5.10–§5.11 describe the implemented client contract (section anchors, the
`reauth=1` copy variant, safe error codes and their per-section mapping in
`src/lib/auth/errors.ts`, the two-layer theme keys, the preference priority and the
personal usage wrapper).

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
  ownership, safe return paths, security lifecycle, preference/usage wrappers and
  future-module integration; §7 owns locale resolution; §8 owns runtime
  provider/env config; §10 owns administrator aggregates.
- DESIGN §5.6–5.11 owns chat/source/account/admin patterns, the batch A
  account-operations clarifications and the batch B preferences/usage-card
  patterns. Account forms use registered primitives; there is no adopted
  `ui/form` component, and `ui/select` is now used for the preference choices.
- DEPLOYMENT §8/§11–12 owns release checks, service setup and backup operations.
- PLANNING §11–14 owns decisions, deferred account features and the §14
  improvement plan with its batch A/B implementation results. GOTCHAS owns
  debugging lessons. AGENTS is the shared rulebook; CLAUDE imports it.

## 4. Next actions

Batches A and B are implemented locally (§2, PLANNING §14.9/§14.10) and await the
owner's review and a separate publication decision; nothing may be merged or
deployed on this authorization. Batch B is still uncommitted in the working tree.
C1, C2 and D remain unapproved proposals in §14. Do not start new features or
publish A or B without subsequent authorization.

Batch B verification is **not complete**: the in-app Browser surface was hidden
during the run, so the required screenshot review and the keyboard operation of the
new `ui/select` triggers could not be performed. The functional, layout-metric and
axe checks did run (see §7). Re-open the in-app Browser panel and capture the
locale × theme × width matrix before treating batch B as accepted.

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
deleted the same way, after its command line was read back and confirmed. Screenshots are
outside Git. The owner
logged in normally; no production cookies were exported, captured or minted.

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
