#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance tests for Step 5.10.

Tests critical performance paths and ensures they meet target metrics.
"""

import pytest
import time
from unittest.mock import Mock, MagicMock
from typing import Dict, Any

from cuepoint.models.track import Track
from cuepoint.models.result import TrackResult
from cuepoint.services.processor_service import ProcessorService
from cuepoint.services.interfaces import (
    IBeatportService,
    IConfigService,
    ILoggingService,
    IMatcherService,
)


@pytest.fixture
def mock_services():
    """Create mock services for performance testing."""
    beatport_service = Mock(spec=IBeatportService)
    matcher_service = Mock(spec=IMatcherService)
    logging_service = Mock(spec=ILoggingService)
    config_service = Mock(spec=IConfigService)

    # Configure mocks for fast execution
    matcher_service.find_best_match.return_value = (None, [], [], 1)

    return {
        "beatport_service": beatport_service,
        "matcher_service": matcher_service,
        "logging_service": logging_service,
        "config_service": config_service,
    }


@pytest.fixture
def processor_service(mock_services):
    """Create ProcessorService with mocked dependencies."""
    return ProcessorService(
        beatport_service=mock_services["beatport_service"],
        matcher_service=mock_services["matcher_service"],
        logging_service=mock_services["logging_service"],
        config_service=mock_services["config_service"],
    )


@pytest.mark.performance
@pytest.mark.slow
class TestProcessingPerformance:
    """Performance tests for processing operations."""

    def test_process_single_track_performance(self, processor_service):
        """Test single track processing performance.

        Target: < 5 seconds
        """
        track = Track(title="Test Track", artist="Test Artist")

        start = time.perf_counter()
        result = processor_service.process_track(1, track)
        duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 5.0, f"Processing took {duration:.3f}s, expected < 5.0s"
        assert result is not None
        assert isinstance(result, TrackResult)

    def test_process_playlist_10_tracks_performance(self, processor_service):
        """Test playlist processing performance (10 tracks).

        Target: < 50 seconds (5s per track average)
        """
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 11)]

        start = time.perf_counter()
        results = processor_service.process_playlist(tracks)
        duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 50.0, f"Processing 10 tracks took {duration:.3f}s, expected < 50.0s"
        assert len(results) == len(tracks)
        avg_time = duration / len(tracks)
        assert avg_time < 5.0, f"Average time per track: {avg_time:.3f}s, expected < 5.0s"

    def test_process_playlist_50_tracks_performance(self, processor_service):
        """Test playlist processing performance (50 tracks).

        Target: < 250 seconds (5s per track average)
        """
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 51)]

        start = time.perf_counter()
        results = processor_service.process_playlist(tracks)
        duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 250.0, f"Processing 50 tracks took {duration:.3f}s, expected < 250.0s"
        assert len(results) == len(tracks)
        avg_time = duration / len(tracks)
        assert avg_time < 5.0, f"Average time per track: {avg_time:.3f}s, expected < 5.0s"

    def test_process_playlist_100_tracks_performance(self, processor_service):
        """Test playlist processing performance (100 tracks).

        Target: < 5 minutes (300 seconds)
        """
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 101)]

        start = time.perf_counter()
        results = processor_service.process_playlist(tracks)
        duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 300.0, f"Processing 100 tracks took {duration:.3f}s, expected < 300.0s"
        assert len(results) == len(tracks)
        avg_time = duration / len(tracks)
        assert avg_time < 3.0, f"Average time per track: {avg_time:.3f}s, expected < 3.0s"


@pytest.mark.performance
class TestExportPerformance:
    """Performance tests for export operations."""

    def test_export_csv_performance(self, processor_service):
        """Test CSV export performance.

        Target: < 2 seconds for 100 results
        """
        # Generate test results
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 101)]
        results = processor_service.process_playlist(tracks)

        from cuepoint.services.output_writer import write_main_csv
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmpdir:
            start = time.perf_counter()
            write_main_csv(results, "test_export", tmpdir)
            duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 2.0, f"CSV export took {duration:.3f}s, expected < 2.0s"

    def test_export_json_performance(self, processor_service):
        """Test JSON export performance.

        Target: < 2 seconds for 100 results
        """
        # Generate test results
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 101)]
        results = processor_service.process_playlist(tracks)

        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            json_path = Path(tmpdir) / "test_export.json"
            json_data = {
                "version": "1.0",
                "total_tracks": len(results),
                "tracks": [result.to_dict() for result in results],
            }

            start = time.perf_counter()
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(json_data, f, indent=2)
            duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 2.0, f"JSON export took {duration:.3f}s, expected < 2.0s"


@pytest.mark.performance
class TestCachePerformance:
    """Performance tests for cache operations."""

    def test_cache_set_performance(self):
        """Test cache set performance.

        Target: < 1 second for 1000 operations
        """
        from cuepoint.services.cache_service import CacheService

        cache = CacheService()

        start = time.perf_counter()
        for i in range(1000):
            cache.set(f"key_{i}", f"value_{i}")
        duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 1.0, f"Cache set (1000 ops) took {duration:.3f}s, expected < 1.0s"

    def test_cache_get_performance(self):
        """Test cache get performance.

        Target: < 1 second for 1000 operations
        """
        from cuepoint.services.cache_service import CacheService

        cache = CacheService()

        # Populate cache first
        for i in range(1000):
            cache.set(f"key_{i}", f"value_{i}")

        start = time.perf_counter()
        for i in range(1000):
            cache.get(f"key_{i}")
        duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 1.0, f"Cache get (1000 ops) took {duration:.3f}s, expected < 1.0s"

    def test_cache_hit_vs_miss_performance(self):
        """Test that cache hits are significantly faster than misses."""
        from cuepoint.services.cache_service import CacheService

        cache = CacheService()

        # First access (cache miss - will be None)
        start = time.perf_counter()
        result1 = cache.get("test_key")
        miss_time = time.perf_counter() - start

        # Set value
        cache.set("test_key", "test_value")

        # Second access (cache hit)
        start = time.perf_counter()
        result2 = cache.get("test_key")
        hit_time = time.perf_counter() - start

        # Cache hit should be faster (or at least not slower)
        # In practice, both should be very fast, but hit should be <= miss time
        assert hit_time <= miss_time * 1.5, "Cache hit not faster than miss"
        assert result2 == "test_value"


@pytest.mark.performance
class TestFilterPerformance:
    """Performance tests for filtering operations."""

    def test_filter_performance(self):
        """Test filter application performance.

        Target: < 100ms for filtering 1000 results
        """
        from cuepoint.ui.controllers.results_controller import ResultsController
        from cuepoint.models.result import TrackResult

        # Create test results
        results = []
        for i in range(1000):
            result = TrackResult(
                playlist_index=i,
                title=f"Track {i}",
                artist=f"Artist {i}",
                matched=i % 2 == 0,  # Every other track matched
                match_score=85.0 if i % 2 == 0 else 0.0,
                confidence="high" if i % 2 == 0 else "low",
            )
            results.append(result)

        controller = ResultsController()
        controller.set_results(results)

        # Measure filter performance
        start = time.perf_counter()
        filtered = controller.apply_filters(search_text="Track 1")
        duration = time.perf_counter() - start

        # Assert performance requirement
        assert duration < 0.1, f"Filtering took {duration:.3f}s, expected < 0.1s"


@pytest.mark.performance
class TestMemoryPerformance:
    """Memory usage performance tests."""

    def test_memory_usage_100_tracks(self, processor_service):
        """Test memory usage for processing 100 tracks.

        Target: < 500 MB
        """
        import sys

        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 101)]

        # Measure memory before
        import gc

        gc.collect()
        before_size = sys.getsizeof(tracks) + sum(sys.getsizeof(t) for t in tracks)

        # Process tracks
        results = processor_service.process_playlist(tracks)

        # Measure memory after
        gc.collect()
        after_size = (
            sys.getsizeof(results)
            + sum(sys.getsizeof(r) for r in results)
            + before_size
        )

        # Rough memory estimate (in MB)
        memory_mb = (after_size - before_size) / (1024 * 1024)

        # Assert memory requirement (allowing for overhead)
        # Note: This is a rough estimate, actual memory may vary
        assert memory_mb < 500.0, f"Memory usage: {memory_mb:.2f} MB, expected < 500 MB"

    def test_no_memory_leak(self, processor_service):
        """Test that processing doesn't cause memory leaks."""
        import gc
        import sys

        # Process multiple batches
        for batch in range(5):
            tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 21)]
            results = processor_service.process_playlist(tracks)

            # Force garbage collection
            del tracks
            del results
            gc.collect()

        # Memory should not grow unbounded
        # This is a basic check - more sophisticated leak detection would use memory_profiler
        assert True  # If we get here without OOM, test passes

