"""The order the engine reads the Beatport token in, and its session slot."""

import threading
import time

import pytest

from cuepoint.services import beatport_token
from cuepoint.services.beatport_token import resolve_access_token, set_session_token


class _Cfg:
    def __init__(self, value=None):
        self.value = value

    def get(self, key, default=None):
        assert key == "incrate.beatport_access_token"
        return self.value


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)
    set_session_token(None)
    yield
    set_session_token(None)


def test_nothing_set_resolves_to_none():
    assert resolve_access_token(_Cfg()) == (None, None)
    assert resolve_access_token(None) == (None, None)


def test_config_only():
    assert resolve_access_token(_Cfg(" cfg ")) == ("cfg", "config")


def test_session_beats_config():
    set_session_token("sess")
    assert resolve_access_token(_Cfg("cfg")) == ("sess", "session")


def test_env_beats_session_and_config(monkeypatch):
    set_session_token("sess")
    monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", " env ")
    assert resolve_access_token(_Cfg("cfg")) == ("env", "env")


def test_blank_env_is_ignored(monkeypatch):
    monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", "   ")
    set_session_token("sess")
    assert resolve_access_token(_Cfg("cfg")) == ("sess", "session")


@pytest.mark.parametrize("cleared", [None, "", "   "])
def test_clearing_falls_back_to_config(cleared):
    set_session_token("sess")
    set_session_token(cleared)
    assert beatport_token.get_session_token() is None
    assert resolve_access_token(_Cfg("cfg")) == ("cfg", "config")


def test_session_token_is_trimmed():
    set_session_token("  sess  ")
    assert resolve_access_token(_Cfg()) == ("sess", "session")


def test_concurrent_sets_and_reads_never_see_a_torn_value():
    values = {f"token-{i}" for i in range(8)}
    seen = []
    errors = []

    def writer(value):
        for _ in range(300):
            set_session_token(value)
            set_session_token(None)

    def reader():
        for _ in range(1500):
            token, source = resolve_access_token(_Cfg())
            if token is None:
                if source is not None:
                    errors.append((token, source))
            elif token not in values or source != "session":
                errors.append((token, source))
            seen.append(token)

    threads = [threading.Thread(target=writer, args=(v,)) for v in values]
    threads += [threading.Thread(target=reader) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []


# --- the renewal gap: expiry kept with the session token, holds and waits ---


class _Clock:
    def __init__(self, now: float):
        self.now = now

    def __call__(self) -> float:
        return self.now


def _swap_later(token, expires_at, delay=0.05):
    timer = threading.Timer(delay, set_session_token, args=(token, expires_at))
    timer.start()
    return timer


def test_set_session_token_keeps_the_expiry_with_it():
    from datetime import datetime, timezone

    when = datetime(2026, 1, 1, tzinfo=timezone.utc)
    set_session_token("sess", when)
    assert beatport_token.get_session_expiry() == when.timestamp()
    set_session_token("sess2", 123.0)
    assert beatport_token.get_session_expiry() == 123.0
    set_session_token("sess3")
    assert beatport_token.get_session_expiry() is None
    set_session_token(None, 5.0)
    assert beatport_token.get_session_expiry() is None


def test_hold_returns_at_once_when_the_token_has_time_left():
    set_session_token("sess", 1000.0)
    assert beatport_token.hold_until_usable(timeout_s=5, clock=_Clock(900.0)) is False


def test_hold_waits_for_the_renewed_token_near_expiry(caplog):
    set_session_token("old", 1000.0)
    timer = _swap_later("new", 1600.0)
    with caplog.at_level("INFO"):
        held = beatport_token.hold_until_usable(
            timeout_s=5, margin_s=1.0, clock=_Clock(999.5)
        )
    timer.join()
    assert held is True
    assert beatport_token.get_session_token() == "new"
    assert (
        sum(
            "holding requests for the renewed sign-in" in r.message
            for r in caplog.records
        )
        == 1
    )


def test_hold_accepts_a_later_expiry_for_the_same_token():
    set_session_token("same", 1000.0)
    timer = _swap_later("same", 1600.0)
    assert beatport_token.hold_until_usable(timeout_s=5, clock=_Clock(1000.0))
    timer.join()


def test_hold_gives_up_at_the_timeout():
    set_session_token("old", 1000.0)
    assert (
        beatport_token.hold_until_usable(timeout_s=0.1, clock=_Clock(2000.0)) is False
    )
    assert beatport_token.get_session_token() == "old"


def test_hold_never_waits_for_env_or_config_tokens(monkeypatch):
    set_session_token("old", 1000.0)
    monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", "env")
    assert beatport_token.hold_until_usable(timeout_s=5, clock=_Clock(2000.0)) is False
    monkeypatch.delenv("BEATPORT_ACCESS_TOKEN")
    set_session_token(None)
    assert beatport_token.hold_until_usable(timeout_s=5, clock=_Clock(2000.0)) is False


def test_hold_ignores_a_session_token_of_unknown_expiry():
    set_session_token("old")
    assert beatport_token.hold_until_usable(timeout_s=5, clock=_Clock(2000.0)) is False


def test_wait_for_new_token_returns_the_swapped_token():
    set_session_token("old", 1000.0)
    timer = _swap_later("new", 1600.0)
    assert (
        beatport_token.wait_for_new_token("old", timeout_s=5, clock=_Clock(1000.0))
        == "new"
    )
    timer.join()


def test_wait_for_new_token_returns_an_already_different_token_at_once():
    set_session_token("new")
    assert beatport_token.wait_for_new_token("old", timeout_s=5) == "new"


def test_wait_for_new_token_times_out_with_none():
    set_session_token("old", 1000.0)
    assert (
        beatport_token.wait_for_new_token("old", timeout_s=0.1, clock=_Clock(1000.0))
        is None
    )


def test_wait_for_new_token_does_not_wait_for_env_or_when_signed_out(monkeypatch):
    set_session_token("old", 1000.0)
    monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", "env")
    assert beatport_token.wait_for_new_token("env", timeout_s=5) is None
    monkeypatch.delenv("BEATPORT_ACCESS_TOKEN")
    set_session_token(None)
    assert beatport_token.wait_for_new_token("old", timeout_s=5) is None


def _timed(fn):
    start = time.monotonic()
    result = fn()
    return result, time.monotonic() - start


def test_a_token_expired_long_ago_is_neither_held_nor_waited_for():
    set_session_token("stale", 1000.0)
    clock = _Clock(1000.0 + beatport_token.HOLD_WINDOW_SECONDS + 1)
    held, took = _timed(
        lambda: beatport_token.hold_until_usable(timeout_s=5, clock=clock)
    )
    assert held is False and took < 0.5
    got, took = _timed(
        lambda: beatport_token.wait_for_new_token("stale", timeout_s=5, clock=clock)
    )
    assert got is None and took < 0.5


def test_a_session_token_without_an_expiry_is_not_waited_for_after_a_401():
    set_session_token("pasted")
    got, took = _timed(lambda: beatport_token.wait_for_new_token("pasted", timeout_s=5))
    assert got is None and took < 0.5


def test_after_one_timeout_nothing_waits_again_until_the_token_changes():
    set_session_token("old", 1000.0)
    clock = _Clock(1000.5)
    _, first = _timed(
        lambda: beatport_token.hold_until_usable(timeout_s=0.3, clock=clock)
    )
    assert first >= 0.25
    _, again = _timed(
        lambda: beatport_token.hold_until_usable(timeout_s=5, clock=clock)
    )
    assert again < 0.1
    got, took = _timed(
        lambda: beatport_token.wait_for_new_token("old", timeout_s=5, clock=clock)
    )
    assert got is None and took < 0.1
    # A new expiry re-arms it.
    set_session_token("old", 1000.4)
    _, rearmed = _timed(
        lambda: beatport_token.hold_until_usable(timeout_s=0.3, clock=clock)
    )
    assert rearmed >= 0.25


def test_signing_out_wakes_a_held_request_promptly():
    set_session_token("old", 1000.0)
    timer = threading.Timer(0.1, set_session_token, args=(None,))
    timer.start()
    _, took = _timed(
        lambda: beatport_token.hold_until_usable(timeout_s=10, clock=_Clock(1000.0))
    )
    timer.join()
    assert took < 1.0
