#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Beatport catalog cache and the library's identity on it (DISCOVER-04).

``BeatportCatalogRepository`` is the one module that writes ``beatport_tracks``
and ``beatport_track_artists``, and the reader of migration 0023's views. These
tests hold its mapping to DISCOVER-01's recorded tracks, its re-read to an
upsert that never loses credits, its plan to "missing or stale, once each, in
order", and ``library_beatport_credits`` to DEC-095: identity follows the
accepted match, with nothing to invalidate.
"""

from __future__ import annotations

import json
import logging
from dataclasses import replace
from pathlib import Path

import pytest

from cuepoint.core.entity_names import name_key
from cuepoint.migrations import discover_migrations
from cuepoint.models.beatport_cache import LibraryBeatportCredit
from cuepoint.persistence import (
    beatport_catalog_repository as catalog_repository_module,
)
from cuepoint.persistence.beatport_catalog_repository import (
    BeatportCatalogRepository,
    catalog_rows,
)
from cuepoint.services.beatport_catalog import page_items, parse_catalog_track
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import (
    NOW,
    accept,
    add_tracks,
    catalog_track,
    set_match,
)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "beatport_v4"
EARLIER = "2026-08-01T00:00:00+00:00"
LATER = "2026-09-23T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> BeatportCatalogRepository:
    return BeatportCatalogRepository(db)


def fixture_track():
    data = json.loads((FIXTURES / "track.json").read_text(encoding="utf-8"))
    return parse_catalog_track(data)


def recorded_tracks():
    data = json.loads(
        (FIXTURES / "recorded" / "tracks_by_id.json").read_text(encoding="utf-8")
    )
    items, _ = page_items(data)
    return [parse_catalog_track(item) for item in items]


def count(db, table: str) -> int:
    return int(db.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


# ------------------------------------------------------------------ mapping


class TestTheMapping:
    def test_every_field_of_the_fixture_track(self):
        track = fixture_track()
        cached, credits = catalog_rows(track, NOW)
        assert cached.to_dict() == {
            "beatport_track_id": 19000001,
            "title": "Lantern Signal",
            "mix_name": "Dub Phizix Jr Remix",
            "url": "https://www.beatport.com/track/lantern-signal/19000001",
            "label_id": 40211,
            "label_name": "Nightfall Audio",
            "label_key": "nightfall audio",
            "release_id": 4500001,
            "release_name": "Lantern Signal EP",
            "release_date": "2026-08-14",
            "bpm": 124.0,
            "key": "Ebm",
            "genre_id": 5,
            "genre_name": "House",
            "fetched_at": NOW,
        }
        assert [
            (c.role, c.position, c.artist_id, c.name, c.name_key) for c in credits
        ] == [
            ("artist", 0, 301001, "Mara Veil", "mara veil"),
            ("artist", 1, 301002, "Óscar Lindqvist", "oscar lindqvist"),
            ("remixer", 0, 301003, "Dub Phizix Jr", "dub phizix jr"),
        ]

    def test_keys_are_the_librarys_own_rule(self):
        cached, credits = catalog_rows(fixture_track(), NOW)
        assert cached.label_key == name_key("Nightfall Audio")
        assert all(c.name_key == name_key(c.name) for c in credits)

    def test_blank_text_is_stored_as_null(self):
        track = replace(
            catalog_track(5),
            mix_name="",
            label_name="",
            release_name="",
            key="",
            genre_name="",
        )
        cached, _ = catalog_rows(track, NOW)
        assert cached.mix_name is None
        assert cached.label_name is None and cached.label_key is None
        assert cached.release_name is None and cached.key is None
        assert cached.genre_name is None

    def test_a_label_id_with_no_name(self):
        cached, _ = catalog_rows(replace(catalog_track(5), label_id=9), NOW)
        assert (cached.label_id, cached.label_name, cached.label_key) == (9, None, None)

    def test_every_recorded_track_maps(self):
        for track in recorded_tracks():
            cached, credits = catalog_rows(track, NOW)
            assert cached.beatport_track_id == track.id
            assert [c.artist_id for c in credits] == [
                a.id for a in track.artists + track.remixers
            ]


# -------------------------------------------------------------------- write


class TestStoring:
    def test_a_track_and_its_credits(self, db, repo):
        assert repo.upsert_tracks([fixture_track()], NOW) == 1
        assert (
            repo.get_tracks([19000001])[19000001]
            == catalog_rows(fixture_track(), NOW)[0]
        )
        assert repo.credits(19000001) == catalog_rows(fixture_track(), NOW)[1]

    def test_the_recorded_tracks(self, db, repo):
        tracks = recorded_tracks()
        assert repo.upsert_tracks(tracks, NOW) == len(tracks)
        assert set(repo.get_tracks([t.id for t in tracks])) == {t.id for t in tracks}

    def test_a_re_read_updates_in_place_and_rewrites_the_credits(self, db, repo):
        repo.upsert_tracks(
            [catalog_track(7, artists=[(1, "A"), (2, "B")], remixers=[(3, "C")])],
            EARLIER,
        )
        repo.upsert_tracks(
            [catalog_track(7, title="Renamed", artists=[(2, "B")], label=(4, "L"))],
            LATER,
        )
        cached = repo.get_tracks([7])[7]
        assert (cached.title, cached.fetched_at, cached.label_name) == (
            "Renamed",
            LATER,
            "L",
        )
        assert [(c.role, c.position, c.artist_id) for c in repo.credits(7)] == [
            ("artist", 0, 2)
        ]

    def test_a_re_read_keeps_what_references_the_track(self, db, repo):
        """An upsert, not ``INSERT OR REPLACE``: the wantlist entry survives."""
        repo.upsert_tracks([catalog_track(7, artists=[(1, "A")])], EARLIER)
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO wantlist (beatport_track_id, added_at) VALUES (7, ?)",
                (NOW,),
            )
        repo.upsert_tracks([catalog_track(7, artists=[(1, "A")])], LATER)
        assert count(db, "wantlist") == 1
        assert len(repo.credits(7)) == 1

    def test_a_track_the_models_refuse_is_left_out_and_the_rest_stored(self, db, repo):
        bad = replace(catalog_track(8), url="http://www.beatport.com/track/t/8")
        # A handler on the module's own logger, not caplog: another test's
        # logging setup can stop records reaching the root in a full run.
        records: list = []
        handler = logging.Handler()
        handler.emit = records.append  # type: ignore[method-assign]
        logger = logging.getLogger(catalog_repository_module.__name__)
        logger.addHandler(handler)
        try:
            stored = repo.upsert_tracks([catalog_track(7), bad, catalog_track(9)], NOW)
        finally:
            logger.removeHandler(handler)
        assert stored == 2
        assert set(repo.get_tracks([7, 8, 9])) == {7, 9}
        assert any(
            "catalog track 8 not stored" in record.getMessage() for record in records
        )

    def test_nothing_to_store(self, db, repo):
        assert repo.upsert_tracks([], NOW) == 0

    def test_a_batch_is_one_transaction(self, db, repo, monkeypatch):
        """A failure part-way stores nothing of the batch."""
        tracks = [catalog_track(i, artists=[(i, f"A{i}")]) for i in (1, 2)]
        real = repo._db.transaction

        class Boom(Exception):
            pass

        from contextlib import contextmanager

        @contextmanager
        def failing(*args, **kwargs):
            with real(*args, **kwargs) as conn:
                yield conn
                raise Boom()

        monkeypatch.setattr(repo._db, "transaction", failing)
        with pytest.raises(Boom):
            repo.upsert_tracks(tracks, NOW)
        monkeypatch.undo()
        assert count(db, "beatport_tracks") == 0
        assert count(db, "beatport_track_artists") == 0

    def test_many_tracks_at_once(self, db, repo):
        tracks = [catalog_track(i, artists=[(i, f"A{i}")]) for i in range(1, 1201)]
        assert repo.upsert_tracks(tracks, NOW) == 1200
        assert count(db, "beatport_tracks") == 1200
        assert count(db, "beatport_track_artists") == 1200
        repo.upsert_tracks(tracks, LATER)
        assert count(db, "beatport_track_artists") == 1200


# --------------------------------------------------------------------- read


class TestReading:
    def test_get_tracks_leaves_out_what_is_not_cached(self, repo):
        repo.upsert_tracks([catalog_track(1)], NOW)
        assert set(repo.get_tracks([1, 2, 1])) == {1}
        assert repo.get_tracks([]) == {}

    def test_get_tracks_over_many_ids(self, repo):
        repo.upsert_tracks([catalog_track(i) for i in range(1, 700)], NOW)
        assert len(repo.get_tracks(range(1, 1400))) == 699

    def test_credits_come_artists_first_in_beatports_order(self, repo):
        repo.upsert_tracks(
            [
                catalog_track(
                    1, artists=[(5, "E"), (4, "D")], remixers=[(3, "C"), (2, "B")]
                )
            ],
            NOW,
        )
        assert [(c.role, c.name) for c in repo.credits(1)] == [
            ("artist", "E"),
            ("artist", "D"),
            ("remixer", "C"),
            ("remixer", "B"),
        ]
        assert repo.credits(2) == []


# --------------------------------------------------------------------- plan


class TestTheResolvePlan:
    def test_missing_and_stale_are_read_and_fresh_are_kept(self, db, repo):
        with db.transaction() as conn:
            ids = add_tracks(conn, 5)
            for track_id, beatport in zip(ids, (30, 10, 20, 40, 50)):
                accept(conn, track_id, str(beatport))
        repo.upsert_tracks([catalog_track(10)], EARLIER)  # stale
        repo.upsert_tracks([catalog_track(20)], LATER)  # fresh
        to_read, owned = repo.resolve_plan("2026-09-01T00:00:00+00:00")
        assert to_read == [10, 30, 40, 50]
        assert owned == 5

    def test_each_id_once_however_many_tracks_own_it(self, db, repo):
        with db.transaction() as conn:
            ids = add_tracks(conn, 3)
            for track_id in ids:
                accept(conn, track_id, "77")
        assert repo.resolve_plan(NOW) == ([77], 1)

    def test_only_owned_tracks_are_read(self, db, repo):
        with db.transaction() as conn:
            ids = add_tracks(conn, 4)
            accept(conn, ids[0], "1", state="rejected", decided_by="user")
            accept(conn, ids[1], "2", state="needs_review")
            accept(conn, ids[2], "3", state="no_match")
            accept(conn, ids[3], "4")
        assert repo.resolve_plan(NOW) == ([4], 1)

    def test_an_empty_library(self, repo):
        assert repo.resolve_plan(NOW) == ([], 0)

    def test_a_cached_track_nothing_owns_is_not_read(self, db, repo):
        repo.upsert_tracks([catalog_track(1)], EARLIER)
        assert repo.resolve_plan(LATER) == ([], 0)


# ----------------------------------------------------------------- identity


@pytest.fixture
def resolved(db, repo):
    """Three library tracks: two resolved, one owned but not read yet."""
    with db.transaction() as conn:
        ids = add_tracks(conn, 4)
        accept(conn, ids[0], "101")
        accept(conn, ids[1], "102", decided_by="user")
        accept(conn, ids[2], "103")  # not in the cache
        # ids[3] is never matched.
    repo.upsert_tracks(
        [
            catalog_track(
                101, artists=[(9, "Âme"), (8, "Dixon")], label=(70, "Innervisions")
            ),
            catalog_track(102, artists=[(9, "Ame")], remixers=[(7, "Kerri Chandler")]),
        ],
        NOW,
    )
    return ids


class TestTheLibrarysIdentity:
    def test_each_resolved_track_its_artists_then_its_label(self, repo, resolved):
        found = repo.library_credits(resolved)
        assert set(found) == {resolved[0], resolved[1]}
        assert [
            (c.kind, c.role, c.position, c.beatport_id, c.name, c.name_key)
            for c in found[resolved[0]]
        ] == [
            ("artist", "artist", 0, 9, "Âme", "ame"),
            ("artist", "artist", 1, 8, "Dixon", "dixon"),
            ("label", None, None, 70, "Innervisions", "innervisions"),
        ]
        assert [(c.kind, c.role, c.beatport_id) for c in found[resolved[1]]] == [
            ("artist", "artist", 9),
            ("artist", "remixer", 7),
        ]
        assert all(c.beatport_track_id in (101, 102) for v in found.values() for c in v)

    def test_one_artist_id_across_two_spellings(self, db, resolved):
        rows = db.connect().execute(
            "SELECT track_id FROM library_beatport_credits"
            " WHERE kind = 'artist' AND beatport_id = 9 ORDER BY track_id"
        )
        assert [int(r[0]) for r in rows] == resolved[:2]

    def test_a_label_by_id(self, db, resolved):
        rows = db.connect().execute(
            "SELECT track_id FROM library_beatport_credits"
            " WHERE kind = 'label' AND beatport_id = 70"
        )
        assert [int(r[0]) for r in rows] == [resolved[0]]

    def test_a_label_with_an_id_and_no_name(self, db, repo):
        with db.transaction() as conn:
            [track_id] = add_tracks(conn, 1, start=50)
            accept(conn, track_id, "900")
        repo.upsert_tracks([replace(catalog_track(900), label_id=71)], NOW)
        [label] = repo.library_credits([track_id])[track_id]
        assert (label.kind, label.beatport_id, label.name, label.name_key) == (
            "label",
            71,
            None,
            None,
        )

    def test_a_track_with_no_label_has_no_label_row(self, resolved, repo):
        assert all(
            c.kind == "artist" for c in repo.library_credits([resolved[1]])[resolved[1]]
        )

    def test_a_rejected_match_has_no_identity_though_its_track_is_cached(
        self, db, repo, resolved
    ):
        candidate = int(
            db.connect()
            .execute(
                "SELECT candidate_id FROM track_match WHERE track_id = ?",
                (resolved[0],),
            )
            .fetchone()[0]
        )
        with db.transaction() as conn:
            set_match(conn, resolved[0], candidate, state="rejected", decided_by="user")
        assert resolved[0] not in repo.library_credits(resolved)
        assert 101 in repo.get_tracks([101])

    def test_a_new_candidate_is_the_new_identity_immediately(self, db, repo, resolved):
        """DISCOVER-04's test: nothing to invalidate when the match moves."""
        repo.upsert_tracks([catalog_track(104, artists=[(6, "Someone Else")])], NOW)
        with db.transaction() as conn:
            accept(conn, resolved[0], "104", decided_by="user")
        [credit] = repo.library_credits([resolved[0]])[resolved[0]]
        assert (credit.beatport_track_id, credit.beatport_id) == (104, 6)

    def test_every_row_is_a_valid_model(self, db, resolved):
        rows = db.connect().execute("SELECT * FROM library_beatport_credits").fetchall()
        assert len(rows) == 5
        for row in rows:
            LibraryBeatportCredit.from_row(row)

    def test_nothing_asked_is_nothing(self, repo, resolved):
        assert repo.library_credits([]) == {}


class TestTheCreditModel:
    def test_an_artist_needs_a_role_position_and_name(self):
        with pytest.raises(ValueError):
            LibraryBeatportCredit(
                1, 2, "artist", role=None, position=0, name="A", name_key="a"
            )
        with pytest.raises(ValueError):
            LibraryBeatportCredit(
                1, 2, "artist", role="artist", position=None, name="A", name_key="a"
            )
        with pytest.raises(ValueError):
            LibraryBeatportCredit(1, 2, "artist", role="artist", position=0)

    def test_a_label_has_no_role_or_position(self):
        with pytest.raises(ValueError):
            LibraryBeatportCredit(1, 2, "label", role="artist", beatport_id=3)
        with pytest.raises(ValueError):
            LibraryBeatportCredit(1, 2, "label", position=0, beatport_id=3)

    def test_a_label_names_a_label(self):
        with pytest.raises(ValueError):
            LibraryBeatportCredit(1, 2, "label")
        LibraryBeatportCredit(1, 2, "label", beatport_id=3)
        LibraryBeatportCredit(1, 2, "label", name="L", name_key="l")

    def test_a_name_and_its_key_travel_together(self):
        with pytest.raises(ValueError):
            LibraryBeatportCredit(1, 2, "label", beatport_id=3, name="L")

    def test_an_unknown_kind(self):
        with pytest.raises(ValueError):
            LibraryBeatportCredit(1, 2, "genre", beatport_id=3)


# ---------------------------------------------------------------- migration


def _runner(service, through: int) -> MigrationRunner:
    return MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= through]
    )


class TestMigration0023:
    @pytest.fixture
    def version_22(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "v22.db")
        _runner(service, 22).migrate()
        with service.transaction() as conn:
            ids = add_tracks(conn, 2)
            accept(conn, ids[0], "11")
            accept(conn, ids[1], None, "https://www.beatport.com/track/x/12")
        yield service
        service.close_all()

    def test_it_applies_alone_and_answers_for_matches_made_before_it(self, version_22):
        assert [m.version for m in _runner(version_22, 23).migrate()] == [23]
        rows = version_22.connect().execute(
            "SELECT track_id, beatport_track_id FROM library_beatport_tracks ORDER BY 1"
        )
        assert [tuple(r) for r in rows] == [(1, 11), (2, 12)]

    def test_it_creates_only_its_two_views(self, version_22):
        def objects():
            return {
                (r[0], r[1])
                for r in version_22.connect().execute(
                    "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
                )
            }

        before = objects()
        _runner(version_22, 23).migrate()
        assert objects() - before == {
            ("view", "library_beatport_tracks"),
            ("view", "library_beatport_credits"),
        }

    def test_the_views_columns(self, db):
        def columns(view):
            return [r[1] for r in db.connect().execute(f"PRAGMA table_info({view})")]

        assert columns("library_beatport_tracks") == [
            "track_id",
            "candidate_id",
            "beatport_track_id",
        ]
        assert columns("library_beatport_credits") == [
            "track_id",
            "beatport_track_id",
            "kind",
            "role",
            "position",
            "beatport_id",
            "name",
            "name_key",
        ]


class TestTheQueryPlans:
    """No view read scans the catalog: each reaches it by its key."""

    def plan(self, db, sql, params=()):
        return " | ".join(
            r[3] for r in db.connect().execute("EXPLAIN QUERY PLAN " + sql, params)
        )

    def test_a_windows_identity_reads_each_track_by_key(self, db):
        plan = self.plan(
            db,
            "SELECT * FROM library_beatport_credits WHERE track_id IN (1, 2, 3)",
        )
        assert "SCAN m" not in plan
        assert "SCAN a" not in plan and "SCAN b" not in plan

    def test_the_owned_set_scans_only_the_match_states(self, db):
        plan = self.plan(db, "SELECT beatport_track_id FROM library_beatport_tracks")
        assert "SCAN c" not in plan
        assert "SEARCH c USING INTEGER PRIMARY KEY" in plan
