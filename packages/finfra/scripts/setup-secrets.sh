#!/usr/bin/env bash
# getfluxo.io - Secrets Management & Vault Integration
# Copyright (c) 2025 getfluxo.io
# 
# Author: Estandar Mustaq <estandarmustaq@getfluxo.io>
# License: Proprietary

set -euo pipefail

NAMESPACE=${NAMESPACE:-getfluxo}
AWS_REGION=${AWS_REGION:-eu-west-1}
ENVIRONMENT=${ENVIRONMENT:-staging}

echo "Setting up secrets management for namespace: $NAMESPACE"

# Create ServiceAccount for External Secrets operator
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: external-secrets-sa
  namespace: $NAMESPACE
---
apiVersion: iam.cnpg.io/v1
kind: IAMRole
metadata:
  name: external-secrets-role
  namespace: $NAMESPACE
spec:
  assetNames:
    - secretsmanager:GetSecretValue
    - secretsmanager:DescribeSecret
  resources:
    - 'arn:aws:secretsmanager:$AWS_REGION:*:secret:getfluxo/*'
EOF

# Create External Secrets objects
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: $NAMESPACE
spec:
  provider:
    aws:
      service: SecretsManager
      region: $AWS_REGION
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: fengine-secrets
  namespace: $NAMESPACE
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: fengine-secrets
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: getfluxo/fengine/database_url
    - secretKey: JWT_SECRET
      remoteRef:
        key: getfluxo/fengine/jwt_secret
    - secretKey: REDIS_URL
      remoteRef:
        key: getfluxo/redis_url
    - secretKey: COOKIE_DOMAIN
      remoteRef:
        key: getfluxo/cookie_domain
EOF

echo "Secrets management configured. Verify in AWS Secrets Manager and k8s:"
echo "  aws secretsmanager list-secrets --region $AWS_REGION --filters Key=name,Values=getfluxo"
echo "  kubectl get secret -n $NAMESPACE fengine-secrets"
