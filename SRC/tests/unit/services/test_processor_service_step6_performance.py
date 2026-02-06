"""Unit tests for Step 6 Performance and Scalability (processor integration)."""

from unittest.mock import Mock, patch

import pytest

from cuepoint.services.processor_service import (
    ProcessorService,
    _guardrail_progress_callback,
    _throttled_progress_callback,
)
from cuepoint.ui.gui_interface import ProcessingController, ProgressInfo


class TestThrottledProgressCallback:
    """Test progress throttling (Design 6.25)."""

    def test_throttle_forwards_on_completion(self):
        """Last update (completion) always forwarded."""
        calls = []
        def cb(info):
            calls.append(info)
        wrapped = _throttled_progress_callback(cb, throttle_ms=9999, eta_every_n=1)
        info = ProgressInfo(
            completed_tracks=10,
            total_tracks=10,
            matched_count=5,
            unmatched_count=5,
        )
        wrapped(info)
        assert len(calls) == 1
        assert calls[0].completed_tracks == 10

    def test_eta_computed(self):
        """ETA computed when enough tracks completed."""
        calls = []
        def cb(info):
            calls.append(info)
        wrapped = _throttled_progress_callback(cb, throttle_ms=0, eta_every_n=5)
        info = ProgressInfo(
            completed_tracks=5,
            total_tracks=10,
            matched_count=2,
            unmatched_count=3,
            elapsed_time=10.0,
        )
        wrapped(info)
        assert len(calls) == 1
        assert calls[0].eta_seconds == 10.0  # 10s/5 * 5 remaining = 10


class TestGuardrailProgressCallback:
    """Test performance guardrails (Design 6.35, 6.167)."""

    def test_guardrail_forwards_normally(self):
        """Guardrail forwards when within limits."""
        calls = []
        def cb(info):
            calls.append(info)
        controller = ProcessingController()
        logging = Mock()
        wrapped = _guardrail_progress_callback(
            cb, controller, runtime_max_sec=3600, memory_max_mb=0, logging_service=logging
        )
        info = ProgressInfo(
            completed_tracks=5,
            total_tracks=10,
            matched_count=2,
            unmatched_count=3,
            elapsed_time=100.0,
        )
        wrapped(info)
        assert len(calls) == 1
        assert not controller.is_cancelled()

    def test_guardrail_cancels_on_runtime_exceeded(self):
        """Guardrail cancels when runtime exceeded."""
        calls = []
        def cb(info):
            calls.append(info)
        controller = ProcessingController()
        logging = Mock()
        wrapped = _guardrail_progress_callback(
            cb, controller, runtime_max_sec=10, memory_max_mb=0, logging_service=logging
        )
        info = ProgressInfo(
            completed_tracks=5,
            total_tracks=10,
            matched_count=2,
            unmatched_count=3,
            elapsed_time=15.0,
        )
        wrapped(info)
        assert len(calls) == 1
        assert controller.is_cancelled()
        logging.warning.assert_called()
        assert "P001" in str(logging.warning.call_args)


class TestProcessorPerformanceCollector:
    """Test performance collector integration (Design 6.74)."""

    @pytest.fixture
    def minimal_xml(self, tmp_path):
        """Create minimal benchmark XML."""
        xml = tmp_path / "bench.xml"
        xml.write_text('''<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <PRODUCT Name="rekordbox" Version="6.7.0"/>
    <COLLECTION>
        <TRACK TrackID="1" Name="Track 1" Artist="Artist 1" BPM="120" Key="Am" Genre="House" Year="2024"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test" Type="1">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>
''')
        return xml

    def test_process_playlist_from_xml_with_collector(self, minimal_xml):
        """Processor populates performance collector when provided."""
        from cuepoint.utils.run_performance_collector import RunPerformanceCollector

        mock_beatport = Mock()
        mock_beatport.search_tracks.return_value = []
        mock_beatport.fetch_track_details.return_value = None
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        mock_logging = Mock()
        mock_config = Mock()
        mock_config.get.side_effect = lambda k, d=None: {
            "product.preflight_network_check": False,
            "product.preflight_enabled": False,
        }.get(k, d)

        service = ProcessorService(
            beatport_service=mock_beatport,
            matcher_service=mock_matcher,
            logging_service=mock_logging,
            config_service=mock_config,
        )
        collector = RunPerformanceCollector()

        with patch("cuepoint.services.processor_service.NetworkState") as mock_net:
            mock_net.is_online.return_value = True
            results = service.process_playlist_from_xml(
                str(minimal_xml),
                "Test",
                performance_collector=collector,
            )

        assert len(results) == 1
        report = collector.get_report()
        assert report.tracks_processed == 1
        assert "parse_xml" in report.stages
        assert "search_candidates" in report.stages
        assert report.run_id
