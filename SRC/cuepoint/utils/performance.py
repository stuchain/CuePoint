#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Monitoring Utility

Provides performance monitoring and optimization utilities.
Implements performance requirements from Step 1.11.
"""

import logging
import time
from collections import defaultdict
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class PerformanceMonitor:
    """Monitor performance metrics.

    Provides performance monitoring functionality:
    - Record operation performance
    - Get performance statistics
    - Context manager for timing operations
    """

    _metrics: Dict[str, List[Dict]] = defaultdict(list)
    _enabled = True

    @classmethod
    def enable(cls):
        """Enable performance monitoring."""
        cls._enabled = True

    @classmethod
    def disable(cls):
        """Disable performance monitoring."""
        cls._enabled = False

    @classmethod
    def record_operation(
        cls,
        operation: str,
        duration: float,
        metadata: Optional[Dict] = None,
        size: Optional[int] = None,
    ):
        """Record operation performance.

        Args:
            operation: Operation name.
            duration: Duration in seconds.
            metadata: Optional metadata dictionary.
            size: Optional size (e.g., number of items processed).
        """
        if not cls._enabled:
            return

        record = {
            "duration": duration,
            "metadata": metadata or {},
            "size": size,
            "timestamp": time.time(),
        }

        cls._metrics[operation].append(record)

        # Log if slow
        if duration > 1.0:  # > 1 second
            logger.warning(f"Slow operation: {operation} took {duration:.2f}s")

    @classmethod
    def get_stats(cls, operation: str) -> Dict:
        """Get performance statistics for operation.

        Args:
            operation: Operation name.

        Returns:
            Dictionary with statistics:
            - count: Number of operations
            - avg: Average duration
            - min: Minimum duration
            - max: Maximum duration
            - p50: 50th percentile
            - p95: 95th percentile
            - avg_size: Average size (if available)
            - total_size: Total size (if available)
        """
        if operation not in cls._metrics or not cls._metrics[operation]:
            return {}

        durations = [m["duration"] for m in cls._metrics[operation]]
        sizes = [m.get("size", 0) for m in cls._metrics[operation] if m.get("size")]

        sorted_durations = sorted(durations)
        # Calculate median (p50) - average of two middle values for even count
        if len(sorted_durations) % 2 == 0:
            mid = len(sorted_durations) // 2
            p50 = (sorted_durations[mid - 1] + sorted_durations[mid]) / 2.0
        else:
            p50 = sorted_durations[len(sorted_durations) // 2]
        
        stats = {
            "count": len(durations),
            "avg": sum(durations) / len(durations),
            "min": min(durations),
            "max": max(durations),
            "p50": p50,
            "p95": (
                sorted_durations[int(len(sorted_durations) * 0.95)]
                if len(sorted_durations) > 1
                else durations[0]
            ),
        }

        if sizes:
            stats["avg_size"] = sum(sizes) / len(sizes)
            stats["total_size"] = sum(sizes)

        return stats

    @classmethod
    def get_all_stats(cls) -> Dict[str, Dict]:
        """Get statistics for all operations.

        Returns:
            Dictionary mapping operation names to statistics.
        """
        return {op: cls.get_stats(op) for op in cls._metrics.keys()}

    @classmethod
    def clear(cls):
        """Clear all metrics."""
        cls._metrics.clear()

    @classmethod
    def context_manager(cls, operation: str):
        """Get context manager for timing operations.

        Args:
            operation: Operation name.

        Returns:
            PerformanceContext instance.
        """
        return PerformanceContext(operation)


class PerformanceContext:
    """Context manager for performance monitoring."""

    def __init__(self, operation: str):
        """Initialize performance context.

        Args:
            operation: Operation name.
        """
        self.operation = operation
        self.start_time = None
        self.metadata = {}

    def __enter__(self):
        """Enter context manager."""
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager."""
        duration = time.time() - self.start_time
        PerformanceMonitor.record_operation(self.operation, duration, self.metadata)

    def set_metadata(self, **kwargs):
        """Set metadata for this operation.

        Args:
            **kwargs: Metadata key-value pairs.
        """
        self.metadata.update(kwargs)
