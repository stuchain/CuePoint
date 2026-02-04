#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Telemetry Service (Step 14).
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cuepoint.services.telemetry_service import TelemetryService, _scrub_properties


class TestScrubProperties:
    """Tests for PII scrubbing."""

    def test_scrub_removes_file_path(self):
        props = {"file_path": "/home/user/collection.xml"}
        assert _scrub_properties(props) == {}

    def test_scrub_removes_playlist_name(self):
        props = {"playlist_name": "My Secret Playlist"}
        assert _scrub_properties(props) == {}

    def test_scrub_removes_query(self):
        props = {"query": "artist - track title"}
        assert _scrub_properties(props) == {}

    def test_scrub_keeps_safe_properties(self):
        props = {
            "duration_ms": 120000,
            "tracks": 500,
            "match_rate": 0.86,
            "run_id": "abc123",
        }
        assert _scrub_properties(props) == props

    def test_scrub_removes_nested_objects(self):
        props = {"data": {"nested": "value"}}
        assert _scrub_properties(props) == {}

    def test_scrub_removes_arrays(self):
        props = {"items": [1, 2, 3]}
        assert _scrub_properties(props) == {}

    def test_scrub_empty_dict(self):
        assert _scrub_properties({}) == {}
        assert _scrub_properties(None) == {}


class TestTelemetryServiceOptIn:
    """Tests for opt-in gating."""

    def test_track_no_op_when_disabled(self):
        config = MagicMock()
        config.get.return_value = False
        svc = TelemetryService(config, data_dir=Path(tempfile.mkdtemp()))
        svc.track("app_start", {"channel": "test"})
        assert not (svc._data_dir / "events.jsonl").exists()

    def test_track_persists_when_enabled(self):
        config = MagicMock()
        def _get(k, d=None):
            if k == "telemetry.enabled": return True
            if k == "telemetry.sample_rate": return 1.0
            if k == "telemetry.endpoint": return None
            return d
        config.get.side_effect = _get
        with tempfile.TemporaryDirectory() as tmp:
            svc = TelemetryService(config, data_dir=Path(tmp))
            svc.track("app_start", {"channel": "test"})
            path = Path(tmp) / "events.jsonl"
            assert path.exists()
            lines = path.read_text(encoding="utf-8").strip().split("\n")
            assert len(lines) == 1
            ev = json.loads(lines[0])
            assert ev["event"] == "app_start"
            assert ev["properties"]["channel"] == "test"
            assert "event_id" in ev
            assert "timestamp" in ev
            assert "version" in ev
            assert "os" in ev


class TestTelemetryServiceDeleteLocalData:
    """Tests for delete on opt-out."""

    def test_delete_local_data_removes_file(self):
        config = MagicMock()
        def _get(k, d=None):
            if k == "telemetry.enabled": return True
            if k == "telemetry.sample_rate": return 1.0
            if k == "telemetry.endpoint": return None  # No endpoint -> persist to file
            return d
        config.get.side_effect = _get
        with tempfile.TemporaryDirectory() as tmp:
            svc = TelemetryService(config, data_dir=Path(tmp))
            svc.track("app_start", {})
            path = Path(tmp) / "events.jsonl"
            assert path.exists()
            svc.delete_local_data()
            assert not path.exists()


class TestTelemetryServiceFlush:
    """Tests for flush."""

    def test_flush_clears_queue(self):
        config = MagicMock()
        def _get(k, d=None):
            if k == "telemetry.enabled": return True
            if k == "telemetry.sample_rate": return 1.0
            if k == "telemetry.endpoint": return "https://example.com/events"
            return d
        config.get.side_effect = _get
        with tempfile.TemporaryDirectory() as tmp:
            svc = TelemetryService(config, data_dir=Path(tmp))
            with patch("urllib.request.urlopen", side_effect=Exception("network error")):
                svc.track("run_complete", {"duration_ms": 100})
            assert len(svc._queue) > 0
            with patch("urllib.request.urlopen", side_effect=Exception("network error")):
                svc.flush()
            assert len(svc._queue) == 0


class TestTelemetryServiceEventSchema:
    """Tests for event schema."""

    def test_event_has_required_fields(self):
        config = MagicMock()
        def _get(k, d=None):
            if k == "telemetry.enabled": return True
            if k == "telemetry.sample_rate": return 1.0
            if k == "telemetry.endpoint": return None
            return d
        config.get.side_effect = _get
        with tempfile.TemporaryDirectory() as tmp:
            svc = TelemetryService(config, data_dir=Path(tmp))
            svc.track("run_complete", {"duration_ms": 5000, "match_rate": 0.9})
            path = Path(tmp) / "events.jsonl"
            ev = json.loads(path.read_text(encoding="utf-8").strip())
            assert ev["event"] == "run_complete"
            assert "event_id" in ev
            assert "timestamp" in ev
            assert "schema_version" in ev
            assert "version" in ev
            assert "os" in ev
            assert "session_id" in ev
            assert ev["properties"]["duration_ms"] == 5000
            assert ev["properties"]["match_rate"] == 0.9
