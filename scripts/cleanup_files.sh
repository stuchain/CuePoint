#!/bin/bash
# Cleanup script to remove old/unused files from CuePoint directory
# Review CLEANUP_PLAN.md before running this script

echo "========================================"
echo "CuePoint Directory Cleanup Script"
echo "========================================"
echo ""
echo "This will remove old status reports and unused files."
echo "Review CLEANUP_PLAN.md first!"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Remove old Phase 5 status reports
echo "Removing old Phase 5 status reports..."
rm -f "PHASE_5_COMPLETE.md"
rm -f "PHASE_5_INTEGRATION_STATUS.md"
rm -f "PHASE_5_STEPS_5.1_TO_5.7_COMPLETE_STATUS.md"
rm -f "PHASE_5_STEPS_5.1_TO_5.7_COMPLETION_REVIEW.md"
rm -f "PHASE_5_STEPS_5.1_TO_5.7_FINAL_STATUS.md"
rm -f "PHASE_5_STEPS_5.1_TO_5.7_STATUS.md"
rm -f "PHASE_5_STEPS_5.1_TO_5.9_COMPLETE_STATUS.md"

# Remove old Step 5.X status reports
echo "Removing old Step 5.X status reports..."
rm -f "STEP_5_6_IMPLEMENTATION_SUMMARY.md"
rm -f "STEP_5_7_COMPLETE_VERIFICATION.md"
rm -f "STEP_5_7_FULL_VERIFICATION.md"
rm -f "STEP_5_7_IMPLEMENTATION_SUMMARY.md"
rm -f "STEP_5_7_VERIFICATION.md"
rm -f "STEP_5.10_COMPLETION_SUMMARY.md"
rm -f STEP_5.2_*.md
rm -f STEP_5.3_*.md
rm -f STEP_5.4_*.md
rm -f STEP_5.5_*.md
rm -f STEP_5.6_*.md
rm -f STEP_5.7_*.md
rm -f STEP_5.8_*.md
rm -f STEP_5.9_*.md

# Remove migration status reports
echo "Removing migration status reports..."
rm -f "MIGRATION_100_PERCENT_COMPLETE.md"
rm -f "MIGRATION_FINAL_CHECK.md"

# Remove old how-to guides
echo "Removing old how-to guides..."
rm -f "HOW_TO_INCREASE_COVERAGE.md"
rm -f "HOW_TO_RUN_QUALITY_CHECKS.md"
rm -f "HOW_TO_TEST_STEP_5.8.md"
rm -f "AUTO_FIX_FLAKE8.md"
rm -f "TROUBLESHOOT_COMMIT_ISSUES.md"
rm -f "COVERAGE_IMPROVEMENT_PLAN.md"
rm -f "QUALITY_CHECKS_SIMPLE.md"
rm -f "WINDOWS_QUALITY_CHECKS.md"
rm -f "NEXT_STEPS_OPTIONS.md"

# Remove temporary files
echo "Removing temporary files..."
rm -f "test.csv"
rm -f "quality_check_results.txt"
rm -f "coverage.xml"

# Remove development BAT files (optional - comment out if you use them)
echo "Removing development BAT files..."
rm -f "auto_fix_flake8.bat"
rm -f "check_format.bat"
rm -f "format_code.bat"
rm -f "fix_all_formatting.bat"
rm -f "quality_check.bat"
rm -f "run_linters.bat"
rm -f "type_check.bat"
rm -f "quick_commit.bat"
rm -f "run_test_results.bat"

# Remove development Python scripts (optional - comment out if you use them)
echo "Removing development Python scripts..."
rm -f "fix_all_flake8_errors.py"
rm -f "fix_processor.py"
rm -f "test_processor_logging_integration.py"
rm -f "test_restructure_verification.py"
rm -f "test_step_5_6.py"
rm -f "write_interfaces.py"

echo ""
echo "========================================"
echo "Cleanup complete!"
echo "========================================"
echo ""
echo "Note: This script keeps:"
echo "  - README.md"
echo "  - requirements*.txt"
echo "  - run_gui.bat, run_gui.sh, run_gui.command"
echo "  - install_requirements.sh"
echo "  - install-macos.md, fix-pyside6-macos.md"
echo "  - All SRC/, DOCS/, config/ directories"
echo ""

