"""Unit tests for support bundle generator utility."""

import tempfile
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cuepoint.utils.support_bundle import SupportBundleGenerator


class TestSupportBundleGenerator:
    """Test support bundle generator utility."""

    @pytest.fixture
    def temp_output_dir(self, tmp_path):
        """Create temporary output directory."""
        return tmp_path / "output"

    @patch("cuepoint.utils.support_bundle.DiagnosticCollector")
    @patch("cuepoint.utils.support_bundle.AppPaths")
    def test_generate_bundle(self, mock_paths, mock_diagnostics, temp_output_dir):
        """Test generating support bundle."""
        temp_output_dir.mkdir()

        # Mock dependencies
        mock_diagnostics.collect_all.return_value = {
            "timestamp": "2024-01-01",
            "application": {"version": "1.0.0"},
        }
        mock_log_dir = MagicMock()
        mock_log_dir.glob.return_value = []
        mock_paths.logs_dir.return_value = mock_log_dir
        mock_paths.config_file.return_value.exists.return_value = False

        bundle_path = SupportBundleGenerator.generate_bundle(temp_output_dir)

        assert bundle_path.exists()
        assert bundle_path.suffix == ".zip"
        assert "cuepoint-support" in bundle_path.name

    @patch("cuepoint.utils.support_bundle.DiagnosticCollector")
    @patch("cuepoint.utils.support_bundle.AppPaths")
    def test_bundle_contains_diagnostics(self, mock_paths, mock_diagnostics, temp_output_dir):
        """Test that bundle contains diagnostics JSON."""
        temp_output_dir.mkdir()

        mock_diagnostics.collect_all.return_value = {
            "timestamp": "2024-01-01",
            "application": {"version": "1.0.0"},
        }
        mock_log_dir = MagicMock()
        mock_log_dir.glob.return_value = []
        mock_paths.logs_dir.return_value = mock_log_dir
        mock_paths.config_file.return_value.exists.return_value = False

        bundle_path = SupportBundleGenerator.generate_bundle(temp_output_dir)

        # Check bundle contents
        with zipfile.ZipFile(bundle_path, "r") as zipf:
            names = zipf.namelist()
            assert "diagnostics.json" in names
            assert "README.txt" in names

    @patch("cuepoint.utils.support_bundle.DiagnosticCollector")
    @patch("cuepoint.utils.support_bundle.AppPaths")
    def test_bundle_contains_logs(self, mock_paths, mock_diagnostics, temp_output_dir):
        """Test that bundle contains log files."""
        temp_output_dir.mkdir()

        # Create a real temporary log file for testing
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as tmp_log:
            tmp_log.write("Test log content")
            tmp_log_path = Path(tmp_log.name)

        try:
            # Create mock log directory with real log file
            mock_log_dir = MagicMock()
            mock_log_dir.glob.return_value = [tmp_log_path]
            mock_paths.logs_dir.return_value = mock_log_dir
            mock_paths.config_file.return_value.exists.return_value = False

            mock_diagnostics.collect_all.return_value = {
                "timestamp": "2024-01-01",
                "application": {"version": "1.0.0"},
            }

            bundle_path = SupportBundleGenerator.generate_bundle(temp_output_dir)

            # Check bundle contains logs directory
            with zipfile.ZipFile(bundle_path, "r") as zipf:
                names = zipf.namelist()
                assert any("logs/" in name for name in names)
        finally:
            # Cleanup
            if tmp_log_path.exists():
                tmp_log_path.unlink()

    @patch("cuepoint.utils.support_bundle.DiagnosticCollector")
    @patch("cuepoint.utils.support_bundle.AppPaths")
    def test_bundle_handles_errors_gracefully(self, mock_paths, mock_diagnostics, temp_output_dir):
        """Test that bundle generation handles errors gracefully."""
        temp_output_dir.mkdir()

        # Make diagnostics raise an error
        mock_diagnostics.collect_all.side_effect = Exception("Test error")

        with pytest.raises(Exception):
            SupportBundleGenerator.generate_bundle(temp_output_dir)
