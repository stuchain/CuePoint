# GitHub Pages Setup - Quick Start

## The Problem

You're seeing a 404 error when accessing:
- `https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml`

This means **GitHub Pages is not enabled** for your repository.

## Quick Fix (2 Steps)

### Step 1: Enable GitHub Pages

1. Go to: `https://github.com/stuchain/CuePoint/settings/pages`
2. Under **Source**, select:
   - **Branch**: `gh-pages`
   - **Folder**: `/ (root)`
3. Click **Save**

### Step 2: Create Your First Release

The `gh-pages` branch will be created automatically when you create your first release:

1. Create a release tag (e.g., `v1.0.1-test-unsigned54`)
2. Push the tag: `git push origin v1.0.1-test-unsigned54`
3. The release workflow will:
   - Build the app
   - Generate appcast files
   - Publish to `gh-pages` branch
   - GitHub Pages will automatically update

### Step 3: Verify (After Release)

Wait 2-5 minutes after the release workflow completes, then check:
- `https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml`

It should now show the appcast XML instead of 404.

## That's It!

Once GitHub Pages is enabled and your first release is published, the update system will work automatically for all future releases.

## Troubleshooting

**Still seeing 404?**
- Wait 2-5 minutes (GitHub Pages needs time to build)
- Check if `gh-pages` branch exists: `https://github.com/stuchain/CuePoint/tree/gh-pages`
- Verify the branch has `updates/` directory with appcast files

**gh-pages branch doesn't exist?**
- It will be created automatically on your first release
- Or create it manually (see full guide: `DOCS/GUIDES/GITHUB_PAGES_SETUP.md`)
