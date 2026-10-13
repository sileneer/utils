# Handover

**Updated 2026-10-13 for the locally implemented PLANNING §14 batch A account
changes.** The full account/UI acceptance below is dated **2026-10-09**; the
documentation release
uses normal CI/CD and read-only revision/health checks, with separate evidence. Runtime contracts:
[ARCHITECTURE](ARCHITECTURE.md); operations: [DEPLOYMENT](DEPLOYMENT.md);
UI: [DESIGN](DESIGN.md); decisions: [PLANNING](PLANNING.md) §11–13; improvement plan
and batch A result: [PLANNING](PLANNING.md) §14.

## 1. Authorization

The owner approved and completed account/chat improvements, runtime AI config
publication and site-wide accounts (PR #7 A+B+C plus D). Those approvals remain
settled. The owner subsequently approved merging the documentation into main
on 2026-10-11, including its normal push-to-main CI/CD rollout. This does not
authorize provider calls or new features. On 2026-10-13 the owner authorized
**local implementation of PLANNING §14 batch A only** — not batches B, C1, C2 or D,
and not publication of any of them. Batch A is implemented locally and unmerged;
production still runs the §13 release. Off-machine backup uploads and
pruning remain unapproved. Paid acceptance allowance/limits are in §4/§7.

## 2. Checkout and release position

Current local branch: `codex/account-improvement-plan-20261013`, based on `e209d59`
(the PR #8 squash merge). The checkout started clean. It now carries the approved
batch A implementation, **uncommitted and unpublished**: `src/components/auth/`
(`account-center`, `account-form`, `account-menu`, `account-provider`, new
`password-field`), `src/app/login/page.tsx`, `src/lib/auth/` (`events`,
`navigation`, new `errors`), both `messages/*.json`, `tests/account.test.cjs`,
`tests/auth-preview.cjs`, and the four docs. No dependency, schema, migration,
env, Docker, CI or server-side auth handler changed — `handler.ts`,
`account-handler.ts`, `lifecycle.ts`, `limits.ts` and `mail.ts` are untouched, so
the ARCHITECTURE §5 server contract is unchanged. Nothing was pushed, merged,
deployed or production-tested. Existing ignored `.zcode/`, data and investigations
are preserved. Planning notes and batch A fixture evidence (disposable database,
generated-credential seeding, fault-injection launcher, screenshots) are under
ignored `data/investigation/account-plan-20261013/` and
`data/investigation/account-batch-a-20261013/`. Generated fixture credentials were
deleted after QA; the disposable preview and its QA browser were stopped.

PLANNING section 14 remains the canonical home for the improvement plan; §14.9 now
records what batch A actually changed. ARCHITECTURE §5 and DESIGN §5.10 describe the
implemented client contract (section anchors, `reauth=1` copy variant, safe error
codes and the per-section mapping in `src/lib/auth/errors.ts`).

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
  ownership, safe return paths, security lifecycle and future-module integration;
  §8 owns runtime provider/env config; §10 owns administrator aggregates.
- DESIGN §5.6–5.10 owns chat/source/account/admin patterns and the batch A
  account-operations clarifications. Account forms use registered primitives;
  there is no adopted `ui/form` component.
- DEPLOYMENT §8/§11–12 owns release checks, service setup and backup operations.
- PLANNING §11–13 owns decisions and deferred account features. GOTCHAS owns
  debugging lessons. AGENTS is the shared rulebook; CLAUDE imports it.

## 4. Next actions

Batch A is implemented locally (§2, PLANNING §14.9) and awaits the owner's review
and a separate publication decision; nothing may be merged or deployed on this
authorization. Batches B, C1, C2 and D remain unapproved proposals in §14.
Do not start new features or publish batch A without subsequent authorization.

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
repository root by an earlier session's shell typo were removed. Screenshots are
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
