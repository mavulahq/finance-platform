import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mergeScript = join(root, "scripts", "merge-pr.mjs");

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: 5_000,
    ...options,
  });
}

async function fakeGh(pr, { failView = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "mavula-merge-pr-"));
  const executable = join(directory, "gh");
  const log = join(directory, "commands.log");
  const failBranch = failView
    ? 'if [[ "$1 $2" == "pr view" ]]; then echo "gh: Not Found" >&2; exit 1; fi\n'
    : 'if [[ "$1 $2" == "pr view" ]]; then printf \'%s\' "$MOCK_PR_JSON"; fi\n';
  await writeFile(
    executable,
    `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' "$*" >> "$GH_LOG"\n${failBranch}`,
  );
  await chmod(executable, 0o755);
  return { directory, executable, log, pr: JSON.stringify(pr) };
}

function validPr(overrides = {}) {
  return {
    number: 42,
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    mergeable: "MERGEABLE",
    reviewDecision: "",
    url: "https://github.com/mavulahq/finance-platform/pull/42",
    statusCheckRollup: [
      {
        __typename: "CheckRun",
        name: "required",
        status: "COMPLETED",
        conclusion: "SUCCESS",
      },
    ],
    ...overrides,
  };
}

async function runMerge(pr, extraArgs = ["--check-only"], fakeOptions = {}) {
  const fake = await fakeGh(pr, fakeOptions);
  const result = execute(process.execPath, [mergeScript, "42", ...extraArgs], {
    env: {
      ...process.env,
      GH_BIN: fake.executable,
      GH_LOG: fake.log,
      MOCK_PR_JSON: fake.pr,
    },
  });
  return { ...fake, result };
}

test("merge validation rejects a conflicting or unknown mergeable state", async (context) => {
  const run = await runMerge(validPr({ mergeable: "CONFLICTING" }));
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 1);
  assert.match(run.result.stderr, /mergeable state is CONFLICTING/);
});

test("merge validation rejects a failed companion check", async (context) => {
  const run = await runMerge(
    validPr({
      statusCheckRollup: [
        {
          __typename: "CheckRun",
          name: "required",
          status: "COMPLETED",
          conclusion: "SUCCESS",
        },
        {
          __typename: "CheckRun",
          name: "guardian",
          status: "COMPLETED",
          conclusion: "FAILURE",
        },
      ],
    }),
  );
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 1);
  assert.match(run.result.stderr, /check "guardian" did not succeed/);
});

test("merge validation rejects a pending required status context", async (context) => {
  const run = await runMerge(
    validPr({
      statusCheckRollup: [
        {
          __typename: "StatusContext",
          context: "required",
          state: "PENDING",
        },
      ],
    }),
  );
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 1);
  assert.match(run.result.stderr, /Required CI check "required" is not successful/);
});

test("merge validation rejects a pending status context companion check", async (context) => {
  const run = await runMerge(
    validPr({
      statusCheckRollup: [
        {
          __typename: "CheckRun",
          name: "required",
          status: "COMPLETED",
          conclusion: "SUCCESS",
        },
        {
          __typename: "StatusContext",
          context: "codecov/project",
          state: "PENDING",
        },
      ],
    }),
  );
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 1);
  assert.match(run.result.stderr, /check "codecov\/project" is pending/);
});

test("merge validation ignores a neutral companion check", async (context) => {
  const run = await runMerge(
    validPr({
      statusCheckRollup: [
        {
          __typename: "CheckRun",
          name: "required",
          status: "COMPLETED",
          conclusion: "SUCCESS",
        },
        {
          __typename: "CheckRun",
          name: "optional-docs",
          status: "COMPLETED",
          conclusion: "NEUTRAL",
        },
      ],
    }),
  );
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 0);
});

test("merge validation reports a gh lookup failure without merging", async (context) => {
  const run = await runMerge(validPr(), ["--check-only"], { failView: true });
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 1);
  assert.match(run.result.stderr, /Unable to validate PR #42/);
  const commands = await readFile(run.log, "utf8");
  assert.doesNotMatch(commands, /^pr merge /m);
});
