#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""``waveforms.db``: every analysed file's waveform (WAVE-02, DEC-122).

Its own SQLite file beside the library's ``cuepoint.db``, and so under
``CUEPOINT_HOME`` when that is set. Not in the library database, because that
file is what every launch backup copies, and a quarter of a gigabyte of data a
re-analysis rebuilds would multiply every backup. Not in the cache folder,
because "Clear cache" and "clear cache on exit" empty it, and rebuilding a large
library's waveforms takes hours. The launch backup, the support bundle and
"Clear cache" all leave it alone (Phase 11, fact 4).

A cache, not a record
---------------------
Its schema is rebuilt, never migrated. ``meta.schema_version`` names it:

- **A store in a version this build does not know** is renamed aside and a new
  one created.
- **A store SQLite cannot read**, a corrupt one, is treated the same way and
  recorded once in the log.
- **Corruption found later,** by a read or a write while the store is in use,
  cannot be set aside under the connections other threads hold (Windows refuses
  to rename an open file). That call fails, a marker file is left beside the
  store, and the next launch sets it aside before opening it.

So a later build's schema change costs a re-analysis, never a migration to get
wrong. One set-aside store is kept, for a person diagnosing it; an older one is
deleted when a newer one is set aside.

Keyed by the file's path
------------------------
A row is keyed by the file's path exactly as the library holds it, not by the
track's id, so a restored backup or a fresh import that gives tracks new ids
keeps every waveform. A file moved in Rekordbox is a new path, and is analysed
again. Two spellings of one path are two rows.

The table's layout, measured
----------------------------
Pages are 16 KB (:data:`PAGE_SIZE`), where a 4 KB page held one picture and
wasted up to 46% of the file.

The specification drew ``waveforms`` as a ``WITHOUT ROWID`` table. At 50,000
rows of about 3.5 KB, an ordinary table with a unique index on ``path`` was 10%
smaller (210 MB against 234 MB) and read 200 rows three times as fast (1.1 ms
against 3.6 ms). A ``WITHOUT ROWID`` row keeps at most about a kilobyte in its
page and spills the rest to an overflow page of its own; an ordinary row keeps
up to 4 KB in place. The picture is the last column, so reading a state never
reads it.

The analysis job (WAVE-03) asks for every current row's path, size and state,
once per 200 files it analyses. Rows are kept in their pages with the picture,
so a scan of the table reads the whole file: a covering index,
``waveforms_work``, answers it from 5.3 MB at 50,000 rows instead (77 ms). It is
created with ``IF NOT EXISTS`` at every first open, so a store made before it
gains it without a new schema version, and without losing a waveform.

Connections are one per thread, as the library database's are, and a thread
that has ended has its connection closed when the next one is opened.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.models.waveform import StoredFile, StoredWaveform, WaveformSummary

_logger = logging.getLogger(__name__)

#: The store's file name, beside the library database.
WAVEFORM_STORE_FILENAME = "waveforms.db"

#: The schema this build creates and reads. Any other is set aside.
SCHEMA_VERSION = 1

#: Appended to the store's name for the copy set aside.
SET_ASIDE_SUFFIX = ".set-aside"

#: Appended to the store's name for the marker that condemns it at next launch.
CONDEMNED_SUFFIX = ".condemned"

#: The page size a new store is created with. A picture is 2 to 4 KB: at
#: SQLite's default of 4 KB a page holds one row, and a row just over its local
#: limit takes a second page for the overflow. At 50,000 waveforms that wasted
#: 28% to 46% of the file. At 16 KB, 18% to 19%, and reads measured the same.
#: 32 KB saved a further 5% for twice the bytes read per row. Only a new store
#: takes it; an existing one keeps its own.
PAGE_SIZE = 16_384

#: Paths per ``IN`` query: under the 999 host parameters of the oldest SQLite
#: builds, with the version's parameter beside them.
PATH_CHUNK = 500

_SIDECARS = ("", "-wal", "-shm")

#: SQLite's primary result codes for a file that is not a database, or is one
#: whose pages do not add up.
_SQLITE_CORRUPT = 11
_SQLITE_NOTADB = 26

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS waveforms (
    path             TEXT    PRIMARY KEY NOT NULL CHECK (length(path) > 0),
    size_bytes       INTEGER NOT NULL CHECK (size_bytes >= 0),
    mtime_ns         INTEGER NOT NULL,
    analysis_version INTEGER NOT NULL CHECK (analysis_version > 0),
    state            TEXT    NOT NULL CHECK (state IN ('ready', 'failed')),
    reason           TEXT,
    duration_ms      INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    analysed_at      TEXT    NOT NULL,
    data             BLOB,
    CHECK ((state = 'ready') = (data IS NOT NULL AND duration_ms IS NOT NULL)),
    CHECK ((state = 'failed') = (reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS waveforms_work
    ON waveforms (analysis_version, path, size_bytes, state);
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '{SCHEMA_VERSION}');
"""

_SUMMARY_COLUMNS = (
    "path",
    "size_bytes",
    "mtime_ns",
    "analysis_version",
    "state",
    "analysed_at",
    "reason",
    "duration_ms",
)
_COLUMNS = (*_SUMMARY_COLUMNS, "data")

_PUT = (
    f"INSERT INTO waveforms ({', '.join(_COLUMNS)})"
    f" VALUES ({', '.join('?' for _ in _COLUMNS)})"
    " ON CONFLICT (path) DO UPDATE SET "
    + ", ".join(f"{column} = excluded.{column}" for column in _COLUMNS[1:])
)


class WaveformStoreError(DatabaseError):
    """The waveform store cannot be opened, read or written."""


def default_waveform_store_path(database_path: Union[str, Path]) -> Path:
    """The store's path: beside the library database, whichever that is."""
    return Path(database_path).parent / WAVEFORM_STORE_FILENAME


def is_corruption(exc: BaseException) -> bool:
    """True for SQLite's "not a database" and "malformed" errors.

    A locked database, a full disk or a missing folder is not corruption, and
    setting a store aside for one would throw away hours of analysis.
    """
    if not isinstance(exc, sqlite3.DatabaseError):
        return False
    code = getattr(exc, "sqlite_errorcode", None)
    if isinstance(code, int):
        return (code & 0xFF) in (_SQLITE_CORRUPT, _SQLITE_NOTADB)
    text = str(exc).lower()
    return "malformed" in text or "not a database" in text


def _sibling(path: Path, suffix: str) -> Path:
    return path.with_name(path.name + suffix)


class WaveformStore:
    """The waveform store."""

    def __init__(
        self,
        location: Union[str, Path, Callable[[], Path]],
        busy_timeout_seconds: float = 5.0,
    ) -> None:
        """Use the store at ``location``, opened on first use.

        Args:
            location: The store's path, or a callable answering it. The callable
                is asked once, on first use, so a library database path set
                after the container is built is still followed.
            busy_timeout_seconds: How long a statement waits on another
                connection's write.
        """
        self._location = location
        self._resolved: Optional[Path] = None
        self._busy_timeout = float(busy_timeout_seconds)
        self._lock = threading.Lock()
        self._prepared = False
        self._local = threading.local()
        self._connections: List[Tuple[sqlite3.Connection, threading.Thread]] = []
        self._generation = 0

    # ------------------------------------------------------------ the file

    @property
    def path(self) -> Path:
        """The store's file, resolved once."""
        if self._resolved is None:
            location = self._location
            self._resolved = Path(location() if callable(location) else location)
        return self._resolved

    @property
    def set_aside_path(self) -> Path:
        """Where a store this build cannot use is moved."""
        return _sibling(self.path, SET_ASIDE_SUFFIX)

    def _error(
        self, message: str, code: str, exc: Optional[BaseException] = None
    ) -> WaveformStoreError:
        detail = f"{message}: {exc}" if exc is not None else message
        return WaveformStoreError(
            message=detail, error_code=code, context={"store_path": str(self.path)}
        )

    def _prepare(self) -> None:
        """Make sure the file this process opens is a store in this schema.

        Called under the lock, once, before the first connection.
        """
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise self._error(
                "Could not create the folder for the waveform store",
                "WAVEFORM_STORE_DIR",
                exc,
            ) from exc

        marker = _sibling(self.path, CONDEMNED_SUFFIX)
        if marker.exists():
            try:
                reason = marker.read_text(encoding="utf-8").strip() or "corrupt"
            except OSError:
                reason = "corrupt"
            if self.path.exists():
                self._set_aside(f"found corrupt while in use ({reason})")
            marker.unlink(missing_ok=True)
        elif self.path.exists():
            unusable = self._inspect()
            if unusable is not None:
                self._set_aside(unusable)

        try:
            # Not _open(): the page size must be set before the first table is
            # written, and WAL mode, once set, fixes it.
            connection = sqlite3.connect(str(self.path), timeout=self._busy_timeout)
        except sqlite3.Error as exc:
            raise self._error(
                "Could not open the waveform store", "WAVEFORM_STORE_OPEN", exc
            ) from exc
        try:
            connection.execute(f"PRAGMA page_size={PAGE_SIZE}")
            connection.executescript(_SCHEMA)
        except sqlite3.Error as exc:
            raise self._error(
                "Could not create the waveform store", "WAVEFORM_STORE_CREATE", exc
            ) from exc
        finally:
            connection.close()

    def _inspect(self) -> Optional[str]:
        """Why the existing file cannot be used as it is, or ``None``.

        Raises:
            WaveformStoreError: When the file cannot be looked at for a reason
                that says nothing about the file, such as a lock.
        """
        try:
            connection = sqlite3.connect(str(self.path), timeout=self._busy_timeout)
        except sqlite3.Error as exc:
            raise self._error(
                "Could not open the waveform store", "WAVEFORM_STORE_OPEN", exc
            ) from exc
        try:
            tables = {
                str(row[0])
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            if not tables:
                return None
            if "meta" not in tables:
                return "no schema version"
            row = connection.execute(
                "SELECT value FROM meta WHERE key = 'schema_version'"
            ).fetchone()
            version = None if row is None else str(row[0])
            if version != str(SCHEMA_VERSION):
                return f"schema version {version}, not {SCHEMA_VERSION}"
            if "waveforms" not in tables:
                return "no waveforms table"
            return None
        except sqlite3.DatabaseError as exc:
            if is_corruption(exc):
                return f"unreadable ({exc})"
            raise self._error(
                "Could not read the waveform store", "WAVEFORM_STORE_OPEN", exc
            ) from exc
        finally:
            connection.close()

    def _set_aside(self, reason: str) -> None:
        """Move the store and its sidecars aside, keeping only the newest."""
        target = self.set_aside_path
        try:
            for suffix in _SIDECARS:
                _sibling(target, suffix).unlink(missing_ok=True)
            for suffix in _SIDECARS:
                source = _sibling(self.path, suffix)
                if source.exists():
                    source.replace(_sibling(target, suffix))
        except OSError as exc:
            raise self._error(
                "Could not set the waveform store aside",
                "WAVEFORM_STORE_SET_ASIDE",
                exc,
            ) from exc
        _logger.warning(
            "[waveforms] The waveform store was set aside and a new one created;"
            " waveforms will be analysed again. Reason: %s. Kept at %s",
            reason,
            target,
        )

    def condemn(self, reason: str) -> None:
        """Mark the store to be set aside at the next launch.

        Best effort: a store that cannot even take a marker beside it will be
        found unreadable by the next launch's own look.
        """
        marker = _sibling(self.path, CONDEMNED_SUFFIX)
        try:
            marker.write_text(reason, encoding="utf-8")
        except OSError:
            _logger.debug("[waveforms] Could not mark the store", exc_info=True)
        _logger.error(
            "[waveforms] The waveform store is corrupt (%s); it will be set aside"
            " and rebuilt at the next launch",
            reason,
        )

    # ------------------------------------------------------ connections

    def _open(self) -> sqlite3.Connection:
        try:
            connection = sqlite3.connect(
                str(self.path),
                timeout=self._busy_timeout,
                check_same_thread=False,
                isolation_level=None,
            )
        except sqlite3.Error as exc:
            raise self._error(
                "Could not open the waveform store", "WAVEFORM_STORE_OPEN", exc
            ) from exc
        try:
            connection.row_factory = sqlite3.Row
            connection.execute(f"PRAGMA busy_timeout={int(self._busy_timeout * 1000)}")
            connection.execute("PRAGMA journal_mode=WAL")
            # WAL with NORMAL survives the app crashing; a power cut can lose
            # the last analyses, which the next run makes again.
            connection.execute("PRAGMA synchronous=NORMAL")
        except sqlite3.Error as exc:
            connection.close()
            raise self._error(
                "Could not open the waveform store", "WAVEFORM_STORE_OPEN", exc
            ) from exc
        return connection

    def connect(self) -> sqlite3.Connection:
        """This thread's connection, opening the store on first use.

        Raises:
            WaveformStoreError: If the store cannot be opened or created.
        """
        existing: Optional[sqlite3.Connection] = getattr(
            self._local, "connection", None
        )
        if existing is not None:
            if getattr(self._local, "generation", None) == self._generation:
                return existing
            self.close()
        self._close_ended_threads()
        with self._lock:
            if not self._prepared:
                self._prepare()
                self._prepared = True
            connection = self._open()
            self._connections.append((connection, threading.current_thread()))
            generation = self._generation
        self._local.connection = connection
        self._local.generation = generation
        return connection

    def close(self) -> None:
        """Close this thread's connection, if open."""
        connection: Optional[sqlite3.Connection] = getattr(
            self._local, "connection", None
        )
        if connection is None:
            return
        self._local.connection = None
        with self._lock:
            self._connections = [
                entry for entry in self._connections if entry[0] is not connection
            ]
        try:
            connection.close()
        except sqlite3.Error:
            pass

    def _close_ended_threads(self) -> None:
        with self._lock:
            ended = [c for c, owner in self._connections if not owner.is_alive()]
            if not ended:
                return
            self._connections = [e for e in self._connections if e[0] not in ended]
        for connection in ended:
            try:
                connection.close()
            except sqlite3.Error:
                pass

    def close_all(self) -> None:
        """Close every connection no thread can still be using.

        The calling thread's own and those of ended threads, as the library
        database's ``close_all`` does; a live thread closes its own on its next
        use.
        """
        current = threading.current_thread()
        with self._lock:
            self._generation += 1
            closable = [
                c
                for c, owner in self._connections
                if owner is current or not owner.is_alive()
            ]
            self._connections = [e for e in self._connections if e[0] not in closable]
        for connection in closable:
            try:
                connection.close()
            except sqlite3.Error:
                pass
        self._local.connection = None

    # ------------------------------------------------------------ reading

    def _failed(self, action: str, exc: sqlite3.Error) -> WaveformStoreError:
        if is_corruption(exc):
            self.condemn(str(exc))
            return self._error(
                f"The waveform store is corrupt; could not {action}",
                "WAVEFORM_STORE_CORRUPT",
                exc,
            )
        return self._error(
            f"Could not {action} the waveform store", "WAVEFORM_STORE_IO", exc
        )

    def _select(
        self, columns: Sequence[str], paths: Iterable[str], analysis_version: int
    ) -> List[sqlite3.Row]:
        wanted = list(dict.fromkeys(str(path) for path in paths))
        rows: List[sqlite3.Row] = []
        connection = self.connect()
        try:
            for start in range(0, len(wanted), PATH_CHUNK):
                chunk = wanted[start : start + PATH_CHUNK]
                placeholders = ", ".join("?" for _ in chunk)
                rows.extend(
                    connection.execute(
                        f"SELECT {', '.join(columns)} FROM waveforms"
                        f" WHERE analysis_version = ? AND path IN ({placeholders})",
                        (int(analysis_version), *chunk),
                    )
                )
        except sqlite3.Error as exc:
            raise self._failed("read", exc) from exc
        return rows

    def summaries(
        self, paths: Iterable[str], analysis_version: int
    ) -> Dict[str, WaveformSummary]:
        """Each path's current row, without its picture.

        Only rows of ``analysis_version`` answer; a path with none is absent.
        """
        return {
            str(row["path"]): WaveformSummary(**dict(row))
            for row in self._select(_SUMMARY_COLUMNS, paths, analysis_version)
        }

    def get_many(
        self, paths: Iterable[str], analysis_version: int
    ) -> Dict[str, StoredWaveform]:
        """Each path's current row, with its picture."""
        return {
            str(row["path"]): StoredWaveform(**dict(row))
            for row in self._select(_COLUMNS, paths, analysis_version)
        }

    def get(self, path: str, analysis_version: int) -> Optional[StoredWaveform]:
        """One path's current row, or ``None``."""
        return self.get_many([path], analysis_version).get(str(path))

    def current_files(self, analysis_version: int) -> Dict[str, StoredFile]:
        """Every path's current row, as its size and state only.

        What the analysis job's work list compares with the file check. Read
        from the ``waveforms_work`` index alone, never from the rows: at 50,000
        waveforms that is 5.3 MB, where the table is 200 MB.
        """
        try:
            rows = self.connect().execute(
                "SELECT path, size_bytes, state FROM waveforms"
                " INDEXED BY waveforms_work WHERE analysis_version = ?",
                (int(analysis_version),),
            )
            return {
                str(path): StoredFile(int(size), str(state))
                for path, size, state in rows
            }
        except sqlite3.Error as exc:
            raise self._failed("read", exc) from exc

    def paths(self) -> List[str]:
        """Every stored path, of any version, from the path's own index."""
        try:
            rows = self.connect().execute("SELECT path FROM waveforms")
            return [str(row[0]) for row in rows]
        except sqlite3.Error as exc:
            raise self._failed("read", exc) from exc

    def disk_bytes(self) -> int:
        """The bytes the store takes on disk.

        Its file and WAL sidecars, and a set-aside copy's, since "Delete
        waveform data" gives those back too. A file that is not there is
        nothing; this never opens the store.
        """
        total = 0
        for base in (self.path, self.set_aside_path):
            for suffix in _SIDECARS:
                try:
                    total += _sibling(base, suffix).stat().st_size
                except OSError:
                    continue
        return total

    def count(self) -> int:
        """How many rows, of any version."""
        try:
            row = self.connect().execute("SELECT count(*) FROM waveforms").fetchone()
        except sqlite3.Error as exc:
            raise self._failed("read", exc) from exc
        return int(row[0])

    # ------------------------------------------------------------ writing

    def put(self, row: StoredWaveform) -> None:
        """Store an analysis, replacing the path's row, in one statement."""
        values = (
            row.path,
            row.size_bytes,
            row.mtime_ns,
            row.analysis_version,
            row.state,
            row.analysed_at,
            row.reason,
            row.duration_ms,
            row.data,
        )
        try:
            self.connect().execute(_PUT, values)
        except sqlite3.Error as exc:
            raise self._failed("write", exc) from exc

    def delete(self, path: str) -> bool:
        """Delete a path's row; True when there was one."""
        try:
            cursor = self.connect().execute(
                "DELETE FROM waveforms WHERE path = ?", (str(path),)
            )
        except sqlite3.Error as exc:
            raise self._failed("write", exc) from exc
        return cursor.rowcount == 1

    def delete_paths(self, paths: Iterable[str]) -> int:
        """Delete every row of these paths, in one transaction; how many went."""
        wanted = list(dict.fromkeys(str(path) for path in paths))
        if not wanted:
            return 0
        deleted = 0
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            try:
                for start in range(0, len(wanted), PATH_CHUNK):
                    chunk = wanted[start : start + PATH_CHUNK]
                    placeholders = ", ".join("?" for _ in chunk)
                    cursor = connection.execute(
                        f"DELETE FROM waveforms WHERE path IN ({placeholders})", chunk
                    )
                    deleted += max(0, cursor.rowcount)
            except BaseException:
                connection.execute("ROLLBACK")
                raise
            connection.execute("COMMIT")
        except sqlite3.Error as exc:
            raise self._failed("write", exc) from exc
        return deleted

    def clear(self) -> int:
        """Delete every waveform and give the space back; how many rows went.

        The rows go in one statement, then ``VACUUM`` rewrites the file at its
        new size and the WAL is truncated: a store emptied of 250 MB that kept
        its pages would say it was deleted and take the same disk. The file
        stays where it is, with its schema, because other threads hold
        connections to it and Windows refuses to delete an open file. A copy
        set aside earlier is deleted too.

        Raises:
            WaveformStoreError: If the rows cannot be deleted. Giving the space
                back is best effort once they have gone: a reader holding the
                file open delays it to the next ``VACUUM``, never the deletion.
        """
        connection = self.connect()
        try:
            cursor = connection.execute("DELETE FROM waveforms")
        except sqlite3.Error as exc:
            raise self._failed("write", exc) from exc
        deleted = max(0, cursor.rowcount)
        try:
            connection.execute("VACUUM")
            connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except sqlite3.Error as exc:
            _logger.warning(
                "[waveforms] The emptied store could not be compacted: %s", exc
            )
        for suffix in _SIDECARS:
            try:
                _sibling(self.set_aside_path, suffix).unlink(missing_ok=True)
            except OSError as exc:
                _logger.warning(
                    "[waveforms] A set-aside store could not be deleted: %s", exc
                )
        return deleted


__all__: Sequence[str] = (
    "CONDEMNED_SUFFIX",
    "PAGE_SIZE",
    "PATH_CHUNK",
    "SCHEMA_VERSION",
    "SET_ASIDE_SUFFIX",
    "WAVEFORM_STORE_FILENAME",
    "WaveformStore",
    "WaveformStoreError",
    "default_waveform_store_path",
    "is_corruption",
)
