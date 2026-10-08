#!/usr/bin/env python3
"""Measure how long the engine takes to start: process launch to a healthy ``/health``.

Phase 12 records this as part of its baseline (PRUNE-01) and compares against
it when the phase closes (PRUNE-08): a cleanup must not make the engine start
slower. It is the same wait the desktop app's supervisor makes before it
reports the engine connected.

Each run is a first launch. The engine gets an empty temporary home (its data,
config and cache directories all point into it), so a run never reads or writes
the user's library, and every run creates its database from nothing, as a fresh
install does. The process and everything it started are stopped after each run.

Usage::

    python scripts/bench_engine_start.py                     # from source
    python scripts/bench_engine_start.py --exe apps/desktop-electron/resources/engine/win-x64/cuepoint-engine.exe
    python scripts/bench_engine_start.py --runs 7 --json start.json

The first run of a packaged one-file build also pays for the operating system
reading the executable from disk, which is why the first run and the median
are reported apart.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT_ROOT / "src"

#: The longest a run may take before it counts as "never started". It matches
#: ``scripts/build_engine_sidecar.py``'s smoke bound: a bound, not a budget.
DEFAULT_TIMEOUT_SECONDS = 90.0
POLL_SECONDS = 0.02
DEFAULT_RUNS = 5


class StartError(RuntimeError):
    """The engine exited, or never answered, before it was healthy."""


@dataclass
class StartSummary:
    command: list[str]
    runs_ms: list[float]
    first_ms: float
    median_ms: float
    min_ms: float
    max_ms: float


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def isolated_environment(home: Path, port: int, token: str) -> dict[str, str]:
    """The engine's environment: loopback, a token, and a home of its own.

    Every directory the engine resolves data, config or cache from is pointed
    into ``home``: ``CUEPOINT_HOME``, the user's home, and the Windows and XDG
    locations ``cuepoint.utils.paths`` reads.
    """
    env = os.environ.copy()
    env.update(
        {
            "CUEPOINT_HOST": "127.0.0.1",
            "CUEPOINT_PORT": str(port),
            "CUEPOINT_TOKEN": token,
            "CUEPOINT_HEADLESS": "1",
            "CUEPOINT_HOME": str(home / ".cuepoint"),
            "HOME": str(home),
            "USERPROFILE": str(home),
            "APPDATA": str(home / "AppData" / "Roaming"),
            "LOCALAPPDATA": str(home / "AppData" / "Local"),
            "XDG_CONFIG_HOME": str(home / ".config"),
            "XDG_DATA_HOME": str(home / ".local" / "share"),
            "XDG_CACHE_HOME": str(home / ".cache"),
        }
    )
    pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = os.pathsep.join(p for p in (str(SOURCE_ROOT), pythonpath) if p)
    return env


def source_command() -> list[str]:
    return [sys.executable, "-m", "cuepoint.engine"]


def _healthy(port: int) -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/health", timeout=1
        ) as resp:
            if resp.status != 200:
                return False
            return json.loads(resp.read().decode("utf-8")).get("status") == "ok"
    except (OSError, urllib.error.URLError, ValueError):
        return False


def stop_process_tree(proc: subprocess.Popen[bytes]) -> None:
    """Stop the engine and anything it started (a one-file build is two processes)."""
    if proc.poll() is None:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(proc.pid)],
                capture_output=True,
                check=False,
            )
        else:
            proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)


def measure_once(
    command: Sequence[str], timeout: float = DEFAULT_TIMEOUT_SECONDS
) -> float:
    """One launch, in milliseconds from ``Popen`` to the first healthy answer."""
    # Windows can hold a just-killed process's files for a moment.
    with tempfile.TemporaryDirectory(
        prefix="cuepoint-start-", ignore_cleanup_errors=True
    ) as tmp:
        home = Path(tmp)
        port = free_port()
        env = isolated_environment(home, port, token="bench-start-token")
        # A file, not a pipe: an engine that logs more than a pipe holds
        # would block on the write and never become healthy.
        log_path = home / "engine-stderr.log"
        with log_path.open("wb") as log:
            started = time.perf_counter()
            proc = subprocess.Popen(
                list(command),
                env=env,
                cwd=str(home),
                stdout=subprocess.DEVNULL,
                stderr=log,
            )
            try:
                deadline = started + timeout
                while time.perf_counter() < deadline:
                    if _healthy(port):
                        return (time.perf_counter() - started) * 1000.0
                    if proc.poll() is not None:
                        log.flush()
                        detail = log_path.read_text(encoding="utf-8", errors="replace")
                        raise StartError(
                            f"the engine exited with code {proc.returncode} before it "
                            f"was healthy: {detail.strip()[-500:]}"
                        )
                    time.sleep(POLL_SECONDS)
                log.flush()
                detail = log_path.read_text(encoding="utf-8", errors="replace")
                message = f"the engine did not answer /health within {timeout:.0f}s"
                if detail.strip():
                    message += f"; its log ends: {detail.strip()[-500:]}"
                raise StartError(message)
            finally:
                stop_process_tree(proc)


def measure(
    command: Sequence[str],
    runs: int = DEFAULT_RUNS,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> StartSummary:
    if runs < 1:
        raise ValueError("runs must be at least 1")
    times = [round(measure_once(command, timeout), 1) for _ in range(runs)]
    return StartSummary(
        command=list(command),
        runs_ms=times,
        first_ms=times[0],
        median_ms=round(statistics.median(times), 1),
        min_ms=min(times),
        max_ms=max(times),
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument(
        "--exe", type=Path, help="a packaged engine; default: from source"
    )
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS)
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument(
        "--json", type=Path, dest="json_path", help="write the result here"
    )
    args = parser.parse_args(argv)

    if args.exe is not None and not args.exe.is_file():
        print(f"No engine at {args.exe}", file=sys.stderr)
        return 2
    command = [str(args.exe.resolve())] if args.exe else source_command()
    try:
        summary = measure(command, runs=args.runs, timeout=args.timeout)
    except (StartError, ValueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"engine start, {len(summary.runs_ms)} runs: {' '.join(command)}")
    print(f"  first  {summary.first_ms:8.1f} ms")
    print(f"  median {summary.median_ms:8.1f} ms")
    print(f"  min    {summary.min_ms:8.1f} ms")
    print(f"  max    {summary.max_ms:8.1f} ms")
    if args.json_path:
        args.json_path.write_text(
            json.dumps(asdict(summary), indent=2) + "\n", encoding="utf-8"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
