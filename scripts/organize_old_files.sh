#!/bin/bash
# Organize old files into archive folders for review
# This MOVES files instead of deleting them, so you can review later

echo "========================================"
echo "CuePoint File Organization Script"
echo "========================================"
echo ""
echo "This will MOVE old files into ARCHIVE folders"
echo "so you can review them before deleting."
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Create archive folders
echo "Creating archive folders..."
mkdir -p "ARCHIVE/old_status_reports"
mkdir -p "ARCHIVE/old_how_to_guides"
mkdir -p "ARCHIVE/development_tools"
mkdir -p "ARCHIVE/temporary_files"

# Move old Phase 5 status reports
echo "Moving old Phase 5 status reports..."
[ -f "PHASE_5_COMPLETE.md" ] && mv "PHASE_5_COMPLETE.md" "ARCHIVE/old_status_reports/"
[ -f "PHASE_5_INTEGRATION_STATUS.md" ] && mv "PHASE_5_INTEGRATION_STATUS.md" "ARCHIVE/old_status_reports/"
[ -f "PHASE_5_STEPS_5.1_TO_5.7_COMPLETE_STATUS.md" ] && mv "PHASE_5_STEPS_5.1_TO_5.7_COMPLETE_STATUS.md" "ARCHIVE/old_status_reports/"
[ -f "PHASE_5_STEPS_5.1_TO_5.7_COMPLETION_REVIEW.md" ] && mv "PHASE_5_STEPS_5.1_TO_5.7_COMPLETION_REVIEW.md" "ARCHIVE/old_status_reports/"
[ -f "PHASE_5_STEPS_5.1_TO_5.7_FINAL_STATUS.md" ] && mv "PHASE_5_STEPS_5.1_TO_5.7_FINAL_STATUS.md" "ARCHIVE/old_status_reports/"
[ -f "PHASE_5_STEPS_5.1_TO_5.7_STATUS.md" ] && mv "PHASE_5_STEPS_5.1_TO_5.7_STATUS.md" "ARCHIVE/old_status_reports/"
[ -f "PHASE_5_STEPS_5.1_TO_5.9_COMPLETE_STATUS.md" ] && mv "PHASE_5_STEPS_5.1_TO_5.9_COMPLETE_STATUS.md" "ARCHIVE/old_status_reports/"

# Move old Step 5.X status reports
echo "Moving old Step 5.X status reports..."
[ -f "STEP_5_6_IMPLEMENTATION_SUMMARY.md" ] && mv "STEP_5_6_IMPLEMENTATION_SUMMARY.md" "ARCHIVE/old_status_reports/"
[ -f "STEP_5_7_COMPLETE_VERIFICATION.md" ] && mv "STEP_5_7_COMPLETE_VERIFICATION.md" "ARCHIVE/old_status_reports/"
[ -f "STEP_5_7_FULL_VERIFICATION.md" ] && mv "STEP_5_7_FULL_VERIFICATION.md" "ARCHIVE/old_status_reports/"
[ -f "STEP_5_7_IMPLEMENTATION_SUMMARY.md" ] && mv "STEP_5_7_IMPLEMENTATION_SUMMARY.md" "ARCHIVE/old_status_reports/"
[ -f "STEP_5_7_VERIFICATION.md" ] && mv "STEP_5_7_VERIFICATION.md" "ARCHIVE/old_status_reports/"
[ -f "STEP_5.10_COMPLETION_SUMMARY.md" ] && mv "STEP_5.10_COMPLETION_SUMMARY.md" "ARCHIVE/old_status_reports/"

# Move Step 5.X files using glob patterns
for file in STEP_5.2_*.md STEP_5.3_*.md STEP_5.4_*.md STEP_5.5_*.md STEP_5.6_*.md STEP_5.7_*.md STEP_5.8_*.md STEP_5.9_*.md; do
    [ -f "$file" ] && mv "$file" "ARCHIVE/old_status_reports/"
done

# Move migration status reports
echo "Moving migration status reports..."
[ -f "MIGRATION_100_PERCENT_COMPLETE.md" ] && mv "MIGRATION_100_PERCENT_COMPLETE.md" "ARCHIVE/old_status_reports/"
[ -f "MIGRATION_FINAL_CHECK.md" ] && mv "MIGRATION_FINAL_CHECK.md" "ARCHIVE/old_status_reports/"

# Move old how-to guides
echo "Moving old how-to guides..."
[ -f "HOW_TO_INCREASE_COVERAGE.md" ] && mv "HOW_TO_INCREASE_COVERAGE.md" "ARCHIVE/old_how_to_guides/"
[ -f "HOW_TO_RUN_QUALITY_CHECKS.md" ] && mv "HOW_TO_RUN_QUALITY_CHECKS.md" "ARCHIVE/old_how_to_guides/"
[ -f "HOW_TO_TEST_STEP_5.8.md" ] && mv "HOW_TO_TEST_STEP_5.8.md" "ARCHIVE/old_how_to_guides/"
[ -f "AUTO_FIX_FLAKE8.md" ] && mv "AUTO_FIX_FLAKE8.md" "ARCHIVE/old_how_to_guides/"
[ -f "TROUBLESHOOT_COMMIT_ISSUES.md" ] && mv "TROUBLESHOOT_COMMIT_ISSUES.md" "ARCHIVE/old_how_to_guides/"
[ -f "COVERAGE_IMPROVEMENT_PLAN.md" ] && mv "COVERAGE_IMPROVEMENT_PLAN.md" "ARCHIVE/old_how_to_guides/"
[ -f "QUALITY_CHECKS_SIMPLE.md" ] && mv "QUALITY_CHECKS_SIMPLE.md" "ARCHIVE/old_how_to_guides/"
[ -f "WINDOWS_QUALITY_CHECKS.md" ] && mv "WINDOWS_QUALITY_CHECKS.md" "ARCHIVE/old_how_to_guides/"
[ -f "NEXT_STEPS_OPTIONS.md" ] && mv "NEXT_STEPS_OPTIONS.md" "ARCHIVE/old_how_to_guides/"

# Move temporary files
echo "Moving temporary files..."
[ -f "test.csv" ] && mv "test.csv" "ARCHIVE/temporary_files/"
[ -f "quality_check_results.txt" ] && mv "quality_check_results.txt" "ARCHIVE/temporary_files/"
[ -f "coverage.xml" ] && mv "coverage.xml" "ARCHIVE/temporary_files/"

# Move development BAT files
echo "Moving development BAT files..."
[ -f "auto_fix_flake8.bat" ] && mv "auto_fix_flake8.bat" "ARCHIVE/development_tools/"
[ -f "check_format.bat" ] && mv "check_format.bat" "ARCHIVE/development_tools/"
[ -f "format_code.bat" ] && mv "format_code.bat" "ARCHIVE/development_tools/"
[ -f "fix_all_formatting.bat" ] && mv "fix_all_formatting.bat" "ARCHIVE/development_tools/"
[ -f "quality_check.bat" ] && mv "quality_check.bat" "ARCHIVE/development_tools/"
[ -f "run_linters.bat" ] && mv "run_linters.bat" "ARCHIVE/development_tools/"
[ -f "type_check.bat" ] && mv "type_check.bat" "ARCHIVE/development_tools/"
[ -f "quick_commit.bat" ] && mv "quick_commit.bat" "ARCHIVE/development_tools/"
[ -f "run_test_results.bat" ] && mv "run_test_results.bat" "ARCHIVE/development_tools/"

# Move development Python scripts
echo "Moving development Python scripts..."
[ -f "fix_all_flake8_errors.py" ] && mv "fix_all_flake8_errors.py" "ARCHIVE/development_tools/"
[ -f "fix_processor.py" ] && mv "fix_processor.py" "ARCHIVE/development_tools/"
[ -f "test_processor_logging_integration.py" ] && mv "test_processor_logging_integration.py" "ARCHIVE/development_tools/"
[ -f "test_restructure_verification.py" ] && mv "test_restructure_verification.py" "ARCHIVE/development_tools/"
[ -f "test_step_5_6.py" ] && mv "test_step_5_6.py" "ARCHIVE/development_tools/"
[ -f "write_interfaces.py" ] && mv "write_interfaces.py" "ARCHIVE/development_tools/"

echo ""
echo "========================================"
echo "Organization complete!"
echo "========================================"
echo ""
echo "Files have been moved to:"
echo "  ARCHIVE/old_status_reports/     - Old status/completion reports"
echo "  ARCHIVE/old_how_to_guides/      - Old how-to guides"
echo "  ARCHIVE/development_tools/       - Development scripts and BAT files"
echo "  ARCHIVE/temporary_files/         - Temporary/test files"
echo ""
echo "Review these folders and delete them when ready."
echo ""

