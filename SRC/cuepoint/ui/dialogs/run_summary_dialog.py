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
        self.resize(520, 480)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 16)
        layout.setSpacing(10)

        title = QLabel(SuccessCopy.RUN_SUMMARY_TITLE)
        title.setStyleSheet("font-size: 18px; font-weight: bold;")
        layout.addWidget(title)

        summary_lines = [
            f"Run ID: {self._summary.run_id}",
            f"Playlist: {self._summary.playlist}",
            f"Input XML: {self._summary.input_xml_path or 'N/A'}",
            f"Tracks: {self._summary.total_tracks}",
            f"Matched: {self._summary.matched}",
            f"Unmatched: {self._summary.unmatched}",
            f"Low confidence: {self._summary.low_confidence}",
            f"Duration: {self._summary.duration_sec:.2f}s",
            f"Errors: {self._summary.error_count}",
            f"Warnings: {self._summary.warning_count}",
        ]
        for line in summary_lines:
            label = QLabel(line)
            label.setAlignment(Qt.AlignLeft)
            layout.addWidget(label)

        if self._summary.output_paths:
            outputs_label = QLabel("Outputs")
            outputs_label.setStyleSheet("font-weight: bold;")
            layout.addWidget(outputs_label)

            outputs_list = QListWidget()
            outputs_list.setSelectionMode(QListWidget.NoSelection)
            for path in self._summary.output_paths:
                QListWidgetItem(path, outputs_list)
            layout.addWidget(outputs_list)

        # Step 8: Clear success criteria and what to do next (Design 8.74-8.75)
        what_next = QLabel(SuccessCopy.WHAT_TO_DO_NEXT)
        what_next.setStyleSheet("font-weight: bold; font-size: 13px; margin-top: 8px;")
        layout.addWidget(what_next)

        step1 = QLabel(SuccessCopy.STEP_REVIEW)
        step1.setWordWrap(True)
        step1.setStyleSheet("color: #ccc; font-size: 12px; margin-left: 8px;")
        layout.addWidget(step1)

        step2 = QLabel(SuccessCopy.STEP_EXPORT)
        step2.setWordWrap(True)
        step2.setStyleSheet("color: #ccc; font-size: 12px; margin-left: 8px;")
        layout.addWidget(step2)

        step3 = QLabel(SuccessCopy.STEP_REKORDBOX)
        step3.setWordWrap(True)
        step3.setStyleSheet("color: #ccc; font-size: 12px; margin-left: 8px;")
        layout.addWidget(step3)

        step4 = QLabel(SuccessCopy.STEP_UNDO_GUIDANCE)
        step4.setWordWrap(True)
        step4.setStyleSheet("color: #888; font-size: 11px; margin-left: 8px; font-style: italic;")
        layout.addWidget(step4)

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
            QMessageBox.information(self, "Verify Outputs", "No output paths to verify.")
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
