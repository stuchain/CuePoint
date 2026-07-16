#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
First-run error reporting prompt.

Shown once when the user runs the app for the first time (or after a fresh
install). Asks whether to allow sending error reports to help fix bugs.
"""

from typing import Optional

from PySide6.QtCore import QSettings, QTimer
from PySide6.QtWidgets import QApplication, QMessageBox, QWidget


_FIRST_RUN_PROMPT_SHOWN_KEY = "error_reporting/first_run_prompt_shown"


def show_if_first_run(parent: Optional[QWidget] = None) -> None:
    """Show the error-reporting consent prompt only on first run.

    If the user has never been asked, shows a dialog. Saves their choice
    and sets a flag so we do not ask again.

    Args:
        parent: Optional parent widget for the dialog.
    """
    settings = QSettings()
    if settings.value(_FIRST_RUN_PROMPT_SHOWN_KEY, False, type=bool):
        return

    msg = QMessageBox(parent)
    msg.setWindowTitle("Help improve CuePoint")
    msg.setIcon(QMessageBox.Question)
    msg.setText("Send error reports to help fix bugs?")
    msg.setInformativeText(
        "When crashes or errors happen, we can send a report to the developers. "
        "No personal data or file contents are included. "
        "You can change this later in Settings → Privacy."
    )
    msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
    msg.setDefaultButton(QMessageBox.Yes)

    def center_on_screen() -> None:
        screen = QApplication.primaryScreen().availableGeometry()
        geom = msg.frameGeometry()
        geom.moveCenter(screen.center())
        msg.move(geom.topLeft())

    QTimer.singleShot(0, center_on_screen)
    choice = msg.exec()

    try:
        from cuepoint.utils.error_reporting_prefs import ErrorReportingPrefs

        prefs = ErrorReportingPrefs()
        allowed = choice == QMessageBox.Yes
        prefs.set_enabled(allowed)
        prefs.set_consented(allowed)
    except Exception:
        pass

    settings.setValue(_FIRST_RUN_PROMPT_SHOWN_KEY, True)
