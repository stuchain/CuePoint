# Step 6.11: Organization & Navigation Improvements

**Status**: 📝 Planned  
**Duration**: 1-2 weeks  
**Dependencies**: Steps 6.1-6.10 (Core UI, UX, Help, and Results Improvements)

## Goal

Improve application organization and navigation through breadcrumbs, collapsible sections, better tab management, and export preferences.

## Overview

This step focuses on making the application more organized and easier to navigate:
- Breadcrumb navigation showing current step
- Collapsible sections for completed steps
- Better tab organization with visual indicators
- Export preferences and templates

---

## Substep 6.11.1: Breadcrumb Navigation

**Duration**: 2-3 days  
**Priority**: Medium

### Goal

Show users where they are in the workflow with clear breadcrumb navigation.

### Implementation Details

#### 1. Breadcrumb Component

**File**: `SRC/cuepoint/ui/widgets/breadcrumb_widget.py` (NEW)

**Changes**:
- Create reusable breadcrumb widget
- Show current step in workflow
- Make previous steps clickable (optional)
- Visual separator between steps

**Breadcrumb Display**:
```
File Selection > Processing Mode > Playlist Selection > Processing > Results
```

**Visual Design**:
- Current step: Bold, highlighted
- Completed steps: Normal, clickable (optional)
- Future steps: Grayed out, disabled
- Separator: ">" or "/" between steps

**Implementation**:
```python
class BreadcrumbWidget(QWidget):
    """Breadcrumb navigation widget"""
    
    step_changed = Signal(str)  # Emitted when step is clicked
    
    STEPS = [
        "Tool Selection",
        "File Selection",
        "Processing Mode",
        "Playlist Selection",
        "Processing",
        "Results"
    ]
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_step_index = 0
        self.setup_ui()
    
    def setup_ui(self):
        """Setup breadcrumb UI"""
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 5, 10, 5)
        
        self.labels = []
        for i, step in enumerate(self.STEPS):
            if i > 0:
                # Separator
                separator = QLabel(">")
                separator.setStyleSheet("color: #666; margin: 0 5px;")
                layout.addWidget(separator)
            
            # Step label
            label = QLabel(step)
            label.setStyleSheet(self._get_step_style(i))
            if i <= self.current_step_index:
                label.mousePressEvent = lambda e, idx=i: self.on_step_clicked(idx)
                label.setCursor(Qt.PointingHandCursor)
            
            self.labels.append(label)
            layout.addWidget(label)
        
        layout.addStretch()
    
    def _get_step_style(self, index: int) -> str:
        """Get CSS style for step based on state"""
        if index < self.current_step_index:
            # Completed step
            return "color: #0078d4; text-decoration: underline;"
        elif index == self.current_step_index:
            # Current step
            return "color: #000000; font-weight: bold; background-color: #f0f0f0; padding: 2px 5px; border-radius: 3px;"
        else:
            # Future step
            return "color: #999;"
    
    def set_current_step(self, step_name: str):
        """Set current step in breadcrumb"""
        if step_name in self.STEPS:
            self.current_step_index = self.STEPS.index(step_name)
            self._update_styles()
    
    def on_step_clicked(self, index: int):
        """Handle step click (navigate to previous step)"""
        if index < self.current_step_index:
            self.step_changed.emit(self.STEPS[index])
```

#### 2. Breadcrumb Integration

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Add breadcrumb widget to main window
- Update breadcrumb when workflow step changes
- Handle breadcrumb clicks to navigate back (optional)

**Placement**:
- Top of main tab, below menu bar
- Always visible during workflow
- Updates automatically as user progresses

**Integration**:
```python
def init_ui(self):
    """Initialize UI with breadcrumb"""
    # ... existing code ...
    
    # Add breadcrumb
    self.breadcrumb = BreadcrumbWidget()
    self.breadcrumb.step_changed.connect(self.on_breadcrumb_step_clicked)
    main_layout.insertWidget(0, self.breadcrumb)
    
    # Update breadcrumb on workflow changes
    self.file_selector.file_selected.connect(
        lambda: self.breadcrumb.set_current_step("File Selection")
    )
    # ... more connections ...

def on_breadcrumb_step_clicked(self, step_name: str):
    """Handle breadcrumb navigation"""
    # Optional: Navigate back to previous step
    # This could reset UI state to that step
    pass
```

**Breadcrumb States**:
- **Tool Selection**: Initial state
- **File Selection**: After tool selected
- **Processing Mode**: After file selected
- **Playlist Selection**: After mode selected
- **Processing**: During processing
- **Results**: After processing complete

### Testing Requirements

- [ ] Breadcrumb displays current step correctly
- [ ] Breadcrumb updates as workflow progresses
- [ ] Previous steps are visually distinct
- [ ] Future steps are grayed out
- [ ] Breadcrumb is always visible
- [ ] Optional: Clicking previous steps works (if implemented)

### Success Criteria

- Users always know where they are in the workflow
- Breadcrumb provides clear visual feedback
- Navigation feels intuitive
- Breadcrumb doesn't clutter the interface

---

## Substep 6.11.2: Collapsible Sections

**Duration**: 2-3 days  
**Priority**: Low

### Goal

Allow users to collapse completed sections to reduce clutter and focus on current step.

### Implementation Details

#### 1. Collapsible Section Widget

**File**: `SRC/cuepoint/ui/widgets/collapsible_section.py` (NEW)

**Changes**:
- Create reusable collapsible section widget
- Toggle button with expand/collapse icon
- Smooth animation when expanding/collapsing
- Remember collapsed state (optional)

**Collapsible Section Design**:
```
┌─────────────────────────────────────┐
│  ▼ File Selection                    │
│  ─────────────────────────────────  │
│  [File selector content...]          │
└─────────────────────────────────────┘

When collapsed:
┌─────────────────────────────────────┐
│  ▶ File Selection                    │
└─────────────────────────────────────┘
```

**Implementation**:
```python
class CollapsibleSection(QWidget):
    """Collapsible section widget"""
    
    def __init__(self, title: str, parent=None):
        super().__init__(parent)
        self.title = title
        self.expanded = True
        self.setup_ui()
    
    def setup_ui(self):
        """Setup collapsible section UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        
        # Header with toggle button
        header = QWidget()
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(0, 0, 0, 0)
        
        self.toggle_button = QPushButton("▼")
        self.toggle_button.setMaximumWidth(20)
        self.toggle_button.clicked.connect(self.toggle)
        
        self.title_label = QLabel(self.title)
        self.title_label.setStyleSheet("font-weight: bold;")
        
        header_layout.addWidget(self.toggle_button)
        header_layout.addWidget(self.title_label)
        header_layout.addStretch()
        
        layout.addWidget(header)
        
        # Content area
        self.content_widget = QWidget()
        self.content_layout = QVBoxLayout(self.content_widget)
        layout.addWidget(self.content_widget)
    
    def toggle(self):
        """Toggle section expanded/collapsed"""
        self.expanded = not self.expanded
        self.content_widget.setVisible(self.expanded)
        self.toggle_button.setText("▼" if self.expanded else "▶")
        
        # Optional: Animate
        self._animate_toggle()
    
    def _animate_toggle(self):
        """Animate expand/collapse"""
        # Use QPropertyAnimation for smooth transition
        from PySide6.QtCore import QPropertyAnimation, QEasingCurve
        
        animation = QPropertyAnimation(self.content_widget, b"maximumHeight")
        animation.setDuration(200)
        animation.setEasingCurve(QEasingCurve.InOutQuad)
        
        if self.expanded:
            animation.setStartValue(0)
            animation.setEndValue(self.content_widget.sizeHint().height())
        else:
            animation.setStartValue(self.content_widget.height())
            animation.setEndValue(0)
        
        animation.start()
    
    def add_widget(self, widget: QWidget):
        """Add widget to collapsible section"""
        self.content_layout.addWidget(widget)
    
    def set_collapsed(self, collapsed: bool):
        """Set collapsed state"""
        if self.expanded == not collapsed:
            self.toggle()
```

#### 2. Collapsible Sections Integration

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Wrap each workflow section in collapsible section
- Auto-collapse completed sections
- Allow manual expand/collapse
- Remember user preferences

**Section Organization**:
- File Selection (collapsible)
- Processing Mode (collapsible)
- Playlist Selection (collapsible)
- Progress (collapsible when complete)
- Results (always expanded when visible)

**Auto-Collapse Logic**:
```python
def on_file_selected(self, file_path: str):
    """Auto-collapse file selection after completion"""
    if self.file_section:
        self.file_section.set_collapsed(True)

def on_mode_changed(self):
    """Auto-collapse mode selection after completion"""
    if self.mode_section:
        self.mode_section.set_collapsed(True)
```

**Manual Control**:
- Users can manually expand/collapse any section
- Preference stored in QSettings
- "Expand All" / "Collapse All" buttons (optional)

### Testing Requirements

- [ ] Sections can be collapsed and expanded
- [ ] Animation is smooth
- [ ] Auto-collapse works correctly
- [ ] Manual expand/collapse works
- [ ] Preferences are remembered
- [ ] Content is accessible when expanded

### Success Criteria

- Users can reduce UI clutter by collapsing sections
- Completed sections don't take up space
- Focus remains on current step
- Collapsible sections are intuitive to use

---

## Substep 6.11.3: Enhanced Tab Organization

**Duration**: 2-3 days  
**Priority**: Medium

### Goal

Improve tab organization with grouping, visual indicators, and better navigation.

### Implementation Details

#### 1. Group Related Tabs

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Organize tabs into logical groups
- Use visual separators or grouping
- Group: Main, Results, History, Performance

**Tab Organization**:
```
[Main] | [Past Searches] | [Performance] | [Settings]
```

**Visual Grouping**:
- Use QTabBar styling to group tabs
- Add subtle background colors for groups
- Use separators between groups

**Implementation**:
```python
def organize_tabs(self):
    """Organize tabs into logical groups"""
    # Main workflow tabs
    self.tabs.addTab(self.main_tab, "Main")
    
    # Results and history tabs
    self.tabs.addTab(self.results_tab, "Results")
    self.tabs.addTab(self.history_tab, "Past Searches")
    
    # Analysis tabs
    self.tabs.addTab(self.performance_tab, "Performance")
    
    # Apply styling to group tabs
    self._style_tab_groups()

def _style_tab_groups(self):
    """Apply styling to tab groups"""
    # Use CSS to style different tab groups
    self.tabs.setStyleSheet("""
        QTabBar::tab {
            padding: 8px 16px;
        }
        QTabBar::tab:first {
            border-left: 2px solid #0078d4;
        }
    """)
```

#### 2. Visual Indicators for Tabs with New Data

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Add badge/indicator to tabs with new data
- Show unread count or notification dot
- Clear indicator when tab is viewed
- Update indicators in real-time

**Visual Indicators**:
- Badge with count: "Results (5)"
- Notification dot: Red dot on tab
- Bold text: Tab name in bold
- Color change: Tab background color

**Implementation**:
```python
def add_tab_indicator(self, tab_index: int, count: int = None):
    """Add visual indicator to tab"""
    tab_text = self.tabs.tabText(tab_index)
    
    if count is not None:
        # Add badge with count
        self.tabs.setTabText(tab_index, f"{tab_text} ({count})")
        self.tabs.setTabTextColor(tab_index, QColor("#0078d4"))
    else:
        # Add notification dot
        self.tabs.setTabText(tab_index, f"{tab_text} •")
        self.tabs.setTabTextColor(tab_index, QColor("#d32f2f"))

def clear_tab_indicator(self, tab_index: int):
    """Clear indicator from tab"""
    original_text = self.tabs.tabText(tab_index).replace(" •", "").split(" (")[0]
    self.tabs.setTabText(tab_index, original_text)
    self.tabs.setTabTextColor(tab_index, QColor())

def on_tab_changed(self, index: int):
    """Clear indicator when tab is viewed"""
    self.clear_tab_indicator(index)
```

**Indicator Triggers**:
- **Results tab**: New results available
- **Past Searches tab**: New history entries
- **Performance tab**: New performance data

**Update Logic**:
```python
def on_processing_complete(self, results: List[TrackResult]):
    """Add indicator when results are ready"""
    results_tab_index = self.tabs.indexOf(self.results_tab)
    self.add_tab_indicator(results_tab_index, len(results))

def on_history_updated(self):
    """Add indicator when history is updated"""
    history_tab_index = self.tabs.indexOf(self.history_tab)
    self.add_tab_indicator(history_tab_index)
```

### Testing Requirements

- [ ] Tabs are organized logically
- [ ] Visual grouping is clear
- [ ] Tab indicators appear when new data is available
- [ ] Indicators clear when tab is viewed
- [ ] Tab navigation is smooth
- [ ] Indicators don't interfere with tab functionality

### Success Criteria

- Tabs are well-organized and easy to navigate
- Users are notified when new data is available
- Tab indicators are clear but not intrusive
- Overall tab management is improved

---

## Substep 6.11.4: Export Preferences

**Duration**: 2-3 days  
**Priority**: Low

### Goal

Remember user export preferences and provide export templates for common use cases.

### Implementation Details

#### 1. Remember Last Export Location

**File**: `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)  
**File**: `SRC/cuepoint/ui/utils/export_preferences.py` (NEW)

**Changes**:
- Store last export directory in QSettings
- Use last directory as default for next export
- Remember export format preference
- Remember export options

**Implementation**:
```python
class ExportPreferences:
    """Manages export preferences"""
    
    def __init__(self):
        self.settings = QSettings()
        self.settings.beginGroup("ExportPreferences")
    
    def get_last_export_directory(self) -> str:
        """Get last export directory"""
        return self.settings.value("last_export_directory", "", type=str)
    
    def set_last_export_directory(self, directory: str):
        """Set last export directory"""
        self.settings.setValue("last_export_directory", directory)
    
    def get_last_export_format(self) -> str:
        """Get last export format"""
        return self.settings.value("last_export_format", "csv", type=str)
    
    def set_last_export_format(self, format: str):
        """Set last export format"""
        self.settings.setValue("last_export_format", format)
    
    def get_export_options(self) -> dict:
        """Get saved export options"""
        return self.settings.value("export_options", {}, type=dict)
    
    def set_export_options(self, options: dict):
        """Save export options"""
        self.settings.setValue("export_options", options)
```

**Usage in Export Dialog**:
```python
def show_export_dialog(self):
    """Show export dialog with saved preferences"""
    prefs = ExportPreferences()
    
    # Use last directory
    default_dir = prefs.get_last_export_directory() or os.getcwd()
    
    # Use last format
    default_format = prefs.get_last_export_format()
    
    # Show dialog
    file_path, _ = QFileDialog.getSaveFileName(
        self,
        "Export Results",
        default_dir,
        f"{default_format.upper()} Files (*.{default_format})"
    )
    
    if file_path:
        # Save preferences
        prefs.set_last_export_directory(os.path.dirname(file_path))
        prefs.set_last_export_format(os.path.splitext(file_path)[1][1:])
```

#### 2. Custom Export Templates

**File**: `SRC/cuepoint/ui/dialogs/export_template_dialog.py` (NEW)

**Changes**:
- Create export template system
- Pre-defined templates for common use cases
- Custom templates with column selection
- Save and load templates

**Export Templates**:
- **Full Export**: All columns, all data
- **Minimal Export**: Title, Artist, URL, Score only
- **DJ Export**: Title, Artist, Key, BPM, URL
- **Analysis Export**: Title, Artist, Scores, Similarities
- **Custom**: User-defined column selection

**Template Dialog**:
```
┌─────────────────────────────────────┐
│  Export Template                    │
├─────────────────────────────────────┤
│  Template: [Full Export ▼]         │
│                                     │
│  Columns to Include:                │
│  [✓] Original Title                 │
│  [✓] Original Artist                │
│  [✓] Beatport Title                 │
│  [✓] Beatport Artist                │
│  [✓] Beatport URL                   │
│  [✓] Match Score                    │
│  [ ] Title Similarity               │
│  [ ] Artist Similarity              │
│  ...                                 │
│                                     │
│  [Save as Template...]              │
│  [Cancel]  [Export]                 │
└─────────────────────────────────────┘
```

**Implementation**:
```python
class ExportTemplate:
    """Export template definition"""
    
    def __init__(self, name: str, columns: List[str]):
        self.name = name
        self.columns = columns
    
    def to_dict(self) -> dict:
        """Convert to dictionary for storage"""
        return {
            'name': self.name,
            'columns': self.columns
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'ExportTemplate':
        """Create from dictionary"""
        return cls(data['name'], data['columns'])

class ExportTemplateManager:
    """Manages export templates"""
    
    def __init__(self):
        self.settings = QSettings()
        self.settings.beginGroup("ExportTemplates")
    
    def get_templates(self) -> List[ExportTemplate]:
        """Get all saved templates"""
        templates_data = self.settings.value("templates", [], type=list)
        return [ExportTemplate.from_dict(t) for t in templates_data]
    
    def save_template(self, template: ExportTemplate):
        """Save template"""
        templates = self.get_templates()
        # Remove existing template with same name
        templates = [t for t in templates if t.name != template.name]
        templates.append(template)
        
        templates_data = [t.to_dict() for t in templates]
        self.settings.setValue("templates", templates_data)
```

### Testing Requirements

- [ ] Last export directory is remembered
- [ ] Last export format is remembered
- [ ] Export templates work correctly
- [ ] Custom templates can be saved and loaded
- [ ] Template selection affects export
- [ ] Preferences persist across sessions

### Success Criteria

- Users don't need to navigate to export directory each time
- Export templates save time for common use cases
- Export preferences are convenient and useful
- Template system is flexible and extensible

---

## Implementation Order

```
6.11.1 (Breadcrumb Navigation) - Quick win, improves orientation
  ↓
6.11.3 (Enhanced Tab Organization) - Improves navigation
  ↓
6.11.2 (Collapsible Sections) - Reduces clutter
  ↓
6.11.4 (Export Preferences) - Convenience feature
```

---

## Files to Create

- `SRC/cuepoint/ui/widgets/breadcrumb_widget.py` (NEW)
- `SRC/cuepoint/ui/widgets/collapsible_section.py` (NEW)
- `SRC/cuepoint/ui/utils/export_preferences.py` (NEW)
- `SRC/cuepoint/ui/dialogs/export_template_dialog.py` (NEW)

## Files to Modify

- `SRC/cuepoint/ui/main_window.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)

---

## Testing Checklist

### Functional Testing
- [ ] Breadcrumb displays correctly
- [ ] Breadcrumb updates with workflow
- [ ] Collapsible sections work properly
- [ ] Tabs are well-organized
- [ ] Tab indicators appear and clear correctly
- [ ] Export preferences are saved and loaded
- [ ] Export templates work correctly

### User Experience Testing
- [ ] Navigation is intuitive
- [ ] Breadcrumb helps users understand workflow
- [ ] Collapsible sections reduce clutter
- [ ] Tab organization makes sense
- [ ] Export preferences save time

### Performance Testing
- [ ] Breadcrumb updates don't cause lag
- [ ] Collapsible animations are smooth
- [ ] Tab switching is fast
- [ ] Export preferences load quickly

---

## Success Criteria

- ✅ Users always know where they are (breadcrumb)
- ✅ UI is less cluttered (collapsible sections)
- ✅ Tabs are well-organized and informative
- ✅ Export preferences save time
- ✅ Overall navigation is significantly improved

---

**Next Step**: Step 6.12 - Advanced Features (Statistics, Notifications, Queue, Real-time Updates)

