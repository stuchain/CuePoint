# Make prerelease the new main, and rename current main to main_deprecated.
#
# Run from repo root in PowerShell. Requires: no uncommitted changes, branches main + prerelease exist.
# After running, push with: git push origin main_deprecated; git push origin main --force

$ErrorActionPreference = "Stop"

Write-Host "=== Make prerelease the main branch ===" -ForegroundColor Cyan
Write-Host ""

# 1. Fetch latest
git fetch origin
if ($LASTEXITCODE -ne 0) { exit 1 }

# 2. Ensure we have origin/main and origin/prerelease
$null = git rev-parse --verify origin/main 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: origin/main not found. Run: git fetch origin" -ForegroundColor Red
    exit 1
}
$null = git rev-parse --verify origin/prerelease 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: origin/prerelease not found. Run: git fetch origin" -ForegroundColor Red
    exit 1
}

# 3. Switch to main and update
git checkout main
git pull origin main 2>$null

# 4. Rename current local main to main_deprecated
git branch -m main main_deprecated
Write-Host "Renamed local branch main -> main_deprecated" -ForegroundColor Green

# 5. Create new local main from origin/prerelease
git checkout -b main origin/prerelease
Write-Host "Created new local branch main from origin/prerelease" -ForegroundColor Green

# 6. Summary
Write-Host ""
Write-Host "Done. Next steps (run these to update the remote):" -ForegroundColor Yellow
Write-Host "  1. Push the deprecated main:  git push origin main_deprecated"
Write-Host "  2. Force-push the new main:   git push origin main --force"
Write-Host "  3. (Optional) Delete remote prerelease:  git push origin --delete prerelease"
Write-Host ""
