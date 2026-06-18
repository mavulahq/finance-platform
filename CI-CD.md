# getfluxo.io CI/CD And Operations

This document is the single operational reference for build, test, deployment, infrastructure and runbook workflows.

## Toolchain

Required versions:

- Node `22.22.3`
- pnpm `10.33.0`
- Docker `24+`
- Kubernetes CLI `1.28+`
- Terraform `1.4+`

Workspace commands:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm --filter @getfluxo/fengine build
pnpm --filter @getfluxo/fengine test
pnpm --filter @getfluxo/fengine test:e2e
pnpm --filter @getfluxo/finfra docker:build
pnpm --filter @getfluxo/finfra deploy:staging
pnpm --filter @getfluxo/finfra deploy:production
```

## Pipeline Overview

```
push / pull_request
  -> install dependencies
  -> lint and typecheck
  -> unit and integration tests
  -> build packages
  -> security scans
  -> build container images
  -> deploy staging
  -> smoke tests and health checks
  -> approved production rollout
```

Required GitHub Actions workflows:

- `ci.yml`: install, lint, typecheck, test and build.
- `security.yml`: dependency audit, secret scan, SAST and container scan.
- `containers.yml`: build and push images to registry.
- `deploy-staging.yml`: deploy main branch to staging.
- `deploy-production.yml`: approved release deployment with rollback.
- `infra.yml`: Terraform plan/apply with manual approval.

## CI Workflow

Recommended `ci.yml` shape:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22.22.3
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @getfluxo/fengine build
      - run: pnpm --filter @getfluxo/fengine test
      - run: pnpm --filter @getfluxo/fengine test:e2e
```

Add matrix entries as each module becomes real:

- `@getfluxo/fwallet`
- `@getfluxo/fwallet-mobile`
- `@getfluxo/fwk`
- `@getfluxo/fxAI`
- `@getfluxo/fpay`
- `@getfluxo/fdocs`

## Local Development Services

PostgreSQL and Redis are Docker images during platform development:

```bash
pnpm dev:services:up
pnpm dev:services:ps
pnpm dev:services:logs
pnpm dev:services:down
```

Services:

- PostgreSQL: `postgres:16-alpine`, exposed on `localhost:15432`
- Redis: `redis:7-alpine`, exposed on `localhost:16379`

Development environment:

```bash
export DATABASE_URL="postgresql://fengine_app:fengine_dev@localhost:15432/getfluxo?schema=public"
export REDIS_URL="redis://localhost:16379"
```

Local schema administration uses `postgresql://getfluxo:getfluxo_dev@localhost:15432/getfluxo?schema=public`; application and tests use `fengine_app` so PostgreSQL RLS is enforced.

## Security Gates

Minimum gates before deploy:

- TypeScript build must pass.
- Unit and integration tests must pass.
- `npm audit` or equivalent dependency audit has no critical production issue.
- Secret scanning finds no committed credentials.
- Container image scan has no critical exploitable issue.
- Migration scripts are reviewed for locking and rollback behavior.

Financial correctness gates:

- All journal entries balance debits and credits.
- Payment allocation order is fees -> interest -> principal.
- Tenant isolation tests pass.
- Audit events exist for configuration changes, loan decisions, transaction postings and workflow execution.

## Container Workflow

Current finfra scripts:

```bash
pnpm --filter @getfluxo/finfra docker:build
pnpm --filter @getfluxo/finfra docker:push
```

Default image variables:

- `IMAGE_NAME=getfluxio/fengine`
- `IMAGE_TAG=latest`
- `DOCKERFILE=packages/fengine/Dockerfile`
- `CONTEXT_DIR=packages`

Production image tags should use immutable tags:

```bash
IMAGE_TAG=sha-${GITHUB_SHA::7} pnpm --filter @getfluxo/finfra docker:build
IMAGE_TAG=v1.0.0 pnpm --filter @getfluxo/finfra docker:push
```

## Kubernetes Deployment

Current manifests:

- `packages/finfra/kubernetes/namespace.yaml`
- `packages/finfra/kubernetes/deployment-fengine.yaml`
- `packages/finfra/kubernetes/service-fengine.yaml`
- `packages/finfra/kubernetes/fengine-secret.yaml`
- `packages/finfra/kubernetes/secrets-external.yaml`
- `packages/finfra/kubernetes/monitoring-fengine.yaml`
- `packages/finfra/kubernetes/deployment-fwk.yaml`
- `packages/finfra/kubernetes/service-fwk.yaml`
- `packages/finfra/kubernetes/monitoring-fwk.yaml`
- `packages/finfra/kubernetes/overlays/minikube/`

Deploy commands:

```bash
cd packages/finfra
KUBE_CONTEXT=staging pnpm run deploy:staging
KUBE_CONTEXT=production pnpm run deploy:prod
NAMESPACE=getfluxo APP_LABEL=fengine pnpm run health:check
```

Local Minikube deployment:

```bash
pnpm --filter @getfluxo/finfra minikube:deploy
pnpm --filter @getfluxo/finfra minikube:status
```

The local overlay uses development-only secrets, persistent PostgreSQL and Redis StatefulSets, immutable per-deploy image tags and automatic Prisma schema synchronization. It is not a production secrets or migration strategy.

Before production, parameterize the manifests through Helm, Kustomize or environment-specific overlays. Do not ship production with `latest` image tags or plaintext secrets.

## Terraform

Current Terraform is a starter baseline for AWS provider, VPC and EKS module. Required expansion:

- Public and private subnets across availability zones.
- NAT gateways and route tables.
- EKS managed node groups.
- RDS PostgreSQL with backups, encryption and parameter groups.
- Redis/ElastiCache.
- ECR repositories for service images.
- IAM roles for service accounts.
- Security groups and network policies.
- Remote Terraform state with locking.

Commands:

```bash
pnpm --filter @getfluxo/finfra tf:init
pnpm --filter @getfluxo/finfra tf:plan
pnpm --filter @getfluxo/finfra tf:apply
```

Production `tf:apply` requires human approval and a reviewed plan artifact.

## Database And Tenant Migrations

Tenant migration principles:

- Create schema first, then migrate data in batches.
- Add nullable columns, backfill, validate, then enforce constraints.
- Use `CREATE INDEX CONCURRENTLY` for large PostgreSQL tables.
- Add foreign keys as `NOT VALID`, then validate separately.
- Keep old and new paths available during cutover.
- Verify counts and financial balances before deleting old data.

Available scripts:

```bash
bash packages/fengine/scripts/create_tenant.sh
bash packages/fengine/scripts/migrate-tenant.sh
pnpm --filter @getfluxo/finfra migrate:schema
pnpm --filter @getfluxo/finfra backup:db
```

Production migration checklist:

- Snapshot or point-in-time restore available.
- Dry run completed on staging copy.
- Locking behavior reviewed.
- Rollback plan written.
- Tenant-level reconciliation completed after cutover.

## Deployment Runbooks

### Staging

1. Merge to `main`.
2. CI passes.
3. Build immutable image.
4. Deploy to staging namespace.
5. Run health checks.
6. Run smoke test for health, metrics, auth and loan lifecycle.

### Production

1. Cut release tag.
2. Confirm CI, security and staging results.
3. Review Terraform or Kubernetes diff.
4. Approve production deployment.
5. Roll out canary or blue-green.
6. Watch metrics, logs and error budgets.
7. Promote to 100 percent or roll back.

### Rollback

1. Identify last known-good image tag.
2. Reapply deployment with the previous tag.
3. Confirm pods are ready.
4. Run health and smoke checks.
5. Confirm no irreversible migration is pending.

## Observability

Required signals:

- `/health` for service liveness.
- `/metrics` for Prometheus scraping.
- Request count, latency, status code and tenant labels where safe.
- Loan lifecycle counters by phase.
- Transaction posting success/failure.
- Journal imbalance attempts.
- Rule evaluation pass/fail.
- Workflow execution success/failure.

Alert examples:

- fengine pod crash loop.
- p95 latency over threshold.
- Payment posting failure rate above threshold.
- Any unbalanced journal entry error.
- Database connection pool exhaustion.
- Tenant isolation guard failure.

## Secrets

Use a managed secret store:

- AWS Secrets Manager or HashiCorp Vault.
- External Secrets Operator for Kubernetes sync.
- Short-lived credentials where possible.
- Rotated JWT signing keys and API keys.
- No production `.env` files in Git.

Required secret categories:

- `DATABASE_URL`
- JWT private/public keys or shared signing secret
- payment provider keys
- webhook signing secrets
- Redis URL
- object storage credentials
- observability tokens

## Verification Status

Local workstation runs should prepend `/home/estandarmustaq/.local/share/pnpm` to PATH so `/home/estandarmustaq/.local/share/pnpm/node` resolves to Node `22.22.3`.
