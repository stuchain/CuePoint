#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Facets: which values a field takes, and how many tracks each (LIBUI-02).

A facet is what a filter list is built from, so the property that matters most
is that **its counts are true**: choosing a value a facet offered must produce
exactly the number of tracks the facet promised. That is asserted directly —
every value is applied back as a rule and the count compared — rather than by
re-deriving the arithmetic in the test.

Two behaviours are decided here rather than falling out of a GROUP BY:

**A facet ignores its own field's filters.** A genre facet that honoured the
genre already chosen would report that one genre and a count, leaving the list
a user needs in order to choose a second one empty.

**"No value" is a bucket, not a gap.** How many tracks have no genre is one of
the more useful things a library can say, and it is exactly what ``is_empty``
filters by — so the two have to agree.

Every test runs against a temporary database; the user's real
``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

import pytest

from cuepoint.models.filter_rule import FilterRule, FilterRuleError, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST, RekordboxPlaylist
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_query import (
    FACET_LIMIT_DEFAULT,
    FACET_LIMIT_MAX,
    BrowseQuery,
    BrowseQueryError,
    clamp_facet_limit,
    facet_query,
)
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> TrackRepository:
    return TrackRepository(db)


def _track(track_id: str, **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", f"Title {track_id}")
    kwargs.setdefault("artist", "Artist")
    return LibraryTrack(
        rekordbox_track_id=track_id,
        file_path=f"/music/{track_id}.mp3",
        **kwargs,
    )


@pytest.fixture
def seeded(repo) -> TrackRepository:
    """Two spellings of one genre, one other genre, one null and one blank."""
    repo.add(
        _track("1", genre="Progressive House", bpm=128.0, rating=5, label="mau5trap")
    )
    repo.add(
        _track("2", genre="progressive house", bpm=128.0, rating=4, label="mau5trap")
    )
    repo.add(_track("3", genre="Deep House", bpm=122.5, rating=1, label="Innervisions"))
    repo.add(_track("4"))  # no genre, no bpm, no rating, no label
    repo.add(_track("5", genre="", bpm=95.0, rating=0, label=""))
    return repo


def rule(field: str, operator: str, value=None) -> FilterRule:
    return FilterRule(field=field, operator=operator, value=value)


def as_pairs(facet):
    return [(value.value, value.count) for value in facet.values]


class TestValues:
    def test_it_counts_the_library(self, seeded):
        assert as_pairs(seeded.facet_values(field="genre")) == [
            ("Progressive House", 2),
            ("Deep House", 1),
            (None, 2),
        ]

    def test_spellings_of_one_value_are_one_choice(self, seeded):
        # "House" and "house" are one genre to everyone except a byte compare;
        # a facet listing both offers a choice that is not real.
        genres = [value.value for value in seeded.facet_values(field="genre").values]
        assert "progressive house" not in genres

    def test_the_shown_spelling_is_deterministic(self, seeded):
        # min(), not whichever row SQLite read last: the same library must
        # always produce the same list.
        first = seeded.facet_values(field="genre").values[0].value
        assert first == "Progressive House"

    def test_most_common_first(self, seeded):
        counts = [
            value.count
            for value in seeded.facet_values(field="genre").values
            if value.value is not None
        ]
        assert counts == sorted(counts, reverse=True)

    def test_no_value_is_last_whatever_its_count(self, seeded):
        # The null bucket has 2, the same as the most common genre, and still
        # sorts last: it is not a value.
        assert seeded.facet_values(field="genre").values[-1].value is None

    def test_null_and_blank_are_one_bucket(self, seeded):
        missing = [
            value
            for value in seeded.facet_values(field="genre").values
            if value.value is None
        ]
        assert [value.count for value in missing] == [2]

    def test_an_empty_library_has_an_empty_facet(self, repo):
        facet = repo.facet_values(field="genre")
        assert facet.values == ()
        assert facet.total_values == 0

    def test_a_field_with_no_values_at_all_reports_only_the_gap(self, repo):
        repo.add(_track("1"))
        assert as_pairs(repo.facet_values(field="genre")) == [(None, 1)]


class TestCountsAreTrue:
    def test_choosing_a_value_gives_the_count_it_promised(self, seeded):
        for value in seeded.facet_values(field="genre").values:
            if value.value is None:
                clause = rule("genre", "is_empty")
            else:
                clause = rule("genre", "is", value.value)
            found = seeded.browse_count(BrowseQuery(rules=RuleSet(rules=(clause,))))
            assert found == value.count, value

    def test_the_counts_add_up_to_the_library(self, seeded):
        total = sum(value.count for value in seeded.facet_values(field="genre").values)
        assert total == seeded.count()

    def test_counts_come_from_the_library_not_from_a_window(self, repo):
        # A facet that counted only the loaded rows would say the same thing
        # for every library.
        for i in range(1, 250):
            repo.add(_track(str(i), genre="House"))
        assert as_pairs(repo.facet_values(field="genre")) == [("House", 249)]


class TestScoping:
    def test_a_facet_ignores_its_own_field(self, seeded):
        query = BrowseQuery(rules=RuleSet(rules=(rule("genre", "is", "Deep House"),)))
        assert as_pairs(seeded.facet_values(query, "genre")) == [
            ("Progressive House", 2),
            ("Deep House", 1),
            (None, 2),
        ]

    def test_a_facet_honours_the_other_filters(self, seeded):
        query = BrowseQuery(rules=RuleSet(rules=(rule("bpm", "gte", 128),)))
        assert as_pairs(seeded.facet_values(query, "genre")) == [
            ("Progressive House", 2)
        ]

    def test_a_facet_honours_the_text_query(self, seeded):
        query = BrowseQuery(query="Title 3")
        assert as_pairs(seeded.facet_values(query, "genre")) == [("Deep House", 1)]

    def test_a_facet_honours_a_playlist_scope(self, seeded, db):
        playlists = PlaylistRepository(db)
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="warmup",
                    kind=KIND_PLAYLIST,
                    depth=0,
                    position=0,
                    rekordbox_path="warmup",
                    track_refs=["3", "4"],
                )
            ]
        )
        query = BrowseQuery(playlist_id=playlists.list_all()[0].id)
        assert as_pairs(seeded.facet_values(query, "genre")) == [
            ("Deep House", 1),
            (None, 1),
        ]

    def test_counts_stay_true_under_another_filter(self, seeded):
        query = BrowseQuery(rules=RuleSet(rules=(rule("rating", "gte", 4),)))
        for value in seeded.facet_values(query, "genre").values:
            clause = (
                rule("genre", "is_empty")
                if value.value is None
                else rule("genre", "is", value.value)
            )
            combined = BrowseQuery(
                rules=RuleSet(rules=(rule("rating", "gte", 4), clause))
            )
            assert seeded.browse_count(combined) == value.count

    def test_facet_query_strips_only_that_field(self):
        query = BrowseQuery(
            rules=RuleSet(
                rules=(
                    rule("genre", "is", "House"),
                    rule("bpm", "gte", 120),
                    rule("genre", "is_not", "Tech House"),
                )
            )
        )
        assert facet_query(query, "genre").rules.fields() == ("bpm",)

    def test_facet_query_keeps_the_scope_and_the_text(self):
        query = BrowseQuery(query="deadmau5", playlist_id=7, sort="bpm")
        scoped = facet_query(query, "genre")
        assert scoped.query == "deadmau5"
        assert scoped.playlist_id == 7


class TestTruncation:
    @pytest.fixture
    def many_labels(self, repo) -> TrackRepository:
        for i in range(50):
            repo.add(_track(str(i), label=f"Label {i:03d}"))
        return repo

    def test_it_reports_how_many_values_exist(self, many_labels):
        facet = many_labels.facet_values(field="label", limit=10)
        assert len(facet.values) == 10
        assert facet.truncated is True
        assert facet.total_values == 50

    def test_a_limit_that_fits_is_not_truncated(self, many_labels):
        facet = many_labels.facet_values(field="label", limit=50)
        assert facet.truncated is False
        assert len(facet.values) == 50

    def test_the_no_value_bucket_survives_truncation(self, repo):
        # 30 labels, each on two tracks, and one track with none. The gap is
        # the least common thing in the library, so a value list ordered by
        # count would lose it — which is why it comes from the totals instead.
        for i in range(30):
            repo.add(_track(f"a{i}", label=f"Label {i:03d}"))
            repo.add(_track(f"b{i}", label=f"Label {i:03d}"))
        repo.add(_track("lonely"))

        facet = repo.facet_values(field="label", limit=5)
        assert facet.truncated is True
        assert len(facet.values) == 6  # five values plus the gap
        assert facet.values[-1].value is None
        assert facet.values[-1].count == 1
        assert facet.total_values == 31

    def test_the_no_value_bucket_counts_as_a_choice(self, repo):
        repo.add(_track("1", label="A"))
        repo.add(_track("2"))
        assert repo.facet_values(field="label").total_values == 2

    def test_limits_are_clamped(self):
        assert clamp_facet_limit(None) == FACET_LIMIT_DEFAULT
        assert clamp_facet_limit(0) == 1
        assert clamp_facet_limit(-5) == 1
        assert clamp_facet_limit(10_000) == FACET_LIMIT_MAX

    def test_a_zero_limit_means_the_default(self, many_labels):
        assert len(many_labels.facet_values(field="label", limit=0).values) == 50


class TestRanges:
    def test_it_reports_both_ends_and_the_gap(self, seeded):
        span = seeded.facet_range(field="bpm")
        assert (span.minimum, span.maximum, span.missing) == (95.0, 128.0, 1)

    def test_a_zero_is_a_value_not_a_gap(self, seeded):
        span = seeded.facet_range(field="rating")
        assert (span.minimum, span.maximum, span.missing) == (0.0, 5.0, 1)

    def test_it_ignores_its_own_field(self, seeded):
        query = BrowseQuery(rules=RuleSet(rules=(rule("bpm", "gte", 128),)))
        assert seeded.facet_range(query, "bpm").minimum == 95.0

    def test_it_honours_the_other_filters(self, seeded):
        query = BrowseQuery(rules=RuleSet(rules=(rule("genre", "contains", "house"),)))
        span = seeded.facet_range(query, "bpm")
        assert (span.minimum, span.maximum, span.missing) == (122.5, 128.0, 0)

    def test_an_empty_library_has_no_range(self, repo):
        span = repo.facet_range(field="bpm")
        assert (span.minimum, span.maximum, span.missing) == (None, None, 0)

    def test_a_text_field_is_refused(self, seeded):
        with pytest.raises(BrowseQueryError, match="needs a number"):
            seeded.facet_range(field="genre")

    def test_an_unknown_field_is_refused(self, seeded):
        with pytest.raises(FilterRuleError):
            seeded.facet_range(field="vibe")


class TestRefusals:
    def test_an_unknown_facet_field_is_refused(self, seeded):
        with pytest.raises(FilterRuleError, match="Cannot filter by"):
            seeded.facet_values(field="vibe")

    def test_a_bad_rule_elsewhere_refuses_the_facet(self, seeded):
        query = BrowseQuery(rules=RuleSet(rules=(rule("bpm", "gte", "fast"),)))
        with pytest.raises(FilterRuleError):
            seeded.facet_values(query, "genre")

    def test_a_facet_of_a_free_text_field_is_still_answerable(self, seeded):
        # `facetable` is advice to the renderer about what is worth offering,
        # not a restriction the engine enforces — a title facet is useless but
        # not wrong, and refusing it would be a second rule to keep in step.
        assert seeded.facet_values(field="title").total_values == 5
