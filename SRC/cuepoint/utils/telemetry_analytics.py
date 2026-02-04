#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Telemetry Analytics (Step 14)

Load and aggregate local telemetry events for the analytics dashboard.
Respects 30-day retention; events older than 30 days are excluded.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Same path as TelemetryService
TELEMETRY_DATA_DIR = Path.home() / ".cuepoint" / "telemetry"
EVENTS_FILE = TELEMETRY_DATA_DIR / "events.jsonl"
RETENTION_DAYS = 30


@dataclass
class TelemetryMetrics:
    """Aggregated telemetry metrics for dashboard display."""

    total_runs: int = 0
    completed_runs: int = 0
    failed_runs: int = 0
    run_success_rate: float = 0.0
    avg_match_rate: float = 0.0
    total_tracks_processed: int = 0
    total_tracks_matched: int = 0
    app_sessions: int = 0
    exports: int = 0
    events_in_window: int = 0
    oldest_event: Optional[datetime] = None
    newest_event: Optional[datetime] = None


def _parse_timestamp(ts: str) -> Optional[datetime]:
    """Parse ISO8601 timestamp."""
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def load_events(
    events_path: Optional[Path] = None,
    max_age_days: int = RETENTION_DAYS,
) -> List[Dict[str, Any]]:
    """Load events from JSONL file, filtering by retention.

    Args:
        events_path: Path to events.jsonl (default: ~/.cuepoint/telemetry/events.jsonl)
        max_age_days: Exclude events older than this many days (default: 30)

    Returns:
        List of event dicts within retention window, oldest first.
    """
    path = events_path or EVENTS_FILE
    if not path.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    events: List[Dict[str, Any]] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                    ts = _parse_timestamp(ev.get("timestamp", ""))
                    if ts and ts >= cutoff:
                        events.append(ev)
                except (json.JSONDecodeError, TypeError):
                    continue
    except (OSError, IOError):
        pass
    return events


def compute_metrics(events: List[Dict[str, Any]]) -> TelemetryMetrics:
    """Compute aggregated metrics from event list.

    Args:
        events: List of event dicts from load_events()

    Returns:
        TelemetryMetrics with run success rate, match rate, etc.
    """
    m = TelemetryMetrics()
    run_completes: List[float] = []
    total_tracks = 0
    matched_tracks = 0

    for ev in events:
        name = ev.get("event", "")
        props = ev.get("properties") or {}
        ts = _parse_timestamp(ev.get("timestamp", ""))

        if ts:
            if m.oldest_event is None or ts < m.oldest_event:
                m.oldest_event = ts
            if m.newest_event is None or ts > m.newest_event:
                m.newest_event = ts

        if name == "app_start":
            m.app_sessions += 1
        elif name == "run_start":
            m.total_runs += 1
        elif name == "run_complete":
            m.completed_runs += 1
            mr = props.get("match_rate")
            if mr is not None:
                run_completes.append(float(mr))
            total_tracks += int(props.get("tracks", 0) or 0)
            matched_tracks += int(props.get("tracks_matched", 0) or 0)
        elif name == "run_error":
            m.failed_runs += 1
        elif name == "export_complete":
            m.exports += int(props.get("output_count", 0) or 0)

    m.events_in_window = len(events)
    m.total_tracks_processed = total_tracks
    m.total_tracks_matched = matched_tracks

    if m.total_runs > 0:
        m.run_success_rate = m.completed_runs / m.total_runs
    if run_completes:
        m.avg_match_rate = sum(run_completes) / len(run_completes)

    return m


def get_dashboard_metrics(
    events_path: Optional[Path] = None,
    max_age_days: int = RETENTION_DAYS,
) -> TelemetryMetrics:
    """Load events and compute metrics for the dashboard.

    Args:
        events_path: Optional path to events file
        max_age_days: Retention window in days

    Returns:
        TelemetryMetrics for display
    """
    events = load_events(events_path=events_path, max_age_days=max_age_days)
    return compute_metrics(events)
