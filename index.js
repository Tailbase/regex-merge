const core = require("@actions/core");
const github = require("@actions/github");
const requestError = require("@octokit/request-error");

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
const accessToken = core.getInput("accessToken");
const headBranch = core.getInput("headBranch");
const branchRegexInput = core.getInput("branchRegex");
const notifyConflicts = toBool(core.getInput("notifyConflicts"), true);
const dryRun = toBool(core.getInput("dryRun"), false);
const delayMs = toInt(core.getInput("delayMs"), 1000);
const maxRetries = toInt(core.getInput("maxRetries"), 3);

// Errors that are usually temporary on GitHub's side: worth a retry.
const RETRY_STATUSES = [500, 502, 503, 504];

const octokit = github.getOctokit(accessToken);
const branchRegex = branchRegexInput ? new RegExp(branchRegexInput) : null;

const result = { merged: [], upToDate: [], conflict: [], failed: [], wouldMerge: [] };

function toBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n < 0 ? fallback : n;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listTargetBranches() {
  const targets = [];
  let page = 1;
  while (true) {
    const { data: branches } = await octokit.repos.listBranches({
      owner,
      repo,
      per_page: 100,
      page,
    });
    if (branches.length === 0) break;
    for (const { name, commit } of branches) {
      if (name === headBranch) continue;
      if (branchRegex && !branchRegex.test(name)) continue;
      targets.push({ name, sha: commit.sha });
    }
    page += 1;
  }
  return targets;
}

// One merge, with retries (and a longer wait each time) on temporary errors.
async function mergeWithRetry(branch) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await octokit.repos.merge({ owner, repo, base: branch, head: headBranch });
    } catch (error) {
      const status = error instanceof requestError.RequestError ? error.status : undefined;
      if (RETRY_STATUSES.includes(status) && attempt <= maxRetries) {
        const wait = delayMs * 2 ** attempt;
        console.warn(`[${status}] ${branch}: retry ${attempt}/${maxRetries} in ${wait} ms`);
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
}

async function processBranch({ name, sha }) {
  if (dryRun) {
    console.log(`[dry run] would merge ${headBranch} into ${name}`);
    result.wouldMerge.push(name);
    return;
  }
  try {
    const { status } = await mergeWithRetry(name);
    if (status === 201) {
      console.log(`Merged ${headBranch} into ${name}`);
      result.merged.push(name);
    } else if (status === 204) {
      console.log(`Nothing to merge from ${headBranch} into ${name}`);
      result.upToDate.push(name);
    } else {
      console.warn(`Unexpected status ${status} for ${name}`);
      result.failed.push(`${name} (status ${status})`);
    }
  } catch (error) {
    const status = error instanceof requestError.RequestError ? error.status : undefined;
    if (status === 409) {
      console.log(`Merge conflict: please merge ${headBranch} manually into ${name}`);
      result.conflict.push(name);
      await commentInPr(name, sha);
    } else {
      console.error(`Error merging ${headBranch} into ${name}: [${status}] ${error.message}`);
      result.failed.push(`${name} (${status || error.message})`);
    }
  }
}

async function commentInPr(branch, branchSha) {
  if (!notifyConflicts) return;
  try {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${branch}`,
    });
    const pr = data.find(({ head: { sha } }) => sha === branchSha);
    if (pr) {
      console.log(`Notifying @${pr.user.login} on PR #${pr.number}`);
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: `@${pr.user.login} merge conflicts found.\nPlease merge ${headBranch} manually into this branch.`,
      });
    }
  } catch (error) {
    console.warn(`Could not comment on the PR for ${branch}: ${error.message}`);
  }
}

function printSummary(total) {
  const section = (title, list) => {
    console.log(`\n${title}: ${list.length}`);
    list.forEach((b) => console.log(`  - ${b}`));
  };
  console.log(`\n===== Summary (${total} branches${dryRun ? ", DRY RUN" : ""}) =====`);
  if (dryRun) {
    section("Would merge", result.wouldMerge);
    return;
  }
  console.log(`\nMerged: ${result.merged.length}`);
  console.log(`Already up to date: ${result.upToDate.length}`);
  section("Conflicts (merge by hand)", result.conflict);
  section("Failed after retries", result.failed);
}

async function run() {
  if (branchRegex) console.log(`Filtering branches with regex: ${branchRegex}`);
  if (dryRun) console.log("DRY RUN: no branch will be changed.");

  const targets = await listTargetBranches();
  console.log(`${targets.length} branches to process, one at a time.`);

  for (let i = 0; i < targets.length; i++) {
    await processBranch(targets[i]);
    if (!dryRun && i < targets.length - 1) await sleep(delayMs);
  }

  printSummary(targets.length);

  // Conflicts are normal (a person merges by hand). Real failures make the job red.
  if (result.failed.length > 0) {
    core.setFailed(`${result.failed.length} branch(es) failed after ${maxRetries} retries.`);
  }
}

run().catch((error) => core.setFailed(error.message));
