# Regex Merge

Github Action for multiple branches merging

## Inputs

### `accessToken`

**Required** Github token. Usually secrets.GITHUB_TOKEN.

### `headBranch`

**Required** Branch to merge.

### `branchRegex`

Regex pattern for all branches to be updated.

### `notifyConflicts`

Comments in related PR to branch, notifying about the merge conflict.

### `dryRun`

If `true`, only lists the branches that would be merged. No branch is changed. Default `false`.

### `delayMs`

Pause in milliseconds between two merges. Also the base wait for retries (2x, 4x, 8x...). Default `1000`.

### `maxRetries`

How many times to retry a merge that failed with a temporary GitHub error (500, 502, 503, 504). Default `3`.

## Behavior (since 1.6)

- Branches are merged **one at a time**, with a pause between them. Before 1.6, all merges were sent at the same time, and GitHub answered many of them with 500 errors.
- Temporary errors (500, 502, 503, 504) are retried.
- Conflicts (409) are reported and commented on the open PR, like before. They do not fail the job.
- A summary is printed at the end. The job fails (red) if a branch still fails after the retries.

## Example usage

```yaml
uses: Tailbase/regex-merge@1.6
with:
  accessToken: ${{ secrets.GITHUB_TOKEN }}
  headBranch: master
  branchRegex: '^release\/.+'
```