#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for Beatport OAuth credential resolution and token exchange.

This module had no test coverage despite handling credentials. The precedence
order matters: environment beats configuration beats the credentials file, and
a partially-filled source must not mask a complete one further down. Getting
that wrong means a user's configured credentials are silently ignored.

No test performs real network I/O; the token exchange is exercised against a
stubbed ``requests.post``.
"""

from __future__ import annotations

import pytest

from cuepoint.incrate import beatport_oauth
from cuepoint.incrate.beatport_oauth import (
    get_oauth_client_credentials,
    token_via_password,
)


@pytest.fixture(autouse=True)
def isolated_environment(tmp_path, monkeypatch):
    """No ambient credentials, and a home directory with no token file."""
    monkeypatch.delenv("BEATPORT_CLIENT_ID", raising=False)
    monkeypatch.delenv("BEATPORT_CLIENT_SECRET", raising=False)
    monkeypatch.setattr(beatport_oauth.Path, "home", staticmethod(lambda: tmp_path))
    return tmp_path


def _write_token_file(home, contents: str):
    directory = home / ".cuepoint"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "beatporttoken.txt").write_text(contents, encoding="utf-8")


@pytest.mark.unit
class TestCredentialResolution:
    def test_nothing_configured(self):
        assert get_oauth_client_credentials() == (None, None)

    def test_from_environment(self, monkeypatch):
        monkeypatch.setenv("BEATPORT_CLIENT_ID", "env-id")
        monkeypatch.setenv("BEATPORT_CLIENT_SECRET", "env-secret")

        assert get_oauth_client_credentials() == ("env-id", "env-secret")

    def test_environment_is_whitespace_trimmed(self, monkeypatch):
        monkeypatch.setenv("BEATPORT_CLIENT_ID", "  env-id  ")
        monkeypatch.setenv("BEATPORT_CLIENT_SECRET", "  env-secret  ")

        assert get_oauth_client_credentials() == ("env-id", "env-secret")

    def test_from_config(self):
        config = {
            "incrate.beatport_client_id": "cfg-id",
            "incrate.beatport_client_secret": "cfg-secret",
        }
        assert get_oauth_client_credentials(config.get) == ("cfg-id", "cfg-secret")

    def test_environment_takes_precedence_over_config(self, monkeypatch):
        monkeypatch.setenv("BEATPORT_CLIENT_ID", "env-id")
        monkeypatch.setenv("BEATPORT_CLIENT_SECRET", "env-secret")
        config = {
            "incrate.beatport_client_id": "cfg-id",
            "incrate.beatport_client_secret": "cfg-secret",
        }

        assert get_oauth_client_credentials(config.get) == ("env-id", "env-secret")

    def test_a_failing_config_lookup_is_not_fatal(self, isolated_environment):
        def broken(_key):
            raise RuntimeError("config unavailable")

        _write_token_file(
            isolated_environment, "client_id=file-id\nclient_secret=file-secret\n"
        )

        assert get_oauth_client_credentials(broken) == ("file-id", "file-secret")

    def test_from_token_file(self, isolated_environment):
        _write_token_file(
            isolated_environment, "client_id=file-id\nclient_secret=file-secret\n"
        )
        assert get_oauth_client_credentials() == ("file-id", "file-secret")

    def test_token_file_ignores_comments_and_blanks(self, isolated_environment):
        _write_token_file(
            isolated_environment,
            "# a comment\n\nclient_id = file-id \n"
            "# client_secret=commented-out\nclient_secret=file-secret\n",
        )
        assert get_oauth_client_credentials() == ("file-id", "file-secret")

    def test_token_file_keys_are_case_insensitive(self, isolated_environment):
        _write_token_file(
            isolated_environment, "CLIENT_ID=file-id\nClient_Secret=file-secret\n"
        )
        assert get_oauth_client_credentials() == ("file-id", "file-secret")

    def test_values_containing_equals_are_preserved(self, isolated_environment):
        """Secrets can contain '='; only the first one separates key from value."""
        _write_token_file(
            isolated_environment, "client_id=file-id\nclient_secret=abc==def\n"
        )
        assert get_oauth_client_credentials() == ("file-id", "abc==def")

    def test_partial_file_returns_partial_result(self, isolated_environment):
        _write_token_file(isolated_environment, "client_id=only-id\n")
        assert get_oauth_client_credentials() == ("only-id", None)

    def test_environment_id_is_completed_from_file(
        self, isolated_environment, monkeypatch
    ):
        """A half-configured environment must not mask the file's secret."""
        monkeypatch.setenv("BEATPORT_CLIENT_ID", "env-id")
        _write_token_file(isolated_environment, "client_secret=file-secret\n")

        assert get_oauth_client_credentials() == ("env-id", "file-secret")

    def test_unreadable_token_file_is_not_fatal(self, isolated_environment):
        directory = isolated_environment / ".cuepoint"
        directory.mkdir(parents=True, exist_ok=True)
        # A directory where the file is expected: reading it raises.
        (directory / "beatporttoken.txt").mkdir()

        assert get_oauth_client_credentials() == (None, None)


@pytest.mark.unit
class TestTokenExchange:
    class _Response:
        def __init__(self, payload, error=None):
            self._payload = payload
            self._error = error

        def raise_for_status(self):
            if self._error:
                raise self._error

        def json(self):
            return self._payload

    def test_returns_the_access_token(self, monkeypatch):
        captured = {}

        def fake_post(url, data=None, headers=None, timeout=None):
            captured.update(url=url, data=data, timeout=timeout)
            return self._Response({"access_token": "abc123"})

        monkeypatch.setattr(beatport_oauth.requests, "post", fake_post)

        token = token_via_password("id", "secret", " user ", "pw")

        assert token == "abc123"
        assert captured["url"] == beatport_oauth.TOKEN_URL
        assert captured["data"]["grant_type"] == "password"
        assert captured["data"]["username"] == "user", "username should be trimmed"
        assert captured["timeout"] == 30, "a hung token request must not hang the app"

    def test_password_is_not_trimmed(self, monkeypatch):
        """Trimming a password would silently reject a legitimate one."""
        captured = {}

        def fake_post(url, data=None, headers=None, timeout=None):
            captured.update(data=data)
            return self._Response({"access_token": "t"})

        monkeypatch.setattr(beatport_oauth.requests, "post", fake_post)

        token_via_password("id", "secret", "user", "  spaced  ")

        assert captured["data"]["password"] == "  spaced  "

    def test_response_without_a_token_is_an_error(self, monkeypatch):
        monkeypatch.setattr(
            beatport_oauth.requests,
            "post",
            lambda *a, **k: self._Response({"error": "invalid_grant"}),
        )

        with pytest.raises(RuntimeError, match="no access_token"):
            token_via_password("id", "secret", "user", "pw")

    def test_http_error_propagates(self, monkeypatch):
        monkeypatch.setattr(
            beatport_oauth.requests,
            "post",
            lambda *a, **k: self._Response({}, error=ValueError("401 Unauthorized")),
        )

        with pytest.raises(ValueError, match="401"):
            token_via_password("id", "secret", "user", "pw")
