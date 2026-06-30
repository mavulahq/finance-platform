# RFC-0001 Phase 3 and 4 Impact Analysis

Status: **Draft**

Date: 2026-06-29

RFC: [RFC-0001](https://github.com/orgs/getfluxo-io/discussions/1)

This document records the implementation impact of the next RFC-0001 stages. It separates the RFC stages from the product roadmap stages:

- RFC-0001 Phase 3: read models and projections.
- RFC-0001 Phase 4: cross-context processes and process managers.
- Roadmap Phase 3: Payments.
- Roadmap Phase 4: customer channels and intelligence.

## Current baseline

RFC-0001 Phase 2 is closed for the `fengine` runtime event scope. The active events are:

- `lending.loan_disbursed` v1.
- `lending.payment_posted` v1.
- `products.configuration_published` v1.
- `ledger.journal_posted` v1.

These events have versioned contracts, Outbox producers, BullMQ transport through `fwk`, Inbox/idempotency where applicable, and tests.

`payments.settlement_completed` remains `proposed`. It belongs to the Payments bounded context, and its producer is `fpay`. It must not be treated as delivered by `fengine`.

RFC-0001 Phase 3 has an initial implementation for the existing modules:

- `fengine` stores tenant-scoped projections for `loan_activity`, `ledger_activity`, and `product_publication`.
- `fengine` exposes projection list, detail, status, and internal rebuild APIs.
- `fwk` includes `fengine` projection status in the platform dependency status when enabled.

RFC-0001 Phase 4 has a first foundation implementation for the existing modules:

- `fpay` stores payment process state, webhook receipts and payment outbox rows in PostgreSQL.
- `fwk` executes payment process and reconciliation jobs through `fpay` and exposes process metrics.
- `fengine` keeps `payments.settlement_completed` outside active financial mutation paths.
- `finfra` provides migration, runtime configuration and monitoring support for payment processes.

## Module impact

| Module | Current responsibility | Phase 3 impact | Phase 4 impact |
| --- | --- | --- | --- |
| `fengine` | Financial source of truth, ledger, lending, product configuration, audit trail, Outbox/Inbox. | Owns initial projections for financial read use cases. Projections are rebuildable and tenant-scoped. | Participates as command owner for ledger and lending effects. It must not delegate financial invariants to workflow jobs. |
| `fwk` | Worker runtime, BullMQ transport, retries, schedules, DLQ, public platform status. | Exposes `fengine` projection status with dependency health and worker metrics. | Runs jobs for process steps but does not own business state or decide financial outcomes. |
| `fpay` | Payment adapter contract foundation. | No read model should depend on `payments.settlement_completed` until `fpay` has payment state and Outbox support. | Owns payment settlement facts, webhook idempotency, reconciliation and provider-facing process state. |
| `finfra` | Local and Kubernetes platform infrastructure. | Provides PostgreSQL, Redis, observability and deployment support for projection consumers. | Provides runtime support for process-manager workers, metrics and alerts. |
| `fwallet` | Planned institution operating surface. | Consumes read models for operator screens. It should not compute balances or financial state directly. | Surfaces process state and exception handling, but does not own process invariants. |
| `fwallet-mobile` | Planned customer channel. | Consumes stable read APIs for balances, loan state, repayment history and transaction history. | Receives process status and notifications; does not orchestrate financial processes. |
| `fdocs` | Planned documentation and integration guides. | Documents read model freshness, rebuild and fallback rules. | Documents process states, timeout semantics and retry behavior. |
| `fxAI` | Planned analytics and decision-support module. | Consumes projections only where classification, consent and freshness are explicit. | Can consume process outcomes for analysis, but cannot execute compensating financial actions. |

## Phase 3 read models

Read models are allowed only when they improve query safety, operator performance or integration clarity. They must not become the source of truth for financial invariants.

Implemented initial scope:

| Read model | Owner | Source events | Freshness | Rebuild | Fallback |
| --- | --- | --- | --- | --- | --- |
| Loan activity view | `fengine` | `lending.loan_disbursed`, `lending.payment_posted`. | Eventually consistent for operator views. | Rebuild from active Outbox event history. | Read canonical loan state when a synchronous decision is required. |
| Ledger activity view | `fengine` | `ledger.journal_posted`. | Eventually consistent for reporting and audit navigation. | Rebuild from active Outbox event history. | Read ledger tables for accounting decisions. |
| Product publication view | `fengine` | `products.configuration_published`. | Eventually consistent for configuration history. | Rebuild from active Outbox event history. | Read product configuration tables for command validation. |

Deferred candidates:

- Payment settlement view: blocked until `fpay` owns payment state and publishes `payments.settlement_completed`.
- Customer mobile timeline: blocked until stable institution-facing read APIs exist.
- AI feature store: blocked until data classification, retention and model governance are explicit.

Minimum implementation requirements:

- Projection state is stored in PostgreSQL with tenant isolation.
- Each projection records last processed `event_id`, event type, version and timestamp.
- Consumers use Inbox semantics for deduplication.
- Projection lag is observable through metrics or status endpoints.
- Rebuild procedures are deterministic and documented.

## Phase 4 process managers

Process managers are justified only for durable multi-context processes with timeouts, retries and compensation. They must not replace local transactions inside a bounded context.

Initial candidates:

| Process | Owner | Trigger | Required contexts | Status |
| --- | --- | --- | --- | --- |
| External payment settlement reconciliation | `fpay` | Provider callback or settlement file. | Payments, Accounts & Ledger, Audit & Reporting. | Foundation implemented for process state, webhook idempotency, reconciliation and metrics. Settlement event activation remains blocked. |
| Loan disbursement through external rail | `fengine` with `fpay` participation. | Approved loan command requiring external transfer. | Lending, Payments, Accounts & Ledger. | Deferred until Payments has a settlement contract. |
| Failed settlement exception handling | `fpay` | Failed or mismatched provider settlement. | Payments, Workflow, Audit & Reporting. | Deferred until settlement state exists. |

Minimum implementation requirements:

- Durable process state in PostgreSQL.
- Explicit process id, tenant id, correlation id and current state.
- Idempotent command handling for every external effect.
- Timeout and retry policy per step.
- Compensation policy where a completed step cannot be rolled back.
- Audit trail entries for state transitions.
- Metrics for active, failed, timed out and compensated processes.

## Answers to RFC-0001 open questions

1. **Does the bounded context map separate accounts, ledger, lending and payments correctly?**

   Yes. The current map is valid as an initial boundary. `fengine` owns Accounts & Ledger and Lending. `fpay` owns Payments. `fwk` owns operational execution, not business facts. This separation prevents payment adapters from writing ledger state directly.

2. **Which flow should be the first vertical slice: loan disbursement or payment settlement?**

   The first delivered vertical slice was `lending.loan_disbursed`. That was the correct choice because it used existing `fengine` ownership and avoided depending on incomplete external payment provider state.

3. **Should BullMQ remain focused on command jobs while domain events receive a dedicated transport later?**

   Yes. BullMQ remains the initial transport adapter. The canonical event record is the Outbox row, not the BullMQ job. A dedicated broker can be introduced later without changing event semantics.

4. **Which read model brings the largest initial benefit with low financial risk?**

   The initial implementation delivers loan activity, ledger activity, and product publication projections. They support operator navigation, audit navigation and configuration history. They are eventually consistent and must not be used for command-side financial decisions.

5. **Where is eventual consistency acceptable and where is it prohibited?**

   It is acceptable for dashboards, activity timelines, reporting navigation, configuration history and mobile summaries. It is prohibited for ledger posting, balance mutation, loan approval, payment allocation, disbursement and any command that enforces a financial invariant.

6. **Which additional envelope fields are essential for audit and operation in Mozambique?**

   The current envelope is sufficient for Phase 3 if `tenant_id`, `correlation_id`, `causation_id`, aggregate identity, version and data classification remain mandatory. Future payment events may need provider reference, settlement date and rail metadata inside payload, not as generic envelope fields.

7. **What was learned from Outbox/Inbox, replay and versioning in this implementation?**

   The practical rule is to treat delivery as at-least-once and make effects unique through database constraints, idempotency keys and Inbox records. The `ledger.journal_posted` race fix confirms that idempotency barriers must happen before balance mutations, not only around event publication.

## Recommended implementation order

1. Add a minimal projection runtime in `fengine` for one read model. Implemented for three initial projections.
2. Expose projection status and lag through `fwk` or `fengine` status endpoints. Implemented through `fengine` projection status and `fwk` dependency status.
3. Document freshness, rebuild and fallback for the first read model in `fdocs` when that module exists.
4. Implement `fpay` payment state, webhook verification and Outbox before activating `payments.settlement_completed`. Foundation implemented for state, webhook idempotency and outbox storage; provider signature verification remains pending.
5. Introduce process managers only after a real cross-context payment settlement flow exists. Foundation implemented for the payment process runtime; cross-context settlement activation remains pending.
