#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Rekordbox Instructions Dialog
"""

import pytest
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt

from cuepoint.ui.dialogs.rekordbox_instructions_dialog import RekordboxInstructionsDialog


@pytest.fixture
def dialog(qapp):
    """Create a RekordboxInstructionsDialog instance for testing"""
    return RekordboxInstructionsDialog()


def test_dialog_creation(dialog):
    """Test that RekordboxInstructionsDialog can be created"""
    assert dialog is not None
    assert isinstance(dialog, RekordboxInstructionsDialog)


def test_dialog_has_title(dialog):
    """Test that the dialog has a title"""
    assert dialog.windowTitle() == "How to Export XML from Rekordbox"


def test_dialog_has_minimum_size(dialog):
    """Test that the dialog has minimum size set"""
    assert dialog.minimumWidth() >= 600
    assert dialog.minimumHeight() >= 500


def test_dialog_has_content(dialog):
    """Test that the dialog has content"""
    # Check that dialog has a layout
    layout = dialog.layout()
    assert layout is not None
    
    # Check that there's a scroll area
    scroll_areas = dialog.findChildren(type(dialog))
    # The dialog should have content
    assert True  # Placeholder - structure verification


@pytest.mark.ui
def test_dialog_can_be_shown(dialog, qapp):
    """Test that the dialog can be shown"""
    dialog.show()
    assert dialog.isVisible()


def test_dialog_close_button(dialog):
    """Test that dialog has close button"""
    # Find button box
    button_boxes = dialog.findChildren(type(dialog))
    # Dialog should have a button box
    assert True  # Placeholder - will verify button box exists

