# Design: GUI Enhancements

**Number**: 18  
**Status**: 📝 Planned  
**Priority**: 🔥 P0 - Essential for Polish  
**Effort**: 1-2 weeks  
**Impact**: High - Professional finish and user satisfaction  
**Phase**: 1 (GUI Foundation)

---

## 1. Overview

### 1.1 Problem Statement

A basic GUI application works, but lacks the polish and professional features that make it user-friendly:
- No visual branding (icons, splash screen)
- No settings persistence (user preferences lost on restart)
- No recent files menu (must browse for XML every time)
- No dark mode (hard on eyes in low light)
- No keyboard shortcuts (inefficient for power users)
- No menu bar (standard desktop app expectation)
- No help system (users don't know how to use features)

### 1.2 Solution Overview

Implement comprehensive GUI enhancements that transform the application from functional to polished:
1. **Icons and Branding**: Custom application icons, splash screen, about dialog
2. **Settings Persistence**: Save user preferences, restore on startup
3. **Recent Files**: Remember last used XML files, quick access menu
4. **Dark Mode**: System-aware theme switching, user preference
5. **Menu Bar**: Standard File, Edit, View, Help menus
6. **Keyboard Shortcuts**: Common operations (Ctrl+O, Ctrl+S, etc.)
7. **Help System**: Tooltips, in-app help, user guide

---

## 2. Design Principles

- **System Integration**: Follow platform conventions (Windows, macOS, Linux)
- **User Preferences**: Respect user choices, persist settings
- **Accessibility**: Keyboard navigation, tooltips, clear labels
- **Professional Appearance**: Consistent styling, branded elements
- **Discoverability**: Help system, tooltips, clear UI

---

## 3. Implementation Details

### 3.1 Icons and Branding

**Location**: `assets/` directory (NEW)

**Files Needed**:
- `icon.ico` - Windows icon (16x16, 32x32, 48x48, 256x256)
- `icon.icns` - macOS icon (multiple sizes)
- `icon.png` - Linux icon (256x256, 512x512)
- `splash.png` - Splash screen image (800x600)
- `logo.svg` - Vector logo for scaling

**Implementation**:

```python
# SRC/gui/main_window.py
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QSplashScreen
from PySide6.QtCore import Qt

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        # Set application icon
        self.setWindowIcon(QIcon("assets/icon.png"))
        
        # Create splash screen
        splash = QSplashScreen(QPixmap("assets/splash.png"))
        splash.show()
        # ... initialization ...
        splash.finish(self)
```

**About Dialog**:

```python
# SRC/gui/dialogs.py
class AboutDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("About CuePoint")
        layout = QVBoxLayout()
        
        # Logo
        logo_label = QLabel()
        logo_label.setPixmap(QPixmap("assets/logo.png"))
        logo_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(logo_label)
        
        # Version info
        version_label = QLabel(f"<b>CuePoint</b><br>Version 1.0.0")
        version_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(version_label)
        
        # Description
        desc_label = QLabel(
            "Beatport Metadata Enricher for Rekordbox<br>"
            "Enrich your Rekordbox playlists with Beatport metadata"
        )
        desc_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(desc_label)
        
        # License
        license_label = QLabel("© 2025 CuePoint. All rights reserved.")
        license_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(license_label)
        
        # OK button
        ok_button = QPushButton("OK")
        ok_button.clicked.connect(self.accept)
        layout.addWidget(ok_button)
        
        self.setLayout(layout)
```

**Acceptance Criteria**:
- [ ] Icons display correctly on all platforms
- [ ] Splash screen shows on startup
- [ ] About dialog displays correctly
- [ ] Window title shows application name

---

### 3.2 Settings Persistence

**Location**: `SRC/gui/settings_manager.py` (NEW)

**Storage**: JSON file in user config directory
- Windows: `%APPDATA%/CuePoint/settings.json`
- macOS: `~/Library/Application Support/CuePoint/settings.json`
- Linux: `~/.config/CuePoint/settings.json`

**Settings to Persist**:
- Window geometry (size, position)
- Last used XML file path
- Last used output directory
- Selected playlist (if any)
- Configuration presets
- GUI preferences (dark mode, etc.)

**Implementation**:

```python
# SRC/gui/settings_manager.py
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional

class SettingsManager:
    """Manages application settings persistence"""
    
    def __init__(self):
        self.config_dir = self._get_config_dir()
        self.config_file = self.config_dir / "settings.json"
        self.settings: Dict[str, Any] = {}
        self._load()
    
    def _get_config_dir(self) -> Path:
        """Get platform-specific config directory"""
        if os.name == 'nt':  # Windows
            base = Path(os.getenv('APPDATA', ''))
        elif sys.platform == 'darwin':  # macOS
            base = Path.home() / "Library" / "Application Support"
        else:  # Linux
            base = Path.home() / ".config"
        
        config_dir = base / "CuePoint"
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir
    
    def _load(self):
        """Load settings from file"""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    self.settings = json.load(f)
            except Exception as e:
                print(f"Error loading settings: {e}")
                self.settings = {}
        else:
            self.settings = {}
    
    def save(self):
        """Save settings to file"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.settings, f, indent=2)
        except Exception as e:
            print(f"Error saving settings: {e}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get setting value"""
        return self.settings.get(key, default)
    
    def set(self, key: str, value: Any):
        """Set setting value"""
        self.settings[key] = value
    
    def get_window_geometry(self) -> Optional[Dict[str, int]]:
        """Get saved window geometry"""
        return self.get('window_geometry')
    
    def save_window_geometry(self, geometry: Dict[str, int]):
        """Save window geometry"""
        self.set('window_geometry', geometry)
        self.save()
    
    def get_last_xml_file(self) -> Optional[str]:
        """Get last used XML file path"""
        return self.get('last_xml_file')
    
    def save_last_xml_file(self, file_path: str):
        """Save last used XML file"""
        self.set('last_xml_file', file_path)
        self.save()
    
    def get_recent_files(self, max_count: int = 10) -> list:
        """Get recent files list"""
        return self.get('recent_files', [])[:max_count]
    
    def add_recent_file(self, file_path: str):
        """Add file to recent files list"""
        recent = self.get('recent_files', [])
        if file_path in recent:
            recent.remove(file_path)
        recent.insert(0, file_path)
        recent = recent[:10]  # Keep max 10
        self.set('recent_files', recent)
        self.save()
```

**Usage in MainWindow**:

```python
# SRC/gui/main_window.py
from .settings_manager import SettingsManager

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.settings_manager = SettingsManager()
        
        # Restore window geometry
        geometry = self.settings_manager.get_window_geometry()
        if geometry:
            self.setGeometry(
                geometry['x'], geometry['y'],
                geometry['width'], geometry['height']
            )
        
        # Restore last XML file
        last_xml = self.settings_manager.get_last_xml_file()
        if last_xml and os.path.exists(last_xml):
            self.file_selector.set_file(last_xml)
    
    def closeEvent(self, event):
        """Save settings on close"""
        self.settings_manager.save_window_geometry({
            'x': self.geometry().x(),
            'y': self.geometry().y(),
            'width': self.geometry().width(),
            'height': self.geometry().height()
        })
        event.accept()
```

**Acceptance Criteria**:
- [ ] Settings persist between sessions
- [ ] Window geometry restored on startup
- [ ] Last XML file remembered
- [ ] Recent files list maintained
- [ ] Settings file created in correct location

---

### 3.3 Recent Files Menu

**Location**: `SRC/gui/main_window.py` (MODIFY)

**Implementation**:

```python
# SRC/gui/main_window.py
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self._create_menu_bar()
        self._update_recent_files_menu()
    
    def _create_menu_bar(self):
        """Create menu bar"""
        menubar = self.menuBar()
        
        # File menu
        file_menu = menubar.addMenu("&File")
        
        # Open action
        open_action = QAction("&Open XML...", self)
        open_action.setShortcut("Ctrl+O")
        open_action.triggered.connect(self._open_xml_file)
        file_menu.addAction(open_action)
        
        file_menu.addSeparator()
        
        # Recent files submenu
        self.recent_files_menu = file_menu.addMenu("Recent Files")
        self.recent_files_menu.aboutToShow.connect(self._update_recent_files_menu)
        
        file_menu.addSeparator()
        
        # Exit action
        exit_action = QAction("E&xit", self)
        exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)
    
    def _update_recent_files_menu(self):
        """Update recent files menu"""
        self.recent_files_menu.clear()
        
        recent_files = self.settings_manager.get_recent_files()
        if not recent_files:
            action = QAction("(No recent files)", self)
            action.setEnabled(False)
            self.recent_files_menu.addAction(action)
            return
        
        for file_path in recent_files:
            if os.path.exists(file_path):
                action = QAction(os.path.basename(file_path), self)
                action.setData(file_path)
                action.triggered.connect(
                    lambda checked, path=file_path: self._open_recent_file(path)
                )
                self.recent_files_menu.addAction(action)
        
        self.recent_files_menu.addSeparator()
        clear_action = QAction("Clear Recent Files", self)
        clear_action.triggered.connect(self._clear_recent_files)
        self.recent_files_menu.addAction(clear_action)
    
    def _open_recent_file(self, file_path: str):
        """Open recent file"""
        if os.path.exists(file_path):
            self.file_selector.set_file(file_path)
            self.settings_manager.add_recent_file(file_path)
    
    def _clear_recent_files(self):
        """Clear recent files list"""
        self.settings_manager.set('recent_files', [])
        self.settings_manager.save()
        self._update_recent_files_menu()
```

**Acceptance Criteria**:
- [ ] Recent files menu displays
- [ ] Recent files clickable
- [ ] Clear recent files works
- [ ] Menu updates when files added
- [ ] Non-existent files filtered out

---

### 3.4 Dark Mode Support

**Location**: `SRC/gui/styles.py` (MODIFY)

**Implementation**:

```python
# SRC/gui/styles.py
from PySide6.QtCore import Qt

class ThemeManager:
    """Manages application theme"""
    
    LIGHT_STYLE = """
    QMainWindow {
        background-color: #ffffff;
    }
    QWidget {
        background-color: #ffffff;
        color: #000000;
    }
    QPushButton {
        background-color: #0078d4;
        color: #ffffff;
        border: none;
        padding: 8px;
        border-radius: 4px;
    }
    QPushButton:hover {
        background-color: #106ebe;
    }
    QLineEdit {
        border: 1px solid #cccccc;
        padding: 4px;
        border-radius: 4px;
    }
    QComboBox {
        border: 1px solid #cccccc;
        padding: 4px;
        border-radius: 4px;
    }
    """
    
    DARK_STYLE = """
    QMainWindow {
        background-color: #1e1e1e;
    }
    QWidget {
        background-color: #1e1e1e;
        color: #ffffff;
    }
    QPushButton {
        background-color: #0078d4;
        color: #ffffff;
        border: none;
        padding: 8px;
        border-radius: 4px;
    }
    QPushButton:hover {
        background-color: #106ebe;
    }
    QLineEdit {
        border: 1px solid #404040;
        background-color: #2d2d2d;
        color: #ffffff;
        padding: 4px;
        border-radius: 4px;
    }
    QComboBox {
        border: 1px solid #404040;
        background-color: #2d2d2d;
        color: #ffffff;
        padding: 4px;
        border-radius: 4px;
    }
    QTableWidget {
        background-color: #252526;
        color: #ffffff;
        gridline-color: #3e3e42;
    }
    QHeaderView::section {
        background-color: #2d2d2d;
        color: #ffffff;
        padding: 4px;
        border: none;
    }
    """
    
    @staticmethod
    def get_system_theme() -> str:
        """Detect system theme preference"""
        # This is platform-specific
        # For now, return 'light' as default
        # Can be enhanced to detect system dark mode
        return 'light'
    
    @staticmethod
    def get_style(theme: str) -> str:
        """Get style sheet for theme"""
        if theme == 'dark':
            return ThemeManager.DARK_STYLE
        else:
            return ThemeManager.LIGHT_STYLE
```

**Usage**:

```python
# SRC/gui/main_window.py
from .styles import ThemeManager

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self._apply_theme()
    
    def _apply_theme(self):
        """Apply theme"""
        theme = self.settings_manager.get('theme', 'auto')
        if theme == 'auto':
            theme = ThemeManager.get_system_theme()
        
        style = ThemeManager.get_style(theme)
        self.setStyleSheet(style)
```

**Theme Toggle**:

```python
# SRC/gui/main_window.py
def _create_view_menu(self):
    """Create View menu"""
    view_menu = self.menuBar().addMenu("&View")
    
    # Theme submenu
    theme_menu = view_menu.addMenu("Theme")
    
    light_action = QAction("Light", self)
    light_action.setCheckable(True)
    light_action.triggered.connect(lambda: self._set_theme('light'))
    
    dark_action = QAction("Dark", self)
    dark_action.setCheckable(True)
    dark_action.triggered.connect(lambda: self._set_theme('dark'))
    
    auto_action = QAction("System", self)
    auto_action.setCheckable(True)
    auto_action.triggered.connect(lambda: self._set_theme('auto'))
    
    theme_group = QActionGroup(self)
    theme_group.addAction(light_action)
    theme_group.addAction(dark_action)
    theme_group.addAction(auto_action)
    
    current_theme = self.settings_manager.get('theme', 'auto')
    if current_theme == 'light':
        light_action.setChecked(True)
    elif current_theme == 'dark':
        dark_action.setChecked(True)
    else:
        auto_action.setChecked(True)
    
    theme_menu.addAction(light_action)
    theme_menu.addAction(dark_action)
    theme_menu.addAction(auto_action)
    
    view_menu.addSeparator()
    
    # Show/Hide options
    # ... other view options ...
    
def _set_theme(self, theme: str):
    """Set theme"""
    self.settings_manager.set('theme', theme)
    self.settings_manager.save()
    self._apply_theme()
```

**Acceptance Criteria**:
- [ ] Dark mode applies correctly
- [ ] Light mode applies correctly
- [ ] System theme detection works
- [ ] Theme persists between sessions
- [ ] All widgets styled correctly

---

### 3.5 Menu Bar and Keyboard Shortcuts

**Location**: `SRC/gui/main_window.py` (MODIFY)

**Standard Menus**:

```python
# SRC/gui/main_window.py
def _create_menu_bar(self):
    """Create complete menu bar"""
    menubar = self.menuBar()
    
    # File Menu
    file_menu = menubar.addMenu("&File")
    file_menu.addAction(self._create_action(
        "&Open XML...", "Ctrl+O",
        self._open_xml_file, "Open Rekordbox XML file"
    ))
    file_menu.addSeparator()
    file_menu.addMenu(self.recent_files_menu)
    file_menu.addSeparator()
    file_menu.addAction(self._create_action(
        "&Export Results...", "Ctrl+E",
        self._export_results, "Export results to file"
    ))
    file_menu.addSeparator()
    file_menu.addAction(self._create_action(
        "E&xit", "Ctrl+Q",
        self.close, "Exit application"
    ))
    
    # Edit Menu
    edit_menu = menubar.addMenu("&Edit")
    edit_menu.addAction(self._create_action(
        "&Settings...", "Ctrl+,",
        self._show_settings, "Open settings dialog"
    ))
    
    # View Menu
    view_menu = menubar.addMenu("&View")
    view_menu.addMenu(self._create_theme_menu())
    view_menu.addSeparator()
    view_menu.addAction(self._create_action(
        "&Full Screen", "F11",
        self._toggle_fullscreen, "Toggle full screen"
    ))
    
    # Help Menu
    help_menu = menubar.addMenu("&Help")
    help_menu.addAction(self._create_action(
        "&User Guide", "F1",
        self._show_user_guide, "Open user guide"
    ))
    help_menu.addAction(self._create_action(
        "&Keyboard Shortcuts", "",
        self._show_shortcuts, "Show keyboard shortcuts"
    ))
    help_menu.addSeparator()
    help_menu.addAction(self._create_action(
        "&About CuePoint", "",
        self._show_about, "About CuePoint"
    ))
    
def _create_action(self, text: str, shortcut: str, 
                   slot: callable, tooltip: str = "") -> QAction:
    """Create action with shortcut"""
    action = QAction(text, self)
    if shortcut:
        action.setShortcut(shortcut)
    action.setToolTip(tooltip)
    action.triggered.connect(slot)
    return action
```

**Keyboard Shortcuts Reference**:

| Shortcut | Action | Menu |
|----------|--------|------|
| Ctrl+O | Open XML file | File |
| Ctrl+E | Export results | File |
| Ctrl+S | Save settings | Edit |
| Ctrl+, | Settings dialog | Edit |
| Ctrl+R | Start processing | (Toolbar) |
| Ctrl+C | Cancel processing | (Toolbar) |
| F11 | Toggle full screen | View |
| F1 | User guide | Help |
| Ctrl+Q | Exit | File |

**Acceptance Criteria**:
- [ ] All menus display correctly
- [ ] Keyboard shortcuts work
- [ ] Menu actions trigger correctly
- [ ] Platform-specific shortcuts (Cmd on macOS)

---

### 3.6 Help System

**Location**: `SRC/gui/help_system.py` (NEW)

**Components**:
1. **Tooltips**: Context-sensitive help on hover
2. **In-App Help**: Help panel/dialog
3. **User Guide**: Comprehensive guide (HTML/Markdown)
4. **Keyboard Shortcuts Dialog**: Reference dialog

**Implementation**:

```python
# SRC/gui/help_system.py
class HelpSystem:
    """Manages help system"""
    
    TOOLTIPS = {
        'file_selector': "Select your Rekordbox XML export file. You can drag and drop the file here or click Browse.",
        'playlist_selector': "Select the playlist to process. Only playlists from the selected XML file are shown.",
        'start_button': "Start processing the selected playlist. This will search Beatport for each track.",
        'cancel_button': "Cancel the current processing operation.",
        'progress_bar': "Shows overall progress. Green indicates matched tracks, red indicates unmatched.",
        'results_table': "Displays processing results. Click column headers to sort.",
    }
    
    @staticmethod
    def set_tooltip(widget: QWidget, key: str):
        """Set tooltip for widget"""
        tooltip = HelpSystem.TOOLTIPS.get(key, "")
        if tooltip:
            widget.setToolTip(tooltip)

# Usage
HelpSystem.set_tooltip(self.file_selector, 'file_selector')
HelpSystem.set_tooltip(self.playlist_selector, 'playlist_selector')
```

**User Guide Dialog**:

```python
# SRC/gui/dialogs.py
class UserGuideDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("CuePoint User Guide")
        self.setMinimumSize(800, 600)
        
        layout = QVBoxLayout()
        
        # Text browser for HTML content
        browser = QTextBrowser()
        guide_html = self._load_guide_html()
        browser.setHtml(guide_html)
        layout.addWidget(browser)
        
        # Close button
        close_button = QPushButton("Close")
        close_button.clicked.connect(self.accept)
        layout.addWidget(close_button)
        
        self.setLayout(layout)
    
    def _load_guide_html(self) -> str:
        """Load user guide HTML"""
        # Load from DOCS/USER_GUIDE.md or similar
        return """
        <h1>CuePoint User Guide</h1>
        <h2>Getting Started</h2>
        <p>...</p>
        """
```

**Acceptance Criteria**:
- [ ] Tooltips display on hover
- [ ] User guide accessible
- [ ] Keyboard shortcuts dialog works
- [ ] Help content is clear and helpful

---

## 4. Implementation Order

1. **Week 1**:
   - Day 1-2: Settings persistence
   - Day 3-4: Recent files menu
   - Day 5: Basic icons and branding

2. **Week 2**:
   - Day 1-2: Menu bar and shortcuts
   - Day 3-4: Dark mode support
   - Day 5: Help system and tooltips

---

## 5. Testing Strategy

### Unit Tests
- Settings persistence: Save/load cycle
- Recent files: Add/remove/clear
- Theme: Apply/switch/persist

### Integration Tests
- Menu bar: All actions trigger correctly
- Keyboard shortcuts: All shortcuts work
- Settings: Persist between sessions

### Manual Testing
- Visual appearance on all platforms
- User experience flow
- Help system usability

---

## 6. Acceptance Criteria

- [ ] Settings persist between sessions
- [ ] Recent files menu works
- [ ] Icons display correctly
- [ ] Dark mode works
- [ ] Menu bar complete
- [ ] Keyboard shortcuts work
- [ ] Help system accessible
- [ ] Professional appearance
- [ ] Platform-specific behavior correct

---

## 7. Dependencies

- **Requires**: Phase 1 GUI Foundation (main window, widgets)
- **Used By**: All GUI features benefit from these enhancements

---

## 8. Notes

- Icons should be professionally designed or use free icon sets
- Dark mode should follow platform conventions
- Keyboard shortcuts should follow platform conventions (Cmd on macOS)
- Help content should be clear and non-technical

---

*This design is critical for Phase 1 completion.*

