# getfluxo.io - Digital Core Banking MacroFinance as a Service

**Author**: Estandar Mustaq <estandarmustaq@getflux.io>  
**Company**: getfluxo.io  
**Region**: SADC (Southern African Development Community)  
**License**: Proprietary (see LICENSED file)  
**Status**: Architecture Phase - Ready for Implementation

---

## Overview

**getfluxo.io** is a **multi-tenant B2B SaaS platform** for financial services delivery. Financial institutions configure their services and products through a no-code interface, and the platform generates white-labeled applications that load institution-specific configurations at runtime.

### Key Features

✅ **Multi-Tenant Architecture** - Complete data isolation (schema-level + RLS)  
✅ **No-Code Configuration** - Define products, workflows, fees without code  
✅ **White-Label Ready** - Institutions appear as their own app  
✅ **AI-Powered Insights** - Credit scoring, fraud detection built-in  
✅ **Production-Grade** - 99.99% uptime, full compliance  
✅ **SADC-Focused** - Understands regional regulations and payment systems  

---

## Quick Start

### Prerequisites

```bash
# Install required tools
brew install git docker docker-compose kubernetes-cli pnpm nodejs@20

# Verify installations
node --version    # v20.10.0+
pnpm --version    # 8.0.0+
docker --version  # 24.0.0+
```

### Clone & Setup

```bash
# Clone monorepo with all submodules
git clone --recurse-submodules https://github.com/getfluxio/getfluxo.git
cd getfluxo

# Install dependencies
pnpm install

# Verify setup
pnpm --filter fengine build
pnpm --filter finfra validate
```

### Development

```bash
# Start local development environment
docker-compose up -d                    # PostgreSQL, Redis, Elasticsearch

# Run all tests
pnpm test

# Build all packages
pnpm build

# Start development servers
pnpm dev
```

---

## Repository Structure

```
getfluxo/                               # Root monorepo
├── ARCHITECTURE.md                    # Complete system design
├── ROADMAP.md                         # Implementation plan & milestones
├── CI-CD.md                           # Pipeline architecture & workflows
├── LICENSED                           # Author rights & compliance
├── README.md                          # This file
├── .github/
│   └── workflows/                     # GitHub Actions CI/CD
├── pnpm-workspace.yaml                # Monorepo config
│
└── packages/                          # All subpackages
    ├── finfra/                        # Infrastructure (Docker, K8s, Terraform)
    │   ├── docker/
    │   ├── kubernetes/
    │   ├── terraform/
    │   └── monitoring/
    │
    ├── fdocs/                         # Documentation & API specs
    │   ├── api/
    │   ├── guides/
    │   └── architecture/
    │
    ├── fengine/                       # ⭐ SUBMODULE: Core Finance Engine (NestJS)
    ├── fwallet/                       # ⭐ SUBMODULE: Web Dashboard (Vue3)
    ├── fwallet-mobile/                # ⭐ SUBMODULE: Mobile App (React Native)
    ├── fagent/                        # ⭐ SUBMODULE: API Agent & Sync
    ├── fwk/                           # ⭐ SUBMODULE: Worker Framework (Bull + Redis)
    ├── fxAI/                          # ⭐ SUBMODULE: ML Services (Python)
    └── fpay/                          # ⭐ SUBMODULE: Payment Gateway
```

**Note**: Submodules (marked ⭐) are separate Git repositories linked via `.gitmodules`. See CI-CD.md for workflow details.

---

## Core Packages

### 1. **fengine** - Finance Engine (NestJS)

Multi-tenant backend handling:
- Account management (CRUD, balances, statements)
- Payment processing (ledger, settlement, reconciliation)
- Loan origination (application, approval, disbursement)
- Configuration APIs (dynamic schemas, rules, workflows)
- Authentication & RBAC (JWT, OAuth2, multi-factor)

**Status**: Implementation starting (Week 1)  
**Team**: 2 senior backend engineers  
**Stack**: NestJS, TypeScript, Prisma, PostgreSQL  

```bash
# Development
cd packages/fengine
pnpm install
pnpm dev                    # Start NestJS app on :3000
pnpm test                   # Run unit + integration tests
```

### 2. **finfra** - Infrastructure

Deployment automation & operational infrastructure:
- Docker (multi-stage builds, all services)
- Kubernetes (EKS manifests, namespaces, scaling)
- Terraform (AWS resources: EKS, RDS, ElastiCache, ECR, VPC)
- GitHub Actions (CI/CD workflows)
- Monitoring (Prometheus, Grafana, Loki)

**Status**: Initial setup (Week 1)  
**Team**: 1 DevOps engineer  

```bash
# Infrastructure management
cd packages/finfra

pnpm run tf:plan          # Terraform plan
pnpm run tf:apply         # Apply infrastructure
pnpm run k8s:apply        # Deploy to Kubernetes
pnpm run health:check     # Check system health
```

### 3. **fwallet** - Web Dashboard (Vue3)

Multi-tenant institution dashboard:
- Account management interface
- Payment creation & tracking
- Loan portfolio view
- Customer management
- Configuration UI (no-code schema builder)
- Reports & analytics
- Compliance & audit logs

**Status**: Implementation starting (Week 3)  
**Team**: 1 frontend engineer  

### 4. **fpay** - Payment Gateway

Payment processing integrations:
- Paystack integration (primary, SADC leader)
- Stripe integration (backup, international)
- Settlement & reconciliation
- Webhook management
- PCI-DSS compliance

**Status**: Implementation starting (Week 4)  
**Team**: 1 backend engineer  

### 5. **fwk** - Worker Framework

Background job processing:
- NestJS + Bull + Redis
- Job queue management
- Retry logic with backoff
- Cron scheduling
- Health monitoring

**Uses**:
- Email/SMS notifications
- Payment reconciliation
- Interest calculations
- Audit log export

### 6. **fxAI** - ML/AI Services

Intelligent decision-making:
- Credit scoring (risk assessment)
- Fraud detection (anomaly detection)
- Income verification
- Prediction models
- Model versioning & A/B testing

**Stack**: Python, FastAPI, TensorFlow, scikit-learn

### 7. **fagent** - API Agent & Sync

Integration layer:
- Public REST API (third-party integration)
- Webhook management
- External system sync (ATM networks, SWIFT)
- Batch import/export
- OODA-based reconciliation agent

### 8. **fwallet-mobile** - Mobile App

React Native application:
- iOS + Android
- Offline-first capability
- Biometric auth
- QR code payments
- Push notifications

---

## Development Workflow

### Creating Features

**Step 1: Feature branch in submodule**

```bash
cd packages/fengine
git checkout -b feat/account-schema-validation
```

**Step 2: Make changes and test**

```bash
pnpm test
pnpm lint
pnpm build
```

**Step 3: Commit to submodule**

```bash
git add .
git commit -m "feat: add account schema validation"
git push origin feat/account-schema-validation
```

**Step 4: Create PR in submodule repository**

(Submodule repo → PR review → merge to main)

**Step 5: Update root monorepo**

```bash
cd ../..
git add packages/fengine
git commit -m "chore: update fengine to feat/account-schema-validation"
git push
```

**Step 6: Create PR in root monorepo**

(Shows submodule commit hash in PR)

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @getfluxo/fengine test

# Watch mode
pnpm --filter @getfluxo/fengine test:watch

# Coverage report
pnpm --filter @getfluxo/fengine test:coverage
```

### Building

```bash
# All packages
pnpm build

# Specific package
pnpm --filter @getfluxo/fengine build

# Watch mode (development)
pnpm dev
```

### Linting & Formatting

```bash
# Lint all
pnpm lint

# Format all
pnpm format

# Check formatting
pnpm format:check
```

---

## Deployment

### Local Development

```bash
# Start services
docker-compose up -d

# Wait for PostgreSQL to be ready
docker-compose exec postgres pg_isready

# Run migrations
pnpm --filter @getfluxo/fengine prisma migrate dev

# Start dev servers
pnpm dev
```

### Staging Deployment

Automatic on merge to `main`:

```
git push origin feat/new-feature
↓
Create & merge PR
↓
GitHub Actions triggered (CI_BUILD_TEST)
↓
Tests pass → Build containers
↓
Deploy to staging Kubernetes namespace
↓
Smoke tests run
↓
Slack notification sent
```

### Production Deployment

Manual deployment with approval:

```bash
# Tag release
git tag release/v1.2.3
git push --tags

# GitHub Actions triggered
# → Security scan
# → Build containers
# → Manual approval required
# → Blue-green deployment
# → Canary rollout (10% → 50% → 100%)
# → Monitoring checks
# → Auto-rollback on errors
```

---

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system design (23KB)
- **[ROADMAP.md](./ROADMAP.md)** - Implementation plan & milestones
- **[CI-CD.md](./CI-CD.md)** - Pipeline architecture & workflows
- **[LICENSED](./LICENSED)** - License terms & author attribution

---

## Key Concepts

### Multi-Tenancy

Each financial institution is a "tenant":
- Separate PostgreSQL schema (e.g., `tenant_inst_001`)
- Complete data isolation (schema + RLS policies)
- Configurable products, workflows, fees
- White-labeled application interface

### No-Code Configuration

Products defined as JSON schemas:
```json
{
  "product_id": "prod_checking_001",
  "name": "Conta Corrente Premium",
  "entity_type": "ACCOUNT",
  "schema": {
    "account_type": "CHECKING",
    "minimum_balance": 5000,
    "overdraft_allowed": true,
    "overdraft_limit": 50000
  }
}
```

### OODA Cycle

Decision-making framework:
- **Observe**: Analyze current state (audit logs, metrics, data)
- **Orient**: Understand context (regulations, market, architecture)
- **Decide**: Choose path forward (strategy, priorities, technology)
- **Act**: Execute (implement, deploy, iterate)

---

## Contributing

### Code Review Standards

- Minimum 2 approvals (@estandarmustaq approval required)
- Security review mandatory
- 80%+ test coverage required
- All CI checks passing

### Commit Message Format

```
type: subject (50 chars max)

body (wrap at 72 chars)
- Explain WHAT and WHY
- Reference GitHub issues
- No implementation details

footer
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

### License Compliance

All files must include header:
```typescript
/*
 * getfluxo.io - [Package Name]
 * Author: Estandar Mustaq <estandarmustaq@getflux.io>
 * Copyright (c) 2025 getfluxo.io
 * 
 * Description of module
 */
```

---

## Support & Contact

- **Issues**: GitHub Issues (private repo)
- **Slack**: #engineering channel
- **Security**: security@getflux.io
- **Legal**: legal@getflux.io

---

## Status & Timeline

| Phase | Period | Status | Deliverables |
|-------|--------|--------|--------------|
| **1: Foundation** | Weeks 1-4 | IN PROGRESS | fengine, finfra, CI/CD |
| **2: Products** | Weeks 5-8 | PLANNED | fwallet, fpay, fwk |
| **3: Intelligence** | Weeks 9-12 | PLANNED | fxAI, fagent, rules engine |
| **4: Go-Live** | Weeks 13-16 | PLANNED | Monitoring, documentation, beta |
| **5: Growth** | Weeks 17+ | PLANNED | Performance, features, expansion |

---

## License

**Proprietary Software** - All rights reserved  
See [LICENSED](./LICENSED) file for complete terms

**Author**: Estandar Mustaq <estandarmustaq@getflux.io>  
**Company**: getfluxo.io  
**Copyright**: (c) 2025 getfluxo.io

---

**Last Updated**: 2025-01-20  
**Next Review**: 2025-02-20  
**Version**: 1.0.0 - Architecture Phase
