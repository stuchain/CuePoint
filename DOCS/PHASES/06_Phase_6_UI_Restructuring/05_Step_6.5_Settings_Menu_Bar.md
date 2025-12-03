# Step 6.5: Move Settings to Menu Bar

**Status**: 📝 Planned  
**Duration**: 1 day  
**Dependencies**: None (can be done in parallel)

## Goal

Move the Settings tab from the tab widget to a menu item in the menu bar, positioned next to the File menu.

## Implementation

### 1. Remove Settings Tab

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Remove Settings tab from tab widget:

```python
def init_ui(self) -> None:
    """Initialize all UI components and layout."""
    # ... existing code ...

    # Settings tab - REMOVE THIS
    # settings_tab = QWidget()
    # settings_layout = QVBoxLayout(settings_tab)
    # settings_layout.setContentsMargins(10, 10, 10, 10)
    # self.config_panel = ConfigPanel(config_controller=self.config_controller)
    # settings_layout.addWidget(self.config_panel)

    # History tab (Past Searches)
    history_tab = QWidget()
    history_layout = QVBoxLayout(history_tab)
    history_layout.setContentsMargins(10, 10, 10, 10)
    self.history_view = HistoryView(export_controller=self.export_controller)
    history_layout.addWidget(self.history_view)

    # Add tabs - REMOVE SETTINGS TAB
    self.tabs.addTab(main_tab, "Main")
    # self.tabs.addTab(settings_tab, "Settings")  # REMOVED
    self.tabs.addTab(history_tab, "Past Searches")
```

### 2. Create Settings Dialog

**File**: `SRC/cuepoint/ui/dialogs/settings_dialog.py` (CREATE or MODIFY if exists)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Settings Dialog Module

This module contains the SettingsDialog class for displaying settings in a dialog window.
"""

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QVBoxLayout,
)

from cuepoint.ui.controllers.config_controller import ConfigController
from cuepoint.ui.widgets.config_panel import ConfigPanel


class SettingsDialog(QDialog):
    """Dialog for application settings"""

    def __init__(self, config_controller: ConfigController, parent=None):
        super().__init__(parent)
        self.config_controller = config_controller
        self.setWindowTitle("Settings")
        self.setMinimumSize(700, 600)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        # Add config panel
        self.config_panel = ConfigPanel(config_controller=self.config_controller)
        layout.addWidget(self.config_panel)

        # Add button box
        button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel | QDialogButtonBox.Apply
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        
        # Apply button
        apply_button = button_box.button(QDialogButtonBox.Apply)
        apply_button.clicked.connect(self.apply_settings)
        
        layout.addWidget(button_box)

    def apply_settings(self):
        """Apply settings without closing dialog"""
        # Settings are applied automatically by ConfigPanel
        # This method can be used for additional validation or feedback
        pass

    def get_settings(self):
        """Get current settings from config panel"""
        return self.config_panel.get_settings()

    def get_auto_research(self):
        """Get auto research setting from config panel"""
        return self.config_panel.get_auto_research()
```

### 3. Add Settings Menu Item

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Add Settings menu item in `create_menu_bar` method:

```python
def create_menu_bar(self) -> None:
    """Create the application menu bar with all menus and actions."""
    menubar = self.menuBar()

    # File Menu
    file_menu = menubar.addMenu("&File")
    # ... existing file menu code ...

    # Settings Menu - ADD AFTER FILE MENU
    settings_menu = menubar.addMenu("&Settings")
    
    # Open Settings
    settings_action = QAction("&Settings...", self)
    settings_action.setShortcut(QKeySequence("Ctrl+,"))
    settings_action.setToolTip("Open settings (Ctrl+,)")
    settings_action.triggered.connect(self.on_open_settings)
    settings_menu.addAction(settings_action)

    # Edit Menu
    edit_menu = menubar.addMenu("&Edit")
    # ... existing edit menu code ...
```

### 4. Update on_open_settings Method

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Change to open dialog instead of switching tabs:

```python
def on_open_settings(self) -> None:
    """Open the Settings dialog via menu or keyboard shortcut (Ctrl+,)."""
    from cuepoint.ui.dialogs.settings_dialog import SettingsDialog
    
    dialog = SettingsDialog(config_controller=self.config_controller, parent=self)
    if dialog.exec() == QDialog.Accepted:
        # Settings are saved automatically by ConfigPanel
        # Any additional actions can be done here
        self.statusBar().showMessage("Settings saved", 2000)
```

### 5. Update References to Settings Tab

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Update any code that references the Settings tab:

```python
# Remove any code that switches to Settings tab
# Replace with opening Settings dialog instead

# OLD CODE (remove):
# for i in range(self.tabs.count()):
#     if self.tabs.tabText(i) == "Settings":
#         self.tabs.setCurrentIndex(i)
#         break

# NEW CODE (use dialog):
# self.on_open_settings()
```

### 6. Update start_processing Method

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Ensure settings are still accessible from config_panel (which is now in dialog):

```python
def start_processing(self) -> None:
    """Start processing the selected playlist."""
    # ... existing validation code ...

    # Get settings - need to get from config_controller or create temporary dialog
    # Option 1: Store settings when dialog is closed
    # Option 2: Get settings directly from config_controller
    
    # For now, we'll need to ensure config_panel is accessible
    # We can create it temporarily or store reference
    
    # If config_panel doesn't exist, create it temporarily
    if not hasattr(self, 'config_panel') or self.config_panel is None:
        from cuepoint.ui.widgets.config_panel import ConfigPanel
        self.config_panel = ConfigPanel(config_controller=self.config_controller)
    
    settings = self.config_panel.get_settings()
    auto_research = self.config_panel.get_auto_research()
    
    # ... rest of processing code ...
```

## Alternative Approach: Keep ConfigPanel Accessible

Instead of creating it in dialog, we can keep a reference to config_panel:

```python
def init_ui(self) -> None:
    """Initialize all UI components and layout."""
    # ... existing code ...
    
    # Create config panel (but don't add to tabs)
    self.config_panel = ConfigPanel(config_controller=self.config_controller)
    
    # ... rest of code ...

def on_open_settings(self) -> None:
    """Open the Settings dialog."""
    from cuepoint.ui.dialogs.settings_dialog import SettingsDialog
    
    # Create dialog with existing config panel
    dialog = SettingsDialog(config_controller=self.config_controller, parent=self)
    # Or reuse config_panel in dialog
    dialog.config_panel = self.config_panel  # Share the same instance
    dialog.exec()
```

## Testing Checklist

- [ ] Settings menu item appears in menu bar
- [ ] Settings menu item is positioned after File menu
- [ ] Clicking Settings opens dialog
- [ ] Settings dialog displays correctly
- [ ] Settings can be modified and saved
- [ ] Settings are applied correctly
- [ ] Keyboard shortcut (Ctrl+,) works
- [ ] Settings are accessible when needed for processing
- [ ] No references to Settings tab remain

## Acceptance Criteria

- ✅ Settings is accessible from menu bar
- ✅ Settings dialog works correctly
- ✅ All settings functionality is preserved
- ✅ Settings are applied correctly
- ✅ No Settings tab in tab widget
- ✅ Menu organization is logical

