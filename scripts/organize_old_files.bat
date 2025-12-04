@echo off
REM Organize old files into archive folders for review
REM This MOVES files instead of deleting them, so you can review later

echo ========================================
echo CuePoint File Organization Script
echo ========================================
echo.
echo This will MOVE old files into ARCHIVE folders
echo so you can review them before deleting.
echo.
pause

REM Create archive folders
echo Creating archive folders...
if not exist "ARCHIVE" mkdir "ARCHIVE"
if not exist "ARCHIVE\old_status_reports" mkdir "ARCHIVE\old_status_reports"
if not exist "ARCHIVE\old_how_to_guides" mkdir "ARCHIVE\old_how_to_guides"
if not exist "ARCHIVE\development_tools" mkdir "ARCHIVE\development_tools"
if not exist "ARCHIVE\temporary_files" mkdir "ARCHIVE\temporary_files"

REM Move old Phase 5 status reports
echo Moving old Phase 5 status reports...
if exist "PHASE_5_COMPLETE.md" move "PHASE_5_COMPLETE.md" "ARCHIVE\old_status_reports\" >nul
if exist "PHASE_5_INTEGRATION_STATUS.md" move "PHASE_5_INTEGRATION_STATUS.md" "ARCHIVE\old_status_reports\" >nul
if exist "PHASE_5_STEPS_5.1_TO_5.7_COMPLETE_STATUS.md" move "PHASE_5_STEPS_5.1_TO_5.7_COMPLETE_STATUS.md" "ARCHIVE\old_status_reports\" >nul
if exist "PHASE_5_STEPS_5.1_TO_5.7_COMPLETION_REVIEW.md" move "PHASE_5_STEPS_5.1_TO_5.7_COMPLETION_REVIEW.md" "ARCHIVE\old_status_reports\" >nul
if exist "PHASE_5_STEPS_5.1_TO_5.7_FINAL_STATUS.md" move "PHASE_5_STEPS_5.1_TO_5.7_FINAL_STATUS.md" "ARCHIVE\old_status_reports\" >nul
if exist "PHASE_5_STEPS_5.1_TO_5.7_STATUS.md" move "PHASE_5_STEPS_5.1_TO_5.7_STATUS.md" "ARCHIVE\old_status_reports\" >nul
if exist "PHASE_5_STEPS_5.1_TO_5.9_COMPLETE_STATUS.md" move "PHASE_5_STEPS_5.1_TO_5.9_COMPLETE_STATUS.md" "ARCHIVE\old_status_reports\" >nul

REM Move old Step 5.X status reports
echo Moving old Step 5.X status reports...
if exist "STEP_5_6_IMPLEMENTATION_SUMMARY.md" move "STEP_5_6_IMPLEMENTATION_SUMMARY.md" "ARCHIVE\old_status_reports\" >nul
if exist "STEP_5_7_COMPLETE_VERIFICATION.md" move "STEP_5_7_COMPLETE_VERIFICATION.md" "ARCHIVE\old_status_reports\" >nul
if exist "STEP_5_7_FULL_VERIFICATION.md" move "STEP_5_7_FULL_VERIFICATION.md" "ARCHIVE\old_status_reports\" >nul
if exist "STEP_5_7_IMPLEMENTATION_SUMMARY.md" move "STEP_5_7_IMPLEMENTATION_SUMMARY.md" "ARCHIVE\old_status_reports\" >nul
if exist "STEP_5_7_VERIFICATION.md" move "STEP_5_7_VERIFICATION.md" "ARCHIVE\old_status_reports\" >nul
if exist "STEP_5.10_COMPLETION_SUMMARY.md" move "STEP_5.10_COMPLETION_SUMMARY.md" "ARCHIVE\old_status_reports\" >nul

REM Move Step 5.2 files
for %%f in (STEP_5.2_*.md) do if exist "%%f" move "%%f" "ARCHIVE\old_status_reports\" >nul

REM Move Step 5.3 files
for %%f in (STEP_5.3_*.md) do if exist "%%f" move "%%f" "ARCHIVE\old_status_reports\" >nul

REM Move Step 5.4 files
for %%f in (STEP_5.4_*.md) do if exist "%%f" move "%%f" "ARCHIVE\old_status_reports\" >nul

REM Move Step 5.5 files
for %%f in (STEP_5.5_*.md) do if exist "%%f" move "%%f" "ARCHIVE\old_status_reports\" >nul

REM Move Step 5.6 files
for %%f in (STEP_5.6_*.md) do if exist "%%f" move "%%f" "ARCHIVE\old_status_reports\" >nul

REM Move Step 5.7 files
for %%f in (STEP_5.7_*.md) do if exist "%%f" move "%%f" "ARCHIVE\old_status_reports\" >nul

REM Move Step 5.8 files
for %%f in (STEP_5.8_*.md) do if exist "%%f" move "%%f" "ARCHIVE\old_status_reports\" >nul

REM Move Step 5.9 files
for %%f in (STEP_5.9_*.md) do if exist "%%f" move "%%f" "ARCHIVE\old_status_reports\" >nul

REM Move migration status reports
echo Moving migration status reports...
if exist "MIGRATION_100_PERCENT_COMPLETE.md" move "MIGRATION_100_PERCENT_COMPLETE.md" "ARCHIVE\old_status_reports\" >nul
if exist "MIGRATION_FINAL_CHECK.md" move "MIGRATION_FINAL_CHECK.md" "ARCHIVE\old_status_reports\" >nul

REM Move old how-to guides
echo Moving old how-to guides...
if exist "HOW_TO_INCREASE_COVERAGE.md" move "HOW_TO_INCREASE_COVERAGE.md" "ARCHIVE\old_how_to_guides\" >nul
if exist "HOW_TO_RUN_QUALITY_CHECKS.md" move "HOW_TO_RUN_QUALITY_CHECKS.md" "ARCHIVE\old_how_to_guides\" >nul
if exist "HOW_TO_TEST_STEP_5.8.md" move "HOW_TO_TEST_STEP_5.8.md" "ARCHIVE\old_how_to_guides\" >nul
if exist "AUTO_FIX_FLAKE8.md" move "AUTO_FIX_FLAKE8.md" "ARCHIVE\old_how_to_guides\" >nul
if exist "TROUBLESHOOT_COMMIT_ISSUES.md" move "TROUBLESHOOT_COMMIT_ISSUES.md" "ARCHIVE\old_how_to_guides\" >nul
if exist "COVERAGE_IMPROVEMENT_PLAN.md" move "COVERAGE_IMPROVEMENT_PLAN.md" "ARCHIVE\old_how_to_guides\" >nul
if exist "QUALITY_CHECKS_SIMPLE.md" move "QUALITY_CHECKS_SIMPLE.md" "ARCHIVE\old_how_to_guides\" >nul
if exist "WINDOWS_QUALITY_CHECKS.md" move "WINDOWS_QUALITY_CHECKS.md" "ARCHIVE\old_how_to_guides\" >nul
if exist "NEXT_STEPS_OPTIONS.md" move "NEXT_STEPS_OPTIONS.md" "ARCHIVE\old_how_to_guides\" >nul

REM Move temporary files
echo Moving temporary files...
if exist "test.csv" move "test.csv" "ARCHIVE\temporary_files\" >nul
if exist "quality_check_results.txt" move "quality_check_results.txt" "ARCHIVE\temporary_files\" >nul
if exist "coverage.xml" move "coverage.xml" "ARCHIVE\temporary_files\" >nul

REM Move development BAT files
echo Moving development BAT files...
if exist "auto_fix_flake8.bat" move "auto_fix_flake8.bat" "ARCHIVE\development_tools\" >nul
if exist "check_format.bat" move "check_format.bat" "ARCHIVE\development_tools\" >nul
if exist "format_code.bat" move "format_code.bat" "ARCHIVE\development_tools\" >nul
if exist "fix_all_formatting.bat" move "fix_all_formatting.bat" "ARCHIVE\development_tools\" >nul
if exist "quality_check.bat" move "quality_check.bat" "ARCHIVE\development_tools\" >nul
if exist "run_linters.bat" move "run_linters.bat" "ARCHIVE\development_tools\" >nul
if exist "type_check.bat" move "type_check.bat" "ARCHIVE\development_tools\" >nul
if exist "quick_commit.bat" move "quick_commit.bat" "ARCHIVE\development_tools\" >nul
if exist "run_test_results.bat" move "run_test_results.bat" "ARCHIVE\development_tools\" >nul

REM Move development Python scripts
echo Moving development Python scripts...
if exist "fix_all_flake8_errors.py" move "fix_all_flake8_errors.py" "ARCHIVE\development_tools\" >nul
if exist "fix_processor.py" move "fix_processor.py" "ARCHIVE\development_tools\" >nul
if exist "test_processor_logging_integration.py" move "test_processor_logging_integration.py" "ARCHIVE\development_tools\" >nul
if exist "test_restructure_verification.py" move "test_restructure_verification.py" "ARCHIVE\development_tools\" >nul
if exist "test_step_5_6.py" move "test_step_5_6.py" "ARCHIVE\development_tools\" >nul
if exist "write_interfaces.py" move "write_interfaces.py" "ARCHIVE\development_tools\" >nul

echo.
echo ========================================
echo Organization complete!
echo ========================================
echo.
echo Files have been moved to:
echo   ARCHIVE\old_status_reports\     - Old status/completion reports
echo   ARCHIVE\old_how_to_guides\      - Old how-to guides
echo   ARCHIVE\development_tools\       - Development scripts and BAT files
echo   ARCHIVE\temporary_files\         - Temporary/test files
echo.
echo Review these folders and delete them when ready.
echo.
pause

