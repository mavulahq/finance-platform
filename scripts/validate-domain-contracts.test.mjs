import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateContracts, validateIdentityContracts, validateLegacyInteropContract,
  validatePublishedOpenApiContracts, validateRegulatoryContracts,
} from "./validate-domain-contracts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceContractsDir = path.join(root, "contracts", "domain-events");
const sourceIdentityDir = path.join(root, "contracts", "identity");
const sourceRegulatoryDir = path.join(root, "contracts", "regulatory");
const openApiWorkspaceFiles = [
  "packages/developer-docs/sources.lock.json",
  "packages/developer-docs/openapi/identity-access.public.v1.yaml",
  "packages/developer-docs/openapi/ledger-core.public.v1.yaml",
  "packages/developer-docs/openapi/workbench.public.v1.yaml",
  "packages/identity-access/contracts/openapi/identity-access.public.v1.yaml",
  "packages/ledger-core/contracts/openapi/ledger-core.public.v1.yaml",
  "packages/workbench/contracts/openapi/workbench.public.v1.yaml",
];
const legacyWorkspaceFiles = [
  "packages/legacy-connectors/contracts/regulatory-transaction-export/v1/layout.json",
  "packages/legacy-connectors/contracts/regulatory-transaction-export/v1/examples/regulatory-transaction-export.v1.dat",
  "packages/legacy-connectors/src/batch-runtime.ts",
  "packages/legacy-connectors/prisma/migrations/20260715000100_legacy_batch_runtime/migration.sql",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function withCopiedDir(sourceDir, mutate, verify) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "finance-platform-copy-"),
  );
  const dest = path.join(tempRoot, path.basename(sourceDir));
  fs.cpSync(sourceDir, dest, { recursive: true });

  try {
    mutate(dest);
    verify(dest);
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function withContractCopy(mutate, verify) {
  withCopiedDir(sourceContractsDir, mutate, verify);
}

function withIdentityCopy(mutate, verify) {
  withCopiedDir(sourceIdentityDir, mutate, verify);
}

function withRegulatoryCopy(mutate, verify) {
  withCopiedDir(sourceRegulatoryDir, mutate, verify);
}

function withWorkspaceSlice(relativePaths, mutate, verify) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "finance-platform-workspace-"),
  );
  for (const relativePath of relativePaths) {
    const dest = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(path.join(root, relativePath), dest);
  }

  try {
    mutate(tempRoot);
    verify(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

test("accepts the canonical catalog and examples", () => {
  assert.deepEqual(validateContracts(), { contractCount: 8, exampleCount: 7 });
});

test("accepts canonical identity access-token claims", () => {
  assert.deepEqual(validateIdentityContracts(), { exampleCount: 1 });
});

test("accepts canonical regulatory contracts", () => {
  assert.deepEqual(validateRegulatoryContracts(), { contractCount: 3 });
});

test("accepts owner-locked public OpenAPI contracts", () => {
  assert.deepEqual(validatePublishedOpenApiContracts(), { contractCount: 3 });
});

test("accepts the durable legacy batch runtime", () => {
  assert.deepEqual(validateLegacyInteropContract(), { recordLength: 2048, fixtureRecords: 3, durableRuntime: true });
});

test("rejects event names outside the canonical pattern", () => {
  withContractCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "event-catalog.json");
      const catalog = readJson(catalogPath);
      catalog.events[0].event_type = "INVALID_EVENT";
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /Invalid event catalog/,
      ),
  );
});

test("rejects duplicate type and version pairs", () => {
  withContractCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "event-catalog.json");
      const catalog = readJson(catalogPath);
      catalog.events.push(structuredClone(catalog.events[0]));
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /Duplicate event contract/,
      ),
  );
});

test("rejects active events without a payload schema", () => {
  withContractCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "event-catalog.json");
      const catalog = readJson(catalogPath);
      catalog.events[0].status = "active";
      delete catalog.events[0].payload_schema;
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /must declare payload_schema/,
      ),
  );
});

test("rejects examples that violate the envelope", () => {
  withContractCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "lending.loan_disbursed.v1.json",
      );
      const example = readJson(examplePath);
      example.occurred_at = "2026-06-20T10:00:00+02:00";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(() => validateContracts(contractsDir), /Invalid example/),
  );
});

test("rejects examples that violate an active payload schema", () => {
  withContractCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "lending.loan_disbursed.v1.json",
      );
      const example = readJson(examplePath);
      example.payload.money.amount = -25000;
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(() => validateContracts(contractsDir), /Invalid payload/),
  );
});

test("rejects examples whose schema_uri points to a payload schema", () => {
  withContractCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "lending.loan_disbursed.v1.json",
      );
      const example = readJson(examplePath);
      example.metadata.schema_uri =
        "contracts/domain-events/payloads/lending.loan_disbursed.v1.schema.json";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /must point to the event envelope schema/,
      ),
  );
});

test("rejects zero-value active monetary movement examples", () => {
  withContractCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "lending.loan_disbursed.v1.json",
      );
      const example = readJson(examplePath);
      example.payload.money.amount = "0.00";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(() => validateContracts(contractsDir), /Invalid payload/),
  );
});

test("rejects producer mismatches that would reroute financial events", () => {
  withContractCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "payments.settlement_completed.v1.json",
      );
      const example = readJson(examplePath);
      example.metadata.producer = "ledger-core";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /Producer mismatch/,
      ),
  );
});

test("rejects aggregate type mismatches", () => {
  withContractCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "lending.loan_disbursed.v1.json",
      );
      const example = readJson(examplePath);
      example.aggregate.type = "settlement";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /Aggregate mismatch/,
      ),
  );
});

test("rejects data classification mismatches", () => {
  withContractCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "ledger.journal_posted.v1.json",
      );
      const example = readJson(examplePath);
      example.metadata.data_classification = "internal";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /Data classification mismatch/,
      ),
  );
});

test("rejects examples that are not in the catalog", () => {
  withContractCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "lending.loan_disbursed.v1.json",
      );
      const example = readJson(examplePath);
      example.event_type = "lending.unknown_event";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /missing from catalog/,
      ),
  );
});

test("rejects payload schemas that escape the contracts directory", () => {
  withContractCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "event-catalog.json");
      const catalog = readJson(catalogPath);
      const active = catalog.events.find((event) => event.status === "active");
      active.payload_schema = "../identity/access-token-claims.schema.json";
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /must stay inside contracts\/domain-events/,
      ),
  );
});

test("rejects active events whose payload schema is missing", () => {
  withContractCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "event-catalog.json");
      const catalog = readJson(catalogPath);
      const active = catalog.events.find((event) => event.status === "active");
      active.payload_schema = "payloads/does-not-exist.v1.schema.json";
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(() => validateContracts(contractsDir), /does not exist/),
  );
});

test("rejects identity claims with an unknown institutional role", () => {
  withIdentityCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "operator-access-token-claims.v1.json",
      );
      const example = readJson(examplePath);
      example.roles = ["super_admin"];
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateIdentityContracts(contractsDir),
        /Invalid identity example/,
      ),
  );
});

test("rejects identity claims missing tenant isolation", () => {
  withIdentityCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "operator-access-token-claims.v1.json",
      );
      const example = readJson(examplePath);
      delete example.tenant_id;
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateIdentityContracts(contractsDir),
        /Invalid identity example/,
      ),
  );
});

test("rejects identity claims with an invalid tenant identifier", () => {
  withIdentityCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "operator-access-token-claims.v1.json",
      );
      const example = readJson(examplePath);
      example.tenant_id = "x";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateIdentityContracts(contractsDir),
        /Invalid identity example/,
      ),
  );
});

test("rejects identity claims with an unknown permission", () => {
  withIdentityCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "operator-access-token-claims.v1.json",
      );
      const example = readJson(examplePath);
      example.permissions = ["finance.delete"];
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateIdentityContracts(contractsDir),
        /Invalid identity example/,
      ),
  );
});

test("rejects identity catalogs without examples", () => {
  withIdentityCopy(
    (contractsDir) => {
      fs.rmSync(path.join(contractsDir, "examples"), { recursive: true, force: true });
      fs.mkdirSync(path.join(contractsDir, "examples"));
    },
    (contractsDir) =>
      assert.throws(
        () => validateIdentityContracts(contractsDir),
        /At least one identity claim example is required/,
      ),
  );
});

test("rejects duplicate regulatory contract ids", () => {
  withRegulatoryCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "catalog.json");
      const catalog = readJson(catalogPath);
      catalog.contracts.push(structuredClone(catalog.contracts[0]));
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateRegulatoryContracts(contractsDir),
        /Duplicate regulatory contract/,
      ),
  );
});

test("rejects regulatory contracts that are not restricted", () => {
  withRegulatoryCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "catalog.json");
      const catalog = readJson(catalogPath);
      catalog.contracts[0].data_classification = "internal";
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateRegulatoryContracts(contractsDir),
        /must be restricted/,
      ),
  );
});

test("rejects regulatory schemas that escape the contracts directory", () => {
  withRegulatoryCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "catalog.json");
      const catalog = readJson(catalogPath);
      catalog.contracts[0].schema = "../identity/access-token-claims.schema.json";
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateRegulatoryContracts(contractsDir),
        /must stay inside contracts\/regulatory/,
      ),
  );
});

test("rejects AML decisions outside the allowed enum", () => {
  withRegulatoryCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "aml-decision.v1.json",
      );
      const example = readJson(examplePath);
      example.decision = "APPROVE";
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateRegulatoryContracts(contractsDir),
        /Invalid regulatory example/,
      ),
  );
});

test("rejects delivered exports without authority evidence", () => {
  withRegulatoryCopy(
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "export-record.v1.json",
      );
      const example = readJson(examplePath);
      delete example.delivered_at;
      delete example.authority_reference;
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateRegulatoryContracts(contractsDir),
        /Invalid regulatory example/,
      ),
  );
});

test("rejects a regulatory catalog that is not exactly three v1 contracts", () => {
  withRegulatoryCopy(
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "catalog.json");
      const catalog = readJson(catalogPath);
      catalog.contracts.pop();
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateRegulatoryContracts(contractsDir),
        /Exactly three regulatory v1 contracts are required/,
      ),
  );
});

test("rejects published OpenAPI drift from the owning module", () => {
  withWorkspaceSlice(
    openApiWorkspaceFiles,
    (workspaceRoot) => {
      const published = path.join(
        workspaceRoot,
        "packages",
        "developer-docs",
        "openapi",
        "identity-access.public.v1.yaml",
      );
      fs.appendFileSync(published, "\n# drifted\n");
    },
    (workspaceRoot) =>
      assert.throws(
        () => validatePublishedOpenApiContracts(workspaceRoot),
        /Published OpenAPI drift/,
      ),
  );
});

test("rejects published OpenAPI digest mismatches", () => {
  withWorkspaceSlice(
    openApiWorkspaceFiles,
    (workspaceRoot) => {
      const lockPath = path.join(
        workspaceRoot,
        "packages",
        "developer-docs",
        "sources.lock.json",
      );
      const lock = readJson(lockPath);
      lock.contracts[0].sha256 = "0".repeat(64);
      writeJson(lockPath, lock);
    },
    (workspaceRoot) =>
      assert.throws(
        () => validatePublishedOpenApiContracts(workspaceRoot),
        /Published OpenAPI digest mismatch/,
      ),
  );
});

test("rejects OpenAPI locks with an unsupported owner", () => {
  withWorkspaceSlice(
    openApiWorkspaceFiles,
    (workspaceRoot) => {
      const lockPath = path.join(
        workspaceRoot,
        "packages",
        "developer-docs",
        "sources.lock.json",
      );
      const lock = readJson(lockPath);
      lock.contracts[0].owner = "mavulahq/unknown-module";
      writeJson(lockPath, lock);
    },
    (workspaceRoot) =>
      assert.throws(
        () => validatePublishedOpenApiContracts(workspaceRoot),
        /Unsupported OpenAPI owner/,
      ),
  );
});

test("rejects OpenAPI locks that do not pin exactly three owner contracts", () => {
  withWorkspaceSlice(
    openApiWorkspaceFiles,
    (workspaceRoot) => {
      const lockPath = path.join(
        workspaceRoot,
        "packages",
        "developer-docs",
        "sources.lock.json",
      );
      const lock = readJson(lockPath);
      lock.contracts.pop();
      writeJson(lockPath, lock);
    },
    (workspaceRoot) =>
      assert.throws(
        () => validatePublishedOpenApiContracts(workspaceRoot),
        /must lock the three public owner contracts/,
      ),
  );
});

test("rejects a legacy export layout that is not 2048-byte v1", () => {
  withWorkspaceSlice(
    legacyWorkspaceFiles,
    (workspaceRoot) => {
      const layoutPath = path.join(
        workspaceRoot,
        "packages",
        "legacy-connectors",
        "contracts",
        "regulatory-transaction-export",
        "v1",
        "layout.json",
      );
      const layout = readJson(layoutPath);
      layout.record_length = 1024;
      writeJson(layoutPath, layout);
    },
    (workspaceRoot) =>
      assert.throws(
        () => validateLegacyInteropContract(workspaceRoot),
        /must remain contract v1 with 2048-byte records/,
      ),
  );
});

test("rejects a legacy layout gap that would corrupt COBOL records", () => {
  withWorkspaceSlice(
    legacyWorkspaceFiles,
    (workspaceRoot) => {
      const layoutPath = path.join(
        workspaceRoot,
        "packages",
        "legacy-connectors",
        "contracts",
        "regulatory-transaction-export",
        "v1",
        "layout.json",
      );
      const layout = readJson(layoutPath);
      layout.records.H.fields[1].offset = 3;
      writeJson(layoutPath, layout);
    },
    (workspaceRoot) =>
      assert.throws(
        () => validateLegacyInteropContract(workspaceRoot),
        /layout gap or overlap/,
      ),
  );
});

test("rejects a legacy golden file that is not fixed-width", () => {
  withWorkspaceSlice(
    legacyWorkspaceFiles,
    (workspaceRoot) => {
      const fixturePath = path.join(
        workspaceRoot,
        "packages",
        "legacy-connectors",
        "contracts",
        "regulatory-transaction-export",
        "v1",
        "examples",
        "regulatory-transaction-export.v1.dat",
      );
      fs.writeFileSync(fixturePath, "H\nD\nT\n");
    },
    (workspaceRoot) =>
      assert.throws(
        () => validateLegacyInteropContract(workspaceRoot),
        /fixed-width header, detail and trailer records/,
      ),
  );
});

test("rejects a legacy runtime missing a durable public type", () => {
  withWorkspaceSlice(
    legacyWorkspaceFiles,
    (workspaceRoot) => {
      const runtimePath = path.join(
        workspaceRoot,
        "packages",
        "legacy-connectors",
        "src",
        "batch-runtime.ts",
      );
      const runtime = fs.readFileSync(runtimePath, "utf8");
      fs.writeFileSync(
        runtimePath,
        runtime.replace("class LegacyBatchManager", "class LegacyBatchCoordinator"),
      );
    },
    (workspaceRoot) =>
      assert.throws(
        () => validateLegacyInteropContract(workspaceRoot),
        /Legacy runtime export missing: LegacyBatchManager/,
      ),
  );
});

test("rejects a legacy migration that drops PostgreSQL RLS", () => {
  withWorkspaceSlice(
    legacyWorkspaceFiles,
    (workspaceRoot) => {
      const migrationPath = path.join(
        workspaceRoot,
        "packages",
        "legacy-connectors",
        "prisma",
        "migrations",
        "20260715000100_legacy_batch_runtime",
        "migration.sql",
      );
      const migration = fs.readFileSync(migrationPath, "utf8");
      fs.writeFileSync(
        migrationPath,
        migration.replaceAll("FORCE ROW LEVEL SECURITY", "DISABLE ROW LEVEL SECURITY"),
      );
    },
    (workspaceRoot) =>
      assert.throws(
        () => validateLegacyInteropContract(workspaceRoot),
        /must enforce PostgreSQL RLS/,
      ),
  );
});
