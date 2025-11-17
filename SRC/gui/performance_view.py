#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Monitoring Dashboard

This module provides a GUI widget for displaying real-time performance metrics
during playlist processing.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QTableWidget,
    QTableWidgetItem, QPushButton, QGroupBox, QTextEdit, QMessageBox
)
from PySide6.QtCore import Qt, QTimer
from typing import Optional
from collections import defaultdict
import sys
import os

# Import performance collector
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
            # Show a message when no data is available
            self.overall_table.setRowCount(1)
            self.overall_table.setItem(0, 0, QTableWidgetItem("Status"))
            self.overall_table.setItem(0, 1, QTableWidgetItem("No performance data available yet"))
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
        try:
            from output_writer import write_performance_report
        except ImportError:
            QMessageBox.information(self, "Not Available", "Performance report export is not yet implemented.")
            return
        
        stats = performance_collector.get_stats()
        if not stats:
            QMessageBox.information(self, "No Data", "No performance data available to export.")
            return
        
        # Generate and save report
        try:
            report_path = write_performance_report(stats, "performance_report")
            QMessageBox.information(
                self,
                "Report Exported",
                f"Performance report saved to:\n{report_path}"
            )
        except Exception as e:
            QMessageBox.warning(
                self,
                "Export Error",
                f"Failed to export report:\n{str(e)}"
            )

