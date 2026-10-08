#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Phase 10's journey, the engine half, on every build (PREP-12).

The phase journey is nine steps a DJ takes with a Set. ``e2e/prepareJourney.spec.ts``
takes them through the app; this takes the same nine through the engine's own
routes, against a real engine over a real database, so every build proves them
and each step's outcome is read back rather than assumed:

1. A Set made from a Collection with a repeat.
2. Three chapters, one with a target length and a BPM range.
3. Timed entries, a reorder, and the running time and "starts at" moving.
4. A gap filled from Suggestions, and a key warning accepted.
5. The running order the player is handed, repeat included, from the third
   entry.
6. The set list as text, CSV and M3U8, and as copied text.
7. The Rekordbox export with the Set ticked.
8. A relaunch onto the Set, all of it intact.
9. A refresh that deletes one of its tracks, with the Set counted in the
   warning.

It also holds what the phase promises never happens: the source XML is not
written, and no warning refuses anything (DEC-017).
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pytest

from tests.unit.engine.test_engine_library_refresh import (  # noqa: F401
    PREVIEW,
    TOKEN,
    diff_store,
    do_import,
    do_preview,
    engine,
    job_result,
    library_db,
    request,
    wait_for_job,
)

pytestmark = pytest.mark.integration

#: id, title, bpm, key, seconds. Tracks 1–5 make the Collection; 6 and 7 are
#: in the library to be suggested; 8 is far from everything.
TRACKS = (
    (1, "Warm One", 124.0, "8A", 300),
    (2, "Warm Two", 125.0, "9A", 320),
    (3, "Build", 126.0, "8A", 360),
    (4, "Peak Jump", 140.0, "3B", 280),
    (5, "Close", 124.5, "8B", 400),
    (6, "Bridge Spare", 124.8, "9A", 330),
    (7, "Other Spare", 123.0, "8A", 310),
    (8, "Far Away", 174.0, "1A", 300),
)


def write_collection(folder: Path, ids, name: str = "collection.xml") -> Path:
    tracks = "\n".join(
        f'    <TRACK TrackID="{i}" Name="{title}" Artist="Ada" Genre="House"'
        f' Tonality="{key}" AverageBpm="{bpm:.2f}" TotalTime="{seconds}"'
        f' Location="file://localhost/music/{i}.mp3"/>'
        for i, title, bpm, key, seconds in TRACKS
        if i in ids
    )
    path = folder / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        '  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>\n'
        f'  <COLLECTION Entries="{len(ids)}">\n{tracks}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="0"/></PLAYLISTS>\n'
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return path


def ok(base: str, path: str, body=None, method: str = "POST") -> dict:
    status, payload = request(base, path, method=method, body=body)
    assert status == 200, (path, status, payload)
    return payload


def get(base: str, path: str, **params) -> dict:
    query = "&".join(f"{key}={value}" for key, value in params.items())
    return ok(base, f"{path}?{query}" if query else path, method="GET")


def whole(base: str, set_id: int) -> dict:
    return {
        part: get(base, f"/api/v1/sets/{part}", set_id=set_id)
        for part in ("plan", "entries", "analysis")
    }


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def start_engine():
    """A second engine over the same database: the app relaunched."""
    from cuepoint.engine.server import EngineConfig, start_engine_thread
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.utils.di_container import reset_container
    from tests.unit.engine.test_engine_library_refresh import _free_port

    reset_container()
    bootstrap_services()
    port = _free_port()
    httpd, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    return f"http://127.0.0.1:{port}", httpd, thread


def test_the_phase_journey(engine, library_db, tmp_path):  # noqa: F811
    source = write_collection(tmp_path, [i for i, *_ in TRACKS])
    source_digest = digest(source)
    do_import(engine, str(source))
    tracks = {
        row["title"]: row["id"]
        for row in get(engine, "/api/v1/library/search", mode="browse", limit=50)[
            "tracks"
        ]
    }
    # The keys are Beatport's (DEC-201): the Rekordbox ones in the export are
    # never read, so each track gets an accepted match carrying its key.
    from cuepoint.services.interfaces import IDatabaseService
    from cuepoint.utils.di_container import get_container
    from tests.unit.key_support import accept_with_key

    database = get_container().resolve(IDatabaseService)
    for _id, title, _bpm, key, _seconds in TRACKS:
        accept_with_key(database, tracks[title], key)

    # --- 1. a Set from a Collection with a repeat --------------------------
    gigs = ok(engine, "/api/v1/collections/create", {"kind": "folder", "name": "Gigs"})[
        "collection"
    ]["id"]
    crate = ok(
        engine,
        "/api/v1/collections/create",
        {"kind": "collection", "name": "Crate", "parent_id": gigs},
    )["collection"]["id"]
    ok(
        engine,
        "/api/v1/collections/tracks/add",
        {
            "collection_id": crate,
            "track_ids": [
                tracks[t]
                for t in ("Warm One", "Warm Two", "Build", "Peak Jump", "Close")
            ],
        },
    )
    ok(
        engine,
        "/api/v1/collections/tracks/insert",
        {"collection_id": crate, "track_id": tracks["Warm One"], "position": 5},
    )
    made = ok(
        engine,
        "/api/v1/sets/create-from",
        {
            "source": {"kind": "collection", "id": crate},
            "name": "Friday",
            "parent_id": gigs,
        },
    )
    set_id = made["set"]["id"]
    assert made["track_count"] == 6
    order = [e["track"]["title"] for e in whole(engine, set_id)["entries"]["entries"]]
    assert order == ["Warm One", "Warm Two", "Build", "Peak Jump", "Close", "Warm One"]
    entries = [
        e["entry_id"]
        for e in get(engine, "/api/v1/sets/plan", set_id=set_id)["entries"]
    ]

    # --- 2. three chapters, one with a target and a range ------------------
    ok(engine, "/api/v1/sets/chapters/split", {"entry_id": entries[2], "name": "Peak"})
    ok(engine, "/api/v1/sets/chapters/split", {"entry_id": entries[4], "name": "Close"})
    first = get(engine, "/api/v1/sets/plan", set_id=set_id)["chapters"][0]["id"]
    ok(
        engine,
        "/api/v1/sets/chapters/update",
        {
            "chapter_id": first,
            "name": "Warm-up",
            "target": "8:00",
            "bpm_min": 120,
            "bpm_max": 127,
        },
    )
    plan = get(engine, "/api/v1/sets/plan", set_id=set_id)
    assert [c["name"] for c in plan["chapters"]] == ["Warm-up", "Peak", "Close"]
    assert (plan["chapters"][0]["target_seconds"], plan["chapters"][0]["bpm_min"]) == (
        480,
        120,
    )

    # --- 3. times, a reorder, and the running time and starts moving -------
    ok(
        engine,
        "/api/v1/sets/entries/times",
        {"entry_id": entries[0], "in_time": "0:30", "out_time": "4:30"},
    )
    ok(
        engine,
        "/api/v1/sets/entries/times",
        {"entry_id": entries[1], "in_time": None, "out_time": "5:00"},
    )
    plan = get(engine, "/api/v1/sets/plan", set_id=set_id)
    assert plan["running_time"] == {"seconds": 540, "timed": 2, "untimed": 4}
    assert [e["starts_at"] for e in plan["entries"][:3]] == [0, 240, 540]
    ok(
        engine,
        "/api/v1/sets/entries/move",
        {"entry_id": entries[1], "position": 0},
    )
    plan = get(engine, "/api/v1/sets/plan", set_id=set_id)
    assert [e["entry_id"] for e in plan["entries"][:2]] == [entries[1], entries[0]]
    # Warm Two now opens: 5:00, then Warm One's four minutes from 5:00.
    assert [e["starts_at"] for e in plan["entries"][:3]] == [0, 300, 540]
    assert plan["running_time"]["seconds"] == 540

    # --- 4. a gap filled from Suggestions, and a key warning accepted ------
    order_ids = [e["entry_id"] for e in plan["entries"]]
    gap = {"before_entry_id": order_ids[0], "after_entry_id": order_ids[1]}
    suggested = get(engine, "/api/v1/sets/suggestions", set_id=set_id, **gap)
    assert suggested["no_fit"] is None and suggested["suggestions"]
    pick = suggested["suggestions"][0]
    assert pick["before"] and pick["after"]
    ok(
        engine,
        "/api/v1/collections/tracks/insert",
        {
            "collection_id": set_id,
            "track_id": pick["track_id"],
            "position": 1,
            "chapter_id": suggested["chapter_id"],
        },
    )
    analysis = get(engine, "/api/v1/sets/analysis", set_id=set_id)
    inserted = get(engine, "/api/v1/sets/plan", set_id=set_id)["entries"][1]
    assert inserted["track_id"] == pick["track_id"]
    # Acceptance 8: the track suggested for the slot never jumps there.
    around = [
        t
        for t in analysis["transitions"]
        if inserted["entry_id"] in (t["from_entry_id"], t["to_entry_id"])
    ]
    assert all(w["kind"] != "tempo_jump" for t in around for w in t["warnings"])
    peak = next(
        e["entry_id"]
        for e in get(engine, "/api/v1/sets/plan", set_id=set_id)["entries"]
        if e["track_id"] == tracks["Peak Jump"]
    )
    (into_peak,) = [t for t in analysis["transitions"] if t["to_entry_id"] == peak]
    assert {w["kind"] for w in into_peak["warnings"]} == {"tempo_jump", "key_clash"}
    ok(
        engine,
        "/api/v1/sets/acknowledge",
        {
            "from_entry_id": into_peak["from_entry_id"],
            "to_entry_id": into_peak["to_entry_id"],
            "warning": "key_clash",
        },
    )
    analysis = get(engine, "/api/v1/sets/analysis", set_id=set_id)
    assert analysis["acknowledged"] == 1
    # The jump into the peak, and the one out of it, still stand: accepted
    # warnings are counted apart, and none refuses anything (DEC-017).
    assert analysis["counts"].get("tempo_jump") == 2

    # --- 5. the running order the player is handed, from the third entry ---
    running = [e["track"]["title"] for e in whole(engine, set_id)["entries"]["entries"]]
    assert len(running) == 7
    from_third = running[2:]
    assert from_third.count("Warm One") == 2

    # --- 6. set lists, as files and as copied text; no warning refuses ------
    written = {}
    for extension in ("txt", "csv", "m3u8"):
        destination = tmp_path / "lists" / f"Friday.{extension}"
        destination.parent.mkdir(exist_ok=True)
        saved = ok(
            engine,
            "/api/v1/sets/set-list/save",
            {"set_id": set_id, "destination_path": str(destination)},
        )
        assert Path(saved["saved"]["path"]) == destination
        written[extension] = destination
    copied = get(engine, "/api/v1/sets/set-list/text", set_id=set_id)["text"]
    assert written["txt"].read_text(encoding="utf-8") == copied
    from cuepoint.data.playlist_file import parse_m3u

    listed = [
        Path(path).name for path, _title, _artist in parse_m3u(str(written["m3u8"]))
    ]
    assert len(listed) == 7 and listed.count("1.mp3") == 2
    assert "Peak Jump" in written["csv"].read_text(encoding="utf-8")

    # --- 7. the Rekordbox export with the Set ticked -------------------------
    destination = tmp_path / "out" / "CuePoint Export.xml"
    destination.parent.mkdir()
    status, started = request(
        engine,
        "/api/v1/rekordbox-export/start",
        method="POST",
        body={"collection_ids": [set_id], "destination_path": str(destination)},
    )
    assert status == 202, started
    finished = wait_for_job(engine, started["job_id"])
    assert finished["state"] == "succeeded", finished
    exported = destination.read_text(encoding="utf-8")
    (friday,) = re.findall(
        r'<NODE Name="Friday" Type="1"[^>]*>(.*?)</NODE>', exported, re.S
    )
    assert len(re.findall(r"<TRACK Key=", friday)) == 7
    # DEC-109: chapters, times and notes stay in CuePoint.
    for kept in ("Warm-up", 'Peak"', "8:00", "4:30"):
        assert kept not in exported, kept
    history = get(engine, "/api/v1/rekordbox-export/history")
    kinds = [p["kind"] for e in history["exports"] for p in e["playlists"]]
    assert "set" in kinds
    assert digest(source) == source_digest

    # --- 8. a relaunch onto the Set, all of it intact -------------------------
    before = whole(engine, set_id)
    base, httpd, thread = start_engine()
    try:
        assert whole(base, set_id) == before

        # --- 9. a refresh that deletes one of its tracks -----------------------
        smaller = write_collection(
            tmp_path, [i for i, *_ in TRACKS if i != 2], name="collection.xml"
        )
        import os

        stat = os.stat(smaller)
        os.utime(smaller, (stat.st_atime + 5, stat.st_mtime + 5))
        diff = do_preview(base, str(smaller))
        references = diff["references"]
        assert references["set_count"] == 1
        assert references["collection_count"] == 1
        assert references["set_track_count"] == 1
    finally:
        httpd.shutdown()
        thread.join(timeout=2)
