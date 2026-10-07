# Build a minimal production image for the standalone Next.js server.
# Context: repo root (`docker build -f Dockerfile .` from the repo root,
# or the `build:` block in deploy/docker-compose.yml).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next/font downloads Google Fonts at build time and self-hosts them.
RUN npm run build

# Runner is Debian slim (glibc): the agent SDK's bundled Claude Code CLI
# and its ripgrep need glibc, and git/wget support workspace init + healthcheck.
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
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data /home/nextjs
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
