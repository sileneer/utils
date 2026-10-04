#!/usr/bin/env bash
# utils deploy script — executed by the GitHub Actions deploy job over IAP SSH
# as user `utils-deploy` (member of the docker group; no sudo needed).
# Flow: flock → record previous image → compose pull → up -d → healthcheck gate
#       → prune old images (keep 3) — with automatic rollback on failed healthcheck.
# Monitoring: pings healthchecks.io ($HEALTHCHECK_URL from .env) on success and
#       signals /fail when the healthcheck gate fails (dead-man + immediate alert).
set -euo pipefail

cd /opt/utils

# Monitoring URL lives in .env (same file compose reads). Skip if already in env.
if [ -z "${HEALTHCHECK_URL:-}" ] && [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
ping_fail() {
  [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "$HEALTHCHECK_URL/fail" > /dev/null 2>&1 || true
}

exec 9>deploy.lock
flock -n 9 || { echo "another deploy is already in progress; aborting" >&2; ping_fail; exit 1; }

echo "deploy starting at $(date -u +%FT%TZ)"

PREV_IMAGE=$(docker inspect --format '{{.Image}}' utils-utils-1 2>/dev/null || true)

docker compose pull
docker compose up -d --remove-orphans

for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3100/api/health > /dev/null; then
    echo "healthy after check ${i}/30"
    docker images ghcr.io/sileneer/utils --format '{{.ID}}' | tail -n +4 | xargs -r docker rmi -f > /dev/null 2>&1 || true
    if [ -n "${HEALTHCHECK_URL:-}" ]; then
      curl -fsS -m 10 "$HEALTHCHECK_URL" > /dev/null 2>&1 || true
    fi
    echo "deploy OK"
    exit 0
  fi
  sleep 2
done

echo "health check failed after 60s — rolling back" >&2
if [ -n "$PREV_IMAGE" ]; then
  docker tag "$PREV_IMAGE" ghcr.io/sileneer/utils:latest
  docker compose up -d
  echo "rolled back to previous image" >&2
else
  echo "no previous image to roll back to" >&2
fi
ping_fail
exit 1
