# MANY CHANGES (Possible Revert)

**Date:** 2025-01-XX  
**Purpose:** Pin all dependencies to exact versions (`==`) to ensure reproducible builds across local GUI, local builds, and GitHub Actions (macOS + Windows)

---

## Overview

This commit pins **all dependencies to exact versions** based on the current working `.venv` environment that was verified to "work perfectly" for track finding. The goal is to ensure that:

1. **Local GUI** (via `run_gui.command`) uses the same versions
2. **Local builds** (PyInstaller) use the same versions
3. **GitHub Actions builds** (macOS + Windows) use the same versions

All dependency specifications have been changed from `>=` (minimum version) to `==` (exact version) to prevent version drift and ensure reproducibility.

---

## Why This Change?

**Problem:** After many dependency version changes, the application stopped finding tracks. Even reinstalling older "working" versions didn't restore functionality, suggesting that:
- Dependency version mismatches between local and CI builds
- Transitive dependency resolution differences
- Python version differences (3.11 vs 3.13)

**Solution:** Pin everything to the exact versions that are currently working in the local `.venv`, ensuring all build paths (local GUI, local build, GitHub Actions) resolve to identical dependency trees.

---

## Files Changed

### 1. `requirements.txt`
**Change Type:** Converted all `>=` to `==` pins

**Before:**
```txt
PySide6>=6.5.0
requests>=2.32.4
aiohttp>=3.13.0
beautifulsoup4>=4.12.0
ddgs>=9.0.0
rapidfuzz>=3.0.0
python-dateutil>=2.8.0
pyyaml>=6.0
tqdm>=4.66.3
requests-cache>=1.1.0
playwright>=1.40.0
selenium>=4.15.0
openpyxl>=3.1.0
pytest>=7.0.0
pytest-qt>=4.0.0
pytest-cov>=4.0.0
pytest-mock>=3.10.0
pytest-asyncio>=0.21.0
pytest-timeout>=2.1.0
coverage>=7.0.0
pytest-xdist>=3.0.0
```

**After:**
```txt
PySide6==6.10.1
requests==2.32.5
aiohttp==3.13.2
beautifulsoup4==4.14.3
ddgs==9.0.0
rapidfuzz==3.14.3
python-dateutil==2.9.0.post0
pyyaml==6.0.3
tqdm==4.67.1
requests-cache==1.2.1
playwright==1.57.0
selenium==4.39.0
openpyxl==3.1.5
pytest==9.0.2
pytest-qt==4.5.0
pytest-cov==7.0.0
pytest-mock==3.15.1
pytest-asyncio==1.3.0
pytest-timeout==2.4.0
coverage==7.13.1
pytest-xdist==3.8.0
```

**Impact:**
- All runtime and test dependencies are now pinned to exact versions
- Future `pip install -r requirements.txt` will install these exact versions
- No automatic upgrades to newer versions

---

### 2. `requirements-dev.txt`
**Change Type:** Converted all `>=` to `==` pins, added missing dev tools

**Before:**
```txt
# (Various >= pins for dev tools)
```

**After:**
```txt
pytest==9.0.2
pytest-qt==4.5.0
pytest-cov==7.0.0
pytest-mock==3.15.1
pytest-asyncio==1.3.0
pytest-timeout==2.4.0
pytest-xdist==3.8.0
pytest-benchmark==5.2.3
coverage==7.13.1
black==25.12.0
pylint==4.0.4
mypy==1.19.1
isort==7.0.0
flake8==7.3.0
pre-commit==4.5.1
radon==6.0.1
pyinstaller==6.17.0
```

**Impact:**
- All development and testing tools are pinned
- Build tool (PyInstaller) is now explicitly pinned in dev requirements

---

### 3. `requirements-build.txt`
**Change Type:** Converted all `>=` to `==` pins, added PyInstaller

**Before:**
```txt
PySide6>=6.5.0
requests>=2.32.4
# ... (other >= pins)
# (PyInstaller was NOT in this file)
```

**After:**
```txt
PySide6==6.10.1
requests==2.32.5
aiohttp==3.13.2
beautifulsoup4==4.14.3
ddgs==9.0.0
rapidfuzz==3.14.3
python-dateutil==2.9.0.post0
pyyaml==6.0.3
tqdm==4.67.1
requests-cache==1.2.1
playwright==1.57.0
selenium==4.39.0
openpyxl==3.1.5
pyinstaller==6.17.0  # ← NEW: Added PyInstaller with exact version
```

**Impact:**
- All runtime dependencies for builds are pinned
- **PyInstaller is now explicitly pinned** (was previously upgraded separately in workflows)
- This ensures reproducible builds across all environments

---

### 4. `.github/workflows/build.yml`
**Change Type:** Created/updated to use pinned Python version and requirements

**Key Changes:**
- Python version: `"3.13.7"` (exact patch version)
- Installs: `requirements-build.txt` + `requirements-dev.txt` (both pinned)
- No separate PyInstaller upgrade (it's in requirements-build.txt)

**Impact:**
- New unified build workflow that uses exact versions
- Runs on both macOS and Windows

---

### 5. `.github/workflows/build-macos.yml`
**Change Type:** Updated to use pinned Python version and remove PyInstaller upgrade

**Before:**
```yaml
python-version: '3.13'  # No patch version
# ...
pip install -r requirements-build.txt
pip install --upgrade pyinstaller  # ← Would override pinned version
# (Complex version checking logic)
```

**After:**
```yaml
python-version: '3.13.7'  # Exact patch version
# ...
pip install -r requirements-build.txt  # PyInstaller is now in this file
# (Removed upgrade and version checking - not needed with pins)
```

**Impact:**
- Python version is pinned to exact patch (3.13.7)
- PyInstaller upgrade removed (now pinned in requirements-build.txt)
- Simpler, more reliable build process

---

### 6. `.github/workflows/build-windows.yml`
**Change Type:** Updated to use pinned Python version and remove PyInstaller upgrade

**Before:**
```yaml
python-version: '3.13'  # No patch version
# ...
pip install -r requirements-build.txt
pip install --upgrade pyinstaller  # ← Would override pinned version
# (Complex PowerShell version checking logic)
```

**After:**
```yaml
python-version: '3.13.7'  # Exact patch version
# ...
pip install -r requirements-build.txt  # PyInstaller is now in this file
# (Removed upgrade and version checking - not needed with pins)
```

**Impact:**
- Python version is pinned to exact patch (3.13.7)
- PyInstaller upgrade removed (now pinned in requirements-build.txt)
- Simpler, more reliable build process

---

### 7. `scripts/compare_build_environments.py`
**Change Type:** Updated Python version references in comments

**Before:**
```python
#   - GitHub Actions: 3.11
#   - Local (from your build): 3.13
```

**After:**
```python
#   - GitHub Actions: 3.13.7
#   - Local (from your build): 3.13.7
```

**Impact:**
- Documentation updated to reflect new pinned Python version

---

## Summary of Version Pins

### Runtime Dependencies (from working `.venv`)
- **PySide6:** `6.10.1` (was `>=6.5.0`)
- **ddgs:** `9.0.0` (was `>=9.0.0`) - **Critical:** This is the version that works
- **playwright:** `1.57.0` (was `>=1.40.0`)
- **rapidfuzz:** `3.14.3` (was `>=3.0.0`)
- **beautifulsoup4:** `4.14.3` (was `>=4.12.0`)
- **requests:** `2.32.5` (was `>=2.32.4`)
- **aiohttp:** `3.13.2` (was `>=3.13.0`)
- **selenium:** `4.39.0` (was `>=4.15.0`)
- **openpyxl:** `3.1.5` (was `>=3.1.0`)
- **tqdm:** `4.67.1` (was `>=4.66.3`)
- **requests-cache:** `1.2.1` (was `>=1.1.0`)
- **python-dateutil:** `2.9.0.post0` (was `>=2.8.0`)
- **pyyaml:** `6.0.3` (was `>=6.0`)

### Build Tools
- **pyinstaller:** `6.17.0` (was not pinned, upgraded separately in workflows)

### Testing Dependencies
- **pytest:** `9.0.2` (was `>=7.0.0`)
- **pytest-qt:** `4.5.0` (was `>=4.0.0`)
- **pytest-cov:** `7.0.0` (was `>=4.0.0`)
- **coverage:** `7.13.1` (was `>=7.0.0`)
- **pytest-xdist:** `3.8.0` (was `>=3.0.0`)

### Development Tools
- **black:** `25.12.0`
- **pylint:** `4.0.4`
- **mypy:** `1.19.1`
- **isort:** `7.0.0`
- **flake8:** `7.3.0`
- **pre-commit:** `4.5.1`
- **radon:** `6.0.1`

### Python Version
- **All build workflows:** `3.13.7` (exact patch version)

---

## Risks and Considerations

### ⚠️ Potential Issues

1. **Security Updates:** Pinned versions won't automatically receive security patches. You'll need to manually update when vulnerabilities are discovered.

2. **Bug Fixes:** Newer versions with bug fixes won't be automatically installed. You'll need to test and update manually.

3. **Breaking Changes:** If a dependency releases a breaking change, you won't be affected, but you also won't get new features.

4. **Transitive Dependencies:** While direct dependencies are pinned, transitive dependencies (dependencies of dependencies) may still vary. For complete reproducibility, consider using `pip freeze > requirements-lock.txt` for a full snapshot.

5. **New Contributors:** New contributors will need to install exact versions, which may conflict with their existing environments.

### ✅ Benefits

1. **Reproducibility:** All builds (local GUI, local build, GitHub Actions) will use identical dependency versions.

2. **Stability:** No unexpected version upgrades that could break functionality.

3. **Debugging:** Easier to debug issues when everyone uses the same versions.

4. **CI/CD Consistency:** GitHub Actions builds will match local builds exactly.

---

## How to Revert

If these changes cause issues, you can revert by:

### Option 1: Revert All Files
```bash
git checkout HEAD~1 -- requirements.txt requirements-dev.txt requirements-build.txt .github/workflows/build.yml .github/workflows/build-macos.yml .github/workflows/build-windows.yml scripts/compare_build_environments.py
```

### Option 2: Convert Back to `>=` Pins
Manually edit each requirements file and change `==` back to `>=`, using the minimum versions from the "Before" sections above.

### Option 3: Partial Revert
If only some dependencies need to be flexible:
1. Keep critical pins (e.g., `ddgs==9.0.0` if that's what works)
2. Convert less critical dependencies back to `>=` (e.g., `pytest>=7.0.0`)

---

## Testing Recommendations

Before committing, verify:

1. **Local GUI still works:**
   ```bash
   bash run_gui.command
   # Test track finding functionality
   ```

2. **Local build still works:**
   ```bash
   source .venv/bin/activate
   pip install -r requirements-build.txt
   python -m PyInstaller build/pyinstaller.spec --noconfirm
   ```

3. **GitHub Actions builds:**
   - Push to a test branch and verify workflows complete successfully
   - Check that built artifacts work on clean systems

4. **Dependency resolution:**
   ```bash
   # In a fresh venv, verify all dependencies resolve
   python -m venv test_venv
   source test_venv/bin/activate
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   # Should complete without conflicts
   ```

---

## Next Steps

1. **Commit these changes** with a clear message about pinning dependencies
2. **Test locally** to ensure everything still works
3. **Monitor GitHub Actions** to ensure builds succeed
4. **Consider creating `requirements-lock.txt`** using `pip freeze` for complete reproducibility (optional)

---

## Related Changes (Already Committed)

- **`SRC/cuepoint/data/beatport.py`**: Fixed `UnboundLocalError` by removing local import shadowing `beatport_search_browser()`. This fix ensures DDG-empty queries fall back to direct/browser search instead of crashing.

---

**Note:** This is a significant change that affects all dependency resolution. Test thoroughly before merging to main.

