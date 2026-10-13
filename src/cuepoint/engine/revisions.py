#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Engine revisions and the revision-keyed memo (C19b).

A *revision* says "the data behind this domain may have changed". There are two
domains: ``library`` (``cuepoint.db``) and ``waveforms`` (``waveforms.db``).

Each is read from ``PRAGMA data_version`` on a connection of its own that only
ever reads. SQLite bumps that number when *another* connection commits, so one
dedicated connection sees every write there is: a route's, a job's, a match job
writing mid-run. Reading it costs microseconds. The library's revision also
folds in ``DatabaseService.generation``, so a restore (which closes every
connection and replaces the file) counts as a change, and the file's identity,
so a replaced file reopens the connection. Before the persistence layer moves or
deletes either file (a restore, a set-aside waveform store) it calls
``file_watchers.release``, which closes the connection (Windows will not move a
file that is open); the next look reopens it and counts as a change.

A domain that cannot be watched (no library file, a path SQLite will not open)
reports its last number unchanged, moves it once when it stops or starts being
watchable, and nothing that depends on it is kept. A look that merely failed
(busy for more than 0.2 s) is unknown: not kept, not counted.

A revision is an opaque integer that only goes up: a new number means "look
again", and nothing else about it may be read.

:func:`revision_cache` keeps the last answer to a read while the revisions of
the domains it depends on are unchanged, with a ceiling on its age. It is for
reads that are a pure function of those two databases. A read that also depends
on the clock, a config file or the file system must put that input into its
key, or not be cached.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Callable, Dict, Hashable, Optional, Sequence, Tuple, TypeVar
from urllib.request import pathname2url

from cuepoint.persistence import file_watchers

_logger = logging.getLogger(__name__)

T = TypeVar("T")

LIBRARY = "library"
WAVEFORMS = "waveforms"
DOMAINS: Tuple[str, ...] = (LIBRARY, WAVEFORMS)

#: How long an answer is kept when nothing has changed: a ceiling, not a timer.
CEILING_SECONDS = 600.0

#: The most answers kept; the least recently used goes first.
MAX_ENTRIES = 64

#: What a watch says about a file: its path, the generation, the file's identity
#: and ``data_version``. Any difference from the last look is a change.
_State = Tuple[Hashable, ...]

_Key = Tuple[str, str, Tuple[str, ...]]
_Entry = Tuple[Tuple[int, ...], float, Any]


#: A watch that could not read this time (busy, locked): neither watchable nor
#: unwatchable, so nothing is cached and nothing is bumped.
_UNKNOWN: Any = object()

#: How long a look waits on a busy database before calling the read unknown.
BUSY_TIMEOUT = 0.2


def _readonly_uri(path: Path) -> str:
    """``file:`` URI opening ``path`` read-only, for drive-letter and UNC paths."""
    absolute = path.resolve()
    try:
        base = absolute.as_uri()
    except ValueError:
        base = "file:" + pathname2url(str(absolute))
    return f"{base}?mode=ro"


class _Watch:
    """One database file and the read-only connection that watches it."""

    def __init__(
        self,
        locate: Callable[[], Optional[Path]],
        generation: Callable[[], int],
        *,
        absent_is_unknown: bool,
    ) -> None:
        self._locate = locate
        self._generation = generation
        self._absent_is_unknown = absent_is_unknown
        self.lock = threading.Lock()
        self._connection: Optional[sqlite3.Connection] = None
        self._opened_for: Optional[Tuple[str, int, int, int]] = None
        self._opened_path: Optional[Path] = None
        #: Moves when the file was released, so the next look reads as a change.
        self._epoch = 0

    def _close(self) -> None:
        connection, self._connection, self._opened_for = self._connection, None, None
        self._opened_path = None
        if connection is not None:
            try:
                connection.close()
            except sqlite3.Error:
                pass

    def close(self) -> None:
        with self.lock:
            self._close()

    def release(self, path: Path) -> None:
        """Let go of the file if this watch has it open (it is about to move)."""
        with self.lock:
            opened = self._opened_path
            if opened is None:
                return
            try:
                same = opened == path or opened.resolve() == path.resolve()
            except OSError:
                same = opened == path
            if same:
                self._close()
                self._epoch += 1

    def state(self) -> Any:
        """The file's state now; ``None`` if it cannot be watched, ``_UNKNOWN`` if
        it could not be read this time."""
        with self.lock:
            return self._state()

    def _state(self) -> Any:
        try:
            path = self._locate()
            generation = int(self._generation())
        except Exception:  # noqa: BLE001 — services not built yet: unwatchable
            self._close()
            return None
        if path is None:
            self._close()
            return None
        try:
            found = os.stat(path)
        except OSError:
            self._close()
            # A waveform store that does not exist yet is a state; becoming a
            # file changes it. A library that is not a file (``:memory:``)
            # cannot be watched, so nothing about it may be cached.
            if self._absent_is_unknown:
                return None
            return (str(path), generation, self._epoch, 0)
        identity = (str(path), generation, found.st_dev, found.st_ino)
        if self._connection is None or self._opened_for != identity:
            self._close()
            try:
                connection = sqlite3.connect(
                    _readonly_uri(path),
                    uri=True,
                    check_same_thread=False,
                    timeout=BUSY_TIMEOUT,
                )
            except (sqlite3.Error, OSError, ValueError) as exc:
                _logger.debug("[revisions] cannot watch %s: %s", path, exc)
                return None
            self._connection, self._opened_for = connection, identity
            self._opened_path = path
        try:
            row = self._connection.execute("PRAGMA data_version").fetchone()
        except sqlite3.Error as exc:
            _logger.debug("[revisions] data_version of %s: %s", path, exc)
            self._close()
            return _UNKNOWN
        return (*identity, self._epoch, int(row[0]))


class Revisions:
    """The revision of each domain, read from its dedicated connection."""

    def __init__(self, watches: Dict[str, _Watch]) -> None:
        self._watches = watches
        self._counter_lock = threading.Lock()
        self._counter = 0
        self._seen: Dict[str, Optional[_State]] = {name: None for name in watches}
        self._numbers: Dict[str, int] = {name: 0 for name in watches}
        # A file about to be moved must be let go of (Windows keeps it locked).
        file_watchers.register(self._release)

    @classmethod
    def for_files(
        cls,
        library: Callable[[], Optional[Path]],
        waveforms: Callable[[], Optional[Path]],
        generation: Callable[[], int] = lambda: 0,
    ) -> "Revisions":
        """Watch the files ``library`` and ``waveforms`` name, asked on every look."""
        return cls(
            {
                LIBRARY: _Watch(library, generation, absent_is_unknown=True),
                WAVEFORMS: _Watch(waveforms, generation, absent_is_unknown=False),
            }
        )

    def _release(self, path: Path) -> None:
        for watch in self._watches.values():
            watch.release(path)

    def _next(self) -> int:
        with self._counter_lock:
            self._counter += 1
            return self._counter

    def _look(self, domain: str) -> Tuple[int, bool]:
        """``(number, known)``: the domain's revision and whether it is cacheable.

        An unwatchable domain keeps its number, and moves it once when it stops
        or starts being watchable; a read that failed this time moves nothing.
        """
        watch = self._watches[domain]
        with watch.lock:
            state = watch._state()  # noqa: SLF001 — one lock covers look and books
            if state is _UNKNOWN:
                return self._numbers[domain], False
            if state is None:
                if self._seen[domain] is not None:
                    self._seen[domain] = None
                    self._numbers[domain] = self._next()
                return self._numbers[domain], False
            if state != self._seen[domain]:
                self._seen[domain] = state
                self._numbers[domain] = self._next()
            return self._numbers[domain], True

    def revision(self, domain: str) -> Optional[int]:
        """The domain's revision, or ``None`` when it cannot be relied on."""
        number, known = self._look(domain)
        return number if known else None

    def revisions(self, domains: Sequence[str]) -> Optional[Tuple[int, ...]]:
        """The revisions of ``domains`` in order, or ``None`` if any is unknown."""
        found = [self._look(domain) for domain in domains]
        if all(known for _, known in found):
            return tuple(number for number, _ in found)
        return None

    def snapshot(self) -> Dict[str, int]:
        """Every domain's revision, for ``GET /api/v1/jobs``.

        A domain that cannot be watched reports its last number unchanged (it
        moves once when the domain stops or starts being watchable), so a
        client polling it does not refetch for nothing.
        """
        return {domain: self._look(domain)[0] for domain in self._watches}

    def close(self) -> None:
        file_watchers.unregister(self._release)
        for watch in self._watches.values():
            watch.close()


def _database() -> Any:
    from cuepoint.services.interfaces import IDatabaseService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IDatabaseService)


def _library_file() -> Optional[Path]:
    return Path(_database().db_path)


def _waveform_file() -> Optional[Path]:
    from cuepoint.persistence.waveform_store import default_waveform_store_path

    return default_waveform_store_path(_database().db_path)


def _generation() -> int:
    return int(getattr(_database(), "generation", 0))


def _canonical(params_key: Any) -> str:
    """The whole parameter set as one string, sorted, so order cannot matter."""
    if isinstance(params_key, str):
        return params_key
    return json.dumps(params_key, sort_keys=True, default=str, separators=(",", ":"))


class RevisionMemo:
    """The last answer of each read, kept while its domains' revisions hold."""

    def __init__(
        self,
        revisions: Revisions,
        *,
        clock: Callable[[], float] = time.monotonic,
        ceiling: float = CEILING_SECONDS,
        max_entries: int = MAX_ENTRIES,
    ) -> None:
        self._revisions = revisions
        self._clock = clock
        self._ceiling = float(ceiling)
        self._max = int(max_entries)
        self._lock = threading.Lock()
        self._entries: "OrderedDict[_Key, _Entry]" = OrderedDict()
        self.enabled = True

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def get(
        self,
        route: str,
        params_key: Any,
        domains: Sequence[str],
        compute: Callable[[], T],
    ) -> T:
        """Return ``compute()``, or its last result if nothing it reads has changed.

        An exception from ``compute`` is raised and never kept. The answer is
        stored under the revisions read *before* computing, so a write that
        lands during the computation leaves it stale at once. The kept answer is
        handed out as it is: callers only serialise it.
        """
        if not self.enabled:
            return compute()
        names = tuple(domains)
        revisions = self._revisions.revisions(names)
        if revisions is None:
            return compute()
        key: _Key = (route, _canonical(params_key), names)
        now = self._clock()
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None:
                if entry[0] == revisions and now - entry[1] < self._ceiling:
                    self._entries.move_to_end(key)
                    # Shared, not copied: the caller must never mutate it.
                    return entry[2]  # type: ignore[no-any-return]
                del self._entries[key]
        value = compute()
        with self._lock:
            self._entries[key] = (revisions, now, value)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max:
                self._entries.popitem(last=False)
        return value


_default_revisions = Revisions.for_files(_library_file, _waveform_file, _generation)
_default_memo = RevisionMemo(_default_revisions)


def current_revisions() -> Dict[str, int]:
    """``{library, waveforms}`` as ``GET /api/v1/jobs`` reports them."""
    try:
        return _default_revisions.snapshot()
    except Exception:  # noqa: BLE001 — a list of jobs never fails for this
        return {LIBRARY: 0, WAVEFORMS: 0}


def revision_cache(
    route: str, params_key: Any, domains: Sequence[str], compute: Callable[[], T]
) -> T:
    """Answer ``compute()`` from the process's memo; see :class:`RevisionMemo`.

    ``route`` and the *whole* parameter set (``params_key``, a dict or a string)
    are the key, so two different questions never share an answer.

    The returned value is shared with the memo and with every other caller of
    the same question: it must be serialised only, never mutated.
    """
    return _default_memo.get(route, params_key, domains, compute)


def set_enabled(enabled: bool) -> None:
    """Turn the process's memo on or off (off: every read computes)."""
    _default_memo.enabled = bool(enabled)


def clear_cache() -> None:
    """Forget every kept answer."""
    _default_memo.clear()


__all__ = (
    "CEILING_SECONDS",
    "DOMAINS",
    "LIBRARY",
    "WAVEFORMS",
    "RevisionMemo",
    "Revisions",
    "clear_cache",
    "current_revisions",
    "revision_cache",
    "set_enabled",
)
