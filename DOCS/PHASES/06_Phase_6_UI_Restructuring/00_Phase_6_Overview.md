# Phase 6: UI Restructuring & Refactoring - Overview

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation), Phase 5 (Code Restructuring)  
**Estimated Duration**: 2-3 weeks

## Goal

Restructure the user interface to provide a cleaner, more intuitive workflow with progressive disclosure. The UI will guide users through a step-by-step process while maintaining all existing functionality and fixing critical bugs.

## Key Changes

### 1. Main Tool Selection Page
- Landing page where users first see tool selection
- Currently only "inKey" tool (Beatport track matching)
- Clean, centered layout with prominent button

### 2. Enhanced XML File Selection
- Info button (ℹ️) next to browse button
- Dialog with simple instructions for exporting XML from Rekordbox
- Photo placeholders for user to add images later

### 3. Progressive Disclosure
- Processing mode appears ONLY after XML file is selected
- Playlist selection appears ONLY after processing mode is selected
- Start button enabled only when all prerequisites are met

### 4. Improved Progress Bar
- Cleaner design and layout
- Better elapsed/remaining time display
- Reliable cancel functionality
- No crashes on cancellation

### 5. Settings in Menu Bar
- Moved from tab to menu bar (next to File menu)
- Accessible via menu or keyboard shortcut (Ctrl+,)
- Settings dialog window

### 6. Past Searches Excel Update
- CSV file updates immediately when candidate is selected
- User stays on the same page
- Table display updates automatically

### 7. Crash Fixes
- Cancel button crashes fixed
- Candidate selection crashes fixed
- Comprehensive error handling

## Implementation Steps

1. **Step 6.1**: Create Main Tool Selection Page (2-3 days)
2. **Step 6.2**: Enhance XML File Selection with Info Button (2-3 days)
3. **Step 6.3**: Implement Progressive Disclosure (2-3 days)
4. **Step 6.4**: Improve Progress Bar Display (1-2 days)
5. **Step 6.5**: Move Settings to Menu Bar (1 day)
6. **Step 6.6**: Fix Past Searches Excel Update (2-3 days)
7. **Step 6.7**: Fix Cancel and Candidate Selection Crashes (2-3 days)

## Workflow Flow

```
1. User opens app
   ↓
2. Tool Selection Page (inKey button)
   ↓
3. XML File Selection Page (with info button)
   ↓
4. Processing Mode Selection (appears after XML selected)
   ↓
5. Playlist Selection (appears after mode selected)
   ↓
6. Start Processing (enabled after playlist selected)
   ↓
7. Progress Display (with improved time display)
   ↓
8. Results Display
```

## Success Criteria

- ✅ Main page with tool selection (inKey button)
- ✅ XML file selection page with info button for Rekordbox instructions
- ✅ Progressive disclosure: processing mode appears only after XML file selection
- ✅ Playlist selection appears only after processing mode selection
- ✅ Improved progress bar with clean elapsed/remaining time display
- ✅ Settings moved to menu bar (next to File menu)
- ✅ Past searches: Excel updates when selecting candidate, stays on page
- ✅ Cancel button crash issues fixed
- ✅ Candidate selection crash issues fixed
- ✅ All existing functionality preserved

## Files to Create

- `SRC/cuepoint/ui/widgets/tool_selection_page.py` (NEW)
- `SRC/cuepoint/ui/dialogs/rekordbox_instructions_dialog.py` (NEW)
- `SRC/cuepoint/ui/dialogs/settings_dialog.py` (CREATE or MODIFY)

## Files to Modify

- `SRC/cuepoint/ui/main_window.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/file_selector.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/progress_widget.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)
- `SRC/cuepoint/ui/controllers/main_controller.py` (MODIFY)

## Testing Requirements

### Functional Testing
- Tool selection navigation works
- XML file selection with info button works
- Progressive disclosure shows/hides correctly
- Progress bar displays correctly
- Settings accessible from menu bar
- Past searches Excel updates correctly
- Cancel button works without crashes
- Candidate selection works without crashes

### Error Handling Testing
- Cancel during processing doesn't crash
- Invalid file selection handled gracefully
- Candidate selection errors handled gracefully
- Excel write errors handled gracefully

### User Experience Testing
- Workflow is intuitive
- Each step is clear
- Progress feedback is accurate
- No unexpected navigation

## Notes

- All changes maintain backward compatibility
- Existing functionality is preserved
- Focus on fixing bugs and improving UX
- Keep code clean and well-documented
- Test thoroughly after each step

## Related Documentation

- `README.md` - Main Phase 6 documentation
- `01_Step_6.1_Tool_Selection_Page.md` - Tool selection implementation
- `02_Step_6.2_XML_Selection_Info_Button.md` - XML selection with info button
- `03_Step_6.3_Progressive_Disclosure.md` - Progressive disclosure implementation
- `04_Step_6.4_Improve_Progress_Bar.md` - Progress bar improvements
- `05_Step_6.5_Settings_Menu_Bar.md` - Settings menu bar implementation
- `06_Step_6.6_Past_Searches_Excel_Update.md` - Past searches Excel update
- `07_Step_6.7_Fix_Crash_Issues.md` - Crash fixes

---

**Next Phase**: After completing Phase 6, consider additional UI improvements based on user feedback.

