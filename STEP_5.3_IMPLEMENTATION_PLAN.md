# Step 5.3 Implementation Plan

## Goal
Separate business logic from UI components by refactoring UI widgets to use controllers.

## Current Status

### ✅ Already Using Controllers
- `main_window.py` - Uses `GUIController` (from Step 5.2)

### ❌ Need Refactoring
- `results_view.py` - Has filtering logic, should use `ResultsController`
- `history_view.py` - Has filtering/export logic, should use `ResultsController` and `ExportController`
- `config_panel.py` - Should use `ConfigController`
- `export_dialog.py` - Should use `ExportController`

## Implementation Steps

### 1. Refactor `results_view.py`
- Add `ResultsController` as dependency
- Replace `_filter_results()` with `controller.apply_filters()`
- Replace `_year_in_range()` and `_bpm_in_range()` with controller methods
- Use `controller.get_summary_statistics()` for statistics
- Keep UI presentation logic (table population, display updates)

### 2. Refactor `history_view.py`
- Add `ResultsController` for filtering
- Add `ExportController` for export operations
- Replace filtering logic with controller calls
- Replace export logic with controller calls

### 3. Refactor `export_dialog.py`
- Add `ExportController` as dependency
- Use controller for validation and export logic

### 4. Refactor `config_panel.py`
- Add `ConfigController` as dependency
- Use controller for config operations

### 5. Testing
- Verify UI still works correctly
- Test filtering functionality
- Test export functionality
- Test config operations

## Files to Modify

1. `src/cuepoint/ui/widgets/results_view.py` - Use ResultsController
2. `src/cuepoint/ui/widgets/history_view.py` - Use ResultsController and ExportController
3. `src/cuepoint/ui/dialogs/export_dialog.py` - Use ExportController
4. `src/cuepoint/ui/widgets/config_panel.py` - Use ConfigController

## Files Already Complete

1. `src/cuepoint/ui/main_window.py` - Already uses GUIController ✅
2. `src/cuepoint/ui/controllers/results_controller.py` - Already implemented ✅
3. `src/cuepoint/ui/controllers/export_controller.py` - Already implemented ✅
4. `src/cuepoint/ui/controllers/config_controller.py` - Already implemented ✅

