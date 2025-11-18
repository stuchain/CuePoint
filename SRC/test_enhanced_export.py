#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for enhanced export features.

Tests all export options, error conditions, and edge cases.
"""

import unittest
import os
import tempfile
import gzip
import json
import csv
import shutil
from pathlib import Path

from gui_interface import TrackResult
from output_writer import write_json_file, write_csv_files


class TestEnhancedExport(unittest.TestCase):
    """Comprehensive tests for enhanced export functionality"""
    
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
                matched=False,
                beatport_title=None,
                beatport_artists=None
            ),
            TrackResult(
                playlist_index=3,
                title="Track with Special Chars: émojis 🎵 & symbols <>&\"'",
                artist="Artist with 'quotes' & \"double quotes\"",
                matched=True,
                beatport_title="Track with Special Chars: émojis 🎵 & symbols <>&\"'",
                beatport_artists="Artist with 'quotes' & \"double quotes\"",
                beatport_url="https://beatport.com/track/test/456",
                match_score=88.0,
                confidence="medium",
                beatport_key="A Minor",
                beatport_bpm="130",
                beatport_year="2024"
            )
        ]
    
    def tearDown(self):
        """Clean up test fixtures"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_json_export_basic(self):
        """Test basic JSON export without options"""
        filepath = os.path.join(self.temp_dir, "test_export.json")
        filepath = write_json_file(
            self.test_results,
            filepath,
            include_metadata=False,
            include_processing_info=False,
            compress=False
        )
        
        self.assertTrue(os.path.exists(filepath))
        self.assertTrue(filepath.endswith(".json"))
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 3)
        self.assertEqual(data["matched_tracks"], 2)
        self.assertEqual(len(data["tracks"]), 3)
        self.assertIn("version", data)
        self.assertIn("generated", data)
    
    def test_json_export_with_metadata(self):
        """Test JSON export with metadata inclusion"""
        filepath = os.path.join(self.temp_dir, "test_export_metadata.json")
        filepath = write_json_file(
            self.test_results,
            filepath,
            include_metadata=True,
            include_processing_info=False,
            compress=False
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Check that matched tracks have metadata
        matched_track = next(t for t in data["tracks"] if t["matched"])
        self.assertIn("match", matched_track)
        self.assertIn("metadata", matched_track["match"])
        self.assertIn("label", matched_track["match"]["metadata"])
        self.assertIn("genres", matched_track["match"]["metadata"])
    
    def test_json_export_without_metadata(self):
        """Test JSON export without metadata inclusion"""
        filepath = os.path.join(self.temp_dir, "test_export_no_metadata.json")
        filepath = write_json_file(
            self.test_results,
            filepath,
            include_metadata=False,
            include_processing_info=False,
            compress=False
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Check that matched tracks don't have metadata section
        matched_track = next(t for t in data["tracks"] if t["matched"])
        self.assertIn("match", matched_track)
        self.assertNotIn("metadata", matched_track["match"])
    
    def test_json_export_with_processing_info(self):
        """Test JSON export with processing information"""
        settings = {"setting1": "value1", "setting2": "value2"}
        
        filepath = os.path.join(self.temp_dir, "test_export_processing.json")
        filepath = write_json_file(
            self.test_results,
            filepath,
            include_metadata=False,
            include_processing_info=True,
            compress=False,
            settings=settings
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertIn("processing_info", data)
        self.assertEqual(data["processing_info"]["settings"], settings)
        self.assertIn("timestamp", data["processing_info"])
    
    def test_json_export_with_compression(self):
        """Test JSON export with gzip compression"""
        filepath = os.path.join(self.temp_dir, "test_export_compressed.json.gz")
        filepath = write_json_file(
            self.test_results,
            filepath,
            include_metadata=True,
            include_processing_info=False,
            compress=True
        )
        
        self.assertTrue(os.path.exists(filepath))
        self.assertTrue(filepath.endswith(".json.gz"))
        
        # Verify it's actually compressed (smaller than uncompressed)
        compressed_size = os.path.getsize(filepath)
        
        # Create uncompressed version for comparison
        uncompressed_path = os.path.join(self.temp_dir, "test_export_uncompressed.json")
        uncompressed_path = write_json_file(
            self.test_results,
            uncompressed_path,
            include_metadata=True,
            include_processing_info=False,
            compress=False
        )
        uncompressed_size = os.path.getsize(uncompressed_path)
        
        # Compressed should be smaller (for this test data)
        self.assertLess(compressed_size, uncompressed_size)
        
        # Verify we can read compressed file
        with gzip.open(filepath, 'rt', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 3)
    
    def test_json_export_special_characters(self):
        """Test JSON export handles special characters correctly"""
        filepath = os.path.join(self.temp_dir, "test_export_special.json")
        filepath = write_json_file(
            self.test_results,
            filepath,
            include_metadata=True,
            include_processing_info=False,
            compress=False
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Find track with special characters
        special_track = next(
            t for t in data["tracks"]
            if "émojis" in t.get("title", "")
        )
        
        self.assertIn("émojis", special_track["title"])
        self.assertIn("🎵", special_track["title"])
    
    def test_csv_export_basic(self):
        """Test basic CSV export"""
        result = write_csv_files(
            self.test_results,
            "test_csv",
            self.temp_dir,
            delimiter=",",
            include_metadata=False
        )
        
        self.assertIn("main", result)
        self.assertTrue(os.path.exists(result["main"]))
        
        # Verify CSV content
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        
        self.assertGreaterEqual(len(rows), 1)  # At least one track
        # Check that we can read the data
        if rows:
            self.assertIn("playlist_index", rows[0])
    
    def test_csv_export_custom_delimiter_comma(self):
        """Test CSV export with comma delimiter"""
        result = write_csv_files(
            self.test_results,
            "test_csv_comma",
            self.temp_dir,
            delimiter=",",
            include_metadata=True
        )
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            content = f.read()
        
        # Verify comma delimiter
        lines = content.split('\n')
        if lines[0]:
            self.assertGreater(len(lines[0].split(',')), 5)
    
    def test_csv_export_custom_delimiter_semicolon(self):
        """Test CSV export with semicolon delimiter"""
        result = write_csv_files(
            self.test_results,
            "test_csv_semicolon",
            self.temp_dir,
            delimiter=";",
            include_metadata=True
        )
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            content = f.read()
        
        # Verify semicolon delimiter
        lines = content.split('\n')
        if lines[0]:
            self.assertGreater(len(lines[0].split(';')), 5)
    
    def test_csv_export_custom_delimiter_tab(self):
        """Test CSV export with tab delimiter (TSV)"""
        result = write_csv_files(
            self.test_results,
            "test_csv_tab",
            self.temp_dir,
            delimiter="\t",
            include_metadata=True
        )
        
        self.assertTrue(result["main"].endswith(".tsv"))
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f, delimiter='\t')
            rows = list(reader)
        
        self.assertGreaterEqual(len(rows), 2)  # Header + tracks
    
    def test_csv_export_custom_delimiter_pipe(self):
        """Test CSV export with pipe delimiter"""
        result = write_csv_files(
            self.test_results,
            "test_csv_pipe",
            self.temp_dir,
            delimiter="|",
            include_metadata=True
        )
        
        self.assertTrue(result["main"].endswith(".psv"))
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f, delimiter='|')
            rows = list(reader)
        
        self.assertGreaterEqual(len(rows), 2)
    
    def test_csv_export_with_metadata(self):
        """Test CSV export with metadata columns"""
        result = write_csv_files(
            self.test_results,
            "test_csv_metadata",
            self.temp_dir,
            delimiter=",",
            include_metadata=True
        )
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            header = next(reader)
        
        # Check metadata columns are present
        self.assertIn("beatport_label", header)
        self.assertIn("beatport_genres", header)
        self.assertIn("beatport_release", header)
        self.assertIn("beatport_release_date", header)
    
    def test_csv_export_without_metadata(self):
        """Test CSV export without metadata columns"""
        result = write_csv_files(
            self.test_results,
            "test_csv_no_metadata",
            self.temp_dir,
            delimiter=",",
            include_metadata=False
        )
        
        with open(result["main"], 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            header = next(reader)
        
        # Check metadata columns are NOT present
        self.assertNotIn("beatport_label", header)
        self.assertNotIn("beatport_genres", header)
    
    def test_csv_export_candidates_file(self):
        """Test CSV export creates candidates file when candidates exist"""
        # Add candidates to test results
        self.test_results[0].candidates = [
            {"beatport_title": "Candidate 1", "match_score": 85.0},
            {"beatport_title": "Candidate 2", "match_score": 80.0}
        ]
        
        result = write_csv_files(
            self.test_results,
            "test_csv_candidates",
            self.temp_dir,
            delimiter=",",
            include_metadata=False
        )
        
        self.assertIn("candidates", result)
        self.assertIsNotNone(result["candidates"])
        self.assertTrue(os.path.exists(result["candidates"]))
    
    def test_export_error_handling_invalid_delimiter(self):
        """Test error handling for invalid delimiter"""
        with self.assertRaises(ValueError):
            write_csv_files(
                self.test_results,
                "test",
                self.temp_dir,
                delimiter="invalid",
                include_metadata=False
            )
    
    def test_export_empty_results(self):
        """Test export with empty results list"""
        filepath = os.path.join(self.temp_dir, "test_empty.json")
        filepath = write_json_file(
            [],
            filepath,
            include_metadata=False,
            include_processing_info=False,
            compress=False
        )
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 0)
        self.assertEqual(data["matched_tracks"], 0)
        self.assertEqual(len(data["tracks"]), 0)
    
    def test_export_large_dataset(self):
        """Test export with large dataset (performance test)"""
        import time
        
        # Create large dataset
        large_results = [
            TrackResult(
                playlist_index=i,
                title=f"Track {i}",
                artist=f"Artist {i % 10}",
                matched=(i % 2 == 0),
                beatport_title=f"Track {i}" if i % 2 == 0 else None,
                beatport_url=f"https://beatport.com/track/{i}" if i % 2 == 0 else None
            )
            for i in range(1000)
        ]
        
        start_time = time.time()
        filepath = os.path.join(self.temp_dir, "test_large.json.gz")
        filepath = write_json_file(
            large_results,
            filepath,
            include_metadata=True,
            include_processing_info=False,
            compress=True
        )
        export_time = time.time() - start_time
        
        # Export should complete in reasonable time (< 10 seconds for 1000 tracks)
        self.assertLess(export_time, 10.0)
        
        # Verify file was created and is readable
        self.assertTrue(os.path.exists(filepath))
        with gzip.open(filepath, 'rt', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertEqual(data["total_tracks"], 1000)


if __name__ == '__main__':
    unittest.main()

