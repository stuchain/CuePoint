#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Job result payloads must be JSON-serializable.

``GET /api/v1/jobs/{id}/results`` runs every result through
``track_result_to_dict`` and then ``json.dumps``. Results from the real matching
pipeline carry ``BeatportCandidate`` objects, which are not serializable; the
renderer-shaped dicts live in ``candidates_data``.
"""

from __future__ import annotations

import json

import pytest

from cuepoint.compat.gui_types import TrackResult as CompatTrackResult
from cuepoint.engine.jobs import track_result_to_dict
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.result import TrackResult


def _candidate(title: str = "Candidate") -> BeatportCandidate:
    return BeatportCandidate(
        url="https://www.beatport.com/track/x/1",
        title=title,
        artists="BP Artist",
        label="Label",
        release_date="2020-01-01",
        bpm="128",
        key="Am",
        genre="House",
        score=90.0,
        title_sim=95,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=88.0,
        bonus_year=1,
        bonus_key=1,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=10,
        is_winner=True,
    )


def _renderer_row(title: str = "Candidate") -> dict:
    return {
        "candidate_title": title,
        "candidate_artists": "BP Artist",
        "candidate_url": "https://www.beatport.com/track/x/1",
        "final_score": 90.0,
    }


@pytest.mark.unit
class TestRealPipelineResults:
    def test_payload_is_json_serializable(self):
        """Regression: BeatportCandidate objects broke the results endpoint."""
        result = TrackResult(
            playlist_index=1,
            title="Track",
            artist="Artist",
            matched=True,
            candidates=[_candidate()],
            candidates_data=[_renderer_row()],
        )
        json.dumps(track_result_to_dict(result))  # must not raise

    def test_uses_renderer_shaped_candidate_rows(self):
        """The renderer reads candidate_title/candidate_url/final_score."""
        result = TrackResult(
            playlist_index=1,
            title="Track",
            artist="Artist",
            matched=True,
            candidates=[_candidate()],
            candidates_data=[_renderer_row("Primary")],
        )
        rows = track_result_to_dict(result)["candidates"]
        assert rows[0]["candidate_title"] == "Primary"

    def test_objects_without_renderer_rows_are_omitted_not_crashing(self):
        """Better an empty list than a 500 for the whole results request."""
        result = TrackResult(
            playlist_index=1,
            title="Track",
            artist="Artist",
            matched=True,
            candidates=[_candidate()],
        )
        payload = track_result_to_dict(result)
        assert "candidates" not in payload
        json.dumps(payload)

    def test_file_path_included_when_present(self):
        result = TrackResult(
            playlist_index=1,
            title="Track",
            artist="Artist",
            matched=False,
            file_path="/music/track.mp3",
        )
        assert track_result_to_dict(result)["file_path"] == "/music/track.mp3"


@pytest.mark.unit
class TestDemoAndLegacyResults:
    def test_dict_candidates_pass_through(self):
        result = CompatTrackResult(
            playlist_index=1,
            title="Demo",
            artist="Demo Artist",
            matched=True,
            candidates=[_renderer_row("Demo Candidate")],
        )
        payload = track_result_to_dict(result)
        assert payload["candidates"][0]["candidate_title"] == "Demo Candidate"
        json.dumps(payload)

    def test_no_candidates_key_when_empty(self):
        result = CompatTrackResult(
            playlist_index=1, title="Demo", artist="Demo Artist", matched=False
        )
        assert "candidates" not in track_result_to_dict(result)

    def test_core_fields_unchanged(self):
        """The payload contract the renderer depends on must not drift."""
        result = CompatTrackResult(
            playlist_index=3,
            title="T",
            artist="A",
            matched=True,
            beatport_title="BT",
            beatport_url="https://example.com",
            match_score=88.0,
            confidence="high",
        )
        payload = track_result_to_dict(result)
        assert payload["playlist_index"] == 3
        assert payload["title"] == "T"
        assert payload["artist"] == "A"
        assert payload["matched"] is True
        assert payload["beatport_title"] == "BT"
        assert payload["match_score"] == 88.0
        assert payload["confidence"] == "high"
        assert payload["write"] is False
