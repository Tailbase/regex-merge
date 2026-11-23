#!/usr/bin/env bash
# Delete the inactive merchant branches listed in inactive-merchant-branches.csv
# from Tailbase/TailbasifyWarehouse.
#
# Usage (run from a clone of TailbasifyWarehouse):
#   bash delete-branches.sh /path/to/inactive-merchant-branches.csv          # DRY RUN (default)
#   bash delete-branches.sh /path/to/inactive-merchant-branches.csv --apply  # really delete
#
# Safety:
# - Dry run by default: it only prints what it would do.
# - A branch is deleted only if its last commit is still the one in the CSV.
#   If someone pushed to it since the review, it is skipped.
# - The CSV keeps every branch name + last commit, so restore-branches.sh can bring them back.
set -euo pipefail

CSV="${1:?CSV file required}"
APPLY="${2:-}"
REMOTE="origin"

deleted=0; skipped=0; missing=0
while IFS=, read -r branch merchant_id active template sha; do
  [ "$branch" = "branch" ] && continue   # header
  sha="${sha%$'\r'}"   # tolerate Windows line endings
  current=$(git ls-remote --heads "$REMOTE" "refs/heads/$branch" | cut -f1)
  if [ -z "$current" ]; then
    echo "MISSING  $branch (already gone)"; missing=$((missing+1)); continue
  fi
  if [ "$current" != "$sha" ]; then
    echo "SKIP     $branch (changed since review: $current)"; skipped=$((skipped+1)); continue
  fi
  if [ "$APPLY" = "--apply" ]; then
    git push "$REMOTE" --delete "$branch"
    echo "DELETED  $branch"
  else
    echo "WOULD DELETE  $branch  ($merchant_id, $template)"
  fi
  deleted=$((deleted+1))
done < "$CSV"

echo
echo "To delete: $deleted | Skipped (changed): $skipped | Already gone: $missing"
[ "$APPLY" = "--apply" ] || echo "DRY RUN: nothing was deleted. Add --apply to delete."
