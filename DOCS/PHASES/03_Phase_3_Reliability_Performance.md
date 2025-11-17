# Phase 3: Reliability & Performance (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: ⚡ P1 - MEDIUM PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation), Phase 2 (User Experience)

## Goal
Improve reliability and performance, add comprehensive monitoring and error recovery.

## Success Criteria
- [ ] Performance monitoring dashboard works and displays real-time metrics
- [ ] Performance metrics collection integrated into processing pipeline
- [ ] Error recovery and retry logic implemented with exponential backoff
- [ ] Performance reports generated automatically
- [ ] Cache statistics tracked and displayed
- [ ] All features tested and working
- [ ] Performance improvements measurable

---

## Implementation Steps

### Step 3.1: Performance Metrics Collection System (3-4 days)
**File**: `SRC/performance.py` (NEW)

**Dependencies**: Phase 0 (processing backend), Phase 1 (GUI working)

**What to create - EXACT STRUCTURE:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Metrics Collection Module

This module provides comprehensive performance monitoring for the CuePoint application,
tracking timing, query effectiveness, cache statistics, and generating performance reports.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
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
    total_time: float  # Total processing time in seconds
    queries: List[QueryMetrics] = field(default_factory=list)
    total_queries: int = 0
    total_candidates: int = 0
    candidates_evaluated: int = 0
    early_exit: bool = False
    early_exit_query_index: int = 0
    match_found: bool = False
    match_score: float = 0.0


@dataclass
class PerformanceStats:
    """Aggregate performance statistics for a processing session"""
    total_tracks: int = 0
    matched_tracks: int = 0
    unmatched_tracks: int = 0
    total_time: float = 0.0
    query_metrics: List[QueryMetrics] = field(default_factory=list)
    track_metrics: List[TrackMetrics] = field(default_factory=list)
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
    
    def get_stats(self) -> Optional[PerformanceStats]:
        """Get current performance statistics"""
        return self._stats
    
    def reset(self):
        """Reset all statistics"""
        self._stats = None


# Global instance
performance_collector = PerformanceCollector()
```

**Implementation Checklist**:
- [ ] Create `SRC/performance.py` with all data classes
- [ ] Implement `PerformanceCollector` singleton
- [ ] Add methods for recording track start/complete
- [ ] Add methods for recording query execution
- [ ] Add cache statistics tracking
- [ ] Add helper methods for calculating averages and rates
- [ ] Test metrics collection with sample data

**Acceptance Criteria**:
- ✅ File exists at `SRC/performance.py`
- ✅ All data classes defined with proper type hints
- ✅ `PerformanceCollector` singleton works correctly
- ✅ Can record track and query metrics
- ✅ Cache statistics tracked correctly
- ✅ Helper methods calculate averages correctly
- ✅ Can import without errors: `from performance import performance_collector`

**Design Reference**: `DOCS/DESIGNS/10_Performance_Monitoring_Design.md`

---

### Step 3.2: Integrate Performance Collection into Processing Pipeline (2-3 days)
**Files**: `SRC/matcher.py` (MODIFY), `SRC/processor.py` (MODIFY), `SRC/beatport_search.py` (MODIFY)

**Dependencies**: Step 3.1 (performance module exists)

**What to modify - EXACT STRUCTURE:**

**In `SRC/matcher.py`:**

```python
from performance import performance_collector
import time

def best_beatport_match(
    idx: int,
    track_title: str,
    track_artists_for_scoring: str,
    title_only_mode: bool,
    queries: List[str],
    input_year: Optional[int] = None,
    input_key: Optional[str] = None,
    input_mix: Optional[Dict[str, object]] = None,
    input_generic_phrases: Optional[List[str]] = None,
) -> Tuple[Optional[BeatportCandidate], List[BeatportCandidate], List[Tuple[int, str, int, int]], int]:
    """Find best Beatport match - WITH PERFORMANCE TRACKING"""
    
    # Start track metrics
    track_id = f"track_{idx}"
    track_metrics = performance_collector.record_track_start(track_id, track_title)
    track_start_time = time.perf_counter()
    
    # ... existing matching logic ...
    
    for query_idx, query in enumerate(queries):
        query_start_time = time.perf_counter()
        
        # Determine query type
        query_type = _classify_query_type(query, query_idx)
        
        # Check cache (if applicable)
        cache_hit = False  # TODO: integrate with actual cache
        
        # Execute query
        candidates = execute_search_query(query)
        
        query_end_time = time.perf_counter()
        query_execution_time = query_end_time - query_start_time
        
        # Record query metrics
        performance_collector.record_query(
            track_metrics=track_metrics,
            query_text=query,
            execution_time=query_execution_time,
            candidates_found=len(candidates),
            cache_hit=cache_hit,
            query_type=query_type
        )
        
        # ... rest of matching logic ...
        
        # Check for early exit
        if best_match and best_match.match_score >= 95:
            track_metrics.early_exit = True
            track_metrics.early_exit_query_index = query_idx
            break
    
    # Complete track metrics
    track_end_time = time.perf_counter()
    total_time = track_end_time - track_start_time
    
    performance_collector.record_track_complete(
        track_metrics=track_metrics,
        total_time=total_time,
        match_found=(best_match is not None),
        match_score=best_match.match_score if best_match else 0.0,
        early_exit=track_metrics.early_exit,
        early_exit_query_index=track_metrics.early_exit_query_index,
        candidates_evaluated=len(candidates_log)
    )
    
    return best_match, candidates_log, queries_audit, last_query_index


def _classify_query_type(query: str, query_index: int) -> str:
    """Classify query type for metrics"""
    if query_index == 0:
        return "priority"
    elif "remix" in query.lower() or "mix" in query.lower():
        return "remix"
    elif '"' in query:
        return "exact_phrase"
    else:
        return "n_gram"
```

**In `SRC/processor.py`:**

```python
from performance import performance_collector

def process_playlist(
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None
) -> List[TrackResult]:
    """Process playlist - WITH PERFORMANCE TRACKING"""
    
    # Start performance session
    performance_collector.start_session()
    
    try:
        # ... existing processing logic ...
        
        # Process tracks (metrics collected in matcher.py)
        results = []
        for idx, rb_track in enumerate(tracks):
            # ... process track ...
            results.append(track_result)
        
        return results
        
    finally:
        # End performance session
        performance_collector.end_session()
```

**Implementation Checklist**:
- [ ] Import `performance_collector` in `matcher.py`
- [ ] Add track start/complete recording in `best_beatport_match`
- [ ] Add query recording for each query execution
- [ ] Add query type classification
- [ ] Integrate cache hit/miss tracking
- [ ] Add session start/end in `process_playlist`
- [ ] Test metrics collection during actual processing
- [ ] Verify metrics are collected correctly

**Acceptance Criteria**:
- ✅ Performance metrics collected during track processing
- ✅ Query execution times recorded
- ✅ Cache statistics tracked
- ✅ Track-level metrics complete
- ✅ Session timing works correctly
- ✅ No performance impact from metrics collection

---

### Step 3.3: Performance Monitoring Dashboard (3-4 days)
**File**: `SRC/gui/performance_view.py` (NEW)

**Dependencies**: Step 3.1 (performance module), Step 3.2 (metrics collection integrated), Phase 1 (GUI working)

**What to create - EXACT STRUCTURE:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Monitoring Dashboard

This module provides a GUI widget for displaying real-time performance metrics
during playlist processing.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QTableWidget,
    QTableWidgetItem, QPushButton, QGroupBox, QTextEdit
)
from PySide6.QtCore import Qt, QTimer
from typing import Optional
from performance import performance_collector, PerformanceStats


class PerformanceView(QWidget):
    """Performance monitoring dashboard widget"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.update_timer = QTimer()
        self.update_timer.timeout.connect(self._update_display)
        self.init_ui()
    
    def init_ui(self):
        """Initialize performance dashboard UI"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        
        # Title
        title = QLabel("Performance Metrics")
        title.setStyleSheet("font-size: 18px; font-weight: bold;")
        layout.addWidget(title)
        
        # Overall Statistics Group
        overall_group = QGroupBox("Overall Statistics")
        overall_layout = QVBoxLayout()
        
        self.overall_table = QTableWidget()
        self.overall_table.setColumnCount(2)
        self.overall_table.setHorizontalHeaderLabels(["Metric", "Value"])
        self.overall_table.setRowCount(8)
        self.overall_table.horizontalHeader().setStretchLastSection(True)
        self.overall_table.setEditTriggers(QTableWidget.NoEditTriggers)
        overall_layout.addWidget(self.overall_table)
        
        overall_group.setLayout(overall_layout)
        layout.addWidget(overall_group)
        
        # Query Performance Group
        query_group = QGroupBox("Query Performance")
        query_layout = QVBoxLayout()
        
        self.query_table = QTableWidget()
        self.query_table.setColumnCount(5)
        self.query_table.setHorizontalHeaderLabels([
            "Query Type", "Count", "Avg Time (s)", "Total Candidates", "Cache Hit Rate"
        ])
        self.query_table.horizontalHeader().setStretchLastSection(True)
        self.query_table.setEditTriggers(QTableWidget.NoEditTriggers)
        query_layout.addWidget(self.query_table)
        
        query_group.setLayout(query_layout)
        layout.addWidget(query_group)
        
        # Slowest Tracks Group
        slowest_group = QGroupBox("Slowest Tracks")
        slowest_layout = QVBoxLayout()
        
        self.slowest_table = QTableWidget()
        self.slowest_table.setColumnCount(3)
        self.slowest_table.setHorizontalHeaderLabels([
            "Track", "Time (s)", "Queries"
        ])
        self.slowest_table.horizontalHeader().setStretchLastSection(True)
        self.slowest_table.setEditTriggers(QTableWidget.NoEditTriggers)
        slowest_layout.addWidget(self.slowest_table)
        
        slowest_group.setLayout(slowest_layout)
        layout.addWidget(slowest_group)
        
        # Performance Tips
        tips_group = QGroupBox("Performance Tips")
        tips_layout = QVBoxLayout()
        
        self.tips_text = QTextEdit()
        self.tips_text.setReadOnly(True)
        self.tips_text.setMaximumHeight(150)
        tips_layout.addWidget(self.tips_text)
        
        tips_group.setLayout(tips_layout)
        layout.addWidget(tips_group)
        
        # Control buttons
        button_layout = QHBoxLayout()
        
        self.refresh_btn = QPushButton("Refresh")
        self.refresh_btn.clicked.connect(self._update_display)
        button_layout.addWidget(self.refresh_btn)
        
        self.export_btn = QPushButton("Export Report")
        self.export_btn.clicked.connect(self._export_report)
        button_layout.addWidget(self.export_btn)
        
        layout.addLayout(button_layout)
        
        layout.addStretch()
    
    def start_monitoring(self):
        """Start real-time monitoring (updates every 1 second)"""
        self.update_timer.start(1000)  # Update every second
        self._update_display()
    
    def stop_monitoring(self):
        """Stop real-time monitoring"""
        self.update_timer.stop()
        self._update_display()  # Final update
    
    def _update_display(self):
        """Update all displays with current metrics"""
        stats = performance_collector.get_stats()
        if not stats:
            self._clear_display()
            return
        
        self._update_overall_stats(stats)
        self._update_query_stats(stats)
        self._update_slowest_tracks(stats)
        self._update_tips(stats)
    
    def _update_overall_stats(self, stats: PerformanceStats):
        """Update overall statistics table"""
        metrics = [
            ("Total Tracks", str(stats.total_tracks)),
            ("Matched Tracks", f"{stats.matched_tracks} ({stats.match_rate():.1f}%)"),
            ("Unmatched Tracks", str(stats.unmatched_tracks)),
            ("Total Time", self._format_time(stats.total_time)),
            ("Avg Time per Track", self._format_time(stats.average_time_per_track())),
            ("Total Queries", str(len(stats.query_metrics))),
            ("Avg Time per Query", self._format_time(stats.average_time_per_query())),
            ("Cache Hit Rate", f"{stats.cache_hit_rate():.1f}%"),
        ]
        
        self.overall_table.setRowCount(len(metrics))
        for row, (metric, value) in enumerate(metrics):
            self.overall_table.setItem(row, 0, QTableWidgetItem(metric))
            self.overall_table.setItem(row, 1, QTableWidgetItem(value))
    
    def _update_query_stats(self, stats: PerformanceStats):
        """Update query performance statistics"""
        # Group queries by type
        by_type = defaultdict(lambda: {"count": 0, "total_time": 0.0, "total_candidates": 0, "cache_hits": 0, "cache_total": 0})
        
        for query in stats.query_metrics:
            qtype = query.query_type
            by_type[qtype]["count"] += 1
            by_type[qtype]["total_time"] += query.execution_time
            by_type[qtype]["total_candidates"] += query.candidates_found
            by_type[qtype]["cache_total"] += 1
            if query.cache_hit:
                by_type[qtype]["cache_hits"] += 1
        
        # Populate table
        self.query_table.setRowCount(len(by_type))
        for row, (qtype, data) in enumerate(sorted(by_type.items())):
            avg_time = data["total_time"] / data["count"] if data["count"] > 0 else 0.0
            hit_rate = (data["cache_hits"] / data["cache_total"] * 100) if data["cache_total"] > 0 else 0.0
            
            self.query_table.setItem(row, 0, QTableWidgetItem(qtype.replace("_", " ").title()))
            self.query_table.setItem(row, 1, QTableWidgetItem(str(data["count"])))
            self.query_table.setItem(row, 2, QTableWidgetItem(f"{avg_time:.3f}"))
            self.query_table.setItem(row, 3, QTableWidgetItem(str(data["total_candidates"])))
            self.query_table.setItem(row, 4, QTableWidgetItem(f"{hit_rate:.1f}%"))
    
    def _update_slowest_tracks(self, stats: PerformanceStats):
        """Update slowest tracks table"""
        # Sort tracks by total time
        slowest = sorted(
            stats.track_metrics,
            key=lambda t: t.total_time,
            reverse=True
        )[:10]  # Top 10 slowest
        
        self.slowest_table.setRowCount(len(slowest))
        for row, track in enumerate(slowest):
            title = track.track_title[:50] + "..." if len(track.track_title) > 50 else track.track_title
            self.slowest_table.setItem(row, 0, QTableWidgetItem(title))
            self.slowest_table.setItem(row, 1, QTableWidgetItem(f"{track.total_time:.2f}"))
            self.slowest_table.setItem(row, 2, QTableWidgetItem(str(track.total_queries)))
    
    def _update_tips(self, stats: PerformanceStats):
        """Update performance tips based on metrics"""
        tips = []
        
        # Check average time per track
        avg_time = stats.average_time_per_track()
        if avg_time > 5.0:
            tips.append("• Consider using 'Fast' preset to reduce processing time")
        
        # Check cache hit rate
        hit_rate = stats.cache_hit_rate()
        if hit_rate < 30.0 and stats.cache_stats["misses"] > 10:
            tips.append("• Low cache hit rate - consider enabling HTTP caching")
        
        # Check query effectiveness
        if len(stats.query_metrics) > 0:
            avg_query_time = stats.average_time_per_query()
            if avg_query_time > 3.0:
                tips.append("• Queries are taking longer than expected - check network connection")
        
        # Check match rate
        match_rate = stats.match_rate()
        if match_rate < 50.0 and stats.total_tracks > 10:
            tips.append("• Low match rate - consider adjusting search settings")
        
        if not tips:
            tips.append("• Performance looks good!")
        
        self.tips_text.setText("\n".join(tips))
    
    def _clear_display(self):
        """Clear all displays"""
        self.overall_table.setRowCount(0)
        self.query_table.setRowCount(0)
        self.slowest_table.setRowCount(0)
        self.tips_text.clear()
    
    def _format_time(self, seconds: float) -> str:
        """Format time in seconds to human-readable string"""
        if seconds < 1.0:
            return f"{seconds * 1000:.0f}ms"
        elif seconds < 60.0:
            return f"{seconds:.2f}s"
        else:
            minutes = int(seconds // 60)
            secs = seconds % 60
            return f"{minutes}m {secs:.1f}s"
    
    def _export_report(self):
        """Export performance report to file"""
        from gui.export_dialog import ExportDialog
        from output_writer import write_performance_report
        
        stats = performance_collector.get_stats()
        if not stats:
            QMessageBox.information(self, "No Data", "No performance data available to export.")
            return
        
        # Generate and save report
        report_path = write_performance_report(stats, "performance_report")
        QMessageBox.information(
            self,
            "Report Exported",
            f"Performance report saved to:\n{report_path}"
        )
```

**Implementation Checklist**:
- [ ] Create `SRC/gui/performance_view.py`
- [ ] Implement `PerformanceView` widget with all tables
- [ ] Add real-time update timer
- [ ] Implement `_update_overall_stats` method
- [ ] Implement `_update_query_stats` method
- [ ] Implement `_update_slowest_tracks` method
- [ ] Implement `_update_tips` method
- [ ] Add export report functionality
- [ ] Integrate into main window (add as new tab or panel)
- [ ] Test with actual processing data

**Acceptance Criteria**:
- ✅ Performance dashboard displays correctly
- ✅ Real-time updates work during processing
- ✅ Overall statistics displayed correctly
- ✅ Query performance statistics displayed correctly
- ✅ Slowest tracks table populated
- ✅ Performance tips shown
- ✅ Export report works
- ✅ No performance impact from dashboard updates

**Design Reference**: `DOCS/DESIGNS/10_Performance_Monitoring_Design.md`

---

### Step 3.4: Performance Report Generation (2 days)
**File**: `SRC/output_writer.py` (MODIFY)

**Dependencies**: Step 3.1 (performance module), Step 3.2 (metrics collection)

**What to add - EXACT STRUCTURE:**

```python
from performance import PerformanceStats
import os
from datetime import datetime

def write_performance_report(stats: PerformanceStats, base_filename: str, output_dir: str = "output") -> str:
    """Generate and save performance report to file"""
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Generate report text
    report_lines = []
    report_lines.append("=" * 80)
    report_lines.append("CuePoint Performance Analysis Report")
    report_lines.append("=" * 80)
    report_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append("")
    
    # Overall Statistics
    report_lines.append("Overall Performance:")
    report_lines.append(f"  Total tracks processed: {stats.total_tracks}")
    report_lines.append(f"  Matched tracks: {stats.matched_tracks} ({stats.match_rate():.1f}%)")
    report_lines.append(f"  Unmatched tracks: {stats.unmatched_tracks}")
    report_lines.append(f"  Total processing time: {_format_time(stats.total_time)}")
    report_lines.append(f"  Average time per track: {_format_time(stats.average_time_per_track())}")
    report_lines.append("")
    
    # Query Statistics
    report_lines.append("Query Performance:")
    report_lines.append(f"  Total queries executed: {len(stats.query_metrics)}")
    report_lines.append(f"  Average time per query: {_format_time(stats.average_time_per_query())}")
    report_lines.append("")
    
    # Query Type Breakdown
    by_type = defaultdict(lambda: {"count": 0, "total_time": 0.0, "total_candidates": 0})
    for query in stats.query_metrics:
        qtype = query.query_type
        by_type[qtype]["count"] += 1
        by_type[qtype]["total_time"] += query.execution_time
        by_type[qtype]["total_candidates"] += query.candidates_found
    
    report_lines.append("Query Performance by Type:")
    for qtype, data in sorted(by_type.items()):
        avg_time = data["total_time"] / data["count"] if data["count"] > 0 else 0.0
        avg_candidates = data["total_candidates"] / data["count"] if data["count"] > 0 else 0.0
        report_lines.append(f"  {qtype.replace('_', ' ').title()}:")
        report_lines.append(f"    Count: {data['count']}")
        report_lines.append(f"    Avg time: {_format_time(avg_time)}")
        report_lines.append(f"    Avg candidates: {avg_candidates:.1f}")
    report_lines.append("")
    
    # Cache Statistics
    report_lines.append("Cache Performance:")
    report_lines.append(f"  Cache hits: {stats.cache_stats['hits']}")
    report_lines.append(f"  Cache misses: {stats.cache_stats['misses']}")
    report_lines.append(f"  Hit rate: {stats.cache_hit_rate():.1f}%")
    report_lines.append("")
    
    # Slowest Tracks
    slowest = sorted(stats.track_metrics, key=lambda t: t.total_time, reverse=True)[:10]
    report_lines.append("Slowest Tracks (Top 10):")
    for track in slowest:
        report_lines.append(f"  {track.track_title[:60]}: {_format_time(track.total_time)} ({track.total_queries} queries)")
    report_lines.append("")
    
    # Bottleneck Analysis
    bottlenecks = _identify_bottlenecks(stats)
    if bottlenecks:
        report_lines.append("Performance Bottlenecks:")
        for bottleneck in bottlenecks:
            report_lines.append(f"  • {bottleneck}")
        report_lines.append("")
    
    # Write to file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{base_filename}_performance_{timestamp}.txt"
    filepath = os.path.join(output_dir, filename)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("\n".join(report_lines))
    
    return filepath


def _format_time(seconds: float) -> str:
    """Format time in seconds to human-readable string"""
    if seconds < 1.0:
        return f"{seconds * 1000:.0f}ms"
    elif seconds < 60.0:
        return f"{seconds:.2f}s"
    else:
        minutes = int(seconds // 60)
        secs = seconds % 60
        return f"{minutes}m {secs:.1f}s"


def _identify_bottlenecks(stats: PerformanceStats) -> List[str]:
    """Identify performance bottlenecks"""
    bottlenecks = []
    
    # Check query times
    avg_query_time = stats.average_time_per_query()
    if avg_query_time > 5.0:
        bottlenecks.append(f"Slow queries (avg {avg_query_time:.1f}s per query)")
    
    # Check cache hit rate
    hit_rate = stats.cache_hit_rate()
    if hit_rate < 30.0 and stats.cache_stats["misses"] > 10:
        bottlenecks.append(f"Low cache hit rate ({hit_rate:.1f}%)")
    
    # Check track processing time
    avg_track_time = stats.average_time_per_track()
    if avg_track_time > 60.0:
        bottlenecks.append(f"Slow track processing (avg {avg_track_time:.1f}s per track)")
    
    # Check match rate
    match_rate = stats.match_rate()
    if match_rate < 50.0 and stats.total_tracks > 10:
        bottlenecks.append(f"Low match rate ({match_rate:.1f}%)")
    
    return bottlenecks
```

**Implementation Checklist**:
- [ ] Add `write_performance_report` function to `output_writer.py`
- [ ] Implement report text generation
- [ ] Add bottleneck identification
- [ ] Add time formatting helper
- [ ] Test report generation with sample data
- [ ] Integrate auto-report generation after processing

**Acceptance Criteria**:
- ✅ Performance report generated correctly
- ✅ Report includes all key metrics
- ✅ Bottlenecks identified
- ✅ Report saved to file
- ✅ Report format is readable
- ✅ Auto-generated after processing completes

---

### Step 3.5: Error Recovery and Retry Logic (3-4 days)
**File**: `SRC/utils.py` (MODIFY), `SRC/beatport_search.py` (MODIFY)

**Dependencies**: Phase 0 (backend), Phase 1 (GUI)

**What to add - EXACT STRUCTURE:**

```python
# In SRC/utils.py

import time
import random
from functools import wraps
from typing import Callable, Any, Optional, Type, Tuple
from requests.exceptions import (
    RequestException, Timeout, ConnectionError, 
    HTTPError, SSLError
)

def retry_with_backoff(
    max_retries: int = 3,
    backoff_base: float = 1.0,
    backoff_max: float = 60.0,
    jitter: bool = True,
    exceptions: Tuple[Type[Exception], ...] = (RequestException,)
):
    """
    Decorator for automatic retry with exponential backoff
    
    Args:
        max_retries: Maximum number of retry attempts
        backoff_base: Base delay in seconds (doubles each retry)
        backoff_max: Maximum delay in seconds
        jitter: Add random jitter to prevent thundering herd
        exceptions: Tuple of exception types to catch and retry
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    
                    if attempt == max_retries:
                        # Last attempt failed, raise exception
                        raise
                    
                    # Calculate backoff delay
                    delay = min(backoff_base * (2 ** attempt), backoff_max)
                    
                    # Add jitter if enabled
                    if jitter:
                        jitter_amount = random.uniform(0, delay * 0.1)
                        delay += jitter_amount
                    
                    # Wait before retrying
                    time.sleep(delay)
                    
                    # Log retry attempt (if logger available)
                    # logger.warning(f"Retry {attempt + 1}/{max_retries} for {func.__name__}: {str(e)}")
            
            # Should not reach here, but just in case
            if last_exception:
                raise last_exception
                
        return wrapper
    return decorator


def retry_with_strategy(
    strategy: Dict[str, Dict[str, Any]]
):
    """
    Decorator for retry with custom strategy per exception type
    
    Args:
        strategy: Dict mapping exception types to retry configs
                 Example: {
                     'HTTPError': {'max_retries': 5, 'backoff_base': 2.0},
                     'Timeout': {'max_retries': 3, 'backoff_base': 1.0}
                 }
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Determine which exception occurred and use appropriate strategy
            # This is a simplified version - full implementation would
            # need to catch specific exceptions and apply appropriate retry logic
            return func(*args, **kwargs)
        return wrapper
    return decorator
```

**In `SRC/beatport_search.py`:**

```python
from utils import retry_with_backoff
from requests.exceptions import RequestException, Timeout, HTTPError

@retry_with_backoff(
    max_retries=3,
    backoff_base=1.0,
    backoff_max=30.0,
    jitter=True,
    exceptions=(RequestException, Timeout, HTTPError)
)
def track_urls(query: str, max_results: int = 50) -> List[str]:
    """Search Beatport and return track URLs - WITH RETRY LOGIC"""
    # Existing implementation with retry wrapper
    # ...
    pass


@retry_with_backoff(
    max_retries=2,
    backoff_base=0.5,
    backoff_max=10.0,
    jitter=True
)
def fetch_track_data(url: str) -> Optional[Dict]:
    """Fetch track data from Beatport - WITH RETRY LOGIC"""
    # Existing implementation with retry wrapper
    # ...
    pass
```

**Implementation Checklist**:
- [ ] Add `retry_with_backoff` decorator to `utils.py`
- [ ] Add `retry_with_strategy` decorator (optional)
- [ ] Apply retry decorator to `track_urls` function
- [ ] Apply retry decorator to `fetch_track_data` function
- [ ] Test retry logic with simulated failures
- [ ] Test exponential backoff timing
- [ ] Test jitter functionality
- [ ] Add logging for retry attempts
- [ ] Handle specific HTTP error codes (429, 500, etc.)

**Acceptance Criteria**:
- ✅ Retry decorator works correctly
- ✅ Exponential backoff implemented
- ✅ Jitter prevents thundering herd
- ✅ Network functions retry on failure
- ✅ Max retries respected
- ✅ Exceptions raised after max retries
- ✅ Retry attempts logged (optional)

**Design Reference**: `DOCS/DESIGNS/06_Retry_Logic_Exponential_Backoff_Design.md`

---

### Step 3.6: GUI Integration for Performance Dashboard (2-3 days)
**Files**: `SRC/gui/main_window.py` (MODIFY), `SRC/gui/config_panel.py` (MODIFY)

**Dependencies**: Step 3.3 (performance_view.py exists), Phase 1 (GUI working)

**What to add - EXACT STRUCTURE:**

**In `SRC/gui/config_panel.py`:**

Add a checkbox in the Advanced Settings section:

```python
# In the Processing Options group, add:
self.track_performance_check = QCheckBox("Track performance statistics")
self.track_performance_check.setChecked(False)
self.track_performance_check.setToolTip(
    "Enable real-time performance monitoring dashboard during processing"
)
options_layout.addWidget(self.track_performance_check)
```

**In `SRC/gui/main_window.py`:**

```python
from gui.performance_view import PerformanceView

# In init_ui(), after results_group:
# Performance monitoring tab (only shown if enabled in settings)
self.performance_view = PerformanceView()
self.performance_tab_index = None  # Will be set when tab is added

# In start_processing() method:
# Check if performance tracking is enabled
settings = self.config_panel.get_settings()
if settings.get("track_performance", False):
    # Add performance tab if not already added
    if self.performance_tab_index is None:
        self.performance_tab_index = self.tabs.addTab(
            self.performance_view, 
            "Performance"
        )
        self.performance_view.start_monitoring()
    else:
        # Tab already exists, just start monitoring
        self.performance_view.start_monitoring()
        self.tabs.setCurrentIndex(self.performance_tab_index)
else:
    # Remove performance tab if it exists
    if self.performance_tab_index is not None:
        self.tabs.removeTab(self.performance_tab_index)
        self.performance_tab_index = None
        self.performance_view.stop_monitoring()

# In processing_complete() or similar:
# Stop monitoring when processing completes
if self.performance_view and self.performance_tab_index is not None:
    self.performance_view.stop_monitoring()
```

**Implementation Checklist**:
- [ ] Add "Track performance statistics" checkbox to config panel
- [ ] Add performance view to main window
- [ ] Show/hide performance tab based on settings
- [ ] Start/stop monitoring when processing starts/ends
- [ ] Test performance dashboard during actual processing
- [ ] Verify settings persistence

**Acceptance Criteria**:
- ✅ Checkbox appears in Advanced Settings
- ✅ Performance tab only appears when checkbox is checked
- ✅ Performance dashboard updates in real-time during processing
- ✅ Dashboard stops updating when processing completes
- ✅ Settings persist between sessions

---

### Step 3.7: Cache Integration for Performance Tracking (2 days)
**Files**: `SRC/matcher.py` (MODIFY), `SRC/beatport.py` (MODIFY)

**Dependencies**: Step 3.2 (performance collection integrated), requests_cache available

**What to modify - EXACT STRUCTURE:**

**In `SRC/beatport.py`:**

Modify `request_html()` to detect cache hits:

```python
@retry_with_backoff(...)
def request_html(url: str) -> Tuple[Optional[BeautifulSoup], bool]:
    """
    Fetch a URL robustly, handling empty gzipped/brotli responses by retrying without compression.
    
    Returns:
        Tuple of (BeautifulSoup object or None, cache_hit: bool)
    """
    to = (SETTINGS["CONNECT_TIMEOUT"], SETTINGS["READ_TIMEOUT"])
    cache_hit = False
    
    # ... existing code ...
    
    resp = _get(url)
    if resp:
        # Check if response came from cache (requests_cache adds this attribute)
        if hasattr(resp, 'from_cache'):
            cache_hit = resp.from_cache
        elif hasattr(resp, '_from_cache'):
            cache_hit = resp._from_cache
    
    # ... rest of existing code ...
    
    return soup, cache_hit
```

**In `SRC/matcher.py`:**

Update query execution to track cache hits:

```python
# In best_beatport_match(), modify track_urls() call:
# We need to track cache hits from track_urls() calls
# Since track_urls() calls request_html() internally, we need to modify track_urls()
# to return cache hit information, or check cache status differently

# Option 1: Modify track_urls() to return cache info
# Option 2: Check cache status before calling track_urls()

# For now, we'll modify track_urls() to return cache hit info
urls_all, cache_hit = track_urls_with_cache_info(idx, q, max_results=mr)
```

**Alternative approach - Check cache before query:**

```python
# In best_beatport_match(), before calling track_urls():
# Check if we can determine cache hit from requests_cache
cache_hit = False
try:
    import requests_cache
    if requests_cache.get_cache():
        # Generate a cache key for this query
        cache_key = f"track_urls:{q}:{mr}"
        # Check if this key exists in cache
        # Note: This is a simplified check - actual implementation may vary
        cache_hit = cache_key in requests_cache.get_cache()._cache
except:
    pass

# Then use cache_hit when recording query metrics
```

**Better approach - Modify track_urls to return cache info:**

Create a wrapper or modify track_urls to track cache hits internally and expose them.

**Implementation Checklist**:
- [ ] Modify `request_html()` to return cache hit status
- [ ] Modify `track_urls()` to track and return cache hit information
- [ ] Update `best_beatport_match()` to use actual cache hit data
- [ ] Test cache hit/miss tracking with real requests
- [ ] Verify cache statistics are accurate

**Acceptance Criteria**:
- ✅ Cache hits are detected correctly
- ✅ Cache misses are detected correctly
- ✅ Cache statistics in performance dashboard are accurate
- ✅ Cache hit rate calculation works correctly
- ✅ Performance reports show correct cache statistics

---

## Phase 3 Deliverables Checklist
- [ ] Performance metrics collection system implemented
- [ ] Performance collection integrated into processing pipeline
- [ ] Performance monitoring dashboard displays real-time metrics
- [ ] Performance reports generated automatically
- [ ] Error recovery and retry logic implemented
- [ ] GUI integration for performance dashboard (with settings toggle)
- [ ] Cache hit/miss tracking integrated with actual cache system
- [ ] All features tested and working
- [ ] Performance improvements documented

---

## Testing Strategy

### Performance Testing
- Measure processing time before/after optimizations
- Test with various playlist sizes (10, 50, 100, 500 tracks)
- Monitor memory usage during processing
- Test cache effectiveness with repeated queries
- Verify metrics collection doesn't impact performance

### Error Recovery Testing
- Test retry logic with simulated network failures
- Test exponential backoff timing
- Test max retries behavior
- Test different error types (timeout, connection error, HTTP errors)
- Test graceful degradation after max retries

### Dashboard Testing
- Test real-time updates during processing
- Test display with various data sizes
- Test export functionality
- Test tips generation logic

---

## Notes

**Note on Step 3.2 (Batch Processing)**: Batch playlist processing was already implemented in Phase 2 (Step 2.6), so it's not repeated here. The focus of Phase 3 is on performance monitoring and reliability improvements.

**Performance Impact**: Metrics collection should have minimal performance impact. Use `time.perf_counter()` for high-resolution timing, and avoid collecting metrics in tight loops.

**Cache Integration**: Cache hit/miss tracking requires integration with the actual cache implementation. This may need to be added to the cache module if it doesn't already exist.

---

*For complete design details, see the referenced design documents in `DOCS/DESIGNS/`.*
