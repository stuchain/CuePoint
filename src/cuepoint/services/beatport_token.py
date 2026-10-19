"""Where the engine finds the Beatport access token.

Three sources, strongest first: the ``BEATPORT_ACCESS_TOKEN`` environment
variable, the desktop session token that Electron main pushes into the engine's
memory after a Beatport sign-in, and the ``incrate.beatport_access_token``
config key (still read, so existing config files keep working).

The session token lives only in this process's memory; it is never written to
disk or logged.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime
from typing import Any, Callable, Optional, Tuple, Union

_logger = logging.getLogger(__name__)

CONFIG_KEY = "incrate.beatport_access_token"
ENV_VAR = "BEATPORT_ACCESS_TOKEN"

SOURCE_ENV = "env"
SOURCE_SESSION = "session"
SOURCE_CONFIG = "config"

# One condition guards the token and its expiry, and wakes every waiter on a change.
_cond = threading.Condition()
_session_token: Optional[str] = None
_session_expiry: Optional[float] = None  # epoch seconds, None when not known

#: The longest one request waits for Beatport to hand out the next token, in
#: each of the two places it can wait (before sending, and after a 401). The
#: real gap is a second or four; a job can only be stopped between requests, so
#: this stays short.
HOLD_TIMEOUT_SECONDS = 10.0
#: Waiters re-check the token in slices this long, so a sign-out or a new token
#: is seen promptly whatever woke (or failed to wake) them.
WAIT_SLICE_SECONDS = 0.25
#: A request this close to the token's end is held rather than sent.
HOLD_MARGIN_SECONDS = 1.0
#: A 401 may be waited for from this long before the token's end: the app's
#: clock and Beatport's differ, so the refusal can come a little early.
WAIT_MARGIN_SECONDS = 10.0
#: Holding and waiting only apply this long after the token's end. A token that
#: ended longer ago than this (launched with a stale one, a renewal that keeps
#: failing) is not about to be renewed, so requests fail fast instead.
HOLD_WINDOW_SECONDS = 15.0

# The (token, expiry) a hold or wait already timed out on. After one timeout
# nothing waits again until the token or its expiry changes. This also covers
# clock skew: if the local clock says "in the gap" while Beatport's does not,
# the cost is one wait, not one wait per request.
_gave_up: Optional[Tuple[str, Optional[float]]] = None


def _to_epoch(value: Union[datetime, float, int, None]) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, datetime):
        return value.timestamp()
    return float(value)


def set_session_token(
    token: Optional[str], expires_at: Union[datetime, float, int, None] = None
) -> None:
    """Remember ``token`` (and when it ends) for this process.

    Blank or ``None`` forgets it. ``expires_at`` is a datetime or epoch seconds.
    """
    global _session_token, _session_expiry, _gave_up
    value = (token or "").strip()
    with _cond:
        new = (value or None, _to_epoch(expires_at) if value else None)
        if new != (_session_token, _session_expiry):
            _gave_up = None
        _session_token, _session_expiry = new
        _cond.notify_all()


def get_session_token() -> Optional[str]:
    with _cond:
        return _session_token


def get_session_expiry() -> Optional[float]:
    with _cond:
        return _session_expiry


def _env_token() -> str:
    return (os.environ.get(ENV_VAR) or "").strip()


def _in_gap(
    token: Optional[str],
    expiry: Optional[float],
    now: float,
    margin_s: float,
) -> bool:
    """True when ``token`` is a session token with a known end that is (nearly) reached.

    Caller holds ``_cond``.
    """
    if not token or expiry is None:
        return False
    if _gave_up == (token, expiry):
        return False
    return expiry - margin_s <= now < expiry + HOLD_WINDOW_SECONDS


def _wait_while_unchanged(
    token: str, expiry: Optional[float], timeout_s: float
) -> bool:
    """Wait in slices until the session slot changes; False (and give up) at the timeout.

    Caller holds ``_cond``.
    """
    global _gave_up
    deadline = time.monotonic() + max(0.0, timeout_s)
    while (_session_token, _session_expiry) == (token, expiry):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            _gave_up = (token, expiry)
            return False
        _cond.wait(min(WAIT_SLICE_SECONDS, remaining))
    return True


def hold_until_usable(
    timeout_s: Optional[float] = None,
    margin_s: float = HOLD_MARGIN_SECONDS,
    clock: Callable[[], float] = time.time,
) -> bool:
    """Wait out the gap between the session token's end and its renewal.

    Beatport hands out the next token only after the current one has ended, so
    a request sent in that gap is refused. When the session token is the one
    in use and its end is known and (almost) reached, this waits until a
    different token, or a later end, arrives (or the session is cleared), or
    ``timeout_s`` passes; after a timeout it does not wait again for the same
    token. Environment and config tokens have no end and are never held.
    Returns True when a renewal arrived while waiting.
    """
    if _env_token():
        return False
    with _cond:
        token, expiry = _session_token, _session_expiry
        if not _in_gap(token, expiry, clock(), margin_s):
            return False
        _logger.info("[beatport] holding requests for the renewed sign-in")
        return _wait_while_unchanged(
            token or "",
            expiry,
            HOLD_TIMEOUT_SECONDS if timeout_s is None else timeout_s,
        )


def wait_for_new_token(
    old_token: str,
    timeout_s: Optional[float] = None,
    clock: Callable[[], float] = time.time,
) -> Optional[str]:
    """After a 401: wait for the session token to differ from ``old_token``.

    Returns the new token, or None at the timeout. Returns at once (None) when
    nothing is coming: an environment or config token, a session token whose
    end is unknown (pasted, or revoked early) or not near, or one this already
    gave up on.
    """
    if _env_token():
        return None
    with _cond:
        current = _session_token
        if not current:
            return None
        if current != old_token:
            return current
        expiry = _session_expiry
        if not _in_gap(current, expiry, clock(), WAIT_MARGIN_SECONDS):
            return None
        _wait_while_unchanged(
            current, expiry, HOLD_TIMEOUT_SECONDS if timeout_s is None else timeout_s
        )
        return _session_token if _session_token not in (None, old_token) else None


def resolve_access_token(cfg: Any) -> Tuple[Optional[str], Optional[str]]:
    """Return ``(token, source)``; both ``None`` when no source holds a token."""
    env = (os.environ.get(ENV_VAR) or "").strip()
    if env:
        return env, SOURCE_ENV
    session = get_session_token()
    if session:
        return session, SOURCE_SESSION
    configured = ""
    if cfg is not None:
        configured = str(cfg.get(CONFIG_KEY) or "").strip()
    if configured:
        return configured, SOURCE_CONFIG
    return None, None
