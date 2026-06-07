#!/usr/bin/env bash
set -euo pipefail

NAMESPACE=${NAMESPACE:-getfluxo}
APP_LABEL=${APP_LABEL:-fengine}
KUBE_CONTEXT=${KUBE_CONTEXT:-}

KUBECTL=(kubectl)
if [ -n "$KUBE_CONTEXT" ]; then
  KUBECTL+=(--context "$KUBE_CONTEXT")
fi

"${KUBECTL[@]}" get pods -n "$NAMESPACE" -l "app=$APP_LABEL"
"${KUBECTL[@]}" rollout status deployment/"$APP_LABEL" -n "$NAMESPACE"
