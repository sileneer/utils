# AGENTS.md

Rules for AI coding agents working in this repository. Claude Code imports this
same file through [CLAUDE.md](CLAUDE.md); do not maintain a second rulebook.

## Start here

**Start every session at [docs/HANDOVER.md](docs/HANDOVER.md).** Reconcile its
claims with the checkout and relevant evidence before acting. Prioritize the
owner's core purpose: a browser UI for server-side agents; other tools are secondary.
Product scope and decisions: [docs/PLANNING.md](docs/PLANNING.md) §1/§7/§11–13.

## Where things get written

All docs are living and self-maintained. Give each fact **one canonical home**;
other files link to it. Read the relevant doc before changing its area and ship
matching doc changes in the same commit.

| What you learned | Its home |
|---|---|
| Rules or workflows agents must follow | **this file** |
| Routes, agent/SSE contract, workspace, data layout, env variables | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Pipeline, server access, rollout, rollback, operational drills | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Debugging lessons: symptom → cause → fix | [docs/GOTCHAS.md](docs/GOTCHAS.md) |
| New UI component, token, pattern or library, **before use** | [docs/DESIGN.md](docs/DESIGN.md) (binding; §4.1/§11) |
| Rationale, rejected alternatives, roadmap, risks | [docs/PLANNING.md](docs/PLANNING.md) (Chinese) |
| Current checkout, unfinished work, next actions, owner decisions | [docs/HANDOVER.md](docs/HANDOVER.md) (rewrite at handover) |

Label historical decisions and superseded contracts explicitly. Keep dated QA
receipts separate from current facts; a prior green run or screenshot does not
prove today's runtime. Keep private investigation evidence out of Git.

## Implementation rules

- Follow the selected stack in ARCHITECTURE §1 and binding DESIGN.md. Changing a
  stack decision requires rationale in PLANNING.md first; minimize dependencies.
- Reuse the **site-wide account system** for every present/future module; follow
  ARCHITECTURE §5's integration recipe. Do not introduce module-specific login,
  identity stores or client-only authorization. Keep public tools/reading public.
- Provider key, endpoint, default model and picker catalog are runtime server
  configuration (ARCHITECTURE §8), not compiled constants. Preserve fail-closed
  behavior and the separation of account access from AI availability/quotas.
- Message details must reflect observed events/reported usage. Preserve unavailable
  fields; do not invent token counts, reasoning, cost or completion, or make extra
  model calls for titles/metadata. Contract: ARCHITECTURE §3; UI: DESIGN §5.6.1.
- Preserve source-version ownership, retained book pairs, account/chat data and
  backups. Cleanup requires reference/retention checks and appropriate authorization;
  apparent duplication is not evidence that a retained copy is safe to delete.

## Working scope and publication

- Carry out the approved scope without requesting the same approval again.
  Implementation approval and publication approval are distinct unless the owner
  authorizes both. Present a concrete reviewable result before a new release request.
- A push to `main` automatically deploys. Documentation maintenance alone does not
  authorize another production rollout. Use a `codex/` branch for unpublished work.
- Before an authorized merge, verify the exact accepted PR head and all required
  CI/image/security gates. After publication verify the actual running revision,
  health and relevant routes/data (DEPLOYMENT §8); never infer success from merge.
- Real paid AI QA needs an explicitly bounded allowance. Track used/remaining calls
  in HANDOVER, count attempted upstream calls and do not silently retry, renew a
  spent allowance, switch models or expand timeouts to force a pass.
- Account/config releases use read-only production acceptance by default; exercise
  sensitive mutations with disposable local accounts. The owner types production
  passwords/codes on the website. Never mint/export cookies or sessions for QA.
- Inspect existing changes first. Preserve owner-owned `.zcode/`, ignored
  investigations and unrelated files; stage explicit reviewed paths.
  Stop only owned QA processes after verifying their command lines.

## Commands

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # meaningful route/auth/SQLite/stream regressions
npm run lint           # ESLint, part of CI
npm run build          # must exit 0 after typecheck and standalone sanitization
npx shadcn@latest add <component>   # DESIGN.md registration required first
```

Local setup, disposable preview and Docker verification: DEPLOYMENT §8.
Runtime configuration template: `.env.example`, contract: ARCHITECTURE §8.

## Definition of done

1. `npm run lint` **and** full `npm run build` exit 0 locally; run tests appropriate
   to the change. Do not add implementation-mirroring tests for low-impact edits.
2. For published work, the exact Actions run is green and live acceptance passes.
   For local-only work, state clearly that no deployment/production QA occurred.
3. UI changes pass both locales, light/dark themes and 360px plus desktop checks.
   Distinguish browser emulation from physical-device and real-provider acceptance.
4. New UI components/libraries/patterns were recorded in DESIGN.md before use.
5. Docs are updated in the right home in the same commit; no secrets are committed.
6. HANDOVER §2/§4/§7 accurately records checkout changes, remaining work and actual
   verification, including any uncommitted/owner-owned material, before ending.

## Conventions

- Code, comments, README, AGENTS.md and docs in English; PLANNING.md in Chinese.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, …); small focused commits.
- Branch prefix `codex/`; never mix unrelated formatting or owner changes into work.

## Security rules (hard constraints)

1. **NEVER commit secrets**: `.env`, keys, tokens, SSH keys or connection strings.
   `.env.example`, with values commented out, is the only tracked env file allowed.
   This repository is public and its history is permanent.
2. Provider/auth/mail/Turnstile secret keys live only in `/opt/utils/.env`, mode 600:
   never in client code, images, logs, documentation or commit messages. Local QA
   uses explicit mocks and disposable, runtime-generated credentials; do not commit
   password literals that resemble real credentials. Retired `CHAT_PASSCODE` must
   never authorize public accounts.
3. Every paid upstream call goes through a server route that injects the key;
   browsers never call the AI provider directly.
4. Preserve auth/ownership/origin checks, `/api/health`, deploy health gates and the
   keyless pipeline (WIF + ephemeral SSH key). Never add long-lived deploy secrets
   or bypass guards to repair automation or satisfy a test.
