# Pre-Release Testing Guide

This guide helps you test all recent changes before releasing to GitHub to avoid the release → fix → release cycle.

## Quick Test

Run the comprehensive test script:

```bash
python scripts/test_pre_release.py
```

This will test:
- ✅ Version sync automation
- ✅ Version consistency
- ✅ Update detection logic
- ✅ About dialog logo loading
- ✅ Rekordbox instructions dialog
- ✅ Appcast generation scripts
- ✅ Publish feeds script
- ✅ GitHub Actions workflows
- ✅ GUI app version usage

## Detailed Testing Steps

### 1. Version Sync Testing

Test that version syncing works correctly:

```bash
# Test validation
python scripts/sync_version.py --validate-only

# Test sync from latest tag (dry run - check output)
python scripts/sync_version.py --tag v1.0.1-test-unsigned51
```

**Expected**: Should show version sync working correctly.

### 2. Update Detection Testing

Test that update detection works with prerelease versions:

```bash
python scripts/test_update_detection.py
```

**Expected**: All tests should pass, especially:
- Prerelease to prerelease updates are detected
- Prerelease filtering works correctly

### 3. Manual Update Check Test

1. **Set up test scenario**:
   - Current version: `1.0.0-test-unsigned51` (in version.py)
   - New version available: `1.0.1-test-unsigned51` (in appcast)

2. **Test update check**:
   - Open the app
   - Go to Help > Check for Updates
   - Should detect the new version

3. **Test startup check**:
   - Close and reopen the app
   - Should check for updates on startup (if configured)
   - Should show update dialog if available

### 4. UI Component Testing

#### About Dialog
1. Open app
2. Go to Help > About CuePoint
3. **Check**:
   - ✅ Dialog opens without errors
   - ✅ Logo displays (if logo.png exists)
   - ✅ Version information is correct
   - ✅ No error messages

#### Rekordbox Instructions Dialog
1. Open app
2. Navigate to Rekordbox export instructions (if available in UI)
3. **Check**:
   - ✅ Dialog opens
   - ✅ Window is wide enough (900px minimum)
   - ✅ Text is visible (light gray, not too dark)
   - ✅ Images are centered
   - ✅ No text cutoff

### 5. Version Consistency Test

```bash
# Validate version consistency
python scripts/validate_version.py
```

**Expected**: Should pass if version.py matches git tag.

### 6. Appcast Generation Test

Test appcast generation (requires test files):

```bash
# Test macOS appcast generation (dry run)
python scripts/generate_appcast.py \
  --dmg test.dmg \
  --version 1.0.1-test-unsigned51 \
  --url https://example.com/test.dmg \
  --output test_appcast.xml

# Test Windows appcast generation (dry run)
python scripts/generate_update_feed.py \
  --exe test.exe \
  --version 1.0.1-test-unsigned51 \
  --url https://example.com/test.exe \
  --output test_feed.xml

# Validate generated appcasts
python scripts/validate_feeds.py \
  --macos test_appcast.xml \
  --windows test_feed.xml
```

**Expected**: Appcasts should generate and validate successfully.

### 7. Workflow File Verification

Check that workflow files have version sync steps:

```bash
# Check build-macos.yml
grep -i "sync.*version" .github/workflows/build-macos.yml

# Check build-windows.yml
grep -i "sync.*version" .github/workflows/build-windows.yml

# Check release.yml
grep -i "sync.*version" .github/workflows/release.yml
```

**Expected**: All three workflows should have version sync steps.

### 8. Code Inspection

Verify key changes:

```bash
# Check gui_app.py uses get_version()
grep "get_version()" SRC/gui_app.py

# Check AboutDialog has _load_logo method
grep "_load_logo" SRC/cuepoint/ui/widgets/dialogs.py

# Check update checker uses short_version
grep "short_version" SRC/cuepoint/update/update_checker.py
```

## Test Checklist

Before releasing, verify:

- [ ] Version sync script works (`scripts/sync_version.py`)
- [ ] Version validation passes (`scripts/validate_version.py`)
- [ ] Update detection works for prerelease versions
- [ ] About dialog opens without errors
- [ ] About dialog logo loads (if logo.png exists)
- [ ] Rekordbox instructions dialog displays correctly
- [ ] Appcast generation scripts work
- [ ] Publish feeds script has stash/fetch logic
- [ ] All GitHub Actions workflows have version sync steps
- [ ] No hardcoded versions in code
- [ ] `gui_app.py` uses `get_version()` from version.py

## Common Issues and Fixes

### Issue: Update not detected
- **Check**: Current version in version.py matches installed version
- **Check**: Appcast feed is accessible and has correct version
- **Check**: Update checker is using `short_version` not `version` (build number)
- **Fix**: Run `python scripts/test_update_detection.py` to diagnose

### Issue: Version sync fails
- **Check**: Git tag exists and is in correct format (vX.Y.Z)
- **Check**: version.py is writable
- **Fix**: Run `python scripts/sync_version.py --tag <tag>` manually

### Issue: About dialog error
- **Check**: Logo file exists at `SRC/cuepoint/ui/assets/icons/logo.png`
- **Check**: `_load_logo` method exists in AboutDialog
- **Fix**: Method should gracefully handle missing logo (return None)

### Issue: Rekordbox dialog text cutoff
- **Check**: Window minimum width is 900px
- **Check**: Text color is light enough (#cccccc)
- **Check**: Margins are sufficient (30px right margin)

## Running All Tests

```bash
# Run comprehensive test suite
python scripts/test_pre_release.py

# Run update detection tests
python scripts/test_update_detection.py

# Run version validation
python scripts/validate_version.py
```

## Success Criteria

All tests should pass before releasing:
- ✅ All automated tests pass
- ✅ Manual UI tests pass
- ✅ Version consistency verified
- ✅ Update detection works
- ✅ No errors in logs

## Next Steps After Testing

1. If all tests pass → Ready to release
2. If tests fail → Fix issues and re-test
3. Create release tag: `git tag v1.0.1 && git push origin v1.0.1`
4. Monitor GitHub Actions workflows
5. Verify release artifacts are correct
6. Test update detection with the new release
