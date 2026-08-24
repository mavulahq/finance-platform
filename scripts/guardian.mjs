#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const failures = [];
const modules = [
  ["identity-access", "AGPL-3.0-only"],
  ["ledger-core", "AGPL-3.0-only"],
  ["workbench", "AGPL-3.0-only"],
  ["settlements", "AGPL-3.0-only"],
  ["operations", "Apache-2.0"],
  ["developer-docs", "AGPL-3.0-only"],
  ["legacy-connectors", "AGPL-3.0-only"],
];
const canonicalAgentFiles = new Set([
  ".agents/AGENTS.md",
  ".agents/skills/mavula-review/SKILL.md",
  ".agents/skills/mavula-review/agents/openai.yaml",
]);

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
].forEach(requireFile);
canonicalAgentFiles.forEach(requireFile);

for (const path of canonicalAgentFiles) requireIgnoreState(path, false);
for (const path of [
  ".agents/skills/other/SKILL.md",
  ".agents/skills/mavula-review/local-report.md",
  ".agents/skills/mavula-review/agents/local.yaml",
]) {
  requireIgnoreState(path, true);
}

const pkg = json("package.json");
if (pkg.name !== "finance-platform") fail("root package must be finance-platform");
if (pkg.license !== "AGPL-3.0-only") fail("root package must remain AGPL-3.0-only");

for (const [name, license] of modules) {
  const base = `packages/${name}`;
  const modulePackage = json(`${base}/package.json`);
  if (modulePackage.name !== `@mavula/${name}`) {
    fail(`${base} package name must be @mavula/${name}`);
  }
  if (modulePackage.license !== license) {
    fail(`${base} license must be ${license}`);
  }
  if (!modulePackage.scripts?.["guardian:check"]) {
    fail(`${base} must expose guardian:check`);
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
for (const expected of [
  "pnpm guardian:check",
  "pnpm contracts:check",
  "pnpm test:fail-closed",
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
]) {
  if (!requiredCi.includes(expected)) fail(`required CI must run: ${expected}`);
}

const tracked = spawnSync("git", ["ls-files", "--recurse-submodules"], {
  encoding: "utf8",
});
if (tracked.status !== 0) fail("git ls-files --recurse-submodules failed");

for (const file of tracked.stdout.split("\n").filter(Boolean)) {
  if (/(^|\/)\.env($|\.(?!example$))/.test(file)) fail(`${file} must not be tracked`);
  if (file.startsWith(".agents/") && !canonicalAgentFiles.has(file)) {
    fail(`${file} is not part of the canonical agent policy`);
  }
  if (file.endsWith("scripts/guardian.mjs")) continue;
  if (/(\.github\/workflows\/.*\.ya?ml|package\.json|\.githooks\/pre-push|scripts\/.*\.mjs)$/.test(file)) {
    const content = read(file);
    if (/getfluxo-io|@getfluxo|packages\/fengine|packages\/fwk|packages\/fpay|packages\/finfra/.test(content)) {
      fail(`${file} contains legacy public identifiers`);
    }
  }
}

if (!/Direct pushes to main are blocked by MAVULA repository policy/.test(read(".githooks/pre-push"))) {
  fail("pre-push hook must use MAVULA policy language");
}

if (failures.length > 0) {
  console.error("MAVULA master guardian failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MAVULA master guardian passed.");
