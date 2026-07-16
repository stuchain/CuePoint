"""inCrate Playlist section: name edit, Add to playlist button, status (Phase 5)."""

from typing import Optional

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class IncratePlaylistSection(QWidget):
    """Playlist section: name QLineEdit, Add button, status QLabel."""

    add_clicked = Signal(str)  # playlist name

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        group = QGroupBox("Add to playlist")
        group_layout = QVBoxLayout(group)
        name_row = QHBoxLayout()
        name_row.addWidget(QLabel("Playlist name:"))
        self.name_edit = QLineEdit()
        self.name_edit.setObjectName("incrate_playlist_name")
        self.name_edit.setPlaceholderText("e.g. feb26")
        name_row.addWidget(self.name_edit)
        group_layout.addLayout(name_row)
        self.add_btn = QPushButton("Add to playlist")
        self.add_btn.setObjectName("incrate_add_to_playlist")
        self.add_btn.clicked.connect(self._on_add)
        group_layout.addWidget(self.add_btn)
        self.status_label = QLabel("")
        self.status_label.setStyleSheet("color: #666; font-size: 12px;")
        self.status_label.setWordWrap(True)
        group_layout.addWidget(self.status_label)
        layout.addWidget(group)

    def _on_add(self) -> None:
        name = (self.name_edit.text() or "").strip() or self.name_edit.placeholderText()
        self.add_clicked.emit(name or "playlist")

    def set_default_name(self, name: str) -> None:
        if not (self.name_edit.text() or "").strip():
            self.name_edit.setPlaceholderText(name)
        self.name_edit.setText(self.name_edit.text() or name)

    def set_status(self, text: str, is_error: bool = False) -> None:
        self.status_label.setText(text)
        if is_error:
            self.status_label.setStyleSheet("color: #c62828; font-size: 12px;")
        else:
            self.status_label.setStyleSheet("color: #666; font-size: 12px;")

    def set_adding(self, adding: bool) -> None:
        self.add_btn.setEnabled(not adding)
