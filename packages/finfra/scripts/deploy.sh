#!/usr/bin/env bash
# getfluxo.io - Deployment & Infrastructure
# Copyright (c) 2026 getfluxo.io
# License: PROPRIETARY

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
KUBE_CONTEXT=${KUBE_CONTEXT:-}
APPLY_EXTERNAL_SECRETS=${APPLY_EXTERNAL_SECRETS:-false}
APPLY_MONITORING=${APPLY_MONITORING:-false}

KUBECTL=(kubectl)
if [ -n "$KUBE_CONTEXT" ]; then
  KUBECTL+=(--context "$KUBE_CONTEXT")
fi

"${KUBECTL[@]}" apply -f "$ROOT_DIR/kubernetes/namespace.yaml"

if [ "$APPLY_EXTERNAL_SECRETS" = "true" ]; then
  "${KUBECTL[@]}" apply -f "$ROOT_DIR/kubernetes/secrets-external.yaml"
elif ! "${KUBECTL[@]}" get secret fengine-secrets -n getfluxo >/dev/null 2>&1; then
  echo "Warning: fengine-secrets not found. Run scripts/setup-secrets.sh or set APPLY_EXTERNAL_SECRETS=true."
fi

"${KUBECTL[@]}" apply -f "$ROOT_DIR/kubernetes/service-fengine.yaml"
"${KUBECTL[@]}" apply -f "$ROOT_DIR/kubernetes/deployment-fengine.yaml"

if [ "$APPLY_MONITORING" = "true" ]; then
  "${KUBECTL[@]}" apply -f "$ROOT_DIR/kubernetes/monitoring-fengine.yaml"
fi

echo "Kubernetes manifests applied. To provision cloud infra, run:"
echo "  cd terraform && terraform init && terraform apply"
