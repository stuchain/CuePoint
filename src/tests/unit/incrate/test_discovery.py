"""Unit tests for discovery.run_discovery (Phase 3)."""

from datetime import date, timedelta
from unittest.mock import Mock

import pytest

from cuepoint.incrate.beatport_api_models import (
    ChartDetail,
    ChartSummary,
    ChartTrack,
    DiscoveredTrack,
    LabelRelease,
    LabelReleaseTrack,
)
from cuepoint.incrate.discovery import run_discovery


def _mk_inventory(artists=None, labels=None):
    inv = Mock()
    inv.get_library_artists.return_value = list(artists or [])
    inv.get_library_labels.return_value = list(labels or [])
    return inv


def _mk_api():
    return Mock()


class TestRunDiscoveryEmptyInventory:
    """Empty inventory -> empty result."""

    def test_run_discovery_empty_inventory(self):
        inv = _mk_inventory(artists=[], labels=[])
        api = _mk_api()
        result = run_discovery(
            inv, api,
            genre_ids=[],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 1, 31),
            new_releases_days=30,
        )
        assert result == []


class TestRunDiscoveryChartsBranch:
    """Charts branch: filter by author in library."""

    def test_run_discovery_charts_filters_by_author(self):
        inv = _mk_inventory(artists=["Artist A"], labels=[])
        api = _mk_api()
        api.list_charts.return_value = [
            ChartSummary(1, "Chart 1", 5, "house", None, "Artist A", "2025-02-01", 2),
        ]
        api.get_chart.return_value = ChartDetail(
            1, "Chart 1", "Artist A", "2025-02-01",
            tracks=[
                ChartTrack(100, "Track One", "Artist 1", "https://beatport.com/track/one/100", 1),
                ChartTrack(101, "Track Two", "Artist 2", "https://beatport.com/track/two/101", 2),
            ],
        )
        result = run_discovery(
            inv, api,
            genre_ids=[5],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
        )
        assert len(result) == 2
        assert all(t.source_type == "chart" for t in result)
        assert result[0].beatport_track_id == 100
        assert result[1].beatport_track_id == 101
        assert result[0].source_name == "Chart 1"

    def test_run_discovery_charts_skips_author_not_in_library(self):
        inv = _mk_inventory(artists=["Artist A"], labels=[])
        api = _mk_api()
        api.list_charts.return_value = [
            ChartSummary(1, "Chart 1", 5, "house", None, "Unknown Author", "2025-02-01", 1),
        ]
        result = run_discovery(
            inv, api,
            genre_ids=[5],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
        )
        api.get_chart.assert_not_called()
        assert len(result) == 0

    def test_run_discovery_charts_skips_when_get_chart_returns_none(self):
        inv = _mk_inventory(artists=["Artist A"], labels=[])
        api = _mk_api()
        api.list_charts.return_value = [
            ChartSummary(1, "Chart 1", 5, "house", None, "Artist A", "2025-02-01", 1),
        ]
        api.get_chart.return_value = None
        result = run_discovery(
            inv, api,
            genre_ids=[5],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
        )
        assert len(result) == 0


class TestRunDiscoveryNewReleasesBranch:
    """New releases from library labels."""

    def test_run_discovery_new_releases_adds_tracks(self):
        inv = _mk_inventory(artists=[], labels=["Defected"])
        api = _mk_api()
        api.search_label_by_name.return_value = 5
        api.get_label_releases.return_value = [
            LabelRelease(
                10, "Release One", "2025-02-01",
                tracks=[
                    LabelReleaseTrack(200, "R Track A", "Art A", "https://beatport.com/track/ra/200", "2025-02-01"),
                    LabelReleaseTrack(201, "R Track B", "Art B", "https://beatport.com/track/rb/201", "2025-02-01"),
                ],
            ),
        ]
        result = run_discovery(
            inv, api,
            genre_ids=[],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 1, 31),
            new_releases_days=30,
        )
        assert len(result) == 2
        assert all(t.source_type == "label_release" for t in result)
        assert result[0].beatport_track_id == 200

    def test_run_discovery_label_not_found_skipped(self):
        inv = _mk_inventory(artists=[], labels=["Unknown Label"])
        api = _mk_api()
        api.search_label_by_name.return_value = None
        result = run_discovery(
            inv, api,
            genre_ids=[],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 1, 31),
            new_releases_days=30,
        )
        api.get_label_releases.assert_not_called()
        assert len(result) == 0


class TestRunDiscoveryDedupe:
    """Deduplication by beatport_track_id."""

    def test_run_discovery_dedupe_same_track_in_chart_and_release(self):
        inv = _mk_inventory(artists=["Artist A"], labels=["Defected"])
        api = _mk_api()
        api.list_charts.return_value = [
            ChartSummary(1, "C1", 5, "house", None, "Artist A", "2025-02-01", 1),
        ]
        api.get_chart.return_value = ChartDetail(
            1, "C1", "Artist A", "2025-02-01",
            tracks=[ChartTrack(99, "Same", "Art", "https://beatport.com/track/same/99", 1)],
        )
        api.search_label_by_name.return_value = 1
        api.get_label_releases.return_value = [
            LabelRelease(1, "R1", "2025-02-01", tracks=[
                LabelReleaseTrack(99, "Same", "Art", "https://beatport.com/track/same/99", "2025-02-01"),
            ]),
        ]
        result = run_discovery(
            inv, api,
            genre_ids=[5],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
        )
        assert len(result) == 1
        assert result[0].beatport_track_id == 99


class TestRunDiscoveryProgressCallback:
    """Progress callback called."""

    def test_run_discovery_progress_callback_called(self):
        inv = _mk_inventory(artists=["Artist A"], labels=[])
        api = _mk_api()
        api.list_charts.return_value = [
            ChartSummary(1, "C1", 5, "house", None, "Artist A", "2025-02-01", 0),
        ]
        api.get_chart.return_value = ChartDetail(1, "C1", "Artist A", "2025-02-01", tracks=[])
        progress = Mock()
        run_discovery(
            inv, api,
            genre_ids=[5, 12],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
            progress_callback=progress,
        )
        assert progress.call_count >= 2
        calls = [c[0][0] for c in progress.call_args_list]
        assert "charts" in calls


class TestRunDiscoveryDateFilter:
    """Date filtering is applied via API params."""

    def test_run_discovery_date_filter_charts(self):
        inv = _mk_inventory(artists=[], labels=[])
        api = _mk_api()
        api.list_charts.return_value = []
        run_discovery(
            inv, api,
            genre_ids=[5],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 1, 31),
            new_releases_days=30,
        )
        api.list_charts.assert_called_once()
        args, kwargs = api.list_charts.call_args
        assert args[1] == date(2025, 1, 1)
        assert args[2] == date(2025, 1, 31)
