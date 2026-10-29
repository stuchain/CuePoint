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
    python scripts/bench_engine_start.py --library 50000 --json start-50000.json

The first run of a packaged one-file build also pays for the operating system
reading the executable from disk, which is why the first run and the median
are reported apart.

**With a full library** (``--library N``, HARDEN-07) the engine starts on a home
holding an N-track library with Clean's data (matches, candidates, decisions,
overrides, file checks, artwork) and a waveform store, built once and copied for
every run. The engine binds its port before it works out the library's state
(HARDEN-03), so two times are taken from the same launch: the first ``/health``
and the moment ``/api/v1/status`` says the library is ``ok``. Between them it
takes the launch backup and runs any migration. Two launches are timed:

- *none pending*: the library is at this build's version (the launch backup, then
  the state);
- *one pending*: the newest migration is taken back off the copy first, so the
  engine takes the pre-upgrade copy and applies it.

``PRAGMA quick_check`` on the same library is timed too (HARDEN-03). The report
is held to ``scripts/budgets.json`` and the run exits 1 when it is over.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import sqlite3
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(Path(__file__).resolve().parent))

import budget_check  # noqa: E402

#: The longest a run may take before it counts as "never started". It matches
#: ``scripts/build_engine_sidecar.py``'s smoke bound: a bound, not a budget.
DEFAULT_TIMEOUT_SECONDS = 90.0
POLL_SECONDS = 0.02
DEFAULT_RUNS = 5

#: Runs of each launch with a full library (a copy of a few hundred MB each).
LIBRARY_RUNS = 3

#: The longest a full library may take to reach ``ok``.
LIBRARY_TIMEOUT_SECONDS = 600.0

#: Library states that will not become ``ok`` by waiting.
_STUCK_STATES = ("damaged", "too_new", "upgrade_failed", "needs_space")

#: The engine's own token for the status route.
TOKEN = "bench-start-token"

#: Every request here goes straight to loopback: a proxy from the environment (a CI
#: runner's) or the system's (macOS reads its network settings per request) has no
#: business with it and can make an engine look like it never answered.
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


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
        with _OPENER.open(f"http://127.0.0.1:{port}/health", timeout=1) as resp:
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


# ---------------------------------------------------------------------------
# With a full library (HARDEN-07)
# ---------------------------------------------------------------------------


def _downgrade_m0033(connection: sqlite3.Connection) -> None:
    """Take m0033 (search and sort keys) back off a library."""
    connection.execute("DROP INDEX IF EXISTS idx_tracks_artist_title")
    for table, column in (
        ("tracks", "title_search_key"),
        ("tracks", "artist_search_key"),
        ("tracks", "album_search_key"),
        ("tracks", "label_search_key"),
        ("track_metadata", "label_search_key"),
    ):
        connection.execute(f"ALTER TABLE {table} DROP COLUMN {column}")


#: How to take each migration that may be the newest back off a library, by version. A
#: migration added after the last one here needs its entry: ``test_bench_engine_start``
#: fails until it has one, so the pending launch is never silently skipped.
DOWNGRADES: Dict[int, Callable[[sqlite3.Connection], None]] = {33: _downgrade_m0033}


def head_version() -> int:
    from cuepoint.services.migration_runner import _discovered

    return max(m.version for m in _discovered())


def make_one_pending(db_path: Path) -> int:
    """Take the newest migration off the library at ``db_path``; return its version."""
    version = head_version()
    if version not in DOWNGRADES:
        raise StartError(
            f"no way to take m{version:04d} back off a library: add it to DOWNGRADES"
        )
    connection = sqlite3.connect(str(db_path))
    try:
        with connection:
            DOWNGRADES[version](connection)
            connection.execute(
                "DELETE FROM schema_version WHERE version = ?", (version,)
            )
    finally:
        connection.close()
    return version


def build_library_home(total: int, home: Path) -> Dict[str, Any]:
    """A home holding ``total`` tracks with Clean's data and a waveform store.

    Built in this process with ``bench_clean.seed`` and ``bench_library``'s
    waveform seeding, then closed and checkpointed so a copy of the folder is the
    whole library. ``home`` is the folder the engine will be given as
    ``CUEPOINT_HOME``.
    """
    import bench_clean
    import bench_library
    from cuepoint.persistence.waveform_store import (
        WaveformStore,
        default_waveform_store_path,
    )

    home.mkdir(parents=True, exist_ok=True)
    database_path = home / "cuepoint.db"
    started = time.perf_counter()
    seeded = bench_clean.seed(total, home.parent / "seed", database_path)
    db = seeded["db"]
    store = WaveformStore(default_waveform_store_path(database_path))
    bench_library.seed_spread_inputs(db, store)
    store.close_all()
    db.connect().execute("PRAGMA wal_checkpoint(TRUNCATE)")
    db.close_all()
    from cuepoint.utils.di_container import reset_container

    reset_container()
    waveforms = default_waveform_store_path(database_path)
    return {
        "build_seconds": round(time.perf_counter() - started, 1),
        "database_mb": round(database_path.stat().st_size / 1_048_576, 1),
        "waveform_store_mb": round(waveforms.stat().st_size / 1_048_576, 1),
    }


def _library_state(port: int) -> Optional[str]:
    """The library's state from ``/api/v1/status``, or None while it does not answer."""
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/v1/status",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    try:
        with _OPENER.open(request, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))["library"]["state"]
    except (OSError, urllib.error.URLError, ValueError, KeyError):
        return None


def _backup_made(backups: Path) -> bool:
    """Whether a finished backup is in the folder (a copy being written is a dot file)."""
    try:
        return any(
            not entry.name.startswith(".") and not entry.name.endswith(".partial")
            for entry in backups.iterdir()
        )
    except OSError:
        return False


def measure_library_once(
    command: Sequence[str], home: Path, timeout: float = LIBRARY_TIMEOUT_SECONDS
) -> Dict[str, Any]:
    """One launch on the prepared ``home``, as a timeline in milliseconds from ``Popen``.

    ``first_health_ms`` is the first ``200`` from ``/health``; ``backup_made_ms`` the
    moment the launch (or pre-upgrade) copy is in the backup folder (None when no copy
    was taken); ``state_ok_ms`` the first status that says the library is ``ok``.
    """
    environment_home = home.parent
    port = free_port()
    env = isolated_environment(environment_home, port, token=TOKEN)
    backups = home / "backups"
    log_path = environment_home / "engine-stderr.log"
    timeline: Dict[str, Any] = {
        "first_health_ms": None,
        "backup_made_ms": None,
        "state_ok_ms": None,
    }
    with log_path.open("wb") as log:
        started = time.perf_counter()
        proc = subprocess.Popen(
            list(command),
            env=env,
            cwd=str(environment_home),
            stdout=subprocess.DEVNULL,
            stderr=log,
        )
        try:
            while True:
                now = (time.perf_counter() - started) * 1000.0
                if now > timeout * 1000.0:
                    log.flush()
                    detail = log_path.read_text(encoding="utf-8", errors="replace")
                    raise StartError(
                        f"the library was not ok within {timeout:.0f}s "
                        f"(timeline {timeline}); the log ends: {detail.strip()[-500:]}"
                    )
                if proc.poll() is not None:
                    log.flush()
                    detail = log_path.read_text(encoding="utf-8", errors="replace")
                    raise StartError(
                        f"the engine exited with code {proc.returncode}: "
                        f"{detail.strip()[-500:]}"
                    )
                if timeline["backup_made_ms"] is None and _backup_made(backups):
                    timeline["backup_made_ms"] = round(now, 1)
                if timeline["first_health_ms"] is None:
                    if _healthy(port):
                        timeline["first_health_ms"] = round(now, 1)
                else:
                    state = _library_state(port)
                    if state == "ok":
                        timeline["state_ok_ms"] = round(now, 1)
                        return timeline
                    if state in _STUCK_STATES:
                        raise StartError(f"the library came up {state}: {timeline}")
                time.sleep(POLL_SECONDS)
        finally:
            stop_process_tree(proc)


def _median(runs: List[Dict[str, Any]], key: str) -> Optional[float]:
    values = [run[key] for run in runs if run[key] is not None]
    return round(statistics.median(values), 1) if values else None


def library_metrics(
    none_pending: List[Dict[str, Any]],
    one_pending: List[Dict[str, Any]],
    quick_check_s: float,
) -> Dict[str, float]:
    """The numbers held to ``scripts/budgets.json``, from the launches' medians."""
    health = _median(none_pending, "first_health_ms")
    state_ok = _median(none_pending, "state_ok_ms")
    backup = _median(none_pending, "backup_made_ms")
    pending_ok = _median(one_pending, "state_ok_ms")
    pending_backup = _median(one_pending, "backup_made_ms")
    assert health is not None and state_ok is not None and pending_ok is not None
    return {
        "first_health_ms": health,
        "launch_backup_s": round((backup or 0.0) / 1000.0, 3),
        "state_ok_s": round(state_ok / 1000.0, 3),
        "pending_state_ok_s": round(pending_ok / 1000.0, 3),
        "pending_migrate_s": round((pending_ok - (pending_backup or 0.0)) / 1000.0, 3),
        "quick_check_s": round(quick_check_s, 3),
    }


def time_quick_check(db_path: Path) -> float:
    """Seconds ``PRAGMA quick_check`` takes on the library, as the engine runs it."""
    from cuepoint.engine import library_state

    started = time.perf_counter()
    healthy = library_state._quick_check(db_path)
    elapsed = time.perf_counter() - started
    if not healthy:
        raise StartError("quick_check found damage in the library the bench built")
    return elapsed


def measure_library(
    command: Sequence[str],
    total: int,
    runs: int = LIBRARY_RUNS,
    timeout: float = LIBRARY_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """Build the library once, then launch the engine on copies of it."""
    if runs < 1:
        raise ValueError("runs must be at least 1")
    with tempfile.TemporaryDirectory(
        prefix="cuepoint-start-library-", ignore_cleanup_errors=True
    ) as tmp:
        root = Path(tmp)
        template = root / "template" / ".cuepoint"
        built = build_library_home(total, template)
        quick_check_s = time_quick_check(template / "cuepoint.db")

        def launch(pending: bool, n: int) -> Dict[str, Any]:
            home = root / f"run-{'pending' if pending else 'ready'}-{n}" / ".cuepoint"
            shutil.copytree(template, home)
            if pending:
                make_one_pending(home / "cuepoint.db")
            try:
                return measure_library_once(command, home, timeout)
            finally:
                shutil.rmtree(home.parent, ignore_errors=True)

        none_pending = [launch(False, n) for n in range(runs)]
        one_pending = [launch(True, n) for n in range(runs)]
        pending_version = head_version()
    measured = library_metrics(none_pending, one_pending, quick_check_s)
    return {
        "tracks": total,
        "command": list(command),
        **built,
        "pending_version": pending_version,
        "none_pending": none_pending,
        "one_pending": one_pending,
        "measured": measured,
        "budget": budget_check.evaluate("engine_start", measured, size=total),
    }


def report_library(result: Dict[str, Any]) -> None:
    print(
        f"engine start on {result['tracks']:,} tracks with Clean's data and waveforms "
        f"(library {result['database_mb']} MB, waveforms {result['waveform_store_mb']} MB, "
        f"built in {result['build_seconds']} s)"
    )
    for label in ("none_pending", "one_pending"):
        print(f"  {label.replace('_', ' ')}:")
        for run in result[label]:
            print(
                f"    first /health {run['first_health_ms']} ms, copy made "
                f"{run['backup_made_ms']} ms, library ok {run['state_ok_ms']} ms"
            )
    print("\n".join(budget_check.report_lines(result["budget"])))


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument(
        "--exe", type=Path, help="a packaged engine; default: from source"
    )
    parser.add_argument("--runs", type=int, default=None)
    parser.add_argument("--timeout", type=float, default=None)
    parser.add_argument(
        "--library",
        type=int,
        default=None,
        metavar="TRACKS",
        help="start on a library of this many tracks with Clean's data and waveforms",
    )
    parser.add_argument(
        "--json", type=Path, dest="json_path", help="write the result here"
    )
    args = parser.parse_args(argv)

    if args.exe is not None and not args.exe.is_file():
        print(f"No engine at {args.exe}", file=sys.stderr)
        return 2
    command = [str(args.exe.resolve())] if args.exe else source_command()
    if args.library is not None:
        if args.library < 1000:
            parser.error("--library must be at least 1000")
        try:
            result = measure_library(
                command,
                args.library,
                runs=LIBRARY_RUNS if args.runs is None else args.runs,
                timeout=LIBRARY_TIMEOUT_SECONDS
                if args.timeout is None
                else args.timeout,
            )
        except (StartError, ValueError) as exc:
            print(f"FAIL: {exc}", file=sys.stderr)
            return 1
        report_library(result)
        if args.json_path:
            budget_check.write_json(args.json_path, result)
        for problem in result["budget"]["problems"]:
            print(f"OVER BUDGET: {problem}", file=sys.stderr)
        return 1 if result["budget"]["problems"] else 0
    try:
        summary = measure(
            command,
            runs=DEFAULT_RUNS if args.runs is None else args.runs,
            timeout=DEFAULT_TIMEOUT_SECONDS if args.timeout is None else args.timeout,
        )
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
