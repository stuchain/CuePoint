#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a Library row says about Clean (CLEAN-11).

The model accepts exactly the answers the rule vocabulary can give, and refuses
anything else: a row carrying a state no filter can find would be a row the
Library marks and no Smart Collection could hold.
"""

from __future__ import annotations

import pytest

from cuepoint.models.filter_rule import ARTWORK_VALUES
from cuepoint.models.file_status import FILE_NOT_CHECKED, FILE_STATUSES
from cuepoint.models.match_attempt import MATCH_STATES, STATE_NOT_MATCHED
from cuepoint.models.track_clean_state import TrackCleanState


@pytest.mark.unit
class TestTheVocabulary:
    @pytest.mark.parametrize("state", MATCH_STATES + (STATE_NOT_MATCHED,))
    def test_every_match_state_a_filter_can_find(self, state):
        assert TrackCleanState(1, match_state=state).match_state == state

    @pytest.mark.parametrize("status", FILE_STATUSES + (FILE_NOT_CHECKED,))
    def test_every_file_status(self, status):
        assert TrackCleanState(1, file_status=status).file_status == status

    @pytest.mark.parametrize("artwork", ARTWORK_VALUES)
    def test_every_artwork_answer(self, artwork):
        assert TrackCleanState(1, artwork=artwork).artwork == artwork

    def test_a_track_nothing_is_known_about(self):
        state = TrackCleanState(7)
        assert state.to_dict() == {
            "match_state": "not_matched",
            "match_disputed": False,
            "match_score": None,
            "file_status": "not_checked",
            "artwork": "unknown",
        }


@pytest.mark.unit
class TestRefusals:
    @pytest.mark.parametrize(
        "field, value",
        [
            ("match_state", "maybe"),
            ("match_state", "error"),
            ("file_status", "gone"),
            ("artwork", "present"),
        ],
    )
    def test_an_answer_no_filter_gives(self, field, value):
        with pytest.raises(ValueError, match=field):
            TrackCleanState(1, **{field: value})

    def test_a_dispute_that_is_not_yes_or_no(self):
        with pytest.raises(ValueError):
            TrackCleanState(1, match_disputed="yes")

    def test_no_track(self):
        with pytest.raises(ValueError):
            TrackCleanState(None)  # type: ignore[arg-type]


@pytest.mark.unit
class TestFromARow:
    def test_sqlite_flags_become_booleans(self):
        state = TrackCleanState.from_row(
            {
                "id": 3,
                "match_state": "accepted",
                "match_disputed": 1,
                "file_status": "present",
                "artwork": "embedded",
            }
        )
        assert state == TrackCleanState(3, "accepted", True, "present", "embedded")
        assert state.match_disputed is True
