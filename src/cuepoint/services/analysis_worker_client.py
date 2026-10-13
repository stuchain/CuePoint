#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine's side of the analysis worker (C19g).

:class:`WorkerComputer` is a :class:`WaveformComputer` that does not compute: it
sends the path to a child process running ``engine/analysis_worker`` and waits
for the answer. The child runs :class:`InProcessComputer`, so the answer is the
same bytes; what changes is whose CPU and whose GIL the work takes. The
engine's threads serve the app, and only the store writes stay among them.

One child, many requests
------------------------
The analysis run asks for one or two files at a time, and the detail fill asks
beside it, from several threads. One child serves them all: requests carry an
increasing id, one writer lock keeps their lines whole, one reader thread
hands each answer to the thread waiting for it, and a stderr thread keeps the
child's last words for the warning if it dies. The child starts at the first
file, not at the engine's, and ends after :data:`IDLE_SECONDS` with nothing in
flight, so an engine that is only browsing carries no extra process. Its end
is an exit on closed standard input, which is also what a killed engine
causes, so the worker and the decoders under it never outlive the engine.

Analysis never becomes unavailable because of the worker
--------------------------------------------------------
A child that cannot start, says the wrong hello (another build's, left by an
update), dies or breaks its pipe is one failure, logged once with the tail of
its stderr. Callers that were waiting on it retry once on a fresh child. After
the second failure in the client's life it stops trying: every file goes to the
``fallback`` (the in-process computer) for good, and says so once. A child's
``error`` answer, a bug in the worker for one file, sends that file alone to
the fallback. An idle exit is not a failure.

Switching on
------------
Only the engine process enables the worker (``__main__`` calls
:func:`enable_worker`): tests that start the engine in a thread, the command
line and anything else that builds the services stay in-process.
``CUEPOINT_ANALYSIS_WORKER`` forces it either way, ``0`` off and ``1`` on.
"""

from __future__ import annotations

import collections
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import (
    IO,
    Callable,
    Deque,
    Dict,
    List,
    Mapping,
    Optional,
    Sequence,
)

from cuepoint.data import audio_decode
from cuepoint.services import analysis_protocol as wire
from cuepoint.services.waveform_computer import (
    Computed,
    InProcessComputer,
    WaveformComputer,
)

_logger = logging.getLogger(__name__)

#: ``"0"`` forces the worker off and ``"1"`` on; anything else leaves :func:`enable_worker`.
WORKER_ENV = "CUEPOINT_ANALYSIS_WORKER"

#: With nothing in flight this long, the child is ended.
IDLE_SECONDS = 120.0
#: How long a new child gets to say its hello. Python and the imports, on a slow disk.
HELLO_TIMEOUT_SECONDS = 30.0
#: How long an ending child gets to end on its own before it is killed.
STOP_SECONDS = 2.0
#: How often a waiting caller looks at its cancel.
_POLL_SECONDS = 0.05
#: The lines of the child's stderr a failure's warning quotes.
STDERR_TAIL_LINES = 20
#: Failures in a client's life before it stops trying.
MAX_FAILURES = 2

_FLAG = "--analysis-worker"

#: Set by the engine process at start.
_ENABLED = False


def worker_command() -> List[str]:
    """The command that starts a worker: this program again, with a flag.

    Frozen, the sidecar runs itself. PyInstaller 6's one-file children reuse the
    parent's unpacked folder unless ``PYINSTALLER_RESET_ENVIRONMENT`` is set, so
    it is not: the worker starts without unpacking the engine a second time.
    """
    if getattr(sys, "frozen", False):
        return [sys.executable, _FLAG]
    return [sys.executable, "-m", "cuepoint.engine", _FLAG]


def worker_environment(base: Optional[Mapping[str, str]] = None) -> Dict[str, str]:
    """The child's environment: the engine's, and from source the package's folder."""
    env = dict(os.environ if base is None else base)
    if not getattr(sys, "frozen", False):
        # The folder that holds `cuepoint`, so `-m cuepoint.engine` finds it
        # whatever the engine's working directory was.
        root = str(Path(__file__).resolve().parents[2])
        inherited = env.get("PYTHONPATH")
        env["PYTHONPATH"] = root + (os.pathsep + inherited if inherited else "")
    return env


class _ChildFailed(Exception):
    """The child this attempt was using is gone; the attempt may be retried."""


class _Waiter:
    """One request's wait for its answer."""

    def __init__(self) -> None:
        self.done = threading.Event()
        self.line: Optional[Dict[str, object]] = None

    def finish(self, line: Optional[Dict[str, object]]) -> None:
        self.line = line
        self.done.set()


class _Child:
    """One worker process and the threads that serve it."""

    def __init__(self, process: "subprocess.Popen[bytes]") -> None:
        self.process = process
        self.lock = threading.Lock()
        self.write_lock = threading.Lock()
        self.pending: Dict[int, _Waiter] = {}
        self.hello = threading.Event()
        self.hello_ok = False
        self.dead = False
        self.failed = False
        self.closing = False
        self.stderr: Deque[str] = collections.deque(maxlen=STDERR_TAIL_LINES)
        self.threads: List[threading.Thread] = []

    @property
    def pid(self) -> int:
        return int(self.process.pid)


class WorkerComputer:
    """Computes in a worker process, and in the engine when it cannot."""

    def __init__(
        self,
        *,
        command: Optional[Sequence[str]] = None,
        env: Optional[Mapping[str, str]] = None,
        idle_seconds: float = IDLE_SECONDS,
        hello_timeout: float = HELLO_TIMEOUT_SECONDS,
        fallback: Optional[WaveformComputer] = None,
    ) -> None:
        """Wire the client; nothing starts until the first file.

        Args:
            command: The worker's command; :func:`worker_command` by default.
            env: The worker's environment; :func:`worker_environment` by default.
            idle_seconds: How long with nothing in flight before the worker ends.
            hello_timeout: How long a new worker has to say hello.
            fallback: Computes when the worker cannot; in-process by default.
        """
        self._command = list(command) if command is not None else None
        self._env = dict(env) if env is not None else None
        self._idle_seconds = float(idle_seconds)
        self._hello_timeout = float(hello_timeout)
        self._fallback: WaveformComputer = (
            fallback if fallback is not None else InProcessComputer()
        )
        self._lock = threading.RLock()
        self._child: Optional[_Child] = None
        self._next_id = 0
        self._in_flight = 0
        self._idle_since = time.monotonic()
        self._timer: Optional[threading.Timer] = None
        self._failures = 0

    @property
    def pid(self) -> Optional[int]:
        """The worker's process id now, or ``None`` when none is running."""
        with self._lock:
            child = self._child
            return child.pid if child is not None and not child.dead else None

    # ------------------------------------------------------------ computing

    def compute(
        self,
        path: str,
        decoder: Path,
        *,
        overview: bool,
        detail: bool,
        cancel: Optional[Callable[[], bool]] = None,
    ) -> Computed:
        """Have the worker decode ``path`` and make the pictures asked for."""
        for _attempt in range(2):
            try:
                child = self._acquire()
            except _ChildFailed:
                continue
            if child is None:
                break
            try:
                line = self._ask(child, path, decoder, overview, detail, cancel)
            except _ChildFailed:
                continue
            finally:
                self._release()
            return self._answer(line, path, decoder, overview, detail, cancel)
        return self._fallback.compute(
            path, decoder, overview=overview, detail=detail, cancel=cancel
        )

    def _answer(
        self,
        line: Dict[str, object],
        path: str,
        decoder: Path,
        overview: bool,
        detail: bool,
        cancel: Optional[Callable[[], bool]],
    ) -> Computed:
        try:
            message = wire.parse_error(line)
            if message is None:
                return wire.parse_result(line)
        except ValueError as error:
            message = f"an answer that is not one: {error}"
        _logger.warning(
            "[waveforms] the analysis worker failed on %s (%s); analysing it here",
            Path(path).name,
            message,
        )
        return self._fallback.compute(
            path, decoder, overview=overview, detail=detail, cancel=cancel
        )

    def _ask(
        self,
        child: _Child,
        path: str,
        decoder: Path,
        overview: bool,
        detail: bool,
        cancel: Optional[Callable[[], bool]],
    ) -> Dict[str, object]:
        waiter = _Waiter()
        with self._lock:
            self._next_id += 1
            request_id = self._next_id
        with child.lock:
            if child.dead:
                raise _ChildFailed()
            child.pending[request_id] = waiter
        try:
            self._write(
                child, wire.request_line(request_id, path, decoder, overview, detail)
            )
            cancelled = False
            while not waiter.done.wait(_POLL_SECONDS):
                if not cancelled and cancel is not None and cancel():
                    # Once: the answer to a cancelled file still comes.
                    cancelled = True
                    self._write(child, wire.cancel_line(request_id))
        finally:
            with child.lock:
                child.pending.pop(request_id, None)
        if waiter.line is None:
            raise _ChildFailed()
        return waiter.line

    def _write(self, child: _Child, raw: bytes) -> None:
        stdin = child.process.stdin
        try:
            with child.write_lock:
                assert stdin is not None
                stdin.write(raw)
                stdin.flush()
        except (OSError, ValueError) as error:
            self._fail(child, f"its pipe broke ({error})")
            raise _ChildFailed() from error

    # ------------------------------------------------------- the child's life

    def _acquire(self) -> Optional[_Child]:
        """The child to use, started if need be, counted in flight.

        Returns ``None`` once the client has given up on workers.
        """
        with self._lock:
            if self._failures >= MAX_FAILURES:
                return None
            child = self._child
            if child is None or child.dead:
                child = self._start()
            self._in_flight += 1
            return child

    def _release(self) -> None:
        with self._lock:
            self._in_flight -= 1
            if self._in_flight == 0:
                self._idle_since = time.monotonic()
                self._arm(self._idle_seconds)

    def _start(self) -> _Child:
        """Start a child and wait for its hello. Called with the lock held."""
        command = self._command if self._command is not None else worker_command()
        env = self._env if self._env is not None else worker_environment()
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                close_fds=True,
                env=env,
                creationflags=audio_decode._spawn_flags(),
            )
        except (OSError, ValueError) as error:
            self._count_failure(f"it did not start ({error})", [])
            raise _ChildFailed() from error
        audio_decode._join_engine_job(process)
        audio_decode._lower_priority(process.pid)
        audio_decode.adopt_child(process)
        child = _Child(process)
        for target, name in ((self._read, "stdout"), (self._drain, "stderr")):
            thread = threading.Thread(
                target=target,
                args=(child,),
                name=f"analysis-worker-{process.pid}-{name}",
                daemon=True,
            )
            child.threads.append(thread)
            thread.start()
        if not child.hello.wait(self._hello_timeout):
            self._fail(child, f"no hello in {self._hello_timeout:g} seconds")
            raise _ChildFailed()
        if not child.hello_ok:
            self._fail(child, "no usable hello (a worker of another build, or none)")
            raise _ChildFailed()
        self._child = child
        return child

    def _read(self, child: _Child) -> None:
        """Hand each line the child says to the thread waiting for it."""
        stdout = child.process.stdout
        assert stdout is not None
        first = True
        try:
            for raw in stdout:
                try:
                    obj = wire.loads(raw)
                except ValueError as error:
                    if first:
                        child.hello.set()
                        break
                    _logger.warning(
                        "[waveforms] the analysis worker said something else: %s", error
                    )
                    continue
                if first:
                    first = False
                    child.hello_ok = wire.hello_matches(obj)
                    child.hello.set()
                    if not child.hello_ok:
                        break
                    continue
                try:
                    request_id = wire.line_id(obj)
                except ValueError:
                    _logger.warning("[waveforms] an answer with no id from the worker")
                    continue
                with child.lock:
                    waiter = child.pending.pop(request_id, None)
                if waiter is not None:
                    waiter.finish(obj)
        except (OSError, ValueError):
            pass
        finally:
            child.hello.set()
            self._ended(child)

    def _drain(self, child: _Child) -> None:
        """Keep the child's stderr from filling, and its last lines for a failure."""
        stderr = child.process.stderr
        assert stderr is not None
        try:
            for raw in stderr:
                line = raw.decode("utf-8", "replace").rstrip()
                child.stderr.append(line)
                _logger.debug("[analysis-worker %s] %s", child.pid, line)
        except (OSError, ValueError):
            pass

    def _ended(self, child: _Child) -> None:
        """The child's output closed: it exited, or was ended."""
        with child.lock:
            expected = child.closing or child.failed
            waiting = bool(child.pending)
        if not expected and child.hello_ok and waiting:
            try:
                code: Optional[int] = child.process.wait(STOP_SECONDS)
            except subprocess.TimeoutExpired:
                code = None
            self._fail(child, f"it exited (code {code}) with requests pending")
        else:
            # Gone with nobody waiting (or never said hello, which its starter
            # judges): the next file starts a fresh one.
            self._bury(child)
        self._await_exit(child)

    def _fail(self, child: _Child, what: str) -> None:
        """One failure: a warning, the child ended, and everyone waiting woken."""
        with self._lock:
            with child.lock:
                if child.failed:
                    return
                child.failed = True
            tail = list(child.stderr)
            self._bury(child)
            self._count_failure(what, tail)
        self._stop(child, graceful=False)

    def _count_failure(self, what: str, tail: List[str]) -> None:
        with self._lock:
            self._failures += 1
            _logger.warning(
                "[waveforms] the analysis worker failed (%s); its last words: %s",
                what,
                " | ".join(tail) if tail else "(none)",
            )
            if self._failures >= MAX_FAILURES:
                _logger.warning(
                    "[waveforms] the analysis worker failed twice; analysis continues"
                    " inside the engine"
                )

    def _bury(self, child: _Child) -> None:
        """Mark a child dead and wake everyone waiting on it."""
        with child.lock:
            child.dead = True
            waiting = list(child.pending.values())
            child.pending.clear()
        with self._lock:
            if self._child is child:
                self._child = None
        for waiter in waiting:
            waiter.finish(None)

    def _stop(self, child: _Child, *, graceful: bool) -> None:
        """End a child: close its stdin (it exits on that) and kill it if it lingers."""
        with child.lock:
            child.closing = True
        try:
            if child.process.stdin is not None:
                child.process.stdin.close()
        except (OSError, ValueError):
            pass
        if graceful:
            self._await_exit(child)
        else:
            # A failed child is not waited for: its callers retry meanwhile.
            threading.Thread(
                target=self._await_exit,
                args=(child,),
                name=f"analysis-worker-{child.pid}-stop",
                daemon=True,
            ).start()

    def _await_exit(self, child: _Child) -> None:
        try:
            child.process.wait(STOP_SECONDS)
        except subprocess.TimeoutExpired:
            try:
                child.process.kill()
            except OSError:
                pass
            try:
                child.process.wait(STOP_SECONDS * 5)
            except subprocess.TimeoutExpired:
                _logger.warning(
                    "[waveforms] the analysis worker %s would not end", child.pid
                )
                return
        self._reap(child)

    def _reap(self, child: _Child) -> None:
        """Let go of a child that has ended."""
        if child.process.poll() is None:
            return
        audio_decode.release_child(child.process)
        for stream in (child.process.stdin, child.process.stdout, child.process.stderr):
            self._close(stream)

    @staticmethod
    def _close(stream: Optional[IO[bytes]]) -> None:
        try:
            if stream is not None:
                stream.close()
        except (OSError, ValueError):
            pass

    # ------------------------------------------------------------------ idle

    def _arm(self, delay: float) -> None:
        """Look at the idle clock after ``delay``, unless a look is already due."""
        if self._timer is not None or self._child is None:
            return
        timer = threading.Timer(max(0.0, delay), self._on_timer)
        timer.daemon = True
        self._timer = timer
        timer.start()

    def _on_timer(self) -> None:
        with self._lock:
            self._timer = None
            child = self._child
            if child is None or self._in_flight > 0:
                # Busy: the next file to finish looks again.
                return
            remaining = self._idle_since + self._idle_seconds - time.monotonic()
            if remaining > 0:
                self._arm(remaining)
                return
            self._child = None
            child.dead = True
        self._stop(child, graceful=True)

    def close(self) -> None:
        """End the worker, if one runs. Idempotent; a later file starts a new one."""
        with self._lock:
            child = self._child
            self._child = None
            timer, self._timer = self._timer, None
            if child is not None:
                child.dead = True
        if timer is not None:
            timer.cancel()
        if child is not None:
            self._bury(child)
            self._stop(child, graceful=True)


# ---------------------------------------------------------------------------
# The engine's one client.
# ---------------------------------------------------------------------------

_SHARED: List[WorkerComputer] = []
_SHARED_LOCK = threading.Lock()


def enable_worker() -> None:
    """Have this process analyse in a worker; the engine's ``__main__`` calls it."""
    global _ENABLED
    _ENABLED = True


def worker_enabled() -> bool:
    """Whether analysis goes to the worker: ``CUEPOINT_ANALYSIS_WORKER``, else the flag."""
    forced = os.environ.get(WORKER_ENV, "").strip()
    if forced == "0":
        return False
    if forced == "1":
        return True
    return _ENABLED


def shared_computer() -> WorkerComputer:
    """This process's one worker client, made on first use."""
    with _SHARED_LOCK:
        if not _SHARED:
            _SHARED.append(WorkerComputer())
        return _SHARED[0]


def default_computer() -> Optional[WaveformComputer]:
    """What the waveform service computes with: the worker, or ``None`` for in-process."""
    return shared_computer() if worker_enabled() else None


__all__: Sequence[str] = (
    "HELLO_TIMEOUT_SECONDS",
    "IDLE_SECONDS",
    "WORKER_ENV",
    "WorkerComputer",
    "default_computer",
    "enable_worker",
    "shared_computer",
    "worker_command",
    "worker_enabled",
    "worker_environment",
)
