#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Prepare page's source panel and lanes, answered by the real engine (PREP-11).

PREP-11 fills a Set from two places, Suggestions and the library, and draws its
tempo and key as two lanes. Its component tests render from the engine's own
answers, as PREP-10's do (``prepare.fixture.json``): the answers live in one
file, ``prepareSource.fixture.json``, which this test **produces** from a real
engine over a real database and asserts is still what comes back.

Regenerate with::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \
        src/tests/unit/engine/test_prepare_source_fixture.py

and read the diff before committing it.

The library, and why each part is here:

* **Build**, in the folder **Gigs**: "Open One", "Open Two" and "Bridge Deep"
  in the chapter **Open**, then "Peak Loud" and "Peak Two" in **Peak**, whose
  BPM range is 140 to 150.

  - The gap between the first two is fitted against both sides, and "Bridge
    Deep", already in the Set, is offered and marked. "Half Time" is offered at
    half the tempo.
  - The gap from "Bridge Deep" (125) into "Peak Loud" (145) is one nothing
    bridges, with keys that clash, and each side's own list is asked for.
  - The end of the Set is fitted against "Peak Two" alone, inside Peak's range.
  - The first gap is fitted again over a Collection, a Smart Collection and a
    Rekordbox playlist as the pool.

* **Shape**: a Set whose lanes hold every case: the same key twice, one step on
  the wheel, a half-time step, a track with no BPM and no key, a relative key,
  a clash, and a second chapter.
* **Blank**, an empty Set: nothing to fit against.
* The Library tab's reads: a search, the whole library, and a Collection as
  the pool, each through the Library's own browse route.
* An insert at a gap naming its chapter, made on **Scratch**, a copy of Build,
  so Build's answers stay as they are.
* The refusals the panel acts on: a stale gap, an empty Set and a Set that is
  gone.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import (
    KIND_FOLDER,
    KIND_PLAYLIST,
    RekordboxPlaylist,
)
from tests.unit.engine.test_engine_library_browse import (
    engine,  # noqa: F401 — a pytest fixture, used by name
    get_error,
    get_json,
    library_db,  # noqa: F401 — a pytest fixture, used by name
)
from tests.unit.engine.test_engine_organization_api import ok
from tests.unit.key_support import accept_with_key

pytestmark = pytest.mark.unit

#: The file both languages read, beside the renderer code that imports it.
FIXTURE = (
    Path(__file__).resolve().parents[4]
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "prepare"
    / "prepareSource.fixture.json"
)

#: Set to rewrite the fixture instead of asserting against it.
WRITE_ENV = "CUEPOINT_WRITE_FIXTURES"

TRACKS = (
    # title, artist, genre, bpm, key, seconds
    ("Open One", "Ada", "House", 124.0, "8A", 300),
    ("Open Two", "Bea", "House", 126.0, "9A", 320),
    ("Peak Loud", "Cal", "Techno", 145.0, "3B", 280),
    ("Bridge Deep", "Dee", "House", 125.0, "8A", 310),
    ("Deep Spare", "Eve", "House", 125.5, "9A", 330),
    ("Deep Relative", "Fay", "House", 124.5, "8B", 300),
    ("Half Time", "Gus", "Dubstep", 63.0, "9A", 290),
    ("Fast Lane", "Hal", "Techno", 143.0, "3B", 300),
    ("No Tempo", "Ivy", "Ambient", None, None, None),
    ("Far Away", "Jo", "Drum & Bass", 174.0, "1A", 300),
    ("Peak Two", "Kai", "Techno", 146.0, "4B", 300),
)

#: Tracks by title, 1-based as the library numbers them here.
OPEN_ONE, OPEN_TWO, PEAK_LOUD, BRIDGE, SPARE, RELATIVE, HALF, FAST, NO_TEMPO = range(
    1, 10
)
FAR, PEAK_TWO = 10, 11

#: Fields that differ between two identical runs.
VOLATILE = frozenset({"created_at", "updated_at", "added_at", "imported_at"})


def _resolve(name: str):
    from cuepoint.services import interfaces
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(getattr(interfaces, name))


@pytest.fixture
def track_ids(library_db):  # noqa: F811 — the fixture is used by name
    """Eleven tracks, and a Rekordbox playlist of two of them."""
    repo = _resolve("ITrackRepository")
    made = [
        int(
            repo.add(
                LibraryTrack(
                    rekordbox_track_id=str(i),
                    file_path=f"/music/{i}.mp3",
                    title=title,
                    artist=artist,
                    genre=genre,
                    bpm=bpm,
                    key=key,
                    duration_seconds=seconds,
                )
            ).id
        )
        for i, (title, artist, genre, bpm, key, seconds) in enumerate(TRACKS, start=1)
    ]
    # The keys are Beatport's (DEC-201): an accepted match carries each one.
    for track_id, row in zip(made, TRACKS):
        if row[4] is not None:
            accept_with_key(_resolve("IDatabaseService"), track_id, row[4])
    _resolve("IPlaylistRepository").replace_tree(
        [
            RekordboxPlaylist(
                name="CRATES",
                kind=KIND_FOLDER,
                depth=0,
                position=0,
                rekordbox_path="CRATES",
            ),
            RekordboxPlaylist(
                name="Warmers",
                kind=KIND_PLAYLIST,
                depth=1,
                position=0,
                rekordbox_path="CRATES/Warmers",
                parent_path="CRATES",
                track_refs=[str(RELATIVE), str(NO_TEMPO)],
            ),
        ]
    )
    return made


def _sets(base: str, path: str, body: dict) -> dict:
    return ok(base, f"/api/v1/sets/{path}", body)


def _read(base: str, path: str, **params) -> dict:
    return get_json(base, f"/api/v1/sets/{path}", **params)


def _refused_read(base: str, path: str, **params) -> dict:
    status, payload = get_error(base, f"/api/v1/sets/{path}", **params)
    return {"status": status, "payload": payload}


def _whole(base: str, set_id: int) -> dict:
    """Everything the page reads for one Set."""
    return {
        "plan": _read(base, "plan", set_id=set_id),
        "entries": _read(base, "entries", set_id=set_id),
        "analysis": _read(base, "analysis", set_id=set_id),
    }


def _browse(base: str, **params) -> dict:
    """One window of the Library's own browse, as ``useTrackWindow`` asks."""
    return get_json(
        base,
        "/api/v1/library/search",
        mode="browse",
        sort="artist",
        dir="asc",
        limit=100,
        offset=0,
        **params,
    )


def _make_set(base: str, name: str, track_ids: list, parent_id=None) -> int:
    body = {"name": name}
    if parent_id is not None:
        body["parent_id"] = parent_id
    set_id = int(_sets(base, "create", body)["set"]["id"])
    for position, track_id in enumerate(track_ids):
        # One insert at a time keeps a repeat where it was put.
        ok(
            base,
            "/api/v1/collections/tracks/insert",
            {"collection_id": set_id, "track_id": track_id, "position": position},
        )
    return set_id


def _capture(base: str, ids: list) -> dict:
    track = {n: ids[n - 1] for n in range(1, len(ids) + 1)}
    gigs = ok(base, "/api/v1/collections/create", {"kind": "folder", "name": "Gigs"})[
        "collection"
    ]["id"]

    # --- Build: Open (1, 2, 4), then Peak (3, 11) with a range --------------
    build = _make_set(
        base,
        "Build",
        [track[OPEN_ONE], track[OPEN_TWO], track[BRIDGE], track[PEAK_LOUD]]
        + [track[PEAK_TWO]],
        parent_id=gigs,
    )
    entries = [e["entry_id"] for e in _read(base, "plan", set_id=build)["entries"]]
    _sets(base, "chapters/split", {"entry_id": entries[3], "name": "Peak"})
    chapters = [c["id"] for c in _read(base, "plan", set_id=build)["chapters"]]
    _sets(base, "chapters/update", {"chapter_id": chapters[0], "name": "Open"})
    _sets(
        base,
        "chapters/update",
        {"chapter_id": chapters[1], "bpm_min": 140, "bpm_max": 150},
    )

    # --- the pools ------------------------------------------------------------
    crate = ok(
        base, "/api/v1/collections/create", {"kind": "collection", "name": "Crate"}
    )["collection"]["id"]
    ok(
        base,
        "/api/v1/collections/tracks/add",
        {"collection_id": crate, "track_ids": [track[SPARE], track[HALF], track[FAR]]},
    )
    house = {
        "match": "all",
        "rules": [{"field": "genre", "operator": "is", "value": "House"}],
    }
    smart = ok(
        base,
        "/api/v1/collections/smart/save",
        {"name": "House", "rules": house},
    )["collection"]["id"]
    playlists = get_json(base, "/api/v1/library/playlists")["playlists"]
    (warmers,) = [p["id"] for p in playlists if p["path"] == "CRATES/Warmers"]

    first_gap = {"before_entry_id": entries[0], "after_entry_id": entries[1]}
    stuck_gap = {"before_entry_id": entries[2], "after_entry_id": entries[3]}
    suggestions = {
        "both": _read(base, "suggestions", set_id=build, **first_gap),
        "no_fit": _read(base, "suggestions", set_id=build, **stuck_gap),
        "no_fit_before": _read(
            base, "suggestions", set_id=build, against="before", **stuck_gap
        ),
        "no_fit_after": _read(
            base, "suggestions", set_id=build, against="after", **stuck_gap
        ),
        "end": _read(base, "suggestions", set_id=build, before_entry_id=entries[4]),
        "pool_collection": _read(
            base,
            "suggestions",
            set_id=build,
            scope="collection",
            collection_id=crate,
            **first_gap,
        ),
        "pool_smart": _read(
            base,
            "suggestions",
            set_id=build,
            scope="smart",
            collection_id=smart,
            **first_gap,
        ),
        "pool_playlist": _read(
            base, "suggestions", set_id=build, playlist_id=warmers, **first_gap
        ),
    }

    # --- Shape: every case a lane draws --------------------------------------
    shape = _make_set(
        base,
        "Shape",
        [
            track[OPEN_ONE],  # 124, 8A
            track[OPEN_ONE],  # 124, 8A: the same key
            track[HALF],  # 63, 9A: half time, one step on the wheel
            track[NO_TEMPO],  # no BPM, no key: a gap in both lanes
            track[OPEN_ONE],  # 124, 8A
            track[RELATIVE],  # 124.5, 8B: the relative key
            track[PEAK_LOUD],  # 145, 3B: a clash, and a tempo jump
        ],
    )
    shape_entries = [
        e["entry_id"] for e in _read(base, "plan", set_id=shape)["entries"]
    ]
    _sets(base, "chapters/split", {"entry_id": shape_entries[4], "name": "Second"})

    blank = _make_set(base, "Blank", [])

    # --- an insert at a gap, on a copy -----------------------------------------
    scratch = _sets(base, "duplicate", {"set_id": build, "name": "Scratch"})["set"][
        "id"
    ]
    scratch_plan = _read(base, "plan", set_id=scratch)
    inserted = ok(
        base,
        "/api/v1/collections/tracks/insert",
        {
            "collection_id": scratch,
            "track_id": track[SPARE],
            "position": 1,
            "chapter_id": scratch_plan["chapters"][0]["id"],
        },
    )

    return {
        "_comment": (
            "Real engine responses, produced by "
            "src/tests/unit/engine/test_prepare_source_fixture.py. Do not hand-edit: "
            "regenerate with CUEPOINT_WRITE_FIXTURES=1 and read the diff."
        ),
        "ids": {
            "gigs": gigs,
            "build": build,
            "shape": shape,
            "blank": blank,
            "scratch": scratch,
            "crate": crate,
            "smart": smart,
            "warmers": warmers,
            "tracks": ids,
            "build_entries": entries,
            "build_chapters": chapters,
        },
        "tree": get_json(base, "/api/v1/collections"),
        "playlists": get_json(base, "/api/v1/library/playlists"),
        "build": _whole(base, build),
        "shape": _whole(base, shape),
        "blank": _whole(base, blank),
        "suggestions": suggestions,
        "browse": {
            "library": _browse(base),
            "search": _browse(base, q="Deep"),
            "crate": _browse(base, scope="collection", collection_id=crate),
        },
        "inserted": inserted,
        "refusals": {
            "stale": _refused_read(
                base,
                "suggestions",
                set_id=build,
                before_entry_id=entries[0],
                after_entry_id=entries[2],
            ),
            "empty_set": _refused_read(
                base, "suggestions", set_id=blank, before_entry_id=entries[0]
            ),
            "set_gone": _refused_read(
                base, "suggestions", set_id=999_999, before_entry_id=entries[0]
            ),
        },
    }


def _sanitized(payload: dict) -> dict:
    """The capture as the file holds it: no timestamps."""

    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k not in VOLATILE}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value

    return clean(json.loads(json.dumps(payload)))


@pytest.fixture
def captured(engine, track_ids):  # noqa: F811 — fixtures used by name
    return _capture(engine, track_ids)


class TestTheFixtureIsWhatTheEngineSays:
    def test_it_matches_the_checked_in_file(self, captured):
        stored_form = _sanitized(captured)
        text = (
            json.dumps(stored_form, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        )

        if os.environ.get(WRITE_ENV):
            FIXTURE.write_text(text, encoding="utf-8", newline="\n")
            pytest.skip(f"rewrote {FIXTURE.name}")

        assert FIXTURE.is_file(), (
            f"{FIXTURE} is missing; rerun with {WRITE_ENV}=1 to write it"
        )
        stored = json.loads(FIXTURE.read_text(encoding="utf-8"))
        assert stored == stored_form, (
            "the engine no longer answers what the source panel's tests render from; "
            f"regenerate with {WRITE_ENV}=1 and read the diff"
        )


def _titles(answer: dict) -> list:
    return [s["track"]["title"] for s in answer["suggestions"]]


class TestEachStateIsWhatItClaims:
    """Asserted against a fresh capture, so a fixture regenerated from a broken
    engine cannot quietly become the new expectation."""

    @pytest.fixture
    def got(self, captured):
        return captured

    def test_build_has_open_then_peak_with_a_range(self, got):
        chapters = got["build"]["plan"]["chapters"]
        assert [c["name"] for c in chapters] == ["Open", "Peak"]
        assert [len(c["entry_ids"]) for c in chapters] == [3, 2]
        assert (chapters[1]["bpm_min"], chapters[1]["bpm_max"]) == (140, 150)

    def test_the_first_gap_fits_both_sides_and_marks_the_set(self, got):
        both = got["suggestions"]["both"]
        assert both["sides"] == ["before", "after"] and both["no_fit"] is None
        assert both["bpm_range"] is None
        titles = _titles(both)
        assert {"Deep Spare", "Bridge Deep", "Half Time"} <= set(titles)
        # The neighbours themselves are never offered (DEC-105).
        assert "Open One" not in titles and "Open Two" not in titles
        marked = {s["track"]["title"]: s["in_set"] for s in both["suggestions"]}
        assert marked["Bridge Deep"] == 1 and marked["Deep Spare"] == 0
        for suggestion in both["suggestions"]:
            assert suggestion["before"] and suggestion["after"]
            assert suggestion["track"]["id"] == suggestion["track_id"]

    def test_half_time_is_a_reason(self, got):
        (half,) = [
            s
            for s in got["suggestions"]["both"]["suggestions"]
            if s["track"]["title"] == "Half Time"
        ]
        details = {r["detail"] for r in half["before"]["reasons"]}
        assert "half" in details

    def test_the_gap_into_peak_is_one_nothing_bridges(self, got):
        stuck = got["suggestions"]["no_fit"]
        assert stuck["suggestions"] == []
        assert stuck["no_fit"]["tempo"] == {
            "from": 125.0,
            "to": 145.0,
            "gap_percent": 16.0,
        }
        assert stuck["no_fit"]["key"] == {"from": "8A", "to": "3B", "relation": None}

    def test_each_side_of_it_has_its_own_list(self, got):
        before = got["suggestions"]["no_fit_before"]
        after = got["suggestions"]["no_fit_after"]
        assert before["sides"] == ["before"] and before["suggestions"]
        assert after["sides"] == ["after"] and after["suggestions"]
        assert all(s["after"] is None for s in before["suggestions"])
        assert all(s["before"] is None for s in after["suggestions"])
        assert "Fast Lane" in _titles(after)

    def test_the_end_is_fitted_inside_peaks_range(self, got):
        end = got["suggestions"]["end"]
        assert end["sides"] == ["before"] and end["after_entry_id"] is None
        assert end["bpm_range"]["min"] == 140 and end["bpm_range"]["max"] == 150
        assert "Fast Lane" in _titles(end)
        assert all(
            140 <= s["track"]["effective_bpm"] <= 150 for s in end["suggestions"]
        )

    def test_the_pools_restrict(self, got):
        pools = got["suggestions"]
        assert set(_titles(pools["pool_collection"])) <= {"Deep Spare", "Half Time"}
        assert _titles(pools["pool_collection"])
        assert set(_titles(pools["pool_playlist"])) == {"Deep Relative"}
        smart = set(_titles(pools["pool_smart"]))
        assert smart and "Half Time" not in smart

    def test_shape_holds_every_lane_case(self, got):
        shape = got["shape"]["analysis"]["shape"]
        assert [e["bpm"] for e in shape["entries"]] == [
            124.0,
            124.0,
            63.0,
            None,
            124.0,
            124.5,
            145.0,
        ]
        assert [t["key_relation"] for t in shape["transitions"]] == [
            "same",
            "adjacent",
            None,
            None,
            "relative",
            None,
        ]
        assert len(got["shape"]["plan"]["chapters"]) == 2

    def test_blank_is_empty(self, got):
        assert got["blank"]["entries"]["entries"] == []

    def test_the_library_reads(self, got):
        browse = got["browse"]
        assert browse["library"]["total"] == len(TRACKS)
        assert {t["title"] for t in browse["search"]["tracks"]} == {
            "Bridge Deep",
            "Deep Spare",
            "Deep Relative",
        }
        assert browse["crate"]["total"] == 3

    def test_the_insert_names_its_place(self, got):
        entry = got["inserted"]["entry"]
        assert entry["position"] == 1

    def test_the_refusals(self, got):
        refusals = got["refusals"]
        for name, status, reason in (
            ("stale", 409, "stale"),
            ("empty_set", 409, "empty_set"),
        ):
            error = refusals[name]["payload"]["error"]
            assert refusals[name]["status"] == status, name
            assert error["code"] == "SET_INSERTION_POINT_REFUSED", name
            assert error["reason"] == reason, name
        gone = refusals["set_gone"]
        assert gone["status"] == 404
        assert gone["payload"]["error"]["code"] == "SET_NOT_FOUND"
