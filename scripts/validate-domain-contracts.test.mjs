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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function withContractCopy(mutate, verify) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "finance-platform-contracts-"),
  );
  const contractsDir = path.join(tempRoot, "domain-events");
  fs.cpSync(sourceContractsDir, contractsDir, { recursive: true });

  try {
    mutate(contractsDir);
    verify(contractsDir);
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

test("accepts the legacy fixed-width contract foundation", () => {
  assert.deepEqual(validateLegacyInteropContract(), { recordLength: 2048, fixtureRecords: 3 });
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
