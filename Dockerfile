# Build a minimal production image for the standalone Next.js server.
# Context: repo root (`docker build -f Dockerfile .` from the repo root,
# or the `build:` block in deploy/docker-compose.yml).

# deps/builder use Debian slim (glibc) on purpose: the agent SDK ships its CLI
# as a platform-optional native binary selected by libc — musl (alpine) makes
# npm silently skip it and the runtime fails with "Native CLI binary not found".
FROM node:22-slim AS deps
WORKDIR /app
# npm ci can invoke node-gyp for SQLite even when its bundled prebuild is used.
# Keep the toolchain in the dependency stage; it never enters the runner image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next/font downloads Google Fonts at build time and self-hosts them.
RUN npm run build

# Runner is Debian slim (glibc) to match the build stages: the agent SDK's
# bundled Claude Code CLI is a glibc native binary; git supports workspace
# init and wget backs the compose healthcheck.
FROM node:22-slim AS runner
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/home/nextjs
RUN groupadd -g 1001 nodejs && useradd -m -u 1001 -g nodejs -d /home/nextjs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/database.cjs ./src/lib/database.cjs
# Explicitly carry the native SQLite binding and loader; verify in Linux CI.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
# The agent SDK resolves its platform CLI binary from a sibling optional
# package at runtime — Next's standalone tracing doesn't carry it over.
COPY --from=builder --chown=nextjs:nodejs \
    /app/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64 \
    /app/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data /home/nextjs
USER nextjs
EXPOSE 3000
CMD ["node", "scripts/start.cjs"]
