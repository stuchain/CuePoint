# Legacy Files Reference

This document lists all legacy files that have been moved or deprecated as part of the Phase 5 migration.

## Files Moved to Legacy

### `processor.py` (in `cuepoint/legacy/`)
**Original location**: `SRC/cuepoint/services/processor.py`  
**Status**: ❌ Deprecated  
**Replaced by**: 
- `ProcessorService` (via DI container) for processing
- `CLIProcessor` for CLI-specific concerns

**Migration**: See `README.md` in this directory.

### `gui/` (Directory) (in `cuepoint/legacy/gui/`)
**Original location**: `SRC/gui/`  
**Status**: ❌ Deprecated  
**Replaced by**: 
- `cuepoint.ui.main_window.MainWindow` for main window
- `cuepoint.ui.controllers.main_controller.GUIController` for controller
- `cuepoint.ui.widgets.*` for widgets

**Migration**: See `README.md` in this directory.

### `gui_controller.py` (in `cuepoint/legacy/`)
**Original location**: `SRC/gui_controller.py`  
**Status**: ❌ Deprecated  
**Replaced by**: 
- `cuepoint.ui.controllers.main_controller.GUIController`

**Migration**: See `README.md` in this directory.

## Test Files Updated

The following test files have been updated to use the new Phase 5 architecture:

1. ✅ `SRC/test_comprehensive.py` - Updated to test Phase 5 imports
2. ✅ `SRC/tests/integration/test_phase3_complete.py` - Updated to test Phase 5 imports

## External Scripts

All external scripts and validation scripts already use `ProcessorService`:
- ✅ `SRC/test_imports.py`
- ✅ `SRC/validate_step55.py`
- ✅ All performance test scripts
- ✅ All unit test files

## Migration Status

- ✅ CLI migrated to Phase 5 (`CLIProcessor`)
- ✅ GUI migrated to Phase 5 (`MainController` uses `ProcessorService`)
- ✅ All new code uses Phase 5 architecture
- ⚠️ Legacy files kept for backward compatibility
- ⚠️ Old GUI structure files still exist but are deprecated

## Next Steps

1. Remove `SRC/processor.py` if it's a duplicate
2. Update `SRC/gui/main_window.py` to use new structure (if not already done)
3. Remove legacy files after deprecation period

