#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Small dialog shown after Sync with Rekordbox completes."""

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
    ):
        super().__init__(parent)
        self.setWindowTitle("Sync with Rekordbox")
        layout = QVBoxLayout(self)
        msg = _reload_message()
        if written > 0 or failed > 0:
            msg = f"{written} written, {failed} failed.\n\n" + msg
        layout.addWidget(QLabel(msg))
        if errors:
            detail = QPlainTextEdit()
            detail.setReadOnly(True)
            bulleted = [f"• {e}" for e in errors[:20]]
            detail.setPlainText("\n".join(bulleted))
            if len(errors) > 20:
                detail.appendPlainText(f"\n• ... and {len(errors) - 20} more")
            detail.setMaximumHeight(180)
            layout.addWidget(detail)
        btn = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok)
        btn.accepted.connect(self.accept)
        layout.addWidget(btn)
