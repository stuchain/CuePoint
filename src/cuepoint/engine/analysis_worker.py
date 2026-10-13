#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The analysis worker: the child process that computes waveforms (C19g).

``python -m cuepoint.engine --analysis-worker`` (and the frozen sidecar, run
with the same flag) comes here instead of starting the engine. The engine's
:class:`~cuepoint.services.analysis_worker_client.WorkerComputer` writes
requests to this process's standard input and reads answers from its standard
output, in the format ``services/analysis_protocol`` defines. Everything that
used to cost the engine's Python process CPU while it analysed (the threads
supervising each ``mpv``, parsing its envelope, reducing and encoding it) runs
here, so the engine's GIL is left to the app's requests.

One loop, one thread of work per request
----------------------------------------
The main thread reads lines. Each request runs :class:`InProcessComputer`
(the real ``decode_envelope``) on a daemon thread of its own, with a cancel
flag the loop can set, so several files can be in flight at once, as the
engine's run and its detail fill ask for them. A result is written under a lock
and flushed as a whole line.

Standard output belongs to the protocol. Logging goes to standard error, which
the engine drains and keeps the tail of for the one warning it logs if this
process dies; ``print`` is pointed there too.

Ending
------
When standard input closes the worker is done: the engine closed it, exited or
was killed (a killed engine's pipes close, so no orphan stays behind to
decode). Every request is cancelled, the decoders are killed and the threads
get a moment to answer; then the process returns. ``SIGTERM`` (what the engine
sends as it stops) takes the same path, so a worker asked to end ends its
decoders too. The worker lowers its own priority on POSIX (Windows' comes with its
creation flags), so a packaged build, where the engine's child is a
bootloader, lowers the right process; the decoders lower themselves further.
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import BinaryIO, Dict, List, Optional, Sequence

from cuepoint.data import audio_decode
from cuepoint.services import analysis_protocol as wire
from cuepoint.services.waveform_computer import InProcessComputer, WaveformComputer

_logger = logging.getLogger(__name__)

#: How long the threads get to answer once the engine is gone.
JOIN_SECONDS = 2.0


class _Terminated(BaseException):
    """``SIGTERM`` arrived: end as if standard input had closed."""


def _on_sigterm(signum: int, frame: object) -> None:
    # A second one, while the first is being answered, must not interrupt it.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    raise _Terminated()


class _Output:
    """Standard output, written one whole line at a time."""

    def __init__(self, stream: BinaryIO) -> None:
        self._stream = stream
        self._lock = threading.Lock()

    def write(self, raw: bytes) -> bool:
        """Write and flush one line; ``False`` when the engine is not reading."""
        with self._lock:
            try:
                self._stream.write(raw)
                self._stream.flush()
            except (OSError, ValueError):
                # The engine closed its end. Its stdin closing is what ends
                # this process; there is no one to tell.
                return False
        return True


def _serve(
    request: wire.Request,
    computer: WaveformComputer,
    cancel: threading.Event,
    output: _Output,
    running: Dict[int, threading.Event],
    lock: threading.Lock,
) -> None:
    try:
        computed = computer.compute(
            request.path,
            Path(request.decoder),
            overview=request.overview,
            detail=request.detail,
            cancel=cancel.is_set,
        )
        line = wire.result_line(request.id, computed)
    except Exception as error:
        # A programming error, not anything a file contains: say so, and the
        # engine analyses that file itself.
        _logger.warning(
            "[analysis-worker] request %s failed", request.id, exc_info=True
        )
        line = wire.error_line(request.id, f"{type(error).__name__}: {error}")
    finally:
        with lock:
            running.pop(request.id, None)
    output.write(line)


def main(
    stdin: Optional[BinaryIO] = None,
    stdout: Optional[BinaryIO] = None,
    *,
    computer: Optional[WaveformComputer] = None,
) -> int:
    """Serve requests until standard input closes.

    Args:
        stdin: Where requests come from; the process's by default.
        stdout: Where answers go; the process's by default.
        computer: What computes a file; the in-process computer by default,
            which is the point. A stand-in in tests.

    Returns:
        The exit code: 0 when the engine ended the conversation, 1 when
        standard output was already unusable.
    """
    real = stdin is None and stdout is None
    if real and (sys.stdin is None or sys.stdout is None):
        # A windowed build with no console: there is no one to talk to.
        return 2
    if stdin is None:
        stdin = sys.stdin.buffer
    if stdout is None:
        stdout = sys.stdout.buffer
        # Nothing but the protocol may reach the real standard output.
        sys.stdout = sys.stderr
    if real:
        # Only as a process: a caller that hands in its own streams (a test)
        # keeps its own logging.
        if sys.stderr is None:
            sys.stderr = open(os.devnull, "w", encoding="utf-8")
        # `LEVEL name: text`, which the engine reads to log warnings at their
        # own level. The decoder's INFO lines (a decode run again) are kept.
        logging.basicConfig(
            stream=sys.stderr,
            level=logging.WARNING,
            format="%(levelname)s %(name)s: %(message)s",
        )
        logging.getLogger("cuepoint.data.audio_decode").setLevel(logging.INFO)
        # Below the engine, as the decoders are: the engine sets only the
        # child's start, and a packaged child may sit behind a bootloader.
        try:
            os.nice(audio_decode.NICE_INCREMENT)
        except (AttributeError, OSError):
            pass
        if threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGTERM, _on_sigterm)
    work = computer if computer is not None else InProcessComputer()
    output = _Output(stdout)
    if not output.write(wire.hello_line()):
        return 1

    lock = threading.Lock()
    running: Dict[int, threading.Event] = {}
    threads: List[threading.Thread] = []
    try:
        for raw in stdin:
            try:
                obj = wire.loads(raw)
                cancelled = wire.parse_cancel(obj)
                if cancelled is not None:
                    with lock:
                        flag = running.get(cancelled)
                    if flag is not None:
                        flag.set()
                    continue
                request = wire.parse_request(obj)
            except ValueError as error:
                _logger.warning("[analysis-worker] skipped a line: %s", error)
                continue
            flag = threading.Event()
            with lock:
                if request.id in running:
                    duplicate = True
                else:
                    duplicate = False
                    running[request.id] = flag
            if duplicate:
                _logger.warning("[analysis-worker] request %s is running", request.id)
                output.write(wire.error_line(request.id, "that id is in flight"))
                continue
            thread = threading.Thread(
                target=_serve,
                args=(request, work, flag, output, running, lock),
                name=f"analysis-{request.id}",
                daemon=True,
            )
            threads.append(thread)
            thread.start()
            threads[:] = [each for each in threads if each.is_alive()]
    except _Terminated:
        pass
    finally:
        _finish(running, lock, threads)
    return 0


def _finish(
    running: Dict[int, threading.Event],
    lock: threading.Lock,
    threads: Sequence[threading.Thread],
) -> None:
    """The engine is gone: stop every file, kill the decoders, let threads answer."""
    with lock:
        for flag in running.values():
            flag.set()
    audio_decode.terminate_children()
    deadline = time.monotonic() + JOIN_SECONDS
    for thread in threads:
        thread.join(max(0.0, deadline - time.monotonic()))


__all__ = ("JOIN_SECONDS", "main")
