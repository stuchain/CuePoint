#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Styles Module - Platform-specific themes and styling

This module provides centralized styling with platform-specific overrides.
Use get_stylesheet() to get the appropriate styles for the current platform.

Usage:
    from cuepoint.ui.widgets.styles import get_stylesheet, is_macos, Colors
    
    # Apply to entire app:
    app.setStyleSheet(get_stylesheet())
    
    # Or check platform for specific widgets:
    if is_macos():
        widget.setStyleSheet("background: #1e1e1e;")
"""

import sys
from typing import Dict


def is_macos() -> bool:
    """Check if running on macOS."""
    return sys.platform == "darwin"


def is_windows() -> bool:
    """Check if running on Windows."""
    return sys.platform == "win32"


def is_linux() -> bool:
    """Check if running on Linux."""
    return sys.platform.startswith("linux")


class Colors:
    """Color palette - override per platform as needed."""
    
    # Base colors (shared)
    SUCCESS = "#4CAF50"
    ERROR = "#F44336"
    WARNING = "#FF9800"
    INFO = "#2196F3"
    
    # Platform-specific colors
    if is_macos():
        # macOS-specific colors (native feel)
        PRIMARY = "#007AFF"          # macOS blue
        SECONDARY = "#5856D6"        # macOS purple
        BACKGROUND = "#1e1e1e"       # Dark background
        SURFACE = "#2d2d2d"          # Slightly lighter surface
        TEXT_PRIMARY = "#ffffff"
        TEXT_SECONDARY = "#8e8e93"   # macOS secondary text
        BORDER = "#3d3d3d"
        ACCENT = "#30D158"           # macOS green accent
        
        # Group box styling
        GROUP_HEADER = "#ffffff"
        
        # Button colors
        BUTTON_PRIMARY_BG = "#007AFF"
        BUTTON_PRIMARY_TEXT = "#ffffff"
        BUTTON_HOVER = "#0056b3"
        
    else:
        # Windows/Linux colors
        PRIMARY = "#0078d4"          # Windows blue
        SECONDARY = "#6b69d6"
        BACKGROUND = "#1e1e1e"
        SURFACE = "#252526"
        TEXT_PRIMARY = "#ffffff"
        TEXT_SECONDARY = "#888888"
        BORDER = "#3c3c3c"
        ACCENT = "#4CAF50"
        
        # Group box styling
        GROUP_HEADER = "#ffffff"
        
        # Button colors
        BUTTON_PRIMARY_BG = "#0078d4"
        BUTTON_PRIMARY_TEXT = "#ffffff"
        BUTTON_HOVER = "#106ebe"


def get_base_stylesheet() -> str:
    """Get the base stylesheet shared across all platforms."""
    return f"""
        /* Base application styling */
        QMainWindow, QWidget {{
            background-color: {Colors.BACKGROUND};
            color: {Colors.TEXT_PRIMARY};
        }}
        
        QGroupBox {{
            font-weight: bold;
            color: {Colors.GROUP_HEADER};
            border: 1px solid {Colors.BORDER};
            border-radius: 6px;
            margin-top: 12px;
            padding-top: 10px;
        }}
        
        QGroupBox::title {{
            subcontrol-origin: margin;
            subcontrol-position: top left;
            padding: 0 8px;
            color: {Colors.GROUP_HEADER};
        }}
        
        QPushButton {{
            background-color: {Colors.BUTTON_PRIMARY_BG};
            color: {Colors.BUTTON_PRIMARY_TEXT};
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            font-weight: bold;
        }}
        
        QPushButton:hover {{
            background-color: {Colors.BUTTON_HOVER};
        }}
        
        QPushButton:pressed {{
            background-color: {Colors.PRIMARY};
        }}
        
        QPushButton:disabled {{
            background-color: {Colors.BORDER};
            color: {Colors.TEXT_SECONDARY};
        }}
        
        QLineEdit, QTextEdit, QPlainTextEdit {{
            background-color: {Colors.SURFACE};
            color: {Colors.TEXT_PRIMARY};
            border: 1px solid {Colors.BORDER};
            border-radius: 4px;
            padding: 6px;
        }}
        
        QLineEdit:focus, QTextEdit:focus {{
            border-color: {Colors.PRIMARY};
        }}
        
        QComboBox {{
            background-color: {Colors.SURFACE};
            color: {Colors.TEXT_PRIMARY};
            border: 1px solid {Colors.BORDER};
            border-radius: 4px;
            padding: 6px;
        }}
        
        QProgressBar {{
            background-color: {Colors.SURFACE};
            border: none;
            border-radius: 4px;
            text-align: center;
            color: {Colors.TEXT_PRIMARY};
        }}
        
        QProgressBar::chunk {{
            background-color: {Colors.PRIMARY};
            border-radius: 4px;
        }}
        
        QTabWidget::pane {{
            border: 1px solid {Colors.BORDER};
            border-radius: 4px;
        }}
        
        QTabBar::tab {{
            background-color: {Colors.SURFACE};
            color: {Colors.TEXT_SECONDARY};
            padding: 8px 16px;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
        }}
        
        QTabBar::tab:selected {{
            background-color: {Colors.BACKGROUND};
            color: {Colors.TEXT_PRIMARY};
        }}
        
        QTableWidget, QTreeWidget, QListWidget {{
            background-color: {Colors.SURFACE};
            color: {Colors.TEXT_PRIMARY};
            border: 1px solid {Colors.BORDER};
            border-radius: 4px;
            gridline-color: {Colors.BORDER};
        }}
        
        QHeaderView::section {{
            background-color: {Colors.BACKGROUND};
            color: {Colors.TEXT_PRIMARY};
            padding: 6px;
            border: none;
            border-bottom: 1px solid {Colors.BORDER};
        }}
        
        QScrollBar:vertical {{
            background-color: {Colors.BACKGROUND};
            width: 12px;
            border-radius: 6px;
        }}
        
        QScrollBar::handle:vertical {{
            background-color: {Colors.BORDER};
            border-radius: 6px;
            min-height: 20px;
        }}
        
        QScrollBar::handle:vertical:hover {{
            background-color: {Colors.TEXT_SECONDARY};
        }}
        
        QRadioButton, QCheckBox {{
            color: {Colors.TEXT_PRIMARY};
        }}
        
        QLabel {{
            color: {Colors.TEXT_PRIMARY};
        }}
        
        QMenu {{
            background-color: {Colors.SURFACE};
            color: {Colors.TEXT_PRIMARY};
            border: 1px solid {Colors.BORDER};
        }}
        
        QMenu::item:selected {{
            background-color: {Colors.PRIMARY};
        }}
        
        QMenuBar {{
            background-color: {Colors.BACKGROUND};
            color: {Colors.TEXT_PRIMARY};
        }}
        
        QMenuBar::item:selected {{
            background-color: {Colors.PRIMARY};
        }}
    """


def get_macos_stylesheet() -> str:
    """Get macOS-specific stylesheet - readable but space-efficient."""
    return """
        /* macOS styling - everything visible and readable */
        
        /* Readable font size */
        QWidget {
            font-size: 13px;
        }
        
        /* Clean buttons */
        QPushButton {
            border-radius: 6px;
            font-size: 12px;
            padding: 5px 14px;
            min-height: 26px;
        }
        
        /* Clean group boxes with less vertical padding */
        QGroupBox {
            border-radius: 6px;
            border: 1px solid #444;
            margin-top: 14px;
            padding: 6px;
            padding-top: 6px;
            font-size: 11px;
            font-weight: bold;
        }
        
        QGroupBox::title {
            subcontrol-origin: margin;
            subcontrol-position: top left;
            padding: 0 6px;
            font-size: 11px;
        }
        
        /* Readable inputs */
        QLineEdit, QTextEdit, QPlainTextEdit {
            padding: 4px 6px;
            font-size: 12px;
            min-height: 22px;
        }
        
        QComboBox {
            padding: 4px 8px;
            font-size: 12px;
            min-height: 24px;
        }
        
        /* Visible progress bars */
        QProgressBar {
            min-height: 18px;
            max-height: 20px;
            font-size: 11px;
        }
        
        /* macOS thin scrollbars */
        QScrollBar:vertical {
            width: 8px;
        }
        
        QScrollBar::handle:vertical {
            border-radius: 4px;
            min-height: 30px;
        }
        
        QScrollBar:horizontal {
            height: 8px;
        }
        
        QScrollBar::handle:horizontal {
            border-radius: 4px;
        }
        
        /* Full tab names visible - no truncation */
        QTabBar::tab {
            padding: 6px 20px;
            font-size: 13px;
            border-radius: 4px 4px 0 0;
            margin-right: 2px;
        }
        
        QTabBar {
            qproperty-expanding: false;
        }
        
        QTabWidget::pane {
            padding: 4px;
            border: 1px solid #444;
        }
        
        /* Readable table */
        QTableWidget, QTreeWidget, QListWidget {
            font-size: 11px;
        }
        
        QTableWidget::item, QTreeWidget::item, QListWidget::item {
            padding: 3px 6px;
        }
        
        QHeaderView::section {
            padding: 4px 8px;
            font-size: 11px;
        }
        
        /* Readable labels */
        QLabel {
            font-size: 12px;
        }
        
        /* Readable radio/checkbox */
        QRadioButton, QCheckBox {
            font-size: 12px;
            spacing: 6px;
        }
        
        /* Menus */
        QMenu {
            font-size: 12px;
        }
        
        QMenu::item {
            padding: 5px 20px 5px 10px;
        }
        
        QMenuBar {
            font-size: 12px;
        }
        
        /* Status bar */
        QStatusBar {
            font-size: 11px;
            min-height: 22px;
        }
        
        /* Splitter */
        QSplitter::handle:vertical {
            height: 4px;
        }
    """


def get_windows_stylesheet() -> str:
    """Get Windows-specific stylesheet additions/overrides."""
    return """
        /* Windows-specific styling */
        
        /* Fluent Design-inspired buttons */
        QPushButton {
            border-radius: 4px;
            font-size: 12px;
        }
        
        /* Sharper corners for Windows */
        QGroupBox {
            border-radius: 4px;
        }
        
        /* Standard scrollbars */
        QScrollBar:vertical {
            width: 14px;
        }
    """


def get_stylesheet() -> str:
    """
    Get the complete stylesheet for the current platform.
    
    Returns:
        str: Combined stylesheet with base + platform-specific styles.
    
    Usage:
        app = QApplication(sys.argv)
        app.setStyleSheet(get_stylesheet())
    """
    base = get_base_stylesheet()
    
    if is_macos():
        return base + get_macos_stylesheet()
    elif is_windows():
        return base + get_windows_stylesheet()
    else:
        return base  # Linux uses base styles


# Layout constants for platform-specific sizing
class Layout:
    """Platform-specific layout constants."""
    
    if is_macos():
        # macOS layout - readable but efficient
        MARGIN = 6
        SPACING = 6
        BUTTON_HEIGHT = 28
        INPUT_HEIGHT = 26
        GROUP_MARGIN_TOP = 10
        WINDOW_MIN_WIDTH = 900
        WINDOW_MIN_HEIGHT = 650
        DEFAULT_WIDTH = 1000
        DEFAULT_HEIGHT = 700
    else:
        # Standard Windows/Linux layout
        MARGIN = 8
        SPACING = 8
        BUTTON_HEIGHT = 32
        INPUT_HEIGHT = 30
        GROUP_MARGIN_TOP = 12
        WINDOW_MIN_WIDTH = 800
        WINDOW_MIN_HEIGHT = 600
        DEFAULT_WIDTH = 1000
        DEFAULT_HEIGHT = 700


# Convenience function for widget-level styling
def style_for_platform(macos_style: str = "", windows_style: str = "", default_style: str = "") -> str:
    """
    Return platform-specific style string.
    
    Args:
        macos_style: Style to apply on macOS
        windows_style: Style to apply on Windows  
        default_style: Style to apply on other platforms (or if platform style not provided)
    
    Returns:
        The appropriate style string for the current platform
    
    Example:
        button.setStyleSheet(style_for_platform(
            macos_style="background: #007AFF; border-radius: 8px;",
            windows_style="background: #0078d4; border-radius: 4px;",
        ))
    """
    if is_macos() and macos_style:
        return macos_style
    elif is_windows() and windows_style:
        return windows_style
    else:
        return default_style or macos_style or windows_style
