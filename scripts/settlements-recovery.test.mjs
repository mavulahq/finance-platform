import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryPaymentProcessStore,
  PaymentProcessManager,
} from "../packages/settlements/dist/index.js";

function paymentInput(overrides = {}) {
  return {
    tenantId: "tenant_mz_001",
    idempotencyKey: overrides.idempotencyKey || "idem_process_default",
    correlationId: overrides.correlationId || "corr_process_default",
    rail: "mpesa",
    amount: overrides.amount || {
      currency: "MZN",
      valueMinor: 15000,
    },
    payer: overrides.payer || {
      accountRef: "customer_001",
      phoneNumber: "+258840000000",
    },
    payee: overrides.payee || {
      accountRef: "merchant_001",
    },
    metadata: overrides.metadata,
    providerReference: overrides.providerReference,
    expiresAt: overrides.expiresAt,
  };
}

test("late success after expiry requires compensation and does not settle the outbox", async () => {
  const store = new MemoryPaymentProcessStore();
  const manager = new PaymentProcessManager(store, {
    now: () => new Date("2026-06-30T10:00:00.000Z"),
    settlementOutboxEnabled: true,
  });

  await manager.start(
    paymentInput({
      idempotencyKey: "idem_expired_success_001",
      providerReference: "mpesa_ref_expired_success_001",
      expiresAt: new Date("2026-06-30T09:00:00.000Z"),
    }),
  );
  await manager.expireOverdue({
    tenantId: "tenant_mz_001",
    now: new Date("2026-06-30T11:00:00.000Z"),
  });

  const result = await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_expired_success_001",
    providerEventId: "provider_event_expired_success_001",
    status: "succeeded",
  });
  const metrics = await manager.metrics({ tenantId: "tenant_mz_001" });

  assert.equal(result.state, "COMPENSATION_REQUIRED");
  assert.equal(metrics.compensationRequired, 1);
  assert.equal(metrics.outboxPending, 0);
  assert.equal(result.settledAt, undefined);
});

test("late success after failure requires compensation and stays there on replay", async () => {
  const store = new MemoryPaymentProcessStore();
  const manager = new PaymentProcessManager(store);

  await manager.start(
    paymentInput({
      idempotencyKey: "idem_failed_success_001",
      providerReference: "mpesa_ref_failed_success_001",
    }),
  );
  await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_failed_success_001",
    providerEventId: "provider_event_failed_success_001",
    status: "failed",
    failureReason: "provider-timeout",
  });

  const first = await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_failed_success_001",
    providerEventId: "provider_event_failed_success_002",
    status: "succeeded",
  });
  const replay = await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_failed_success_001",
    providerEventId: "provider_event_failed_success_002",
    status: "failed",
    failureReason: "duplicate-must-not-downgrade",
  });

  assert.equal(first.state, "COMPENSATION_REQUIRED");
  assert.equal(replay.state, "COMPENSATION_REQUIRED");
  assert.equal((await manager.metrics({ tenantId: "tenant_mz_001" })).compensationRequired, 1);
});

test("webhooks cannot observe or mutate another tenant's payment process", async () => {
  const store = new MemoryPaymentProcessStore();
  const manager = new PaymentProcessManager(store);

  await manager.start(
    paymentInput({
      idempotencyKey: "idem_tenant_isolation_001",
      providerReference: "mpesa_ref_tenant_isolation_001",
    }),
  );

  await assert.rejects(
    () =>
      manager.recordWebhook({
        tenantId: "tenant_mz_002",
        providerReference: "mpesa_ref_tenant_isolation_001",
        providerEventId: "provider_event_tenant_isolation_001",
        status: "succeeded",
      }),
    /payment process not found for provider reference/,
  );

  const original = await store.findProcessByProviderReference(
    "tenant_mz_001",
    "mpesa_ref_tenant_isolation_001",
  );
  const leaked = await store.findProcessByProviderReference(
    "tenant_mz_002",
    "mpesa_ref_tenant_isolation_001",
  );

  assert.equal(original?.state, "PROVIDER_PENDING");
  assert.equal(leaked, undefined);
});

test("outbox publish and fail require the claiming worker lock", async () => {
  const store = new MemoryPaymentProcessStore();
  const manager = new PaymentProcessManager(store, {
    now: () => new Date("2026-06-30T10:00:00.000Z"),
    settlementOutboxEnabled: true,
  });

  await manager.start(
    paymentInput({
      idempotencyKey: "idem_outbox_lock_001",
      providerReference: "mpesa_ref_outbox_lock_001",
    }),
  );
  await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_outbox_lock_001",
    providerEventId: "provider_event_outbox_lock_001",
    status: "succeeded",
  });

  const [claimed] = await manager.claimOutboxEvents({
    lockedBy: "publisher_owner",
    now: new Date("2026-06-30T10:01:00.000Z"),
    leaseMs: 30_000,
  });

  await manager.markOutboxEventPublished(
    { ...claimed, lockedBy: "publisher_intruder" },
    new Date("2026-06-30T10:01:01.000Z"),
  );
  await manager.markOutboxEventFailed(
    { ...claimed, lockedBy: "publisher_intruder" },
    new Error("should-not-apply"),
    new Date("2026-06-30T10:01:01.000Z"),
  );

  const afterIntruder = await manager.metrics({ tenantId: "tenant_mz_001" });
  assert.equal(afterIntruder.outboxPublishing, 1);
  assert.equal(afterIntruder.outboxPublished, 0);
  assert.equal(afterIntruder.outboxFailed, 0);

  const [reclaimed] = await manager.claimOutboxEvents({
    lockedBy: "publisher_owner",
    now: new Date("2026-06-30T10:01:31.000Z"),
    leaseMs: 30_000,
  });
  assert.equal(reclaimed.id, claimed.id);
  assert.equal(reclaimed.attempts, 2);

  await manager.markOutboxEventPublished(reclaimed, new Date("2026-06-30T10:01:32.000Z"));
  const afterOwner = await manager.metrics({ tenantId: "tenant_mz_001" });
  assert.equal(afterOwner.outboxPublishing, 0);
  assert.equal(afterOwner.outboxPublished, 1);
});
