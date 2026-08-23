import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateContracts,
  validateIdentityContracts,
  validateLegacyInteropContract,
  validatePublishedOpenApiContracts,
  validateRegulatoryContracts,
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
    path.join(os.tmpdir(), "finance-platform-policy-"),
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

function withWorkspaceSlice(relativePaths, mutate, verify) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "finance-platform-policy-workspace-"),
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

test("rejects a catalog with no domain event examples", () => {
  withCopiedDir(
    sourceContractsDir,
    (contractsDir) => {
      const examplesDir = path.join(contractsDir, "examples");
      for (const fileName of fs.readdirSync(examplesDir)) {
        if (fileName.endsWith(".json")) {
          fs.rmSync(path.join(examplesDir, fileName));
        }
      }
    },
    (contractsDir) =>
      assert.throws(
        () => validateContracts(contractsDir),
        /At least one domain event example is required/,
      ),
  );
});

test("rejects identity claims missing an audience", () => {
  withCopiedDir(
    sourceIdentityDir,
    (contractsDir) => {
      const examplePath = path.join(
        contractsDir,
        "examples",
        "operator-access-token-claims.v1.json",
      );
      const example = readJson(examplePath);
      delete example.aud;
      writeJson(examplePath, example);
    },
    (contractsDir) =>
      assert.throws(
        () => validateIdentityContracts(contractsDir),
        /Invalid identity example/,
      ),
  );
});

test("rejects regulatory examples that escape the contracts directory", () => {
  withCopiedDir(
    sourceRegulatoryDir,
    (contractsDir) => {
      const catalogPath = path.join(contractsDir, "catalog.json");
      const catalog = readJson(catalogPath);
      catalog.contracts[0].example =
        "../identity/examples/operator-access-token-claims.v1.json";
      writeJson(catalogPath, catalog);
    },
    (contractsDir) =>
      assert.throws(
        () => validateRegulatoryContracts(contractsDir),
        /must stay inside contracts\/regulatory/,
      ),
  );
});

test("rejects an OpenAPI lock that is not version 1", () => {
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
      lock.version = 2;
      writeJson(lockPath, lock);
    },
    (workspaceRoot) =>
      assert.throws(
        () => validatePublishedOpenApiContracts(workspaceRoot),
        /must lock the three public owner contracts/,
      ),
  );
});

test("rejects a legacy record that does not fill 2048 bytes", () => {
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
      layout.records.H.fields.at(-1).length = 1783;
      writeJson(layoutPath, layout);
    },
    (workspaceRoot) =>
      assert.throws(
        () => validateLegacyInteropContract(workspaceRoot),
        /does not fill 2048 bytes/,
      ),
  );
});

test("rejects a legacy migration that drops ENABLE ROW LEVEL SECURITY", () => {
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
        migration.replaceAll(
          "ENABLE ROW LEVEL SECURITY",
          "DISABLE ROW LEVEL SECURITY",
        ),
      );
    },
    (workspaceRoot) =>
      assert.throws(
        () => validateLegacyInteropContract(workspaceRoot),
        /must enforce PostgreSQL RLS/,
      ),
  );
});
