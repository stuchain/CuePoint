"""How long each engine request took, so a slow one can be named.

A "the app feels slow" report had nothing to point at: the engine kept no timing.
A request over ``SLOW_MS`` is logged at WARNING with its method, route template,
status, time and how many requests were running beside it; one over ``NOTE_MS``
is counted per route (and logged at DEBUG), which shows a route that is often a
little slow. Only the template is ever logged, never the query, an id or a token.

Job event streams (``.../events``) stay open for the whole job and ``/health``
is polled, so neither says anything about speed and neither is timed. They are
left out of the in-flight count as well, or one open stream would inflate it.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager, suppress

_logger = logging.getLogger(__name__)

#: A request slower than this is logged at WARNING (milliseconds).
SLOW_MS = 500
#: A request slower than this is counted per route and logged at DEBUG (milliseconds).
NOTE_MS = 100

_API_PREFIX = "/api/v1/"

#: Replaced in tests, so a slow request does not need a slow wait.
_clock: Callable[[], float] = time.monotonic

_lock = threading.Lock()
_in_flight = 0
_noted: dict[str, int] = {}


def should_time(template: str) -> bool:
    """True for an API route that is answered and done: not a stream, not ``/health``."""
    return template.startswith(_API_PREFIX) and not template.endswith("/events")


def in_flight() -> int:
    """How many timed requests are running now."""
    with _lock:
        return _in_flight


def noted_counts() -> dict[str, int]:
    """A copy of the per-route count of requests that took over ``NOTE_MS``."""
    with _lock:
        return dict(_noted)


def reset_counts() -> None:
    """Empty the per-route counts (tests)."""
    with _lock:
        _noted.clear()


def format_slow(method: str, template: str, status: int, ms: int, running: int) -> str:
    """The WARNING line; a status of 0 (no answer was sent) shows as ``-``."""
    shown = status if status else "-"
    return (
        f"[engine] slow request {method} {template} {shown} {ms} ms "
        f"({running} in flight)"
    )


@contextmanager
def track(
    template: str,
    method: str = "-",
    status: Callable[[], int] | None = None,
) -> Iterator[None]:
    """Time one request: count it in flight, then log or count it when it ends.

    ``template`` is the route template (``route_template``), never the raw path.
    ``status`` is read at the end, so an exception that escapes still logs the
    status that went out. Nothing here may fail a request.
    """
    global _in_flight
    if not should_time(template):
        yield
        return
    with _lock:
        _in_flight += 1
    started = _clock()
    try:
        yield
    finally:
        ms = int((_clock() - started) * 1000)
        with _lock:
            running = _in_flight
            _in_flight -= 1
            if ms > NOTE_MS:
                _noted[template] = _noted.get(template, 0) + 1
        # Timing is never a reason to fail a request.
        with suppress(Exception):
            if ms > SLOW_MS:
                code = status() if status else 0
                _logger.warning(format_slow(method, template, code, ms, running))
            elif ms > NOTE_MS:
                _logger.debug(
                    "[engine] request over %d ms: %s %s %d ms",
                    NOTE_MS,
                    method,
                    template,
                    ms,
                )
