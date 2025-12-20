# Dependency Version Synchronization

## Overview

The project now uses **latest compatible versions** for all dependencies, automatically synced across:
- ✅ Requirements files (requirements.txt, requirements-build.txt, requirements-dev.txt)
- ✅ Python version (.python-version, GitHub workflows)
- ✅ Build configurations

## Key Changes

### 1. Requirements Files Use `>=` Instead of `==`

All requirements files now use `>=` (minimum version) instead of `==` (exact version):
- **Before**: `PySide6==6.8.3` (pinned, doesn't support Python 3.14)
- **After**: `PySide6>=6.10.1` (latest compatible with Python 3.14)

This allows:
- Automatic updates to latest compatible versions
- Python 3.14 support
- No manual version pinning needed

### 2. Sync Script

Use `scripts/sync_all_versions.py` to sync everything:

```bash
# Sync Python version and update dependencies
python scripts/sync_all_versions.py --update-deps

# Sync to specific Python version
python scripts/sync_all_versions.py --update-deps --python-version 3.14
```

## What Gets Updated

### Python Version
- `.python-version` file
- All `.github/workflows/*.yml` files

### Dependencies
- `requirements.txt` - Development dependencies
- `requirements-build.txt` - Build dependencies (for CI/release)
- `requirements-dev.txt` - Development tools

All `==` are changed to `>=` to allow latest versions.

## Benefits

✅ **Python 3.14 Support** - Latest PySide6 (6.10.1+) supports Python 3.14  
✅ **Automatic Updates** - Dependencies update to latest compatible versions  
✅ **No Manual Pinning** - No need to manually update version numbers  
✅ **Consistent Versions** - Everything stays in sync automatically  

## Current Status

- **Python Version**: 3.14 (synced across all files)
- **PySide6**: `>=6.10.1` (supports Python 3.14)
- **All Dependencies**: Using `>=` for latest versions
- **Sync Script**: Available at `scripts/sync_all_versions.py`

## Usage

### Initial Setup

```bash
# 1. Sync all versions
python scripts/sync_all_versions.py --update-deps --python-version 3.14

# 2. Install dependencies
pip install -r requirements-build.txt

# 3. Verify
python --version  # Should show 3.14.x
pip list | grep PySide6  # Should show 6.10.1 or later
```

### Regular Updates

```bash
# Just update dependencies to latest
python scripts/sync_all_versions.py --update-deps

# Then reinstall
pip install --upgrade -r requirements-build.txt
```

## Files Modified

- `requirements-build.txt` - Changed all `==` to `>=`, updated PySide6 to `>=6.10.1`
- `scripts/sync_all_versions.py` - New script to sync versions
- `.python-version` - Updated to 3.14
- `.github/workflows/*.yml` - Already updated to 3.14

## Important Notes

1. **CI/CD**: Workflows will automatically use latest compatible versions
2. **Reproducibility**: For reproducible builds, consider using `pip freeze` to lock versions
3. **Testing**: Always test after dependency updates
4. **Security**: Latest versions include security fixes
