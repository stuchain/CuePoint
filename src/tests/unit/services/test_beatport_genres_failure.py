"""A failed Beatport genres read is cached for a minute and times out at 8 s (C19)."""

import socket
import threading
import time
from unittest.mock import Mock, patch

import pytest
import requests

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services import beatport_api
from cuepoint.services.beatport_api import BeatportApi, GenresFailureCache
from cuepoint.services.beatport_api_client import BeatportApiClient


class _Clock:
    """A clock the test moves by hand, so no test sleeps."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _genre_page() -> dict:
    return {"results": [{"id": 5, "name": "House", "slug": "house"}], "next": None}


def _api_with(client: Mock, clock: _Clock) -> BeatportApi:
    return BeatportApi(client, genres_failure=GenresFailureCache(clock=clock))


def _client(token: str = "tok-a", **get_kwargs) -> Mock:
    client = Mock(spec=BeatportApiClient)
    client.access_token = token
    client.get.configure_mock(**get_kwargs)
    return client


class TestGenresFailureCache:
    """A failed genres read is remembered for a minute, so a page visit stays quick."""

    def test_unavailable_is_cached_for_sixty_seconds(self):
        clock = _Clock()
        down = BeatportAPIError("Beatport API error: 503", status_code=503)
        client = _client(side_effect=down)
        api = _api_with(client, clock)
        with pytest.raises(BeatportAPIError):
            api.genres()
        assert client.get.call_count == 1
        clock.now += 59
        with pytest.raises(BeatportAPIError) as again:
            api.genres()
        assert client.get.call_count == 1
        assert again.value.status_code == 503
        clock.now += 2
        with pytest.raises(BeatportAPIError):
            api.genres()
        assert client.get.call_count == 2

    def test_a_timeout_is_unavailable_too(self):
        client = _client(
            side_effect=BeatportAPIError("Request timed out", status_code=0)
        )
        api = _api_with(client, _Clock())
        for _ in range(3):
            with pytest.raises(BeatportAPIError):
                api.genres()
        assert client.get.call_count == 1

    def test_no_token_is_never_cached(self):
        client = _client(
            token="",
            side_effect=BeatportAPIError(
                "no token", status_code=0, error_code="BEATPORT_API_NO_TOKEN"
            ),
        )
        api = _api_with(client, _Clock())
        for _ in range(3):
            with pytest.raises(BeatportAPIError):
                api.genres()
        assert client.get.call_count == 3

    @pytest.mark.parametrize("status", [401, 403, 429])
    def test_only_unavailable_is_cached(self, status):
        client = _client(side_effect=BeatportAPIError("refused", status_code=status))
        api = _api_with(client, _Clock())
        for _ in range(2):
            with pytest.raises(BeatportAPIError):
                api.genres()
        assert client.get.call_count == 2

    def test_a_success_is_not_affected(self):
        client = _client(return_value=_genre_page())
        api = _api_with(client, _Clock())
        assert [g.name for g in api.genres()] == ["House"]
        assert [g.name for g in api.genres()] == ["House"]

    def test_a_token_change_clears_it(self):
        client = _client(side_effect=BeatportAPIError("down", status_code=500))
        api = _api_with(client, _Clock())
        with pytest.raises(BeatportAPIError):
            api.genres()
        client.access_token = "tok-b"
        client.get.side_effect = None
        client.get.return_value = _genre_page()
        assert [g.name for g in api.genres()] == ["House"]
        assert client.get.call_count == 2

    def test_forget_genres_failure_clears_it(self):
        client = _client(side_effect=BeatportAPIError("down", status_code=500))
        api = BeatportApi(client)  # the shared cache, as production has it
        with pytest.raises(BeatportAPIError):
            api.genres()
        with pytest.raises(BeatportAPIError):
            api.genres()
        assert client.get.call_count == 1
        beatport_api.forget_genres_failure()
        with pytest.raises(BeatportAPIError):
            api.genres()
        assert client.get.call_count == 2

    def test_the_cache_does_not_hold_the_token(self):
        cache = GenresFailureCache()
        cache.remember("tok-secret-xyz", BeatportAPIError("down", status_code=500))
        assert "tok-secret-xyz" not in repr(vars(cache))


class TestGenresReadTimeout:
    """The genres read has its own short timeout and no retry on a timeout."""

    def test_the_budget_is_eight_seconds_and_no_retry(self):
        assert beatport_api.GENRES_TIMEOUT_SECONDS == 8
        assert beatport_api.GENRES_RETRY_ON_TIMEOUT is False

    def test_the_client_is_asked_with_it(self):
        client = _client(return_value=_genre_page())
        _api_with(client, _Clock()).genres()
        kwargs = client.get.call_args.kwargs
        assert kwargs["timeout"] == 8
        assert kwargs["retry_on_timeout"] is False

    def test_other_calls_keep_the_clients_own_timeout(self):
        with patch.object(requests.Session, "request") as req:
            req.return_value = Mock(status_code=200, content=b"{}")
            req.return_value.json.return_value = {}
            req.return_value.raise_for_status = Mock()
            client = BeatportApiClient("https://api.test", "t", timeout=30)
            client.get("/x")
            assert req.call_args.kwargs["timeout"] == 30
            client.get("/x", timeout=8)
            assert req.call_args.kwargs["timeout"] == 8

    def test_a_timeout_after_a_server_error_is_not_retried(self):
        with patch.object(requests.Session, "request") as req:
            req.side_effect = [
                Mock(status_code=500, content=b""),
                requests.exceptions.Timeout("slow"),
            ]
            client = BeatportApiClient("https://api.test", "t")
            with (
                patch("cuepoint.services.reliability_retry.time.sleep"),
                pytest.raises(BeatportAPIError) as caught,
            ):
                client.get("/x", timeout=8, retry_on_timeout=False)
            assert req.call_count == 2
            assert caught.value.error_code == "BEATPORT_API_TIMEOUT"

    def test_a_timeout_is_still_retried_by_default(self):
        with patch.object(requests.Session, "request") as req:
            req.side_effect = [
                Mock(status_code=500, content=b""),
                requests.exceptions.Timeout("slow"),
                requests.exceptions.Timeout("slow"),
                requests.exceptions.Timeout("slow"),
            ]
            client = BeatportApiClient("https://api.test", "t")
            with (
                patch("cuepoint.services.reliability_retry.time.sleep"),
                pytest.raises(BeatportAPIError),
            ):
                client.get("/x")
            assert req.call_count == 4

    @pytest.mark.slow
    def test_a_server_that_never_answers_fails_in_about_eight_seconds(self):
        """The real timeout, against a socket that accepts and stays silent."""
        server = socket.socket()
        server.bind(("127.0.0.1", 0))
        server.listen(8)
        held = []
        stop = threading.Event()

        def accept_forever() -> None:
            server.settimeout(0.2)
            while not stop.is_set():
                try:
                    held.append(server.accept()[0])
                except OSError:
                    continue

        thread = threading.Thread(target=accept_forever, daemon=True)
        thread.start()
        try:
            client = BeatportApiClient(
                f"http://127.0.0.1:{server.getsockname()[1]}", "tok", timeout=30
            )
            api = BeatportApi(client, genres_failure=GenresFailureCache())
            started = time.monotonic()
            with pytest.raises(BeatportAPIError) as caught:
                api.genres()
            elapsed = time.monotonic() - started
        finally:
            stop.set()
            thread.join(timeout=2)
            for conn in held:
                conn.close()
            server.close()
        assert caught.value.error_code == "BEATPORT_API_TIMEOUT"
        assert 7 <= elapsed < 12
