#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Beatport the whole-phase journey runs against (DISCOVER-12).

``apps/desktop-electron/e2e/discoverPages.spec.ts``'s phase journey launches
the real app with ``CUEPOINT_BEATPORT_FIXTURE`` naming
``src/tests/fixtures/beatport/phase/fixture.json``. One file answers both
sides of Beatport: the search and track pages Clean's matcher reads, and the
v4 API that resolution, discovery, the pages and the playlist push ask.

A journey that matched nothing, or found the wrong tracks, would still pass
its first steps and fail far from the cause. So this runs the journey's engine
half — through a running engine, the real matcher, the real
``BeatportApiClient`` and the file, with every connection off this machine
refused — and holds it to what the journey expects:

- two tracks matched and accepted automatically, as the Beatport tracks
  19000001 and 19000002;
- resolution linking Mara Veil, Kiko and Nightfall Audio to their ids;
- a run finding four tracks in Mara Veil's chart, two of them hidden as owned;
- a push of the two it shows, with the playlist's real URL;
- Mara Veil's page by id, and Cold Room's by name, each with its halves;
- Similar tracks for Harbour Lights, with reasons;
- and nothing written to the library's tables by any of it (acceptance 10).
"""

from __future__ import annotations

import socket
import time
from pathlib import Path
from typing import Any, Dict, List

import pytest

from cuepoint.data.beatport_fixture import ENV_VAR
from cuepoint.engine import discover_api as api
from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.match_jobs import start_match_job
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient
from cuepoint.utils.di_container import get_container
from tests.unit.key_support import accept_with_key
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

PHASE = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "beatport"
    / "phase"
    / "fixture.json"
)
LOOPBACK = {"127.0.0.1", "::1", "localhost"}

#: The journey's library, as ``discoverPages.spec.ts`` writes it.
TRACKS = [
    (
        "Harbour Lights",
        "Mara Veil, Kiko",
        "Nightfall Audio",
        124.0,
        "8A",
        2025,
        "House",
    ),
    ("Low Tide", "Mara Veil", "Nightfall Audio", 124.0, "9A", 2024, "House"),
    ("Night Bus", "Kiko", "Cold Room", 62.0, "8A", 2023, "Techno"),
    ("Signal", "DJEFF", "Cold Room", 128.0, "8B", 2022, "House"),
]

HARBOUR, LOW, UNDERTOW, SALT = 19000001, 19000002, 19000003, 19000004
MARA, KIKO, NIGHTFALL = 301001, 301002, 40211

#: The library tables no discovery, wantlist, page or similarity action may
#: write (acceptance 10). Matching writes its own tables, never these.
LIBRARY_TABLES = (
    "tracks",
    "track_metadata",
    "track_history",
    "track_files",
    "file_writes",
    "tags",
    "track_tags",
    "collections",
    "collection_tracks",
    "rekordbox_playlists",
    "rekordbox_playlist_tracks",
)


@pytest.fixture
def offline(monkeypatch) -> List[Any]:
    """Refuse every connection and lookup that is not to this machine."""
    reached: List[Any] = []
    connect = socket.socket.connect
    lookup = socket.getaddrinfo

    def guarded_connect(self, address):
        host = address[0] if isinstance(address, tuple) else address
        if host not in LOOPBACK:
            reached.append(address)
            raise OSError(f"network refused in this test: {address}")
        return connect(self, address)

    def guarded_lookup(host, *args, **kwargs):
        if host not in LOOPBACK:
            reached.append(host)
            raise OSError(f"network refused in this test: {host}")
        return lookup(host, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket, "getaddrinfo", guarded_lookup)
    return reached


@pytest.fixture
def journey(monkeypatch, library_db, offline) -> Dict[str, int]:  # noqa: F811
    """The journey's library and Beatport: the file, behind the real client."""
    monkeypatch.setenv(ENV_VAR, str(PHASE))
    monkeypatch.delenv("CUEPOINT_SKIP_BEATPORT", raising=False)
    get_container().register_factory(
        BeatportApi,
        lambda: BeatportApi(
            BeatportApiClient("https://api.beatport.com/v4", "e2e-not-a-real-token")
        ),
    )
    tracks = resolve("ITrackRepository")
    ids: Dict[str, int] = {}
    for number, (title, artist, label, bpm, key, year, genre) in enumerate(
        TRACKS, start=1
    ):
        added = tracks.add(
            LibraryTrack(
                rekordbox_track_id=str(number),
                file_path=str(Path(f"/music/{number}.flac")),
                title=title,
                artist=artist,
                label=label,
                bpm=bpm,
                key=key,
                year=year,
                genre=genre,
            )
        )
        ids[title] = int(added.id)
    # A track's key is its accepted match's Beatport key (DEC-201), never the
    # Rekordbox one above. Harbour Lights and Low Tide are matched by the
    # journey itself; the other two get the keys the export gave them.
    for title, key in (("Night Bus", "8A"), ("Signal", "8B")):
        accept_with_key(resolve("IDatabaseService"), ids[title], key)
    return ids


def match(store: JobStore, ids: List[int]) -> Any:  # noqa: F811
    job = start_match_job(store, BatchSelection.of_ids(ids)).job
    deadline = time.monotonic() + 120
    while job.state in (JobState.QUEUED, JobState.RUNNING):
        assert time.monotonic() < deadline, "the match did not finish"
        time.sleep(0.05)
    return job


def snapshot() -> Dict[str, List[Any]]:
    conn = resolve("IDatabaseService").connect()
    return {
        table: [tuple(row) for row in conn.execute(f"SELECT * FROM {table}")]  # noqa: S608
        for table in LIBRARY_TABLES
    }


def test_the_phase_journey_s_engine_half(engine, store, journey, offline):  # noqa: F811
    # --- match and accept two tracks (Clean) --------------------------------
    job = match(store, [journey["Harbour Lights"], journey["Low Tide"]])
    assert job.state is JobState.SUCCEEDED, job.error
    assert (job.result["accepted"], job.result["needs_review"]) == (2, 0)
    matches = resolve("IMatchRepository").get_matches(
        [journey["Harbour Lights"], journey["Low Tide"]]
    )
    assert {m.state for m in matches.values()} == {"accepted"}
    before = snapshot()

    # --- resolve identities -------------------------------------------------
    started = ok(post(engine, api.RESOLVE_START_PATH), 202)
    resolved = finished(store, started["id"])
    assert resolved.state is JobState.SUCCEEDED, resolved.error

    # --- a run, with the two accepted tracks hidden as owned ----------------
    started = ok(post(engine, api.RUN_START_PATH, {"genre_ids": [5]}), 202)
    ran = finished(store, started["id"])
    assert ran.state is JobState.SUCCEEDED, ran.error
    assert ran.result["tracks_found"] == 4
    run_id = ran.result["id"]
    shown = ok(get(engine, run_path(run_id, "/tracks")))
    assert [row["beatport_track_id"] for row in shown["rows"]] == [UNDERTOW, SALT]
    assert shown["hidden"] == 2
    every = ok(get(engine, run_path(run_id, "/tracks"), owned="all"))
    owned = {row["beatport_track_id"]: row["owned"] for row in every["rows"]}
    assert owned == {UNDERTOW: False, HARBOUR: True, SALT: False, LOW: True}

    # --- the wantlist, and a push of the two the run shows ------------------
    ok(post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [UNDERTOW], "run_id": run_id}))
    wanted = ok(get(engine, api.WANTLIST_PATH))
    assert [row["beatport_track_id"] for row in wanted["rows"]] == [UNDERTOW]
    started = ok(
        post(
            engine, api.PLAYLIST_START_PATH, {"name": "Journey push", "run_id": run_id}
        ),
        202,
    )
    pushed = finished(store, started["id"])
    assert pushed.state is JobState.SUCCEEDED, pushed.error
    assert (pushed.result["added"], pushed.result["failed"]) == (2, 0)
    assert (
        pushed.result["playlist_url"]
        == "https://www.beatport.com/library/playlists/5550101"
    )

    # --- Mara Veil's page, by id since resolution ---------------------------
    by_name = ok(get(engine, api.ENTITY_PATH, kind="artist", ref="name:mara veil"))
    assert by_name["ref"] == f"bp:{MARA}"
    assert by_name["redirected_from"] == "name:mara veil"
    page = ok(get(engine, api.ENTITY_PATH, kind="artist", ref=f"bp:{MARA}"))
    assert page["identity"] == "beatport"
    half = ok(get(engine, api.ENTITY_BEATPORT_PATH, kind="artist", ref=f"bp:{MARA}"))
    assert half["state"] == "ok", half
    assert {row["beatport_track_id"]: row["owned"] for row in half["page"]["rows"]} == {
        SALT: False,
        UNDERTOW: False,
        LOW: True,
        HARBOUR: True,
    }

    # --- Cold Room's page, by name: not on Beatport -------------------------
    label = ok(get(engine, api.ENTITY_PATH, kind="label", ref="name:cold room"))
    assert label["identity"] == "name"
    assert label["ref"] == "name:cold room"
    half = ok(get(engine, api.ENTITY_BEATPORT_PATH, kind="label", ref="name:cold room"))
    assert (half["state"], half["reason"]) == ("name_only", "not_on_beatport")

    # --- Similar tracks for Signal, played from Cold Room's page -----------
    similar = ok(get(engine, api.SIMILAR_PATH, track_id=journey["Signal"]))
    suggestions = similar["suggestions"]
    assert [s["track_id"] for s in suggestions] == [
        journey["Harbour Lights"],
        journey["Night Bus"],
        journey["Low Tide"],
    ]
    assert all(s["reasons"] for s in suggestions)
    assert journey["Signal"] not in [s["track_id"] for s in suggestions]

    # --- nothing in the library's tables was written ------------------------
    assert snapshot() == before
    assert offline == [], "the journey reached the network"
