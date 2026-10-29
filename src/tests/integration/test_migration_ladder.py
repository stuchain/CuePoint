#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Every upgrade, with data, from every version (HARDEN-02).

The per-migration tests each upgrade a library from the version just before
their migration. Nothing else walked the whole ladder, so a data loss that
only shows from an old shape (a rebuild that drops a column an older library
still fills) would reach a user first.

For every version V below the newest, this builds a library at V with rows in
every table that exists then (``tests/fixtures/schema_ladder.py``), and
upgrades it to the newest two ways:

* **at once**, through the real runner, as a launch does;
* **one migration at a time**, with the checks after each step, and with the
  rows of each table the step creates added before the next step.

After an upgrade every row that was there is still there, field for field
(columns a migration adds are ignored; a column or table that goes missing, or
a changed value, is a failure), the Collections still nest eight deep,
``PRAGMA integrity_check`` and ``PRAGMA foreign_key_check`` are clean, and the
recorded version is the newest.

``MIGRATION_ASSERTIONS`` then names what each migration did, one function each;
a migration without a row fails ``test_every_migration_has_an_assertion``, so a
new migration cannot ship without saying what it asserts.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Sequence

import pytest

from cuepoint.core.text_processing import search_fold
from cuepoint.migrations import Migration
from cuepoint.services import database_service as database_service_module
from cuepoint.services.backup_service import reason_of
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.utils.di_container import reset_container
from tests.fixtures import schema_ladder as ladder

pytestmark = pytest.mark.integration

HEAD = ladder.head_version()
OLDER_VERSIONS = list(range(1, HEAD))


# ------------------------------------------------------------------ checks


@dataclass(frozen=True)
class Crossing:
    """What a migration's assertion is told about the upgrade it was part of."""

    from_version: int
    before: Dict[str, Dict[str, Any]]

    def rows(self, table: str) -> list:
        """The rows the table had before the upgrade (none if it did not exist)."""
        return list(self.before.get(table, {}).get("rows", []))


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    return name in ladder.table_names(conn)


def _has_columns(conn: sqlite3.Connection, table: str, columns: Sequence[str]) -> bool:
    have = ladder.columns_of(conn, table)
    return all(c in have for c in columns)


def _objects(conn: sqlite3.Connection, kind: str) -> set:
    return {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type = ?", (kind,))
    }


def _scalar(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> Any:
    row = conn.execute(sql, params).fetchone()
    return None if row is None else row[0]


def table_check(*tables: str) -> Callable[[sqlite3.Connection, Crossing], None]:
    def check(conn: sqlite3.Connection, _crossing: Crossing) -> None:
        for table in tables:
            assert _has_table(conn, table), f"{table} is missing"

    return check


def index_check(*indexes: str) -> Callable[[sqlite3.Connection, Crossing], None]:
    def check(conn: sqlite3.Connection, _crossing: Crossing) -> None:
        missing = set(indexes) - _objects(conn, "index")
        assert not missing, f"indexes missing: {sorted(missing)}"

    return check


def column_check(
    table: str, *columns: str
) -> Callable[[sqlite3.Connection, Crossing], None]:
    def check(conn: sqlite3.Connection, _crossing: Crossing) -> None:
        assert _has_columns(conn, table, columns), (
            f"{table} lacks one of {columns}: {ladder.columns_of(conn, table)}"
        )

    return check


def all_of(*checks: Callable[[sqlite3.Connection, Crossing], None]):
    def check(conn: sqlite3.Connection, crossing: Crossing) -> None:
        for each in checks:
            each(conn, crossing)

    return check


def _same_rows_after(
    conn: sqlite3.Connection,
    crossing: Crossing,
    table: str,
    columns: Sequence[str],
) -> None:
    after = ladder.project(ladder.snapshot(conn)[table]["rows"], columns)
    assert after == ladder.project(crossing.before[table]["rows"], columns), (
        f"{table}: rows changed across the rebuild"
    )


def _m0001(conn: sqlite3.Connection, _crossing: Crossing) -> None:
    row = conn.execute(
        "SELECT description FROM schema_version WHERE version = 1"
    ).fetchone()
    assert row is not None and "baseline" in row[0]


def _m0012(conn: sqlite3.Connection, crossing: Crossing) -> None:
    """The candidates table was rebuilt: same ids, same scores, same winner."""
    assert _has_columns(conn, "match_candidates", ["title_sim", "artist_sim"])
    if "match_candidates" in crossing.before:
        cols = [c for c in crossing.before["match_candidates"]["columns"]]
        _same_rows_after(conn, crossing, "match_candidates", cols)
        _same_rows_after(
            conn,
            crossing,
            "track_match",
            crossing.before["track_match"]["columns"],
        )
    assert "idx_match_candidates_attempt" in _objects(conn, "index")


def _m0016(conn: sqlite3.Connection, crossing: Crossing) -> None:
    assert "duplicate_track_signals" in _objects(conn, "view")
    assert _has_columns(conn, "duplicate_groups", ["member_hash"])
    # The view must run, and show only groups of two or more not dismissed.
    conn.execute("SELECT track_id, signal, group_id FROM duplicate_track_signals")
    if crossing.rows("duplicate_groups"):
        hashes = {
            r[0] for r in conn.execute("SELECT member_hash FROM duplicate_groups")
        }
        assert hashes == {""}, "old groups should get the empty member hash"


def _m0019(conn: sqlite3.Connection, crossing: Crossing) -> None:
    assert _has_columns(conn, "track_match", ["candidate_score"])
    if "track_match" in crossing.before:
        wrong = _scalar(
            conn,
            "SELECT count(*) FROM track_match t JOIN match_candidates c"
            " ON c.id = t.candidate_id WHERE t.candidate_score IS NOT c.score",
        )
        assert wrong == 0, "candidate_score was not filled from the candidate"


def _m0022(conn: sqlite3.Connection, crossing: Crossing) -> None:
    """Keys are derived data a job fills later: rows from before have none."""
    for table in ("tracks", "track_metadata"):
        assert _has_columns(conn, table, ["label_key"])
        was = crossing.before.get(table)
        if was is not None and "label_key" not in was["columns"] and was["rows"]:
            filled = _scalar(
                conn, f'SELECT count(*) FROM "{table}" WHERE label_key IS NOT NULL'
            )
            assert filled == 0, f"{table}: old rows got a label_key from the migration"


def _m0025(conn: sqlite3.Connection, crossing: Crossing) -> None:
    """Collections, their tracks and exported playlists were rebuilt in place."""
    all_of(
        table_check(
            "set_details", "set_chapters", "set_entries", "set_acknowledgements"
        ),
        index_check("idx_collections_kind", "idx_collection_tracks_entry"),
    )(conn, crossing)
    if "collections" in crossing.before:
        for table in ("collections", "collection_tracks", "rekordbox_export_playlists"):
            if table in crossing.before:
                _same_rows_after(
                    conn, crossing, table, crossing.before[table]["columns"]
                )
        # AUTOINCREMENT carried across the rebuild: the next id is not reused.
        top = _scalar(conn, "SELECT max(id) FROM collections")
        seq = _scalar(conn, "SELECT seq FROM sqlite_sequence WHERE name='collections'")
        if top is not None:
            assert seq is not None and seq >= top


def _m0027(conn: sqlite3.Connection, crossing: Crossing) -> None:
    all_of(
        table_check("library_reads", "play_counts"), index_check("idx_play_counts_read")
    )(conn, crossing)
    # Tracks that had a play count become the first read, a 'seed'.
    # (Only when a library had been read at all: the seed read copies the
    # time of the newest library_source row.)
    expected = sorted(
        (r["id"], r["play_count"])
        for r in crossing.rows("tracks")
        if r.get("play_count") is not None and crossing.rows("library_source")
    )
    seeded = sorted(
        (r[0], r[1])
        for r in conn.execute(
            "SELECT p.track_id, p.play_count FROM play_counts p"
            " JOIN library_reads r ON r.id = p.read_id AND r.kind = 'seed'"
        )
    )
    assert seeded == expected


def _m0029(conn: sqlite3.Connection, crossing: Crossing) -> None:
    all_of(
        table_check("discover_lists", "discover_list_members"),
        index_check("idx_discover_list_members_order"),
    )(conn, crossing)
    for kind, name_key in (("labels", "my labels"), ("artists", "my artists")):
        picked = _newest_picked(crossing.rows("discovery_runs"), kind)
        if not picked:
            continue
        row = conn.execute(
            "SELECT id FROM discover_lists WHERE name_key = ?", (name_key,)
        ).fetchone()
        assert row is not None, f"the newest picked run should seed '{name_key}'"
        members = [
            r[0]
            for r in conn.execute(
                "SELECT member FROM discover_list_members WHERE list_id = ?"
                " ORDER BY position",
                (row[0],),
            )
        ]
        expected = []
        for value in picked:
            value = value.strip()
            if value and len(value) <= 300 and value not in expected:
                expected.append(value)
        assert members == expected, "trimmed, de-duplicated, in order"


def _m0032(conn: sqlite3.Connection, crossing: Crossing) -> None:
    """Path keys are composed; file_path is exactly what it was."""
    rows = {
        r[0]: (r[1], r[2])
        for r in conn.execute("SELECT id, file_path, normalized_path FROM tracks")
    }
    before = {r["id"]: r for r in crossing.rows("tracks")}
    if not before:
        return
    decomposed = 0
    for track_id, was in before.items():
        file_path, key = rows[track_id]
        assert file_path == was["file_path"], "file_path was rewritten"
        assert key == unicodedata.normalize("NFC", key), f"{key!r} is not composed"
        if was["normalized_path"] != unicodedata.normalize(
            "NFC", was["normalized_path"]
        ):
            decomposed += 1
            assert key == unicodedata.normalize("NFC", was["normalized_path"])
        else:
            assert key == was["normalized_path"], "a composed key was changed"
    # The seed's decomposed track is what proves the rewrite did something.
    assert decomposed >= 1, "the seed holds no decomposed key to rewrite"


def _fold(text):
    """The key the migration promises, written out (casefold, NFKD, marks off)."""
    return None if text is None else search_fold(text)


def _m0033(conn: sqlite3.Connection, crossing: Crossing) -> None:
    """Every searched field has its folded key, the label's from the override too."""
    assert _has_columns(
        conn,
        "tracks",
        (
            "title_search_key",
            "artist_search_key",
            "album_search_key",
            "label_search_key",
        ),
    )
    assert _has_columns(conn, "track_metadata", ("label_search_key",))
    assert [
        r[2] for r in conn.execute("PRAGMA index_info(idx_tracks_artist_title)")
    ] == ["artist_search_key", "artist", "title_search_key", "title", "id"]
    rows = conn.execute(
        "SELECT id, title, artist, album, label, title_search_key,"
        " artist_search_key, album_search_key, label_search_key FROM tracks"
    ).fetchall()
    for row in rows:
        assert row[5] == _fold(row[1]), f"title key of track {row[0]}"
        assert row[6] == _fold(row[2]), f"artist key of track {row[0]}"
        assert row[7] == _fold(row[3]), f"album key of track {row[0]}"
        assert row[8] == _fold(row[4]), f"label key of track {row[0]}"
    overrides = conn.execute(
        "SELECT track_id, label, label_search_key FROM track_metadata"
    ).fetchall()
    for row in overrides:
        assert row[2] == _fold(row[1]), f"override label key of track {row[0]}"
    if not crossing.rows("tracks"):
        return
    # The seed's decomposed Beyoncé and Déjà Vu, and its Greek and Japanese
    # names, are the rows that show the fold did something.
    keys = {r[5] for r in rows} | {r[6] for r in rows}
    assert {"deja vu", "beyonce", "夜に駆ける", "καλημερα κοσμε (extended mix)"} <= keys
    if any(
        r.get("label") == "Étiquette Spéciale" for r in crossing.rows("track_metadata")
    ):
        assert "etiquette speciale" in {r[2] for r in overrides}


def _newest_picked(runs: list, kind: str) -> list:
    """The ``picked`` names of the newest run that has any, as m0029 reads them."""
    for run in sorted(runs, key=lambda r: r["id"], reverse=True):
        try:
            picked = json.loads(run["params_json"])[kind]["picked"]
        except (TypeError, ValueError, KeyError):
            continue
        if isinstance(picked, list) and picked:
            return [v for v in picked if isinstance(v, str)]
    return []


def _m0030(conn: sqlite3.Connection, crossing: Crossing) -> None:
    all_of(
        table_check("discovery_run_groups"),
        column_check("discovery_run_sources", "group_key"),
        index_check("idx_discovery_run_sources_group"),
    )(conn, crossing)
    if crossing.rows("discovery_run_sources"):
        cols = crossing.before["discovery_run_sources"]["columns"]
        _same_rows_after(conn, crossing, "discovery_run_sources", cols)
        keys = {
            r[0] for r in conn.execute("SELECT group_key FROM discovery_run_sources")
        }
        assert keys == {""}, "old sources get the empty group"


#: One entry per migration module, keyed by its module name. Each function is
#: given the connection of the upgraded library and what it was before (see
#: :class:`Crossing`) and asserts what that migration did: the structure it
#: leaves, and, where it moves data, that the data came out right. They hold at
#: the newest schema too, because migrations only ever add. A new migration must
#: add its row, or ``test_every_migration_has_an_assertion`` fails.
MIGRATION_ASSERTIONS: Dict[str, Callable[[sqlite3.Connection, Crossing], None]] = {
    "m0001_baseline": _m0001,
    "m0002_tracks": all_of(
        table_check("tracks"),
        index_check("idx_tracks_rekordbox_track_id", "idx_tracks_normalized_path"),
    ),
    "m0003_jobs": all_of(
        table_check("jobs"), index_check("idx_jobs_state", "idx_jobs_created_at")
    ),
    "m0004_activity": all_of(
        table_check("activity_events", "track_history"),
        index_check("idx_activity_events_type", "idx_track_history_track_id"),
    ),
    "m0005_track_fields_and_source": all_of(
        column_check(
            "tracks",
            "rating",
            "play_count",
            "colour",
            "date_added",
            "comment",
            "bitrate",
        ),
        table_check("library_source"),
    ),
    "m0006_rekordbox_playlists": all_of(
        table_check("rekordbox_playlists", "rekordbox_playlist_tracks"),
        index_check(
            "idx_rekordbox_playlists_parent", "idx_rekordbox_playlist_tracks_track"
        ),
    ),
    "m0007_browse_indexes": index_check("idx_tracks_artist_title"),
    "m0008_facet_indexes": index_check(
        "idx_tracks_genre_facet",
        "idx_tracks_key_facet",
        "idx_tracks_colour_facet",
        "idx_tracks_label_facet",
        "idx_tracks_year_facet",
        "idx_tracks_rating_facet",
        "idx_tracks_bitrate_facet",
    ),
    "m0009_organization": all_of(
        table_check(
            "track_metadata", "tags", "track_tags", "collections", "collection_tracks"
        ),
        column_check("track_history", "batch_id"),
        index_check("idx_tags_name", "idx_collections_parent"),
    ),
    "m0010_tag_membership_index": index_check("idx_track_tags_tag"),
    "m0011_clean": all_of(
        table_check(
            "match_attempts",
            "match_candidates",
            "track_match",
            "match_job_tracks",
            "track_files",
            "duplicate_groups",
            "duplicate_members",
            "duplicate_dismissals",
            "track_artwork",
            "file_writes",
        ),
        column_check("track_metadata", "key", "bpm", "genre", "label", "year"),
    ),
    "m0012_match_similarity": _m0012,
    "m0013_match_jobs": table_check("match_jobs"),
    "m0014_history_batch_index": index_check("idx_track_history_batch"),
    "m0015_file_check_reason": column_check("track_files", "reason"),
    "m0016_duplicate_scan": _m0016,
    "m0017_artwork_scan": column_check(
        "track_artwork",
        "checked_path",
        "embedded_refused",
        "beatport_refused",
        "beatport_page",
    ),
    "m0018_tag_writes": all_of(
        column_check("file_writes", "pending", "restore_of"),
        index_check("idx_file_writes_restore_of"),
    ),
    "m0019_match_score": _m0019,
    "m0020_rekordbox_exports": all_of(
        table_check("rekordbox_exports", "rekordbox_export_playlists"),
        index_check("idx_rekordbox_export_playlists_export"),
    ),
    "m0021_discover": table_check(
        "beatport_tracks",
        "beatport_track_artists",
        "beatport_name_lookups",
        "discovery_runs",
        "discovery_run_tracks",
        "discovery_run_sources",
        "wantlist",
        "track_credits",
        "derived_indexes",
    ),
    "m0022_label_keys": _m0022,
    "m0023_beatport_identity": lambda conn, _c: _view_runs(
        conn, "library_beatport_tracks", "library_beatport_credits"
    ),
    "m0024_entity_pages": all_of(
        table_check("beatport_listings"),
        index_check("idx_tracks_label_key", "idx_track_metadata_label_key"),
        lambda conn, _c: _view_runs(
            conn,
            "library_beatport_tracks",
            "library_beatport_artists",
            "library_beatport_labels",
            "library_beatport_credits",
            "beatport_catalog_credits",
        ),
    ),
    "m0025_sets": _m0025,
    "m0026_track_marks": table_check("track_cues", "track_beat_grid"),
    "m0027_play_history": _m0027,
    "m0028_match_job_label": column_check("match_jobs", "label"),
    "m0029_discover_lists": _m0029,
    "m0030_discover_groups": _m0030,
    "m0031_library_meta": table_check("library_meta"),
    "m0032_path_nfc": _m0032,
    "m0033_search_keys": _m0033,
}


def _view_runs(conn: sqlite3.Connection, *views: str) -> None:
    """A view exists and its SELECT still compiles against today's tables."""
    present = _objects(conn, "view")
    for view in views:
        assert view in present, f"view {view} is missing"
        conn.execute(f'SELECT * FROM "{view}" LIMIT 1').fetchall()


# ------------------------------------------------------------- the harness


def open_library(path: Path) -> DatabaseService:
    return DatabaseService(db_path=path)


def assert_relations(conn: sqlite3.Connection) -> None:
    """The seed's relations, read back through joins, not just constraints."""
    tables = set(ladder.table_names(conn))
    if "collections" in tables and _scalar(conn, "SELECT count(*) FROM collections"):
        depth = _scalar(
            conn,
            "WITH RECURSIVE tree(id, level) AS ("
            " SELECT id, 0 FROM collections WHERE id = 1"
            " UNION ALL SELECT c.id, tree.level + 1 FROM collections c"
            " JOIN tree ON c.parent_id = tree.id) SELECT max(level) FROM tree",
        )
        assert depth == 8, f"the Collections nest {depth} deep, not eight"
    if {"tags", "track_tags", "tracks"} <= tables:
        orphans = _scalar(
            conn,
            "SELECT count(*) FROM track_tags tt LEFT JOIN tags t ON t.id = tt.tag_id"
            " LEFT JOIN tracks k ON k.id = tt.track_id"
            " WHERE t.id IS NULL OR k.id IS NULL",
        )
        assert orphans == 0
    if {"track_match", "match_candidates", "match_attempts"} <= tables:
        broken = _scalar(
            conn,
            "SELECT count(*) FROM track_match m"
            " JOIN match_attempts a ON a.id = m.attempt_id"
            " LEFT JOIN match_candidates c ON c.id = m.candidate_id"
            " WHERE m.candidate_id IS NOT NULL AND c.attempt_id IS NOT a.id",
        )
        assert broken == 0, "a decision points at another attempt's candidate"
    if {"set_entries", "collection_tracks", "set_chapters"} <= tables:
        linked = _scalar(
            conn,
            "SELECT count(*) FROM set_entries e"
            " JOIN collection_tracks ct ON ct.id = e.entry_id"
            " AND ct.collection_id = e.collection_id"
            " JOIN set_chapters ch ON ch.id = e.chapter_id"
            " AND ch.collection_id = e.collection_id",
        )
        assert linked == _scalar(conn, "SELECT count(*) FROM set_entries")


def assert_unicode_survived(conn: sqlite3.Connection) -> None:
    """The NFD and non-Latin titles come back byte for byte, un-normalised."""
    titles = {r[0] for r in conn.execute("SELECT title FROM tracks")}
    assert ladder.NFD_TITLE in titles
    assert "夜に駆ける" in titles
    assert "Καλημέρα Κόσμε (Extended Mix)" in titles
    artists = {r[0] for r in conn.execute("SELECT artist FROM tracks")}
    assert ladder.NFD_ARTIST in artists


def run_assertions(
    conn: sqlite3.Connection, migrations: Sequence[Migration], crossing: Crossing
) -> None:
    for migration in migrations:
        check = MIGRATION_ASSERTIONS[migration.module_name]
        try:
            check(conn, crossing)
        except AssertionError as exc:
            raise AssertionError(f"{migration.module_name}: {exc}") from exc


def row_counts(path: Path) -> Dict[str, int]:
    connection = sqlite3.connect(str(path))
    try:
        return {
            t: connection.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
            for t in ladder.table_names(connection)
        }
    finally:
        connection.close()


# ------------------------------------------------------------------- tests


class TestTheTableIsComplete:
    def test_every_migration_has_an_assertion(self):
        names = {m.module_name for m in ladder.all_migrations()}
        missing = sorted(names - set(MIGRATION_ASSERTIONS))
        assert not missing, (
            f"migrations without a row in MIGRATION_ASSERTIONS: {missing}. "
            "Add what the migration does, and rows for its tables to "
            "tests/fixtures/schema_ladder.py."
        )

    def test_no_row_names_a_migration_that_does_not_exist(self):
        names = {m.module_name for m in ladder.all_migrations()}
        stale = sorted(set(MIGRATION_ASSERTIONS) - names)
        assert not stale, f"rows for migrations that are not in the package: {stale}"

    def test_the_seed_covers_every_table_at_the_newest_version(self, tmp_path):
        service = open_library(tmp_path / "head.db")
        try:
            MigrationRunner(service).migrate()
            ladder.check_every_table_has_a_seed(service.connect())
        finally:
            service.close_all()

    def test_the_seed_puts_rows_in_every_table_at_every_version(self, tmp_path):
        for version in range(1, HEAD + 1):
            path = ladder.build_library_at(version, directory=tmp_path / f"v{version}")
            empty = [
                t
                for t, n in row_counts(path).items()
                if n == 0 and t not in ladder.UNSEEDED | {"revision_counters"}
            ]
            assert empty == [], f"version {version}: no rows in {empty}"

    def test_the_same_seed_gives_the_same_rows(self, tmp_path):
        first = ladder.snapshot_of(ladder.build_library_at(20, 5, tmp_path / "a"))
        second = ladder.snapshot_of(ladder.build_library_at(20, 5, tmp_path / "b"))
        assert first == second


class TestTheCheckerSeesLoss:
    """The ladder is only worth having if it fails when a row goes missing."""

    def test_a_migration_that_drops_a_row_is_caught(self, tmp_path):
        path = ladder.build_library_at(HEAD, directory=tmp_path)
        before = ladder.snapshot_of(path)
        connection = sqlite3.connect(str(path))
        try:
            connection.execute("DELETE FROM tags WHERE id = 3")
            connection.commit()
            with pytest.raises(AssertionError, match="tags"):
                ladder.assert_nothing_lost(connection, before, "self-test")
        finally:
            connection.close()

    def test_a_migration_that_changes_a_value_is_caught(self, tmp_path):
        path = ladder.build_library_at(HEAD, directory=tmp_path)
        before = ladder.snapshot_of(path)
        connection = sqlite3.connect(str(path))
        try:
            connection.execute("UPDATE tracks SET title = lower(title) WHERE id = 1")
            connection.commit()
            with pytest.raises(AssertionError, match="tracks"):
                ladder.assert_nothing_lost(connection, before, "self-test")
        finally:
            connection.close()

    def test_a_dropped_column_is_caught(self, tmp_path):
        path = ladder.build_library_at(HEAD, directory=tmp_path)
        before = ladder.snapshot_of(path)
        connection = sqlite3.connect(str(path))
        try:
            connection.execute("ALTER TABLE tags DROP COLUMN colour")
            connection.commit()
            with pytest.raises(AssertionError, match="lost columns"):
                ladder.assert_nothing_lost(connection, before, "self-test")
        finally:
            connection.close()


@pytest.mark.parametrize("version", OLDER_VERSIONS, ids=lambda v: f"from-v{v:02d}")
class TestUpgradeAtOnce:
    def test_a_library_at_v_upgrades_to_the_newest_with_its_data(
        self, tmp_path, version
    ):
        path = ladder.build_library_at(version, directory=tmp_path)
        before = ladder.snapshot_of(path)
        counts_before = row_counts(path)

        service = open_library(path)
        try:
            applied = MigrationRunner(service).migrate()
            conn = service.connect()
            assert [m.version for m in applied] == list(range(version + 1, HEAD + 1))

            ladder.assert_sound(conn, HEAD)
            ladder.assert_nothing_lost(
                conn,
                before,
                f"v{version} -> head",
                ladder.rewritten_between(version, HEAD),
            )
            assert_relations(conn)
            if version >= 2:
                assert_unicode_survived(conn)
            counts_after = {
                t: conn.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
                for t in counts_before
            }
            for table, count in counts_before.items():
                assert counts_after[table] >= count, f"{table} lost rows"

            run_assertions(
                conn,
                [m for m in ladder.all_migrations() if m.version > version],
                Crossing(version, before),
            )
            # Applying again is a no-op.
            assert MigrationRunner(service).migrate() == []
        finally:
            service.close_all()


@pytest.mark.parametrize("version", OLDER_VERSIONS, ids=lambda v: f"from-v{v:02d}")
class TestUpgradeOneStepAtATime:
    def test_each_step_keeps_the_data_and_passes_its_own_assertion(
        self, tmp_path, version
    ):
        path = ladder.build_library_at(version, directory=tmp_path)
        service = open_library(path)
        try:
            conn = service.connect()
            previous = ladder.snapshot(conn)
            current = version
            for migration in [
                m for m in ladder.all_migrations() if m.version > version
            ]:
                applied = MigrationRunner(
                    service, migrations=ladder.migrations_through(migration.version)
                ).migrate()
                assert [m.version for m in applied] == [migration.version]
                current = migration.version

                conn = service.connect()
                ladder.assert_sound(conn, current)
                ladder.assert_nothing_lost(
                    conn,
                    previous,
                    f"step to m{current:04d}",
                    ladder.rewritten_between(current - 1, current),
                )
                run_assertions(conn, [migration], Crossing(current - 1, previous))

                # Rows for the tables this step made, so the next steps carry them.
                made = [t for t in ladder.table_names(conn) if t not in previous]
                with service.transaction() as txn:
                    ladder.seed_tables(txn, current, only_empty=True, tables=made)
                ladder.assert_sound(conn, current)
                previous = ladder.snapshot(conn)
            assert current == HEAD
            assert_relations(conn)
        finally:
            service.close_all()


class TestTheWholeLadderFromTheStart:
    def test_from_an_empty_database_one_step_at_a_time_with_rows_added_as_tables_appear(
        self, tmp_path
    ):
        """V=1 has no data tables; each step's new tables are filled before the next."""
        service = open_library(tmp_path / "cuepoint.db")
        try:
            previous: Dict[str, Dict[str, Any]] = {}
            for migration in ladder.all_migrations():
                MigrationRunner(
                    service, migrations=ladder.migrations_through(migration.version)
                ).migrate()
                conn = service.connect()
                ladder.assert_sound(conn, migration.version)
                ladder.assert_nothing_lost(
                    conn,
                    previous,
                    f"m{migration.version:04d}",
                    ladder.rewritten_between(migration.version - 1, migration.version),
                )
                run_assertions(
                    conn, [migration], Crossing(migration.version - 1, previous)
                )
                made = [t for t in ladder.table_names(conn) if t not in previous]
                with service.transaction() as txn:
                    ladder.seed_tables(
                        txn, migration.version, only_empty=True, tables=made
                    )
                previous = ladder.snapshot(conn)
            conn = service.connect()
            assert_relations(conn)
            assert_unicode_survived(conn)
            ladder.assert_sound(conn, HEAD)
        finally:
            service.close_all()

    @pytest.mark.parametrize("start", [1, 12, 24, HEAD - 1], ids=lambda v: f"from-v{v}")
    def test_a_fresh_database_at_the_newest_version_matches_an_upgraded_one(
        self, tmp_path, start
    ):
        """A user who installs today and one who upgraded hold the same schema.

        Compared by every table's column set and by the name and table of every
        index, view and trigger in ``sqlite_master``.
        """
        fresh = open_library(tmp_path / "fresh.db")
        upgraded = open_library(
            ladder.build_library_at(start, directory=tmp_path / "old")
        )
        try:
            MigrationRunner(fresh).migrate()
            MigrationRunner(upgraded).migrate()

            def shape(service: DatabaseService):
                conn = service.connect()
                tables = {
                    t: sorted(ladder.columns_of(conn, t))
                    for t in ladder.table_names(conn)
                }
                objects = {
                    (r[0], r[1], r[2])
                    for r in conn.execute(
                        "SELECT type, name, tbl_name FROM sqlite_master"
                        " WHERE type IN ('index', 'view', 'trigger')"
                        " AND name NOT LIKE 'sqlite_%'"
                    )
                }
                return tables, objects

            fresh_tables, fresh_objects = shape(fresh)
            old_tables, old_objects = shape(upgraded)
            # Column order can differ (ALTER appends); the set may not.
            assert old_tables == fresh_tables
            assert old_objects == fresh_objects, (
                f"only upgraded: {sorted(old_objects - fresh_objects)}; "
                f"only fresh: {sorted(fresh_objects - old_objects)}"
            )
        finally:
            fresh.close_all()
            upgraded.close_all()


LIBRARIES = sorted(
    (Path(__file__).parent.parent / "fixtures" / "libraries").glob("*.db")
)


@pytest.mark.parametrize(
    "library",
    LIBRARIES
    or [
        pytest.param(
            None,
            marks=pytest.mark.skip(
                reason="no real library fixtures yet: add one per published "
                "v1.0.0-test.N build to src/tests/fixtures/libraries/*.db"
            ),
        )
    ],
    ids=lambda p: p.name if p is not None else "none",
)
class TestRealLibrariesFromEarlierBuilds:
    """Libraries a published build wrote, each migrated to the newest version."""

    def test_at_once_and_one_step_at_a_time(self, tmp_path, library):
        at_once = tmp_path / "once" / "cuepoint.db"
        stepwise = tmp_path / "steps" / "cuepoint.db"
        for target in (at_once, stepwise):
            target.parent.mkdir()
            shutil.copyfile(library, target)
        before = ladder.snapshot_of(at_once)
        start = max(
            sqlite3.connect(str(at_once))
            .execute("SELECT version FROM schema_version")
            .fetchall()
        )[0]

        service = open_library(at_once)
        try:
            MigrationRunner(service).migrate()
            ladder.assert_sound(service.connect(), HEAD)
            ladder.assert_nothing_lost(service.connect(), before, library.name)
            run_assertions(
                service.connect(),
                [m for m in ladder.all_migrations() if m.version > start],
                Crossing(start, before),
            )
        finally:
            service.close_all()

        service = open_library(stepwise)
        try:
            previous = before
            for migration in [m for m in ladder.all_migrations() if m.version > start]:
                MigrationRunner(
                    service, migrations=ladder.migrations_through(migration.version)
                ).migrate()
                conn = service.connect()
                ladder.assert_sound(conn, migration.version)
                ladder.assert_nothing_lost(conn, previous, library.name)
                run_assertions(
                    conn, [migration], Crossing(migration.version - 1, previous)
                )
                previous = ladder.snapshot(conn)
        finally:
            service.close_all()


# -------------------------------------------------------- the launch itself


@pytest.fixture
def launch_library(tmp_path, monkeypatch):
    """A library path the engine's launch backup and the DI container both use."""
    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    yield db_path
    reset_container()


class TestLaunchBackup:
    def test_a_library_one_version_behind_leaves_one_pre_upgrade_copy_at_that_version(
        self, tmp_path, launch_library
    ):
        from cuepoint.engine import server
        from cuepoint.services.backup_service import PRE_UPGRADE_REASON

        built = ladder.build_library_at(HEAD - 1, directory=tmp_path / "built")
        launch_library.write_bytes(built.read_bytes())
        before = ladder.snapshot_of(launch_library)

        taken = server.backup_library_on_launch()

        assert taken is not None and taken.reason == PRE_UPGRADE_REASON
        backups = sorted((launch_library.parent / "backups").glob("cuepoint-*.db"))
        assert [reason_of(p.name) for p in backups] == [PRE_UPGRADE_REASON], (
            "expected exactly one pre-upgrade copy and no launch copy"
        )
        assert not list((launch_library.parent / "backups").glob(".*.partial*"))

        copy = sqlite3.connect(str(backups[0]))
        try:
            assert copy.execute("PRAGMA quick_check").fetchall() == [("ok",)]
            assert copy.execute(
                "SELECT max(version) FROM schema_version"
            ).fetchone() == (HEAD - 1,)
            ladder.assert_nothing_lost(copy, before, "pre-upgrade copy")
        finally:
            copy.close()

        # Taking the copy migrated nothing; the upgrade that follows keeps the data.
        service = open_library(launch_library)
        try:
            assert_sound_head = MigrationRunner(service).migrate()
            assert [m.version for m in assert_sound_head] == [HEAD]
            ladder.assert_sound(service.connect(), HEAD)
            ladder.assert_nothing_lost(
                service.connect(),
                before,
                "launch upgrade",
                ladder.rewritten_between(HEAD - 1, HEAD),
            )
        finally:
            service.close_all()

        # And a second launch has nothing left to upgrade: no second pre-upgrade copy.
        reset_container()
        server.backup_library_on_launch()
        reasons = [
            reason_of(p.name)
            for p in (launch_library.parent / "backups").glob("cuepoint-*.db")
        ]
        assert reasons.count(PRE_UPGRADE_REASON) == 1

    def test_the_copy_taken_at_every_older_version_opens_and_upgrades(self, tmp_path):
        """A user rolling back to the copy from any release can still go forward."""
        from cuepoint.services.backup_service import PRE_UPGRADE_REASON, BackupService

        for version in (1, 9, 21, HEAD - 1):
            folder = tmp_path / f"v{version}"
            path = ladder.build_library_at(version, directory=folder)
            before = ladder.snapshot_of(path)
            service = open_library(path)
            try:
                backups = BackupService(database_service=service)
                taken = backups.backup_on_launch()
                assert taken is not None and taken.reason == PRE_UPGRADE_REASON
                copy_path = taken.path
            finally:
                service.close_all()

            restored = open_library(copy_path)
            try:
                MigrationRunner(restored).migrate()
                ladder.assert_sound(restored.connect(), HEAD)
                ladder.assert_nothing_lost(
                    restored.connect(),
                    before,
                    f"copy of v{version}",
                    ladder.rewritten_between(version, HEAD),
                )
            finally:
                restored.close_all()


def test_the_migrations_in_the_package_are_the_ones_the_ladder_walks():
    versions = [m.version for m in ladder.all_migrations()]
    assert versions == list(range(1, HEAD + 1))
    assert len(MIGRATION_ASSERTIONS) == HEAD
