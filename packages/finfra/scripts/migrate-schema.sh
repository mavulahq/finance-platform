#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT_DIR"

PATH=$HOME/.local/share/pnpm:$PATH \
  "$HOME/.local/share/pnpm/pnpm" \
  --filter @getfluxo/fengine prisma:migrate
