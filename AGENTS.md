# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project overview

**utils** is the utilities webapp for [lzhdev.com](https://lzhdev.com) — a collection of personal and family tools, also maintained as an open-source product. Planned live URL: **https://utils.lzhdev.com**.

**Core purpose (owner, 2026-10-04):** Docker exists so we can run AI agents like **Claude Code on our own server**; this webapp is the **UI shell wrapped around those agents** — users chat with server-side agents from the browser. The other tools are secondary to this goal.

The full plan, decision log, and research citations live in [docs/PLANNING.md](docs/PLANNING.md) (written in Chinese). Read it before making architectural changes.

## Document maintenance (standing rule from the owner)

All docs in this repository are **living, self-maintained documents** — standing instruction from the owner (2026-10-04):

- **AGENTS.md**: whenever durable facts emerge from conversations or work — decisions, conventions, gotchas, environment specifics — record them here proactively. Do not wait to be asked.
- **docs/DESIGN.md**: any new UI component or component library must be **written into DESIGN.md first**, then introduced in code (see the introduction flow in DESIGN.md §4.1).
- **docs/PLANNING.md**: architecture and deployment decisions go into its decision log.

Rule of thumb: if a future session would benefit from knowing it, it belongs in one of these files — not only in the conversation. Doc updates ship in the same commit as the work that produced them.

## Current status

**M3 complete (2026-10-04) — full CI/CD is live: every push to `main` auto-deploys to https://utils.lzhdev.com.**

Pipeline (`.github/workflows/deploy.yml`, concurrency-grouped `deploy-prod`):

1. **test** — lint + build (gates everything)
2. **build-push** — buildx multi-stage build → `ghcr.io/sileneer/utils:<sha>` + `:latest` (public, anonymous pull)
3. **deploy** — keyless: `google-github-actions/auth@v2` with Workload Identity Federation (provider restricted to `sileneer/utils` @ `refs/heads/main`) → authenticates as `utils-deploy@gen-lang-client-0642815057.iam.gserviceaccount.com` → writes an **ephemeral** ed25519 key to instance-level metadata → SSH through the IAP tunnel as user `utils-deploy` → runs `/opt/utils/deploy.sh` (flock → `compose pull` → `up -d` → healthcheck gate with auto-rollback → prune, keep 3 images) → removes the ephemeral key. **No long-lived secrets exist anywhere in the pipeline.**

Monitoring: deploy.sh pings healthchecks.io (check `utils-deploy`, 7-day period + 1-day grace, email alert to 15061477522@163.com) — success ping resets the dead-man timer, healthcheck-gate failure pings `/fail` for an immediate alert. `HEALTHCHECK_URL` lives in the server `.env` and locally in `.env.monitoring` (both gitignored). `/api/health` supports a drill switch: `DRILL_FAIL_HEALTH=1` in the container env returns 503 so the rollback path can be exercised (used for the 2026-10-04 drill; remove the env var to restore).

Live serving: Cloudflare Tunnel `b77c920a-2ce7-4556-96ff-1676c0453a37` (cloudflared systemd service) → `http://localhost:3100`. Zero public ports; SSH only via IAP (35.235.240.0/20).

Server ops (interactive): `gcloud compute ssh instance-20260904-233454 --zone us-east1-c --tunnel-through-iap` — app at `/opt/utils`, deploy user `utils-deploy` (docker group), logs: `sudo journalctl -u cloudflared` / `sudo docker compose -f /opt/utils/docker-compose.yml logs -f`.

## Tech stack (decided — do not re-litigate without updating PLANNING.md first)

- **Framework**: Next.js (App Router) + TypeScript, `output: 'standalone'`
- **UI**: Tailwind CSS v4 + shadcn/ui + lucide-react + next-themes — see **[docs/DESIGN.md](docs/DESIGN.md) (BINDING)**
- **Packaging**: multi-stage Dockerfile → image pushed to GHCR (`ghcr.io/<owner>/utils:<git-sha>`)
- **CI/CD**: GitHub Actions — test → build → GHCR → SSH deploy to the server (`deploy.sh`: compose pull + up + healthcheck)
- **Hosting**: own VPS behind Cloudflare; `utils.lzhdev.com` (CF proxied DNS → reverse proxy → container)
- **Secrets**: server `.env` (never in git) + GitHub Secrets only

## Design system (binding)

**All UI work must follow [docs/DESIGN.md](docs/DESIGN.md)** — the binding design-system spec: design tokens (oklch), typography, component rules, layout patterns, accessibility, and the agent anti-churn checklist. Non-negotiables:

- Semantic token classes only (`bg-background`, `text-muted-foreground`, …) — no raw color literals or second styling system.
- Inter (body) + Outfit (display) + JetBrains Mono (code) via `next/font`; lucide-react icons only.
- Every UI change is verified in **light + dark themes** and at **360px width** before it is considered done.
- Add base components with `npx shadcn@latest add <component>`; never hand-roll what `src/components/ui/` already covers; extend via wrappers.

## Commands

```bash
npm install                          # install dependencies
npm run dev                          # dev server at http://localhost:3000
npm run build                        # production build (standalone output in .next/standalone)
npm run start                        # serve the production build
npm run lint                         # eslint
npx shadcn@latest add <component>    # add pre-approved ui components (DESIGN.md §4.1)
```

Container check (needs Docker — not available locally yet): `docker compose -f deploy/docker-compose.yml up --build`

## Repository layout

```
AGENTS.md            # this file (CLAUDE.md points here)
README.md            # public-facing intro (English)
LICENSE              # MIT
docs/PLANNING.md     # full planning + decision log (Chinese)
docs/DESIGN.md       # binding UI design system
Dockerfile           # multi-stage standalone build (repo root — build context is the repo)
deploy/              # docker-compose.yml (+ deploy.sh, receiver from M3)
src/app/             # routes: pages, /api/health
src/components/ui/   # shadcn components (adopted registry: DESIGN.md §4.1)
src/components/      # project components (layout/, icons/, tool-card, theme-*)
src/lib/             # shared logic (utils, tools registry)
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
