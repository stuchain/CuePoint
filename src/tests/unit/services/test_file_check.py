#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CLEAN-07's file check (DEC-073, closing DEC-037).

What these tests are aimed at, in the order the risks were written down:

- **A check tells the three answers apart**, on a real temporary directory, and
  touches nothing it looks at.
- **A disconnected drive is one finding.** Among 5,000 tracks, the tracks on a
  root that is not there are recorded missing without a single look at their
  paths, and the check reports one line. A drive unplugged part way through is
  caught at the end of the chunk it went in.
- **A path a refresh changed reads as not checked.**
- **Cancelling is prompt**, and keeps exactly what was checked.
- **Chunks commit**, so a check that fails keeps the chunks before it.
- **Nothing is written but ``track_files`` and the activity feed.**

The filesystem is replaced where a test needs to count what was touched: a
``World`` answers for paths and roots and remembers every question.
"""

from __future__ import annotations

import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import pytest

from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    REASON_ROOT_UNAVAILABLE,
)
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.track_query import BrowseQuery, BrowseQueryError
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services import file_check_service as module
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.file_check_service import (
    EVENT_FILES_CHECKED,
    EVENT_ROOT_UNAVAILABLE,
    FILE_CHECK_CHUNK_SIZE,
    FILE_CHECK_WORKERS,
    NOTHING_TO_CHECK,
    TRIGGER_IMPORT,
    FileCheckResult,
    FileCheckService,
    UnavailableRoot,
    check_file,
    describe_unavailable,
    nearest_existing_folder,
    path_root,
    root_available,
)
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-14T12:00:00+00:00"

#: A drive the simulated world does not have.
GONE = "E:\\"


# ------------------------------------------------------------------ fixtures


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
def activity(db, tracks) -> ActivityService:
    return ActivityService(ActivityRepository(db), tracks)


class Selections:
    """The one thing a check asks the batch service: which ids a selection names."""

    def __init__(self, error: Optional[Exception] = None) -> None:
        self.error = error

    def resolve(self, selection: BatchSelection) -> List[int]:
        if self.error is not None:
            raise self.error
        assert selection.track_ids is not None
        return list(selection.track_ids)


class World:
    """A filesystem a test describes, which remembers every question it was asked."""

    def __init__(
        self, gone: Sequence[str] = (), statuses: Optional[Dict[str, str]] = None
    ) -> None:
        self.gone = set(gone)
        self.statuses = dict(statuses or {})
        self.checked: List[str] = []
        self.probed: List[str] = []

    def check(self, path: str) -> Tuple[str, Optional[int]]:
        self.checked.append(path)
        status = self.statuses.get(path, FILE_PRESENT)
        return status, (1024 if status == FILE_PRESENT else None)

    def probe(self, root: str) -> bool:
        self.probed.append(root)
        return root not in self.gone


def add(db, tracks, paths: Sequence[str]) -> List[int]:
    """Add one track per path; return their ids in the same order."""
    prefix = uuid.uuid4().hex[:8]
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{index}",
                title=f"Track {index}",
                artist="A",
                file_path=path,
            )
            for index, path in enumerate(paths)
        ]
    )
    by_rekordbox = {
        row["rekordbox_track_id"]: int(row["id"])
        for row in db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
    }
    return [by_rekordbox[f"{prefix}-{index}"] for index in range(len(paths))]


def make(
    db,
    files,
    activity=None,
    *,
    world: Optional[World] = None,
    selections: Optional[Selections] = None,
    workers: Optional[int] = None,
) -> FileCheckService:
    kwargs: Dict[str, object] = {}
    if world is not None:
        kwargs = {"checker": world.check, "probe": world.probe}
    if workers is not None:
        kwargs["workers"] = workers
    return FileCheckService(
        files,
        selections or Selections(),  # type: ignore[arg-type]
        activity,
        db,
        clock=lambda: NOW,
        **kwargs,
    )


def stored(db) -> Dict[int, sqlite3.Row]:
    return {
        int(row["track_id"]): row
        for row in db.connect().execute("SELECT * FROM track_files")
    }


def events(db, event_type: Optional[str] = None) -> List[sqlite3.Row]:
    rows = db.connect().execute(
        "SELECT type, summary, detail_json FROM activity_events ORDER BY id"
    )
    return [row for row in rows if event_type is None or row["type"] == event_type]


def count(tracks, field: str, value: str) -> int:
    return tracks.browse_count(
        BrowseQuery(rules=RuleSet(rules=(FilterRule(field, "is", value),)))
    )


# ---------------------------------------------------------- looking at a path


class TestLookingAtOnePath:
    def test_a_file_that_is_there_is_present_with_its_size(self, tmp_path):
        track = tmp_path / "a.mp3"
        track.write_bytes(b"abcde")
        assert check_file(str(track)) == (FILE_PRESENT, 5)

    def test_nothing_at_the_path_is_missing(self, tmp_path):
        assert check_file(str(tmp_path / "gone.mp3")) == (FILE_MISSING, None)

    def test_a_path_through_a_missing_folder_is_missing(self, tmp_path):
        assert check_file(str(tmp_path / "no" / "such" / "a.mp3")) == (
            FILE_MISSING,
            None,
        )

    def test_a_folder_where_the_file_should_be_is_unreadable(self, tmp_path):
        folder = tmp_path / "a.mp3"
        folder.mkdir()
        assert check_file(str(folder)) == (FILE_UNREADABLE, None)

    def test_a_file_that_will_not_open_is_unreadable(self, tmp_path, monkeypatch):
        track = tmp_path / "a.mp3"
        track.write_bytes(b"x")
        monkeypatch.setattr(module, "is_readable", lambda path: False)
        assert check_file(str(track)) == (FILE_UNREADABLE, None)

    @pytest.mark.skipif(
        os.name == "nt" or (hasattr(os, "geteuid") and os.geteuid() == 0),
        reason="needs POSIX permissions and a user they apply to",
    )
    def test_a_file_without_read_permission_is_unreadable(self, tmp_path):
        track = tmp_path / "a.mp3"
        track.write_bytes(b"x")
        track.chmod(0)
        try:
            assert check_file(str(track)) == (FILE_UNREADABLE, None)
        finally:
            track.chmod(0o644)

    def test_a_path_a_folder_refuses_to_show_is_unreadable_not_missing(
        self, monkeypatch
    ):
        def refuse(path):
            raise PermissionError(13, "Permission denied", path)

        monkeypatch.setattr(module.os, "stat", refuse)
        assert check_file("/private/a.mp3") == (FILE_UNREADABLE, None)

    def test_a_name_the_system_will_not_accept_is_missing(self):
        assert check_file("/m/a\x00b.mp3") == (FILE_MISSING, None)

    @pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="needs named pipes")
    def test_a_named_pipe_is_unreadable_without_being_opened(
        self, tmp_path, monkeypatch
    ):
        pipe = tmp_path / "a.mp3"
        os.mkfifo(pipe)

        def never(path):
            raise AssertionError("opening a pipe waits for a writer")

        monkeypatch.setattr(module, "is_readable", never)
        assert check_file(str(pipe)) == (FILE_UNREADABLE, None)

    def test_looking_changes_nothing_about_the_file(self, tmp_path):
        track = tmp_path / "a.mp3"
        track.write_bytes(b"ID3 not really")
        before = (track.read_bytes(), track.stat().st_mtime_ns, track.stat().st_size)
        check_file(str(track))
        assert (
            track.read_bytes(),
            track.stat().st_mtime_ns,
            track.stat().st_size,
        ) == before


# ------------------------------------------------------------ roots and folders


class TestRoots:
    @pytest.mark.parametrize(
        "path, root",
        [
            ("E:\\Music\\a.mp3", "E:\\"),
            ("E:/Music/a.mp3", "E:\\"),
            ("e:/a.mp3", "e:\\"),
            ("E:", "E:\\"),
            ("\\\\nas\\music\\House\\a.mp3", "\\\\nas\\music\\"),
            ("//nas/music/House/a.mp3", "\\\\nas\\music\\"),
            ("/Volumes/USB/Music/a.mp3", "/Volumes/USB"),
            ("/media/stu/USB/a.mp3", "/media/stu/USB"),
            ("/run/media/stu/USB/a.mp3", "/run/media/stu/USB"),
            ("/mnt/music/a.mp3", "/mnt/music"),
            ("/Users/stu/Music/a.mp3", "/"),
            ("/media/USB/a.mp3", "/"),
            ("/Volumes/a.mp3", "/"),
            ("/a.mp3", "/"),
        ],
    )
    def test_the_root_is_what_a_user_plugs_in(self, path, root):
        assert path_root(path) == root

    @pytest.mark.parametrize("path", ["", "Music/a.mp3", "a.mp3", "E:Music\\a.mp3"])
    def test_a_path_that_names_no_place_has_no_root(self, path):
        assert path_root(path) is None

    def test_a_root_that_is_there_is_available(self, tmp_path):
        assert root_available(str(tmp_path)) is True

    def test_a_root_that_is_not_there_is_not(self, tmp_path):
        assert root_available(str(tmp_path / "unplugged")) is False
        assert root_available("/Volumes/CuePoint-no-such-volume") is False
        assert root_available("bad\x00root") is False

    def test_a_root_that_refuses_to_be_looked_at_is_there(self, monkeypatch):
        def refuse(path):
            raise PermissionError(13, "Permission denied", path)

        monkeypatch.setattr(module.os, "stat", refuse)
        assert root_available("/Volumes/Locked") is True

    def test_an_unavailable_root_is_one_line(self):
        assert (
            describe_unavailable("E:\\", 4812)
            == "4,812 tracks on E:\\ — the drive is not connected"
        )
        assert (
            describe_unavailable("/Volumes/USB", 1)
            == "1 track on /Volumes/USB — the drive is not connected"
        )
        assert (
            describe_unavailable("\\\\nas\\music\\", 2)
            == "2 tracks on \\\\nas\\music\\ — the network location cannot be reached"
        )


class TestNearestExistingFolder:
    def test_a_file_that_is_there_reveals_its_own_folder(self, tmp_path):
        track = tmp_path / "House" / "a.mp3"
        track.parent.mkdir()
        track.write_bytes(b"x")
        assert nearest_existing_folder(str(track)) == str(tmp_path / "House")

    def test_a_moved_file_reveals_the_folder_it_was_in(self, tmp_path):
        (tmp_path / "House").mkdir()
        assert nearest_existing_folder(str(tmp_path / "House" / "a.mp3")) == str(
            tmp_path / "House"
        )

    def test_nested_missing_folders_walk_up_to_the_first_that_exists(self, tmp_path):
        (tmp_path / "Music").mkdir()
        path = tmp_path / "Music" / "2024" / "House" / "Deep" / "a.mp3"
        assert nearest_existing_folder(str(path)) == str(tmp_path / "Music")

    def test_a_file_where_a_folder_should_be_is_walked_past(self, tmp_path):
        (tmp_path / "Music").write_bytes(b"not a folder")
        path = tmp_path / "Music" / "a.mp3"
        assert nearest_existing_folder(str(path)) == str(tmp_path)

    def test_nothing_on_an_unplugged_drive_exists(self):
        assert (
            nearest_existing_folder("/Volumes/CuePoint-no-such-volume/Music/a.mp3")
            is None
        )

    def test_the_folder_above_an_unplugged_volume_is_not_offered(self, monkeypatch):
        # /Volumes exists on every Mac whether or not the drive does; revealing
        # it would suggest the drive is there. Answered here, so the test holds
        # on a machine that has no /Volumes at all.
        monkeypatch.setattr(
            module.os.path, "isdir", lambda path: path in ("/Volumes", "/")
        )
        assert nearest_existing_folder("/Volumes/USB/Music/a.mp3") is None

    def test_the_bare_filesystem_root_is_never_offered(self):
        assert nearest_existing_folder("/cuepoint-no-such-folder/x/a.mp3") is None

    @pytest.mark.skipif(os.name != "nt", reason="drive letters are a Windows shape")
    def test_a_drive_that_is_there_is_offered_when_nothing_below_it_is(self, tmp_path):
        anchor = Path(tmp_path).anchor
        path = anchor + "cuepoint-no-such-folder\\Music\\a.mp3"
        assert nearest_existing_folder(path) == anchor

    @pytest.mark.parametrize("path", ["", "Music/a.mp3"])
    def test_a_path_that_names_no_place_has_no_folder(self, path):
        assert nearest_existing_folder(path) is None


# ------------------------------------------------------------- the whole check


class TestCheckingTracks:
    def test_each_answer_is_stored_against_the_path_checked(
        self, db, tracks, files, tmp_path
    ):
        present = tmp_path / "present.mp3"
        present.write_bytes(b"12345678")
        folder = tmp_path / "folder.mp3"
        folder.mkdir()
        ids = add(
            db,
            tracks,
            [
                str(present),
                str(tmp_path / "missing.mp3"),
                str(folder),
                "",
                "relative.mp3",
            ],
        )
        result = make(db, files).check(ids)

        rows = stored(db)
        assert (rows[ids[0]]["status"], rows[ids[0]]["size_bytes"]) == (FILE_PRESENT, 8)
        assert (rows[ids[1]]["status"], rows[ids[1]]["size_bytes"]) == (
            FILE_MISSING,
            None,
        )
        assert rows[ids[2]]["status"] == FILE_UNREADABLE
        assert ids[3] not in rows
        assert rows[ids[4]]["status"] == FILE_MISSING
        assert rows[ids[0]]["checked_path"] == str(present)
        assert {row["checked_at"] for row in rows.values()} == {NOW}
        assert {row["reason"] for row in rows.values()} == {None}
        assert (
            result.present,
            result.missing,
            result.unreadable,
            result.no_path,
            result.vanished,
        ) == (1, 2, 1, 1, 0)
        assert result.completed == result.total == 5

    def test_the_vocabulary_reads_what_the_check_stored(
        self, db, tracks, files, tmp_path
    ):
        present = tmp_path / "present.mp3"
        present.write_bytes(b"x")
        ids = add(db, tracks, [str(present), str(tmp_path / "gone.mp3"), ""])
        make(db, files).check(ids)
        assert count(tracks, "file_status", FILE_PRESENT) == 1
        assert count(tracks, "file_status", FILE_MISSING) == 1
        assert count(tracks, "file_status", "not_checked") == 1

    def test_a_path_a_refresh_changed_reads_as_not_checked(
        self, db, tracks, files, tmp_path
    ):
        present = tmp_path / "present.mp3"
        present.write_bytes(b"x")
        [track] = add(db, tracks, [str(present)])
        make(db, files).check([track])
        with db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET file_path = ? WHERE id = ?",
                (str(tmp_path / "moved.mp3"), track),
            )
        assert count(tracks, "file_status", FILE_PRESENT) == 0
        assert count(tracks, "file_status", "not_checked") == 1

    def test_checking_again_replaces_the_answer(self, db, tracks, files, tmp_path):
        present = tmp_path / "present.mp3"
        present.write_bytes(b"abc")
        [track] = add(db, tracks, [str(present)])
        service = make(db, files)
        service.check([track])
        present.unlink()
        service.check([track])
        row = stored(db)[track]
        assert (row["status"], row["size_bytes"]) == (FILE_MISSING, None)

    def test_paths_are_checked_in_order_so_a_folders_files_come_together(
        self, db, tracks, files
    ):
        world = World()
        paths = ["/m/b/2.mp3", "/m/a/9.mp3", "/m/b/1.mp3", "/m/a/1.mp3"]
        # One worker, so the order looks are made in is the order they start.
        make(db, files, world=world, workers=1).check(add(db, tracks, paths))
        assert world.checked == sorted(paths)

    def test_ids_that_are_not_tracks_are_counted_as_gone(self, db, tracks, files):
        [track] = add(db, tracks, ["/m/a.mp3"])
        result = make(db, files, world=World()).check([track, 999_998, 999_999, track])
        assert (result.total, result.present, result.vanished) == (3, 1, 2)

    def test_a_track_deleted_while_its_file_is_checked_is_counted_and_not_written(
        self, db, tracks, files
    ):
        first, victim = add(db, tracks, ["/m/1.mp3", "/m/2.mp3"])
        world = World()
        real_check = world.check

        def check(path):
            if path == "/m/1.mp3":
                with db.transaction() as conn:
                    conn.execute("DELETE FROM tracks WHERE id = ?", (victim,))
            return real_check(path)

        world.check = check  # type: ignore[method-assign]
        result = make(db, files, world=world).check([first, victim])
        assert (result.present, result.vanished, result.completed) == (1, 1, 2)
        assert set(stored(db)) == {first}

    def test_nothing_but_track_files_and_the_feed_is_written(
        self, db, tracks, files, activity, tmp_path
    ):
        present = tmp_path / "present.mp3"
        present.write_bytes(b"x")
        ids = add(db, tracks, [str(present), "/Volumes/CuePoint-gone/a.mp3", ""])
        connection = db.connect()
        before = {
            table: connection.execute(f"SELECT * FROM {table}").fetchall()
            for table in ("tracks", "track_metadata", "track_history", "track_match")
        }
        make(db, files, activity).check(ids)
        after = {
            table: connection.execute(f"SELECT * FROM {table}").fetchall()
            for table in before
        }
        assert {t: [tuple(r) for r in rows] for t, rows in after.items()} == {
            t: [tuple(r) for r in rows] for t, rows in before.items()
        }
        assert present.read_bytes() == b"x"

    def test_a_trigger_outside_the_vocabulary_is_refused(self, db, files):
        with pytest.raises(ValueError, match="trigger"):
            make(db, files).check([], trigger="launch")

    def test_checking_nothing_answers_nothing_and_records_nothing(
        self, db, files, activity
    ):
        result = make(db, files, activity).check([])
        assert (result.total, result.completed, result.cancelled) == (0, 0, False)
        assert events(db) == []


# ------------------------------------------------------- an unavailable root


class TestADisconnectedDrive:
    def test_among_5000_tracks_it_is_one_finding_and_its_paths_are_never_touched(
        self, db, tracks, files, activity
    ):
        on_gone = [f"{GONE}Music\\{index:04}.mp3" for index in range(4812)]
        local = [f"/Users/stu/Music/{index:03}.mp3" for index in range(188)]
        ids = add(db, tracks, on_gone + local)
        world = World(gone=[GONE])

        result = make(db, files, activity, world=world).check(
            ids, trigger=TRIGGER_IMPORT
        )

        assert not any(path.startswith(GONE) for path in world.checked)
        assert len(world.checked) == 188
        assert world.probed.count(GONE) == 1
        assert result.unavailable == (UnavailableRoot(GONE, 4812),)
        assert (result.present, result.missing) == (188, 4812)

        rows = stored(db)
        reasons = [rows[track]["reason"] for track in ids[:4812]]
        assert reasons == [REASON_ROOT_UNAVAILABLE] * 4812
        assert {rows[track]["status"] for track in ids[:4812]} == {FILE_MISSING}
        assert {rows[track]["reason"] for track in ids[4812:]} == {None}

        [finding] = events(db, EVENT_ROOT_UNAVAILABLE)
        assert finding["summary"] == "4,812 tracks on E:\\ — the drive is not connected"
        assert len(events(db, EVENT_FILES_CHECKED)) == 1

    def test_a_real_volume_that_is_not_mounted_is_one_finding(
        self, db, tracks, files, activity, tmp_path
    ):
        volume = f"/Volumes/CuePoint-{uuid.uuid4().hex[:8]}"
        present = tmp_path / "here.mp3"
        present.write_bytes(b"x")
        ids = add(db, tracks, [f"{volume}/a.mp3", f"{volume}/b/c.mp3", str(present)])
        result = make(db, files, activity).check(ids)
        assert result.unavailable == (UnavailableRoot(volume, 2),)
        assert result.present == 1
        [finding] = events(db, EVENT_ROOT_UNAVAILABLE)
        assert (
            finding["summary"] == f"2 tracks on {volume} — the drive is not connected"
        )

    def test_a_drive_unplugged_during_the_check_explains_the_chunk_it_went_in(
        self, db, tracks, files
    ):
        root = "D:\\"
        paths = [f"{root}Music\\{index:05}.mp3" for index in range(2500)]
        ids = add(db, tracks, paths)
        world = World()
        answers = {"probes": 0}

        def probe(asked: str) -> bool:
            world.probed.append(asked)
            answers["probes"] += 1
            return answers["probes"] == 1  # there at first, then gone

        def check(path: str):
            world.checked.append(path)
            return (
                (FILE_PRESENT, 1) if len(world.checked) <= 600 else (FILE_MISSING, None)
            )

        service = FileCheckService(
            files,
            Selections(),
            None,
            db,
            checker=check,
            probe=probe,
            clock=lambda: NOW,  # type: ignore[arg-type]
            workers=1,  # the 600th look is the one the drive goes at
        )
        result = service.check(ids)

        assert len(world.checked) == FILE_CHECK_CHUNK_SIZE
        assert (result.present, result.missing) == (600, 1900)
        assert result.unavailable == (UnavailableRoot(root, 1900),)
        rows = stored(db)
        assert {rows[track]["reason"] for track in ids[:600]} == {None}
        assert {rows[track]["reason"] for track in ids[600:]} == {
            REASON_ROOT_UNAVAILABLE
        }

    def test_missing_files_on_a_drive_that_is_there_are_just_missing(
        self, db, tracks, files, activity
    ):
        paths = ["/Users/stu/a.mp3", "/Users/stu/b.mp3"]
        world = World(statuses={path: FILE_MISSING for path in paths})
        result = make(db, files, activity, world=world).check(add(db, tracks, paths))
        assert (result.missing, result.unavailable) == (2, ())
        assert {row["reason"] for row in stored(db).values()} == {None}
        assert events(db, EVENT_ROOT_UNAVAILABLE) == []
        # Asked once when first met and once after the chunk's misses.
        assert world.probed == ["/", "/"]

    def test_two_drives_are_two_findings(self, db, tracks, files, activity):
        paths = ["E:\\a.mp3", "F:\\a.mp3", "F:\\b.mp3", "/Users/stu/c.mp3"]
        world = World(gone=["E:\\", "F:\\"])
        result = make(db, files, activity, world=world).check(add(db, tracks, paths))
        assert result.unavailable == (
            UnavailableRoot("E:\\", 1),
            UnavailableRoot("F:\\", 2),
        )
        assert [row["summary"] for row in events(db, EVENT_ROOT_UNAVAILABLE)] == [
            "1 track on E:\\ — the drive is not connected",
            "2 tracks on F:\\ — the drive is not connected",
        ]


# ------------------------------------------------------ cancelling and chunks


class TestCancellingAndChunks:
    def test_a_cancel_is_honoured_before_the_next_track_and_keeps_what_was_checked(
        self, db, tracks, files, activity
    ):
        ids = add(db, tracks, [f"/m/{index:05}.mp3" for index in range(5000)])
        world = World()
        ticks: List[Tuple[int, int]] = []

        # One worker, so "before the next look" is exact; the pool's bound is
        # the test after the next.
        result = make(db, files, activity, world=world, workers=1).check(
            ids,
            on_progress=lambda done, total: ticks.append((done, total)),
            should_cancel=lambda: len(world.checked) >= 1234,
        )

        assert len(world.checked) == 1234
        assert len(stored(db)) == 1234
        assert result.cancelled
        assert (result.completed, result.present, result.total) == (1234, 1234, 5000)
        assert ticks[0] == (0, 5000)
        assert ticks[-1] == (1234, 5000)
        [event] = events(db, EVENT_FILES_CHECKED)
        assert event["summary"].startswith("Stopped after 1,234 of 5,000 tracks")

    def test_with_the_pool_a_cancel_finishes_the_looks_started_and_no_more(
        self, db, tracks, files
    ):
        ids = add(db, tracks, [f"/m/{index:05}.mp3" for index in range(3000)])
        world = World()
        result = make(db, files, world=world).check(
            ids, should_cancel=lambda: len(world.checked) >= 1000
        )
        assert result.cancelled
        assert 1000 <= len(world.checked) <= 1000 + FILE_CHECK_WORKERS
        assert result.completed == len(world.checked) == len(stored(db))

    def test_a_cancel_before_the_first_track_checks_nothing(self, db, tracks, files):
        ids = add(db, tracks, ["/m/a.mp3", "/m/b.mp3"])
        world = World()
        result = make(db, files, world=world).check(ids, should_cancel=lambda: True)
        assert (world.checked, stored(db), result.completed) == ([], {}, 0)
        assert result.cancelled

    def test_every_chunk_before_a_failure_is_committed(
        self, db, tracks, files, monkeypatch
    ):
        ids = add(db, tracks, [f"/m/{index:05}.mp3" for index in range(2500)])
        real_record = files.record
        calls: List[int] = []

        def record(checks):
            calls.append(len(checks))
            if len(calls) == 2:
                raise sqlite3.OperationalError("disk I/O error")
            return real_record(checks)

        monkeypatch.setattr(files, "record", record)
        with pytest.raises(sqlite3.OperationalError):
            make(db, files, world=World()).check(ids)
        assert calls == [FILE_CHECK_CHUNK_SIZE, FILE_CHECK_CHUNK_SIZE]
        assert len(stored(db)) == FILE_CHECK_CHUNK_SIZE

    def test_progress_reaches_the_total(self, db, tracks, files):
        ids = add(db, tracks, ["/m/a.mp3", "", "/m/b.mp3"])
        ticks: List[Tuple[int, int]] = []
        make(db, files, world=World()).check(
            ids + [999_999], on_progress=lambda done, total: ticks.append((done, total))
        )
        assert ticks[0] == (1, 4)  # the id that is not a track is already accounted for
        assert ticks[-1] == (4, 4)
        assert [done for done, _ in ticks] == sorted(done for done, _ in ticks)


# --------------------------------------------------------- events and results


class TestTheFeed:
    def test_one_event_with_the_counts(self, db, tracks, files, activity):
        ids = add(db, tracks, ["/m/a.mp3", "/m/b.mp3", "", "E:\\c.mp3"])
        world = World(gone=["E:\\"], statuses={"/m/b.mp3": FILE_UNREADABLE})
        make(db, files, activity, world=world).check(ids, trigger=TRIGGER_IMPORT)
        [event] = events(db, EVENT_FILES_CHECKED)
        assert event["summary"] == (
            "Checked 3 files: 1 present, 1 missing, 1 unreadable."
            " 1 track has no file location"
        )
        import json

        detail = json.loads(event["detail_json"])
        assert detail == {
            "trigger": "import",
            "total": 4,
            "present": 1,
            "missing": 1,
            "unreadable": 1,
            "unavailable": 1,
            "no_path": 1,
            "vanished": 0,
            "cancelled": False,
            "duration_seconds": detail["duration_seconds"],
        }

    def test_the_finding_is_recorded_after_the_counts(
        self, db, tracks, files, activity
    ):
        ids = add(db, tracks, ["E:\\a.mp3"])
        make(db, files, activity, world=World(gone=["E:\\"])).check(ids)
        assert [row["type"] for row in events(db)] == [
            EVENT_FILES_CHECKED,
            EVENT_ROOT_UNAVAILABLE,
        ]

    def test_a_feed_that_cannot_be_written_does_not_fail_the_check(
        self, db, tracks, files
    ):
        class Broken:
            def record_event(self, *args, **kwargs):
                raise sqlite3.OperationalError("database is locked")

        ids = add(db, tracks, ["/m/a.mp3"])
        result = make(db, files, Broken(), world=World()).check(ids)
        assert result.present == 1
        assert len(stored(db)) == 1


class TestResolving:
    def test_ids_are_narrowed_to_library_tracks(self, db, tracks, files):
        [track] = add(db, tracks, ["/m/a.mp3"])
        service = make(db, files)
        assert service.resolve(BatchSelection.of_ids([999_999, track])) == [track]

    def test_a_selection_of_nothing_in_the_library_is_refused(self, db, files):
        service = make(db, files)
        with pytest.raises(ValueError, match="no files to check"):
            service.resolve(BatchSelection.of_ids([999_999]))

    def test_the_batch_services_refusal_is_said_as_a_checks(self, db, files):
        service = make(db, files, selections=Selections(ValueError("nothing to apply")))
        with pytest.raises(ValueError) as refused:
            service.resolve(BatchSelection.of_ids([1]))
        assert str(refused.value) == NOTHING_TO_CHECK

    def test_a_query_that_cannot_be_built_is_not_hidden(self, db, files):
        service = make(
            db, files, selections=Selections(BrowseQueryError("Unknown sort: nope"))
        )
        with pytest.raises(BrowseQueryError, match="nope"):
            service.resolve(BatchSelection.of_ids([1]))

    def test_the_library_is_every_track(self, db, tracks, files):
        ids = add(db, tracks, ["/m/a.mp3", ""])
        assert make(db, files).library() == sorted(ids)


class TestTheResult:
    def test_the_sentences(self):
        assert (
            FileCheckResult("request", 3, present=2, missing=1).summary_line()
            == "Checked 3 files: 2 present, 1 missing"
        )
        assert FileCheckResult(
            "refresh", 4, present=1, no_path=2, vanished=1
        ).summary_line() == (
            "Checked 1 file: 1 present, 0 missing. 2 tracks have no file location."
            " 1 track left the library during the check"
        )
        assert (
            FileCheckResult("request", 10, present=3, cancelled=True).summary_line()
            == "Stopped after 3 of 10 tracks, having checked 3 files: 3 present, 0 missing"
        )

    @pytest.mark.parametrize(
        "fields",
        [
            dict(trigger="launch", total=0),
            dict(trigger="request", total=1, present=-1, cancelled=True),
            dict(trigger="request", total=1, present=2),
            dict(trigger="request", total=2, present=1),
            dict(
                trigger="request",
                total=1,
                present=1,
                unavailable=(UnavailableRoot("E:\\", 1),),
            ),
        ],
    )
    def test_counts_a_check_cannot_produce_are_refused(self, fields):
        with pytest.raises(ValueError):
            FileCheckResult(**fields)

    def test_the_payload(self):
        result = FileCheckResult(
            "import",
            3,
            present=1,
            missing=2,
            unavailable=(UnavailableRoot("E:\\", 2),),
            duration_seconds=1.23456,
        )
        assert result.to_dict() == {
            "trigger": "import",
            "total": 3,
            "completed": 3,
            "checked": 3,
            "present": 1,
            "missing": 2,
            "unreadable": 0,
            "no_path": 0,
            "vanished": 0,
            "cancelled": False,
            "unavailable": [
                {
                    "root": "E:\\",
                    "tracks": 2,
                    "summary": "2 tracks on E:\\ — the drive is not connected",
                }
            ],
            "duration_seconds": 1.235,
            "summary_line": "Checked 3 files: 1 present, 2 missing",
        }


# ------------------------------------------------------------ a busy database


class TestABusyDatabase:
    """A check commits beside imports that hold the write lock for seconds."""

    def test_a_chunk_the_database_was_too_busy_for_is_saved_when_it_is_free(
        self, db, tracks, files, monkeypatch
    ):
        ids = add(db, tracks, ["/m/a.mp3", "/m/b.mp3"])
        real_record = files.record
        calls: List[int] = []

        def record(checks):
            calls.append(len(checks))
            if len(calls) <= 2:
                raise sqlite3.OperationalError("database is locked")
            return real_record(checks)

        monkeypatch.setattr(files, "record", record)
        monkeypatch.setattr(module, "_BUSY_RETRY_INTERVAL_SECONDS", 0.0)
        result = make(db, files, world=World()).check(ids)
        assert calls == [2, 2, 2]
        assert result.present == 2
        assert len(stored(db)) == 2

    def test_a_wait_that_runs_out_fails_the_check(self, db, tracks, files, monkeypatch):
        ids = add(db, tracks, ["/m/a.mp3"])

        def record(checks):
            raise sqlite3.OperationalError("database is locked")

        monkeypatch.setattr(files, "record", record)
        monkeypatch.setattr(module, "DATABASE_BUSY_PATIENCE_SECONDS", 0.0)
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            make(db, files, world=World()).check(ids)
        assert stored(db) == {}

    def test_busy_is_told_apart_from_every_other_failure(self):
        wrapped = RuntimeError("Could not save changes to the library database")
        wrapped.__cause__ = sqlite3.OperationalError("database is locked")
        assert module.database_busy(sqlite3.OperationalError("database is locked"))
        assert module.database_busy(
            sqlite3.OperationalError("database table is locked")
        )
        assert module.database_busy(wrapped)
        assert not module.database_busy(sqlite3.OperationalError("disk I/O error"))
        assert not module.database_busy(sqlite3.IntegrityError("locked"))
        assert not module.database_busy(ValueError("database is locked"))

    def test_a_real_writer_holding_the_lock_past_the_busy_timeout(
        self, tmp_path, monkeypatch
    ):
        service = DatabaseService(
            db_path=tmp_path / "busy.db", busy_timeout_seconds=0.1
        )
        MigrationRunner(service).migrate()
        try:
            track_repository = TrackRepository(service)
            ids = add(service, track_repository, ["/m/a.mp3", "/m/b.mp3"])
            repository = FileStatusRepository(service)
            holding = threading.Event()

            def writer():
                with service.transaction() as conn:
                    conn.execute(
                        "UPDATE tracks SET title = title WHERE id = ?", (ids[0],)
                    )
                    holding.set()
                    time.sleep(0.8)

            thread = threading.Thread(target=writer)
            thread.start()
            assert holding.wait(5)
            result = make(service, repository, world=World()).check(ids)
            thread.join()
            assert result.present == 2
            assert len(stored(service)) == 2
        finally:
            service.close_all()


class TestWhatIsNeverLookedAt:
    def test_a_folder_is_unreadable_even_where_opening_one_would_succeed(
        self, tmp_path, monkeypatch
    ):
        # Opening a folder fails on its own on most systems, which would hide a
        # check that forgot to ask whether the path is a file at all.
        folder = tmp_path / "a.mp3"
        folder.mkdir()
        monkeypatch.setattr(module, "is_readable", lambda path: True)
        assert check_file(str(folder)) == (FILE_UNREADABLE, None)

    def test_a_relative_path_is_missing_without_being_looked_at(
        self, db, tracks, files
    ):
        world = World()
        ids = add(db, tracks, ["Music/a.mp3", "/m/b.mp3"])
        result = make(db, files, world=world).check(ids)
        assert world.checked == ["/m/b.mp3"]
        assert (result.missing, result.present) == (1, 1)
        assert stored(db)[ids[0]]["status"] == FILE_MISSING


class TestLookingAtSeveralFilesAtOnce:
    def test_looks_overlap_and_each_answer_lands_on_its_own_track(
        self, db, tracks, files
    ):
        paths = [f"/m/{index:02}.mp3" for index in range(32)]
        ids = add(db, tracks, paths)
        lock = threading.Lock()
        active = {"now": 0, "most": 0}

        def check(path: str):
            index = int(path[3:5])
            with lock:
                active["now"] += 1
                active["most"] = max(active["most"], active["now"])
            # Uneven, so answers come back in a different order than asked.
            time.sleep(0.002 * ((32 - index) % 5 + 1))
            with lock:
                active["now"] -= 1
            return (FILE_MISSING, None) if index % 3 == 0 else (FILE_PRESENT, index)

        service = FileCheckService(
            files,
            Selections(),  # type: ignore[arg-type]
            None,
            db,
            checker=check,
            probe=lambda root: True,
            clock=lambda: NOW,
        )
        result = service.check(ids)

        assert 1 < active["most"] <= FILE_CHECK_WORKERS
        rows = stored(db)
        for index, track in enumerate(ids):
            expected = (FILE_MISSING, None) if index % 3 == 0 else (FILE_PRESENT, index)
            assert (rows[track]["status"], rows[track]["size_bytes"]) == expected
        assert (result.present, result.missing) == (21, 11)

    def test_a_look_that_raises_fails_the_check_after_the_others_finish(
        self, db, tracks, files
    ):
        ids = add(db, tracks, [f"/m/{index:02}.mp3" for index in range(20)])

        def check(path: str):
            if path == "/m/05.mp3":
                raise OSError("the share went away")
            return FILE_PRESENT, 1

        service = FileCheckService(
            files,
            Selections(),  # type: ignore[arg-type]
            None,
            db,
            checker=check,
            probe=lambda root: True,
            clock=lambda: NOW,
        )
        with pytest.raises(OSError, match="share"):
            service.check(ids)
        assert stored(db) == {}

    @pytest.mark.parametrize("workers", [0, -1])
    def test_a_pool_of_no_workers_is_refused(self, db, files, workers):
        with pytest.raises(ValueError, match="worker"):
            make(db, files, workers=workers)
