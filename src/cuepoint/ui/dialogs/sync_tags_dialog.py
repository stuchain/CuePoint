#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Sync with Rekordbox dialog: choose key format and which tags to write."""

from dataclasses import dataclass
from typing import Any, Dict

from PySide6.QtCore import QSettings
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QRadioButton,
    QVBoxLayout,
)

from cuepoint.ui.widgets.styles import Colors

_SETTINGS_GROUP = "SyncWithRekordbox"
_KEY_FORMAT = "key_format"
_WRITE_KEY = "write_key"
_WRITE_YEAR = "write_year"
_WRITE_BPM = "write_bpm"
_WRITE_LABEL = "write_label"
_WRITE_GENRE = "write_genre"
_WRITE_COMMENT = "write_comment"
_COMMENT_TEXT = "comment_text"


@dataclass
class SyncOptions:
    """Options for syncing tags to Rekordbox."""

    key_format: str  # "normal" | "camelot" | "short"
    write_key: bool
    write_year: bool
    write_bpm: bool
    write_label: bool
    write_genre: bool
    write_comment: bool
    comment_text: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key_format": self.key_format,
            "write_key": self.write_key,
            "write_year": self.write_year,
            "write_bpm": self.write_bpm,
            "write_label": self.write_label,
            "write_genre": self.write_genre,
            "write_comment": self.write_comment,
            "comment_text": (self.comment_text or "").strip() or "ok",
        }


def _load_saved_options() -> SyncOptions:
    s = QSettings()
    s.beginGroup(_SETTINGS_GROUP)
    key_format = s.value(_KEY_FORMAT, "normal", type=str) or "normal"
    if key_format not in ("normal", "camelot", "short"):
        key_format = "normal"
    write_key = s.value(_WRITE_KEY, True, type=bool)
    write_year = s.value(_WRITE_YEAR, True, type=bool)
    write_bpm = s.value(_WRITE_BPM, False, type=bool)
    write_label = s.value(_WRITE_LABEL, True, type=bool)
    write_genre = s.value(_WRITE_GENRE, False, type=bool)
    write_comment = s.value(_WRITE_COMMENT, True, type=bool)
    comment_text = s.value(_COMMENT_TEXT, "ok", type=str) or "ok"
    s.endGroup()
    return SyncOptions(
        key_format=key_format,
        write_key=write_key,
        write_year=write_year,
        write_bpm=write_bpm,
        write_label=write_label,
        write_genre=write_genre,
        write_comment=write_comment,
        comment_text=comment_text,
    )


def _save_options(opts: SyncOptions) -> None:
    s = QSettings()
    s.beginGroup(_SETTINGS_GROUP)
    s.setValue(_KEY_FORMAT, opts.key_format)
    s.setValue(_WRITE_KEY, opts.write_key)
    s.setValue(_WRITE_YEAR, opts.write_year)
    s.setValue(_WRITE_BPM, opts.write_bpm)
    s.setValue(_WRITE_LABEL, opts.write_label)
    s.setValue(_WRITE_GENRE, opts.write_genre)
    s.setValue(_WRITE_COMMENT, opts.write_comment)
    s.setValue(_COMMENT_TEXT, opts.comment_text or "ok")
    s.endGroup()


class SyncTagsDialog(QDialog):
    """Dialog to choose key format and which tags to write when syncing with Rekordbox."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("syncTagsDialog")
        self.setWindowTitle("Sync with Rekordbox")
        self._saved = _load_saved_options()
        self._options: SyncOptions | None = None
        self._init_ui()
        self._apply_key_format_style()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        key_group = QGroupBox("Key format")
        key_group.setObjectName("keyFormatGroup")
        key_layout = QVBoxLayout(key_group)
        self._normal_rb = QRadioButton("Normal (e.g. A Minor, G Major)")
        self._camelot_rb = QRadioButton("Camelot (e.g. 8A, 12B)")
        self._short_rb = QRadioButton("Short (e.g. Amin, Gmaj, G#min)")
        key_layout.addWidget(self._normal_rb)
        key_layout.addWidget(self._camelot_rb)
        key_layout.addWidget(self._short_rb)
        if self._saved.key_format == "camelot":
            self._camelot_rb.setChecked(True)
        elif self._saved.key_format == "short":
            self._short_rb.setChecked(True)
        else:
            self._normal_rb.setChecked(True)
        layout.addWidget(key_group)

        tags_group = QGroupBox("Tags to write")
        tags_layout = QVBoxLayout(tags_group)
        self._write_key_cb = QCheckBox("Key")
        self._write_year_cb = QCheckBox("Release year")
        self._write_bpm_cb = QCheckBox("BPM")
        self._write_label_cb = QCheckBox("Label")
        self._write_genre_cb = QCheckBox("Genre")
        self._write_comment_cb = QCheckBox("Comment")
        self._write_key_cb.setChecked(self._saved.write_key)
        self._write_year_cb.setChecked(self._saved.write_year)
        self._write_bpm_cb.setChecked(self._saved.write_bpm)
        self._write_label_cb.setChecked(self._saved.write_label)
        self._write_genre_cb.setChecked(self._saved.write_genre)
        self._write_comment_cb.setChecked(self._saved.write_comment)
        tags_layout.addWidget(self._write_key_cb)
        tags_layout.addWidget(self._write_year_cb)
        tags_layout.addWidget(self._write_bpm_cb)
        tags_layout.addWidget(self._write_label_cb)
        tags_layout.addWidget(self._write_genre_cb)
        tags_layout.addWidget(self._write_comment_cb)
        layout.addWidget(tags_group)

        comment_row = QHBoxLayout()
        comment_row.addWidget(QLabel("Comment text:"))
        self._comment_edit = QLineEdit()
        self._comment_edit.setPlaceholderText("e.g. ok")
        self._comment_edit.setText(self._saved.comment_text or "ok")
        self._comment_edit.setClearButtonEnabled(True)
        comment_row.addWidget(self._comment_edit)
        layout.addLayout(comment_row)

        btn = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        btn.accepted.connect(self._on_accept)
        btn.rejected.connect(self.reject)
        layout.addWidget(btn)

    def _apply_key_format_style(self) -> None:
        """Make the selected key format radio button clearly visible (background + border)."""
        self.setStyleSheet(
            f"""
            QDialog#syncTagsDialog QGroupBox#keyFormatGroup QRadioButton {{
                padding: 6px 10px;
                border-radius: 4px;
                border: 1px solid transparent;
            }}
            QDialog#syncTagsDialog QGroupBox#keyFormatGroup QRadioButton:checked {{
                background-color: {Colors.SURFACE};
                color: {Colors.TEXT_PRIMARY};
                border: 1px solid {Colors.BORDER};
                border-left: 3px solid {Colors.PRIMARY};
                font-weight: bold;
            }}
            """
        )

    def _on_accept(self) -> None:
        key_format = (
            "camelot"
            if self._camelot_rb.isChecked()
            else ("short" if self._short_rb.isChecked() else "normal")
        )
        comment_text = (self._comment_edit.text() or "").strip() or "ok"
        self._options = SyncOptions(
            key_format=key_format,
            write_key=self._write_key_cb.isChecked(),
            write_year=self._write_year_cb.isChecked(),
            write_bpm=self._write_bpm_cb.isChecked(),
            write_label=self._write_label_cb.isChecked(),
            write_genre=self._write_genre_cb.isChecked(),
            write_comment=self._write_comment_cb.isChecked(),
            comment_text=comment_text,
        )
        _save_options(self._options)
        self.accept()

    def get_options(self) -> SyncOptions | None:
        return self._options

    def get_options_dict(self) -> Dict[str, Any] | None:
        if self._options is None:
            return None
        return self._options.to_dict()
