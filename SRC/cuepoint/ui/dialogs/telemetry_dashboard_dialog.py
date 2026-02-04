#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Telemetry Dashboard Dialog (Step 14)

Simple analytics dashboard for trend review.
Shows run success rate, match rate, and error trends from local telemetry.
"""

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QDialog, QGroupBox, QHBoxLayout, QLabel, QPushButton, QVBoxLayout

from cuepoint.utils.telemetry_analytics import (
    RETENTION_DAYS,
    TelemetryMetrics,
    get_dashboard_metrics,
)


class TelemetryDashboardDialog(QDialog):
    """Simple analytics dashboard showing telemetry trends (Step 14)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()

    def _setup_ui(self):
        self.setWindowTitle("Analytics Dashboard")
        self.setModal(False)
        self.setMinimumSize(420, 380)

        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Info banner
        info = QLabel(
            "Anonymous usage data from the last 30 days. "
            "All data is stored locally. Enable telemetry in Settings → Privacy to collect data."
        )
        info.setWordWrap(True)
        info.setStyleSheet("color: #888; font-size: 11px;")
        layout.addWidget(info)

        # Metrics group
        metrics_group = QGroupBox("Usage Trends")
        metrics_layout = QVBoxLayout()
        self._metrics_labels: dict[str, QLabel] = {}
        for key, label in [
            ("runs", "Total runs:"),
            ("success_rate", "Run success rate:"),
            ("match_rate", "Average match rate:"),
            ("tracks", "Tracks processed:"),
            ("matched", "Tracks matched:"),
            ("errors", "Failed runs:"),
            ("sessions", "App sessions:"),
        ]:
            row = QHBoxLayout()
            lbl = QLabel(label)
            val = QLabel("—")
            val.setObjectName(f"metric_{key}")
            row.addWidget(lbl)
            row.addStretch()
            row.addWidget(val)
            metrics_layout.addLayout(row)
            self._metrics_labels[key] = val
        metrics_group.setLayout(metrics_layout)
        layout.addWidget(metrics_group)

        # Data window
        window_group = QGroupBox("Data Window")
        window_layout = QVBoxLayout()
        self._window_label = QLabel("—")
        window_layout.addWidget(self._window_label)
        window_group.setLayout(window_layout)
        layout.addWidget(window_group)

        # Buttons
        btn_layout = QHBoxLayout()
        refresh_btn = QPushButton("Refresh")
        refresh_btn.clicked.connect(self._refresh)
        btn_layout.addWidget(refresh_btn)
        btn_layout.addStretch()
        layout.addLayout(btn_layout)

        self._refresh()

    def _format_metrics(self, m: TelemetryMetrics) -> None:
        """Update labels with computed metrics."""
        self._metrics_labels["runs"].setText(str(m.total_runs))
        self._metrics_labels["success_rate"].setText(
            f"{m.run_success_rate * 100:.1f}%" if m.total_runs else "—"
        )
        self._metrics_labels["match_rate"].setText(
            f"{m.avg_match_rate * 100:.1f}%" if m.avg_match_rate > 0 else "—"
        )
        self._metrics_labels["tracks"].setText(str(m.total_tracks_processed))
        self._metrics_labels["matched"].setText(str(m.total_tracks_matched))
        self._metrics_labels["errors"].setText(str(m.failed_runs))
        self._metrics_labels["sessions"].setText(str(m.app_sessions))

        if m.oldest_event and m.newest_event:
            fmt = "%Y-%m-%d %H:%M"
            self._window_label.setText(
                f"{m.oldest_event.strftime(fmt)} — {m.newest_event.strftime(fmt)} "
                f"({m.events_in_window} events)"
            )
        elif m.events_in_window == 0:
            self._window_label.setText(
                f"No telemetry data yet. Enable telemetry in Settings → Privacy."
            )
        else:
            self._window_label.setText(f"{m.events_in_window} events")

    def _refresh(self) -> None:
        """Reload metrics and update display."""
        try:
            m = get_dashboard_metrics(max_age_days=RETENTION_DAYS)
            self._format_metrics(m)
        except Exception as e:
            self._metrics_labels["runs"].setText("Error")
            self._window_label.setText(str(e))
