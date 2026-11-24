# TailbasifyWarehouse: remove branches of inactive merchants

## Why

Every push to `master` in `Tailbase/TailbasifyWarehouse` merges `master` into **every** `merchants/*` branch.
There are 100 merchant branches. **47** belong to merchants that are no longer clients.
They slow down each deploy and add noise (conflicts, errors) for nothing.

## How the list was made (prod DB, read only, 2026-11-23)

- Merchant id = the number at the start of the branch name (`merchants/<id>-<name>`).
- `Datatail20130410.merchants.active = 0` -> **delete**.
- Template from `MerchantWebsiteInformation` (`infoCode = 'Template'`), for information.

Result on the 100 branches:

| Result | Branches |
|---|---|
| Delete (merchant inactive) | 47 -> `inactive-merchant-branches.csv` |
| Keep (active, Tailbasify template) | 48 |
| Keep, not touched (active, other template) | 5: 1117, 2798, 3408, 3483, 3653 |

## Files

- `inactive-merchant-branches.csv`: the 47 branches, with merchant id, template and **last commit** (the backup).
- `delete-branches.sh`: dry run by default; `--apply` to delete. Skips a branch if it changed since the review.
- `restore-branches.sh`: recreates a branch from the CSV.

## Steps (after this PR is approved)

1. Make a full local backup first:
   `git bundle create TailbasifyWarehouse-inactive-branches.bundle <the 47 branches>`
2. Dry run: `bash delete-branches.sh inactive-merchant-branches.csv`
3. Delete: `bash delete-branches.sh inactive-merchant-branches.csv --apply`
4. If a branch is needed again: `restore-branches.sh` (or from the bundle).

Deleting branches does **not** change `master` and does **not** start a deploy.

## Reviewer: please check

- No merchant in the CSV is still a client for another reason (reactivation planned, etc.).
- None of these branches has an open PR you still need.
