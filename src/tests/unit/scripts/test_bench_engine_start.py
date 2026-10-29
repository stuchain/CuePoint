#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for the engine start bench (scripts/bench_engine_start.py, PRUNE-01).

Phase 12 records the engine's start as part of its baseline, and PRUNE-08
holds the cleanup to it, so the number has to mean what it says: the time from
launch to a healthy ``/health``, with every run a first launch that never
touches the user's data.

A stand-in engine (a few lines of ``http.server``) plays the engine, so these
tests are fast and need no database. One test starts the real engine from
source, so the bench is known to work against the thing it measures.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import textwrap
from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "bench_engine_start.py"


def _load_script_module():
    spec = importlib.util.spec_from_file_location("bench_engine_start", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bench = _load_script_module()

pytestmark = pytest.mark.unit

#: A stand-in engine: healthy after ``DELAY`` seconds, and it writes the
#: environment it was given to ``seen.json`` in its working directory.
FAKE_ENGINE = textwrap.dedent(
    """
    import http.server, json, os, socketserver, sys, time

    mode = sys.argv[1]
    with open("seen.json", "w") as fh:
        json.dump({k: v for k, v in os.environ.items() if k.isupper()}, fh)
    with open(os.environ["RECORD"], "a") as fh:
        fh.write(os.getcwd() + "\\n")
    if mode == "exit":
        sys.stderr.write("could not open the database\\n")
        sys.exit(3)
    if mode == "noisy":
        sys.stderr.write("x" * 200_000)
    time.sleep(float(os.environ.get("DELAY", "0.2")))
    if mode == "hang":
        sys.stderr.write("still starting up\\n")
        sys.stderr.flush()
        time.sleep(60)

    class Health(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"status": "ok"}).encode()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    class Server(http.server.HTTPServer):
        def server_bind(self):
            # HTTPServer.server_bind asks getfqdn() for the host's name, which
            # blocks on reverse DNS for tens of seconds on some macOS runners.
            socketserver.TCPServer.server_bind(self)
            self.server_name, self.server_port = self.server_address[:2]

    port = int(os.environ["CUEPOINT_PORT"])
    Server(("127.0.0.1", port), Health).serve_forever()
    """
)


@pytest.fixture()
def fake_engine(tmp_path, monkeypatch):
    script = tmp_path / "fake_engine.py"
    script.write_text(FAKE_ENGINE, encoding="utf-8")
    record = tmp_path / "launches.txt"
    monkeypatch.setenv("RECORD", str(record))
    monkeypatch.setenv("DELAY", "0.2")

    def command(mode: str = "ok") -> list[str]:
        return [sys.executable, str(script), mode]

    command.record = record  # type: ignore[attr-defined]
    return command


class TestMeasure:
    def test_each_run_is_timed_to_the_first_healthy_answer(self, fake_engine):
        summary = bench.measure(fake_engine(), runs=3, timeout=30)
        assert len(summary.runs_ms) == 3
        # The stand-in waits 0.2s before it listens: no run can be faster.
        assert all(ms >= 200 for ms in summary.runs_ms)
        assert summary.first_ms == summary.runs_ms[0]
        assert summary.min_ms <= summary.median_ms <= summary.max_ms

    def test_every_run_starts_in_a_fresh_home_that_is_then_removed(self, fake_engine):
        bench.measure(fake_engine(), runs=2, timeout=30)
        homes = fake_engine.record.read_text().split()
        assert len(homes) == 2 and homes[0] != homes[1]
        assert not any(Path(h).exists() for h in homes)

    def test_a_noisy_engine_does_not_block(self, fake_engine):
        assert bench.measure_once(fake_engine("noisy"), timeout=30) >= 200

    def test_an_engine_that_exits_is_a_failure_with_its_reason(self, fake_engine):
        with pytest.raises(
            bench.StartError, match="code 3.*could not open the database"
        ):
            bench.measure_once(fake_engine("exit"), timeout=30)

    def test_an_engine_that_never_answers_times_out_and_is_stopped(
        self, fake_engine, monkeypatch
    ):
        monkeypatch.setenv("DELAY", "0")
        with pytest.raises(bench.StartError, match="did not answer /health within 1s"):
            bench.measure_once(fake_engine("hang"), timeout=1)

    def test_a_timeout_carries_the_tail_of_the_engines_own_log(
        self, fake_engine, monkeypatch
    ):
        # "did not answer" alone says nothing about where the engine was stuck.
        monkeypatch.setenv("DELAY", "0")
        with pytest.raises(bench.StartError, match="within 2s.*still starting up"):
            bench.measure_once(fake_engine("hang"), timeout=2)

    def test_runs_must_be_positive(self, fake_engine):
        with pytest.raises(ValueError):
            bench.measure(fake_engine(), runs=0)


class TestIsolation:
    def test_every_data_location_points_into_the_runs_home(self, tmp_path):
        env = bench.isolated_environment(tmp_path, 4242, "t")
        assert env["CUEPOINT_PORT"] == "4242"
        assert env["CUEPOINT_HOST"] == "127.0.0.1"
        assert env["CUEPOINT_TOKEN"] == "t"
        for key in (
            "CUEPOINT_HOME",
            "HOME",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
            "XDG_CONFIG_HOME",
            "XDG_DATA_HOME",
            "XDG_CACHE_HOME",
        ):
            assert Path(env[key]).is_relative_to(tmp_path), key
        assert env["PYTHONPATH"].split(os.pathsep)[0] == str(bench.SOURCE_ROOT)

    def test_the_engine_sees_that_environment(self, fake_engine, tmp_path, monkeypatch):
        seen: dict[str, str] = {}
        original = bench.stop_process_tree

        def capture(proc):
            home = Path(fake_engine.record.read_text().split()[-1])
            seen.update(json.loads((home / "seen.json").read_text()))
            original(proc)

        monkeypatch.setattr(bench, "stop_process_tree", capture)
        bench.measure_once(fake_engine(), timeout=30)
        # Resolved: on macOS the temp dir is /var/..., a link to /private/var/...,
        # and the engine may report either spelling of the same place.
        home = Path(fake_engine.record.read_text().split()[-1]).resolve()
        assert Path(seen["CUEPOINT_HOME"]).resolve().is_relative_to(home)
        assert Path(seen["APPDATA"]).resolve().is_relative_to(home)


class TestCommandLine:
    def test_a_missing_executable_is_refused(self, tmp_path, capsys):
        assert bench.main(["--exe", str(tmp_path / "nope.exe")]) == 2
        assert "No engine at" in capsys.readouterr().err

    def test_a_failure_exits_one(self, fake_engine, monkeypatch, capsys):
        monkeypatch.setattr(bench, "source_command", lambda: fake_engine("exit"))
        assert bench.main(["--runs", "1"]) == 1
        assert "FAIL:" in capsys.readouterr().err

    def test_the_summary_is_printed_and_written(
        self, fake_engine, monkeypatch, tmp_path, capsys
    ):
        monkeypatch.setattr(bench, "source_command", lambda: fake_engine())
        out = tmp_path / "start.json"
        assert bench.main(["--runs", "2", "--json", str(out)]) == 0
        printed = capsys.readouterr().out
        assert "median" in printed and "first" in printed
        data = json.loads(out.read_text())
        assert len(data["runs_ms"]) == 2
        assert set(data) == {
            "command",
            "runs_ms",
            "first_ms",
            "median_ms",
            "min_ms",
            "max_ms",
        }


class TestTheRealEngine:
    """The engine from source, once.

    PRUNE-08 recorded these tests timing out on the macOS runner. The cause was
    ``HTTPServer.server_bind``, which asks ``socket.getfqdn`` for the server's name: on a
    Mac whose name does not resolve that is a reverse DNS lookup of tens of seconds before
    anything listens, in the stand-in engine above and in the engine itself. Both bind
    without it now (308c30c7 and 15c002ca, a day after the phase's note), and the bench
    sends its requests with no proxy, so neither a runner's proxy variables nor the
    system's settings can stand between it and a healthy engine (``TestNoProxy``). The
    timeout was not reproduced on a Mac from here; HARDEN-07's scale run starts this engine
    on both Macs, and a start there that is slow again would show in its budget.
    """

    def test_the_engine_from_source_starts_and_is_measured(self):
        summary = bench.measure(bench.source_command(), runs=1, timeout=90)
        assert summary.runs_ms[0] > 0


#: A stand-in engine for a full library: it listens at once, takes a backup after 0.3 s and
#: says ``upgrading`` until 0.6 s, then ``ok`` (or the state named by ``STATE`` at the end).
FAKE_LIBRARY_ENGINE = textwrap.dedent(
    """
    import http.server, json, os, socketserver, sys, threading, time
    from pathlib import Path

    started = time.monotonic()
    home = Path(os.environ["CUEPOINT_HOME"])

    def backup():
        time.sleep(0.3)
        (home / "backups").mkdir(parents=True, exist_ok=True)
        (home / "backups" / ".launch.partial").write_text("x")
        (home / "backups" / "launch-1.db").write_text("x")

    threading.Thread(target=backup, daemon=True).start()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                body = {"status": "ok"}
            else:
                assert self.headers.get("Authorization") == "Bearer " + os.environ["CUEPOINT_TOKEN"]
                late = time.monotonic() - started > 0.6
                body = {"library": {"state": os.environ.get("STATE", "ok") if late else "upgrading"}}
            data = json.dumps(body).encode()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args):
            pass

    class Server(http.server.HTTPServer):
        def server_bind(self):
            socketserver.TCPServer.server_bind(self)
            self.server_name, self.server_port = self.server_address[:2]

    Server(("127.0.0.1", int(os.environ["CUEPOINT_PORT"])), Handler).serve_forever()
    """
)


class TestAFullLibrary:
    @pytest.fixture()
    def engine(self, tmp_path):
        script = tmp_path / "fake_library_engine.py"
        script.write_text(FAKE_LIBRARY_ENGINE, encoding="utf-8")
        home = tmp_path / "run" / ".cuepoint"
        home.mkdir(parents=True)
        return [sys.executable, str(script)], home

    def test_the_timeline_runs_from_first_health_through_the_copy_to_ok(self, engine):
        command, home = engine
        timeline = bench.measure_library_once(command, home, timeout=60)
        assert 0 < timeline["first_health_ms"] < timeline["state_ok_ms"]
        # The copy is seen once it is a finished file, not while it is a dot file being written.
        assert 250 <= timeline["backup_made_ms"] < timeline["state_ok_ms"]
        assert timeline["state_ok_ms"] >= 600

    def test_a_library_that_comes_up_damaged_is_a_failure_not_a_wait(
        self, engine, monkeypatch
    ):
        command, home = engine
        monkeypatch.setenv("STATE", "damaged")
        with pytest.raises(bench.StartError, match="came up damaged"):
            bench.measure_library_once(command, home, timeout=60)

    def test_a_library_that_never_gets_ready_times_out_with_the_timeline(
        self, engine, monkeypatch
    ):
        command, home = engine
        monkeypatch.setenv("STATE", "upgrading")
        with pytest.raises(bench.StartError, match="not ok within 2s.*first_health_ms"):
            bench.measure_library_once(command, home, timeout=2)

    def test_the_medians_become_the_budgeted_metrics(self):
        ready = [
            {"first_health_ms": 700.0, "backup_made_ms": 2000.0, "state_ok_ms": 2100.0},
            {"first_health_ms": 900.0, "backup_made_ms": 2200.0, "state_ok_ms": 2400.0},
            {"first_health_ms": 800.0, "backup_made_ms": 2100.0, "state_ok_ms": 2200.0},
        ]
        pending = [
            {"first_health_ms": 800.0, "backup_made_ms": 2000.0, "state_ok_ms": 3000.0}
        ]
        assert bench.library_metrics(ready, pending, 0.7) == {
            "first_health_ms": 800.0,
            "launch_backup_s": 2.1,
            "state_ok_s": 2.2,
            "pending_state_ok_s": 3.0,
            "pending_migrate_s": 1.0,
            "quick_check_s": 0.7,
        }

    def test_the_newest_migration_can_be_taken_off_a_real_library_and_runs_again(
        self, tmp_path
    ):
        from cuepoint.services.database_service import DatabaseService
        from cuepoint.services.migration_runner import MigrationRunner, pending_versions

        path = tmp_path / "cuepoint.db"
        service = DatabaseService(db_path=path)
        MigrationRunner(service).migrate()
        service.close_all()
        assert pending_versions(path) == []

        version = bench.make_one_pending(path)

        assert version == bench.head_version()
        assert pending_versions(path) == [version]
        service = DatabaseService(db_path=path)
        try:
            applied = MigrationRunner(service).migrate()
        finally:
            service.close_all()
        assert [m.version for m in applied] == [version]
        assert pending_versions(path) == []

    def test_a_migration_without_a_way_back_is_refused_loudly(
        self, monkeypatch, tmp_path
    ):
        monkeypatch.setattr(bench, "DOWNGRADES", {})
        with pytest.raises(bench.StartError, match="add it to DOWNGRADES"):
            bench.make_one_pending(tmp_path / "cuepoint.db")

    def test_a_library_of_fewer_than_a_thousand_tracks_is_refused(self, capsys):
        with pytest.raises(SystemExit):
            bench.main(["--library", "10"])
        assert "at least 1000" in capsys.readouterr().err


class TestNoProxy:
    def test_a_proxy_in_the_environment_is_not_used_for_loopback(
        self, fake_engine, monkeypatch
    ):
        """A proxy variable (a CI runner's) or macOS's system proxy must not stand between the
        bench and the engine on 127.0.0.1: it made a healthy engine look like it never answered."""
        monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9")
        monkeypatch.setenv("http_proxy", "http://127.0.0.1:9")
        monkeypatch.delenv("NO_PROXY", raising=False)
        monkeypatch.delenv("no_proxy", raising=False)
        assert bench.measure_once(fake_engine(), timeout=30) >= 200
