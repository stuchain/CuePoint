#!/bin/bash
# Make prerelease the new main, and rename current main to main_deprecated.
#
# Run from repo root. Requires: no uncommitted changes, and branches main + prerelease exist.
# After running, push with: git push origin main_deprecated && git push origin main --force

set -e

echo "=== Make prerelease the main branch ==="
echo ""

# 1. Fetch latest
git fetch origin

# 2. Ensure we have origin/main and origin/prerelease
if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "Error: origin/main not found. Run: git fetch origin"
  exit 1
fi
if ! git rev-parse --verify origin/prerelease >/dev/null 2>&1; then
  echo "Error: origin/prerelease not found. Run: git fetch origin"
  exit 1
fi

# 3. Current branch: switch to main (local) so we can rename it
git checkout main
git pull origin main 2>/dev/null || true

# 4. Rename current local main to main_deprecated
git branch -m main main_deprecated
echo "Renamed local branch main -> main_deprecated"

# 5. Create new local main from origin/prerelease
git checkout -b main origin/prerelease
echo "Created new local branch main from origin/prerelease"

# 6. Summary
echo ""
echo "Done. Next steps (run these to update the remote):"
echo "  1. Push the deprecated main:  git push origin main_deprecated"
echo "  2. Force-push the new main:  git push origin main --force"
echo "  3. (Optional) Delete remote prerelease:  git push origin --delete prerelease"
echo ""
