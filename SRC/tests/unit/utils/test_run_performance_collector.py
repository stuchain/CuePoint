"""Unit tests for RunPerformanceCollector (Design 6.48, 6.72)."""

import pytest

from cuepoint.utils.run_performance_collector import (
    STAGE_PARSE_XML,
    STAGE_SEARCH_CANDIDATES,
    RunPerformanceCollector,
    RunPerformanceReport,
)


class TestRunPerformanceCollector:
    """Test RunPerformanceCollector."""

    def test_start_end_stage(self):
        """Stage timing recorded correctly."""
        c = RunPerformanceCollector()
        c.start_run()
        c.start_stage(STAGE_PARSE_XML)
        c.end_stage(STAGE_PARSE_XML, items_processed=10)
        report = c.get_report()
        assert STAGE_PARSE_XML in report.stages
        assert report.stages[STAGE_PARSE_XML] >= 0

    def test_cache_hit_rate(self):
        """Cache hit rate computed correctly."""
        c = RunPerformanceCollector()
        c.record_cache_hit()
        c.record_cache_hit()
        c.record_cache_miss()
        assert c.cache_hit_rate == pytest.approx(66.67, rel=0.1)

    def test_memory_peak(self):
        """Memory peak tracked."""
        c = RunPerformanceCollector()
        c.sample_memory()
        report = c.get_report()
        assert report.memory_mb_peak >= 0

    def test_report_to_dict(self):
        """Report serializes to dict."""
        c = RunPerformanceCollector()
        c.start_run()
        c.end_run()
        report = c.get_report()
        d = report.to_dict()
        assert "run_id" in d
        assert "stages" in d
        assert "memory_mb_peak" in d
