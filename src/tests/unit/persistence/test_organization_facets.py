#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Facets over CuePoint's own data (ORG-05, DEC-043).

A facet is the list a filter control is built from: which values a field takes
in the view you are looking at, and how many tracks each has. ORG-05 extends it
to tags and to favorite, and quietly changes the rating facet, because the
plain word "rating" now means the value a user sees (DEC-057).

One property is what makes a facet worth having, and it is asserted for every
kind here rather than assumed: **a facet's count is the number of tracks that
choosing it would show.** A list that says "Peak time (3)" and then shows four
tracks is worse than no list, and the two are computed by different SQL — the
facet groups, the rule filters — so nothing but a test keeps them equal.

The second property is the one LIBUI-02 established and ORG-05 must not break:
**a facet excludes its own field's rules.** Choosing one tag has to leave the
other tags choosable, or a user can never pick a second.
"""

from __future__ import annotations

import pytest

from cuepoint.models.filter_rule import FilterRule, FilterRuleError, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import (
    BrowseQuery,
    BrowseQueryError,
    build_facet_values,
)
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import TagService


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    return TrackRepository(db)


@pytest.fixture
def metadata(db, tracks) -> MetadataService:
    activity = ActivityService(ActivityRepository(db), tracks)
    return MetadataService(TrackMetadataRepository(db), tracks, activity, db)


@pytest.fixture
def tags(db, tracks) -> TagService:
    return TagService(
        TagRepository(db), ActivityService(ActivityRepository(db), tracks), db
    )


def _track(rekordbox_id: str, **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", f"Title {rekordbox_id}")
    kwargs.setdefault("artist", f"Artist {rekordbox_id}")
    return LibraryTrack(
        rekordbox_track_id=rekordbox_id,
        file_path=f"/music/{rekordbox_id}.mp3",
        **kwargs,
    )


@pytest.fixture
def library(tracks, metadata, tags):
    """The same six tracks the operator tests use, seeded the same way."""
    tracks.add_many(
        [
            _track("1", genre="House", rating=5),
            _track("2", genre="House", rating=3),
            _track("3", genre="Techno"),
            _track("4", genre="Techno", rating=4),
            _track("5", genre="House"),
            _track("6", genre="Ambient", rating=0),
        ]
    )
    ids = {
        key: int(tracks.find_by_rekordbox_id(key).id)
        for key in ("1", "2", "3", "4", "5", "6")
    }
    metadata.set_rating(ids["2"], 5)
    metadata.set_rating(ids["3"], 2)
    metadata.set_favorite(ids["4"], True)

    peak = tags.create_or_get("Peak time").id
    vocal = tags.create_or_get("Vocal").id
    dub = tags.create_or_get("Dub").id
    tags.assign([ids["1"], ids["2"], ids["6"]], peak)
    tags.assign([ids["1"], ids["4"], ids["6"]], vocal)
    tags.assign([ids["6"]], dub)
    return {"ids": ids, "tags": {"peak": peak, "vocal": vocal, "dub": dub}}


def rule(field, operator, value=None):
    return FilterRule(field=field, operator=operator, value=value)


def rules(*clauses):
    return RuleSet(rules=tuple(clauses))


def buckets(facet):
    """The facet as ``{value: count}``, with the "no value" bucket as None."""
    return {value.value: value.count for value in facet.values}


class TestTheTagFacet:
    def test_it_lists_every_tag_in_use(self, tracks, library):
        facet = tracks.facet_values(field="tag")
        labels = {value.label for value in facet.values if value.label}
        assert labels == {"Peak time", "Vocal", "Dub"}

    def test_a_value_is_the_id_a_rule_carries_and_the_label_is_the_name(
        self, tracks, library
    ):
        # A chip built from this facet has to produce a rule that matches the
        # rows the facet counted, which is why the value is the id.
        facet = tracks.facet_values(field="tag")
        by_label = {value.label: value for value in facet.values if value.label}
        assert by_label["Peak time"].value == str(library["tags"]["peak"])

    @pytest.mark.parametrize("name", ["peak", "vocal", "dub"])
    def test_a_count_is_what_choosing_it_would_show(self, tracks, library, name):
        tag_id = library["tags"][name]
        facet = tracks.facet_values(field="tag")
        counted = buckets(facet)[str(tag_id)]
        shown = tracks.browse_count(
            BrowseQuery(rules=rules(rule("tag", "has_tag", tag_id)))
        )
        assert counted == shown

    def test_the_most_common_tag_comes_first(self, tracks, library):
        facet = tracks.facet_values(field="tag")
        named = [value for value in facet.values if value.value is not None]
        assert [value.count for value in named] == sorted(
            (value.count for value in named), reverse=True
        )

    def test_untagged_tracks_are_the_no_value_bucket(self, tracks, library):
        facet = tracks.facet_values(field="tag")
        assert buckets(facet)[None] == 2
        # It sits last whatever its count, because it is not a value.
        assert facet.values[-1].value is None

    def test_the_untagged_bucket_counts_as_one_of_the_choices(self, tracks, library):
        assert tracks.facet_values(field="tag").total_values == 4

    def test_a_library_with_nothing_untagged_offers_no_gap(self, tracks, tags, library):
        tags.assign([library["ids"]["3"], library["ids"]["5"]], library["tags"]["dub"])
        facet = tracks.facet_values(field="tag")
        assert None not in buckets(facet)
        assert facet.total_values == 3

    def test_a_tag_nobody_uses_is_not_offered(self, tracks, tags, library):
        # A facet answers "what is in this view", not "what exists".
        tags.create_or_get("Unused")
        assert len(tracks.facet_values(field="tag").values) == 4

    def test_it_is_truncated_when_there_are_more_than_asked_for(self, tracks, library):
        facet = tracks.facet_values(field="tag", limit=2)
        assert facet.truncated is True
        assert len([v for v in facet.values if v.value is not None]) == 2
        # The gap survives the limit, and the total still counts every choice.
        assert None in buckets(facet)
        assert facet.total_values == 4

    def test_it_is_not_truncated_when_everything_fits(self, tracks, library):
        assert tracks.facet_values(field="tag").truncated is False


class TestTheTagFacetAndTheRestOfTheView:
    def test_choosing_one_tag_leaves_the_others_exactly_as_they_were(
        self, tracks, library
    ):
        """The property LIBUI-02 established, asserted as an equality.

        A tag facet excludes *every* tag rule, so choosing one changes the list
        not at all — same tags, same counts, same untagged bucket. Asserting
        only that more than one choice survives would pass for a facet that
        honoured the rule and happened to leave the other tags of the one
        matching track behind.
        """
        untouched = buckets(tracks.facet_values(field="tag"))
        chosen = rules(rule("tag", "has_tag", library["tags"]["dub"]))
        narrowed = tracks.facet_values(BrowseQuery(rules=chosen), field="tag")
        assert buckets(narrowed) == untouched

    def test_it_is_the_tag_rules_that_are_excluded_and_not_the_field(
        self, tracks, library
    ):
        # Two tag rules, both ignored — not just the first one found.
        chosen = rules(
            rule("tag", "has_tag", library["tags"]["dub"]),
            rule("tag", "not_has_tag", library["tags"]["vocal"]),
        )
        assert buckets(tracks.facet_values(BrowseQuery(rules=chosen), field="tag")) == (
            buckets(tracks.facet_values(field="tag"))
        )

    def test_another_filter_still_narrows_it(self, tracks, library):
        # Only tracks 1, 2 and 5 are House; 5 is untagged.
        facet = tracks.facet_values(
            BrowseQuery(rules=rules(rule("genre", "is", "House"))), field="tag"
        )
        assert buckets(facet)[str(library["tags"]["peak"])] == 2
        assert str(library["tags"]["dub"]) not in buckets(facet)
        assert buckets(facet)[None] == 1

    def test_a_cuepoint_filter_narrows_it_too(self, tracks, library):
        # Exercises the metadata join inside the tag facet's inner query.
        facet = tracks.facet_values(
            BrowseQuery(rules=rules(rule("rating", "is", 5))), field="tag"
        )
        assert buckets(facet)[str(library["tags"]["peak"])] == 2

    def test_the_text_query_narrows_it(self, tracks, library):
        facet = tracks.facet_values(BrowseQuery(query="Title 6"), field="tag")
        assert set(buckets(facet)) == {
            str(library["tags"][name]) for name in ("peak", "vocal", "dub")
        }

    def test_a_narrowed_count_is_still_what_choosing_it_would_show(
        self, tracks, library
    ):
        genre = rules(rule("genre", "is", "House"))
        facet = tracks.facet_values(BrowseQuery(rules=genre), field="tag")
        peak = library["tags"]["peak"]
        both = RuleSet(rules=genre.rules + (rule("tag", "has_tag", peak),))
        assert buckets(facet)[str(peak)] == tracks.browse_count(BrowseQuery(rules=both))


class TestTheFavoriteFacet:
    def test_it_has_two_buckets(self, tracks, library):
        facet = tracks.facet_values(field="favorite")
        assert buckets(facet) == {"1": 1, "0": 5}

    def test_a_yes_no_is_never_asked_whether_it_is_blank(self, tracks, library):
        # The text spelling of "has a value" compares the column to an empty
        # string. Against `COALESCE(meta.favorite, 0)` that is an integer
        # against text, which SQLite answers true by its type ordering — right
        # by coincidence rather than by intent, and only until the coincidence
        # changes.
        sql, _ = build_facet_values(BrowseQuery(), "favorite")
        assert "<> ''" not in sql

    def test_neither_bucket_is_the_no_value_one(self, tracks, library):
        # A yes/no is never missing: a track nobody has favorited is not
        # favorited, which is an answer.
        facet = tracks.facet_values(field="favorite")
        assert None not in buckets(facet)
        assert facet.total_values == 2

    @pytest.mark.parametrize("value, flag", [("1", True), ("0", False)])
    def test_a_count_is_what_choosing_it_would_show(self, tracks, library, value, flag):
        counted = buckets(tracks.facet_values(field="favorite"))[value]
        shown = tracks.browse_count(
            BrowseQuery(rules=rules(rule("favorite", "is", flag)))
        )
        assert counted == shown

    def test_a_library_nobody_has_favorited_still_has_one_bucket(
        self, tracks, metadata, library
    ):
        metadata.set_favorite(library["ids"]["4"], False)
        assert buckets(tracks.facet_values(field="favorite")) == {"0": 6}


class TestTheRatingFacetReadsTheEffectiveValue:
    def test_the_buckets_are_what_the_user_sees(self, tracks, library):
        # 1 and 2 are five stars (2 by way of CuePoint), 3 is two, 4 is four,
        # 6 is zero, and 5 has no rating in either layer.
        assert buckets(tracks.facet_values(field="rating")) == {
            "5": 2,
            "4": 1,
            "2": 1,
            "0": 1,
            None: 1,
        }

    def test_the_imported_column_still_faceted_on_its_own(self, tracks, library):
        assert buckets(tracks.facet_values(field="rating_rekordbox")) == {
            "5": 1,
            "4": 1,
            "3": 1,
            "0": 1,
            None: 2,
        }

    @pytest.mark.parametrize("stars", [5, 4, 2, 0])
    def test_a_count_is_what_choosing_it_would_show(self, tracks, library, stars):
        counted = buckets(tracks.facet_values(field="rating"))[str(stars)]
        shown = tracks.browse_count(
            BrowseQuery(rules=rules(rule("rating", "is", stars)))
        )
        assert counted == shown

    def test_the_range_spans_the_effective_values(self, tracks, library):
        span = tracks.facet_range(field="rating")
        assert (span.minimum, span.maximum) == (0.0, 5.0)
        assert span.missing == 1

    def test_the_imported_range_is_its_own(self, tracks, library):
        span = tracks.facet_range(field="rating_rekordbox")
        assert span.missing == 2


class TestAMembershipFieldIsNotAColumn:
    def test_the_column_builder_refuses_a_tag(self):
        # Grouping `tracks.tag` is a query SQLite would refuse at a point far
        # from the mistake. Refusing it here names the builder to use instead.
        with pytest.raises(BrowseQueryError, match="build_tag_facet_values"):
            build_facet_values(BrowseQuery(), "tag")

    def test_the_column_builder_refuses_a_collection(self):
        with pytest.raises(BrowseQueryError, match="Collection"):
            build_facet_values(BrowseQuery(), "collection")

    def test_a_range_over_a_tag_is_refused(self, tracks, library):
        with pytest.raises(BrowseQueryError, match="a range needs a number"):
            tracks.facet_range(field="tag")

    def test_a_facet_for_an_unknown_field_is_still_refused(self, tracks):
        with pytest.raises(FilterRuleError):
            tracks.facet_values(field="vibe")
