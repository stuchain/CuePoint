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
    QDialog,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QVBoxLayout,
    QWidget,
    QApplication,
)

from cuepoint.models.run_summary import RunSummary


class RunSummaryDialog(QDialog):
    """Dialog showing a run summary and next steps."""

    def __init__(self, summary: RunSummary, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._summary = summary
        self._setup_ui()

    def _setup_ui(self) -> None:
        self.setWindowTitle("Run Summary")
        self.setModal(True)
        self.resize(520, 420)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 16)
        layout.setSpacing(10)

        title = QLabel("Run summary")
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

        next_steps = QLabel(
            "Next steps: review low-confidence matches and export outputs if needed."
        )
        next_steps.setWordWrap(True)
        next_steps.setStyleSheet("color: #ccc;")
        layout.addWidget(next_steps)

        layout.addStretch(1)

        button_row = QHBoxLayout()
        open_folder = QPushButton("Open output folder")
        open_folder.clicked.connect(self._open_output_folder)
        button_row.addWidget(open_folder)

        copy_summary = QPushButton("Copy summary")
        copy_summary.setObjectName("secondaryActionButton")
        copy_summary.clicked.connect(self._copy_summary)
        button_row.addWidget(copy_summary)

        button_row.addStretch(1)

        close_button = QPushButton("Close")
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
