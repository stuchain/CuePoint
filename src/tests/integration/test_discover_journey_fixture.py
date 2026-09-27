#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Beatport the Discover journey runs against (DISCOVER-10).

``apps/desktop-electron/e2e/discover.spec.ts`` launches the real app over a
real engine with ``CUEPOINT_BEATPORT_FIXTURE`` naming
``src/tests/fixtures/beatport/discover/fixture.json``, whose ``api`` section
answers the v4 catalog in place of the network. A journey that found nothing
would still pass its first steps and fail far from the cause, so this runs the
same discovery the journey starts — through a running engine, the real
``BeatportApiClient`` and the file — and holds it to what the journey expects:
the two genres, one chart by the library's artist, and its three tracks.

Nothing reaches the network: the session's ``request`` refuses outright.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cuepoint.data.beatport_fixture import ENV_VAR
from cuepoint.engine import discover_api as api
from cuepoint.engine.jobs import JobState
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient
from cuepoint.utils.di_container import get_container
from tests.unit.engine.test_engine_discover_api import (  # noqa: F401
    engine,
    finished,
    get,
    library_db,
    ok,
    post,
    resolve,
    run_path,
    store,
)

pytestmark = pytest.mark.integration

JOURNEY = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "beatport"
    / "discover"
    / "fixture.json"
)


@pytest.fixture
def beatport(monkeypatch, library_db):  # noqa: F811
    """The journey's Beatport: the file, behind the real client, no network."""

    def refuse(*_args, **_kwargs):
        raise AssertionError("the network was reached")

    monkeypatch.setattr("requests.Session.request", refuse)
    monkeypatch.setenv(ENV_VAR, str(JOURNEY))
    get_container().register_factory(
        BeatportApi,
        lambda: BeatportApi(
            BeatportApiClient("https://api.beatport.com/v4", "e2e-not-a-real-token")
        ),
    )
    # The journey's collection: the artist whose chart the run finds.
    tracks = resolve("ITrackRepository")
    tracks.add(
        LibraryTrack(
            rekordbox_track_id="1",
            title="Harbour Walk",
            artist="Mara Veil",
            label="Nightfall Audio",
        )
    )


def test_the_journey_s_beatport_offers_its_genres(engine, beatport):  # noqa: F811
    options = ok(get(engine, api.OPTIONS_PATH))
    assert options["beatport"]["state"] == "ok"
    assert [g["name"] for g in options["genres"]] == [
        "House",
        "Techno (Peak Time / Driving)",
    ]


def test_a_run_finds_the_chart_by_the_library_s_artist(engine, store, beatport):  # noqa: F811
    started = ok(post(engine, api.RUN_START_PATH, {"genre_ids": [5]}), 202)
    done = finished(store, started["id"])
    assert done.state is JobState.SUCCEEDED, done.error
    assert done.result["charts_read"] == 1
    assert done.result["tracks_found"] == 3

    page = ok(get(engine, run_path(done.result["id"], "/tracks")))
    assert [row["title"] for row in page["rows"]] == [
        "Harbour Lights",
        "Low Tide",
        "Night Bus",
    ]
    assert page["hidden"] == 0
    sources = page["rows"][0]["sources"]
    assert sources[0]["source_name"] == "Journey Selects"
    assert sources[0]["matched_on"] == "Mara Veil"
    assert page["rows"][0]["url"].startswith("https://www.beatport.com/track/")


def test_two_tracks_go_on_the_wantlist_and_one_is_marked_bought(
    engine,  # noqa: F811
    store,  # noqa: F811
    beatport,
):
    started = ok(post(engine, api.RUN_START_PATH, {"genre_ids": [5]}), 202)
    run_id = finished(store, started["id"]).result["id"]
    added = ok(
        post(
            engine,
            api.WANTLIST_ADD_PATH,
            {"track_ids": [19000011, 19000012], "run_id": run_id},
        )
    )
    assert added["changed"] == [19000011, 19000012]
    bought = ok(
        post(
            engine, api.WANTLIST_BOUGHT_PATH, {"track_ids": [19000012], "bought": True}
        )
    )
    assert bought["changed"] == [19000012]
    listed = ok(get(engine, api.WANTLIST_PATH, bought="only"))
    assert [row["title"] for row in listed["rows"]] == ["Low Tide"]
