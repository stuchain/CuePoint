#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for PreflightDialog."""

import pytest
from PySide6.QtWidgets import QPushButton

from cuepoint.models.preflight import PreflightIssue, PreflightResult
from cuepoint.ui.dialogs.preflight_dialog import PreflightDialog


@pytest.fixture
def dialog_with_errors(qapp):
    """Create a PreflightDialog instance with errors."""
    preflight = PreflightResult(
        errors=[PreflightIssue(code="P001", message="XML file not found.")],
        warnings=[
            PreflightIssue(code="P020", message="Output folder will be created.")
        ],
    )
    return PreflightDialog(preflight=preflight)


@pytest.fixture
def dialog_without_errors(qapp):
    """Create a PreflightDialog instance without errors."""
    preflight = PreflightResult(
        errors=[],
        warnings=[PreflightIssue(code="P004", message="XML file is large.")],
    )
    return PreflightDialog(preflight=preflight)


def _find_button(dialog: PreflightDialog, text: str) -> QPushButton:
    for button in dialog.findChildren(QPushButton):
        if button.text() == text:
            return button
    raise AssertionError(f"Button not found: {text}")


def test_dialog_title(dialog_with_errors):
    """Dialog should have the correct title."""
    assert dialog_with_errors.windowTitle() == "Preflight Checks"


def test_dialog_disables_proceed_when_errors(dialog_with_errors):
    """Proceed button should be disabled when errors exist."""
    proceed = _find_button(dialog_with_errors, "Proceed Anyway")
    assert proceed.isEnabled() is False


def test_dialog_allows_proceed_when_no_errors(dialog_without_errors):
    """Proceed button should be enabled when only warnings exist."""
    proceed = _find_button(dialog_without_errors, "Proceed Anyway")
    assert proceed.isEnabled() is True
