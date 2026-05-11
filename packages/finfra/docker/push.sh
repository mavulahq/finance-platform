#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME=${IMAGE_NAME:-getfluxio/fengine}
IMAGE_TAG=${IMAGE_TAG:-latest}

docker push "${IMAGE_NAME}:${IMAGE_TAG}"
