#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI integration tests for export dialog.

Tests UI interactions, validation, and integration with export functions.
"""

import unittest
import tempfile
import os
import shutil
from unittest.mock import Mock, patch, MagicMock
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys

# Initialize QApplication for tests
if not QApplication.instance():
    app = QApplication(sys.argv)

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.dialogs.export_dialog import ExportDialog


class TestExportDialog(unittest.TestCase):
    """Tests for ExportDialog GUI component"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.dialog = ExportDialog()
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.dialog.close()
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_dialog_initialization(self):
        """Test dialog initializes correctly"""
        self.assertIsNotNone(self.dialog)
        self.assertEqual(self.dialog.windowTitle(), "Export Results")
    
    def test_format_selection_csv(self):
        """Test CSV format selection"""
        self.dialog.csv_radio.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertEqual(options["format"], "csv")
        self.assertTrue(self.dialog.delimiter_combo.isEnabled())
        self.assertFalse(self.dialog.compress_checkbox.isEnabled())
    
    def test_format_selection_json(self):
        """Test JSON format selection"""
        self.dialog.json_radio.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertEqual(options["format"], "json")
        self.assertFalse(self.dialog.delimiter_combo.isEnabled())
        self.assertTrue(self.dialog.compress_checkbox.isEnabled())
    
    def test_format_selection_excel(self):
        """Test Excel format selection"""
        self.dialog.excel_radio.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertEqual(options["format"], "excel")
        self.assertFalse(self.dialog.delimiter_combo.isEnabled())
        self.assertFalse(self.dialog.compress_checkbox.isEnabled())
    
    def test_metadata_checkbox(self):
        """Test metadata inclusion checkbox"""
        self.dialog.include_metadata_checkbox.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertTrue(options["include_metadata"])
        
        self.dialog.include_metadata_checkbox.setChecked(False)
        options = self.dialog.get_export_options()
        self.assertFalse(options["include_metadata"])
    
    def test_processing_info_checkbox(self):
        """Test processing info inclusion checkbox"""
        self.dialog.include_processing_info_checkbox.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertTrue(options["include_processing_info"])
    
    def test_compression_checkbox(self):
        """Test compression checkbox (JSON only)"""
        self.dialog.json_radio.setChecked(True)
        self.dialog.compress_checkbox.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertTrue(options["compress"])
        
        # Compression should be False for non-JSON formats
        self.dialog.csv_radio.setChecked(True)
        options = self.dialog.get_export_options()
        self.assertFalse(options["compress"])
    
    def test_delimiter_selection(self):
        """Test delimiter selection (CSV only)"""
        self.dialog.csv_radio.setChecked(True)
        self.dialog.delimiter_combo.setCurrentText(";")
        options = self.dialog.get_export_options()
        self.assertEqual(options["delimiter"], ";")
    
    def test_validation_no_file_path(self):
        """Test validation fails when no file path provided"""
        self.dialog.file_path_edit.clear()
        self.assertFalse(self.dialog.validate())
    
    def test_validation_with_file_path(self):
        """Test validation passes with valid file path"""
        temp_file = os.path.join(self.temp_dir, "test_export.csv")
        
        self.dialog.file_path_edit.setText(temp_file)
        self.assertTrue(self.dialog.validate())
    
    def test_file_extension_update_json(self):
        """Test file extension updates when format changes to JSON"""
        test_path = os.path.join(self.temp_dir, "file.csv")
        self.dialog.file_path_edit.setText(test_path)
        # Manually trigger the update by calling the method directly
        self.dialog.json_radio.setChecked(True)
        self.dialog._update_file_extension_hint()
        
        # Extension should be updated
        path = self.dialog.file_path_edit.text()
        self.assertTrue(path.endswith(".json"))
    
    def test_file_extension_update_csv(self):
        """Test file extension updates when format changes to CSV"""
        test_path = os.path.join(self.temp_dir, "file.json")
        self.dialog.file_path_edit.setText(test_path)
        # Manually trigger the update by calling the method directly
        self.dialog.csv_radio.setChecked(True)
        self.dialog._update_file_extension_hint()
        
        path = self.dialog.file_path_edit.text()
        # Should end with .csv (default delimiter is comma)
        self.assertTrue(path.endswith(".csv"))
    
    def test_delimiter_enable_disable(self):
        """Test delimiter combo enables/disables based on format"""
        # Start with CSV (should be enabled)
        self.dialog.csv_radio.setChecked(True)
        self.assertTrue(self.dialog.delimiter_combo.isEnabled())
        
        # Switch to JSON (should be disabled)
        self.dialog.json_radio.setChecked(True)
        self.assertFalse(self.dialog.delimiter_combo.isEnabled())
        
        # Switch back to CSV (should be enabled again)
        self.dialog.csv_radio.setChecked(True)
        self.assertTrue(self.dialog.delimiter_combo.isEnabled())
    
    def test_compression_enable_disable(self):
        """Test compression checkbox enables/disables based on format"""
        # Start with JSON (should be enabled)
        self.dialog.json_radio.setChecked(True)
        self.assertTrue(self.dialog.compress_checkbox.isEnabled())
        
        # Switch to CSV (should be disabled)
        self.dialog.csv_radio.setChecked(True)
        self.assertFalse(self.dialog.compress_checkbox.isEnabled())
        
        # Switch back to JSON (should be enabled again)
        self.dialog.json_radio.setChecked(True)
        self.assertTrue(self.dialog.compress_checkbox.isEnabled())
    
    def test_get_export_options_all_formats(self):
        """Test get_export_options returns correct format for all options"""
        formats = ["csv", "json", "excel"]
        radios = [self.dialog.csv_radio, self.dialog.json_radio, self.dialog.excel_radio]
        
        for fmt, radio in zip(formats, radios):
            radio.setChecked(True)
            options = self.dialog.get_export_options()
            self.assertEqual(options["format"], fmt)
    
    def test_get_export_options_includes_all_fields(self):
        """Test get_export_options includes all expected fields"""
        self.dialog.file_path_edit.setText(os.path.join(self.temp_dir, "test.csv"))
        options = self.dialog.get_export_options()
        
        expected_fields = [
            "format", "file_path", "include_metadata", 
            "include_processing_info", "compress", "delimiter"
        ]
        
        for field in expected_fields:
            self.assertIn(field, options)


if __name__ == '__main__':
    unittest.main()

