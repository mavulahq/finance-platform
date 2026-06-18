# getfluxo.io

Digital core banking SaaS for financial institutions in Mozambique and the SADC region. getfluxo.io is a B2B platform: institutions configure products, workflows, fees and channels; their customers consume the institution's branded experience through web, mobile and API channels.

Copyright (c) 2026 getfluxo.io. Proprietary. See [LICENSE](/home/estandarmustaq/dev_0/getfluxo/LICENSE).

## Platform Model

```
getfluxo.io / fluxo
  -> sells financial technology to institutions
Institution
  -> configures and operates products under its own brand
End customer
  -> uses the institution's wallet, mobile app, accounts, loans and payments
```

The platform is not a software-house project template. The financial engine is the source of truth for balances, loans, rules, ledger postings, tenant configuration and audit trails.

## Repository Layout

```
getfluxo/
├── README.md                 Repository, architecture and operating guide
├── ROADMAP.md                Delivery plan, priorities and remaining modules
├── CI-CD.md                  CI/CD, deployment, infrastructure and runbooks
├── package.json              Workspace scripts
├── pnpm-workspace.yaml       Workspace package map
└── packages/
    ├── fengine/              Core finance engine, NestJS, TypeScript
    └── finfra/               Docker, Kubernetes, Terraform and ops scripts
```

Planned workspace packages are already listed in `pnpm-workspace.yaml`: `fwallet`, `fwallet-mobile`, `fwk`, `fxAI`, `fpay` and `fdocs`. They should be added as implementation moves beyond the current foundation.

## Current Implementation

### fengine

`packages/fengine` contains the active core banking implementation:

- Product configuration for checking, savings, loans and credit lines.
- Financial calculations with Decimal.js for PMT, amortization, interest accrual, scenarios and payment allocation.
- Ledger service with chart of accounts, balanced journal entries, trial balance and GL reporting.
- Rules engine for eligibility, limits, fees, interest tiers, compliance and custom rules.
- Transaction service for loan disbursement, loan payment posting, GL integration and audit events.
- Loan service for application, approval, disbursement, active repayment and paid-up status.
- Schema manager for tenant-defined entities, no-code forms and workflow execution.
- In-memory `FengineStoreService` and `AuditTrailService` used as the current local persistence boundary while Prisma/PostgreSQL persistence is completed.
- Auth, RBAC, CSRF, tenant middleware and Prometheus metrics endpoints.

The OODA lifecycle is explicit across services:

- `OBSERVE`: capture application, tenant and transaction data.
- `ORIENT`: evaluate rules, schemas, context and product constraints.
- `DECIDE`: approve, reject, tier or block.
- `ACT`: persist state, post ledger entries, audit and execute workflows.

### finfra

`packages/finfra` contains the infrastructure foundation:

- Docker build and push scripts for `fengine`.
- Kubernetes namespace, deployment, service, secrets and monitoring manifests.
- Terraform starter for AWS VPC and EKS.
- Deployment scripts for staging and production.
- Health check, database backup, schema migration and secret setup scripts.

The current Terraform is intentionally minimal and must be expanded before production to include subnets, node groups, RDS/PostgreSQL, Redis, ECR, IAM, external secrets, observability and backup policies.

## Architecture

```
Web / Mobile / API channels
  -> API gateway, auth, tenant routing, rate limits
  -> fengine
       -> products and no-code schemas
       -> rules engine
       -> loans and accounts
       -> transactions and ledger
       -> audit trail and metrics
  -> async workers, payment adapters, AI scoring and reconciliation
  -> PostgreSQL tenant schemas, Redis, object storage, logs and metrics
```

Tenant isolation target:

- Schema-per-tenant PostgreSQL model for regulated workloads.
- RLS and tenant middleware as an additional guardrail.
- Per-tenant config caching and audit trails.
- Backup/restore and migration paths scoped to a tenant.

## Local Development

Required toolchain:

- Node `22.22.3`
- pnpm `10.33.0`
- Docker `24+`
- Kubernetes CLI `1.28+`
- Terraform `1.4+`

Local infrastructure uses Docker images:

- `postgres:16-alpine` on `localhost:15432`
- `redis:7-alpine` on `localhost:16379`

Development connection strings:

```bash
export DATABASE_URL="postgresql://fengine_app:fengine_dev@localhost:15432/getfluxo?schema=public"
export REDIS_URL="redis://localhost:16379"
```

Use the superuser URL `postgresql://getfluxo:getfluxo_dev@localhost:15432/getfluxo?schema=public` only for local schema administration such as `prisma db push` and RLS setup.

Common commands:

```bash
export PATH=/home/estandarmustaq/.local/share/pnpm:$PATH
node --version
pnpm install
pnpm dev:services:up
pnpm --filter @getfluxo/fengine build
pnpm --filter @getfluxo/fengine test
pnpm --filter @getfluxo/fengine test:e2e
pnpm dev:services:logs
pnpm dev:services:down
pnpm --filter @getfluxo/finfra docker:build
pnpm --filter @getfluxo/finfra health:check
```

For a complete local Kubernetes environment, use Minikube. The deploy command starts the `getfluxo` profile, builds immutable local images, provisions PostgreSQL and Redis with persistent volumes, applies the Prisma schema and deploys `fengine` and `fwk`:

```bash
pnpm --filter @getfluxo/finfra minikube:deploy
pnpm --filter @getfluxo/finfra minikube:status
kubectl --context getfluxo port-forward -n getfluxo service/fengine 13000:80
kubectl --context getfluxo port-forward -n getfluxo service/fwk 13011:80
pnpm --filter @getfluxo/finfra minikube:stop
```

Use `minikube:delete` to remove the cluster and its local persistent volumes. Port `13011` avoids the Docker Compose `fwk` port `13010` when both environments are running.

This repository is pinned to Node `22.22.3` via `.node-version`, `.nvmrc`, `.npmrc`, package `engines` and Docker images. On this workstation, the expected Node binary is `/home/estandarmustaq/.local/share/pnpm/node`.

## fengine Quick Flow

```typescript
const loan = await loanService.applyForLoan(tenantId, {
  customer_id: customerId,
  product_id: productId,
  loan_type: LoanType.PERSONAL,
  requested_amount: 25000,
  requested_term_months: 12,
  metadata: {},
});

await loanService.approveLoan(tenantId, loan, {
  credit_score: 650,
  income: 120000,
  employment_years: 5,
});

await loanService.disburseLoan(tenantId, loan);
await loanService.processLoanPayment(tenantId, loan, 2500);
```

Payment allocation is fees -> interest -> principal in both transaction posting and loan balance updates.

## Security And Compliance Baseline

Required before regulated production:

- Secrets in AWS Secrets Manager, External Secrets Operator or equivalent vault.
- JWT/API key rotation and incident response process.
- PCI-DSS scope decision for payment processing.
- AML/KYC/KYB workflow and evidence collection.
- Per-tenant access logs for personal and financial data.
- Third-party penetration testing and vulnerability management.
- Backup, restore, retention and data deletion policies.

## Documentation

Documentation is intentionally consolidated:

- [README.md](/home/estandarmustaq/dev_0/getfluxo/README.md): architecture, package guide and development commands.
- [ROADMAP.md](/home/estandarmustaq/dev_0/getfluxo/ROADMAP.md): delivery order, module scope and acceptance criteria.
- [CI-CD.md](/home/estandarmustaq/dev_0/getfluxo/CI-CD.md): pipeline, deployment, infrastructure and operational runbooks.
