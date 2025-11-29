#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for ExportController
"""

import pytest
import os
from cuepoint.ui.controllers.export_controller import ExportController
from cuepoint.models.result import TrackResult


@pytest.fixture
def controller():
    """Create an ExportController instance"""
    return ExportController()


@pytest.fixture
def sample_results():
    """Create sample TrackResult objects for testing"""
    return [
        TrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True
        )
    ]


def test_validate_export_options_valid(controller):
    """Test validation of valid export options"""
    options = {
        "format": "csv",
        "file_path": "/tmp/test.csv",
        "delimiter": ","
    }
    is_valid, error = controller.validate_export_options(options)
    assert is_valid is True
    assert error is None


def test_validate_export_options_no_file(controller):
    """Test validation with no file path"""
    options = {
        "format": "csv"
    }
    is_valid, error = controller.validate_export_options(options)
    assert is_valid is False
    assert error is not None


def test_validate_export_options_invalid_format(controller):
    """Test validation with invalid format"""
    options = {
        "format": "invalid",
        "file_path": "/tmp/test.invalid"
    }
    is_valid, error = controller.validate_export_options(options)
    assert is_valid is False
    assert error is not None


def test_validate_export_options_invalid_delimiter(controller):
    """Test validation with invalid delimiter"""
    options = {
        "format": "csv",
        "file_path": "/tmp/test.csv",
        "delimiter": "invalid"
    }
    is_valid, error = controller.validate_export_options(options)
    assert is_valid is False
    assert error is not None


def test_prepare_results_for_export_all(controller, sample_results):
    """Test preparing all results for export"""
    filtered = sample_results[:1]  # Only first result
    results = controller.prepare_results_for_export(
        all_results=sample_results,
        filtered_results=filtered,
        export_filtered=False
    )
    assert len(results) == len(sample_results)


def test_prepare_results_for_export_filtered(controller, sample_results):
    """Test preparing filtered results for export"""
    filtered = sample_results[:1]  # Only first result
    results = controller.prepare_results_for_export(
        all_results=sample_results,
        filtered_results=filtered,
        export_filtered=True
    )
    assert len(results) == 1


def test_get_export_file_extension_csv(controller):
    """Test getting CSV file extension"""
    options = {"delimiter": ","}
    ext = controller.get_export_file_extension("csv", options)
    assert ext == ".csv"


def test_get_export_file_extension_tsv(controller):
    """Test getting TSV file extension"""
    options = {"delimiter": "\t"}
    ext = controller.get_export_file_extension("csv", options)
    assert ext == ".tsv"


def test_get_export_file_extension_json(controller):
    """Test getting JSON file extension"""
    options = {}
    ext = controller.get_export_file_extension("json", options)
    assert ext == ".json"


def test_get_export_file_extension_json_compressed(controller):
    """Test getting compressed JSON file extension"""
    options = {"compress": True}
    ext = controller.get_export_file_extension("json", options)
    assert ext == ".json.gz"


def test_get_export_file_extension_excel(controller):
    """Test getting Excel file extension"""
    options = {}
    ext = controller.get_export_file_extension("excel", options)
    assert ext == ".xlsx"


def test_sanitize_filename(controller):
    """Test filename sanitization"""
    assert controller.sanitize_filename("test/file<name>.csv") == "testfilename.csv"
    assert controller.sanitize_filename("  test  ") == "test"
    assert controller.sanitize_filename("") == "export"


def test_prepare_export_data(controller, sample_results):
    """Test preparing export data"""
    options = {
        "format": "csv",
        "file_path": "/tmp/test.csv",
        "playlist_name": "Test Playlist",
        "include_metadata": True,
        "delimiter": ","
    }
    data = controller.prepare_export_data(sample_results, options)
    
    assert data["results"] == sample_results
    assert data["format"] == "csv"
    assert data["file_path"] == "/tmp/test.csv"
    assert data["playlist_name"] == "Test Playlist"


def test_get_default_output_directory(controller):
    """Test getting default output directory"""
    output_dir = controller.get_default_output_directory()
    assert os.path.isabs(output_dir)
    assert "output" in output_dir


def test_generate_default_filename(controller):
    """Test generating default filename"""
    filename = controller.generate_default_filename(
        playlist_name="Test Playlist",
        format_type="csv",
        options={"delimiter": ","}
    )
    assert filename.endswith(".csv")
    assert "Test Playlist" in filename or "TestPlaylist" in filename or "Test_Playlist" in filename

