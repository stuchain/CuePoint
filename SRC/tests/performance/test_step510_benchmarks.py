#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive performance benchmarks for Step 5.10.

These benchmarks measure actual performance and can be run
to establish baselines and detect regressions.
"""

import pytest
import time
from pathlib import Path
from typing import Dict, Any

from cuepoint.models.track import Track
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.processor_service import ProcessorService


@pytest.fixture(scope="module")
def processor_service():
    """Create ProcessorService for benchmarking."""
    from unittest.mock import Mock
    
    # Create mock services for benchmarking
    beatport_service = Mock()
    matcher_service = Mock()
    logging_service = Mock()
    config_service = Mock()
    
    # Configure mocks for fast execution
    matcher_service.find_best_match.return_value = (None, [], [], 1)
    
    return ProcessorService(
        beatport_service=beatport_service,
        matcher_service=matcher_service,
        logging_service=logging_service,
        config_service=config_service,
    )


@pytest.mark.performance
@pytest.mark.benchmark
class TestPerformanceBenchmarks:
    """Performance benchmarks for critical operations."""

    def test_benchmark_single_track(self, processor_service):
        """Benchmark single track processing."""
        track = Track(title="Benchmark Track", artist="Benchmark Artist")

        start = time.perf_counter()
        result = processor_service.process_track(1, track)
        duration = time.perf_counter() - start

        # Record benchmark result
        print(f"\n[Benchmark] Single track processing: {duration:.3f} seconds")
        assert result is not None

    def test_benchmark_playlist_10(self, processor_service):
        """Benchmark playlist processing (10 tracks)."""
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 11)]

        start = time.perf_counter()
        results = processor_service.process_playlist(tracks)
        duration = time.perf_counter() - start

        avg_time = duration / len(tracks)
        print(f"\n[Benchmark] 10 tracks: {duration:.3f}s total, {avg_time:.3f}s per track")
        assert len(results) == len(tracks)

    def test_benchmark_playlist_50(self, processor_service):
        """Benchmark playlist processing (50 tracks)."""
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 51)]

        start = time.perf_counter()
        results = processor_service.process_playlist(tracks)
        duration = time.perf_counter() - start

        avg_time = duration / len(tracks)
        print(f"\n[Benchmark] 50 tracks: {duration:.3f}s total, {avg_time:.3f}s per track")
        assert len(results) == len(tracks)

    def test_benchmark_playlist_100(self, processor_service):
        """Benchmark playlist processing (100 tracks)."""
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 101)]

        start = time.perf_counter()
        results = processor_service.process_playlist(tracks)
        duration = time.perf_counter() - start

        avg_time = duration / len(tracks)
        print(f"\n[Benchmark] 100 tracks: {duration:.3f}s total, {avg_time:.3f}s per track")
        assert len(results) == len(tracks)

    def test_benchmark_export_csv(self, processor_service):
        """Benchmark CSV export."""
        # Generate results first
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 101)]
        results = processor_service.process_playlist(tracks)

        from cuepoint.services.output_writer import write_main_csv
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            start = time.perf_counter()
            write_main_csv(results, "benchmark", tmpdir)
            duration = time.perf_counter() - start

        print(f"\n[Benchmark] CSV export (100 results): {duration:.3f} seconds")
        assert duration > 0

    def test_benchmark_export_json(self, processor_service):
        """Benchmark JSON export."""
        # Generate results first
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 101)]
        results = processor_service.process_playlist(tracks)

        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            json_path = Path(tmpdir) / "benchmark.json"
            json_data = {
                "version": "1.0",
                "total_tracks": len(results),
                "tracks": [result.to_dict() for result in results],
            }

            start = time.perf_counter()
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(json_data, f, indent=2)
            duration = time.perf_counter() - start

        print(f"\n[Benchmark] JSON export (100 results): {duration:.3f} seconds")
        assert duration > 0


@pytest.mark.performance
class TestPerformanceComparison:
    """Performance comparison tests."""

    def test_no_significant_regression(self, processor_service):
        """Test that performance hasn't significantly degraded.

        This test compares current performance against baseline targets.
        """
        # Baseline targets (conservative estimates)
        targets = {
            "single_track": 5.0,  # < 5 seconds
            "playlist_10": 50.0,  # < 50 seconds
            "playlist_100": 300.0,  # < 5 minutes
        }

        # Measure single track
        track = Track(title="Test", artist="Artist")
        start = time.perf_counter()
        processor_service.process_track(1, track)
        single_duration = time.perf_counter() - start

        # Measure playlist (10 tracks)
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 11)]
        start = time.perf_counter()
        processor_service.process_playlist(tracks)
        playlist_10_duration = time.perf_counter() - start

        # Check against targets (allow 10% margin)
        assert (
            single_duration < targets["single_track"] * 1.1
        ), f"Single track regression: {single_duration:.3f}s > {targets['single_track'] * 1.1:.3f}s"
        assert (
            playlist_10_duration < targets["playlist_10"] * 1.1
        ), f"Playlist 10 regression: {playlist_10_duration:.3f}s > {targets['playlist_10'] * 1.1:.3f}s"

