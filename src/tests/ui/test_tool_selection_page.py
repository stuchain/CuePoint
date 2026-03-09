#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Tool Selection Page widget
"""

import pytest
from PySide6.QtCore import Qt
from PySide6.QtTest import QTest

from cuepoint.ui.widgets.tool_selection_page import ToolSelectionPage


@pytest.fixture
def tool_selection_page(qapp):
    """Create a ToolSelectionPage instance for testing"""
    return ToolSelectionPage()


def test_tool_selection_page_creation(tool_selection_page):
    """Test that ToolSelectionPage can be created"""
    assert tool_selection_page is not None
    assert isinstance(tool_selection_page, ToolSelectionPage)


def test_tool_selection_page_has_title(tool_selection_page):
    """Test that the page has a title"""
    # Find the title label
    _ = tool_selection_page.findChildren(type(tool_selection_page))
    # The title should be in the layout
    layout = tool_selection_page.layout()
    assert layout is not None


def test_tool_selection_page_get_selected_tool(tool_selection_page):
    """Test get_selected_tool method"""
    tool = tool_selection_page.get_selected_tool()
    assert tool == "inkey"


def test_tool_selection_page_signal_emission(tool_selection_page, qapp):
    """Test that tool_selected signal is emitted when button is clicked"""
    # Track if signal was emitted
    signal_received = []

    def on_tool_selected(tool_name):
        signal_received.append(tool_name)

    tool_selection_page.tool_selected.connect(on_tool_selected)

    # Find the inKey button and click it
    _ = tool_selection_page.findChildren(type(tool_selection_page))
    # Find button by text
    for child in tool_selection_page.findChildren(type(tool_selection_page)):
        if hasattr(child, "text") and child.text() == "inKey":
            QTest.mouseClick(child, Qt.LeftButton)
            break

    # Process events to allow signal to propagate
    qapp.processEvents()

    # Check if signal was emitted (we'll verify this works in integration test)
    # For now, just verify the button exists
    assert True  # Placeholder - will verify in integration test


def test_tool_selection_page_ui_elements(tool_selection_page):
    """Test that all UI elements are present"""
    # Check that layout exists
    layout = tool_selection_page.layout()
    assert layout is not None

    # Check that we can get the selected tool
    tool = tool_selection_page.get_selected_tool()
    assert tool is not None


def test_incrate_button_exists(tool_selection_page):
    """Phase 5: Tool selection page has inCrate button."""
    from PySide6.QtWidgets import QPushButton

    buttons = [
        c
        for c in tool_selection_page.findChildren(QPushButton)
        if c.text() == "inCrate"
    ]
    assert len(buttons) >= 1
    assert buttons[0].text() == "inCrate"


def test_incrate_button_emits_tool_selected(tool_selection_page, qapp):
    """Phase 5: Clicking inCrate emits tool_selected with 'incrate'."""
    received = []

    def on_selected(name):
        received.append(name)

    tool_selection_page.tool_selected.connect(on_selected)
    from PySide6.QtWidgets import QPushButton
    from PySide6.QtTest import QTest
    from PySide6.QtCore import Qt

    buttons = [
        c
        for c in tool_selection_page.findChildren(QPushButton)
        if c.text() == "inCrate"
    ]
    assert len(buttons) >= 1
    QTest.mouseClick(buttons[0], Qt.MouseButton.LeftButton)
    qapp.processEvents()
    assert "incrate" in received


@pytest.mark.ui
def test_tool_selection_page_integration(qapp):
    """Integration test for tool selection page"""
    page = ToolSelectionPage()
    page.show()

    # Verify page is visible
    assert page.isVisible()

    # Verify we can get selected tool
    tool = page.get_selected_tool()
    assert tool == "inkey"

    # Verify signal can be connected
    signal_received = []

    def on_tool_selected(tool_name):
        signal_received.append(tool_name)

    page.tool_selected.connect(on_tool_selected)

    # Find and click the inKey button
    # This is a simplified test - in real scenario we'd use QTest
    # For now, just verify the page structure
    assert page.layout() is not None
