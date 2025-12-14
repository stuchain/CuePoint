# Manual QA Test Procedures

This directory contains structured manual QA test procedures for CuePoint releases.

## Test Scripts

- `macos_fresh_install.md` - macOS fresh install test procedure
- `windows_fresh_install.md` - Windows fresh install test procedure
- `happy_path_workflow.md` - Complete user workflow test
- `error_scenarios.md` - Error handling test procedures
- `update_system.md` - Update system test procedures

## Usage

1. Before each release, execute the relevant test scripts
2. Check off each item as you complete it
3. Document any issues found
4. Ensure all critical tests pass before proceeding with release

## Test Execution

- **Fresh Install Tests**: Run on clean VMs or user accounts
- **Workflow Tests**: Run on development or staging builds
- **Error Tests**: Test edge cases and error conditions
- **Update Tests**: Test update system with staged releases

## Reporting

Document all test results in the test scripts themselves. Issues should be:
1. Documented in the test script
2. Created as GitHub issues
3. Tracked until resolution
4. Verified in subsequent QA cycle

