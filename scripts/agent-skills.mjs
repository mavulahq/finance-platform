#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalAgentAdapters,
  canonicalAgentFiles,
} from "./check-agent-policy.mjs";

export const moduleNames = Object.freeze([
  "identity-access",
  "ledger-core",
  "workbench",
  "settlements",
  "operations",
  "developer-docs",
  "legacy-connectors",
]);

export const canonicalInstructionFiles = Object.freeze([
  ...canonicalAgentFiles,
  ...canonicalAgentAdapters,
  "scripts/check-agent-policy.mjs",
]);

const scriptRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function synchronizeAgentInstructions({
  root = scriptRoot,
  targets = moduleNames.map((name) => join(root, "packages", name)),
  files = canonicalInstructionFiles,
  write = false,
} = {}) {
  const failures = [];

  for (const target of targets) {
    for (const relativePath of files) {
      const sourcePath = join(root, relativePath);
      const targetPath = join(target, relativePath);
      const source = await readFile(sourcePath);

      if (write) {
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, source);
        continue;
      }

      let actual;
      try {
        actual = await readFile(targetPath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          failures.push(`${targetPath} is required`);
          continue;
        }
        throw error;
      }

      if (!source.equals(actual)) {
        failures.push(`${targetPath} differs from canonical ${relativePath}`);
      }
    }
  }

  return failures;
}

async function main() {
  const mode = process.argv[2] ?? "--check";
  if (!["--check", "--write"].includes(mode)) {
    console.error("Usage: node scripts/agent-skills.mjs [--check|--write]");
    process.exit(2);
  }

  const failures = await synchronizeAgentInstructions({ write: mode === "--write" });
  if (failures.length > 0) {
    console.error("MAVULA agent instruction check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    mode === "--write"
      ? "MAVULA agent instructions synchronized."
      : "MAVULA agent instructions are canonical across all modules.",
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
