# Step 4.6: Keyboard Shortcuts and Accessibility (OPTIONAL)

**Status**: 📝 Planned (Evaluate Need Based on User Requests)  
**Priority**: 🚀 Low Priority (Only if users request accessibility features)  
**Estimated Duration**: 1-2 days  
**Dependencies**: Phase 1 (GUI), Phase 2 (User Experience)

## Goal
Add comprehensive keyboard shortcuts and accessibility improvements to make the application more usable for power users and users with accessibility needs.

## Success Criteria
- [ ] Keyboard shortcuts implemented for common actions
- [ ] Shortcuts documented in Help menu
- [ ] Accessibility improvements (tooltips, labels, etc.)
- [ ] All features tested
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Existing**: Basic keyboard support (standard Qt shortcuts)
- **Limitations**: No comprehensive shortcut system, limited accessibility
- **Opportunity**: Add shortcuts for power users, improve accessibility
- **Risk**: Low risk, mostly UI improvements

### Shortcut Design
- **File Operations**: Ctrl+O (Open), Ctrl+S (Save), Ctrl+E (Export)
- **Navigation**: Tab (Next), Shift+Tab (Previous), Enter (Activate)
- **Processing**: F5 (Start), Esc (Cancel)
- **View**: F1 (Help), F11 (Full Screen)
- **Filtering** (from Step 4.2): Ctrl+F (Focus search box), Ctrl+Shift+F (Clear all filters)
  - Consider adding: Ctrl+Y (Focus year filter), Ctrl+B (Focus BPM filter), Ctrl+K (Focus key filter)

### Accessibility Design
- **Tooltips**: All interactive elements
- **Labels**: Proper labels for all inputs
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: Proper ARIA labels

---

## Implementation Steps

### Substep 4.7.1: Add Keyboard Shortcuts (4-6 hours)
**File**: `SRC/gui/main_window.py` (MODIFY)

**What to implement:**

```python
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtCore import Qt

class MainWindow(QMainWindow):
    """Main window with keyboard shortcuts"""
    
    def __init__(self):
        super().__init__()
        self.init_ui()
        self.setup_shortcuts()
    
    def setup_shortcuts(self):
        """Setup keyboard shortcuts"""
        # File operations
        open_shortcut = QShortcut(QKeySequence("Ctrl+O"), self)
        open_shortcut.activated.connect(self.open_file)
        
        export_shortcut = QShortcut(QKeySequence("Ctrl+E"), self)
        export_shortcut.activated.connect(self.export_results)
        
        # Processing
        start_shortcut = QShortcut(QKeySequence("F5"), self)
        start_shortcut.activated.connect(self.start_processing)
        
        cancel_shortcut = QShortcut(QKeySequence("Esc"), self)
        cancel_shortcut.activated.connect(self.cancel_processing)
        
        # View
        help_shortcut = QShortcut(QKeySequence("F1"), self)
        help_shortcut.activated.connect(self.show_help)
        
        fullscreen_shortcut = QShortcut(QKeySequence("F11"), self)
        fullscreen_shortcut.activated.connect(self.toggle_fullscreen)
```

**Implementation Checklist**:
- [ ] Add shortcuts for common actions
- [ ] Test all shortcuts
- [ ] Document shortcuts

---

### Substep 4.7.2: Improve Accessibility (2-3 hours)
**File**: `SRC/gui/*.py` (MODIFY)

**What to implement:**

```python
# Add tooltips to all interactive elements
button.setToolTip("Clear all filters")

# Add proper labels
label = QLabel("Playlist File:")
input_field.setAccessibleName("Playlist file input")

# Add keyboard navigation hints
widget.setFocusPolicy(Qt.TabFocus)
```

**Implementation Checklist**:
- [ ] Add tooltips to all widgets
- [ ] Add accessible names
- [ ] Improve keyboard navigation
- [ ] Test with screen reader

---

### Substep 4.7.3: Add Shortcuts Help Dialog (1-2 hours)
**File**: `SRC/gui/dialogs.py` (MODIFY)

**What to implement:**

```python
def show_shortcuts_dialog(self):
    """Show keyboard shortcuts dialog"""
    shortcuts = {
        "File Operations": [
            ("Ctrl+O", "Open playlist file"),
            ("Ctrl+E", "Export results"),
        ],
        "Processing": [
            ("F5", "Start processing"),
            ("Esc", "Cancel processing"),
        ],
        # ... more shortcuts
    ]
    
    # Display in dialog
```

**Implementation Checklist**:
- [ ] Create shortcuts dialog
- [ ] Add to Help menu
- [ ] Test dialog

---

## Comprehensive Testing (1-2 days)

**Dependencies**: All previous substeps must be completed

#### Part A: Unit Tests (`SRC/test_keyboard_shortcuts.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for keyboard shortcuts and accessibility.

Tests shortcut functionality, accessibility features, and keyboard navigation.
"""

import unittest
from unittest.mock import Mock, patch
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
from PySide6.QtGui import QKeySequence
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.main_window import MainWindow

class TestKeyboardShortcuts(unittest.TestCase):
    """Comprehensive tests for keyboard shortcuts"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.window = MainWindow()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.window.close()
    
    def test_open_file_shortcut(self):
        """Test Ctrl+O opens file dialog"""
        with patch('SRC.gui.main_window.QFileDialog.getOpenFileName') as mock_dialog:
            mock_dialog.return_value = ("test.xml", "")
            
            # Simulate Ctrl+O
            QTest.keySequence(self.window, QKeySequence("Ctrl+O"))
            QApplication.processEvents()
            
            # Verify file dialog was called
            mock_dialog.assert_called()
    
    def test_export_shortcut(self):
        """Test Ctrl+E triggers export"""
        with patch.object(self.window, 'on_export_results') as mock_export:
            # Simulate Ctrl+E
            QTest.keySequence(self.window, QKeySequence("Ctrl+E"))
            QApplication.processEvents()
            
            # Verify export was called
            mock_export.assert_called()
    
    def test_start_processing_shortcut(self):
        """Test F5 starts processing"""
        with patch.object(self.window, 'start_processing') as mock_start:
            # Simulate F5
            QTest.keyPress(self.window, Qt.Key_F5)
            QApplication.processEvents()
            
            # Verify start processing was called
            mock_start.assert_called()
    
    def test_cancel_shortcut(self):
        """Test Esc cancels processing"""
        # Start processing first
        self.window.start_processing()
        
        # Simulate Esc
        QTest.keyPress(self.window, Qt.Key_Escape)
        QApplication.processEvents()
        
        # Verify processing was cancelled
        # This would check the actual cancel logic
    
    def test_help_shortcut(self):
        """Test F1 shows help"""
        with patch.object(self.window, 'show_help') as mock_help:
            # Simulate F1
            QTest.keyPress(self.window, Qt.Key_F1)
            QApplication.processEvents()
            
            # Verify help was shown
            mock_help.assert_called()
    
    def test_fullscreen_shortcut(self):
        """Test F11 toggles fullscreen"""
        initial_state = self.window.isFullScreen()
        
        # Simulate F11
        QTest.keyPress(self.window, Qt.Key_F11)
        QApplication.processEvents()
        
        # Verify fullscreen toggled
        self.assertNotEqual(self.window.isFullScreen(), initial_state)
    
    def test_shortcut_conflicts(self):
        """Test that shortcuts don't conflict"""
        # Get all shortcuts
        shortcuts = self.window.findChildren(QShortcut)
        key_sequences = [s.key().toString() for s in shortcuts]
        
        # Check for duplicates
        self.assertEqual(len(key_sequences), len(set(key_sequences)), 
                        "Duplicate keyboard shortcuts found")

if __name__ == '__main__':
    unittest.main()
```

#### Part B: Accessibility Tests (`SRC/test_accessibility.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Accessibility tests for GUI components.

Tests tooltips, accessible names, keyboard navigation, and screen reader support.
"""

import unittest
from PySide6.QtWidgets import QApplication, QPushButton, QLineEdit, QLabel
from PySide6.QtCore import Qt
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.main_window import MainWindow
from SRC.gui.config_panel import ConfigPanel

class TestAccessibility(unittest.TestCase):
    """Tests for accessibility features"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.window = MainWindow()
        self.config_panel = ConfigPanel()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.window.close()
        self.config_panel.close()
    
    def test_all_buttons_have_tooltips(self):
        """Test that all buttons have tooltips"""
        buttons = self.window.findChildren(QPushButton)
        
        for button in buttons:
            if button.isVisible() and button.isEnabled():
                tooltip = button.toolTip()
                self.assertIsNotNone(tooltip, 
                                   f"Button '{button.text()}' missing tooltip")
                self.assertGreater(len(tooltip), 0,
                                 f"Button '{button.text()}' has empty tooltip")
    
    def test_all_inputs_have_labels(self):
        """Test that all input fields have accessible names"""
        inputs = self.window.findChildren(QLineEdit)
        
        for input_field in inputs:
            if input_field.isVisible():
                accessible_name = input_field.accessibleName()
                # Should have accessible name or be associated with a label
                self.assertTrue(
                    accessible_name or input_field.placeholderText(),
                    f"Input field missing accessible name"
                )
    
    def test_keyboard_navigation(self):
        """Test that all widgets are keyboard navigable"""
        widgets = self.window.findChildren(QWidget)
        
        for widget in widgets:
            if widget.isVisible() and widget.isEnabled():
                focus_policy = widget.focusPolicy()
                # Should be focusable if it's an interactive element
                if isinstance(widget, (QPushButton, QLineEdit)):
                    self.assertNotEqual(focus_policy, Qt.NoFocus,
                                      f"Widget '{widget}' should be focusable")
    
    def test_screen_reader_labels(self):
        """Test that widgets have proper labels for screen readers"""
        # Test that labels are properly associated with inputs
        labels = self.window.findChildren(QLabel)
        
        for label in labels:
            if label.isVisible():
                # Label should have text or be associated with a widget
                self.assertTrue(
                    label.text() or label.buddy(),
                    f"Label missing text or buddy widget"
                )

if __name__ == '__main__':
    unittest.main()
```

#### Part C: Manual Testing Checklist

**Keyboard Shortcuts Testing**:
- [ ] Ctrl+O opens file dialog
- [ ] Ctrl+E triggers export
- [ ] Ctrl+S saves (if implemented)
- [ ] F5 starts processing
- [ ] Esc cancels processing
- [ ] F1 shows help
- [ ] F11 toggles fullscreen
- [ ] Tab navigates between widgets
- [ ] Shift+Tab navigates backwards
- [ ] Enter activates buttons/actions
- [ ] Space activates checkboxes/buttons
- [ ] Arrow keys navigate lists/tables
- [ ] All shortcuts work in all contexts
- [ ] No shortcut conflicts
- [ ] Shortcuts documented in help dialog

**Accessibility Testing**:
- [ ] All buttons have tooltips
- [ ] All inputs have labels or accessible names
- [ ] All widgets are keyboard navigable
- [ ] Tab order is logical
- [ ] Focus indicators are visible
- [ ] Screen reader can read all text
- [ ] Color contrast is sufficient
- [ ] Text is readable at different sizes
- [ ] Icons have text alternatives
- [ ] Error messages are clear
- [ ] Status messages are announced

**User Experience Testing**:
- [ ] Power users can navigate efficiently
- [ ] Keyboard-only users can use all features
- [ ] Screen reader users can access all features
- [ ] Shortcuts are intuitive
- [ ] Help dialog is comprehensive
- [ ] Tooltips are helpful
- [ ] Navigation is logical

**Cross-Step Integration Testing**:
- [ ] Shortcuts work with Step 4.1 (Enhanced Export)
- [ ] Shortcuts work with Step 4.2 (Advanced Filtering)
  - Note: Advanced filters are now available in both ResultsView and HistoryView
  - Consider shortcuts for focusing on specific filter controls (year, BPM, key)
  - Shortcuts should work in both single and batch mode tabs
- [ ] Shortcuts work with Step 4.3 (Async I/O)
- [ ] Shortcuts work with Database Integration (if implemented as future feature)
- [ ] Shortcuts work with Batch Processing Enhancements (if implemented as future feature)

**Acceptance Criteria Verification**:
- ✅ Keyboard shortcuts work
- ✅ Accessibility improved
- ✅ Shortcuts documented
- ✅ All widgets accessible
- ✅ Keyboard navigation works
- ✅ Screen reader support works
- ✅ All tests passing
- ✅ Manual testing complete

---

## Error Handling

### Error Scenarios
1. **Shortcut Conflicts**: Handle conflicting shortcuts
2. **Accessibility Issues**: Ensure all features accessible

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Existing functionality unchanged
- [ ] Shortcuts are additions
- [ ] No breaking changes

---

## Documentation Requirements

### User Guide Updates
- [ ] Document all shortcuts
- [ ] Document accessibility features
- [ ] Update help dialog

---

## Acceptance Criteria
- ✅ Keyboard shortcuts work
- ✅ Accessibility improved
- ✅ Shortcuts documented
- ✅ All tests passing

---

## Implementation Checklist Summary
- [ ] Substep 4.7.1: Add Keyboard Shortcuts
- [ ] Substep 4.7.2: Improve Accessibility
- [ ] Substep 4.7.3: Add Shortcuts Help Dialog
- [ ] Testing
- [ ] Documentation updated

---

**IMPORTANT**: Only implement this step if users request keyboard shortcuts or accessibility features.

**Next Step**: After evaluation, proceed to other Phase 4 steps or Phase 5 if Phase 4 is complete.

