# Update Installer Test Suite

Comprehensive test suite for the update installation system. These tests allow you to verify the update installer functionality without needing to repeatedly install/uninstall the application.

## Test Files

### 1. `test_update_installer_comprehensive.py`
**Core installer functionality tests**

- ✅ Path validation and error handling
- ✅ Windows-specific installation flow
- ✅ macOS-specific installation flow
- ✅ PowerShell launcher script integration
- ✅ Direct installer launch (fallback)
- ✅ App path detection (registry/fallback)
- ✅ Error handling (missing files, empty paths, exceptions)
- ✅ Complete integration flow

**Test Classes:**
- `TestUpdateInstallerPathValidation` - Path validation
- `TestUpdateInstallerWindows` - Windows installation
- `TestUpdateInstallerMacOS` - macOS installation
- `TestUpdateInstallerIntegration` - Integration tests
- `TestUpdateInstallerErrorHandling` - Error scenarios
- `TestUpdateInstallerPowerShellLauncher` - PowerShell launcher
- `TestUpdateInstallerAppPathDetection` - App path detection
- `TestUpdateInstallerCompleteFlow` - End-to-end flow

### 2. `test_update_installer_ui_integration.py`
**UI integration tests**

- ✅ Main window -> Install update flow
- ✅ Confirmation dialog handling
- ✅ User cancellation flows
- ✅ Error message display
- ✅ Download -> Install complete flow
- ✅ Platform support checks

**Test Class:**
- `TestUpdateInstallerUIIntegration` - All UI integration scenarios

### 3. `test_update_installer_scripts.py`
**Script file tests**

- ✅ PowerShell launcher script existence and content
- ✅ Batch launcher script existence and content
- ✅ PyInstaller spec inclusion
- ✅ Installer script (NSIS) modifications

**Test Classes:**
- `TestUpdateLauncherScripts` - Launcher script validation
- `TestInstallerScriptModifications` - NSIS script changes

## Running Tests

### Run All Tests
```bash
python ARCHIVE/tests/update_installer/tests/run_update_installer_tests.py
```

### Run Specific Test File
```bash
# Comprehensive tests
python -m unittest tests.test_update_installer_comprehensive -v

# UI integration tests
python -m unittest tests.test_update_installer_ui_integration -v

# Script tests
python -m unittest tests.test_update_installer_scripts -v
```

### Run Specific Test Class
```bash
python -m unittest tests.test_update_installer_comprehensive.TestUpdateInstallerPathValidation -v
```

### Run with pytest
```bash
pytest ARCHIVE/tests/update_installer/tests/test_update_installer_comprehensive.py -v
pytest ARCHIVE/tests/update_installer/tests/test_update_installer_ui_integration.py -v
pytest ARCHIVE/tests/update_installer/tests/test_update_installer_scripts.py -v
```

## Test Coverage

### ✅ Covered Scenarios

1. **Path Validation**
   - Nonexistent files
   - Empty paths
   - None paths
   - Path conversion (string -> Path)

2. **Windows Installation**
   - PowerShell launcher script execution
   - Direct installer launch (fallback)
   - Process exit detection
   - Empty path handling
   - Command construction

3. **macOS Installation**
   - DMG mounting
   - App installation flow

4. **Error Handling**
   - Popen exceptions
   - Process exit errors
   - Unsupported platforms
   - Missing files

5. **App Path Detection**
   - Windows registry lookup
   - Fallback to default location
   - Registry error handling

6. **UI Integration**
   - Confirmation dialogs
   - User cancellation
   - Error message display
   - Download -> Install flow

7. **Scripts**
   - PowerShell script validation
   - Batch script validation
   - NSIS script modifications

## Mocking Strategy

All tests use mocks to avoid:
- ❌ Actually launching installers
- ❌ Modifying system registry
- ❌ Creating real processes
- ❌ Requiring GUI interaction

**Key Mocks:**
- `subprocess.Popen` - Process launching
- `sys.exit` - Application exit
- `winreg` - Windows registry access
- `QMessageBox` - UI dialogs
- `DownloadProgressDialog` - Download UI

## Test Environment

Tests create temporary files in:
- `%TEMP%\CuePoint_Test_Updates\` (Windows)
- `/tmp/CuePoint_Test_Updates/` (macOS/Linux)

These are automatically cleaned up after tests.

## Platform-Specific Tests

Some tests are platform-specific:
- Windows tests: `@unittest.skipIf(platform.system() != 'Windows')`
- macOS tests: `@unittest.skipIf(platform.system() != 'Darwin')`

These will be skipped on other platforms.

## Expected Test Results

When all tests pass, you should see:
```
Tests run: ~50-60
Successes: ~50-60
Failures: 0
Errors: 0
Skipped: ~5-10 (platform-specific)
```

## Troubleshooting

### Tests Fail with "PySide6 not available"
- Install PySide6: `pip install PySide6`
- UI tests will be skipped if PySide6 is not available

### Tests Fail with Import Errors
- Ensure you're running from the project root
- Check that `SRC` directory is in Python path

### Windows Tests Fail
- Ensure you're on Windows (or skip Windows-specific tests)
- Check that PowerShell is available
- Verify registry access permissions

### macOS Tests Fail
- Ensure you're on macOS (or skip macOS-specific tests)
- Check that `hdiutil` is available

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- ✅ No external dependencies (except PySide6 for UI tests)
- ✅ No actual installation required
- ✅ Fast execution (< 10 seconds)
- ✅ Platform-aware (skips irrelevant tests)

## Adding New Tests

When adding new installer functionality:

1. **Add to appropriate test file:**
   - Core functionality → `test_update_installer_comprehensive.py`
   - UI changes → `test_update_installer_ui_integration.py`
   - Script changes → `test_update_installer_scripts.py`

2. **Follow naming convention:**
   - Test class: `TestFeatureName`
   - Test method: `test_specific_scenario`

3. **Use mocks:**
   - Mock external processes
   - Mock file system operations
   - Mock UI components

4. **Clean up:**
   - Use `setUp()` and `tearDown()` for cleanup
   - Remove temporary files

## Example Test Run

```bash
$ python ARCHIVE/tests/update_installer/tests/run_update_installer_tests.py

✓ Loaded comprehensive installer tests
✓ Loaded UI integration tests
✓ Loaded script tests

======================================================================
Running Update Installer Test Suite
======================================================================

test_install_with_nonexistent_file ... ok
test_install_with_empty_path ... ok
test_windows_install_with_powershell_launcher ... ok
test_windows_install_direct_fallback ... ok
...

----------------------------------------------------------------------
Ran 58 tests in 2.345s

OK

======================================================================
Test Summary
======================================================================
Tests run: 58
Successes: 58
Failures: 0
Errors: 0
Skipped: 5
======================================================================
```

## Next Steps

After running tests:
1. ✅ All tests pass → Ready for release
2. ❌ Tests fail → Fix issues, re-run tests
3. ⚠️  New functionality → Add tests, ensure coverage
