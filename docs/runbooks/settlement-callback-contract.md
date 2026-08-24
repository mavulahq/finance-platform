# Settlement callback contract

Operational contract for `PAYMENT_SETTLEMENT` jobs that record a provider
webhook on a payment process.

Verified against finance-platform pull request #48 (`workbench@bcdcb46`).
Until that change merges, `main` (`workbench@aa91809`) still accepts
incomplete callbacks: a missing `provider_event_id` becomes the Workbench
job id, and a missing `status` becomes `succeeded`.

This is the **webhook receipt** contract, not outbox status `FAILED`. Terminal
`payments.settlement_completed` recovery is a different workflow (see
finance-platform #69).

## Intent

Settlements dedupes receipts on
`(tenantId, providerReference, providerEventId)`. The public OpenAPI schema
`PaymentSettlementPayload` already requires `provider_reference`,
`provider_event_id`, and `status` in `{pending, succeeded, failed}`.

`POST /api/jobs` does not validate that payload. Create returns `201` with
`status: QUEUED`. The worker (`JobHandlersService.recordPaymentSettlement`)
is the enforcement point.

On #48 the worker rejects a blank event id and any status outside the enum.
On `main` it substitutes `job.id` and defaults `status` to `succeeded`, so a
malformed callback can mark a process `SETTLED`.

## Required payload

| Field | Public name | Also accepted | Constraint |
| --- | --- | --- | --- |
| Provider reference | `provider_reference` | `providerReference`, `payment_reference` | Non-empty string. Looks up the process. |
| Provider event id | `provider_event_id` | `providerEventId`, `webhook_event_id` | Non-empty string. After #48, **not** the Workbench job id. |
| Status | `status` | — | Exactly `pending`, `succeeded`, or `failed`. |
| Failure reason | `failure_reason` | `failureReason` | Optional. Stored on `failed` / compensation paths. |

Payment jobs do not use an `Idempotency-Key` header. Reuse
`payload.idempotency_key` only on `PAYMENT_CAPTURE` / `PAYMENT_DISBURSEMENT`
start. Settlement replay is the same `provider_reference` +
`provider_event_id`.

Create requires `workbench.jobs.write`. After #52, `PAYMENT_SETTLEMENT` also
requires `finance.approve` or `internal.worker`; that boundary is documented
in finance-platform #67, not here.

## How to submit (after #48)

```bash
curl -sS -X POST "$WORKBENCH_URL/api/jobs" \
  -H "Authorization: Bearer $MAVULA_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: $CORRELATION_ID" \
  -d '{
    "queue": "payments",
    "type": "PAYMENT_SETTLEMENT",
    "payload": {
      "provider_reference": "mpesa_ref_settlement_001",
      "provider_event_id": "provider_event_settlement_001",
      "status": "succeeded"
    }
  }'
```

Expected: HTTP `201`, job `QUEUED`. Persist `id` and poll `GET /api/jobs/{jobId}`.
`COMPLETED` on the job is not a ledger posting.

A duplicate with the same tenant + reference + event id reapplies the **stored
receipt** status. It does not insert a second receipt.

## Process transitions

Settlements `PaymentProcessManager.transition` (unchanged by #48):

| Current process state | `status` | Next state |
| --- | --- | --- |
| `PENDING` or `PROVIDER_PENDING` | `pending` | `PROVIDER_PENDING` |
| Any other state | `pending` | unchanged |
| `FAILED` or `EXPIRED` | `succeeded` | `COMPENSATION_REQUIRED` (no settlement outbox) |
| `SETTLED` | `succeeded` | `SETTLED` (outbox append only if enabled; see #51/#69) |
| Any other state | `succeeded` | `SETTLED` |
| `SETTLED` | `failed` | `COMPENSATION_REQUIRED` |
| `FAILED` | `failed` | `FAILED` |
| `COMPENSATION_REQUIRED` | any | unchanged |
| Other active states | `failed` | `FAILED` |

Settlements already throws `providerEventId is required` and
`unsupported webhook status: …` if the worker forwards a blank id or an
unknown status. On `main` the worker never forwards those failures: it fills
them in first.

## What `main` does today

`JobHandlersService.recordPaymentSettlement` on `workbench@aa91809`:

```ts
providerEventId: this.requiredString(
  payload.provider_event_id || payload.providerEventId || payload.webhook_event_id || job.id,
  'provider_event_id',
)
status: (payload.status || 'succeeded')
```

Consequences:

- Omitting `status` liquidates the process.
- Omitting `provider_event_id` stores the Workbench job id as the receipt key.
  A later provider callback with the real event id is a **new** receipt.
- HTTP `201` still succeeds; the defect is in the worker, not enqueue.

After #48 those two substitutions are removed. The job then fails at the
worker (`provider_event_id is required` or
`status must be one of pending, succeeded, or failed`) and retries until
`max_attempts` (default `3`) mark it `FAILED`.

## Common pitfalls

- Treating job `COMPLETED` as settlement or ledger success.
- Sending `Idempotency-Key` on `POST /api/jobs` and expecting receipt dedupe.
- Using `SUCCEEDED` / `success` / empty `status` (only the three lowercase
  enum values are valid after #48; empty means `succeeded` on `main`).
- Relying on the worker to mint `provider_event_id` from `job.id`.
- Changing `provider_reference` on replay (looks up a different process).
- Assuming #48 includes #51 outbox `FAILED` reset or #49 atomic settle. It is
  a Workbench gitlink only (`bcdcb46` on `aa91809`).
