#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ENVIRONMENT=production KUBE_CONTEXT=${KUBE_CONTEXT:-production} bash "$SCRIPT_DIR/deploy.sh"
