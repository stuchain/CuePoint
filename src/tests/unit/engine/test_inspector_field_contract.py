#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Inspector's editable zone must agree with the engine it writes to (ORG-10).

``trackEdits.ts`` holds three numbers and two vocabularies that are not its own.
The limits belong to ``models/track_metadata.py`` and ``models/tag.py``; the
history field names belong to the services that write them; the rating sources
belong to ``rating_source``. Nothing imports across the boundary, so each pair
can drift silently — and each drifts into a different kind of wrong:

* A **limit** that is too generous turns a refusal a field could have prevented
  into a round trip that fails, after the user has typed the whole note.
* A **field name** with no label falls back to the raw column name, so a
  history entry reads ``cuepoint_rating`` in a panel whose entire purpose is
  telling a CuePoint rating from Rekordbox's.
* A **source** string that does not match is worse than either: the panel picks
  its branch on it, so it labels the wrong layer as yours.

This is the same class of check as ``test_browse_sort_contract``, and it lives
here for the same reason — the renderer's Vitest suite cannot reach into
``src/cuepoint``.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from cuepoint.models.tag import MAX_TAG_NAME_LENGTH
from cuepoint.models.track_metadata import (
    MAX_NOTES_LENGTH,
    MAX_RATING,
    SOURCE_CUEPOINT_RATING,
    SOURCE_REKORDBOX_RATING,
)
from cuepoint.persistence.activity_repository import (
    SOURCE_BEATPORT,
    SOURCE_CUEPOINT,
    SOURCE_REKORDBOX,
)
from cuepoint.services.activity_service import REVERTABLE_FIELDS
from cuepoint.services.metadata_service import (
    FIELD_FAVORITE,
    FIELD_NOTES,
    FIELD_RATING,
)
from cuepoint.services.tag_service import FIELD_TAG

# src/tests/unit/engine -> 4 levels up is the repository root
_REPO_ROOT = Path(__file__).resolve().parents[4]
_TRACK_EDITS = (
    _REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "library"
    / "trackEdits.ts"
)


@pytest.fixture(scope="module")
def source() -> str:
    """The renderer module, read as text: a ``.ts`` file cannot be imported."""
    assert _TRACK_EDITS.is_file(), f"Renderer module moved: {_TRACK_EDITS}"
    return _TRACK_EDITS.read_text(encoding="utf-8")


def _number(source: str, name: str) -> int:
    """The value of one exported numeric constant."""
    match = re.search(rf"export const {name} = ([0-9_]+);", source)
    assert match is not None, f"{name} is no longer declared in trackEdits.ts"
    return int(match.group(1).replace("_", ""))


def _field_labels(source: str) -> set:
    """Every field name the history's label table knows."""
    block = re.search(
        r"const FIELD_LABELS: Record<string, string> = \{(.*?)\n\};",
        source,
        re.DOTALL,
    )
    assert block is not None, "FIELD_LABELS is no longer a literal object"
    return set(re.findall(r"^\s*([a-z_]+):", block.group(1), re.MULTILINE))


class TestLimitsMatch:
    """A field refuses before the engine does, at the same number."""

    def test_a_note_is_the_length_the_engine_accepts(self, source: str) -> None:
        assert _number(source, "NOTES_MAX_LENGTH") == MAX_NOTES_LENGTH

    def test_a_tag_name_is_the_length_the_engine_accepts(self, source: str) -> None:
        assert _number(source, "TAG_NAME_MAX_LENGTH") == MAX_TAG_NAME_LENGTH

    def test_there_are_as_many_stars_as_the_engine_allows(self, source: str) -> None:
        assert _number(source, "RATING_STARS") == MAX_RATING


class TestHistoryLabels:
    """Every field the services record has a label a person can read."""

    def test_cuepoints_own_fields_are_labelled(self, source: str) -> None:
        labels = _field_labels(source)
        for field in (FIELD_RATING, FIELD_FAVORITE, FIELD_NOTES, FIELD_TAG):
            assert field in labels, f"No history label for {field!r}"

    def test_your_rating_is_never_labelled_the_same_as_rekordboxs(
        self, source: str
    ) -> None:
        """The distinction the History section exists to draw."""
        block = re.search(
            r"const FIELD_LABELS: Record<string, string> = \{(.*?)\n\};",
            source,
            re.DOTALL,
        )
        assert block is not None
        pairs = dict(re.findall(r"^\s*([a-z_]+): \"([^\"]+)\",", block.group(1), re.M))
        assert pairs[FIELD_RATING] != pairs["rating"]

    def test_every_revertable_rekordbox_field_is_labelled(self, source: str) -> None:
        labels = _field_labels(source)
        missing = sorted(REVERTABLE_FIELDS - labels)
        assert missing == [], (
            f"History entries for these would show a column name: {missing}"
        )


class TestSourcesMatch:
    """The strings the panel branches on are the strings the engine writes."""

    def test_every_history_source_has_a_name(self, source: str) -> None:
        for value in (SOURCE_CUEPOINT, SOURCE_REKORDBOX, SOURCE_BEATPORT):
            assert f'"{value}"' in source, f"historySourceLabel does not know {value!r}"

    def test_the_rating_sources_are_the_engines_own(self, source: str) -> None:
        # `withRating` recomputes what `rating_source` answers, for the moment
        # between a click and the response. Two spellings of "cuepoint" would
        # label the wrong layer as yours for exactly that long.
        assert f'"{SOURCE_CUEPOINT_RATING}"' in source
        assert f'"{SOURCE_REKORDBOX_RATING}"' in source
