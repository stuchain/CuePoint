#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A stall watchdog for the engine process (Sentry ELECTRON-3).

The app's heartbeat once killed an engine that had stopped answering ``/health``
altogether, and nothing was left to say why: one C call holding the GIL and a
suspended process look the same from outside. This leaves a stack behind for the
next one.

``faulthandler.dump_traceback_later(timeout, repeat=True)`` runs on its own C
thread, needs no GIL, and writes every Python thread's stack to a file. Left alone
it would dump every ``timeout`` seconds whatever the engine was doing, so a light
daemon thread (the ticker) cancels and re-arms it every ``rearm_seconds``. While
the interpreter is responsive the timer never expires. When the ticker has not run
for ``timeout_seconds`` (the GIL is held by something that does not return, or the
process was suspended) the dump is written, and again each ``timeout`` until the
process is killed. A suspended process that is resumed dumps once, which is noise
with a timestamp: the ``armed`` line below says when the ticker last ran.

The file (``engine-stall.txt``) is opened once at start, truncated, and kept open
for the life of the process. It holds at most one ``armed <iso time> [<token>]`` line (kept
rewritten by the ticker, after any dump already there) plus the dumps; once it
passes :data:`MAX_FILE_BYTES` it starts again. The app reads it when it kills an
engine and sends it with the incident, scrubbed like the engine's output.

Nothing here may stop the engine: every failure is swallowed.
"""

from __future__ import annotations

import faulthandler
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

_logger = logging.getLogger(__name__)

#: The shell sets this to the file it will read; without it the engine's logs folder is used.
STALL_FILE_ENV = "CUEPOINT_STALL_FILE"

#: The file's name in the logs folder.
STALL_FILE_NAME = "engine-stall.txt"

#: The shell sets this to a mark for this launch, written on the ``armed`` line, so it can tell
#: this engine's dump from one an older engine still holding the file writes.
STALL_TOKEN_ENV = "CUEPOINT_STALL_TOKEN"

#: No ticker run for this long dumps every thread's stack. The app's heartbeat kills an engine
#: about 60 s after its first missed probe (three 10 s timeouts, 15 s apart), so 40 s (plus at
#: most one re-arm interval) lands the dump before that kill.
STALL_TIMEOUT_SECONDS = 40.0

#: How often the ticker re-arms the timer while the interpreter is responsive.
REARM_SECONDS = 5.0

#: The file is started again once it grows past this.
MAX_FILE_BYTES = 256 * 1024


def stall_file_path(environ: Optional[Mapping[str, str]] = None) -> Optional[Path]:
    """Where the dump goes: ``CUEPOINT_STALL_FILE``, else ``<logs dir>/engine-stall.txt``; None if unknown."""
    env = os.environ if environ is None else environ
    given = (env.get(STALL_FILE_ENV) or "").strip()
    try:
        if given:
            return Path(given)
        from cuepoint.utils.paths import AppPaths

        return AppPaths.logs_dir() / STALL_FILE_NAME
    except Exception:
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class StallWatchdog:
    """Owns the open file, the faulthandler timer and the ticker that keeps the timer from firing."""

    def __init__(
        self,
        path: Path,
        timeout_seconds: float = STALL_TIMEOUT_SECONDS,
        rearm_seconds: float = REARM_SECONDS,
        max_bytes: int = MAX_FILE_BYTES,
    ) -> None:
        self.path = path
        self.timeout_seconds = timeout_seconds
        self.rearm_seconds = rearm_seconds
        self.max_bytes = max_bytes
        self._file: Any = None
        self._lock = threading.Lock()
        self._ticker_stop = threading.Event()
        self._ticker: Optional[threading.Thread] = None
        # Where the one ``armed`` line starts, and where the file ended after it was written.
        self._base = 0
        self._end = 0
        token = "".join(
            ch for ch in (os.environ.get(STALL_TOKEN_ENV) or "") if ch.isalnum()
        )[:64]
        self._suffix = f" {token}" if token else ""

    def start(self) -> bool:
        """Open (and truncate) the file, arm the timer, start the ticker. False when it could not."""
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._file = open(self.path, "wb")
            self._rearm()
        except Exception as error:
            _logger.debug("stall watchdog not armed: %s", error)
            self._close()
            return False
        self._ticker_stop.clear()
        self._ticker = threading.Thread(
            target=self._run, name="stall-ticker", daemon=True
        )
        self._ticker.start()
        return True

    def stop_ticker(self) -> None:
        """Stop re-arming and leave the timer running; so a test can stand in for a frozen engine."""
        self._ticker_stop.set()
        thread = self._ticker
        if thread is not None and thread is not threading.current_thread():
            thread.join(5)

    def stop(self) -> None:
        """Stop everything and close the file."""
        self.stop_ticker()
        with self._lock:
            try:
                faulthandler.cancel_dump_traceback_later()
            except Exception:
                pass
            self._close()

    def _close(self) -> None:
        handle, self._file = self._file, None
        if handle is not None:
            try:
                handle.close()
            except Exception:
                pass

    def _run(self) -> None:
        while not self._ticker_stop.wait(self.rearm_seconds):
            try:
                self._rearm()
            except Exception as error:
                _logger.debug("stall watchdog re-arm failed: %s", error)

    def _rearm(self) -> None:
        with self._lock:
            handle = self._file
            if handle is None:
                return
            # No dump can happen between the cancel and the arm, so the file is ours to write.
            faulthandler.cancel_dump_traceback_later()
            handle.flush()
            size = os.fstat(handle.fileno()).st_size
            if size > self._end:
                # A dump landed since the last tick: keep it, and put the armed line after it.
                self._base = size
            if self._base > self.max_bytes:
                self._base = 0
            handle.seek(self._base)
            handle.write(f"armed {_now()}{self._suffix}\n".encode("ascii"))
            handle.truncate()
            handle.flush()
            self._end = handle.tell()
            faulthandler.dump_traceback_later(
                self.timeout_seconds, repeat=True, file=handle, exit=False
            )


def arm_stall_watchdog(
    path: Optional[Path] = None,
    timeout_seconds: float = STALL_TIMEOUT_SECONDS,
    rearm_seconds: float = REARM_SECONDS,
    max_bytes: int = MAX_FILE_BYTES,
) -> Optional[StallWatchdog]:
    """Arm the watchdog; the running one, or None when it could not be (never raises)."""
    try:
        target = path or stall_file_path()
        if target is None:
            return None
        watchdog = StallWatchdog(target, timeout_seconds, rearm_seconds, max_bytes)
        return watchdog if watchdog.start() else None
    except Exception:
        return None
