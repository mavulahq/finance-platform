#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)

PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH \
  "$HOME/.local/share/pnpm/.tools/pnpm-exe/10.33.0/pnpm" \
  --filter @getfluxo/fengine prisma:migrate
