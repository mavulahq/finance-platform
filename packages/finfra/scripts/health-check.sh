#!/usr/bin/env bash
set -euo pipefail

NAMESPACE=${NAMESPACE:-getfluxo}
APP_LABEL=${APP_LABEL:-fengine}

kubectl get pods -n "$NAMESPACE" -l "app=$APP_LABEL"
kubectl rollout status deployment/"$APP_LABEL" -n "$NAMESPACE"
