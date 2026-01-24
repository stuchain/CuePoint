@echo off
REM Cleanup script to remove old/unused files from CuePoint directory
REM Review CLEANUP_PLAN.md before running this script

echo ========================================
echo CuePoint Directory Cleanup Script
echo ========================================
echo.
echo This will remove old status reports and unused files.
echo Review CLEANUP_PLAN.md first!
echo.
pause

REM Remove old Phase 5 status reports
echo Removing old Phase 5 status reports...
del /Q "PHASE_5_COMPLETE.md" 2>nul
del /Q "PHASE_5_INTEGRATION_STATUS.md" 2>nul
del /Q "PHASE_5_STEPS_5.1_TO_5.7_COMPLETE_STATUS.md" 2>nul
del /Q "PHASE_5_STEPS_5.1_TO_5.7_COMPLETION_REVIEW.md" 2>nul
del /Q "PHASE_5_STEPS_5.1_TO_5.7_FINAL_STATUS.md" 2>nul
del /Q "PHASE_5_STEPS_5.1_TO_5.7_STATUS.md" 2>nul
del /Q "PHASE_5_STEPS_5.1_TO_5.9_COMPLETE_STATUS.md" 2>nul

REM Remove old Step 5.X status reports
echo Removing old Step 5.X status reports...
del /Q "STEP_5_6_IMPLEMENTATION_SUMMARY.md" 2>nul
del /Q "STEP_5_7_COMPLETE_VERIFICATION.md" 2>nul
del /Q "STEP_5_7_FULL_VERIFICATION.md" 2>nul
del /Q "STEP_5_7_IMPLEMENTATION_SUMMARY.md" 2>nul
del /Q "STEP_5_7_VERIFICATION.md" 2>nul
del /Q "STEP_5.10_COMPLETION_SUMMARY.md" 2>nul
del /Q "STEP_5.2_*.md" 2>nul
del /Q "STEP_5.3_*.md" 2>nul
del /Q "STEP_5.4_*.md" 2>nul
del /Q "STEP_5.5_*.md" 2>nul
del /Q "STEP_5.6_*.md" 2>nul
del /Q "STEP_5.7_*.md" 2>nul
del /Q "STEP_5.8_*.md" 2>nul
del /Q "STEP_5.9_*.md" 2>nul

REM Remove migration status reports
echo Removing migration status reports...
del /Q "MIGRATION_100_PERCENT_COMPLETE.md" 2>nul
del /Q "MIGRATION_FINAL_CHECK.md" 2>nul

REM Remove old how-to guides
echo Removing old how-to guides...
del /Q "HOW_TO_INCREASE_COVERAGE.md" 2>nul
del /Q "HOW_TO_RUN_QUALITY_CHECKS.md" 2>nul
del /Q "HOW_TO_TEST_STEP_5.8.md" 2>nul
del /Q "AUTO_FIX_FLAKE8.md" 2>nul
del /Q "TROUBLESHOOT_COMMIT_ISSUES.md" 2>nul
del /Q "COVERAGE_IMPROVEMENT_PLAN.md" 2>nul
del /Q "QUALITY_CHECKS_SIMPLE.md" 2>nul
del /Q "WINDOWS_QUALITY_CHECKS.md" 2>nul
del /Q "NEXT_STEPS_OPTIONS.md" 2>nul

REM Remove temporary files
echo Removing temporary files...
del /Q "test.csv" 2>nul
del /Q "quality_check_results.txt" 2>nul
del /Q "coverage.xml" 2>nul

REM Remove development BAT files (optional - comment out if you use them)
echo Removing development BAT files...
del /Q "auto_fix_flake8.bat" 2>nul
del /Q "check_format.bat" 2>nul
del /Q "format_code.bat" 2>nul
del /Q "fix_all_formatting.bat" 2>nul
del /Q "quality_check.bat" 2>nul
del /Q "run_linters.bat" 2>nul
del /Q "type_check.bat" 2>nul
del /Q "quick_commit.bat" 2>nul
del /Q "run_test_results.bat" 2>nul

REM Remove development Python scripts (optional - comment out if you use them)
echo Removing development Python scripts...
del /Q "fix_all_flake8_errors.py" 2>nul
del /Q "fix_processor.py" 2>nul
del /Q "test_processor_logging_integration.py" 2>nul
del /Q "test_restructure_verification.py" 2>nul
del /Q "test_step_5_6.py" 2>nul
del /Q "write_interfaces.py" 2>nul

echo.
echo ========================================
echo Cleanup complete!
echo ========================================
echo.
echo Note: This script keeps:
echo   - README.md
echo   - requirements*.txt
echo   - run_gui.bat, run_gui.sh, run_gui.command
echo   - install_requirements.sh
echo   - install-macos.md, fix-pyside6-macos.md
echo   - All SRC/, DOCS/, config/ directories
echo.
pause

