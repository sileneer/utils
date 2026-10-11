# Handover

**Updated 2026-10-11 for documentation maintenance.** Production acceptance below
is dated **2026-10-09**, not a new live inspection. Runtime contracts:
[ARCHITECTURE](ARCHITECTURE.md); operations: [DEPLOYMENT](DEPLOYMENT.md);
UI: [DESIGN](DESIGN.md); decisions: [PLANNING](PLANNING.md) §11–13.

## 1. Authorization

The owner approved and completed account/chat improvements, runtime AI config
publication and site-wide accounts (PR #7 A+B+C plus D). Those approvals remain
settled. This task authorizes documentation/instruction updates, not another
production rollout, provider call or new feature. Off-machine backup uploads and
pruning remain unapproved. Paid acceptance allowance/limits are in §4/§7.

## 2. Checkout and release position

Local branch: `codex/docs-maintenance`, based on `main` at `70f5a78`. This branch
updates AGENTS/Claude entrypoints, README and living docs only; no app, dependency,
schema or env changes. It is not pushed or deployed. The mistaken-task investigation is excluded from
this documentation; private QA evidence remains ignored.

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
- DESIGN §5.6–5.9 owns chat/source/account/admin patterns. Account forms use
  registered primitives; there is no adopted `ui/form` component.
- DEPLOYMENT §8/§11–12 owns release checks, service setup and backup operations.
- PLANNING §11–13 owns decisions and deferred account features. GOTCHAS owns
  debugging lessons. AGENTS is the shared rulebook; CLAUDE imports it.

## 4. Next actions

No feature publication decision remains pending for PR #7/D. This documentation
branch remains local; do not push to main merely to synchronize docs.
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
at release completion. Old preview URLs/PIDs are not proof of an active preview;
verify command lines before stopping any process. Fixtures/outbox remain local,
ignored and unavailable in production. Screenshots are outside Git. The owner
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

**Current documentation maintenance (2026-10-11):** source/package contracts and
GitHub release status reconciled; obsolete provider/form/activation instructions
and duplicate documentation corrected. All 50 relative links, 13 anchors and
20 route source paths passed checks; `git diff --check` and the full production
build/typecheck/standalone sanitization passed. Default `npm run lint` failed on
18 CommonJS import errors in existing ignored private QA helpers; the application
source lint with `data/**` excluded passed (GOTCHAS §F). This is not a claim that
the default local scan passed. Feature tests were not rerun for docs-only changes.
No live host/browser/provider QA or deployment occurred.
