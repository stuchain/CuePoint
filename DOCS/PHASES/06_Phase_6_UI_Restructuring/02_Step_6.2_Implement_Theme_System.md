# Step 6.2: Implement Theme System

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 3-4 days  
**Dependencies**: Step 6.1 (Design System & Asset Creation)

---

## Goal

Create a flexible theming system that applies the pixel art style throughout the application. The system should support light/dark modes, be easily customizable, and integrate seamlessly with PySide6/Qt styling.

---

## Success Criteria

- [ ] Theme configuration structure created
- [ ] QSS (Qt Style Sheets) implemented for all components
- [ ] Theme manager class created
- [ ] Theme switching functionality working
- [ ] All widgets styled consistently
- [ ] Light and dark modes supported
- [ ] Theme preferences persist across sessions
- [ ] Theme system documented

---

## Analytical Design

### Architecture Overview

```
Theme System Architecture:
┌─────────────────────────────────────┐
│         ThemeManager                │
│  - Load themes                      │
│  - Apply themes                     │
│  - Switch themes                    │
│  - Persist preferences              │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│ PixelTheme  │  │ ThemeConfig  │
│ - Colors    │  │ - Settings   │
│ - Styles    │  │ - Assets      │
│ - Assets    │  │ - Persistence │
└─────────────┘  └──────────────┘
```

### Theme Manager Implementation

```python
# src/cuepoint/ui/theme/theme_manager.py
"""
Theme management system for pixel art UI.
"""

from pathlib import Path
from typing import Optional, Dict, Any
from enum import Enum

from PySide6.QtCore import QObject, Signal, QSettings
from PySide6.QtWidgets import QApplication

from cuepoint.ui.theme.colors import PixelColorPalette
from cuepoint.ui.theme.assets.icon_registry import IconRegistry
from cuepoint.ui.theme.pixel_theme import PixelTheme


class ThemeMode(Enum):
    """Available theme modes."""
    LIGHT = "light"
    DARK = "dark"
    AUTO = "auto"  # Follow system preference


class ThemeManager(QObject):
    """Manages application themes and styling."""
    
    theme_changed = Signal(str)  # Emitted when theme changes
    
    def __init__(self, assets_path: Optional[Path] = None):
        super().__init__()
        
        # Set up paths
        if assets_path is None:
            assets_path = Path(__file__).parent / 'assets'
        self.assets_path = assets_path
        
        # Initialize components
        self.icon_registry = IconRegistry(self.assets_path)
        self.color_palette = PixelColorPalette()
        
        # Load settings
        self.settings = QSettings()
        self.current_mode = ThemeMode(
            self.settings.value('ui/theme_mode', ThemeMode.LIGHT.value)
        )
        
        # Initialize theme
        self.current_theme: Optional[PixelTheme] = None
        self._apply_theme()
    
    def _apply_theme(self) -> None:
        """Apply current theme to application."""
        # Determine actual theme mode
        if self.current_mode == ThemeMode.AUTO:
            actual_mode = self._detect_system_theme()
        else:
            actual_mode = self.current_mode
        
        # Create theme instance
        self.current_theme = PixelTheme(
            mode=actual_mode,
            color_palette=self.color_palette,
            icon_registry=self.icon_registry
        )
        
        # Apply to application
        app = QApplication.instance()
        if app:
            app.setStyleSheet(self.current_theme.get_stylesheet())
        
        # Emit signal
        self.theme_changed.emit(actual_mode.value)
    
    def set_theme_mode(self, mode: ThemeMode) -> None:
        """Set theme mode and apply."""
        self.current_mode = mode
        self.settings.setValue('ui/theme_mode', mode.value)
        self._apply_theme()
    
    def get_theme_mode(self) -> ThemeMode:
        """Get current theme mode."""
        return self.current_mode
    
    def get_current_theme(self) -> PixelTheme:
        """Get current theme instance."""
        return self.current_theme
    
    def _detect_system_theme(self) -> ThemeMode:
        """Detect system theme preference."""
        # Platform-specific detection
        # For now, default to light
        # Can be enhanced with platform-specific code
        return ThemeMode.LIGHT
    
    def get_icon(self, name: str, size: str = '16x16'):
        """Get icon from registry."""
        return self.icon_registry.get_icon(name, size)
    
    def get_color(self, category: str, name: str) -> str:
        """Get color from palette."""
        return self.color_palette.get_color(category, name)
```

### Pixel Theme Implementation

```python
# src/cuepoint/ui/theme/pixel_theme.py
"""
Pixel art theme implementation.
"""

from typing import Dict
from enum import Enum

from cuepoint.ui.theme.colors import PixelColorPalette
from cuepoint.ui.theme.assets.icon_registry import IconRegistry


class PixelTheme:
    """Pixel art theme with colors, styles, and assets."""
    
    def __init__(
        self,
        mode: Enum,
        color_palette: PixelColorPalette,
        icon_registry: IconRegistry
    ):
        self.mode = mode
        self.color_palette = color_palette
        self.icon_registry = icon_registry
        self._stylesheet_cache: Optional[str] = None
    
    def get_stylesheet(self) -> str:
        """Get complete QSS stylesheet for this theme."""
        if self._stylesheet_cache:
            return self._stylesheet_cache
        
        stylesheet = self._build_stylesheet()
        self._stylesheet_cache = stylesheet
        return stylesheet
    
    def _build_stylesheet(self) -> str:
        """Build QSS stylesheet from theme configuration."""
        is_dark = self.mode.value == 'dark'
        
        # Get colors based on mode
        bg_color = self.color_palette.get_color(
            'background', 'dark_bg' if is_dark else 'light_bg'
        )
        card_bg = self.color_palette.get_color(
            'background', 'card_dark' if is_dark else 'card_bg'
        )
        text_color = self.color_palette.get_color(
            'text', 'inverse' if is_dark else 'primary'
        )
        primary_color = self.color_palette.get_color('primary', 'blue')
        
        # Build stylesheet
        stylesheet = f"""
        /* Main Window */
        QMainWindow {{
            background-color: {bg_color};
            color: {text_color};
        }}
        
        /* Widgets */
        QWidget {{
            background-color: {bg_color};
            color: {text_color};
            font-family: "Segoe UI", Arial, sans-serif;
            font-size: 14px;
        }}
        
        /* Buttons */
        QPushButton {{
            background-color: {primary_color};
            color: #FFFFFF;
            border: 2px solid {self._darken_color(primary_color)};
            border-radius: 4px;
            padding: 8px 16px;
            font-weight: bold;
            min-height: 32px;
        }}
        
        QPushButton:hover {{
            background-color: {self._lighten_color(primary_color)};
        }}
        
        QPushButton:pressed {{
            background-color: {self._darken_color(primary_color)};
        }}
        
        QPushButton:disabled {{
            background-color: {self.color_palette.get_color('text', 'disabled')};
            color: {self.color_palette.get_color('text', 'disabled')};
            border-color: {self.color_palette.get_color('text', 'disabled')};
        }}
        
        /* Secondary Button */
        QPushButton[class="secondary"] {{
            background-color: {card_bg};
            color: {text_color};
            border: 1px solid {self.color_palette.get_color('text', 'secondary')};
        }}
        
        QPushButton[class="secondary"]:hover {{
            background-color: {self.color_palette.get_color('background', 'hover_bg')};
        }}
        
        /* Success Button */
        QPushButton[class="success"] {{
            background-color: {self.color_palette.get_color('status', 'success')};
            color: #FFFFFF;
            border: 2px solid {self._darken_color(self.color_palette.get_color('status', 'success'))};
        }}
        
        /* Danger Button */
        QPushButton[class="danger"] {{
            background-color: {self.color_palette.get_color('status', 'error')};
            color: #FFFFFF;
            border: 2px solid {self._darken_color(self.color_palette.get_color('status', 'error'))};
        }}
        
        /* Cards/Panels */
        QGroupBox {{
            background-color: {card_bg};
            border: 2px solid {self.color_palette.get_color('text', 'secondary')};
            border-radius: 4px;
            margin-top: 12px;
            padding-top: 12px;
            font-weight: bold;
        }}
        
        QGroupBox::title {{
            subcontrol-origin: margin;
            subcontrol-position: top left;
            padding: 0 8px;
            background-color: {card_bg};
        }}
        
        /* Input Fields */
        QLineEdit, QTextEdit, QPlainTextEdit {{
            background-color: {card_bg};
            border: 2px solid {self.color_palette.get_color('text', 'secondary')};
            border-radius: 4px;
            padding: 6px;
            color: {text_color};
        }}
        
        QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus {{
            border-color: {primary_color};
        }}
        
        /* ComboBox */
        QComboBox {{
            background-color: {card_bg};
            border: 2px solid {self.color_palette.get_color('text', 'secondary')};
            border-radius: 4px;
            padding: 6px;
            color: {text_color};
            min-width: 120px;
        }}
        
        QComboBox:hover {{
            border-color: {primary_color};
        }}
        
        QComboBox::drop-down {{
            border: none;
            width: 20px;
        }}
        
        QComboBox::down-arrow {{
            image: none;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 6px solid {text_color};
            width: 0;
            height: 0;
        }}
        
        /* Tables */
        QTableWidget, QTableView {{
            background-color: {card_bg};
            alternate-background-color: {self.color_palette.get_color('background', 'hover_bg')};
            gridline-color: {self.color_palette.get_color('text', 'secondary')};
            color: {text_color};
            border: 2px solid {self.color_palette.get_color('text', 'secondary')};
            border-radius: 4px;
        }}
        
        QHeaderView::section {{
            background-color: {self.color_palette.get_color('background', 'hover_bg')};
            color: {text_color};
            padding: 6px;
            border: none;
            border-bottom: 2px solid {self.color_palette.get_color('text', 'secondary')};
            font-weight: bold;
        }}
        
        /* Progress Bar */
        QProgressBar {{
            background-color: {card_bg};
            border: 2px solid {self.color_palette.get_color('text', 'secondary')};
            border-radius: 4px;
            text-align: center;
            color: {text_color};
            height: 24px;
        }}
        
        QProgressBar::chunk {{
            background-color: {primary_color};
            border-radius: 2px;
        }}
        
        /* Scrollbars */
        QScrollBar:vertical {{
            background-color: {card_bg};
            width: 12px;
            border: none;
        }}
        
        QScrollBar::handle:vertical {{
            background-color: {self.color_palette.get_color('text', 'secondary')};
            border-radius: 6px;
            min-height: 20px;
        }}
        
        QScrollBar::handle:vertical:hover {{
            background-color: {primary_color};
        }}
        
        /* Tabs */
        QTabWidget::pane {{
            border: 2px solid {self.color_palette.get_color('text', 'secondary')};
            border-radius: 4px;
            background-color: {card_bg};
        }}
        
        QTabBar::tab {{
            background-color: {bg_color};
            color: {text_color};
            border: 2px solid {self.color_palette.get_color('text', 'secondary')};
            border-bottom: none;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
            padding: 8px 16px;
            margin-right: 2px;
        }}
        
        QTabBar::tab:selected {{
            background-color: {card_bg};
            border-bottom: 2px solid {card_bg};
        }}
        
        QTabBar::tab:hover {{
            background-color: {self.color_palette.get_color('background', 'hover_bg')};
        }}
        
        /* Tooltips */
        QToolTip {{
            background-color: {card_bg};
            color: {text_color};
            border: 2px solid {self.color_palette.get_color('text', 'secondary')};
            border-radius: 4px;
            padding: 4px;
        }}
        
        /* Status Colors */
        .status-success {{
            color: {self.color_palette.get_color('status', 'success')};
        }}
        
        .status-error {{
            color: {self.color_palette.get_color('status', 'error')};
        }}
        
        .status-warning {{
            color: {self.color_palette.get_color('status', 'warning')};
        }}
        
        .status-info {{
            color: {self.color_palette.get_color('status', 'info')};
        }}
        """
        
        return stylesheet
    
    def _lighten_color(self, hex_color: str, factor: float = 0.2) -> str:
        """Lighten a hex color by a factor."""
        # Simple implementation - can be enhanced
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
        
        r = min(255, int(r + (255 - r) * factor))
        g = min(255, int(g + (255 - g) * factor))
        b = min(255, int(b + (255 - b) * factor))
        
        return f"#{r:02X}{g:02X}{b:02X}"
    
    def _darken_color(self, hex_color: str, factor: float = 0.2) -> str:
        """Darken a hex color by a factor."""
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
        
        r = int(r * (1 - factor))
        g = int(g * (1 - factor))
        b = int(b * (1 - factor))
        
        return f"#{r:02X}{g:02X}{b:02X}"
```

### Integration with Main Window

```python
# Integration example in main_window.py

from cuepoint.ui.theme.theme_manager import ThemeManager, ThemeMode

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        # Initialize theme manager
        self.theme_manager = ThemeManager()
        self.theme_manager.theme_changed.connect(self.on_theme_changed)
        
        # Rest of initialization...
    
    def on_theme_changed(self, theme_name: str):
        """Handle theme change."""
        # Update any theme-specific UI elements
        pass
    
    def toggle_theme(self):
        """Toggle between light and dark themes."""
        current = self.theme_manager.get_theme_mode()
        new_mode = ThemeMode.DARK if current == ThemeMode.LIGHT else ThemeMode.LIGHT
        self.theme_manager.set_theme_mode(new_mode)
```

---

## Detailed Implementation Guide

### Step-by-Step Implementation

#### Step 1: Verify Prerequisites

**Action**: Ensure Step 6.1 is complete

**Check**:
```bash
# Verify color palette exists
dir SRC\cuepoint\ui\theme\colors.py

# Verify assets directory structure exists
dir SRC\cuepoint\ui\theme\assets /s
```

**If missing**: Complete Step 6.1 first

#### Step 2: Create Theme Manager

**File Path**: `SRC/cuepoint/ui/theme/theme_manager.py`

**Complete Implementation**:
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Theme management system for pixel art UI.

This module provides the ThemeManager class which handles theme loading,
switching, and application to the Qt application.
"""

import logging
import platform
from pathlib import Path
from typing import Optional

from PySide6.QtCore import QObject, Signal, QSettings
from PySide6.QtWidgets import QApplication

from cuepoint.ui.theme.colors import PixelColorPalette
from cuepoint.ui.theme.assets.icon_registry import IconRegistry
from cuepoint.ui.theme.pixel_theme import PixelTheme

logger = logging.getLogger(__name__)


class ThemeMode:
    """Available theme modes."""
    LIGHT = "light"
    DARK = "dark"
    AUTO = "auto"  # Follow system preference


class ThemeManager(QObject):
    """Manages application themes and styling.
    
    This class is responsible for:
    - Loading and applying themes
    - Managing theme preferences
    - Providing icons and colors to UI components
    - Detecting system theme preferences
    
    Usage:
        manager = ThemeManager()
        manager.set_theme_mode(ThemeMode.DARK)
        icon = manager.get_icon('file', '16x16')
    """
    
    theme_changed = Signal(str)  # Emitted when theme changes (theme_name)
    
    def __init__(self, assets_path: Optional[Path] = None):
        """Initialize theme manager.
        
        Args:
            assets_path: Optional path to assets directory.
                        Defaults to theme/assets relative to this file.
        """
        super().__init__()
        
        # Set up paths
        if assets_path is None:
            theme_dir = Path(__file__).parent
            assets_path = theme_dir / 'assets'
        self.assets_path = Path(assets_path)
        
        # Initialize components
        self.icon_registry = IconRegistry(self.assets_path)
        self.color_palette = PixelColorPalette()
        
        # Load settings
        self.settings = QSettings("CuePoint", "CuePoint")
        saved_mode = self.settings.value('ui/theme_mode', ThemeMode.LIGHT, type=str)
        self.current_mode = saved_mode
        
        # Initialize theme
        self.current_theme: Optional[PixelTheme] = None
        self._apply_theme()
        
        logger.info(f"Theme manager initialized with mode: {self.current_mode}")
    
    def _apply_theme(self) -> None:
        """Apply current theme to application."""
        # Determine actual theme mode
        if self.current_mode == ThemeMode.AUTO:
            actual_mode = self._detect_system_theme()
        else:
            actual_mode = self.current_mode
        
        # Create theme instance
        self.current_theme = PixelTheme(
            mode=actual_mode,
            color_palette=self.color_palette,
            icon_registry=self.icon_registry
        )
        
        # Apply to application
        app = QApplication.instance()
        if app:
            stylesheet = self.current_theme.get_stylesheet()
            app.setStyleSheet(stylesheet)
            logger.debug(f"Theme applied: {actual_mode}")
        else:
            logger.warning("QApplication instance not found, theme not applied")
        
        # Emit signal
        self.theme_changed.emit(actual_mode)
    
    def set_theme_mode(self, mode: str) -> None:
        """Set theme mode and apply.
        
        Args:
            mode: Theme mode ('light', 'dark', or 'auto')
        """
        if mode not in [ThemeMode.LIGHT, ThemeMode.DARK, ThemeMode.AUTO]:
            logger.warning(f"Invalid theme mode: {mode}, using LIGHT")
            mode = ThemeMode.LIGHT
        
        self.current_mode = mode
        self.settings.setValue('ui/theme_mode', mode)
        self._apply_theme()
        logger.info(f"Theme mode changed to: {mode}")
    
    def get_theme_mode(self) -> str:
        """Get current theme mode.
        
        Returns:
            Current theme mode string
        """
        return self.current_mode
    
    def get_current_theme(self) -> Optional[PixelTheme]:
        """Get current theme instance.
        
        Returns:
            Current PixelTheme instance, or None if not initialized
        """
        return self.current_theme
    
    def _detect_system_theme(self) -> str:
        """Detect system theme preference.
        
        Returns:
            'light' or 'dark' based on system preference
        """
        system = platform.system()
        
        if system == "Windows":
            try:
                import winreg
                key = winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER,
                    r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
                )
                value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
                winreg.CloseKey(key)
                return ThemeMode.LIGHT if value == 1 else ThemeMode.DARK
            except Exception as e:
                logger.warning(f"Could not detect Windows theme: {e}")
                return ThemeMode.LIGHT
        elif system == "Darwin":  # macOS
            # macOS detection would go here
            return ThemeMode.LIGHT
        elif system == "Linux":
            # Linux detection would go here
            return ThemeMode.LIGHT
        else:
            return ThemeMode.LIGHT
    
    def get_icon(self, name: str, size: str = '16x16'):
        """Get icon from registry.
        
        Args:
            name: Icon name
            size: Icon size ('16x16' or '32x32')
            
        Returns:
            QIcon instance
        """
        return self.icon_registry.get_icon(name, size)
    
    def get_color(self, category: str, name: str) -> str:
        """Get color from palette.
        
        Args:
            category: Color category
            name: Color name
            
        Returns:
            Hex color string
        """
        return self.color_palette.get_color(category, name)
```

#### Step 3: Create Pixel Theme Class

**File Path**: `SRC/cuepoint/ui/theme/pixel_theme.py`

**Complete Implementation** (continuing from existing code with full helper methods):
```python
    def _lighten_color(self, hex_color: str, factor: float = 0.2) -> str:
        """Lighten a hex color by a factor.
        
        Args:
            hex_color: Hex color string (e.g., '#4A90E2')
            factor: Lightening factor (0.0 to 1.0)
            
        Returns:
            Lightened hex color string
        """
        # Remove # if present
        hex_color = hex_color.lstrip('#')
        
        # Parse RGB
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        
        # Lighten
        r = min(255, int(r + (255 - r) * factor))
        g = min(255, int(g + (255 - g) * factor))
        b = min(255, int(b + (255 - b) * factor))
        
        return f"#{r:02X}{g:02X}{b:02X}"
    
    def _darken_color(self, hex_color: str, factor: float = 0.2) -> str:
        """Darken a hex color by a factor.
        
        Args:
            hex_color: Hex color string (e.g., '#4A90E2')
            factor: Darkening factor (0.0 to 1.0)
            
        Returns:
            Darkened hex color string
        """
        # Remove # if present
        hex_color = hex_color.lstrip('#')
        
        # Parse RGB
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        
        # Darken
        r = int(r * (1 - factor))
        g = int(g * (1 - factor))
        b = int(b * (1 - factor))
        
        return f"#{r:02X}{g:02X}{b:02X}"
```

#### Step 4: Integrate with Main Window

**File Path**: `SRC/cuepoint/ui/main_window.py`

**Action**: Add theme manager integration

**Code to Add** (at the top of MainWindow.__init__):
```python
from cuepoint.ui.theme.theme_manager import ThemeManager, ThemeMode

class MainWindow(QMainWindow):
    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        
        # Initialize theme manager FIRST (before any UI)
        self.theme_manager = ThemeManager()
        self.theme_manager.theme_changed.connect(self.on_theme_changed)
        
        # Rest of initialization...
        self.controller = GUIController()
        # ... existing code ...
```

**Code to Add** (new method in MainWindow):
```python
    def on_theme_changed(self, theme_name: str):
        """Handle theme change.
        
        Args:
            theme_name: Name of the new theme ('light' or 'dark')
        """
        # Update any theme-specific UI elements
        # This is called automatically when theme changes
        pass
    
    def toggle_theme(self):
        """Toggle between light and dark themes."""
        current = self.theme_manager.get_theme_mode()
        new_mode = ThemeMode.DARK if current == ThemeMode.LIGHT else ThemeMode.LIGHT
        self.theme_manager.set_theme_mode(new_mode)
```

#### Step 5: Add Theme Toggle to Menu

**File Path**: `SRC/cuepoint/ui/main_window.py`

**Action**: Add theme toggle to View menu

**Code to Add** (in create_menu_bar or similar method):
```python
    def _create_view_menu(self):
        """Create View menu."""
        view_menu = self.menuBar().addMenu("&View")
        
        # Theme submenu
        theme_menu = view_menu.addMenu("&Theme")
        
        light_action = QAction("&Light", self)
        light_action.setCheckable(True)
        light_action.setChecked(self.theme_manager.get_theme_mode() == ThemeMode.LIGHT)
        light_action.triggered.connect(lambda: self.theme_manager.set_theme_mode(ThemeMode.LIGHT))
        theme_menu.addAction(light_action)
        
        dark_action = QAction("&Dark", self)
        dark_action.setCheckable(True)
        dark_action.setChecked(self.theme_manager.get_theme_mode() == ThemeMode.DARK)
        dark_action.triggered.connect(lambda: self.theme_manager.set_theme_mode(ThemeMode.DARK))
        theme_menu.addAction(dark_action)
        
        auto_action = QAction("&Auto (System)", self)
        auto_action.setCheckable(True)
        auto_action.setChecked(self.theme_manager.get_theme_mode() == ThemeMode.AUTO)
        auto_action.triggered.connect(lambda: self.theme_manager.set_theme_mode(ThemeMode.AUTO))
        theme_menu.addAction(auto_action)
        
        # Group actions
        theme_group = QActionGroup(self)
        theme_group.addAction(light_action)
        theme_group.addAction(dark_action)
        theme_group.addAction(auto_action)
```

#### Step 6: Testing

**File Path**: `SRC/tests/unit/ui/theme/test_theme_manager.py`

**Complete Test Code**:
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for theme manager."""

import tempfile
from pathlib import Path

import pytest
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QSettings

from cuepoint.ui.theme.theme_manager import ThemeManager, ThemeMode


@pytest.fixture
def qapp():
    """Create QApplication for testing."""
    if not QApplication.instance():
        app = QApplication([])
        yield app
        app.quit()
    else:
        yield QApplication.instance()


@pytest.fixture
def temp_assets(tmp_path):
    """Create temporary assets directory."""
    assets = tmp_path / 'assets'
    (assets / 'icons' / '16x16').mkdir(parents=True)
    (assets / 'icons' / '32x32').mkdir(parents=True)
    return assets


def test_theme_manager_initialization(qapp, temp_assets):
    """Test theme manager initialization."""
    manager = ThemeManager(temp_assets)
    assert manager.current_mode in [ThemeMode.LIGHT, ThemeMode.DARK, ThemeMode.AUTO]
    assert manager.current_theme is not None


def test_set_theme_mode(qapp, temp_assets):
    """Test setting theme mode."""
    manager = ThemeManager(temp_assets)
    
    manager.set_theme_mode(ThemeMode.DARK)
    assert manager.get_theme_mode() == ThemeMode.DARK
    
    manager.set_theme_mode(ThemeMode.LIGHT)
    assert manager.get_theme_mode() == ThemeMode.LIGHT


def test_theme_persistence(qapp, temp_assets):
    """Test theme preference persistence."""
    # Set theme
    manager1 = ThemeManager(temp_assets)
    manager1.set_theme_mode(ThemeMode.DARK)
    
    # Create new manager (should load saved preference)
    manager2 = ThemeManager(temp_assets)
    assert manager2.get_theme_mode() == ThemeMode.DARK


def test_get_icon(qapp, temp_assets):
    """Test getting icon."""
    manager = ThemeManager(temp_assets)
    icon = manager.get_icon('file', '16x16')
    assert icon is not None


def test_get_color(qapp, temp_assets):
    """Test getting color."""
    manager = ThemeManager(temp_assets)
    blue = manager.get_color('primary', 'blue')
    assert blue == '#4A90E2'
```

**Run Tests**:
```bash
cd SRC
python -m pytest tests/unit/ui/theme/test_theme_manager.py -v
```

#### Step 7: Verify Integration

**Action**: Test theme system in application

**Manual Test Steps**:
1. Run application: `python SRC/gui_app.py`
2. Check that theme is applied on startup
3. Go to View > Theme > Dark
4. Verify UI changes to dark mode
5. Restart application
6. Verify theme preference persisted

**Expected Results**:
- Application starts with saved theme
- Theme switching works immediately
- All widgets styled correctly
- Theme preference persists across sessions

---

## File Structure

```
src/cuepoint/ui/theme/
├── __init__.py
├── theme_manager.py          # Main theme manager
├── pixel_theme.py            # Theme implementation
├── colors.py                 # Color palette (from Step 6.1)
├── assets/                   # Assets (from Step 6.1)
│   └── ...
└── stylesheets/              # Optional: separate QSS files
    ├── base.qss
    ├── light.qss
    └── dark.qss
```

---

## Testing Requirements

### Functional Testing
- [ ] Theme manager initializes correctly
- [ ] Theme switching works
- [ ] Theme preferences persist
- [ ] All widgets styled correctly
- [ ] Icons load correctly
- [ ] Colors applied correctly

### Visual Testing
- [ ] Light mode displays correctly
- [ ] Dark mode displays correctly
- [ ] All components styled consistently
- [ ] No visual glitches
- [ ] Proper contrast ratios

### Integration Testing
- [ ] Theme applies to all windows
- [ ] Theme persists across sessions
- [ ] Theme changes update immediately
- [ ] No performance issues

---

## Implementation Checklist

- [ ] Create ThemeManager class
- [ ] Create PixelTheme class
- [ ] Implement QSS stylesheet generation
- [ ] Implement color palette integration
- [ ] Implement icon registry integration
- [ ] Add theme switching functionality
- [ ] Add theme persistence
- [ ] Integrate with main window
- [ ] Test light mode
- [ ] Test dark mode
- [ ] Test theme switching
- [ ] Verify all widgets styled
- [ ] Document theme system
- [ ] Create theme customization guide

---

## Dependencies

- **Step 6.1**: Design System & Asset Creation (must be completed first)
- **PySide6**: For QSS styling
- **QSettings**: For theme persistence

---

## Notes

- **QSS Limitations**: Some advanced styling may require custom widgets
- **Performance**: Cache stylesheets to avoid regeneration
- **Customization**: Allow users to customize colors in future
- **Platform**: System theme detection may vary by platform

---

## Next Steps

After completing this step:
1. Proceed to Step 6.3: Redesign Main Window - Simple Mode
2. Main window will use theme system
3. Test theme with new UI components

