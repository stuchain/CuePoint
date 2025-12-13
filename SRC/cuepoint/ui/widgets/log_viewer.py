#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Log Viewer Widget

Provides a UI for viewing application logs with filtering and search.
Implements logging requirements from Step 1.9.
"""

import logging
import platform
import subprocess
from pathlib import Path

from PySide6.QtCore import QTimer
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
)

from cuepoint.utils.paths import AppPaths

logger = logging.getLogger(__name__)


class LogViewer(QDialog):
    """Enhanced log viewer with filtering and search.

    Provides log viewing functionality:
    - View log files
    - Filter by log level
    - Search logs
    - Auto-refresh
    - Export logs
    - Open logs folder
    """

    def __init__(self, parent=None):
        """Initialize log viewer.

        Args:
            parent: Parent widget.
        """
        super().__init__(parent)
        self.setWindowTitle("Log Viewer")
        self.setMinimumSize(800, 600)
        self.auto_refresh = False
        self.filtered_content = ""
        self.init_ui()

    def init_ui(self):
        """Initialize UI components."""
        layout = QVBoxLayout()

        # Controls
        controls_layout = QHBoxLayout()

        # Log level filter
        level_label = QLabel("Filter by level:")
        controls_layout.addWidget(level_label)

        self.level_combo = QComboBox()
        self.level_combo.addItems(["All", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"])
        self.level_combo.currentTextChanged.connect(self.load_logs)
        controls_layout.addWidget(self.level_combo)

        # Search
        search_label = QLabel("Search:")
        controls_layout.addWidget(search_label)

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search logs...")
        self.search_input.textChanged.connect(self.filter_logs)
        controls_layout.addWidget(self.search_input)

        # Auto-refresh
        self.auto_refresh_checkbox = QCheckBox("Auto-refresh")
        self.auto_refresh_checkbox.toggled.connect(self.toggle_auto_refresh)
        controls_layout.addWidget(self.auto_refresh_checkbox)

        controls_layout.addStretch()

        layout.addLayout(controls_layout)

        # Log text area
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setFont(QFont("Courier", 10))
        self.log_text.setLineWrapMode(QTextEdit.NoWrap)
        layout.addWidget(self.log_text)

        # Buttons
        button_layout = QHBoxLayout()

        refresh_btn = QPushButton("Refresh")
        refresh_btn.clicked.connect(self.load_logs)
        button_layout.addWidget(refresh_btn)

        clear_btn = QPushButton("Clear Logs")
        clear_btn.clicked.connect(self.clear_logs)
        button_layout.addWidget(clear_btn)

        export_btn = QPushButton("Export...")
        export_btn.clicked.connect(self.export_logs)
        button_layout.addWidget(export_btn)

        open_folder_btn = QPushButton("Open Logs Folder")
        open_folder_btn.clicked.connect(self.open_logs_folder)
        button_layout.addWidget(open_folder_btn)

        button_layout.addStretch()

        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        button_layout.addWidget(close_btn)

        layout.addLayout(button_layout)

        self.setLayout(layout)

        # Load logs
        self.load_logs()

    def load_logs(self):
        """Load and display log files."""
        log_dir = AppPaths.logs_dir()
        log_file = log_dir / "cuepoint.log"

        if not log_file.exists():
            self.log_text.setPlainText("No log file found.")
            return

        # Read log file
        try:
            content = log_file.read_text(encoding="utf-8")

            # Filter by level
            level = self.level_combo.currentText()
            if level != "All":
                lines = content.splitlines()
                filtered_lines = [line for line in lines if f"[{level}]" in line]
                content = "\n".join(filtered_lines)

            # Apply search filter
            self.filtered_content = content
            self.filter_logs()

        except Exception as e:
            self.log_text.setPlainText(f"Error reading log file: {e}")
            logger.error(f"Error reading log file: {e}")

    def filter_logs(self):
        """Filter logs by search term."""
        search_term = self.search_input.text().lower()

        if not search_term:
            self.log_text.setPlainText(self.filtered_content)
            return

        lines = self.filtered_content.splitlines()
        filtered = [line for line in lines if search_term in line.lower()]
        self.log_text.setPlainText("\n".join(filtered))

    def toggle_auto_refresh(self, enabled: bool):
        """Toggle auto-refresh.

        Args:
            enabled: Whether to enable auto-refresh.
        """
        self.auto_refresh = enabled
        if enabled:
            if not hasattr(self, "refresh_timer"):
                self.refresh_timer = QTimer()
                self.refresh_timer.timeout.connect(self.load_logs)
            self.refresh_timer.start(2000)  # Refresh every 2 seconds
        else:
            if hasattr(self, "refresh_timer"):
                self.refresh_timer.stop()

    def clear_logs(self):
        """Clear log files (with confirmation)."""
        reply = QMessageBox.question(
            self,
            "Clear Logs",
            "Are you sure you want to clear all log files?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )

        if reply == QMessageBox.Yes:
            log_dir = AppPaths.logs_dir()
            cleared_count = 0
            for log_file in log_dir.glob("*.log*"):
                try:
                    log_file.unlink()
                    cleared_count += 1
                except Exception as e:
                    logger.error(f"Error deleting log file {log_file}: {e}")

            if cleared_count > 0:
                QMessageBox.information(self, "Logs Cleared", f"Cleared {cleared_count} log file(s).")
                self.load_logs()

    def export_logs(self):
        """Export logs to file."""
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Logs",
            str(AppPaths.exports_dir() / "cuepoint-logs.txt"),
            "Text Files (*.txt);;All Files (*)",
        )

        if file_path:
            try:
                Path(file_path).write_text(self.log_text.toPlainText(), encoding="utf-8")
                QMessageBox.information(self, "Export Complete", f"Logs exported to:\n{file_path}")
            except Exception as e:
                QMessageBox.critical(self, "Export Failed", f"Failed to export logs:\n{e}")

    def open_logs_folder(self):
        """Open logs folder in file explorer."""
        log_dir = AppPaths.logs_dir()

        try:
            if platform.system() == "Windows":
                subprocess.Popen(f'explorer "{log_dir}"')
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", str(log_dir)])
            else:
                subprocess.Popen(["xdg-open", str(log_dir)])
        except Exception as e:
            QMessageBox.warning(self, "Cannot Open Folder", f"Could not open folder:\n{e}")
