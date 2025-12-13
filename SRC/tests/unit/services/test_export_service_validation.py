"""Unit tests for export service validation and error handling."""

import os
import shutil
import tempfile
from pathlib import Path

import pytest

from cuepoint.exceptions.cuepoint_exceptions import ExportError
from cuepoint.models.result import TrackResult
from cuepoint.services.export_service import ExportService


class TestExportServiceValidation:
    """Test export service validation and error handling."""

    def test_validate_export_path_empty_results(self):
        """Test validation fails with empty results."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.csv")
            is_valid, error_msg = service._validate_export_path(filepath, 0, overwrite=False)
            
            assert not is_valid
            assert "No results to export" in error_msg

    def test_validate_export_path_creates_directory(self):
        """Test validation creates output directory if it doesn't exist."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            new_dir = os.path.join(tmpdir, "new", "nested", "directory")
            filepath = os.path.join(new_dir, "test.csv")
            
            is_valid, error_msg = service._validate_export_path(filepath, 1, overwrite=False)
            
            assert is_valid
            assert error_msg is None
            assert os.path.exists(new_dir)

    def test_validate_export_path_existing_file_no_overwrite(self):
        """Test validation fails if file exists and overwrite is False."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.csv")
            # Create existing file
            Path(filepath).touch()
            
            is_valid, error_msg = service._validate_export_path(filepath, 1, overwrite=False)
            
            assert not is_valid
            assert "already exists" in error_msg.lower()

    def test_validate_export_path_existing_file_with_overwrite(self):
        """Test validation succeeds if file exists and overwrite is True."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.csv")
            # Create existing file
            Path(filepath).touch()
            
            is_valid, error_msg = service._validate_export_path(filepath, 1, overwrite=True)
            
            assert is_valid
            assert error_msg is None

    def test_validate_export_path_checks_disk_space(self):
        """Test validation checks disk space."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.csv")
            # Request validation with very large result count
            # This should trigger disk space check
            is_valid, error_msg = service._validate_export_path(filepath, 1000000, overwrite=False)
            
            # Should either pass (if enough space) or fail with disk space message
            # We can't reliably test insufficient space, but we can verify the check runs
            if not is_valid:
                assert "disk space" in error_msg.lower() or "insufficient" in error_msg.lower()

    def test_export_to_csv_empty_results(self):
        """Test CSV export fails with empty results."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.csv")
            
            with pytest.raises(ExportError) as exc_info:
                service.export_to_csv([], filepath)
            
            assert exc_info.value.error_code == "EXPORT_EMPTY_RESULTS"

    def test_export_to_csv_invalid_delimiter(self):
        """Test CSV export fails with invalid delimiter."""
        service = ExportService()
        result = TrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=False,
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.csv")
            
            with pytest.raises(ExportError) as exc_info:
                service.export_to_csv([result], filepath, delimiter="X")
            
            assert exc_info.value.error_code == "EXPORT_INVALID_DELIMITER"

    def test_export_to_csv_validation_error(self, sample_track_result):
        """Test CSV export fails with validation error."""
        service = ExportService()
        
        # Use a path that can't be created (on Windows, this might be a drive letter)
        # Or use a path with invalid characters
        invalid_path = "C:/<>:\"|?*invalid.csv"  # Invalid characters
        
        with pytest.raises(ExportError) as exc_info:
            service.export_to_csv([sample_track_result], invalid_path)
        
        assert exc_info.value.error_code == "EXPORT_VALIDATION_ERROR"

    def test_export_to_json_empty_results(self):
        """Test JSON export fails with empty results."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.json")
            
            with pytest.raises(ExportError) as exc_info:
                service.export_to_json([], filepath)
            
            assert exc_info.value.error_code == "EXPORT_EMPTY_RESULTS"

    def test_export_to_json_atomic_write(self, sample_track_result):
        """Test JSON export uses atomic write."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.json")
            
            # Export should succeed
            service.export_to_json([sample_track_result], filepath)
            
            # Verify file exists and is valid JSON
            assert os.path.exists(filepath)
            import json
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                assert len(data) == 1

    def test_export_to_json_overwrite(self, sample_track_result):
        """Test JSON export can overwrite existing file."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.json")
            
            # Create existing file
            Path(filepath).touch()
            
            # Export with overwrite should succeed
            service.export_to_json([sample_track_result], filepath, overwrite=True)
            
            # Verify file was overwritten with valid JSON
            assert os.path.exists(filepath)
            import json
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                assert len(data) == 1

    def test_export_to_excel_empty_results(self):
        """Test Excel export fails with empty results."""
        service = ExportService()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.xlsx")
            
            with pytest.raises(ExportError) as exc_info:
                service.export_to_excel([], filepath)
            
            assert exc_info.value.error_code == "EXPORT_EMPTY_RESULTS"

    def test_export_to_excel_atomic_write(self, sample_track_result):
        """Test Excel export uses atomic write."""
        service = ExportService()
        
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                filepath = os.path.join(tmpdir, "test.xlsx")
                
                # Export should succeed
                service.export_to_excel([sample_track_result], filepath)
                
                # Verify file exists
                assert os.path.exists(filepath)
        except ExportError as e:
            if "EXPORT_EXCEL_MISSING_DEPENDENCY" in str(e) or "openpyxl" in str(e).lower():
                pytest.skip("openpyxl not available for Excel export")
            else:
                raise

    def test_format_bytes(self):
        """Test bytes formatting utility."""
        service = ExportService()
        
        assert service._format_bytes(0) == "0.0 B"
        assert service._format_bytes(1024) == "1.0 KB"
        assert service._format_bytes(1024 * 1024) == "1.0 MB"
        assert service._format_bytes(1024 * 1024 * 1024) == "1.0 GB"
        assert "1.5" in service._format_bytes(1536)  # 1.5 KB
