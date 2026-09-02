#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The activity feed endpoint (SHELL-08, DEC-026).

FOUNDATION-08 made the feed durable and append-only; nothing has ever read it
back out. These tests cover the read side, and one thing that is not really
about code at all: that this did not get filed under ``/history``, which
already means past match runs.

Events are only ever written through ``ActivityService``. The table is
append-only and a test that inserted rows behind the service would be testing a
path the application does not have.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container

TOKEN = "activity-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _get(url: str, token: str | None = TOKEN):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=headers, method="GET"), timeout=5
    )


def _get_json(base: str, query: str) -> dict:
    with _get(f"{base}{query}") as resp:
        payload: dict = json.loads(resp.read().decode("utf-8"))
    return payload


@pytest.fixture
def container(tmp_path, monkeypatch):
    """Services bootstrapped over a sandboxed database."""
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    yield
    reset_container()


@pytest.fixture
def activity(container):
    from cuepoint.services.interfaces import IActivityService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IActivityService)


@pytest.fixture
def engine(container):
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


@pytest.mark.unit
class TestEmptyFeed:
    def test_returns_an_empty_feed_rather_than_failing(self, engine):
        # The normal state for now: FOUNDATION-08 built the feed and nothing
        # yet records into it.
        payload = _get_json(engine, "/api/v1/activity/recent")

        assert payload["events"] == []
        assert payload["total"] == 0

    def test_returns_the_documented_envelope(self, engine):
        payload = _get_json(engine, "/api/v1/activity/recent")

        assert set(payload) == {"events", "total", "limit"}


@pytest.mark.unit
class TestReadingEvents:
    def test_returns_an_event_recorded_through_the_service(self, activity, engine):
        activity.record_event(
            event_type="library.import",
            summary="Imported 120 tracks",
            detail={"count": 120},
        )

        payload = _get_json(engine, "/api/v1/activity/recent")

        assert payload["total"] == 1
        event = payload["events"][0]
        assert event["type"] == "library.import"
        assert event["summary"] == "Imported 120 tracks"
        assert event["detail"] == {"count": 120}
        assert event["created_at"]
        assert isinstance(event["id"], int)

    def test_returns_events_newest_first(self, activity, engine):
        for i in range(3):
            activity.record_event(event_type="test", summary=f"Event {i}")

        summaries = [
            e["summary"] for e in _get_json(engine, "/api/v1/activity/recent")["events"]
        ]

        assert summaries == ["Event 2", "Event 1", "Event 0"]

    def test_total_counts_every_event_not_the_page(self, activity, engine):
        for i in range(5):
            activity.record_event(event_type="test", summary=f"Event {i}")

        payload = _get_json(engine, "/api/v1/activity/recent?limit=2")

        assert len(payload["events"]) == 2
        assert payload["total"] == 5

    def test_filters_by_type(self, activity, engine):
        activity.record_event(event_type="library.import", summary="Imported")
        activity.record_event(event_type="backup.created", summary="Backed up")

        payload = _get_json(engine, "/api/v1/activity/recent?type=backup.created")

        assert [e["summary"] for e in payload["events"]] == ["Backed up"]

    def test_serializes_an_event_with_no_detail(self, activity, engine):
        activity.record_event(event_type="test", summary="No detail here")

        assert _get_json(engine, "/api/v1/activity/recent")["events"][0]["detail"] == {}


@pytest.mark.unit
class TestLimits:
    def test_clamps_the_limit(self, activity, engine):
        for i in range(3):
            activity.record_event(event_type="test", summary=f"Event {i}")

        assert _get_json(engine, "/api/v1/activity/recent?limit=99999")["limit"] == 200
        assert len(_get_json(engine, "/api/v1/activity/recent?limit=1")["events"]) == 1
        assert len(_get_json(engine, "/api/v1/activity/recent?limit=0")["events"]) == 1


@pytest.mark.unit
class TestErrors:
    def test_requires_a_token(self, engine):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/activity/recent", token=None)

        assert excinfo.value.code == 401

    def test_rejects_a_non_numeric_limit(self, engine):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/activity/recent?limit=plenty")

        assert excinfo.value.code == 400
        body = json.loads(excinfo.value.read().decode("utf-8"))
        assert body["error"]["code"] == "INVALID_REQUEST"


@pytest.mark.unit
class TestNamingSeparation:
    """The activity feed and the past-searches history are different things.

    ``/api/v1/history/*`` lists exported match-run CSVs. Filing the activity
    feed under the same word would be a confusion baked into the API.
    """

    def test_activity_is_not_served_under_history(self, engine):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/history/activity")

        assert excinfo.value.code == 404

    def test_the_history_endpoint_still_means_past_match_runs(self, engine, activity):
        activity.record_event(event_type="test", summary="Not a past search")

        history = _get_json(engine, "/api/v1/history/recent")

        # Its shape is files, not events — the two endpoints do not overlap.
        assert "files" in history
        assert "events" not in history
