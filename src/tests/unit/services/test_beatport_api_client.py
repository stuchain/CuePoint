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
        with patch.object(requests.Session, "request") as req:
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
