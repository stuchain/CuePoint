#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: a Beatport search that is blocked was reported as "No match found".

On 2026-10-14 a Clean match of a 24-track playlist ended with "No match found"
for every track, each taking 48-85 seconds, and the log held nothing but the
"Processing" and "No match found" lines. The match does not use the signed-in
Beatport API: it finds candidates through DuckDuckGo and Beatport's public
website, and reads each candidate's page. Beatport's website had begun
answering every request with Cloudflare's "Just a moment..." page (HTTP 403)
and DuckDuckGo answered nothing, so every query came back empty. The matcher
turned each failure into an empty list, and an empty list is exactly what
"Beatport does not have this track" looks like. Every guess and fallback then
waited out its own timeout, once per query, per track.

These tests answer from stand-ins for the two services (no network) and pin:

- a blocked search is an ``error`` carrying ``search_failed:<kind>``, not a
  no-match, and a search that worked and found nothing is still a no-match;
- the failure is logged once, with its reason;
- once Beatport's site has refused, the next track fails at once instead of
  asking again.
"""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import List
from unittest.mock import Mock

import pytest
import requests

from cuepoint.data import beatport, beatport_search, search_health
from cuepoint.models.config import SETTINGS
from cuepoint.models.track import Track
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.processor_service import ProcessorService

pytestmark = pytest.mark.unit

CHALLENGE = "<html><title>Just a moment...</title></html>"


class _Session:
    """Stands in for ``requests.Session``: every GET gets the same answer."""

    def __init__(self, status: int, body: str = CHALLENGE, error=None):
        self.status = status
        self.body = body
        self.error = error
        self.calls: List[str] = []
        self.headers: dict = {}

    def get(self, url, **_kwargs):
        self.calls.append(url)
        if self.error is not None:
            raise self.error
        response = requests.Response()
        response.status_code = self.status
        response._content = self.body.encode()
        response.headers["Server"] = "cloudflare"
        return response


class _EmptyDdgs:
    """DuckDuckGo answering without a single result."""

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def text(self, *args, **kwargs):
        return []


@pytest.fixture
def offline(monkeypatch):
    """No network: Beatport's site and DuckDuckGo are stand-ins."""
    monkeypatch.delenv("CUEPOINT_SKIP_BEATPORT", raising=False)
    monkeypatch.setattr(beatport, "DDGS", _EmptyDdgs)
    SETTINGS["DDG_PREFLIGHT_ENABLED"] = False
    SETTINGS["USE_BROWSER_AUTOMATION"] = False  # installed builds ship without it
    SETTINGS["MAX_QUERIES_PER_TRACK"] = 6

    def serve(session: _Session) -> _Session:
        monkeypatch.setattr(beatport, "SESSION", session)
        monkeypatch.setattr(beatport_search, "SESSION", session)
        return session

    return serve


def _processor() -> tuple[ProcessorService, Mock]:
    logging_service = Mock()
    processor = ProcessorService(
        beatport_service=Mock(),
        matcher_service=MatcherService(),
        logging_service=logging_service,
        config_service=Mock(),
    )
    return processor, logging_service


def _process(processor: ProcessorService, title="Glue", artist="Bicep"):
    return processor.process_track(
        1, Track(track_id="1", title=title, artist=artist), {"MIN_ACCEPT_SCORE": 70}
    )


def test_a_blocked_beatport_site_is_a_failed_search_not_a_missing_track(offline):
    offline(_Session(403))
    processor, logging_service = _processor()

    result = _process(processor)

    assert result.matched is False
    assert search_health.failure_kind(result.error) == search_health.KIND_BLOCKED
    assert result.error.startswith("search_failed:blocked: ")


def test_the_failure_is_logged_once_with_its_reason_and_never_as_no_match(offline):
    offline(_Session(403))
    processor, logging_service = _processor()

    _process(processor)

    warnings = [call.args[0] for call in logging_service.warning.call_args_list]
    assert len(warnings) == 1
    assert "Search failed (blocked)" in warnings[0]
    assert "beatport.com blocked (HTTP 403)" in warnings[0]
    assert not any("No match found" in w for w in warnings)


def test_a_search_that_worked_and_found_nothing_is_still_no_match(offline):
    offline(_Session(200, body="<html><body>No results</body></html>"))
    processor, logging_service = _processor()

    result = _process(processor)

    assert result.matched is False
    assert result.error is None
    warnings = [call.args[0] for call in logging_service.warning.call_args_list]
    assert warnings and all("No match found" in w for w in warnings)


def test_once_the_site_has_refused_the_next_track_does_not_ask_again(offline):
    session = offline(_Session(403))
    processor, _ = _processor()

    _process(processor, title="Glue")
    asked = len(session.calls)
    started = time.perf_counter()
    second = _process(processor, title="Westworld", artist="Chiapet")

    assert asked > 0
    assert len(session.calls) == asked  # not one more request
    assert search_health.failure_kind(second.error) == search_health.KIND_BLOCKED
    assert time.perf_counter() - started < 2.0


def test_a_site_that_cannot_be_reached_is_a_network_failure(offline):
    offline(_Session(0, error=requests.ConnectionError("no route")))
    processor, _ = _processor()

    result = _process(processor)

    assert search_health.failure_kind(result.error) == search_health.KIND_NETWORK


def test_candidates_found_but_unreadable_are_a_failed_search_too(monkeypatch, offline):
    """DuckDuckGo answered, but every candidate page is behind the challenge."""
    offline(_Session(403))
    url = "https://www.beatport.com/track/glue/123"

    class _Ddgs(_EmptyDdgs):
        def text(self, *args, **kwargs):
            return [{"href": url}]

    monkeypatch.setattr(beatport, "DDGS", _Ddgs)
    processor, _ = _processor()

    result = _process(processor)

    assert result.matched is False
    assert search_health.failure_kind(result.error) == search_health.KIND_BLOCKED
    assert [c.reject_reason for c in result.candidates] == ["no_title"] * len(
        result.candidates
    )


def test_a_candidate_that_was_read_means_the_search_answered(monkeypatch, offline):
    """A failure on the way does not hide a search that did return candidates."""
    offline(_Session(403))
    processor, _ = _processor()
    scored = SimpleNamespace(reject_reason="guard_artist_sim_no_overlap")
    with search_health.collect() as failures:
        search_health.note("beatport.com", search_health.KIND_BLOCKED, "HTTP 403")
    from cuepoint.services.processor_service import _search_failure_kind

    assert _search_failure_kind(failures, [scored]) is None
    assert _search_failure_kind(failures, []) == search_health.KIND_BLOCKED
