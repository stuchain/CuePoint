#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Onboarding Dialog (Step 9.4)

Multi-screen first-run onboarding that explains:
- What a Collection XML is
- How to pick a mode (Single vs Batch)
- Where results and exports live

This dialog is designed to be lightweight and safe to show on startup.
"""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.dialogs.rekordbox_instructions_dialog import RekordboxInstructionsDialog
from cuepoint.utils.i18n import tr


class _OnboardingScreen(QWidget):
    """Base class for onboarding screens."""

    def __init__(self, title: str, body: str, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        title_label = QLabel(title)
        title_label.setWordWrap(True)
        title_label.setStyleSheet("font-size: 20px; font-weight: bold;")
        title_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(title_label)

        body_label = QLabel(body)
        body_label.setWordWrap(True)
        body_label.setStyleSheet("font-size: 12px; color: #ccc;")
        body_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(body_label)

        layout.addStretch(1)


class WelcomeScreen(_OnboardingScreen):
    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(
            title=tr("onboarding.welcome.title", "Welcome to CuePoint"),
            body=tr(
                "onboarding.welcome.body",
                "CuePoint helps enrich your Rekordbox collection with Beatport metadata.\n\n"
                "This quick walkthrough will show you what you need to get started.",
            ),
            parent=parent,
        )


class CollectionXmlScreen(QWidget):
    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        title_label = QLabel(tr("onboarding.xml.title", "Select your Collection XML"))
        title_label.setWordWrap(True)
        title_label.setStyleSheet("font-size: 20px; font-weight: bold;")
        title_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(title_label)

        body_label = QLabel(
            tr(
                "onboarding.xml.body",
                "CuePoint reads a Rekordbox Collection XML export to find your playlists and tracks.\n\n"
                "In Rekordbox: File → Export Collection (XML), then select that file in CuePoint.",
            )
        )
        body_label.setWordWrap(True)
        body_label.setStyleSheet("font-size: 12px; color: #ccc;")
        body_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(body_label)

        button_row = QHBoxLayout()
        button_row.addStretch(1)

        self.instructions_button = QPushButton(
            tr("onboarding.xml.instructions", "View export instructions")
        )
        self.instructions_button.setObjectName("secondaryActionButton")
        self.instructions_button.clicked.connect(self._show_instructions)
        button_row.addWidget(self.instructions_button)

        button_row.addStretch(1)
        layout.addLayout(button_row)

        layout.addStretch(1)

    def _show_instructions(self) -> None:
        dialog = RekordboxInstructionsDialog(self)
        dialog.exec()


class ModeScreen(_OnboardingScreen):
    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(
            title=tr("onboarding.mode.title", "Choose a processing mode"),
            body=tr(
                "onboarding.mode.body",
                "Single mode: process one playlist at a time.\n"
                "Batch mode: process multiple playlists automatically.\n\n"
                "You can switch modes after selecting your XML file.",
            ),
            parent=parent,
        )


class ResultsScreen(_OnboardingScreen):
    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(
            title=tr("onboarding.results.title", "Review results and export"),
            body=tr(
                "onboarding.results.body",
                "After processing, you can search and filter results, review candidates, "
                "and export to CSV/JSON/Excel.\n\n"
                "Tip: Use Help → Keyboard Shortcuts to discover power-user shortcuts.",
            ),
            parent=parent,
        )


class OnboardingDialog(QDialog):
    """Multi-screen onboarding dialog."""

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._current_screen = 0
        self._setup_ui()

    def _setup_ui(self) -> None:
        self.setWindowTitle(tr("onboarding.window_title", "Welcome to CuePoint"))
        self.setModal(True)
        self.resize(640, 520)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Screens
        self.screens = QStackedWidget(self)
        self.screens.addWidget(WelcomeScreen())
        self.screens.addWidget(CollectionXmlScreen())
        self.screens.addWidget(ModeScreen())
        self.screens.addWidget(ResultsScreen())
        layout.addWidget(self.screens, 1)

        # Footer
        footer = QWidget(self)
        footer_layout = QVBoxLayout(footer)
        footer_layout.setContentsMargins(18, 12, 18, 16)
        footer_layout.setSpacing(10)

        nav = QHBoxLayout()

        self.back_button = QPushButton(tr("onboarding.back", "Back"))
        self.back_button.setObjectName("secondaryActionButton")
        self.back_button.clicked.connect(self.previous_screen)
        self.back_button.setVisible(False)
        nav.addWidget(self.back_button)

        nav.addStretch(1)

        self.skip_button = QPushButton(tr("onboarding.skip", "Skip"))
        self.skip_button.setObjectName("secondaryActionButton")
        self.skip_button.clicked.connect(self.skip_onboarding)
        nav.addWidget(self.skip_button)

        self.next_button = QPushButton(tr("onboarding.next", "Next"))
        self.next_button.setObjectName("primaryActionButton")
        self.next_button.setDefault(True)
        self.next_button.clicked.connect(self.next_screen)
        nav.addWidget(self.next_button)

        footer_layout.addLayout(nav)

        self.dont_show_checkbox = QCheckBox(tr("onboarding.dont_show", "Don't show this again"))
        self.dont_show_checkbox.setChecked(False)
        footer_layout.addWidget(self.dont_show_checkbox)

        layout.addWidget(footer, 0)

        self._update_buttons()

    def next_screen(self) -> None:
        if self._current_screen < self.screens.count() - 1:
            self._current_screen += 1
            self.screens.setCurrentIndex(self._current_screen)
            self._update_buttons()
        else:
            self.accept()

    def previous_screen(self) -> None:
        if self._current_screen > 0:
            self._current_screen -= 1
            self.screens.setCurrentIndex(self._current_screen)
            self._update_buttons()

    def skip_onboarding(self) -> None:
        self.reject()

    def _update_buttons(self) -> None:
        is_first = self._current_screen == 0
        is_last = self._current_screen == self.screens.count() - 1

        self.back_button.setVisible(not is_first)
        self.skip_button.setVisible(not is_last)

        if is_last:
            self.next_button.setText(tr("onboarding.get_started", "Get Started"))
        else:
            self.next_button.setText(tr("onboarding.next", "Next"))

    def dont_show_again_checked(self) -> bool:
        return self.dont_show_checkbox.isChecked()

