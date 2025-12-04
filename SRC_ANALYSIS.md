# SRC Folder Analysis

## ✅ Working Code Location

**Main Application Code**: `SRC/cuepoint/` - This is the organized package structure containing all working code.

**Entry Points**:
- `SRC/gui_app.py` - GUI entry point (imports `cuepoint.ui.main_window`)
- `SRC/main.py` - CLI entry point (imports `cuepoint.cli.cli_processor`)

## ❌ Unnecessary/Duplicate Files in SRC Root

These files are **OLD DUPLICATES** - the actual code is now in `cuepoint/`:

### Old Module Files (Now in cuepoint/)
- `beatport.py` → `cuepoint/data/beatport.py`
- `beatport_search.py` → `cuepoint/data/beatport_search.py`
- `matcher.py` → `cuepoint/core/matcher.py`
- `query_generator.py` → `cuepoint/core/query_generator.py`
- `text_processing.py` → `cuepoint/core/text_processing.py`
- `mix_parser.py` → `cuepoint/core/mix_parser.py`
- `rekordbox.py` → `cuepoint/data/rekordbox.py`
- `config.py` → `cuepoint/models/config.py` or `cuepoint/services/config_service.py`
- `output_writer.py` → `cuepoint/services/output_writer.py`
- `utils.py` → `cuepoint/utils/utils.py`
- `performance.py` → `cuepoint/utils/performance.py`
- `error_handling.py` → `cuepoint/utils/error_handler.py`
- `gui_interface.py` → `cuepoint/ui/gui_interface.py`

## 📁 Files to Organize

### Development/Fix Scripts (Move to `scripts/` or `ARCHIVE/`)
- `fix_all_services.py`
- `fix_all_step52_files.py`
- `fix_config_service.py`
- `fix_di_container.py`
- `fix_matcher_service.py`
- `example_di_usage.py`

### Test Scripts (Move to `tests/` or organize)
- `test_comprehensive.py`
- `test_imports.py`
- `test_step_5_2.py`
- `test_step55_comprehensive.py`
- `test_export_dialog_import.py`
- `verify_step_5_2.py`
- `verify_export_dialog.py`
- `verify_all_step52_tests.py`
- `verify_step52_tests.py`

### Test Runner Scripts (Move to `tests/` or `scripts/`)
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

### Analysis/Validation Scripts (Move to `scripts/` or `ARCHIVE/`)
- `analyze_coverage_gaps.py`
- `validate_step55.py`

### Documentation Files (Move to `DOCS/`)
- `TEST_LEGACY_DEPENDENCY_ANALYSIS.md`
- `OLD_GUI_MIGRATION_COMPLETE.md`
- `MOVE_OLD_GUI_TO_LEGACY_PLAN.md`
- `GUI_USAGE_ANALYSIS.md`
- `LEGACY_USAGE_REPORT.md`
- `PHASE3_TEST_RESULTS.md`
- `TEST_SHORTCUTS_RESULTS.md`

### Generated/Cache Files (Should be in `.gitignore`)
- `coverage.xml` - Generated coverage report
- `.coverage` - Coverage database
- `htmlcov/` - HTML coverage reports
- `bp_cache.sqlite` - Cache file
- `collection.xml` - User data (should not be in repo)
- `__pycache__/` - Python cache (should be in `.gitignore`)
- `.mypy_cache/` - MyPy cache (should be in `.gitignore`)
- `.pytest_cache/` - Pytest cache (should be in `.gitignore`)

### Output Files (Should be in `.gitignore`)
- `output/` - Generated output files
- `cuepoint/output/` - More output files
- `reports/` - Generated reports

### Wrong Location
- `DOCS/` folder inside `SRC/` - Should be at project root level

## 📋 Recommended Actions

1. **Delete old duplicate module files** from SRC root (they're in `cuepoint/` now)
2. **Move development scripts** to `scripts/` or `ARCHIVE/`
3. **Move test scripts** to `tests/` or organize them
4. **Move documentation** to `DOCS/`
5. **Move `DOCS/` folder** from `SRC/` to project root
6. **Ensure `.gitignore`** covers cache/generated files

