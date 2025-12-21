# SRC Folder Organization Plan

## ✅ Working Code Location

**Main Application**: `SRC/cuepoint/` - This is the organized package structure containing all working code.

**Entry Points** (Keep these in SRC root):
- ✅ `SRC/gui_app.py` - GUI entry point
- ✅ `SRC/main.py` - CLI entry point
- ✅ `SRC/__init__.py` - Package init

## ❌ Files to DELETE (Old Duplicates)

These files are **OLD DUPLICATES** - the actual code is now in `cuepoint/`:

### Old Module Files (Delete - code is in cuepoint/)
- ❌ `beatport.py` → `cuepoint/data/beatport.py` ✅
- ❌ `beatport_search.py` → `cuepoint/data/beatport_search.py` ✅
- ❌ `matcher.py` → `cuepoint/core/matcher.py` ✅
- ❌ `query_generator.py` → `cuepoint/core/query_generator.py` ✅
- ❌ `text_processing.py` → `cuepoint/core/text_processing.py` ✅
- ❌ `mix_parser.py` → `cuepoint/core/mix_parser.py` ✅
- ❌ `rekordbox.py` → `cuepoint/data/rekordbox.py` ✅
- ❌ `config.py` → `cuepoint/models/config.py` + `cuepoint/services/config_service.py` ✅
- ❌ `output_writer.py` → `cuepoint/services/output_writer.py` ✅
- ❌ `utils.py` → `cuepoint/utils/utils.py` ✅
- ❌ `performance.py` → `cuepoint/utils/performance.py` ✅
- ❌ `error_handling.py` → `cuepoint/utils/error_handler.py` ✅
- ❌ `gui_interface.py` → `cuepoint/ui/gui_interface.py` ✅

## 📁 Files to MOVE

### Development Scripts → `scripts/` or `ARCHIVE/`
- `fix_all_services.py`
- `fix_all_step52_files.py`
- `fix_config_service.py`
- `fix_di_container.py`
- `fix_matcher_service.py`
- `example_di_usage.py`

### Test Scripts → `tests/` or `ARCHIVE/`
- `test_comprehensive.py`
- `test_imports.py`
- `test_step_5_2.py`
- `test_step55_comprehensive.py`
- `test_export_dialog_import.py`
- `verify_step_5_2.py`
- `verify_export_dialog.py`
- `verify_all_step52_tests.py`
- `verify_step52_tests.py`

### Test Runner Scripts → `tests/` or `scripts/`
- `run_all_step52_tests.py`
- `run_step52_tests.py`
- `run_step52_tests_fixed.py`
- `run_step53_tests.py`
- `run_step54_tests.py`
- `run_step55_tests.py`
- `run_step56_tests.py`
- `run_step58_tests.py`
- `run_step510_benchmarks.py`
- `run_tests_with_output.py`

### Analysis Scripts → `scripts/` or `ARCHIVE/`
- `analyze_coverage_gaps.py`
- `validate_step55.py`

### Documentation → `DOCS/` (project root)
- `TEST_LEGACY_DEPENDENCY_ANALYSIS.md`
- `OLD_GUI_MIGRATION_COMPLETE.md`
- `MOVE_OLD_GUI_TO_LEGACY_PLAN.md`
- `GUI_USAGE_ANALYSIS.md`
- `LEGACY_USAGE_REPORT.md`
- `PHASE3_TEST_RESULTS.md`
- `TEST_SHORTCUTS_RESULTS.md`

### Wrong Location → Move to Project Root
- `DOCS/` folder inside `SRC/` → Should be at project root (already exists there)

## 🗑️ Files to DELETE (Generated/Cache)

These should be in `.gitignore` and can be deleted:

- `coverage.xml` - Generated
- `.coverage` - Generated
- `htmlcov/` - Generated
- `bp_cache.sqlite` - Cache file
- `collection.xml` - User data (shouldn't be in repo)
- `__pycache__/` - Python cache
- `.mypy_cache/` - MyPy cache
- `.pytest_cache/` - Pytest cache

### Output Files (Should be in `.gitignore`)
- `output/` - Generated output
- `cuepoint/output/` - More generated output
- `reports/` - Generated reports (or move to `DOCS/`)

## 📋 Recommended Structure After Cleanup

```
SRC/
├── __init__.py              # ✅ KEEP
├── gui_app.py               # ✅ KEEP (GUI entry point)
├── main.py                  # ✅ KEEP (CLI entry point)
├── cuepoint/                # ✅ KEEP (main application code)
│   ├── cli/
│   ├── core/
│   ├── data/
│   ├── models/
│   ├── services/
│   ├── ui/
│   ├── utils/
│   ├── exceptions/
│   └── legacy/
└── tests/                   # ✅ KEEP (test suite)
    ├── unit/
    ├── integration/
    ├── ui/
    └── performance/
```

## 🎯 Action Plan

1. **Delete old duplicate module files** (13 files)
2. **Move development scripts** to `scripts/` or `ARCHIVE/`
3. **Move test scripts** to `tests/` or `ARCHIVE/`
4. **Move documentation** to `DOCS/`
5. **Move `DOCS/` folder** from `SRC/` to project root (if it exists)
6. **Delete generated/cache files** (they'll be regenerated)
7. **Update `.gitignore`** to prevent these from being committed

