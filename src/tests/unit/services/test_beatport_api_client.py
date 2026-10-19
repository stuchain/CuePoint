"""Unit tests for BeatportApiClient."""

import threading
import time
from datetime import datetime, timezone
from unittest.mock import Mock, patch

import pytest
import requests

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.beatport_api_client import (
    BEATPORT_ERROR_CLASSES,
    DEFAULT_RETRY_AFTER_SECONDS,
    ERROR_FORBIDDEN,
    ERROR_NO_TOKEN,
    ERROR_RATE_LIMITED,
    ERROR_REJECTED,
    ERROR_UNAVAILABLE,
    MAX_CONCURRENT_REQUESTS,
    MAX_RESPONSE_BYTES,
    MAX_RETRY_AFTER_SECONDS,
    BeatportApiClient,
    classify_beatport_error,
    parse_retry_after,
)


class TestBeatportApiClientGet:
    """Test BeatportApiClient.get."""

    def test_get_sends_auth_header(self):
        """get() sends Authorization Bearer header."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(
                status_code=200, json=Mock(return_value={"data": []})
            )
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "secret-token", timeout=30)
            client.get("/genres")
            call_kw = req.call_args[1]
            assert "Authorization" in call_kw["headers"]
            assert call_kw["headers"]["Authorization"] == "Bearer secret-token"

    def test_get_returns_json(self):
        """get() returns response.json()."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(
                status_code=200, json=Mock(return_value={"data": []})
            )
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "token")
            out = client.get("/genres")
            assert out == {"data": []}

    def test_get_raises_on_401(self):
        """get() raises BeatportAPIError on 401."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(status_code=401)
            client = BeatportApiClient("https://api.test", "bad-token")
            with pytest.raises(BeatportAPIError) as exc_info:
                client.get("/genres")
            assert exc_info.value.status_code == 401

    def test_get_raises_on_500(self):
        """get() raises BeatportAPIError on 500 (after retries)."""
        with (
            patch("cuepoint.services.reliability_retry.time.sleep"),
            patch.object(requests.Session, "request") as req,
        ):
            req.return_value = Mock(status_code=500)
            client = BeatportApiClient("https://api.test", "token")
            with pytest.raises(BeatportAPIError):
                client.get("/genres")

    def test_get_passes_params(self):
        """get() passes params to request."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(status_code=200, json=Mock(return_value=[]))
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "token")
            client.get("/charts", params={"genre_id": 1, "from": "2025-01-01"})
            call_kw = req.call_args[1]
            assert call_kw["params"] == {"genre_id": 1, "from": "2025-01-01"}

    def test_get_timeout_passed(self):
        """get() passes timeout to request."""
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(status_code=200, json=Mock(return_value=[]))
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "token", timeout=15)
            client.get("/genres")
            call_kw = req.call_args[1]
            assert call_kw["timeout"] == 15

    def test_get_empty_token_raises(self):
        """get() with empty token raises BeatportAPIError."""
        client = BeatportApiClient("https://api.test", "")
        with pytest.raises(BeatportAPIError) as exc_info:
            client.get("/genres")
        assert (
            "token" in exc_info.value.message.lower()
            or "Configure" in exc_info.value.message
        )


# --- DISCOVER-01: error classes, Retry-After, the request budget, POST redirects ---


def _response(status, body=None, headers=None, content=b"{}"):
    resp = Mock(status_code=status, content=content, headers=headers or {})
    resp.json = Mock(return_value=body if body is not None else {})
    if status >= 400:
        resp.raise_for_status = Mock(
            side_effect=requests.exceptions.HTTPError(response=Mock(status_code=status))
        )
    else:
        resp.raise_for_status = Mock()
    return resp


def _client(responses, sleeps=None, gate=None):
    session = Mock()
    session.request = Mock(side_effect=list(responses))
    recorded = sleeps if sleeps is not None else []
    client = BeatportApiClient(
        "https://api.test",
        "token",
        session=session,
        request_gate=gate,
        sleep=recorded.append,
    )
    return client, session, recorded


def _raised(call):
    try:
        call()
    except Exception as e:  # noqa: BLE001 - the test inspects whatever was raised
        return e
    raise AssertionError("expected an error")


class TestErrorClasses:
    def test_the_five_classes(self):
        assert BEATPORT_ERROR_CLASSES == (
            "no_token",
            "rejected",
            "forbidden",
            "rate_limited",
            "unavailable",
        )

    def test_no_token(self):
        client = BeatportApiClient("https://api.test", "")
        assert classify_beatport_error(_raised(lambda: client.get("/x"))) == (
            ERROR_NO_TOKEN
        )
        assert classify_beatport_error(_raised(lambda: client.post("x/"))) == (
            ERROR_NO_TOKEN
        )

    @pytest.mark.parametrize(
        ("status", "expected"),
        [
            (401, ERROR_REJECTED),
            (403, ERROR_FORBIDDEN),
            (400, ERROR_UNAVAILABLE),
            (418, ERROR_UNAVAILABLE),
        ],
    )
    def test_from_a_status(self, status, expected):
        client, _, _ = _client([_response(status)])
        assert classify_beatport_error(_raised(lambda: client.get("/x"))) == expected

    def test_a_5xx_is_unavailable_after_its_retries(self):
        with patch("cuepoint.services.reliability_retry.time.sleep"):
            # One attempt, then the existing backoff's three retries.
            client, session, _ = _client([_response(503)] * 4)
            error = _raised(lambda: client.get("/x"))
        assert isinstance(error, BeatportAPIError)
        assert error.status_code == 503
        assert classify_beatport_error(error) == ERROR_UNAVAILABLE
        assert session.request.call_count == 4

    def test_network_and_timeout_are_unavailable(self):
        for failure in (
            requests.exceptions.ConnectionError("down"),
            requests.exceptions.Timeout("slow"),
        ):
            client, _, _ = _client([failure])
            error = _raised(lambda: client.get("/x"))
            assert isinstance(error, BeatportAPIError)
            assert classify_beatport_error(error) == ERROR_UNAVAILABLE

    def test_an_unreadable_answer_is_unavailable(self):
        resp = _response(200)
        resp.json = Mock(side_effect=ValueError("not json"))
        client, _, _ = _client([resp])
        error = _raised(lambda: client.get("/x"))
        assert classify_beatport_error(error) == ERROR_UNAVAILABLE

    def test_anything_else_is_unavailable(self):
        assert classify_beatport_error(RuntimeError("?")) == ERROR_UNAVAILABLE


class TestRequireToken:
    """DISCOVER-04: a job asks before it exists, and asks nothing of Beatport."""

    def test_no_token_is_refused_as_no_token(self):
        session = Mock()
        client = BeatportApiClient("https://api.test", "", session=session)
        error = _raised(client.require_token)
        assert classify_beatport_error(error) == ERROR_NO_TOKEN
        session.request.assert_not_called()

    def test_a_token_is_not_refused_and_nothing_is_asked(self):
        session = Mock()
        BeatportApiClient("https://api.test", "t", session=session).require_token()
        session.request.assert_not_called()

    def test_the_api_asks_its_client(self):
        from cuepoint.services.beatport_api import BeatportApi

        empty = BeatportApi(BeatportApiClient("https://api.test", ""))
        assert classify_beatport_error(_raised(empty.require_token)) == ERROR_NO_TOKEN
        BeatportApi(BeatportApiClient("https://api.test", "t")).require_token()


class TestRetryAfter:
    def test_parse_seconds_and_dates(self):
        now = datetime(2026, 9, 23, 12, 0, 0, tzinfo=timezone.utc)
        assert parse_retry_after("7", now) == 7.0
        assert parse_retry_after(" 2.5 ", now) == 2.5
        assert parse_retry_after("Wed, 23 Sep 2026 12:00:10 GMT", now) == 10.0
        assert parse_retry_after("Wed, 23 Sep 2026 11:00:00 GMT", now) == 0.0
        assert parse_retry_after("-3", now) == 0.0
        for nothing in (None, "", "soon", "nan", Mock()):
            assert parse_retry_after(nothing, now) is None

    def test_honored_once_then_succeeds(self):
        client, session, sleeps = _client(
            [_response(429, headers={"Retry-After": "3"}), _response(200, {"ok": 1})]
        )
        assert client.get("/x") == {"ok": 1}
        assert sleeps == [3.0]
        assert session.request.call_count == 2

    def test_a_second_429_is_reported_not_retried_again(self):
        client, session, sleeps = _client(
            [
                _response(429, headers={"Retry-After": "1"}),
                _response(429, headers={"Retry-After": "4"}),
            ]
        )
        error = _raised(lambda: client.get("/x"))
        assert classify_beatport_error(error) == ERROR_RATE_LIMITED
        assert error.retry_after == 4.0
        assert sleeps == [1.0]
        assert session.request.call_count == 2

    def test_a_wait_too_long_to_sit_through_is_reported_at_once(self):
        too_long = str(int(MAX_RETRY_AFTER_SECONDS) + 90)
        client, session, sleeps = _client(
            [_response(429, headers={"Retry-After": too_long})]
        )
        error = _raised(lambda: client.get("/x"))
        assert classify_beatport_error(error) == ERROR_RATE_LIMITED
        assert error.retry_after == float(too_long)
        assert sleeps == []
        assert session.request.call_count == 1

    def test_no_header_waits_the_default_once(self):
        client, _, sleeps = _client([_response(429), _response(200, {"ok": 1})])
        assert client.get("/x") == {"ok": 1}
        assert sleeps == [DEFAULT_RETRY_AFTER_SECONDS]

    def test_a_post_is_honored_once_too(self):
        client, session, sleeps = _client(
            [_response(429, headers={"Retry-After": "2"}), _response(201, {"id": 9})]
        )
        assert client.post("my/playlists/", json={"name": "n"}) == {"id": 9}
        assert sleeps == [2.0]
        assert session.request.call_count == 2


class TestPost:
    def test_never_follows_a_redirect(self):
        client, session, _ = _client([_response(301, headers={"Location": "/x/"})])
        error = _raised(lambda: client.post("x", json={}))
        assert error.error_code == "BEATPORT_API_REDIRECT"
        assert session.request.call_args[1]["allow_redirects"] is False
        assert session.request.call_count == 1

    def test_a_network_failure_is_a_beatport_error(self):
        client, _, _ = _client([requests.exceptions.ConnectionError("down")])
        error = _raised(lambda: client.post("x/", json={}))
        assert isinstance(error, BeatportAPIError)
        assert classify_beatport_error(error) == ERROR_UNAVAILABLE

    def test_forbidden_is_raised_as_such(self):
        client, _, _ = _client([_response(403)])
        error = _raised(lambda: client.post("my/playlists/"))
        assert classify_beatport_error(error) == ERROR_FORBIDDEN


class TestResponseBound:
    def test_an_oversized_body_is_refused(self):
        big = _response(200, content=b"x" * (MAX_RESPONSE_BYTES + 1))
        client, _, _ = _client([big])
        error = _raised(lambda: client.get("/x"))
        assert error.error_code == "BEATPORT_API_TOO_LARGE"
        assert classify_beatport_error(error) == ERROR_UNAVAILABLE


class TestRequestBudget:
    def test_the_engine_wide_cap_holds_across_clients_and_threads(self):
        """Many clients on many threads never exceed the one shared budget."""
        in_flight = 0
        peak = 0
        lock = threading.Lock()

        def slow_request(*_args, **_kwargs):
            nonlocal in_flight, peak
            with lock:
                in_flight += 1
                peak = max(peak, in_flight)
            time.sleep(0.02)
            with lock:
                in_flight -= 1
            return _response(200, {"ok": 1})

        def worker():
            session = Mock()
            session.request = Mock(side_effect=slow_request)
            client = BeatportApiClient("https://api.test", "token", session=session)
            for _ in range(3):
                client.get("/x")

        threads = [
            threading.Thread(target=worker) for _ in range(MAX_CONCURRENT_REQUESTS * 3)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert peak == MAX_CONCURRENT_REQUESTS

    def test_the_slot_is_released_when_a_request_fails(self):
        gate = threading.BoundedSemaphore(1)
        client, _, _ = _client(
            [requests.exceptions.ConnectionError("down"), _response(200, {"ok": 1})],
            gate=gate,
        )
        _raised(lambda: client.get("/x"))
        assert client.get("/x") == {"ok": 1}

    def test_the_rate_limit_wait_happens_outside_the_slot(self):
        gate = threading.BoundedSemaphore(1)
        free_while_sleeping = []

        def sleep(_seconds):
            acquired = gate.acquire(blocking=False)
            free_while_sleeping.append(acquired)
            if acquired:
                gate.release()

        session = Mock()
        session.request = Mock(
            side_effect=[
                _response(429, headers={"Retry-After": "1"}),
                _response(200, {}),
            ]
        )
        client = BeatportApiClient(
            "https://api.test", "token", session=session, request_gate=gate, sleep=sleep
        )
        client.get("/x")
        assert free_while_sleeping == [True]


class TestRenewalGap:
    """The session token expires, Beatport hands out the next one a few seconds
    later: requests wait for it instead of failing (the renewal gap)."""

    @pytest.fixture(autouse=True)
    def _session(self, monkeypatch):
        from cuepoint.services import beatport_token

        monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)
        beatport_token.set_session_token(None)
        yield
        beatport_token.set_session_token(None)

    @staticmethod
    def _answers(*statuses):
        seen = []

        def request(method, url, **kw):
            seen.append(kw["headers"]["Authorization"])
            status = statuses[min(len(seen) - 1, len(statuses) - 1)]
            return Mock(
                status_code=status, json=Mock(return_value={"ok": 1}), content=b"{}"
            )

        return seen, request

    def _client(self, session, wait=2.0):
        from cuepoint.services import beatport_token

        client = BeatportApiClient(
            "https://api.test",
            "",
            session=session,
            token_provider=lambda: beatport_token.get_session_token(),
        )
        client._token_wait_s = wait
        return client

    def test_a_401_then_a_token_swap_retries_once_and_succeeds(self):
        from cuepoint.services import beatport_token

        beatport_token.set_session_token("old", time.time() + 5)
        seen, request = self._answers(401, 200)
        session = Mock(request=request)
        timer = threading.Timer(0.1, beatport_token.set_session_token, args=("new",))
        timer.start()
        assert self._client(session).get("/genres") == {"ok": 1}
        timer.join()
        assert seen == ["Bearer old", "Bearer new"]

    def test_no_new_token_in_time_raises_the_same_401(self):
        from cuepoint.services import beatport_token

        beatport_token.set_session_token("old", time.time() + 5)
        seen, request = self._answers(401)
        client = self._client(Mock(request=request), wait=0.1)
        with patch(
            "cuepoint.services.beatport_token.hold_until_usable", return_value=False
        ):
            with pytest.raises(BeatportAPIError) as exc:
                client.get("/genres")
        assert exc.value.status_code == 401
        assert exc.value.error_code == "BEATPORT_API_AUTH"
        assert seen == ["Bearer old"]

    def test_a_surviving_401_after_the_retry_is_raised(self):
        from cuepoint.services import beatport_token

        beatport_token.set_session_token("old", time.time() + 5)
        seen, request = self._answers(401, 401)
        timer = threading.Timer(0.05, beatport_token.set_session_token, args=("new",))
        timer.start()
        with pytest.raises(BeatportAPIError) as exc:
            self._client(Mock(request=request)).get("/genres")
        timer.join()
        assert exc.value.status_code == 401
        assert seen == ["Bearer old", "Bearer new"]

    def test_a_request_near_expiry_is_held_and_never_sent_with_the_dead_token(self):
        from cuepoint.services import beatport_token

        now = time.time()
        beatport_token.set_session_token("old", now + 0.2)
        seen, request = self._answers(200)
        timer = threading.Timer(
            0.3, beatport_token.set_session_token, args=("new", now + 600)
        )
        timer.start()
        assert self._client(Mock(request=request)).get("/genres") == {"ok": 1}
        timer.join()
        assert seen == ["Bearer new"]

    def test_env_token_401_is_not_waited_for(self, monkeypatch):
        monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", "env")
        seen, request = self._answers(401)
        client = BeatportApiClient(
            "https://api.test",
            "env",
            session=Mock(request=request),
            token_provider=lambda: "env",
        )
        client._token_wait_s = 30.0
        started = time.monotonic()
        with pytest.raises(BeatportAPIError):
            client.get("/genres")
        assert time.monotonic() - started < 2
        assert seen == ["Bearer env"]

    def test_a_client_built_early_uses_the_renewed_token_later(self):
        from cuepoint.services import beatport_token

        beatport_token.set_session_token("first")
        seen, request = self._answers(200)
        client = self._client(Mock(request=request))
        client.get("/a")
        beatport_token.set_session_token("second")
        client.get("/b")
        assert seen == ["Bearer first", "Bearer second"]

    def test_the_provider_decides_whether_a_token_exists(self):
        from cuepoint.services import beatport_token

        client = self._client(Mock())
        with pytest.raises(BeatportAPIError) as exc:
            client.require_token()
        assert exc.value.error_code == "BEATPORT_API_NO_TOKEN"
        beatport_token.set_session_token("x")
        client.require_token()

    def test_a_401_carries_the_token_that_was_sent(self):
        from cuepoint.services import beatport_token

        beatport_token.set_session_token("old", time.time() + 5)
        _, request = self._answers(401, 401)
        timer = threading.Timer(0.05, beatport_token.set_session_token, args=("new",))
        timer.start()
        with pytest.raises(BeatportAPIError) as exc:
            self._client(Mock(request=request)).get("/genres")
        timer.join()
        beatport_token.set_session_token("newer")
        assert exc.value.token_used == "new"

    def test_a_pasted_token_401_raises_at_once(self):
        from cuepoint.services import beatport_token

        beatport_token.set_session_token("pasted")
        seen, request = self._answers(401)
        client = self._client(Mock(request=request), wait=30.0)
        started = time.monotonic()
        with pytest.raises(BeatportAPIError):
            client.get("/genres")
        assert time.monotonic() - started < 1
        assert seen == ["Bearer pasted"]

    def test_a_token_expired_at_launch_costs_one_wait_in_total(self, monkeypatch):
        from cuepoint.services import beatport_token

        monkeypatch.setattr(beatport_token, "HOLD_TIMEOUT_SECONDS", 0.3)
        beatport_token.set_session_token("old", time.time() - 2)
        seen, request = self._answers(401)
        client = self._client(Mock(request=request), wait=None)
        started = time.monotonic()
        for _ in range(4):
            with pytest.raises(BeatportAPIError):
                client.get("/genres")
        assert time.monotonic() - started < 0.9  # one hold of 0.3 s, no more
        assert len(seen) == 4
