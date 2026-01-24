# Directory Cleanup Plan

## ✅ NEW APPROACH: Organize Instead of Delete

**Use `organize_old_files.bat` (Windows) or `organize_old_files.sh` (macOS/Linux)** to move old files into organized folders for review.

This is safer - you can review files before deleting them!

## Archive Folder Structure

After running the organization script, files will be organized into:

```
ARCHIVE/
├── old_status_reports/      - Old Phase 5 and Step 5.X status reports
├── old_how_to_guides/       - Old how-to guides and troubleshooting docs
├── development_tools/       - Development scripts and BAT files
└── temporary_files/         - Temporary test files and generated reports
```

## Files to KEEP (Essential)

### Core Application Files
- `README.md` - Main documentation
- `requirements.txt`, `requirements-dev.txt`, `requirements_optional.txt` - Dependencies
- `config.yaml.template` - Configuration template
- `pyproject.toml`, `pytest.ini`, `mypy.ini` - Project configuration
- `Makefile` - Build automation

### Launch Scripts (All Platforms)
- `run_gui.bat` - Windows GUI launcher
- `run_gui.sh` - Linux/macOS GUI launcher
- `run_gui.command` - macOS double-click launcher
- `install_requirements.sh` - macOS/Linux requirements installer

### Recent Documentation
- `install-macos.md` - macOS installation guide
- `FIX_PYSIDE6_MACOS.md` - PySide6 troubleshooting

### Directories
- `SRC/` - Source code (KEEP)
- `DOCS/` - Documentation (KEEP)
- `config/` - Configuration files (KEEP)
- `output/` - Output files (KEEP)
- `LEGACY/` - Legacy code (KEEP for reference)

---

## Files to REMOVE (Old Status Reports)

### Phase 5 Status Reports (Old)
- `PHASE_5_COMPLETE.md`
- `PHASE_5_INTEGRATION_STATUS.md`
- `PHASE_5_STEPS_5.1_TO_5.7_COMPLETE_STATUS.md`
- `PHASE_5_STEPS_5.1_TO_5.7_COMPLETION_REVIEW.md`
- `PHASE_5_STEPS_5.1_TO_5.7_FINAL_STATUS.md`
- `PHASE_5_STEPS_5.1_TO_5.7_STATUS.md`
- `PHASE_5_STEPS_5.1_TO_5.9_COMPLETE_STATUS.md`

### Step 5.X Status Reports (Old)
- `STEP_5_6_IMPLEMENTATION_SUMMARY.md`
- `STEP_5_7_COMPLETE_VERIFICATION.md`
- `STEP_5_7_FULL_VERIFICATION.md`
- `STEP_5_7_IMPLEMENTATION_SUMMARY.md`
- `STEP_5_7_VERIFICATION.md`
- `STEP_5.10_COMPLETION_SUMMARY.md`
- `STEP_5.2_ALL_TESTS_SUMMARY.md`
- `STEP_5.2_COMPLETE_VERIFICATION.md`
- `STEP_5.2_COMPLETION_SUMMARY.md`
- `STEP_5.2_FINAL_COMPLETION.md`
- `STEP_5.2_FINAL_STATUS.md`
- `STEP_5.2_TEST_SUMMARY.md`
- `STEP_5.2_TEST_VERIFICATION.md`
- `STEP_5.2_TESTS_READY.md`
- `STEP_5.3_COMPLETION_SUMMARY.md`
- `STEP_5.3_FINAL_STATUS.md`
- `STEP_5.3_FINAL_TEST_RESULTS.md`
- `STEP_5.3_IMPLEMENTATION_PLAN.md`
- `STEP_5.3_PROGRESS.md`
- `STEP_5.3_TEST_FIXES.md`
- `STEP_5.3_TEST_SUMMARY.md`
- `STEP_5.4_ALL_TEST_FIXES.md`
- `STEP_5.4_COMPLETION_SUMMARY.md`
- `STEP_5.4_TEST_FIXES.md`
- `STEP_5.5_COMPLETION_SUMMARY.md`
- `STEP_5.5_FINAL_TEST_REPORT.md`
- `STEP_5.5_MYPY_FIX_SUMMARY.md`
- `STEP_5.5_TEST_FIXES.md`
- `STEP_5.5_TEST_SUMMARY.md`
- `STEP_5.5_TYPE_ERROR_FIXES.md`
- `STEP_5.6_ALL_TESTS_COMPLETE.md`
- `STEP_5.6_ALL_TESTS_PASSING.md`
- `STEP_5.6_COMPLETION_SUMMARY.md`
- `STEP_5.6_FINAL_STATUS.md`
- `STEP_5.6_TEST_FIXES.md`
- `STEP_5.6_TEST_SUMMARY.md`
- `STEP_5.7_FINAL_COMPLETION.md`
- `STEP_5.8_CHANGE_NOTIFICATIONS_ADDED.md`
- `STEP_5.8_COMPLETION_SUMMARY.md`
- `STEP_5.9_COMPLETION_SUMMARY.md`
- `STEP_5.9_FINAL_STATUS.md`
- `STEP_5.9_MIGRATION_STATUS.md`
- `STEP_5.9_PHASE_1_COMPLETION.md`
- `STEP_5.9_PHASE_2_COMPLETION.md`
- `STEP_5.9_PHASE_3_COMPLETION.md`
- `STEP_5.9_PHASE_3_FINAL_TEST_RESULTS.md`
- `STEP_5.9_PHASE_4_COMPLETE.md`
- `STEP_5.9_PHASE_4_PROCESSOR_MIGRATION.md`
- `STEP_5.9_PHASE_4_PROGRESS.md`
- `STEP_5.9_SUBSTEPS_STATUS.md`

### Migration Status Reports (Old)
- `MIGRATION_100_PERCENT_COMPLETE.md`
- `MIGRATION_FINAL_CHECK.md`

### Old How-To Guides (Likely Outdated)
- `HOW_TO_INCREASE_COVERAGE.md`
- `HOW_TO_RUN_QUALITY_CHECKS.md`
- `how-to-see-shortcuts.md` (might be useful - check first)
- `HOW_TO_TEST_STEP_5.8.md`
- `AUTO_FIX_FLAKE8.md`
- `TROUBLESHOOT_COMMIT_ISSUES.md`
- `COVERAGE_IMPROVEMENT_PLAN.md`
- `QUALITY_CHECKS_SIMPLE.md`
- `WINDOWS_QUALITY_CHECKS.md`
- `NEXT_STEPS_OPTIONS.md`

---

## Files to EVALUATE (Development Tools)

### BAT Files (Windows Development Tools)
You might want to keep these if you use them:
- `auto_fix_flake8.bat` - Auto-fix Flake8 errors
- `check_format.bat` - Check code formatting
- `format_code.bat` - Format code
- `fix_all_formatting.bat` - Fix all formatting
- `quality_check.bat` - Run quality checks
- `run_linters.bat` - Run linters
- `type_check.bat` - Type checking
- `quick_commit.bat` - Quick git commit
- `run_test_results.bat` - Show test results

**Recommendation**: Keep `run_gui.bat` (essential), remove the rest if you don't use them regularly.

### Python Scripts (Development Tools)
- `fix_all_flake8_errors.py` - Fix Flake8 errors
- `fix_processor.py` - Processor fix script
- `test_processor_logging_integration.py` - Test script
- `test_restructure_verification.py` - Test script
- `test_step_5_6.py` - Test script
- `write_interfaces.py` - Interface generator

**Recommendation**: Remove if not actively used.

### Temporary/Test Files
- `test.csv` - Test file
- `quality_check_results.txt` - Temporary results
- `coverage.xml` - Generated coverage file
- `bp_cache.sqlite` - Cache file (can regenerate)
- `main.py` - Check if this is still used (might be old entry point)

---

## Summary

**Total files to remove**: ~70+ files
- Old status reports: ~50 files
- Old how-to guides: ~10 files
- Development tools: ~10 files (if not used)
- Temporary files: ~5 files

**Files to keep**: Essential application files, launch scripts, recent docs, and source code directories.

