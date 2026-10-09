#!/usr/bin/env bash
# Run as utils-deploy after account release. Consistent SQLite backup, no secrets output.
set -euo pipefail
umask 077
exec 9>/opt/utils/backup.lock
flock -n 9 || { echo "another backup is already running" >&2; exit 1; }
docker exec utils-utils-1 node scripts/backup.cjs
