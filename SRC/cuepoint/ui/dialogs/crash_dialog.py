#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Crash Dialog (Design 7.25, 7.26)

Shown when an unhandled exception occurs. Offers export support bundle,
copy error details, and close app.
"""

import subprocess
import sys
from pathlib import Path

from PySide6.QtGui import QClipboard
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
)

from cuepoint.utils.i18n import tr
from cuepoint.utils.paths import AppPaths
from cuepoint.utils.support_bundle import SupportBundleGenerator


class CrashDialog(QDialog):
    """Dialog shown when application crashes (Design 7.25, 7.26)."""

    def __init__(self, exception: Exception, traceback_str: str, crash_log: Path, crash_report_path: Path):
        """Initialize crash dialog.

        Args:
            exception: Exception that caused crash.
            traceback_str: Full traceback string.
            crash_log: Path to crash log file.
            crash_report_path: Path to crash report JSON.
        """
        super().__init__()
        self.exception = exception
        self.traceback_str = traceback_str
        self.crash_log = crash_log
        self.crash_report_path = crash_report_path
        self._setup_ui()

    def _setup_ui(self):
        """Set up UI components."""
        self.setWindowTitle(tr("crash.dialog.title", "Application Error"))
        self.setModal(True)
        self.setMinimumSize(500, 400)

        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        layout.setContentsMargins(20, 20, 20, 20)

        # Message (Design 7.25)
        msg = QLabel(
            tr(
                "crash.dialog.message",
                "The app encountered an error.\n\n"
                "A crash report has been saved. Would you like to export a support bundle to help diagnose the issue?",
            )
        )
        msg.setWordWrap(True)
        layout.addWidget(msg)

        # Error summary
        error_label = QLabel(
            f"{type(self.exception).__name__}: {str(self.exception)[:200]}"
        )
        error_label.setWordWrap(True)
        error_label.setStyleSheet("color: #c0392b; font-weight: bold;")
        layout.addWidget(error_label)

        # Traceback (collapsible / truncated)
        trace_preview = QTextEdit()
        trace_preview.setReadOnly(True)
        trace_preview.setMaximumHeight(120)
        trace_preview.setPlainText(self.traceback_str[:2000] + ("..." if len(self.traceback_str) > 2000 else ""))
        layout.addWidget(trace_preview)

        # Buttons (Design 7.26)
        button_layout = QHBoxLayout()

        export_btn = QPushButton(tr("crash.dialog.export_bundle", "Export Support Bundle"))
        export_btn.setDefault(True)
        export_btn.clicked.connect(self._on_export_bundle)
        button_layout.addWidget(export_btn)

        copy_btn = QPushButton(tr("crash.dialog.copy_details", "Copy Error Details"))
        copy_btn.clicked.connect(self._on_copy_details)
        button_layout.addWidget(copy_btn)

        button_layout.addStretch()

        close_btn = QPushButton(tr("crash.dialog.close", "Close"))
        close_btn.clicked.connect(self._on_close)
        button_layout.addWidget(close_btn)

        layout.addLayout(button_layout)

    def _on_export_bundle(self):
        """Export support bundle (Design 7.27)."""
        try:
            output_dir = AppPaths.exports_dir()
            output_dir.mkdir(parents=True, exist_ok=True)
            bundle_path = SupportBundleGenerator.generate_bundle(
                output_dir,
                include_logs=True,
                include_config=True,
                sanitize=True,
            )
            QMessageBox.information(
                self,
                tr("crash.dialog.bundle_title", "Support Bundle Created"),
                tr(
                    "crash.dialog.bundle_message",
                    "Support bundle saved to:\n{path}\n\nPlease attach it when reporting the issue.",
                ).format(path=bundle_path),
            )
            self._reveal_file(bundle_path)
        except Exception as e:
            QMessageBox.warning(
                self,
                tr("crash.dialog.bundle_error_title", "Export Failed"),
                tr(
                    "crash.dialog.bundle_error_message",
                    "Unable to create support bundle. Open logs folder?\n\n{error}",
                ).format(error=str(e)),
            )
        self._on_close()

    def _on_copy_details(self):
        """Copy error details to clipboard."""
        app = QApplication.instance()
        if app and app.clipboard():
            text = f"{type(self.exception).__name__}: {self.exception}\n\n{self.traceback_str}"
            app.clipboard().setText(text, QClipboard.Mode.Clipboard)
            QMessageBox.information(
                self,
                tr("crash.dialog.copied", "Copied"),
                tr("crash.dialog.copied_message", "Error details copied to clipboard."),
            )

    def _on_close(self):
        """Close and exit application."""
        self.accept()
        sys.exit(1)

    def _reveal_file(self, file_path: Path):
        """Reveal file in OS file manager."""
        try:
            if sys.platform == "win32":
                subprocess.Popen(f'explorer /select,"{file_path}"')
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-R", str(file_path)])
            else:
                subprocess.Popen(["xdg-open", str(file_path.parent)])
        except Exception:
            pass
