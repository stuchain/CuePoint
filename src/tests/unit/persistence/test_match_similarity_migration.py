#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0012 — a candidate's similarities stored as real numbers.

The matcher's title similarity is RapidFuzz's ``token_set_ratio``, a float, and
``m0011`` declared the column ``INTEGER``. The fix rebuilds ``match_candidates``
inside the runner's transaction with foreign keys on, so the tests are about
what a rebuild can quietly break:

1. **A different table.** Only the two column types may change: every other
   column, constraint, index and reference is compared with what ``m0011``
   declared, down to the DDL text.
2. **A lost or renumbered row.** A version-11 database holding candidates, a
   user decision that references one, and rows in every other Clean table is
   compared row for row before and after.
3. **A reused id.** ``AUTOINCREMENT`` exists so a deleted candidate's id is not
   handed out again; the sequence must survive the table being dropped.
4. **A broken reference.** The decision must still point at its candidate, and
   that candidate must still refuse deletion.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-13T12:00:00+00:00"

#: What the matcher really produces for "Sunrise" against "Sunset Boulevard".
FRACTIONAL = 43.47826086956522

SIMILARITIES = ("title_sim", "artist_sim")


def at_version(tmp_path, name: str, version: int) -> DatabaseService:
    service = DatabaseService(db_path=tmp_path / name)
    MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= version]
    ).migrate()
    return service


@pytest.fixture
def fresh(tmp_path):
    service = DatabaseService(db_path=tmp_path / "fresh.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def v11(tmp_path):
    service = at_version(tmp_path, "v11.db", 11)
    yield service
    service.close_all()


def rows(service, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    return [dict(row) for row in service.connect().execute(sql, params)]


def table_sql(service, table: str) -> str:
    return str(
        service.connect()
        .execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        )
        .fetchone()["sql"]
    )


def snapshot(service) -> Dict[str, List[Dict[str, Any]]]:
    tables = [
        row["name"]
        for row in rows(
            service,
            "SELECT name FROM sqlite_master WHERE type = 'table'"
            " AND name NOT LIKE 'sqlite_%' AND name != 'schema_version'",
        )
    ]
    return {
        table: sorted(rows(service, f"SELECT * FROM {table}"), key=repr)
        for table in tables
    }


def schema(service):
    return [
        (r["type"], r["name"], r["sql"])
        for r in rows(
            service,
            "SELECT type, name, sql FROM sqlite_master"
            " WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
        )
    ]


def sequence(service) -> Dict[str, int]:
    return {r["name"]: r["seq"] for r in rows(service, "SELECT * FROM sqlite_sequence")}


def add_track(service, number: int) -> int:
    stored = TrackRepository(service).add(
        LibraryTrack(
            rekordbox_track_id=str(number),
            file_path=f"/m/{number}.mp3",
            title=f"T{number}",
            artist="An Artist",
        )
    )
    return int(stored.id)


def add_attempt(conn, track_id: int) -> int:
    return int(
        conn.execute(
            "INSERT INTO match_attempts"
            " (track_id, started_at, finished_at, outcome, input_json)"
            " VALUES (?, ?, ?, 'matched', '{}')",
            (track_id, NOW, NOW),
        ).lastrowid
    )


def add_candidate(conn, attempt_id: int, rank: int, title_sim: Any) -> int:
    return int(
        conn.execute(
            "INSERT INTO match_candidates"
            " (attempt_id, rank, url, title, score, base_score, title_sim,"
            "  artist_sim, bonus_year, bonus_key, guard_ok, reject_reason,"
            "  query_index, query_text, candidate_index, elapsed_ms, is_winner,"
            "  bpm, release_year)"
            " VALUES (?, ?, ?, 'Song', 91.5, 89.5, ?, 100, 2, -1, 1, NULL,"
            "  1, 'an artist song', ?, 300, ?, 128.0, 2024)",
            (
                attempt_id,
                rank,
                f"https://www.beatport.com/track/song/{attempt_id}{rank}",
                title_sim,
                rank + 1,
                1 if rank == 0 else 0,
            ),
        ).lastrowid
    )


@pytest.mark.unit
class TestDiscovery:
    def test_it_is_version_twelve(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert by_version[12].module_name == "m0012_match_similarity"


@pytest.mark.unit
class TestShape:
    def test_both_similarities_are_real(self, fresh):
        declared = {
            r["name"]: r["type"]
            for r in rows(fresh, "PRAGMA table_info(match_candidates)")
        }
        assert {name: declared[name] for name in SIMILARITIES} == {
            "title_sim": "REAL",
            "artist_sim": "REAL",
        }

    def test_nothing_else_about_the_table_changed(self, fresh, v11):
        before = table_sql(v11, "match_candidates")
        assert "title_sim         INTEGER" in before
        assert "artist_sim        INTEGER" in before
        expected = before.replace(
            "title_sim         INTEGER", "title_sim         REAL"
        ).replace("artist_sim        INTEGER", "artist_sim        REAL")
        assert table_sql(fresh, "match_candidates") == expected

    def test_columns_in_the_same_order_with_the_same_rules(self, fresh, v11):
        def info(service):
            return [
                (r["cid"], r["name"], r["notnull"], r["dflt_value"], r["pk"])
                for r in rows(service, "PRAGMA table_info(match_candidates)")
            ]

        assert info(fresh) == info(v11)

    def test_the_index_and_every_reference_are_as_they_were(self, fresh, v11):
        for sql in (
            "PRAGMA index_list(match_candidates)",
            "PRAGMA index_info(idx_match_candidates_attempt)",
            "PRAGMA foreign_key_list(match_candidates)",
            "PRAGMA foreign_key_list(track_match)",
        ):
            assert rows(fresh, sql) == rows(v11, sql), sql
        assert rows(fresh, "PRAGMA index_list(match_candidates)")[0]["unique"] == 1

    def test_no_working_table_is_left_behind(self, fresh):
        assert (
            rows(fresh, "SELECT name FROM sqlite_master WHERE name LIKE 'm0012%'") == []
        )

    def test_a_fractional_similarity_is_stored_as_scored(self, fresh):
        track = add_track(fresh, 1)
        with fresh.transaction() as conn:
            attempt = add_attempt(conn, track)
            add_candidate(conn, attempt, 0, FRACTIONAL)
            add_candidate(conn, attempt, 1, 100)
        stored = rows(
            fresh,
            "SELECT title_sim, typeof(title_sim) AS kind FROM match_candidates"
            " ORDER BY rank",
        )
        assert stored == [
            {"title_sim": FRACTIONAL, "kind": "real"},
            {"title_sim": 100.0, "kind": "real"},
        ]


@pytest.mark.unit
class TestUpgradingAVersionElevenLibrary:
    @pytest.fixture
    def populated(self, tmp_path):
        service = at_version(tmp_path, "upgrade.db", 11)
        first, second = add_track(service, 1), add_track(service, 2)
        with service.transaction() as conn:
            older = add_attempt(conn, first)
            chosen = [
                add_candidate(conn, older, rank, sim)
                for rank, sim in enumerate((FRACTIONAL, 100, 87.5, 12))
            ]
            newer = add_attempt(conn, first)
            add_candidate(conn, newer, 0, 99.0)
            theirs = add_attempt(conn, second)
            add_candidate(conn, theirs, 0, 55)
            # A deleted candidate leaves the sequence above the highest id.
            last = add_candidate(conn, theirs, 1, 1)
            conn.execute("DELETE FROM match_candidates WHERE id = ?", (last,))
            conn.execute(
                "INSERT INTO track_match (track_id, state, decided_by, attempt_id,"
                " candidate_id, newer_attempt_id, decided_at)"
                " VALUES (?, 'accepted', 'user', ?, ?, ?, ?)",
                (first, older, chosen[2], newer, NOW),
            )
            conn.execute(
                "INSERT INTO track_match (track_id, state, decided_by, attempt_id,"
                " decided_at) VALUES (?, 'no_match', 'auto', ?, ?)",
                (second, theirs, NOW),
            )
            conn.execute(
                "INSERT INTO match_job_tracks (job_id, position, track_id, done)"
                " VALUES ('job-1', 0, ?, 1)",
                (first,),
            )
            conn.execute(
                "INSERT INTO track_files (track_id, status, checked_path, checked_at)"
                " VALUES (?, 'present', '/m/1.mp3', ?)",
                (first, NOW),
            )
            conn.execute(
                "INSERT INTO file_writes (job_id, track_id, file_path, field,"
                " outcome, written_at) VALUES ('job-2', ?, '/m/1.mp3', 'key',"
                " 'written', ?)",
                (first, NOW),
            )
            conn.execute(
                "INSERT INTO track_metadata (track_id, rating, bpm, created_at,"
                " updated_at) VALUES (?, 4, 126.5, ?, ?)",
                (second, NOW, NOW),
            )
        service.ids = {"first": first, "second": second, "chosen": chosen[2]}
        yield service
        service.close_all()

    def test_it_applies(self, populated):
        assert [m.version for m in MigrationRunner(populated).migrate()][0] == 12

    def test_every_row_of_every_table_survives(self, populated):
        # Exactly version 12: a later migration may add a table of its own, and
        # this is a statement about what the rebuild keeps, not about them.
        before = snapshot(populated)
        MigrationRunner(
            populated, migrations=[m for m in discover_migrations() if m.version <= 12]
        ).migrate()
        assert snapshot(populated) == before

    def test_every_similarity_is_now_real(self, populated):
        MigrationRunner(populated).migrate()
        kinds = rows(
            populated,
            "SELECT DISTINCT typeof(title_sim) AS t, typeof(artist_sim) AS a"
            " FROM match_candidates",
        )
        assert kinds == [{"t": "real", "a": "real"}]
        assert FRACTIONAL in [
            r["title_sim"] for r in rows(populated, "SELECT * FROM match_candidates")
        ]

    def test_no_id_is_handed_out_twice(self, populated):
        before = sequence(populated)
        highest = rows(populated, "SELECT max(id) AS m FROM match_candidates")[0]["m"]
        assert before["match_candidates"] > highest

        MigrationRunner(populated).migrate()
        assert sequence(populated) == before

        track = add_track(populated, 3)
        with populated.transaction() as conn:
            new_id = add_candidate(conn, add_attempt(conn, track), 0, 50.0)
        assert new_id == before["match_candidates"] + 1

    def test_the_decision_still_points_at_its_candidate(self, populated):
        MigrationRunner(populated).migrate()
        decided = rows(
            populated,
            "SELECT candidate_id FROM track_match WHERE track_id = ?",
            (populated.ids["first"],),
        )
        assert decided == [{"candidate_id": populated.ids["chosen"]}]
        assert rows(populated, "PRAGMA foreign_key_check") == []

        import sqlite3

        with pytest.raises(sqlite3.IntegrityError):
            with populated.transaction() as conn:
                conn.execute(
                    "DELETE FROM match_candidates WHERE id = ?",
                    (populated.ids["chosen"],),
                )

    def test_deleting_a_track_still_takes_its_candidates(self, populated):
        MigrationRunner(populated).migrate()
        with populated.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (populated.ids["first"],))
        remaining = rows(
            populated,
            "SELECT DISTINCT a.track_id FROM match_candidates c"
            " JOIN match_attempts a ON a.id = c.attempt_id",
        )
        assert remaining == [{"track_id": populated.ids["second"]}]

    def test_the_upgraded_schema_is_a_fresh_one(self, populated, fresh):
        MigrationRunner(populated).migrate()
        assert schema(populated) == schema(fresh)


@pytest.mark.unit
class TestUpgradingAnEmptyTable:
    def test_no_sequence_appears_and_ids_start_at_one(self, v11):
        assert "match_candidates" not in sequence(v11)
        others = sequence(v11)

        MigrationRunner(v11).migrate()
        assert sequence(v11) == others

        track = add_track(v11, 1)
        with v11.transaction() as conn:
            assert add_candidate(conn, add_attempt(conn, track), 0, 1.5) == 1
