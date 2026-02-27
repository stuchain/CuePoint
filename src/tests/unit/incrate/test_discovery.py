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
    """Charts branch: filter by chart author (curator); add ALL tracks from those charts."""

    def test_run_discovery_charts_includes_all_tracks_from_author_charts(self):
        inv = _mk_inventory(artists=["Artist A"], labels=[])
        api = _mk_api()
        api.list_charts.return_value = [
            ChartSummary(1, "Chart 1", 5, "house", None, "Artist A", "2025-02-01", 2),
        ]
        api.get_chart.return_value = ChartDetail(
            1, "Chart 1", "Artist A", "2025-02-01",
            tracks=[
                ChartTrack(100, "Track One", "Artist A", "https://beatport.com/track/one/100", 1),
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
        assert result[0].beatport_track_id == 100
        assert result[1].beatport_track_id == 101
        assert result[0].source_type == "chart"
        assert result[0].source_name == "Chart 1"

    def test_run_discovery_charts_skips_charts_by_other_authors(self):
        inv = _mk_inventory(artists=["Artist A"], labels=[])
        api = _mk_api()
        api.list_charts.return_value = [
            ChartSummary(1, "Chart 1", 5, "house", None, "Unknown Author", "2025-02-01", 1),
        ]
        api.get_chart.return_value = ChartDetail(
            1, "Chart 1", "Unknown Author", "2025-02-01",
            tracks=[
                ChartTrack(100, "Track One", "Artist 1", "https://beatport.com/track/one/100", 1),
            ],
        )
        result = run_discovery(
            inv, api,
            genre_ids=[5],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
        )
        assert api.get_chart.call_count >= 1
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
        # Genre charts first, then fallback (genre_id=0) when 0 tracks
        assert api.list_charts.call_count >= 1
        args, kwargs = api.list_charts.call_args_list[0][0], api.list_charts.call_args_list[0][1]
        assert args[1] == date(2025, 1, 1)
        assert args[2] == date(2025, 1, 31)


class TestRunDiscoveryArtistLabelFilter:
    """Artist and label selection filters discovery."""

    def test_run_discovery_artist_filter_only_uses_selected_artists(self):
        """When library_artist_names is set, only charts by those authors are included (all tracks from each)."""
        inv = _mk_inventory(artists=["Jimi Jules", "Marasi", "Other"], labels=[])
        api = _mk_api()
        api.list_charts.return_value = [
            ChartSummary(1, "C1", 5, "", None, "Jimi Jules", "2025-02-01", 1),
            ChartSummary(2, "C2", 5, "", None, "Other", "2025-02-01", 1),
        ]
        api.get_chart.side_effect = [
            ChartDetail(1, "C1", "Jimi Jules", "2025-02-01", [
                ChartTrack(10, "T1", "Jimi Jules", "https://b.com/10", 1),
            ]),
            ChartDetail(2, "C2", "Other", "2025-02-01", [
                ChartTrack(20, "T2", "Other", "https://b.com/20", 1),
            ]),
        ]
        result = run_discovery(
            inv, api,
            genre_ids=[5],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
            library_artist_names=["Jimi Jules"],
            library_label_names=None,
        )
        chart_tracks = [t for t in result if t.source_type == "chart"]
        assert len(chart_tracks) == 1
        assert chart_tracks[0].beatport_track_id == 10
        assert chart_tracks[0].artists == "Jimi Jules"

    def test_run_discovery_label_filter_only_uses_selected_labels(self):
        """When library_label_names is set, only those labels are fetched for releases."""
        inv = _mk_inventory(artists=[], labels=["Nothing But", "Kompakt", "Other Label"])
        api = _mk_api()
        api.search_label_by_name.side_effect = [43219, 100, 200]
        api.get_label_releases.side_effect = [
            [LabelRelease(1, "R1", "2025-02-01", [
                LabelReleaseTrack(1, "T1", "A1", "https://b.com/1", "2025-02-01"),
            ])],
            [LabelRelease(2, "R2", "2025-02-01", [
                LabelReleaseTrack(2, "T2", "A2", "https://b.com/2", "2025-02-01"),
            ])],
        ]
        result = run_discovery(
            inv, api,
            genre_ids=[],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
            library_artist_names=None,
            library_label_names=["Nothing But", "Kompakt"],
        )
        release_tracks = [t for t in result if t.source_type == "label_release"]
        assert len(release_tracks) == 2
        assert api.search_label_by_name.call_count == 2
        api.search_label_by_name.assert_any_call("Nothing But")
        api.search_label_by_name.assert_any_call("Kompakt")
