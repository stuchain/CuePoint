# macOS Fresh Install Test Script

**Test ID**: QA-MACOS-001  
**Test Type**: Installation  
**Platform**: macOS  
**Estimated Time**: 15 minutes  
**Prerequisites**: Fresh macOS VM or user account

## Test Objective

Verify that CuePoint installs correctly on a fresh macOS system and launches without issues.

## Test Environment Setup

1. **Prepare Test Environment**
   - [ ] Create fresh macOS VM or use clean user account
   - [ ] Ensure macOS version is supported (macOS 11.0 or later)
   - [ ] Verify internet connection is available
   - [ ] Note macOS version: ___________
   - [ ] Note system architecture (Intel/Apple Silicon): ___________

2. **Download Artifact**
   - [ ] Download DMG from CI artifacts or release page
   - [ ] Verify DMG file name: `CuePoint-1.0.0.dmg`
   - [ ] Verify DMG file size is reasonable (< 200 MB)
   - [ ] Note DMG location: ___________

## Installation Steps

3. **Mount DMG**
   - [ ] Double-click DMG file
   - [ ] Verify DMG mounts successfully
   - [ ] Verify DMG window appears
   - [ ] Verify DMG contains:
     - [ ] CuePoint.app
     - [ ] Applications folder (symlink)
   - [ ] **PASS** / **FAIL**: ___________

4. **Install Application**
   - [ ] Drag CuePoint.app to Applications folder
   - [ ] Verify copy operation completes
   - [ ] Verify CuePoint.app appears in Applications folder
   - [ ] Eject DMG
   - [ ] **PASS** / **FAIL**: ___________

5. **Gatekeeper Verification**
   - [ ] Open Applications folder
   - [ ] Right-click CuePoint.app
   - [ ] Select "Open" (first launch)
   - [ ] If Gatekeeper dialog appears:
     - [ ] Verify dialog message is clear
     - [ ] Click "Open"
     - [ ] Verify application launches
   - [ ] If no Gatekeeper dialog:
     - [ ] Verify application launches directly
   - [ ] **PASS** / **FAIL**: ___________
   - [ ] **Notes**: ___________

## First Launch Verification

6. **Application Launch**
   - [ ] Verify application launches within 5 seconds
   - [ ] Verify no error dialogs appear
   - [ ] Verify main window appears
   - [ ] Verify window title is "CuePoint"
   - [ ] **PASS** / **FAIL**: ___________
   - [ ] **Notes**: ___________

7. **Main Window Verification**
   - [ ] Verify main window is visible
   - [ ] Verify window is properly sized (not too small/large)
   - [ ] Verify window can be resized
   - [ ] Verify window can be moved
   - [ ] Verify window can be minimized
   - [ ] Verify window can be maximized
   - [ ] **PASS** / **FAIL**: ___________

8. **Core Widgets Verification**
   - [ ] Verify file selector widget is visible
   - [ ] Verify playlist selector widget is visible
   - [ ] Verify results view widget is visible (may be empty initially)
   - [ ] Verify all widgets are properly laid out
   - [ ] Verify no overlapping widgets
   - [ ] Verify no cut-off text
   - [ ] **PASS** / **FAIL**: ___________

## Basic Functionality Test

9. **File Selection**
   - [ ] Click "Select XML File" button
   - [ ] Verify file dialog appears
   - [ ] Navigate to test XML file location
   - [ ] Select test XML file
   - [ ] Click "Open"
   - [ ] Verify file path appears in file selector
   - [ ] Verify file is validated (no error messages)
   - [ ] **PASS** / **FAIL**: ___________

10. **Playlist Selection**
    - [ ] Verify playlist selector is enabled
    - [ ] Verify playlists are listed
    - [ ] Select a playlist
    - [ ] Verify playlist is selected
    - [ ] Verify track count is displayed
    - [ ] **PASS** / **FAIL**: ___________

11. **Processing Test**
    - [ ] Click "Process" button
    - [ ] Verify processing starts
    - [ ] Verify progress indicator appears
    - [ ] Verify progress updates (if applicable)
    - [ ] Wait for processing to complete
    - [ ] Verify processing completes successfully
    - [ ] Verify no error messages appear
    - [ ] **PASS** / **FAIL**: ___________
    - [ ] **Processing Time**: ___________

12. **Results Verification**
    - [ ] Verify results table appears
    - [ ] Verify results table is populated
    - [ ] Verify correct number of results
    - [ ] Verify results columns are visible:
      - [ ] Title
      - [ ] Artist
      - [ ] Label
      - [ ] BPM
      - [ ] Match Score
    - [ ] Verify results are sortable (click column headers)
    - [ ] **PASS** / **FAIL**: ___________

13. **Export Test**
    - [ ] Click "Export" button
    - [ ] Verify export dialog appears
    - [ ] Select export location
    - [ ] Enter file name
    - [ ] Click "Save"
    - [ ] Verify export completes
    - [ ] Verify export file is created
    - [ ] Verify export file can be opened
    - [ ] Verify export file contains correct data
    - [ ] **PASS** / **FAIL**: ___________

## Quit and Relaunch Test

14. **Application Quit**
    - [ ] Quit application (Cmd+Q or menu)
    - [ ] Verify application quits cleanly
    - [ ] Verify no error dialogs appear
    - [ ] Verify no background processes remain
    - [ ] **PASS** / **FAIL**: ___________

15. **Relaunch Test**
    - [ ] Launch application again
    - [ ] Verify application launches successfully
    - [ ] Verify main window appears
    - [ ] Verify previous file selection is remembered (if applicable)
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
**macOS Version**: ___________  
**System Architecture**: ___________

