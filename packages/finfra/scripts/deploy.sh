#!/usr/bin/env bash
# getfluxo.io - Deployment & Infrastructure
# Copyright (c) 2025 getfluxo.io
# 
# Author: Estandar Mustaq <estandarmustaq@getfluxo.io>
# License: Proprietary

set -euo pipefail

# Deploy Kubernetes manifests and run terraform apply for infra
KUBE_CONTEXT=${KUBE_CONTEXT:-}
if [ -z "$KUBE_CONTEXT" ]; then
  echo "KUBE_CONTEXT not set - ensure kubectl is configured"
fi

kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/deployment-fengine.yaml
kubectl apply -f kubernetes/service-fengine.yaml

echo "Kubernetes manifests applied. To provision cloud infra, run:"
echo "  cd terraform && terraform init && terraform apply"
