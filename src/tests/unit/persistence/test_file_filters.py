#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""File status as a filter, a count and a facet, and the repository under it (CLEAN-07).

What lets "missing files" be a Smart Collection and, in CLEAN-11, a Health count
is that file status is an ordinary rule field, compiled, counted and faceted by
the path every other field uses. Over a library holding every status at once:

- **Every value finds exactly its tracks**, including ``not_checked``, which is
  both no row and a row for a path the library no longer holds (DEC-073).
- **A facet's count is the count of applying that value as a rule.**
- **The day a file was checked is the user's day**, and a stale check has none.
- **The join is written only when asked for**, once, and never multiplies a row.
- **The SQL and the model agree** about which checks are stale.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Dict, Set

import pytest

from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_NOT_CHECKED,
    FILE_PRESENT,
    FILE_STATUSES,
    FILE_UNREADABLE,
    FILTER_FILE_STATUSES,
    REASON_ROOT_UNAVAILABLE,
    TrackFileStatus,
)
from cuepoint.models.filter_rule import (
    FILES_ALIAS,
    MATCH_ALIAS,
    FilterRule,
    RuleSet,
    describe_fields,
    field_spec,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.filter_sql import required_joins
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery, build_count, build_select
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

#: Noon UTC, so the local day is the same day in every time zone a test runs in.
NOON = "2026-09-14T12:00:00+00:00"
EARLIER = "2026-09-01T12:00:00+00:00"

PATHS = {
    "present_a": "/m/present_a.mp3",
    "present_b": "/m/present_b.mp3",
    "missing_plain": "/m/missing_plain.mp3",
    "missing_root": "/Volumes/USB/missing_root.mp3",
    "unreadable": "/m/unreadable.mp3",
    "never": "/m/never.mp3",
    "moved": "/m/moved-now.mp3",
    "no_path": "",
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
def files(db) -> FileStatusRepository:
    return FileStatusRepository(db)


@pytest.fixture
def library(db, tracks, files) -> Dict[str, int]:
    """Eight tracks: every status, a stale check, one never checked, one with no path."""
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=name,
                title=name,
                artist="A",
                genre="House" if name.startswith("present") else "Techno",
                file_path=path,
            )
            for name, path in PATHS.items()
        ]
    )
    ids = {
        row["title"]: int(row["id"])
        for row in db.connect().execute("SELECT id, title FROM tracks")
    }
    written = files.record(
        [
            TrackFileStatus(
                ids["present_a"], FILE_PRESENT, PATHS["present_a"], NOON, 10
            ),
            TrackFileStatus(
                ids["present_b"], FILE_PRESENT, PATHS["present_b"], EARLIER, 20
            ),
            TrackFileStatus(
                ids["missing_plain"], FILE_MISSING, PATHS["missing_plain"], NOON
            ),
            TrackFileStatus(
                ids["missing_root"],
                FILE_MISSING,
                PATHS["missing_root"],
                NOON,
                reason=REASON_ROOT_UNAVAILABLE,
            ),
            TrackFileStatus(
                ids["unreadable"], FILE_UNREADABLE, PATHS["unreadable"], NOON
            ),
            # Checked present, then a refresh moved the file.
            TrackFileStatus(ids["moved"], FILE_PRESENT, "/m/moved-before.mp3", NOON, 5),
        ]
    )
    assert len(written) == 6
    return ids


def rules(*clauses) -> RuleSet:
    return RuleSet(rules=tuple(FilterRule(*clause) for clause in clauses))


def count(tracks, *clauses) -> int:
    return tracks.browse_count(BrowseQuery(rules=rules(*clauses)))


def named(tracks, library, *clauses) -> Set[str]:
    by_id = {track_id: name for name, track_id in library.items()}
    return {
        by_id[track_id]
        for track_id in tracks.browse_ids(BrowseQuery(rules=rules(*clauses)), limit=100)
    }


def facet_counts(tracks, field: str, *clauses) -> Dict[object, int]:
    facet = tracks.facet_values(BrowseQuery(rules=rules(*clauses)), field)
    return {value.value: value.count for value in facet.values}


def local_day(timestamp: str) -> str:
    return datetime.fromisoformat(timestamp).astimezone().date().isoformat()


def move(db, track_id: int, path: str) -> None:
    """What a refresh does to a moved file: a new path on the same track."""
    with db.transaction() as conn:
        conn.execute("UPDATE tracks SET file_path = ? WHERE id = ?", (path, track_id))


# -------------------------------------------------------------- file_status


class TestFileStatus:
    @pytest.mark.parametrize(
        "status, expected",
        [
            (FILE_PRESENT, {"present_a", "present_b"}),
            (FILE_MISSING, {"missing_plain", "missing_root"}),
            (FILE_UNREADABLE, {"unreadable"}),
            (FILE_NOT_CHECKED, {"never", "moved", "no_path"}),
        ],
    )
    def test_each_value_finds_exactly_its_tracks(
        self, tracks, library, status, expected
    ):
        assert named(tracks, library, ("file_status", "is", status)) == expected
        assert count(tracks, ("file_status", "is", status)) == len(expected)

    def test_a_check_of_the_path_before_a_refresh_reads_as_not_checked(
        self, db, tracks, library
    ):
        move(db, library["present_a"], "/m/elsewhere.mp3")
        assert "present_a" in named(
            tracks, library, ("file_status", "is", FILE_NOT_CHECKED)
        )
        assert named(tracks, library, ("file_status", "is", FILE_PRESENT)) == {
            "present_b"
        }
        # And back: the row answers for its path again.
        move(db, library["present_a"], PATHS["present_a"])
        assert "present_a" in named(
            tracks, library, ("file_status", "is", FILE_PRESENT)
        )

    def test_a_path_that_differs_only_in_case_is_another_path(
        self, db, tracks, library
    ):
        # Compared exactly, as the model's is_stale_for says: the check answered
        # for one spelling, and a second spelling is a question it did not.
        move(db, library["present_a"], PATHS["present_a"].upper())
        assert "present_a" in named(
            tracks, library, ("file_status", "is", FILE_NOT_CHECKED)
        )

    def test_the_other_text_operators_work_on_it(self, tracks, library):
        assert count(tracks, ("file_status", "is_not", FILE_PRESENT)) == 6
        assert (
            count(tracks, ("file_status", "any_of", [FILE_MISSING, FILE_UNREADABLE]))
            == 3
        )
        assert count(tracks, ("file_status", "is", "MISSING")) == 2
        assert count(tracks, ("file_status", "is_empty")) == 0

    def test_every_value_the_facet_offers_counts_what_its_rule_finds(
        self, tracks, library
    ):
        counts = facet_counts(tracks, "file_status")
        assert set(counts) == set(FILTER_FILE_STATUSES)
        for value, facet_count in counts.items():
            assert facet_count == count(tracks, ("file_status", "is", value)), value
        assert sum(counts.values()) == len(PATHS)

    def test_a_facet_leaves_its_own_rule_out(self, tracks, library):
        counts = facet_counts(tracks, "file_status", ("file_status", "is", "missing"))
        assert set(counts) == set(FILTER_FILE_STATUSES)

    def test_a_facet_honours_the_other_rules(self, tracks, library):
        assert facet_counts(tracks, "file_status", ("genre", "is", "House")) == {
            FILE_PRESENT: 2
        }

    def test_the_sql_and_the_model_agree_about_staleness(self, db, tracks, library):
        move(db, library["unreadable"], "/m/renamed.mp3")
        not_checked = named(tracks, library, ("file_status", "is", FILE_NOT_CHECKED))
        for row in db.connect().execute(
            "SELECT t.title, t.file_path, f.* FROM track_files AS f"
            " JOIN tracks AS t ON t.id = f.track_id"
        ):
            check = TrackFileStatus.from_row(
                {
                    key: row[key]
                    for key in row.keys()
                    if key not in ("title", "file_path")
                }
            )
            assert check.is_stale_for(row["file_path"]) == (
                row["title"] in not_checked
            ), row["title"]


# ---------------------------------------------------------- file_checked_at


class TestFileCheckedAt:
    def test_it_is_the_local_day_of_the_check(self, tracks, library):
        assert named(tracks, library, ("file_checked_at", "is", local_day(NOON))) == {
            "present_a",
            "missing_plain",
            "missing_root",
            "unreadable",
        }
        assert named(
            tracks, library, ("file_checked_at", "is", local_day(EARLIER))
        ) == {"present_b"}

    def test_a_check_near_midnight_utc_lands_on_the_users_day(
        self, db, files, tracks, library
    ):
        late = "2026-09-14T23:30:00+00:00"
        files.record(
            [
                TrackFileStatus(
                    library["present_a"], FILE_PRESENT, PATHS["present_a"], late
                )
            ]
        )
        assert "present_a" in named(
            tracks, library, ("file_checked_at", "is", local_day(late))
        )

    def test_before_after_and_between(self, tracks, library):
        assert named(tracks, library, ("file_checked_at", "before", "2026-09-10")) == {
            "present_b"
        }
        assert count(tracks, ("file_checked_at", "after", "2026-09-10")) == 4
        assert (
            count(tracks, ("file_checked_at", "between", ["2026-08-31", "2026-09-15"]))
            == 5
        )

    def test_a_track_not_checked_has_no_date(self, db, tracks, library):
        assert named(tracks, library, ("file_checked_at", "is_empty")) == {
            "never",
            "moved",
            "no_path",
        }
        move(db, library["present_b"], "/m/elsewhere.mp3")
        assert "present_b" in named(tracks, library, ("file_checked_at", "is_empty"))
        assert count(tracks, ("file_checked_at", "is_not_empty")) == 4


# ---------------------------------------------------------------- the joins


class TestTheJoin:
    def test_a_view_that_mentions_no_file_field_has_no_file_join(self):
        for sql, _ in (
            build_select(BrowseQuery(rules=rules(("genre", "is", "House")))),
            build_count(BrowseQuery(rules=rules(("match_state", "is", "accepted")))),
        ):
            assert "track_files" not in sql

    def test_both_file_rules_join_once(self):
        sql, _ = build_count(
            BrowseQuery(
                rules=rules(
                    ("file_status", "is", "present"),
                    ("file_checked_at", "before", "2026-09-10"),
                )
            )
        )
        assert sql.count("JOIN track_files") == 1
        assert required_joins(rules(("file_status", "is", "present"))) == {FILES_ALIAS}

    def test_beside_the_metadata_and_match_joins_nothing_is_multiplied(
        self, db, tracks, library
    ):
        TrackMetadataRepository(db).set_rating(library["present_a"], 5)
        assert count(tracks, ("rating", "is", 5), ("file_status", "is", "present")) == 1
        rows = tracks.browse(
            BrowseQuery(
                rules=rules(
                    ("file_status", "is_not", "x"),
                    ("match_state", "is", "not_matched"),
                    ("rating_rekordbox", "is_empty"),
                )
            ),
            100,
        )
        assert len(rows) == len({row.id for row in rows}) == len(PATHS)


# ----------------------------------------------------------- the vocabulary


class TestTheVocabulary:
    def test_both_fields_cross_the_wire(self):
        described = {entry["name"]: entry for entry in describe_fields()}
        assert (
            described["file_status"]["type"],
            described["file_status"]["facetable"],
        ) == (
            "text",
            True,
        )
        assert (
            described["file_checked_at"]["type"],
            described["file_checked_at"]["facetable"],
        ) == ("date", False)

    def test_the_filter_values_are_the_stored_ones_and_not_checked(self):
        assert set(FILTER_FILE_STATUSES) == set(FILE_STATUSES) | {FILE_NOT_CHECKED}
        assert FILE_NOT_CHECKED not in FILE_STATUSES

    def test_both_read_through_the_file_join_alone(self):
        for name in ("file_status", "file_checked_at"):
            spec = field_spec(name)
            assert spec.joins == (FILES_ALIAS,), name
            assert MATCH_ALIAS not in spec.expression
            assert spec.metadata is False
        assert FILE_NOT_CHECKED in field_spec("file_status").expression


# --------------------------------------------------------------- repository


class TestTheRepository:
    def test_a_check_replaces_the_last_one(self, files, library):
        track = library["present_a"]
        files.record([TrackFileStatus(track, FILE_MISSING, PATHS["present_a"], NOON)])
        stored = files.get(track)
        assert stored is not None
        assert (stored.status, stored.size_bytes) == (FILE_MISSING, None)

    def test_a_reason_round_trips(self, files, library):
        stored = files.get(library["missing_root"])
        assert stored is not None and stored.reason == REASON_ROOT_UNAVAILABLE
        assert files.get(library["never"]) is None

    def test_a_track_that_is_gone_is_skipped_and_the_rest_are_written(
        self, db, files, library
    ):
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (library["never"],))
        written = files.record(
            [
                TrackFileStatus(library["never"], FILE_PRESENT, PATHS["never"], NOON),
                TrackFileStatus(library["present_a"], FILE_PRESENT, "/x.mp3", NOON),
            ]
        )
        assert written == {library["present_a"]}
        assert files.get(library["never"]) is None

    def test_it_joins_the_callers_transaction(self, db, files, library):
        with pytest.raises(RuntimeError):
            with db.transaction():
                files.record(
                    [TrackFileStatus(library["never"], FILE_PRESENT, "/n.mp3", NOON)]
                )
                raise RuntimeError("roll it back")
        assert files.get(library["never"]) is None

    def test_paths_come_back_in_order_once_each_for_tracks_that_exist(
        self, files, library
    ):
        wanted = [library["no_path"], 999_999, library["present_a"], library["no_path"]]
        assert files.paths(wanted) == [
            (library["no_path"], ""),
            (library["present_a"], PATHS["present_a"]),
        ]
        assert files.existing(wanted) == [library["no_path"], library["present_a"]]

    def test_the_library_is_every_track(self, files, library):
        assert files.library_ids() == sorted(library.values())

    def test_nothing_to_record_writes_nothing(self, files):
        assert files.record([]) == set()

    def test_the_table_still_refuses_a_bad_row(self, db, library):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "UPDATE track_files SET reason = 'gone' WHERE track_id = ?",
                    (library["missing_plain"],),
                )
