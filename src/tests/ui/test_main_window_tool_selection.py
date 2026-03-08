#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for MainWindow tool selection integration
"""

import pytest

from cuepoint.ui.main_window import MainWindow


@pytest.fixture
def main_window(qapp):
    """Create a MainWindow instance for testing"""
    window = MainWindow()
    return window


def test_main_window_has_tool_selection_page(main_window):
    """Test that MainWindow has tool selection page"""
    assert hasattr(main_window, "tool_selection_page")
    assert main_window.tool_selection_page is not None


def test_main_window_shows_tool_selection_initially(main_window):
    """Test that MainWindow shows tool selection page initially"""
    assert main_window.current_page == "tool_selection"
    # Central widget is the stack; current page is tool selection
    assert main_window.centralWidget() == main_window._stack
    assert main_window._stack.currentWidget() == main_window.tool_selection_page


def test_main_window_show_tool_selection_page(main_window):
    """Test show_tool_selection_page method"""
    main_window.show_tool_selection_page()
    assert main_window.current_page == "tool_selection"
    assert main_window._stack.currentWidget() == main_window.tool_selection_page


def test_main_window_show_main_interface(main_window):
    """Test show_main_interface method (inKey: back button + tabs wrapper)."""
    main_window.show_main_interface()
    assert main_window.current_page == "main"
    assert main_window._stack.currentWidget() == main_window._inkey_wrapper
    assert main_window.tabs is not None


def test_main_window_on_tool_selected_inkey(main_window):
    """Test on_tool_selected method with inkey tool"""
    # Initially should be on tool selection page
    assert main_window.current_page == "tool_selection"

    # Select inkey tool
    main_window.on_tool_selected("inkey")

    # Should now be on main interface (inKey wrapper with back button + tabs)
    assert main_window.current_page == "main"
    assert main_window._stack.currentWidget() == main_window._inkey_wrapper
    assert main_window.tabs is not None

    # Should be on Main tab
    assert main_window.tabs.currentIndex() == 0


@pytest.mark.ui
def test_main_window_tool_selection_workflow(main_window, qapp):
    """Integration test for tool selection workflow"""
    # Start on tool selection page
    assert main_window.current_page == "tool_selection"

    # Simulate clicking inKey button by calling on_tool_selected
    main_window.on_tool_selected("inkey")

    # Should now be on main interface
    assert main_window.current_page == "main"

    # Verify inKey wrapper is the current stack page
    assert main_window.tabs is not None
    assert main_window._stack.currentWidget() == main_window._inkey_wrapper

    # Verify we can switch back (for testing)
    main_window.show_tool_selection_page()
    assert main_window.current_page == "tool_selection"
    assert main_window._stack.currentWidget() == main_window.tool_selection_page
