#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set" >&2
  exit 1
fi

OUTPUT_DIR=${OUTPUT_DIR:-./backups}
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

pg_dump "$DATABASE_URL" > "$OUTPUT_DIR/fengine_${TIMESTAMP}.sql"
echo "Backup written to $OUTPUT_DIR/fengine_${TIMESTAMP}.sql"
