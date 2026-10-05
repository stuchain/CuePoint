#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""``waveforms.db``, the waveform store (WAVE-02, DEC-122).

A cache, not a record, and these tests are about the two ways a cache fails a
user:

1. **It refuses to start.** A store in another schema, a corrupt one, or a
   foreign file must be set aside and a new one made, never raised to the user
   as a broken app. A lock, on the other hand, is not corruption, and hours of
   analysis must not be thrown away for one.
2. **It answers wrongly.** A row of another analysis version must not answer;
   each ``CHECK`` must refuse the row it exists to refuse; the picture must
   never be read to answer a state.

And the rule DEC-122 exists for: the store is not the library. The launch
backup, "Clear cache" and the support bundle all leave it alone.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
import zipfile
from pathlib import Path

import pytest

from cuepoint.models.waveform import (
    STORED_FAILED,
    STORED_READY,
    StoredFile,
    StoredWaveform,
    WaveformSummary,
)
from cuepoint.persistence import waveform_store as module
from cuepoint.persistence.waveform_store import (
    CONDEMNED_SUFFIX,
    PAGE_SIZE,
    PATH_CHUNK,
    SCHEMA_VERSION,
    SET_ASIDE_SUFFIX,
    WAVEFORM_STORE_FILENAME,
    WaveformStore,
    WaveformStoreError,
    default_waveform_store_path,
    is_corruption,
)

NOW = "2026-09-30T12:00:00+00:00"


def ready(path: str = "/music/a.flac", version: int = 1, **overrides) -> StoredWaveform:
    values = dict(
        path=path,
        size_bytes=1_000,
        mtime_ns=1_700_000_000_000_000_000,
        analysis_version=version,
        state=STORED_READY,
        analysed_at=NOW,
        duration_ms=360_000,
        data=b"CPWF" + bytes(100),
    )
    values.update(overrides)
    return StoredWaveform(**values)


def failed(path: str = "/music/b.mp3", version: int = 1, reason: str = "undecodable"):
    return StoredWaveform(
        path=path,
        size_bytes=10,
        mtime_ns=5,
        analysis_version=version,
        state=STORED_FAILED,
        analysed_at=NOW,
        reason=reason,
    )


class Logs:
    """Records the module's own logger, whatever another test did to logging.

    Not logs: its handler sits on the root, and another test's logging setup
    (the "cuepoint" logger stops propagating, or a dictConfig disables existing
    loggers) keeps records from reaching it in a full run.
    """

    def __init__(self) -> None:
        self.records: list = []

    def __enter__(self) -> "Logs":
        return self

    def __exit__(self, *exc) -> None:
        return None

    @property
    def text(self) -> str:
        return "\n".join(record.getMessage() for record in self.records)


@pytest.fixture
def logs():
    captured = Logs()
    handler = logging.Handler(logging.DEBUG)
    handler.emit = captured.records.append  # type: ignore[method-assign]
    logger = logging.getLogger(module.__name__)
    saved = (logger.level, logger.disabled)
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    logger.disabled = False
    yield captured
    logger.removeHandler(handler)
    logger.level, logger.disabled = saved


@pytest.fixture
def store_path(tmp_path) -> Path:
    return tmp_path / "home" / WAVEFORM_STORE_FILENAME


@pytest.fixture
def store(store_path):
    opened = WaveformStore(store_path)
    yield opened
    opened.close_all()


def raw(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(str(path))
    return connection


def files_in(folder: Path):
    return sorted(p.name for p in folder.iterdir())


@pytest.mark.unit
class TestWhereItLives:
    def test_beside_the_library_database(self, tmp_path):
        assert default_waveform_store_path(tmp_path / "cuepoint.db") == (
            tmp_path / "waveforms.db"
        )

    def test_under_cuepoint_home_by_default(self, tmp_path, monkeypatch):
        from cuepoint.utils.paths import cuepoint_home

        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "profile"))

        # The library's default path is cuepoint_home()/cuepoint.db (the suite
        # redirects that function itself, so it is spelled out here).
        assert default_waveform_store_path(cuepoint_home() / "cuepoint.db") == (
            tmp_path / "profile" / "waveforms.db"
        )

    def test_nothing_is_created_until_first_use(self, store_path):
        asked = []

        def location() -> Path:
            asked.append(1)
            return store_path

        store = WaveformStore(location)
        assert not store_path.parent.exists()
        assert asked == []

        assert store.count() == 0
        assert store.path == store_path
        assert store_path.exists()
        assert asked == [1]
        store.close_all()


@pytest.mark.unit
class TestTheSchema:
    def test_a_fresh_store_has_the_schema(self, store, store_path):
        store.count()
        connection = raw(store_path)
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        version = connection.execute(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        ).fetchone()
        columns = [row[1] for row in connection.execute("PRAGMA table_info(waveforms)")]
        journal = connection.execute("PRAGMA journal_mode").fetchone()[0]
        connection.close()

        assert tables == {"meta", "waveforms"}
        assert version == (str(SCHEMA_VERSION),)
        assert columns == [
            "path",
            "size_bytes",
            "mtime_ns",
            "analysis_version",
            "state",
            "reason",
            "duration_ms",
            "analysed_at",
            "data",
        ]
        # The picture is last, so a state never reads it.
        assert columns[-1] == "data"
        assert journal == "wal"

    def test_a_new_store_has_large_pages_and_keeps_them_in_wal(self, store, store_path):
        store.put(ready())
        store.close_all()
        connection = raw(store_path)
        page_size = connection.execute("PRAGMA page_size").fetchone()[0]
        journal = connection.execute("PRAGMA journal_mode").fetchone()[0]
        connection.close()

        assert PAGE_SIZE == 16_384
        assert (page_size, journal) == (PAGE_SIZE, "wal")

    def test_an_existing_store_keeps_its_own_page_size(self, store_path):
        store_path.parent.mkdir(parents=True)
        first = WaveformStore(store_path)
        first.count()
        first.close_all()
        before = raw(store_path).execute("PRAGMA page_size").fetchone()[0]

        second = WaveformStore(store_path)
        second.put(ready())
        second.close_all()

        assert raw(store_path).execute("PRAGMA page_size").fetchone()[0] == before

    def test_the_path_is_unique_and_indexed(self, store, store_path):
        store.count()
        connection = raw(store_path)
        plan = " ".join(
            str(row[-1])
            for row in connection.execute(
                "EXPLAIN QUERY PLAN SELECT state FROM waveforms WHERE path IN (?, ?)",
                ("a", "b"),
            )
        )
        connection.close()

        assert "USING INDEX" in plan or "PRIMARY KEY" in plan

    @pytest.mark.parametrize(
        "values, check",
        [
            # (path, size, mtime, version, state, reason, duration, at, data)
            (("", 1, 1, 1, "failed", "x", None, NOW, None), "path"),
            ((None, 1, 1, 1, "failed", "x", None, NOW, None), "NOT NULL"),
            (("/p", -1, 1, 1, "failed", "x", None, NOW, None), "size_bytes"),
            (("/p", 1, None, 1, "failed", "x", None, NOW, None), "NOT NULL"),
            (("/p", 1, 1, 0, "failed", "x", None, NOW, None), "analysis_version"),
            (("/p", 1, 1, 1, "waiting", "x", None, NOW, None), "state"),
            (("/p", 1, 1, 1, "ready", None, -5, NOW, b"x"), "duration_ms"),
            (("/p", 1, 1, 1, "ready", None, 5, NOW, None), "CHECK"),
            (("/p", 1, 1, 1, "ready", None, None, NOW, b"x"), "CHECK"),
            (("/p", 1, 1, 1, "failed", None, None, NOW, None), "CHECK"),
            (("/p", 1, 1, 1, "failed", "x", 5, NOW, b"x"), "CHECK"),
            (("/p", 1, 1, 1, "ready", "x", 5, NOW, b"x"), "CHECK"),
            (("/p", 1, 1, 1, "failed", "x", None, None, None), "NOT NULL"),
        ],
    )
    def test_each_check_refuses_what_it_should(self, store, store_path, values, check):
        store.count()
        connection = raw(store_path)
        with pytest.raises(sqlite3.IntegrityError, match=check):
            connection.execute(
                "INSERT INTO waveforms (path, size_bytes, mtime_ns, analysis_version,"
                " state, reason, duration_ms, analysed_at, data)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                values,
            )
        connection.close()

    def test_the_checks_admit_both_good_rows(self, store, store_path):
        store.count()
        connection = raw(store_path)
        connection.execute(
            "INSERT INTO waveforms VALUES ('/r', 1, 1, 1, 'ready', NULL, 0, ?, x'00')",
            (NOW,),
        )
        connection.execute(
            "INSERT INTO waveforms VALUES ('/f', 0, -1, 2, 'failed', 'timeout', NULL, ?, NULL)",
            (NOW,),
        )
        connection.commit()
        connection.close()

        assert store.count() == 2


@pytest.mark.unit
class TestReadingAndWriting:
    def test_a_ready_row_round_trips(self, store):
        row = ready()

        store.put(row)

        assert store.get(row.path, 1) == row

    def test_a_failed_row_round_trips(self, store):
        row = failed()

        store.put(row)

        assert store.get(row.path, 1) == row

    def test_a_put_replaces_the_paths_row(self, store):
        store.put(ready())
        store.put(failed(path="/music/a.flac", reason="timeout"))

        assert store.count() == 1
        assert store.get("/music/a.flac", 1).reason == "timeout"
        assert store.get("/music/a.flac", 1).data is None

    def test_only_the_current_version_answers(self, store):
        store.put(ready(version=1))

        assert store.get("/music/a.flac", 2) is None
        assert store.summaries(["/music/a.flac"], 2) == {}
        assert store.get_many(["/music/a.flac"], 1)

    def test_summaries_leave_the_picture_behind(self, store):
        store.put(ready())
        store.put(failed())

        found = store.summaries(["/music/a.flac", "/music/b.mp3", "/nowhere"], 1)

        assert set(found) == {"/music/a.flac", "/music/b.mp3"}
        assert all(type(value) is WaveformSummary for value in found.values())
        assert found["/music/a.flac"] == ready().summary

    def test_many_paths_are_read_in_chunks(self, store):
        paths = [f"/music/{index:05d}.flac" for index in range(PATH_CHUNK * 2 + 7)]
        for path in paths:
            store.put(ready(path))

        found = store.summaries(paths + paths[:3], 1)

        assert set(found) == set(paths)

    def test_case_variants_are_distinct_keys(self, store):
        store.put(ready("/Music/A.flac"))
        store.put(failed("/music/a.flac"))

        assert store.count() == 2
        assert store.get("/Music/A.flac", 1).is_ready
        assert not store.get("/music/a.flac", 1).is_ready

    def test_a_path_is_stored_exactly(self, store):
        path = "C:\\Música\\Ünïcode ① — tab\t.flac"
        store.put(ready(path))

        assert store.get(path, 1).path == path

    def test_delete(self, store):
        store.put(ready())

        assert store.delete("/music/a.flac") is True
        assert store.delete("/music/a.flac") is False
        assert store.count() == 0

    def test_threads_write_and_read_together(self, store):
        errors = []

        def work(offset: int) -> None:
            try:
                for index in range(50):
                    store.put(ready(f"/t/{offset}/{index}.flac"))
                    store.summaries([f"/t/{offset}/{index}.flac"], 1)
            except Exception as exc:  # pragma: no cover - reported below
                errors.append(exc)

        threads = [threading.Thread(target=work, args=(n,)) for n in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert errors == []
        assert store.count() == 200

    def test_an_ended_threads_connection_is_closed_on_the_next_open(self, store):
        store.count()
        workers = [threading.Thread(target=store.count) for _ in range(5)]
        for worker in workers:
            worker.start()
            worker.join()

        threading.Thread(target=store.count).start()
        # The last thread may still be alive; every earlier one's was reaped.
        assert len(store._connections) <= 3

    def test_close_all_then_use_again(self, store):
        store.put(ready())
        store.close_all()

        assert store.get("/music/a.flac", 1) == ready()


class TestTheAnalysisJobsReads:
    """WAVE-03: the work list's read, the prune's read, and the prune."""

    def test_a_fresh_store_has_the_work_index(self, store, store_path):
        store.count()
        connection = raw(store_path)
        columns = [
            row[2] for row in connection.execute("PRAGMA index_info(waveforms_work)")
        ]
        connection.close()

        assert columns == ["analysis_version", "path", "size_bytes", "state"]

    def test_a_store_made_before_the_index_gains_it_and_keeps_its_rows(
        self, store, store_path
    ):
        store.put(ready("/music/kept.flac"))
        store.close_all()
        connection = raw(store_path)
        connection.execute("DROP INDEX waveforms_work")
        connection.commit()
        connection.close()

        reopened = WaveformStore(store_path)
        found = reopened.current_files(1)
        connection = raw(store_path)
        names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index'"
            )
        }
        connection.close()
        reopened.close_all()

        assert "waveforms_work" in names
        assert found == {"/music/kept.flac": StoredFile(1_000, STORED_READY)}

    def test_current_files_answers_size_and_state_of_this_version_only(self, store):
        store.put(ready("/music/a.flac", size_bytes=11))
        store.put(failed("/music/b.mp3"))
        store.put(ready("/music/old.flac", version=2))

        assert store.current_files(1) == {
            "/music/a.flac": StoredFile(11, STORED_READY),
            "/music/b.mp3": StoredFile(10, STORED_FAILED),
        }
        assert store.current_files(2) == {
            "/music/old.flac": StoredFile(1_000, STORED_READY)
        }

    def test_current_files_reads_the_index_alone(self, store, store_path):
        store.count()
        connection = raw(store_path)
        plan = " ".join(
            str(row[-1])
            for row in connection.execute(
                "EXPLAIN QUERY PLAN SELECT path, size_bytes, state FROM waveforms"
                " INDEXED BY waveforms_work WHERE analysis_version = ?",
                (1,),
            )
        )
        connection.close()

        assert "COVERING INDEX waveforms_work" in plan

    def test_paths_answers_every_version(self, store):
        store.put(ready("/music/a.flac"))
        store.put(ready("/music/b.flac", version=7))

        assert sorted(store.paths()) == ["/music/a.flac", "/music/b.flac"]

    def test_delete_paths_deletes_exactly_those(self, store):
        for name in ("a", "b", "c"):
            store.put(ready(f"/music/{name}.flac"))

        deleted = store.delete_paths(["/music/a.flac", "/music/c.flac", "/nope"])

        assert deleted == 2
        assert store.paths() == ["/music/b.flac"]

    def test_delete_paths_over_many_chunks_in_one_transaction(self, store):
        paths = [f"/music/{index}.flac" for index in range(PATH_CHUNK * 2 + 3)]
        for path in paths:
            store.put(ready(path))

        assert store.delete_paths(paths + paths[:5]) == len(paths)
        assert store.count() == 0

    def test_delete_paths_of_nothing_writes_nothing(self, store):
        store.put(ready())

        assert store.delete_paths([]) == 0
        assert store.count() == 1


def write_foreign(path: Path, script: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = raw(path)
    connection.executescript(script)
    connection.commit()
    connection.close()


@pytest.mark.unit
class TestSettingAside:
    def test_an_unknown_schema_version_is_set_aside_and_rebuilt(self, store_path, logs):
        write_foreign(
            store_path,
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
            "INSERT INTO meta VALUES ('schema_version', '99');"
            "CREATE TABLE waveforms (path TEXT PRIMARY KEY, future BLOB);"
            "INSERT INTO waveforms VALUES ('/kept', x'01');",
        )
        store = WaveformStore(store_path)

        with logs:
            assert store.count() == 0
        store.close_all()

        aside = store_path.with_name(store_path.name + SET_ASIDE_SUFFIX)
        connection = raw(aside)
        assert connection.execute("SELECT path FROM waveforms").fetchall() == [
            ("/kept",)
        ]
        connection.close()
        messages = [
            r.getMessage() for r in logs.records if "set aside" in r.getMessage()
        ]
        assert len(messages) == 1
        assert "schema version 99" in messages[0]

    @pytest.mark.parametrize(
        "script, reason",
        [
            ("CREATE TABLE tracks (id INTEGER);", "no schema version"),
            (
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
                "schema version None",
            ),
            (
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
                f"INSERT INTO meta VALUES ('schema_version', '{SCHEMA_VERSION}');",
                "no waveforms table",
            ),
        ],
    )
    def test_a_foreign_database_is_set_aside(self, store_path, logs, script, reason):
        write_foreign(store_path, script)
        store = WaveformStore(store_path)

        with logs:
            store.put(ready())
        store.close_all()

        assert reason in logs.text
        assert store_path.with_name(store_path.name + SET_ASIDE_SUFFIX).exists()

    def test_a_file_that_is_not_a_database_is_set_aside(self, store_path, logs):
        store_path.parent.mkdir(parents=True)
        store_path.write_bytes(b"this is not SQLite" * 1000)
        store = WaveformStore(store_path)

        with logs:
            store.put(ready())
            assert store.get("/music/a.flac", 1) == ready()
        store.close_all()

        assert "unreadable" in logs.text
        aside = store_path.with_name(store_path.name + SET_ASIDE_SUFFIX)
        assert aside.read_bytes().startswith(b"this is not SQLite")

    def test_an_empty_file_is_a_fresh_store(self, store_path, logs):
        store_path.parent.mkdir(parents=True)
        store_path.write_bytes(b"")
        store = WaveformStore(store_path)

        with logs:
            assert store.count() == 0
        store.close_all()

        assert "set aside" not in logs.text

    def test_a_store_in_this_schema_is_kept(self, store_path):
        first = WaveformStore(store_path)
        first.put(ready())
        first.close_all()

        second = WaveformStore(store_path)
        assert second.get("/music/a.flac", 1) == ready()
        second.close_all()
        assert not store_path.with_name(store_path.name + SET_ASIDE_SUFFIX).exists()

    def test_only_the_newest_set_aside_store_is_kept(self, store_path):
        for version in ("98", "99"):
            write_foreign(
                store_path,
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
                f"INSERT INTO meta VALUES ('schema_version', '{version}');",
            )
            store = WaveformStore(store_path)
            store.count()
            store.close_all()
            store_path.unlink()
            for suffix in ("-wal", "-shm"):
                store_path.with_name(store_path.name + suffix).unlink(missing_ok=True)

        aside = [
            name for name in files_in(store_path.parent) if SET_ASIDE_SUFFIX in name
        ]
        assert aside == ["waveforms.db.set-aside"]
        connection = raw(store_path.with_name(aside[0]))
        assert connection.execute("SELECT value FROM meta").fetchone() == ("99",)
        connection.close()

    def test_a_set_aside_store_keeps_its_uncheckpointed_rows(self, store_path):
        # A newer build's store left with its rows still in the WAL, as a
        # killed engine leaves one: the sidecars go aside with it.
        store_path.parent.mkdir(parents=True)
        keeper = raw(store_path)
        keeper.execute("PRAGMA journal_mode=WAL")
        keeper.execute("PRAGMA wal_autocheckpoint=0")
        keeper.executescript(
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
            "INSERT INTO meta VALUES ('schema_version', '99');"
            "CREATE TABLE waveforms (path TEXT PRIMARY KEY);"
            "INSERT INTO waveforms VALUES ('/only-in-the-wal');"
        )
        keeper.commit()
        wal = store_path.with_name(store_path.name + "-wal")
        assert wal.exists() and wal.stat().st_size > 0
        # Copy the three files as they are, as a crash would leave them.
        copies = {}
        for suffix in ("", "-wal", "-shm"):
            source = store_path.with_name(store_path.name + suffix)
            copies[suffix] = source.read_bytes() if source.exists() else None
        keeper.close()
        for suffix, content in copies.items():
            target = store_path.with_name(store_path.name + suffix)
            target.unlink(missing_ok=True)
            if content is not None:
                target.write_bytes(content)

        store = WaveformStore(store_path)
        store.count()
        store.close_all()

        aside = store_path.with_name(store_path.name + SET_ASIDE_SUFFIX)
        connection = raw(aside)
        assert connection.execute("SELECT path FROM waveforms").fetchall() == [
            ("/only-in-the-wal",)
        ]
        connection.close()

    def test_a_lock_is_not_corruption(self, store_path):
        # Another process holding the file is not a reason to throw hours of
        # analysis away: the store refuses this call and keeps the file.
        store_path.parent.mkdir(parents=True)
        holder = sqlite3.connect(str(store_path), isolation_level=None)
        holder.execute("PRAGMA journal_mode=DELETE")
        holder.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        holder.execute("BEGIN EXCLUSIVE")
        try:
            store = WaveformStore(store_path, busy_timeout_seconds=0.05)
            with pytest.raises(WaveformStoreError):
                store.count()
            assert not store_path.with_name(store_path.name + SET_ASIDE_SUFFIX).exists()
        finally:
            holder.execute("ROLLBACK")
            holder.close()

    def test_an_unwritable_folder_is_a_store_error(self, tmp_path):
        blocker = tmp_path / "file"
        blocker.write_text("not a folder")
        store = WaveformStore(blocker / "waveforms.db")

        with pytest.raises(WaveformStoreError) as raised:
            store.count()

        assert raised.value.error_code == "WAVEFORM_STORE_DIR"


def corrupt_pages(path: Path, first_page: int) -> None:
    """Overwrite the start of every page from ``first_page`` (1-based) on."""
    data = bytearray(path.read_bytes())
    page = int.from_bytes(data[16:18], "big") or 65_536
    for offset in range(page * (first_page - 1), len(data), page):
        data[offset : offset + 64] = b"\xff" * 64
    path.write_bytes(bytes(data))


def filled_store(store_path: Path) -> None:
    store = WaveformStore(store_path)
    for index in range(600):
        store.put(ready(f"/music/{index:04d}.flac", data=bytes(range(256)) * 12))
    store.connect().execute("PRAGMA wal_checkpoint(TRUNCATE)")
    store.close_all()


@pytest.mark.unit
def test_corruption_found_at_launch_is_set_aside(store_path, logs):
    filled_store(store_path)
    corrupt_pages(store_path, 2)
    store = WaveformStore(store_path)

    with logs:
        assert store.count() == 0
    store.close_all()

    assert "unreadable (database disk image is malformed)" in logs.text


@pytest.mark.unit
class TestCorruptionFoundInUse:
    def make_corrupt_store(self, store_path) -> None:
        # The schema's pages stay whole, so the launch's look passes and the
        # damage is found by a read, as a failing disk's would be.
        filled_store(store_path)
        header = store_path.read_bytes()[:100]
        page = int.from_bytes(header[16:18], "big") or 65_536
        pages = store_path.stat().st_size // page
        assert pages > 10
        corrupt_pages(store_path, pages // 2)

    def test_a_read_that_finds_corruption_condemns_the_store(self, store_path, logs):
        self.make_corrupt_store(store_path)
        store = WaveformStore(store_path)
        paths = [f"/music/{index:04d}.flac" for index in range(600)]

        with logs:
            with pytest.raises(WaveformStoreError) as raised:
                store.get_many(paths, 1)
        store.close_all()

        assert raised.value.error_code == "WAVEFORM_STORE_CORRUPT"
        # The launch's look passed: nothing was set aside, the read found it.
        assert not store_path.with_name(store_path.name + SET_ASIDE_SUFFIX).exists()
        assert store_path.with_name(store_path.name + CONDEMNED_SUFFIX).exists()
        assert "next launch" in logs.text

    def test_the_next_launch_sets_a_condemned_store_aside(self, store_path, logs):
        self.make_corrupt_store(store_path)
        store = WaveformStore(store_path)
        with pytest.raises(WaveformStoreError):
            store.get_many([f"/music/{index:04d}.flac" for index in range(600)], 1)
        store.close_all()

        relaunched = WaveformStore(store_path)
        with logs:
            assert relaunched.count() == 0
            relaunched.put(ready())
        relaunched.close_all()

        assert "found corrupt while in use" in logs.text
        assert not store_path.with_name(store_path.name + CONDEMNED_SUFFIX).exists()
        assert store_path.with_name(store_path.name + SET_ASIDE_SUFFIX).exists()


@pytest.mark.unit
def test_every_file_the_store_writes_is_named_after_itself(tmp_path):
    """Its own data only, in its own folder (Phase 11 fact 6, the boundary test)."""
    home = tmp_path / "home"
    store_path = home / WAVEFORM_STORE_FILENAME
    write_foreign(
        store_path,
        "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
        "INSERT INTO meta VALUES ('schema_version', '99');",
    )
    store = WaveformStore(store_path)
    store.put(ready())
    store.condemn("a test")
    store.close_all()
    relaunched = WaveformStore(store_path)
    relaunched.put(failed())
    relaunched.close_all()

    everything = sorted(
        p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*") if p.is_file()
    )
    assert everything
    assert all(name.startswith("home/waveforms.db") for name in everything), everything


@pytest.mark.unit
class TestIsCorruption:
    def test_sqlite_says_so(self, tmp_path):
        bad = tmp_path / "bad.db"
        bad.write_bytes(b"garbage" * 200)
        connection = sqlite3.connect(str(bad))
        with pytest.raises(sqlite3.DatabaseError) as raised:
            connection.execute("SELECT * FROM sqlite_master").fetchall()
        connection.close()

        assert is_corruption(raised.value)

    def test_a_lock_or_a_missing_table_is_not(self):
        assert not is_corruption(sqlite3.OperationalError("database is locked"))
        assert not is_corruption(sqlite3.OperationalError("no such table: x"))
        assert not is_corruption(OSError("disk"))

    def test_by_message_where_there_is_no_code(self):
        assert is_corruption(sqlite3.DatabaseError("database disk image is malformed"))
        assert is_corruption(sqlite3.DatabaseError("file is not a database"))


@pytest.mark.unit
class TestTheStoreIsNotTheLibrary:
    """DEC-122: outside the launch backup, "Clear cache" and the support bundle."""

    def test_the_launch_backup_does_not_carry_it(self, tmp_path):
        from cuepoint.services.backup_service import BackupService
        from cuepoint.services.database_service import DatabaseService
        from cuepoint.services.migration_runner import MigrationRunner

        db = DatabaseService(db_path=tmp_path / "cuepoint.db")
        MigrationRunner(db).migrate()
        store = WaveformStore(default_waveform_store_path(db.db_path))
        store.put(ready())

        backup = BackupService(db).create_backup("launch")
        store.close_all()

        connection = raw(backup.path)
        tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master")}
        connection.close()
        assert "waveforms" not in tables
        assert all("waveform" not in p.name for p in backup.path.parent.iterdir())
        db.close_all()

    def test_a_restore_leaves_it_alone(self, tmp_path):
        from cuepoint.services.backup_service import BackupService
        from cuepoint.services.database_service import DatabaseService
        from cuepoint.services.migration_runner import MigrationRunner

        db = DatabaseService(db_path=tmp_path / "cuepoint.db")
        MigrationRunner(db).migrate()
        backups = BackupService(db)
        taken = backups.create_backup("manual")
        store = WaveformStore(default_waveform_store_path(db.db_path))
        store.put(ready())

        backups.restore(taken.path)

        assert store.get("/music/a.flac", 1) == ready()
        store.close_all()
        db.close_all()

    def test_clear_cache_leaves_it(self, tmp_path, monkeypatch):
        from cuepoint.engine import privacy_api
        from cuepoint.services.database_service import default_database_path

        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "home"))
        cleared = []
        # The platform cache is the user's; record that it was asked for.
        monkeypatch.setattr(
            privacy_api.DataDeletionManager, "clear_cache", lambda: cleared.append(1)
        )
        store = WaveformStore(default_waveform_store_path(default_database_path()))
        store.put(ready())

        assert privacy_api.clear_cache_now() == {"ok": True}

        assert cleared == [1]
        assert store.get("/music/a.flac", 1) == ready()
        store.close_all()

    def test_the_support_bundle_does_not_carry_it(self, tmp_path, monkeypatch):
        from cuepoint.services.database_service import default_database_path
        from cuepoint.utils.support_bundle import SupportBundleGenerator

        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "home"))
        store = WaveformStore(default_waveform_store_path(default_database_path()))
        store.put(ready())
        store.close_all()

        out = tmp_path / "out"
        out.mkdir()
        bundle = SupportBundleGenerator.generate_bundle(out)

        with zipfile.ZipFile(bundle) as archive:
            names = archive.namelist()
            text = b"".join(archive.read(name) for name in names)
        assert not any("waveform" in name for name in names)
        assert b"CPWF" not in text


@pytest.mark.unit
class TestDeletingTheData:
    """ "Delete waveform data" empties the store and gives its space back (WAVE-05)."""

    @staticmethod
    def big(path: str) -> StoredWaveform:
        # Pictures that do not compress, as the store would hold for real music.
        return ready(path, data=b"CPWF" + bytes(range(256)) * 16)

    def test_a_store_never_opened_takes_nothing(self, store, store_path):
        assert store.disk_bytes() == 0
        assert not store_path.exists()

    def test_the_size_counts_the_file_and_its_sidecars(self, store, store_path):
        store.put(ready())
        files = [
            store_path.with_name(store_path.name + suffix)
            for suffix in ("", "-wal", "-shm")
        ]

        assert store.disk_bytes() == sum(f.stat().st_size for f in files if f.exists())
        assert store.disk_bytes() > 0

    def test_a_set_aside_copy_counts_and_is_deleted(self, store, store_path):
        aside = store_path.with_name(store_path.name + SET_ASIDE_SUFFIX)
        aside.parent.mkdir(parents=True, exist_ok=True)
        aside.write_bytes(b"x" * 50_000)
        store.put(ready())
        with_copy = store.disk_bytes()

        store.clear()

        assert with_copy >= 50_000
        assert not aside.exists()

    def test_clear_deletes_every_row_of_every_version(self, store):
        store.put(ready("/music/a.flac"))
        store.put(ready("/music/b.flac", version=2))
        store.put(failed("/music/c.mp3"))

        deleted = store.clear()

        assert deleted == 3
        assert store.count() == 0
        assert store.paths() == []

    def test_clear_gives_the_space_back(self, store):
        for index in range(300):
            store.put(self.big(f"/music/{index:03}.flac"))
        store.connect().execute("PRAGMA wal_checkpoint(TRUNCATE)")
        full = store.disk_bytes()

        store.clear()

        assert full > 1_000_000
        assert store.disk_bytes() < full // 10

    def test_the_store_works_after_it_is_cleared(self, store):
        store.put(ready("/music/a.flac"))
        store.clear()
        store.put(ready("/music/b.flac"))

        assert store.paths() == ["/music/b.flac"]
        assert store.get("/music/b.flac", 1) is not None

    def test_another_thread_reading_does_not_stop_the_deletion(self, store):
        store.put(ready("/music/a.flac"))
        read = threading.Event()

        def reader():
            store.summaries(["/music/a.flac"], 1)
            read.set()

        thread = threading.Thread(target=reader)
        thread.start()
        thread.join(5)

        assert read.is_set()
        assert store.clear() == 1
        assert store.count() == 0

    def test_a_store_that_cannot_be_written_raises(self, store, monkeypatch):
        store.put(ready())

        class Refusing:
            def execute(self, sql, *args):
                raise sqlite3.OperationalError("disk I/O error")

        monkeypatch.setattr(store, "connect", lambda: Refusing())

        with pytest.raises(WaveformStoreError):
            store.clear()
