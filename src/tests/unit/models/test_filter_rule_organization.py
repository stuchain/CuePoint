#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The filter vocabulary reaching CuePoint's own data (ORG-05, DEC-057).

Phase 4 could filter a library by what Rekordbox wrote into it. Phase 6 adds
what the user wrote: a rating of their own, a favorite mark, notes, tags, and
which Collection a track is filed in. This module tests the *vocabulary* half
of that — which fields exist, what a value for each may be, and how each field
says where it lives. What those fields mean against the database is
``persistence/test_filter_sql_organization.py``.

Three decisions are pinned here because each one is easy to undo by accident:

**"Rating" means the value the user sees** (DEC-057), which is theirs when they
have set one and Rekordbox's otherwise. Both layers stay addressable by name,
so someone who wants exactly one of them can ask for it — but the plain word is
the effective value, and this is where the field registry says so.

**A tag and a Collection are named by id, never by name.** ORG-12's tag manager
renames tags, and a rule that stopped matching because someone corrected a
spelling would be a saved question that quietly changed meaning.

**A membership field has no column.** A track has as many tags as it was given,
so "has this tag" is a question about rows in a link table, and the registry
says which table rather than which column.
"""

from __future__ import annotations

import pytest

from cuepoint.models.filter_rule import (
    FIELDS,
    METADATA_ALIAS,
    OP_ANY_OF,
    OP_HAS_TAG,
    OP_IN_COLLECTION,
    OP_IS,
    OP_IS_EMPTY,
    OP_IS_NOT,
    OP_NOT_HAS_TAG,
    OP_NOT_IN_COLLECTION,
    TYPE_BOOL,
    TYPE_COLLECTION,
    TYPE_NUMBER,
    TYPE_TAG,
    TYPE_TEXT,
    FacetValue,
    FilterRule,
    FilterRuleError,
    describe_fields,
    describe_operators,
    field_spec,
)

#: The fields ORG-05 added, and the field it redefined.
NEW_FIELDS = (
    "rating_rekordbox",
    "cuepoint_rating",
    "favorite",
    "notes",
    "tag",
    "collection",
)


def rule(field, operator, value=None):
    return FilterRule(field=field, operator=operator, value=value)


class TestTheRegistryGrew:
    @pytest.mark.parametrize("name", NEW_FIELDS)
    def test_each_new_field_is_filterable(self, name):
        assert field_spec(name).name == name

    def test_the_new_fields_did_not_displace_the_old_ones(self):
        # LIBUI-02's vocabulary is a public contract the renderer builds
        # controls from; ORG-05 extends it and removes nothing.
        names = {spec.name for spec in FIELDS}
        for old in ("title", "artist", "genre", "bpm", "rating", "date_added"):
            assert old in names

    def test_every_field_declares_one_way_of_being_addressed(self):
        # A field is either a value on a track or a membership in something.
        # Both at once would leave the compiler two answers to choose between.
        for spec in FIELDS:
            assert not (spec.column and spec.link), spec.name

    def test_a_plain_field_is_still_its_own_column(self):
        assert field_spec("genre").expression == "tracks.genre"
        assert field_spec("genre").is_membership is False
        assert field_spec("genre").metadata is False


class TestRatingMeansWhatTheUserSees:
    def test_rating_coalesces_both_layers(self):
        spec = field_spec("rating")
        assert spec.expression == f"COALESCE({METADATA_ALIAS}.rating, tracks.rating)"
        assert spec.metadata is True

    def test_the_imported_layer_keeps_a_name_of_its_own(self):
        # Named `rating_rekordbox` but reading `tracks.rating`: the whole reason
        # `FieldSpec.column` exists, since the field's name is not its column.
        spec = field_spec("rating_rekordbox")
        assert spec.expression == "tracks.rating"
        assert spec.metadata is False

    def test_the_cuepoint_layer_keeps_a_name_of_its_own(self):
        spec = field_spec("cuepoint_rating")
        assert spec.expression == f"{METADATA_ALIAS}.rating"
        assert spec.metadata is True

    def test_all_three_are_whole_numbers(self):
        for name in ("rating", "rating_rekordbox", "cuepoint_rating"):
            assert field_spec(name).integer is True
            assert field_spec(name).type == TYPE_NUMBER


class TestFavoriteIsYesOrNo:
    def test_it_is_a_bool_field_over_the_metadata_table(self):
        spec = field_spec("favorite")
        assert spec.type == TYPE_BOOL
        # COALESCE, so a track with no CuePoint row at all is "not favorited"
        # rather than "unknown" — which is the honest answer and the one that
        # keeps `favorite is false` from hiding most of the library.
        assert spec.expression == f"COALESCE({METADATA_ALIAS}.favorite, 0)"

    def test_it_allows_only_is(self):
        # "is not true" and "is false" are the same question; two spellings of
        # one question is how a filter bar grows two controls that disagree.
        assert field_spec("favorite").operators == (OP_IS,)

    @pytest.mark.parametrize(
        "given, expected",
        [
            (True, True),
            (False, False),
            (1, True),
            (0, False),
            ("true", True),
            ("TRUE", True),
            ("false", False),
            ("yes", True),
            ("no", False),
            ("1", True),
            ("0", False),
            (" on ", True),
            ("off", False),
        ],
    )
    def test_it_accepts_every_spelling_a_caller_might_send(self, given, expected):
        # JSON from the renderer, text from a query string, an integer from
        # SQLite by way of a facet: all three have to mean the same thing.
        assert rule("favorite", OP_IS, given).validated().value is expected

    @pytest.mark.parametrize("given", ["maybe", "", 2, -1, None, [], 1.5])
    def test_it_refuses_anything_that_is_not(self, given):
        with pytest.raises(FilterRuleError, match="Favorite"):
            rule("favorite", OP_IS, given).validated()


class TestNotesAreText:
    def test_they_read_the_metadata_table(self):
        spec = field_spec("notes")
        assert spec.type == TYPE_TEXT
        assert spec.expression == f"{METADATA_ALIAS}.notes"
        assert spec.metadata is True

    def test_they_are_not_facetable(self):
        # Free text: every value is unique, so a facet list would be as long as
        # the library. The same reason `comment` is not facetable.
        assert field_spec("notes").facetable is False


class TestMembershipFields:
    @pytest.mark.parametrize(
        "name, table, column",
        [
            ("tag", "track_tags", "tag_id"),
            ("collection", "collection_tracks", "collection_id"),
        ],
    )
    def test_each_names_its_link_table(self, name, table, column):
        spec = field_spec(name)
        assert spec.is_membership is True
        assert spec.link is not None
        assert spec.link.table == table
        assert spec.link.value_column == column
        assert spec.link.track_column == "track_id"

    def test_tag_operators(self):
        assert field_spec("tag").operators == (
            OP_HAS_TAG,
            OP_NOT_HAS_TAG,
            OP_ANY_OF,
            OP_IS_EMPTY,
        )

    def test_collection_operators(self):
        assert field_spec("collection").operators == (
            OP_IN_COLLECTION,
            OP_NOT_IN_COLLECTION,
        )

    def test_a_membership_field_refuses_the_operators_of_a_column(self):
        # `is` on a tag reads as though a track had one tag.
        for operator in (OP_IS, OP_IS_NOT, "contains", "gte"):
            with pytest.raises(FilterRuleError, match="Tag"):
                rule("tag", operator, 1).validated()

    @pytest.mark.parametrize("field", ["tag", "collection"])
    @pytest.mark.parametrize("given, expected", [(3, 3), ("3", 3), (3.0, 3)])
    def test_an_id_arrives_as_a_number_however_it_was_written(
        self, field, given, expected
    ):
        operator = OP_HAS_TAG if field == "tag" else OP_IN_COLLECTION
        assert rule(field, operator, given).validated().value == expected

    @pytest.mark.parametrize("given", [0, -1, 1.5, "abc", "", None, True, False, [2]])
    def test_an_id_that_is_not_one_is_refused(self, given):
        # Row ids start at 1. A zero or a negative is a renderer sending an
        # index or a sentinel, and "nothing has that tag" would hide it.
        with pytest.raises(FilterRuleError, match="Tag"):
            rule("tag", OP_HAS_TAG, given).validated()

    def test_any_of_coerces_every_id_in_the_list(self):
        assert rule("tag", OP_ANY_OF, ["1", 2, 3.0]).validated().value == (1, 2, 3)

    def test_any_of_refuses_a_list_with_one_bad_id(self):
        with pytest.raises(FilterRuleError, match="Tag"):
            rule("tag", OP_ANY_OF, [1, "later"]).validated()

    def test_any_of_needs_at_least_one(self):
        with pytest.raises(FilterRuleError, match="at least one"):
            rule("tag", OP_ANY_OF, []).validated()

    def test_untagged_takes_no_value(self):
        assert rule("tag", OP_IS_EMPTY).validated().value is None
        with pytest.raises(FilterRuleError, match="takes no value"):
            rule("tag", OP_IS_EMPTY, 3).validated()

    def test_a_collection_has_no_untagged_equivalent(self):
        # Deliberate: "in no Collection at all" is not a filter anyone asked
        # for, and an operator nobody uses is a shape to keep working forever.
        with pytest.raises(FilterRuleError, match="Collection"):
            rule("collection", OP_IS_EMPTY).validated()


class TestWhatTheRendererIsTold:
    def test_the_new_fields_are_described(self):
        described = {entry["name"]: entry for entry in describe_fields()}
        for name in NEW_FIELDS:
            assert name in described, name
            assert described[name]["operators"]
            assert described[name]["label"]

    def test_the_types_cross_the_wire(self):
        described = {entry["name"]: entry for entry in describe_fields()}
        assert described["favorite"]["type"] == TYPE_BOOL
        assert described["tag"]["type"] == TYPE_TAG
        assert described["collection"]["type"] == TYPE_COLLECTION

    def test_the_new_operators_carry_an_arity(self):
        # ORG-12 builds a control per clause from this and nothing else, so an
        # operator the engine allows but does not describe is a control that
        # cannot be built (DEC-043).
        arity = describe_operators()
        assert arity[OP_HAS_TAG]["arity"] == "single"
        assert arity[OP_IN_COLLECTION]["arity"] == "single"
        assert arity[OP_ANY_OF]["arity"] == "list"
        assert arity[OP_IS_EMPTY]["arity"] == "none"

    def test_every_operator_any_field_allows_is_described(self):
        described = describe_operators()
        for spec in FIELDS:
            for operator in spec.operators:
                assert operator in described, (spec.name, operator)

    def test_tag_and_favorite_are_offered_as_facets(self):
        assert field_spec("tag").facetable is True
        assert field_spec("favorite").facetable is True


class TestAFacetValueCanCarryALabel:
    def test_a_plain_value_is_its_own_label(self):
        assert FacetValue(value="House", count=4).to_dict() == {
            "value": "House",
            "count": 4,
        }

    def test_a_tag_carries_its_name_beside_its_id(self):
        assert FacetValue(value="7", count=4, label="Peak time").to_dict() == {
            "value": "7",
            "count": 4,
            "label": "Peak time",
        }

    def test_the_no_value_bucket_still_has_no_value(self):
        assert FacetValue(value=None, count=9).to_dict()["value"] is None
