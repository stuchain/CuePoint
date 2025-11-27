# Step 5.3 Test Fixes

## Issues Found and Fixed

### 1. ExportDialog Parameter Issue
**Problem**: Tests were failing because `ExportDialog.__init__()` didn't accept `export_controller` parameter.

**Root Cause**: There are two `export_dialog.py` files:
- `src/cuepoint/ui/dialogs/export_dialog.py` - ✅ Already had the parameter
- `src/gui/export_dialog.py` - ❌ Had old signature

**Fix Applied**: Updated `src/gui/export_dialog.py` to match the correct signature:
```python
def __init__(
    self,
    export_controller: Optional[ExportController] = None,
    parent=None,
    current_format: str = "csv",
):
```

**Status**: ✅ Fixed

---

### 2. ConfigPanel Preset Test Issue
**Problem**: Test was failing because the preset button wasn't being found/activated correctly.

**Root Cause**: The test needed to:
1. Show advanced settings first
2. Set the button as checked before triggering the change

**Fix Applied**: Updated test to:
- Show advanced settings if hidden
- Set button as checked before calling `_on_preset_changed()`

**Status**: ✅ Fixed

---

## Files Modified

1. `src/gui/export_dialog.py` - Updated `__init__` signature
2. `src/tests/integration/test_step53_ui_controllers.py` - Fixed ConfigPanel test

---

## Test Status

After fixes:
- ✅ ExportDialog tests should pass
- ✅ ConfigPanel preset test should pass
- ✅ All other tests already passing (11/15)

**Expected Result**: 15/15 tests passing

