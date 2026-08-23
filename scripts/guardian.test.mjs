import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_AGENT_FILES,
  REQUIRED_CI_COMMANDS,
  legacyIdentifierViolation,
  missingRequiredCiCommands,
  nonCanonicalAgentFileViolation,
  packagePolicyFailures,
  prePushPolicyFailure,
  trackedSecretViolation,
} from "./guardian.mjs";

test("required CI policy includes repository guardrail tests", () => {
  assert.ok(REQUIRED_CI_COMMANDS.includes("pnpm test:guardrails"));
  assert.ok(REQUIRED_CI_COMMANDS.includes("pnpm --filter @mavula/legacy-connectors test"));
});

test("detects a dropped required CI command", () => {
  const requiredCi = REQUIRED_CI_COMMANDS.filter(
    (command) => command !== "pnpm test:guardrails",
  ).join("\n");
  assert.deepEqual(missingRequiredCiCommands(requiredCi), ["pnpm test:guardrails"]);
});

test("rejects a module that drops guardian:check or changes license", () => {
  assert.deepEqual(
    packagePolicyFailures("ledger-core", "AGPL-3.0-only", {
      name: "@mavula/ledger-core",
      license: "MIT",
      scripts: {},
    }),
    [
      "packages/ledger-core license must be AGPL-3.0-only",
      "packages/ledger-core must expose guardian:check",
    ],
  );
});

test("rejects tracked environment files that would leak secrets", () => {
  assert.equal(
    trackedSecretViolation("packages/ledger-core/.env"),
    "packages/ledger-core/.env must not be tracked",
  );
  assert.equal(trackedSecretViolation(".env.example"), null);
});

test("rejects non-canonical agent policy files", () => {
  assert.match(
    nonCanonicalAgentFileViolation(".agents/skills/other/SKILL.md"),
    /canonical agent policy/,
  );
  for (const file of CANONICAL_AGENT_FILES) {
    assert.equal(nonCanonicalAgentFileViolation(file), null);
  }
});

test("rejects leftover public identifiers in policy-scanned files", () => {
  const forbiddenModule = ["packages", "fpay"].join("/");
  assert.match(
    legacyIdentifierViolation(
      ".github/workflows/required-ci.yml",
      `pnpm --filter ${forbiddenModule} test\n`,
    ),
    /legacy public identifiers/,
  );
  assert.equal(
    legacyIdentifierViolation(
      "scripts/guardian.mjs",
      `${forbiddenModule} is listed only as a forbidden identifier\n`,
    ),
    null,
  );
  assert.equal(
    legacyIdentifierViolation("README.md", `${forbiddenModule} used to live here\n`),
    null,
  );
});

test("rejects a pre-push hook that loses MAVULA policy language", () => {
  assert.equal(
    prePushPolicyFailure("Direct pushes to main are blocked.\n"),
    "pre-push hook must use MAVULA policy language",
  );
  assert.equal(
    prePushPolicyFailure(
      "Direct pushes to main are blocked by MAVULA repository policy.\n",
    ),
    null,
  );
});
