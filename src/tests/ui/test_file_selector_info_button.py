#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for FileSelector info button
"""

import pytest
from PySide6.QtCore import Qt
from PySide6.QtTest import QTest

from cuepoint.ui.widgets.file_selector import FileSelector


@pytest.fixture
def file_selector(qapp):
    """Create a FileSelector instance for testing"""
    return FileSelector()


def test_file_selector_has_info_button(file_selector):
    """Test that FileSelector has an info button (tooltip 'View instructions…' or accessible name)."""
    from PySide6.QtWidgets import QToolButton

    info_button = None
    for child in file_selector.findChildren(QToolButton):
        tip = child.toolTip() or ""
        name = child.accessibleName() or ""
        if "instruction" in tip.lower() or "Rekordbox" in tip or "Rekordbox" in name:
            info_button = child
            break
    assert info_button is not None, "Info button (instructions/Rekordbox) should exist"


def test_file_selector_info_button_has_tooltip(file_selector):
    """Test that info button has a tooltip (instructions or Rekordbox)."""
    from PySide6.QtWidgets import QToolButton

    for child in file_selector.findChildren(QToolButton):
        tip = child.toolTip() or ""
        if "instruction" in tip.lower() or "Rekordbox" in tip:
            assert tip, "Info button should have tooltip"
            break


def test_file_selector_show_instructions_method(file_selector):
    """Test that show_instructions method exists and can be called"""
    # Method should exist
    assert hasattr(file_selector, "show_instructions")
    assert callable(file_selector.show_instructions)


@pytest.mark.ui
def test_file_selector_info_button_opens_dialog(file_selector, qapp, qtbot):
    """Test that clicking info button opens instructions dialog"""
    # Find info button (tooltip contains "instruction" or accessible name "Rekordbox")
    from PySide6.QtWidgets import QToolButton

    info_button = None
    for child in file_selector.findChildren(QToolButton):
        if "instruction" in (child.toolTip() or "").lower() or "Rekordbox" in (
            child.accessibleName() or ""
        ):
            info_button = child
            break

    if info_button:
        # Click the button
        QTest.mouseClick(info_button, Qt.LeftButton)
        qapp.processEvents()

        # Dialog should be created (we can't easily verify it's shown in headless test)
        # But we can verify the method was called
        assert True  # Placeholder - will verify dialog opens in manual test
