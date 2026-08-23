# Settlement outbox recovery

Operational contract for terminal `FAILED` `payments.settlement_completed`
outbox rows after a publish outage.

Verified against finance-platform pull request #51 (`settlements@f355d82`).
Until that change merges, `main` (`settlements@bed4759`) leaves those rows
`FAILED` forever: `claimOutboxEvents` never selects `FAILED`, and
`appendOutboxEvent` is `ON CONFLICT DO NOTHING`.

This is **outbox status** `FAILED`, not payment-process state `FAILED`.

## Intent

Settlements writes one `payments.settlement_completed` row per payment
process when the process is `SETTLED`, the webhook status is `succeeded`,
and `SETTLEMENTS_OUTBOX_ENABLED=true`. The unique key is
`(tenantId, processId, eventType)`.

Workbench `PaymentOutboxPublisherService` claims `PENDING` rows (or
`PUBLISHING` rows whose lease expired), enqueues the envelope for Ledger
Core, then marks the row `PUBLISHED`. After `maxAttempts` (default `3`)
failed publishes, the row becomes `FAILED` and drops out of the claim
query.

On #51, a later successful webhook replay for that already-`SETTLED`
process resets only a `FAILED` row to `PENDING` and clears attempts, lease,
`failedAt`, and `lastError`. The original outbox `id` and envelope
(`event_id`, payload, correlation, causation) stay unchanged so Ledger
Core Inbox dedupe remains stable.

`PENDING`, `PUBLISHING`, and `PUBLISHED` rows are not rewritten.

## Flags and publisher

Both flags must be `true` or no outbox work happens:

| Variable | Role | Default |
| --- | --- | --- |
| `SETTLEMENTS_OUTBOX_ENABLED` (`FPAY_SETTLEMENT_OUTBOX_ENABLED`) | Append on settle | off unless `true` |
| `SETTLEMENTS_OUTBOX_PUBLISHER_ENABLED` (`FPAY_OUTBOX_PUBLISHER_ENABLED`) | Workbench poll/claim loop | off unless `true` |

Publisher defaults: poll `1000` ms, batch `25`, lease `30` s. Transient
retries use `min(60s, 1s * 2^(attempts-1))` before the next `availableAt`.
The third failed mark is terminal `FAILED`.

## How to detect

JSON gauges live on `GET /api/status/metrics` (`workbench.read`). Prometheus
text lives on `GET /api/metrics`. Both expose:

- `workbench_payment_outbox_failed` / `fwk_payment_outbox_failed`
- `workbench_payment_outbox_pending`
- `workbench_payment_outbox_publishing`
- `workbench_payment_outbox_published`

A stuck `outbox_failed > 0` with `outbox_pending = 0` after a transport
outage is the signal. Process-state `failed` / `compensation_required` are
different gauges and a different workflow.

## How to recover (after #51)

Replay the original successful settlement webhook. Use the same tenant
token, `provider_reference`, `provider_event_id`, and `status=succeeded`.
`PAYMENT_SETTLEMENT` requires `finance.approve` or `internal.worker` in
addition to `workbench.jobs.write`.

Payment jobs do not use an `Idempotency-Key` header. The webhook receipt
is keyed by tenant + provider reference + provider event id.

```bash
curl -sS -X POST "$WORKBENCH_URL/api/jobs" \
  -H "Authorization: Bearer $MAVULA_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: $CORRELATION_ID" \
  -d '{
    "queue": "payments",
    "type": "PAYMENT_SETTLEMENT",
    "payload": {
      "provider_reference": "mpesa_ref_settlement_retry_001",
      "provider_event_id": "provider_event_settlement_retry_001",
      "status": "succeeded"
    }
  }'
```

Expected after #51: `outbox_failed` decreases by one, `outbox_pending`
increases by one, and the next publisher claim reuses the original outbox
row id. Ledger Core Inbox already processed that `event_id` returns
idempotent success and does not post a journal.

A new `provider_event_id` on an already-`SETTLED` process also calls
append and can recover a `FAILED` row. Prefer the original event id so
receipt history stays aligned with the provider.

## What this does not recover

| Situation | What happens |
| --- | --- |
| Process is `FAILED` or `EXPIRED`, then a `succeeded` webhook arrives | Process moves to `COMPENSATION_REQUIRED`. No settlement outbox is appended. |
| Process is `SETTLED`, then a `failed` webhook arrives | Process moves to `COMPENSATION_REQUIRED`. Outbox is not reset. |
| `SETTLEMENTS_OUTBOX_ENABLED` is not `true` | Replay is a no-op for the outbox. |
| Row is `PENDING` / `PUBLISHING` / `PUBLISHED` | Conflict path leaves the row unchanged. |
| `main` before #51 | Replay is a no-op for a `FAILED` row. Manual SQL is not a supported runbook. |

Do not invent a second `payments.settlement_completed` event for the same
process. There is one row per `(tenantId, processId, eventType)`.

## Downstream

Ledger Core records the envelope in Inbox and does not mutate ledger or
lending state from `payments.settlement_completed`. That event is also an
inactive workflow trigger. `COMPLETED` on the `PAYMENT_SETTLEMENT` job is
not a ledger posting.

Draft #60 is the ledger-core counterpart (terminal `FAILED` journal /
payment outbox). Do not treat that recovery as live until it merges.

## Common pitfalls

- Watching process `failed` instead of `outbox_failed`.
- Replaying `PAYMENT_SETTLEMENT` without `finance.approve` or
  `internal.worker`.
- Expecting the publisher to pick `FAILED` rows without a successful
  webhook replay.
- Changing `provider_reference` on replay (that looks up a different
  process or fails).
- Assuming #48 / #49 atomic-settle and incomplete-callback fixes are in
  `#51`; that pin is `f355d82` on top of `main` `bed4759` only.
