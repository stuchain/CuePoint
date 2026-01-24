# Windows Fresh Install Test Script

**Test ID**: QA-WINDOWS-001  
**Test Type**: Installation  
**Platform**: Windows  
**Estimated Time**: 15 minutes  
**Prerequisites**: Fresh Windows VM or user account

## Test Objective

Verify that CuePoint installs correctly on a fresh Windows system and launches without issues.

## Test Environment Setup

1. **Prepare Test Environment**
   - [ ] Create fresh Windows VM or use clean user account
   - [ ] Ensure Windows version is supported (Windows 10 or later)
   - [ ] Verify internet connection is available
   - [ ] Note Windows version: ___________
   - [ ] Note system architecture (x64/ARM64): ___________

2. **Download Artifact**
   - [ ] Download installer from CI artifacts or release page
   - [ ] Verify installer file name: `CuePoint-Setup-1.0.0.exe`
   - [ ] Verify installer file size is reasonable (< 200 MB)
   - [ ] Note installer location: ___________

## Installation Steps

3. **Run Installer**
   - [ ] Double-click installer file
   - [ ] If UAC prompt appears:
     - [ ] Verify prompt message is clear
     - [ ] Click "Yes"
   - [ ] Verify installer window appears
   - [ ] **PASS** / **FAIL**: ___________

4. **Installation Wizard**
   - [ ] Verify welcome screen appears
   - [ ] Click "Next"
   - [ ] Verify license agreement screen appears
   - [ ] Accept license agreement
   - [ ] Click "Next"
   - [ ] Verify installation location screen appears
   - [ ] Verify default location is appropriate
   - [ ] Click "Next"
   - [ ] Verify ready to install screen appears
   - [ ] Click "Install"
   - [ ] **PASS** / **FAIL**: ___________

5. **Installation Progress**
   - [ ] Verify installation progress bar appears
   - [ ] Verify installation completes
   - [ ] Verify "Installation Complete" screen appears
   - [ ] Verify "Launch CuePoint" checkbox is checked
   - [ ] Click "Finish"
   - [ ] **PASS** / **FAIL**: ___________

6. **Shortcut Verification**
   - [ ] Verify desktop shortcut is created
   - [ ] Verify Start Menu shortcut is created
   - [ ] Verify shortcuts point to correct location
   - [ ] **PASS** / **FAIL**: ___________

## First Launch Verification

7. **Application Launch**
   - [ ] Launch application (from shortcut or Start Menu)
   - [ ] Verify application launches within 5 seconds
   - [ ] Verify no error dialogs appear
   - [ ] Verify main window appears
   - [ ] Verify window title is "CuePoint"
   - [ ] **PASS** / **FAIL**: ___________

8. **Main Window Verification**
   - [ ] Verify main window is visible
   - [ ] Verify window is properly sized
   - [ ] Verify window can be resized
   - [ ] Verify window can be moved
   - [ ] Verify window can be minimized
   - [ ] Verify window can be maximized
   - [ ] **PASS** / **FAIL**: ___________

9. **Core Widgets Verification**
   - [ ] Verify file selector widget is visible
   - [ ] Verify playlist selector widget is visible
   - [ ] Verify results view widget is visible
   - [ ] Verify all widgets are properly laid out
   - [ ] Verify no overlapping widgets
   - [ ] Verify no cut-off text
   - [ ] **PASS** / **FAIL**: ___________

## Basic Functionality Test

10. **File Selection**
    - [ ] Click "Select XML File" button
    - [ ] Verify file dialog appears
    - [ ] Navigate to test XML file location
    - [ ] Select test XML file
    - [ ] Click "Open"
    - [ ] Verify file path is displayed
    - [ ] Verify file is validated
    - [ ] **PASS** / **FAIL**: ___________

11. **Playlist Selection**
    - [ ] Verify playlist selector is enabled
    - [ ] Verify playlists are listed
    - [ ] Select a playlist
    - [ ] Verify playlist is selected
    - [ ] Verify track count is displayed
    - [ ] **PASS** / **FAIL**: ___________

12. **Processing Test**
    - [ ] Click "Process" button
    - [ ] Verify processing starts
    - [ ] Verify progress indicator appears
    - [ ] Verify progress updates
    - [ ] Wait for processing to complete
    - [ ] Verify processing completes successfully
    - [ ] **PASS** / **FAIL**: ___________

13. **Results Verification**
    - [ ] Verify results table appears
    - [ ] Verify results table is populated
    - [ ] Verify correct number of results
    - [ ] Verify results columns are visible
    - [ ] Verify results are sortable
    - [ ] **PASS** / **FAIL**: ___________

14. **Export Test**
    - [ ] Click "Export" button
    - [ ] Verify export dialog appears
    - [ ] Select export location
    - [ ] Enter file name
    - [ ] Click "Save"
    - [ ] Verify export completes
    - [ ] Verify export file is created
    - [ ] Verify export file can be opened
    - [ ] **PASS** / **FAIL**: ___________

## Uninstall and Reinstall Test

15. **Uninstall Test**
    - [ ] Open "Apps & Features" (Windows Settings)
    - [ ] Find "CuePoint" in the list
    - [ ] Click "Uninstall"
    - [ ] Verify uninstaller runs
    - [ ] Verify uninstallation completes
    - [ ] Verify application is removed
    - [ ] Verify shortcuts are removed
    - [ ] **PASS** / **FAIL**: ___________

16. **Reinstall Test**
    - [ ] Run installer again
    - [ ] Complete installation
    - [ ] Verify application installs successfully
    - [ ] Verify application launches
    - [ ] Verify behavior is consistent with first install
    - [ ] **PASS** / **FAIL**: ___________

## Test Results Summary

**Overall Result**: **PASS** / **FAIL**

**Issues Found**:
1. ___________
2. ___________
3. ___________

**Tester**: ___________  
**Date**: ___________  
**Time Taken**: ___________  
**Windows Version**: ___________  
**System Architecture**: ___________

