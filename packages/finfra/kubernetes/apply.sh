#!/usr/bin/env bash
set -euo pipefail

BASE_DIR=$(cd "$(dirname "$0")" && pwd)

kubectl apply -f "$BASE_DIR/namespace.yaml"
kubectl apply -f "$BASE_DIR/fengine-secret.yaml"
kubectl apply -f "$BASE_DIR/fwk-secret.yaml"
kubectl apply -f "$BASE_DIR/deployment-fengine.yaml"
kubectl apply -f "$BASE_DIR/deployment-fwk.yaml"
kubectl apply -f "$BASE_DIR/service-fengine.yaml"
kubectl apply -f "$BASE_DIR/service-fwk.yaml"
kubectl apply -f "$BASE_DIR/monitoring-fengine.yaml"
kubectl apply -f "$BASE_DIR/monitoring-fwk.yaml"
kubectl apply -f "$BASE_DIR/secrets-external.yaml"
