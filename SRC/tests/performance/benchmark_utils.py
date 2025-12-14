#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance benchmark utilities.

Provides utilities for measuring and analyzing performance.
"""

import statistics
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class PerformanceMetrics:
    """Performance metrics for an operation."""
    operation: str
    count: int
    total_time: float
    mean_time: float
    median_time: float
    min_time: float
    max_time: float
    p50_time: float
    p95_time: float
    p99_time: float
    std_dev: float


@contextmanager
def measure_time(operation_name: str):
    """Context manager to measure operation time.
    
    Usage:
        with measure_time("parse_xml") as timer:
            result = parse_xml(xml_file)
        print(f"Operation took {timer.elapsed} seconds")
    """
    start_time = time.perf_counter()
    timer = type('Timer', (), {'elapsed': 0.0})()
    
    try:
        yield timer
    finally:
        timer.elapsed = time.perf_counter() - start_time


def measure_multiple(operation, iterations: int = 10) -> List[float]:
    """Measure operation multiple times.
    
    Args:
        operation: Callable to measure
        iterations: Number of iterations
        
    Returns:
        List of execution times in seconds.
    """
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        operation()
        elapsed = time.perf_counter() - start
        times.append(elapsed)
    return times


def calculate_metrics(times: List[float], operation_name: str) -> PerformanceMetrics:
    """Calculate performance metrics from execution times.
    
    Args:
        times: List of execution times
        operation_name: Name of operation
        
    Returns:
        PerformanceMetrics object.
    """
    sorted_times = sorted(times)
    count = len(times)
    
    return PerformanceMetrics(
        operation=operation_name,
        count=count,
        total_time=sum(times),
        mean_time=statistics.mean(times),
        median_time=statistics.median(times),
        min_time=min(times),
        max_time=max(times),
        p50_time=sorted_times[int(count * 0.50)] if count > 0 else 0.0,
        p95_time=sorted_times[int(count * 0.95)] if count > 0 else 0.0,
        p99_time=sorted_times[int(count * 0.99)] if count > 0 else 0.0,
        std_dev=statistics.stdev(times) if count > 1 else 0.0
    )


def check_performance_budget(
    metrics: PerformanceMetrics,
    budget_ms: float,
    warning_threshold: Optional[float] = None,
    critical_threshold: Optional[float] = None
) -> tuple[bool, str]:
    """Check if performance meets budget.
    
    Args:
        metrics: Performance metrics
        budget_ms: Performance budget in milliseconds
        warning_threshold: Warning threshold (default: 1.2x budget)
        critical_threshold: Critical threshold (default: 1.5x budget)
        
    Returns:
        Tuple of (meets_budget, status_message).
    """
    if warning_threshold is None:
        warning_threshold = budget_ms * 1.2
    if critical_threshold is None:
        critical_threshold = budget_ms * 1.5
    
    p95_ms = metrics.p95_time * 1000
    
    if p95_ms > critical_threshold:
        return False, f"CRITICAL: {p95_ms:.1f}ms > {critical_threshold:.1f}ms (p95)"
    elif p95_ms > warning_threshold:
        return True, f"WARNING: {p95_ms:.1f}ms > {warning_threshold:.1f}ms (p95)"
    elif p95_ms > budget_ms:
        return True, f"SLOW: {p95_ms:.1f}ms > {budget_ms:.1f}ms (p95)"
    else:
        return True, f"OK: {p95_ms:.1f}ms <= {budget_ms:.1f}ms (p95)"

