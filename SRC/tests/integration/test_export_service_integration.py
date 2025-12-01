"""Integration tests for ExportService with real service instances."""

import json
import os
import tempfile
from pathlib import Path

import pytest

from cuepoint.models.result import TrackResult
from cuepoint.services.export_service import ExportService
from cuepoint.services.logging_service import LoggingService


class TestExportServiceIntegration:
    """Integration tests for ExportService using real service instances."""
    
    @pytest.fixture
    def real_logging_service(self):
        """Create a real logging service."""
        return LoggingService()
    
    @pytest.fixture
    def export_service(self, real_logging_service):
        """Create export service with real logging."""
        return ExportService(logging_service=real_logging_service)
    
    @pytest.fixture
    def sample_results(self):
        """Create sample track results for testing."""
        return [
            TrackResult(
                playlist_index=1,
                title="Test Track 1",
                artist="Test Artist",
                matched=True,
                beatport_url="https://www.beatport.com/track/test/123",
                match_score=95.5,
                confidence="high"
            ),
            TrackResult(
                playlist_index=2,
                title="Test Track 2",
                artist="Another Artist",
                matched=False
            )
        ]
    
    def test_export_to_csv_integration(self, export_service, sample_results):
        """Test CSV export with real service."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test_results.csv")
            
            # Export to CSV
            export_service.export_to_csv(sample_results, filepath)
            
            # CSV export creates multiple files with timestamps, check for any CSV files
            csv_files = list(Path(tmpdir).glob("*.csv"))
            assert len(csv_files) > 0, "At least one CSV file should be created"
            
            # Verify at least one file is not empty
            assert any(f.stat().st_size > 0 for f in csv_files), "At least one CSV file should not be empty"
    
    def test_export_to_json_integration(self, export_service, sample_results):
        """Test JSON export with real service."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test_results.json")
            
            # Export to JSON
            export_service.export_to_json(sample_results, filepath)
            
            # Verify file was created
            assert os.path.exists(filepath)
            
            # Verify JSON is valid
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                assert isinstance(data, list)
                assert len(data) == 2
    
    def test_export_to_excel_integration(self, export_service, sample_results):
        """Test Excel export with real service."""
        try:
            import openpyxl
        except ImportError:
            pytest.skip("openpyxl not available")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test_results.xlsx")
            
            # Export to Excel
            export_service.export_to_excel(sample_results, filepath)
            
            # Verify file was created
            assert os.path.exists(filepath)
            
            # Verify Excel file is valid
            wb = openpyxl.load_workbook(filepath)
            assert wb.active is not None
            assert wb.active.max_row >= 2  # Header + 2 data rows
    
    def test_export_to_csv_custom_delimiter(self, export_service, sample_results):
        """Test CSV export with custom delimiter."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test_results.csv")
            
            # Export with semicolon delimiter
            export_service.export_to_csv(sample_results, filepath, delimiter=";")
            
            # CSV export creates multiple files with timestamps, check for any CSV files
            csv_files = list(Path(tmpdir).glob("*.csv"))
            assert len(csv_files) > 0, "At least one CSV file should be created"
    
    def test_export_to_json_empty_results(self, export_service):
        """Test JSON export with empty results."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "empty_results.json")
            
            # Export empty list
            export_service.export_to_json([], filepath)
            
            # Verify file was created
            assert os.path.exists(filepath)
            
            # Verify JSON contains empty array
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                assert data == []
    
    def test_export_creates_directory(self, export_service, sample_results):
        """Test that export creates output directory if it doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create nested directory path
            nested_dir = os.path.join(tmpdir, "nested", "output")
            filepath = os.path.join(nested_dir, "test_results.json")
            
            # Export should create directories
            export_service.export_to_json(sample_results, filepath)
            
            # Verify directory and file were created
            assert os.path.exists(nested_dir)
            assert os.path.exists(filepath)
    
    def test_export_service_without_logging(self, sample_results):
        """Test export service without logging service."""
        service = ExportService()  # No logging service
        
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test_results.json")
            
            # Should work without logging
            service.export_to_json(sample_results, filepath)
            assert os.path.exists(filepath)

