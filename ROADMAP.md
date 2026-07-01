# Fluxo Delivery Roadmap

This roadmap tracks the implementation of Fluxo by getfluxo.io as configurable financial infrastructure for Mozambican institutions.

## Status Legend

- ✅ **Complete:** implemented in the repository and validated by build, tests, or a working local deployment.
- 🟡 **Partial:** a usable foundation exists, but the stated production or product scope is incomplete.
- ⬜ **Planned:** no complete implementation exists yet.

Status applies to the specific line item, not to regulatory approval or general production readiness.

## Current Baseline

### Core Financial Engine

- ✅ NestJS service, health endpoint, Prometheus metrics, tenant middleware, auth foundation, and RBAC primitives.
- ✅ Decimal.js financial calculations for payments, amortisation, interest, fees, and scenarios.
- ✅ Product configuration for current accounts, savings, loans, and credit lines.
- ✅ Rules engine with safe conditions, eligibility, limits, fees, interest tiers, and compliance rules.
- ✅ Loan lifecycle for application, approval, disbursement, partial repayment, and paid-up state.
- ✅ Transaction posting with fees-first allocation, settlement metadata, and idempotency keys.
- ✅ Double-entry ledger, chart of accounts, journal validation, trial balance, and reports.
- ✅ Transaction reversal at the service layer with audit recording.
- ✅ Tenant-defined schemas, forms, workflow definitions, and safe arithmetic formulas.
- ✅ REST controllers for products, rules, schemas, workflows, accounts, health, metrics, and internal workers.
- ✅ Prisma/PostgreSQL persistence paths for the implemented financial and configuration entities.
- ✅ Unit, integration, financial-lifecycle, and e2e test suites.
- 🟡 Authentication credential validation, role enforcement across every controller, and production identity integration.
- 🟡 Account APIs: create and list exist; balance, statement, freeze, close, and status-transition contracts remain incomplete.
- 🟡 Request DTO coverage and global runtime validation across all public APIs.
- 🟡 Reversal and correction APIs, approval controls, and operator-facing workflows.
- 🟡 Durable idempotency for every workflow side effect, not only queue and transaction entry points.

### Tenant Isolation and Data

- ✅ Tenant identifiers are propagated through HTTP and persistence service boundaries.
- ✅ PostgreSQL RLS definitions and a non-bypass application role exist.
- ✅ Prisma models cover tenants, accounts, products, loans, transactions, ledger, rules, workflows, and audit events.
- 🟡 RLS application is not yet automatic in every deployment and migration path.
- 🟡 Tenant-context enforcement must be bound transactionally to pooled database connections.
- 🟡 Schema-per-tenant tooling is experimental and not the production migration strategy.
- ⬜ Automated cross-tenant isolation tests for every repository and API path.

### Worker Runtime

- ✅ BullMQ workers backed by Redis.
- ✅ Bounded retries and exponential backoff.
- ✅ Dead-letter queues and terminal-failure metrics.
- ✅ Scheduled jobs for fees, interest, reconciliation, and reports.
- ✅ Public status API for platform, dependencies, queues, schedules, and worker metrics.
- ✅ `fengine` job producer and authenticated `fwk` callback contract.
- ✅ Workflow execution from asynchronous `event_type` triggers.
- ✅ Startup dependency checks for PostgreSQL, Redis, and `fengine`.
- ✅ Migration of the legacy reconciliation schedule from `payments` to `platform`.
- 🟡 Durable workflow-level deduplication for side effects after process restarts.

### Domain Architecture and Contracts

- ✅ RFC-0001 Phase 1 accepted: bounded contexts, ownership, invariants, CQRS, Outbox/Inbox, versioning, event envelope, and catalog are defined.
- ✅ JSON Schema validation and CI checks exist for the envelope, catalog, and examples.
- ✅ RFC-0001 Phase 2 has active Product Configuration, Ledger, and Lending vertical slices for `products.configuration_published`, `ledger.journal_posted`, `lending.loan_disbursed`, and `lending.payment_posted`: payload schemas, Outbox producers, BullMQ transport adapter, Inbox consumer where applicable, and tests.
- ✅ RFC-0001 Phase 3/4 impact analysis documents read-model boundaries, process-manager prerequisites, affected modules, and answers to the open RFC questions.
- ✅ RFC-0001 Phase 3 initial read projections exist for loan activity, ledger activity, and product publication, with tenant-scoped storage, idempotent consumers, rebuild support, and platform status exposure.
- ✅ RFC-0001 Phase 4 foundation exists for `fpay` payment process state, webhook dedupe, reconciliation jobs, process metrics, disabled-by-default settlement outbox, and infrastructure alerts.
- ⬜ Activate `payments.settlement_completed` and other next event vertical slices only after each one has producer, payload schema, idempotent consumer, tests, and observability.
- 🟡 Add further read projections only for use cases with explicit consistency, freshness, and rebuild requirements.

### Local and Kubernetes Infrastructure

- ✅ Docker Compose services for PostgreSQL, Redis, `fengine`, and `fwk`.
- ✅ Multi-stage Node `22.22.3` container builds with a shared BuildKit pnpm cache.
- ✅ Minikube overlay with persistent PostgreSQL and Redis StatefulSets.
- ✅ Immutable local application image tags and automated Prisma schema synchronisation.
- ✅ Kubernetes deployments, services, liveness probes, readiness probes, and dependency init containers.
- ✅ ServiceMonitor and PrometheusRule definitions for `fengine` and `fwk`.
- ✅ Local database backup and deployment health-check scripts.
- 🟡 External Secrets resources exist but require a valid operator, workload identity, and managed secret values.
- 🟡 k3s deployment script exists but has not been validated as the primary local runtime.
- 🟡 Kubernetes manifests still need environment parameterisation and immutable production image policy.
- ⬜ Horizontal Pod Autoscalers, PodDisruptionBudgets, NetworkPolicies, and ingress/API gateway.
- ⬜ Tested database restore and disaster-recovery automation.

## Phase 1: Engine Closeout

Goal: make `fengine` safe and complete enough to support institution-facing operations.

- 🟡 Complete account lifecycle APIs and DTO validation.
- 🟡 Expose reversal and correction workflows with approval and audit controls.
- 🟡 Make RLS setup part of repeatable migrations and CI isolation tests.
- 🟡 Add durable deduplication receipts for financial workflow side effects.
- ⬜ Publish versioned OpenAPI contracts for public and partner APIs.
- ⬜ Add customer, institution, branch, and operator domain models.
- ⬜ Add regulatory reporting data contracts required for the Mozambican launch scope.

Acceptance criteria:

- ⬜ All public write APIs use validated DTOs and explicit authorisation.
- ⬜ Tenant A cannot access Tenant B through HTTP, Prisma, jobs, logs, or exports.
- ⬜ Every financial mutation is idempotent, auditable, and reversible through controlled workflows.
- ⬜ Trial balance remains balanced across lifecycle, retry, reversal, and concurrency tests.

## Phase 2: Institution Operations

### fwallet

- ⬜ Institution login and role-based operator navigation.
- ⬜ Customer and account management.
- ⬜ Loan origination, review, approval, and collections views.
- ⬜ Transaction history, payment operations, and reconciliation views.
- ⬜ No-code product, rule, schema, and workflow configuration.
- ⬜ Audit, compliance, and operational reporting views.

### fdocs

- ⬜ Generated OpenAPI reference.
- ⬜ Institution onboarding and sandbox guides.
- ⬜ Partner integration examples and webhook documentation.
- ⬜ Operator runbooks generated from the operational source of truth.

Acceptance criteria:

- ⬜ An institution can configure and operate a loan product without direct database access.
- ⬜ Operator actions are authorised, tenant-scoped, and auditable.

## Phase 3: Payments

### fpay

- ✅ Payment-provider adapter contract foundation.
- ✅ Payment process state, webhook receipt dedupe, reconciliation foundation, metrics, and disabled-by-default settlement outbox.
- ⬜ `payments.settlement_completed` activation after approved payload contract, idempotent consumers, and observability.
- ⬜ M-Pesa and e-Mola integrations for the initial Mozambique scope.
- ⬜ Bank-transfer and settlement-file adapters.
- ⬜ Webhook signature verification and replay protection.
- 🟡 Payment disputes and exception handling.
- ⬜ PCI-DSS scope decision and provider-tokenisation strategy.

Acceptance criteria:

- ⬜ Provider callbacks are authenticated, idempotent, and fully auditable.
- ⬜ Settlement totals reconcile with ledger postings and provider records.
- ⬜ Provider outages retry safely without duplicate customer charges.

## Phase 4: Customer Channels and Intelligence

### fwallet-mobile

- ⬜ Institution-branded mobile application.
- ⬜ Account overview, loan status, repayment, and transaction history.
- ⬜ Push notifications, device security, and biometric authentication.
- ⬜ Offline-tolerant read experiences for variable connectivity.

### fxAI

- ⬜ Affordability and credit-risk scoring services.
- ⬜ Fraud and anomaly detection.
- ⬜ Collections prioritisation and operational assistance.
- ⬜ Model versioning, explainability, monitoring, and human review.

## Phase 5: Production and Commercial Readiness

### Security and Compliance

- ⬜ Formal Banco de Moçambique regulatory gap assessment.
- ⬜ Institution KYB and customer KYC/AML evidence workflows.
- ⬜ Penetration test, dependency governance, and vulnerability remediation process.
- ⬜ Key rotation, privileged-access reviews, incident response, and audit export.
- ⬜ Data retention, deletion, privacy, and processing agreements.

### Infrastructure and Reliability

- 🟡 AWS Terraform contains provider, VPC, and EKS starter definitions.
- ⬜ Production VPC topology, private subnets, routing, and NAT.
- ⬜ Managed Kubernetes node groups and workload identity.
- ⬜ Managed PostgreSQL, Redis, container registry, backups, and encryption.
- ⬜ Central logs, dashboards, traces, alert routing, and on-call procedures.
- ⬜ Tested recovery objectives and multi-environment promotion.

### Commercial Operations

- ⬜ Institution sandbox provisioning.
- ⬜ Customer implementation and go-live checklist.
- ⬜ Service tiers, support model, service levels, and usage metering.
- ⬜ Billing, contract, and customer-success operations.

## Immediate Delivery Order

1. Complete engine API validation, authorisation, RLS enforcement, and durable idempotency.
2. Build `fwallet` as the institution operating surface.
3. Implement `fpay` with the first local payment adapters and reconciliation.
4. Expand CI security gates and production infrastructure.
5. Add customer mobile and intelligence modules after core operating flows are stable.
