#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ENVIRONMENT=staging KUBE_CONTEXT=${KUBE_CONTEXT:-staging} bash "$SCRIPT_DIR/deploy.sh"
