# Release Readiness Test Plan

This document outlines the comprehensive test plan to ensure everything is ready for release.

## Overview

Before releasing, we need to verify:
1. ✅ Build configuration is correct (Python 3.13 DLL fix)
2. ✅ Application can be built successfully
3. ✅ Executable runs without DLL errors
4. ✅ Update system works correctly
5. ✅ Installation process works
6. ✅ Version information is correct
7. ✅ All critical paths are functional

## Test Suites

### 1. Configuration Tests

**File**: `tests/test_release_readiness_comprehensive.py`

**Tests**:
- ✅ PyInstaller spec file exists and is configured correctly
- ✅ Python DLL is included in binaries list
- ✅ Correct tuple format is used (2-tuple for Analysis, 3-tuple for append)
- ✅ Hook file exists and includes DLL
- ✅ Spec file includes hookspath
- ✅ PyInstaller version is >= 6.10.0
- ✅ Requirements files specify correct PyInstaller version
- ✅ GitHub Actions workflows upgrade and verify PyInstaller version

**Run**:
```bash
python tests/test_release_readiness_comprehensive.py
```

### 2. DLL Fix Tests

**File**: `tests/test_python_dll_inclusion.py`

**Tests**:
- ✅ Spec file includes DLL collection code
- ✅ Post-analysis DLL verification exists
- ✅ Pre-EXE DLL verification exists
- ✅ Python DLL exists in installation (Windows)
- ✅ Python3.dll exists if present (Windows)

**Run**:
```bash
python tests/test_python_dll_inclusion.py
```

### 3. Update System Tests

**File**: `tests/test_update_installer_comprehensive.py`

**Tests**:
- ✅ Update installer path validation
- ✅ Windows installation flow
- ✅ macOS installation flow
- ✅ Error handling
- ✅ App path detection
- ✅ Complete update flow

**Run**:
```bash
python tests/run_update_installer_tests.py
```

### 4. Build and Executable Tests

**File**: `scripts/test_build_and_executable.py`

**Tests**:
- ✅ PyInstaller version check
- ✅ Spec file configuration
- ✅ Build script exists
- ✅ Executable exists (if built)
- ✅ Executable format validation

**Run**:
```bash
python scripts/test_build_and_executable.py
```

### 5. Complete Test Suite

**File**: `tests/run_release_readiness_tests.py`

**Runs all test suites above**

**Run**:
```bash
python tests/run_release_readiness_tests.py
```

## Pre-Release Checklist

### Automated Tests

- [ ] Run comprehensive release readiness tests
  ```bash
  python tests/run_release_readiness_tests.py
  ```
  **Expected**: All tests pass

- [ ] Run DLL fix tests
  ```bash
  python tests/run_dll_fix_tests.py
  ```
  **Expected**: All tests pass

- [ ] Run update system tests
  ```bash
  python tests/run_update_installer_tests.py
  ```
  **Expected**: All tests pass

- [ ] Run build configuration tests
  ```bash
  python scripts/test_build_and_executable.py
  ```
  **Expected**: All tests pass

### Manual Build Test

- [ ] Build the application
  ```bash
  python scripts/build_pyinstaller.py
  ```
  **Expected**: Build completes without errors

- [ ] Verify executable exists
  - Windows: `dist/CuePoint.exe`
  - macOS: `dist/CuePoint.app`

- [ ] Check build logs for DLL inclusion messages
  - Look for: `[PyInstaller] Including Python DLL in binaries: python313.dll`
  - Look for: `[PyInstaller] Final check: python313.dll is in binaries list`
  - Look for: `[PyInstaller] Verified: python313.dll is in binaries list`

### Manual Executable Test

- [ ] Run the executable
  - Windows: Double-click `dist/CuePoint.exe`
  - macOS: Open `dist/CuePoint.app`
  
- [ ] Verify no DLL errors
  - **Critical**: Should NOT see "Failed to load Python DLL" error
  - App should launch successfully

- [ ] Verify app functionality
  - App opens without errors
  - UI displays correctly
  - Core features work

### Update Flow Test

- [ ] Test update detection
  - Open app
  - Go to Help > Check for Updates
  - Verify update check works

- [ ] Test update installation (if update available)
  - Download update
  - Install update
  - Verify app launches after update
  - **Critical**: Verify no DLL error after update

### Installation Test

- [ ] Build installer
  - Windows: Run NSIS installer build
  - macOS: Create DMG

- [ ] Test fresh installation
  - Install on clean system
  - Verify app launches
  - Verify no DLL errors

- [ ] Test update installation
  - Install older version
  - Install newer version
  - Verify app launches
  - Verify no DLL errors

## CI/CD Verification

### GitHub Actions

- [ ] Verify Windows workflow runs successfully
  - Check: `.github/workflows/build-windows.yml`
  - Verify: PyInstaller version check passes
  - Verify: Build completes
  - Verify: Executable is created

- [ ] Verify macOS workflow runs successfully
  - Check: `.github/workflows/build-macos.yml`
  - Verify: PyInstaller version check passes
  - Verify: Build completes
  - Verify: App bundle is created

## Critical Success Criteria

Before releasing, ALL of these must pass:

1. ✅ **PyInstaller >= 6.10.0** - Required for Python 3.13 support
2. ✅ **DLL included in spec** - Python DLL must be in binaries list
3. ✅ **Build succeeds** - Application builds without errors
4. ✅ **No DLL errors** - Executable runs without "Failed to load Python DLL" error
5. ✅ **Update works** - Update flow works correctly
6. ✅ **Installation works** - Fresh and update installations work
7. ✅ **Version correct** - Version information is embedded correctly

## Troubleshooting

### If DLL error occurs:

1. **Check PyInstaller version**
   ```bash
   pyinstaller --version
   ```
   Must be >= 6.10.0

2. **Check build logs**
   - Look for DLL inclusion messages
   - Verify DLL is in binaries list

3. **Check spec file**
   - Verify DLL is included in binaries list
   - Verify correct tuple format is used

4. **Rebuild**
   ```bash
   python scripts/build_pyinstaller.py
   ```

### If build fails:

1. **Check PyInstaller version**
   ```bash
   pip install --upgrade pyinstaller
   pyinstaller --version
   ```

2. **Check Python version**
   ```bash
   python --version
   ```
   Should be 3.13

3. **Check dependencies**
   ```bash
   pip install -r requirements-build.txt
   ```

## Quick Test Command

Run all automated tests:
```bash
python tests/run_release_readiness_tests.py && \
python tests/run_dll_fix_tests.py && \
python tests/run_update_installer_tests.py && \
python scripts/test_build_and_executable.py
```

If all pass, proceed with manual testing and release.

## Release Approval

Only proceed with release if:
- ✅ All automated tests pass
- ✅ Manual build test passes
- ✅ Manual executable test passes (no DLL errors)
- ✅ Update flow test passes
- ✅ Installation test passes
- ✅ CI/CD workflows pass
