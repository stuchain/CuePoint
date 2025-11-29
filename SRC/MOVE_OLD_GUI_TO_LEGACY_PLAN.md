# Plan: Move Old GUI to Legacy Folder

## ✅ Recommendation: YES, Move to Legacy

**Why it's a good idea:**
1. ✅ **Not used in production** - `gui_app.py` uses new GUI (`cuepoint/ui/`)
2. ✅ **Clear organization** - Separates active code from deprecated code
3. ✅ **Keeps for reference** - Maintains historical record
4. ✅ **Consistent with other legacy code** - Matches pattern used for `processor.py`
5. ✅ **Reduces confusion** - Makes it clear what's active vs deprecated

## 📋 What to Move

### Files to Move:
1. **`SRC/gui/`** (entire directory) → `SRC/cuepoint/legacy/gui/`
2. **`SRC/gui_controller.py`** → `SRC/cuepoint/legacy/gui_controller.py`

### Files in `SRC/gui/`:
- `__init__.py`
- `batch_processor.py`
- `candidate_dialog.py`
- `config_panel.py`
- `dialogs.py`
- `export_dialog.py`
- `file_selector.py`
- `history_view.py`
- `main_window.py`
- `performance_view.py`
- `playlist_selector.py`
- `progress_widget.py`
- `results_view.py`
- `shortcut_customization_dialog.py`
- `shortcut_manager.py`
- `status_bar.py`
- `styles.py`

## ⚠️ Potential Issues to Fix

### 1. Test Files
**Files that import from old GUI:**
- `SRC/tests/ui/test_shortcuts_integration.py` (lines 127, 138)
  - Imports: `from gui.dialogs import KeyboardShortcutsDialog`
  - Imports: `from gui.shortcut_customization_dialog import ShortcutCustomizationDialog`
  - **Action**: Update to use new GUI or mark test as legacy

### 2. Fallback Import
**File**: `SRC/cuepoint/ui/widgets/dialogs.py` (line 505)
- Has fallback: `from gui.shortcut_customization_dialog import ShortcutCustomizationDialog`
- **Action**: Remove fallback or update to use new GUI

### 3. Internal Imports
**Files in `gui/` directory:**
- All files use `from gui.xxx import ...` internally
- **Action**: After moving, these will need to be updated to `from cuepoint.legacy.gui.xxx import ...`
  - OR: Keep relative imports if they stay in same directory structure

## 🔧 Migration Steps

### Step 1: Create Legacy GUI Directory
```bash
mkdir -p SRC/cuepoint/legacy/gui
```

### Step 2: Move Files
```bash
# Move entire gui directory
mv SRC/gui/* SRC/cuepoint/legacy/gui/

# Move gui_controller
mv SRC/gui_controller.py SRC/cuepoint/legacy/gui_controller.py
```

### Step 3: Update Internal Imports in Legacy GUI
All files in `gui/` that use `from gui.xxx` need to be updated to:
- Option A: Keep relative imports (if structure preserved)
- Option B: Update to `from cuepoint.legacy.gui.xxx import ...`

### Step 4: Update Test Files
- Update `test_shortcuts_integration.py` to use new GUI or mark as legacy test
- Remove fallback import from `dialogs.py`

### Step 5: Update Documentation
- Add entry to `SRC/cuepoint/legacy/README.md`
- Update `LEGACY_FILES.md`

### Step 6: Add Deprecation Notice
Add to each file in legacy GUI:
```python
"""
LEGACY MODULE - DEPRECATED

This module has been moved to the legacy folder as part of Phase 5 migration.
It is kept for backward compatibility and reference only.

⚠️  DO NOT USE IN NEW CODE ⚠️

Use the new Phase 5 GUI structure instead:
- cuepoint.ui.main_window.MainWindow
- cuepoint.ui.controllers.main_controller.GUIController
- cuepoint.ui.widgets.* (for widgets)

This legacy module will be removed in a future version.
"""
```

## 🎯 Alternative: Keep for Now

If you want to be more cautious:

**Option B: Keep in place but mark clearly**
- Add deprecation notices to all files
- Update documentation
- Move later after confirming no dependencies

## ✅ Recommendation

**Proceed with moving to legacy** because:
1. It's not used in production
2. Only test files reference it (easy to update)
3. Consistent with other legacy code
4. Better code organization

**Estimated effort**: 30-60 minutes
**Risk**: Low (only affects tests, not production)

