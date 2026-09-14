#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for migration 0011 — the Clean tables (CLEAN-01).

Forward-only DDL under user data, so the tests are about the ways this schema
could quietly go wrong rather than about whether a column exists:

1. **A cascade that reaches too far.** Deleting a track must not take another
   track's attempts, a duplicate group, a dismissal or a job's plan — and above
   all it must not take the record of what a tag write replaced. That last
   one, ``file_writes`` surviving with ``track_id`` set to null, is the test
   that would catch this phase's worst data-loss bug.
2. **A cascade that does not reach far enough.** Everything re-derivable about
   a deleted track goes with it, or the database keeps rows pointing at
   nothing.
3. **A reference that lets a decision lose its evidence.** Every attempt is
   kept (DEC-066); deleting one a decision rests on is refused.
4. **A vocabulary that drifts from its model.** Each CHECK is read back out of
   ``sqlite_master`` and compared with the constants the models validate
   against, so the two cannot disagree silently.
5. **A name collision.** The override columns share names with ``tracks``; a
   browse that joins ``track_metadata`` is run and must still read Rekordbox's
   values, because nothing reads the overrides until CLEAN-05.

The upgrade is tested with a version-10 database holding real rows in every
table that existed, and every one of those rows is compared before and after.
"""

from __future__ import annotations

import dataclasses
import itertools
import re
import sqlite3
from typing import Any, Dict, Iterable, List, Set

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.artwork import EMBEDDED_PRESENT, EMBEDDED_STATES, TrackArtwork
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.duplicate_group import (
    SIGNAL_TEXT,
    SIGNALS,
    DuplicateDismissal,
    DuplicateGroup,
    DuplicateMember,
    member_hash,
)
from cuepoint.models.file_status import FILE_PRESENT, FILE_STATUSES, TrackFileStatus
from cuepoint.models.file_write import WRITE_OUTCOMES, WRITE_WRITTEN, FileWrite
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import (
    DECIDED_BY_AUTO,
    DECIDED_BY_USER,
    DECIDERS,
    MATCH_STATES,
    OUTCOMES,
    STATE_ACCEPTED,
    MatchAttempt,
    MatchCandidate,
    MatchJobTrack,
    TrackMatch,
)
from cuepoint.models.track_metadata import OVERRIDE_FIELDS, TrackMetadata
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-13T12:00:00+00:00"

CLEAN_TABLES = (
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
)

CLEAN_INDEXES = (
    "idx_match_attempts_track",
    "idx_match_candidates_attempt",
    "idx_track_match_attempt",
    "idx_track_match_candidate",
    "idx_track_match_newer_attempt",
    "idx_duplicate_members_track",
    "idx_file_writes_job",
    "idx_file_writes_track",
)

#: The one index on a column that references nothing: CLEAN-10's restore reads
#: a job's write record by it, and the specification names it.
SPECIFIED_QUERY_INDEXES = {("file_writes", "job_id")}

#: Left unindexed until the step that writes the query measures it — the
#: discipline LIBUI-01 paid for and ORG-01 kept.
DELIBERATELY_UNINDEXED = (
    ("track_match", "state"),
    ("track_files", "status"),
    ("match_candidates", "beatport_track_id"),
    ("match_attempts", "job_id"),
    ("track_metadata", "key"),
    ("track_metadata", "bpm"),
    ("track_metadata", "genre"),
    ("track_metadata", "label"),
    ("track_metadata", "year"),
)

#: Every closed vocabulary in the migration, and the model constants that must
#: say the same thing.
VOCABULARIES = (
    ("match_attempts", "outcome", OUTCOMES),
    ("track_match", "state", MATCH_STATES),
    ("track_match", "decided_by", DECIDERS),
    ("track_files", "status", FILE_STATUSES),
    ("duplicate_groups", "signal", SIGNALS),
    ("duplicate_dismissals", "signal", SIGNALS),
    ("track_artwork", "embedded", EMBEDDED_STATES),
    ("file_writes", "outcome", WRITE_OUTCOMES),
)

#: The yes/no columns, each constrained to 0 and 1.
FLAGS = (
    ("match_candidates", "guard_ok"),
    ("match_candidates", "is_winner"),
    ("match_job_tracks", "done"),
)

MODEL_TABLES = (
    (MatchAttempt, "match_attempts"),
    (MatchCandidate, "match_candidates"),
    (TrackMatch, "track_match"),
    (MatchJobTrack, "match_job_tracks"),
    (TrackFileStatus, "track_files"),
    (DuplicateGroup, "duplicate_groups"),
    (DuplicateMember, "duplicate_members"),
    (DuplicateDismissal, "duplicate_dismissals"),
    (TrackArtwork, "track_artwork"),
    (FileWrite, "file_writes"),
    (TrackMetadata, "track_metadata"),
)

_numbers = itertools.count(1_000)


# --------------------------------------------------------------------- helpers


def _migrations_up_to(version: int):
    return [m for m in discover_migrations() if m.version <= version]


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def count(service, sql: str, params: Iterable[Any] = ()) -> int:
    return int(service.connect().execute(sql, tuple(params)).fetchone()[0])


def columns_of(service, table: str) -> List[str]:
    return [
        row["name"] for row in service.connect().execute(f"PRAGMA table_info({table})")
    ]


def table_sql(service, table: str) -> str:
    row = (
        service.connect()
        .execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        )
        .fetchone()
    )
    return str(row["sql"])


def insert(service, table: str, row: Dict[str, Any]) -> int:
    """Insert a row as given, leaving an unset ``id`` to the database."""
    data = {k: v for k, v in row.items() if not (k == "id" and v is None)}
    names = ", ".join(data)
    marks = ", ".join("?" for _ in data)
    with service.transaction() as conn:
        cursor = conn.execute(
            f"INSERT INTO {table} ({names}) VALUES ({marks})", tuple(data.values())
        )
        return int(cursor.lastrowid)


def add_track(service, number: int = 0, **fields) -> int:
    number = number or next(_numbers)
    fields.setdefault("title", f"T{number}")
    fields.setdefault("artist", "An Artist")
    stored = TrackRepository(service).add(
        LibraryTrack(
            rekordbox_track_id=str(number), file_path=f"/m/{number}.mp3", **fields
        )
    )
    assert stored.id is not None
    return int(stored.id)


def add_attempt(service, track_id: int, job_id: str = "job-1") -> int:
    return insert(
        service,
        "match_attempts",
        MatchAttempt(
            track_id=track_id,
            outcome="matched",
            input_json='{"title": "T", "artist": "An Artist"}',
            started_at=NOW,
            finished_at=NOW,
            job_id=job_id,
            matcher_version="1.0.0",
        ).to_dict(),
    )


def add_candidate(service, attempt_id: int, rank: int = 0, winner: bool = False) -> int:
    return insert(
        service,
        "match_candidates",
        MatchCandidate(
            attempt_id=attempt_id,
            rank=rank,
            url=f"https://www.beatport.com/track/t/{attempt_id}{rank}",
            score=96.0,
            guard_ok=True,
            is_winner=winner,
        ).to_dict(),
    )


def set_match(service, track_id: int, attempt_id: int, **fields) -> None:
    fields.setdefault("state", STATE_ACCEPTED)
    fields.setdefault("decided_by", DECIDED_BY_AUTO)
    fields.setdefault("decided_at", NOW)
    insert(
        service,
        "track_match",
        TrackMatch(track_id=track_id, attempt_id=attempt_id, **fields).to_dict(),
    )


def valid_row(service, table: str) -> Dict[str, Any]:
    """A raw row the table accepts, with whatever it references created first.

    Raw rather than built from a model, so a test can then set a column to a
    value the model would have refused and see what the *schema* does.
    """
    track = add_track(service)
    if table == "match_attempts":
        return dict(
            track_id=track,
            started_at=NOW,
            finished_at=NOW,
            outcome="matched",
            input_json="{}",
        )
    attempt = add_attempt(service, track)
    if table == "match_candidates":
        return dict(
            attempt_id=attempt,
            rank=0,
            url="https://www.beatport.com/track/t/1",
            score=1.0,
            guard_ok=1,
            is_winner=0,
        )
    candidate = add_candidate(service, attempt)
    key = f"k{next(_numbers)}"
    rows = {
        "track_match": dict(
            track_id=track,
            state="accepted",
            decided_by="auto",
            attempt_id=attempt,
            candidate_id=candidate,
            decided_at=NOW,
        ),
        "match_job_tracks": dict(
            job_id="job-1", position=next(_numbers), track_id=track, done=0
        ),
        "track_files": dict(
            track_id=track, status="present", checked_path="/m/1.mp3", checked_at=NOW
        ),
        "duplicate_groups": dict(signal="path", group_key=key, computed_at=NOW),
        "duplicate_dismissals": dict(
            signal="path", group_key=key, member_hash="h", dismissed_at=NOW
        ),
        "track_artwork": dict(track_id=track, embedded="unknown"),
        "file_writes": dict(
            job_id="job-1",
            track_id=track,
            file_path="/m/1.mp3",
            field="key",
            outcome="written",
            written_at=NOW,
        ),
    }
    return rows[table]


def check_vocabulary(service, table: str, column: str) -> Set[str]:
    """The values a CHECK allows, read out of the stored DDL."""
    match = re.search(
        rf"\b{column}\b[^,]*?CHECK\s*\(\s*{column}\s+IN\s*\(([^)]*)\)\s*\)",
        table_sql(service, table),
        re.DOTALL,
    )
    assert match, f"no CHECK on {table}.{column}"
    return {token.strip().strip("'") for token in match.group(1).split(",")}


def indexes_on(service, table: str) -> Dict[str, Dict[str, Any]]:
    """Every index on a table: its origin and its columns in order."""
    connection = service.connect()
    found: Dict[str, Dict[str, Any]] = {}
    for row in connection.execute(f"PRAGMA index_list({table})"):
        info = connection.execute(f"PRAGMA index_info('{row['name']}')").fetchall()
        found[row["name"]] = {
            "origin": row["origin"],
            "unique": bool(row["unique"]),
            "columns": [r["name"] for r in sorted(info, key=lambda r: r["seqno"])],
        }
    return found


def foreign_key_columns(service, table: str) -> Set[str]:
    return {
        row["from"]
        for row in service.connect().execute(f"PRAGMA foreign_key_list({table})")
    }


def rowid_alias(service, table: str) -> Set[str]:
    """The ``INTEGER PRIMARY KEY`` column, which is its own index."""
    pk = [
        row
        for row in service.connect().execute(f"PRAGMA table_info({table})")
        if row["pk"]
    ]
    if len(pk) == 1 and str(pk[0]["type"]).upper() == "INTEGER":
        return {pk[0]["name"]}
    return set()


def snapshot(service) -> Dict[str, List[Dict[str, Any]]]:
    """Every row of every table, in a comparable order."""
    connection = service.connect()
    tables = [
        row["name"]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
            " AND name NOT LIKE 'sqlite_%'"
        )
    ]
    return {
        table: sorted(
            (dict(row) for row in connection.execute(f"SELECT * FROM {table}")),
            key=repr,
        )
        for table in tables
    }


def schema(service):
    rows = service.connect().execute(
        "SELECT type, name, sql FROM sqlite_master"
        " WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    )
    return [(r["type"], r["name"], r["sql"]) for r in rows]


# ------------------------------------------------------------------- the shape


class TestMigration:
    def test_it_is_discovered_as_version_eleven(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert by_version[11].module_name == "m0011_clean"

    def test_a_fresh_database_ends_at_version_eleven_or_later(self, db):
        assert MigrationRunner(db).current_version() >= 11

    def test_every_table_exists(self, db):
        tables = {
            row["name"]
            for row in db.connect().execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        assert set(CLEAN_TABLES) <= tables

    def test_every_index_exists(self, db):
        present = {name for table in CLEAN_TABLES for name in indexes_on(db, table)}
        assert set(CLEAN_INDEXES) <= present

    def test_track_metadata_gains_exactly_the_five_overrides(self, db):
        assert columns_of(db, "track_metadata") == [
            "track_id",
            "rating",
            "favorite",
            "notes",
            "created_at",
            "updated_at",
            *OVERRIDE_FIELDS,
        ]

    def test_the_override_columns_have_the_imported_columns_types(self, db):
        # A BPM compared as text sorts "99" after "128"; the override has to be
        # the same kind of value as the column it stands in for (DEC-068).
        def types(table):
            return {
                row["name"]: str(row["type"]).upper()
                for row in db.connect().execute(f"PRAGMA table_info({table})")
            }

        imported, override = types("tracks"), types("track_metadata")
        for name in OVERRIDE_FIELDS:
            assert override[name] == imported[name], name

    @pytest.mark.parametrize("model, table", MODEL_TABLES)
    def test_each_model_is_exactly_its_table(self, db, model, table):
        # The contract every repository from CLEAN-02 on is built over: a
        # column with no field is data no read returns, and a field with no
        # column is data no write stores.
        assert {f.name for f in dataclasses.fields(model)} == set(columns_of(db, table))

    def test_every_field_a_beatport_candidate_carries_is_a_column(self, db):
        # DEC-066 keeps all candidates; a field dropped here is evidence no
        # later migration can recover. Only the raw payload is left out.
        carried = {f.name for f in dataclasses.fields(BeatportCandidate)} - {"raw_data"}
        assert carried <= set(columns_of(db, "match_candidates"))

    def test_foreign_keys_are_enforced_on_this_connection(self, db):
        assert db.connect().execute("PRAGMA foreign_keys").fetchone()[0] == 1


class TestIndexes:
    def test_every_index_is_on_a_referencing_column_a_key_or_a_named_query(self, db):
        for table in CLEAN_TABLES + ("track_metadata",):
            references = foreign_key_columns(db, table)
            for name, index in indexes_on(db, table).items():
                if index["origin"] in ("pk", "u"):
                    continue  # a key the table declared, not an index chosen
                leading = index["columns"][0]
                assert (
                    leading in references or (table, leading) in SPECIFIED_QUERY_INDEXES
                ), f"{name} on {table}.{leading} serves no cascade or named query"

    def test_every_referencing_column_is_found_without_a_scan(self, db):
        # SQLite scans the child table on every parent delete unless the
        # referencing column leads an index. Deleting 20,000 tracks would
        # otherwise scan track_match once per deleted candidate.
        for table in CLEAN_TABLES:
            leading = {
                index["columns"][0] for index in indexes_on(db, table).values()
            } | rowid_alias(db, table)
            for column in foreign_key_columns(db, table):
                assert column in leading, f"{table}.{column} is not indexed"

    def test_nothing_speculative_is_indexed(self, db):
        for table, column in DELIBERATELY_UNINDEXED:
            for name, index in indexes_on(db, table).items():
                assert column not in index["columns"], f"{name} indexes {column}"

    def test_a_candidate_rank_is_unique_within_its_attempt(self, db):
        index = indexes_on(db, "match_candidates")["idx_match_candidates_attempt"]
        assert index["unique"] and index["columns"] == ["attempt_id", "rank"]


class TestVocabularies:
    @pytest.mark.parametrize("table, column, allowed", VOCABULARIES)
    def test_the_check_says_what_the_model_says(self, db, table, column, allowed):
        assert check_vocabulary(db, table, column) == set(allowed)

    @pytest.mark.parametrize("table, column", FLAGS)
    def test_a_flag_is_zero_or_one(self, db, table, column):
        assert check_vocabulary(db, table, column) == {"0", "1"}

    @pytest.mark.parametrize("table, column, allowed", VOCABULARIES)
    def test_every_value_in_the_vocabulary_is_accepted(
        self, db, table, column, allowed
    ):
        for value in allowed:
            row = valid_row(db, table)
            row[column] = value
            insert(db, table, row)

    @pytest.mark.parametrize("table, column, allowed", VOCABULARIES)
    def test_a_value_outside_the_vocabulary_is_refused(
        self, db, table, column, allowed
    ):
        for value in ("bogus", allowed[0].upper(), ""):
            row = valid_row(db, table)
            row[column] = value
            with pytest.raises(sqlite3.IntegrityError):
                insert(db, table, row)

    @pytest.mark.parametrize("table, column", FLAGS)
    def test_a_flag_outside_zero_and_one_is_refused(self, db, table, column):
        for value in (2, -1, "yes"):
            row = valid_row(db, table)
            row[column] = value
            with pytest.raises(sqlite3.IntegrityError):
                insert(db, table, row)

    @pytest.mark.parametrize(
        "table, column",
        [
            ("match_attempts", "input_json"),
            ("match_attempts", "outcome"),
            ("match_candidates", "url"),
            ("match_candidates", "score"),
            ("track_match", "decided_at"),
            ("track_files", "checked_path"),
            ("duplicate_dismissals", "member_hash"),
            ("file_writes", "file_path"),
            ("file_writes", "job_id"),
        ],
    )
    def test_a_required_column_cannot_be_null(self, db, table, column):
        row = valid_row(db, table)
        row[column] = None
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, table, row)

    def test_artwork_starts_unknown(self, db):
        track = add_track(db)
        insert(db, "track_artwork", {"track_id": track})
        row = db.connect().execute("SELECT * FROM track_artwork").fetchone()
        assert TrackArtwork.from_row(row).embedded == "unknown"

    def test_a_plan_row_starts_not_done(self, db):
        insert(db, "match_job_tracks", {"job_id": "j", "position": 0, "track_id": 1})
        row = db.connect().execute("SELECT * FROM match_job_tracks").fetchone()
        assert MatchJobTrack.from_row(row).done is False


class TestIdentity:
    def test_an_attempt_ranks_each_candidate_once(self, db):
        attempt = add_attempt(db, add_track(db))
        add_candidate(db, attempt, rank=0)
        with pytest.raises(sqlite3.IntegrityError):
            add_candidate(db, attempt, rank=0)

    def test_another_attempt_may_use_the_same_rank(self, db):
        track = add_track(db)
        add_candidate(db, add_attempt(db, track), rank=0)
        assert add_candidate(db, add_attempt(db, track), rank=0) > 0

    def test_a_track_has_one_match_state(self, db):
        track = add_track(db)
        attempt = add_attempt(db, track)
        candidate = add_candidate(db, attempt)
        set_match(db, track, attempt, candidate_id=candidate)
        with pytest.raises(sqlite3.IntegrityError):
            set_match(db, track, attempt, candidate_id=candidate)

    def test_a_track_has_one_file_status_and_one_artwork_row(self, db):
        track = add_track(db)
        check = TrackFileStatus(track, FILE_PRESENT, "/m/1.mp3", NOW).to_dict()
        insert(db, "track_files", check)
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "track_files", check)
        insert(db, "track_artwork", TrackArtwork(track).to_dict())
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "track_artwork", TrackArtwork(track).to_dict())

    def test_a_signal_and_key_make_one_group_and_one_dismissal(self, db):
        group = DuplicateGroup(SIGNAL_TEXT, "a|t", NOW).to_dict()
        insert(db, "duplicate_groups", group)
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "duplicate_groups", group)
        dismissal = DuplicateDismissal(SIGNAL_TEXT, "a|t", "h", NOW).to_dict()
        insert(db, "duplicate_dismissals", dismissal)
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "duplicate_dismissals", dismissal)

    def test_the_same_key_under_another_signal_is_another_group(self, db):
        insert(db, "duplicate_groups", DuplicateGroup("path", "k", NOW).to_dict())
        assert insert(
            db, "duplicate_groups", DuplicateGroup("text", "k", NOW).to_dict()
        )

    def test_a_track_is_in_a_group_once(self, db):
        track = add_track(db)
        group = insert(
            db, "duplicate_groups", DuplicateGroup("path", "k", NOW).to_dict()
        )
        insert(db, "duplicate_members", DuplicateMember(group, track).to_dict())
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "duplicate_members", DuplicateMember(group, track).to_dict())

    def test_a_job_plan_has_one_track_per_position(self, db):
        insert(db, "match_job_tracks", MatchJobTrack("job-1", 0, 5).to_dict())
        insert(db, "match_job_tracks", MatchJobTrack("job-2", 0, 5).to_dict())
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "match_job_tracks", MatchJobTrack("job-1", 0, 6).to_dict())


class TestModelsRoundTripThroughRealRows:
    """``from_row`` over ``sqlite3.Row``, not over the dict ``to_dict`` made."""

    def test_every_clean_model_reads_back_what_was_stored(self, db):
        track = add_track(db)
        attempt_id = add_attempt(db, track)
        candidate_id = add_candidate(db, attempt_id, winner=True)
        group_id = insert(
            db, "duplicate_groups", DuplicateGroup("path", "k", NOW).to_dict()
        )
        stored = [
            (
                "match_attempts",
                attempt_id,
                MatchAttempt,
            ),
            ("match_candidates", candidate_id, MatchCandidate),
            (
                "file_writes",
                insert(
                    db,
                    "file_writes",
                    FileWrite(
                        job_id="job-1",
                        track_id=track,
                        file_path="/m/1.mp3",
                        field="bpm",
                        outcome=WRITE_WRITTEN,
                        written_at=NOW,
                        old_value_json="null",
                        new_value_json="126.5",
                    ).to_dict(),
                ),
                FileWrite,
            ),
            ("duplicate_groups", group_id, DuplicateGroup),
        ]
        connection = db.connect()
        for table, row_id, model in stored:
            row = connection.execute(
                f"SELECT * FROM {table} WHERE id = ?", (row_id,)
            ).fetchone()
            record = model.from_row(row)
            assert record.id == row_id
            assert {k: v for k, v in record.to_dict().items()} == dict(row)

    def test_keyed_by_track_models_read_back_what_was_stored(self, db):
        track = add_track(db)
        attempt = add_attempt(db, track)
        candidate = add_candidate(db, attempt, winner=True)
        records = [
            (
                "track_match",
                TrackMatch(
                    track, STATE_ACCEPTED, DECIDED_BY_USER, attempt, NOW, candidate
                ),
            ),
            (
                "track_files",
                TrackFileStatus(track, FILE_PRESENT, "/m/1.mp3", NOW, 4096),
            ),
            (
                "track_artwork",
                TrackArtwork(track, EMBEDDED_PRESENT, "ab", None, "ck", NOW),
            ),
        ]
        connection = db.connect()
        for table, record in records:
            insert(db, table, record.to_dict())
            row = connection.execute(
                f"SELECT * FROM {table} WHERE track_id = ?", (track,)
            ).fetchone()
            assert type(record).from_row(row) == record


# --------------------------------------------------------------------- cascades


@pytest.fixture
def furnished(db):
    """Two tracks, one carrying everything Phase 7 can attach to a track."""
    doomed = add_track(db, 1)
    keeper = add_track(db, 2)

    first = add_attempt(db, doomed, job_id="job-1")
    second = add_attempt(db, doomed, job_id="job-2")
    chosen = add_candidate(db, first, rank=0, winner=True)
    add_candidate(db, first, rank=1)
    add_candidate(db, second, rank=0, winner=True)
    # A user's decision on the first attempt, disputed by the second: every
    # reference track_match can hold points into this track's own rows.
    set_match(
        db,
        doomed,
        first,
        decided_by=DECIDED_BY_USER,
        candidate_id=chosen,
        newer_attempt_id=second,
    )

    kept_attempt = add_attempt(db, keeper)
    kept_candidate = add_candidate(db, kept_attempt, winner=True)
    set_match(db, keeper, kept_attempt, candidate_id=kept_candidate)

    insert(
        db,
        "track_files",
        TrackFileStatus(doomed, FILE_PRESENT, "/m/1.mp3", NOW).to_dict(),
    )
    insert(
        db,
        "track_artwork",
        TrackArtwork(
            doomed, EMBEDDED_PRESENT, embedded_hash="ab", checked_at=NOW
        ).to_dict(),
    )
    group = insert(
        db, "duplicate_groups", DuplicateGroup(SIGNAL_TEXT, "a|t", NOW).to_dict()
    )
    for track in (doomed, keeper):
        insert(db, "duplicate_members", DuplicateMember(group, track).to_dict())
    insert(
        db,
        "duplicate_dismissals",
        DuplicateDismissal(
            SIGNAL_TEXT, "a|t", member_hash([doomed, keeper]), NOW
        ).to_dict(),
    )
    insert(
        db,
        "file_writes",
        FileWrite(
            job_id="job-3",
            track_id=doomed,
            file_path="/m/1.mp3",
            field="key",
            outcome=WRITE_WRITTEN,
            written_at=NOW,
            old_value_json='"Am"',
            new_value_json='"8A"',
        ).to_dict(),
    )
    insert(
        db, "match_job_tracks", MatchJobTrack("job-1", 0, doomed, done=True).to_dict()
    )
    insert(db, "match_job_tracks", MatchJobTrack("job-1", 1, keeper).to_dict())
    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO track_metadata"
            " (track_id, favorite, key, bpm, created_at, updated_at)"
            " VALUES (?, 0, '8A', 126.0, 'now', 'now')",
            (doomed,),
        )
    return dict(
        doomed=doomed,
        keeper=keeper,
        first=first,
        second=second,
        chosen=chosen,
        kept_attempt=kept_attempt,
        kept_candidate=kept_candidate,
        group=group,
    )


def delete_track(db, track_id: int) -> None:
    """The real code path a refresh's deletion goes through."""
    assert TrackRepository(db).delete(track_id)


class TestDeletingATrack:
    def test_it_takes_everything_derived_from_the_track(self, db, furnished):
        doomed = furnished["doomed"]
        delete_track(db, doomed)

        for table in ("match_attempts", "track_match", "track_files", "track_artwork"):
            assert (
                count(db, f"SELECT count(*) FROM {table} WHERE track_id = ?", [doomed])
                == 0
            )
        assert (
            count(
                db,
                "SELECT count(*) FROM match_candidates WHERE attempt_id IN (?, ?)",
                [furnished["first"], furnished["second"]],
            )
            == 0
        )
        assert (
            count(
                db,
                "SELECT count(*) FROM duplicate_members WHERE track_id = ?",
                [doomed],
            )
            == 0
        )
        assert (
            count(
                db, "SELECT count(*) FROM track_metadata WHERE track_id = ?", [doomed]
            )
            == 0
        )

    def test_the_write_record_survives_without_its_track(self, db, furnished):
        # The worst data-loss bug this phase could have: the only record of
        # what a tag write replaced, deleted along with a track whose file
        # still holds the written tags.
        delete_track(db, furnished["doomed"])

        rows = db.connect().execute("SELECT * FROM file_writes").fetchall()
        assert len(rows) == 1
        record = FileWrite.from_row(rows[0])
        assert record.is_orphaned
        assert record.file_path == "/m/1.mp3"
        assert (record.old_value, record.new_value) == ("Am", "8A")

    def test_no_other_track_loses_anything(self, db, furnished):
        keeper = furnished["keeper"]
        delete_track(db, furnished["doomed"])

        assert (
            count(
                db, "SELECT count(*) FROM match_attempts WHERE track_id = ?", [keeper]
            )
            == 1
        )
        assert (
            count(
                db,
                "SELECT count(*) FROM match_candidates WHERE attempt_id = ?",
                [furnished["kept_attempt"]],
            )
            == 1
        )
        row = (
            db.connect()
            .execute("SELECT * FROM track_match WHERE track_id = ?", (keeper,))
            .fetchone()
        )
        assert TrackMatch.from_row(row).candidate_id == furnished["kept_candidate"]
        assert (
            count(
                db,
                "SELECT count(*) FROM duplicate_members WHERE track_id = ?",
                [keeper],
            )
            == 1
        )
        assert count(db, "SELECT count(*) FROM tracks") == 1

    def test_the_group_and_its_dismissal_are_not_the_tracks_to_take(
        self, db, furnished
    ):
        delete_track(db, furnished["doomed"])
        assert count(db, "SELECT count(*) FROM duplicate_groups") == 1
        assert count(db, "SELECT count(*) FROM duplicate_dismissals") == 1

    def test_a_job_plan_keeps_a_deleted_track(self, db, furnished):
        # Counted and skipped by the job (ORG-07's rule), not cascaded out of
        # the plan a resume reads.
        delete_track(db, furnished["doomed"])
        assert count(db, "SELECT count(*) FROM match_job_tracks") == 2

    def test_deleting_every_track_in_one_statement_leaves_only_the_records(
        self, db, furnished
    ):
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks")
        for table in (
            "match_attempts",
            "match_candidates",
            "track_match",
            "track_files",
            "track_artwork",
            "duplicate_members",
            "track_metadata",
        ):
            assert count(db, f"SELECT count(*) FROM {table}") == 0, table
        assert count(db, "SELECT count(*) FROM file_writes WHERE track_id IS NULL") == 1
        assert count(db, "SELECT count(*) FROM match_job_tracks") == 2
        assert count(db, "SELECT count(*) FROM duplicate_dismissals") == 1


class TestADecisionKeepsItsEvidence:
    @pytest.mark.parametrize("attempt", ["first", "second"])
    def test_an_attempt_a_decision_points_at_cannot_be_deleted(
        self, db, furnished, attempt
    ):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "DELETE FROM match_attempts WHERE id = ?", (furnished[attempt],)
                )
        assert (
            count(
                db,
                "SELECT count(*) FROM match_attempts WHERE id = ?",
                [furnished[attempt]],
            )
            == 1
        )

    def test_the_chosen_candidate_cannot_be_deleted(self, db, furnished):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "DELETE FROM match_candidates WHERE id = ?", (furnished["chosen"],)
                )

    def test_an_attempt_nobody_points_at_takes_its_candidates(self, db, furnished):
        keeper = furnished["keeper"]
        spare = add_attempt(db, keeper, job_id="job-9")
        add_candidate(db, spare, rank=0)
        add_candidate(db, spare, rank=1)

        with db.transaction() as conn:
            conn.execute("DELETE FROM match_attempts WHERE id = ?", (spare,))

        assert (
            count(
                db,
                "SELECT count(*) FROM match_candidates WHERE attempt_id = ?",
                [spare],
            )
            == 0
        )
        assert (
            count(db, "SELECT count(*) FROM track_match WHERE track_id = ?", [keeper])
            == 1
        )

    @pytest.mark.parametrize(
        "column", ["attempt_id", "candidate_id", "newer_attempt_id"]
    )
    def test_a_decision_cannot_point_at_something_that_is_not_there(self, db, column):
        row = valid_row(db, "track_match")
        row[column] = 999_999
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "track_match", row)

    @pytest.mark.parametrize(
        "table", ["match_attempts", "track_files", "track_artwork", "file_writes"]
    )
    def test_a_row_cannot_describe_a_track_that_is_not_there(self, db, table):
        row = valid_row(db, table)
        row["track_id"] = 999_999
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, table, row)

    def test_a_candidate_cannot_belong_to_an_attempt_that_is_not_there(self, db):
        row = valid_row(db, "match_candidates")
        row["attempt_id"] = 999_999
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "match_candidates", row)

    def test_deleting_a_group_removes_its_members_and_no_tracks(self, db, furnished):
        with db.transaction() as conn:
            conn.execute(
                "DELETE FROM duplicate_groups WHERE id = ?", (furnished["group"],)
            )
        assert count(db, "SELECT count(*) FROM duplicate_members") == 0
        assert count(db, "SELECT count(*) FROM tracks") == 2


# ------------------------------------------------------------ the upgrade path


class TestUpgradingARealDatabase:
    """A version-10 library with rows in every table that existed."""

    @pytest.fixture
    def populated_v10(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "upgrade.db")
        MigrationRunner(service, migrations=_migrations_up_to(10)).migrate()

        TrackRepository(service).add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=str(i),
                    file_path=f"/m/{i}.mp3",
                    title=f"T{i}",
                    artist="An Artist",
                    key="Am" if i % 2 else "8A",
                    bpm=120.0 + i,
                    genre="House" if i % 2 else "Techno",
                    label="Defected",
                    year=2000 + i,
                    rating=i % 6,
                    comment="from rekordbox",
                )
                for i in range(1, 26)
            ]
        )
        ids = [
            int(row["id"])
            for row in service.connect().execute("SELECT id FROM tracks ORDER BY id")
        ]
        # Raw SQL, not the services: today's repositories read the columns this
        # migration adds, and a version-10 database does not have them yet.
        with service.transaction() as conn:
            conn.execute(
                "INSERT INTO track_metadata"
                " (track_id, rating, favorite, notes, created_at, updated_at)"
                " VALUES (?, 5, 1, 'a note', 'then', 'then')",
                (ids[0],),
            )
            conn.execute(
                "INSERT INTO track_metadata"
                " (track_id, rating, favorite, created_at, updated_at)"
                " VALUES (?, 0, 0, 'then', 'then')",
                (ids[1],),
            )
            tag = conn.execute(
                "INSERT INTO tags (name, category, created_at) VALUES ('Peak', 'mood', 'then')"
            ).lastrowid
            conn.execute(
                "INSERT INTO track_tags (track_id, tag_id, created_at) VALUES (?, ?, 'then')",
                (ids[2], tag),
            )
            collection = conn.execute(
                "INSERT INTO collections"
                " (kind, name, position, depth, created_at, updated_at)"
                " VALUES ('collection', 'Warmups', 0, 0, 'then', 'then')"
            ).lastrowid
            conn.execute(
                "INSERT INTO collections"
                " (kind, name, position, depth, rules_json, created_at, updated_at)"
                " VALUES ('smart', 'Recent', 1, 0, '{}', 'then', 'then')"
            )
            for position, track_id in enumerate((ids[3], ids[3], ids[4])):
                conn.execute(
                    "INSERT INTO collection_tracks"
                    " (collection_id, track_id, position, added_at)"
                    " VALUES (?, ?, ?, 'then')",
                    (collection, track_id, position),
                )
            conn.execute(
                "INSERT INTO track_history"
                " (track_id, field, old_value_json, new_value_json, source,"
                "  changed_at, batch_id)"
                " VALUES (?, 'cuepoint_rating', 'null', '5', 'cuepoint', 'then', 'b-1')",
                (ids[0],),
            )
            conn.execute(
                "INSERT INTO activity_events (type, summary, detail_json, created_at)"
                " VALUES ('library.refresh', 'Refreshed', '{}', 'then')"
            )
            conn.execute(
                "INSERT INTO jobs (id, type, state, progress_json, created_at, updated_at)"
                " VALUES ('job-old', 'import', 'completed', '{}', 'then', 'then')"
            )
            playlist = conn.execute(
                "INSERT INTO rekordbox_playlists"
                " (name, kind, depth, position, rekordbox_path, track_count)"
                " VALUES ('Set', 'playlist', 0, 0, 'ROOT/Set', 2)"
            ).lastrowid
            for position, track_id in enumerate(ids[:2]):
                conn.execute(
                    "INSERT INTO rekordbox_playlist_tracks"
                    " (playlist_id, track_id, position) VALUES (?, ?, ?)",
                    (playlist, track_id, position),
                )
        yield service
        service.close_all()

    def test_it_applies(self, populated_v10):
        applied = MigrationRunner(populated_v10).migrate()
        assert 11 in [m.version for m in applied]

    def test_no_row_in_any_existing_table_changes(self, populated_v10):
        before = snapshot(populated_v10)
        MigrationRunner(populated_v10).migrate()
        after = snapshot(populated_v10)

        for table, rows in before.items():
            if table in ("schema_version", "track_metadata"):
                continue
            assert after[table] == rows, table

        # track_metadata gains columns: every old value is where it was, and
        # every new one is "no override".
        widened = after["track_metadata"]
        assert len(widened) == len(before["track_metadata"])
        for old, new in zip(before["track_metadata"], widened):
            assert {k: new[k] for k in old} == old
            assert all(new[name] is None for name in OVERRIDE_FIELDS)

        # Every earlier version stays recorded, and 11 is added.
        old_versions = {row["version"] for row in before["schema_version"]}
        new_versions = {row["version"] for row in after["schema_version"]}
        assert old_versions < new_versions and 11 in new_versions

    def test_every_new_table_starts_empty(self, populated_v10):
        MigrationRunner(populated_v10).migrate()
        for table in CLEAN_TABLES:
            assert count(populated_v10, f"SELECT count(*) FROM {table}") == 0, table

    def test_existing_metadata_reads_back_with_no_overrides(self, populated_v10):
        MigrationRunner(populated_v10).migrate()
        rows = (
            populated_v10.connect().execute("SELECT * FROM track_metadata").fetchall()
        )
        records = [TrackMetadata.from_row(row) for row in rows]
        assert {r.rating for r in records} == {5, 0}
        assert not any(r.has_overrides for r in records)

    def test_an_upgraded_database_has_the_same_schema_as_a_fresh_one(
        self, populated_v10, db
    ):
        MigrationRunner(populated_v10).migrate()
        assert schema(populated_v10) == schema(db)

    def test_it_still_browses_after_the_upgrade(self, populated_v10):
        MigrationRunner(populated_v10).migrate()
        repo = TrackRepository(populated_v10)
        query = BrowseQuery(
            query="T",
            sort="bpm",
            rules=RuleSet(rules=(FilterRule(field="rating", operator="is", value=5),)),
        )
        rows = repo.browse(query, limit=100)
        # Track 5 is rated 5 in Rekordbox; track 1 is 5 in CuePoint. Both are
        # five-star tracks through ORG-05's coalesce, which joins the table
        # this migration widened.
        assert sorted(row.rekordbox_track_id for row in rows) == [
            "1",
            "11",
            "17",
            "23",
            "5",
        ]
        assert repo.browse_count(query) == len(rows)


# ------------------------------------------------- nothing reads the overrides


class TestBothLayersUnderTheirNames:
    """The override columns share their names with ``tracks``' columns.

    Every browse, count, facet and search below joins ``track_metadata`` —
    a rating rule forces the join — while each track carries overrides that
    contradict its imported values. An unqualified column anywhere in that SQL
    fails here as "ambiguous column name"; a column resolved against the wrong
    table fails as a wrong order or a wrong answer.

    CLEAN-05 changed what the plain names mean, as CLEAN-01 said it would: they
    read the effective value (DEC-068), and ``<field>_rekordbox`` reads the
    imported one. Both are asserted, so neither layer can go missing.
    """

    @pytest.fixture
    def library(self, db):
        repo = TrackRepository(db)
        first = add_track(
            db, 1, key="Am", bpm=120.0, genre="House", label="Defected", year=2001
        )
        second = add_track(
            db, 2, key="Cm", bpm=130.0, genre="Techno", label="Drumcode", year=2010
        )
        with db.transaction() as conn:
            # Each override reverses the imported order.
            for track_id, values in (
                (first, ("Cm", 140.0, "Techno", "Drumcode", 2020)),
                (second, ("Am", 100.0, "House", "Defected", 1990)),
            ):
                conn.execute(
                    "INSERT INTO track_metadata"
                    " (track_id, rating, favorite, key, bpm, genre, label, year,"
                    "  created_at, updated_at)"
                    " VALUES (?, 5, 0, ?, ?, ?, ?, ?, 'now', 'now')",
                    (track_id, *values),
                )
        return repo

    @staticmethod
    def rated(*rules: FilterRule, **fields) -> BrowseQuery:
        return BrowseQuery(
            rules=RuleSet(
                rules=(FilterRule(field="rating", operator="is", value=5), *rules)
            ),
            **fields,
        )

    @pytest.mark.parametrize("sort", list(OVERRIDE_FIELDS))
    def test_sorting_orders_by_the_effective_value(self, library, sort):
        # Each override reverses the imported order, so the effective order is
        # the imported one backwards.
        query = self.rated(sort=sort, query="T")
        rows = library.browse(query, limit=10)
        assert [row.rekordbox_track_id for row in rows] == ["2", "1"]
        assert library.browse_count(query) == 2
        assert library.browse_ids(query, limit=10) == [int(row.id) for row in rows]

    def test_a_row_carries_the_imported_values(self, library):
        row = library.browse(self.rated(sort="title"), limit=10)[0]
        assert (row.key, row.bpm, row.genre, row.label, row.year) == (
            "Am",
            120.0,
            "House",
            "Defected",
            2001,
        )

    @pytest.mark.parametrize(
        "rule, expected",
        [
            (FilterRule(field="genre", operator="is", value="House"), ["2"]),
            (FilterRule(field="bpm", operator="gt", value=125), ["1"]),
            (FilterRule(field="year", operator="lt", value=2005), ["2"]),
            (FilterRule(field="label", operator="contains", value="Drum"), ["1"]),
            (FilterRule(field="key", operator="is", value="Am"), ["2"]),
            (FilterRule(field="genre_rekordbox", operator="is", value="House"), ["1"]),
            (FilterRule(field="bpm_rekordbox", operator="gt", value=125), ["2"]),
            (FilterRule(field="year_rekordbox", operator="lt", value=2005), ["1"]),
            (
                FilterRule(field="label_rekordbox", operator="contains", value="Drum"),
                ["2"],
            ),
            (FilterRule(field="key_rekordbox", operator="is", value="Am"), ["1"]),
            (FilterRule(field="cuepoint_genre", operator="is", value="House"), ["2"]),
        ],
    )
    def test_a_filter_reads_the_layer_its_name_says(self, library, rule, expected):
        query = self.rated(rule)
        rows = library.browse(query, limit=10)
        assert sorted(row.rekordbox_track_id for row in rows) == expected
        assert library.browse_count(query) == len(expected)

    def test_a_search_reads_the_effective_label(self, library):
        # Track 1 was imported as Defected and overridden to Drumcode; track 2
        # the other way round. A text search finds what a user sees (DEC-068).
        query = self.rated(query="Defected")
        rows = library.browse(query, limit=10)
        assert [row.rekordbox_track_id for row in rows] == ["2"]
        assert library.browse_count(query) == 1

    def test_a_facet_counts_each_layer_under_its_name(self, db, library):
        with db.transaction() as conn:
            conn.execute("UPDATE track_metadata SET genre = 'Ambient'")
        effective = library.facet_values(self.rated(), field="genre")
        imported = library.facet_values(self.rated(), field="genre_rekordbox")
        assert {value.value: value.count for value in effective.values} == {
            "Ambient": 2
        }
        assert {value.value: value.count for value in imported.values} == {
            "House": 1,
            "Techno": 1,
        }

    def test_a_range_reads_each_layer_under_its_name(self, library):
        effective = library.facet_range(self.rated(), field="bpm")
        imported = library.facet_range(self.rated(), field="bpm_rekordbox")
        assert (effective.minimum, effective.maximum) == (100.0, 140.0)
        assert (imported.minimum, imported.maximum) == (120.0, 130.0)
