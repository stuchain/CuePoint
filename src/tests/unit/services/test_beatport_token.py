"""The order the engine reads the Beatport token in, and its session slot."""

import threading

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
