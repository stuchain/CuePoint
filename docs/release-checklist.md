# Release Readiness Checklist

Use this checklist before tagging a release.

## Pre-Release Verification

### Automated Checks (CI)
- [ ] All tests pass on macOS
- [ ] All tests pass on Windows
- [ ] Code coverage meets threshold (80%)
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Build completes successfully
- [ ] Artifacts are signed
- [ ] Artifacts are notarized (macOS)
- [ ] File size checks pass
- [ ] Performance benchmarks pass

### Manual Verification

#### Fresh Install Test (macOS)
- [ ] Download DMG from CI artifacts
- [ ] Install on fresh macOS VM/user account
- [ ] Verify no Gatekeeper blocks
- [ ] Launch application
- [ ] Verify application starts successfully
- [ ] Verify main window appears
- [ ] Run processing on small playlist (10 tracks)
- [ ] Verify results table shows
- [ ] Export results to CSV
- [ ] Verify CSV file is created
- [ ] Quit and relaunch
- [ ] Verify recent file handling works

#### Fresh Install Test (Windows)
- [ ] Download installer from CI artifacts
- [ ] Install on fresh Windows VM/user account
- [ ] Verify shortcut is created
- [ ] Launch application
- [ ] Verify application starts successfully
- [ ] Verify main window appears
- [ ] Run processing on small playlist (10 tracks)
- [ ] Verify results table shows
- [ ] Export results to CSV
- [ ] Verify CSV file is created
- [ ] Uninstall and reinstall
- [ ] Verify behavior is consistent

#### Happy Path Workflow
- [ ] Select Rekordbox XML file
- [ ] Select playlist
- [ ] Start processing
- [ ] Verify progress updates
- [ ] Verify processing completes
- [ ] Verify results table populates
- [ ] Apply filter to results
- [ ] Verify filtering works
- [ ] Export results
- [ ] Verify export file is correct
- [ ] Open export folder
- [ ] Verify exported file opens correctly

#### Past Searches
- [ ] Load recent CSV file
- [ ] Verify data loads correctly
- [ ] Apply filters
- [ ] Verify filtering works
- [ ] Export filtered results
- [ ] Verify export works

#### Error Handling
- [ ] Cancel processing mid-run
- [ ] Verify cancellation works correctly
- [ ] Verify no data corruption
- [ ] Test with invalid XML file
- [ ] Verify error message appears
- [ ] Test with network unavailable
- [ ] Verify graceful error handling

#### Update System
- [ ] Verify update feed points to correct artifacts
- [ ] Stage update feed with new version
- [ ] Launch application
- [ ] Verify update prompt appears
- [ ] Verify update installation works

### Release Documentation

- [ ] Release notes are written
- [ ] Release notes include:
  - [ ] New features
  - [ ] Bug fixes
  - [ ] Known issues
  - [ ] Upgrade notes (if applicable)
- [ ] Version number is correct
- [ ] Build number is correct
- [ ] Changelog is updated

### Final Checks

- [ ] All checklist items completed
- [ ] No critical issues found
- [ ] Release is ready for tagging
- [ ] Release coordinator approval obtained

## Post-Release Verification

- [ ] Release tag created
- [ ] Release artifacts uploaded
- [ ] Update feed updated
- [ ] Release notes published
- [ ] Announcement sent (if applicable)
- [ ] Monitor initial user feedback
- [ ] Monitor error reports
- [ ] Verify update system works for existing users

