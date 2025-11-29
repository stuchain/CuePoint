# Legacy Code Usage Report

This report shows exactly where legacy code is being imported and used in the codebase.

## 🔍 Active Usage (Code That Actually Uses Legacy)

### 1. `SRC/gui_controller.py` ⚠️ **ACTIVE USAGE**
**Status**: ⚠️ **LEGACY FILE - Still in use by old GUI structure**

**Line 28**: 
```python
from cuepoint.legacy.processor import process_playlist
```

**Used in**: 
- `ProcessingWorker.run()` method (line 85) - calls `process_playlist()` from legacy

**Impact**: 
- This file is used by `SRC/gui/main_window.py` (old GUI structure)
- The old GUI structure (`SRC/gui/`) is separate from the new GUI (`SRC/cuepoint/ui/`)
- **This is the ONLY active production code using legacy processor**

**Migration Status**: 
- ⚠️ Needs migration to use `ProcessorService` instead
- Should use `cuepoint.ui.controllers.main_controller.GUIController` (new structure)

---

## 📝 Test Files (Testing Legacy for Compatibility)

### 2. `SRC/test_comprehensive.py`
**Line 87**: 
```python
from cuepoint.legacy.processor import run, process_playlist
```

**Purpose**: Testing that legacy imports still work (backward compatibility check)
**Status**: ✅ **OK** - This is intentional for compatibility testing

---

### 3. `SRC/tests/integration/test_phase3_complete.py`
**Line 73-76**: 
```python
# Test legacy processor (for backward compatibility)
try:
    from cuepoint.legacy.processor import process_playlist
    print("[OK] Legacy processor.py import successful (deprecated - kept for compatibility)")
```

**Purpose**: Testing that legacy imports still work
**Status**: ✅ **OK** - This is intentional for compatibility testing

---

## 📚 Documentation Files (Examples Only)

### 4. `SRC/cuepoint/legacy/README.md`
**Line 37**: Example code showing migration path
**Status**: ✅ **OK** - Documentation only

### 5. `SRC/cuepoint/legacy/MIGRATION_SUMMARY.md`
**Line 98**: Example command for verification
**Status**: ✅ **OK** - Documentation only

---

## 🎯 Summary

### Active Production Code Using Legacy:
1. **`SRC/gui_controller.py`** ⚠️ - Used by old GUI structure (`SRC/gui/main_window.py`)

### Test Files (Intentional):
2. `SRC/test_comprehensive.py` - Compatibility testing
3. `SRC/tests/integration/test_phase3_complete.py` - Compatibility testing

### Documentation:
4. `SRC/cuepoint/legacy/README.md` - Migration guide
5. `SRC/cuepoint/legacy/MIGRATION_SUMMARY.md` - Summary document

---

## 🔄 Migration Recommendations

### Priority 1: Migrate `gui_controller.py`
**File**: `SRC/gui_controller.py`

**Current**:
```python
from cuepoint.legacy.processor import process_playlist

# In ProcessingWorker.run():
results = process_playlist(
    xml_path=self.xml_path,
    playlist_name=self.playlist_name,
    settings=self.settings,
    progress_callback=progress_callback,
    controller=self.controller,
    auto_research=self.auto_research
)
```

**Should be**:
```python
from cuepoint.utils.di_container import get_container
from cuepoint.services.interfaces import IProcessorService

# In ProcessingWorker.run():
container = get_container()
processor_service = container.resolve(IProcessorService)
results = processor_service.process_playlist_from_xml(
    xml_path=self.xml_path,
    playlist_name=self.playlist_name,
    settings=self.settings,
    progress_callback=progress_callback,
    controller=self.controller,
    auto_research=self.auto_research
)
```

**Note**: However, `gui_controller.py` is part of the **old GUI structure** (`SRC/gui/`). 
The **new GUI structure** (`SRC/cuepoint/ui/`) already uses `MainController` which uses `ProcessorService`.

**Decision needed**: 
- Should we migrate `gui_controller.py` to use `ProcessorService`?
- Or should we deprecate the old GUI structure entirely?

---

## 📊 Current State

### New GUI Structure (Phase 5) ✅
- `SRC/cuepoint/ui/main_window.py` → Uses `MainController` → Uses `ProcessorService`
- **Status**: ✅ Fully migrated to Phase 5

### Old GUI Structure (Legacy) ⚠️
- `SRC/gui/main_window.py` → Uses `GUIController` from `gui_controller.py` → Uses `legacy.processor`
- **Status**: ⚠️ Still using legacy code

### CLI (Phase 5) ✅
- `SRC/main.py` → Uses `CLIProcessor` → Uses `ProcessorService`
- **Status**: ✅ Fully migrated to Phase 5

---

## ✅ Verification Commands

To check if legacy is still being used:
```bash
# Find all imports of legacy processor
grep -r "from cuepoint.legacy.processor" SRC/ --include="*.py"

# Find all files that mention legacy
grep -r "legacy" SRC/ --include="*.py" | grep -v "__pycache__" | grep -v ".pyc"
```

---

## 🎯 Conclusion

**Only 1 active production file uses legacy code:**
- `SRC/gui_controller.py` (used by old GUI structure)

**All other references are:**
- Test files (intentional compatibility testing)
- Documentation (examples)

**Recommendation:**
1. If old GUI structure (`SRC/gui/`) is still needed → Migrate `gui_controller.py` to use `ProcessorService`
2. If old GUI structure is deprecated → Mark it as deprecated and document that new GUI should be used

