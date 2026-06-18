#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
export KUBE_CONTEXT=${KUBE_CONTEXT:-k3s}
export APPLY_MONITORING=${APPLY_MONITORING:-false}

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required to deploy to k3s." >&2
  exit 1
fi

if ! kubectl config get-contexts "$KUBE_CONTEXT" >/dev/null 2>&1; then
  echo "Kubernetes context '$KUBE_CONTEXT' was not found. Set KUBE_CONTEXT to your k3s context." >&2
  exit 1
fi

bash "$ROOT_DIR/scripts/deploy.sh"

NAMESPACE=getfluxo APP_LABEL=fengine KUBE_CONTEXT="$KUBE_CONTEXT" bash "$ROOT_DIR/scripts/health-check.sh"
NAMESPACE=getfluxo APP_LABEL=fwk KUBE_CONTEXT="$KUBE_CONTEXT" bash "$ROOT_DIR/scripts/health-check.sh"
