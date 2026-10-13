"""The engine health smoke's worker step (C19g): which decoder it uses, and what it needs."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "smoke_engine_health.py"


def _load():
    spec = importlib.util.spec_from_file_location("smoke_engine_health", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


smoke = _load()


def test_the_flag_beats_the_environment_beats_the_sidecar(monkeypatch):
    monkeypatch.setattr(smoke, "_fetched_sidecar", lambda: Path("/fetched/mpv"))
    env = {smoke.DECODER_ENV: "/env/mpv"}
    assert smoke.find_decoder("/flag/mpv", env) == Path("/flag/mpv")
    assert smoke.find_decoder(None, env) == Path("/env/mpv")
    assert smoke.find_decoder(None, {}) == Path("/fetched/mpv")
    assert smoke.find_decoder("", {smoke.DECODER_ENV: ""}) == Path("/fetched/mpv")


def test_with_no_decoder_the_step_is_skipped_and_passes(capsys):
    assert smoke.check_analysis_worker(None) is True
    assert "SKIP: analysis worker (no decoder)" in capsys.readouterr().out


def test_a_decoder_that_is_not_there_fails(tmp_path, capsys):
    assert smoke.check_analysis_worker(tmp_path / "no-mpv") is False
    assert "FAIL: analysis worker" in capsys.readouterr().err


def _selftest_returning(monkeypatch, stdout: str, code: int):
    def run(command, **_kwargs):
        assert command[-3] == "--analysis-selftest"
        assert command[-1] == str(smoke.FIXTURE)
        return subprocess.CompletedProcess(command, code, stdout, "")

    monkeypatch.setattr(smoke.subprocess, "run", run)


def test_a_ready_line_from_the_engine_passes(tmp_path, monkeypatch, capsys):
    decoder = tmp_path / "mpv"
    decoder.write_bytes(b"x")
    _selftest_returning(
        monkeypatch,
        '{"outcome": "ready", "worker_pid": 7, "start_seconds": 0.4}\n',
        0,
    )
    assert smoke.check_analysis_worker(decoder) is True
    assert "OK: analysis worker" in capsys.readouterr().out


@pytest.mark.parametrize(
    "stdout, code",
    [
        ('{"outcome": "failed", "reason": "no_audio"}\n', 1),
        ('{"outcome": "ready"}\n', 1),
        ("", 1),
        ("not json\n", 0),
    ],
)
def test_anything_else_fails(tmp_path, monkeypatch, capsys, stdout, code):
    decoder = tmp_path / "mpv"
    decoder.write_bytes(b"x")
    _selftest_returning(monkeypatch, stdout, code)
    assert smoke.check_analysis_worker(decoder) is False
    assert "FAIL: analysis worker" in capsys.readouterr().err
