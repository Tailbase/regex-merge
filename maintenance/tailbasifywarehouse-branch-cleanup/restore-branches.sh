#!/usr/bin/env bash
# Restore deleted merchant branches from the CSV backup (branch name + last commit).
#
# Usage (run from a clone of TailbasifyWarehouse that still has the commits,
# or after `git fetch origin <sha>`):
#   bash restore-branches.sh /path/to/inactive-merchant-branches.csv                 # all branches
#   bash restore-branches.sh /path/to/inactive-merchant-branches.csv merchants/1842-jazzi-raes-furniture  # one branch
set -euo pipefail

CSV="${1:?CSV file required}"
ONLY="${2:-}"
REMOTE="origin"

while IFS=, read -r branch merchant_id active template sha; do
  [ "$branch" = "branch" ] && continue
  sha="${sha%$'\r'}"   # tolerate Windows line endings
  [ -n "$ONLY" ] && [ "$branch" != "$ONLY" ] && continue
  git fetch -q "$REMOTE" "$sha" 2>/dev/null || true
  git push "$REMOTE" "$sha:refs/heads/$branch"
  echo "RESTORED $branch -> $sha"
done < "$CSV"
