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
    def test_the_engine_from_source_starts_and_is_measured(self):
        summary = bench.measure(bench.source_command(), runs=1, timeout=90)
        assert summary.runs_ms[0] > 0
