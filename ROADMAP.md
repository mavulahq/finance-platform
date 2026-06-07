# getfluxo.io Roadmap

This roadmap uses the OODA model as the product and engineering delivery loop: observe the current state, orient around risk and market needs, decide the next scope, act with shippable modules.

## Current State

Foundation work is concentrated in `fengine` and `finfra`.

Completed or materially implemented:

- NestJS `fengine` application shell with auth, health, metrics, tenant middleware and RBAC.
- Product configuration engine for standard account, savings, loan and credit-line products.
- Financial calculation primitives for PMT, amortization, interest accrual, scenarios and payment allocation.
- General ledger service with SADC-oriented chart of accounts, journal posting, trial balance and GL reports.
- Rules engine with default eligibility, limit, fee, interest and compliance rules.
- Transaction service for loan disbursement, payment allocation, settlement records and GL posting.
- Loan service for application, approval, disbursement, payment and paid-up lifecycle.
- Schema manager for no-code entity schemas and workflow automation.
- Shared in-memory store and audit trail services registered in the Nest dependency graph.
- Local development PostgreSQL and Redis run through Docker Compose images.
- `finfra` Docker, Kubernetes, Terraform starter, deployment and operational scripts.
- Documentation consolidated into `README.md`, `ROADMAP.md` and `CI-CD.md`.

Important implementation correction now applied:

- Duplicate workflow executor removed from `SchemaManagerService`.
- Rule creation audit now uses a valid OODA phase.
- Shared store and audit providers registered for app and integration tests.
- Loan balance payment allocation now mirrors transaction allocation: fees -> interest -> principal.

## Phase 1: Foundation Closeout

Target: make `fengine` and `finfra` reliable enough to support the remaining modules.

### fengine

Scope:

- Replace in-memory store paths with Prisma/PostgreSQL repositories behind the same service boundaries.
- Keep Decimal.js for all money math and prevent float-only balance updates.
- Add durable tenant schemas, RLS policies and migration scripts to the runtime path.
- Add account APIs for create, read, balance, statement and status transitions.
- Add product, rule, schema and workflow controllers.
- Add idempotency keys for disbursement and payment posting.
- Add transaction reversal and correction workflows with audit events.
- Add API contracts with request validation DTOs.

Acceptance criteria:

- `pnpm --filter @getfluxo/fengine build` passes.
- Unit, integration and e2e tests pass in CI.
- Loan lifecycle test covers apply -> approve -> disburse -> partial payment -> paid-up.
- GL trial balance remains balanced after every transaction test.
- Tenant A cannot access Tenant B data in API, Prisma queries or logs.

### finfra

Scope:

- Expand Terraform from placeholder to deployable AWS baseline: VPC, public/private subnets, EKS node groups, RDS/PostgreSQL, Redis, ECR, IAM and security groups.
- Add External Secrets Operator or equivalent secret sync.
- Parameterize Kubernetes image, tag, namespace, replicas and resource limits.
- Add readiness probes, HPA, pod disruption budgets and network policies.
- Add Prometheus scraping, Grafana dashboards and log aggregation.
- Add backup and restore workflow for PostgreSQL and tenant schemas.

Acceptance criteria:

- Staging deploy is reproducible from a clean cluster.
- `health:check` confirms rollout status and service availability.
- Terraform plan is reviewable and environment-specific.
- Production deploy requires approval and supports rollback.
- Secrets are never committed or injected from plaintext manifests.

## Phase 2: Operating Surfaces

Target: turn the engine into usable financial operations.

### fwallet

Institution web dashboard:

- Tenant login and role-based navigation.
- Customer and account management.
- Loan origination and review screens.
- Payments, transaction history and reconciliation views.
- No-code product, schema, rule and workflow configuration.
- Audit and compliance views.

### fdocs

Developer and operator documentation:

- OpenAPI specs from fengine controllers.
- Tenant onboarding guide.
- Runbooks generated from `CI-CD.md`.
- API examples for institutions and partners.

## Phase 3: Payments And Workers

Target: connect transaction processing to real external rails and async operations.

### fpay

Payment gateway module:

- Adapter pattern for M-Pesa, e-Mola, Paystack, Stripe and bank rails.
- Webhook verification and replay protection.
- Settlement files and reconciliation reports.
- PCI-DSS scope minimization.

### fwk

Worker framework:

- Bull/BullMQ queue workers.
- Retry, backoff and dead-letter queues.
- Scheduled jobs for fees, interest, reconciliation and reports.
- Worker health metrics.

## Phase 4: Mobile And Intelligence

Target: add high-value channels and automation.

### fwallet-mobile

White-label mobile app:

- Institution-branded customer experience.
- Account overview, loan status and repayment flows.
- Push notifications and biometric auth.
- Offline-tolerant UX where possible.

### fxAI

AI services:

- Credit scoring and affordability scoring.
- Fraud/anomaly detection.
- Collections prioritization.
- Model versioning, monitoring and explainability reports.

## Phase 5: Production Readiness

Target: close enterprise and regulated-finance gaps.

Security and compliance:

- KYB onboarding for institutions.
- AML/KYC evidence workflows.
- PCI-DSS decision and controls.
- Penetration testing, vulnerability tracking and incident process.
- Data retention, deletion and DPA templates.

Operational targets:

- p99 API latency under 200ms for common read paths.
- No unbalanced journal postings.
- Staging deploy under 5 minutes after image build.
- Recovery time objective under 1 hour for critical data.
- Recovery point objective aligned to customer tier.

Commercial readiness:

- Starter, Professional and Enterprise plan boundaries.
- Sandbox tenant provisioning.
- Customer go-live checklist.
- SLA and support model per plan.
