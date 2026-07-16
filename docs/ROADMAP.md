# MAVULA Platform Roadmap

This roadmap records the public technical delivery sequence. Approved RFCs and
module contracts remain authoritative when scope changes.

## Current Delivery

- Institutional OAuth 2.0 and OpenID Connect identity with tenant-bound roles.
- Tenant isolation enforced by application authorization and PostgreSQL RLS.
- Controlled account lifecycle and financial adjustment operations with
  maker-checker approval.
- Durable payment process, webhook deduplication, reconciliation and guarded
  settlement publication.
- Regulatory exports and validation-only legacy imports with durable receipts.
- Versioned Identity Access, Ledger Core and Workbench OpenAPI contracts.
- Developer portal with operational guides, local Scalar references, code
  examples, Postman collection and GitHub Pages publication.

## Next Delivery

- Resolve public route ambiguity before a breaking Ledger Core API revision.
- Publish generated SDK packages only after compatibility and release policy are
  approved for each language.
- Add webhook consumer guides when externally supported webhook contracts are
  approved.
- Define RFC-0003 service boundaries for Go and Java modules, including
  settlement performance, compliance workflows and compliance officer duties.

## Deferred

- Hosted API sandbox and credential retention.
- Financial Event Sourcing as a replacement for current transactional sources
  of truth.
- Legacy import mutation of accounts, journals or lending state.
