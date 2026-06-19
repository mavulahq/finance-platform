# Fluxo CI/CD and Operations

This document describes the automation that exists today and the controls still required for production operation of Fluxo by getfluxo.io.

## Status Legend

- ✅ **Available:** implemented and executable from this repository.
- 🟡 **Partial:** a foundation or manual workflow exists.
- ⬜ **Required:** target control or automation is not implemented.

## Toolchain

| Tool | Required version |
|---|---|
| Node.js | `22.22.3` |
| pnpm | `10.33.0` |
| Docker | `24+` |
| Kubernetes CLI | `1.28+` |
| Minikube | Current local development profile |
| Terraform | `1.4+` |

The repository pins Node and pnpm in package metadata and container images. Ensure the `node` and `pnpm` executables are available in the runner's `PATH`.

The root repository and its `fengine`, `fwk`, and `finfra` submodules are private. Local development and CI require an SSH identity with read access to all four repositories.

## Current Automation

- ✅ Monorepo dependency installation with a frozen pnpm lockfile.
- ✅ TypeScript builds for `fengine` and `fwk`.
- ✅ Unit and integration tests for both implemented services.
- ✅ e2e test suites for `fengine` and `fwk`.
- ✅ GitHub Actions workflow `.github/workflows/fengine-e2e.yml`.
- ✅ PostgreSQL and Redis service containers in the `fengine` e2e workflow.
- ✅ Dockerfiles for `fengine` and `fwk`.
- ✅ Docker Compose development environment.
- ✅ Minikube build, schema sync, deployment, and rollout validation.
- ✅ Kubernetes health checks, metrics resources, and deployment scripts.
- 🟡 Staging and production shell entry points exist but depend on preconfigured external clusters and secrets.
- 🟡 Terraform is a starter and cannot provision the full production platform.
- ⬜ Repository-wide CI workflow covering every package and quality gate.
- ⬜ Automated container publishing, staging promotion, and approved production release.
- ⬜ Automated SAST, dependency policy, secret scan, SBOM, and container vulnerability gates.

## Supported Commands

Install and build:

```bash
pnpm submodules:init
pnpm install --frozen-lockfile
pnpm --filter @getfluxo/fengine build
pnpm --filter @getfluxo/fwk build
pnpm build
```

Tests:

```bash
pnpm --filter @getfluxo/fengine test
pnpm --filter @getfluxo/fengine test:e2e
pnpm --filter @getfluxo/fengine test:all
pnpm --filter @getfluxo/fwk test
pnpm --filter @getfluxo/fwk test:e2e
pnpm --filter @getfluxo/fwk test:all
pnpm test
```

Infrastructure:

```bash
pnpm --filter @getfluxo/finfra docker:build
pnpm --filter @getfluxo/finfra k8s:apply
pnpm --filter @getfluxo/finfra health:check
pnpm --filter @getfluxo/finfra minikube:deploy
pnpm --filter @getfluxo/finfra minikube:status
pnpm --filter @getfluxo/finfra tf:plan
```

## GitHub Actions

### Implemented workflow

`.github/workflows/fengine-e2e.yml` currently runs on relevant pushes and manual dispatch. It:

1. Checks out the root repository and its recorded submodule commits using `SUBMODULES_SSH_KEY`.
2. Starts PostgreSQL `16-alpine` and Redis `7-alpine` service containers.
3. Installs pnpm `10.33.0` and Node `22.22.3`.
4. Installs dependencies from the frozen lockfile.
5. Builds `fengine`.
6. Synchronises the Prisma schema with the temporary PostgreSQL database.
7. Runs the `fengine` e2e suite with PostgreSQL and Redis URLs.

`SUBMODULES_SSH_KEY` must contain a private machine-user key whose GitHub account has read access to `getfluxo`, `fengine`, `fwk`, and `finfra`. Rotate this credential through GitHub Actions secrets; never commit it.

This workflow does not currently run `fengine` unit/integration suites, `fwk` tests, container builds, security scans, or deployments.

### Target workflow set

- ⬜ `ci.yml`: builds and tests every implemented package.
- ⬜ `security.yml`: dependency policy, secret scanning, SAST, SBOM, and container scanning.
- ⬜ `containers.yml`: builds and publishes immutable images with provenance.
- ⬜ `deploy-staging.yml`: deploys a reviewed main-branch artifact and runs smoke tests.
- ⬜ `deploy-production.yml`: requires approval and promotes the tested artifact without rebuilding it.
- ⬜ `infra.yml`: publishes Terraform plans and restricts apply to approved environments.

## Required CI Gates

Every pull request should eventually enforce:

- TypeScript build success.
- Unit, integration, and e2e test success.
- Financial lifecycle and balanced-ledger invariants.
- Payment allocation order: fees, then interest, then principal.
- Idempotency, retry, reversal, and concurrency scenarios.
- Tenant-isolation tests for API, database, queues, and exports.
- No critical exploitable dependency or container finding.
- No committed credentials or private keys.
- Reviewed migration and rollback behaviour.

Only build and test gates are currently exercised locally; the dedicated CI security and release gates remain planned.

## Local Docker Environment

Start the full local service set:

```bash
docker compose up -d postgres redis fengine fwk
docker compose ps
docker compose logs -f fengine fwk
```

Endpoints:

- PostgreSQL: `localhost:15432`
- Redis: `localhost:16379`
- `fengine`: `http://localhost:13000/api/health`
- `fwk` status: `http://localhost:13010/api/status`
- `fwk` metrics: `http://localhost:13010/api/metrics`

Stop the environment:

```bash
docker compose down
```

Named volumes retain PostgreSQL and Redis data unless they are explicitly removed.

## Minikube Environment

The `getfluxo` profile is the validated complete local Kubernetes environment:

```bash
pnpm --filter @getfluxo/finfra minikube:deploy
pnpm --filter @getfluxo/finfra minikube:status
```

The deploy script:

1. Starts Minikube when required.
2. Builds uniquely tagged local `fengine` and `fwk` images.
3. Loads the images into the Minikube runtime.
4. Applies the local Kustomize overlay.
5. Waits for PostgreSQL and Redis StatefulSets.
6. Port-forwards PostgreSQL temporarily and applies the Prisma schema.
7. Waits for healthy `fengine` and `fwk` rollouts.

Access services:

```bash
kubectl --context getfluxo port-forward -n getfluxo service/fengine 13000:80
kubectl --context getfluxo port-forward -n getfluxo service/fwk 13011:80
```

Lifecycle commands:

```bash
pnpm --filter @getfluxo/finfra minikube:stop
pnpm --filter @getfluxo/finfra minikube:delete
```

The Minikube overlay uses development-only credentials. It is not a production secret or migration strategy.

## Containers

Current Docker build scripts default to `fengine`:

```bash
IMAGE_NAME=getfluxio/fengine \
IMAGE_TAG=sha-local \
DOCKERFILE=packages/fengine/Dockerfile \
pnpm --filter @getfluxo/finfra docker:build
```

Build `fwk` by overriding the same variables:

```bash
IMAGE_NAME=getfluxio/fwk \
IMAGE_TAG=sha-local \
DOCKERFILE=packages/fwk/Dockerfile \
pnpm --filter @getfluxo/finfra docker:build
```

Production images must use immutable commit or release tags. The existing `docker:push` command pushes the selected image but does not implement registry authentication, signing, provenance, or promotion.

Both Dockerfiles use multi-stage Node `22.22.3` builds and a locked BuildKit pnpm cache. `fengine` explicitly generates the Prisma client and installs the OpenSSL runtime required by Prisma.

## Kubernetes

Implemented resources include:

- Namespace, deployments, and ClusterIP services for `fengine` and `fwk`.
- Liveness and readiness probes.
- Init containers that wait for platform dependencies.
- Local PostgreSQL and Redis StatefulSets and persistent volume claims.
- ServiceMonitor and PrometheusRule definitions.
- External Secrets definitions for application credentials.

Apply to a configured cluster:

```bash
KUBE_CONTEXT=staging pnpm --filter @getfluxo/finfra deploy:staging
KUBE_CONTEXT=production pnpm --filter @getfluxo/finfra deploy:prod
```

These commands assume that the context, namespace permissions, secrets, images, and required custom-resource operators already exist. They do not provision a complete environment.

Production Kubernetes still requires:

- Environment-specific image tags and configuration overlays.
- Ingress/API gateway, TLS, DNS, and rate limiting.
- NetworkPolicies, PodDisruptionBudgets, autoscaling, and topology constraints.
- Restricted service accounts, workload identity, and pod security controls.
- Controlled migrations and pre-deployment database backups.

## Engine-Worker Operations

Required configuration:

- `REDIS_URL` in `fengine` and `fwk`.
- `FENGINE_URL=http://fengine` in `fwk` inside Kubernetes.
- The same `INTERNAL_API_KEY` in both services.

Operational flow:

```text
fengine producer
  -> BullMQ platform queue in Redis
  -> fwk worker
  -> authenticated /api/internal/worker/events callback
  -> fengine workflow trigger
```

`fwk` retries callback failures with exponential backoff. Terminal failures remain available through dead-letter queue metrics. The public status API reports PostgreSQL, Redis, and `fengine` dependency health as well as queue and schedule state.

Production operators must alert on:

- `fwk_worker_running == 0`.
- Any dead-letter backlog.
- Sustained queue delay or growth.
- `fengine` dependency failure.
- Repeated callback or workflow failures.

## Database and Tenant Operations

Prisma schema commands:

```bash
pnpm --filter @getfluxo/fengine prisma:generate
pnpm --filter @getfluxo/finfra migrate:schema
```

Local Minikube currently uses `prisma db push --skip-generate`. Production must replace this with reviewed, versioned migrations and a deploy-time migration policy.

RLS definitions exist in `packages/fengine/migrations/rls_setup.sql`. They must be applied after shared-schema tables are created and tested with the non-bypass application role.

Backup:

```bash
DATABASE_URL="postgresql://..." pnpm --filter @getfluxo/finfra backup:db
```

The repository has a backup script but no complete automated restore workflow. A backup is not production-ready until restoration is exercised and reconciled.

## Secrets

Local development uses explicit development credentials. Production must use a managed secret store.

Required secret categories:

- Database credentials.
- Redis connection credentials.
- JWT signing material.
- Shared internal service API key.
- Payment-provider and webhook secrets when `fpay` is implemented.
- Object-storage and observability credentials when those services are added.

External Secrets manifests reference AWS Secrets Manager keys, including `getfluxo/internal_api_key`. Before use, install the operator, configure workload identity correctly, create the remote values, and verify secret rotation.

Never commit production `.env` files, credentials, tokens, private keys, or generated Kubernetes secrets.

## Observability

Available endpoints:

- `fengine`: `/api/health` and `/api/metrics`.
- `fwk`: `/api/health`, `/api/status`, `/api/status/queues`, `/api/status/schedules`, `/api/status/metrics`, and `/api/metrics`.

ServiceMonitor and alert-rule manifests exist, but the repository does not install Prometheus Operator, Grafana, central logging, tracing, or alert routing.

Production signals should cover:

- Request rate, latency, and server errors.
- Database and Redis availability and saturation.
- Financial posting and journal-balance failures.
- Queue depth, age, retries, and dead letters.
- Workflow success, failure, and idempotent replay.
- Tenant-isolation and authorisation failures.

## Deployment Runbooks

### Staging target

1. Pass all CI and security gates.
2. Build and publish immutable images.
3. Review database and Kubernetes changes.
4. Deploy the same artifacts to staging.
5. Run health, auth, tenant-isolation, financial-lifecycle, and worker callback smoke tests.
6. Record the tested image digests and migration version.

### Production target

1. Approve the tested release and infrastructure plan.
2. Confirm backup and restoration readiness.
3. Apply reviewed migrations under the defined locking policy.
4. Roll out canary or blue-green workloads.
5. Monitor financial, dependency, and queue indicators.
6. Promote or roll back without rebuilding the artifacts.

### Rollback target

1. Stop promotion and identify the last known-good image digests.
2. Determine whether the database change is backward-compatible.
3. Restore the previous deployment configuration.
4. Validate health, tenant isolation, posting, ledger balance, and worker queues.
5. Reconcile any work that was retried or moved to a dead-letter queue.

## Production Readiness Checklist

- ✅ Local builds and test suites pass.
- ✅ Docker Compose and Minikube support the implemented services.
- ✅ Engine-worker communication is authenticated and observable.
- 🟡 Kubernetes and secret-management foundations exist.
- 🟡 Backup creation exists; restoration automation does not.
- 🟡 Only `fengine` e2e currently runs in GitHub Actions.
- ⬜ Complete CI, security, artifact, staging, and production workflows.
- ⬜ Production infrastructure, managed data services, and disaster recovery.
- ⬜ Regulatory, security, and operational approval for a Mozambican launch.
