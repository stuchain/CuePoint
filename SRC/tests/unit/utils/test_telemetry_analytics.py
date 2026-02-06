#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for telemetry analytics (Step 14 dashboard).
"""



from cuepoint.utils.telemetry_analytics import (
    compute_metrics,
    get_dashboard_metrics,
    load_events,
)


def test_load_events_empty_file(tmp_path):
    """Empty or missing file returns empty list."""
    path = tmp_path / "events.jsonl"
    assert load_events(events_path=path) == []
    path.write_text("")
    assert load_events(events_path=path) == []


def test_load_events_parses_valid_jsonl(tmp_path):
    """Valid JSONL lines are parsed."""
    path = tmp_path / "events.jsonl"
    path.write_text(
        '{"event":"app_start","timestamp":"2026-02-04T12:00:00+00:00"}\n'
        '{"event":"run_complete","timestamp":"2026-02-04T12:01:00+00:00","properties":{"match_rate":0.9}}\n'
    )
    events = load_events(events_path=path, max_age_days=365)
    assert len(events) == 2
    assert events[0]["event"] == "app_start"
    assert events[1]["event"] == "run_complete"
    assert events[1]["properties"]["match_rate"] == 0.9


def test_compute_metrics_run_success_rate():
    """Run success rate = completed / (completed + failed)."""
    events = [
        {"event": "run_start"},
        {"event": "run_complete", "properties": {}},
        {"event": "run_start"},
        {"event": "run_error", "properties": {}},
    ]
    m = compute_metrics(events)
    assert m.total_runs == 2
    assert m.completed_runs == 1
    assert m.failed_runs == 1
    assert m.run_success_rate == 0.5


def test_compute_metrics_match_rate():
    """Average match rate from run_complete events."""
    events = [
        {"event": "run_complete", "properties": {"match_rate": 0.8}},
        {"event": "run_complete", "properties": {"match_rate": 1.0}},
    ]
    m = compute_metrics(events)
    assert m.avg_match_rate == 0.9


def test_compute_metrics_app_sessions():
    """App sessions counted from app_start."""
    events = [
        {"event": "app_start"},
        {"event": "app_start"},
    ]
    m = compute_metrics(events)
    assert m.app_sessions == 2


def test_get_dashboard_metrics_integration(tmp_path):
    """Full pipeline: file -> load -> compute."""
    path = tmp_path / "events.jsonl"
    path.write_text(
        '{"event":"app_start","timestamp":"2026-02-04T12:00:00+00:00"}\n'
        '{"event":"run_start","timestamp":"2026-02-04T12:00:01+00:00"}\n'
        '{"event":"run_complete","timestamp":"2026-02-04T12:01:00+00:00","properties":{"match_rate":0.85,"tracks":10,"tracks_matched":8}}\n'
    )
    m = get_dashboard_metrics(events_path=path, max_age_days=365)
    assert m.app_sessions == 1
    assert m.total_runs == 1
    assert m.completed_runs == 1
    assert m.run_success_rate == 1.0
    assert m.avg_match_rate == 0.85
    assert m.total_tracks_processed == 10
    assert m.total_tracks_matched == 8
    assert m.events_in_window == 3
