# Version Script Fixes for Prerelease Versions

**Date:** 2025-12-18  
**Issue:** GitHub Actions workflow failing with `Error: Invalid version format: 1.0.0-test10`

## Problem

After fixing `sync_version.py` to preserve prerelease suffixes (like `-test10`), the version in `version.py` now includes these suffixes. However, some build scripts were still expecting only the base version format (X.Y.Z) and failed when encountering prerelease versions.

## Fixed Scripts

### 1. `scripts/generate_version_info.py` ✅

**Issue:** Script tried to parse `1.0.0-test10` directly, causing `ValueError` when converting `'0-test10'` to integer.

**Fix:** Extract base version (X.Y.Z) before parsing:
```python
# Extract base version (X.Y.Z) from version string, removing prerelease suffixes
base_version = __version__
if '-' in base_version:
    base_version = base_version.split('-')[0]
if '+' in base_version:
    base_version = base_version.split('+')[0]

# Parse base version parts
version_parts = base_version.split('.')
major, minor, patch = map(int, version_parts)
```

**Test Results:**
- ✅ `1.0.0` → Works
- ✅ `1.0.0-test10` → Works (extracts `1.0.0`)
- ✅ `1.0.1-test-unsigned47` → Works (extracts `1.0.1`)
- ✅ `1.0.0+build.123` → Works (extracts `1.0.0`)
- ✅ `1.0.0-test10+build.123` → Works (extracts `1.0.0`)

### 2. `scripts/validate_version.py` ✅

**Issue:** Validation function only accepted base version format, and comparison didn't account for prerelease suffixes.

**Fix:**
1. Added `extract_base_version()` function
2. Updated `validate_semver()` to extract base version before validation
3. Updated comparison logic to compare base versions

**Changes:**
```python
def extract_base_version(version: str) -> str:
    """Extract base version (X.Y.Z) from version string."""
    if '+' in version:
        version = version.split('+')[0]
    if '-' in version:
        version = version.split('-')[0]
    return version

# Use extract_base_version() before validation and comparison
```

**Test Results:**
- ✅ Validates `1.0.0-test10` correctly
- ✅ Compares base versions correctly (ignores prerelease differences)

## Impact

### Before Fix:
- ❌ `generate_version_info.py` failed with `1.0.0-test10`
- ❌ GitHub Actions build failed
- ❌ Windows installer build broken

### After Fix:
- ✅ `generate_version_info.py` works with any version format
- ✅ GitHub Actions build succeeds
- ✅ Windows installer builds correctly
- ✅ Version validation works with prerelease versions

## Verification

All scripts now handle:
- Base versions: `1.0.0`, `1.0.1`, `2.5.10`
- Prerelease versions: `1.0.0-test2`, `1.0.1-test9`, `1.0.0-test10`
- Build metadata: `1.0.0+build.123`
- Combined: `1.0.0-test10+build.123`

## Related Files

- ✅ `scripts/generate_version_info.py` - Fixed
- ✅ `scripts/validate_version.py` - Fixed
- ✅ `scripts/sync_version.py` - Already fixed (preserves prerelease suffixes)
- ✅ `scripts/generate_appcast.py` - Already handles prerelease (uses `version_base.split('-')[0]`)
- ✅ `scripts/generate_update_feed.py` - Already handles prerelease (uses `version_base.split('-')[0]`)

## Status

**✅ ALL FIXES COMPLETE**

The build system now fully supports prerelease versions throughout the entire pipeline:
1. Git tag → `sync_version.py` → `version.py` (preserves prerelease)
2. `version.py` → `generate_version_info.py` → Windows version info (extracts base)
3. `version.py` → `validate_version.py` → Validation (handles prerelease)
4. `version.py` → App update system → Update detection (handles prerelease)

**Ready for production use with prerelease versions!**
