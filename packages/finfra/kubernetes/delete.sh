#!/usr/bin/env bash
set -euo pipefail

BASE_DIR=$(cd "$(dirname "$0")" && pwd)

kubectl delete -f "$BASE_DIR/secrets-external.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/monitoring-fwk.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/monitoring-fengine.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/service-fwk.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/service-fengine.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/deployment-fwk.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/deployment-fengine.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/fwk-secret.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/fengine-secret.yaml" --ignore-not-found
kubectl delete -f "$BASE_DIR/namespace.yaml" --ignore-not-found
