# GitHub Pages Setup Guide

## Problem

When accessing `https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml`, you see a 404 error: "There isn't a GitHub Pages site here."

This means GitHub Pages is not enabled for your repository.

## Solution

### Step 1: Enable GitHub Pages

1. Go to your repository on GitHub: `https://github.com/stuchain/CuePoint`
2. Click on **Settings** (top menu)
3. Scroll down to **Pages** (left sidebar)
4. Under **Source**, select:
   - **Branch**: `gh-pages`
   - **Folder**: `/ (root)`
5. Click **Save**

### Step 2: Verify gh-pages Branch Exists

The `gh-pages` branch is created automatically when you create your first release. However, if it doesn't exist yet:

**Option A: Wait for First Release**
- The release workflow will create the `gh-pages` branch automatically
- After the first release, GitHub Pages will be available

**Option B: Create Manually (if needed)**
```bash
# Create an empty gh-pages branch
git checkout --orphan gh-pages
git rm -rf .
echo "# CuePoint Update Feeds" > README.md
git add README.md
git commit -m "Initial gh-pages branch"
git push origin gh-pages
```

### Step 3: Verify Setup

After enabling GitHub Pages:

1. Wait 1-2 minutes for GitHub to build the site
2. Check the Pages settings - you should see: "Your site is published at `https://stuchain.github.io/CuePoint/`"
3. Try accessing: `https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml`

### Step 4: Test with a Release

1. Create a test release (e.g., `v1.0.1-test-unsigned54`)
2. The release workflow will:
   - Generate appcast files
   - Publish them to `gh-pages` branch
   - GitHub Pages will automatically update
3. Verify the feed is accessible

## Expected Directory Structure

After publishing, the `gh-pages` branch should have:

```
gh-pages/
├── updates/
│   ├── macos/
│   │   └── stable/
│   │       └── appcast.xml
│   └── windows/
│       └── stable/
│           └── appcast.xml
```

## Troubleshooting

### Issue: Still seeing 404 after enabling Pages

**Solutions**:
1. Wait 2-5 minutes - GitHub Pages can take time to build
2. Check if `gh-pages` branch exists: `https://github.com/stuchain/CuePoint/tree/gh-pages`
3. Verify the branch has content (appcast files)
4. Check GitHub Pages build logs in Settings > Pages > Build history

### Issue: gh-pages branch doesn't exist

**Solution**: Create your first release - the release workflow will create it automatically.

### Issue: Feed files not in correct location

**Solution**: The `publish_feeds.py` script should preserve directory structure. If files are in wrong location:
1. Check the script output during release workflow
2. Manually verify the `gh-pages` branch structure
3. Fix the structure if needed and push again

## Verification Checklist

- [ ] GitHub Pages is enabled in repository settings
- [ ] Source branch is set to `gh-pages`
- [ ] `gh-pages` branch exists (created by first release)
- [ ] `gh-pages` branch contains `updates/` directory
- [ ] Appcast files are in correct location: `updates/{platform}/{channel}/appcast.xml`
- [ ] GitHub Pages site is published (check Settings > Pages)
- [ ] Feed URL is accessible: `https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml`

## After Setup

Once GitHub Pages is enabled and the first release is published:

1. ✅ Feed URLs will be accessible
2. ✅ Update system will work correctly
3. ✅ Users will be able to check for updates
4. ✅ New releases will automatically update the feeds

## Next Steps

1. **Enable GitHub Pages** (Settings > Pages)
2. **Create a test release** to trigger the workflow
3. **Verify feed accessibility** after release completes
4. **Test update detection** in the app

## Support

If you continue to have issues:

1. Check GitHub Actions workflow logs for the release workflow
2. Verify `publish_feeds.py` script executed successfully
3. Check the `gh-pages` branch structure on GitHub
4. Review GitHub Pages build logs in repository settings
