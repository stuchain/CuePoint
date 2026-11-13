#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine's stall watchdog (ELECTRON-3): a stack is left behind when the process freezes."""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from cuepoint.engine import stall_watchdog

_SRC = Path(__file__).resolve().parents[3]


def _run(script: str, *args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, PYTHONPATH=str(_SRC))
    return subprocess.run(
        [sys.executable, "-c", textwrap.dedent(script), *args],
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )


_ARM = """
    import sys, time
    from pathlib import Path
    from cuepoint.engine.stall_watchdog import arm_stall_watchdog
    path = Path(sys.argv[1])
    wd = arm_stall_watchdog(path, timeout_seconds=1.0, rearm_seconds=0.2)
    assert wd is not None
"""


@pytest.mark.unit
class TestStallWatchdog:
    def test_a_blocked_ticker_makes_a_dump(self, tmp_path):
        path = tmp_path / "engine-stall.txt"
        result = _run(
            _ARM
            + """
    time.sleep(0.5)
    wd.stop_ticker()  # stands in for a GIL held by something that never returns
    time.sleep(2.6)
    """,
            str(path),
        )
        assert result.returncode == 0, result.stderr
        text = path.read_text(encoding="utf-8", errors="replace")
        assert "armed 20" in text
        assert "Timeout (" in text
        assert "most recent call first" in text

    def test_a_running_ticker_means_no_dump(self, tmp_path):
        path = tmp_path / "engine-stall.txt"
        result = _run(_ARM + "\n    time.sleep(2.6)\n", str(path))
        assert result.returncode == 0, result.stderr
        text = path.read_text(encoding="utf-8")
        assert "Timeout (" not in text
        assert text.count("armed ") == 1

    def test_the_armed_line_carries_the_launch_token(self, tmp_path, monkeypatch):
        path = tmp_path / "engine-stall.txt"
        monkeypatch.setenv(stall_watchdog.STALL_TOKEN_ENV, "abc123;rm")
        watchdog = stall_watchdog.arm_stall_watchdog(path, timeout_seconds=30.0)
        assert watchdog is not None
        try:
            line = path.read_text(encoding="utf-8").splitlines()[0]
        finally:
            watchdog.stop()
        assert line.startswith("armed 20") and line.endswith(" abc123rm")

    def test_the_file_is_truncated_at_each_start(self, tmp_path):
        path = tmp_path / "engine-stall.txt"
        path.write_text(
            "Timeout (0:01:00)!\nold dump from the last run\n", encoding="utf-8"
        )
        watchdog = stall_watchdog.arm_stall_watchdog(
            path, timeout_seconds=30, rearm_seconds=30
        )
        try:
            assert watchdog is not None
            text = path.read_text(encoding="utf-8")
            assert "old dump" not in text
            assert text.startswith("armed ")
        finally:
            if watchdog is not None:
                watchdog.stop()

    def test_the_file_stays_small_and_keeps_a_dump(self, tmp_path):
        path = tmp_path / "engine-stall.txt"
        dog = stall_watchdog.StallWatchdog(
            path, timeout_seconds=30, rearm_seconds=30, max_bytes=200
        )
        assert dog.start()
        try:
            for _ in range(50):
                dog._rearm()
            assert path.read_text(encoding="utf-8").count("armed ") == 1
            os.write(dog._file.fileno(), b"Timeout (0:01:00)!\nstack\n")
            dog._rearm()
            text = path.read_text(encoding="utf-8")
            assert "stack" in text and text.count("armed ") == 2
            for _ in range(50):
                dog._rearm()
            assert path.stat().st_size < 400
        finally:
            dog.stop()

    def test_an_unwritable_place_does_not_raise(self, tmp_path):
        blocker = tmp_path / "not-a-folder"
        blocker.write_text("x", encoding="utf-8")
        assert stall_watchdog.arm_stall_watchdog(blocker / "engine-stall.txt") is None
        # A directory where the file should be.
        assert stall_watchdog.arm_stall_watchdog(tmp_path) is None

    def test_the_path_follows_the_environment(self, tmp_path):
        target = tmp_path / "x" / "stall.txt"
        got = stall_watchdog.stall_file_path(
            {stall_watchdog.STALL_FILE_ENV: str(target)}
        )
        assert got == target
