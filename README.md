# utils

Self-hosted web utilities — personal tools, family-friendly apps, and AI helpers
backed by agents running on your own server.

**Live:** [utils.lzhdev.com](https://utils.lzhdev.com) · MIT · Next.js 16 + TypeScript

## What's here

| | |
|---|---|
| **`/htlb` — reading + ask-the-book** | Full-screen reader for [HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter) (CC BY 4.0), with an AI sidebar. The assistant runs **Claude Code on the server**, searches verified book content using restricted read-only tools, and answers with section/item citations. Verified email/password accounts protect owned history; AI access is controlled by server configuration. |
| **Planned tools** | text diff, QR studio, JSON formatter, unit converter — see the registry in `src/lib/tools.ts` |

More tools are on the way; the interesting part is the pattern: heavy AI work
happens server-side, the browser never sees a key.

## Why it exists

Docker and a self-hosted VM exist for one reason: to run AI agents like Claude
Code on **our** server. This webapp is the UI shell around them — you chat with a
server-side agent from the browser, and the agent gets real tools and a real
workspace. Everything else is secondary.

## Tech stack

- Next.js (App Router) + TypeScript + React 19, `output: 'standalone'`
- Tailwind CSS v4, shadcn/ui, lucide-react, next-themes, next-intl (en/zh)
- `@anthropic-ai/claude-agent-sdk` against any Anthropic-compatible endpoint
- Better Auth + SQLite on the persistent volume; Brevo OTP mail and Turnstile
- Docker / docker compose, image on GHCR, GitHub Actions push-to-main deploy

## Development

```bash
npm install
cp .env.example .env    # fill in what you need — see below
npm run dev             # http://localhost:3000
npm run lint && npm run build
```

The reader at `/htlb` works with an empty `.env`. Account/AI runtime variables
are documented in [ARCHITECTURE §8](docs/ARCHITECTURE.md#8-environment-contract),
with service setup and secure handoff in [DEPLOYMENT §11](docs/DEPLOYMENT.md#11-account-release-preparation-and-operations).
AI requires explicit activation and positive daily quotas. Dev/start applies
versioned migrations before serving; old unowned JSON chats are not imported.
Provider credentials, endpoint, default and offered model IDs are runtime `.env`
configuration; see [ARCHITECTURE §8](docs/ARCHITECTURE.md#8-environment-contract).

## Self-deploy

```bash
docker compose -f deploy/docker-compose.yml up -d --build   # or pull ghcr.io/sileneer/utils:latest
```

The app listens on `:3000`; put a reverse proxy or tunnel in front of it and
mount `./data` for persistence. Full production setup — CI/CD, TLS, deploy
script, rollback, monitoring — is documented in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| | |
|---|---|
| [AGENTS.md](AGENTS.md) | working rules for humans and AI coding agents |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | routes, agent runtime, data layout, env contract |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | ops runbook: pipeline, server access, rollback |
| [docs/GOTCHAS.md](docs/GOTCHAS.md) | everything that broke, and why |
| [docs/DESIGN.md](docs/DESIGN.md) | binding design system (tokens, components, a11y) |
| [docs/PLANNING.md](docs/PLANNING.md) | decision log and roadmap (Chinese) |

Contributing guide, issue/PR templates, and screenshots land with **M5**.

## License

[MIT](LICENSE)
