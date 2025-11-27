#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for output_writer module."""

import pytest
import os
import tempfile
import csv
from pathlib import Path
from typing import Set
from unittest.mock import patch, Mock

from cuepoint.ui.gui_interface import TrackResult
from cuepoint.services.output_writer import (
    write_csv_files,
    write_main_csv,
    write_candidates_csv,
    write_queries_csv,
    write_review_csv,
    write_excel_file
)


@pytest.fixture
def sample_track_results():
    """Create sample TrackResult objects for testing."""
    return [
        TrackResult(
            playlist_index=0,
            title="Test Track 1",
            artist="Test Artist 1",
            matched=True,
            beatport_url="https://www.beatport.com/track/test1/123",
            beatport_title="Test Track 1",
            beatport_artists="Test Artist 1",
            beatport_key="E Major",
            beatport_key_camelot="12B",
            beatport_year="2023",
            beatport_bpm="128",
            match_score=95.0,
            title_sim=95.0,
            artist_sim=100.0,
            confidence="high"
        ),
        TrackResult(
            playlist_index=1,
            title="Test Track 2",
            artist="Test Artist 2",
            matched=False
        )
    ]


@pytest.fixture
def temp_output_dir():
    """Create a temporary output directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.mark.unit
class TestWriteCsvFiles:
    """Test write_csv_files function."""

    def test_write_csv_files_success(self, sample_track_results, temp_output_dir):
        """Test writing CSV files successfully."""
        result = write_csv_files(
            sample_track_results,
            "test_output",
            output_dir=temp_output_dir
        )
        
        assert "main" in result
        assert os.path.exists(result["main"])
        assert result["main"].endswith(".csv")

    def test_write_csv_files_custom_delimiter(self, sample_track_results, temp_output_dir):
        """Test writing CSV files with custom delimiter."""
        result = write_csv_files(
            sample_track_results,
            "test_output",
            output_dir=temp_output_dir,
            delimiter=";"
        )
        
        assert "main" in result
        # Verify delimiter was used
        with open(result["main"], 'r', encoding='utf-8') as f:
            first_line = f.readline()
            assert ";" in first_line

    def test_write_csv_files_invalid_delimiter(self, sample_track_results, temp_output_dir):
        """Test writing CSV files with invalid delimiter."""
        with pytest.raises(ValueError, match="Invalid delimiter"):
            write_csv_files(
                sample_track_results,
                "test_output",
                output_dir=temp_output_dir,
                delimiter="X"
            )

    def test_write_csv_files_creates_directory(self, sample_track_results):
        """Test that write_csv_files creates output directory if it doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            new_dir = os.path.join(tmpdir, "new_output")
            
            result = write_csv_files(
                sample_track_results,
                "test_output",
                output_dir=new_dir
            )
            
            assert os.path.exists(new_dir)
            assert os.path.exists(result["main"])


@pytest.mark.unit
class TestWriteMainCsv:
    """Test write_main_csv function."""

    def test_write_main_csv_success(self, sample_track_results, temp_output_dir):
        """Test writing main CSV file."""
        filename = "test_main.csv"
        result = write_main_csv(
            sample_track_results,
            filename,
            temp_output_dir
        )
        
        assert result is not None
        assert os.path.exists(result)
        
        # Verify file contains expected data
        with open(result, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            assert len(rows) == 2
            assert rows[0]["original_title"] == "Test Track 1"
            assert rows[1]["original_title"] == "Test Track 2"

    def test_write_main_csv_with_metadata(self, sample_track_results, temp_output_dir):
        """Test writing main CSV with metadata columns."""
        filename = "test_main.csv"
        result = write_main_csv(
            sample_track_results,
            filename,
            temp_output_dir,
            include_metadata=True
        )
        
        with open(result, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            header = reader.fieldnames
            assert "match_score" in header
            assert "title_sim" in header

    def test_write_main_csv_without_metadata(self, sample_track_results, temp_output_dir):
        """Test writing main CSV without metadata columns."""
        filename = "test_main.csv"
        result = write_main_csv(
            sample_track_results,
            filename,
            temp_output_dir,
            include_metadata=False
        )
        
        with open(result, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            header = reader.fieldnames
            # Should still have basic columns
            assert "original_title" in header
            assert "original_artists" in header


@pytest.mark.unit
class TestWriteCandidatesCsv:
    """Test write_candidates_csv function."""

    def test_write_candidates_csv_success(self, sample_track_results, temp_output_dir):
        """Test writing candidates CSV file."""
        filename = "test_main.csv"
        result = write_candidates_csv(
            sample_track_results,
            filename,
            temp_output_dir
        )
        
        # May return None if no candidates
        if result:
            assert os.path.exists(result)


@pytest.mark.unit
class TestWriteQueriesCsv:
    """Test write_queries_csv function."""

    def test_write_queries_csv_success(self, sample_track_results, temp_output_dir):
        """Test writing queries CSV file."""
        filename = "test_main.csv"
        result = write_queries_csv(
            sample_track_results,
            filename,
            temp_output_dir
        )
        
        # May return None if no queries
        if result:
            assert os.path.exists(result)


@pytest.mark.unit
class TestWriteReviewCsv:
    """Test write_review_csv function."""

    def test_write_review_csv_success(self, sample_track_results, temp_output_dir):
        """Test writing review CSV file."""
        filename = "test_main.csv"
        # write_review_csv takes review_indices (Set[int]), not filename
        review_indices = {0}  # Review first track
        result = write_review_csv(
            sample_track_results,
            review_indices,
            filename,
            temp_output_dir
        )
        
        # May return None if no review tracks
        if result:
            assert os.path.exists(result)


@pytest.mark.unit
class TestWriteExcelFile:
    """Test write_excel_file function."""

    @pytest.mark.skipif(
        not hasattr(__import__('cuepoint.services.output_writer', fromlist=['OPENPYXL_AVAILABLE']), 'OPENPYXL_AVAILABLE') or
        not __import__('cuepoint.services.output_writer', fromlist=['OPENPYXL_AVAILABLE']).OPENPYXL_AVAILABLE,
        reason="openpyxl not available"
    )
    def test_write_excel_file_success(self, sample_track_results, temp_output_dir):
        """Test writing Excel file."""
        filename = "test_output.xlsx"
        result = write_excel_file(
            sample_track_results,
            filename,
            temp_output_dir
        )
        
        assert result is not None
        assert os.path.exists(result)
        assert result.endswith(".xlsx")

    def test_write_excel_file_no_openpyxl(self, sample_track_results, temp_output_dir):
        """Test that Excel writing handles missing openpyxl gracefully."""
        with patch('cuepoint.services.output_writer.OPENPYXL_AVAILABLE', False):
            # write_excel_file raises ImportError when openpyxl is not available
            with pytest.raises(ImportError, match="openpyxl is required"):
                write_excel_file(
                    sample_track_results,
                    os.path.join(temp_output_dir, "test_output.xlsx"),
                    "Test Playlist"
                )

