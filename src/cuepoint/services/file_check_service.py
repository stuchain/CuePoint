#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Checking whether each track's file is there (CLEAN-07, DEC-073, closing DEC-037).

What a check is
---------------
For each track, ``stat`` the path, then open it for reading and close it again:

- **present** when both succeed, with the size the ``stat`` saw;
- **unreadable** when something is there and cannot be opened — a file without
  permission, a folder where a file should be, or a path an ancestor folder
  will not let CuePoint look into;
- **missing** otherwise.

Nothing is read. This is not a decode test, and mpv stays the judge of whether a
file plays (DEC-054). Something that is not a regular file is called unreadable
without being opened at all, because opening a named pipe waits for a writer
that may never come, and one path must not be able to stall a check.

A drive is asked about before its files
----------------------------------------
A track's *root* is the thing a user plugs in or connects: a drive letter, a
network share, a macOS volume, a Linux media mount. The first time a check meets
a root it asks whether the root exists. When it does not, every file under it
is missing by definition, so each is recorded ``missing`` with the reason
``root_unavailable`` without touching its path, and the check reports one line —
"4,812 tracks on E:\\ — the drive is not connected" — rather than 4,812.

The specification triggered this on a fraction of a chunk going missing. Asking
the root first is stricter and cheaper, for two reasons. A root that does not
exist makes the answer for every path under it certain, so there is no
threshold to tune and none to get wrong. And the slow answers live there: the
first question to a network share whose server is gone took 1.3 s where this
was measured, and asking the root spends that once, with no file's look behind
it.
The fraction still has a job, which is catching a drive unplugged *during* a
check: after each chunk, a root with a miss in it is asked again, and if it has
gone, that chunk's misses under it take the reason too. A root is decided once
per check after that. A drive plugged back in mid-check is picked up by the next
check, not this one.

Order, workers, chunks and cancelling
-------------------------------------
Paths are read once, then checked sorted by path, so a folder's files are asked
about one after another. The answers do not depend on it. A path a refresh
changes after it is read is recorded against the path that was checked, which
the vocabulary then reads as not checked — true, and the check that follows the
refresh answers it.

Looking at a file is the slow part, and it waits on the disk, not on Python. On
a spinning disk, opening a file the system had not touched recently measured
30 ms, where its ``stat`` took 8 µs — so a 50,000-track library would take 25
minutes one file at a time. Files are therefore looked at on
:data:`FILE_CHECK_WORKERS` threads, which measured 1.6 ms a file on the same
disk. A network share, where every look is a round trip, gains the same way.
Everything that has an order stays on the calling thread: asking about roots,
the cancel, which track each answer belongs to, and the rows.

Rows are committed a chunk at a time, ORG-07's size, so a cancelled or failed
check keeps everything it committed. A cancel is asked before each new look
rather than between chunks, because a chunk on a slow share can take minutes;
the looks already started finish — never more than one per worker — and are
committed with the rest. The one thing a cancel cannot interrupt is a single
look the operating system has not returned from.

Nothing here relocates a file, edits a track, or writes outside the database
(DEC-073). The path is Rekordbox's, and so is fixing it.
"""

from __future__ import annotations

import dataclasses
import logging
import ntpath
import os
import posixpath
import re
import stat
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Set, Tuple

from cuepoint.data.rekordbox import is_readable
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    REASON_ROOT_UNAVAILABLE,
    TrackFileStatus,
)
from cuepoint.models.library_track import utc_now_iso
from cuepoint.persistence.id_chunks import unique_ids
from cuepoint.persistence.track_query import BrowseQueryError
from cuepoint.services.batch_service import BATCH_CHUNK_SIZE, BatchSelection
from cuepoint.services.busy_wait import database_busy, write_waiting
from cuepoint.services.interfaces import (
    IActivityService,
    IBatchService,
    IDatabaseService,
    IFileCheckService,
    IFileStatusRepository,
)

_logger = logging.getLogger(__name__)

#: Recorded once per check, with its counts.
EVENT_FILES_CHECKED = "clean.files.checked"

#: Recorded once per root a check found unavailable: the one line DEC-073 asks
#: a disconnected drive to be.
EVENT_ROOT_UNAVAILABLE = "clean.files.unreachable"

#: What started a check. A check follows every import and every applied refresh
#: (DEC-073), and runs on request over any selection.
TRIGGER_REQUEST = "request"
TRIGGER_IMPORT = "import"
TRIGGER_REFRESH = "refresh"
TRIGGERS = (TRIGGER_REQUEST, TRIGGER_IMPORT, TRIGGER_REFRESH)

#: Tracks per committed transaction: ORG-07's chunk, for its reasons.
FILE_CHECK_CHUNK_SIZE = BATCH_CHUNK_SIZE

#: Files looked at at once. Looking waits on the disk or the network, not on the
#: interpreter, and eight measured 18 times faster than one on a spinning disk
#: (see the module docstring) while staying well inside what a desktop's disk,
#: share and antivirus scanner can take alongside everything else a user runs.
FILE_CHECK_WORKERS = 8

#: How long a check keeps trying to save a chunk while another job is writing.
#: Each try already waits the database's busy timeout; this bounds the whole
#: wait, so a check beside a very long write fails in the end rather than never.
DATABASE_BUSY_PATIENCE_SECONDS = 120.0

#: The pause between tries, so a busy timeout configured to zero cannot spin.
_BUSY_RETRY_INTERVAL_SECONDS = 0.05

#: The refusal for a selection with no library track in it.
NOTHING_TO_CHECK = (
    "That selection names no tracks in the library, so there are no files to check"
)

#: How a check looks at one path: a status, and a size when the file is present.
FileChecker = Callable[[str], Tuple[str, Optional[int]]]

#: How a check asks whether a root is there.
RootProbe = Callable[[str], bool]

# "E:\" and "E:/", or a bare "E:" — never "E:foo", which is relative to a
# drive's current folder and names no place a library could hold.
_DRIVE = re.compile(r"^[A-Za-z]:([\\/]|$)")

# "\\server\share" or "//server/share", with both parts present.
_UNC = re.compile(r"^(\\\\|//)[^\\/]+[\\/][^\\/]+")

# Folders whose children are each a separate volume: macOS's mounted drives,
# and where Linux desktops and fstab conventions mount theirs. "*" is one
# segment of any name — a user, for the desktop mounts.
_VOLUME_PARENTS: Tuple[Tuple[str, ...], ...] = (
    ("Volumes",),
    ("media", "*"),
    ("run", "media", "*"),
    ("mnt",),
)


# ---------------------------------------------------------------------------
# Paths and roots
# ---------------------------------------------------------------------------


def _is_windows_path(path: str) -> bool:
    return bool(_DRIVE.match(path) or _UNC.match(path))


def path_root(path: str) -> Optional[str]:
    """Return the drive, share or volume a path is on, or None for no place.

    Decided from the path's own shape, never from the platform running the
    engine: the database is one file a user may copy between machines
    (``location_to_path`` makes the same choice), and a Windows library read
    on a Mac should say its drive is not connected rather than guess.

    - ``E:\\Music\\a.mp3`` and ``E:/Music/a.mp3`` → ``E:\\``
    - ``\\\\nas\\music\\a.mp3`` → ``\\\\nas\\music\\``
    - ``/Volumes/USB/a.mp3`` → ``/Volumes/USB``; ``/media/stu/USB/a.mp3`` →
      ``/media/stu/USB``; ``/mnt/music/a.mp3`` → ``/mnt/music``
    - any other absolute POSIX path → ``/``, which always exists
    - a relative path, or nothing → None
    """
    text = path or ""
    if _is_windows_path(text):
        drive, _ = ntpath.splitdrive(text)
        return ntpath.normpath(drive + "\\")
    if not text.startswith("/"):
        return None
    parts = [part for part in text.split("/") if part]
    for parent in _VOLUME_PARENTS:
        depth = len(parent)
        # A volume's name and something on it: "/media/USB/a.mp3" is not a
        # desktop mount (that has a user segment), and its root is not the file.
        if len(parts) > depth + 1 and all(
            wanted in ("*", part) for wanted, part in zip(parent, parts)
        ):
            return "/" + "/".join(parts[: depth + 1])
    return "/"


def root_available(root: str) -> bool:
    """Return whether a root is there to hold files.

    A root that refuses to be looked at is there: its files answer for
    themselves, as unreadable. Anything else that fails — not found, a share
    that does not answer, a name the system will not accept — is not.
    """
    try:
        os.stat(root)
    except PermissionError:
        return True
    except (OSError, ValueError):
        return False
    return True


def check_file(path: str) -> Tuple[str, Optional[int]]:
    """Look at one path: ``stat`` it, then open it for reading.

    Returns:
        ``(status, size)``, where size is set only for a present file.
    """
    try:
        info = os.stat(path)
    except PermissionError:
        # Something on the way refused. There may well be a file, and what
        # would fix it is permission, not Rekordbox's Relocate.
        return FILE_UNREADABLE, None
    except (OSError, ValueError):
        return FILE_MISSING, None
    if not stat.S_ISREG(info.st_mode):
        return FILE_UNREADABLE, None
    if not is_readable(Path(path)):
        return FILE_UNREADABLE, None
    return FILE_PRESENT, int(info.st_size)


def nearest_existing_folder(path: str) -> Optional[str]:
    """Return the closest folder on a file's path that exists, or None.

    What "show in folder" opens for a file that is not where Rekordbox says:
    its own folder when that is still there, otherwise the nearest one above
    it. The walk stops at the path's root (see :func:`path_root`). When the
    drive itself is gone, None says plainly that nothing on the path exists,
    rather than offering ``/Volumes`` for an unplugged disk. The bare POSIX
    ``/`` is never offered either: every absolute path is under it, so it says
    nothing about this one.
    """
    root = path_root(path or "")
    if root is None:
        return None
    flavour: Any = ntpath if _is_windows_path(path) else posixpath
    root = flavour.normpath(root)
    current = flavour.dirname(flavour.normpath(path))
    while True:
        if current != "/" and os.path.isdir(current):
            return str(current)
        if current == root or len(current) <= len(root):
            return None
        parent = flavour.dirname(current)
        if parent == current:
            return None
        current = parent


def describe_unavailable(root: str, tracks: int) -> str:
    """The one line an unavailable root is reported as."""
    what = (
        "the network location cannot be reached"
        if _UNC.match(root)
        else "the drive is not connected"
    )
    return f"{_count(tracks, 'track')} on {root} — {what}"


def _count(number: int, noun: str) -> str:
    return f"{number:,} {noun}{'' if number == 1 else 's'}"


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class UnavailableRoot:
    """A root a check found missing, and how many tracks it holds."""

    root: str
    tracks: int

    @property
    def summary(self) -> str:
        """The finding, as the activity feed shows it."""
        return describe_unavailable(self.root, self.tracks)

    def to_dict(self) -> Dict[str, Any]:
        return {"root": self.root, "tracks": self.tracks, "summary": self.summary}


@dataclass(frozen=True)
class FileCheckResult:
    """What one check found, in counts.

    Attributes:
        trigger: One of :data:`TRIGGERS`.
        total: The tracks the check was asked about.
        present, missing, unreadable: Files found each way. ``missing``
            includes the tracks on unavailable roots.
        no_path: Tracks Rekordbox gave no location, so there was nothing to
            check. They keep no row and read as not checked.
        vanished: Tracks that left the library before their row was written.
        cancelled: Whether a cancel stopped it before the end.
        unavailable: The roots found missing, by root.
        duration_seconds: How long it took.
    """

    trigger: str
    total: int
    present: int = 0
    missing: int = 0
    unreadable: int = 0
    no_path: int = 0
    vanished: int = 0
    cancelled: bool = False
    unavailable: Tuple[UnavailableRoot, ...] = ()
    duration_seconds: float = 0.0

    def __post_init__(self) -> None:
        """Hold the counts to what a check can produce."""
        if self.trigger not in TRIGGERS:
            raise ValueError(f"trigger must be one of {TRIGGERS}, got {self.trigger!r}")
        counts = (
            self.total,
            self.present,
            self.missing,
            self.unreadable,
            self.no_path,
            self.vanished,
        )
        if any(count < 0 for count in counts):
            raise ValueError("A file check cannot count below zero")
        if self.completed > self.total:
            raise ValueError(
                f"A file check of {self.total} tracks cannot finish {self.completed}"
            )
        if not self.cancelled and self.completed != self.total:
            raise ValueError(
                f"A file check that was not cancelled finishes all {self.total} tracks,"
                f" not {self.completed}"
            )
        if sum(root.tracks for root in self.unavailable) > self.missing:
            raise ValueError("Tracks on an unavailable root are missing tracks")

    @property
    def checked(self) -> int:
        """Files looked at, or accounted for by their root."""
        return self.present + self.missing + self.unreadable

    @property
    def completed(self) -> int:
        """Tracks the check got through, whatever it found."""
        return self.checked + self.no_path + self.vanished

    def summary_line(self) -> str:
        """The activity feed's sentence for the whole check."""
        found = [f"{self.present:,} present", f"{self.missing:,} missing"]
        if self.unreadable:
            found.append(f"{self.unreadable:,} unreadable")
        if self.cancelled:
            head = (
                f"Stopped after {self.completed:,} of {_count(self.total, 'track')},"
                f" having checked {_count(self.checked, 'file')}"
            )
        else:
            head = f"Checked {_count(self.checked, 'file')}"
        line = f"{head}: {', '.join(found)}"
        if self.no_path:
            have = "has" if self.no_path == 1 else "have"
            line += f". {_count(self.no_path, 'track')} {have} no file location"
        if self.vanished:
            line += (
                f". {_count(self.vanished, 'track')} left the library during the check"
            )
        return line

    def to_dict(self) -> Dict[str, Any]:
        """The job's answer. A public shape; extend rather than rename."""
        return {
            "trigger": self.trigger,
            "total": self.total,
            "completed": self.completed,
            "checked": self.checked,
            "present": self.present,
            "missing": self.missing,
            "unreadable": self.unreadable,
            "no_path": self.no_path,
            "vanished": self.vanished,
            "cancelled": self.cancelled,
            "unavailable": [root.to_dict() for root in self.unavailable],
            "duration_seconds": round(self.duration_seconds, 3),
            "summary_line": self.summary_line(),
        }


@dataclass
class _Tally:
    present: int = 0
    missing: int = 0
    unreadable: int = 0
    no_path: int = 0
    vanished: int = 0
    unavailable: Dict[str, int] = dataclasses.field(default_factory=dict)

    def add(self, check: TrackFileStatus, root: Optional[str]) -> None:
        if check.status == FILE_PRESENT:
            self.present += 1
        elif check.status == FILE_UNREADABLE:
            self.unreadable += 1
        else:
            self.missing += 1
            if check.reason == REASON_ROOT_UNAVAILABLE and root is not None:
                self.unavailable[root] = self.unavailable.get(root, 0) + 1


# ---------------------------------------------------------------------------
# The service
# ---------------------------------------------------------------------------


class FileCheckService(IFileCheckService):
    """Checks tracks' files and records what it found."""

    def __init__(
        self,
        file_status_repository: IFileStatusRepository,
        batch_service: IBatchService,
        activity_service: Optional[IActivityService],
        database_service: IDatabaseService,
        *,
        checker: FileChecker = check_file,
        probe: RootProbe = root_available,
        clock: Callable[[], str] = utc_now_iso,
        workers: int = FILE_CHECK_WORKERS,
    ) -> None:
        """Store collaborators.

        ``checker``, ``probe`` and ``clock`` are the three places a check meets
        the world. They default to the real filesystem and the real time, and
        exist as arguments so a test can count what a check touched.
        ``checker`` is called from worker threads; the other two never are.

        Raises:
            ValueError: If ``workers`` is below one.
        """
        if int(workers) < 1:
            raise ValueError(f"A file check needs at least one worker, not {workers}")
        self._files = file_status_repository
        self._batch = batch_service
        self._activity = activity_service
        self._db = database_service
        self._check_path = checker
        self._probe = probe
        self._clock = clock
        self._workers = int(workers)

    def resolve(self, selection: BatchSelection) -> List[int]:
        """Return the library tracks a selection names.

        Raises:
            ValueError: If it names none — nothing at all, or only tracks a
                refresh has since removed.
            BrowseQueryError: If a query selection cannot be built.
        """
        try:
            named = self._batch.resolve(selection)
        except BrowseQueryError:
            raise
        except ValueError:
            raise ValueError(NOTHING_TO_CHECK) from None
        found = self._files.existing(named)
        if not found:
            raise ValueError(NOTHING_TO_CHECK)
        return found

    def library(self) -> List[int]:
        """Return every library track, which may be none."""
        return self._files.library_ids()

    def check(
        self,
        track_ids: Sequence[int],
        *,
        trigger: str = TRIGGER_REQUEST,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> FileCheckResult:
        """Check each track's file, and record and report what was found.

        Args:
            track_ids: The tracks to check. Ids that are not tracks count as
                vanished, which is what they are by the time this runs.
            trigger: What started the check, for its event.
            on_progress: Called with (completed, total) before the first track
                and as every track settles.
            should_cancel: Asked before every new look at a file. What was
                looked at before it said yes is committed and counted.

        Raises:
            ValueError: If ``trigger`` is not one of :data:`TRIGGERS`.
        """
        if trigger not in TRIGGERS:
            raise ValueError(f"trigger must be one of {TRIGGERS}, got {trigger!r}")
        started = time.monotonic()
        wanted = unique_ids(track_ids)
        total = len(wanted)
        located = sorted(self._files.paths(wanted), key=lambda item: item[1])
        tally = _Tally(vanished=total - len(located))
        roots: Dict[str, bool] = {}
        progress = _Progress(on_progress, tally.vanished, total)
        cancelled = False
        progress.report()

        with ThreadPoolExecutor(
            max_workers=self._workers, thread_name_prefix="file-check"
        ) as pool:
            for start in range(0, len(located), FILE_CHECK_CHUNK_SIZE):
                checks, roots_of, cancelled = self._check_chunk(
                    located[start : start + FILE_CHECK_CHUNK_SIZE],
                    roots,
                    pool,
                    tally,
                    progress,
                    should_cancel,
                )
                checks = self._explain_misses(checks, roots_of, roots)
                written = self._commit(checks)
                for check, root in zip(checks, roots_of):
                    if check.track_id in written:
                        tally.add(check, root)
                    else:
                        tally.vanished += 1
                if cancelled:
                    break

        result = FileCheckResult(
            trigger=trigger,
            total=total,
            present=tally.present,
            missing=tally.missing,
            unreadable=tally.unreadable,
            no_path=tally.no_path,
            vanished=tally.vanished,
            cancelled=cancelled,
            unavailable=tuple(
                UnavailableRoot(root, tracks)
                for root, tracks in sorted(tally.unavailable.items())
            ),
            duration_seconds=time.monotonic() - started,
        )
        _logger.info("[files] %s (%s)", result.summary_line(), trigger)
        self._record_activity(result)
        return result

    # --------------------------------------------------------------- helpers

    def _check_chunk(
        self,
        chunk: Sequence[Tuple[int, str]],
        roots: Dict[str, bool],
        pool: ThreadPoolExecutor,
        tally: _Tally,
        progress: _Progress,
        should_cancel: Optional[Callable[[], bool]],
    ) -> Tuple[List[TrackFileStatus], List[Optional[str]], bool]:
        """Check one chunk's tracks, looking at their files on the pool.

        This thread decides everything that has an order: each root is asked
        about once, the cancel is asked before each new look, and every answer
        is put back against its own track. The pool only looks. At most one
        look per worker is in flight, so a cancelled check finishes the looks
        already started and starts no more.

        Returns:
            The checks in chunk order, the root of each, and whether a cancel
            stopped the chunk.
        """
        found: Dict[int, Tuple[TrackFileStatus, Optional[str]]] = {}
        in_flight: Dict[
            Future[Tuple[str, Optional[int]]], Tuple[int, int, str, str]
        ] = {}

        def settle_one() -> None:
            finished, _ = wait(list(in_flight), return_when=FIRST_COMPLETED)
            for future in finished:
                index, track_id, path, root = in_flight.pop(future)
                status, size = future.result()
                found[index] = (
                    TrackFileStatus(
                        track_id,
                        status,
                        path,
                        self._clock(),
                        size_bytes=size if status == FILE_PRESENT else None,
                    ),
                    root,
                )
                progress.advance()

        cancelled = False
        for index, (track_id, path) in enumerate(chunk):
            while len(in_flight) >= self._workers:
                settle_one()
            if should_cancel is not None and should_cancel():
                cancelled = True
                break
            if not path.strip():
                tally.no_path += 1
                progress.advance()
                continue
            root = path_root(path)
            if root is None:
                # A relative path names no place. Resolving it against wherever
                # the engine happens to run would find the wrong file or none.
                found[index] = (
                    TrackFileStatus(track_id, FILE_MISSING, path, self._clock()),
                    None,
                )
                progress.advance()
                continue
            available = roots.get(root)
            if available is None:
                available = roots[root] = self._probe(root)
            if not available:
                found[index] = (
                    TrackFileStatus(
                        track_id,
                        FILE_MISSING,
                        path,
                        self._clock(),
                        reason=REASON_ROOT_UNAVAILABLE,
                    ),
                    root,
                )
                progress.advance()
                continue
            in_flight[pool.submit(self._check_path, path)] = (
                index,
                track_id,
                path,
                root,
            )
        while in_flight:
            settle_one()

        ordered = [found[index] for index in sorted(found)]
        return [check for check, _ in ordered], [root for _, root in ordered], cancelled

    def _commit(self, checks: Sequence[TrackFileStatus]) -> Set[int]:
        """Write one chunk in one transaction, waiting out another job's write.

        A check runs beside imports and refreshes (see the engine module), and
        a 50,000-track import holds the write lock for longer than SQLite's busy
        timeout. A chunk that finds the database busy has written nothing, so it
        is tried again, for up to :data:`DATABASE_BUSY_PATIENCE_SECONDS`. Any
        other failure is raised at once, and so is a wait that runs out.
        """
        # The constants are read here, at the call, so a test can shorten them.
        return write_waiting(
            self._db,
            lambda: self._files.record(checks),
            patience_seconds=DATABASE_BUSY_PATIENCE_SECONDS,
            interval_seconds=_BUSY_RETRY_INTERVAL_SECONDS,
            on_wait=lambda: _logger.info(
                "[files] the library is busy; waiting to save %d checks", len(checks)
            ),
        )

    def _explain_misses(
        self,
        checks: List[TrackFileStatus],
        roots_of: Sequence[Optional[str]],
        roots: Dict[str, bool],
    ) -> List[TrackFileStatus]:
        """Ask again about each root this chunk missed files on.

        A root that has gone since it was first asked about — a drive unplugged
        during the check — explains this chunk's misses under it, and the rest
        of the check does not look under it again.
        """
        missed: Dict[str, List[int]] = {}
        for index, (check, root) in enumerate(zip(checks, roots_of)):
            if (
                root is not None
                and check.status == FILE_MISSING
                and check.reason is None
            ):
                missed.setdefault(root, []).append(index)
        explained = list(checks)
        for root, indexes in missed.items():
            if self._probe(root):
                continue
            roots[root] = False
            for index in indexes:
                explained[index] = dataclasses.replace(
                    explained[index], reason=REASON_ROOT_UNAVAILABLE
                )
        return explained

    def _record_activity(self, result: FileCheckResult) -> None:
        """Record the check and each unavailable root, or quietly do nothing.

        Best-effort, as an import's event is: the rows are committed, and a
        feed that cannot be written must not turn a check into a failure. A
        check of nothing — an import of an empty collection — records nothing.
        The roots are recorded after the check, so a feed read newest first
        puts the finding a user has to act on above the counts.
        """
        if self._activity is None or result.total == 0:
            return
        unavailable_tracks = sum(root.tracks for root in result.unavailable)
        try:
            self._activity.record_event(
                EVENT_FILES_CHECKED,
                result.summary_line(),
                {
                    "trigger": result.trigger,
                    "total": result.total,
                    "present": result.present,
                    "missing": result.missing,
                    "unreadable": result.unreadable,
                    "unavailable": unavailable_tracks,
                    "no_path": result.no_path,
                    "vanished": result.vanished,
                    "cancelled": result.cancelled,
                    "duration_seconds": round(result.duration_seconds, 3),
                },
            )
            for root in result.unavailable:
                self._activity.record_event(
                    EVENT_ROOT_UNAVAILABLE,
                    root.summary,
                    {
                        "root": root.root,
                        "tracks": root.tracks,
                        "trigger": result.trigger,
                    },
                )
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug("[activity] could not record the file check: %s", exc)


class _Progress:
    """Tracks a check has got through, reported as each one settles."""

    def __init__(
        self,
        callback: Optional[Callable[[int, int], None]],
        completed: int,
        total: int,
    ) -> None:
        self._callback = callback
        self.completed = completed
        self.total = total

    def advance(self) -> None:
        self.completed += 1
        self.report()

    def report(self) -> None:
        if self._callback is not None:
            self._callback(self.completed, self.total)


__all__: Sequence[str] = (
    "DATABASE_BUSY_PATIENCE_SECONDS",
    "EVENT_FILES_CHECKED",
    "EVENT_ROOT_UNAVAILABLE",
    "FILE_CHECK_CHUNK_SIZE",
    "FILE_CHECK_WORKERS",
    "FileCheckResult",
    "FileCheckService",
    "NOTHING_TO_CHECK",
    "TRIGGERS",
    "TRIGGER_IMPORT",
    "TRIGGER_REFRESH",
    "TRIGGER_REQUEST",
    "UnavailableRoot",
    "check_file",
    "database_busy",
    "describe_unavailable",
    "nearest_existing_folder",
    "path_root",
    "root_available",
)
