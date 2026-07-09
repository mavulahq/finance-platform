import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hook = join(root, ".githooks", "pre-push");
const mergeScript = join(root, "scripts", "merge-pr.mjs");

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: 5_000,
    ...options,
  });
}

test("pre-push blocks direct updates to main", () => {
  const result = execute(
    hook,
    ["origin", "git@github.com:mavulahq/finance-platform.git"],
    {
      input: "refs/heads/main abc refs/heads/main def\n",
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Direct pushes to main are blocked/);
});

test("pre-push permits feature branches", () => {
  const result = execute("bash", [
    "-c",
    'printf "refs/heads/codex/test abc refs/heads/codex/test 000\\n" | "$1" origin git@github.com:mavulahq/finance-platform.git',
    "guardrail-test",
    hook,
  ]);

  assert.equal(result.status, 0);
});

async function fakeGh(pr) {
  const directory = await mkdtemp(join(tmpdir(), "mavula-guardrails-"));
  const executable = join(directory, "gh");
  const log = join(directory, "commands.log");
  await writeFile(
    executable,
    `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' "$*" >> "$GH_LOG"\nif [[ "$1 $2" == "pr view" ]]; then printf '%s' "$MOCK_PR_JSON"; fi\n`,
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

async function runMerge(pr, extraArgs = ["--check-only"]) {
  const fake = await fakeGh(pr);
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

test("merge validation rejects draft pull requests", async (context) => {
  const run = await runMerge(validPr({ isDraft: true }));
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 1);
});

test("merge validation rejects a failing required check", async (context) => {
  const run = await runMerge(
    validPr({
      statusCheckRollup: [
        {
          __typename: "CheckRun",
          name: "required",
          status: "COMPLETED",
          conclusion: "FAILURE",
        },
      ],
    }),
  );
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 1);
});

test("check-only accepts an eligible pull request without merging", async (context) => {
  const run = await runMerge(validPr());
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 0);
  const commands = await readFile(run.log, "utf8");
  assert.match(commands, /^pr view 42/m);
  assert.doesNotMatch(commands, /^pr merge 42/m);
});

test("eligible pull request is squash-merged and its branch is deleted", async (context) => {
  const run = await runMerge(validPr(), []);
  context.after(() => rm(run.directory, { recursive: true, force: true }));
  assert.equal(run.result.status, 0);
  const commands = await readFile(run.log, "utf8");
  assert.match(commands, /^pr merge 42 --squash --delete-branch$/m);
});
