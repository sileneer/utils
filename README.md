# utils

The [lzhdev](https://lzhdev.com) tools website.

**Live:** [utils.lzhdev.com](https://utils.lzhdev.com) · MIT · Next.js 16 + TypeScript

## What's here

| | |
|---|---|
| **`/` and `/account` — shared accounts** | Home/header account entry and account center for profile, password and login-session management. Present and future modules share the same verified identity; public tools remain public. |
| **`/htlb` — reading + ask-the-book** | Full-screen reader for [HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter) (CC BY 4.0), with an AI sidebar. The assistant runs **Claude Code on the server**, searches verified book content using restricted read-only tools, and answers with section/item citations. Verified email/password accounts protect owned history; AI access is controlled by server configuration. |
| **`/text-diff` — text comparison** | Diff two pasted texts in the browser: line-by-line changes with inline word marks, side-by-side or unified view, hunk navigation, ignore-case and ignore-trailing-whitespace options. No account, no upload, nothing stored or put into the URL. |
| **`/qr-studio` — QR codes** | Turn text, a link or a Wi-Fi network into a QR code in the browser: error-correction level, quiet zone, colours, PNG and SVG export. The link is only encoded, never opened; a Wi-Fi password never leaves the tab. |
| **`/json-formatter` — JSON** | Validate, format (2 spaces, 4 spaces or Tab) and minify JSON in the browser, with the failure reason and line/column. Numbers keep the digits you wrote — a 30-digit integer, `1.50`, `1e2` and `-0` are not rewritten — key order is preserved and a duplicate key is reported instead of silently overwritten. |
| **`/unit-converter` — units** | Convert length, area, volume, mass, temperature, speed and time in the browser. Each category goes through one base unit, area and volume factors are the square and cube of length, and temperature keeps its offsets instead of a multiplier — so `1 in` is `2.54 cm`, `0 °C` is `32 °F` and `32 °F` is exactly `0 °C`. US and Imperial gallons are separate, and there are no exchange rates. |
| **`/admin` — operations** | Administrator-only request/usage aggregates and backup status; see the [runtime contract](docs/ARCHITECTURE.md#10-administrator-operations). |
| **Planned tools** | AI chat — see the registry in `src/lib/tools.ts` |

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
npm test
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
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | shared working rules and Claude Code entrypoint |
| [docs/HANDOVER.md](docs/HANDOVER.md) | start here: checkout, last verified release, remaining work |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | routes, agent runtime, data layout, env contract |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | ops runbook: pipeline, server access, rollback |
| [docs/GOTCHAS.md](docs/GOTCHAS.md) | everything that broke, and why |
| [docs/DESIGN.md](docs/DESIGN.md) | binding design system (tokens, components, a11y) |
| [docs/PLANNING.md](docs/PLANNING.md) | decision log and roadmap (Chinese) |

Contributing guide, issue/PR templates, and screenshots land with **M5**.

## License

[MIT](LICENSE)
