# RFC-0002 Sixth Slice Closeout

## Delivery

`legacy-connectors` now owns durable operational state for regulatory batches in
its own PostgreSQL schema. Receipts retain only idempotency-key digests, enforce
request fingerprints and tenant RLS, and coordinate bounded leases and three
processing attempts. Artefacts are immutable after creation.

Ledger Core exposes a protected, read-only source for posted regulatory
transaction records. Workbench reads that source through a tenant-scoped service
token and executes `LEGACY_EXPORT` or `LEGACY_IMPORT` on the `legacy` queue.
Incomplete source mappings fail closed.

## Financial Boundary

Exports read financial facts but do not mutate them. Imports only stage and
validate fixed-width files. Neither path posts journals, changes lending state or
publishes financial domain events. Ledger Core remains the owner of financial
invariants and postings.

## Public Surface

Compliance operators can request exports, stage imports, inspect receipts,
download artefacts, review deterministic rejections and record authority
delivery. Public writes require bearer authentication, `compliance.manage`,
`Idempotency-Key` and `X-Correlation-ID`.

The owner OpenAPI contract and operational guide are published at
<https://mavulahq.github.io/developer-docs/>. Internal source, health and metrics
routes are excluded from the public contract.

## Operations

No new service deployment is introduced. Workbench loads `legacy-connectors` as
a domain package with a separate runtime database credential. Prometheus metrics
and alerts cover queue backlog, processing leases, rejections, terminal failures
and dead-letter jobs.
