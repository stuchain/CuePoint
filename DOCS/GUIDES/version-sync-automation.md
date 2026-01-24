# Version Sync Automation Guide

## Overview

The CuePoint project now has **automatic version synchronization** that ensures `version.py` always matches the git tag when you push a release tag. This eliminates manual version updates and prevents version mismatches.

## How It Works

### 1. Single Source of Truth

- **`SRC/cuepoint/version.py`** is the single source of truth for version information
- All other files import from this module:
  - `SRC/gui_app.py` - Uses `get_version()` for QApplication version
  - `SRC/__init__.py` - Imports `__version__` from `cuepoint.version`
  - Build scripts - Read version from `version.py`

### 2. Automatic Sync in CI/CD

When you push a git tag (e.g., `v1.0.1`), the following happens automatically:

#### Build Workflows (`build-macos.yml` and `build-windows.yml`)
1. **Sync Version Step** (NEW):
   - Extracts version from the git tag (e.g., `v1.0.1-test-unsigned47` → `1.0.1`)
   - Updates `version.py` with the extracted version
   - Only runs when a tag is pushed (not on regular commits)

2. **Validate Version Step**:
   - Ensures `version.py` matches the git tag
   - Fails the build if versions don't match

#### Release Workflow (`release.yml`)
1. **Sync Version Step** (NEW):
   - Syncs `version.py` from the git tag before generating appcasts
   - Ensures appcast feeds have the correct version

### 3. Manual Sync Script

If you need to sync versions manually (e.g., you created a tag before updating `version.py`):

```bash
# Sync from latest git tag
python scripts/sync_version.py

# Sync from specific tag
python scripts/sync_version.py --tag v1.0.1

# Just validate (don't update)
python scripts/sync_version.py --validate-only
```

## Workflow

### Recommended: Update version.py First

1. Update `SRC/cuepoint/version.py` with new version (e.g., `1.0.1`)
2. Commit the change: `git commit -am "Bump version to 1.0.1"`
3. Create and push tag: 
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. CI/CD automatically:
   - Syncs version (redundant but safe)
   - Validates version matches
   - Builds and releases

### Alternative: Create Tag First

If you create a tag first (e.g., `v1.0.1-test-unsigned47`):

1. Create and push tag:
   ```bash
   git tag v1.0.1-test-unsigned47
   git push origin v1.0.1-test-unsigned47
   ```

2. CI/CD automatically:
   - **Syncs `version.py` from tag** (extracts `1.0.1` from `v1.0.1-test-unsigned47`)
   - Validates version matches
   - Builds and releases

3. Optionally sync locally:
   ```bash
   python scripts/sync_version.py
   git add SRC/cuepoint/version.py
   git commit -m "Sync version from git tag"
   ```

## Version Extraction Logic

The sync script extracts the SemVer part (X.Y.Z) from tags:

- `v1.0.1` → `1.0.1`
- `v1.0.1-test-unsigned47` → `1.0.1`
- `v1.0.1-beta.1` → `1.0.1`

This allows test/development tags while maintaining clean version numbers in `version.py`.

## Files Updated

### Code Changes
- ✅ `SRC/gui_app.py` - Now uses `get_version()` instead of hardcoded `"1.0.0"`
- ✅ `SRC/__init__.py` - Now imports `__version__` from `cuepoint.version`
- ✅ `scripts/sync_version.py` - New script for version syncing

### CI/CD Changes
- ✅ `.github/workflows/build-macos.yml` - Added sync step before validation
- ✅ `.github/workflows/build-windows.yml` - Added sync step before validation
- ✅ `.github/workflows/release.yml` - Added sync step before appcast generation

## Validation

The `validate_version.py` script checks:
- ✅ Version format (SemVer: X.Y.Z)
- ✅ `version.py` matches latest git tag
- ✅ `version.py` matches `pyproject.toml` (if present)

## Troubleshooting

### Version Mismatch Error

If you see: `Version mismatch: version.py has 1.0.0, latest git tag is v1.0.1`

**Solution**: Run `python scripts/sync_version.py` to sync from the tag, then commit the change.

### Sync Script Not Found

If CI fails with "sync_version.py not found":
- Ensure the script is committed to the repository
- Check that the script has execute permissions

### Tag Format Issues

The sync script expects tags starting with `v` (e.g., `v1.0.1`). If you use a different format:
- Update the tag to match the expected format, or
- Modify `sync_version.py` to handle your tag format

## Best Practices

1. **Always update `version.py` before creating a tag** (recommended workflow)
2. **Use semantic versioning** (MAJOR.MINOR.PATCH)
3. **Test tags** can include suffixes (e.g., `v1.0.1-test-unsigned47`)
4. **Let CI/CD handle syncing** - don't manually edit `version.py` after pushing a tag
5. **Commit version changes** - if you sync locally, commit the updated `version.py`

## Summary

✅ **Automatic**: Version syncs from git tags in CI/CD  
✅ **Safe**: Validation ensures versions match before builds  
✅ **Flexible**: Works with test tags (extracts SemVer part)  
✅ **Manual Option**: `sync_version.py` script for local syncing  
✅ **Single Source**: `version.py` is the only place to define version

No more manual version updates needed! 🎉
