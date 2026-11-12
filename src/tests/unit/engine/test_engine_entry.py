#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine's entry point and its startup phase lines (ELECTRON-9).

The frozen sidecar is a windowed build: an exception nobody catches shows a modal
dialog no one sees and leaves a live process with empty output. The entry point
therefore prints the traceback to stderr and exits non-zero, and the engine prints
one short stdout line per startup phase so the app can say how far a slow start got.
"""

from __future__ import annotations

import importlib
import re
import sys
import threading
import time
from pathlib import Path

import pytest

from cuepoint.engine import server
from tests.unit.engine.engine_start import run_engine_to_the_end

_REPO_ROOT = Path(__file__).resolve().parents[4]


def _entry():
    return importlib.import_module("cuepoint.engine.__main__")


@pytest.fixture
def worker_disabled(monkeypatch):
    from cuepoint.services import analysis_worker_client

    monkeypatch.setattr(analysis_worker_client, "enable_worker", lambda: None)


@pytest.mark.unit
class TestEntryWrapper:
    def test_exception_goes_to_stderr_and_exits_non_zero(
        self, monkeypatch, capsys, worker_disabled
    ):
        def boom(*_a, **_k):
            raise RuntimeError("engine blew up early")

        monkeypatch.setattr(server, "run_engine", boom)

        assert _entry()._run_engine() == 1

        captured = capsys.readouterr()
        assert "Traceback" in captured.err
        assert "RuntimeError: engine blew up early" in captured.err

    def test_a_clean_return_is_zero_and_says_imports_are_done(
        self, monkeypatch, capsys, worker_disabled
    ):
        monkeypatch.setattr(server, "run_engine", lambda *a, **k: None)

        assert _entry()._run_engine() == 0
        assert "cuepoint-engine: phase imports-done" in capsys.readouterr().out

    def test_excepthook_is_called_with_the_exception(
        self, monkeypatch, worker_disabled
    ):
        seen = []
        monkeypatch.setattr(sys, "excepthook", lambda *info: seen.append(info))

        def boom(*_a, **_k):
            raise RuntimeError("early")

        monkeypatch.setattr(server, "run_engine", boom)

        assert _entry()._run_engine() == 1
        assert len(seen) == 1
        assert seen[0][0] is RuntimeError and str(seen[0][1]) == "early"

    def test_works_without_a_stderr(self, monkeypatch, worker_disabled):
        monkeypatch.setattr(sys, "stderr", None)

        def boom(*_a, **_k):
            raise RuntimeError("early")

        monkeypatch.setattr(server, "run_engine", boom)

        assert _entry()._run_engine() == 1

    def test_a_failing_excepthook_still_exits_non_zero(
        self, monkeypatch, worker_disabled
    ):
        def bad_hook(*_info):
            raise ValueError("hook broke")

        monkeypatch.setattr(sys, "excepthook", bad_hook)

        def boom(*_a, **_k):
            raise RuntimeError("early")

        monkeypatch.setattr(server, "run_engine", boom)

        assert _entry()._run_engine() == 1

    def test_a_text_exit_code_is_written_to_stderr_and_is_one(
        self, monkeypatch, capsys, worker_disabled
    ):
        def leave(*_a, **_k):
            raise SystemExit("cannot start: port busy")

        monkeypatch.setattr(server, "run_engine", leave)

        assert _entry()._run_engine() == 1
        assert "cannot start: port busy" in capsys.readouterr().err

    def test_a_text_exit_code_without_stderr_is_still_one(
        self, monkeypatch, worker_disabled
    ):
        monkeypatch.setattr(sys, "stderr", None)

        def leave(*_a, **_k):
            raise SystemExit("x")

        monkeypatch.setattr(server, "run_engine", leave)

        assert _entry()._run_engine() == 1

    def test_system_exit_keeps_its_code(self, monkeypatch, worker_disabled):
        def leave(*_a, **_k):
            raise SystemExit(3)

        monkeypatch.setattr(server, "run_engine", leave)

        assert _entry()._run_engine() == 3

    def test_an_import_failure_is_caught_too(self, monkeypatch, capsys):
        from cuepoint.services import analysis_worker_client

        def broken():
            raise ImportError("no module named something")

        monkeypatch.setattr(analysis_worker_client, "enable_worker", broken)

        assert _entry()._run_engine() == 1
        assert "ImportError" in capsys.readouterr().err


@pytest.mark.unit
class TestPhaseLines:
    def test_announce_phase_prints_one_flushed_line(self, capsys):
        server.announce_phase("imports-done")

        assert capsys.readouterr().out == "cuepoint-engine: phase imports-done\n"

    def test_announce_phase_never_raises_without_stdout(self, monkeypatch):
        monkeypatch.setattr("sys.stdout", None)

        server.announce_phase("anything")

    def test_announce_phase_never_raises_when_the_write_fails(self, monkeypatch):
        class Broken:
            def write(self, _text):
                raise OSError("pipe closed")

            def flush(self):
                raise OSError("pipe closed")

        monkeypatch.setattr("sys.stdout", Broken())

        server.announce_phase("anything")

    def test_run_engine_announces_bound_library_and_serving_in_order(
        self, monkeypatch, capsys, tmp_path
    ):
        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path))
        monkeypatch.setattr(server, "backup_library_on_launch", lambda: None)
        run_engine_to_the_end(monkeypatch, port=8123)
        server._LIBRARY_START.join(30)

        lines = [
            line
            for line in capsys.readouterr().out.splitlines()
            if line.startswith("cuepoint-engine: phase ")
        ]
        phases = [line.removeprefix("cuepoint-engine: phase ") for line in lines]
        assert phases[0] == "bound port=8123"
        assert "library-start" in phases
        assert "serving" in phases
        assert phases.index("bound port=8123") < phases.index("serving")

    def test_phases_announced_at_once_stay_whole_lines(self, monkeypatch):
        """Regression: print() wrote a phase and its newline apart, so the
        library thread's phase ran into the main thread's on one line."""

        class SlowStream:
            """A stdout that lets other threads run between writes."""

            def __init__(self) -> None:
                self.text = ""

            def write(self, chunk: str) -> int:
                time.sleep(0.001)
                self.text += chunk
                return len(chunk)

            def flush(self) -> None:
                pass

        stream = SlowStream()
        monkeypatch.setattr(sys, "stdout", stream)
        phases = [f"p{thread}-{n}" for thread in range(4) for n in range(20)]

        def announce(thread: int) -> None:
            for n in range(20):
                server.announce_phase(f"p{thread}-{n}")

        threads = [
            threading.Thread(target=announce, args=(thread,)) for thread in range(4)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(30)

        lines = stream.text.splitlines()
        assert sorted(lines) == sorted(server.PHASE_PREFIX + p for p in phases)

    def test_phase_lines_carry_no_paths(self, monkeypatch, capsys, tmp_path):
        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path))
        monkeypatch.setattr(server, "backup_library_on_launch", lambda: None)
        run_engine_to_the_end(monkeypatch, port=8123)
        server._LIBRARY_START.join(30)

        for line in capsys.readouterr().out.splitlines():
            if line.startswith("cuepoint-engine: phase "):
                assert not re.search(r"[\\/]", line), line
                assert str(tmp_path) not in line


@pytest.mark.unit
class TestSidecarSpec:
    def test_windowed_traceback_dialog_is_disabled(self):
        spec = (_REPO_ROOT / "build" / "engine-sidecar.spec").read_text(
            encoding="utf-8"
        )

        assert "disable_windowed_traceback=True" in spec
        assert "disable_windowed_traceback=False" not in spec
