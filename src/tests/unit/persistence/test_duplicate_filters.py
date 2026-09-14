#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Duplicates as a filter, a count and a facet (CLEAN-08, DEC-074, DEC-075).

``in_duplicate_group`` is what CLEAN-11's Health count will ask, and
``duplicate_signal`` is the first field whose track can hold several values at
once. Over a library with a track grouped by path and by title, a pair grouped
only by title, a dismissed pair and a track in no group:

- **The rules count what the groups say**, and a facet's count is its rule's.
- **A track counts once under each of its signals**, as under each of its tags.
- **"Is not" is the exact complement of "is"**, including for tracks in no group.
- **Dismissed and shrunken groups are not counted.**
"""

from __future__ import annotations

from typing import Dict, Set

import pytest

from cuepoint.models.duplicate_group import SIGNAL_PATH
from cuepoint.models.filter_rule import (
    DUPLICATE_SIGNALS_VIEW,
    FilterRule,
    RuleSet,
    describe_fields,
    field_spec,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.duplicate_repository import DuplicateRepository
from cuepoint.persistence.filter_sql import compile_rule, required_joins
from cuepoint.persistence.track_query import BrowseQuery, build_count
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.duplicate_service import DuplicateService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-14T12:00:00+00:00"

#: name: (path, title, seconds, genre)
LIBRARY = {
    "a": ("/m/a.mp3", "Track", 300, "House"),
    "b": ("/m/a.mp3", "Track (Original Mix)", 301, "Techno"),
    "c": ("/m/c.mp3", "Solo", 200, "Techno"),
    "d": ("/m/d.mp3", "Other", 250, "House"),
    "e": ("/m/e.mp3", "Other", 251, "Techno"),
    "f": ("/m/f.mp3", "First", 100, "Techno"),
    "g": ("/m/f.mp3", "Second", 500, "Techno"),
}


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
def duplicates(db) -> DuplicateService:
    return DuplicateService(DuplicateRepository(db), None, db, clock=lambda: NOW)


@pytest.fixture
def library(db, tracks, duplicates) -> Dict[str, int]:
    """a+b by path and title; d+e by title; f+g by path, dismissed; c alone."""
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=name,
                title=title,
                artist="An Artist",
                file_path=path,
                duration_seconds=seconds,
                genre=genre,
            )
            for name, (path, title, seconds, genre) in LIBRARY.items()
        ]
    )
    ids = {
        row["rekordbox_track_id"]: int(row["id"])
        for row in db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
    }
    duplicates.scan()
    [dismissed] = [
        group for group in duplicates.groups(SIGNAL_PATH) if ids["f"] in group.track_ids
    ]
    duplicates.dismiss(int(dismissed.group.id))
    return ids


def rules(*clauses) -> RuleSet:
    return RuleSet(rules=tuple(FilterRule(*clause) for clause in clauses))


def named(tracks, library, *clauses, **scope) -> Set[str]:
    by_id = {track_id: name for name, track_id in library.items()}
    found = tracks.browse_ids(BrowseQuery(rules=rules(*clauses), **scope), limit=100)
    assert tracks.browse_count(BrowseQuery(rules=rules(*clauses), **scope)) == len(
        found
    )
    return {by_id[track_id] for track_id in found}


def facet(tracks, field: str, *clauses, **scope) -> Dict[object, int]:
    result = tracks.facet_values(BrowseQuery(rules=rules(*clauses), **scope), field)
    return {value.value: value.count for value in result.values}


class TestInADuplicateGroup:
    def test_it_is_the_tracks_of_shown_groups(self, tracks, library):
        assert named(tracks, library, ("in_duplicate_group", "is", True)) == {
            "a",
            "b",
            "d",
            "e",
        }
        assert named(tracks, library, ("in_duplicate_group", "is", False)) == {
            "c",
            "f",
            "g",
        }

    def test_its_facet_counts_what_its_rules_find(self, tracks, library):
        counts = facet(tracks, "in_duplicate_group")
        assert sorted(counts.values()) == [3, 4]

    def test_a_pair_that_loses_a_member_stops_counting_at_once(
        self, db, tracks, library
    ):
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (library["b"],))
        assert named(tracks, library, ("in_duplicate_group", "is", True)) == {"d", "e"}

    def test_restoring_a_dismissal_counts_the_pair_again(
        self, tracks, library, duplicates
    ):
        [group] = [g for g in duplicates.groups(include_dismissed=True) if g.dismissed]
        duplicates.restore(int(group.group.id))
        assert {"f", "g"} <= named(tracks, library, ("in_duplicate_group", "is", True))


class TestDuplicateSignal:
    @pytest.mark.parametrize(
        "clause, expected",
        [
            (("duplicate_signal", "is", "path"), {"a", "b"}),
            (("duplicate_signal", "is", "text"), {"a", "b", "d", "e"}),
            (("duplicate_signal", "is", "PATH"), {"a", "b"}),
            (("duplicate_signal", "is", "beatport"), set()),
            (("duplicate_signal", "is_not", "path"), {"c", "d", "e", "f", "g"}),
            (("duplicate_signal", "any_of", ["path", "text"]), {"a", "b", "d", "e"}),
            (("duplicate_signal", "contains", "ex"), {"a", "b", "d", "e"}),
            (("duplicate_signal", "not_contains", "at"), {"c", "d", "e", "f", "g"}),
            (("duplicate_signal", "starts_with", "pa"), {"a", "b"}),
            (("duplicate_signal", "ends_with", "xt"), {"a", "b", "d", "e"}),
            (("duplicate_signal", "is_empty"), {"c", "f", "g"}),
            (("duplicate_signal", "is_not_empty"), {"a", "b", "d", "e"}),
        ],
    )
    def test_each_operator_asks_about_any_of_a_tracks_signals(
        self, tracks, library, clause, expected
    ):
        assert named(tracks, library, clause) == expected

    def test_is_not_is_the_exact_complement_of_is(self, tracks, library):
        for signal in ("path", "text", "beatport"):
            yes = named(tracks, library, ("duplicate_signal", "is", signal))
            no = named(tracks, library, ("duplicate_signal", "is_not", signal))
            assert yes | no == set(LIBRARY) and not yes & no, signal

    def test_a_wildcard_in_a_value_is_a_character(self, tracks, library):
        assert named(tracks, library, ("duplicate_signal", "contains", "%")) == set()
        assert named(tracks, library, ("duplicate_signal", "contains", "_")) == set()

    def test_each_value_the_facet_offers_counts_what_its_rule_finds(
        self, tracks, library
    ):
        counts = facet(tracks, "duplicate_signal")
        assert counts == {"text": 4, "path": 2, None: 3}
        for value, count in counts.items():
            clause = (
                ("duplicate_signal", "is_empty")
                if value is None
                else ("duplicate_signal", "is", value)
            )
            assert count == len(named(tracks, library, clause)), value
        described = tracks.facet_values(BrowseQuery(), "duplicate_signal")
        assert described.total_values == 3 and not described.truncated

    def test_a_facet_leaves_its_own_rule_out_and_honours_the_others(
        self, tracks, library
    ):
        assert facet(
            tracks, "duplicate_signal", ("duplicate_signal", "is", "path")
        ) == {"text": 4, "path": 2, None: 3}
        assert facet(tracks, "duplicate_signal", ("genre", "is", "House")) == {
            "text": 2,
            "path": 1,
        }

    def test_a_facet_inside_a_playlist_counts_that_playlist(self, db, tracks, library):
        with db.transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO rekordbox_playlists (parent_id, name, kind, depth,"
                " position, rekordbox_path) VALUES (NULL, 'Set', 'playlist', 0, 0, 'Set')"
            )
            playlist = int(cursor.lastrowid or 0)
            conn.executemany(
                "INSERT INTO rekordbox_playlist_tracks (playlist_id, track_id, position)"
                " VALUES (?, ?, ?)",
                [(playlist, library[name], i) for i, name in enumerate("acd")],
            )
        scope = {"playlist_id": playlist}
        assert facet(tracks, "duplicate_signal", **scope) == {
            "text": 2,
            "path": 1,
            None: 1,
        }
        assert facet(tracks, "duplicate_signal", ("genre", "is", "House"), **scope) == {
            "text": 2,
            "path": 1,
        }
        assert named(tracks, library, ("duplicate_signal", "is", "text"), **scope) == {
            "a",
            "d",
        }

    def test_a_dismissed_group_is_not_a_signal(self, tracks, library):
        assert "f" not in named(tracks, library, ("duplicate_signal", "is", "path"))


class TestTheVocabulary:
    def test_both_fields_cross_the_wire_as_existing_kinds(self):
        described = {entry["name"]: entry for entry in describe_fields()}
        assert (
            described["in_duplicate_group"]["type"],
            described["in_duplicate_group"]["facetable"],
        ) == ("bool", True)
        assert (
            described["duplicate_signal"]["type"],
            described["duplicate_signal"]["facetable"],
        ) == ("text", True)

    def test_the_signal_field_is_multivalued_and_no_membership_field(self):
        spec = field_spec("duplicate_signal")
        assert spec.is_multivalued and not spec.is_membership
        assert spec.values is not None and spec.values.table == DUPLICATE_SIGNALS_VIEW
        assert not field_spec("tag").is_multivalued

    def test_neither_needs_a_join(self):
        assert required_joins(rules(("duplicate_signal", "is", "path"))) == frozenset()
        assert required_joins(rules(("in_duplicate_group", "is", True))) == frozenset()
        sql, params = compile_rule(FilterRule("duplicate_signal", "is", "path"))
        assert DUPLICATE_SIGNALS_VIEW in sql and params == ("path",)
        count_sql, _ = build_count(BrowseQuery(rules=rules(("genre", "is", "x"))))
        assert DUPLICATE_SIGNALS_VIEW not in count_sql

    def test_not_in_is_safe_because_a_member_always_names_a_track(self, db):
        columns = {
            row["name"]: row["notnull"]
            for row in db.connect().execute("PRAGMA table_info(duplicate_members)")
        }
        assert columns["track_id"] == 1
