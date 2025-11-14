#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Export Dialog Module

This module contains the ExportDialog class for selecting export format and options.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QGroupBox, QRadioButton, QButtonGroup,
    QCheckBox, QFileDialog, QMessageBox
)
from PySide6.QtCore import Qt
from typing import List, Dict, Any, Optional


class ExportDialog(QDialog):
    """Dialog for selecting export format and options"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.file_path: Optional[str] = None
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI components"""
        self.setWindowTitle("Export Results")
        self.setMinimumSize(500, 400)
        
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        
        # Format selection
        format_group = QGroupBox("Export Format")
        format_layout = QVBoxLayout()
        
        self.format_group = QButtonGroup()
        
        self.csv_radio = QRadioButton("CSV")
        self.csv_radio.setChecked(True)
        self.format_group.addButton(self.csv_radio, 0)
        format_layout.addWidget(self.csv_radio)
        
        self.json_radio = QRadioButton("JSON")
        self.format_group.addButton(self.json_radio, 1)
        format_layout.addWidget(self.json_radio)
        
        self.excel_radio = QRadioButton("Excel (.xlsx)")
        self.format_group.addButton(self.excel_radio, 2)
        format_layout.addWidget(self.excel_radio)
        
        format_group.setLayout(format_layout)
        layout.addWidget(format_group)
        
        # Export options
        options_group = QGroupBox("Export Options")
        options_layout = QVBoxLayout()
        
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
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.browse_btn = QPushButton("Browse...")
        self.browse_btn.clicked.connect(self._browse_file)
        button_layout.addWidget(self.browse_btn)
        
        self.file_path_label = QLabel("No file selected")
        self.file_path_label.setWordWrap(True)
        self.file_path_label.setMinimumWidth(300)
        button_layout.addWidget(self.file_path_label, 1)
        
        layout.addLayout(button_layout)
        
        # Dialog buttons
        dialog_buttons = QHBoxLayout()
        dialog_buttons.addStretch()
        
        self.export_btn = QPushButton("Export")
        self.export_btn.setDefault(True)
        self.export_btn.clicked.connect(self.accept)
        self.export_btn.setEnabled(False)
        dialog_buttons.addWidget(self.export_btn)
        
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        dialog_buttons.addWidget(cancel_btn)
        
        layout.addLayout(dialog_buttons)
        
        # Update file path label when format changes
        self.format_group.buttonClicked.connect(self._on_format_changed)
    
    def _on_format_changed(self):
        """Handle format selection change"""
        if self.file_path:
            # Update extension based on format
            self._update_file_path_extension()
    
    def _browse_file(self):
        """Browse for export file location"""
        format_ext = self._get_format_extension()
        
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Results",
            "",
            f"{format_ext.upper()} Files (*.{format_ext});;All Files (*.*)"
        )
        
        if file_path:
            # Ensure correct extension
            if not file_path.endswith(f".{format_ext}"):
                file_path = f"{file_path}.{format_ext}"
            
            self.file_path = file_path
            self.file_path_label.setText(file_path)
            self.export_btn.setEnabled(True)
    
    def _update_file_path_extension(self):
        """Update file path extension based on selected format"""
        if not self.file_path:
            return
        
        format_ext = self._get_format_extension()
        base_path = self.file_path.rsplit('.', 1)[0] if '.' in self.file_path else self.file_path
        self.file_path = f"{base_path}.{format_ext}"
        self.file_path_label.setText(self.file_path)
    
    def _get_format_extension(self) -> str:
        """Get file extension for selected format"""
        if self.json_radio.isChecked():
            return "json"
        elif self.excel_radio.isChecked():
            return "xlsx"
        else:  # CSV
            return "csv"
    
    def get_export_options(self) -> Dict[str, Any]:
        """
        Get selected export options.
        
        Returns:
            Dictionary with export options:
            {
                'format': 'csv' | 'json' | 'excel',
                'file_path': str,
                'export_filtered': bool,
                'include_candidates': bool,
                'include_queries': bool
            }
        """
        format_map = {
            0: "csv",
            1: "json",
            2: "excel"
        }
        
        selected_format = format_map.get(self.format_group.checkedId(), "csv")
        
        return {
            "format": selected_format,
            "file_path": self.file_path,
            "export_filtered": self.export_filtered_check.isChecked(),
            "include_candidates": self.include_candidates_check.isChecked(),
            "include_queries": self.include_queries_check.isChecked()
        }

