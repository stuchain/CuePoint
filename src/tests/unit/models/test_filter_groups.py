#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Library's filter fields, grouped under plain names (LIB-7, FLW-6, FLW-7).

The engine sends every field with the group the Field list shows it under, so
the renderer keeps no second copy of the grouping. Field ids never change: a
saved Smart Collection names its fields by id, and an id that moved would be a
saved rule that quietly meant something else.
"""

from __future__ import annotations

import pytest

from cuepoint.models.filter_rule import (
    FIELD_GROUPS,
    FIELDS,
    FieldSpec,
    FilterRule,
    FilterRuleError,
    describe_fields,
    field_spec,
)

#: The ids as they stood before PAGES-05B, plus "in_playlist" (FLW-7). A saved
#: Smart Collection names fields by these, so this list only ever grows.
FIELD_IDS = (
    "track",
    "title",
    "artist",
    "remixer",
    "album",
    "label",
    "genre",
    "key",
    "colour",
    "comment",
    "file_path",
    "bpm",
    "year",
    "rating",
    "play_count",
    "bitrate",
    "duration_seconds",
    "date_added",
    "rating_rekordbox",
    "cuepoint_rating",
    "favorite",
    "notes",
    "key_rekordbox",
    "cuepoint_key",
    "bpm_rekordbox",
    "cuepoint_bpm",
    "genre_rekordbox",
    "cuepoint_genre",
    "label_rekordbox",
    "cuepoint_label",
    "year_rekordbox",
    "cuepoint_year",
    "tag",
    "collection",
    "in_playlist",
    "match_state",
    "match_decided_by",
    "match_disputed",
    "match_score",
    "file_status",
    "file_checked_at",
    "in_duplicate_group",
    "duplicate_signal",
    "artwork",
    "artist_name",
    "label_name",
    "beatport_artist",
    "beatport_label",
)


def test_the_field_ids_are_unchanged():
    assert sorted(spec.name for spec in FIELDS) == sorted(FIELD_IDS)


def test_every_field_has_a_group_and_it_is_sent():
    sent = describe_fields()
    assert len(sent) == len([spec for spec in FIELDS if spec.offered])
    assert "track" not in {entry["name"] for entry in sent}
    for entry in sent:
        assert entry["group"] in FIELD_GROUPS, entry["name"]


def test_the_groups_are_the_ones_the_review_names():
    assert FIELD_GROUPS == (
        "Track",
        "Your notes and ratings",
        "Rekordbox only",
        "Beatport match",
        "Files",
        "Where it is",
    )


def test_a_field_without_a_known_group_is_refused():
    with pytest.raises(ValueError, match="not a field group"):
        FieldSpec("x", "text", "X", group="Misc")
    with pytest.raises(ValueError, match="not a field group"):
        FieldSpec("x", "text", "X")


def test_fields_arrive_grouped_in_the_groups_order():
    # The renderer draws what it is sent, so a group must be one run.
    seen = [entry["group"] for entry in describe_fields()]
    collapsed = [
        group for i, group in enumerate(seen) if i == 0 or seen[i - 1] != group
    ]
    assert collapsed == [group for group in FIELD_GROUPS if group in seen]


def test_tag_and_collection_and_in_playlist_say_where_a_track_is():
    where = {e["name"] for e in describe_fields() if e["group"] == "Where it is"}
    assert where == {"tag", "collection", "in_playlist"}


@pytest.mark.parametrize(
    ("name", "label"),
    [
        ("match_state", "Beatport match"),
        ("match_decided_by", "Match decided by (you or CuePoint)"),
        ("match_disputed", "Changed since you decided"),
        ("match_score", "Beatport match score"),
        ("file_checked_at", "Last checked on disk"),
        ("in_duplicate_group", "Possible duplicate"),
        ("duplicate_signal", "Why it looks like a duplicate"),
        ("artist_name", "Any credited artist"),
        ("cuepoint_key", "Your key"),
        ("cuepoint_bpm", "Your BPM"),
        ("cuepoint_genre", "Your genre"),
        ("cuepoint_rating", "Your rating"),
        ("key_rekordbox", "Key from Rekordbox (not used)"),
        ("bpm_rekordbox", "BPM from Rekordbox"),
        ("genre_rekordbox", "Genre from Rekordbox"),
        ("rating_rekordbox", "Rating from Rekordbox"),
        ("in_playlist", "In playlist"),
        ("key", "Key"),
    ],
)
def test_the_labels_are_the_reviewed_ones(name, label):
    assert field_spec(name).label == label


def test_rekordbox_s_key_lives_only_in_the_rekordbox_group():
    assert field_spec("key_rekordbox").group == "Rekordbox only"
    assert field_spec("key").group == "Track"
    assert field_spec("cuepoint_key").group == "Your notes and ratings"


class TestInPlaylistValues:
    def rule(self, value):
        return FilterRule("in_playlist", "any_of", value)

    def test_it_takes_any_mix_of_kinds_and_keeps_them_typed(self):
        value = [
            {"kind": "playlist", "id": 3},
            {"kind": "collection", "id": "4"},
            {"kind": "set", "id": 5.0},
        ]
        checked = self.rule(value).validated()
        assert checked.to_dict()["value"] == [
            {"kind": "playlist", "id": 3},
            {"kind": "collection", "id": 4},
            {"kind": "set", "id": 5},
        ]

    def test_it_allows_only_any_of(self):
        with pytest.raises(FilterRuleError, match="cannot be filtered"):
            FilterRule("in_playlist", "is", {"kind": "playlist", "id": 1}).validated()

    @pytest.mark.parametrize(
        "value",
        [
            [],
            [3],
            [{"kind": "folder", "id": 1}],
            [{"kind": "playlist", "id": 0}],
            [{"id": 2}],
        ],
    )
    def test_it_refuses_a_value_that_names_no_source(self, value):
        with pytest.raises(FilterRuleError):
            self.rule(value).validated()
