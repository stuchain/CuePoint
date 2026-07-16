#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Diagnostics Panel Dialog (Design 7.132)

Local status page showing log path, last run ID, and health checks.
"""

from pathlib import Path

from PySide6.QtWidgets import (
    QDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
)

from cuepoint.utils.health_check import run_all_health_checks
from cuepoint.utils.i18n import tr
from cuepoint.utils.paths import AppPaths
from cuepoint.utils.run_context import get_current_run_id


class DiagnosticsPanelDialog(QDialog):
    """Diagnostics panel showing log path, run ID, and service health (Design 7.132)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()

    def _setup_ui(self):
        self.setWindowTitle(tr("diagnostics.panel.title", "Diagnostics & Status"))
        self.setModal(False)
        self.setMinimumSize(450, 350)

        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Run info
        run_group = QGroupBox(tr("diagnostics.run_info", "Run Information"))
        run_layout = QVBoxLayout()
        run_id = get_current_run_id() or tr("diagnostics.no_run", "No run yet")
        run_layout.addWidget(QLabel(f"Run ID: {run_id}"))
        try:
            from cuepoint.utils.logger import CuePointLogger

            log_path = CuePointLogger.get_log_file()
        except Exception:
            try:
                log_path = AppPaths.logs_dir() / "cuepoint.log"
            except Exception:
                log_path = Path("~/.cuepoint/logs/cuepoint.log")
        run_layout.addWidget(
            QLabel(tr("diagnostics.log_path", "Log path:") + f" {log_path}")
        )
        copy_btn = QPushButton(tr("diagnostics.copy_run_id", "Copy Run ID"))
        copy_btn.clicked.connect(lambda: self._copy_to_clipboard(run_id))
        run_layout.addWidget(copy_btn)
        run_group.setLayout(run_layout)
        layout.addWidget(run_group)

        # Health checks
        health_group = QGroupBox(tr("diagnostics.health_checks", "Service Health"))
        health_layout = QVBoxLayout()
        try:
            results = run_all_health_checks()
            for name, r in results.items():
                status = "✓" if r.ok else "✗"
                lbl = QLabel(f"{status} {name}: {r.message}")
                if r.detail:
                    lbl.setToolTip(r.detail)
                health_layout.addWidget(lbl)
        except Exception as e:
            health_layout.addWidget(QLabel(f"Health check error: {e}"))
        health_group.setLayout(health_layout)
        layout.addWidget(health_group)

        # Refresh button
        btn_layout = QHBoxLayout()
        refresh_btn = QPushButton(tr("diagnostics.refresh", "Refresh"))
        refresh_btn.clicked.connect(self._refresh)
        btn_layout.addWidget(refresh_btn)
        btn_layout.addStretch()
        layout.addLayout(btn_layout)

    def _copy_to_clipboard(self, text: str):
        from PySide6.QtGui import QClipboard
        from PySide6.QtWidgets import QApplication

        app = QApplication.instance()
        if app and app.clipboard():
            app.clipboard().setText(text, QClipboard.Mode.Clipboard)

    def _refresh(self):
        self.close()
        d = DiagnosticsPanelDialog(self.parent())
        d.exec()
