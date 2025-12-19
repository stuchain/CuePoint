# Run Tests Before Building

## Quick Test Command

Before building the application, run this to verify everything works:

```bash
python tests/test_update_system_before_build.py
```

## What Gets Tested

1. **Context Menu Fix** - Verifies the TypeError bug is fixed
2. **Version Filtering** - Test versions can only update to test, stable to stable
3. **Download Flow** - Complete download flow from dialog to download dialog
4. **Startup Check** - Verifies startup check uses force=True
5. **Update Info Storage** - Verifies update_info is properly stored

## Expected Result

```
[PASS] ALL TESTS PASSED!
The update system is ready for building.
```

## If Tests Fail

**DO NOT BUILD** until all tests pass. Fix the issues first.

## After Tests Pass

1. Build the application locally
2. Test the built version
3. Verify update functionality works
4. Then proceed with release
