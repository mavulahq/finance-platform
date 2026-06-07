#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set" >&2
  exit 1
fi

OUTPUT_DIR=${OUTPUT_DIR:-./backups}
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$OUTPUT_DIR/fengine_${TIMESTAMP}.sql"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
elif command -v docker >/dev/null 2>&1; then
  docker compose exec -T postgres pg_dump -U getfluxo -d getfluxo > "$BACKUP_FILE"
else
  echo "pg_dump not found and Docker is not available" >&2
  exit 1
fi

echo "Backup written to $BACKUP_FILE"
