#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance budget definitions.

Defines acceptable performance characteristics for each operation.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class PerformanceBudget:
    """Performance budget definition."""
    operation: str
    description: str
    target_ms: float
    warning_ms: Optional[float] = None
    critical_ms: Optional[float] = None
    metric: str = "p95"  # Which metric to check (mean, p50, p95, p99)
    
    def __post_init__(self):
        """Set default warning and critical thresholds."""
        if self.warning_ms is None:
            self.warning_ms = self.target_ms * 1.2
        if self.critical_ms is None:
            self.critical_ms = self.target_ms * 1.5


# Performance budgets for CuePoint operations
PERFORMANCE_BUDGETS = {
    # Startup performance
    "startup": PerformanceBudget(
        operation="startup",
        description="Application startup time",
        target_ms=2000.0,  # 2 seconds
        warning_ms=3000.0,  # 3 seconds
        critical_ms=5000.0,  # 5 seconds
    ),
    
    # XML parsing performance
    "parse_minimal_xml": PerformanceBudget(
        operation="parse_minimal_xml",
        description="Parse minimal Rekordbox XML",
        target_ms=100.0,  # 100ms
    ),
    
    "parse_large_xml": PerformanceBudget(
        operation="parse_large_xml",
        description="Parse large Rekordbox XML (500 tracks)",
        target_ms=2000.0,  # 2 seconds
    ),
    
    # Track processing performance
    "process_single_track": PerformanceBudget(
        operation="process_single_track",
        description="Process single track (with Beatport search)",
        target_ms=500.0,  # 500ms
    ),
    
    "process_500_tracks": PerformanceBudget(
        operation="process_500_tracks",
        description="Process 500 tracks",
        target_ms=30000.0,  # 30 seconds
    ),
    
    # Filtering performance
    "filter_100_tracks": PerformanceBudget(
        operation="filter_100_tracks",
        description="Filter table with 100 tracks",
        target_ms=50.0,  # 50ms
    ),
    
    "filter_1000_tracks": PerformanceBudget(
        operation="filter_1000_tracks",
        description="Filter table with 1000 tracks",
        target_ms=200.0,  # 200ms
    ),
    
    # Export performance
    "export_csv_100_tracks": PerformanceBudget(
        operation="export_csv_100_tracks",
        description="Export 100 tracks to CSV",
        target_ms=100.0,  # 100ms
    ),
    
    "export_csv_1000_tracks": PerformanceBudget(
        operation="export_csv_1000_tracks",
        description="Export 1000 tracks to CSV",
        target_ms=1000.0,  # 1 second
    ),
    
    # UI responsiveness
    "ui_response": PerformanceBudget(
        operation="ui_response",
        description="UI response time for user actions",
        target_ms=100.0,  # 100ms
        warning_ms=200.0,  # 200ms
        critical_ms=500.0,  # 500ms
    ),
}

