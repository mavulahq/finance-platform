# Fluxo by getfluxo.io

**Modern financial infrastructure, built in Mozambique.**

Fluxo is a configurable Banking as a Service (BaaS) platform for Mozambican microfinance institutions, credit cooperatives, fintechs, and banking partners. Institutions configure products, rules, fees, workflows, and channels; their customers use the institution's branded web, mobile, and API experiences.

Copyright (c) 2026 getfluxo.io. Proprietary software. See [LICENSE](LICENSE).

## Mission

Fluxo exists to reduce the cost and complexity of financial digitalisation in Mozambique. The platform replaces rigid, difficult-to-integrate foundations with modular services that institutions can adapt to their operating model and customers.

The initial product direction is shaped by local requirements:

- Financial inclusion and services that remain usable under variable connectivity.
- Products and accounting flows denominated in Mozambican meticais.
- Integration paths for local institutions, fintechs, mobile money, and banking partners.
- Auditability, tenant isolation, and controls suitable for Banco de Moçambique regulatory expectations.
- API-first configuration so institutions can launch and change products without replacing their core.

## Platform Model

```text
Fluxo by getfluxo.io
  -> provides configurable financial infrastructure

Financial institution
  -> configures products, rules, fees, workflows, and channels
  -> operates under its own brand and compliance responsibilities

Institution customer
  -> accesses accounts, loans, payments, and support through branded channels
```

Fluxo is a product platform, not a software-house project template. `fengine` is the source of truth for financial configuration and posting. `fwk` executes durable asynchronous work. `finfra` provisions and operates their runtime dependencies.

## Design Principles

- **Built for Mozambique:** local institutions, operating constraints, financial inclusion, and regulatory direction are first-class concerns.
- **API first:** configuration and financial capabilities are exposed through service APIs.
- **Configurable:** products, rules, schemas, and workflows are tenant-defined rather than hard-coded per institution.
- **Composable:** the engine, workers, channels, payments, documents, and intelligence modules evolve behind explicit contracts.
- **Cloud native:** containers, Kubernetes, health checks, metrics, queues, and managed secrets are part of the architecture.
- **Financially rigorous:** Decimal.js money calculations, balanced ledger entries, idempotency, and audit trails protect financial correctness.

## Repository

```text
getfluxo/
├── README.md                 Product, architecture, and development guide
├── ROADMAP.md                Delivery status and next implementation phases
├── CI-CD.md                  Build, deployment, and operations reference
├── contracts/                Versioned cross-module domain contracts
├── docs/architecture/        Context map, invariants, and ADRs
├── .gitmodules               Versioned package repository mappings
├── docker-compose.yml        Local PostgreSQL, Redis, fengine, and fwk
├── package.json              Monorepo commands and pinned toolchain
└── packages/
    ├── fengine/              Configurable core financial engine
    ├── fwk/                  BullMQ worker runtime and platform status API
    ├── fpay/                 Payment adapter contracts and local rails
    └── finfra/               Docker, Kubernetes, Terraform, and runbooks
```

`fengine`, `fwk`, `fpay`, and `finfra` are maintained as private submodules under the `getfluxo-io` GitHub organisation. The `fpay` package is mounted at `packages/fpay` with package name `@getfluxo/fpay`. The workspace still reserves names for `fwallet`, `fwallet-mobile`, `fxAI`, and `fdocs`; these modules are planned and do not yet exist as implemented packages.

## Implementation Status

| Area                        | Status                 | Current capability                                                                   |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `fengine` core              | Implemented            | Products, rules, loans, transactions, ledger, schemas, workflows, audit, and metrics |
| Persistence                 | Implemented foundation | Prisma/PostgreSQL repositories with memory fallback for isolated tests               |
| Worker runtime              | Implemented            | BullMQ workers, retries, backoff, schedules, dead-letter queues, and metrics         |
| Engine-worker integration   | Implemented            | Redis job publishing and authenticated callbacks to workflow triggers                |
| External payment rails      | Implemented foundation | `fpay` adapter contracts, payment process state, webhook dedupe, and reconciliation foundation |
| Local infrastructure        | Implemented            | Docker Compose and Minikube with persistent PostgreSQL and Redis                     |
| Production infrastructure   | Partial                | Kubernetes and monitoring manifests exist; Terraform remains a starter               |
| Institution dashboard       | Planned                | `fwallet`                                                                            |
| Customer mobile application | Planned                | `fwallet-mobile`                                                                     |
| Intelligence services       | Planned                | `fxAI` scoring, fraud detection, and automation                                      |

## Architecture

```text
Web, mobile, and partner API channels
  -> authentication, tenant routing, and rate limits
  -> fengine
       -> products, accounts, and loans
       -> rules and safe expression runtimes
       -> transactions and double-entry ledger
       -> tenant schemas and configurable workflows
       -> Prisma/PostgreSQL persistence
       -> BullMQ producer
            -> Redis platform queue
                 -> fwk workers
                      -> authenticated fengine callback
                      -> workflow-trigger execution
                      -> retry, backoff, and dead-letter handling
  -> Prometheus metrics and platform status
```

### Architecture contracts

[RFC-0001](https://github.com/orgs/getfluxo-io/discussions/1) accepted the Phase 1 language and contract foundation on 2026-06-27 for explicit bounded contexts, selective CQRS, and domain events. The accepted artifacts are versioned in the repository:

- [Context map](docs/architecture/context-map.md) and [invariants](docs/architecture/invariants-and-ownership.md).
- [Domain event contract](docs/architecture/domain-events.md) and machine-validatable [event catalog](contracts/domain-events/event-catalog.json).
- [RFC-0001 Phase 3 and 4 impact analysis](docs/architecture/rfc-0001-phase-3-4-impact.md) for read models and process managers.
- ADRs for [selective CQRS](docs/architecture/adr/0001-selective-cqrs.md), [Transactional Outbox/Inbox](docs/architecture/adr/0002-transactional-outbox-inbox.md), and [event versioning](docs/architecture/adr/0003-event-versioning.md).

RFC-0001 Phase 2 activates runtime vertical slices for `products.configuration_published`, `ledger.journal_posted`, `lending.loan_disbursed`, and `lending.payment_posted`: each active event has a versioned payload schema, is written to a PostgreSQL-backed Outbox by `fengine`, is published through the BullMQ-backed `fwk` platform queue, and is consumed through a persistent Inbox for idempotent workflow dispatch when applicable. Other catalog events remain `proposed` until their own producer, payload schema, idempotent consumer, tests, and observability are implemented. Validate the contracts with:

```bash
pnpm contracts:check
```

RFC-0001 Phase 3 now has the initial read-model runtime for existing modules. `fengine` projects loan activity, ledger activity, and product publication views from active Outbox events. The projections are tenant-scoped, idempotent, rebuildable, and exposed through projection APIs. `fwk` includes projection health in platform dependency status.

### fengine

`packages/fengine` currently provides:

- Product configuration for current accounts, savings, loans, and credit lines.
- Decimal.js calculations for repayment schedules, interest, fees, scenarios, and payment allocation.
- Chart of accounts, balanced journal entries, trial balance, and general-ledger reporting.
- Loan application, approval, disbursement, repayment, and paid-up transitions.
- Idempotent disbursement and payment posting, plus transaction reversal at the service layer.
- RFC-0001 Outbox/Inbox support for the active `products.configuration_published`, `ledger.journal_posted`, `lending.loan_disbursed`, and `lending.payment_posted` domain events.
- Safe rules and advanced arithmetic formulas without `eval` or `new Function`.
- Tenant-defined entity schemas, forms, workflow definitions, and workflow execution.
- REST controllers for accounts, products, rules, schemas, workflows, health, metrics, auth, and internal workers.
- Read projection APIs for loan activity, ledger activity, product publications, projection status, and internal rebuild.
- Prisma models and repository paths for tenants, accounts, products, loans, transactions, ledger, workflows, rules, and audit events.
- Prisma models for read projections and projection checkpoints.

### fwk

`packages/fwk` currently provides:

- BullMQ consumers for payment and platform queues.
- Exponential backoff, bounded attempts, failed-job retention, and dead-letter queues.
- Scheduled jobs for fees, interest, payment reconciliation, and reports.
- Authenticated dispatch of engine events to configurable `fengine` workflow triggers.
- Public health, dependency status, queue status, schedule status, and Prometheus metrics.
- Dependency monitoring for PostgreSQL, Redis, `fengine`, and `fengine` projection status.

### finfra

`packages/finfra` currently provides:

- Multi-stage Node `22.22.3` container builds with cached pnpm stores.
- Kubernetes deployments and services for `fengine` and `fwk`.
- Minikube PostgreSQL and Redis StatefulSets with persistent volumes.
- Readiness, liveness, dependency init containers, ServiceMonitors, and alert rules.
- Local schema synchronisation, health checks, backup scripts, and secret templates.
- External Secrets definitions and an initial AWS Terraform baseline.

## Internal Worker Contract

The asynchronous engine-worker path uses Redis rather than direct synchronous submission:

1. `fengine` publishes a `FENGINE_EVENT` job to the BullMQ `platform` queue.
2. `fwk` claims the job and processes it with configured attempts and backoff.
3. `fwk` calls `POST /api/internal/worker/events` on `fengine`.
4. `fengine` finds workflows whose trigger matches `event_type` and executes them.
5. BullMQ records the result as completed or retries and eventually moves terminal failures to the dead-letter queue.

Internal routes require the shared `INTERNAL_API_KEY` header. Kubernetes resolves the engine through `FENGINE_URL=http://fengine`.

## Local Development

Required tools:

- Node `22.22.3`
- pnpm `10.33.0`
- Docker `24+`
- Kubernetes CLI `1.28+`
- Minikube for the complete local cluster
- Terraform `1.4+` only for infrastructure planning

The repository pins Node and pnpm through package metadata, `.node-version`, `.nvmrc`, and container images.
Ensure the `node` and `pnpm` executables are available in your `PATH`.

### Install and test

Clone the private repository and its package repositories with an SSH identity authorised for the `getfluxo-io` organisation:

```bash
git clone --recurse-submodules git@github.com:getfluxo-io/getfluxo.git
cd getfluxo
```

For an existing clone, synchronise and initialise the recorded submodule commits before installing dependencies:

```bash
pnpm submodules:init
pnpm git:hooks:install
```

```bash
pnpm install --frozen-lockfile
pnpm --filter @getfluxo/fengine build
pnpm --filter @getfluxo/fengine test:all
pnpm --filter @getfluxo/fwk build
pnpm --filter @getfluxo/fwk test:all
```

### Contribution workflow

All changes to `main` must pass through a pull request. The versioned pre-push hook blocks accidental direct pushes after `pnpm git:hooks:install`; `Required CI` then builds and runs the complete `fengine` and `fwk` suites for every pull request.

After CI succeeds, validate or merge an eligible pull request with:

```bash
pnpm pr:merge -- <number> --check-only
pnpm pr:merge -- <number>
```

The merge command rejects drafts, conflicts, requested changes, pending checks, and any PR without a successful `required` check. It uses squash merge and deletes the source branch. Because the private organisation repository currently uses GitHub Free, these controls reduce accidental or non-compliant changes but cannot prevent an administrator from bypassing local hooks or pushing directly. Remote enforcement will move to a GitHub ruleset when GitHub Team is available.

### Docker Compose

```bash
docker compose up -d postgres redis fengine fwk
docker compose ps
docker compose logs -f fengine fwk
docker compose down
```

Local ports:

- PostgreSQL: `localhost:15432`
- Redis: `localhost:16379`
- `fengine`: `http://localhost:13000/api/health`
- `fwk`: `http://localhost:13010/api/status`

### Minikube

```bash
pnpm --filter @getfluxo/finfra minikube:deploy
pnpm --filter @getfluxo/finfra minikube:status
kubectl --context getfluxo port-forward -n getfluxo service/fengine 13000:80
kubectl --context getfluxo port-forward -n getfluxo service/fwk 13011:80
pnpm --filter @getfluxo/finfra minikube:stop
```

`minikube:deploy` builds immutable local image tags, provisions PostgreSQL and Redis, synchronises the Prisma schema, and waits for healthy application rollouts. `minikube:delete` removes the cluster and its persistent local data.

## Security and Regulatory Direction

The repository contains engineering foundations, not a claim of regulatory certification or production authorisation. Before a regulated launch in Mozambique, the platform still requires:

- Formal alignment with Banco de Moçambique licensing, reporting, outsourcing, and data requirements.
- Institution KYB and customer KYC/AML evidence workflows.
- Production-grade identity, credential rotation, access reviews, and incident response.
- PCI-DSS scope definition for card or payment-provider integrations.
- Independent penetration testing and vulnerability management.
- Tested backup restoration, retention, deletion, and disaster-recovery procedures.
- Legal agreements, data-processing terms, service levels, and institution go-live controls.

Mozambique is the launch market and product focus. Expansion into the SADC region is a future option after local product, regulatory, and operational maturity.

## Documentation

- [ROADMAP.md](ROADMAP.md): verified delivery status and remaining modules.
- [CI-CD.md](CI-CD.md): current automation, deployment procedures, and production gaps.
