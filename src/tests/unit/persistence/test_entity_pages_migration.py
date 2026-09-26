#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0024: what Artist and Label pages read, and read quickly (DISCOVER-07).

Three promises:

- **Nothing the views answer changes.** m0024 rewrites m0023's owned-id rule
  as one indexable expression and splits the identity view by kind. Every row
  each view answered before, over every kind of stored id and URL DISCOVER-04
  distinguished and over thousands generated, it answers after.
- **The indexes it adds are used**, which is the reason it exists.
- **The listing record is shaped as specified**, and only the catalog's module
  runs SQL against it.
"""

from __future__ import annotations

import random
import re
import sqlite3
from pathlib import Path
from typing import List, Optional, Tuple

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.beatport_listing import BeatportListing
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.services.beatport_ownership import accepted_beatport_track_id
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import (
    NOW,
    accept,
    add_candidate,
    add_tracks,
    catalog_track,
    set_match,
)

pytestmark = pytest.mark.unit

_TRACK = "https://www.beatport.com/track"

#: Every shape of stored id and URL DISCOVER-04's rule tells apart.
CASES: List[Tuple[Optional[str], str]] = [
    ("11", f"{_TRACK}/x/11"),
    ("12", "https://example.com/nothing"),
    (None, f"{_TRACK}/x/13"),
    ("", f"{_TRACK}/x/14"),
    ("0123", f"{_TRACK}/x/15"),
    (" 16", f"{_TRACK}/x/16"),
    ("17abc", f"{_TRACK}/x/17"),
    ("-18", f"{_TRACK}/x/18"),
    ("0", f"{_TRACK}/x/19"),
    ("99999999999999999999", f"{_TRACK}/x/20"),
    (None, f"{_TRACK}/x/021"),
    (None, f"{_TRACK}/x/22abc"),
    (None, f"{_TRACK}//23"),
    (None, f"{_TRACK}/slug/with/24"),
    (None, f"{_TRACK}/x/"),
    (None, f"{_TRACK}/x"),
    (None, "https://www.beatport.com/release/x/25"),
    (None, f"{_TRACK}/x/9223372036854775807"),
    (None, f"{_TRACK}/x/9223372036854775808"),
    ("9223372036854775807", "https://example.com"),
    (None, "https://www.beatport.com/track/a/26/track/b/27"),
    (None, ""),
]


def _runner(service: DatabaseService, through: int) -> MigrationRunner:
    return MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= through]
    )


@pytest.fixture
def version_23(tmp_path):
    service = DatabaseService(db_path=tmp_path / "v23.db")
    _runner(service, 23).migrate()
    yield service
    service.close_all()


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def _rows(service: DatabaseService, sql: str) -> List[tuple]:
    return [tuple(r) for r in service.connect().execute(sql)]


def _owned(service: DatabaseService) -> List[tuple]:
    return _rows(
        service,
        "SELECT track_id, candidate_id, beatport_track_id"
        " FROM library_beatport_tracks ORDER BY track_id",
    )


def _credits(service: DatabaseService) -> List[tuple]:
    return _rows(
        service,
        "SELECT track_id, beatport_track_id, kind, role, position, beatport_id,"
        " name, name_key FROM library_beatport_credits"
        " ORDER BY track_id, kind, role, position",
    )


def _populate(service: DatabaseService, cases) -> None:
    with service.transaction() as conn:
        ids = add_tracks(conn, len(cases))
        for track_id, (stored, url) in zip(ids, cases):
            accept(conn, track_id, stored, url)
        # Some states the rule excludes, resting on candidates with real ids.
        extra = add_tracks(conn, 3, start=len(cases) + 1)
        for state, track_id in zip(("rejected", "needs_review", "no_match"), extra):
            candidate = add_candidate(conn, track_id, "777", f"{_TRACK}/x/777")
            set_match(conn, track_id, candidate, state=state)
    BeatportCatalogRepository(service).upsert_tracks(
        [
            catalog_track(
                bp,
                artists=[(1000 + bp, f"Artist {bp}"), (2000 + bp, "Âme")],
                remixers=[(3000 + bp, "Dixon")] if bp % 2 else [],
                label=(4000 + bp, f"Label {bp}") if bp % 3 else None,
            )
            for bp in range(11, 28)
        ]
        + [catalog_track(9223372036854775807, artists=[(5, "Max")])],
        NOW,
    )


class TestNothingTheViewsAnswerChanges:
    def test_every_case_the_rule_distinguishes(self, version_23):
        _populate(version_23, CASES)
        owned, credits = _owned(version_23), _credits(version_23)
        assert _runner(version_23, 24).migrate()
        assert _owned(version_23) == owned
        assert _credits(version_23) == credits
        # And the cases are real ones: some owned by the stored id, some by
        # the URL, some not at all.
        assert 5 < len(owned) < len(CASES)

    @pytest.mark.parametrize("seed", [1, 2, 3])
    def test_thousands_of_generated_ids_and_urls(self, version_23, seed):
        rng = random.Random(seed)
        pieces = ["", "0", "7", "12", "007", "9" * 19, "9" * 20, "x", " ", "-", "/"]

        def text() -> str:
            return "".join(rng.choice(pieces) for _ in range(rng.randint(0, 3)))

        cases = [
            (
                rng.choice([None, text()]),
                rng.choice(
                    [
                        f"{_TRACK}/{text()}/{text()}",
                        f"https://www.beatport.com/{text()}/track/{text()}",
                        text(),
                    ]
                ),
            )
            for _ in range(1500)
        ]
        _populate(version_23, cases)
        owned = _owned(version_23)
        _runner(version_23, 24).migrate()
        assert _owned(version_23) == owned

    def test_the_new_expression_is_the_python_rule(self, db):
        # DISCOVER-04 holds the view to the Python rule case by case; this
        # holds the rewritten expression to it on the same cases directly.
        _populate(db, CASES)
        by_track = {row[0]: row[2] for row in _owned(db)}
        for track_id, (stored, url) in enumerate(CASES, start=1):
            assert by_track.get(track_id) == accepted_beatport_track_id(stored, url), (
                stored,
                url,
            )

    def test_it_applies_alone_to_a_populated_library(self, version_23):
        _populate(version_23, CASES[:5])
        counts = {
            table: _rows(version_23, f"SELECT count(*) FROM {table}")[0][0]
            for table in (
                "tracks",
                "track_match",
                "match_candidates",
                "beatport_tracks",
                "beatport_track_artists",
                "track_credits",
            )
        }
        assert [m.version for m in _runner(version_23, 24).migrate()] == [24]
        for table, count in counts.items():
            assert _rows(version_23, f"SELECT count(*) FROM {table}")[0][0] == count

    def test_it_creates_exactly_its_objects(self, version_23):
        def objects():
            return set(
                _rows(
                    version_23,
                    "SELECT type, name FROM sqlite_master"
                    " WHERE name NOT LIKE 'sqlite_%'",
                )
            )

        before = objects()
        _runner(version_23, 24).migrate()
        after = objects()
        assert after - before == {
            ("table", "beatport_listings"),
            ("index", "idx_match_candidates_owned_id"),
            ("index", "idx_tracks_label_key"),
            ("index", "idx_track_metadata_label_key"),
            ("view", "library_beatport_artists"),
            ("view", "library_beatport_labels"),
            ("view", "beatport_catalog_credits"),
        }
        # The two views m0023 made are made again, not lost.
        assert before - after == set()

    def test_the_combined_view_is_the_two_kinds_together(self, db):
        _populate(db, CASES)
        combined = _credits(db)
        artists = _rows(
            db,
            "SELECT track_id, beatport_track_id, 'artist', role, position,"
            " beatport_id, name, name_key FROM library_beatport_artists",
        )
        labels = _rows(
            db,
            "SELECT track_id, beatport_track_id, 'label', NULL, NULL,"
            " beatport_id, name, name_key FROM library_beatport_labels",
        )
        assert sorted(combined, key=repr) == sorted(artists + labels, key=repr)

    def test_the_catalog_credits_view_lists_every_id_s_tracks(self, db):
        _populate(db, CASES)
        rows = set(
            _rows(
                db,
                "SELECT kind, beatport_id, beatport_track_id FROM beatport_catalog_credits",
            )
        )
        assert ("artist", 1011, 11) in rows and ("artist", 2011, 11) in rows
        assert ("artist", 3011, 11) in rows  # a remixer credit
        assert ("label", 4011, 11) in rows
        assert not any(kind == "label" and track == 12 for kind, _, track in rows)


class TestTheIndexesAreUsed:
    def _plan(self, db, sql: str, params=()) -> str:
        return " | ".join(
            str(r[3]) for r in db.connect().execute("EXPLAIN QUERY PLAN " + sql, params)
        )

    def test_the_owned_id_of_a_list_is_found_by_index(self, db):
        plan = self._plan(
            db,
            "SELECT track_id FROM library_beatport_tracks"
            " WHERE beatport_track_id IN (SELECT value FROM json_each(?))",
            ("[1, 2, 3]",),
        )
        assert "idx_match_candidates_owned_id" in plan
        assert "SCAN m" not in plan

    def test_one_track_s_identity_is_read_by_the_track(self, db):
        for view in ("library_beatport_artists", "library_beatport_labels"):
            plan = self._plan(db, f"SELECT 1 FROM {view} WHERE track_id = ?", (1,))
            assert "SCAN" not in plan, (view, plan)

    def test_a_label_s_tracks_are_found_by_either_key(self, db):
        tracks = self._plan(db, "SELECT id FROM tracks WHERE label_key = ?", ("x",))
        overrides = self._plan(
            db, "SELECT track_id FROM track_metadata WHERE label_key = ?", ("x",)
        )
        assert "idx_tracks_label_key" in tracks
        assert "idx_track_metadata_label_key" in overrides

    def test_the_index_holds_the_view_s_expression(self, db):
        # One function builds both, so they cannot drift; this reads what
        # SQLite stored and checks that the view spells the indexed expression.
        conn = db.connect()
        index_sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'idx_match_candidates_owned_id'"
        ).fetchone()[0]
        view_sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'library_beatport_tracks'"
        ).fetchone()[0]
        indexed = re.search(r"ON match_candidates \((.*)\)$", index_sql, re.S).group(1)
        qualified = indexed.replace("beatport_track_id", "c.beatport_track_id").replace(
            "url", "c.url"
        )
        assert qualified in view_sql
        # An index cannot hold a subquery; m0023's rule had three.
        assert "SELECT" not in indexed.upper()


class TestListings:
    def test_the_table_is_shaped_as_specified(self, db):
        columns = [
            (r["name"], r["type"], r["notnull"], r["pk"])
            for r in db.connect().execute("PRAGMA table_info(beatport_listings)")
        ]
        assert columns == [
            ("kind", "TEXT", 1, 1),
            ("beatport_id", "INTEGER", 1, 2),
            ("since", "TEXT", 1, 0),
            ("fetched_at", "TEXT", 1, 0),
            ("tracks", "INTEGER", 1, 0),
        ]
        sql = (
            db.connect()
            .execute("SELECT sql FROM sqlite_master WHERE name = 'beatport_listings'")
            .fetchone()[0]
        )
        assert "WITHOUT ROWID" in sql

    @pytest.mark.parametrize(
        "values",
        [
            ("genre", 1, "2026-01-01", NOW, 0),
            ("artist", 0, "2026-01-01", NOW, 0),
            ("artist", 1, "2026-01-01", NOW, -1),
            ("artist", None, "2026-01-01", NOW, 0),
            ("artist", 1, None, NOW, 0),
            ("artist", 1, "2026-01-01", None, 0),
        ],
    )
    def test_every_check_refuses_what_a_listing_never_is(self, db, values):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO beatport_listings"
                    " (kind, beatport_id, since, fetched_at, tracks)"
                    " VALUES (?, ?, ?, ?, ?)",
                    values,
                )

    def test_one_listing_per_artist_or_label(self, db):
        catalog = BeatportCatalogRepository(db)
        catalog.store_listing(BeatportListing("artist", 7, "2025-01-01", NOW, 0), [])
        catalog.store_listing(BeatportListing("label", 7, "2025-06-01", NOW, 0), [])
        catalog.store_listing(
            BeatportListing("artist", 7, "2025-02-01", "2026-09-24T00:00:00+00:00", 3),
            [],
        )
        assert _rows(db, "SELECT count(*) FROM beatport_listings") == [(2,)]
        assert catalog.listing("artist", 7) == BeatportListing(
            "artist", 7, "2025-02-01", "2026-09-24T00:00:00+00:00", 3
        )

    def test_only_the_catalog_module_runs_sql_against_it(self):
        package = Path(__file__).resolve().parents[3] / "cuepoint"
        statement = re.compile(
            r"\b(FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\s+beatport_listings\b", re.I
        )
        users = sorted(
            path.relative_to(package).as_posix()
            for path in package.rglob("*.py")
            if path.parent.name != "migrations"
            and statement.search(path.read_text(encoding="utf-8"))
        )
        assert users == ["persistence/beatport_catalog_repository.py"]
