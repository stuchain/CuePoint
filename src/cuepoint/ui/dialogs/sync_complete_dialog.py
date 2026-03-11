#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Small dialog shown after Sync with Rekordbox completes."""

from typing import List, Optional

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QPlainTextEdit,
    QVBoxLayout,
)


def _reload_message() -> str:
    return (
        "Sync complete. Go back to Rekordbox, select the tracks that have been processed, "
        "right-click and select Reload Tags."
    )


class SyncCompleteDialog(QDialog):
    """Shows sync result and Reload Tags instructions."""

    def __init__(
        self,
        written: int,
        failed: int,
        errors: list,
        parent=None,
        wav_skipped: Optional[List[str]] = None,
    ):
        super().__init__(parent)
        self.setWindowTitle("Sync with Rekordbox")
        layout = QVBoxLayout(self)
        msg = _reload_message()
        if written > 0 or failed > 0:
            msg = f"{written} written, {failed} failed.\n\n" + msg
        layout.addWidget(QLabel(msg))
        wav_list = wav_skipped or []
        if wav_list:
            layout.addWidget(
                QLabel(
                    "WAV tracks (Rekordbox cannot read tags from WAV; enter Key/Comment to Rekordbox manually from the table):"
                )
            )
            wav_detail = QPlainTextEdit()
            wav_detail.setReadOnly(True)
            lines = [f"• {s}" for s in wav_list[:50]]
            wav_detail.setPlainText("\n".join(lines))
            if len(wav_list) > 50:
                wav_detail.appendPlainText(f"\n• ... and {len(wav_list) - 50} more")
            wav_detail.setMinimumHeight(80)
            wav_detail.setMaximumHeight(240)
            layout.addWidget(wav_detail)
        if errors:
            layout.addWidget(QLabel("Failed tracks (path: reason):"))
            detail = QPlainTextEdit()
            detail.setReadOnly(True)
            bulleted = [f"• {e}" for e in errors[:50]]
            detail.setPlainText("\n".join(bulleted))
            if len(errors) > 50:
                detail.appendPlainText(f"\n• ... and {len(errors) - 50} more")
            detail.setMinimumHeight(120)
            detail.setMaximumHeight(320)
            layout.addWidget(detail)
        btn = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok)
        btn.accepted.connect(self.accept)
        layout.addWidget(btn)
