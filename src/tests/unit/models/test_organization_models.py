#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The organizational domain models (ORG-01).

Three types over the tables ``m0009_organization`` creates, and the validation
that keeps them meaning what they say. The tests worth having here are the ones
about distinctions that are easy to collapse and expensive to get back:

- ``None`` and ``0`` are different ratings (DEC-034, DEC-047, DEC-057). One is
  "the user has not rated this", the other is "the user rated it nothing", and
  the effective-value rule in ORG-02 gives opposite answers for them.
- ``None`` and ``""`` are the same absence, and only one of them may be stored.
- A refused value is refused, not clamped. Storing 5 for a request of 9 tells
  the user their library holds something it does not.
- A smart collection without rules, or a folder with them, is not a node with a
  small problem; it is a node whose kind is a lie.
"""

from __future__ import annotations

import pytest

from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER,
    KIND_SMART,
    MAX_COLLECTION_DEPTH,
    MAX_COLLECTION_NAME_LENGTH,
    Collection,
    CollectionEntry,
)
from cuepoint.models.tag import (
    MAX_TAG_CATEGORY_LENGTH,
    MAX_TAG_NAME_LENGTH,
    Tag,
)
from cuepoint.models.track_metadata import (
    MAX_NOTES_LENGTH,
    SOURCE_CUEPOINT_RATING,
    SOURCE_REKORDBOX_RATING,
    TrackMetadata,
    effective_rating,
    normalize_notes,
    normalize_rating,
    rating_source,
)


class TestTrackMetadataRating:
    @pytest.mark.parametrize("stars", [0, 1, 2, 3, 4, 5])
    def test_every_star_count_is_accepted(self, stars):
        assert TrackMetadata(track_id=1, rating=stars).rating == stars

    def test_no_rating_is_none(self):
        assert TrackMetadata(track_id=1).rating is None

    def test_none_and_zero_are_different(self):
        # The distinction the whole two-layer model rests on: ORG-02 falls back
        # to Rekordbox's rating for one and not for the other.
        assert TrackMetadata(track_id=1, rating=0).rating == 0
        assert TrackMetadata(track_id=1, rating=None).rating is None

    @pytest.mark.parametrize("stars", [-1, 6, 9, 255])
    def test_a_rating_out_of_range_is_refused_not_clamped(self, stars):
        with pytest.raises(ValueError, match="between 0 and 5"):
            TrackMetadata(track_id=1, rating=stars)

    @pytest.mark.parametrize("value", ["four", 4.5, "4.5", object()])
    def test_a_value_that_is_not_a_rating_is_refused(self, value):
        with pytest.raises(ValueError):
            TrackMetadata(track_id=1, rating=value)

    @pytest.mark.parametrize("value", [True, False])
    def test_a_boolean_is_not_a_rating(self, value):
        # bool is an int in Python, so this would otherwise store 1 or 0.
        with pytest.raises(ValueError):
            TrackMetadata(track_id=1, rating=value)

    def test_a_numeric_string_from_a_query_string_still_works(self):
        assert normalize_rating("4") == 4

    def test_a_whole_float_is_the_same_rating(self):
        assert normalize_rating(4.0) == 4


class TestTheEffectiveRatingRule:
    """DEC-057's two layers, resolved in the one place that decides it."""

    @pytest.mark.parametrize(
        "rekordbox,cuepoint,expected",
        [
            (None, None, None),
            (3, None, 3),
            (None, 5, 5),
            (3, 5, 5),
        ],
    )
    def test_all_four_combinations(self, rekordbox, cuepoint, expected):
        assert effective_rating(rekordbox, cuepoint) == expected

    def test_a_zero_star_override_does_not_fall_back(self):
        # The falsy-zero bug this rule is most likely to grow: `if cuepoint`
        # instead of `is not None` reads a deliberate zero as "unset".
        assert effective_rating(4, 0) == 0

    def test_a_zero_from_rekordbox_is_still_a_rating(self):
        assert effective_rating(0, None) == 0


class TestTheRatingSource:
    """DEC-057 requires the UI to say which layer it is showing."""

    def test_the_users_value_is_attributed_to_the_user(self):
        assert rating_source(3, 5) == SOURCE_CUEPOINT_RATING

    def test_a_zero_star_override_is_still_the_users(self):
        assert rating_source(3, 0) == SOURCE_CUEPOINT_RATING

    def test_an_imported_value_is_attributed_to_rekordbox(self):
        assert rating_source(3, None) == SOURCE_REKORDBOX_RATING

    def test_no_rating_is_attributed_to_nobody(self):
        assert rating_source(None, None) is None

    def test_the_source_agrees_with_the_value(self):
        # The two functions are read together by the Inspector, so a label
        # that disagrees with the stars is the failure worth pinning.
        for rekordbox in (None, 0, 3):
            for cuepoint in (None, 0, 5):
                value = effective_rating(rekordbox, cuepoint)
                source = rating_source(rekordbox, cuepoint)
                if value is None:
                    assert source is None
                elif source == SOURCE_CUEPOINT_RATING:
                    assert value == cuepoint
                else:
                    assert value == rekordbox


class TestTrackMetadataNotes:
    def test_an_empty_note_is_no_note(self):
        # "" and None would look different in the database and identical to a
        # user, and one of them would have to be explained forever.
        assert TrackMetadata(track_id=1, notes="   ").notes is None
        assert normalize_notes("") is None

    def test_a_note_is_trimmed(self):
        assert TrackMetadata(track_id=1, notes="  play late  ").notes == "play late"

    def test_a_note_at_the_limit_is_accepted(self):
        note = "x" * MAX_NOTES_LENGTH
        assert TrackMetadata(track_id=1, notes=note).notes == note

    def test_a_longer_note_is_refused_with_its_length(self):
        with pytest.raises(ValueError, match=str(MAX_NOTES_LENGTH)):
            TrackMetadata(track_id=1, notes="x" * (MAX_NOTES_LENGTH + 1))


class TestTrackMetadataRow:
    def test_favorite_is_stored_as_an_integer(self):
        assert TrackMetadata(track_id=1, favorite=True).to_dict()["favorite"] == 1
        assert TrackMetadata(track_id=1, favorite=False).to_dict()["favorite"] == 0

    def test_it_round_trips_through_a_row(self):
        original = TrackMetadata(track_id=7, rating=4, favorite=True, notes="peak")
        restored = TrackMetadata.from_row(original.to_dict())
        assert restored == original

    def test_a_row_with_no_rating_round_trips_as_no_rating(self):
        original = TrackMetadata(track_id=7, rating=None)
        assert TrackMetadata.from_row(original.to_dict()).rating is None

    def test_a_zero_favorite_from_sqlite_reads_as_false(self):
        assert (
            TrackMetadata.from_row(
                {
                    "track_id": 1,
                    "rating": None,
                    "favorite": 0,
                    "notes": None,
                    "created_at": "t",
                    "updated_at": "t",
                }
            ).favorite
            is False
        )

    def test_an_untouched_record_knows_it_says_nothing(self):
        assert TrackMetadata(track_id=1).is_empty
        assert not TrackMetadata(track_id=1, rating=0).is_empty
        assert not TrackMetadata(track_id=1, favorite=True).is_empty
        assert not TrackMetadata(track_id=1, notes="x").is_empty

    def test_touch_moves_updated_at(self):
        record = TrackMetadata(track_id=1, created_at="then", updated_at="then")
        record.touch()
        assert record.updated_at != "then"
        assert record.created_at == "then"


class TestTag:
    def test_a_name_is_trimmed_and_its_case_is_kept(self):
        # Identity is case-insensitive in the database; display is not.
        assert Tag(name="  DUB  ").name == "DUB"

    @pytest.mark.parametrize("name", ["", "   ", None])
    def test_a_tag_needs_a_name(self, name):
        with pytest.raises(ValueError, match="needs a name"):
            Tag(name=name)

    def test_a_name_at_the_limit_is_accepted(self):
        assert len(Tag(name="x" * MAX_TAG_NAME_LENGTH).name) == MAX_TAG_NAME_LENGTH

    def test_a_longer_name_is_refused(self):
        with pytest.raises(ValueError, match=str(MAX_TAG_NAME_LENGTH)):
            Tag(name="x" * (MAX_TAG_NAME_LENGTH + 1))

    def test_an_empty_category_is_no_category(self):
        assert Tag(name="Dark", category="  ").category is None

    def test_a_category_is_a_label_not_a_parent(self):
        # DEC-015: "Mood: Dark" is one tag with a label on it.
        tag = Tag(name="Dark", category="Mood")
        assert tag.category == "Mood"
        assert not hasattr(tag, "parent_id")

    def test_a_long_category_is_refused(self):
        with pytest.raises(ValueError, match=str(MAX_TAG_CATEGORY_LENGTH)):
            Tag(name="Dark", category="x" * (MAX_TAG_CATEGORY_LENGTH + 1))

    def test_an_empty_colour_is_no_colour(self):
        assert Tag(name="Dark", colour="").colour is None

    def test_it_round_trips_through_a_row(self):
        original = Tag(name="Peak-time", category="Energy", colour="accent", id=3)
        assert Tag.from_row(original.to_dict()) == original


class TestCollectionKinds:
    @pytest.mark.parametrize("kind", [KIND_FOLDER, KIND_COLLECTION, KIND_SMART])
    def test_the_three_kinds_are_accepted(self, kind):
        rules = "{}" if kind == KIND_SMART else None
        assert Collection(name="X", kind=kind, rules_json=rules).kind == kind

    def test_a_fourth_kind_is_refused(self):
        with pytest.raises(ValueError, match="kind must be one of"):
            Collection(name="X", kind="playlist")

    def test_a_smart_collection_without_rules_is_refused(self):
        with pytest.raises(ValueError, match="needs a rule set"):
            Collection(name="Recent", kind=KIND_SMART)

    def test_a_folder_with_rules_is_refused(self):
        with pytest.raises(ValueError, match="cannot hold a rule set"):
            Collection(name="Sets", kind=KIND_FOLDER, rules_json="{}")

    def test_a_collection_carrying_rules_is_left_legal(self):
        # Deliberately unconstrained: a frozen Collection remembering the rules
        # it came from is a plausible thing to want, and this is the layer
        # where that can change — which is why m0009 wrote no CHECK for it.
        assert Collection(name="Frozen", kind=KIND_COLLECTION, rules_json="{}")

    def test_only_a_collection_holds_tracks(self):
        assert Collection(name="X", kind=KIND_COLLECTION).holds_tracks
        assert not Collection(name="X", kind=KIND_FOLDER).holds_tracks
        assert not Collection(name="X", kind=KIND_SMART, rules_json="{}").holds_tracks

    def test_the_kind_predicates_agree_with_the_kind(self):
        assert Collection(name="X", kind=KIND_FOLDER).is_folder
        assert Collection(name="X", kind=KIND_SMART, rules_json="{}").is_smart
        assert not Collection(name="X", kind=KIND_COLLECTION).is_smart


class TestCollectionCoordinates:
    def test_a_name_is_trimmed(self):
        assert Collection(name="  Warmups ", kind=KIND_COLLECTION).name == "Warmups"

    @pytest.mark.parametrize("name", ["", "   ", None])
    def test_a_node_needs_a_name(self, name):
        with pytest.raises(ValueError, match="needs a name"):
            Collection(name=name, kind=KIND_COLLECTION)

    def test_a_long_name_is_refused(self):
        with pytest.raises(ValueError, match=str(MAX_COLLECTION_NAME_LENGTH)):
            Collection(
                name="x" * (MAX_COLLECTION_NAME_LENGTH + 1), kind=KIND_COLLECTION
            )

    @pytest.mark.parametrize("field", ["position", "depth"])
    def test_a_negative_coordinate_is_refused(self, field):
        with pytest.raises(ValueError, match="cannot be negative"):
            Collection(name="X", kind=KIND_COLLECTION, **{field: -1})

    def test_the_depth_cap_is_enforced(self):
        assert Collection(name="X", kind=KIND_COLLECTION, depth=MAX_COLLECTION_DEPTH)
        with pytest.raises(ValueError, match="at most"):
            Collection(name="X", kind=KIND_COLLECTION, depth=MAX_COLLECTION_DEPTH + 1)

    def test_a_top_level_node_has_no_parent(self):
        assert Collection(name="X", kind=KIND_COLLECTION).parent_id is None


class TestCollectionRow:
    def test_it_round_trips_through_a_row(self):
        original = Collection(
            name="Recent house",
            kind=KIND_SMART,
            position=2,
            depth=1,
            parent_id=4,
            id=9,
            rules_json='{"match":"all","rules":[]}',
            sort_field="artist",
            sort_dir="asc",
        )
        assert Collection.from_row(original.to_dict()) == original

    def test_frozen_provenance_survives_a_round_trip(self):
        original = Collection(
            name="March (frozen)",
            kind=KIND_COLLECTION,
            frozen_from_id=12,
            frozen_at="2026-09-06T00:00:00+00:00",
        )
        restored = Collection.from_row(original.to_dict())
        assert restored.was_frozen
        assert restored.frozen_from_id == 12

    def test_a_node_that_was_not_frozen_says_so(self):
        assert not Collection(name="X", kind=KIND_COLLECTION).was_frozen

    def test_touch_moves_updated_at(self):
        node = Collection(
            name="X", kind=KIND_COLLECTION, created_at="then", updated_at="then"
        )
        node.touch()
        assert node.updated_at != "then"
        assert node.created_at == "then"


class TestCollectionEntry:
    def test_an_entry_is_addressed_by_its_own_id(self):
        # DEC-058 lets a track appear twice, so membership cannot be keyed on
        # (collection, track): two entries differ only by id and position.
        first = CollectionEntry(collection_id=1, track_id=7, position=0, id=100)
        second = CollectionEntry(collection_id=1, track_id=7, position=1, id=101)
        assert first != second
        assert first.track_id == second.track_id

    def test_it_round_trips_through_a_row(self):
        original = CollectionEntry(
            collection_id=1, track_id=7, position=3, id=42, added_at="t"
        )
        assert CollectionEntry.from_row(original.to_dict()) == original

    def test_a_negative_position_is_refused(self):
        with pytest.raises(ValueError, match="cannot be negative"):
            CollectionEntry(collection_id=1, track_id=7, position=-1)

    @pytest.mark.parametrize("value", ["two", None, object()])
    def test_a_position_that_is_not_a_number_is_refused(self, value):
        with pytest.raises(ValueError, match="must be a number"):
            CollectionEntry(collection_id=1, track_id=7, position=value)

    def test_ids_from_sqlite_are_coerced_to_integers(self):
        entry = CollectionEntry.from_row(
            {
                "id": 5,
                "collection_id": "1",
                "track_id": "7",
                "position": "2",
                "added_at": "t",
            }
        )
        assert (entry.collection_id, entry.track_id, entry.position) == (1, 7, 2)
