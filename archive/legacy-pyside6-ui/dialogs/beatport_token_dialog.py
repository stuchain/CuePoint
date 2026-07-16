#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Beatport token dialog – guide user to get an access token from their browser.

Matches the flow in docs/feature/get-token.js: open Beatport, log in,
find a request to api.beatport.com, copy the Bearer token, paste here.
"""

from __future__ import annotations

import webbrowser
from typing import Optional

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QLineEdit,
    QPushButton,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)


BEATPORT_URL = "https://beatport.com"

INSTRUCTIONS_HTML = """
<p><b>Get a Beatport API token from your browser</b></p>
<ol>
<li>Open Beatport in your browser (use the button below) and <b>log in</b>.</li>
<li>Open <b>Developer Tools</b> (F12 or Cmd+Option+I).</li>
<li>Go to the <b>Network</b> tab.</li>
<li>Navigate on Beatport (e.g. browse tracks).</li>
<li>Find a request to <b>api.beatport.com</b> and click it.</li>
<li>In <b>Headers</b>, find <code>Authorization: Bearer ...</code></li>
<li>Copy the token (the part after <code>Bearer </code>) and paste it below.</li>
</ol>
<p><i>This token will expire after a few hours or days; repeat when needed.</i></p>
"""


class BeatportTokenDialog(QDialog):
    """Dialog to guide the user through getting a Beatport API token and paste it."""

    def __init__(
        self,
        parent: Optional[QWidget] = None,
        initial_token: str = "",
    ) -> None:
        super().__init__(parent)
        self.setWindowTitle("Beatport API token")
        self.setMinimumWidth(480)
        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        instructions = QTextBrowser()
        instructions.setOpenExternalLinks(True)
        instructions.setHtml(INSTRUCTIONS_HTML)
        instructions.setMaximumHeight(220)
        instructions.setStyleSheet("font-size: 12px;")
        layout.addWidget(instructions)

        open_btn = QPushButton("Open Beatport in browser")
        open_btn.setToolTip(f"Opens {BEATPORT_URL} in your default browser")
        open_btn.clicked.connect(self._open_beatport)
        layout.addWidget(open_btn)

        layout.addWidget(QLabel("Paste token (the part after 'Bearer '):"))
        self.token_edit = QLineEdit()
        self.token_edit.setPlaceholderText("Paste your token here")
        self.token_edit.setEchoMode(QLineEdit.EchoMode.Password)
        if initial_token:
            self.token_edit.setText(initial_token)
        layout.addWidget(self.token_edit)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Save
            | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _open_beatport(self) -> None:
        webbrowser.open(BEATPORT_URL)

    def get_token(self) -> str:
        """Return the token string (after Bearer) as entered by the user."""
        return (self.token_edit.text() or "").strip()
