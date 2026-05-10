# getfluxo.io - Digital Core Banking MacroFinance as a Service (B2B SaaS)

**Version**: 1.0  
**Status**: Architecture Phase  
**Scope**: Multi-tenant, no-code configurable platform  
**Target**: Financial institutions (Mozambique & SADC region)

---

## 1. Executive Summary

GetFlux is a **white-label, multi-tenant B2B SaaS platform** for financial services delivery. Institutions configure their services and products through a no-code interface, defining custom schemas. The platform generates white-labeled applications that load institution-specific configurations at runtime.

**Key Value Propositions**:
- ⏱️ 80% faster deployment vs custom development
- 💰 Subscription-based licensing (no large upfront costs)
- 🎨 Complete white-label capabilities
- 🔧 No-code configuration of products, workflows, schemas
- 📱 Multi-channel (web, mobile, API)
- 🏢 True multi-tenant architecture (complete data isolation)
- 🤖 AI-powered insights and automation

---

## 2. Platform Architecture

### 2.1 Macro-Level Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GetFlux Platform                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  fWallet     │  │  fWallet     │  │  fPay        │  │  fAgent     │ │
│  │  (Desktop)   │  │  Mobile      │  │  (Payment)   │  │  (API/Sync) │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│       ▲                   ▲                   ▲                ▲         │
│       │                   │                   │                │         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              REST API Gateway + WebSocket Hub                      │ │
│  │              (Multi-tenant routing, Auth, Rate Limit)              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│       ▲                                                                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      fEngine (Core)                                 │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │ Accounts     │  │ Loans        │  │ Payments     │              │ │
│  │  │ Multi-tenant │  │ Risk Engine  │  │ Settlement   │              │ │
│  │  │ Config APIs  │  │ Calculations │  │ Batching     │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  │                                                                      │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │ Schema Manager│  │ Rules Engine │  │ Event Bus    │              │ │
│  │  │ (No-code)    │  │ (Workflows)  │  │ (Async)      │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│       ▲                                                                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      fxAI + fagent                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │ Risk Analysis│  │ Credit Score │  │ Predictions  │              │ │
│  │  │ (ML Models)  │  │ (Real-time)  │  │ (Anomalies)  │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│       ▲                                                                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Data & Infrastructure                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │ PostgreSQL   │  │ Redis Cache  │  │ Object Store │              │ │
│  │  │ Multi-tenant │  │ (Sessions)   │  │ (Documents)  │              │ │
│  │  │ Schemas      │  │              │  │              │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  │                                                                      │ │
│  │  ┌──────────────┐  ┌──────────────┐                                │ │
│  │  │ Message Queue│  │ Search Index │                                │ │
│  │  │ (Event Sink) │  │ (Elasticsearch)                               │ │
│  │  └──────────────┘  └──────────────┘                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

```

### 2.2 Multi-Tenant Data Isolation Strategy

**Tenant Identification**:
- Request header: `X-Tenant-ID` (mandatory)
- JWT claim: `tenant_id` (extracted at auth)
- Database connection string parameterized per tenant

**Data Isolation Levels**:
1. **Schema-level**: Separate PostgreSQL schemas per tenant (`tenant_{id}`)
2. **Row-level**: All tables have `tenant_id` column with RLS policies
3. **Application-level**: Services validate tenant_id on every operation

**Example**:
```sql
CREATE SCHEMA tenant_inst_001;
CREATE TABLE tenant_inst_001.accounts (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR NOT NULL,
  account_number VARCHAR NOT NULL,
  balance DECIMAL,
  created_at TIMESTAMP,
  -- Row-level security policy
  CONSTRAINT tenant_check CHECK (tenant_id = 'inst_001')
);
```

### 2.3 No-Code Configuration System

**Configuration Hierarchy**:
```
Institution (Tenant)
├── Products (Accounts, Loans, Cards, etc.)
│   ├── Schemas (fields, validation rules)
│   ├── Workflows (approval flows, settlement)
│   ├── Fees (schedules, calculations)
│   └── Limits (daily, monthly, per-transaction)
├── Rules (Business logic conditions)
├── Integrations (External APIs, ATM networks)
└── Branding (UI themes, logos, colors)
```

**Configuration Storage**:
- All stored as versioned JSON in `configurations` table
- Hot-reload on changes (via WebSocket notifications)
- Audit trail of every change
- Rollback capability to previous versions

---

## 3. Package Structure (Git Submodules)

```
getfluxo/                          # Root monorepo
├── .gitmodules                    # Submodule config (auto-generated)
├── .gitignore                     # Ignore lock files, node_modules
├── pnpm-workspace.yaml            # Workspace config
├── package.json                   # Root-level scripts
├── LICENSED                       # Author rights
├── ARCHITECTURE.md                # This file
├── CI-CD.md                       # Pipeline documentation
│
└── packages/
    ├── finfra/                    # Infrastructure (NEW - not a submodule)
    │   ├── docker/                # Docker files for all services
    │   ├── kubernetes/            # K8s manifests
    │   ├── terraform/             # IaC for cloud deployment
    │   ├── scripts/               # Deployment scripts
    │   └── monitoring/            # Observability setup
    │
    ├── fdocs/                     # Documentation (NEW - not a submodule)
    │   ├── api/                   # OpenAPI specs
    │   ├── guides/                # Deployment, operation guides
    │   ├── architecture/          # Design docs
    │   └── changelog/             # Release notes
    │
    ├── fengine/                   # Submodule: Core Finance Engine
    │   ├── src/
    │   │   ├── accounts/          # Account management
    │   │   ├── loans/             # Loan origination & management
    │   │   ├── payments/          # Payment processing
    │   │   ├── config/            # No-code configuration APIs
    │   │   ├── schemas/           # Dynamic schema management
    │   │   └── rules/             # Business rules engine
    │   └── package.json
    │
    ├── fwallet/                   # Submodule: Web Desktop Wallet
    │   ├── src/
    │   │   ├── components/        # Vue3 components
    │   │   ├── pages/             # Dashboard views
    │   │   ├── services/          # API clients
    │   │   └── stores/            # Pinia state management
    │   └── package.json
    │
    ├── fwallet-mobile/            # Submodule: Mobile App (React Native)
    │   ├── src/
    │   │   ├── screens/           # Navigation screens
    │   │   ├── components/        # React Native components
    │   │   ├── services/          # API clients
    │   │   └── stores/            # State management
    │   └── package.json
    │
    ├── fagent/                    # Submodule: API Agent / Sync Engine
    │   ├── src/
    │   │   ├── api/               # REST endpoints
    │   │   ├── sync/              # External system sync
    │   │   ├── batch/             # Batch processing
    │   │   └── webhooks/          # Event webhooks
    │   └── package.json
    │
    ├── fwk/                       # Submodule: Worker Framework (renamed from fworker)
    │   ├── src/
    │   │   ├── queue/             # Job queue (Bull + Redis)
    │   │   ├── workers/           # Worker implementations
    │   │   ├── scheduler/         # Cron jobs
    │   │   └── monitoring/        # Health checks
    │   └── package.json
    │
    ├── fxAI/                      # Submodule: AI/ML Services
    │   ├── src/
    │   │   ├── models/            # ML model serving
    │   │   ├── scoring/           # Risk/credit scoring
    │   │   ├── predictions/       # Predictive analytics
    │   │   └── agents/            # Agentic AI workflows
    │   └── package.json
    │
    └── fpay/                      # Submodule: Payment Gateway
        ├── src/
        │   ├── processors/        # Payment method processors
        │   ├── settlement/        # Settlement & reconciliation
        │   ├── webhooks/          # Payment provider callbacks
        │   └── compliance/        # PCI-DSS, regulatory
        └── package.json
```

---

## 4. Technology Stack

### 4.1 Backend Migration Path (Fastify → NestJS)

**Why NestJS?**
- ✅ Enterprise-grade DI/IoC container
- ✅ Type-safe through TypeScript
- ✅ Built-in guards/interceptors (multi-tenancy, auth)
- ✅ Microservice support (Message queues, gRPC)
- ✅ Better suited for complex domain logic
- ✅ Extensive ecosystem (Prisma, Bull, GraphQL)

**Migration Strategy**:
1. fengine: Full NestJS rewrite (core logic)
2. fagent: Hybrid (NestJS for API layer, keep event processing)
3. fpay: NestJS from start
4. fwk: NestJS + Bull for distributed job queue

### 4.2 Technology Choices

**Core Services**:
- Runtime: Node.js 20+ (LTS)
- Framework: NestJS 10+
- ORM: Prisma (multi-tenant schemas)
- API: REST + GraphQL (optional)
- Auth: JWT + OAuth2 (Keycloak/Auth0)

**Data Layer**:
- Primary: PostgreSQL 15+
- Cache: Redis 7+
- Search: OpenSearch/Elasticsearch
- Object Store: S3 (or compatible)
- Message Queue: RabbitMQ or Apache Kafka

**Frontend**:
- Web: Vue 3 + Nuxt 3 (SSR-capable)
- Mobile: React Native or Flutter
- State: Pinia + TanStack Query
- UI: Tailwind CSS + component library

**AI/ML**:
- Model serving: Python (FastAPI) + TensorFlow
- Inference: Groq API or local LLM
- Scoring: scikit-learn + pandas
- Feature store: Feast or custom

**DevOps/Infrastructure**:
- Container: Docker
- Orchestration: Kubernetes (EKS/AKS/GKE)
- IaC: Terraform
- CI/CD: GitHub Actions + ArgoCD
- Monitoring: Prometheus + Grafana + Loki
- APM: Datadog or New Relic

---

## 5. Multi-Tenant Data Model

### 5.1 Core Entities

```
Tenant (Institution)
├── id: UUID (inst_001, inst_002, ...)
├── name: String
├── country: String
├── regulatory_id: String
├── tier: STARTER | PROFESSIONAL | ENTERPRISE
└── schema_name: String (tenant_inst_001)

User
├── id: UUID
├── tenant_id: FK (Tenant)
├── email: String (unique per tenant)
├── role: ADMIN | MANAGER | OFFICER | CUSTOMER
└── permissions: JSON (role-based)

Account (Configurable Schema)
├── id: UUID
├── tenant_id: FK (Tenant)
├── account_number: String (unique per tenant)
├── account_type: String (CHECKING, SAVINGS, MONEY_MARKET) [from config]
├── holder_id: FK (Customer/User)
├── balance: Decimal (calculated field)
├── currency: String (from config)
├── status: ACTIVE | FROZEN | CLOSED
└── custom_fields: JSON (from schema config)

Loan (Configurable)
├── id: UUID
├── tenant_id: FK (Tenant)
├── borrower_id: FK (User)
├── principal_amount: Decimal
├── interest_rate: Decimal (from config rules)
├── term_months: Integer
├── purpose: String (from config products)
├── status: APPROVED | ACTIVE | DEFAULTED | CLOSED
├── risk_score: Float (calculated by fxAI)
└── dynamic_fields: JSON (schema-driven)

Payment
├── id: UUID
├── tenant_id: FK (Tenant)
├── from_account: FK (Account)
├── to_account: FK (Account)
├── amount: Decimal
├── currency: String
├── method: BANK_TRANSFER | MOBILE_MONEY | CARD | CASH
├── status: PENDING | PROCESSED | FAILED | REVERSED
├── settlement_date: Date
└── metadata: JSON (audit trail)

Configuration (Schema Definitions)
├── id: UUID
├── tenant_id: FK (Tenant)
├── entity_type: ACCOUNT | LOAN | PRODUCT | WORKFLOW
├── schema: JSON (Zod schema format)
├── rules: JSON (business rules)
├── version: Integer
├── effective_date: Date
└── audit_trail: JSONB (who changed what when)
```

### 5.2 Row-Level Security (PostgreSQL RLS)

```sql
-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's data
CREATE POLICY tenant_isolation_policy ON accounts
  USING (tenant_id = current_setting('app.current_tenant_id'));

-- Enforced in app middleware
SET app.current_tenant_id = 'inst_001';
```

---

## 6. Multi-Tenant Configuration Example

### 6.1 Product Definition (No-Code)

**Institution A (Bank)** - Deposits account product:
```json
{
  "product_id": "prod_checking_001",
  "name": "Conta Corrente Premium",
  "entity_type": "ACCOUNT",
  "schema": {
    "account_type": "CHECKING",
    "minimum_balance": 5000,
    "overdraft_allowed": true,
    "overdraft_limit": 50000,
    "monthly_fee": 2500,
    "fee_waived_on_balance": 100000
  },
  "rules": [
    {
      "rule_id": "rule_overdraft_interest",
      "trigger": "balance < 0",
      "action": "apply_interest_rate",
      "params": { "rate": 0.25 }
    }
  ],
  "workflow": {
    "approval": "instant",
    "settlement": "realtime"
  },
  "custom_fields": {
    "occupation": "text",
    "income_level": "select:[LOW,MEDIUM,HIGH]",
    "branch_code": "text"
  }
}
```

**Institution B (Fintech)** - Loans product:
```json
{
  "product_id": "prod_personal_loan_001",
  "name": "Empréstimo Pessoal Rápido",
  "entity_type": "LOAN",
  "schema": {
    "loan_types": ["PERSONAL", "COLLATERAL_FREE"],
    "min_amount": 50000,
    "max_amount": 10000000,
    "terms": [3, 6, 12, 24, 36],
    "interest_rate_fixed": 0.18
  },
  "ai_scoring": {
    "model": "credit_risk_v2",
    "min_score_for_approval": 600
  },
  "approval_workflow": {
    "steps": [
      { "step": 1, "action": "ai_scoring", "timeout_seconds": 30 },
      { "step": 2, "action": "manager_review", "condition": "score < 750" },
      { "step": 3, "action": "disbursement" }
    ]
  }
}
```

### 6.2 No-Code Configuration UI

Frontend allows institution admins to:
- Create/edit account schemas (drag-drop field builder)
- Define business rules (no-code rule builder)
- Set workflows and approval chains
- Configure fees and interest rates
- Create product bundles
- Set regulatory limits per product

---

## 7. Security Architecture

### 7.1 Authentication Flow

```
┌──────────────┐
│  Client App  │
└──────┬───────┘
       │ 1. User enters Institution ID + Credentials
       │
       ▼
┌──────────────────────────────────────────┐
│  API Gateway (fagent)                    │
│  - Extract X-Tenant-ID from domain/header
│  - Route to auth service                 │
└──────────────┬───────────────────────────┘
       │ 2. Validate tenant exists
       │
       ▼
┌──────────────────────────────────────────┐
│  Auth Service (fengine)                  │
│  - Verify credentials (tenant_id + email)
│  - Generate JWT: { sub, email, tenant_id, role, exp }
│  - Return access token + refresh token   │
└──────────────┬───────────────────────────┘
       │ 3. JWT token
       │
       ▼
┌──────────────┐
│  Client App  │
│  Stores JWT  │
└──────────────┘
```

**JWT Claims**:
```json
{
  "sub": "user_001",
  "email": "manager@institution.com",
  "tenant_id": "inst_001",
  "role": "MANAGER",
  "permissions": ["accounts:read", "loans:write"],
  "exp": 1700000000,
  "iat": 1699999000
}
```

### 7.2 Tenant Isolation Enforcement

**Every Request**:
1. Extract JWT → get `tenant_id`
2. Set database context: `SET app.current_tenant_id = 'inst_001'`
3. All queries filtered by tenant (RLS + app-level)
4. Return only tenant-scoped data
5. Log tenant + user + action (audit trail)

---

## 8. White-Label Deployment

### 8.1 Deployment Pipeline

```
┌─────────────────────────────────────┐
│  Institution Admin UI               │
│  (Gets configuration from tenant)   │
└────────────┬────────────────────────┘
             │ 1. Click "Generate White-Label App"
             │
       ┌─────▼──────────┐
       │ CI/CD Trigger  │
       │ GitHub Actions │
       └─────┬──────────┘
             │ 2. Build with institution config
             │
       ┌─────▼──────────────────────────┐
       │ Build Stage                    │
       │ - Fetch fwallet + fwallet-mobile
       │ - Inject tenant branding      │
       │ - Configure API endpoints     │
       │ - Build Docker images         │
       └─────┬──────────────────────────┘
             │
       ┌─────▼──────────────────────────┐
       │ Registry                       │
       │ (ECR/Docker Hub)               │
       │ Image: app-inst_001:v1.2.3     │
       └─────┬──────────────────────────┘
             │ 3. Deploy to K8s
             │
       ┌─────▼──────────────────────────┐
       │ Kubernetes Namespace           │
       │ namespace: tenant-inst-001     │
       │                                │
       │ Deployment: fwallet            │
       │ Service: LoadBalancer          │
       │ Secret: tenant-config          │
       └────────────────────────────────┘
```

### 8.2 Runtime Configuration Loading

**App Startup**:
```typescript
// fwallet/src/main.ts
const tenantId = localStorage.getItem('institution_id') || prompt('Enter Institution ID');
const config = await fetch(`/api/config?tenant_id=${tenantId}`).then(r => r.json());

// Apply branding
document.body.style.backgroundColor = config.theme.primary_color;
document.title = config.institution_name;

// Configure API endpoints
const apiClient = new APIClient({
  baseURL: `/api/v1/${tenantId}`,
  headers: { 'X-Tenant-ID': tenantId }
});

// Load role-based features
const features = config.products.map(p => p.name);
initializeFeatures(features);
```

---

## 9. AI/ML Integration (fxAI + fagent)

### 9.1 Risk Scoring Pipeline

```
┌─────────────────┐
│  Loan Request   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Feature Engineering             │
│  - Income-to-debt ratio          │
│  - Loan amount relative to assets │
│  - Credit history (days overdue) │
│  - Employment stability          │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Model Inference (fxAI)          │
│  - TensorFlow model: credit_risk_v2
│  - Returns: score [0-1000]      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Rules Engine (fengine)          │
│  - Apply thresholds (by tenant)  │
│  - Check regulatory limits       │
│  - Determine approval status     │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Approval/Denial │
└─────────────────┘
```

### 9.2 Agentic Workflows (fagent)

```
Task: Reconcile daily payments against settlement files

┌─────────────────────────────────┐
│ Start: Daily Settlement Check   │
│ Triggered: 23:00 UTC daily      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Observe:                            │
│ - Fetch processed payments (fengine)│
│ - Download settlement file (SWIFT)  │
│ - Compare amounts, timestamps       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Orient:                             │
│ - Classify discrepancies            │
│ - Check if within tolerance (0.1%)  │
│ - Flag anomalies for review         │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Decide:                             │
│ - Auto-reconcile matched items      │
│ - Route unmatched to manager queue  │
│ - Generate reconciliation report    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Act:                                │
│ - Update payment status             │
│ - Send notification to manager      │
│ - Log to audit trail                │
└─────────────────────────────────────┘
```

---

## 10. Roadmap & Milestones

### Phase 1: Foundation (Weeks 1-4)
- ✅ Git submodule structure + CI/CD
- ✅ fengine: Core account/payment APIs (NestJS)
- ✅ Multi-tenant data layer (PostgreSQL schemas + RLS)
- ✅ Authentication & authorization framework
- ✅ Configuration schema system
- ⬜ Basic admin UI for schema management

### Phase 2: Wallet & Payment (Weeks 5-8)
- ⬜ fwallet: Desktop web wallet (Vue3)
- ⬜ fwallet-mobile: Mobile app (React Native)
- ⬜ fpay: Payment processor (Stripe, Paystack, etc.)
- ⬜ Basic product configurations (savings, checking)
- ⬜ End-to-end transaction flow

### Phase 3: AI & Advanced Features (Weeks 9-12)
- ⬜ fxAI: Credit scoring models
- ⬜ fagent: Agentic reconciliation workflows
- ⬜ Advanced rule engine
- ⬜ Analytics dashboard
- ⬜ API integrations (ATM networks, SWIFT)

### Phase 4: Operations & Deployment (Weeks 13-16)
- ⬜ finfra: Full Kubernetes setup
- ⬜ fdocs: Complete API documentation
- ⬜ CI/CD pipelines (build, test, deploy)
- ⬜ Monitoring & observability
- ⬜ Security hardening (pen testing, compliance)

### Phase 5: Go-Live & Growth
- ⬜ Beta customers (3-5 institutions)
- ⬜ Performance tuning & optimization
- ⬜ Support & onboarding playbooks
- ⬜ Feature expansion based on feedback

---

## 11. Success Metrics

| Metric | Target | Owner |
|--------|--------|-------|
| Time to deploy new tenant | < 5 min | DevOps |
| API response time (p99) | < 200ms | Backend |
| Data isolation test coverage | 100% | QA |
| Configuration creation time | < 1 hour | Product |
| Uptime | 99.99% | DevOps |
| Payment processing latency | < 2 sec | Backend |
| Customer acquisition (year 1) | 10 institutions | Sales |
| Revenue per institution/month | $2,500-$25,000 | Finance |

---

## 12. Governance & Licensing

All packages include:
- Header with copyright and license (LICENSED file)
- CODEOWNERS file for each submodule
- DCO (Developer Certificate of Origin) enforcement
- Automated license compliance checks in CI

---

**Next Step**: Initialize Git submodule structure and begin fengine implementation in NestJS.
