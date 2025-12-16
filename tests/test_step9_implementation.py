#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Tests for Step 9 Implementation

Tests all Step 9 components to ensure they work correctly.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from PySide6.QtWidgets import QApplication, QWidget

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))


class TestThemeTokens:
    """Test theme tokens system (Step 9.1)."""

    def test_color_tokens_creation(self):
        """Test ColorTokens creation for different platforms."""
        from cuepoint.ui.widgets.theme_tokens import ColorTokens

        # Test macOS
        macos_colors = ColorTokens.for_platform("darwin")
        assert macos_colors.primary == "#007AFF"
        assert macos_colors.background == "#1e1e1e"
        assert macos_colors.text_primary == "#ffffff"

        # Test Windows
        windows_colors = ColorTokens.for_platform("win32")
        assert windows_colors.primary == "#0078d4"
        assert windows_colors.background == "#1e1e1e"

    def test_spacing_tokens_creation(self):
        """Test SpacingTokens creation."""
        from cuepoint.ui.widgets.theme_tokens import SpacingTokens

        spacing = SpacingTokens.for_platform("win32")
        assert spacing.xs == 4
        assert spacing.sm == 6
        assert spacing.md == 8
        assert spacing.button_padding_x == 16

    def test_typography_tokens_creation(self):
        """Test TypographyTokens creation."""
        from cuepoint.ui.widgets.theme_tokens import TypographyTokens

        typography = TypographyTokens.for_platform("win32")
        assert typography.font_size_base == 12
        assert typography.font_weight_normal == 400
        assert typography.line_height_normal == 1.5

    def test_radius_tokens_creation(self):
        """Test RadiusTokens creation."""
        from cuepoint.ui.widgets.theme_tokens import RadiusTokens

        radius = RadiusTokens.for_platform("win32")
        assert radius.radius_sm == 2
        assert radius.button_radius == 4
        assert radius.input_radius == 4

    def test_size_tokens_creation(self):
        """Test SizeTokens creation."""
        from cuepoint.ui.widgets.theme_tokens import SizeTokens

        size = SizeTokens.for_platform("win32")
        assert size.button_height == 32
        assert size.input_height == 30
        assert size.min_touch_target == 28


class TestThemeManager:
    """Test theme manager (Step 9.1)."""

    def test_theme_manager_singleton(self):
        """Test ThemeManager is a singleton."""
        from cuepoint.ui.widgets.theme import get_theme

        theme1 = get_theme()
        theme2 = get_theme()
        assert theme1 is theme2

    def test_theme_manager_properties(self):
        """Test ThemeManager provides all token types."""
        from cuepoint.ui.widgets.theme import get_theme

        theme = get_theme()
        assert theme.colors is not None
        assert theme.spacing is not None
        assert theme.typography is not None
        assert theme.radius is not None
        assert theme.size is not None

    def test_theme_manager_platform_detection(self):
        """Test ThemeManager detects platform correctly."""
        from cuepoint.ui.widgets.theme import get_theme

        theme = get_theme()
        platform = theme.get_platform()
        assert platform in ["darwin", "win32", "linux"]


class TestFocusManager:
    """Test focus manager (Step 9.2)."""

    @pytest.fixture
    def app(self):
        """Create QApplication for testing."""
        if not QApplication.instance():
            return QApplication(sys.argv)
        return QApplication.instance()

    def test_focus_manager_creation(self, app):
        """Test FocusManager can be created."""
        from cuepoint.ui.widgets.focus_manager import FocusManager

        parent = QWidget()
        focus_manager = FocusManager(parent)
        assert focus_manager is not None
        assert focus_manager.parent == parent

    def test_tab_order_setup(self, app):
        """Test tab order can be set."""
        from cuepoint.ui.widgets.focus_manager import FocusManager

        parent = QWidget()
        focus_manager = FocusManager(parent)

        widget1 = QWidget(parent)
        widget2 = QWidget(parent)
        widget3 = QWidget(parent)

        focus_manager.set_tab_order([widget1, widget2, widget3])
        assert len(focus_manager.tab_order) == 3

    def test_get_next_focusable(self, app):
        """Test getting next focusable widget."""
        from cuepoint.ui.widgets.focus_manager import FocusManager

        parent = QWidget()
        focus_manager = FocusManager(parent)

        widget1 = QWidget(parent)
        widget2 = QWidget(parent)
        widget3 = QWidget(parent)

        focus_manager.set_tab_order([widget1, widget2, widget3])

        next_widget = focus_manager.get_next_focusable(widget1)
        assert next_widget == widget2

        next_widget = focus_manager.get_next_focusable(widget2)
        assert next_widget == widget3

        next_widget = focus_manager.get_next_focusable(widget3)
        assert next_widget is None


class TestAccessibilityHelpers:
    """Test accessibility helpers (Step 9.2)."""

    @pytest.fixture
    def app(self):
        """Create QApplication for testing."""
        if not QApplication.instance():
            return QApplication(sys.argv)
        return QApplication.instance()

    def test_set_accessible_name(self, app):
        """Test setting accessible name."""
        from cuepoint.ui.widgets.accessibility import AccessibilityHelper

        widget = QWidget()
        AccessibilityHelper.set_accessible_name(widget, "Test Widget")
        assert widget.accessibleName() == "Test Widget"

    def test_set_accessible_description(self, app):
        """Test setting accessible description."""
        from cuepoint.ui.widgets.accessibility import AccessibilityHelper

        widget = QWidget()
        AccessibilityHelper.set_accessible_description(widget, "Test description")
        assert widget.accessibleDescription() == "Test description"


class TestAccessibilityUtils:
    """Test accessibility utilities (Step 9.2)."""

    def test_hex_to_rgb(self):
        """Test hex to RGB conversion."""
        from cuepoint.utils.accessibility import hex_to_rgb

        rgb = hex_to_rgb("#FF0000")
        assert rgb == (255, 0, 0)

        rgb = hex_to_rgb("#00FF00")
        assert rgb == (0, 255, 0)

        rgb = hex_to_rgb("#0000FF")
        assert rgb == (0, 0, 255)

    def test_get_luminance(self):
        """Test luminance calculation."""
        from cuepoint.utils.accessibility import get_luminance

        # White should have high luminance
        white_lum = get_luminance(255, 255, 255)
        assert white_lum > 0.9

        # Black should have low luminance
        black_lum = get_luminance(0, 0, 0)
        assert black_lum < 0.1

    def test_get_contrast_ratio(self):
        """Test contrast ratio calculation."""
        from cuepoint.utils.accessibility import get_contrast_ratio

        # White on black should have high contrast
        ratio = get_contrast_ratio("#FFFFFF", "#000000")
        assert ratio > 20.0

        # Black on white should have high contrast
        ratio = get_contrast_ratio("#000000", "#FFFFFF")
        assert ratio > 20.0

        # Same color should have 1:1 contrast
        ratio = get_contrast_ratio("#FF0000", "#FF0000")
        assert ratio == 1.0

    def test_check_contrast(self):
        """Test contrast checking."""
        from cuepoint.utils.accessibility import check_contrast

        # White on black should pass AA
        meets, ratio = check_contrast("#FFFFFF", "#000000", "AA", "normal")
        assert meets is True
        assert ratio > 20.0

        # Similar colors should fail
        meets, ratio = check_contrast("#CCCCCC", "#DDDDDD", "AA", "normal")
        assert meets is False


class TestSupportBundle:
    """Test support bundle generation (Step 9.5)."""

    def test_support_bundle_generator_options(self):
        """Test support bundle generator with options."""
        from pathlib import Path
        from tempfile import TemporaryDirectory

        from cuepoint.utils.support_bundle import SupportBundleGenerator

        with TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir)
            bundle_path = SupportBundleGenerator.generate_bundle(
                output_path, include_logs=True, include_config=True, sanitize=True
            )

            assert bundle_path.exists()
            assert bundle_path.suffix == ".zip"
            assert "cuepoint-support" in bundle_path.name

    def test_support_bundle_sanitization(self):
        """Test support bundle sanitization."""
        from cuepoint.utils.support_bundle import SupportBundleGenerator

        # Test config sanitization
        config = {"api_key": "secret123", "normal_key": "value"}
        sanitized = SupportBundleGenerator._sanitize_config(config)
        assert sanitized["api_key"] == "[REDACTED]"
        assert sanitized["normal_key"] == "value"


class TestChangelogViewer:
    """Test changelog viewer (Step 9.6)."""

    @pytest.fixture
    def app(self):
        """Create QApplication for testing."""
        if not QApplication.instance():
            return QApplication(sys.argv)
        return QApplication.instance()

    def test_changelog_viewer_creation(self, app):
        """Test ChangelogViewer can be created."""
        from cuepoint.ui.widgets.changelog_viewer import ChangelogViewer

        viewer = ChangelogViewer()
        assert viewer is not None
        assert len(viewer.changelog_data) > 0  # Should have at least default

    def test_changelog_parsing(self, app):
        """Test changelog parsing."""
        from cuepoint.ui.widgets.changelog_viewer import ChangelogViewer

        viewer = ChangelogViewer()
        test_content = """## [1.0.0] - 2024-12-14

### Added
- Feature 1
- Feature 2

## [0.9.0] - 2024-11-01

### Fixed
- Bug fix
"""

        entries = viewer._parse_changelog(test_content)
        assert len(entries) == 2
        assert entries[0]["version"] == "1.0.0"
        assert entries[1]["version"] == "0.9.0"


class TestIconManager:
    """Test icon manager (Step 9.6)."""

    def test_icon_manager_singleton(self):
        """Test IconManager is a singleton."""
        from cuepoint.ui.widgets.icon_manager import get_icon_manager

        manager1 = get_icon_manager()
        manager2 = get_icon_manager()
        assert manager1 is manager2

    def test_icon_manager_list_icons(self):
        """Test listing available icons."""
        from cuepoint.ui.widgets.icon_manager import get_icon_manager

        manager = get_icon_manager()
        icons = manager.list_icons()
        # Should return a list (may be empty if no icons found)
        assert isinstance(icons, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
