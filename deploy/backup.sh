#!/usr/bin/env bash
# Run as utils-deploy after account release. Consistent SQLite backup, no secrets output.
set -euo pipefail
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker exec utils-utils-1 node scripts/database.cjs backup "/app/data/backups/utils-${stamp}.sqlite"
