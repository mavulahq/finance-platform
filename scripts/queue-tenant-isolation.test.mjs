import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";

const require = createRequire(import.meta.url);
const { JobsController } = require("../packages/workbench/dist/controllers/jobs.controller.js");
const { JobStoreService } = require("../packages/workbench/dist/queue/job-store.service.js");
const { JobHandlersService } = require("../packages/workbench/dist/worker/job-handlers.service.js");
const { AccessTokenGuard, loadJose } = require("../packages/workbench/dist/auth/access-token.guard.js");
const { PermissionsGuard } = require("../packages/workbench/dist/auth/permissions.guard.js");
const { PERMISSIONS_KEY } = require("../packages/workbench/dist/auth/permissions.decorator.js");

function fakeStore() {
  const enqueued = [];
  return {
    enqueued,
    enqueue(input) {
      enqueued.push(input);
      return {
        id: "job_isolation_001",
        status: "QUEUED",
        ...input,
      };
    },
  };
}

function job(overrides = {}) {
  return {
    id: "job_isolation_001",
    queue: "payments",
    type: "PAYMENT_SETTLEMENT",
    tenant_id: "tenant_authenticated",
    payload: {
      provider_reference: "mpesa_ref_001",
      provider_event_id: "provider_event_001",
      status: "succeeded",
    },
    status: "PROCESSING",
    attempts: 1,
    max_attempts: 3,
    created_at: "2026-08-23T10:00:00.000Z",
    updated_at: "2026-08-23T10:00:00.000Z",
    ...overrides,
  };
}

function domainEvent(tenantId) {
  return {
    event_id: "evt_7e2edbbb-9ea6-4d7d-85f0-098594d79e9b",
    event_type: "ledger.journal_posted",
    event_version: 1,
    occurred_at: "2026-08-23T10:00:00.000Z",
    tenant_id: tenantId,
    aggregate: { type: "journal_entry", id: "entry-1", version: 1 },
    correlation_id: "corr-isolation",
    causation_id: "cmd-isolation",
    payload: {},
    metadata: { producer: "ledger-core", data_classification: "restricted" },
  };
}

function httpContext(request) {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

test("HTTP job create rejects a body tenant that is not the authenticated tenant", () => {
  const store = fakeStore();
  const controller = new JobsController(store);

  assert.throws(
    () =>
      controller.create(
        { tenantId: "tenant_authenticated" },
        {
          type: "PAYMENT_SETTLEMENT",
          tenant_id: "tenant_victim",
          payload: { provider_reference: "mpesa_ref_cross" },
        },
      ),
    (error) =>
      error instanceof ForbiddenException &&
      String(error.message).includes("tenant_id does not match the authenticated tenant"),
  );
  assert.equal(store.enqueued.length, 0);
});

test("HTTP job create stamps the authenticated tenant even when the body omits tenant_id", () => {
  const store = fakeStore();
  const controller = new JobsController(store);

  controller.create(
    { tenantId: "tenant_authenticated" },
    {
      type: "PAYMENT_SETTLEMENT",
      payload: { provider_reference: "mpesa_ref_001" },
    },
  );

  assert.equal(store.enqueued.length, 1);
  assert.equal(store.enqueued[0].tenant_id, "tenant_authenticated");
  assert.equal(store.enqueued[0].type, "PAYMENT_SETTLEMENT");
});

test("HTTP job create rejects an unsafe queue name and non-positive max_attempts", () => {
  const controller = new JobsController(fakeStore());

  assert.throws(
    () =>
      controller.create(
        { tenantId: "tenant_authenticated" },
        { type: "PAYMENT_SETTLEMENT", queue: "Payments", payload: {} },
      ),
    /Queue must use lowercase letters/,
  );
  assert.throws(
    () =>
      controller.create(
        { tenantId: "tenant_authenticated" },
        { type: "PAYMENT_SETTLEMENT", max_attempts: 0, payload: {} },
      ),
    /max_attempts must be a positive integer/,
  );
});

test("job store keeps the tenant_id supplied at enqueue time", async () => {
  process.env.NODE_ENV = "test";
  process.env.WORKBENCH_QUEUE_BACKEND = "memory";
  const store = new JobStoreService();
  const queued = await store.enqueue({
    type: "LEDGER_CORE_EVENT",
    tenant_id: "tenant_from_queue",
    payload: { event_type: "UNKNOWN" },
  });

  assert.equal(queued.tenant_id, "tenant_from_queue");
  assert.equal((await store.get(queued.id)).tenant_id, "tenant_from_queue");
});

test("Redis connection options forward password and database from REDIS_URL", () => {
  process.env.NODE_ENV = "test";
  process.env.WORKBENCH_QUEUE_BACKEND = "memory";
  process.env.REDIS_URL = "redis://:queue-auth-test@redis.internal:6380/3";
  const store = new JobStoreService();
  const connection = store.getConnection();

  assert.equal(connection.host, "redis.internal");
  assert.equal(connection.port, 6380);
  assert.equal(connection.password, "queue-auth-test");
  assert.equal(connection.db, 3);
  delete process.env.REDIS_URL;
});

test("PAYMENT_SETTLEMENT uses the job tenant_id and rejects a missing provider reference", async () => {
  const webhooks = [];
  const tokenTenants = [];
  const handlers = new JobHandlersService(
    {
      getManager: () => ({
        recordWebhook: async (input) => {
          webhooks.push(input);
          return { id: "proc_001", state: "SETTLED" };
        },
      }),
    },
    {
      forTenant: async (tenantId) => {
        tokenTenants.push(tenantId);
        return "unused-token";
      },
    },
    { getManager: () => ({}) },
  );

  const result = await handlers.handle(
    job({
      tenant_id: "tenant_from_queue",
      payload: {
        provider_reference: "mpesa_ref_001",
        provider_event_id: "provider_event_001",
        status: "succeeded",
      },
    }),
  );

  assert.equal(result.accepted, true);
  assert.equal(webhooks.length, 1);
  assert.equal(webhooks[0].tenantId, "tenant_from_queue");
  assert.equal(webhooks[0].providerReference, "mpesa_ref_001");
  assert.equal(tokenTenants.length, 0);

  await assert.rejects(
    () =>
      handlers.handle(
        job({
          payload: { provider_event_id: "provider_event_missing_ref" },
        }),
      ),
    /provider_reference is required/,
  );
});

test("domain event jobs refuse a payload tenant that does not match the job tenant before minting a token", async () => {
  const tokenTenants = [];
  const handlers = new JobHandlersService(
    { getManager: () => ({}) },
    {
      forTenant: async (tenantId) => {
        tokenTenants.push(tenantId);
        return "must-not-issue";
      },
    },
    { getManager: () => ({}) },
  );

  await assert.rejects(
    () =>
      handlers.handle(
        job({
          type: "LEDGER_CORE_EVENT",
          tenant_id: "tenant_authenticated",
          payload: domainEvent("tenant_victim"),
        }),
      ),
    /domain event tenant does not match the worker job tenant/,
  );
  assert.deepEqual(tokenTenants, []);
});

test("permissions guard fail-closes when workbench.jobs.write is missing", () => {
  const guard = new PermissionsGuard({
    getAllAndOverride: (key) => (key === PERMISSIONS_KEY ? ["workbench.jobs.write"] : undefined),
  });

  assert.throws(
    () => guard.canActivate(httpContext({ identity: { permissions: ["workbench.read"] } })),
    (error) =>
      error instanceof ForbiddenException && String(error.message).includes("Insufficient permissions"),
  );
  assert.equal(
    guard.canActivate(
      httpContext({ identity: { permissions: ["workbench.read", "workbench.jobs.write"] } }),
    ),
    true,
  );
});

test("access token guard binds the signed tenant and rejects a mismatched X-Tenant-ID", async (t) => {
  const jose = await loadJose();
  const pair = await jose.generateKeyPair("PS256", { modulusLength: 2048, extractable: true });
  const publicKey = await jose.exportJWK(pair.publicKey);
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [{ ...publicKey, kid: "isolation-test", alg: "PS256", use: "sig" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  );
  const address = server.address();
  const jwksUri = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/jwks`;

  process.env.OIDC_ISSUER = "https://identity.mavula.io";
  process.env.OIDC_AUDIENCE = "urn:mavula:workbench";
  process.env.OIDC_JWKS_URI = jwksUri;

  const token = await new jose.SignJWT({
    tenant_id: "tenant_authenticated",
    institution_id: "institution-1",
    roles: ["operator"],
    permissions: ["workbench.jobs.write"],
  })
    .setProtectedHeader({ alg: "PS256", kid: "isolation-test", typ: "at+jwt" })
    .setSubject("operator-1")
    .setIssuer("https://identity.mavula.io")
    .setAudience("urn:mavula:workbench")
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti("token-isolation-1")
    .sign(pair.privateKey);

  const matching = {
    headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant_authenticated" },
  };
  const guard = new AccessTokenGuard({ getAllAndOverride: () => undefined });
  await assert.equal(await guard.canActivate(httpContext(matching)), true);
  assert.equal(matching.tenantId, "tenant_authenticated");

  const mismatched = {
    headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant_victim" },
  };
  await assert.rejects(
    () => new AccessTokenGuard({ getAllAndOverride: () => undefined }).canActivate(httpContext(mismatched)),
    (error) =>
      error instanceof ForbiddenException &&
      String(error.message).includes("X-Tenant-ID does not match the authenticated tenant"),
  );

  await assert.rejects(
    () =>
      new AccessTokenGuard({ getAllAndOverride: () => undefined }).canActivate(
        httpContext({ headers: {} }),
      ),
    (error) =>
      error instanceof UnauthorizedException &&
      String(error.message).includes("Bearer access token is required"),
  );
});
