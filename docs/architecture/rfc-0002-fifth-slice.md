# RFC-0002 Fifth Slice Closeout

## Delivery

`ledger-core` owns durable HTTP idempotency receipts. Each public write requires
an `Idempotency-Key`; receipt, domain mutation, audit event and Outbox records
commit inside one tenant-scoped PostgreSQL transaction. Replays return the
stored response, divergent fingerprints return conflict, and failed attempts
roll back without blocking retry.

`developer-docs` publishes versioned Identity Access, Ledger Core and Workbench
OpenAPI contracts. Owner repositories remain canonical, while the publication
manifest binds copied contracts by repository, path and SHA-256 digest.

`legacy-connectors` introduces the `legacy.regulatory_transaction_export@1`
contract with a COBOL copybook, 2048-byte fixed-width layout, SHA-256 trailer,
synthetic fixture and deterministic validator. It has no owner-store access and
does not execute imports, exports or financial commands in this slice.

## Operational Boundary

Metrics and structured logs cover HTTP outcomes, auth failures, tenant binding,
idempotency outcomes, expired receipts, request validation and controlled
adjustments. Prometheus scrapes `/api/metrics`; public OpenAPI excludes health,
metrics, OIDC interaction and internal worker callbacks.

No new service deployment is introduced. `developer-docs` publishes a static
GitHub Pages artifact and `legacy-connectors` remains a contract package.
