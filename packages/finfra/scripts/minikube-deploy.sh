#!/usr/bin/env bash
# getfluxo.io - Local Minikube deployment
# Copyright (c) 2026 getfluxo.io
# License: PROPRIETARY

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
PROFILE=${MINIKUBE_PROFILE:-getfluxo}
DRIVER=${MINIKUBE_DRIVER:-docker}
CONTEXT=$PROFILE
NAMESPACE=getfluxo
IMAGE_TAG=${MINIKUBE_IMAGE_TAG:-minikube-$(date -u +%Y%m%d%H%M%S)}
DATABASE_PORT=${MINIKUBE_DATABASE_PORT:-15433}

command -v minikube >/dev/null || { echo "minikube is required" >&2; exit 1; }
command -v kubectl >/dev/null || { echo "kubectl is required" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required" >&2; exit 1; }

if ! minikube status -p "$PROFILE" >/dev/null 2>&1; then
  minikube start -p "$PROFILE" --driver="$DRIVER"
fi

docker build -t "getfluxio/fengine:$IMAGE_TAG" -f "$ROOT_DIR/packages/fengine/Dockerfile" "$ROOT_DIR"
docker build -t "getfluxio/fwk:$IMAGE_TAG" -f "$ROOT_DIR/packages/fwk/Dockerfile" "$ROOT_DIR"
minikube image load -p "$PROFILE" "getfluxio/fengine:$IMAGE_TAG"
minikube image load -p "$PROFILE" "getfluxio/fwk:$IMAGE_TAG"

kubectl kustomize --load-restrictor=LoadRestrictionsNone \
  "$ROOT_DIR/packages/finfra/kubernetes/overlays/minikube" | kubectl --context "$CONTEXT" apply -f -
kubectl --context "$CONTEXT" set image deployment/fengine "fengine=getfluxio/fengine:$IMAGE_TAG" -n "$NAMESPACE"
kubectl --context "$CONTEXT" set image deployment/fwk "fwk=getfluxio/fwk:$IMAGE_TAG" -n "$NAMESPACE"
kubectl --context "$CONTEXT" rollout status statefulset/postgres -n "$NAMESPACE" --timeout=180s
kubectl --context "$CONTEXT" rollout status statefulset/redis -n "$NAMESPACE" --timeout=180s

kubectl --context "$CONTEXT" port-forward service/postgres "$DATABASE_PORT:5432" -n "$NAMESPACE" >/tmp/getfluxo-postgres-forward.log 2>&1 &
FORWARD_PID=$!
trap 'kill "$FORWARD_PID" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 30); do
  if (echo >/dev/tcp/127.0.0.1/"$DATABASE_PORT") >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
DATABASE_URL="postgresql://getfluxo:getfluxo_dev@127.0.0.1:$DATABASE_PORT/getfluxo?schema=public" \
  pnpm --dir "$ROOT_DIR" --filter @getfluxo/fengine exec prisma db push --skip-generate
kill "$FORWARD_PID" >/dev/null 2>&1 || true
trap - EXIT

kubectl --context "$CONTEXT" rollout status deployment/fengine -n "$NAMESPACE" --timeout=180s
kubectl --context "$CONTEXT" rollout status deployment/fwk -n "$NAMESPACE" --timeout=180s

kubectl --context "$CONTEXT" get pods,services,pvc -n "$NAMESPACE"
echo "Deployed local image tag: $IMAGE_TAG"
echo "Run 'minikube service fwk -n $NAMESPACE -p $PROFILE --url' to access the public status API."
