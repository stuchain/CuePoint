#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Preflight dialog (Step 1.2).

Shows validation errors and warnings before processing begins.
"""

from __future__ import annotations

from typing import List, Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from cuepoint.models.preflight import PreflightResult


class PreflightDialog(QDialog):
    """Dialog that displays preflight errors and warnings."""

    def __init__(
        self,
        preflight: PreflightResult,
        parent: Optional[QWidget] = None,
    ) -> None:
        super().__init__(parent)
        self._preflight = preflight
        self._errors: List[str] = preflight.error_messages()
        self._warnings: List[str] = preflight.warning_messages()
        self._setup_ui()

    def _setup_ui(self) -> None:
        self.setWindowTitle("Preflight Checks")
        self.setModal(True)
        self.resize(560, 420)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 16)
        layout.setSpacing(12)

        summary = self._build_summary()
        summary_label = QLabel(summary)
        summary_label.setWordWrap(True)
        summary_label.setAlignment(Qt.AlignLeft)
        layout.addWidget(summary_label)

        if self._errors:
            layout.addWidget(self._build_section("Errors", self._errors))

        if self._warnings:
            layout.addWidget(self._build_section("Warnings", self._warnings))

        details_toggle = QCheckBox("Show details")
        details_toggle.stateChanged.connect(self._toggle_details)
        layout.addWidget(details_toggle)

        self._details_text = QTextEdit()
        self._details_text.setReadOnly(True)
        self._details_text.setVisible(False)
        self._details_text.setPlainText(self._format_details())
        layout.addWidget(self._details_text)

        layout.addStretch(1)

        button_row = QHBoxLayout()
        fix_button = QPushButton("Fix and Retry")
        fix_button.setObjectName("secondaryActionButton")
        fix_button.clicked.connect(self.reject)
        button_row.addWidget(fix_button)

        export_button = QPushButton("Export Report")
        export_button.clicked.connect(self._export_report)
        button_row.addWidget(export_button)

        button_row.addStretch(1)

        proceed_button = QPushButton("Proceed Anyway")
        proceed_button.setDefault(True)
        proceed_button.setEnabled(len(self._errors) == 0)
        proceed_button.clicked.connect(self.accept)
        button_row.addWidget(proceed_button)

        cancel_button = QPushButton("Cancel")
        cancel_button.clicked.connect(self.reject)
        button_row.addWidget(cancel_button)

        layout.addLayout(button_row)

    def _toggle_details(self, state: int) -> None:
        self._details_text.setVisible(bool(state))

    def _format_details(self) -> str:
        try:
            import json

            return json.dumps(self._preflight.to_report(), indent=2)
        except Exception:
            return "Details unavailable."

    def _export_report(self) -> None:
        path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Preflight Report",
            "preflight_report.json",
            "JSON Files (*.json);;All Files (*)",
        )
        if not path:
            return
        try:
            import json

            with open(path, "w", encoding="utf-8") as handle:
                json.dump(self._preflight.to_report(), handle, indent=2)
        except Exception:
            return

    def _build_summary(self) -> str:
        error_count = len(self._errors)
        warning_count = len(self._warnings)
        parts = []
        if error_count:
            parts.append(f"{error_count} error{'s' if error_count != 1 else ''}")
        if warning_count:
            parts.append(f"{warning_count} warning{'s' if warning_count != 1 else ''}")
        if not parts:
            return "No issues detected."
        return "Preflight found " + ", ".join(parts) + "."

    def _build_section(self, title: str, items: List[str]) -> QWidget:
        container = QWidget(self)
        container_layout = QVBoxLayout(container)
        container_layout.setContentsMargins(0, 0, 0, 0)
        container_layout.setSpacing(6)

        title_label = QLabel(title)
        title_label.setStyleSheet("font-weight: bold;")
        container_layout.addWidget(title_label)

        list_widget = QListWidget()
        list_widget.setSelectionMode(QListWidget.NoSelection)
        for item in items:
            QListWidgetItem(item, list_widget)
        container_layout.addWidget(list_widget)

        return container
