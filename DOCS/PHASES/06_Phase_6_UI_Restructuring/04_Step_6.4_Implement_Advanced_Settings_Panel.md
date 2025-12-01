# Step 6.4: Implement Advanced Settings Panel

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 3-4 days  
**Dependencies**: Step 6.3 (Redesign Main Window - Simple Mode)

---

## Goal

Create a collapsible advanced settings panel that is hidden by default but provides full access to all configuration options for power users. The panel should be well-organized, searchable, and easy to navigate.

---

## Success Criteria

- [ ] Advanced settings panel created
- [ ] Collapsible show/hide functionality
- [ ] Settings organized into logical categories
- [ ] Search/filter functionality for settings
- [ ] Reset to defaults option
- [ ] Settings persist across sessions
- [ ] All existing settings accessible
- [ ] User preference for show/hide state saved
- [ ] Settings validation and error handling

---

## Analytical Design

### Settings Panel Structure

```
Advanced Settings Panel
├── Processing Settings
│   ├── Matching Algorithm
│   ├── Query Generation
│   ├── Confidence Threshold
│   └── Timeout Settings
├── Export Settings
│   ├── File Format
│   ├── Output Location
│   ├── Column Selection
│   └── Encoding Options
├── Performance Settings
│   ├── Cache Settings
│   ├── Async Options
│   ├── Thread Count
│   └── Rate Limiting
└── Advanced Options
    ├── Debug Mode
    ├── Logging Level
    ├── Experimental Features
    └── API Settings
```

### Implementation

```python
# src/cuepoint/ui/widgets/advanced_settings_panel.py
"""
Advanced settings panel for power users.
"""

from typing import Dict, Any, Optional, List
from pathlib import Path

from PySide6.QtCore import Qt, Signal, QSettings
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox,
    QCheckBox, QPushButton, QGroupBox, QScrollArea,
    QMessageBox, QTabWidget
)

from cuepoint.ui.theme.theme_manager import ThemeManager
from cuepoint.ui.widgets.pixel_widgets import PixelButton, PixelCard
from cuepoint.services.config_service import ConfigService


class AdvancedSettingsPanel(QWidget):
    """Collapsible advanced settings panel."""
    
    settings_changed = Signal(str, object)  # Setting name, value
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        
        self.config_service = ConfigService()
        self.settings = QSettings()
        
        # Track setting widgets
        self.setting_widgets: Dict[str, QWidget] = {}
        
        self.init_ui()
        self.load_settings()
    
    def init_ui(self):
        """Initialize UI."""
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        
        # Search bar
        self.create_search_bar(layout)
        
        # Settings tabs
        self.create_settings_tabs(layout)
        
        # Action buttons
        self.create_action_buttons(layout)
    
    def create_search_bar(self, parent_layout: QVBoxLayout):
        """Create search/filter bar."""
        search_layout = QHBoxLayout()
        
        search_label = QLabel("🔍 Search Settings:")
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Type to search settings...")
        self.search_input.textChanged.connect(self.filter_settings)
        
        search_layout.addWidget(search_label)
        search_layout.addWidget(self.search_input)
        
        parent_layout.addLayout(search_layout)
    
    def create_settings_tabs(self, parent_layout: QVBoxLayout):
        """Create tabbed settings interface."""
        self.tabs = QTabWidget()
        
        # Processing tab
        self.create_processing_tab()
        
        # Export tab
        self.create_export_tab()
        
        # Performance tab
        self.create_performance_tab()
        
        # Advanced tab
        self.create_advanced_tab()
        
        parent_layout.addWidget(self.tabs)
    
    def create_processing_tab(self):
        """Create processing settings tab."""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setSpacing(16)
        
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll_widget = QWidget()
        scroll_layout = QVBoxLayout(scroll_widget)
        scroll_layout.setSpacing(12)
        
        # Matching Algorithm
        matching_group = self.create_setting_group(
            "Matching Algorithm",
            [
                ("algorithm", "combo", "Matching Algorithm", 
                 ["fuzzy", "exact", "hybrid"], "fuzzy"),
                ("confidence_threshold", "double", "Confidence Threshold", 
                 0.0, 1.0, 0.7, 0.05),
                ("max_results", "spin", "Max Results per Track", 
                 1, 10, 3),
            ]
        )
        scroll_layout.addWidget(matching_group)
        
        # Query Generation
        query_group = self.create_setting_group(
            "Query Generation",
            [
                ("include_remix", "check", "Include Remix Info", True),
                ("include_feat", "check", "Include Featured Artists", True),
                ("normalize_text", "check", "Normalize Text", True),
                ("query_timeout", "spin", "Query Timeout (seconds)", 
                 5, 60, 30),
            ]
        )
        scroll_layout.addWidget(query_group)
        
        scroll.setWidget(scroll_widget)
        layout.addWidget(scroll)
        
        self.tabs.addTab(tab, "Processing")
    
    def create_export_tab(self):
        """Create export settings tab."""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setSpacing(16)
        
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll_widget = QWidget()
        scroll_layout = QVBoxLayout(scroll_widget)
        scroll_layout.setSpacing(12)
        
        # Export Format
        format_group = self.create_setting_group(
            "Export Format",
            [
                ("export_format", "combo", "File Format", 
                 ["CSV", "JSON", "XLSX"], "CSV"),
                ("include_unmatched", "check", "Include Unmatched Tracks", True),
                ("include_metadata", "check", "Include Full Metadata", False),
            ]
        )
        scroll_layout.addWidget(format_group)
        
        # Output Settings
        output_group = self.create_setting_group(
            "Output Settings",
            [
                ("output_directory", "path", "Output Directory", ""),
                ("filename_template", "text", "Filename Template", 
                 "cuepoint_results_{timestamp}"),
            ]
        )
        scroll_layout.addWidget(output_group)
        
        scroll.setWidget(scroll_widget)
        layout.addWidget(scroll)
        
        self.tabs.addTab(tab, "Export")
    
    def create_performance_tab(self):
        """Create performance settings tab."""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setSpacing(16)
        
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll_widget = QWidget()
        scroll_layout = QVBoxLayout(scroll_widget)
        scroll_layout.setSpacing(12)
        
        # Cache Settings
        cache_group = self.create_setting_group(
            "Cache Settings",
            [
                ("cache_enabled", "check", "Enable Caching", True),
                ("cache_size", "spin", "Cache Size (MB)", 
                 10, 1000, 100),
                ("cache_ttl", "spin", "Cache TTL (hours)", 
                 1, 168, 24),
            ]
        )
        scroll_layout.addWidget(cache_group)
        
        # Async Settings
        async_group = self.create_setting_group(
            "Async Processing",
            [
                ("async_enabled", "check", "Enable Async Processing", True),
                ("max_workers", "spin", "Max Workers", 
                 1, 16, 4),
                ("rate_limit", "spin", "Rate Limit (requests/sec)", 
                 1, 100, 10),
            ]
        )
        scroll_layout.addWidget(async_group)
        
        scroll.setWidget(scroll_widget)
        layout.addWidget(scroll)
        
        self.tabs.addTab(tab, "Performance")
    
    def create_advanced_tab(self):
        """Create advanced options tab."""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setSpacing(16)
        
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll_widget = QWidget()
        scroll_layout = QVBoxLayout(scroll_widget)
        scroll_layout.setSpacing(12)
        
        # Debug Settings
        debug_group = self.create_setting_group(
            "Debug & Logging",
            [
                ("debug_mode", "check", "Debug Mode", False),
                ("log_level", "combo", "Log Level", 
                 ["DEBUG", "INFO", "WARNING", "ERROR"], "INFO"),
                ("log_file", "path", "Log File Path", ""),
            ]
        )
        scroll_layout.addWidget(debug_group)
        
        # API Settings
        api_group = self.create_setting_group(
            "API Settings",
            [
                ("api_timeout", "spin", "API Timeout (seconds)", 
                 5, 120, 30),
                ("retry_count", "spin", "Retry Count", 
                 0, 5, 3),
                ("user_agent", "text", "User Agent", 
                 "CuePoint/1.0"),
            ]
        )
        scroll_layout.addWidget(api_group)
        
        scroll.setWidget(scroll_widget)
        layout.addWidget(scroll)
        
        self.tabs.addTab(tab, "Advanced")
    
    def create_setting_group(
        self, 
        title: str, 
        settings: List[tuple]
    ) -> QGroupBox:
        """Create a group of settings."""
        group = QGroupBox(title)
        layout = QVBoxLayout(group)
        layout.setSpacing(8)
        
        for setting_config in settings:
            widget = self.create_setting_widget(setting_config)
            if widget:
                layout.addWidget(widget)
                # Store widget reference
                setting_name = setting_config[0]
                self.setting_widgets[setting_name] = widget
        
        return group
    
    def create_setting_widget(self, config: tuple) -> Optional[QWidget]:
        """Create a setting widget based on configuration."""
        setting_name, widget_type, label, *args = config
        
        container = QWidget()
        layout = QHBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        
        label_widget = QLabel(label)
        label_widget.setMinimumWidth(200)
        layout.addWidget(label_widget)
        
        widget = None
        
        if widget_type == "check":
            widget = QCheckBox()
            widget.setChecked(args[0] if args else False)
            widget.toggled.connect(
                lambda checked, name=setting_name: self.on_setting_changed(name, checked)
            )
            layout.addWidget(widget)
        
        elif widget_type == "combo":
            widget = QComboBox()
            options = args[0] if args else []
            default = args[1] if len(args) > 1 else None
            widget.addItems(options)
            if default and default in options:
                widget.setCurrentText(default)
            widget.currentTextChanged.connect(
                lambda text, name=setting_name: self.on_setting_changed(name, text)
            )
            layout.addWidget(widget)
        
        elif widget_type == "spin":
            widget = QSpinBox()
            min_val, max_val, default = args[0], args[1], args[2]
            widget.setRange(min_val, max_val)
            widget.setValue(default)
            widget.valueChanged.connect(
                lambda value, name=setting_name: self.on_setting_changed(name, value)
            )
            layout.addWidget(widget)
        
        elif widget_type == "double":
            widget = QDoubleSpinBox()
            min_val, max_val, default, step = args[0], args[1], args[2], args[3]
            widget.setRange(min_val, max_val)
            widget.setSingleStep(step)
            widget.setValue(default)
            widget.valueChanged.connect(
                lambda value, name=setting_name: self.on_setting_changed(name, value)
            )
            layout.addWidget(widget)
        
        elif widget_type == "text":
            widget = QLineEdit()
            default = args[0] if args else ""
            widget.setText(default)
            widget.textChanged.connect(
                lambda text, name=setting_name: self.on_setting_changed(name, text)
            )
            layout.addWidget(widget)
        
        elif widget_type == "path":
            widget = QLineEdit()
            browse_btn = QPushButton("Browse...")
            default = args[0] if args else ""
            widget.setText(default)
            
            def browse_path():
                path, _ = QFileDialog.getExistingDirectory(
                    self, "Select Directory", widget.text()
                )
                if path:
                    widget.setText(path)
            
            browse_btn.clicked.connect(browse_path)
            widget.textChanged.connect(
                lambda text, name=setting_name: self.on_setting_changed(name, text)
            )
            
            layout.addWidget(widget)
            layout.addWidget(browse_btn)
        
        layout.addStretch()
        
        return container
    
    def create_action_buttons(self, parent_layout: QVBoxLayout):
        """Create action buttons."""
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        # Reset to defaults
        reset_btn = PixelButton("Reset to Defaults", class_name="secondary")
        reset_btn.clicked.connect(self.reset_to_defaults)
        button_layout.addWidget(reset_btn)
        
        # Save
        save_btn = PixelButton("Save Settings", class_name="primary")
        save_btn.clicked.connect(self.save_settings)
        button_layout.addWidget(save_btn)
        
        parent_layout.addLayout(button_layout)
    
    def filter_settings(self, search_text: str):
        """Filter settings based on search text."""
        search_lower = search_text.lower()
        
        for setting_name, widget in self.setting_widgets.items():
            # Get parent group
            parent = widget.parent()
            while parent and not isinstance(parent, QGroupBox):
                parent = parent.parent()
            
            if parent:
                # Check if label contains search text
                label = None
                for child in parent.findChildren(QLabel):
                    if child.text().lower().find(search_lower) != -1:
                        label = child
                        break
                
                # Show/hide group based on match
                if label or not search_text:
                    parent.setVisible(True)
                else:
                    parent.setVisible(False)
    
    def on_setting_changed(self, setting_name: str, value: Any):
        """Handle setting change."""
        self.settings_changed.emit(setting_name, value)
        # Auto-save to config service
        self.config_service.set(setting_name, value)
    
    def load_settings(self):
        """Load settings from config service."""
        for setting_name, widget in self.setting_widgets.items():
            value = self.config_service.get(setting_name)
            if value is not None:
                self.set_widget_value(widget, value)
    
    def set_widget_value(self, widget: QWidget, value: Any):
        """Set value for a widget."""
        if isinstance(widget, QCheckBox):
            widget.setChecked(bool(value))
        elif isinstance(widget, QComboBox):
            widget.setCurrentText(str(value))
        elif isinstance(widget, (QSpinBox, QDoubleSpinBox)):
            widget.setValue(value)
        elif isinstance(widget, QLineEdit):
            widget.setText(str(value))
    
    def save_settings(self):
        """Save all settings."""
        self.config_service.save()
        QMessageBox.information(self, "Settings Saved", "Settings have been saved successfully.")
    
    def reset_to_defaults(self):
        """Reset all settings to defaults."""
        reply = QMessageBox.question(
            self,
            "Reset Settings",
            "Are you sure you want to reset all settings to defaults?",
            QMessageBox.Yes | QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            self.config_service.reset_to_defaults()
            self.load_settings()
            QMessageBox.information(
                self, 
                "Settings Reset", 
                "All settings have been reset to defaults."
            )
```

### Integration with Simple Main Window

```python
# In main_window_simple.py

def create_advanced_settings_step(self, parent_layout: QVBoxLayout):
    """Create collapsible advanced settings step."""
    # ... existing code ...
    
    # Advanced settings panel (hidden by default)
    self.advanced_panel = AdvancedSettingsPanel()
    self.advanced_panel.setVisible(False)
    self.advanced_panel.settings_changed.connect(self.on_setting_changed)
    
    step_layout.addWidget(self.advanced_panel)
```

---

## File Structure

```
src/cuepoint/ui/widgets/
├── advanced_settings_panel.py    # New advanced settings panel
└── ...
```

---

## Testing Requirements

### Functional Testing
- [ ] All settings widgets create correctly
- [ ] Settings values persist
- [ ] Search/filter works
- [ ] Reset to defaults works
- [ ] Settings validation works
- [ ] Settings apply to processing

### Usability Testing
- [ ] Settings are easy to find
- [ ] Labels are clear
- [ ] Tooltips helpful
- [ ] Organization makes sense
- [ ] Search is effective

---

## Implementation Checklist

- [ ] Create AdvancedSettingsPanel class
- [ ] Implement tabbed interface
- [ ] Create setting widgets for all types
- [ ] Implement search/filter
- [ ] Integrate with ConfigService
- [ ] Add reset to defaults
- [ ] Add settings persistence
- [ ] Add validation
- [ ] Integrate with simple main window
- [ ] Test all settings
- [ ] Document settings

---

## Dependencies

- **Step 6.3**: Redesign Main Window - Simple Mode
- **ConfigService**: For settings management
- **Theme System**: For styling

---

## Notes

- **Organization**: Group related settings together
- **Defaults**: Provide sensible defaults for all settings
- **Validation**: Validate settings before applying
- **Documentation**: Document what each setting does

---

## Next Steps

After completing this step:
1. Proceed to Step 6.5: Redesign Results View
2. Results view will use theme and new components
3. Test complete workflow with settings

