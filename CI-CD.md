# Fluxo CI/CD and Operations

This document describes the automation that exists today and the controls still required for production operation of Fluxo by getfluxo.io.

## Status Legend

- ✅ **Available:** implemented and executable from this repository.
- 🟡 **Partial:** a foundation or manual workflow exists.
- ⬜ **Required:** target control or automation is not implemented.

## Toolchain

| Tool           | Required version                  |
| -------------- | --------------------------------- |
| Node.js        | `22.22.3`                         |
| pnpm           | `10.33.0`                         |
| Docker         | `24+`                             |
| Kubernetes CLI | `1.28+`                           |
| Minikube       | Current local development profile |
| Terraform      | `1.4+`                            |

The repository pins Node and pnpm in package metadata and container images. Ensure the `node` and `pnpm` executables are available in the runner's `PATH`.

The root repository and its `fengine`, `fwk`, and `finfra` submodules are private. Local development and CI require an SSH identity with read access to all four repositories.

## Current Automation

- ✅ Monorepo dependency installation with a frozen pnpm lockfile.
- ✅ TypeScript builds for `fengine` and `fwk`.
- ✅ Unit and integration tests for both implemented services.
- ✅ e2e test suites for `fengine` and `fwk`.
- ✅ Always-run GitHub Actions workflow `.github/workflows/required-ci.yml`.
- ✅ PostgreSQL and Redis service containers in the required CI workflow.
- ✅ Complete builds and test suites for `fengine` and `fwk` on every pull request.
- ✅ Architecture contract validation inside the required CI workflow when contract files exist.
- ✅ Versioned pre-push hook, controlled squash-merge command, and direct-push audit.
- ✅ Dockerfiles for `fengine` and `fwk`.
- ✅ Docker Compose development environment.
- ✅ Minikube build, schema sync, deployment, and rollout validation.
- ✅ Kubernetes health checks, metrics resources, and deployment scripts.
- 🟡 Staging and production shell entry points exist but depend on preconfigured external clusters and secrets.
- 🟡 Terraform is a starter and cannot provision the full production platform.
- 🟡 Repository-wide CI covers every implemented service; planned modules and security gates remain outstanding.
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
pnpm test:guardrails
```

Repository controls:

```bash
pnpm git:hooks:install
pnpm pr:merge -- <number> --check-only
pnpm pr:merge -- <number>
```

Architecture contracts:

```bash
pnpm contracts:check
pnpm exec prettier --check 'docs/architecture/**/*.md' 'contracts/domain-events/**/*.json' 'scripts/validate-domain-contracts*.mjs'
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

### Implemented workflows

`.github/workflows/required-ci.yml` runs as the stable `required` check on every pull request, every push to `main`, and manual dispatch. It:

1. Audits a `main` update and fails when the commit is not associated with a merged pull request targeting `main`.
2. Verifies `SUBMODULES_SSH_KEY`, checks out the root repository with `actions/checkout@v6`, and then checks out the recorded submodule commits through an isolated SSH command.
3. Starts PostgreSQL `16-alpine` and Redis `7-alpine` service containers.
4. Installs pnpm `10.33.0` and Node `22.22.3`.
5. Installs dependencies from the frozen lockfile.
6. Runs architecture contract validation when the validator is present on the revision.
7. Builds `fpay`, `fengine`, and `fwk`.
8. Runs the `fpay` test suite.
9. Synchronises the Prisma schema with the temporary PostgreSQL database.
10. Runs the complete unit, integration, and e2e suites for `fengine` and `fwk`.

`SUBMODULES_SSH_KEY` must contain a dedicated CI private key registered to a GitHub account with read access to `fengine`, `fwk`, `fpay`, and `finfra`. The root repository uses its scoped `GITHUB_TOKEN`; the SSH key is written to a temporary file only for `git submodule update`, uses strict host checking, and is removed immediately afterward. Rotate this credential through GitHub Actions secrets; never commit it.

This workflow does not build containers, run dedicated security scans, or deploy environments.

### Interim main-branch controls

The private repository is on GitHub Free. GitHub does not provide enforceable protected branches or rulesets for private organisation repositories on this plan, so the warning that `main` is unprotected remains valid.

The interim policy is:

1. Run `pnpm git:hooks:install` after cloning. The tracked `.githooks/pre-push` rejects direct updates to `refs/heads/main`.
2. Push a feature branch and open a pull request targeting `main`.
3. Wait for the stable `required` check to succeed.
4. Resolve conflicts and requested changes.
5. Use `pnpm pr:merge -- <number>` to validate policy, squash-merge, and delete the source branch.
6. Treat a failed `Audit main update` step as a policy violation requiring review, because it means CI could not confirm a merged pull request for the `main` update.

These controls are intentionally transparent about their boundary: administrators can bypass a local hook with `--no-verify`, and CI can only detect a direct push after GitHub accepts it. New contributors therefore receive read-only access to core repositories until GitHub Team enables remote enforcement.

When GitHub Team becomes available, replace this interim layer with an active ruleset requiring pull requests, the `required` status check, resolved conversations, linear history, and blocks on force pushes and branch deletion. Keep the workflow and merge command because they remain useful automation after enforcement moves server-side.

### Target workflow set

- ✅ `required-ci.yml`: builds and tests every implemented service.
- ⬜ `security.yml`: dependency policy, secret scanning, SAST, SBOM, and container scanning.
- ⬜ `containers.yml`: builds and publishes immutable images with provenance.
- ⬜ `deploy-staging.yml`: deploys a reviewed main-branch artifact and runs smoke tests.
- ⬜ `deploy-production.yml`: requires approval and promotes the tested artifact without rebuilding it.
- ⬜ `infra.yml`: publishes Terraform plans and restricts apply to approved environments.

## Required CI Gates

Every pull request currently validates:

- TypeScript build success.
- Unit, integration, and e2e test success.
- Architecture contracts when the validator is present.
- Financial lifecycle and balanced-ledger invariants.
- Payment allocation order: fees, then interest, then principal.
- Idempotency, retry, reversal, and concurrency scenarios.
- Valid domain event schemas, unique type/version pairs, and catalogued examples.
- Tenant-isolation tests for API, database, queues, and exports.

The following dedicated gates remain planned:

- No critical exploitable dependency or container finding.
- No committed credentials or private keys.
- Reviewed migration and rollback behaviour.

Build and test gates run both locally and in GitHub Actions; dedicated security and release gates remain planned.

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
- ✅ `fengine` and `fwk` complete suites run in GitHub Actions for every pull request.
- 🟡 `main` is protected operationally while server-side enforcement awaits GitHub Team.
- ⬜ Complete CI, security, artifact, staging, and production workflows.
- ⬜ Production infrastructure, managed data services, and disaster recovery.
- ⬜ Regulatory, security, and operational approval for a Mozambican launch.
