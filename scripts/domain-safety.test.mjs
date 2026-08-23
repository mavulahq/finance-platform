import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { IdentityService } from "../packages/identity-access/dist/identity.service.js";
import {
  MemoryPaymentProcessStore,
  PaymentProcessManager,
} from "../packages/settlements/dist/index.js";

const require = createRequire(import.meta.url);
const { assertDomainEventEnvelope } = require(
  "../packages/ledger-core/dist/domain-events/domain-event.types.js",
);
const { DomainOutboxService } = require(
  "../packages/ledger-core/dist/domain-events/domain-outbox.service.js",
);
const { DomainInboxService } = require(
  "../packages/ledger-core/dist/domain-events/domain-inbox.service.js",
);

const CANONICAL_EVENT_ID = "evt_7e2edbbb-9ea6-4d7d-85f0-098594d79e9b";
const OTHER_EVENT_ID = "evt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function validEnvelope(overrides = {}) {
  return {
    event_id: CANONICAL_EVENT_ID,
    event_type: "lending.payment_posted",
    event_version: 1,
    occurred_at: "2026-06-30T10:00:00.000Z",
    tenant_id: "tenant_001",
    aggregate: { type: "loan", id: "loan_001", version: 1 },
    correlation_id: "corr_payment_001",
    causation_id: "cmd_7e2edbbb-9ea6-4d7d-85f0-098594d79e9b",
    idempotency_key: "tenant_001:loan_001:payment:v1",
    payload: {
      transaction_id: "txn_001",
      source_account_id: "CUST_001",
      money: { amount: "100.00", currency: "MZN" },
      allocation: { principal: "80.00", interest: "15.00", fees: "5.00" },
      balance_after: "900.00",
    },
    metadata: {
      producer: "ledger-core",
      data_classification: "restricted",
      schema_uri: "contracts/domain-events/event-envelope.schema.json",
    },
    ...overrides,
  };
}

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

test("accepts a canonical domain event envelope", () => {
  assert.doesNotThrow(() => assertDomainEventEnvelope(validEnvelope()));
});

test("rejects domain event envelopes that would break inbox and outbox gates", () => {
  assert.throws(
    () => assertDomainEventEnvelope(validEnvelope({ occurred_at: "2026-06-30T10:00:00+02:00" })),
    /occurred_at must be UTC/,
  );
  assert.throws(
    () => assertDomainEventEnvelope(validEnvelope({ event_id: "bad-id" })),
    /evt_<uuid>/,
  );
  assert.throws(
    () => assertDomainEventEnvelope(validEnvelope({ event_type: "INVALID" })),
    /<context>\.<fact>/,
  );
  assert.throws(
    () => assertDomainEventEnvelope(validEnvelope({ aggregate: { type: "loan" } })),
    /aggregate must include/,
  );
  assert.throws(
    () => assertDomainEventEnvelope(validEnvelope({ metadata: {} })),
    /producer and data_classification/,
  );
});

test("outbox append is idempotent per tenant and idempotency key", async () => {
  const outbox = new DomainOutboxService({ isConfigured: false });
  const first = await outbox.append(validEnvelope());
  const second = await outbox.append(
    validEnvelope({
      event_id: OTHER_EVENT_ID,
      payload: {
        transaction_id: "txn_duplicate_should_not_land",
        source_account_id: "CUST_001",
        money: { amount: "999.00", currency: "MZN" },
        allocation: { principal: "999.00", interest: "0.00", fees: "0.00" },
        balance_after: "0.00",
      },
    }),
  );

  assert.equal(first.status, "PENDING");
  assert.equal(first.envelope.event_id, CANONICAL_EVENT_ID);
  assert.equal(second.envelope.event_id, CANONICAL_EVENT_ID);
  assert.equal((await outbox.list("tenant_001")).length, 1);
  assert.equal((await outbox.list("tenant_other")).length, 0);
});

test("inbox replay of a processed event is idempotent and tenant-scoped", async () => {
  const inbox = new DomainInboxService({ isConfigured: false });
  const envelope = validEnvelope();
  const first = await inbox.startProcessing(envelope, "ledger-projections");
  assert.equal(first.started, true);
  await inbox.markProcessed(envelope.tenant_id, envelope.event_id, "ledger-projections");

  const replay = await inbox.startProcessing(envelope, "ledger-projections");
  assert.equal(replay.started, false);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.record.status, "PROCESSED");

  const otherTenant = await inbox.startProcessing(
    validEnvelope({ tenant_id: "tenant_002" }),
    "ledger-projections",
  );
  assert.equal(otherTenant.started, true);
  assert.equal(otherTenant.record.tenant_id, "tenant_002");
});

test("service identity fails closed when a client has multiple tenant bindings", async () => {
  const prisma = {
    oAuthClient: {
      findUnique: async () => ({
        id: "workbench",
        status: "ACTIVE",
        tenantBindings: [
          { tenant_id: "tenant-a", institution_id: "inst-a" },
          { tenant_id: "tenant-b", institution_id: "inst-b" },
        ],
        permissions: ["internal.worker", "super.admin", ""],
      }),
    },
    institution: {
      findFirst: async ({ where }) =>
        where.id === "inst-a" && where.tenantId === "tenant-a" ? { id: "inst-a" } : null,
    },
  };
  const service = new IdentityService(prisma);

  assert.equal(await service.findClientIdentity("workbench"), undefined);
  assert.equal(await service.findClientIdentity("workbench", "tenant-z"), undefined);

  const bound = await service.findClientIdentity("workbench", "tenant-a");
  assert.equal(bound.tenantId, "tenant-a");
  assert.equal(bound.institutionId, "inst-a");
  assert.deepEqual(bound.permissions, ["internal.worker"]);
});

test("expired payments cannot receive a late provider reference", async () => {
  const store = new MemoryPaymentProcessStore();
  const now = new Date("2026-06-30T10:00:00.000Z");
  const manager = new PaymentProcessManager(store, { now: () => now });

  await manager.start(
    paymentInput({
      idempotencyKey: "idem_expired_attach",
      expiresAt: new Date("2026-06-30T09:59:00.000Z"),
    }),
  );
  assert.equal((await manager.expireOverdue({ tenantId: "tenant_mz_001" })).expired, 1);

  await assert.rejects(
    () =>
      manager.attachProviderReference({
        tenantId: "tenant_mz_001",
        idempotencyKey: "idem_expired_attach",
        providerReference: "mpesa_late_001",
      }),
    /cannot attach providerReference to EXPIRED/,
  );
});

test("compensation-required payments stay frozen and do not emit another settlement", async () => {
  const store = new MemoryPaymentProcessStore();
  const manager = new PaymentProcessManager(store, {
    now: () => new Date("2026-06-30T10:00:00.000Z"),
    settlementOutboxEnabled: true,
  });

  await manager.start(
    paymentInput({
      idempotencyKey: "idem_compensation_frozen",
      providerReference: "mpesa_ref_compensation_001",
    }),
  );
  const settled = await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_compensation_001",
    providerEventId: "provider_event_settled_001",
    status: "succeeded",
  });
  assert.equal(settled.state, "SETTLED");
  assert.equal((await manager.metrics({ tenantId: "tenant_mz_001" })).outboxPending, 1);

  const compensated = await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_compensation_001",
    providerEventId: "provider_event_failed_001",
    status: "failed",
    failureReason: "provider reversed after settle",
  });
  assert.equal(compensated.state, "COMPENSATION_REQUIRED");

  const lateSuccess = await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_compensation_001",
    providerEventId: "provider_event_late_success_001",
    status: "succeeded",
  });
  const laterFailure = await manager.recordWebhook({
    tenantId: "tenant_mz_001",
    providerReference: "mpesa_ref_compensation_001",
    providerEventId: "provider_event_later_failed_001",
    status: "failed",
  });

  assert.equal(lateSuccess.state, "COMPENSATION_REQUIRED");
  assert.equal(laterFailure.state, "COMPENSATION_REQUIRED");
  const metrics = await manager.metrics({ tenantId: "tenant_mz_001" });
  assert.equal(metrics.compensationRequired, 1);
  assert.equal(metrics.outboxPending, 1);
});
