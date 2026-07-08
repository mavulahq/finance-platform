#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const gh = process.env.GH_BIN || "gh";
const args = process.argv.slice(2);
const checkOnlyIndex = args.indexOf("--check-only");
const checkOnly = checkOnlyIndex !== -1;

if (checkOnly) args.splice(checkOnlyIndex, 1);

if (args.length !== 1 || !/^\d+$/.test(args[0])) {
  console.error("Usage: pnpm pr:merge -- <number> [--check-only]");
  process.exitCode = 2;
} else {
  await validateAndMerge(args[0]);
}

function runGh(commandArgs) {
  const result = spawnSync(gh, commandArgs, {
    encoding: "utf8",
    env: process.env,
    timeout: 30_000,
  });

  if (result.status !== 0) {
    const detail =
      result.error?.message ||
      result.stderr.trim() ||
      result.stdout.trim() ||
      "unknown gh error";
    throw new Error(detail);
  }

  return result.stdout.trim();
}

function checkName(check) {
  return check.name || check.context || "";
}

function checkSucceeded(check) {
  if (check.__typename === "StatusContext") return check.state === "SUCCESS";
  return check.status === "COMPLETED" && check.conclusion === "SUCCESS";
}

function checkPending(check) {
  if (check.__typename === "StatusContext") return check.state === "PENDING";
  return check.status !== "COMPLETED";
}

async function validateAndMerge(prNumber) {
  try {
    const raw = runGh([
      "pr",
      "view",
      prNumber,
      "--json",
      "number,state,isDraft,baseRefName,mergeable,reviewDecision,statusCheckRollup,url",
    ]);
    const pr = JSON.parse(raw);
    const errors = [];
    const checks = pr.statusCheckRollup || [];
    const required = checks.find((check) => checkName(check) === "required");

    if (pr.state !== "OPEN") errors.push("pull request is not open");
    if (pr.isDraft) errors.push("pull request is still a draft");
    if (pr.baseRefName !== "main") errors.push("base branch must be main");
    if (pr.mergeable !== "MERGEABLE")
      errors.push(`mergeable state is ${pr.mergeable}`);
    if (pr.reviewDecision === "CHANGES_REQUESTED")
      errors.push("a review requests changes");
    if (!required) errors.push('Required CI check "required" is missing');
    else if (!checkSucceeded(required))
      errors.push('Required CI check "required" is not successful');

    for (const check of checks) {
      if (check === required) continue;
      if (checkPending(check))
        errors.push(`check "${checkName(check)}" is pending`);
      else if (
        !checkSucceeded(check) &&
        !["NEUTRAL", "SKIPPED"].includes(check.conclusion)
      ) {
        errors.push(`check "${checkName(check)}" did not succeed`);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `PR #${prNumber} cannot be merged:\n- ${errors.join("\n- ")}`,
      );
    }

    console.log(
      `PR #${prNumber} passed the mavula.io merge policy${pr.url ? `: ${pr.url}` : "."}`,
    );

    if (!checkOnly) {
      runGh(["pr", "merge", prNumber, "--squash", "--delete-branch"]);
      console.log(
        `PR #${prNumber} was squash-merged and its branch was deleted.`,
      );
    }
  } catch (error) {
    console.error(`Unable to validate PR #${prNumber}: ${error.message}`);
    process.exitCode = 1;
  }
}
