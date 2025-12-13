"""Unit tests for performance monitor utility."""

import time

import pytest

from cuepoint.utils.performance import PerformanceContext, PerformanceMonitor


class TestPerformanceMonitor:
    """Test performance monitor utility."""

    def setup_method(self):
        """Clear metrics before each test."""
        PerformanceMonitor.clear()
        PerformanceMonitor.enable()

    def test_record_operation(self):
        """Test recording operation performance."""
        PerformanceMonitor.record_operation("test_op", 1.5, {"key": "value"}, size=100)

        stats = PerformanceMonitor.get_stats("test_op")
        assert stats["count"] == 1
        assert stats["avg"] == 1.5
        assert stats["min"] == 1.5
        assert stats["max"] == 1.5

    def test_get_stats_empty(self):
        """Test getting stats for non-existent operation."""
        stats = PerformanceMonitor.get_stats("nonexistent")
        assert stats == {}

    def test_get_stats_multiple(self):
        """Test getting stats for multiple operations."""
        PerformanceMonitor.record_operation("op1", 1.0)
        PerformanceMonitor.record_operation("op1", 2.0)
        PerformanceMonitor.record_operation("op1", 3.0)

        stats = PerformanceMonitor.get_stats("op1")
        assert stats["count"] == 3
        assert stats["avg"] == 2.0
        assert stats["min"] == 1.0
        assert stats["max"] == 3.0

    def test_get_all_stats(self):
        """Test getting stats for all operations."""
        PerformanceMonitor.record_operation("op1", 1.0)
        PerformanceMonitor.record_operation("op2", 2.0)

        all_stats = PerformanceMonitor.get_all_stats()
        assert "op1" in all_stats
        assert "op2" in all_stats

    def test_clear(self):
        """Test clearing all metrics."""
        PerformanceMonitor.record_operation("op1", 1.0)
        PerformanceMonitor.clear()

        stats = PerformanceMonitor.get_stats("op1")
        assert stats == {}

    def test_disable(self):
        """Test disabling performance monitoring."""
        PerformanceMonitor.disable()
        PerformanceMonitor.record_operation("op1", 1.0)

        stats = PerformanceMonitor.get_stats("op1")
        assert stats == {}  # Should not record when disabled

    def test_enable(self):
        """Test enabling performance monitoring."""
        PerformanceMonitor.disable()
        PerformanceMonitor.enable()
        PerformanceMonitor.record_operation("op1", 1.0)

        stats = PerformanceMonitor.get_stats("op1")
        assert stats["count"] == 1

    def test_context_manager(self):
        """Test performance context manager."""
        with PerformanceMonitor.context_manager("test_op") as ctx:
            ctx.set_metadata(key="value")
            time.sleep(0.1)  # Small delay

        stats = PerformanceMonitor.get_stats("test_op")
        assert stats["count"] == 1
        assert stats["avg"] > 0

    def test_percentiles(self):
        """Test percentile calculation."""
        # Record 10 operations
        for i in range(10):
            PerformanceMonitor.record_operation("op1", float(i + 1))

        stats = PerformanceMonitor.get_stats("op1")
        assert stats["p50"] == 5.5  # Median (average of 5th and 6th values: (5+6)/2)
        assert stats["p95"] >= 9.0  # 95th percentile

    def test_size_tracking(self):
        """Test size tracking in operations."""
        PerformanceMonitor.record_operation("op1", 1.0, size=100)
        PerformanceMonitor.record_operation("op1", 2.0, size=200)

        stats = PerformanceMonitor.get_stats("op1")
        assert "avg_size" in stats
        assert "total_size" in stats
        assert stats["avg_size"] == 150.0
        assert stats["total_size"] == 300
