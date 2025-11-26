#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for export functionality.

Tests end-to-end export workflow from GUI to file system.
"""

import unittest
import tempfile
import os
import shutil
import json
import gzip
import csv
from unittest.mock import Mock, patch, MagicMock
from PySide6.QtWidgets import QApplication
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.gui_interface import TrackResult
from cuepoint.ui.dialogs.export_dialog import ExportDialog
from cuepoint.services.output_writer import write_json_file, write_csv_files


class TestExportIntegration(unittest.TestCase):
    """Integration tests for export workflow"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.test_results = [
            TrackResult(
                playlist_index=1,
                title="Test Track 1",
                artist="Test Artist",
                matched=True,
                beatport_title="Test Track 1",
                beatport_artists="Test Artist",
                beatport_url="https://beatport.com/track/test/123",
                match_score=95.5,
                confidence="high",
                beatport_key="C Major",
                beatport_bpm="128",
                beatport_year="2023",
                beatport_label="Test Label",
                beatport_genres="House, Deep House",
                beatport_release="Test Release",
                beatport_release_date="2023-01-15"
            ),
            TrackResult(
                playlist_index=2,
                title="Test Track 2",
                artist="Another Artist",
                matched=False
            )
        ]
    
    def tearDown(self):
        """Clean up test fixtures"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_json_export_workflow(self):
        """Test complete JSON export workflow"""
        filepath = os.path.join(self.temp_dir, "test_export.json")
        
        # Simulate export dialog options
        options = {
            "format": "json",
            "file_path": filepath,
            "include_metadata": True,
            "include_processing_info": False,
            "compress": False,
            "delimiter": ","
        }
        
        # Perform export
        result_path = write_json_file(
            self.test_results,
            options["file_path"],
            include_metadata=options.get("include_metadata", True),
            include_processing_info=options.get("include_processing_info", False),
            compress=options.get("compress", False)
        )
        
        # Verify file was created
        self.assertTrue(os.path.exists(result_path))
        
        # Verify file content
        with open(result_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 2)
        self.assertEqual(data["matched_tracks"], 1)
    
    def test_json_export_workflow_compressed(self):
        """Test complete JSON export workflow with compression"""
        filepath = os.path.join(self.temp_dir, "test_export.json.gz")
        
        options = {
            "format": "json",
            "file_path": filepath,
            "include_metadata": True,
            "include_processing_info": False,
            "compress": True
        }
        
        result_path = write_json_file(
            self.test_results,
            options["file_path"],
            include_metadata=options.get("include_metadata", True),
            include_processing_info=options.get("include_processing_info", False),
            compress=options.get("compress", False)
        )
        
        self.assertTrue(os.path.exists(result_path))
        self.assertTrue(result_path.endswith(".json.gz"))
        
        # Verify we can read compressed file
        with gzip.open(result_path, 'rt', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 2)
    
    def test_csv_export_workflow(self):
        """Test complete CSV export workflow"""
        base_filename = "test_export"
        
        options = {
            "format": "csv",
            "file_path": os.path.join(self.temp_dir, "test_export.csv"),
            "include_metadata": True,
            "delimiter": ","
        }
        
        # Perform export
        output_files = write_csv_files(
            self.test_results,
            base_filename,
            self.temp_dir,
            delimiter=options.get("delimiter", ","),
            include_metadata=options.get("include_metadata", True)
        )
        
        # Verify main file was created
        self.assertIn("main", output_files)
        self.assertTrue(os.path.exists(output_files["main"]))
        
        # Verify file content
        with open(output_files["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            rows = list(reader)
        
        self.assertGreaterEqual(len(rows), 2)  # Header + tracks
    
    def test_csv_export_workflow_custom_delimiter(self):
        """Test CSV export workflow with custom delimiter"""
        base_filename = "test_export"
        
        options = {
            "format": "csv",
            "file_path": os.path.join(self.temp_dir, "test_export.tsv"),
            "include_metadata": True,
            "delimiter": "\t"
        }
        
        output_files = write_csv_files(
            self.test_results,
            base_filename,
            self.temp_dir,
            delimiter=options.get("delimiter", "\t"),
            include_metadata=options.get("include_metadata", True)
        )
        
        self.assertIn("main", output_files)
        self.assertTrue(output_files["main"].endswith(".tsv"))
        
        # Verify delimiter is correct
        with open(output_files["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f, delimiter='\t')
            rows = list(reader)
        
        self.assertGreaterEqual(len(rows), 2)
    
    def test_export_dialog_integration(self):
        """Test export dialog integration with export functions"""
        dialog = ExportDialog()
        
        # Set up dialog options
        dialog.csv_radio.setChecked(True)
        dialog.include_metadata_checkbox.setChecked(True)
        dialog.delimiter_combo.setCurrentText(";")
        dialog.file_path_edit.setText(os.path.join(self.temp_dir, "test.csv"))
        
        # Get options
        options = dialog.get_export_options()
        
        # Verify options are correct
        self.assertEqual(options["format"], "csv")
        self.assertTrue(options["include_metadata"])
        self.assertEqual(options["delimiter"], ";")
        
        # Perform export with these options
        output_files = write_csv_files(
            self.test_results,
            "test",
            self.temp_dir,
            delimiter=options["delimiter"],
            include_metadata=options["include_metadata"]
        )
        
        self.assertIn("main", output_files)
        self.assertTrue(os.path.exists(output_files["main"]))
        
        dialog.close()
    
    def test_export_with_processing_info(self):
        """Test export with processing information included"""
        filepath = os.path.join(self.temp_dir, "test_processing.json")
        settings = {"test_setting": "test_value", "another_setting": 123}
        
        result_path = write_json_file(
            self.test_results,
            filepath,
            include_metadata=False,
            include_processing_info=True,
            compress=False,
            settings=settings
        )
        
        with open(result_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertIn("processing_info", data)
        self.assertEqual(data["processing_info"]["settings"], settings)
        self.assertIn("timestamp", data["processing_info"])
    
    def test_export_metadata_inclusion(self):
        """Test that metadata inclusion works correctly"""
        # Test with metadata
        filepath_with = os.path.join(self.temp_dir, "test_with_metadata.json")
        result_path_with = write_json_file(
            self.test_results,
            filepath_with,
            include_metadata=True,
            include_processing_info=False,
            compress=False
        )
        
        with open(result_path_with, 'r', encoding='utf-8') as f:
            data_with = json.load(f)
        
        matched_track_with = next(t for t in data_with["tracks"] if t["matched"])
        self.assertIn("metadata", matched_track_with["match"])
        
        # Test without metadata
        filepath_without = os.path.join(self.temp_dir, "test_without_metadata.json")
        result_path_without = write_json_file(
            self.test_results,
            filepath_without,
            include_metadata=False,
            include_processing_info=False,
            compress=False
        )
        
        with open(result_path_without, 'r', encoding='utf-8') as f:
            data_without = json.load(f)
        
        matched_track_without = next(t for t in data_without["tracks"] if t["matched"])
        self.assertNotIn("metadata", matched_track_without["match"])


if __name__ == '__main__':
    unittest.main()

