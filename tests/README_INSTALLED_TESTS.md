# Installed Version Tests

This directory contains tests specifically designed to verify that the **built/installed version** of CuePoint works correctly. These tests are meant to be run **after** building the executable with PyInstaller, so you can catch issues before distribution.

## Why These Tests?

Instead of repeatedly:
1. Building the executable
2. Installing it
3. Manually testing
4. Finding issues
5. Fixing
6. Rebuilding and reinstalling...

You can now:
1. Build once
2. Run these tests
3. Fix any issues
4. Rebuild and test again (much faster!)

## Quick Start

### 1. Build the Executable

First, build the executable using PyInstaller:

```bash
# Windows
python scripts\build_pyinstaller.py

# macOS/Linux
python scripts/build_pyinstaller.py
```

This will create the executable in the `dist/` directory.

### 2. Run the Tests

```bash
# Run all installed version tests
pytest tests/test_installed_version.py -v

# Or use the helper script
python tests/run_installed_tests.py

# Run specific test
pytest tests/test_installed_version.py::TestInstalledVersion::test_executable_exists -v

# Run only fast tests (skip slow ones)
pytest tests/test_installed_version.py -v -m "not slow"
```

## What These Tests Cover

### Basic Executable Tests
- ✅ Executable exists and is accessible
- ✅ Executable can launch without crashing
- ✅ Version information is accessible
- ✅ Executable size is reasonable

### Dependency Tests
- ✅ Critical modules can be imported
- ✅ All required dependencies are bundled
- ✅ No missing import errors

### Functionality Tests
- ✅ AppPaths initialization works
- ✅ Services can bootstrap
- ✅ File operations work
- ✅ Qt can initialize
- ✅ Logging works

### Integration Tests
- ✅ Full app lifecycle
- ✅ Config file loading
- ✅ User data directory creation

## Test Markers

Tests are marked with pytest markers for easy filtering:

- `@pytest.mark.slow` - Tests that take longer to run
- `@pytest.mark.integration` - Integration tests

Run only fast tests:
```bash
pytest tests/test_installed_version.py -v -m "not slow"
```

## Troubleshooting

### "Executable not found"
- Make sure you've built the executable first: `python scripts/build_pyinstaller.py`
- Check that `dist/` directory exists and contains the executable

### "Executable did not respond within 30 seconds"
- The executable might be taking longer to start (first run can be slow)
- Try running the test with a longer timeout
- Check if antivirus is scanning the executable

### "Critical dependency appears to be missing"
- Check the PyInstaller spec file (`build/pyinstaller.spec`)
- Make sure all required modules are in `hiddenimports`
- Rebuild the executable

### Tests pass but app still doesn't work
- These tests verify basic functionality, but may not catch all issues
- Try running the app manually to see what's wrong
- Check the logs in the user data directory

## Adding New Tests

To add a new test for the installed version:

1. Add a test method to `TestInstalledVersion` or `TestInstalledVersionIntegration`
2. Use the `executable_path` fixture to get the path to the built executable
3. Use `subprocess.run()` to execute the executable with various flags
4. Assert on the results

Example:
```python
def test_my_feature(self, executable_path):
    """Test that my feature works in installed version."""
    result = subprocess.run(
        [str(executable_path), "--some-flag"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, "Feature failed"
```

## Continuous Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Build executable
  run: python scripts/build_pyinstaller.py

- name: Test installed version
  run: pytest tests/test_installed_version.py -v
```

## Notes

- These tests don't require a GUI display (they use command-line flags)
- Tests are designed to be fast (most complete in < 30 seconds)
- Some tests may be skipped if the executable isn't found (use `pytest -v` to see why)
- Tests verify the executable works, but don't test GUI functionality (that requires manual testing or UI automation)
