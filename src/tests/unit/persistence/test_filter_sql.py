#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a filter rule means against the database (LIBUI-02, DEC-043).

Every operator is driven through the real query, against a fixture built so
each one has something to get wrong: a value spelled two ways, a null, an empty
string, a zero, and a title containing both LIKE wildcards.

Three behaviours are decided here rather than inherited from SQL, and each has
a test that fails if it is undone:

**"Is not" includes tracks with no value.** SQL's three-valued logic makes
``genre <> 'House'`` unknown — and therefore false — where genre is null, so a
track with no genre would be hidden from a filter that says "genre is not
House". A track with no genre is not in the House genre; the filter says so.
The same applies to "does not contain".

**"Is empty" means no value at all for text, and null only for numbers.**
Rekordbox writes a missing text field as either a missing attribute or an empty
string. A rating of zero, by contrast, is a rating (DEC-034), and a play count
of zero is an answer.

**"Between" includes both ends**, which is what a range control's handles show.

Every test runs against a temporary database; the user's real
``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

from typing import List

import pytest

from cuepoint.models.filter_rule import FilterRule, FilterRuleError, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.filter_sql import compile_rule, compile_rule_set
from cuepoint.persistence.track_query import BrowseQuery
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
    """Five tracks covering every awkward case an operator can meet.

    1  Progressive House, 128 BPM, 5 stars, 12 plays, added 2020
    2  progressive house (different case), 128 BPM, 4 stars, 40 plays, 2018
    3  Deep House, 122.5 BPM, 1 star, 3 plays, 2016
    4  nothing at all: every nullable column is null
    5  genre "" and colour "" (blank, not null), 95 BPM, **0 stars, 0 plays**
    """
    repo.add(
        _track(
            "1",
            title="Strobe",
            artist="deadmau5",
            album="For Lack of a Better Name",
            label="mau5trap",
            genre="Progressive House",
            key="8A",
            bpm=128.0,
            year=2009,
            duration_seconds=634,
            rating=5,
            play_count=12,
            colour="Red",
            date_added="2020-01-05",
            comment="peak time",
            bitrate=320,
        )
    )
    repo.add(
        _track(
            "2",
            title="Ghosts n Stuff",
            artist="Deadmau5",
            label="mau5trap",
            genre="progressive house",
            key="5A",
            bpm=128.0,
            year=2009,
            duration_seconds=203,
            rating=4,
            play_count=40,
            colour="Red",
            date_added="2018-03-02",
            comment="",
            bitrate=320,
        )
    )
    repo.add(
        _track(
            "3",
            title="Rej",
            artist="Âme",
            album="Rej EP",
            label="Innervisions",
            genre="Deep House",
            key="9A",
            bpm=122.5,
            year=2005,
            duration_seconds=480,
            rating=1,
            play_count=3,
            date_added="2016-11-30",
            bitrate=256,
        )
    )
    repo.add(_track("4", title="Opus", artist="Eric Prydz"))
    repo.add(
        _track(
            "5",
            title="100% _Pure",
            artist="apparat",
            album="Walls",
            label="Shitkatapult",
            genre="",
            key="11B",
            bpm=95.0,
            year=2007,
            duration_seconds=300,
            rating=0,
            play_count=0,
            colour="",
            date_added="2021-07-14",
            comment="b-side",
            bitrate=192,
        )
    )
    return repo


def matching(repo: TrackRepository, *rules: FilterRule) -> List[str]:
    """Rekordbox ids matching these rules, sorted, with the count checked."""
    query = BrowseQuery(rules=RuleSet(rules=rules))
    rows = repo.browse(query, limit=500)
    ids = sorted(track.rekordbox_track_id for track in rows)
    # The count must always agree with the rows: they share one predicate, and
    # this is the assertion that keeps it that way.
    assert repo.browse_count(query) == len(rows)
    return ids


def rule(field: str, operator: str, value=None) -> FilterRule:
    return FilterRule(field=field, operator=operator, value=value)


class TestTextOperators:
    def test_is_is_case_insensitive(self, seeded):
        # "House" and "house" are one genre to everyone except a byte compare.
        assert matching(seeded, rule("genre", "is", "PROGRESSIVE HOUSE")) == ["1", "2"]

    def test_is_matches_a_blank_value(self, seeded):
        assert matching(seeded, rule("genre", "is", "")) == ["5"]

    def test_is_not_includes_tracks_with_no_value(self, seeded):
        # 4 has no genre and 5 has a blank one; neither is Deep House.
        assert matching(seeded, rule("genre", "is_not", "Deep House")) == [
            "1",
            "2",
            "4",
            "5",
        ]

    def test_contains_is_case_insensitive(self, seeded):
        assert matching(seeded, rule("genre", "contains", "HOUSE")) == ["1", "2", "3"]

    def test_not_contains_includes_tracks_with_no_value(self, seeded):
        # The three-valued-logic trap: without the null case spelled out, 4
        # would vanish from a filter that says "genre does not contain house".
        assert matching(seeded, rule("genre", "not_contains", "house")) == ["4", "5"]

    def test_starts_with(self, seeded):
        assert matching(seeded, rule("genre", "starts_with", "deep")) == ["3"]

    def test_starts_with_does_not_match_the_middle(self, seeded):
        assert matching(seeded, rule("genre", "starts_with", "House")) == []

    def test_ends_with(self, seeded):
        assert matching(seeded, rule("genre", "ends_with", "HOUSE")) == ["1", "2", "3"]

    def test_any_of_is_case_insensitive(self, seeded):
        assert matching(seeded, rule("key", "any_of", ["8a", "9A"])) == ["1", "3"]

    def test_any_of_with_one_value_behaves_like_is(self, seeded):
        assert matching(seeded, rule("label", "any_of", ["mau5trap"])) == ["1", "2"]

    def test_is_empty_means_null_or_blank(self, seeded):
        # 4 has no genre; 5 has an empty one. Rekordbox writes both.
        assert matching(seeded, rule("genre", "is_empty")) == ["4", "5"]

    def test_is_not_empty_is_the_complement(self, seeded):
        assert matching(seeded, rule("genre", "is_not_empty")) == ["1", "2", "3"]

    def test_empty_and_not_empty_partition_the_library(self, seeded):
        empty = matching(seeded, rule("colour", "is_empty"))
        filled = matching(seeded, rule("colour", "is_not_empty"))
        assert sorted(empty + filled) == ["1", "2", "3", "4", "5"]
        assert not set(empty) & set(filled)


class TestNumberOperators:
    def test_is(self, seeded):
        assert matching(seeded, rule("bpm", "is", 128)) == ["1", "2"]

    def test_is_not_includes_tracks_with_no_value(self, seeded):
        assert matching(seeded, rule("bpm", "is_not", 128)) == ["3", "4", "5"]

    def test_less_than_excludes_the_bound(self, seeded):
        assert matching(seeded, rule("bpm", "lt", 122.5)) == ["5"]

    def test_less_than_or_equal_includes_it(self, seeded):
        assert matching(seeded, rule("bpm", "lte", 122.5)) == ["3", "5"]

    def test_greater_than(self, seeded):
        assert matching(seeded, rule("bpm", "gt", 122.5)) == ["1", "2"]

    def test_greater_than_or_equal(self, seeded):
        assert matching(seeded, rule("bpm", "gte", 122.5)) == ["1", "2", "3"]

    def test_comparisons_never_match_a_null(self, seeded):
        for operator in ("lt", "lte", "gt", "gte"):
            assert "4" not in matching(seeded, rule("bpm", operator, 1000))

    def test_between_includes_both_ends(self, seeded):
        assert matching(seeded, rule("bpm", "between", [95, 122.5])) == ["3", "5"]

    def test_between_takes_a_backwards_range_as_written(self, seeded):
        assert matching(seeded, rule("bpm", "between", [122.5, 95])) == ["3", "5"]

    def test_any_of(self, seeded):
        assert matching(seeded, rule("rating", "any_of", [1, 5])) == ["1", "3"]

    def test_is_empty_is_null_only_and_zero_is_a_rating(self, seeded):
        # DEC-034: unrated and rated-zero are different answers. Track 5 is
        # rated zero stars and must not be reported as unrated.
        assert matching(seeded, rule("rating", "is_empty")) == ["4"]
        assert matching(seeded, rule("rating", "is", 0)) == ["5"]

    def test_zero_plays_is_a_play_count(self, seeded):
        assert matching(seeded, rule("play_count", "is_empty")) == ["4"]
        assert matching(seeded, rule("play_count", "lt", 1)) == ["5"]

    def test_a_whole_number_field_accepts_a_facet_float(self, seeded):
        assert matching(seeded, rule("rating", "is", 4.0)) == ["2"]


class TestDateOperators:
    def test_before(self, seeded):
        assert matching(seeded, rule("date_added", "before", "2019-01-01")) == [
            "2",
            "3",
        ]

    def test_after(self, seeded):
        assert matching(seeded, rule("date_added", "after", "2019-01-01")) == [
            "1",
            "5",
        ]

    def test_between_is_inclusive(self, seeded):
        assert matching(
            seeded, rule("date_added", "between", ["2018-03-02", "2020-01-05"])
        ) == ["1", "2"]

    def test_is(self, seeded):
        assert matching(seeded, rule("date_added", "is", "2016-11-30")) == ["3"]

    def test_is_empty(self, seeded):
        assert matching(seeded, rule("date_added", "is_empty")) == ["4"]

    def test_comparisons_never_match_a_track_with_no_date(self, seeded):
        assert "4" not in matching(seeded, rule("date_added", "after", "1900-01-01"))


class TestCombining:
    def test_rules_are_anded(self, seeded):
        assert matching(
            seeded,
            rule("genre", "contains", "house"),
            rule("bpm", "gte", 128),
        ) == ["1", "2"]

    def test_two_rules_on_one_field_both_apply(self, seeded):
        assert matching(
            seeded,
            rule("bpm", "gte", 100),
            rule("bpm", "lt", 128),
        ) == ["3"]

    def test_filters_compose_with_the_text_query(self, seeded):
        query = BrowseQuery(
            query="deadmau5",
            rules=RuleSet(rules=(rule("rating", "gte", 5),)),
        )
        assert [t.rekordbox_track_id for t in seeded.browse(query)] == ["1"]
        assert seeded.browse_count(query) == 1

    def test_filters_compose_with_a_playlist_scope(self, seeded, db):
        from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST, RekordboxPlaylist
        from cuepoint.persistence.playlist_repository import PlaylistRepository

        playlists = PlaylistRepository(db)
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="warmup",
                    kind=KIND_PLAYLIST,
                    depth=0,
                    position=0,
                    rekordbox_path="warmup",
                    track_refs=["1", "3", "5"],
                )
            ]
        )
        playlist_id = playlists.list_all()[0].id
        query = BrowseQuery(
            playlist_id=playlist_id,
            rules=RuleSet(rules=(rule("genre", "contains", "house"),)),
        )
        assert [t.rekordbox_track_id for t in seeded.browse(query)] == ["1", "3"]
        assert seeded.browse_count(query) == 2

    def test_an_empty_rule_set_changes_nothing(self, seeded):
        assert len(seeded.browse(BrowseQuery(rules=RuleSet()), limit=500)) == 5
        assert seeded.browse_count(BrowseQuery(rules=RuleSet())) == 5

    def test_filters_apply_to_every_sort(self, seeded):
        for sort in ("artist", "bpm", "rating", "date_added"):
            query = BrowseQuery(
                sort=sort, rules=RuleSet(rules=(rule("genre", "contains", "house"),))
            )
            assert len(seeded.browse(query, limit=500)) == 3


class TestRefusalNotOmission:
    def test_a_bad_rule_refuses_the_query(self, seeded):
        query = BrowseQuery(
            rules=RuleSet(
                rules=(rule("genre", "is", "House"), rule("bpm", "gte", "fast"))
            )
        )
        with pytest.raises(FilterRuleError):
            seeded.browse(query)
        with pytest.raises(FilterRuleError):
            seeded.browse_count(query)

    def test_an_unknown_field_refuses_the_query(self, seeded):
        with pytest.raises(FilterRuleError, match="Cannot filter by"):
            seeded.browse(
                BrowseQuery(rules=RuleSet(rules=(rule("vibe", "is", "dark"),)))
            )

    def test_the_good_rule_is_not_applied_alone(self, seeded):
        # The failure mode this guards: dropping the clause it could not build
        # and answering a different question.
        query = BrowseQuery(
            rules=RuleSet(
                rules=(rule("genre", "is", "Deep House"), rule("bpm", "lt", "slow"))
            )
        )
        with pytest.raises(FilterRuleError):
            seeded.browse(query)

    def test_compiling_an_unvalidated_rule_still_validates(self, seeded):
        # compile_rule is safe on its own, so a future caller that forgets to
        # validate cannot slip an unescaped value into a LIKE pattern.
        with pytest.raises(FilterRuleError):
            compile_rule(rule("bpm", "gte", "fast"))


class TestInjectionAndWildcards:
    def test_a_value_carrying_sql_stays_a_value(self, seeded):
        assert (
            matching(seeded, rule("genre", "is", "House'; DROP TABLE tracks--")) == []
        )
        assert seeded.count() == 5

    def test_a_value_carrying_sql_in_a_list_stays_a_value(self, seeded):
        assert (
            matching(seeded, rule("genre", "any_of", ["x'); DELETE FROM tracks--"]))
            == []
        )
        assert seeded.count() == 5

    def test_a_percent_is_not_a_wildcard(self, seeded):
        assert matching(seeded, rule("title", "contains", "%")) == ["5"]

    def test_an_underscore_is_not_a_wildcard(self, seeded):
        assert matching(seeded, rule("title", "contains", "_")) == ["5"]

    def test_the_escape_character_itself_is_literal(self, seeded):
        assert matching(seeded, rule("title", "contains", "!")) == []

    def test_a_literal_wildcard_value_is_findable(self, seeded):
        assert matching(seeded, rule("title", "starts_with", "100% _P")) == ["5"]

    def test_every_value_is_a_bound_parameter(self):
        sql, params = compile_rule_set(
            RuleSet(
                rules=(
                    rule("genre", "is", "House"),
                    rule("bpm", "between", [120, 128]),
                    rule("key", "any_of", ["8A", "9A"]),
                )
            )
        )
        assert "House" not in sql and "120" not in sql and "8A" not in sql
        assert sql.count("?") == len(params) == 5


class TestCompiledShape:
    def test_an_empty_set_compiles_to_nothing(self):
        assert compile_rule_set(RuleSet()) == ("", ())

    def test_one_rule_needs_no_extra_brackets(self):
        sql, _ = compile_rule_set(RuleSet(rules=(rule("bpm", "is", 128),)))
        assert sql == "tracks.bpm = ?"

    def test_several_rules_are_bracketed_and_anded(self):
        sql, _ = compile_rule_set(
            RuleSet(rules=(rule("bpm", "is", 128), rule("year", "is", 2009)))
        )
        assert sql.startswith("(") and sql.endswith(")")
        assert " AND " in sql

    def test_columns_are_table_qualified(self):
        # The browse query puts a CTE in scope; an unqualified column there is
        # a bug waiting for a name to collide.
        sql, _ = compile_rule_set(RuleSet(rules=(rule("genre", "is", "House"),)))
        assert "tracks.genre" in sql
