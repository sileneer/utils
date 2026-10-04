# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project overview

**utils** is the utilities webapp for [lzhdev.com](https://lzhdev.com) — a collection of personal and family tools, also maintained as an open-source product. Planned live URL: **https://utils.lzhdev.com**.

The full plan, decision log, and research citations live in [docs/PLANNING.md](docs/PLANNING.md) (written in Chinese). Read it before making architectural changes.

## Current status

Planning phase (M0 complete). Next milestone: **M1** — Next.js scaffold + Dockerfile (`output: 'standalone'`) + docker compose. See docs/PLANNING.md §7 for the milestone table.

## Tech stack (decided — do not re-litigate without updating PLANNING.md first)

- **Framework**: Next.js (App Router) + TypeScript, `output: 'standalone'`
- **Packaging**: multi-stage Dockerfile → image pushed to GHCR (`ghcr.io/<owner>/utils:<git-sha>`)
- **CI/CD**: GitHub Actions — test → build → GHCR → SSH deploy to the server (`deploy.sh`: compose pull + up + healthcheck)
- **Hosting**: own VPS behind Cloudflare; `utils.lzhdev.com` (CF proxied DNS → reverse proxy → container)
- **Secrets**: server `.env` (never in git) + GitHub Secrets only

## Commands (to be finalized in M1)

```bash
npm install          # install dependencies
npm run dev          # dev server
npm run build        # production build
npm run lint         # lint
```

Container check (from M1): `docker compose -f deploy/docker-compose.yml up --build`

## Repository layout

```
AGENTS.md            # this file
README.md            # public-facing intro (English)
LICENSE              # MIT
docs/PLANNING.md     # full planning doc (Chinese)
deploy/              # Dockerfile, compose, deploy.sh (from M1)
src/                 # app code (from M1)
.github/workflows/   # CI/CD (from M3)
```

## Conventions

- Code, comments, README, and AGENTS.md in **English**; internal docs under `docs/` may be in Chinese.
- Commit messages follow **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, ...).
- Keep commits/changes small and focused; do not mix formatting-only changes with functional changes.
- Prefer minimal dependency additions; justify any new dependency in the PR/commit message.

## Security rules (hard constraints)

1. **NEVER commit secrets** — `.env`, API keys, tokens, SSH keys, connection strings. The only env file allowed in git is `.env.example`.
2. AI provider keys live **only** in the server `.env` (chmod 600) or GitHub Secrets — never in client-side code, never in the Dockerfile, never logged.
3. Do not weaken or bypass auth middleware, health checks, or deploy pipeline guards.
4. Any user-facing tool that proxies an external paid API must go through a server-side route handler that injects the key — never call paid APIs directly from the browser.

## Deployment overview

`push main` → GitHub Actions (test → build → push `ghcr.io/<owner>/utils:<sha>`) → SSH deploy (`deploy.sh`: flock → compose pull → up -d → healthcheck gate → prune). Rollback = point compose back to the previous image tag. Full design and rationale: docs/PLANNING.md §4 and §6.
