#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Step 7 Observability and Supportability.

Design 7.17: Log redaction - no user paths in logs
Design 7.39: Log formatting, rotation, redaction
Design 7.60: Support bundle contains required files
Design 7.20: Structured log format with run_id, version, os
Design 7.52: Run ID propagation for diagnostics
"""

import json
import logging
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cuepoint.utils.logger import RunContextFilter
from cuepoint.utils.run_context import clear_run_id, get_current_run_id, set_run_id
from cuepoint.utils.support_bundle import SupportBundleGenerator


class TestRunContext:
    """Test run ID context (Design 7.52)."""

    def setup_method(self):
        clear_run_id()

    def teardown_method(self):
        clear_run_id()

    def test_set_and_get_run_id(self):
        rid = set_run_id("abc123")
        assert get_current_run_id() == "abc123"
        assert rid == "abc123"

    def test_auto_generate_run_id(self):
        rid = set_run_id()
        assert rid is not None
        assert len(rid) == 12
        assert get_current_run_id() == rid

    def test_clear_run_id(self):
        set_run_id("xyz")
        clear_run_id()
        assert get_current_run_id() is None


class TestSupportBundleRedaction:
    """Test support bundle redaction (Design 7.17, 7.29)."""

    def test_sanitize_log_content_redacts_home(self):
        home = str(Path.home())
        content = f"Processing file: {home}/Documents/test.xml"
        result = SupportBundleGenerator._sanitize_log_content(content)
        assert home not in result
        assert "~" in result

    def test_sanitize_log_content_redacts_windows_users(self):
        content = "Error at C:\\Users\\johndoe\\file.xml"
        result = SupportBundleGenerator._sanitize_log_content(content)
        # Design 7.17: No C:\Users\ in output
        assert "C:\\Users\\" not in result
        assert "~" in result

    def test_sanitize_log_content_redacts_unix_users(self):
        content = "Error at /Users/johndoe/file.xml"
        result = SupportBundleGenerator._sanitize_log_content(content)
        assert "/Users/" not in result or "~" in result


class TestSupportBundleContents:
    """Test support bundle contains required files (Design 7.60)."""

    @pytest.fixture
    def mock_paths(self, tmp_path):
        """Mock AppPaths for testing."""
        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        (logs_dir / "cuepoint.log").write_text("test log content")
        exports_dir = tmp_path / "exports"
        exports_dir.mkdir()

        with patch("cuepoint.utils.support_bundle.AppPaths") as mock_app:
            mock_app.logs_dir.return_value = logs_dir
            mock_app.exports_dir.return_value = exports_dir
            mock_app.config_file.return_value = tmp_path / "config.yaml"
            yield tmp_path, logs_dir, exports_dir

    def test_bundle_contains_diagnostics(self, mock_paths):
        tmp_path, _, exports_dir = mock_paths
        diag_data = {
            "version": "1.0",
            "os": "Windows 11",
            "run_id": "test123",
        }
        with patch(
            "cuepoint.utils.support_bundle.DiagnosticCollector.collect_all",
            return_value=diag_data,
        ):
            bundle_path = SupportBundleGenerator.generate_bundle(
                exports_dir,
                include_logs=False,
                include_config=False,
                sanitize=True,
            )
        with zipfile.ZipFile(bundle_path, "r") as zf:
            names = zf.namelist()
            assert "diagnostics.json" in names
            diag = json.loads(zf.read("diagnostics.json").decode("utf-8"))
            assert diag["version"] == "1.0"
            assert diag["os"] == "Windows 11"

    def test_bundle_contains_logs_when_requested(self, mock_paths):
        tmp_path, logs_dir, exports_dir = mock_paths
        with patch("cuepoint.utils.support_bundle.AppPaths") as mock_app:
            mock_app.logs_dir.return_value = logs_dir
            mock_app.exports_dir.return_value = exports_dir
            mock_app.config_file.return_value = tmp_path / "nonexistent.yaml"
            with patch(
                "cuepoint.utils.support_bundle.DiagnosticCollector.collect_all",
                return_value={"version": "1.0", "os": "Test"},
            ):
                bundle_path = SupportBundleGenerator.generate_bundle(
                    exports_dir,
                    include_logs=True,
                    include_config=False,
                    sanitize=True,
                )
        with zipfile.ZipFile(bundle_path, "r") as zf:
            names = zf.namelist()
            assert any("logs/" in n for n in names)
            assert "README.txt" in names

    def test_bundle_naming_includes_run_id(self, mock_paths):
        _, _, exports_dir = mock_paths
        set_run_id("myrun123")
        try:
            with patch(
                "cuepoint.utils.support_bundle.DiagnosticCollector.collect_all",
                return_value={"version": "1.0", "os": "Test"},
            ):
                bundle_path = SupportBundleGenerator.generate_bundle(
                    exports_dir,
                    include_logs=False,
                    include_config=False,
                    sanitize=True,
                    run_id="myrun123",
                )
            assert "myrun123" in bundle_path.name
        finally:
            clear_run_id()


class TestRunContextFilter:
    """Test RunContextFilter injects run_id, version, os (Design 7.20)."""

    def setup_method(self):
        clear_run_id()

    def teardown_method(self):
        clear_run_id()

    def test_filter_adds_run_id_version_os(self):
        """Filter adds run_id, version, os to log record."""
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test message",
            args=(),
            exc_info=None,
        )
        set_run_id("run123")
        f = RunContextFilter()
        assert f.filter(record) is True
        assert record.run_id == "run123"
        assert record.version != "unknown" or "1." in str(record.version)
        assert record.os != "unknown"

    def test_filter_uses_dash_when_no_run_id(self):
        """Filter uses '-' when run_id is not set."""
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )
        clear_run_id()
        f = RunContextFilter()
        f.filter(record)
        assert record.run_id == "-"

    def test_structured_log_format_includes_run_id_version_os(self):
        """Log output includes run_id, version, os (Design 7.20)."""
        import io

        set_run_id("testrun99")
        try:
            handler = logging.StreamHandler(io.StringIO())
            handler.setFormatter(
                logging.Formatter(
                    "%(message)s run_id=%(run_id)s version=%(version)s os=%(os)s"
                )
            )
            handler.addFilter(RunContextFilter())
            logger = logging.getLogger("test.step7")
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
            logger.info("run_started")
            output = handler.stream.getvalue()
            assert "run_id=testrun99" in output
            assert "version=" in output
            assert "os=" in output
        finally:
            logger.removeHandler(handler)
            clear_run_id()


class TestProcessorRunIdPropagation:
    """Test run_id is set in run_context when processing starts (Design 7.52)."""

    def setup_method(self):
        clear_run_id()

    def teardown_method(self):
        clear_run_id()

    def test_processor_calls_set_run_id_on_process_playlist(self):
        """When process_playlist runs, set_run_id is called with a valid run_id."""
        from cuepoint.models.playlist import Playlist
        from cuepoint.models.track import Track
        from cuepoint.services.processor_service import ProcessorService

        with patch("cuepoint.services.processor_service.set_run_id") as mock_set_run_id:
            with patch(
                "cuepoint.services.processor_service.parse_playlist_tree"
            ) as mock_parse:
                # parse_playlist_tree returns (tree_roots, playlists_by_path)
                mock_parse.return_value = (
                    [],
                    {
                        "Test": Playlist(
                            name="Test",
                            tracks=[Track(title="A", artist="B", track_id="1")],
                        )
                    },
                )
                with patch(
                    "cuepoint.services.processor_service.ProcessorService.run_preflight"
                ) as mock_preflight:
                    mock_preflight.return_value = MagicMock(
                        can_proceed=True,
                        warnings=[],
                        errors=[],
                        error_messages=lambda: [],
                        warning_messages=lambda: [],
                    )
                    with patch.object(
                        ProcessorService,
                        "process_track",
                        return_value=MagicMock(matched=True, playlist_index=1),
                    ):
                        processor = ProcessorService(
                            beatport_service=MagicMock(),
                            matcher_service=MagicMock(),
                            logging_service=MagicMock(),
                            config_service=MagicMock(),
                        )
                        with tempfile.NamedTemporaryFile(
                            mode="w", suffix=".xml", delete=False
                        ) as f:
                            f.write("<root/>")
                            xml_path = f.name
                        try:
                            processor.process_playlist_from_xml(
                                xml_path=xml_path,
                                playlist_name="Test",
                                output_dir=tempfile.gettempdir(),
                                base_filename="test",
                            )
                            mock_set_run_id.assert_called_once()
                            call_arg = mock_set_run_id.call_args[0][0]
                            assert len(call_arg) == 12
                            assert call_arg.isalnum()
                        finally:
                            Path(xml_path).unlink(missing_ok=True)
