"""UI tests for onboarding dialog (Step 9.4)."""

from __future__ import annotations

import pytest
from PySide6.QtCore import Qt

from cuepoint.ui.dialogs.onboarding_dialog import OnboardingDialog


@pytest.mark.ui
def test_onboarding_dialog_navigates(qtbot):
    dialog = OnboardingDialog()
    qtbot.addWidget(dialog)
    dialog.show()

    # Starts on first screen
    assert dialog.screens.count() == 4
    assert dialog._current_screen == 0
    assert dialog.back_button.isVisible() is False

    # Navigate forward to last screen
    qtbot.mouseClick(dialog.next_button, Qt.LeftButton)
    qtbot.mouseClick(dialog.next_button, Qt.LeftButton)
    qtbot.mouseClick(dialog.next_button, Qt.LeftButton)

    assert dialog._current_screen == 3
    assert "Get Started" in dialog.next_button.text()

    # Back should be visible on last screen
    assert dialog.back_button.isVisible() is True


@pytest.mark.ui
def test_onboarding_dialog_dont_show_again_checkbox(qtbot):
    dialog = OnboardingDialog()
    qtbot.addWidget(dialog)
    dialog.show()

    assert dialog.dont_show_again_checked() is False
    qtbot.mouseClick(dialog.dont_show_checkbox, Qt.LeftButton)
    assert dialog.dont_show_again_checked() is True

