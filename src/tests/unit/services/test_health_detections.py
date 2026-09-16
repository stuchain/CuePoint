#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""When each detection last ran, and a disconnected drive as one line (CLEAN-12).

Health's counts are CLEAN-11's and are tested through the engine. What CLEAN-12
adds is tested here without one:

- **A detection that never ran says so** — ``null``, not a date and not zero.
- **The last run is the activity feed's**, whatever event type it was stored
  under, newest only.
- **A disconnected drive is one finding**, grouped by root, most tracks first,
  and a path with no root is nobody's drive.
"""

from __future__ import annotations

from typing import Any, List, Optional

import pytest

from cuepoint.persistence.activity_repository import ActivityEvent
from cuepoint.services.health_service import (
    HEALTH_DETECTIONS,
    HealthService,
    unavailable_roots,
)


class Tracks:
    """Every count is zero; only the shape of the report is under test here."""

    def count(self) -> int:
        return 3

    def browse_count(self, query: Any) -> int:
        return 0


class Activity:
    def __init__(self, *events: ActivityEvent) -> None:
        self.events = list(events)
        self.asked: List[tuple] = []

    def recent_events(
        self, limit: int = 50, event_type: Optional[str] = None
    ) -> List[ActivityEvent]:
        self.asked.append((limit, event_type))
        found = [event for event in self.events if event.type == event_type]
        return found[:limit]


class Files:
    def __init__(self, *paths: str) -> None:
        self.paths = list(paths)

    def unavailable_paths(self) -> List[str]:
        return list(self.paths)


def event(event_type: str, summary: str, created_at: str) -> ActivityEvent:
    return ActivityEvent(type=event_type, summary=summary, created_at=created_at)


@pytest.mark.unit
class TestLastRuns:
    def test_a_detection_that_never_ran_is_null(self):
        report = HealthService(Tracks(), activity_repository=Activity()).report()
        for run in report.to_dict()["detections"]:
            assert run["last_run_at"] is None
            assert run["last_summary"] is None

    def test_each_reads_its_own_event_newest_only(self):
        activity = Activity(
            event("clean.files.checked", "Checked 3 files", "2026-09-15T10:00:00Z"),
            event("clean.files.checked", "Checked 2 files", "2026-09-14T10:00:00Z"),
            event("clean.artwork.scanned", "Read artwork", "2026-09-13T10:00:00Z"),
        )
        runs = {
            run["id"]: run
            for run in HealthService(Tracks(), activity_repository=activity)
            .report()
            .to_dict()["detections"]
        }

        assert runs["files"]["last_run_at"] == "2026-09-15T10:00:00Z"
        assert runs["files"]["last_summary"] == "Checked 3 files"
        assert runs["artwork"]["last_summary"] == "Read artwork"
        assert runs["duplicates"]["last_run_at"] is None
        assert all(limit == 1 for limit, _ in activity.asked)

    def test_the_detections_and_the_jobs_that_run_them(self):
        assert [(d.id, d.job_type, d.event_type) for d in HEALTH_DETECTIONS] == [
            ("files", "file_check", "clean.files.checked"),
            ("duplicates", "duplicate_scan", "clean.duplicates.scanned"),
            ("artwork", "artwork_scan", "clean.artwork.scanned"),
        ]

    def test_without_a_feed_nothing_is_claimed(self):
        report = HealthService(Tracks()).report().to_dict()
        assert [run["last_run_at"] for run in report["detections"]] == [None] * 3
        assert report["unavailable_roots"] == []

    def test_the_shape(self):
        report = HealthService(
            Tracks(), activity_repository=Activity(), file_status_repository=Files()
        ).report()
        payload = report.to_dict()
        assert set(payload) == {
            "track_count",
            "counts",
            "detections",
            "unavailable_roots",
        }
        assert set(payload["detections"][0]) == {
            "id",
            "label",
            "job_type",
            "last_run_at",
            "last_summary",
        }


@pytest.mark.unit
class TestUnavailableRoots:
    def test_one_finding_per_root_most_tracks_first(self):
        roots = unavailable_roots(
            [
                "\\\\nas\\music\\a.mp3",
                "E:\\Music\\a.mp3",
                "E:\\Music\\Deeper\\b.mp3",
                "/Volumes/USB/c.mp3",
            ]
        )
        assert [(root.root, root.tracks) for root in roots] == [
            ("E:\\", 2),
            ("/Volumes/USB", 1),
            ("\\\\nas\\music\\", 1),
        ]
        assert roots[0].summary == "2 tracks on E:\\ — the drive is not connected"
        assert roots[2].summary == (
            "1 track on \\\\nas\\music\\ — the network location cannot be reached"
        )

    def test_a_path_with_no_root_is_left_out(self):
        assert unavailable_roots(["relative/a.mp3", ""]) == ()

    def test_the_report_carries_them(self):
        report = HealthService(
            Tracks(), file_status_repository=Files("E:\\a.mp3", "E:\\b.mp3")
        ).report()
        assert report.to_dict()["unavailable_roots"] == [
            {
                "root": "E:\\",
                "tracks": 2,
                "summary": "2 tracks on E:\\ — the drive is not connected",
            }
        ]
