#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The answer to "what fits here", as it goes on the wire (PREP-04).

Each type's wire shape, and what the answer refuses to say: a gap nothing
fits that still has suggestions, a side that is not one, an id that is not
one. A chapter's range holds a tempo inclusively at both ends, open ends hold
anything, and an unknown tempo is never inside a range.
"""

from __future__ import annotations

from typing import Any, Dict

import pytest

from cuepoint.models.set_suggestions import (
    SIDES,
    BpmRange,
    NoFit,
    SetSuggestions,
    SideFit,
    SlotSuggestion,
)

pytestmark = pytest.mark.unit

REASON = {
    "component": "tempo",
    "detail": "close",
    "points": 27.3,
    "from": 124.0,
    "to": 125.0,
}


def slot(**values: Any) -> SlotSuggestion:
    defaults: Dict[str, Any] = dict(
        track_id=7,
        score=50.0,
        in_set=0,
        before=SideFit(50.0, (REASON,)),
        after=None,
    )
    defaults.update(values)
    return SlotSuggestion(**defaults)


def answer(**values: Any) -> SetSuggestions:
    defaults: Dict[str, Any] = dict(
        set_id=1,
        before_entry_id=10,
        after_entry_id=None,
        sides=("before",),
        chapter_id=3,
        bpm_range=None,
        notation="camelot",
        unused={"before": ("label",)},
        considered=12,
        duplicates_excluded=1,
        index_current=True,
        no_fit=None,
        suggestions=(slot(),),
    )
    defaults.update(values)
    return SetSuggestions(**defaults)


class TestTheWire:
    def test_a_side(self):
        assert SideFit(50.0, (REASON,)).to_dict() == {
            "score": 50.0,
            "reasons": [REASON],
        }

    def test_a_suggestion(self):
        assert slot(in_set=2).to_dict() == {
            "track_id": 7,
            "score": 50.0,
            "in_set": 2,
            "before": {"score": 50.0, "reasons": [REASON]},
            "after": None,
        }

    def test_no_fit(self):
        no_fit = NoFit(120.0, 140.0, 16.7, "8A", "9A", "adjacent")
        assert no_fit.to_dict() == {
            "tempo": {"from": 120.0, "to": 140.0, "gap_percent": 16.7},
            "key": {"from": "8A", "to": "9A", "relation": "adjacent"},
        }
        assert NoFit(120.0, 140.0, 16.7, "8A", None, None).to_dict()["key"] is None
        assert NoFit(120.0, 140.0, 16.7, None, "8A", None).to_dict()["key"] is None
        clash = NoFit(120.0, 140.0, 16.7, "8A", "3B", None).to_dict()["key"]
        assert clash == {"from": "8A", "to": "3B", "relation": None}

    def test_a_range(self):
        assert BpmRange(3, 120.0, None).to_dict() == {
            "chapter_id": 3,
            "min": 120.0,
            "max": None,
        }

    def test_the_answer(self):
        wire = answer(bpm_range=BpmRange(3, 120.0, 124.0)).to_dict()
        assert wire == {
            "set_id": 1,
            "before_entry_id": 10,
            "after_entry_id": None,
            "sides": ["before"],
            "chapter_id": 3,
            "bpm_range": {"chapter_id": 3, "min": 120.0, "max": 124.0},
            "notation": "camelot",
            "unused": {"before": ["label"]},
            "considered": 12,
            "duplicates_excluded": 1,
            "index_current": True,
            "no_fit": None,
            "suggestions": [slot().to_dict()],
        }


class TestTheRange:
    @pytest.mark.parametrize(
        ("low", "high", "bpm", "held"),
        [
            (120.0, 124.0, 120.0, True),
            (120.0, 124.0, 124.0, True),
            (120.0, 124.0, 119.99, False),
            (120.0, 124.0, 124.01, False),
            (None, 124.0, 60.0, True),
            (120.0, None, 200.0, True),
            (None, None, 90.0, True),
            (120.0, 124.0, None, False),
            (None, None, None, False),
        ],
    )
    def test_holds(self, low, high, bpm, held):
        assert BpmRange(1, low, high).holds(bpm) is held


class TestRefusals:
    def test_a_gap_nothing_fits_has_no_suggestions(self):
        with pytest.raises(ValueError, match="nothing can fit"):
            answer(
                sides=("before", "after"),
                no_fit=NoFit(120.0, 140.0, 16.7, None, None, None),
            )
        empty = answer(
            suggestions=(), no_fit=NoFit(120.0, 140.0, 16.7, None, None, None)
        )
        assert empty.to_dict()["suggestions"] == []

    @pytest.mark.parametrize("sides", [(), ("middle",), ("before", "neither")])
    def test_sides(self, sides):
        with pytest.raises(ValueError, match="sides"):
            answer(sides=sides)

    def test_every_side_named(self):
        assert SIDES == ("before", "after")
        answer(sides=SIDES)

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("set_id", 0),
            ("chapter_id", None),
            ("before_entry_id", -1),
            ("after_entry_id", 0),
            ("considered", -1),
            ("duplicates_excluded", -1),
        ],
    )
    def test_ids_and_counts(self, field, value):
        with pytest.raises(ValueError, match=field):
            answer(**{field: value})
