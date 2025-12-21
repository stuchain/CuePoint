# Pre-Release Testing Checklist

**Date**: Before creating any new release tag

This checklist ensures all recent changes are tested before releasing to GitHub.

## ✅ Automated Tests (Run These First)

### 1. Comprehensive Release Readiness Test (NEW - CRITICAL)
```bash
python tests/run_release_readiness_tests.py
```
**Expected**: All tests should pass
**Tests**: PyInstaller configuration, DLL fix, update system, version, workflows

### 2. DLL Fix Tests (CRITICAL for Python 3.13)
```bash
python tests/run_dll_fix_tests.py
```
**Expected**: All tests should pass
**Tests**: DLL inclusion in spec, tuple formats, post-analysis checks

### 3. Build and Executable Test
```bash
python scripts/test_build_and_executable.py
```
**Expected**: All tests should pass
**Tests**: PyInstaller version, spec file configuration, executable validation

### 4. Update Installer Tests
```bash
python tests/run_update_installer_tests.py
```
**Expected**: All tests should pass
**Tests**: Update installation flow, error handling, platform-specific logic

### 5. Update Detection Test
```bash
python scripts/test_update_detection.py
```
**Expected**: All update detection scenarios should pass

### 6. Version Validation
```bash
python scripts/validate_version.py
```
**Expected**: Version should be consistent across files

## ✅ Manual UI Tests

### 1. About Dialog
- [ ] Open app
- [ ] Go to **Help > About CuePoint**
- [ ] **Verify**:
  - [ ] Dialog opens without errors
  - [ ] Logo displays correctly (if logo.png exists)
  - [ ] Version information is correct
  - [ ] No error messages in console/logs

### 2. Rekordbox Instructions Dialog
- [ ] Open Rekordbox instructions dialog (if available in UI)
- [ ] **Verify**:
  - [ ] Window is wide enough (900px minimum)
  - [ ] Text is visible (light gray #cccccc, not too dark)
  - [ ] Images are centered and not cut off
  - [ ] No text cutoff on right side
  - [ ] Scrollbar works properly

### 3. Update Check (Manual)
- [ ] Open app
- [ ] Go to **Help > Check for Updates**
- [ ] **Verify**:
  - [ ] Status bar shows "Checking for updates..."
  - [ ] Either shows update dialog OR "You are using the latest version"
  - [ ] No errors in console/logs

### 4. Update Check (Startup)
- [ ] Close app completely
- [ ] Reopen app
- [ ] **Verify**:
  - [ ] App checks for updates on startup (if configured)
  - [ ] Update dialog appears if update available
  - [ ] No errors during startup

## ✅ Version Sync Testing

### Test Version Sync Script
```bash
# Validate current version
python scripts/sync_version.py --validate-only

# Test sync from specific tag (dry run - check output)
python scripts/sync_version.py --tag v1.0.1-test-unsigned51
```

**Expected**: Should show version sync working correctly

## ✅ Workflow Verification

### Check GitHub Actions Workflows
Verify these files have version sync steps:
- [ ] `.github/workflows/build-macos.yml` - Has "Sync version from git tag" step
- [ ] `.github/workflows/build-windows.yml` - Has "Sync version from git tag" step  
- [ ] `.github/workflows/release.yml` - Has "Sync version from git tag" step

### Check Scripts
- [ ] `scripts/sync_version.py` - Exists and works
- [ ] `scripts/publish_feeds.py` - Has stash and fetch logic
- [ ] `scripts/generate_appcast.py` - Works correctly
- [ ] `scripts/generate_update_feed.py` - Works correctly

## ✅ Code Inspection

### Verify Key Changes
- [ ] `SRC/gui_app.py` - Uses `get_version()` (not hardcoded "1.0.0")
- [ ] `SRC/__init__.py` - Imports `__version__` from `cuepoint.version`
- [ ] `SRC/cuepoint/ui/widgets/dialogs.py` - Has `_load_logo()` method
- [ ] `SRC/cuepoint/update/update_checker.py` - Uses `short_version` for comparison
- [ ] `SRC/cuepoint/update/update_checker.py` - Allows prerelease-to-prerelease updates

## ✅ Test Scenarios

### Scenario 1: Prerelease to Prerelease Update
1. Install version `v1.0.0-test-unsigned51`
2. Create release `v1.0.1-test-unsigned51`
3. **Expected**: App should detect and offer update

### Scenario 2: Version Sync on Tag Push
1. Create tag `v1.0.2-test-unsigned52` (without updating version.py first)
2. Push tag to GitHub
3. **Expected**: CI/CD should sync version.py automatically

### Scenario 3: Appcast Publishing
1. Create release tag
2. **Expected**: 
   - Appcast feeds generated
   - Feeds validated
   - Feeds published to gh-pages branch
   - No git errors

## ✅ Final Verification

Before creating release tag, ensure:

- [ ] **All automated tests pass** (run `python tests/run_release_readiness_tests.py`)
- [ ] **DLL fix tests pass** (run `python tests/run_dll_fix_tests.py`)
- [ ] **Build test passes** (run `python scripts/test_build_and_executable.py`)
- [ ] **Application builds successfully** (run `python scripts/build_pyinstaller.py`)
- [ ] **Executable runs without DLL errors** (critical - test manually)
- [ ] **Update flow works** (test update installation and launch)
- [ ] All manual UI tests pass
- [ ] Version is correct in `version.py`
- [ ] No hardcoded versions in code
- [ ] Update detection logic works
- [ ] About dialog works
- [ ] Rekordbox dialog displays correctly
- [ ] All scripts are committed to repository

### Critical: DLL Error Check

**MUST VERIFY**: After building and installing update, launch the app and verify:
- ✅ No "Failed to load Python DLL" error
- ✅ App launches successfully
- ✅ All features work correctly

If DLL error occurs, check:
1. PyInstaller version (must be >= 6.10.0)
2. Build logs for DLL inclusion messages
3. Spec file configuration
4. Rebuild application

## 🚀 Ready to Release?

If all checks pass:

1. **Update version.py** (if needed):
   ```bash
   # Option 1: Update manually
   # Edit SRC/cuepoint/version.py to new version
   
   # Option 2: Sync from existing tag
   python scripts/sync_version.py --tag v1.0.1
   ```

2. **Commit changes**:
   ```bash
   git add .
   git commit -m "Prepare for release v1.0.1"
   ```

3. **Create and push tag**:
   ```bash
   git tag v1.0.1-test-unsigned51
   git push origin v1.0.1-test-unsigned51
   ```

4. **Monitor GitHub Actions**:
   - Watch build workflows complete
   - Watch release workflow complete
   - Verify appcast feeds are published
   - Verify GitHub Release is created

5. **Test the release**:
   - Download and install the new release
   - Verify update detection works
   - Verify all UI components work

## 📝 Notes

- All tests should pass before releasing
- If any test fails, fix the issue and re-test
- Keep this checklist updated as new features are added
- Document any known issues or limitations
