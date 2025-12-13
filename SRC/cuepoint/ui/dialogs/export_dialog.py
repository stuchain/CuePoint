#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Export Dialog Module

This module contains the ExportDialog class for selecting export format and options.
"""

import os
import platform
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

from PySide6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QComboBox,
    QDialog,
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QRadioButton,
    QVBoxLayout,
)

from cuepoint.ui.controllers.export_controller import ExportController
from cuepoint.utils.paths import AppPaths


class ExportDialog(QDialog):
    """Enhanced export dialog with additional options"""

    def __init__(
        self,
        export_controller: Optional[ExportController] = None,
        parent=None,
        current_format: str = "csv",
    ):
        super().__init__(parent)
        # Use provided controller or create a new one
        self.export_controller = export_controller or ExportController()
        self.file_path: Optional[str] = None
        self.selected_format = current_format
        self.init_ui()
        self._setup_connections()

    def init_ui(self):
        """Initialize export dialog with enhanced options"""
        self.setWindowTitle("Export Results")
        self.setMinimumWidth(500)

        layout = QVBoxLayout(self)
        layout.setSpacing(15)

        # Format selection (existing)
        format_group = QGroupBox("Export Format")
        format_layout = QVBoxLayout()

        self.format_group = QButtonGroup()
        self.csv_radio = QRadioButton("CSV")
        self.json_radio = QRadioButton("JSON")
        self.excel_radio = QRadioButton("Excel")

        # Set default based on current_format
        if self.selected_format == "csv":
            self.csv_radio.setChecked(True)
        elif self.selected_format == "json":
            self.json_radio.setChecked(True)
        elif self.selected_format == "excel":
            self.excel_radio.setChecked(True)
        else:
            self.csv_radio.setChecked(True)

        self.format_group.addButton(self.csv_radio, 0)
        self.format_group.addButton(self.json_radio, 1)
        self.format_group.addButton(self.excel_radio, 2)

        format_layout.addWidget(self.csv_radio)
        format_layout.addWidget(self.json_radio)
        format_layout.addWidget(self.excel_radio)
        format_group.setLayout(format_layout)
        layout.addWidget(format_group)

        # NEW: Enhanced Export Options Group
        options_group = QGroupBox("Export Options")
        options_layout = QVBoxLayout()

        # Include metadata
        self.include_metadata_checkbox = QCheckBox(
            "Include full metadata (genres, labels, release dates)"
        )
        self.include_metadata_checkbox.setChecked(True)
        self.include_metadata_checkbox.setToolTip(
            "Include additional metadata fields like genres, labels, "
            "and release dates in the export"
        )
        options_layout.addWidget(self.include_metadata_checkbox)

        # Include processing info
        self.include_processing_info_checkbox = QCheckBox(
            "Include processing information (timestamps, settings)"
        )
        self.include_processing_info_checkbox.setChecked(False)
        self.include_processing_info_checkbox.setToolTip(
            "Include processing metadata like timestamps and search settings used during processing"
        )
        options_layout.addWidget(self.include_processing_info_checkbox)

        # Compression option (for JSON only)
        self.compress_checkbox = QCheckBox("Compress output (gzip)")
        self.compress_checkbox.setChecked(False)
        self.compress_checkbox.setToolTip(
            "Compress JSON output using gzip compression "
            "(significantly reduces file size for large exports)"
        )
        # Initially disabled, enabled when JSON is selected
        self.compress_checkbox.setEnabled(self.json_radio.isChecked())
        options_layout.addWidget(self.compress_checkbox)

        # Custom delimiter (for CSV only)
        delimiter_layout = QHBoxLayout()
        delimiter_layout.addWidget(QLabel("CSV Delimiter:"))
        self.delimiter_combo = QComboBox()
        self.delimiter_combo.addItems([",", ";", "\t", "|"])
        self.delimiter_combo.setCurrentText(",")
        self.delimiter_combo.setToolTip("Select the delimiter character for CSV files")
        # Initially disabled, enabled when CSV is selected
        self.delimiter_combo.setEnabled(self.csv_radio.isChecked())
        delimiter_layout.addWidget(self.delimiter_combo)
        delimiter_layout.addStretch()
        options_layout.addLayout(delimiter_layout)

        # Legacy options (keep for backward compatibility)
        self.export_filtered_check = QCheckBox("Export filtered results only")
        self.export_filtered_check.setToolTip(
            "If checked, only export results matching current filters. "
            "If unchecked, export all results."
        )
        self.export_filtered_check.setChecked(False)
        options_layout.addWidget(self.export_filtered_check)

        self.include_candidates_check = QCheckBox("Include candidates data")
        self.include_candidates_check.setToolTip(
            "Include all candidate matches in the export (CSV/JSON only)"
        )
        self.include_candidates_check.setChecked(False)
        options_layout.addWidget(self.include_candidates_check)

        self.include_queries_check = QCheckBox("Include queries data")
        self.include_queries_check.setToolTip(
            "Include all search queries in the export (CSV/JSON only)"
        )
        self.include_queries_check.setChecked(False)
        options_layout.addWidget(self.include_queries_check)

        options_group.setLayout(options_layout)
        layout.addWidget(options_group)

        # Output location display
        output_dir_group = QGroupBox("Output Location")
        output_dir_layout = QVBoxLayout()
        
        # Default output directory display
        self.output_dir_label = QLabel()
        self.update_output_dir_display()
        output_dir_layout.addWidget(self.output_dir_label)
        
        # File path selection
        file_layout = QHBoxLayout()
        file_layout.addWidget(QLabel("Output File:"))
        self.file_path_edit = QLineEdit()
        self.file_path_edit.setPlaceholderText("Select output file location...")
        self.file_path_edit.textChanged.connect(self._on_file_path_changed)
        file_layout.addWidget(self.file_path_edit)

        browse_button = QPushButton("Browse...")
        browse_button.clicked.connect(self._browse_file)
        file_layout.addWidget(browse_button)
        
        output_dir_layout.addLayout(file_layout)
        
        # Open folder button
        open_folder_button = QPushButton("Open Output Folder")
        open_folder_button.setToolTip("Open the output folder in your file explorer")
        open_folder_button.clicked.connect(self._open_output_folder)
        output_dir_layout.addWidget(open_folder_button)
        
        output_dir_group.setLayout(output_dir_layout)
        layout.addWidget(output_dir_group)

        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()

        self.export_button = QPushButton("Export")
        self.export_button.setDefault(True)
        self.export_button.clicked.connect(self.accept)
        self.export_button.setEnabled(False)  # Disabled until file is selected
        button_layout.addWidget(self.export_button)

        cancel_button = QPushButton("Cancel")
        cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(cancel_button)

        layout.addLayout(button_layout)

    def _setup_connections(self):
        """Setup signal connections for dynamic UI updates"""
        # Enable/disable compression based on format
        self.json_radio.toggled.connect(lambda checked: self.compress_checkbox.setEnabled(checked))

        # Enable/disable delimiter based on format
        self.csv_radio.toggled.connect(lambda checked: self.delimiter_combo.setEnabled(checked))

        # Update file extension hint when format changes
        self.format_group.buttonClicked.connect(self._update_file_extension_hint)

    def _on_file_path_changed(self, text: str):
        """Handle file path text changes - enable/disable export button"""
        # Enable export button if file path is provided
        self.export_button.setEnabled(bool(text.strip()))

    def _update_file_extension_hint(self):
        """Update file path extension hint based on selected format"""
        current_path = self.file_path_edit.text()
        if not current_path:
            return

        # Get selected format
        if self.json_radio.isChecked():
            new_ext = ".json"
            if self.compress_checkbox.isChecked():
                new_ext = ".json.gz"
        elif self.csv_radio.isChecked():
            delimiter = self.delimiter_combo.currentText()
            if delimiter == "\t":
                new_ext = ".tsv"
            elif delimiter == "|":
                new_ext = ".psv"
            else:
                new_ext = ".csv"
        else:  # Excel
            new_ext = ".xlsx"

        # Update path if it has an extension
        if "." in current_path:
            base_path = current_path.rsplit(".", 1)[0]
            self.file_path_edit.setText(base_path + new_ext)

    def _browse_file(self):
        """Open file dialog to select output file"""
        # Determine file filter based on selected format
        if self.json_radio.isChecked():
            if self.compress_checkbox.isChecked():
                file_filter = (
                    "Compressed JSON Files (*.json.gz);;JSON Files (*.json);;All Files (*.*)"
                )
            else:
                file_filter = "JSON Files (*.json);;All Files (*.*)"
            default_ext = ".json"
        elif self.csv_radio.isChecked():
            delimiter = self.delimiter_combo.currentText()
            if delimiter == "\t":
                file_filter = "TSV Files (*.tsv);;All Files (*.*)"
                default_ext = ".tsv"
            elif delimiter == "|":
                file_filter = "PSV Files (*.psv);;All Files (*.*)"
                default_ext = ".psv"
            else:
                file_filter = "CSV Files (*.csv);;All Files (*.*)"
                default_ext = ".csv"
        else:  # Excel
            file_filter = "Excel Files (*.xlsx);;All Files (*.*)"
            default_ext = ".xlsx"

        file_path, _ = QFileDialog.getSaveFileName(self, "Export Results", "", file_filter)

        if file_path:
            # Ensure correct extension
            if not file_path.endswith(default_ext):
                file_path += default_ext
            self.file_path_edit.setText(file_path)
            self.file_path = file_path
            # Export button will be enabled automatically via textChanged signal

    def _get_format_extension(self) -> str:
        """Get file extension for selected format"""
        if self.json_radio.isChecked():
            if self.compress_checkbox.isChecked():
                return "json.gz"
            return "json"
        elif self.excel_radio.isChecked():
            return "xlsx"
        else:  # CSV
            delimiter = self.delimiter_combo.currentText()
            if delimiter == "\t":
                return "tsv"
            elif delimiter == "|":
                return "psv"
            else:
                return "csv"

    def get_export_options(self) -> Dict[str, Any]:
        """Get selected export options with enhancements"""
        # Determine format
        if self.json_radio.isChecked():
            format_type = "json"
        elif self.csv_radio.isChecked():
            format_type = "csv"
        else:
            format_type = "excel"

        options = {
            "format": format_type,
            "file_path": self.file_path_edit.text() or self.file_path,
            "include_metadata": self.include_metadata_checkbox.isChecked(),
            "include_processing_info": self.include_processing_info_checkbox.isChecked(),
            "compress": self.compress_checkbox.isChecked() if format_type == "json" else False,
            "delimiter": self.delimiter_combo.currentText() if format_type == "csv" else ",",
            # Legacy options for backward compatibility
            "export_filtered": self.export_filtered_check.isChecked(),
            "include_candidates": self.include_candidates_check.isChecked(),
            "include_queries": self.include_queries_check.isChecked(),
        }

        return options

    def validate(self) -> bool:
        """Validate export options"""
        file_path = self.file_path_edit.text() or self.file_path
        if not file_path:
            QMessageBox.warning(self, "Invalid Options", "Please select an output file location.")
            return False

        # Check if directory exists and is writable
        output_dir = os.path.dirname(file_path)
        if output_dir and not os.path.exists(output_dir):
            try:
                os.makedirs(output_dir, exist_ok=True)
            except OSError:
                QMessageBox.warning(
                    self, "Invalid Path", f"Cannot create output directory:\n{output_dir}"
                )
                return False

        return True

    def update_output_dir_display(self):
        """Update output directory display."""
        output_dir = AppPaths.exports_dir()
        self.output_dir_label.setText(f"Default Output: {output_dir}")
        self.output_dir_label.setToolTip(f"Files will be saved to: {output_dir}")

    def _open_output_folder(self):
        """Open output folder in file explorer.
        
        Opens the default exports directory or the directory of the selected file.
        """
        # Get directory to open
        if self.file_path_edit.text():
            # Use directory of selected file
            file_path = Path(self.file_path_edit.text())
            if file_path.parent.exists():
                folder_path = file_path.parent
            else:
                folder_path = AppPaths.exports_dir()
        else:
            # Use default exports directory
            folder_path = AppPaths.exports_dir()
        
        # Open folder based on platform
        try:
            if platform.system() == "Windows":
                subprocess.Popen(f'explorer "{folder_path}"')
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", str(folder_path)])
            else:
                subprocess.Popen(["xdg-open", str(folder_path)])
        except Exception as e:
            QMessageBox.warning(
                self,
                "Cannot Open Folder",
                f"Could not open folder:\n{str(e)}"
            )

    def show_export_complete(self, file_path: str):
        """Show export completion message with option to open folder.
        
        Args:
            file_path: Path to the exported file.
        """
        msg = QMessageBox(self)
        msg.setIcon(QMessageBox.Information)
        msg.setWindowTitle("Export Complete")
        msg.setText(f"Results exported successfully!")
        msg.setInformativeText(f"File: {file_path}")
        
        # Add "Open Folder" button
        open_folder_btn = msg.addButton("Open Folder", QMessageBox.ActionRole)
        open_file_btn = msg.addButton("Open File", QMessageBox.ActionRole)
        msg.addButton("OK", QMessageBox.AcceptRole)
        
        msg.exec()
        
        if msg.clickedButton() == open_folder_btn:
            # Open folder containing the file
            folder_path = Path(file_path).parent
            try:
                if platform.system() == "Windows":
                    subprocess.Popen(f'explorer "{folder_path}"')
                elif platform.system() == "Darwin":
                    subprocess.Popen(["open", str(folder_path)])
                else:
                    subprocess.Popen(["xdg-open", str(folder_path)])
            except Exception:
                pass  # Ignore errors opening folder
        elif msg.clickedButton() == open_file_btn:
            # Open the file itself
            try:
                if platform.system() == "Windows":
                    subprocess.Popen(f'"{file_path}"', shell=True)
                elif platform.system() == "Darwin":
                    subprocess.Popen(["open", file_path])
                else:
                    subprocess.Popen(["xdg-open", file_path])
            except Exception:
                pass  # Ignore errors opening file

    def accept(self):
        """Override accept to validate before closing"""
        if self.validate():
            super().accept()
