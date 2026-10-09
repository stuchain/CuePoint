"""Joining a finished thread while another thread opens a connection.

**What broke.** On the Windows CI runners (Python 3.11 and 3.12),
``TestConcurrency`` in ``test_database_service.py`` failed intermittently inside
``t.join(timeout=30)``. CPython's ``Thread._stop`` failed
``assert not lock.locked()``, followed by
``RuntimeError: release unlocked lock``. It happened three times in three runs.

**Why.** ``connect()`` reaps the connections of threads that have ended, and it
used to ask each owner ``is_alive()``. Before Python 3.13, ``is_alive()`` on
someone else's thread briefly acquires and releases that thread's
``_tstate_lock``, and so does ``join()``. When one worker opened its connection
while the starting thread was joining a sibling that had just finished, the
worker could hold the lock at the moment the join's ``_stop`` checked it.
CPython does not guard against that. The library database and the waveform
store share the pattern. The engine serves each HTTP request on its own thread,
so the product is exposed to the same race. The reaping now reads
``threading.enumerate()``, which never touches another thread's lock.

**Why it is easy to bring back.** ``is_alive()`` reads as the obvious way to ask
whether a thread has ended. The race needs two thread switches inside a handful
of bytecodes, so it almost never shows on Linux. This test does not wait for
luck. Per-thread profile hooks pause each side at the exact point the race
needs: the joiner just after it releases the lock, and the other thread just
after it acquires it. With the old code the join fails every time. On Python
3.13+ there is no ``_tstate_lock`` and the hooks have nothing to pause on, so
the test checks only that a connect beside a join is harmless.
"""

from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

import pytest

from cuepoint.persistence.waveform_store import WaveformStore
from cuepoint.services.database_service import DatabaseService

WAIT = 10.0


def _is_call_on(arg: object, name: str, target: object) -> bool:
    return getattr(arg, "__self__", None) is target and (
        getattr(arg, "__name__", None) == name
    )


def _finished_thread(work) -> threading.Thread:
    """A thread that ran ``work`` to its end and that nothing has joined or polled."""
    thread = threading.Thread(target=work)
    thread.start()
    deadline = time.monotonic() + WAIT
    # threading.enumerate() rather than is_alive(): the point is to leave the
    # thread unobserved until the join under test.
    while thread in threading.enumerate():
        assert time.monotonic() < deadline, "the first thread never finished"
        time.sleep(0.001)
    return thread


@pytest.mark.parametrize(
    "make_registry",
    [
        pytest.param(
            lambda d: DatabaseService(db_path=d / "cuepoint.db"), id="library"
        ),
        pytest.param(lambda d: WaveformStore(d / "waveforms.db"), id="waveforms"),
    ],
)
def test_connect_does_not_break_a_join_on_a_finished_thread(
    tmp_path: Path, make_registry
) -> None:
    registry = make_registry(tmp_path)
    finished = _finished_thread(registry.connect)
    tstate_lock = getattr(finished, "_tstate_lock", None)  # None from 3.13

    main_released = threading.Event()
    other_holds = threading.Event()
    main_stopped = threading.Event()
    other_done = threading.Event()
    other_errors: list[BaseException] = []

    def hold_after_acquire(frame, event, arg):
        if event == "c_return" and _is_call_on(arg, "acquire", tstate_lock):
            other_holds.set()
            main_stopped.wait(WAIT)

    def other() -> None:
        try:
            main_released.wait(WAIT)
            sys.setprofile(hold_after_acquire)
            try:
                registry.connect()
            finally:
                sys.setprofile(None)
        except BaseException as exc:  # noqa: BLE001 - surfaced via assert
            other_errors.append(exc)
        finally:
            other_done.set()

    def pause_after_release(frame, event, arg):
        if (
            event == "c_return"
            and not main_released.is_set()
            and _is_call_on(arg, "release", tstate_lock)
        ):
            main_released.set()
            deadline = time.monotonic() + WAIT
            while not (other_holds.is_set() or other_done.is_set()):
                if time.monotonic() > deadline:
                    break
                other_done.wait(0.01)

    other_thread = threading.Thread(target=other)
    other_thread.start()
    if tstate_lock is None:
        main_released.set()

    join_error: BaseException | None = None
    previous = sys.getprofile()
    sys.setprofile(pause_after_release)
    try:
        finished.join(timeout=WAIT)
    except BaseException as exc:  # noqa: BLE001 - surfaced via assert
        join_error = exc
    finally:
        sys.setprofile(previous)
        main_stopped.set()
        other_thread.join(timeout=WAIT)
        registry.close_all()

    assert join_error is None, f"joining a finished thread failed: {join_error!r}"
    assert not other_errors, f"connect() beside the join failed: {other_errors!r}"
    assert not finished.is_alive()
