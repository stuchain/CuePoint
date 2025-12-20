# Python Version Synchronization

## Overview

The project now uses **dynamic Python version detection** - whatever Python version you're using will be automatically detected and used consistently across:
- ✅ Build process (PyInstaller spec)
- ✅ GitHub workflows
- ✅ `.python-version` file
- ✅ DLL bundling

## How It Works

### 1. Dynamic Detection in Spec File

The `build/pyinstaller.spec` file now:
- Automatically detects the Python version at build time
- Uses the correct DLL name (e.g., `python313.dll`, `python314.dll`)
- No hardcoded version numbers

### 2. Single Source of Truth

The `.python-version` file is the source of truth for:
- Development environment setup
- CI/CD workflows (can be read by scripts)
- Documentation

### 3. Sync Script

Use `scripts/sync_python_version.py` to sync versions across all files:

```bash
# Sync to current Python version
python scripts/sync_python_version.py

# Sync to specific version
python scripts/sync_python_version.py 3.14
```

## Changing Python Versions

### Option 1: Use Current Python Version

1. **Activate your venv** with the desired Python version
2. **Run sync script**:
   ```bash
   python scripts/sync_python_version.py
   ```
3. **Rebuild**:
   ```bash
   python scripts/build_pyinstaller.py
   ```

### Option 2: Specify Version Explicitly

1. **Run sync script with version**:
   ```bash
   python scripts/sync_python_version.py 3.14
   ```
2. **Update your venv** to match:
   ```bash
   # Delete old venv
   Remove-Item -Recurse -Force .venv
   
   # Create new venv with specified version
   py -3.14 -m venv .venv
   .venv\Scripts\Activate.ps1
   ```
3. **Rebuild**

## What Gets Updated

When you run `sync_python_version.py`:

1. **`.python-version`** - Updated to specified version
2. **`.github/workflows/*.yml`** - All workflow files updated
3. **Build process** - Automatically uses detected version

## Benefits

✅ **No Version Mismatches** - Everything uses the same version  
✅ **Easy to Upgrade** - Just run sync script when changing versions  
✅ **Automatic Detection** - Spec file detects version at build time  
✅ **Consistent CI/CD** - Workflows always match your Python version  

## Current Status

- **Spec File**: ✅ Dynamically detects Python version
- **Workflows**: ✅ Use Python 3.13 (can be updated with sync script)
- **`.python-version`**: ✅ Set to 3.13
- **Sync Script**: ✅ Available at `scripts/sync_python_version.py`

## Example: Upgrading to Python 3.14

```bash
# 1. Sync version across project
python scripts/sync_python_version.py 3.14

# 2. Recreate venv with Python 3.14
Remove-Item -Recurse -Force .venv
py -3.14 -m venv .venv
.venv\Scripts\Activate.ps1

# 3. Reinstall dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# 4. Rebuild (will automatically use python314.dll)
python scripts/build_pyinstaller.py
```

## Files Modified

- `build/pyinstaller.spec` - Now dynamically detects Python version
- `scripts/sync_python_version.py` - New script to sync versions
- `.python-version` - Single source of truth
- `.github/workflows/*.yml` - Can be updated with sync script
