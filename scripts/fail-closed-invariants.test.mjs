import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { hash } from "argon2";
import { exportJWK, generateKeyPair } from "jose";
import {
  assertMakerChecker,
  effectivePermissions,
  isInstitutionalRole,
} from "../packages/identity-access/dist/access.types.js";
import { getIdentityConfig } from "../packages/identity-access/dist/config.js";
import { IdentityService } from "../packages/identity-access/dist/identity.service.js";

const require = createRequire(import.meta.url);
const {
  MemoryPaymentProcessStore,
  PaymentProcessManager,
  assertValidPaymentRequest,
} = require("../packages/settlements/dist/index.js");
const {
  MAX_LEGACY_BATCH_RECORDS,
  generateRegulatoryTransactionExport,
} = require("../packages/legacy-connectors/dist/index.js");

const checker = {
  subject: "operator-checker",
  accountId: "operator-checker|membership-1",
  tenantId: "tenant-1",
  institutionId: "institution-1",
  roles: ["operations_checker"],
  permissions: ["finance.read", "finance.approve"],
};

const canonicalRecord = {
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
};

function paymentRequest(overrides = {}) {
  return {
    tenantId: "tenant_mz_001",
    idempotencyKey: "idem_001",
    rail: "mpesa",
    amount: { currency: "MZN", valueMinor: 15000 },
    payer: { accountRef: "customer_001" },
    payee: { accountRef: "merchant_001" },
    ...overrides,
  };
}

async function signingEnv() {
  const { privateKey } = await generateKeyPair("PS256", {
    modulusLength: 2048,
    extractable: true,
  });
  const key = await exportJWK(privateKey);
  return {
    IDENTITY_ISSUER: "https://identity.example.test",
    IDENTITY_JWKS_JSON: JSON.stringify({
      keys: [{ ...key, kid: "test", alg: "PS256", use: "sig" }],
    }),
    IDENTITY_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
  };
}

async function withIdentityEnv(overrides, verify) {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, await signingEnv(), overrides);
    verify();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
}

test("maker-checker fail-closes without finance.approve and still blocks self-approval", () => {
  assert.throws(
    () =>
      assertMakerChecker("operator-maker", {
        ...checker,
        permissions: ["finance.read", "finance.write"],
      }),
    /finance.approve permission is required/,
  );
  assert.throws(
    () => assertMakerChecker("operator-checker", checker),
    /self-approval is not permitted/,
  );
  assert.doesNotThrow(() => assertMakerChecker("operator-maker", checker));
});

test("institution_admin cannot write or approve finance postings", () => {
  const admin = effectivePermissions(["institution_admin"]);
  assert.deepEqual(admin, ["finance.read", "configuration.write", "identity.admin"]);
  assert.equal(admin.includes("finance.write"), false);
  assert.equal(admin.includes("finance.approve"), false);
  assert.equal(isInstitutionalRole("superuser"), false);
  assert.equal(isInstitutionalRole("auditor"), true);
});

test("identity configuration rejects HTTP issuers, short cookie keys, and empty JWKS", async () => {
  await withIdentityEnv({ NODE_ENV: "production", IDENTITY_ISSUER: "http://identity.example.test" }, () => {
    assert.throws(() => getIdentityConfig(), /IDENTITY_ISSUER must use HTTPS in production/);
  });
  await withIdentityEnv(
    { IDENTITY_COOKIE_KEYS: `${"short-key"},${"b".repeat(32)}` },
    () => {
      assert.throws(
        () => getIdentityConfig(),
        /IDENTITY_COOKIE_KEYS must contain at least two keys of 32 characters/,
      );
    },
  );
  await withIdentityEnv({ IDENTITY_JWKS_JSON: JSON.stringify({ keys: [] }) }, () => {
    assert.throws(
      () => getIdentityConfig(),
      /IDENTITY_JWKS_JSON must contain at least one private signing key/,
    );
  });
});

test("authentication fail-closes with no membership, ambiguous memberships, and unknown roles", async () => {
  const passwordHash = await hash("correct horse battery staple", { type: 2 });
  const operator = {
    id: "operator-1",
    status: "ACTIVE",
    credential: { passwordHash },
  };

  const noMembership = new IdentityService({
    operator: { findUnique: async () => ({ ...operator, memberships: [] }) },
    identityAuditEvent: { create: async () => ({}) },
  });
  await assert.rejects(
    () => noMembership.authenticate("operator@mavula.io", "correct horse battery staple"),
    /No active institutional membership/,
  );

  const twoMemberships = new IdentityService({
    operator: {
      findUnique: async () => ({
        ...operator,
        memberships: [
          {
            id: "membership-1",
            institutionId: "institution-1",
            branchId: null,
            institution: { tenantId: "tenant-1" },
            roles: [{ role: "auditor" }],
          },
          {
            id: "membership-2",
            institutionId: "institution-2",
            branchId: null,
            institution: { tenantId: "tenant-2" },
            roles: [{ role: "auditor" }],
          },
        ],
      }),
    },
    identityAuditEvent: { create: async () => ({}) },
  });
  await assert.rejects(
    () => twoMemberships.authenticate("operator@mavula.io", "correct horse battery staple"),
    /institution_id is required/,
  );

  const unknownRole = new IdentityService({
    operator: {
      findUnique: async () => ({
        ...operator,
        memberships: [
          {
            id: "membership-1",
            institutionId: "institution-1",
            branchId: null,
            institution: { tenantId: "tenant-1" },
            roles: [{ role: "auditor" }, { role: "superuser" }],
          },
        ],
      }),
    },
    identityAuditEvent: { create: async () => ({}) },
  });
  const identity = await unknownRole.authenticate(
    "operator@mavula.io",
    "correct horse battery staple",
  );
  assert.deepEqual(identity.roles, ["auditor"]);
  assert.deepEqual(identity.permissions, ["finance.read", "audit.read"]);
});

test("payment requests reject missing tenant, parties, correlation, and non-integer amounts", async () => {
  assert.throws(() => assertValidPaymentRequest(paymentRequest({ tenantId: "   " })), /tenantId is required/);
  assert.throws(
    () => assertValidPaymentRequest(paymentRequest({ idempotencyKey: "   " })),
    /idempotencyKey is required/,
  );
  assert.throws(
    () => assertValidPaymentRequest(paymentRequest({ payer: { accountRef: "  " } })),
    /payer.accountRef is required/,
  );
  assert.throws(
    () => assertValidPaymentRequest(paymentRequest({ payee: { accountRef: "" } })),
    /payee.accountRef is required/,
  );
  assert.throws(
    () =>
      assertValidPaymentRequest(
        paymentRequest({ amount: { currency: "MZN", valueMinor: 15.5 } }),
      ),
    /positive integer/,
  );

  const manager = new PaymentProcessManager(new MemoryPaymentProcessStore(), {
    now: () => new Date("2026-06-30T10:00:00.000Z"),
  });
  await assert.rejects(
    () => manager.start({ ...paymentRequest(), correlationId: "   " }),
    /correlationId is required/,
  );
});

test("settlement webhooks reject missing tenant, provider event id, and unknown status", async () => {
  const manager = new PaymentProcessManager(new MemoryPaymentProcessStore(), {
    now: () => new Date("2026-06-30T10:00:00.000Z"),
  });
  const base = {
    tenantId: "tenant_mz_001",
    providerReference: "prov_001",
    providerEventId: "evt_001",
    status: "succeeded",
  };

  await assert.rejects(() => manager.recordWebhook({ ...base, tenantId: "  " }), /tenantId is required/);
  await assert.rejects(
    () => manager.recordWebhook({ ...base, providerEventId: "" }),
    /providerEventId is required/,
  );
  await assert.rejects(
    () => manager.recordWebhook({ ...base, status: "completed" }),
    /unsupported webhook status/,
  );
});

test("legacy export generation fail-closes on record limit, invalid dates, and oversized fields", () => {
  const input = {
    export_id: "export_demo_001",
    tenant_id: "tenant_demo_001",
    institution_id: "institution_demo_001",
    period_from: "2026-07-01",
    period_to: "2026-07-31",
    generated_at: "2026-08-01T08:00:00.000Z",
    records: [canonicalRecord],
  };

  assert.throws(
    () =>
      generateRegulatoryTransactionExport({
        ...input,
        records: Array.from({ length: MAX_LEGACY_BATCH_RECORDS + 1 }, () => canonicalRecord),
      }),
    /LEGACY_BATCH_RECORD_LIMIT_EXCEEDED/,
  );
  assert.throws(
    () => generateRegulatoryTransactionExport({ ...input, period_from: "2026/07/01" }),
    /LEGACY_DATE_INVALID/,
  );
  assert.throws(
    () =>
      generateRegulatoryTransactionExport({
        ...input,
        records: [{ ...canonicalRecord, record_id: "x".repeat(65) }],
      }),
    /LEGACY_FIELD_TOO_LONG:record_id/,
  );
  assert.throws(
    () => generateRegulatoryTransactionExport({ ...input, tenant_id: "tenant_café" }),
    /LEGACY_NON_ASCII_FIELD:tenant_id/,
  );
});
