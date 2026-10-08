# AGENTS.md

Rules for AI coding agents working in this repository. This file is deliberately
short and holds **only rules** — facts live in one place each, here is the map.

## Project

**utils** is the utilities webapp for [lzhdev.com](https://lzhdev.com): personal
and family tools, maintained as an open-source product anyone can self-deploy.
**Live: https://utils.lzhdev.com** · repo `sileneer/utils` (public, MIT).

**Core purpose (owner, 2026-10-04):** Docker exists so we can run AI agents like
**Claude Code on our own server**; this webapp is the **UI shell wrapped around
those agents** — users chat with server-side agents from the browser. The other
tools are secondary to this goal.

**Status:** M1–M4 shipped (M4 = agent chat + `/htlb` reading page, 2026-10-07).
**Start every session at [docs/HANDOVER.md](docs/HANDOVER.md)** — it says where the
work actually stands, what is uncommitted, what is next, and which decisions are
waiting on the owner. Long-term roadmap and milestone acceptance criteria:
[docs/PLANNING.md](docs/PLANNING.md) §7.

## Where things get written (standing rule from the owner)

All docs here are living, self-maintained. Route new knowledge to **one** home —
do not copy a fact into a second file, link to its home instead. A stale
duplicate is worse than a missing one: this file used to claim the deploy
pipeline uses GitHub Secrets, months after it went keyless.

| What you learned | Its home |
|---|---|
| A rule or workflow an agent must follow while working here | **this file** |
| How the running app is assembled — routes, agent/SSE contract, workspace, data layout, env variables | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| How it ships and how to operate/debug production — pipeline, identities, server access, rollback, drills | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Anything that cost a debugging round — symptom → cause → fix | [docs/GOTCHAS.md](docs/GOTCHAS.md) |
| **Any** new UI component, token, or library — written here **before** it is installed or shipped | [docs/DESIGN.md](docs/DESIGN.md) (BINDING; §4.1 introduction flow, §11 anti-churn checklist) |
| Why a decision was made, what was rejected, roadmap, risks | [docs/PLANNING.md](docs/PLANNING.md) (decision log, Chinese) |
| **Where we are right now** — uncommitted work, next actions, blocked-on-owner items | [docs/HANDOVER.md](docs/HANDOVER.md) (rewrite it each handover; never let it accumulate) |

Doc updates ship **in the same commit** as the work that produced them. Read the
relevant doc before touching the area it covers; update it if you change what it
describes.

## Stack (decided — do not re-litigate without updating PLANNING.md first)

Next.js (App Router) + TypeScript, `output: 'standalone'` · Tailwind CSS v4 +
shadcn/ui + next-themes, **DESIGN.md binding** · `@anthropic-ai/claude-agent-sdk`
against SenseNova's Anthropic-compatible endpoint · single multi-stage Dockerfile
→ GHCR → GitHub Actions push-to-main deploy to a 1 GB GCP VM behind a Cloudflare
Tunnel · SQLite account/chat state plus book files on a Docker volume · secrets only in the
server `.env`. Details: ARCHITECTURE §1–3, DEPLOYMENT §1–3.

## Commands

```bash
npm install
npm run dev            # http://localhost:3000
npm run lint           # eslint — part of the CI gate
npm run build          # production build; ALSO type-checks (a green "Compiled successfully" is not enough)
npx shadcn@latest add <component>   # approved registry only (DESIGN.md §4.1)
```

No Docker on the dev machine as of 2026-10-07 — images are built by CI only; the
container check (`docker compose -f deploy/docker-compose.yml up --build`) runs
wherever Docker exists. Agent chat locally needs `.env` copied from
`.env.example`; `/htlb` reading works with no env at all.

## Definition of done

1. `npm run lint` **and** `npm run build` exit 0 locally.
2. The Actions run for your push is **green** — deploys happen automatically on merge to `main`; verify the live site afterwards (DEPLOYMENT §8), don't assume.
3. UI changes checked in **light + dark** themes and at **360 px** width.
4. New UI component/library already recorded in DESIGN.md (§4.1) before use.
5. Docs updated in the same commit, in the right home per the table above.
6. No secret, key, token, or passcode value in any committed file.
7. If your work changed the picture — something committed or left uncommitted, a
   next step finished, a new blocker — `docs/HANDOVER.md` §2/§4/§7 reflects it
   before you end the session. An accurate handover is worth more than a tidy one.

## Conventions

- Code, comments, README, AGENTS.md, and the new `docs/*` references in **English**; `docs/PLANNING.md` stays Chinese.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, …), scoped where useful (`fix(m4): …`).
- Keep commits small and focused; never mix formatting-only changes with functional ones.
- Prefer minimal dependency additions; justify any new dependency in the commit message.

## Security rules (hard constraints)

1. **NEVER commit secrets** — `.env`, API keys, tokens, SSH keys, connection strings. `.env.example` is the only env file allowed in git, with values commented out. **This repo is public and its history is permanent.**
2. Provider, authentication, mail and Turnstile secret keys live **only** in `/opt/utils/.env` (chmod 600) — never in client code, never in the image, never logged, never echoed into a doc or commit message. Local QA uses explicit mock services and disposable credentials. The retired `CHAT_PASSCODE` must never authorize public accounts.
3. Every paid upstream call goes through a server-side route handler that injects the key. Nothing in the browser may call an AI provider directly.
4. Do not weaken or bypass the auth gate, `/api/health`, the deploy healthcheck gate, or the pipeline's guards. The pipeline is deliberately **keyless** (WIF + ephemeral SSH key): do not "simplify" it by adding a long-lived secret.
