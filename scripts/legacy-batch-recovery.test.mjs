import assert from "node:assert/strict";
import test from "node:test";
import {
  LegacyBatchManager,
  MemoryLegacyBatchStore,
} from "../packages/legacy-connectors/dist/index.js";

const now = new Date("2026-08-01T08:00:00.000Z");
const exportInput = {
  tenant_id: "tenant_demo_001",
  institution_id: "institution_demo_001",
  idempotency_key: "idem-recovery-export-1",
  correlation_id: "corr-recovery-export-1",
  requested_by: "operator-1",
  period_from: "2026-07-01",
  period_to: "2026-07-31",
  generated_at: now.toISOString(),
  legal_basis_code: "MZ-AML-14-2023-ART-43",
  retention_until: "2036-07-31",
};

test("transient export failures requeue until max attempts then fail closed", async () => {
  const store = new MemoryLegacyBatchStore();
  const manager = new LegacyBatchManager(store, () => now);
  const receipt = await manager.requestExport({
    ...exportInput,
    idempotency_key: "idem-recovery-retry",
  });

  await assert.rejects(
    () =>
      manager.processExport(receipt.tenant_id, receipt.id, async () => {
        throw new Error("source unavailable");
      }),
    /source unavailable/,
  );
  const afterFirst = await manager.get(receipt.tenant_id, receipt.id);
  assert.equal(afterFirst?.state, "QUEUED");
  assert.equal(afterFirst?.attempts, 1);
  assert.equal(afterFirst?.failure_reason, "source unavailable");

  await assert.rejects(
    () =>
      manager.processExport(receipt.tenant_id, receipt.id, async () => {
        throw new Error("source unavailable");
      }),
    /source unavailable/,
  );
  await assert.rejects(
    () =>
      manager.processExport(receipt.tenant_id, receipt.id, async () => {
        throw new Error("source unavailable");
      }),
    /source unavailable/,
  );

  const failed = await manager.get(receipt.tenant_id, receipt.id);
  assert.equal(failed?.state, "FAILED");
  assert.equal(failed?.attempts, 3);

  const afterTerminal = await manager.processExport(receipt.tenant_id, receipt.id, []);
  assert.equal(afterTerminal.state, "FAILED");
  assert.equal(afterTerminal.attempts, 3);
});

test("memory batch reads stay tenant-scoped for receipts and artifacts", async () => {
  const store = new MemoryLegacyBatchStore();
  const manager = new LegacyBatchManager(store, () => now);
  const receipt = await manager.requestExport({
    ...exportInput,
    idempotency_key: "idem-recovery-tenant",
  });
  const generated = await manager.processExport(receipt.tenant_id, receipt.id, [
    {
      record_id: "regtxn_demo_001",
      transaction_id: "txn_payment_demo_001",
      transaction_type: "LOAN_PAYMENT",
      instruction_method: "BATCH",
      source_party_id: "customer_demo_001",
      source_account_id: "account_demo_001",
      destination_party_id: "institution_demo_001",
      destination_account_id: "loan_demo_001",
      counterparty_id: "institution_demo_001",
      amount_minor: "12000000",
      currency: "MZN",
      occurred_at: "2026-07-15T12:00:00.000Z",
      recorded_at: "2026-07-15T12:00:01.000Z",
      correlation_id: "corr_regtxn_demo_001",
      retention_until: "2036-07-15",
      legal_basis_code: "MZ-AML-14-2023-ART-43",
    },
  ]);

  assert.equal(generated.state, "GENERATED");
  assert.ok(await manager.get(receipt.tenant_id, receipt.id));
  assert.ok(await manager.getArtifact(receipt.tenant_id, receipt.id));
  assert.equal(await manager.get("tenant_other", receipt.id), undefined);
  assert.equal(await manager.getArtifact("tenant_other", receipt.id), undefined);
});
