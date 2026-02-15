#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run summary dialog (Step 1.4).

Displays key metrics and output paths after processing completes.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from cuepoint.models.run_summary import RunSummary
from cuepoint.services.integrity_service import verify_outputs
from cuepoint.ui.strings import SuccessCopy


class RunSummaryDialog(QDialog):
    """Dialog showing a run summary and next steps."""

    def __init__(self, summary: RunSummary, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._summary = summary
        self._setup_ui()

    def _setup_ui(self) -> None:
        self.setWindowTitle("Run Summary")
        self.setModal(True)
        self.resize(400, 320)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(8)

        title = QLabel(SuccessCopy.RUN_SUMMARY_TITLE)
        title.setStyleSheet("font-size: 14px; font-weight: bold;")
        layout.addWidget(title)

        # Single line: playlist + key stats
        stats = (
            f"{self._summary.total_tracks} tracks, {self._summary.matched} matched"
            + (f", {self._summary.unmatched} unmatched" if self._summary.unmatched else "")
            + (f", {self._summary.low_confidence} low confidence" if self._summary.low_confidence else "")
            + f" — {self._summary.duration_sec:.1f}s"
        )
        if self._summary.error_count or self._summary.warning_count:
            stats += f" — {self._summary.error_count} errors, {self._summary.warning_count} warnings"
        summary_label = QLabel(stats)
        summary_label.setWordWrap(True)
        summary_label.setStyleSheet("font-size: 12px; color: #ccc;")
        layout.addWidget(summary_label)

        if self._summary.playlist:
            pl_label = QLabel(f"Playlist: {self._summary.playlist}")
            pl_label.setStyleSheet("font-size: 11px; color: #888;")
            layout.addWidget(pl_label)

        if self._summary.output_paths:
            outputs_list = QListWidget()
            outputs_list.setSelectionMode(QListWidget.NoSelection)
            outputs_list.setMaximumHeight(72)
            for path in self._summary.output_paths:
                QListWidgetItem(path, outputs_list)
            layout.addWidget(outputs_list)

        # One short line for next steps (Design 8.74-8.75)
        next_line = QLabel(SuccessCopy.STEP_NEXT_SHORT)
        next_line.setWordWrap(True)
        next_line.setStyleSheet("color: #888; font-size: 11px; margin-top: 4px;")
        layout.addWidget(next_line)

        layout.addStretch(1)

        button_row = QHBoxLayout()
        open_folder = QPushButton(SuccessCopy.OPEN_OUTPUT_FOLDER)
        open_folder.clicked.connect(self._open_output_folder)
        open_folder.setAccessibleName(SuccessCopy.OPEN_OUTPUT_FOLDER)
        button_row.addWidget(open_folder)

        # Design 9: Verify outputs button
        verify_btn = QPushButton("Verify outputs")
        verify_btn.setObjectName("secondaryActionButton")
        verify_btn.clicked.connect(self._verify_outputs)
        verify_btn.setAccessibleName("Verify outputs")
        verify_btn.setToolTip("Verify output files (schema, checksums)")
        button_row.addWidget(verify_btn)

        copy_summary = QPushButton(SuccessCopy.COPY_SUMMARY)
        copy_summary.setObjectName("secondaryActionButton")
        copy_summary.clicked.connect(self._copy_summary)
        copy_summary.setAccessibleName(SuccessCopy.COPY_SUMMARY)
        button_row.addWidget(copy_summary)

        button_row.addStretch(1)

        close_button = QPushButton(SuccessCopy.CLOSE)
        close_button.setDefault(True)
        close_button.clicked.connect(self.accept)
        button_row.addWidget(close_button)

        layout.addLayout(button_row)

    def _open_output_folder(self) -> None:
        if not self._summary.output_paths:
            return
        first_path = Path(self._summary.output_paths[0])
        folder = first_path.parent if first_path.exists() else first_path.parent
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(folder)))

    def _copy_summary(self) -> None:
        text = "\n".join(self._summary.to_lines())
        QApplication.clipboard().setText(text)

    def _verify_outputs(self) -> None:
        """Design 9: Verify output files (schema, checksums)."""
        if not self._summary.output_paths:
            QMessageBox.information(
                self, "Verify Outputs", "No output paths to verify."
            )
            return
        first_path = Path(self._summary.output_paths[0])
        output_dir = str(first_path.parent)
        ok, errors = verify_outputs(output_dir, checksums=True, schema=True)
        if ok:
            QMessageBox.information(
                self,
                "Verify Outputs",
                "Outputs verified: OK\n\nChecksums: OK\nSchema: OK",
            )
        else:
            msg = "Verification failed:\n\n" + "\n".join(errors)
            QMessageBox.warning(self, "Verify Outputs", msg)
