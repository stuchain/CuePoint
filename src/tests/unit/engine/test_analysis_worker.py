#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The analysis worker's main loop, run as the real child it is (C19g).

The worker is a process, so these start one the way the engine does
(``python -m cuepoint.engine --analysis-worker``) and speak the protocol to it
over pipes, with the stand-in decoder under it. What they pin: its bytes are
the in-process computer's, a cancel reaches the decoder, and when its stdin
closes (the engine exited or was killed) the worker and its decoder go too,
and the worker does not carry the engine's imports.
"""

from __future__ import annotations

import io
import os
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from cuepoint.data import audio_decode as ad
from cuepoint.engine import analysis_worker
from cuepoint.services import analysis_protocol as wire
from cuepoint.services.waveform_computer import (
    COMPUTED_CANCELLED,
    COMPUTED_FAILED,
    COMPUTED_READY,
    Computed,
    InProcessComputer,
)
from tests.fixtures.stub_decoder import write_stub

pytestmark = [
    pytest.mark.unit,
    pytest.mark.skipif(
        sys.platform == "win32", reason="the stub decoder is a script run by path"
    ),
]

_SRC = Path(__file__).resolve().parents[3]
#: Generous: a loaded CI machine starts a Python child in seconds.
PATIENCE = 60.0


class Worker:
    """The real worker process, and the lines it has said."""

    def __init__(self, env: Dict[str, str]) -> None:
        self.process = subprocess.Popen(
            [sys.executable, "-m", "cuepoint.engine", "--analysis-worker"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
        self.lines: "queue.Queue[Optional[bytes]]" = queue.Queue()
        self.errors = b""
        self._threads = [
            threading.Thread(target=self._read_stdout, daemon=True),
            threading.Thread(target=self._read_stderr, daemon=True),
        ]
        for thread in self._threads:
            thread.start()

    def _read_stdout(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            self.lines.put(line)
        self.lines.put(None)

    def _read_stderr(self) -> None:
        assert self.process.stderr is not None
        self.errors = self.process.stderr.read()

    def send(self, raw: bytes) -> None:
        assert self.process.stdin is not None
        self.process.stdin.write(raw)
        self.process.stdin.flush()

    def next(self) -> Dict[str, Any]:
        raw = self.lines.get(timeout=PATIENCE)
        assert raw is not None, f"the worker closed its output: {self.errors!r}"
        return wire.loads(raw)

    def ask(self, id: int, path: Path, decoder: Path, **kinds: bool) -> Dict[str, Any]:
        self.send(
            wire.request_line(
                id,
                str(path),
                decoder,
                kinds.get("overview", True),
                kinds.get("detail", True),
            )
        )
        return self.next()

    def close_stdin(self) -> None:
        assert self.process.stdin is not None
        self.process.stdin.close()

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=PATIENCE)
        for thread in self._threads:
            thread.join(timeout=PATIENCE)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            if stream is not None:
                stream.close()


@pytest.fixture
def stub(tmp_path, monkeypatch) -> Path:
    path = write_stub(tmp_path / "stub-mpv")
    monkeypatch.setenv("STUB_EXPECTED", ad.EXPECTED_OUTPUT)
    monkeypatch.setenv("STUB_MODE", "good")
    monkeypatch.setenv("STUB_FRAMES", "300")
    return path


@pytest.fixture
def song(tmp_path) -> Path:
    path = tmp_path / "music" / "Sång – ett.flac"
    path.parent.mkdir()
    path.write_bytes(b"fLaC")
    return path


@pytest.fixture
def spawn():
    """Start a worker with the environment as the test has set it by now."""
    started: List[Worker] = []

    def start() -> Worker:
        worker = Worker({**os.environ, "PYTHONPATH": str(_SRC)})
        started.append(worker)
        return worker

    yield start
    for worker in started:
        worker.stop()


@pytest.fixture
def worker(spawn, stub):
    return spawn()


def _wait_gone(pid: int, seconds: float = PATIENCE) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
        try:
            with open(f"/proc/{pid}/status", encoding="utf-8") as handle:
                if "zombie" in handle.read():
                    return True
        except OSError:
            pass
        time.sleep(0.05)
    return False


def _wait_for(path: Path, seconds: float = PATIENCE) -> str:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if path.exists() and path.read_text():
            return path.read_text()
        time.sleep(0.02)
    raise AssertionError(f"{path} never appeared")


class TestTheLoop:
    def test_it_says_hello_before_anything(self, worker):
        assert wire.hello_matches(worker.next())

    @pytest.mark.parametrize(
        "mode, frames",
        [("good", "300"), ("error", "300"), ("good", "0")],
        ids=["good", "error", "no-audio"],
    )
    def test_its_answer_is_the_in_process_computers_byte_for_byte(
        self, spawn, stub, song, monkeypatch, mode, frames
    ):
        monkeypatch.setenv("STUB_MODE", mode)
        monkeypatch.setenv("STUB_FRAMES", frames)
        worker = spawn()
        assert wire.hello_matches(worker.next())
        answer = worker.ask(1, song, stub)
        expected = InProcessComputer().compute(
            str(song), stub, overview=True, detail=True
        )
        assert wire.line_id(answer) == 1
        assert wire.parse_result(answer) == expected
        if mode == "good" and frames != "0":
            assert expected.outcome == COMPUTED_READY and expected.detail
        else:
            assert expected.outcome == COMPUTED_FAILED

    def test_only_what_was_asked_for_is_made(self, worker, stub, song):
        worker.next()
        both = wire.parse_result(worker.ask(1, song, stub))
        overview = wire.parse_result(worker.ask(2, song, stub, detail=False))
        detail = wire.parse_result(worker.ask(3, song, stub, overview=False))
        assert (overview.overview, overview.detail) == (both.overview, None)
        assert (detail.overview, detail.detail) == (None, both.detail)

    def test_a_missing_file_is_gone_not_an_error(self, worker, stub, tmp_path):
        worker.next()
        answer = worker.ask(1, tmp_path / "nowhere.flac", stub)
        assert wire.parse_result(answer).outcome == "file_gone"

    def test_a_junk_line_is_skipped_and_the_next_request_answered(
        self, worker, stub, song
    ):
        worker.next()
        worker.send(b"this is not json\n")
        worker.send(b'{"id": "one"}\n')
        worker.send(b'{"cancel": 77}\n')
        assert wire.parse_result(worker.ask(5, song, stub)).outcome == COMPUTED_READY
        worker.close_stdin()
        assert worker.process.wait(timeout=PATIENCE) == 0
        assert worker.errors.count(b"analysis_worker: [analysis-worker] skipped") == 2

    def test_nothing_but_protocol_lines_reaches_standard_output(
        self, worker, stub, song
    ):
        worker.next()
        worker.send(b"junk\n")
        worker.ask(1, song, stub)
        worker.close_stdin()
        assert worker.process.wait(timeout=PATIENCE) == 0
        rest: List[Optional[bytes]] = []
        while not worker.lines.empty():
            rest.append(worker.lines.get())
        assert rest == [None]


class TestCancel:
    def test_a_cancel_stops_a_file_mid_decode(
        self, spawn, stub, song, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("STUB_MODE", "slow")
        monkeypatch.setenv("STUB_SLOW_KIND", "output")
        monkeypatch.setenv("STUB_SLOW_SECONDS", "120")
        monkeypatch.setenv("STUB_PID_FILE", str(tmp_path / "pid"))
        worker = spawn()
        worker.next()
        worker.send(wire.request_line(4, str(song), stub, True, True))
        pid = int(_wait_for(tmp_path / "pid"))
        started = time.monotonic()
        worker.send(wire.cancel_line(4))
        answer = worker.next()
        elapsed = time.monotonic() - started
        assert wire.line_id(answer) == 4
        assert wire.parse_result(answer).outcome == COMPUTED_CANCELLED
        # Far inside the two minutes the stub would take: the cancel did it.
        assert elapsed < 60
        assert _wait_gone(pid)


class TestTheEngineGoing:
    def test_closing_stdin_ends_the_worker_and_its_decoder(
        self, spawn, stub, song, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("STUB_MODE", "sleep")
        monkeypatch.setenv("STUB_PID_FILE", str(tmp_path / "pid"))
        worker = spawn()
        worker.next()
        worker.send(wire.request_line(1, str(song), stub, True, True))
        decoder_pid = int(_wait_for(tmp_path / "pid"))
        worker.close_stdin()
        assert worker.process.wait(timeout=PATIENCE) == 0
        assert _wait_gone(decoder_pid), "the decoder outlived the worker"

    def test_a_killed_engine_looks_the_same_to_the_worker(
        self, stub, song, tmp_path, monkeypatch
    ):
        """A SIGKILLed engine closes the pipe as an orderly one does."""
        monkeypatch.setenv("STUB_MODE", "sleep")
        monkeypatch.setenv("STUB_PID_FILE", str(tmp_path / "pid"))
        program = (
            "import os, subprocess, sys, time\n"
            "w = subprocess.Popen([sys.executable, '-m', 'cuepoint.engine',"
            " '--analysis-worker'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)\n"
            "w.stdout.readline()\n"
            "from cuepoint.services import analysis_protocol as wire\n"
            "w.stdin.write(wire.request_line(1, sys.argv[1], sys.argv[2], True, True))\n"
            "w.stdin.flush()\n"
            "print(w.pid, flush=True)\n"
            "time.sleep(600)\n"
        )
        engine = subprocess.Popen(
            [sys.executable, "-c", program, str(song), str(stub)],
            stdout=subprocess.PIPE,
            env={**os.environ, "PYTHONPATH": str(_SRC)},
        )
        try:
            assert engine.stdout is not None
            worker_pid = int(engine.stdout.readline())
            decoder_pid = int(_wait_for(tmp_path / "pid"))
            engine.kill()
            engine.wait(timeout=PATIENCE)
            assert _wait_gone(worker_pid)
            assert _wait_gone(decoder_pid)
        finally:
            if engine.poll() is None:
                engine.kill()
                engine.wait(timeout=PATIENCE)
            if engine.stdout is not None:
                engine.stdout.close()


class TestAsAProcess:
    def test_it_runs_below_the_engines_priority(self, worker):
        worker.next()
        own = os.getpriority(os.PRIO_PROCESS, 0)
        theirs = os.getpriority(os.PRIO_PROCESS, worker.process.pid)
        assert theirs >= min(19, own + ad.NICE_INCREMENT)

    def test_the_decoders_log_lines_carry_their_level(self, worker, stub, tmp_path):
        worker.next()
        worker.ask(1, tmp_path / "nowhere.flac", stub)  # file_gone: quiet
        worker.send(b"junk\n")
        worker.close_stdin()
        worker.process.wait(timeout=PATIENCE)
        assert worker.errors.startswith(b"WARNING cuepoint.engine.analysis_worker: ")

    def test_two_sigterms_still_end_the_decoder_and_exit_cleanly(
        self, spawn, stub, song, tmp_path, monkeypatch
    ):
        """Regression: a second SIGTERM raised out of the shutdown itself."""
        import signal

        monkeypatch.setenv("STUB_MODE", "sleep")
        monkeypatch.setenv("STUB_PID_FILE", str(tmp_path / "pid"))
        worker = spawn()
        worker.next()
        worker.send(wire.request_line(1, str(song), stub, True, True))
        decoder_pid = int(_wait_for(tmp_path / "pid"))
        for _ in range(5):
            worker.process.send_signal(signal.SIGTERM)
            time.sleep(0.01)
        assert worker.process.wait(timeout=PATIENCE) == 0, worker.errors
        assert _wait_gone(decoder_pid)

    def test_without_a_console_it_exits_at_once(self):
        program = (
            "import sys\n"
            "sys.stdin = None\n"
            "from cuepoint.engine.analysis_worker import main\n"
            "sys.exit(main())\n"
        )
        result = subprocess.run(
            [sys.executable, "-c", program],
            capture_output=True,
            env={**os.environ, "PYTHONPATH": str(_SRC)},
            timeout=PATIENCE,
            check=False,
        )
        assert result.returncode == 2
        assert result.stdout == b""

    def test_an_exception_escaping_main_is_a_message_not_a_traceback(self):
        """A windowed build shows an uncaught traceback as a modal dialog."""
        program = (
            "import runpy, sys\n"
            "from cuepoint.engine import analysis_worker\n"
            "def boom():\n"
            "    raise RuntimeError('it broke')\n"
            "analysis_worker.main = boom\n"
            "sys.argv = ['cuepoint.engine', '--analysis-worker']\n"
            "runpy.run_module('cuepoint.engine', run_name='__main__')\n"
        )
        result = subprocess.run(
            [sys.executable, "-c", program],
            capture_output=True,
            env={**os.environ, "PYTHONPATH": str(_SRC)},
            timeout=PATIENCE,
            check=False,
        )
        assert result.returncode == 1
        assert b"it broke" in result.stderr
        assert b"Traceback" not in result.stderr


class _Raises:
    def compute(self, *args: object, **kwargs: object) -> Computed:
        raise RuntimeError("a bug, not a file")


class TestInProcess:
    """The loop without a process, for what a child cannot be made to do."""

    def test_an_exception_is_an_error_line_not_a_dead_worker(self):
        out = io.BytesIO()
        request = wire.request_line(3, "/a.flac", "/mpv", True, True)
        assert analysis_worker.main(io.BytesIO(request), out, computer=_Raises()) == 0
        lines = out.getvalue().splitlines()
        assert wire.hello_matches(wire.loads(lines[0]))
        error = wire.loads(lines[1])
        assert wire.line_id(error) == 3
        assert "RuntimeError" in (wire.parse_error(error) or "")


class TestWhatItLoads:
    def test_the_worker_never_imports_the_engine_server(self):
        """The worker starts without the engine's import cost (C19g).

        Run through ``__main__`` itself, as the sidecar and ``python -m`` do,
        with an empty stdin so the loop ends at once.
        """
        program = (
            "import runpy, sys\n"
            "sys.argv = ['cuepoint.engine', '--analysis-worker']\n"
            "try:\n"
            "    runpy.run_module('cuepoint.engine', run_name='__main__')\n"
            "except SystemExit as stop:\n"
            "    code = stop.code\n"
            "print(code, 'cuepoint.engine.server' in sys.modules, file=sys.stderr)\n"
        )
        result = subprocess.run(
            [sys.executable, "-c", program],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            env={**os.environ, "PYTHONPATH": str(_SRC)},
            timeout=PATIENCE,
            check=False,
        )
        assert wire.hello_matches(wire.loads(result.stdout))
        assert result.stderr.decode().splitlines()[-1] == "0 False", result.stderr

    def test_the_package_gives_the_engine_up_only_when_asked(self):
        program = (
            "import sys\n"
            "import cuepoint.engine as engine\n"
            "before = 'cuepoint.engine.server' in sys.modules\n"
            "run = engine.run_engine\n"
            "after = 'cuepoint.engine.server' in sys.modules\n"
            "names = sorted(engine.__all__)\n"
            "print(before, after, callable(run), names, hasattr(engine, 'EngineConfig'),"
            " callable(engine.get_job_store))\n"
        )
        result = subprocess.run(
            [sys.executable, "-c", program],
            capture_output=True,
            env={**os.environ, "PYTHONPATH": str(_SRC)},
            timeout=PATIENCE,
            check=True,
        )
        assert result.stdout.decode().split(None, 3)[:3] == ["False", "True", "True"]
        assert "['EngineConfig', 'get_job_store', 'run_engine'] True True" in (
            result.stdout.decode()
        )

    def test_an_unknown_name_is_still_an_attribute_error(self):
        import cuepoint.engine as engine

        with pytest.raises(AttributeError):
            engine.no_such_thing  # noqa: B018


class TestHelloIdentity:
    """The hello says who the worker is, and the engine still accepts it (C19g)."""

    def test_the_line_carries_the_pid_and_home_and_still_matches(self, monkeypatch):
        monkeypatch.delattr(sys, "_MEIPASS", raising=False)
        obj = wire.loads(wire.hello_line())
        assert obj["pid"] == os.getpid()
        assert obj["home"] is None
        assert wire.hello_matches(obj)

    def test_a_frozen_build_says_where_it_is_unpacked(self, monkeypatch):
        monkeypatch.setattr(sys, "_MEIPASS", "/tmp/_MEIx", raising=False)
        obj = wire.loads(wire.hello_line())
        assert obj["home"] == "/tmp/_MEIx"
        assert wire.hello_matches(obj)

    def test_a_hello_without_the_identity_still_matches(self):
        assert wire.hello_matches(wire.hello())

    def test_another_builds_versions_still_do_not(self):
        obj = wire.loads(wire.hello_line())
        obj["analysis_version"] += 1
        assert not wire.hello_matches(obj)

    def test_the_client_keeps_the_hello_it_accepted_and_its_start_time(
        self, stub, song
    ):
        from cuepoint.services.analysis_worker_client import (
            WorkerComputer,
            worker_environment,
        )

        client = WorkerComputer(env=worker_environment(), hello_timeout=PATIENCE)
        assert client.last_hello is None
        assert client.last_start_seconds is None
        try:
            computed = client.compute(str(song), stub, overview=True, detail=False)
            hello = client.last_hello
        finally:
            client.close()
        assert computed.outcome == COMPUTED_READY
        assert hello is not None and wire.hello_matches(hello)
        assert hello["pid"] != os.getpid()
        assert hello["home"] is None
        assert client.last_start_seconds is not None
        assert 0 < client.last_start_seconds < PATIENCE
        assert client.fallbacks == 0


class TestSelftest:
    """``--analysis-selftest DECODER FILE``: the release check's engine half."""

    def _run(self, *args: str, extra: Optional[Dict[str, str]] = None):
        return subprocess.run(
            [sys.executable, "-m", "cuepoint.engine", "--analysis-selftest", *args],
            capture_output=True,
            env={**os.environ, "PYTHONPATH": str(_SRC), **(extra or {})},
            timeout=PATIENCE,
            check=False,
        )

    def test_from_source_it_prints_one_ready_line_from_a_worker(self, stub, song):
        import hashlib
        import json

        result = self._run(str(stub), str(song))
        assert result.returncode == 0, result.stderr
        lines = result.stdout.decode().splitlines()
        assert len(lines) == 1
        said = json.loads(lines[0])
        assert said["outcome"] == "ready"
        assert said["frozen"] is False
        assert said["worker"] is True
        assert said["home"] is None and said["worker_home"] is None
        assert said["worker_pid"] not in (None, os.getpid())
        assert said["start_seconds"] > 0
        assert said["decode_errors"] == 0
        # The same bytes as the in-process computer makes.
        expected = InProcessComputer().compute(
            str(song), stub, overview=True, detail=True
        )
        assert expected.overview and expected.detail
        assert said["overview_sha256"] == hashlib.sha256(expected.overview).hexdigest()
        assert said["detail_sha256"] == hashlib.sha256(expected.detail).hexdigest()
        assert said["duration_ms"] == expected.duration_ms
        assert said["loudness"] == {
            "integrated_lufs": expected.loudness.integrated_lufs,
            "peak_dbfs": expected.loudness.peak_dbfs,
            "reason": expected.loudness.reason,
        }

    def test_a_file_that_does_not_analyse_is_exit_one_with_the_reason(
        self, stub, tmp_path
    ):
        import json

        result = self._run(str(stub), str(tmp_path / "missing.flac"))
        assert result.returncode == 1
        said = json.loads(result.stdout.decode().splitlines()[-1])
        assert said["outcome"] != "ready"
        assert said["overview_sha256"] is None

    def test_a_worker_that_cannot_start_is_a_fall_back_and_exit_one(
        self, stub, song, monkeypatch
    ):
        """Not a silent pass: the line says ``worker: false``."""
        import json

        from cuepoint.services import analysis_worker_client as client

        monkeypatch.setattr(
            client, "worker_command", lambda: [sys.executable, "-c", "raise SystemExit"]
        )
        out = io.StringIO()
        monkeypatch.setattr(sys, "stdout", out)
        assert analysis_worker.selftest(str(stub), str(song)) == 1
        said = json.loads(out.getvalue().splitlines()[-1])
        assert said["worker"] is False
        assert said["worker_pid"] is None

    def test_the_wrong_arguments_say_how_to_call_it(self):
        result = self._run("only-one")
        assert result.returncode == 2
        assert b"--analysis-selftest DECODER FILE" in result.stderr
