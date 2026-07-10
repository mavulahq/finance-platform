# MAVULA Finance Platform

![MAVULA branding](mavula_branding.png)

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)
[![Operations: Apache-2.0](https://img.shields.io/badge/operations-Apache--2.0-blue.svg)](packages/operations/LICENSE)
[![Node 22.22.3](https://img.shields.io/badge/node-22.22.3-339933.svg)](package.json)
[![pnpm 10.33.0](https://img.shields.io/badge/pnpm-10.33.0-F69220.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](pnpm-workspace.yaml)
[![Go](https://img.shields.io/badge/Go-planned-00ADD8.svg)](ROADMAP.md)
[![Java](https://img.shields.io/badge/Java-planned-ED8B00.svg)](ROADMAP.md)
[![COBOL](https://img.shields.io/badge/COBOL-integration--ready-005CA5.svg)](ROADMAP.md)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-runtime-4169E1.svg)](docker-compose.yml)
[![Redis](https://img.shields.io/badge/Redis-queues-DC382D.svg)](docker-compose.yml)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-operations-326CE5.svg)](packages/operations/kubernetes)

Infrastructure for the next generation of finance.

MAVULA is a configurable financial infrastructure platform for institutions
that need ledger, lending, payments, workflow automation and operational
controls behind explicit contracts.

Primary domain: `mavula.io`

Developer and open source domain: `mavula.dev`

## Repository Model

This repository is the main MAVULA engineering workspace. It uses professional
module names and keeps brand ownership separate from code licensing.

```text
finance-platform/
├── contracts/                 Versioned cross-module domain contracts
├── docs/architecture/          Context map, invariants and ADRs
├── packages/
│   ├── ledger-core/            Financial source of truth
│   ├── workbench/              Durable worker runtime and status API
│   ├── settlements/            Payment process and reconciliation foundation
│   └── operations/             Docker, Kubernetes, Terraform and runbooks
├── LICENSE_POLICY.md           Open core policy
├── TRADEMARKS.md               MAVULA mark usage
├── BRAND.md                    Brand asset usage
└── CONTRIBUTING.md             Contribution rules
```

## Licensing

MAVULA follows an open core model.

- `ledger-core`, `workbench`, `settlements`, contracts and root code:
  `AGPL-3.0-only`.
- `operations`: `Apache-2.0`.
- MAVULA names, logos, domains and product marks remain reserved.
- Enterprise hosting, proprietary integrations, compliance packs and managed
  services may be licensed separately.

See [LICENSE_POLICY.md](LICENSE_POLICY.md), [TRADEMARKS.md](TRADEMARKS.md) and
[BRAND.md](BRAND.md).

## Modules

| Module | Package | Responsibility |
| --- | --- | --- |
| Ledger Core | `@mavula/ledger-core` | Product configuration, accounts, ledger, lending, audit, outbox/inbox and read projections. |
| Workbench | `@mavula/workbench` | BullMQ workers, schedules, retries, queues, payment outbox publishing and platform status. |
| Settlements | `@mavula/settlements` | Payment process state, webhook dedupe, reconciliation candidates and guarded settlement outbox. |
| Operations | `@mavula/operations` | Local services, Docker, Kubernetes, Minikube, monitoring, secrets and Terraform starters. |

Legacy names remain as compatibility aliases where needed:

- `fengine` -> `ledger-core`
- `fwk` -> `workbench`
- `fpay` -> `settlements`
- `finfra` -> `operations`

## Architecture Contracts

RFC-0001 defines the current module boundaries, CQRS posture and domain event
catalog. RFC-0002 defines the `ledger-core` production closeout for API
security, tenant isolation, controlled financial operations, idempotency, audit
trail and versioned HTTP contracts. The active event flow uses Transactional
Outbox/Inbox, not full Event Sourcing.

Active events:

- `products.configuration_published`
- `ledger.journal_posted`
- `lending.loan_disbursed`
- `lending.payment_posted`
- `payments.settlement_completed`

`payments.settlement_completed` is owned by Settlements and delivered through
Workbench to Ledger Core as an idempotent Inbox event. Ledger Core records the
event and does not mutate ledger or lending state directly from the payment
event.

Validate contracts with:

```bash
pnpm contracts:check
```

## Local Development

Required tools:

- Node `22.22.3`
- pnpm `10.33.0`
- Docker `24+`
- Kubernetes CLI `1.28+`
- Minikube for the local cluster path

Install:

```bash
pnpm submodules:init
pnpm install --frozen-lockfile
pnpm git:hooks:install
```

Build and test:

```bash
pnpm --filter @mavula/ledger-core build
pnpm --filter @mavula/ledger-core test:all
pnpm --filter @mavula/settlements test
pnpm --filter @mavula/workbench test:all
pnpm contracts:check
pnpm -r build
```

Docker Compose:

```bash
docker compose up -d postgres redis ledger-core workbench
docker compose ps
docker compose logs -f ledger-core workbench
docker compose down
```

Minikube:

```bash
pnpm --filter @mavula/operations minikube:deploy
pnpm --filter @mavula/operations minikube:status
pnpm --filter @mavula/operations minikube:stop
```

## Environment

`.env.example` is intentionally a placeholder. Local secrets and runtime
configuration belong in `.env`, which must not be committed.

New environment names are preferred:

- `LEDGER_CORE_URL`
- `WORKBENCH_QUEUE_BACKEND`
- `WORKBENCH_WORKER_ENABLED`
- `WORKBENCH_SCHEDULER_ENABLED`
- `SETTLEMENTS_OUTBOX_ENABLED`
- `SETTLEMENTS_OUTBOX_PUBLISHER_ENABLED`

Legacy `FENGINE_*`, `FWK_*` and `FPAY_*` variables remain supported during the
transition.

## Governance

All changes to `main` must pass through a pull request. Contributions must
follow [CONTRIBUTING.md](CONTRIBUTING.md) and may require [CLA.md](CLA.md)
confirmation.

Security reports should go to `security@mavula.io`. Legal and trademark
questions should go to `legal@mavula.io`.

## Documentation

- [ROADMAP.md](ROADMAP.md)
- [CI-CD.md](CI-CD.md)
- [docs/architecture/context-map.md](docs/architecture/context-map.md)
- [docs/architecture/domain-events.md](docs/architecture/domain-events.md)
- [docs/architecture/rfc-0001-phase-3-4-impact.md](docs/architecture/rfc-0001-phase-3-4-impact.md)
- [docs/architecture/rfc-0002-ledger-core-closeout.md](docs/architecture/rfc-0002-ledger-core-closeout.md)
