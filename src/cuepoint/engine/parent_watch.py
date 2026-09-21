#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine ends when the app that started it has gone.

The desktop shell stops the engine as it quits, and on Windows stops the whole
process tree, because the packaged engine is a PyInstaller bootloader whose
child outlives it (CLEAN-14). That covers a quit the shell gets to finish. It
cannot cover a shell that is killed — a crash, End Task, a test harness closing
it — or one whose quit finishes before its cleanup does; each of those left an
engine running, listening on its port and holding the library database, with
nothing left that could ever talk to it. One was found that way in EXPORT-07's
packaged runs.

So the engine watches for itself. The shell passes its own process id as
``CUEPOINT_PARENT_PID`` — its own, not the engine's parent's, which in a
packaged build is the bootloader — and when that process has gone the engine
stops serving and exits. Without the variable nothing is watched, so the CLI,
the tests and a hand-started engine behave as they always have.

On Windows the process is held by a handle opened at start and waited on, so a
process id reused by some later process cannot be mistaken for the shell.
Elsewhere the id is polled; reuse within the poll interval is not a concern at
the rate process ids cycle.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
from typing import Callable, Mapping, Optional

_logger = logging.getLogger(__name__)

#: The environment variable the shell sets to its own process id.
PARENT_PID_ENV = "CUEPOINT_PARENT_PID"

#: How often the parent is looked for.
POLL_SECONDS = 1.0

_SYNCHRONIZE = 0x00100000
_WAIT_OBJECT_0 = 0x00000000


def parent_pid_from_env(environ: Mapping[str, str]) -> Optional[int]:
    """The process id to watch, or ``None`` when there is none to watch.

    Anything that is not a positive integer is ignored rather than refused: an
    engine that will not start over a malformed variable is worse than one that
    does not watch.
    """
    raw = (environ.get(PARENT_PID_ENV) or "").strip()
    if not (raw.isascii() and raw.isdigit()):
        return None
    pid = int(raw)
    return pid if pid > 0 else None


class _WindowsProcess:
    """A process held by a handle, so its id cannot be reused under us."""

    def __init__(self, pid: int) -> None:
        import ctypes
        from ctypes import wintypes

        # Looked up rather than named: ``WinDLL`` exists only on Windows, and the
        # type check runs everywhere.
        self._kernel32 = getattr(ctypes, "WinDLL")("kernel32", use_last_error=True)
        self._kernel32.OpenProcess.restype = wintypes.HANDLE
        self._kernel32.OpenProcess.argtypes = [
            wintypes.DWORD,
            wintypes.BOOL,
            wintypes.DWORD,
        ]
        self._kernel32.WaitForSingleObject.restype = wintypes.DWORD
        self._kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        self._kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        self._handle = self._kernel32.OpenProcess(_SYNCHRONIZE, False, pid)

    @property
    def opened(self) -> bool:
        return bool(self._handle)

    def wait(self, seconds: float) -> bool:
        """Wait up to ``seconds``; True once the process has ended."""
        if not self._handle:
            return True
        result = self._kernel32.WaitForSingleObject(self._handle, int(seconds * 1000))
        return bool(result == _WAIT_OBJECT_0)

    def close(self) -> None:
        if self._handle:
            self._kernel32.CloseHandle(self._handle)
            self._handle = None


def is_alive(pid: int) -> bool:
    """True while a process with this id exists.

    Never ``os.kill(pid, 0)`` on Windows: there it terminates the process with
    exit code 0 rather than asking whether it exists.
    """
    if sys.platform == "win32":
        process = _WindowsProcess(pid)
        try:
            return process.opened and not process.wait(0)
        finally:
            process.close()
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # It exists; it is simply not ours to signal.
        return True
    return True


def watch_parent(
    pid: int,
    on_gone: Callable[[], None],
    *,
    poll_seconds: float = POLL_SECONDS,
) -> threading.Thread:
    """Call ``on_gone`` once, from a daemon thread, when ``pid`` has ended.

    A process that is already gone, or cannot be opened at all, counts as gone:
    an engine whose shell cannot be found has nobody to serve.
    """
    process = _WindowsProcess(pid) if sys.platform == "win32" else None

    def run() -> None:
        try:
            if process is not None:
                while not process.wait(poll_seconds):
                    pass
            else:
                stop = threading.Event()
                while is_alive(pid):
                    stop.wait(poll_seconds)
        finally:
            if process is not None:
                process.close()
        _logger.warning(
            "[engine] the app that started it (pid %s) has gone; stopping", pid
        )
        on_gone()

    thread = threading.Thread(target=run, name="cuepoint-parent-watch", daemon=True)
    thread.start()
    return thread


__all__ = [
    "PARENT_PID_ENV",
    "POLL_SECONDS",
    "is_alive",
    "parent_pid_from_env",
    "watch_parent",
]
