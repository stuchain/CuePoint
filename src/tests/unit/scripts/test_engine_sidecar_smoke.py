"""The sidecar build's health smoke stops everything it started.

A one-file PyInstaller build runs as a bootloader that starts the engine as a
child. On Windows the smoke test terminated only the bootloader, so every build
left an engine running — listening, and holding ``cuepoint-engine.exe`` open —
and the next build failed replacing it with "Access is denied". Found during
CLEAN-11, where it made the packaged proof run the previous build's engine.

The regression test reproduces the shape with two Python processes: a parent
that starts a sleeping child, as the bootloader does. It fails against the
terminate-only code, which leaves the child alive.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import time
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]


def _load():
    spec = importlib.util.spec_from_file_location(
        "build_engine_sidecar_smoke", _REPO_ROOT / "scripts" / "build_engine_sidecar.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _running_on_windows(pid: int) -> bool:
    listed = subprocess.run(
        ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
        capture_output=True,
        text=True,
        check=False,
    ).stdout
    return str(pid) in listed


@pytest.mark.unit
@pytest.mark.skipif(
    sys.platform != "win32", reason="the bootloader orphan is Windows' behaviour"
)
def test_a_child_the_sidecar_started_is_stopped_with_it(tmp_path):
    builder = _load()
    child_pid_file = tmp_path / "child.pid"
    bootloader = (
        "import subprocess, sys, time\n"
        "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])\n"
        f"open(r'{child_pid_file}', 'w').write(str(child.pid))\n"
        "time.sleep(120)\n"
    )
    parent = subprocess.Popen([sys.executable, "-c", bootloader])
    deadline = time.monotonic() + 30
    while not child_pid_file.exists() or not child_pid_file.read_text():
        assert time.monotonic() < deadline, "the child never started"
        time.sleep(0.05)
    child_pid = int(child_pid_file.read_text())
    assert _running_on_windows(child_pid)

    try:
        builder._stop_process_tree(parent)

        deadline = time.monotonic() + 10
        while _running_on_windows(child_pid) and time.monotonic() < deadline:
            time.sleep(0.1)
        assert parent.poll() is not None
        assert not _running_on_windows(child_pid), "the engine child was left running"
    finally:
        subprocess.run(
            ["taskkill", "/T", "/F", "/PID", str(child_pid)],
            capture_output=True,
            check=False,
        )


class _Process:
    pid = 4321

    def __init__(self) -> None:
        self.terminated = False

    def terminate(self) -> None:
        self.terminated = True

    def wait(self, timeout: float) -> int:
        return 0

    def kill(self) -> None:  # pragma: no cover - only after a timeout
        raise AssertionError("not expected")


@pytest.mark.unit
def test_windows_stops_the_tree(monkeypatch):
    builder = _load()
    calls = []
    monkeypatch.setattr(
        builder.subprocess, "run", lambda args, **kwargs: calls.append(args)
    )
    process = _Process()

    builder._stop_process_tree(process, system="win32")

    assert calls == [["taskkill", "/T", "/F", "/PID", "4321"]]
    assert process.terminated is False


@pytest.mark.unit
def test_elsewhere_the_bootloader_forwards_the_signal(monkeypatch):
    builder = _load()
    monkeypatch.setattr(
        builder.subprocess,
        "run",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("no taskkill")),
    )
    process = _Process()

    builder._stop_process_tree(process, system="darwin")

    assert process.terminated is True
