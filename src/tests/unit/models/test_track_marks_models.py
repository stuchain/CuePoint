#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The models over ``track_cues`` and ``track_beat_grid`` (WAVE-04).

Each refuses what its table refuses, and says where it was built rather than
as an ``IntegrityError`` far from the mistake. A track's marks sum themselves
up for the Inspector, and fingerprint themselves exactly as the reader's
values do, which is what a refresh compares.
"""

from __future__ import annotations

import pytest

from cuepoint.models.track_marks import (
    EMPTY_FINGERPRINT,
    BeatGridMarker,
    TrackCue,
    TrackMarks,
    marks_fingerprint,
)

pytestmark = pytest.mark.unit


def cue(**overrides) -> TrackCue:
    values = dict(
        position=0,
        kind="cue",
        hot_cue=0,
        start_ms=64025,
        end_ms=None,
        name="Drop",
        color="#28e214",
    )
    values.update(overrides)
    return TrackCue(**values)


class TestTrackCue:
    def test_a_valid_cue(self):
        built = cue()
        assert built.letter == "A"
        assert built.values() == ("cue", 0, 64025, None, "Drop", "#28e214")

    def test_a_memory_cue_has_no_letter(self):
        assert cue(hot_cue=None).letter is None

    def test_every_slot_has_its_letter(self):
        assert [cue(hot_cue=n).letter for n in range(8)] == list("ABCDEFGH")

    @pytest.mark.parametrize(
        "overrides",
        [
            {"kind": "hot"},
            {"hot_cue": 8},
            {"hot_cue": -1},
            {"hot_cue": True},
            {"start_ms": -1},
            {"start_ms": 2**31},
            {"end_ms": 64025},
            {"end_ms": 1},
            {"color": "#FFF"},
            {"color": "#28E214"},
            {"color": "28e214"},
            {"position": -1},
            {"name": 5},
        ],
    )
    def test_it_refuses_what_its_table_refuses(self, overrides):
        with pytest.raises(ValueError):
            cue(**overrides)

    def test_an_empty_name_is_no_name(self):
        assert cue(name="").name is None

    def test_it_round_trips_through_a_row(self):
        built = cue(kind="loop", end_ms=70000)
        row = {"track_id": 3, "position": 0, **built.to_dict()}
        assert TrackCue.from_row(row) == built


class TestBeatGridMarker:
    def test_a_valid_marker(self):
        marker = BeatGridMarker(position=0, start_ms=25, bpm=128.0, meter="4/4", beat=1)
        assert marker.values() == (25, 128.0, "4/4", 1)
        assert BeatGridMarker.from_row(
            {"track_id": 1, "position": 0, **marker.to_dict()}
        ) == (marker)

    @pytest.mark.parametrize(
        "overrides",
        [
            {"bpm": 0},
            {"bpm": -1},
            {"bpm": float("nan")},
            {"bpm": float("inf")},
            {"beat": 0},
            {"beat": 5},
            {"start_ms": -1},
        ],
    )
    def test_it_refuses_what_its_table_refuses(self, overrides):
        values = dict(position=0, start_ms=0, bpm=128.0, meter="4/4", beat=1)
        values.update(overrides)
        with pytest.raises(ValueError):
            BeatGridMarker(**values)


VALUES_CUES = [
    ("cue", None, 25, None, "Intro", None),
    ("cue", 0, 64025, None, "Drop", "#28e214"),
    ("loop", 2, 120025, 127525, "Build loop", "#ff8c00"),
]
VALUES_GRID = [(120, 121.0, "4/4", 1), (60120, 122.5, "4/4", 3)]


class TestTrackMarks:
    def test_built_from_values_in_order(self):
        marks = TrackMarks.from_values(7, VALUES_CUES, VALUES_GRID)
        assert [c.position for c in marks.cues] == [0, 1, 2]
        assert [m.position for m in marks.grid] == [0, 1]
        assert [c.values() for c in marks.cues] == VALUES_CUES

    def test_built_from_rows_in_any_order(self):
        marks = TrackMarks.from_values(7, VALUES_CUES, VALUES_GRID)
        rows = [
            {"track_id": 7, "position": c.position, **c.to_dict()} for c in marks.cues
        ]
        grid = [
            {"track_id": 7, "position": m.position, **m.to_dict()} for m in marks.grid
        ]
        assert TrackMarks.from_rows(7, reversed(rows), reversed(grid)) == marks

    def test_it_refuses_marks_out_of_order(self):
        with pytest.raises(ValueError):
            TrackMarks(track_id=1, cues=(cue(position=1), cue(position=0)))
        with pytest.raises(ValueError):
            TrackMarks(track_id=1, cues=(cue(position=0), cue(position=0)))

    def test_its_fingerprint_is_the_reader_s(self):
        marks = TrackMarks.from_values(7, VALUES_CUES, VALUES_GRID)
        assert marks.fingerprint == marks_fingerprint(VALUES_CUES, VALUES_GRID)
        assert TrackMarks(track_id=7).fingerprint == EMPTY_FINGERPRINT

    def test_a_moved_cue_changes_the_fingerprint(self):
        moved = [*VALUES_CUES[:2], ("loop", 2, 120026, 127525, "Build loop", "#ff8c00")]
        assert marks_fingerprint(moved, VALUES_GRID) != marks_fingerprint(
            VALUES_CUES, VALUES_GRID
        )

    def test_order_is_part_of_the_fingerprint(self):
        assert marks_fingerprint(list(reversed(VALUES_CUES)), VALUES_GRID) != (
            marks_fingerprint(VALUES_CUES, VALUES_GRID)
        )

    def test_its_summary(self):
        summary = TrackMarks.from_values(7, VALUES_CUES, VALUES_GRID).summary(read=True)
        assert summary["read"] is True
        assert summary["hot_cues"] == 2
        assert summary["memory_cues"] == 1
        assert summary["cues"][1] == {
            "kind": "cue",
            "hot_cue": 0,
            "start_ms": 64025,
            "end_ms": None,
            "name": "Drop",
            "color": "#28e214",
        }
        assert summary["beat_grid"] == {
            "markers": 2,
            "bpm": 121.0,
            "min_bpm": 121.0,
            "max_bpm": 122.5,
            "variable": True,
        }

    def test_two_markers_at_one_tempo_are_not_a_variable_grid(self):
        marks = TrackMarks.from_values(
            1, [], [(0, 128.0, "4/4", 1), (60000, 128.0, "4/4", 1)]
        )
        assert marks.is_variable is False
        assert marks.summary(read=True)["beat_grid"]["variable"] is False

    def test_a_track_without_marks(self):
        summary = TrackMarks(track_id=1).summary(read=False)
        assert summary == {
            "read": False,
            "hot_cues": 0,
            "memory_cues": 0,
            "cues": [],
            "beat_grid": None,
        }
