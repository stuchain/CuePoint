#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine's side of the analysis worker, against fake workers (C19g).

A fake worker is a small Python program that speaks the protocol and misbehaves
as a mode says: dies after its hello, says the wrong hello, answers an
``error``, holds a request until it is cancelled. Each records its pid in a
``spawns`` file, and its answers carry that pid, so a test can tell which child
answered and how many were started. The decoder never runs: what is under test
is the client's bookkeeping, multiplexing, restart and fallback rules.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
from pathlib import Path
from typing import Callable, List, Optional, Tuple

import pytest

from cuepoint.data import audio_decode as ad
from cuepoint.engine.parent_watch import is_alive
from cuepoint.services import analysis_worker_client as client
from cuepoint.services.analysis_worker_client import WorkerComputer
from cuepoint.services.waveform_computer import (
    COMPUTED_CANCELLED,
    COMPUTED_READY,
    Computed,
)

pytestmark = pytest.mark.unit

_SRC = Path(__file__).resolve().parents[3]
DECODER = Path("/opt/cuepoint/mpv")
PATIENCE = 60.0

FAKE = r"""
import os, sys, threading, time
from cuepoint.services import analysis_protocol as wire
from cuepoint.services.waveform_computer import (
    COMPUTED_CANCELLED, COMPUTED_READY, Computed,
)

mode, state = sys.argv[1], sys.argv[2]
pid = os.getpid()
out = sys.stdout.buffer
write_lock = threading.Lock()


def say(raw):
    with write_lock:
        out.write(raw)
        out.flush()


def note(name, text):
    with open(os.path.join(state, name), "a") as handle:
        handle.write(text + "\n")


note("spawns", str(pid))
if mode == "wrong-hello":
    say(b'{"hello": 999}\n')
    time.sleep(60)
if mode == "silent":
    time.sleep(60)
if mode == "die-at-start":
    sys.exit(4)
say(wire.hello_line())
if mode == "chatty":
    for text in (
        "WARNING cuepoint.data.audio_decode: [waveforms] x.flac stalled: tail-warning",
        "INFO cuepoint.data.audio_decode: decoding x.flac again",
        "INFO cuepoint.other: noise",
        "ERROR cuepoint.other: boom-error",
    ):
        sys.stderr.write(text + "\n")
    sys.stderr.flush()

waiting = {}
held = []


def answer(request):
    return Computed(
        COMPUTED_READY,
        overview=(f"{pid}:{request.path}".encode() if request.overview else None),
        duration_ms=1 if request.overview else None,
        detail=(b"detail" if request.detail else None),
    )


for raw in sys.stdin.buffer:
    obj = wire.loads(raw)
    cancelled = wire.parse_cancel(obj)
    if cancelled is not None:
        note("cancels", str(cancelled))
        if cancelled in waiting:
            waiting[cancelled].set()
        continue
    request = wire.parse_request(obj)
    note("requests", request.path)
    if mode == "die-after-hello" or (
        mode == "die-once" and not os.path.exists(os.path.join(state, "died"))
    ):
        note("died", "yes")
        sys.stderr.write("fake-stderr-marker: going down\n")
        sys.stderr.flush()
        os._exit(3)
    if mode == "error-bad" and request.path.endswith("bad.flac"):
        say(wire.error_line(request.id, "RuntimeError: a bug in the fake"))
    elif mode == "gather3":
        held.append(request)
        if len(held) == 3:
            for each in reversed(held):
                say(wire.result_line(each.id, answer(each)))
    elif mode == "hang":
        event = waiting[request.id] = threading.Event()

        def finish(request=request, event=event):
            event.wait(60)
            say(wire.result_line(request.id, Computed(COMPUTED_CANCELLED)))

        threading.Thread(target=finish, daemon=True).start()
    else:
        say(wire.result_line(request.id, answer(request)))
        if mode == "crash-after-answer":
            os._exit(3)
"""


class Fallback:
    """Answers in the engine, and records which files it was asked for."""

    def __init__(self) -> None:
        self.calls: List[str] = []

    def compute(self, path, decoder, *, overview, detail, cancel=None) -> Computed:
        self.calls.append(path)
        return Computed(COMPUTED_READY, overview=b"fallback", duration_ms=1)


class Harness:
    def __init__(self, tmp_path: Path) -> None:
        self.state = tmp_path / "state"
        self.state.mkdir()
        self.script = tmp_path / "fake_worker.py"
        self.script.write_text(FAKE, encoding="utf-8")
        self.fallback = Fallback()
        self.clients: List[WorkerComputer] = []

    def make(self, mode: str, **options) -> WorkerComputer:
        options.setdefault("hello_timeout", PATIENCE)
        made = WorkerComputer(
            command=[sys.executable, str(self.script), mode, str(self.state)],
            fallback=self.fallback,
            **options,
        )
        self.clients.append(made)
        return made

    def spawns(self) -> List[int]:
        return self.lines("spawns", int)

    def lines(self, name: str, kind: Callable = str) -> list:
        path = self.state / name
        if not path.exists():
            return []
        return [kind(line) for line in path.read_text().splitlines()]

    @staticmethod
    def who(computed: Computed) -> Tuple[int, str]:
        assert computed.overview is not None
        pid, path = computed.overview.decode().split(":", 1)
        return int(pid), path


def _alive(pid: int) -> bool:
    # Never os.kill(pid, 0) here: on Windows it ends the process instead of asking.
    if not is_alive(pid):
        return False
    try:
        with open(f"/proc/{pid}/status", encoding="utf-8") as handle:
            return "zombie" not in handle.read()
    except OSError:
        return True


def _gone(pid: int, seconds: float = PATIENCE) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if not _alive(pid):
            return True
        time.sleep(0.02)
    return False


@pytest.fixture
def fake(tmp_path):
    ad._STOPPING.clear()
    harness = Harness(tmp_path)
    yield harness
    ad._STOPPING.clear()
    for made in harness.clients:
        made.close()
    for pid in harness.spawns():
        if _alive(pid):
            try:
                os.kill(pid, 9)
            except OSError:
                pass  # it ended between the look and the kill


def compute(
    made: WorkerComputer,
    path: str = "/music/a.flac",
    *,
    overview: bool = True,
    detail: bool = True,
    cancel: Optional[Callable[[], bool]] = None,
) -> Computed:
    return made.compute(path, DECODER, overview=overview, detail=detail, cancel=cancel)


class TestAnAnswer:
    def test_nothing_starts_until_the_first_file(self, fake):
        fake.make("ok")
        assert fake.spawns() == []

    def test_a_result_is_the_childs_computed(self, fake):
        made = fake.make("ok")
        computed = compute(made, "/Music/Björk – Jóga.flac")
        pid, path = fake.who(computed)
        assert path == "/Music/Björk – Jóga.flac"
        assert (computed.detail, computed.duration_ms) == (b"detail", 1)
        assert fake.spawns() == [pid]
        assert made.pid == pid
        assert fake.fallback.calls == []

    def test_what_was_not_asked_for_is_not_made(self, fake):
        made = fake.make("ok")
        both = compute(made)
        only_overview = compute(made, detail=False)
        only_detail = compute(made, overview=False)
        assert both.overview and both.detail
        assert only_overview.overview and only_overview.detail is None
        assert only_detail.overview is None and only_detail.detail == b"detail"

    def test_one_child_serves_every_file(self, fake):
        made = fake.make("ok")
        pids = {fake.who(compute(made, f"/m/{n}.flac"))[0] for n in range(5)}
        assert len(pids) == 1
        assert len(fake.spawns()) == 1

    def test_three_threads_share_one_child(self, fake):
        """The fake answers only once all three are in flight, in reverse order."""
        made = fake.make("gather3")
        answers = {}

        def ask(name: str) -> None:
            answers[name] = compute(made, f"/m/{name}.flac")

        threads = [threading.Thread(target=ask, args=(n,)) for n in "abc"]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(PATIENCE)
        assert sorted(answers) == ["a", "b", "c"]
        seen = {n: fake.who(answers[n]) for n in answers}
        assert {path for _, path in seen.values()} == {f"/m/{n}.flac" for n in "abc"}
        for name, (_, path) in seen.items():
            assert path == f"/m/{name}.flac"
        assert len({pid for pid, _ in seen.values()}) == 1
        assert len(fake.spawns()) == 1


class TestCancel:
    def test_a_cancel_is_sent_once_and_its_answer_waited_for(self, fake):
        made = fake.make("hang")
        flag = threading.Event()
        result: List[Computed] = []
        thread = threading.Thread(
            target=lambda: result.append(compute(made, cancel=flag.is_set))
        )
        thread.start()
        deadline = time.monotonic() + PATIENCE
        while not fake.lines("requests") and time.monotonic() < deadline:
            time.sleep(0.02)
        time.sleep(0.2)  # polled a few times, still not cancelled
        assert thread.is_alive()
        assert fake.lines("cancels") == []
        flag.set()
        thread.join(PATIENCE)
        assert [r.outcome for r in result] == [COMPUTED_CANCELLED]
        assert len(fake.lines("cancels")) == 1


class TestFailing:
    def _warnings(self, caplog) -> List[str]:
        return [
            r.getMessage()
            for r in caplog.records
            if r.levelno >= logging.WARNING and r.name == client._logger.name
        ]

    def test_a_child_that_dies_is_replaced_and_the_file_answered(self, fake, caplog):
        made = fake.make("die-once")
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            computed = compute(made, "/m/x.flac")
        pid, path = fake.who(computed)
        assert path == "/m/x.flac"
        first, second = fake.spawns()
        assert pid == second != first
        assert fake.fallback.calls == []
        warnings = self._warnings(caplog)
        assert len(warnings) == 1
        assert "fake-stderr-marker" in warnings[0]
        # And it is a one-off: the next file goes to the new child.
        assert fake.who(compute(made))[0] == second

    def test_two_deaths_and_the_engine_analyses_for_good(self, fake, caplog):
        made = fake.make("die-after-hello")
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            first = compute(made, "/m/1.flac")
            second = compute(made, "/m/2.flac")
        assert first.overview == second.overview == b"fallback"
        assert fake.fallback.calls == ["/m/1.flac", "/m/2.flac"]
        # One child, its replacement, and no third.
        assert len(fake.spawns()) == 2
        warnings = self._warnings(caplog)
        assert sum("continues inside the engine" in w for w in warnings) == 1
        assert len(warnings) == 3
        for pid in fake.spawns():
            assert _gone(pid)

    def test_a_wrong_hello_is_a_start_failure(self, fake, caplog):
        made = fake.make("wrong-hello")
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            computed = compute(made)
        assert computed.overview == b"fallback"
        assert any("hello" in w for w in self._warnings(caplog))
        for pid in fake.spawns():
            assert _gone(pid), "a worker of another build was left running"

    def test_no_hello_in_time_is_a_start_failure(self, fake, caplog):
        made = fake.make("silent", hello_timeout=0.5)
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            computed = compute(made)
        assert computed.overview == b"fallback"
        assert any("hello" in w for w in self._warnings(caplog))
        for pid in fake.spawns():
            assert _gone(pid)

    def test_a_child_that_exits_at_once_is_a_start_failure(self, fake, caplog):
        made = fake.make("die-at-start")
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            assert compute(made).overview == b"fallback"
        assert len(fake.spawns()) == 2

    def test_a_command_that_cannot_run_is_a_start_failure(self, tmp_path, caplog):
        fallback = Fallback()
        made = WorkerComputer(
            command=[str(tmp_path / "no-such-program")], fallback=fallback
        )
        try:
            with caplog.at_level(logging.WARNING, logger=client._logger.name):
                assert compute(made).overview == b"fallback"
                assert compute(made).overview == b"fallback"
        finally:
            made.close()
        assert len(fallback.calls) == 2

    def test_an_error_line_sends_that_file_alone_to_the_engine(self, fake, caplog):
        made = fake.make("error-bad")
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            bad = compute(made, "/m/bad.flac")
            good = compute(made, "/m/good.flac")
            bad_again = compute(made, "/m/bad.flac")
        assert bad.overview == bad_again.overview == b"fallback"
        assert fake.who(good)[1] == "/m/good.flac"
        assert fake.fallback.calls == ["/m/bad.flac", "/m/bad.flac"]
        assert len(fake.spawns()) == 1
        assert any("a bug in the fake" in w for w in self._warnings(caplog))


class TestIdle:
    def test_an_idle_child_exits_and_the_next_file_starts_a_fresh_one(
        self, fake, caplog
    ):
        made = fake.make("ok", idle_seconds=0.2)
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            first, _ = fake.who(compute(made))
            assert _gone(first), "the idle worker was not ended"
            second, _ = fake.who(compute(made))
        assert second != first
        assert len(fake.spawns()) == 2
        assert self._quiet(caplog)

    @staticmethod
    def _quiet(caplog) -> bool:
        return not [r for r in caplog.records if r.levelno >= logging.WARNING]

    def test_a_busy_child_is_not_ended(self, fake):
        made = fake.make("hang", idle_seconds=0.2)
        flag = threading.Event()
        thread = threading.Thread(target=lambda: compute(made, cancel=flag.is_set))
        thread.start()
        deadline = time.monotonic() + PATIENCE
        while not fake.spawns() and time.monotonic() < deadline:
            time.sleep(0.02)
        pid = fake.spawns()[0]
        time.sleep(1.0)  # five idle periods, none of them idle
        assert _alive(pid)
        flag.set()
        thread.join(PATIENCE)
        assert _gone(pid)


class TestEnding:
    def test_the_engine_stopping_ends_the_worker_with_the_decoders(self, fake):
        made = fake.make("ok")
        pid, _ = fake.who(compute(made))
        assert ad.terminate_children() == 0  # the count is decoders only
        assert _gone(pid)

    def test_close_ends_the_worker_and_is_idempotent(self, fake):
        made = fake.make("ok")
        pid, _ = fake.who(compute(made))
        made.close()
        made.close()
        assert _gone(pid)
        assert made.pid is None

    def test_close_before_any_file_is_nothing(self, fake):
        fake.make("ok").close()
        assert fake.spawns() == []

    def test_the_worker_is_not_counted_as_a_decoder(self, fake):
        made = fake.make("ok")
        compute(made)
        assert ad.live_children() == 0


class TestSwitches:
    def test_the_environment_overrides_the_flag(self, monkeypatch):
        monkeypatch.setattr(client, "_ENABLED", False)
        monkeypatch.delenv(client.WORKER_ENV, raising=False)
        assert not client.worker_enabled()
        monkeypatch.setenv(client.WORKER_ENV, "1")
        assert client.worker_enabled()
        monkeypatch.setattr(client, "_ENABLED", True)
        monkeypatch.setenv(client.WORKER_ENV, "0")
        assert not client.worker_enabled()
        monkeypatch.setenv(client.WORKER_ENV, "")
        assert client.worker_enabled()
        monkeypatch.delenv(client.WORKER_ENV)
        assert client.worker_enabled()

    def test_enable_worker_turns_the_flag_on(self, monkeypatch):
        monkeypatch.setattr(client, "_ENABLED", False)
        monkeypatch.delenv(client.WORKER_ENV, raising=False)
        client.enable_worker()
        assert client.worker_enabled()

    def test_there_is_no_default_computer_until_enabled(self, monkeypatch):
        monkeypatch.setattr(client, "_ENABLED", False)
        monkeypatch.delenv(client.WORKER_ENV, raising=False)
        assert client.default_computer() is None

    def test_the_shared_computer_is_one_per_process(self, monkeypatch):
        monkeypatch.setattr(client, "_SHARED", [])
        monkeypatch.setenv(client.WORKER_ENV, "1")
        first = client.default_computer()
        assert isinstance(first, WorkerComputer)
        assert client.shared_computer() is first
        assert client.default_computer() is first
        first.close()


class TestCommand:
    def test_from_source_it_runs_the_package_as_a_module(self, monkeypatch):
        monkeypatch.delattr(sys, "frozen", raising=False)
        assert client.worker_command() == [
            sys.executable,
            "-m",
            "cuepoint.engine",
            "--analysis-worker",
        ]

    def test_from_source_the_package_is_on_the_childs_path(self, monkeypatch):
        monkeypatch.delattr(sys, "frozen", raising=False)
        monkeypatch.setenv("PYTHONPATH", "/elsewhere")
        env = client.worker_environment()
        assert env["PYTHONPATH"].split(os.pathsep) == [str(_SRC), "/elsewhere"]

    def test_from_source_without_a_path_there_is_only_the_package(self, monkeypatch):
        monkeypatch.delattr(sys, "frozen", raising=False)
        monkeypatch.delenv("PYTHONPATH", raising=False)
        assert client.worker_environment()["PYTHONPATH"] == str(_SRC)

    def test_frozen_it_runs_the_sidecar_again_with_a_flag(self, monkeypatch):
        monkeypatch.setattr(sys, "frozen", True, raising=False)
        monkeypatch.setenv("PYTHONPATH", "/elsewhere")
        assert client.worker_command() == [sys.executable, "--analysis-worker"]
        env = client.worker_environment()
        assert env["PYTHONPATH"] == "/elsewhere"
        # PyInstaller's onefile children must reuse the parent's unpacked folder.
        assert "PYINSTALLER_RESET_ENVIRONMENT" not in env


def _wait_until(predicate: Callable[[], bool], what: str) -> None:
    deadline = time.monotonic() + PATIENCE
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(f"timed out waiting for {what}")


def _in_flight(
    made: WorkerComputer, fake: Harness, **kwargs
) -> Tuple[threading.Thread, list]:
    """Start a file the hanging fake will not answer, and wait until it is asked."""
    results: list = []
    thread = threading.Thread(
        target=lambda: results.append(compute(made, "/m/hang.flac", **kwargs))
    )
    thread.start()
    _wait_until(lambda: bool(fake.lines("requests")), "the request")
    return thread, results


class TestLastWords:
    def test_a_dying_childs_stderr_is_in_the_warning_every_time(self, fake, caplog):
        """Regression: the tail was copied before the drain thread had read it."""
        for _ in range(10):
            made = fake.make("die-after-hello")
            with caplog.at_level(logging.WARNING, logger=client._logger.name):
                caplog.clear()
                compute(made)
            first = [r.getMessage() for r in caplog.records][0]
            assert "fake-stderr-marker" in first
            made.close()
            fake.fallback.calls.clear()
            (fake.state / "spawns").unlink()


class TestTheWorkersLog:
    def test_its_warnings_reach_the_engines_log_at_their_level(self, fake, caplog):
        made = fake.make("chatty")
        with caplog.at_level(logging.DEBUG, logger=client._logger.name):
            compute(made)
            _wait_until(
                lambda: any("boom-error" in r.getMessage() for r in caplog.records),
                "the worker's log lines",
            )
        by_text = {r.getMessage(): r.levelno for r in caplog.records}

        def level(part: str) -> int:
            return next(v for k, v in by_text.items() if part in k)

        assert level("tail-warning") == logging.WARNING
        assert level("boom-error") == logging.ERROR
        # The decoder's INFO (a decode run again) is kept; others are debug.
        assert level("decoding x.flac again") == logging.INFO
        assert level("noise") == logging.DEBUG


class TestStopping:
    def test_a_stopping_engine_does_not_respawn_a_worker(self, fake, caplog):
        made = fake.make("hang")
        thread, results = _in_flight(made, fake)
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            ad.terminate_children()
            thread.join(PATIENCE)
            late = compute(made, "/m/late.flac")
        assert [r.outcome for r in results] == [COMPUTED_CANCELLED]
        assert late.outcome == COMPUTED_CANCELLED
        assert len(fake.spawns()) == 1
        assert fake.fallback.calls == []
        assert made.fallbacks == 0
        assert not [r for r in caplog.records if r.levelno >= logging.WARNING]

    def test_a_closed_client_answers_what_was_in_flight_cancelled(self, fake):
        made = fake.make("hang")
        thread, results = _in_flight(made, fake)
        made.close()
        thread.join(PATIENCE)
        assert [r.outcome for r in results] == [COMPUTED_CANCELLED]
        assert len(fake.spawns()) == 1
        assert made.fallbacks == 0


class TestCrashingBetweenRequests:
    def test_a_worker_that_dies_after_every_answer_is_given_up_on(self, fake, caplog):
        """Regression: it was never counted, so it respawned for ever."""
        made = fake.make("crash-after-answer")
        with caplog.at_level(logging.WARNING, logger=client._logger.name):
            for n in range(8):
                compute(made, f"/m/{n}.flac")
                if made.fallbacks:
                    break
        assert made.fallbacks >= 1
        assert len(fake.spawns()) == 2
        assert any(
            "continues inside the engine" in r.getMessage() for r in caplog.records
        )


class TestCancelAfterADeath:
    def test_a_caller_who_gave_up_is_not_retried(self, fake):
        made = fake.make("die-after-hello")
        computed = compute(made, cancel=lambda: bool(fake.lines("died")))
        assert computed.outcome == COMPUTED_CANCELLED
        assert len(fake.spawns()) == 1
        assert made.fallbacks == 0
