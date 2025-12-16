#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Support Bundle Export Dialog (Step 9.5)

User-friendly dialog for generating and exporting support bundles.
"""

from pathlib import Path
from typing import Optional

from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
)

from cuepoint.utils.i18n import tr
from cuepoint.utils.paths import AppPaths
from cuepoint.utils.support_bundle import SupportBundleGenerator


class BundleGenerationThread(QThread):
    """Thread for generating support bundle without blocking UI."""

    finished = Signal(Path)
    error = Signal(str)

    def __init__(self, output_path: Path, include_logs: bool, include_config: bool, sanitize: bool):
        """Initialize bundle generation thread.

        Args:
            output_path: Directory to save bundle.
            include_logs: Whether to include log files.
            include_config: Whether to include configuration.
            sanitize: Whether to sanitize sensitive information.
        """
        super().__init__()
        self.output_path = output_path
        self.include_logs = include_logs
        self.include_config = include_config
        self.sanitize = sanitize

    def run(self):
        """Generate support bundle."""
        try:
            bundle_path = SupportBundleGenerator.generate_bundle(self.output_path)
            self.finished.emit(bundle_path)
        except Exception as e:
            self.error.emit(str(e))


class SupportBundleDialog(QDialog):
    """Dialog for generating and exporting support bundles."""

    def __init__(self, parent=None):
        """Initialize support bundle dialog."""
        super().__init__(parent)
        self.bundle_path: Optional[Path] = None
        self.generation_thread: Optional[BundleGenerationThread] = None
        self._setup_ui()

    def _setup_ui(self):
        """Set up UI components."""
        self.setWindowTitle(tr("support.bundle.title", "Export Support Bundle"))
        self.setModal(True)
        self.resize(500, 400)

        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Title
        title = QLabel(tr("support.bundle.title", "Export Support Bundle"))
        title_font = title.font()
        title_font.setPointSize(18)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)

        # Description
        description = QLabel(
            tr(
                "support.bundle.description",
                "Generate a support bundle containing diagnostic information, "
                "logs, and configuration to help resolve issues. The bundle can "
                "be attached when reporting issues.",
            )
        )
        description.setWordWrap(True)
        layout.addWidget(description)

        layout.addSpacing(10)

        # Options
        options_label = QLabel(tr("support.bundle.options", "Include in bundle:"))
        layout.addWidget(options_label)

        self.include_logs_checkbox = QCheckBox(tr("support.bundle.include_logs", "Application logs"))
        self.include_logs_checkbox.setChecked(True)
        layout.addWidget(self.include_logs_checkbox)

        self.include_config_checkbox = QCheckBox(tr("support.bundle.include_config", "Configuration files"))
        self.include_config_checkbox.setChecked(True)
        layout.addWidget(self.include_config_checkbox)

        self.sanitize_checkbox = QCheckBox(tr("support.bundle.sanitize", "Sanitize sensitive information"))
        self.sanitize_checkbox.setChecked(True)
        layout.addWidget(self.sanitize_checkbox)

        layout.addSpacing(10)

        # Progress bar (hidden initially)
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setRange(0, 0)  # Indeterminate
        layout.addWidget(self.progress_bar)

        # Status message
        self.status_label = QLabel()
        self.status_label.setVisible(False)
        self.status_label.setWordWrap(True)
        layout.addWidget(self.status_label)

        layout.addStretch()

        # Buttons
        button_layout = QHBoxLayout()

        cancel_button = QPushButton(tr("button.cancel", "Cancel"))
        cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(cancel_button)

        button_layout.addStretch()

        self.generate_button = QPushButton(tr("support.bundle.generate", "Generate Bundle"))
        self.generate_button.setDefault(True)
        self.generate_button.clicked.connect(self.generate_bundle)
        button_layout.addWidget(self.generate_button)

        layout.addLayout(button_layout)

    def generate_bundle(self):
        """Generate support bundle."""
        self.generate_button.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.status_label.setVisible(True)
        self.status_label.setText(tr("support.bundle.generating", "Generating support bundle..."))

        # Get output directory
        output_dir = AppPaths.exports_dir()
        output_dir.mkdir(parents=True, exist_ok=True)

        # Create and start generation thread
        self.generation_thread = BundleGenerationThread(
            output_dir,
            self.include_logs_checkbox.isChecked(),
            self.include_config_checkbox.isChecked(),
            self.sanitize_checkbox.isChecked(),
        )
        self.generation_thread.finished.connect(self._on_bundle_generated)
        self.generation_thread.error.connect(self._on_bundle_error)
        self.generation_thread.start()

    def _on_bundle_generated(self, bundle_path: Path):
        """Handle successful bundle generation.

        Args:
            bundle_path: Path to generated bundle.
        """
        self.bundle_path = bundle_path
        self.progress_bar.setVisible(False)
        self.status_label.setText(
            tr(
                "support.bundle.success",
                "Bundle generated: {filename}\nLocation: {location}",
            ).format(filename=bundle_path.name, location=bundle_path.parent)
        )

        # Show success message
        msg = QMessageBox(self)
        msg.setIcon(QMessageBox.Information)
        msg.setWindowTitle(tr("support.bundle.success_title", "Support Bundle Generated"))
        msg.setText(tr("support.bundle.success_text", "Support bundle generated successfully:\n{filename}").format(filename=bundle_path.name))
        msg.setInformativeText(tr("support.bundle.success_info", "Location: {location}").format(location=bundle_path.parent))

        open_button = msg.addButton(tr("support.bundle.open_location", "Open Location"), QMessageBox.ActionRole)
        msg.addButton(tr("button.ok", "OK"), QMessageBox.AcceptRole)

        msg.exec()

        if msg.clickedButton() == open_button:
            self._reveal_file(bundle_path)

        self.generate_button.setEnabled(True)
        self.accept()

    def _on_bundle_error(self, error_message: str):
        """Handle bundle generation error.

        Args:
            error_message: Error message.
        """
        self.progress_bar.setVisible(False)
        self.status_label.setText(tr("support.bundle.error", "Error generating bundle: {error}").format(error=error_message))
        self.generate_button.setEnabled(True)

        QMessageBox.critical(
            self,
            tr("support.bundle.error_title", "Error"),
            tr("support.bundle.error_text", "Failed to generate support bundle:\n{error}").format(error=error_message),
        )

    def _reveal_file(self, file_path: Path):
        """Reveal file in OS file manager.

        Args:
            file_path: Path to file to reveal.
        """
        import platform
        import subprocess

        try:
            if platform.system() == "Windows":
                subprocess.Popen(f'explorer /select,"{file_path}"')
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", "-R", str(file_path)])
            else:
                subprocess.Popen(["xdg-open", str(file_path.parent)])
        except Exception:
            pass  # Best effort

    def get_bundle_path(self) -> Optional[Path]:
        """Get path to generated bundle.

        Returns:
            Path to bundle, or None if not generated.
        """
        return self.bundle_path
