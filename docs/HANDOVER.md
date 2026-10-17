# Handover

**Updated 2026-10-17 for reviewed public-tool release preparation.**
Current release evidence is in §2/§5/§7; earlier implementation and acceptance
entries are dated historical receipts. Runtime contracts:
[ARCHITECTURE](ARCHITECTURE.md); operations: [DEPLOYMENT](DEPLOYMENT.md);
UI: [DESIGN](DESIGN.md); decisions: [PLANNING](PLANNING.md) §11–13; improvement plan
and batch results: [PLANNING](PLANNING.md) §14; browser-only public tools:
[PLANNING](PLANNING.md) §15.

## 1. Authorization

**Current authorization, 2026-10-17:** the owner requested complete validation of
all four implemented tools, review of their commits and the workspace changes,
then PR creation and merge once the result is accepted. This supersedes the
local-only publication limits in the dated implementation receipts below. Merge
is conditional on the exact reviewed head passing CI/image/security gates;
deployment requires actual revision/health/route/data acceptance afterward.
Production acceptance stays read-only; no paid AI allowance, real mail, credential
change, account mutation, retained-file cleanup or backup pruning is implied.

The owner's 2026-10-16 and 2026-10-17 requests authorize implementing the planned public
tools **locally** and verifying them, one per request: `/text-diff`, then `/qr-studio`, then
`/json-formatter`, then `/unit-converter`. Each is
public and needs no login, every input is processed in the browser, and nothing is
uploaded, sent to AI, persisted by default or written into a shareable link. New
components, interaction patterns and any dependency had to be registered in DESIGN.md
before use; the registry status flips to `live` only once the tool is complete and
verified, and the other tools keep their status. `/qr-studio` added the site's second
runtime dependency and one dev-only verification dependency (§12, PLANNING §15.5);
`/json-formatter` and `/unit-converter` add **no dependency at all** (PLANNING §15.7, §15.8).
**These authorizations exclude pushing to `main` and any deployment.** No production
request, real mail, paid AI call or account mutation was made for them.

The owner's earlier 2026-10-16 request authorizes simplifying the site's
introduction to the lzhdev tools website and removing personal-audience/lineage
wording. The four public-tool requests were for implementation prompts only;
feature implementation and publication are outside that copy cleanup. The owner
then explicitly authorized a local commit of these changes; no push or deployment
was requested. The release authorization below remains a dated PR #9 receipt.

On 2026-10-16 the owner explicitly requested **merge** after review fixes, full
testing and exact-head PR acceptance. This authorizes merging PR #9 at accepted
head `8b53778a69f08e4d2eb488286ab3d9af5f82a27a` and its normal automatic CI/CD
deployment. It supersedes the earlier local-only publication boundary for the
implemented PLANNING §14 batches A/B/C1/C2, activity, TOTP, passkeys, deletion and
the two rounds of review fixes. The owner's separate final-dialog acknowledgement
decision for deletion without a complete export remains part of the accepted scope.

Production acceptance remains read-only. This release does not authorize real mail,
paid AI calls, production data exports, changing credentials/email, enabling TOTP,
registering passkeys, deleting/anonymizing real accounts or cleaning retained files.
The owner enters production passwords/codes in the website; agents must not mint or
export production sessions. Off-machine backup uploads and pruning remain unapproved.
No such sensitive action was exercised for this release. Existing paid QA budgets in
§4/§7 are unchanged and were not used. Earlier PR #7/D and #8 approvals remain settled.

## 2. Checkout and release position

**Current review position:** the checkout began clean at `524a402` on
`codex/release-handover-20261016`, with ten commits beyond `origin/main` (`69e7a5d`).
Those commits cover the four tools, their handovers and the owner-introduction
cleanup. The accompanying review-fix commit closes numeric edge cases, JSON
position/output bounds, QR draft tracking, new-tool login return paths,
accessibility/contrast and the existing chat POST Origin gap. No schema, provider
configuration, production account or retained content is changed. All changed
paths and the existing auth/ownership, SDK/book isolation, persistence and
deployment boundaries were reviewed; fresh checks are in §7. PR/exact-head/image
acceptance and deployment are pending, not proved by the local results.
Ignored `.zcode/`, previous investigations and data remain preserved; private
evidence is under `data/investigation/tools-release-review-20261017/`.

The following release/implementation positions are dated receipts.

PR [#9](https://github.com/sileneer/utils/pull/9) was squash-merged on 2026-10-16
as `69e7a5d94070d2e3ce5c0935c1d25bf353f815e1` from accepted head `8b53778a…`.
The exact feature-head acceptance run
[38832266225](https://github.com/sileneer/utils/actions/runs/38832266225),
GitGuardian and qlty checks were successful immediately before merge. Main had
no configured branch protection; no check was bypassed.

Local `main` is synchronized to the merge commit. Current local branch
`codex/release-handover-20261016` contains the unpublished release handover commit
`03c5b0f` plus the local introduction cleanup committed with this handover update;
do not push another main commit merely to publish this receipt. The checkout was
clean before release work; owner-owned/ignored files remain preserved.
CI/CD run [38835232890](https://github.com/sileneer/utils/actions/runs/38835232890)
passed every test/image/deploy gate. The running OCI revision matches the merge
commit and is healthy in that release receipt; actual deployment acceptance is
recorded in §7. The release handover was committed locally without a push or
second deployment. Production was not rechecked for the later copy-only work.

**Local introduction cleanup, 2026-10-16 (local commit only):** changed both message
catalogs, the About page, README, ARCHITECTURE, DESIGN, PLANNING and this handover.
Home/About/metadata now use the concise owner introduction; the obsolete About
milestone paragraph was removed and the unused passcode prompt no longer suggests
shared access. Documentation uses the same positioning while preserving historical
shared-passcode limitations and technical mail/pattern grouping terminology.
No route, dependency, authentication behavior or tool status changed. The checkout
was clean at `03c5b0f` before this work; ignored `.zcode/`, retained data and prior
investigations are preserved. Private working notes are under ignored
`data/investigation/site-copy-20261016/`.

The entries below describe their original completion dates. Only the older
account/security entries are superseded by the PR #9 release; the four public-tool
entries remain unpublished until the separately authorized release above.

**`/unit-converter`, 2026-10-17 (local commit `ee5fb38`, not pushed):** new engine
`src/lib/tools/units.ts`, client UI `src/components/unit-converter/tool.tsx`, route
`src/app/unit-converter/page.tsx` and `tests/unit-convert.test.cjs`; changed are both
message catalogs (new `unitConverter` namespace, 101 keys each), `src/lib/tools.ts` (this
slug is now `live`), README and the four docs. It adds **no dependency, no migration, no
environment variable and no API route**: 62 units in seven categories are static code, each
expressed against one base unit, with area/volume/speed factors derived from the length and
time tables and temperature kept affine on integer-scaled kelvin (PLANNING §15.8). Currency
is deliberately absent, as are units whose size depends on tradition. `agent-chat` is the
only remaining `planned` entry. The tree was clean at `673d9d0` before this work.

**`/json-formatter`, 2026-10-16 (local commit `65215e5`, not pushed):** new engine
`src/lib/tools/json.ts`, client UI `src/components/json-formatter/tool.tsx`, route
`src/app/json-formatter/page.tsx` and `tests/json-format.test.cjs`; changed are both
message catalogs (new `jsonFormatter` namespace, 42 keys each), `src/lib/tools.ts` (this
slug is now `live`), README and the four docs. It adds **no dependency, no migration, no
environment variable and no API route**: the parser is written in the engine so that
numbers, strings and key order are re-emitted from their source text instead of through
`JSON.parse`/`JSON.stringify` (PLANNING §15.7). `unit-converter` and `agent-chat` statuses
are untouched, and the QR packages from the previous pass are unchanged. The tree was
clean at `37dc448` before this work.

**`/qr-studio`, 2026-10-16 (local commit `7f716ef`, not pushed):** new engine
`src/lib/tools/qr.ts`, client UI `src/components/qr-studio/tool.tsx`, route
`src/app/qr-studio/page.tsx` and `tests/qr-code.test.cjs`; changed are both message
catalogs (new `qrStudio` namespace, 44 keys each), `src/lib/tools.ts` (this slug is now
`live`), `package.json`/`package-lock.json`, README and the four docs. It adds two
packages: runtime `qrcode-generator` 2.0.4 (MIT, zero transitive dependencies — the
lockfile delta is 15 lines) and dev-only `jsqr` 1.4.0, which exists solely to decode the
generated matrix, the exported SVG geometry and the exported PNG bytes in the tests and
never appears in the application or the image. No migration, no environment variable and
no API route: like `/text-diff`, the page has no backend and renders dynamic only because
locale resolution reads cookies per request. `text-diff`, `json-formatter` and
`unit-converter` statuses are untouched. The tree was clean at `371612c` before this work.

**`/text-diff`, 2026-10-16 (local commit `955c139`, not pushed):** new engine
`src/lib/tools/diff.ts`, client UI `src/components/text-diff/tool.tsx`, route
`src/app/text-diff/page.tsx` and `tests/text-diff.test.cjs`; changed are both message
catalogs (new `textDiff` namespace, 51 keys each), `src/lib/tools.ts` (this slug is now
`live`), `src/app/globals.css` (the `--success` token), README and the four docs.
It adds **no dependency, no migration, no environment variable, no API route and no
server-side change**: the tool has no backend, and `/text-diff` renders dynamic only
because locale resolution reads cookies per request (ARCHITECTURE §7). The registry's
other entries are untouched, so `qr-studio`, `json-formatter`, `unit-converter` and
`agent-chat` stay `planned`. DESIGN §5.3's stale `/tools/<slug>` wording is corrected in
the same change, and ARCHITECTURE §11/DESIGN §5.18 record the browser-only contract.
The tree was clean at `8c009da` before this work; the introduction cleanup commit and
all ignored `.zcode/`, retained data and earlier investigations are preserved. Private
QA evidence is under ignored `data/investigation/text-diff-20261016/`.

**Codebase audit fixes, 2026-10-16:** the five findings from application HEAD `ff386ce`
are fixed on this branch: stale login issuance, executable book origin, lost SDK file
ownership, fail-open ledger reads and recovery-code TOTP initialization. Sixteen new
regressions bring the full suite to 206; fresh local and browser verification is in §7.
The change adds a small native ownership ledger and shared durable JSONL helper, but no
npm dependency, migration, env variable or production action. Docker explicitly includes
their CLI startup dependencies. Existing `.zcode/`, ignored investigations, retained data
and unowned historical logs are preserved. The exact follow-up PR head/CI/image result
is recorded in ignored `data/investigation/codebase-audit-20261015/pr-receipt.json`;
the reviewed head and gates were rechecked before the merge above. The earlier
batch records below are dated implementation receipts, not today's release position.

**Commit review and fixes, 2026-10-15:** the initial review covered 13 local commits
through `fa95882` against `e209d59` (75 changed paths). All six findings are now fixed
locally, with four additional real-library/SQLite regressions and fresh UI acceptance
(§7). The fix also corrects destructive-button contrast and bounds the deletion dialog
for short mobile viewports. Canonical contracts are updated in ARCHITECTURE/DESIGN;
the owner's export decision and rationale are in PLANNING §14.17. No new dependency,
table, schema change or production action was introduced by these fixes. Git initially
reported two stat-only test changes; the unrelated `tests/preferences.test.cjs` content
still matches HEAD and is excluded from staging. The fixes are committed as `6f7cd03`
(`fix(auth): resolve account security review findings`), followed by the handover record.
The first PR image run exposed a missing untraced startup dependency; the packaging
follow-up explicitly carries deletion/keying CommonJS modules in Docker and verifies the
actual migration filenames in live and restored image data. Application/UI code is unchanged
by that follow-up.
The exact PR head, URL and Actions result are kept in ignored
`data/investigation/account-fixes-20261015/pr-receipt.json`; re-check that receipt and
GitHub before relying on the remote status. The branch has not been merged.

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

**The §14.7 TOTP second factor is committed locally as `1142983`**
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

**The §14.7 passkey capability is committed locally as `058fb94`**
(`feat(auth): sign in with passkeys`), on top of `1142983`: new
`migrations/008-passkey.sql`, `src/lib/auth/passkey.ts`,
`src/lib/auth/passkey-handler.ts`, `src/lib/auth/session-device.ts`,
`src/lib/passkey-browser.ts`, `src/app/api/passkey/[...action]/route.ts`,
`tests/passkey.test.cjs` and `tests/webauthn-fixture.cjs`, plus edits to `options.mjs`
(the plugin itself, with two `afterVerification` hooks), `account-handler.ts`,
`errors.ts`, `security-events.ts`, `two-factor-handler.ts` (its device backfill moved to
the shared helper), `account-center.tsx`, `account-form.tsx`,
`account-provider.tsx`, both `messages/*.json`, `package.json`/`package-lock.json` and the
five docs. It is the **only batch in this plan that adds a runtime dependency**:
`@better-auth/passkey` 1.7.7, the first-party package of the same version line, whose
lockfile effect is 314 added lines and zero version changes, with `overrides` pinning
`@better-auth/core`, `@better-auth/utils` and `better-call` to the versions already
installed. `008-passkey.sql` is generated from that plugin and purely additive;
`006-security-events.sql` gains two `kind` values in place, which is safe only because
nothing has deployed that migration yet. No `/passkey/*` library path is reachable from
`/api/auth`, and the production domain was not touched.

**The §14.7 account deletion is committed locally as `86e52bb`**
(`feat(auth): delete an account on its owner's request`), on top of `058fb94`: new
`migrations/009-account-deletion.sql`, `src/lib/auth/deletion.cjs`,
`src/lib/auth/deletion.ts`, `src/lib/auth/deletion-handler.ts`, `src/lib/auth/keying.cjs`,
`src/lib/chat/keys.ts`, `src/lib/chat/clear.ts` and `tests/deletion.test.cjs`, plus edits to
`scripts/database.cjs` (reconciliation inside `migrate()`), `account-handler.ts`, `errors.ts`,
`limits.ts` (its keyed-digest helper moved to the shared module), `account-center.tsx`,
`account-provider.tsx`, `use-chat.ts`, `recovery.ts`, `account-form.tsx`, both
`messages/*.json` and the five docs. It adds **no dependency, no env variable and no new
route file**: the three writes and the one read live on the existing `/api/account` handler,
so the `/api/auth` allowlist is unchanged and the library's own `deleteUser` is never called.
`009-account-deletion.sql` is purely additive. The only durable artefact written outside the
database is `deleted-accounts.jsonl`, beside the DB file, which the deletion appends and
`migrate()` reconciles.

PLANNING section 14 remains the canonical home for the improvement plan; §14.9,
§14.10, §14.11, §14.12, §14.13, §14.14, §14.15 and §14.16 record what batches A, B, C2, C1,
the activity record, the TOTP second factor, passkeys and the account deletion actually
changed.
ARCHITECTURE §5/§7/§8 and DESIGN
§5.10–§5.17 describe the implemented client contract (section anchors, the
`reauth=1` copy variant, safe error codes and their per-section mapping in
`src/lib/auth/errors.ts`, the two-layer theme keys, the preference priority, the
personal usage wrapper, the export document contract, the two-code email-change
protocol, the desensitized security event vocabulary with its retention window, the
two-factor invariant, challenge surface, recovery-code rules and the
`BETTER_AUTH_SECRET` stability requirement, the passkey route table, the
user-verification enforcement, the extended session invariant and the
registrable-domain rpID constraint, and the **itemized deletion inventory** with its
cooling-off states, last-administrator gate and out-of-database resurrection guard).

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
  record, the TOTP second factor, the passkey surface, the itemized account-deletion
  inventory and future-module integration; §7
  owns locale
  resolution; §8 owns runtime provider/env config, including the
  `BETTER_AUTH_SECRET` stability requirement; §10 owns administrator aggregates.
- DESIGN §5.6–5.17 owns chat/source/account/admin patterns, the batch A
  account-operations clarifications, the batch B preferences/usage-card
  patterns, the C2 export card, the C1 email-change card, the security
  activity card, the two-factor enrolment/challenge/recovery card, the passkey
  management/sign-in card and the account-deletion card with its confirmation dialog.
  Account forms use
  registered primitives; there
  is no adopted `ui/form` component, and `ui/select` is now used for the preference
  and export-scope choices.
- DEPLOYMENT §8/§11–12 owns release checks, service setup and backup operations, including
  the rule that `deleted-accounts.jsonl` is preserved across restores and that no backup is
  pruned to complete a deletion.
- ARCHITECTURE §11 owns the runtime contract of a browser-only public tool (no route,
  storage, URL or upload involvement); DESIGN §5.18 owns that shared contract and the
  text-diff patterns, DESIGN §5.19 the QR Studio patterns, §5.20 the JSON Formatter
  patterns, §5.21 the Unit Converter patterns, and §12 the two QR packages.
  The route itself comes from `src/lib/tools.ts` and is listed in ARCHITECTURE §2.
  PLANNING §15 owns the algorithm and dependency decisions behind these tools, including
  the rejected options (§15.3, §15.5, §15.7) and the decode-verification standard (§15.6),
  and the unit table's base-unit, inclusion-scope and precision rules (§15.8).
- PLANNING §11–14 owns decisions, deferred account features and the §14
  improvement plan with its batch A/B/C1/C2, security-activity, two-factor, passkey and
  account-deletion
  implementation
  results. GOTCHAS owns
  debugging lessons. AGENTS is the shared rulebook; CLAUDE imports it.

## 4. Next actions

**Current public-tool release:** local review and fixes have passed the checks in
§7. Create the PR, verify its exact head and all acceptance/security/quality gates,
then merge under the owner's authorization. Verify the actual running revision,
health, public tools, private-route rejection and retained-data parity afterward.
The older local-only wording below is a historical implementation receipt.

**After `/text-diff`, `/qr-studio`, `/json-formatter` and `/unit-converter`:** all four are
implemented, verified and `live` in
`src/lib/tools.ts`, so their home cards link to `/<slug>`. `agent-chat` is
the only entry still `planned`. The next local tool starts from
DESIGN §5.18–§5.21 and ARCHITECTURE §11 — the shared contract, the touch-target fixes and
the "no stale output" rule are already settled, and `jsqr` is available to decode-verify
any generated image. `/unit-converter` is committed locally as `ee5fb38`, `/json-formatter` as
`65215e5` (handover `673d9d0`), `/qr-studio` as
`7f716ef` (handover `37dc448`), `/text-diff` as
`955c139` (handover `371612c`), and the introduction cleanup as `8c009da`.
Nothing here has been pushed or deployed.

**PR #9 merged, 2026-10-16.** Publication authorization is settled in §1;
deployment and read-only acceptance evidence belong in §7. No additional feature
or sensitive production action is implied. The earlier implementation milestones
below are released by this merge, rather than waiting for another merge decision.

**Five subsequent audit findings closed, 2026-10-16.** Session issuance now
validates the account generation before and after insertion for password/TOTP/passkey
login, and security writes invalidate unfinished password-to-2FA challenges. Initial
factor activation requires TOTP and confirmed persisted state. SDK ownership survives
failed/stopped/replaced runs and cleared resume pointers in its own preserved ledger;
deletion unions prior owed cleanup on restore. Ledger read/corruption failures stop
startup/removal. Both the reader iframe and direct HTML response enforce opaque origin,
with a bounded bridge handshake and failure/retry handling. Unattributable pre-existing
logs remain retained: no automatic historical cleanup was authorized or attempted.
Real-device and real-mail acceptance remain open. The previous six findings below
also remain fixed.

**Review findings closed locally, 2026-10-15.** Verification deletion now matches exact
OTP identifiers and guards JSON extraction. The global last-administrator invariant is
checked inside the removal transaction before writing an intent; a refused race leaves no
intent to execute on restart. Export preflight sums every materialized body/context/title/
usage JSON in UTF-8 bytes. Large-account deletion has the owner's explicit opt-out from
the complete-export prerequisite, preserving every other gate and never mislabelling a
segment as complete. Security-card reads stop on reauthentication/failure, and step-up
inputs accept both TOTP and recovery-code shapes. Real-device/mail verification and
sensitive production account actions remain outside the release acceptance scope.

All implemented §14 batches and review fixes are included in PR #9. Their original
commits and rationale remain in §2 and PLANNING §14.9–§14.18. Do not start additional
features or another rollout without subsequent authorization.

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

Passkeys leave their own deliberate open items:

- **Every passkey result above comes from a CDP virtual authenticator**, not from a phone,
  a synced account passkey or a hardware key. It proves the browser↔server path and the
  rendered contract; it does not prove cross-device behaviour, a real Windows Hello /
  Touch ID prompt, a password-manager-held credential, or anything on the production
  domain. Registering a real passkey for the owner account is unapproved and would also be
  the first thing to do *after* a publication, not before.
- **The rpID is the hostname of `APP_URL`**, and browsers refuse an IP address as a
  relying-party id. Production (`utils.lzhdev.com`) is a registrable domain and is
  therefore fine, but this ties passkeys to the domain: a future domain change, or serving
  the site by IP, silently breaks every registered credential. Worth a line in any future
  migration plan.
- A second passkey on a device that already holds one for this account is refused by the
  authenticator itself, and WebAuthn gives no distinct error name for that, so the card
  reports the browser's generic failure rather than "this device already has one". The
  server-side `already_registered` answer only applies when the browser does send a
  response. Changing that is a copy decision (DESIGN §5.16), not a security one.
- The batch adds the site's first new runtime dependency since the stack was locked. Any
  future `better-auth` bump must move `@better-auth/passkey` with it and re-check the
  `overrides`; the plugin's peer range is `^1.7.7`, so npm will otherwise drift
  `@better-auth/core` sideways (PLANNING §14.7 records the measured failure).

Account deletion is implemented but **deliberately unexecuted against anything real**, and
this authorization does not cover running it on production data:

- **The reviewable deletion list is ARCHITECTURE §5 "Account deletion".** Deleting a real
  account needs the owner's explicit approval of that specific list first. Release startup
  runs the normal migration/reconciliation path; it does not authorize deletion of a real
  account or execution of a new deletion intent. Everything removed in QA was created
  inside a disposable fixture.
- **Backups are not pruned by this feature and must not be.** A pre-deletion backup still
  contains the identity; the guard is the out-of-database `deleted-accounts.jsonl` plus the
  reconciliation in `migrate()`, which covers a database-only restore — the documented
  restore procedure — and not a whole-volume rollback to an older snapshot. DEPLOYMENT §11 now
  says to preserve that file across restores the way the SDK directory is preserved.
- **No restore drill was performed.** The resurrection guard was verified against a copy of a
  fixture database, never against a real `/app/data/backups` artefact, and no off-machine
  destination exists yet.
- **The cooling-off never auto-executes.** A request that is never confirmed simply lapses
  after 30 days and the account continues unchanged; if the owner later wants scheduled
  automatic completion, that is a new decision requiring a scheduler this site does not have.
- **No demotion path exists for administrators.** `scripts/database.cjs admin` can only
  promote, so the last-administrator refusal is currently the only thing standing between a
  self-service deletion and an unreachable `/admin`. A reassignment flow would be its own
  small feature.
- **Two stores are retained by design and remain operator-only**: the shared
  `AGENT_DATA_DIR/versions/**` pairs, which have no per-user subtree, and the retired
  `data/agent/sessions/*.json` files, which carry no owner column and therefore cannot be
  attributed to any account.

C1 leaves one deliberate open item: **real mail delivery for the three
`change-email*` purposes has never been exercised** — this authorization covered
simulated acceptance only, and the Brevo adapter is unchanged apart from the new
purposes. A separately authorized follow-up should confirm that a
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
- The last natural scheduled backup was verified successful on 2026-10-15;
  keep observing scheduled status after the upgrade. Off-machine destination,
  ownership, upload and retention/pruning need separate decisions (DEPLOYMENT §12).

## 5. Last accepted production data and backup (2026-10-16)

Before PR #9 deployment, created the coherent SQLite API backup
`/app/data/backups/pre-pr9-20261016-8b53778a.sqlite` (mode 600, 192512 bytes),
with no pending/streaming message or native SDK process. Backup integrity is `ok`,
foreign-key issues zero and counts match the live baseline. The backup was not
restored over production or pruned.

Post-release counts match: one user/account, nine sessions, zero verification rows,
seven conversations, 22 messages, 12 usage rows and three conversation metadata rows.
Internal digests confirm retained identity verification/role/status, conversations,
messages, usage and metadata are unchanged. All six retained source-version trees
and 18 SDK files match their baseline digests. Migrations 001–009 are applied;
integrity is `ok`, foreign-key issues zero. All new preference/factor/passkey/deletion/
security-event tables are empty. The new SDK ownership ledger backfilled three
attributable pointers, mode 600; unowned historical files remain retained.

Data and SDK bind mounts, AI enablement, quota limits and configured-key presence
are preserved. Private env remains mode 600, owned by `utils-deploy`. The host backup
script matches `deploy/backup.sh`, mode 750, with exactly one 03:15 UTC cron entry and
active cron service; the last natural backup completed on 2026-10-15 with integrity
`ok`. No host script, schedule, secret or configuration change was needed.

Rollback starts from prior running revision `e209d59b2bd473ce8a69b54cfba69eef54a9a06c`
and DEPLOYMENT §6/§11. Its retained local image is
`sha256:0eb1a2d1fde1423c2b6cff3fd23680f96a2753bdcfbdbdbdc096c3f2c534f473`.
Preserve the upgraded database, all external ledgers, SDK
files, retained source pairs and backups; image rollback must not rewind user data.
Private baseline, backup and parity receipts are in
`data/investigation/account-release-20261016/`. These are dated checks, not future
row-count or health guarantees.

**Historical 2026-10-09 acceptance:**

Coherent pre-release backup: `/app/data/backups/release-20261009-site-account.sqlite`
(mode 600), created with zero active requests. Integrity/FK checks passed and all
baseline account/session/chat/message/usage/metadata rows were internally compared
and exactly preserved. Owner verification/admin role, histories, quota, model
catalog, retained source versions and persistent SDK mount were retained; private
env remained mode 600 and owned by `utils-deploy`. Existing backup script/schedule
were preserved. No DB replacement, off-machine upload or pruning occurred.
These are dated acceptance results, not current row-count/health guarantees.

## 6. QA cleanup and private evidence

The `/unit-converter` pass reused the same disposable loopback launcher on port 3051 and the
same asset server on 3052 (axe-core only); it introduced no new fixture, database, credential
or process. Both were stopped only after their command lines had been read back and confirmed,
with 3051/3052 then verified to hold no listener, and the extra Chrome used for the real-viewport
captures runs from the `chrome-devtools-mcp` tool's own profile directory. No production request
was made, no owner browser profile, tab, cookie or session was opened, and nothing from this tool
reached storage: the page writes no `localStorage`/`sessionStorage` key of its own (the only keys
present are the site's two theme keys) and the address bar never gained a query, hash or path
segment while values were typed, converted, copied or refused.

The `/json-formatter` pass reused the same disposable loopback launcher on port 3051 and
the same asset server on 3052; it introduced no new fixture, database or process, and both
servers were stopped only after their command lines had been read back and confirmed, with
the ports then verified free. No production request was made and no owner data was touched.

The `/qr-studio` pass reused the same disposable loopback launcher on port 3051 (its own
migrated database under ignored `data/investigation/text-diff-20261016/`, AI disabled, no
provider, mail or Turnstile credential) and the same second server on 3052, which now
serves two already-installed QA libraries — axe-core and jsQR — to the page. Both were
stopped only after their command lines had been read back and confirmed to be this pass's
launchers, and 3051/3052 were then verified to hold no listener. The extra Chrome used for
the real-viewport screenshots runs from the `chrome-devtools-mcp` tool's own profile
directory and was closed after the captures. No owner browser profile, tab, cookie or
session was opened, no production cookie or session was minted or exported, and no
production request was made. The generated QR files existed only as in-page blobs during
QA; the captured exports and screenshots stay local and ignored, and no Wi-Fi password
used in testing appears in any surviving log.

The `/text-diff` pass used its own disposable loopback launcher on port 3051 with a
dedicated migrated database under ignored `data/investigation/text-diff-20261016/`, an
AI-disabled configuration with no provider, mail or Turnstile credential, plus a second
loopback server on 3052 that only served the already-installed axe-core file to the page.
Both were stopped only after their command lines had been read back and confirmed to be
this pass's launchers, and 3051/3052 were then verified to hold no listener. The extra
Chrome used for the real-viewport screenshots runs from the `chrome-devtools-mcp` tool's
own profile directory and was closed after the captures; no owner browser profile, tab,
cookie or session was opened, and no production cookie or session was minted or exported.
The launcher's disposable database and the screenshots stay local and ignored; no
credential value appears in the surviving logs. No application data, retained file or
production resource was modified.

The 2026-10-16 release used fresh anonymous Chrome contexts and read-only HTTP/host
checks. Browser/context cleanup completed, and the Actions watcher and SSH commands
exited. No local preview was started. Evidence and screenshots stay ignored under
`data/investigation/account-release-20261016/`; no credentials, cookies, private
content or evidence files are staged. Existing owner-owned/ignored material is preserved.

The review-fix pass uses only ignored `data/investigation/account-fixes-20261015/`.
Its launcher creates fresh UUID-named fixture databases and a fake home; credentials and
factor secrets are generated in memory and never copied from production. Browser profiles
are disposable, and the Playwright runner closes its Chrome instance in `finally`.
Only this pass's preview command line may be stopped; unrelated previews and owner files
remain untouched. The final fixture's recovery account was deleted only after its explicit
UI confirmation. Screenshots and databases remain private QA evidence, never staged.
The runner closed its browser; the verified preview process was stopped and ports
3037/3038 were checked closed before packaging.

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

The passkey pass used an eighth dedicated fixture database under
`data/investigation/account-passkey-20261015/ui/` on its own loopback pair (3033 app, 3034
outbox and Turnstile stub) with `APP_URL=http://localhost:3033`, because browsers refuse an
IP address as a WebAuthn relying-party id. It kept the same persisted `auth-secret.txt`
reasoning as the two-factor pass. Its browsers were **throwaway headless Chrome instances**
started by the QA scripts themselves on debug ports 9333–9336 with a temporary profile each
and a CDP virtual authenticator, so no real browser profile, security key or phone was
touched; every instance was killed and its profile deleted by the script that started it,
and this pass verified afterwards that no such process remained and that 3033/3034 were no
longer listening. The launcher was stopped the same way, after its command line had been
read back and confirmed. Fixture accounts, passwords and credentials are generated per run
and never written into a file that survives it; the two intermediate run logs that had
echoed a disposable password in a request-body dump were deleted once the pass was recorded,
and the remaining log was checked to hold no credential value. Screenshots, the software
authenticator fixture and the probe scripts stay local and ignored. No production cookie or
session was exported, captured or minted, and no passkey was registered on any real account.

The account-deletion pass used a ninth dedicated fixture database under
`data/investigation/account-deletion-20261015/ui/` on its own loopback pair (3035 app, 3036
outbox and Turnstile stub) with AI disabled, no provider credential and intercepted
mail/challenge. Because this feature deletes things, three extra guards were built into the
harness rather than trusted: the launcher repoints `HOME`/`USERPROFILE` at a `fake-home`
directory so the SDK transcript sweep can only ever touch files the QA script itself created;
the browser script deletes exactly the disposable account it registered minutes earlier; and
`deleted-accounts.jsonl` for that run sits beside the fixture database, inside ignored
`data/`. The throwaway headless Chrome again used its own temporary profile and debug port
9337 and was killed by the script that started it, with no such process and no listener on
3035/3036 afterwards, both verified. The launcher was stopped only after its command line had
been read back and confirmed to be this fixture. Fixture credentials are generated per run and
were checked not to appear in any surviving log. The `planning-with-files` helper script that
appended the new copy lives under the same ignored directory and is not part of the
application. Screenshots, the CDP drivers and the fixture databases stay local and ignored.
**No production or owner account was deleted, no retained file, backup or owner-owned data was
touched, and no real SDK transcript was removed.**

## 7. Verification and limits

**Public-tool review, 2026-10-17:** fresh full `npm test` **276/276**, full lint,
complete production build/typecheck/standalone sanitization and `git diff --check`
pass after the review fixes. Six new cases cover actual numeric, JSON location/
expansion and Origin failures; the existing navigation case now checks all four
new routes. Independent private checks cover 4,000 generated JSON documents in
12,000 style runs (including output-bound preflight), 3,000 mixed-EOL diff pairs
with exact input reconstruction and 4,318 accepted edge-value conversions.

The fresh AI-disabled disposable preview on 3051 passed 48 populated-tool browser
combinations (four tools × en/zh × light/dark × 360/768/1280px), with language/theme
asserted, no horizontal overflow or undersized visible controls. Saved desktop/
mobile screenshots and contact sheets were inspected. Tested diff options,
unified copying and focused hunk navigation, escaped HTML, QR draft confirmation,
JSON number/escape fidelity, duplicate-key stale-output removal, expansion refusal
and minification recovery, and temperature/zero-exponent/absolute-zero outcomes.
Actual browser-downloaded PNG and SVG files independently decode to the exact
Wi-Fi payload (Chinese, escaped separators and hidden-network flag), both 512px.
CDP network observation confirmed no upload from diff input actions; source review
confirms all four computations have no request/storage path.

WCAG-tag axe checks cover all 48 populated tool states. Two initial JSON contrast
flags occurred during the Clear button's disabled-to-enabled opacity transition;
all six light-locale/width cases pass after waiting for active animations to finish.
No settled violations remain. Diff's decorative `aria-hidden` minus glyph and the
JSON error caret are the only manual contrast checks; they share colors/backgrounds
with the checked adjacent text and were inspected. This is browser emulation,
not physical-device QA. The installed agent-browser Windows binary was absent;
the built-in browser fallback was used. No browser console errors were observed.

`npm audit --omit=dev` reports zero vulnerabilities. Full audit has nine existing
development dependency nodes for the unpatched `braces` advisory
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm); no blind
toolchain downgrade was made. Final-image tests now explicitly reject `braces`,
shadcn, eslint-config-next and jsqr in the runner and check all four public routes.
Those Linux/image results still require the PR run. Production read-only preflight
has integrity `ok`, zero FK issues, no active AI run and preserved baseline hashes;
this is not post-release acceptance. No paid AI, real mail or account/security
mutation was performed. Existing paid-call budgets and prior QA limits are unchanged.

**PR #10 initial gate:** GitGuardian flagged a hardcoded password-shaped Wi-Fi
test fixture in the original QR commit. It is synthetic test data, not a live
credential. Replaced it and the SVG secrecy fixture with runtime-generated values,
retaining the exact escaping/absence assertions. No suppression or gate bypass is
used; the corrected PR head must receive fresh acceptance before merge.

**`/unit-converter` local implementation, 2026-10-17:** `npm test` runs 270 cases across
sixteen files, all green — 16 of them new in `tests/unit-convert.test.cjs`, which test the
table and the arithmetic rather than whether a page opens: every published definition the
engine claims (1 in = 2.54 cm, 1 ft = 12 in, 1 mi = 5280 ft, 1 nmi = 1852 m,
1 lb = 0.45359237 kg, 1 st = 14 lb, 1 US gal = 231 in³, 1 Imp gal = 4.54609 L,
1 acre = 43560 ft², 1 ha = 10000 m², 1 yr = 365.25 d, …); the three benchmarks named in the
brief; the square-cube law (m²→ft² equals the length factor squared, m³→ft³ cubed, plus
1 ft² = 144 in², 1 ft³ = 1728 in³, 1 mi² = 640 acre); temperature as an affine scale with
`factor === null` asserted for all 16 ordered pairs and the exact readings people type
(32 °F → 0 °C, 212 °F → 100 °C, 98.6 °F → 37 °C, 273.15 K → 0 °C, −40 ↔ −40,
−459.67 °F → 0 K); absolute zero as a physical bound naming each scale's own floor, with
0 K itself accepted; decimal, signed and scientific-notation input including the exact
integer/power-of-ten split; 21 refused inputs each mapped to `invalid` or `empty`;
`overflow` and `underflow` distinguished from a silent 0 or `Infinity`; a full-pair sweep
asserting no displayed string is empty, contains `NaN`/`Infinity`, or exceeds 12 significant
digits; a full-pair round trip through the base unit within 1e-9 relative; the explicit proof
that the engine's full-precision value and the rounded display differ and that only the
former is converted back; table well-formedness (62 units, unique ids and symbols, one base
per category, affine only for temperature); US/Imperial separation; and the deliberate
absences (no currency, month, cup, tablespoon, teaspoon or mach). Full `npm run lint`,
`npx tsc --noEmit` and full `npm run build` exit 0, with `/unit-converter` in the route list.

Browser acceptance ran against the production build on the disposable loopback preview.
All **12 combinations** (en/zh × light/dark × 360/768/1280px) were measured on the final
bundle with `html[lang]` and the applied theme class asserted per run: zero horizontal
overflow, nine interactive controls in `#main-content` none under 40px, and the same
`39.3700787402` result in every combination. Verified in the running page: the example-free
empty state; 12 m → 39.3700787402 ft; 12 in → 1 ft with the chain `12 in = 0.3048 m = 1 ft`
and both exact definitions; swap both ways; category switching resetting the two unit lists
to one dimension while keeping the number (Length → Temperature left `12` and moved to
°C → °F); **32 °F → 0 °C on screen**, which is the case the naive `(°F + 459.67) × 5/9`
double path renders as `5.68e-14`; the through-base line suppressed when a chosen unit already
is the base; the five refusal states (` `, `1,000`, `12 in`, `1e400`, `1e-400`, and −500 on
the Fahrenheit scale) each with their own localized sentence and **no result field left in the
DOM**; markup typed into the box (`<img src=x onerror="alert(1)">`) coming back as quoted text
with zero `img`/`script`/`iframe` elements created; Copy captured through a clipboard recorder
as exactly `144` — the number alone, no unit and nothing in `location.href`, `hash` or storage;
axe-core reporting **0 violations and 0 incomplete** on the filled mobile page and the error
state; canvas-composited contrast from 4.73 (destructive alert body, light) and 5.08 (dark) up
to 17.35, with muted text 5.77/6.73; and a real Tab press moving Value → From with
`:focus-visible` true and a 3px ring layer. Three full-page images at real emulated viewports
were captured and read: en/light/1280 (filled conversion plus relationship panel),
zh/dark/360 with the localized refusal, and zh/dark/360 with 32 °F → 0 °C. The home page now
links `/unit-converter` and shows a single remaining `Soon` badge (`agent-chat`).

Limits: emulated viewports and a same-origin iframe matrix, not a physical device; the
Radix listbox was measured with the popup open (its 28px default items were raised to 40px
for this tool only — the shared `ui/select` still ships 28px items, so the other three tools'
popups keep the old height and were not re-measured); the "same unit on both sides" sentence
was added after the desktop screenshot pass and is verified at the catalog and code level but
was not re-photographed in the browser; `1e-400`-style refusals are reported rather than
approximated; and no real-device, production or account data was involved. Nothing was merged,
pushed or deployed. Private evidence: ignored `data/investigation/text-diff-20261016/`
(`browser-receipt.json`, the three screenshots, the launcher and its disposable database).

**`/json-formatter` local implementation, 2026-10-16:** `npm test` runs 254 cases across
fifteen files, all green — 15 of them new in `tests/json-format.test.cjs`, which test the
parser and printer rather than a page: every top-level shape (object, array, string,
number, boolean, null) and the empty-array/empty-object prints; **number fidelity** for ten
literals including a 30-digit integer, `9007199254740993`, `-0`, `1e2`, `1E+2`, `1.50`,
`0.1000000000000000000000001` and `-1.5e-7`, with an assertion that `JSON.parse` +
`JSON.stringify` really does destroy several of them — the trap this engine exists to avoid;
string fidelity for `\uXXXX`, `\/`, `\n`, `\t`, `\"`, `\\`, a NUL escape and emoji, checking
both the raw text and the decoded value; document key order never sorted; **duplicate keys**
reported with the key and both positions (including the escaped spelling `"\u0061"` matching
`"a"`), with no output produced while one is present; 22 malformed inputs each mapped to its
own reason (trailing comma in array and object, missing colon, missing comma, unterminated
string, bad escape, control character in a string, `01`, `1.`, `.5`, `+1`, `tru`, `nulll`,
`NaN`, `Infinity`, a comment, single quotes, extra data); line/column correctness including a
CRLF document and the caret placement in the source excerpt; the 2 000 000-character and
200-level bounds; indent 2/4/Tab output verified line by line; formatting idempotence; and
`JSON.parse` deep equality between the output and the input for ordinary documents.
Full `npm run lint` and full `npm run build` exit 0. The final re-check on the committed
tree used `node --test --test-concurrency=1 tests/*.test.cjs` — **254/254** — because the
parallel default is the one this host's memory pressure perturbs, and `npm run build` then
finished with `/json-formatter` in the route list.

Browser acceptance ran against the fresh production build on the same disposable loopback
preview. All **12 combinations** (en/zh × light/dark × 360/768/1280px) were measured with
the applied theme class and `html[lang]` asserted per run: zero horizontal overflow, no
interactive target under 40px, and the formatted output keeping the big integer, `-0` and
Chinese keys in every combination. Two full-page images were captured at real emulated
viewports and read: zh/dark/360 showing the localized trailing-comma error with its line,
column and caret, and en/light/1280 showing the example formatted from 127 to 170
characters. Verified in the running page: the example, all three indents, Minified (single
line, big integer intact) and back; a trailing comma replacing the output entirely —
the output `Textarea` leaves the DOM, so no stale result can be read — with the reason,
`line 3, column 14` and the caret; a duplicate key naming `“a”` with both positions;
`<img src=x onerror=…>` inside a string producing **zero** element nodes and appearing only
as text; a 692 KB document formatting to 1.28 MB while the input stayed responsive
(153 ms to type afterwards) and a 4.5 MB one being refused with its limit named; 300-level
nesting refused; Copy captured through a clipboard recorder matching the output byte for
byte; and the download intercepted as a blob — `formatted.json`, `application/json`,
content identical to the output, so no key reaches a file name. axe-core reported
**0 violations and 0 incomplete**; measured contrast 4.55 (inactive tab) to 17.35 in light
and the same floor in dark. Real Tab walks Input → Output (read-only, reachable) → Copy →
Download with `:focus-visible` and the theme ring at every stop.

Limits: emulated viewports and a same-origin iframe matrix, not a physical device; the
parser is strict JSON only — comments and JSON5 syntax are refused by design, not repaired.
Nothing was merged, pushed or deployed, and no production or account data was involved.
Private evidence: ignored `data/investigation/text-diff-20261016/`
(`browser-receipt.json`, the two screenshots, the launcher and its disposable database).

**`/qr-studio` local implementation, 2026-10-16:** `npm test` runs 239 cases across
fourteen files, all green — 13 of them new in `tests/qr-code.test.cjs`, which test the
payload and the geometry rather than whether a page opens: Wi-Fi escaping of `\ ; : , "`
(including a password that itself looks like a field boundary), the `WIFI:` record for
WPA/WEP/open with and without the hidden flag, text and URL passing through untouched,
empty and over-long refusal, a higher correction level needing a denser symbol, the
version derived from the module count, the four-module quiet-zone floor, WCAG contrast
values, the exact SVG structure and rect count, and the centred export layout. **Every
generated code is decoded back with `jsqr`**: nine payloads (Chinese, mixed CJK plus
emoji, a query URL, an escaped Wi-Fi record, leading/trailing spaces, newlines, a ZWJ
family emoji, a 900-character string) across all four correction levels, at 256/512/1024
px, with inverted colours and with a custom palette — all round-trip byte-for-byte.
Full `npm run lint` and full `npm run build` exit 0.

Browser acceptance ran against the fresh production build on the disposable loopback
preview. All **12 combinations** (en/zh × light/dark × 360/768/1280px) rendered with the
applied theme class and `html[lang]` asserted per run, the preview present, zero
horizontal overflow and no control under 40px by measured rect. Four full-page images at
real emulated viewports were captured and read (en/light/360 with Chinese input,
zh/dark/360, en/light/1280 Wi-Fi form with the low-contrast warning, plus the text-diff
pass) — the QR keeps its own light background inside the dark card, as intended.
**The rendered page and the downloaded files were decoded, not eyeballed:** the SVG in the
DOM, serialized and rasterized, decodes to the exact Chinese text and to the exact
`WIFI:T:WPA;S:Office\;Net\:x;P:sun\;day\,2026;H:true;;` record; the intercepted PNG
export is 512×512 and 1024×1024 as selected and decodes; the intercepted SVG export is
the same size, contains 225 rects, no script/href/`url()`/doctype/entity/image/style
construct, the only absolute URI is the SVG namespace, and it decodes too. Both downloads
are named `qr-code.png` / `qr-code.svg` — no content in the file name. A stale result is
structurally impossible: making the input over-long removed the preview and showed the
byte-limit message, clearing it showed the empty message, and an empty SSID with the
Wi-Fi tab selected shows its own reason. The low-contrast path was verified against a
real decoder rather than a rule of thumb — at 1.61:1 (`#ccc` on white) jsQR returns
nothing, so the warning names the measured ratio and the 3:1 floor while still showing
the valid code. Typing a URL produced **no request to that host**: the network log holds
only same-origin assets, `/api/account`, the QA script and the `data:` URL used to
rasterize. The password field stays masked with a working show/hide toggle, and the
payload never appears as text in the DOM.

axe-core reported **0 violations and 0 incomplete** nodes on the populated page (Wi-Fi
form, warning shown, footnote expanded) — no `color-mix` tints on this page, so the
contrast rule resolved cleanly. Measured chrome contrast: light theme 4.55 (inactive tab)
to 18.06, dark theme 5.38 to 16.75, with the primary download button at 5.24 and 8.18.
Real keyboard input was used: the Tab chain runs SSID → password → show/hide → security
select → hidden switch with `:focus-visible` and the theme ring at every stop, Enter opens
the Select listbox (three options) and Escape closes it, one Space toggles the switch and
the next decode carries `H:true`, and Enter activates the password toggle. Synthetic
`keydown` does **not** activate these controls, so the switch and toggle results above come
from CDP key events only. The only console output was Chrome's advisory that a password
field is not inside a `<form>`; wrapping it would add nothing here and would invite
browser save prompts.

One defect was found only by serving the build: the page 500-ed under server rendering
because Turbopack resolves the library's **ESM** build, which ships no encoding table at
all, so the UTF-8 converter had to be supplied by this site (`TextEncoder`, assigned to
the factory the library actually reads). The Node tests use the CJS build, which does have
the table, so they passed while the page crashed — the same converter now runs on both
paths. Limits: emulated viewports and a same-origin iframe matrix, not a physical phone;
no real scanner app was used, so "decodes with jsQR" is strong evidence, not a claim about
every camera in the wild. Nothing was merged, pushed or deployed, and no production or
account data was involved. Private evidence: ignored `data/investigation/text-diff-20261016/`
(`browser-receipt.json`, the four QR screenshots, the launcher and its disposable database).

**`/text-diff` local implementation, 2026-10-16:** `npm test` runs 226 cases across
thirteen files, all green — 20 of them new in `tests/text-diff.test.cjs`, which exercise
the engine rather than whether a page opens: line splitting with LF/CRLF/CR and a missing
final newline; empty, identical and one-sided inputs; added/removed/changed rows with both
line-number columns; hunk grouping, gap folding and the counts across the whole file;
inline word marks including per-character CJK and an emoji sequence kept whole; both
comparison options proving they change only the verdict and never the text; the size
guards reporting which limit was hit; the coarse and row-cap fallbacks; and the exact
unified copy text. A 200-case seeded fuzz additionally asserts that both sides rebuild
line-for-line from the rows and that the equal count equals a brute-force LCS length, so
the alignment is minimal wherever the budget allows it. Full `npm run lint` and full
`npm run build` (TypeScript plus standalone sanitization) exit 0; `npx eslint src` is
clean; `/text-diff` appears in the route table as dynamic, which is expected (§GOTCHAS G).

Browser acceptance used the fresh production build served by an AI-disabled disposable
loopback launcher on `127.0.0.1:3051` with its own migrated SQLite file, no provider or
mail credential and no production contact. All **12 combinations** (en/zh × light/dark ×
360/768/1280px) rendered the tool with the example loaded, each asserting the applied
`dark`/`light` class and `html[lang]`: zero horizontal overflow in every combination, the
same 8 rows and 3 hunk anchors everywhere, panes stacked with per-side labels at 360px and
two equal columns at 768/1280px. Four full-page images were captured at real emulated
viewports and read as images (en/light/360, zh/dark/360, en/light/1280 unified with the
footnote expanded, zh/light/768 with Chinese text): inline marks, `+`/`−` markers, the
line-ending badges and the active-difference border all render as intended. Interactions
were driven for real: example/swap/clear, both views, next/previous moving focus to the
target row with "difference n of m" in a live region, both switches, per-pane copy and
Copy diff captured through a clipboard recorder (exact unified text, correct direction
after swap). Hostile and boundary input was checked in the running page: `<img
src=x onerror=…>` and `<b>` produced **zero** element nodes inside the result list;
100,001 characters and 20,001 lines each produced their own labelled refusal with no
stall; 1,500 against 3,000 repeating lines produced the coarse note, the cap note and
2,001 rows. axe-core reported **0 violations** on the populated page (unified view,
footnote open) with `duplicate-id`, `aria-hidden-focus`, `tabindex` and `listitem`
passing; its 3 `color-contrast` *incomplete* nodes are the known inability to composite
the oklab/`color-mix` tints, so those pairs were measured by hand instead — worst case
4.55:1 (inactive tab) and 4.58:1 (removed-line count) in light, 5.38:1 in dark, diff row
text 10.3–15.7:1. Real Tab moves through textarea → copy → textarea → switch → switch
with `:focus-visible` matching at each step. No browser console messages appeared in
either browser.

Limits: widths are Chrome device-metric emulation and same-origin iframes, not a
physical phone; the switch pill measures 18px tall with a 42×56 hit area confirmed by a
point test, which is the accepted §9 pattern rather than a device check. The 40px
minimum needed two fixes found only in the browser (GOTCHAS §F): shadcn's
`group-data-horizontal/tabs:h-8` variant beat a plain `h-10`, leaving 25px view tabs,
and a synthetic click never activates a Radix tab, which had made one measurement read
the wrong panel. Three defects were corrected this way; nothing was merged, pushed or
deployed, and no production or account data was involved. Private evidence: ignored
`data/investigation/text-diff-20261016/` (`browser-receipt.json`, the four screenshots,
the launcher and its disposable database).

One host condition is worth recording so a later session does not misread it: while this
machine sat near its commit limit (0.3–1.5 GB physical free against a 47 GB commit limit),
the default parallel `npm test` intermittently failed unrelated account suites
(export/email-change/two-factor/passkey) and `npm run build` aborted inside the page-data
workers with a native out-of-memory error. A sequential `node --test
--test-concurrency=1 tests/*.test.cjs` run passed **226/226** during that pressure, and
once memory freed the same tree passed the default `npm test` **226/226** and
`npm run build` with exit 0. No application code changed between those runs; check host
memory before treating either symptom as a regression.

**Local introduction cleanup, 2026-10-16:** full `npm run lint` and full
`npm run build` exit 0, including TypeScript and standalone sanitization.
Both locale JSON files parse and have identical key sets; owner/audience copy
search and `git diff --check` pass. The sandbox initially prevented SWC native
cache validation; the build succeeded with the normal owner cache outside the
sandbox, without changing application dependencies or system cache permissions.

The AI-disabled disposable `tests/auth-preview.cjs` served the fresh production
build. Browser checks covered `/` and `/about` across en/zh, light/dark and
360/1280px (16 combinations): applied language/theme and metadata checked, new
copy present, no personal-audience wording and no horizontal overflow. Inspected
representative rendered screenshots in both locales/themes; no browser console
errors. The installed agent-browser Windows executable was missing, so QA used
the built-in browser fallback. This was browser emulation, not physical-device
acceptance. No new tests or full regression rerun were needed for copy and a
removed paragraph. No real mail, paid AI, production acceptance, push or deployment
occurred for this change. The owned preview was stopped after QA. The subsequent
owner-authorized local commit changes only these reviewed paths and this status
record; the prior lint/build/browser results still apply to the same application code.

**PR #9 production acceptance, 2026-10-16:** exact accepted feature head `8b53778a…`
passed Linux acceptance/security/quality gates; squash merge `69e7a5d…` then passed
CI/CD run [38835232890](https://github.com/sileneer/utils/actions/runs/38835232890):
**206/206 tests**, full lint/build/typecheck/standalone sanitization, final-image
migration/persistence/backup-restore acceptance, image publication and deployment.
The actual running OCI revision is `69e7a5d94070d2e3ce5c0935c1d25bf353f815e1`,
container health is healthy and loopback origin/public tunnel health both pass.
Production integrity, migrations and retained-data comparisons are in §5.

All **25 read-only HTTP checks** pass: public pages/health/book entry, anonymous
account/session responses, 401 for protected account/chat/admin APIs, login redirects
from account/admin pages, blocked raw auth route, invalid revision rejection and
retained-revision HTML CSP/no-store headers. No production export was requested.

Fresh anonymous headless Chrome passes **eight combinations**: en/zh × light/dark ×
360/1280px. Login/passkey affordance and account redirect render correctly; public
reader readiness and theme bridge pass with opaque origin and blocked parent DOM.
No horizontal overflow or page errors. Login/reader screenshots were visually
inspected. The bundled Playwright/Chrome fallback was used because agent-browser's
native Windows binary remains unavailable. This is browser emulation, not a physical
device or authenticated production-account acceptance. Sensitive workflows retain the
disposable local evidence below. No mail, paid AI, production credentials/session
extraction, account/security mutation, real deletion, file cleanup, upload or pruning
was performed. Existing paid-call budgets are unchanged.

Private release evidence: `data/investigation/account-release-20261016/` contains
the exact PR/merge/run receipts, baseline/backup/parity records, HTTP and browser
receipts, screenshots and logs. The handover is an unpublished local documentation
commit; no second main push/deployment was triggered. Earlier entries below are
historical and their local-only publication statements are superseded by this release.

**Codebase audit fix acceptance (2026-10-16):** fresh full offline suite **206/206**,
full lint and production build (TypeScript plus standalone sanitization) exit 0 with the
existing Node 24.19.0 runtime. New cases exercise login issuance on both sides of the
adapter's await, 2FA/password/passkey interleavings, unrelated-account independence,
no ordinary-login cancellation, old challenge invalidation, initial recovery-code refusal,
failed/stopped/replaced transcript cleanup, restored ownership/backfill, conflicting owner
refusal, ledger EACCES/EIO, crash-tail recovery, malformed complete records and prior owed
file cleanup. The book route's response policy is regression-covered for direct access.

Fresh isolated headless Chrome passes **12 account and 12 reader combinations**:
en/zh × light/dark × 360/768/1280px. Account flows include recovery-code login, virtual
passkey registration/removal, 201-conversation export waiver, final deletion, stale reads
and manual retry; card/dialog axe checks have zero violations (the previously documented
secondary-hover OKLCH parser incomplete remains a tool limitation). Reader checks include
theme inside the opaque frame, selection, pinned older-revision citation navigation,
draft/context retention on return and no horizontal overflow. Injected upstream scripts
cannot read storage or authenticated APIs in either iframe or direct navigation, nor the
parent DOM from the iframe. A forced 502 reports failure and retries successfully. The
reader screenshots were captured after animations and visually inspected; no page errors.
No physical-device or real-provider claim is made. Agent-browser's native Windows binary
remains unavailable, so the existing bundled Playwright/Chrome fallback was used.

Evidence is ignored `data/investigation/codebase-audit-20261015/`: `final-tests.log`,
`final-lint.log`, `final-build.log`, `browser-receipt.json`, `reader-browser-receipt.json`,
screenshots and the exact-head PR/CI receipt. Local Docker is unavailable; final Linux
image checks run in the feature PR's acceptance workflow and are recorded separately in
that receipt. The owned preview/browser processes are closed and ports 3041/3042 verified
closed. No real mail, paid AI, production account/data mutation, retained-file cleanup,
merge or deployment occurred. All earlier audit evidence below is historical.

**Subsequent codebase audit verification (2026-10-15, `ff386ce`):** fresh full offline
suite **190/190**, full lint and full production build (including TypeScript and
standalone sanitization) exit 0 on the existing Node 24.19.0 runtime. Three isolated
reproduction scripts exercise six failing-behaviour scenarios: login versus 2FA enable,
login versus password change, pending-factor confirmation with a recovery code,
failed-chat transcript deletion, startup with an unreadable deletion ledger, and an
upstream HTML script reading a synthetic authenticated API in headless Chrome.
The auth tests use the real installed Better Auth/SQLite code, delaying one session
creation to control interleaving; mail is mocked. The chat test uses a synthetic SDK
stream and fake home; the startup test injects `EACCES` only for the fixture ledger.
The browser fixture uses the actual book route with injected HTML, a synthetic API,
an HttpOnly disposable cookie and a fresh browser profile; it never visits production.
All browser/server processes used by that fixture closed on completion. Evidence:
ignored `data/investigation/codebase-audit-20261015/` (`findings.md`, `reproduce-*.cjs`,
`auth-receipt.json`, `storage-receipt.json`, `book-receipt.json`, test/lint/build logs).
These reproductions confirm gaps beyond the green regression suite; they are not
production exploitation evidence. No new full locale/theme/viewport matrix, physical
device acceptance, Docker/CI run, real mail, paid AI or production QA occurred.

**Review-fix acceptance (2026-10-15):** **190/190** offline tests passed (four new
regressions cover mixed verification values/startup, overlapping admin deletions, UTF-8
preflight and explicit export waiver). The normal full lint now passes with runtime
`data/**` excluded in ESLint's own global ignores; no private helper was edited. Full
`npm run build`, TypeScript and standalone sanitization pass using the existing Node
24.19.0/npm installation with normal host permissions for its owner-protected SWC cache.
No system ACL, dependency or secret configuration changed.

Fresh headless Chrome covered both locales, both themes and 360×800/768×1000/1280×1000
viewports (12 combinations). Every combination asserted the actual locale/theme, no
horizontal overflow, a dialog within the viewport height, initial password focus, Escape
focus return and reset of the export acknowledgement on reopening. Card and dialog axe
checks have **0 violations**. Axe cannot parse the existing secondary-hover OKLCH
`color-mix` value (one incomplete color-contrast check); browser canvas conversion and
WCAG luminance calculation independently measured that selected acknowledgement hover
at **12.71:1 light / 12.05:1 dark**. This is a documented tool limitation, not a claimed
zero-incomplete run. Fresh screenshots/contact sheets were visually inspected.

The real browser also completed recovery-code sign-in, virtual-authenticator passkey
registration/removal with different unused recovery codes, deletion request, 201-conversation
export waiver and final deletion with another recovery code; it verified explicit failed-read
retry and exactly one request per stale-session Passkey/deletion card. No page errors.
Evidence: ignored `data/investigation/account-fixes-20261015/` (`tests.log`, `lint.log`,
`build.log`, `browser-receipt.json`, `contrast.log`, `screens/`). Agent-browser's installed
Windows binary was missing, so this run used the already bundled Playwright/Chrome.
This remains emulation/virtual WebAuthn, with no real mail, paid AI, physical-device or
production acceptance. Exact-head CI/image status is recorded separately in the §2 receipt.

The first PR run, `38800631193` on `7128069`, passed Linux lint/tests and built the image,
but image startup failed because raw CLI migration dependencies were absent. This is a
failed initial acceptance, not a release. Docker packaging now copies the missing modules;
image artifact checks require them before startup, and persistence/backup checks compare
all migration filenames rather than the obsolete count of three. The corrected run and
final PR/security/quality status are recorded in the same §2 receipt. Local Docker is
unavailable; final-image acceptance is performed by the unchanged CI gate.

**Historical initial review (2026-10-15, `fa95882`, superseded by the fixes above):** existing regressions
passed **186/186**, TypeScript `--noEmit` passed, ESLint excluding `data/**` passed,
and `git diff --check main...HEAD` passed. Full lint still reports 19 CommonJS-import
errors in six existing ignored investigation helpers. The default npm shim has no
selected nvm version, so checks used the bundled Node v24.19.0 directly. Full build
stopped before compilation on SWC native-cache owner/DACL validation, including an
isolated custom-cache attempt; there is no fresh successful full build or standalone
sanitization from this review. No system permissions or dependencies were changed.
The four isolated reproductions and detailed findings live under ignored
`data/investigation/account-review-20261015/` (`review.md`, `reproduce.cjs`,
`reproduce.log`, and individual check logs). No browser/device, Docker/CI, production,
real-mail or paid-AI acceptance was performed; earlier receipts below remain dated
historical evidence.

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

**Passkey local implementation verification (2026-10-15):** 168 regressions pass across
eleven files, all green, including 17 new `tests/passkey.test.cjs` cases on their own
disposable database and a self-contained software authenticator
(`tests/webauthn-fixture.cjs`: CBOR encoder, COSE key, `none` attestation) rather than a
test dependency. They cover: the generated table matching what the plugin asks for plus the
one hardening index; registration being two steps, needing the password and storing a
credential that actually signs in; a ceremony **without user verification** being refused
and leaving no row and no session; challenges being one-time, purpose-bound (a registration
answer cannot spend a login challenge or the reverse) and never minting an identity; wrong
rpID, wrong origin and an unknown credential all refused; a duplicate credential answered
as `already_registered` rather than a 500, with the server's `excludeCredentials` shape
asserted because the client depends on it; the per-account list capped; every library
`/passkey/*` path 404 from the public door; the sign-in surface accepting nothing but the
credential; an already-signed-in browser unable to answer a login; credentials scoped to
their own account, so another account's credential id cannot be renamed, removed or spent;
rename needing the password and never touching the credential; removal leaving the password
path working and recording exactly `passkey_register` + `passkey_remove` and nothing for the
rename; with two-factor on, adding or removing needing the **live factor** as well; a
verified passkey satisfying the second factor while the same session still cannot change the
password, start an email change or disable the factor without it, and a password-only
sign-in still facing the challenge; the list being security data needing a login inside
24 hours; and nothing secret stored or returned.

Browser QA used an eighth dedicated fixture database under
`data/investigation/account-passkey-20261015/ui/` (3033 app, 3034 outbox and Turnstile
stub), the same persisted runtime-generated auth secret pattern as the two-factor pass, AI
disabled, and a **throwaway headless Chrome driven through CDP with a virtual
authenticator** — its own temporary profile and debug port, killed and deleted at the end,
never touching the owner's browser or any real device. Verified in the running UI: adding a
passkey from the card produces the row with its chosen name, the "unrecognised
authenticator" AAGUID label, the creation timestamp with its zone and the synced/single-device
wording; renaming changes only the label; removal asks through a dialog that names the exact
credential and states that the password still works; the count badge tracks the list;
signing out and then clicking **Sign in with a passkey** yields a real session for that
account; and the security activity card shows the register and the remove and nothing for
the rename. Twenty-four combinations (en/zh × light/dark × 360/768/1280px) were rendered for
the card **with two credentials listed** and for the login surface, with the applied
`dark`/`light` class and `html[lang]` asserted on every run, no horizontal overflow and no
clipped text; images were captured and read. axe-core reported **zero violations** on the
passkeys card and on the login `main`. Keyboard order is trigger → per-row rename/remove →
password → show-password → name → add (9 controls with two rows), each keeping the theme's
focus ring. A passkey sign-in still worked after all 24 navigations.

Four defects in this batch were browser-only and none of them was visible to a server test:
`atob` rejects the unpadded base64url the server sends; `Object.entries()` on an
`AuthenticatorResponse` yields `{}` because its fields are prototype getters, so the posted
credential was empty; the outbound `transports` must stay an **array** because the plugin
joins it; and the inbound `excludeCredentials[].transports` is an array, so calling
`.split(",")` on it threw while building the options — which made **every registration after
an account's first** fail before the prompt ever appeared, while all 17 server-side tests
stayed green. The last one is the reason `tests/passkey.test.cjs` now asserts the shape of
the server's own registration options, and GOTCHAS records the lesson.

Limits of this record: the authenticator is **simulated hardware**. A CDP virtual
authenticator proves the browser↔server path and the rendered contract; it is not a phone,
not a synced account passkey, not Windows Hello or Touch ID's real prompt, not a
password-manager credential and not a hardware key, and it proves nothing about cross-device
behaviour. No passkey was registered on production and none was registered on the owner's
account; the production rpID (`utils.lzhdev.com`) has therefore never been exercised, and
the fixture had to move from `127.0.0.1` to `localhost` because browsers refuse an IP
address as a relying-party id. The 300-second challenge expiry was exercised by aging the
`verification` row, not by waiting. No real mail was sent (passkeys send none by design),
no paid AI call was made, and nothing was merged, pushed or deployed.

**Account deletion local implementation verification (2026-10-15):** 186 regressions pass
across twelve files, all green, including 18 new `tests/deletion.test.cjs` cases on their own
disposable database. They cover: the additive migration and an untouched pre-existing account;
a request removing nothing, recording no security event and refusing to duplicate itself; the
password gate and, with two-factor on, the live-factor gate; the cooling-off and export
preconditions, including that a **narrowed** export does not satisfy them; the typed
confirmation compared against the server's own address rather than a client claim; a completed
deletion leaving zero rows in `user`, `account`, `session`, `conversations`, `messages`,
`ai_usage`, `user_preferences` and `security_events`, an empty `PRAGMA foreign_key_check`, and
the old cookie resolving to `{user: null}`; the address gone from the table that stored it in
the clear and from the keyed digests, while the mail rows themselves and their count survive so
the site's budget stays honest; two accounts kept apart when one goes; withdrawal; an unclaimed
request lapsing without deleting anything; the last administrator refused and permitted again
once a second exists; a stale login and another account's cookie both refused; an active answer
that will not release producing `stop_unconfirmed` and no deletion, then succeeding once it
does; a concurrent security change producing `account_busy`; re-entrancy, where repeating the
deletion cannot reach a second identity; and the resurrection guard, where a database copied
from **before** the deletion is reconciled by the same `migrate()` the server runs at startup —
the deleted identity is removed again, the account that was never deleted is untouched, and a
fresh registration of the same address under a new id is left alone.

Browser QA used the ninth loopback fixture plus a throwaway headless Chrome, and deleted only
the account the script had created minutes earlier. Verified in the running UI: request →
withdraw → request again → the waiting period moved past rather than waited out → export
generated → the final button appearing, disabled until the password is typed and enabled after;
the confirmation dialog naming the exact address, stating the backup limit, and holding focus
with `aria-labelledby` set; Escape closing it and returning focus to the button that opened it;
a wrong typed address **leaving the dialog open** with its own reason while the account is
untouched; then completion, the neutral notice, the deleted account's `localStorage` keys empty
while another account's draft key on the same browser is still there, and the pending
verification address cleared from `sessionStorage`. The SDK transcript sweep was exercised
against a fake home directory: the account's own transcript file was removed and its neighbour
in the same shared project directory was left standing, with nothing owed recorded afterwards.
Twenty-four combinations (en/zh × light/dark × 360/768/1280px) were rendered for the card with
an open request, with the applied theme class and `html[lang]` asserted on every run, no
horizontal overflow and no clipped text; axe-core reported **zero violations** on the card and
on the confirmation dialog. Keyboard order is trigger → export link → password → show-password
→ withdraw → delete, each with a visible focus ring.

Limits of this record: **no real account, retained file, backup or production SDK transcript
was ever deleted**, and executing this against production data needs the owner's approval of
the ARCHITECTURE §5 list; no restore drill was performed against a real backup artefact; the
`data/agent/sessions/*.json` legacy files and the shared `versions/**` pairs are retained by
design and are outside this feature; and there is no scheduler, so an unconfirmed request can
only lapse, never fire. No real mail was sent (deletion sends none by design), no paid AI call
was made, and nothing was merged, pushed or deployed.
