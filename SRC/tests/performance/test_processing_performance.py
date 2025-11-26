"""Performance tests for processing."""

import pytest
import time
from unittest.mock import Mock, patch
from cuepoint.services.processor_service import ProcessorService
from cuepoint.data.rekordbox import RBTrack


@pytest.mark.performance
@pytest.mark.slow
class TestProcessingPerformance:
    """Performance tests for processing."""
    
    def test_process_large_playlist_performance(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service
    ):
        """Test processing performance with large playlist."""
        # Create large playlist
        tracks = [
            RBTrack(track_id=str(i), title=f"Track {i}", artists=f"Artist {i}")
            for i in range(100)
        ]
        
        # Setup mocks
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Measure performance
        start_time = time.time()
        results = service.process_playlist(tracks)
        end_time = time.time()
        
        duration = end_time - start_time
        
        # Verify results
        assert len(results) == len(tracks)
        
        # Performance requirement: should complete in reasonable time
        # With mocks, this should be very fast (< 1 second for 100 tracks)
        assert duration < 10.0  # Should complete in under 10 seconds with mocks
    
    def test_cache_performance(self):
        """Test cache performance."""
        from cuepoint.services.cache_service import CacheService
        
        cache = CacheService()
        
        # Measure cache set performance
        start_time = time.perf_counter()
        for i in range(1000):
            cache.set(f"key_{i}", f"value_{i}")
        set_duration = time.perf_counter() - start_time
        
        # Measure cache get performance
        start_time = time.perf_counter()
        for i in range(1000):
            cache.get(f"key_{i}")
        get_duration = time.perf_counter() - start_time
        
        # Cache operations should be very fast
        assert set_duration < 1.0  # Should set 1000 items in < 1 second
        assert get_duration < 1.0  # Should get 1000 items in < 1 second

