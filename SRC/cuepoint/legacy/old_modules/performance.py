#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Metrics Collection Module

This module provides comprehensive performance monitoring for the CuePoint application,
tracking timing, query effectiveness, cache statistics, and generating performance reports.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
import time
from collections import defaultdict


@dataclass
class QueryMetrics:
    """Metrics for a single query execution"""
    query_text: str
    execution_time: float  # Seconds
    candidates_found: int
    cache_hit: bool
    query_type: str  # "priority", "n_gram", "remix", "title_only", etc.
    network_time: float = 0.0  # Time spent on network request
    parse_time: float = 0.0  # Time spent parsing response


@dataclass
class TrackMetrics:
    """Metrics for a single track processing"""
    track_id: str
    track_title: str
    total_time: float = 0.0  # Total processing time in seconds
    queries: List[QueryMetrics] = field(default_factory=list)
    total_queries: int = 0
    total_candidates: int = 0
    candidates_evaluated: int = 0
    early_exit: bool = False
    early_exit_query_index: int = 0
    match_found: bool = False
    match_score: float = 0.0


@dataclass
class FilterMetrics:
    """Metrics for a filter operation"""
    duration: float  # Filter operation time in seconds
    initial_count: int  # Number of results before filtering
    filtered_count: int  # Number of results after filtering
    filters_applied: Dict[str, Any]  # Dictionary of active filters


@dataclass
class PerformanceStats:
    """Aggregate performance statistics for a processing session"""
    total_tracks: int = 0
    matched_tracks: int = 0
    unmatched_tracks: int = 0
    total_time: float = 0.0
    query_metrics: List[QueryMetrics] = field(default_factory=list)
    track_metrics: List[TrackMetrics] = field(default_factory=list)
    filter_metrics: List[FilterMetrics] = field(default_factory=list)
    cache_stats: Dict[str, int] = field(default_factory=lambda: {"hits": 0, "misses": 0})
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    
    def average_time_per_track(self) -> float:
        """Calculate average processing time per track"""
        if self.total_tracks == 0:
            return 0.0
        return self.total_time / self.total_tracks
    
    def average_time_per_query(self) -> float:
        """Calculate average execution time per query"""
        if not self.query_metrics:
            return 0.0
        return sum(q.execution_time for q in self.query_metrics) / len(self.query_metrics)
    
    def cache_hit_rate(self) -> float:
        """Calculate cache hit rate as percentage"""
        total = self.cache_stats["hits"] + self.cache_stats["misses"]
        if total == 0:
            return 0.0
        return (self.cache_stats["hits"] / total) * 100
    
    def match_rate(self) -> float:
        """Calculate match rate as percentage"""
        if self.total_tracks == 0:
            return 0.0
        return (self.matched_tracks / self.total_tracks) * 100


class PerformanceCollector:
    """Singleton collector for performance metrics"""
    
    _instance: Optional['PerformanceCollector'] = None
    _stats: Optional[PerformanceStats] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def start_session(self):
        """Start a new performance monitoring session"""
        self._stats = PerformanceStats()
        self._stats.start_time = time.perf_counter()
    
    def end_session(self):
        """End the current session"""
        if self._stats:
            self._stats.end_time = time.perf_counter()
            if self._stats.start_time:
                self._stats.total_time = self._stats.end_time - self._stats.start_time
    
    def record_track_start(self, track_id: str, track_title: str) -> TrackMetrics:
        """Record start of track processing"""
        if not self._stats:
            self.start_session()
        
        track_metrics = TrackMetrics(track_id=track_id, track_title=track_title)
        self._stats.track_metrics.append(track_metrics)
        self._stats.total_tracks += 1
        return track_metrics
    
    def record_query(self, track_metrics: TrackMetrics, query_text: str, 
                    execution_time: float, candidates_found: int, 
                    cache_hit: bool, query_type: str,
                    network_time: float = 0.0, parse_time: float = 0.0):
        """Record a query execution"""
        query_metric = QueryMetrics(
            query_text=query_text,
            execution_time=execution_time,
            candidates_found=candidates_found,
            cache_hit=cache_hit,
            query_type=query_type,
            network_time=network_time,
            parse_time=parse_time
        )
        track_metrics.queries.append(query_metric)
        track_metrics.total_queries += 1
        self._stats.query_metrics.append(query_metric)
        
        # Update cache stats
        if cache_hit:
            self._stats.cache_stats["hits"] += 1
        else:
            self._stats.cache_stats["misses"] += 1
    
    def record_track_complete(self, track_metrics: TrackMetrics, 
                             total_time: float, match_found: bool, 
                             match_score: float = 0.0, early_exit: bool = False,
                             early_exit_query_index: int = 0, candidates_evaluated: int = 0):
        """Record completion of track processing"""
        track_metrics.total_time = total_time
        track_metrics.match_found = match_found
        track_metrics.match_score = match_score
        track_metrics.early_exit = early_exit
        track_metrics.early_exit_query_index = early_exit_query_index
        track_metrics.candidates_evaluated = candidates_evaluated
        
        if match_found:
            self._stats.matched_tracks += 1
        else:
            self._stats.unmatched_tracks += 1
    
    def record_filter_operation(self, duration: float, initial_count: int, 
                               filtered_count: int, filters_applied: Dict[str, Any]):
        """Record a filter operation for performance tracking"""
        if not self._stats:
            self.start_session()
        
        filter_metric = FilterMetrics(
            duration=duration,
            initial_count=initial_count,
            filtered_count=filtered_count,
            filters_applied=filters_applied
        )
        self._stats.filter_metrics.append(filter_metric)
    
    def get_stats(self) -> Optional[PerformanceStats]:
        """Get current performance statistics"""
        return self._stats
    
    def reset(self):
        """Reset all statistics"""
        self._stats = None


# Global instance
performance_collector = PerformanceCollector()

