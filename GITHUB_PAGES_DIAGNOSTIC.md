# GitHub Pages Diagnostic Guide

## Current Status

You're seeing a **404 "File not found"** error, which means:
- ✅ GitHub Pages **might be enabled** (you're seeing a GitHub Pages 404, not "site not configured")
- ❌ The file **doesn't exist** at that path in the `gh-pages` branch

## Quick Diagnostic Steps

### Step 1: Check if GitHub Pages is Enabled

1. Go to: `https://github.com/stuchain/CuePoint/settings/pages`
2. Check if you see:
   - **"Your site is published at..."** → Pages is enabled ✅
   - **"GitHub Pages is currently disabled"** → Pages is NOT enabled ❌

### Step 2: Check gh-pages Branch Structure

1. Go to: `https://github.com/stuchain/CuePoint/tree/gh-pages`
2. Check if you see:
   - `updates/` directory → ✅ Branch has content
   - Empty branch or no `updates/` → ❌ Files weren't published

### Step 3: Check File Location

If `updates/` exists, check the structure:
- ✅ Correct: `updates/windows/stable/appcast.xml`
- ✅ Correct: `updates/macos/stable/appcast.xml`
- ❌ Wrong: Files in root or different location

## What Happened

The previous release (`v1.0.0-test1`) failed to publish because of a bug in `publish_feeds.py`:
- Error: `SameFileError` - trying to copy file to itself
- **Status**: ✅ **FIXED** in the latest code

## Solution

### Option A: Create a New Release (Recommended)

1. Create a new release tag (e.g., `v1.0.0-test2`)
2. Push the tag: `git push origin v1.0.0-test2`
3. The fixed workflow will:
   - Generate appcast files
   - Publish to `gh-pages` branch (now with the fix)
   - GitHub Pages will update automatically

### Option B: Manually Publish (If Needed)

If you want to manually publish the existing appcast files:

```bash
# Checkout gh-pages branch
git checkout gh-pages

# Pull latest
git pull origin gh-pages

# Make sure updates directory exists
mkdir -p updates/windows/stable
mkdir -p updates/macos/stable

# Copy appcast files (if they exist from previous release)
# Then commit and push
git add updates/
git commit -m "Add appcast feeds"
git push origin gh-pages
```

## Verification After Fix

After creating a new release with the fixed script:

1. **Wait 2-5 minutes** for GitHub Pages to build
2. **Check the file directly**: `https://github.com/stuchain/CuePoint/blob/gh-pages/updates/windows/stable/appcast.xml`
3. **Check via GitHub Pages**: `https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml`

Both should show the appcast XML content.

## Expected Structure in gh-pages

```
gh-pages/
└── updates/
    ├── macos/
    │   └── stable/
    │       └── appcast.xml
    └── windows/
        └── stable/
            └── appcast.xml
```

## Next Steps

1. ✅ **Script is fixed** - The `publish_feeds.py` bug is resolved
2. 🔄 **Create new release** - This will publish the files correctly
3. 🔄 **Enable GitHub Pages** (if not already enabled)
4. 🔄 **Verify** - Check the feed URL after release completes

## Still Having Issues?

If after creating a new release you still see 404:

1. **Check GitHub Actions logs** - Verify the publish step succeeded
2. **Check gh-pages branch** - Verify files are in correct location
3. **Check GitHub Pages settings** - Verify Pages is enabled and pointing to `gh-pages` branch
4. **Wait 5 minutes** - GitHub Pages can take time to update
