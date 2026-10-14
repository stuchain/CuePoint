"""How the Beatport search backends report that they failed (``search_health``)."""

from __future__ import annotations

import pytest
import requests

from cuepoint.data import beatport, search_health
from cuepoint.models.config import SETTINGS

pytestmark = pytest.mark.unit


class _Raising:
    """A ``DDGS`` whose every search raises ``error``; counts constructions."""

    built = 0
    error: Exception = RuntimeError("boom")

    def __init__(self, *args, **kwargs):
        type(self).built += 1

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def text(self, *args, **kwargs):
        raise type(self).error


@pytest.fixture
def ddg(monkeypatch):
    SETTINGS["DDG_PREFLIGHT_ENABLED"] = False
    _Raising.built = 0
    monkeypatch.setattr(beatport, "DDGS", _Raising)
    return _Raising


class TestDuckDuckGo:
    def test_a_rate_limit_blocks_duckduckgo_and_the_next_query_does_not_ask(self, ddg):
        ddg.error = type("RatelimitException", (Exception,), {})("429 Too Many")
        with search_health.collect() as log:
            assert beatport.ddg_track_urls(1, "glue bicep", 10) == []
        assert log.worst_kind() == search_health.KIND_BLOCKED

        built = ddg.built
        with search_health.collect() as second:
            assert beatport.ddg_track_urls(1, "westworld chiapet", 10) == []
        assert ddg.built == built
        assert second.worst_kind() == search_health.KIND_BLOCKED

    def test_no_results_found_is_not_a_failure(self, ddg):
        ddg.error = type("DDGSException", (Exception,), {})("No results found.")
        with search_health.collect() as log:
            beatport.ddg_track_urls(1, "glue bicep", 10)
        assert log.worst_kind() is None
        assert search_health.is_down(search_health.BACKEND_DUCKDUCKGO) is False

    def test_an_unreachable_duckduckgo_is_a_network_failure(self, monkeypatch):
        SETTINGS["DDG_PREFLIGHT_ENABLED"] = True

        def refuse(*args, **kwargs):
            raise OSError("no route")

        monkeypatch.setattr(beatport.socket, "create_connection", refuse)
        with search_health.collect() as log:
            assert beatport.ddg_track_urls(1, "glue bicep", 10) == []
        assert log.worst_kind() == search_health.KIND_NETWORK


class _Session:
    headers: dict = {}

    def __init__(self, status=200, error=None):
        self.status, self.error, self.calls = status, error, 0

    def get(self, url, **kwargs):
        self.calls += 1
        if self.error:
            raise self.error
        response = requests.Response()
        response.status_code = self.status
        response._content = b"<html></html>"
        return response


class TestRequestHtml:
    def test_a_403_blocks_the_site_and_later_pages_are_not_requested(self, monkeypatch):
        session = _Session(403)
        monkeypatch.setattr(beatport, "SESSION", session)
        with search_health.collect() as log:
            assert beatport.request_html("https://www.beatport.com/track/a/1") is None
            asked = session.calls
            assert beatport.request_html("https://www.beatport.com/track/b/2") is None
        assert session.calls == asked
        assert log.worst_kind() == search_health.KIND_BLOCKED
        assert "HTTP 403" in log.describe()

    def test_a_read_timeout_is_noted_but_does_not_block_the_site(self, monkeypatch):
        monkeypatch.setattr(
            beatport, "SESSION", _Session(error=requests.ReadTimeout("slow"))
        )
        with search_health.collect() as log:
            assert beatport.request_html("https://www.beatport.com/track/a/1") is None
        assert log.worst_kind() == search_health.KIND_TIMEOUT
        assert search_health.is_down(search_health.BACKEND_BEATPORT_WEB) is False

    def test_a_server_error_is_unavailable(self, monkeypatch):
        monkeypatch.setattr(beatport, "SESSION", _Session(503))
        with search_health.collect() as log:
            beatport.request_html("https://www.beatport.com/track/a/1")
        assert log.worst_kind() == search_health.KIND_UNAVAILABLE


class TestNoteHttpStatus:
    @pytest.mark.parametrize("odd", [None, False, "403", object()])
    def test_a_status_that_is_not_a_number_is_ignored(self, odd):
        with search_health.collect() as log:
            beatport.note_http_status(odd)
        assert log.worst_kind() is None

    def test_a_missing_response_does_not_break_a_page_fetch(self, monkeypatch):
        class Nothing:
            headers: dict = {}

            def get(self, *args, **kwargs):
                return None

        monkeypatch.setattr(beatport, "SESSION", Nothing())
        assert beatport.request_html("https://www.beatport.com/track/a/1") is None
