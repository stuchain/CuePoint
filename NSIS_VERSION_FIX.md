# NSIS Version Format Fix

**Date:** 2025-12-18  
**Issue:** GitHub Actions build failing with `Error: invalid VIProductVersion format, should be X.X.X.X` when using prerelease versions like `1.0.0-test11`

## Problem

NSIS (Nullsoft Scriptable Install System) requires the `VIProductVersion` to be in format `X.X.X.X` (four numbers separated by dots). However, after fixing `sync_version.py` to preserve prerelease suffixes, the version in `version.py` now includes these suffixes (e.g., `1.0.0-test11`).

When the build script passed `1.0.0-test11` directly to NSIS:
- NSIS tried to create `VIProductVersion "1.0.0-test11.0"` 
- This is invalid because it contains non-numeric characters
- Build failed with: `Error: invalid VIProductVersion format, should be X.X.X.X`

## Solution

Extract the base version (X.Y.Z) before passing to NSIS, while keeping the full version for the installer filename.

### Changes Made

1. **`.github/workflows/build-windows.yml`**
   - Extract base version from full version before passing to NSIS
   - Pass base version to makensis: `/DVERSION=1.0.0` (instead of `/DVERSION=1.0.0-test11`)
   - After NSIS creates installer, rename it to include full version: `CuePoint-Setup-v1.0.0.exe` → `CuePoint-Setup-v1.0.0-test11.exe`

2. **`scripts/build_windows_installer.ps1`**
   - Extract base version from full version
   - Pass base version to NSIS for `VIProductVersion`
   - Use full version for installer filename
   - Rename installer after creation if versions differ

3. **`scripts/installer.nsi`**
   - Updated comments to clarify that VERSION should be base version (X.Y.Z)
   - No code changes needed (build script handles extraction)

## Version Extraction Logic

```powershell
# Extract base version (X.Y.Z) from version string
# Remove prerelease suffix (everything after -) and build metadata (everything after +)
$version = $fullVersion
if ($version -match '^([^-+]+)') {
    $version = $matches[1]
}
```

**Examples:**
- `1.0.0` → `1.0.0` (no change)
- `1.0.0-test11` → `1.0.0` (extracted)
- `1.0.1-test9` → `1.0.1` (extracted)
- `1.0.0+build.123` → `1.0.0` (extracted)
- `1.0.0-test11+build.123` → `1.0.0` (extracted)

## Installer Filename

- **NSIS creates:** `CuePoint-Setup-v1.0.0.exe` (using base version)
- **Renamed to:** `CuePoint-Setup-v1.0.0-test11.exe` (using full version)

This ensures:
- NSIS `VIProductVersion` is valid (`1.0.0.0`)
- Installer filename includes full version for identification
- Users can see the exact version they're installing

## Test Results

All version formats tested and working:
- ✅ `1.0.0` → Base: `1.0.0`, No rename needed
- ✅ `1.0.0-test11` → Base: `1.0.0`, Rename: `v1.0.0.exe` → `v1.0.0-test11.exe`
- ✅ `1.0.1-test9` → Base: `1.0.1`, Rename: `v1.0.1.exe` → `v1.0.1-test9.exe`
- ✅ `1.0.0+build.123` → Base: `1.0.0`, Rename: `v1.0.0.exe` → `v1.0.0+build.123.exe`
- ✅ `1.0.0-test11+build.123` → Base: `1.0.0`, Rename: `v1.0.0.exe` → `v1.0.0-test11+build.123.exe`

## Impact

### Before Fix:
- ❌ NSIS build failed with prerelease versions
- ❌ GitHub Actions build broken
- ❌ Windows installer not created

### After Fix:
- ✅ NSIS build succeeds with any version format
- ✅ GitHub Actions build works
- ✅ Windows installer created correctly
- ✅ Installer filename includes full version (with prerelease)
- ✅ Installer version info uses base version (NSIS requirement)

## Related Files

- ✅ `.github/workflows/build-windows.yml` - Fixed
- ✅ `scripts/build_windows_installer.ps1` - Fixed
- ✅ `scripts/installer.nsi` - Updated comments
- ✅ `scripts/generate_version_info.py` - Already fixed (extracts base version)
- ✅ `scripts/validate_version.py` - Already fixed (handles prerelease)

## Status

**✅ FIX COMPLETE**

The Windows installer build now fully supports prerelease versions:
1. Version sync preserves prerelease suffixes in `version.py`
2. Base version extracted for NSIS `VIProductVersion` (X.Y.Z.0 format)
3. Full version used for installer filename
4. Installer correctly created and named

**Ready for production use with prerelease versions!**
