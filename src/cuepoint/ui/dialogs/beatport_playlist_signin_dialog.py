"""
Sign-in dialog for Add to playlist when the API token lacks playlist scope.

User enters Beatport username and password. If the app has OAuth client_id/client_secret
(from beatporttoken.txt or env), we can exchange these for a token with playlist access.
"""

from __future__ import annotations

from typing import Optional

from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)


class BeatportPlaylistSignInDialog(QDialog):
    """Dialog to sign in with Beatport username/password for playlist creation."""

    def __init__(
        self,
        parent: Optional[QWidget] = None,
        initial_username: str = "",
        initial_password: str = "",
        error_message: Optional[str] = None,
    ) -> None:
        super().__init__(parent)
        self.setWindowTitle("Sign in for playlists")
        self.setMinimumWidth(400)
        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        label = QLabel(
            "Add to playlist needs access to your Beatport account. "
            "Sign in with your Beatport email and password. We'll use this only to create the playlist."
        )
        label.setWordWrap(True)
        layout.addWidget(label)

        if error_message:
            err = QLabel(error_message)
            err.setWordWrap(True)
            err.setStyleSheet("color: #c62828; font-size: 12px;")
            layout.addWidget(err)

        layout.addWidget(QLabel("Email or username:"))
        self.username_edit = QLineEdit()
        self.username_edit.setPlaceholderText("Your Beatport login")
        if initial_username:
            self.username_edit.setText(initial_username)
        layout.addWidget(self.username_edit)

        layout.addWidget(QLabel("Password:"))
        self.password_edit = QLineEdit()
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_edit.setPlaceholderText("Your Beatport password")
        if initial_password:
            self.password_edit.setText(initial_password)
        layout.addWidget(self.password_edit)

        self.remember_check = QCheckBox("Remember in Settings")
        self.remember_check.setChecked(True)
        self.remember_check.setToolTip("Save username and password in app settings for next time.")
        layout.addWidget(self.remember_check)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Cancel | QDialogButtonBox.StandardButton.Ok
        )
        buttons.button(QDialogButtonBox.StandardButton.Ok).setText("Sign in and retry")
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def get_username(self) -> str:
        return (self.username_edit.text() or "").strip()

    def get_password(self) -> str:
        return self.password_edit.text() or ""

    def get_remember(self) -> bool:
        return self.remember_check.isChecked()
