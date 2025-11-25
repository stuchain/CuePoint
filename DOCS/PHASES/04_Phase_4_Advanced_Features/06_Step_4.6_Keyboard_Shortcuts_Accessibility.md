# Step 4.6: Keyboard Shortcuts and Accessibility (OPTIONAL)

**Status**: 📝 Planned (Evaluate Need Based on User Requests)  
**Priority**: 🚀 Low Priority (Only if users request accessibility features)  
**Estimated Duration**: 4-6 days (comprehensive implementation with discoverability features)  
**Dependencies**: Phase 1 (GUI), Phase 2 (User Experience), Phase 4.1 (Enhanced Export), Phase 4.2 (Advanced Filtering)

## Goal
Add comprehensive keyboard shortcuts and accessibility improvements to make the application more usable for power users and users with accessibility needs. This includes context-aware shortcuts, customizable key bindings, and full accessibility compliance (WCAG 2.1 AA standards).

## Success Criteria
- [ ] Comprehensive keyboard shortcuts for all major actions
- [ ] Context-aware shortcuts (different shortcuts in different views)
- [ ] Customizable keyboard shortcuts (user can remap keys)
- [ ] Shortcuts documented in Help menu and tooltips
- [ ] Full keyboard navigation support (no mouse required)
- [ ] Accessibility improvements (WCAG 2.1 AA compliance)
- [ ] Screen reader support (proper ARIA labels)
- [ ] High contrast mode support
- [ ] Font scaling support
- [ ] Focus indicators visible
- [ ] All features tested with accessibility tools
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Existing**: Basic keyboard support (standard Qt shortcuts: Ctrl+O, Ctrl+E, F11, F1)
- **Existing**: KeyboardShortcutsDialog already implemented
- **Limitations**: 
  - No context-aware shortcuts
  - No customizable shortcuts
  - Limited accessibility features
  - No high contrast mode
  - No font scaling
  - Incomplete keyboard navigation
- **Opportunity**: 
  - Add comprehensive shortcut system
  - Improve accessibility for all users
  - Support power users with efficient workflows
  - Make application usable for users with disabilities
- **Risk**: Low risk, mostly UI improvements, but requires thorough testing

### Shortcut Design Philosophy

**Principles**:
1. **Consistency**: Use standard shortcuts where possible (Ctrl+O for Open, Ctrl+S for Save, etc.)
2. **Discoverability**: Shortcuts visible in menus and tooltips
3. **Context-Aware**: Different shortcuts in different contexts (results table vs. main window)
4. **Customizable**: Users can remap shortcuts to their preferences
5. **Non-Conflicting**: No duplicate shortcuts
6. **Platform-Aware**: Adapt to platform conventions (Cmd on macOS, Ctrl on Windows/Linux)

### Complete Shortcut Mapping

#### Global Shortcuts (Available Everywhere)
- **Ctrl+O** (Cmd+O on macOS): Open XML file
- **Ctrl+E** (Cmd+E on macOS): Export results
- **Ctrl+Q** (Cmd+Q on macOS): Quit application
- **F1**: Show user guide / Help
- **F11**: Toggle fullscreen
- **Ctrl+?** (Cmd+? on macOS): Show keyboard shortcuts dialog
- **Esc**: Cancel current operation / Close dialog

#### Main Window Shortcuts
- **Ctrl+N** (Cmd+N on macOS): New session (clear results)
- **Ctrl+S** (Cmd+S on macOS): Save settings
- **F5**: Start processing
- **Ctrl+R** (Cmd+R on macOS): Restart processing
- **Tab / Shift+Tab**: Navigate between widgets
- **Enter**: Activate focused button / Confirm dialog
- **Space**: Toggle checkbox / Activate button

#### Results View Shortcuts
- **Ctrl+F** (Cmd+F on macOS): Focus search box
- **Ctrl+Shift+F** (Cmd+Shift+F on macOS): Clear all filters
- **Ctrl+Y** (Cmd+Y on macOS): Focus year filter
- **Ctrl+B** (Cmd+B on macOS): Focus BPM filter
- **Ctrl+K** (Cmd+K on macOS): Focus key filter
- **Ctrl+A** (Cmd+A on macOS): Select all results
- **Ctrl+C** (Cmd+C on macOS): Copy selected results
- **Ctrl+V** (Cmd+V on macOS): Paste (if applicable)
- **Up/Down Arrow**: Navigate table rows
- **Left/Right Arrow**: Navigate table columns
- **Home**: First row
- **End**: Last row
- **Page Up/Down**: Navigate pages
- **Enter**: View candidates for selected row
- **Delete**: Remove selected row (if allowed)
- **Ctrl+Click**: Multi-select rows
- **Shift+Click**: Range select rows

#### Batch Processing Shortcuts
- **Ctrl+B** (Cmd+B on macOS): Open batch processor
- **Ctrl+P** (Cmd+P on macOS): Pause batch processing
- **Ctrl+Shift+P** (Cmd+Shift+P on macOS): Resume batch processing
- **Ctrl+Shift+C** (Cmd+Shift+C on macOS): Cancel batch processing

#### Settings/Configuration Shortcuts
- **Ctrl+,** (Cmd+, on macOS): Open settings
- **Ctrl+Shift+S** (Cmd+Shift+S on macOS): Save settings
- **Ctrl+Shift+R** (Cmd+Shift+R on macOS): Reset to defaults

#### History View Shortcuts
- **Ctrl+H** (Cmd+H on macOS): Show/hide history view
- **Ctrl+Shift+H** (Cmd+Shift+H on macOS): Clear history
- **Up/Down Arrow**: Navigate history items
- **Enter**: Load selected history item

#### Export Dialog Shortcuts
- **Ctrl+E** (Cmd+E on macOS): Open export dialog
- **Tab / Shift+Tab**: Navigate export options
- **Enter**: Confirm export
- **Esc**: Cancel export

#### Candidate Dialog Shortcuts
- **Up/Down Arrow**: Navigate candidates
- **Enter**: Select candidate
- **Esc**: Close dialog
- **Ctrl+Enter** (Cmd+Enter on macOS): Select and close

---

## Implementation Steps

### Substep 4.6.1: Create Shortcut Manager System (1 day)

**Goal**: Create a centralized shortcut management system with context awareness and customization.

**File**: `SRC/gui/shortcut_manager.py` (NEW)

**What to implement:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Keyboard Shortcut Manager

Centralized system for managing keyboard shortcuts with context awareness
and customization support.
"""

from typing import Dict, Optional, Callable, List, Tuple
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtCore import Qt, QObject, Signal
from PySide6.QtWidgets import QWidget
import json
import os
from pathlib import Path


class ShortcutContext:
    """Context for keyboard shortcuts"""
    GLOBAL = "global"
    MAIN_WINDOW = "main_window"
    RESULTS_VIEW = "results_view"
    BATCH_PROCESSOR = "batch_processor"
    SETTINGS = "settings"
    HISTORY_VIEW = "history_view"
    EXPORT_DIALOG = "export_dialog"
    CANDIDATE_DIALOG = "candidate_dialog"


class ShortcutManager(QObject):
    """Manages keyboard shortcuts with context awareness and customization"""
    
    shortcut_conflict = Signal(str, str)  # Emitted when shortcuts conflict
    
    # Default shortcuts by context
    DEFAULT_SHORTCUTS = {
        ShortcutContext.GLOBAL: {
            "open_file": ("Ctrl+O", "Open XML file"),
            "export_results": ("Ctrl+E", "Export results"),
            "quit": ("Ctrl+Q", "Quit application"),
            "help": ("F1", "Show help"),
            "shortcuts": ("Ctrl+?", "Show keyboard shortcuts"),
            "fullscreen": ("F11", "Toggle fullscreen"),
            "cancel": ("Esc", "Cancel operation"),
        },
        ShortcutContext.MAIN_WINDOW: {
            "new_session": ("Ctrl+N", "New session"),
            "save_settings": ("Ctrl+S", "Save settings"),
            "start_processing": ("F5", "Start processing"),
            "restart_processing": ("Ctrl+R", "Restart processing"),
        },
        ShortcutContext.RESULTS_VIEW: {
            "focus_search": ("Ctrl+F", "Focus search box"),
            "clear_filters": ("Ctrl+Shift+F", "Clear all filters"),
            "focus_year_filter": ("Ctrl+Y", "Focus year filter"),
            "focus_bpm_filter": ("Ctrl+B", "Focus BPM filter"),
            "focus_key_filter": ("Ctrl+K", "Focus key filter"),
            "select_all": ("Ctrl+A", "Select all"),
            "copy": ("Ctrl+C", "Copy selected"),
            "view_candidates": ("Enter", "View candidates"),
        },
        ShortcutContext.BATCH_PROCESSOR: {
            "open_batch": ("Ctrl+B", "Open batch processor"),
            "pause": ("Ctrl+P", "Pause processing"),
            "resume": ("Ctrl+Shift+P", "Resume processing"),
            "cancel": ("Ctrl+Shift+C", "Cancel processing"),
        },
        ShortcutContext.SETTINGS: {
            "open_settings": ("Ctrl+,", "Open settings"),
            "save_settings": ("Ctrl+Shift+S", "Save settings"),
            "reset_defaults": ("Ctrl+Shift+R", "Reset to defaults"),
        },
        ShortcutContext.HISTORY_VIEW: {
            "toggle_history": ("Ctrl+H", "Toggle history view"),
            "clear_history": ("Ctrl+Shift+H", "Clear history"),
            "load_item": ("Enter", "Load history item"),
        },
        ShortcutContext.EXPORT_DIALOG: {
            "confirm": ("Enter", "Confirm export"),
            "cancel": ("Esc", "Cancel export"),
        },
        ShortcutContext.CANDIDATE_DIALOG: {
            "select": ("Enter", "Select candidate"),
            "select_and_close": ("Ctrl+Enter", "Select and close"),
            "cancel": ("Esc", "Close dialog"),
        },
    }
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.parent_widget = parent
        self.shortcuts: Dict[str, QShortcut] = {}
        self.shortcut_actions: Dict[str, Callable] = {}
        self.custom_shortcuts: Dict[str, str] = {}
        self.current_context = ShortcutContext.GLOBAL
        self.config_path = Path.home() / ".cuepoint" / "shortcuts.json"
        self.load_custom_shortcuts()
    
    def register_shortcut(
        self,
        action_id: str,
        default_sequence: str,
        callback: Callable,
        context: str = ShortcutContext.GLOBAL,
        description: str = ""
    ):
        """
        Register a keyboard shortcut.
        
        Args:
            action_id: Unique identifier for the action
            default_sequence: Default key sequence (e.g., "Ctrl+O")
            callback: Function to call when shortcut is activated
            context: Context where shortcut is active
            description: Human-readable description
        """
        # Use custom shortcut if available, otherwise use default
        sequence = self.custom_shortcuts.get(action_id, default_sequence)
        
        # Adapt for platform (Cmd on macOS, Ctrl on others)
        sequence = self._adapt_for_platform(sequence)
        
        # Create shortcut
        shortcut = QShortcut(QKeySequence(sequence), self.parent_widget)
        shortcut.setContext(Qt.WidgetShortcut)  # Only active when widget has focus
        
        # Store callback
        self.shortcut_actions[action_id] = callback
        shortcut.activated.connect(callback)
        
        # Store shortcut
        self.shortcuts[action_id] = shortcut
        
        # Check for conflicts
        self._check_conflicts(action_id, sequence)
    
    def _adapt_for_platform(self, sequence: str) -> str:
        """Adapt key sequence for platform (Cmd on macOS, Ctrl on others)"""
        import sys
        if sys.platform == "darwin":  # macOS
            return sequence.replace("Ctrl+", "Meta+")
        return sequence
    
    def _check_conflicts(self, action_id: str, sequence: str):
        """Check for shortcut conflicts"""
        for other_id, other_shortcut in self.shortcuts.items():
            if other_id != action_id:
                if other_shortcut.key().toString() == sequence:
                    self.shortcut_conflict.emit(action_id, other_id)
    
    def set_context(self, context: str):
        """Set the current context for shortcuts"""
        self.current_context = context
        # Enable/disable shortcuts based on context
        for action_id, shortcut in self.shortcuts.items():
            # This would need context mapping logic
            pass
    
    def get_shortcut(self, action_id: str) -> Optional[QShortcut]:
        """Get shortcut by action ID"""
        return self.shortcuts.get(action_id)
    
    def get_shortcut_sequence(self, action_id: str) -> str:
        """Get key sequence for an action"""
        shortcut = self.shortcuts.get(action_id)
        if shortcut:
            return shortcut.key().toString()
        return ""
    
    def set_custom_shortcut(self, action_id: str, sequence: str) -> bool:
        """
        Set a custom shortcut for an action.
        
        Returns:
            True if successful, False if conflict
        """
        # Check for conflicts
        for other_id, other_shortcut in self.shortcuts.items():
            if other_id != action_id:
                if other_shortcut.key().toString() == sequence:
                    return False  # Conflict
        
        # Update shortcut
        if action_id in self.shortcuts:
            self.shortcuts[action_id].setKey(QKeySequence(sequence))
            self.custom_shortcuts[action_id] = sequence
            self.save_custom_shortcuts()
            return True
        return False
    
    def reset_shortcut(self, action_id: str):
        """Reset shortcut to default"""
        if action_id in self.custom_shortcuts:
            del self.custom_shortcuts[action_id]
            # Restore default
            if action_id in self.DEFAULT_SHORTCUTS.get(self.current_context, {}):
                default = self.DEFAULT_SHORTCUTS[self.current_context][action_id][0]
                self.set_custom_shortcut(action_id, default)
            self.save_custom_shortcuts()
    
    def get_all_shortcuts(self) -> Dict[str, Tuple[str, str]]:
        """Get all shortcuts with descriptions"""
        all_shortcuts = {}
        for context, shortcuts in self.DEFAULT_SHORTCUTS.items():
            for action_id, (sequence, description) in shortcuts.items():
                # Use custom if available
                sequence = self.custom_shortcuts.get(action_id, sequence)
                all_shortcuts[action_id] = (sequence, description)
        return all_shortcuts
    
    def load_custom_shortcuts(self):
        """Load custom shortcuts from file"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    self.custom_shortcuts = json.load(f)
            except Exception as e:
                print(f"Error loading shortcuts: {e}")
    
    def save_custom_shortcuts(self):
        """Save custom shortcuts to file"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.custom_shortcuts, f, indent=2)
        except Exception as e:
            print(f"Error saving shortcuts: {e}")
```

**Implementation Checklist**:
- [ ] Create `SRC/gui/shortcut_manager.py`
- [ ] Implement ShortcutManager class
- [ ] Implement context-aware shortcuts
- [ ] Implement custom shortcut support
- [ ] Implement shortcut persistence
- [ ] Test shortcut registration
- [ ] Test conflict detection
- [ ] Test platform adaptation

---

### Substep 4.6.2: Integrate Shortcuts into Main Window (1 day)

**Goal**: Integrate shortcut manager into main window and all major components.

**Files**: `SRC/gui/main_window.py` (MODIFY), `SRC/gui/results_view.py` (MODIFY), `SRC/gui/batch_processor.py` (MODIFY), etc.

**What to implement:**

```python
# In SRC/gui/main_window.py

from gui.shortcut_manager import ShortcutManager, ShortcutContext

class MainWindow(QMainWindow):
    """Main application window with comprehensive keyboard shortcuts"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        # Create shortcut manager
        self.shortcut_manager = ShortcutManager(self)
        self.shortcut_manager.shortcut_conflict.connect(self.on_shortcut_conflict)
        
        self.init_ui()
        self.setup_shortcuts()
        self.setup_connections()
    
    def setup_shortcuts(self):
        """Setup all keyboard shortcuts"""
        # Global shortcuts
        self.shortcut_manager.register_shortcut(
            "open_file",
            "Ctrl+O",
            self.on_open_file,
            ShortcutContext.GLOBAL,
            "Open XML file"
        )
        
        self.shortcut_manager.register_shortcut(
            "export_results",
            "Ctrl+E",
            self.on_export_results,
            ShortcutContext.GLOBAL,
            "Export results"
        )
        
        self.shortcut_manager.register_shortcut(
            "quit",
            "Ctrl+Q",
            self.close,
            ShortcutContext.GLOBAL,
            "Quit application"
        )
        
        self.shortcut_manager.register_shortcut(
            "help",
            "F1",
            self.on_show_user_guide,
            ShortcutContext.GLOBAL,
            "Show help"
        )
        
        self.shortcut_manager.register_shortcut(
            "shortcuts",
            "Ctrl+?",
            self.on_show_shortcuts,
            ShortcutContext.GLOBAL,
            "Show keyboard shortcuts"
        )
        
        self.shortcut_manager.register_shortcut(
            "fullscreen",
            "F11",
            self.toggle_fullscreen,
            ShortcutContext.GLOBAL,
            "Toggle fullscreen"
        )
        
        # Main window shortcuts
        self.shortcut_manager.register_shortcut(
            "new_session",
            "Ctrl+N",
            self.on_new_session,
            ShortcutContext.MAIN_WINDOW,
            "New session"
        )
        
        self.shortcut_manager.register_shortcut(
            "start_processing",
            "F5",
            self.on_start_processing,
            ShortcutContext.MAIN_WINDOW,
            "Start processing"
        )
        
        self.shortcut_manager.register_shortcut(
            "restart_processing",
            "Ctrl+R",
            self.on_restart_processing,
            ShortcutContext.MAIN_WINDOW,
            "Restart processing"
        )
        
        # Settings shortcuts
        self.shortcut_manager.register_shortcut(
            "open_settings",
            "Ctrl+,",
            self.on_open_settings,
            ShortcutContext.SETTINGS,
            "Open settings"
        )
    
    def on_shortcut_conflict(self, action_id1: str, action_id2: str):
        """Handle shortcut conflicts"""
        QMessageBox.warning(
            self,
            "Shortcut Conflict",
            f"Shortcut conflict detected between '{action_id1}' and '{action_id2}'"
        )
    
    def on_new_session(self):
        """Start a new session (clear results)"""
        reply = QMessageBox.question(
            self,
            "New Session",
            "Clear all results and start a new session?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.results_view.clear_results()
            self.progress_widget.reset()
    
    def on_restart_processing(self):
        """Restart processing"""
        if self.controller.is_processing():
            self.controller.cancel_processing()
        self.on_start_processing()
```

**In Results View:**

```python
# In SRC/gui/results_view.py

class ResultsView(QWidget):
    """Results view with keyboard shortcuts"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.shortcut_manager = ShortcutManager(self)
        self.init_ui()
        self.setup_shortcuts()
    
    def setup_shortcuts(self):
        """Setup results view shortcuts"""
        self.shortcut_manager.register_shortcut(
            "focus_search",
            "Ctrl+F",
            self.focus_search_box,
            ShortcutContext.RESULTS_VIEW,
            "Focus search box"
        )
        
        self.shortcut_manager.register_shortcut(
            "clear_filters",
            "Ctrl+Shift+F",
            self.clear_all_filters,
            ShortcutContext.RESULTS_VIEW,
            "Clear all filters"
        )
        
        self.shortcut_manager.register_shortcut(
            "focus_year_filter",
            "Ctrl+Y",
            lambda: self.year_min.setFocus(),
            ShortcutContext.RESULTS_VIEW,
            "Focus year filter"
        )
        
        self.shortcut_manager.register_shortcut(
            "focus_bpm_filter",
            "Ctrl+B",
            lambda: self.bpm_min.setFocus(),
            ShortcutContext.RESULTS_VIEW,
            "Focus BPM filter"
        )
        
        self.shortcut_manager.register_shortcut(
            "focus_key_filter",
            "Ctrl+K",
            lambda: self.key_filter.setFocus(),
            ShortcutContext.RESULTS_VIEW,
            "Focus key filter"
        )
        
        self.shortcut_manager.register_shortcut(
            "select_all",
            "Ctrl+A",
            self.select_all_results,
            ShortcutContext.RESULTS_VIEW,
            "Select all results"
        )
        
        self.shortcut_manager.register_shortcut(
            "copy",
            "Ctrl+C",
            self.copy_selected,
            ShortcutContext.RESULTS_VIEW,
            "Copy selected results"
        )
        
        self.shortcut_manager.register_shortcut(
            "view_candidates",
            "Enter",
            self.view_selected_candidates,
            ShortcutContext.RESULTS_VIEW,
            "View candidates for selected row"
        )
    
    def focus_search_box(self):
        """Focus the search box"""
        self.search_box.setFocus()
        self.search_box.selectAll()
    
    def clear_all_filters(self):
        """Clear all filters"""
        self.search_box.clear()
        self.year_min.setValue(1900)
        self.year_max.setValue(2100)
        self.bpm_min.setValue(60)
        self.bpm_max.setValue(200)
        self.key_filter.setCurrentIndex(0)
        self.apply_filters()
    
    def select_all_results(self):
        """Select all results in table"""
        self.table.selectAll()
    
    def copy_selected(self):
        """Copy selected results to clipboard"""
        selected = self.table.selectedItems()
        if selected:
            # Copy to clipboard
            text = "\n".join([item.text() for item in selected])
            QApplication.clipboard().setText(text)
    
    def view_selected_candidates(self):
        """View candidates for selected row"""
        selected_rows = self.table.selectionModel().selectedRows()
        if selected_rows:
            row = selected_rows[0].row()
            self.on_row_double_clicked(row, 0)
```

**Implementation Checklist**:
- [ ] Integrate shortcut manager into main window
- [ ] Register all main window shortcuts
- [ ] Integrate into results view
- [ ] Integrate into batch processor
- [ ] Integrate into settings panel
- [ ] Integrate into history view
- [ ] Integrate into dialogs
- [ ] Test all shortcuts work
- [ ] Test context switching

---

### Substep 4.6.3: Create Shortcut Customization Dialog (1 day)

**Goal**: Allow users to customize keyboard shortcuts.

**File**: `SRC/gui/shortcut_customization_dialog.py` (NEW)

**What to implement:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Shortcut Customization Dialog

Allows users to customize keyboard shortcuts.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QPushButton, QLabel, QLineEdit, QMessageBox, QGroupBox, QHeaderView
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QKeySequence, QKeyEvent
from typing import Dict, Tuple, Optional
from gui.shortcut_manager import ShortcutManager


class ShortcutCustomizationDialog(QDialog):
    """Dialog for customizing keyboard shortcuts"""
    
    def __init__(self, shortcut_manager: ShortcutManager, parent=None):
        super().__init__(parent)
        self.shortcut_manager = shortcut_manager
        self.changes: Dict[str, str] = {}
        self.init_ui()
        self.load_shortcuts()
    
    def init_ui(self):
        """Initialize UI"""
        self.setWindowTitle("Customize Keyboard Shortcuts")
        self.setMinimumSize(700, 500)
        
        layout = QVBoxLayout(self)
        
        # Instructions
        instructions = QLabel(
            "Double-click a shortcut to edit it. Press the desired key combination, "
            "then press Enter to confirm or Esc to cancel."
        )
        instructions.setWordWrap(True)
        layout.addWidget(instructions)
        
        # Shortcuts table
        self.table = QTableWidget()
        self.table.setColumnCount(3)
        self.table.setHorizontalHeaderLabels(["Action", "Description", "Shortcut"])
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setAlternatingRowColors(True)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setColumnWidth(0, 200)
        self.table.setColumnWidth(1, 300)
        self.table.doubleClicked.connect(self.on_edit_shortcut)
        layout.addWidget(self.table)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        self.reset_button = QPushButton("Reset Selected")
        self.reset_button.clicked.connect(self.on_reset_selected)
        button_layout.addWidget(self.reset_button)
        
        self.reset_all_button = QPushButton("Reset All")
        self.reset_all_button.clicked.connect(self.on_reset_all)
        button_layout.addWidget(self.reset_all_button)
        
        button_layout.addStretch()
        
        self.save_button = QPushButton("Save")
        self.save_button.clicked.connect(self.on_save)
        button_layout.addWidget(self.save_button)
        
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_button)
        
        layout.addLayout(button_layout)
    
    def load_shortcuts(self):
        """Load shortcuts into table"""
        all_shortcuts = self.shortcut_manager.get_all_shortcuts()
        self.table.setRowCount(len(all_shortcuts))
        
        for row, (action_id, (sequence, description)) in enumerate(all_shortcuts.items()):
            self.table.setItem(row, 0, QTableWidgetItem(action_id))
            self.table.setItem(row, 1, QTableWidgetItem(description))
            self.table.setItem(row, 2, QTableWidgetItem(sequence))
            self.table.item(row, 2).setData(Qt.UserRole, action_id)  # Store action ID
    
    def on_edit_shortcut(self, index):
        """Edit shortcut for selected row"""
        if index.column() != 2:  # Only edit shortcut column
            return
        
        action_id = self.table.item(index.row(), 0).text()
        current_shortcut = self.table.item(index.row(), 2).text()
        
        # Create input dialog
        dialog = ShortcutInputDialog(current_shortcut, self)
        if dialog.exec() == QDialog.Accepted:
            new_shortcut = dialog.get_shortcut()
            if new_shortcut:
                # Check for conflicts
                if self.check_conflict(action_id, new_shortcut):
                    QMessageBox.warning(
                        self,
                        "Conflict",
                        f"Shortcut '{new_shortcut}' is already in use."
                    )
                    return
                
                # Update table
                self.table.setItem(index.row(), 2, QTableWidgetItem(new_shortcut))
                self.changes[action_id] = new_shortcut
    
    def check_conflict(self, action_id: str, sequence: str) -> bool:
        """Check if shortcut conflicts with another"""
        for row in range(self.table.rowCount()):
            other_action_id = self.table.item(row, 0).text()
            other_sequence = self.table.item(row, 2).text()
            if other_action_id != action_id and other_sequence == sequence:
                return True
        return False
    
    def on_reset_selected(self):
        """Reset selected shortcut to default"""
        selected = self.table.selectedItems()
        if selected:
            row = selected[0].row()
            action_id = self.table.item(row, 0).text()
            # Get default from shortcut manager
            default = self.shortcut_manager.DEFAULT_SHORTCUTS.get(
                self.shortcut_manager.current_context, {}
            ).get(action_id, ("", ""))[0]
            if default:
                self.table.setItem(row, 2, QTableWidgetItem(default))
                if action_id in self.changes:
                    del self.changes[action_id]
    
    def on_reset_all(self):
        """Reset all shortcuts to defaults"""
        reply = QMessageBox.question(
            self,
            "Reset All",
            "Reset all shortcuts to defaults?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.changes.clear()
            self.load_shortcuts()
    
    def on_save(self):
        """Save changes"""
        for action_id, sequence in self.changes.items():
            if not self.shortcut_manager.set_custom_shortcut(action_id, sequence):
                QMessageBox.warning(
                    self,
                    "Error",
                    f"Failed to set shortcut for '{action_id}'"
                )
                return
        
        QMessageBox.information(self, "Saved", "Shortcuts saved successfully.")
        self.accept()


class ShortcutInputDialog(QDialog):
    """Dialog for inputting a keyboard shortcut"""
    
    def __init__(self, current_shortcut: str, parent=None):
        super().__init__(parent)
        self.current_shortcut = current_shortcut
        self.new_shortcut = ""
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI"""
        self.setWindowTitle("Edit Shortcut")
        self.setModal(True)
        
        layout = QVBoxLayout(self)
        
        # Instructions
        instructions = QLabel("Press the key combination you want to use:")
        layout.addWidget(instructions)
        
        # Input field
        self.input_field = QLineEdit()
        self.input_field.setReadOnly(True)
        self.input_field.setText(self.current_shortcut)
        self.input_field.setPlaceholderText("Press keys...")
        self.input_field.keyPressEvent = self.on_key_press
        layout.addWidget(self.input_field)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        ok_button = QPushButton("OK")
        ok_button.clicked.connect(self.accept)
        button_layout.addWidget(ok_button)
        
        cancel_button = QPushButton("Cancel")
        cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(cancel_button)
        
        layout.addLayout(button_layout)
    
    def on_key_press(self, event: QKeyEvent):
        """Handle key press"""
        key = event.key()
        modifiers = event.modifiers()
        
        # Build shortcut string
        parts = []
        if modifiers & Qt.ControlModifier:
            parts.append("Ctrl")
        if modifiers & Qt.AltModifier:
            parts.append("Alt")
        if modifiers & Qt.ShiftModifier:
            parts.append("Shift")
        if modifiers & Qt.MetaModifier:
            parts.append("Meta")
        
        # Get key name
        key_name = QKeySequence(key).toString()
        if key_name:
            parts.append(key_name)
            self.new_shortcut = "+".join(parts)
            self.input_field.setText(self.new_shortcut)
    
    def get_shortcut(self) -> str:
        """Get the entered shortcut"""
        return self.new_shortcut if self.new_shortcut else self.current_shortcut
```

**Implementation Checklist**:
- [ ] Create shortcut customization dialog
- [ ] Create shortcut input dialog
- [ ] Implement conflict detection
- [ ] Implement reset functionality
- [ ] Test customization
- [ ] Test persistence
- [ ] Add to settings menu

---

### Substep 4.6.4: Comprehensive Accessibility Improvements (1-2 days)

**Goal**: Implement comprehensive accessibility features (WCAG 2.1 AA compliance).

**Files**: All GUI files (MODIFY)

**What to implement:**

#### A. Tooltips and Accessible Names

```python
# Add to all interactive widgets

# Buttons
button = QPushButton("Process")
button.setToolTip("Start processing the selected playlist")
button.setAccessibleName("Start processing button")
button.setAccessibleDescription("Click to start processing the selected playlist")

# Input fields
input_field = QLineEdit()
input_field.setPlaceholderText("Enter search term")
input_field.setAccessibleName("Search input field")
input_field.setAccessibleDescription("Enter text to search for tracks")
input_field.setToolTip("Search for tracks by title, artist, or Beatport data")

# Labels (associate with inputs)
label = QLabel("Playlist File:")
input_field = QLineEdit()
label.setBuddy(input_field)  # Associate label with input
```

#### B. Keyboard Navigation

```python
# Set focus policies
widget.setFocusPolicy(Qt.TabFocus)  # Can receive focus via Tab
widget.setFocusPolicy(Qt.StrongFocus)  # Can receive focus via Tab or mouse
widget.setFocusPolicy(Qt.NoFocus)  # Cannot receive focus

# Set tab order
QWidget.setTabOrder(widget1, widget2)
QWidget.setTabOrder(widget2, widget3)

# Enable keyboard navigation in tables
table.setSelectionBehavior(QTableWidget.SelectRows)
table.setSelectionMode(QTableWidget.ExtendedSelection)
```

#### C. Screen Reader Support

```python
# Set accessible names and descriptions
widget.setAccessibleName("Descriptive name")
widget.setAccessibleDescription("Detailed description for screen readers")

# Set role
widget.setAccessibleRole(Qt.PushButtonRole)
widget.setAccessibleRole(Qt.EditRole)
widget.setAccessibleRole(Qt.TableRole)

# Status messages
status_bar.showMessage("Processing complete", 5000)
status_bar.setAccessibleName("Status bar")
```

#### D. High Contrast Mode

```python
# In styles.py or theme system

def apply_high_contrast_theme():
    """Apply high contrast theme for accessibility"""
    style = """
    QWidget {
        background-color: #000000;
        color: #FFFFFF;
    }
    QPushButton {
        background-color: #000000;
        color: #FFFFFF;
        border: 2px solid #FFFFFF;
    }
    QLineEdit {
        background-color: #000000;
        color: #FFFFFF;
        border: 2px solid #FFFFFF;
    }
    """
    app.setStyleSheet(style)
```

#### E. Font Scaling

```python
# Add font scaling support

class AccessibilitySettings:
    """Accessibility settings"""
    
    def __init__(self):
        self.font_scale = 1.0  # 1.0 = normal, 1.5 = 150%, etc.
    
    def set_font_scale(self, scale: float):
        """Set font scale factor"""
        self.font_scale = scale
        self.apply_font_scale()
    
    def apply_font_scale(self):
        """Apply font scale to application"""
        font = QApplication.font()
        font.setPointSize(int(font.pointSize() * self.font_scale))
        QApplication.setFont(font)
```

#### F. Focus Indicators

```python
# Enhanced focus indicators in stylesheet

style = """
QWidget:focus {
    outline: 2px solid #0066CC;
    outline-offset: 2px;
}

QPushButton:focus {
    border: 2px solid #0066CC;
    background-color: #E3F2FD;
}

QLineEdit:focus {
    border: 2px solid #0066CC;
}
"""
```

#### G. Color Contrast

```python
# Ensure sufficient color contrast (WCAG AA: 4.5:1 for normal text, 3:1 for large text)

# Good contrast examples
GOOD_COLORS = {
    "text": "#000000",  # Black
    "background": "#FFFFFF",  # White
    "accent": "#0066CC",  # Blue
    "error": "#CC0000",  # Red
    "success": "#00AA00",  # Green
}

# Avoid low contrast
BAD_COLORS = {
    "text": "#CCCCCC",  # Light gray on white - low contrast
    "background": "#FFFFFF",
}
```

**Implementation Checklist**:
- [ ] Add tooltips to all widgets
- [ ] Add accessible names to all widgets
- [ ] Associate labels with inputs
- [ ] Set proper focus policies
- [ ] Set logical tab order
- [ ] Implement high contrast mode
- [ ] Implement font scaling
- [ ] Enhance focus indicators
- [ ] Ensure color contrast compliance
- [ ] Test with screen reader
- [ ] Test keyboard-only navigation

---

### Substep 4.6.5: Visual Shortcut Discoverability (1 day)

**Goal**: Make keyboard shortcuts visible and discoverable throughout the UI so users can learn and use them easily.

**Files**: All GUI files (MODIFY)

**What to implement:**

#### A. Show Shortcuts in Menus

```python
# In menu bar - shortcuts are automatically shown next to menu items
# But we can enhance them:

# File menu
open_action = QAction("&Open XML File...", self)
open_action.setShortcut(QKeySequence("Ctrl+O"))
open_action.setToolTip("Open XML file (Ctrl+O)")  # Tooltip shows shortcut
file_menu.addAction(open_action)

# The shortcut will automatically appear in the menu like:
# "Open XML File...    Ctrl+O"
```

#### B. Show Shortcuts in Tooltips

```python
# Enhanced tooltips that include shortcuts
def create_tooltip_with_shortcut(description: str, shortcut: str) -> str:
    """Create tooltip with shortcut information"""
    return f"{description}\n\nShortcut: {shortcut}"

# Usage:
button = QPushButton("Process")
button.setToolTip(create_tooltip_with_shortcut(
    "Start processing the selected playlist",
    "F5"
))

# Result: Tooltip shows:
# "Start processing the selected playlist
# 
# Shortcut: F5"
```

#### C. Show Shortcuts on Buttons (Optional Badge/Overlay)

```python
# Custom button widget that shows shortcut badge
from PySide6.QtWidgets import QPushButton, QLabel
from PySide6.QtCore import Qt
from PySide6.QtGui import QPainter, QFont

class ShortcutButton(QPushButton):
    """Button that displays keyboard shortcut"""
    
    def __init__(self, text: str, shortcut: str = "", parent=None):
        super().__init__(text, parent)
        self.shortcut_text = shortcut
        self.show_shortcut = True
    
    def paintEvent(self, event):
        """Override paint event to draw shortcut badge"""
        super().paintEvent(event)
        
        if self.show_shortcut and self.shortcut_text:
            painter = QPainter(self)
            painter.setRenderHint(QPainter.Antialiasing)
            
            # Draw shortcut badge in top-right corner
            font = QFont()
            font.setPointSize(8)
            painter.setFont(font)
            
            # Calculate badge position
            text_rect = painter.fontMetrics().boundingRect(self.shortcut_text)
            badge_width = text_rect.width() + 8
            badge_height = text_rect.height() + 4
            badge_x = self.width() - badge_width - 4
            badge_y = 4
            
            # Draw badge background
            painter.setBrush(Qt.lightGray)
            painter.setPen(Qt.NoPen)
            painter.drawRoundedRect(
                badge_x, badge_y, badge_width, badge_height, 3, 3
            )
            
            # Draw shortcut text
            painter.setPen(Qt.black)
            painter.drawText(
                badge_x + 4, badge_y + badge_height - 4,
                self.shortcut_text
            )

# Usage:
process_button = ShortcutButton("Process Playlist", "F5")
```

#### D. Contextual Shortcut Hints

```python
# Show contextual hints when user hovers or focuses on elements
class ShortcutHintWidget(QLabel):
    """Widget that shows shortcut hints"""
    
    def __init__(self, shortcut: str, parent=None):
        super().__init__(parent)
        self.shortcut = shortcut
        self.setText(f"💡 Tip: Press {shortcut} for quick access")
        self.setStyleSheet("""
            QLabel {
                background-color: #E3F2FD;
                border: 1px solid #2196F3;
                border-radius: 4px;
                padding: 4px;
                font-size: 11px;
                color: #1976D2;
            }
        """)
        self.setWordWrap(True)

# Show hint when widget gets focus
def on_widget_focused(widget, shortcut):
    """Show shortcut hint when widget receives focus"""
    hint = ShortcutHintWidget(shortcut)
    # Position hint near widget
    # Show for 3 seconds, then fade out
```

#### E. Shortcut Overlay (Press Key to Show)

```python
# Show all available shortcuts when user presses a key (like '?')
class ShortcutOverlay(QWidget):
    """Overlay that shows all shortcuts for current context"""
    
    def __init__(self, shortcut_manager: ShortcutManager, parent=None):
        super().__init__(parent)
        self.shortcut_manager = shortcut_manager
        self.setWindowFlags(Qt.Popup | Qt.FramelessWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.init_ui()
    
    def init_ui(self):
        """Initialize overlay UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        
        # Title
        title = QLabel("Keyboard Shortcuts")
        title.setStyleSheet("font-size: 16px; font-weight: bold;")
        layout.addWidget(title)
        
        # Shortcuts grid
        grid_layout = QGridLayout()
        
        shortcuts = self.shortcut_manager.get_all_shortcuts()
        row = 0
        for action_id, (sequence, description) in shortcuts.items():
            # Only show shortcuts for current context
            if self.is_context_relevant(action_id):
                desc_label = QLabel(description)
                shortcut_label = QLabel(sequence)
                shortcut_label.setStyleSheet("""
                    QLabel {
                        background-color: #F5F5F5;
                        border: 1px solid #CCCCCC;
                        border-radius: 3px;
                        padding: 2px 6px;
                        font-family: monospace;
                    }
                """)
                
                grid_layout.addWidget(desc_label, row, 0)
                grid_layout.addWidget(shortcut_label, row, 1)
                row += 1
        
        layout.addLayout(grid_layout)
        
        # Close hint
        close_hint = QLabel("Press Esc or click outside to close")
        close_hint.setStyleSheet("font-size: 10px; color: #666;")
        layout.addWidget(close_hint)
    
    def show_overlay(self):
        """Show overlay at cursor position"""
        cursor_pos = QCursor.pos()
        self.move(cursor_pos.x(), cursor_pos.y())
        self.show()
        self.raise_()
        self.activateWindow()
    
    def keyPressEvent(self, event):
        """Close on Esc"""
        if event.key() == Qt.Key_Escape:
            self.hide()
        super().keyPressEvent(event)
    
    def mousePressEvent(self, event):
        """Close when clicking outside"""
        if event.button() == Qt.LeftButton:
            self.hide()
        super().mousePressEvent(event)

# In main window:
def keyPressEvent(self, event):
    """Show shortcut overlay when '?' is pressed"""
    if event.key() == Qt.Key_Question and event.modifiers() == Qt.NoModifier:
        if not self.shortcut_overlay.isVisible():
            self.shortcut_overlay.show_overlay()
        else:
            self.shortcut_overlay.hide()
    super().keyPressEvent(event)
```

#### F. Status Bar Shortcut Hints

```python
# Show shortcut hints in status bar
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        
        # Show shortcut hint when widget is focused
        self.setup_status_hints()
    
    def setup_status_hints(self):
        """Setup status bar hints for shortcuts"""
        # Connect focus events to show hints
        self.process_button.focusInEvent = lambda e: self.show_shortcut_hint(
            "Press F5 to start processing", self.process_button.focusInEvent
        )
    
    def show_shortcut_hint(self, hint: str, original_handler=None):
        """Show shortcut hint in status bar"""
        self.status_bar.showMessage(hint, 3000)  # Show for 3 seconds
        if original_handler:
            original_handler()
```

#### G. First-Time User Hints

```python
# Show hints for first-time users
class FirstTimeHints:
    """Manage first-time user hints"""
    
    def __init__(self):
        self.settings = QSettings()
        self.hints_shown = self.settings.value("hints_shown", False, type=bool)
    
    def show_shortcut_hint(self, widget, shortcut, description):
        """Show hint for first-time users"""
        if not self.hints_shown:
            # Show tooltip with hint
            widget.setToolTip(
                f"{description}\n\n"
                f"💡 Tip: You can use {shortcut} as a keyboard shortcut!\n"
                f"(This hint won't show again)"
            )
            
            # Mark as shown after first interaction
            widget.clicked.connect(
                lambda: self.mark_hint_shown(), Qt.UniqueConnection
            )
    
    def mark_hint_shown(self):
        """Mark hints as shown"""
        self.settings.setValue("hints_shown", True)
        self.hints_shown = True
```

#### H. Shortcut Indicator in UI

```python
# Add visual indicator that shortcuts are available
class ShortcutIndicator(QLabel):
    """Small indicator showing shortcuts are available"""
    
    def __init__(self, parent=None):
        super().__init__("⌨️", parent)
        self.setToolTip("Keyboard shortcuts available - Press '?' to see all")
        self.setStyleSheet("""
            QLabel {
                color: #666;
                font-size: 12px;
                padding: 2px;
            }
            QLabel:hover {
                color: #2196F3;
            }
        """)
        self.setCursor(Qt.PointingHandCursor)
        self.mousePressEvent = lambda e: self.show_shortcuts_dialog()
    
    def show_shortcuts_dialog(self):
        """Show shortcuts dialog"""
        # Open shortcuts dialog
        pass

# Add to main window toolbar or status bar
toolbar.addWidget(ShortcutIndicator())
```

#### I. Enhanced Tooltips with Shortcuts

```python
# Helper function to create enhanced tooltips
def create_enhanced_tooltip(base_text: str, shortcut: str = "", 
                           context: str = "") -> str:
    """Create tooltip with shortcut and context information"""
    tooltip = base_text
    
    if shortcut:
        tooltip += f"\n\n⌨️ Shortcut: {shortcut}"
    
    if context:
        tooltip += f"\n\n📍 Context: {context}"
    
    return tooltip

# Usage throughout application:
button.setToolTip(create_enhanced_tooltip(
    "Start processing the selected playlist",
    "F5",
    "Main window"
))
```

#### J. Shortcut Cheat Sheet Widget

```python
# Dockable widget showing shortcuts for current context
class ShortcutCheatSheet(QDockWidget):
    """Dockable widget showing shortcuts"""
    
    def __init__(self, shortcut_manager: ShortcutManager, parent=None):
        super().__init__("Keyboard Shortcuts", parent)
        self.shortcut_manager = shortcut_manager
        self.init_ui()
    
    def init_ui(self):
        """Initialize cheat sheet UI"""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        
        # Context selector
        context_combo = QComboBox()
        context_combo.addItems([
            "Global", "Main Window", "Results View", 
            "Batch Processor", "Settings"
        ])
        context_combo.currentTextChanged.connect(self.update_shortcuts)
        layout.addWidget(context_combo)
        
        # Shortcuts list
        self.shortcuts_list = QListWidget()
        layout.addWidget(self.shortcuts_list)
        
        self.setWidget(widget)
        self.update_shortcuts("Global")
    
    def update_shortcuts(self, context: str):
        """Update shortcuts list for context"""
        self.shortcuts_list.clear()
        # Get shortcuts for context and populate list
        shortcuts = self.shortcut_manager.get_shortcuts_for_context(context)
        for action, sequence in shortcuts.items():
            item = QListWidgetItem(f"{action}: {sequence}")
            self.shortcuts_list.addItem(item)

# Add to main window
shortcut_dock = ShortcutCheatSheet(shortcut_manager, main_window)
main_window.addDockWidget(Qt.RightDockWidgetArea, shortcut_dock)
shortcut_dock.setVisible(False)  # Hidden by default, can be toggled
```

**Implementation Checklist**:
- [ ] Show shortcuts in menu items (automatic with QAction)
- [ ] Add shortcuts to tooltips
- [ ] Create ShortcutButton widget (optional)
- [ ] Implement contextual hints
- [ ] Create shortcut overlay (press '?' to show)
- [ ] Add status bar hints
- [ ] Implement first-time user hints
- [ ] Add shortcut indicator widget
- [ ] Create enhanced tooltip helper
- [ ] Create dockable cheat sheet widget
- [ ] Test all discoverability features
- [ ] Get user feedback on discoverability

---

### Substep 4.6.6: Enhanced Shortcuts Help Dialog (4-6 hours)

**Goal**: Enhance the existing shortcuts dialog with more information and better organization.

**File**: `SRC/gui/dialogs.py` (MODIFY)

**What to implement:**

```python
# Enhance KeyboardShortcutsDialog

class KeyboardShortcutsDialog(QDialog):
    """Enhanced keyboard shortcuts dialog"""
    
    def __init__(self, shortcut_manager: ShortcutManager, parent=None):
        super().__init__(parent)
        self.shortcut_manager = shortcut_manager
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI with enhanced features"""
        self.setWindowTitle("Keyboard Shortcuts - CuePoint")
        self.setMinimumSize(800, 600)
        self.setModal(True)
        
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 10, 10, 10)
        
        # Title
        title_label = QLabel("Keyboard Shortcuts")
        title_label.setStyleSheet("font-size: 18px; font-weight: bold;")
        layout.addWidget(title_label)
        
        # Search box
        search_layout = QHBoxLayout()
        search_label = QLabel("Search:")
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search shortcuts...")
        self.search_box.textChanged.connect(self.filter_shortcuts)
        search_layout.addWidget(search_label)
        search_layout.addWidget(self.search_box)
        layout.addLayout(search_layout)
        
        # Context tabs
        self.tabs = QTabWidget()
        
        # Global shortcuts tab
        global_tab = self.create_shortcuts_table(ShortcutContext.GLOBAL)
        self.tabs.addTab(global_tab, "Global")
        
        # Main window tab
        main_tab = self.create_shortcuts_table(ShortcutContext.MAIN_WINDOW)
        self.tabs.addTab(main_tab, "Main Window")
        
        # Results view tab
        results_tab = self.create_shortcuts_table(ShortcutContext.RESULTS_VIEW)
        self.tabs.addTab(results_tab, "Results View")
        
        # Batch processor tab
        batch_tab = self.create_shortcuts_table(ShortcutContext.BATCH_PROCESSOR)
        self.tabs.addTab(batch_tab, "Batch Processor")
        
        # Settings tab
        settings_tab = self.create_shortcuts_table(ShortcutContext.SETTINGS)
        self.tabs.addTab(settings_tab, "Settings")
        
        layout.addWidget(self.tabs)
        
        # Customize button
        customize_button = QPushButton("Customize Shortcuts...")
        customize_button.clicked.connect(self.on_customize)
        layout.addWidget(customize_button)
        
        # Note
        note_label = QLabel(
            "<i>Note: On macOS, use Cmd instead of Ctrl for keyboard shortcuts.</i>"
        )
        note_label.setWordWrap(True)
        layout.addWidget(note_label)
        
        # Close button
        close_button = QPushButton("Close")
        close_button.clicked.connect(self.accept)
        layout.addWidget(close_button)
    
    def create_shortcuts_table(self, context: str) -> QTableWidget:
        """Create shortcuts table for a context"""
        table = QTableWidget()
        table.setColumnCount(2)
        table.setHorizontalHeaderLabels(["Action", "Shortcut"])
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.setAlternatingRowColors(True)
        table.horizontalHeader().setStretchLastSection(True)
        
        # Get shortcuts for context
        shortcuts = self.shortcut_manager.DEFAULT_SHORTCUTS.get(context, {})
        table.setRowCount(len(shortcuts))
        
        for row, (action_id, (sequence, description)) in enumerate(shortcuts.items()):
            table.setItem(row, 0, QTableWidgetItem(description))
            # Use custom if available
            sequence = self.shortcut_manager.custom_shortcuts.get(action_id, sequence)
            table.setItem(row, 1, QTableWidgetItem(sequence))
        
        table.resizeColumnsToContents()
        return table
    
    def filter_shortcuts(self, text: str):
        """Filter shortcuts by search text"""
        # Implementation for filtering
        pass
    
    def on_customize(self):
        """Open customization dialog"""
        from gui.shortcut_customization_dialog import ShortcutCustomizationDialog
        dialog = ShortcutCustomizationDialog(self.shortcut_manager, self)
        dialog.exec()
        # Refresh tables
        self.init_ui()
```

**Implementation Checklist**:
- [ ] Enhance shortcuts dialog
- [ ] Add context tabs
- [ ] Add search functionality
- [ ] Add customize button
- [ ] Test dialog
- [ ] Update help menu

---

## Comprehensive Testing (1-2 days)

**Dependencies**: All previous substeps must be completed

### Part A: Unit Tests

See existing test structure in document - expand with:
- Shortcut manager tests
- Customization dialog tests
- Context switching tests
- Conflict detection tests

### Part B: Integration Tests

- Test shortcuts work in all contexts
- Test customization persists
- Test platform adaptation
- Test context switching

### Part C: Accessibility Testing

**Tools to Use**:
- **NVDA** (Windows): Screen reader
- **JAWS** (Windows): Screen reader
- **VoiceOver** (macOS): Screen reader
- **Orca** (Linux): Screen reader
- **WAVE**: Web accessibility evaluation
- **axe DevTools**: Accessibility testing

**Test Checklist**:
- [ ] Test with screen reader (NVDA/JAWS/VoiceOver)
- [ ] Test keyboard-only navigation
- [ ] Test high contrast mode
- [ ] Test font scaling
- [ ] Test color contrast (WCAG AA)
- [ ] Test focus indicators
- [ ] Test tooltips
- [ ] Test accessible names
- [ ] Test tab order
- [ ] Test all interactive elements accessible

### Part D: Manual Testing Checklist

**Keyboard Shortcuts Testing**:
- [ ] All global shortcuts work
- [ ] All context-specific shortcuts work
- [ ] Context switching works correctly
- [ ] Shortcuts don't conflict
- [ ] Platform adaptation works (Cmd on macOS)
- [ ] Custom shortcuts work
- [ ] Shortcut persistence works
- [ ] Reset to defaults works

**Accessibility Testing**:
- [ ] All buttons have tooltips
- [ ] All inputs have labels
- [ ] All widgets have accessible names
- [ ] Keyboard navigation works
- [ ] Tab order is logical
- [ ] Focus indicators visible
- [ ] Screen reader can read all text
- [ ] High contrast mode works
- [ ] Font scaling works
- [ ] Color contrast sufficient

---

## Error Handling

### Error Scenarios
1. **Shortcut Conflicts**: Detect and warn user
2. **Invalid Shortcuts**: Validate and reject invalid combinations
3. **Accessibility Issues**: Graceful degradation
4. **Platform Differences**: Handle platform-specific issues

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Existing functionality unchanged
- [ ] Shortcuts are additions (don't break existing behavior)
- [ ] No breaking changes
- [ ] Existing shortcuts still work

---

## Documentation Requirements

### User Guide Updates
- [ ] Document all shortcuts
- [ ] Document customization process
- [ ] Document accessibility features
- [ ] Update help dialog
- [ ] Create accessibility guide

---

## Acceptance Criteria
- ✅ Comprehensive keyboard shortcuts implemented
- ✅ Context-aware shortcuts work
- ✅ Customizable shortcuts work
- ✅ Shortcuts documented
- ✅ Full keyboard navigation support
- ✅ WCAG 2.1 AA compliance
- ✅ Screen reader support
- ✅ High contrast mode
- ✅ Font scaling
- ✅ All tests passing
- ✅ User testing completed

---

## Shortcut Discoverability Strategy

### Multi-Layer Approach

To ensure users can discover and learn keyboard shortcuts, we use a **multi-layer discoverability strategy**:

1. **Always Visible**: Shortcuts shown in menus (automatic with QAction)
2. **On Hover**: Shortcuts in tooltips
3. **On Focus**: Contextual hints in status bar
4. **On Demand**: Press '?' to show overlay with all shortcuts
5. **Persistent**: Optional dockable cheat sheet widget
6. **First Time**: Special hints for new users
7. **Visual Cues**: Shortcut badges on buttons (optional)

### User Journey

**New User**:
1. Opens application
2. Sees tooltips with shortcuts when hovering
3. Sees first-time hints explaining shortcuts
4. Can press '?' anytime to see all shortcuts
5. Can open Help → Keyboard Shortcuts for full reference

**Regular User**:
1. Sees shortcuts in menus (always visible)
2. Sees shortcuts in tooltips (on hover)
3. Can press '?' for quick reference
4. Can customize shortcuts in settings

**Power User**:
1. Uses shortcuts from memory
2. Can open dockable cheat sheet for reference
3. Can customize shortcuts to preferences
4. Can see context-specific shortcuts in overlay

### Implementation Priority

**High Priority** (Must Have):
- Shortcuts in menus (automatic)
- Shortcuts in tooltips
- Shortcuts dialog (Help menu)
- Press '?' overlay

**Medium Priority** (Should Have):
- Status bar hints
- First-time user hints
- Enhanced tooltips

**Low Priority** (Nice to Have):
- Shortcut badges on buttons
- Dockable cheat sheet
- Contextual hint widgets

---

## Implementation Checklist Summary
- [ ] Substep 4.6.1: Create Shortcut Manager System
- [ ] Substep 4.6.2: Integrate Shortcuts into Main Window
- [ ] Substep 4.6.3: Create Shortcut Customization Dialog
- [ ] Substep 4.6.4: Comprehensive Accessibility Improvements
- [ ] Substep 4.6.5: Visual Shortcut Discoverability
- [ ] Substep 4.6.6: Enhanced Shortcuts Help Dialog
- [ ] Comprehensive Testing
- [ ] Documentation updated

---

**IMPORTANT**: Only implement this step if users request keyboard shortcuts or accessibility features. However, basic accessibility (tooltips, labels) should be considered for all UI work.

**Next Step**: After evaluation, proceed to other Phase 4 steps or Phase 5 if Phase 4 is complete.
