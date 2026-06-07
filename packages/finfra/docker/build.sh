#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
IMAGE_NAME=${IMAGE_NAME:-getfluxio/fengine}
IMAGE_TAG=${IMAGE_TAG:-latest}
DOCKERFILE=${DOCKERFILE:-"$ROOT_DIR/../fengine/Dockerfile"}
CONTEXT_DIR=${CONTEXT_DIR:-"$ROOT_DIR/../.."}

if [ ! -f "$DOCKERFILE" ]; then
  echo "Dockerfile not found: $DOCKERFILE" >&2
  exit 1
fi

docker build -f "$DOCKERFILE" -t "${IMAGE_NAME}:${IMAGE_TAG}" "$CONTEXT_DIR"
