"""What went wrong when a Beatport search found nothing, and who is down.

A search that fails and a search that finds nothing both come back as an empty
list, so a blocked network looked exactly like a library of tracks Beatport
does not have: every track "No match found", with nothing in the log.

This module is the one place the search backends say what happened:

- :func:`note` records a failure (which backend, what kind) against the track
  being matched. :func:`collect` opens that record around one track; the
  candidate fetch threads inherit it because they are started in a copy of the
  caller's context.
- :func:`mark_down` / :func:`is_down` remember, across tracks, that a backend
  just failed in a way that will repeat (a Cloudflare challenge, a blocked
  network). While it is down, callers skip it at once, so a dead search fails in
  seconds rather than each track paying every timeout again.

It holds no tokens and no URLs with query strings, so nothing here can leak a
secret into a log.
"""

from __future__ import annotations

import contextlib
import contextvars
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterator, List, Optional, Tuple

#: The Beatport sign-in is missing, expired or refused (HTTP 401/403 from the API).
KIND_SIGNED_OUT = "signed_out"
#: Beatport's API is rate limiting us (HTTP 429).
KIND_RATE_LIMITED = "rate_limited"
#: The site or service refused us: an HTTP 403/429, a challenge page, a rate limit.
KIND_BLOCKED = "blocked"
#: The request ran out of time.
KIND_TIMEOUT = "timeout"
#: No connection: DNS, TCP or TLS failed.
KIND_NETWORK = "network"
#: Anything else: a server error, an unreadable answer.
KIND_UNAVAILABLE = "unavailable"

#: Worst first: the kind a track is reported with when several backends failed.
KINDS = (
    KIND_SIGNED_OUT,
    KIND_RATE_LIMITED,
    KIND_BLOCKED,
    KIND_TIMEOUT,
    KIND_NETWORK,
    KIND_UNAVAILABLE,
)

BACKEND_BEATPORT_WEB = "beatport.com"
BACKEND_DUCKDUCKGO = "duckduckgo"
BACKEND_BEATPORT_API = "beatport-api"

#: Seconds a backend stays skipped after a failure that will repeat.
COOLDOWN_BLOCKED_SECONDS = 120.0
COOLDOWN_TRANSIENT_SECONDS = 30.0

_SENTENCES = {
    KIND_SIGNED_OUT: "Beatport did not accept your sign-in; sign in again",
    KIND_RATE_LIMITED: "Beatport is limiting how fast CuePoint can search",
    KIND_BLOCKED: "Beatport's website refused the search",
    KIND_TIMEOUT: "the search timed out",
    KIND_NETWORK: "the search could not connect",
    KIND_UNAVAILABLE: "the search service did not answer",
}


@dataclass(frozen=True)
class SearchFailure:
    """One backend failing once."""

    backend: str
    kind: str
    detail: str


@dataclass
class FailureLog:
    """The failures met while matching one track. Safe to share across threads."""

    failures: List[SearchFailure] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add(self, failure: SearchFailure) -> None:
        with self._lock:
            if failure not in self.failures:
                self.failures.append(failure)

    def worst_kind(self) -> Optional[str]:
        """The most severe kind recorded, or None when nothing failed."""
        with self._lock:
            kinds = {f.kind for f in self.failures}
        for kind in KINDS:
            if kind in kinds:
                return kind
        return None

    def describe(self) -> str:
        """``"beatport.com blocked (HTTP 403); duckduckgo timeout"``, no secrets."""
        with self._lock:
            parts = [
                f"{f.backend} {f.kind}" + (f" ({f.detail})" if f.detail else "")
                for f in self.failures
            ]
        return "; ".join(parts)


_current: contextvars.ContextVar[Optional[FailureLog]] = contextvars.ContextVar(
    "cuepoint_search_failures", default=None
)


@contextlib.contextmanager
def collect() -> Iterator[FailureLog]:
    """Record every failure noted inside the block against one track."""
    log = FailureLog()
    token = _current.set(log)
    try:
        yield log
    finally:
        _current.reset(token)


def note(backend: str, kind: str, detail: str = "") -> None:
    """Say that ``backend`` failed with ``kind``. A no-op outside :func:`collect`."""
    log = _current.get()
    if log is not None:
        log.add(SearchFailure(backend, kind, detail[:120]))


def sentence(kind: str) -> str:
    """A plain-language sentence for a kind, for the person reading the screen."""
    return _SENTENCES.get(kind, _SENTENCES[KIND_UNAVAILABLE])


#: What an attempt's ``error`` starts with when the search itself failed, as
#: opposed to the search working and Beatport not having the track. The kind
#: follows: ``search_failed:blocked: Beatport's website refused the search``.
SEARCH_FAILED = "search_failed"


def failure_error(kind: str) -> str:
    """The ``error`` text of a track whose search failed with ``kind``."""
    return f"{SEARCH_FAILED}:{kind}: {sentence(kind)}"


def failure_kind(error: Optional[str]) -> Optional[str]:
    """The kind in a :func:`failure_error` text, or None for any other error."""
    prefix = SEARCH_FAILED + ":"
    if not error or not error.startswith(prefix):
        return None
    kind = error[len(prefix) :].split(":", 1)[0]
    return kind if kind in KINDS else KIND_UNAVAILABLE


_lock = threading.Lock()
_down: Dict[str, Tuple[float, str, str]] = {}
_clock: Callable[[], float] = time.monotonic


def mark_down(
    backend: str, kind: str, detail: str = "", seconds: Optional[float] = None
) -> None:
    """Skip ``backend`` for a while: its failure will repeat for every track."""
    if seconds is None:
        seconds = (
            COOLDOWN_BLOCKED_SECONDS
            if kind in (KIND_BLOCKED, KIND_SIGNED_OUT)
            else COOLDOWN_TRANSIENT_SECONDS
        )
    with _lock:
        _down[backend] = (_clock() + seconds, kind, detail[:120])
    note(backend, kind, detail)


def is_down(backend: str) -> bool:
    """True while ``backend`` is cooling down; notes the failure for this track."""
    with _lock:
        entry = _down.get(backend)
        if entry is not None and _clock() >= entry[0]:
            del _down[backend]
            entry = None
    if entry is None:
        return False
    note(backend, entry[1], entry[2])
    return True


def clear(backend: str) -> None:
    """Forget one backend's cooldown, e.g. because the person signed in again."""
    with _lock:
        _down.pop(backend, None)


def reset() -> None:
    """Forget every cooldown. For tests, and after the person fixes their network."""
    with _lock:
        _down.clear()


def set_clock(clock: Callable[[], float]) -> None:
    """Replace the cooldown clock. For tests."""
    global _clock
    _clock = clock


__all__ = (
    "SEARCH_FAILED",
    "BACKEND_BEATPORT_API",
    "BACKEND_BEATPORT_WEB",
    "BACKEND_DUCKDUCKGO",
    "KINDS",
    "KIND_BLOCKED",
    "KIND_NETWORK",
    "KIND_RATE_LIMITED",
    "KIND_SIGNED_OUT",
    "KIND_TIMEOUT",
    "KIND_UNAVAILABLE",
    "FailureLog",
    "SearchFailure",
    "clear",
    "collect",
    "failure_error",
    "failure_kind",
    "is_down",
    "mark_down",
    "note",
    "reset",
    "sentence",
    "set_clock",
)
