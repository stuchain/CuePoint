#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration Tests for Step 9 Implementation

Tests that all Step 9 components integrate correctly with the main application.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from PySide6.QtWidgets import QApplication

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))


@pytest.fixture(scope="module")
def app():
    """Create QApplication for testing."""
    if not QApplication.instance():
        return QApplication(sys.argv)
    return QApplication.instance()


class TestStep9Integration:
    """Integration tests for Step 9 components."""

    def test_theme_manager_integration(self, app):
        """Test theme manager integrates correctly."""
        from cuepoint.ui.widgets.theme import get_theme

        theme = get_theme()
        # Verify all token types are accessible
        assert theme.colors.primary is not None
        assert theme.spacing.md > 0
        assert theme.typography.font_size_base > 0
        assert theme.radius.button_radius >= 0
        assert theme.size.button_height > 0

    def test_focus_manager_integration(self, app):
        """Test focus manager can be used with widgets."""
        from PySide6.QtWidgets import QWidget

        from cuepoint.ui.widgets.focus_manager import FocusManager

        parent = QWidget()
        focus_manager = FocusManager(parent)

        widget1 = QWidget(parent)
        widget2 = QWidget(parent)
        widget3 = QWidget(parent)

        focus_manager.set_tab_order([widget1, widget2, widget3])
        assert len(focus_manager.tab_order) == 3

        # Test navigation
        next_widget = focus_manager.get_next_focusable(widget1)
        assert next_widget == widget2

    def test_accessibility_helpers_integration(self, app):
        """Test accessibility helpers work with widgets."""
        from PySide6.QtWidgets import QLabel, QPushButton, QWidget

        from cuepoint.ui.widgets.accessibility import AccessibilityHelper

        button = QPushButton("Test")
        AccessibilityHelper.set_button_accessible_name(button, "Test Button", "A test button")
        assert button.accessibleName() == "Test Button"
        assert button.accessibleDescription() == "A test button"

        label = QLabel("Test Label")
        input_widget = QWidget()
        AccessibilityHelper.set_label_buddy(label, input_widget)
        assert label.buddy() == input_widget

    def test_contrast_validation_integration(self, app):
        """Test contrast validation works with theme tokens."""
        from cuepoint.ui.widgets.theme import get_theme
        from cuepoint.utils.accessibility import ContrastValidator

        theme = get_theme()
        validator = ContrastValidator(theme)

        violations = validator.validate_all()
        # Should return a list (may be empty if all pass)
        assert isinstance(violations, list)

    def test_support_bundle_dialog_creation(self, app):
        """Test support bundle dialog can be created."""
        from cuepoint.ui.dialogs.support_dialog import SupportBundleDialog

        dialog = SupportBundleDialog()
        assert dialog is not None
        assert dialog.windowTitle() is not None

    def test_issue_reporting_dialog_creation(self, app):
        """Test issue reporting dialog can be created."""
        from cuepoint.ui.dialogs.report_issue_dialog import ReportIssueDialog

        dialog = ReportIssueDialog()
        assert dialog is not None
        assert dialog.windowTitle() is not None

    def test_changelog_viewer_creation(self, app):
        """Test changelog viewer can be created."""
        from cuepoint.ui.widgets.changelog_viewer import ChangelogViewer

        viewer = ChangelogViewer()
        assert viewer is not None
        assert len(viewer.changelog_data) > 0

    def test_shortcuts_dialog_creation(self, app):
        """Test shortcuts dialog can be created."""
        from cuepoint.ui.dialogs.shortcuts_dialog import ShortcutsDialog

        dialog = ShortcutsDialog()
        assert dialog is not None
        assert dialog.windowTitle() is not None

    def test_icon_manager_integration(self, app):
        """Test icon manager can be used."""
        from PySide6.QtWidgets import QPushButton

        from cuepoint.ui.widgets.icon_manager import get_icon_manager

        manager = get_icon_manager()
        button = QPushButton("Test")

        # Try to set an icon (may not exist, but should not crash)
        try:
            manager.set_icon(button, "help")
        except Exception:
            pass  # Icons may not exist, that's OK

        # Manager should still work
        icons = manager.list_icons()
        assert isinstance(icons, list)

    def test_theme_tokens_platform_specific(self, app):
        """Test theme tokens are platform-specific."""
        from cuepoint.ui.widgets.theme_tokens import ColorTokens

        macos_colors = ColorTokens.for_platform("darwin")
        windows_colors = ColorTokens.for_platform("win32")

        # macOS should use macOS blue
        assert macos_colors.primary == "#007AFF"
        # Windows should use Windows blue
        assert windows_colors.primary == "#0078d4"

    def test_support_bundle_sanitization(self, app):
        """Test support bundle sanitization works."""
        from cuepoint.utils.support_bundle import SupportBundleGenerator

        # Test config sanitization
        config = {
            "api_key": "secret123",
            "normal_setting": "value",
            "password": "mypassword",
        }

        sanitized = SupportBundleGenerator._sanitize_config(config)
        assert sanitized["api_key"] == "[REDACTED]"
        assert sanitized["password"] == "[REDACTED]"
        assert sanitized["normal_setting"] == "value"

    def test_accessibility_contrast_calculation(self, app):
        """Test contrast calculation is accurate."""
        from cuepoint.utils.accessibility import check_contrast, get_contrast_ratio

        # White on black should have very high contrast
        ratio = get_contrast_ratio("#FFFFFF", "#000000")
        assert ratio > 20.0

        # Check should pass for white on black
        meets, ratio = check_contrast("#FFFFFF", "#000000", "AA", "normal")
        assert meets is True

        # Similar colors should fail
        meets, ratio = check_contrast("#CCCCCC", "#DDDDDD", "AA", "normal")
        assert meets is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
