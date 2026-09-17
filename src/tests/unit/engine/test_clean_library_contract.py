#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Library's copies of Clean's lists must be the engine's (CLEAN-13).

The renderer decides, before asking, which history rows offer Revert, which
batches offer "revert this batch", and how each reason a tag write skips a file
is worded. Each of those is a copy of a list the engine owns, in another
language, and nothing imports one from the other — so, as
``test_browse_sort_contract.py`` does for sorts, they are compared here by
reading the TypeScript as text.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from cuepoint.services.activity_service import CUEPOINT_REVERTABLE_FIELDS
from cuepoint.services.revert_service import MEMBERSHIP_OPERATIONS
from cuepoint.services.tag_write_service import FIELD_SKIP_REASONS, FILE_SKIP_REASONS

_RENDERER = (
    Path(__file__).resolve().parents[4]
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
)
_LIBRARY_CLEAN = _RENDERER / "screens" / "library" / "libraryClean.ts"
_ACTIVITY = _RENDERER / "components" / "shell" / "activityActions.ts"
_TAG_WRITING = _RENDERER / "screens" / "library" / "tagWriting.ts"
_FILTER_TEXT = _RENDERER / "screens" / "library" / "filterText.ts"


def _set_literal(path: Path, name: str) -> set[str]:
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{name}[^=]*=\s*new Set\(\[(.*?)\]\)", text, re.S)
    assert match, f"{name} is not declared in {path.name} as it used to be"
    return set(re.findall(r'"([a-z_.]+)"', match.group(1)))


def _cases(path: Path, function: str) -> set[str]:
    text = path.read_text(encoding="utf-8")
    start = text.index(f"export function {function}(")
    body = text[start : text.index("\n}\n", start)]
    return set(re.findall(r'case "([a-z_]+)":', body))


@pytest.mark.unit
class TestTheCopiesAgree:
    def test_the_files_are_where_this_test_thinks(self):
        for path in (_LIBRARY_CLEAN, _ACTIVITY, _TAG_WRITING):
            assert path.is_file(), path

    def test_history_rows_offer_revert_for_exactly_cuepoints_fields(self):
        assert _set_literal(_LIBRARY_CLEAN, "CUEPOINT_HISTORY_FIELDS") == set(
            CUEPOINT_REVERTABLE_FIELDS
        )

    def test_membership_batches_are_the_ones_revert_refuses(self):
        assert _set_literal(_ACTIVITY, "MEMBERSHIP_OPERATIONS") == set(
            MEMBERSHIP_OPERATIONS
        )

    def test_every_file_skip_reason_is_worded(self):
        assert _cases(_TAG_WRITING, "fileSkipText") == set(FILE_SKIP_REASONS)

    def test_every_field_skip_reason_is_worded(self):
        assert _cases(_TAG_WRITING, "fieldSkipText") == set(FIELD_SKIP_REASONS)

    def test_the_events_the_feed_acts_on_are_the_engines(self):
        from cuepoint.services.batch_service import EVENT_BATCH_APPLIED
        from cuepoint.services.revert_service import EVENT_BATCH_REVERTED
        from cuepoint.services.tag_write_service import (
            EVENT_TAGS_INTERRUPTED,
            EVENT_TAGS_WRITTEN,
        )

        assert _set_literal(_ACTIVITY, "BATCH_EVENTS") == {
            EVENT_BATCH_APPLIED,
            EVENT_BATCH_REVERTED,
        }
        text = _ACTIVITY.read_text(encoding="utf-8")
        assert f'TAG_WRITE_EVENT = "{EVENT_TAGS_WRITTEN}"' in text
        assert f'TAG_INTERRUPTED_EVENT = "{EVENT_TAGS_INTERRUPTED}"' in text

    def test_choices_are_offered_for_the_operators_that_check_them(self):
        from cuepoint.models.filter_rule import CHOICE_OPERATORS

        text = _FILTER_TEXT.read_text(encoding="utf-8")
        match = re.search(r"CHOICE_OPERATORS[^=]*=\s*\[(.*?)\]", text, re.S)
        assert match, (
            "CHOICE_OPERATORS is not declared in filterText.ts as it used to be"
        )
        assert set(re.findall(r'"([a-z_]+)"', match.group(1))) == set(CHOICE_OPERATORS)
