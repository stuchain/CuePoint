#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for inCrate past discovery-run storage.

This module had no test coverage. It is the store behind "past searches" in the
inCrate UI, and it is deliberately forgiving — a corrupt or partly-invalid file
must degrade to "no history" rather than break discovery. That tolerance is the
part worth pinning: without tests it is indistinguishable from silently losing
data.

Every test redirects the storage path to a temp directory; the developer's real
history is never touched.
"""

from __future__ import annotations

import json

import pytest

from cuepoint.incrate import past_results_storage
from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.incrate.past_results_storage import (
    MAX_SAVED_RUNS,
    PastDiscoveryRun,
    load_past_results,
    save_past_result,
)


@pytest.fixture(autouse=True)
def storage_path(tmp_path, monkeypatch):
    """Point storage at a temp file for every test in this module."""
    path = tmp_path / "incrate_past_results.json"
    monkeypatch.setattr(past_results_storage, "_path", lambda: path)
    return path


def _track(track_id: int = 1, title: str = "Track") -> DiscoveredTrack:
    return DiscoveredTrack(
        beatport_track_id=track_id,
        beatport_url=f"https://www.beatport.com/track/x/{track_id}",
        title=title,
        artists="Artist",
        source_type="chart",
        source_name="Some Chart",
        source_label_name=None,
        source_url=None,
    )


@pytest.mark.unit
class TestSaveAndLoad:
    def test_no_file_yields_no_history(self):
        assert load_past_results() == []

    def test_round_trip(self, storage_path):
        saved = save_past_result([1, 2], ["Artist"], ["Label"], [_track(7, "Song")])

        assert saved is not None
        assert storage_path.exists()

        loaded = load_past_results()
        assert len(loaded) == 1
        assert loaded[0].run_id == saved.run_id
        assert loaded[0].genre_ids == [1, 2]
        assert loaded[0].artist_names == ["Artist"]
        assert loaded[0].label_names == ["Label"]
        assert loaded[0].tracks[0].beatport_track_id == 7
        assert loaded[0].tracks[0].title == "Song"

    def test_empty_result_is_not_saved(self, storage_path):
        """A run that found nothing is not history worth keeping."""
        assert save_past_result([1], [], [], []) is None
        assert not storage_path.exists()

    def test_newest_run_is_first(self):
        save_past_result([1], [], [], [_track(1, "First")])
        save_past_result([2], [], [], [_track(2, "Second")])

        loaded = load_past_results()
        assert [r.tracks[0].title for r in loaded] == ["Second", "First"]

    def test_history_is_capped(self):
        for i in range(MAX_SAVED_RUNS + 5):
            save_past_result([i], [], [], [_track(i, f"Track {i}")])

        loaded = load_past_results()
        assert len(loaded) == MAX_SAVED_RUNS
        # The cap drops the oldest, not the newest.
        assert loaded[0].tracks[0].title == f"Track {MAX_SAVED_RUNS + 4}"

    def test_directory_is_created(self, tmp_path, monkeypatch):
        nested = tmp_path / "a" / "b" / "results.json"
        monkeypatch.setattr(past_results_storage, "_path", lambda: nested)

        save_past_result([1], [], [], [_track()])

        assert nested.exists()


@pytest.mark.unit
class TestToleratesBadData:
    """Broken history must degrade to "no history", never break discovery."""

    def test_unparseable_file(self, storage_path):
        storage_path.write_text("this is not json", encoding="utf-8")
        assert load_past_results() == []

    def test_empty_file(self, storage_path):
        storage_path.write_text("", encoding="utf-8")
        assert load_past_results() == []

    def test_missing_runs_key(self, storage_path):
        storage_path.write_text(json.dumps({"something": "else"}), encoding="utf-8")
        assert load_past_results() == []

    def test_null_runs(self, storage_path):
        storage_path.write_text(json.dumps({"runs": None}), encoding="utf-8")
        assert load_past_results() == []

    def test_partial_run_data_is_filled_in(self, storage_path):
        storage_path.write_text(
            json.dumps({"runs": [{"run_id": "only-an-id"}]}), encoding="utf-8"
        )

        loaded = load_past_results()

        assert len(loaded) == 1
        assert loaded[0].run_id == "only-an-id"
        assert loaded[0].genre_ids == []
        assert loaded[0].tracks == []

    def test_saving_over_a_corrupt_file_still_works(self, storage_path):
        """A broken history file must not make the feature permanently fail."""
        storage_path.write_text("garbage", encoding="utf-8")

        saved = save_past_result([1], [], [], [_track(5, "Recovered")])

        assert saved is not None
        loaded = load_past_results()
        assert [r.tracks[0].title for r in loaded] == ["Recovered"]


@pytest.mark.unit
class TestPastDiscoveryRunSerialization:
    def test_to_dict_and_back(self):
        run = PastDiscoveryRun(
            run_id="abc",
            timestamp="2026-01-01T00:00:00+00:00",
            genre_ids=[1],
            artist_names=["A"],
            label_names=["L"],
            tracks=[_track(3, "T")],
        )

        restored = PastDiscoveryRun.from_dict(run.to_dict())

        assert restored.run_id == "abc"
        assert restored.timestamp == "2026-01-01T00:00:00+00:00"
        assert restored.tracks[0].beatport_track_id == 3

    def test_from_dict_of_empty_mapping(self):
        run = PastDiscoveryRun.from_dict({})
        assert run.run_id == ""
        assert run.tracks == []

    def test_optional_track_fields_survive(self):
        track = DiscoveredTrack(
            beatport_track_id=9,
            beatport_url="https://example.com",
            title="T",
            artists="A",
            source_type="label",
            source_name="Label Name",
            source_label_name="Defected",
            source_url="https://example.com/label",
        )
        run = PastDiscoveryRun("id", "ts", [], [], [], [track])

        restored = PastDiscoveryRun.from_dict(run.to_dict())

        assert restored.tracks[0].source_label_name == "Defected"
        assert restored.tracks[0].source_url == "https://example.com/label"
