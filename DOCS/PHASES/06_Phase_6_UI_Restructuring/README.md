# Phase 6: UI Restructuring & Refactoring

**Status**: 📝 In Progress  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation), Phase 5 (Code Restructuring)  
**Estimated Duration**: 2-3 weeks

## Goal

Restructure the user interface to provide a cleaner, more intuitive workflow with progressive disclosure. The UI will guide users through a step-by-step process: tool selection → file selection → processing mode → playlist selection → processing. This refactoring maintains all existing functionality while improving user experience and fixing critical bugs.

## Success Criteria

- [ ] Main page with tool selection (inKey button)
- [ ] XML file selection page with info button for Rekordbox instructions
- [ ] Progressive disclosure: processing mode appears only after XML file selection
- [ ] Playlist selection appears only after processing mode selection
- [ ] Improved progress bar with clean elapsed/remaining time display
- [ ] Settings moved to menu bar (next to File menu)
- [ ] Past searches: Excel updates when selecting candidate, stays on page
- [ ] Cancel button crash issues fixed
- [ ] Candidate selection crash issues fixed
- [ ] All existing functionality preserved

---

## Implementation Steps

### Step 6.1: Create Main Tool Selection Page (2-3 days)

**Goal**: Create a landing page where users select which tool to use.

**Tasks**:
1. Create new `ToolSelectionPage` widget
2. Add "inKey" button (the Beatport matching tool)
3. Implement navigation to XML file selection page
4. Update main window to show tool selection first

**Key Components**:
- Large, prominent "inKey" button
- Clean, centered layout
- Smooth transition to next page

**Files to Create/Modify**:
- `SRC/cuepoint/ui/widgets/tool_selection_page.py` (NEW)
- `SRC/cuepoint/ui/main_window.py` (MODIFY)

---

### Step 6.2: Enhance XML File Selection with Info Button (2-3 days)

**Goal**: Add an info button next to the browse button that shows instructions for exporting XML from Rekordbox.

**Tasks**:
1. Add info button (ℹ️) next to browse button in FileSelector
2. Create `RekordboxInstructionsDialog` with photo placeholders
3. Implement simple, clear instructions with image support
4. Support drag & drop (already exists, ensure it works)

**Key Components**:
- Info button with tooltip
- Dialog window with image placeholders
- Simple, non-technical language
- Photo slots for user to add images later

**Files to Create/Modify**:
- `SRC/cuepoint/ui/widgets/file_selector.py` (MODIFY)
- `SRC/cuepoint/ui/dialogs/rekordbox_instructions_dialog.py` (NEW)

---

### Step 6.3: Implement Progressive Disclosure (2-3 days)

**Goal**: Show processing mode selection only after XML file is selected, and playlist selection only after processing mode is selected.

**Tasks**:
1. Hide processing mode selection initially
2. Show processing mode selection only when XML file is valid
3. Hide playlist selection initially
4. Show playlist selection only after processing mode is selected
5. Update UI state management

**Key Components**:
- Conditional visibility for UI sections
- State management for workflow progression
- Clear visual feedback for each step

**Files to Modify**:
- `SRC/cuepoint/ui/main_window.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/playlist_selector.py` (MODIFY if needed)

---

### Step 6.4: Improve Progress Bar Display (1-2 days)

**Goal**: Make the progress bar cleaner with better elapsed/remaining time display and reliable cancel functionality.

**Tasks**:
1. Improve progress bar layout and styling
2. Enhance time display formatting
3. Fix cancel button to prevent crashes
4. Add proper error handling for cancellation
5. Ensure cancel properly stops processing

**Key Components**:
- Cleaner progress bar design
- Better time formatting (e.g., "2m 30s remaining")
- Robust cancel handling
- Proper state cleanup on cancel

**Files to Modify**:
- `SRC/cuepoint/ui/widgets/progress_widget.py` (MODIFY)
- `SRC/cuepoint/ui/main_window.py` (MODIFY - cancel handling)

---

### Step 6.5: Move Settings to Menu Bar (1 day)

**Goal**: Move Settings from a tab to a menu item in the menu bar, next to the File menu.

**Tasks**:
1. Remove Settings tab from tab widget
2. Add Settings menu item to menu bar (after File)
3. Create Settings dialog window
4. Update all references to Settings tab
5. Ensure settings are accessible from menu

**Key Components**:
- Settings menu item in menu bar
- Settings dialog window
- Proper menu organization

**Files to Modify**:
- `SRC/cuepoint/ui/main_window.py` (MODIFY)
- `SRC/cuepoint/ui/dialogs/settings_dialog.py` (CREATE or MODIFY)

---

### Step 6.6: Fix Past Searches Excel Update (2-3 days)

**Goal**: When selecting a different candidate in past searches, update the Excel file and stay on the same page.

**Tasks**:
1. Ensure Excel file is updated when candidate is selected
2. Keep user on the same page (don't navigate away)
3. Refresh table display with updated data
4. Fix any crashes during candidate selection
5. Add proper error handling

**Key Components**:
- Excel file update on candidate selection
- Stay on current page
- Table refresh with updated data
- Error handling for file operations

**Files to Modify**:
- `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)
- `SRC/cuepoint/services/output_writer.py` (MODIFY if needed)

---

### Step 6.7: Fix Cancel and Candidate Selection Crashes (2-3 days)

**Goal**: Fix all crash issues related to cancel button and candidate selection.

**Tasks**:
1. Investigate cancel button crash causes
2. Add proper exception handling for cancel operations
3. Fix thread/worker cleanup on cancel
4. Investigate candidate selection crash causes
5. Add proper exception handling for candidate operations
6. Test thoroughly with various scenarios

**Key Components**:
- Robust error handling
- Proper cleanup on cancellation
- Thread safety
- Exception logging

**Files to Modify**:
- `SRC/cuepoint/ui/main_window.py` (MODIFY)
- `SRC/cuepoint/ui/controllers/main_controller.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/progress_widget.py` (MODIFY)

---

## Implementation Order

```
6.1 (Tool Selection) 
  ↓
6.2 (XML Selection + Info) 
  ↓
6.3 (Progressive Disclosure) 
  ↓
6.4 (Progress Bar) 
  ↓
6.5 (Settings Menu) 
  ↓
6.6 (Past Searches Excel) 
  ↓
6.7 (Crash Fixes)
```

---

## Design Specifications

### Main Tool Selection Page

```
┌─────────────────────────────────────────┐
│                                         │
│         CuePoint                        │
│                                         │
│    ┌─────────────────────────────┐     │
│    │                             │     │
│    │      [  inKey  ]            │     │
│    │                             │     │
│    │  Beatport Track Matching    │     │
│    │                             │     │
│    └─────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

### XML File Selection Page

```
┌─────────────────────────────────────────┐
│  Rekordbox XML File Selection           │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ Rekordbox XML File: [path...]    │ │
│  │                    [Browse...] [ℹ️]│ │
│  └───────────────────────────────────┘ │
│                                         │
│  or drag & drop XML file here          │
│                                         │
└─────────────────────────────────────────┘
```

### Progressive Disclosure Flow

1. **Start**: Only tool selection visible
2. **After tool selection**: XML file selection appears
3. **After XML file selected**: Processing mode appears
4. **After mode selected**: Playlist selection appears
5. **After playlist selected**: Start Processing button enabled

---

## Testing Requirements

### Functional Testing
- [ ] Tool selection navigation works
- [ ] XML file selection with info button works
- [ ] Progressive disclosure shows/hides correctly
- [ ] Progress bar displays correctly
- [ ] Settings accessible from menu bar
- [ ] Past searches Excel updates correctly
- [ ] Cancel button works without crashes
- [ ] Candidate selection works without crashes

### Error Handling Testing
- [ ] Cancel during processing doesn't crash
- [ ] Invalid file selection handled gracefully
- [ ] Candidate selection errors handled gracefully
- [ ] Excel write errors handled gracefully

### User Experience Testing
- [ ] Workflow is intuitive
- [ ] Each step is clear
- [ ] Progress feedback is accurate
- [ ] No unexpected navigation

---

## Notes

- All changes maintain backward compatibility
- Existing functionality is preserved
- Focus on fixing bugs and improving UX
- Keep code clean and well-documented
- Test thoroughly after each step

---

**Next Phase**: After completing Phase 6, consider additional UI improvements based on user feedback.

