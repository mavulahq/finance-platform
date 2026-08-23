#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptPath = fileURLToPath(import.meta.url);

const failures = [];

export const MODULES = [
  ["identity-access", "AGPL-3.0-only"],
  ["ledger-core", "AGPL-3.0-only"],
  ["workbench", "AGPL-3.0-only"],
  ["settlements", "AGPL-3.0-only"],
  ["operations", "Apache-2.0"],
  ["developer-docs", "AGPL-3.0-only"],
  ["legacy-connectors", "AGPL-3.0-only"],
];

export const CANONICAL_AGENT_FILES = new Set([
  ".agents/AGENTS.md",
  ".agents/skills/mavula-review/SKILL.md",
  ".agents/skills/mavula-review/agents/openai.yaml",
]);

export const REQUIRED_CI_COMMANDS = [
  "pnpm guardian:check",
  "pnpm contracts:check",
  "pnpm test:guardrails",
  "pnpm --filter @mavula/identity-access build",
  "pnpm --filter @mavula/identity-access test",
  "pnpm --filter @mavula/ledger-core build",
  "pnpm --filter @mavula/workbench test:all",
  "pnpm --filter @mavula/settlements test",
  "pnpm --filter @mavula/developer-docs build",
  "pnpm --filter @mavula/legacy-connectors test",
  "pnpm --filter @mavula/legacy-connectors test:postgres",
  "docker compose config",
  "kubectl kustomize packages/operations/kubernetes/overlays/minikube",
];

const LEGACY_PUBLIC_IDENTIFIERS =
  /getfluxo-io|@getfluxo|packages\/fengine|packages\/fwk|packages\/fpay|packages\/finfra/;
const POLICY_SCAN_FILES =
  /(\.github\/workflows\/.*\.ya?ml|package\.json|\.githooks\/pre-push|scripts\/.*\.mjs)$/;
const TRACKED_SECRET_FILES = /(^|\/)\.env($|\.(?!example$))/;

function fail(message) {
  failures.push(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function requireFile(path) {
  if (!existsSync(path)) fail(`${path} is required`);
}

function requireIgnoreState(path, shouldBeIgnored) {
  const result = spawnSync("git", ["check-ignore", "--quiet", "--no-index", path]);
  if (![0, 1].includes(result.status)) {
    fail(`git check-ignore failed for ${path}`);
    return;
  }

  const isIgnored = result.status === 0;
  if (isIgnored !== shouldBeIgnored) {
    fail(`${path} must ${shouldBeIgnored ? "be ignored" : "remain trackable"}`);
  }
}

function runModuleGuardian(name) {
  const base = `packages/${name}`;
  const result = spawnSync(process.execPath, ["scripts/guardian.mjs"], {
    cwd: base,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    fail(`${base} guardian:check failed${output ? `:\n${output}` : ""}`);
  }
}

export function missingRequiredCiCommands(requiredCi) {
  return REQUIRED_CI_COMMANDS.filter((expected) => !requiredCi.includes(expected));
}

export function packagePolicyFailures(name, license, modulePackage) {
  const base = `packages/${name}`;
  const failuresForPackage = [];
  if (modulePackage.name !== `@mavula/${name}`) {
    failuresForPackage.push(`${base} package name must be @mavula/${name}`);
  }
  if (modulePackage.license !== license) {
    failuresForPackage.push(`${base} license must be ${license}`);
  }
  if (!modulePackage.scripts?.["guardian:check"]) {
    failuresForPackage.push(`${base} must expose guardian:check`);
  }
  return failuresForPackage;
}

export function trackedSecretViolation(file) {
  if (TRACKED_SECRET_FILES.test(file)) return `${file} must not be tracked`;
  return null;
}

export function nonCanonicalAgentFileViolation(
  file,
  canonicalAgentFiles = CANONICAL_AGENT_FILES,
) {
  if (file.startsWith(".agents/") && !canonicalAgentFiles.has(file)) {
    return `${file} is not part of the canonical agent policy`;
  }
  return null;
}

export function legacyIdentifierViolation(file, content) {
  if (file.endsWith("scripts/guardian.mjs")) return null;
  if (!POLICY_SCAN_FILES.test(file)) return null;
  if (LEGACY_PUBLIC_IDENTIFIERS.test(content)) {
    return `${file} contains legacy public identifiers`;
  }
  return null;
}

export function prePushPolicyFailure(prePushText) {
  if (!/Direct pushes to main are blocked by MAVULA repository policy/.test(prePushText)) {
    return "pre-push hook must use MAVULA policy language";
  }
  return null;
}

function runMasterGuardian() {
  [
    ".github/CODEOWNERS",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/workflows/guardian.yml",
    ".github/workflows/required-ci.yml",
    ".githooks/pre-push",
    "LICENSE",
    "LICENSE_POLICY.md",
    "TRADEMARKS.md",
    "BRAND.md",
    "CONTRIBUTING.md",
    "scripts/merge-pr.mjs",
    "scripts/guardrails.test.mjs",
    "scripts/guardian.test.mjs",
    "scripts/merge-pr.test.mjs",
    "scripts/validate-domain-contracts.policy.test.mjs",
  ].forEach(requireFile);
  CANONICAL_AGENT_FILES.forEach(requireFile);

  for (const agentPath of CANONICAL_AGENT_FILES) requireIgnoreState(agentPath, false);
  for (const ignoredPath of [
    ".agents/skills/other/SKILL.md",
    ".agents/skills/mavula-review/local-report.md",
    ".agents/skills/mavula-review/agents/local.yaml",
  ]) {
    requireIgnoreState(ignoredPath, true);
  }

  const pkg = json("package.json");
  if (pkg.name !== "finance-platform") fail("root package must be finance-platform");
  if (pkg.license !== "AGPL-3.0-only") fail("root package must remain AGPL-3.0-only");

  for (const [name, license] of MODULES) {
    const base = `packages/${name}`;
    const modulePackage = json(`${base}/package.json`);
    for (const message of packagePolicyFailures(name, license, modulePackage)) {
      fail(message);
    }
    [
      `${base}/.github/CODEOWNERS`,
      `${base}/.github/PULL_REQUEST_TEMPLATE.md`,
      `${base}/.github/workflows/guardian.yml`,
      `${base}/scripts/guardian.mjs`,
      `${base}/README.md`,
      `${base}/LICENSE`,
    ].forEach(requireFile);
    runModuleGuardian(name);
  }

  const requiredCi = read(".github/workflows/required-ci.yml");
  for (const expected of missingRequiredCiCommands(requiredCi)) {
    fail(`required CI must run: ${expected}`);
  }

  const tracked = spawnSync("git", ["ls-files", "--recurse-submodules"], {
    encoding: "utf8",
  });
  if (tracked.status !== 0) fail("git ls-files --recurse-submodules failed");

  for (const file of tracked.stdout.split("\n").filter(Boolean)) {
    const secretViolation = trackedSecretViolation(file);
    if (secretViolation) fail(secretViolation);
    const agentViolation = nonCanonicalAgentFileViolation(file);
    if (agentViolation) fail(agentViolation);
    if (file.endsWith("scripts/guardian.mjs") || !POLICY_SCAN_FILES.test(file)) continue;
    const identifierViolation = legacyIdentifierViolation(file, read(file));
    if (identifierViolation) fail(identifierViolation);
  }

  const hookViolation = prePushPolicyFailure(read(".githooks/pre-push"));
  if (hookViolation) fail(hookViolation);

  if (failures.length > 0) {
    console.error("MAVULA master guardian failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("MAVULA master guardian passed.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  runMasterGuardian();
}
