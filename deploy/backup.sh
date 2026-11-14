#!/usr/bin/env bash
# Run as utils-deploy after account release. Consistent SQLite backup, no secrets output.
set -euo pipefail
umask 077
exec 9>/opt/utils/backup.lock
flock -n 9 || { echo "another backup is already running" >&2; exit 1; }
docker exec utils-utils-1 node scripts/backup.cjs

# Offsite: push the newest snapshot to GCS (bucket lifecycle deletes after 30d).
# gcloud authenticates as the VM service account; no credentials stored on disk.
# The snapshot files are created by the container user with 0600, unreadable by
# utils-deploy — so stream them out via docker exec instead of reading on host.
LATEST=$(docker exec utils-utils-1 sh -c 'ls -1t /app/data/backups/utils-*.sqlite 2>/dev/null | head -1' | xargs -r basename)
if [ -n "$LATEST" ]; then
  docker exec utils-utils-1 cat "/app/data/backups/$LATEST" \
    | gcloud storage cp --quiet - "gs://gen-lang-client-0642815057-vm-backups/utils/$LATEST" >/dev/null
  echo "uploaded: $LATEST"
fi
