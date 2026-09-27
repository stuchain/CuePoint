#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine answers the Artist, Label and Similar pages are tested against (DISCOVER-11).

DISCOVER-10's practice, from EXPORT-07: the renderer's component tests read
what a running engine actually answers, produced here over a real library,
the real job store and DISCOVER-01's ``BeatportApi`` talking to the in-memory
Beatport, and committed beside the pages as ``discoverPages.fixture.json``.
A change to a payload fails here, in Python, where it is made. To write the
file again after a deliberate change::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \\
        src/tests/unit/engine/test_discover_pages_fixture.py

and read the diff before committing it.

What the file holds, each as the renderer receives it:

- **pages** in both identities and for both kinds: a name, a name redirected
  to its id, an id, a name several Beatport artists share, and a refusal;
- **the library half** as the Library's browse answers the page's rules;
- **the Beatport half** in every state DISCOVER-07 can answer, and a label
  found by name;
- **a track's detail** with its credits, resolved and not (the Inspector's
  links);
- **Similar tracks** for a seed with a tempo and one without, a seed with
  nothing near it, a seed gone, and the rows of the first one's suggestions.

Dates, moments and job ids are normalized as DISCOVER-10's fixture is.
"""

from __future__ import annotations

import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import pytest

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION
from cuepoint.engine import discover_api as api
from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.models.library_track import LibraryTrack
from tests.fixtures.beatport_world import BeatportWorld
from tests.unit.engine.test_discover_page_fixture import answer, normalize

# The HTTP harness and its fixtures, shared with the route tests so a fixture
# is produced exactly as those tests drive the engine.
from tests.unit.engine.test_engine_discover_api import (  # noqa: F401
    engine,
    finished,
    get,
    library_db,
    own,
    post,
    resolve,
    store,
    use_beatport,
)

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURES = (
    REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "discover"
    / "discoverPages.fixture.json"
)
WRITE = os.environ.get("CUEPOINT_WRITE_FIXTURES") == "1"

NIGHTFALL = (40211, "Nightfall Audio")
ELSEWHERE = (77, "Elsewhere")
MARA = (301001, "Mara Veil")
SOMEONE_A = (5001, "Someone")
SOMEONE_B = (5002, "Someone")
DJEFF = (6001, "DJEFF")

#: The library, in the order it is added, so every id is the same each time:
#: (title, artist, remixer, label, bpm, key, genre, year).
TRACKS = [
    (
        "Harbour Lights",
        "Mara Veil, Kiko",
        None,
        "Nightfall Audio",
        124.0,
        "8A",
        "House",
        2025,
    ),
    ("Low Tide", "Mara Veil", None, "Nightfall Audio", 124.0, "9A", "House", 2024),
    ("Night Bus", "Kiko", "DJEFF", "Cold Room", 62.0, "8A", "Techno", 2023),
    ("Signal", "DJEFF", None, "Cold Room", 128.0, "8B", "House", 2022),
    (
        "Someone Else",
        "Someone",
        None,
        "Nightfall Audio",
        126.0,
        "3A",
        "Deep House",
        2021,
    ),
    ("Far", "Someone", None, "Elsewhere", 126.0, "3A", "Deep House", 2020),
    ("Untimed", "Kiko", None, None, None, None, "Techno", None),
]

#: Which library track (by position, from 1) owns which Beatport track once
#: resolved: Harbour Lights is Mara Veil's track 7, and each "Someone" track is
#: a different Someone on Beatport.
MATCHES = {1: 7, 5: 8, 6: 20}


def pages_world(today: date) -> BeatportWorld:
    """Mara Veil's and Nightfall Audio's recent releases, and two Someones."""
    world = BeatportWorld()
    day = lambda n: today - timedelta(days=n)  # noqa: E731
    world.add_track(7, day(2), NIGHTFALL, (700, "Lantern EP"), [MARA])
    world.add_track(8, day(3), NIGHTFALL, (700, "Lantern EP"), [SOMEONE_A])
    world.add_track(9, day(40), NIGHTFALL, (701, "Signal EP"), [MARA])
    world.add_track(20, day(6), ELSEWHERE, (720, "Far EP"), [SOMEONE_B])
    world.add_track(21, day(20), ELSEWHERE, (721, "Late EP"), [DJEFF])
    return world


class Situation:
    """A running engine over the pages' library and Beatport."""

    def __init__(self, base: str, jobs: JobStore) -> None:
        self.base = base
        self.store = jobs
        self.world = pages_world(date.today())
        use_beatport(self.world)
        tracks = resolve("ITrackRepository")
        self.ids: List[int] = []
        for position, (
            title,
            artist,
            remixer,
            label,
            bpm,
            key,
            genre,
            year,
        ) in enumerate(TRACKS, start=1):
            added = tracks.add(
                LibraryTrack(
                    rekordbox_track_id=f"p{position}",
                    file_path=f"/music/p{position}.mp3",
                    title=title,
                    artist=artist,
                    remixer=remixer,
                    label=label,
                    bpm=bpm,
                    key=key,
                    genre=genre,
                    year=year,
                )
            )
            self.ids.append(int(added.id))
        for position, beatport_id in MATCHES.items():
            own(self.ids[position - 1], beatport_id)
        # The tracks were written through the real paths, credits and all;
        # a library the index job has finished with says so (DISCOVER-03).
        resolve("ITrackCreditRepository").mark_built(
            ENTITY_NAMES_VERSION, "2026-09-20T12:00:00+00:00"
        )

    def track(self, position: int) -> int:
        return self.ids[position - 1]

    def get(self, path: str, **params: Any) -> Dict[str, Any]:
        return answer(get(self.base, path, **params))

    def raw(self, path: str, **params: Any) -> Any:
        status, body = get(self.base, path, **params)
        assert status == 200, (status, body)
        return body

    def resolved(self) -> "Situation":
        """Every accepted match read from Beatport (DISCOVER-04)."""
        started = answer(post(self.base, api.RESOLVE_START_PATH))
        assert started["refusal"] is None, started
        assert finished(self.store, started["value"]["id"]).state is JobState.SUCCEEDED
        return self

    def page(self, kind: str, ref: str) -> Dict[str, Any]:
        return self.get(api.ENTITY_PATH, kind=kind, ref=ref)

    def half(self, kind: str, ref: str, **params: Any) -> Dict[str, Any]:
        return self.get(api.ENTITY_BEATPORT_PATH, kind=kind, ref=ref, **params)

    def library_half(self, kind: str, ref: str) -> Any:
        page = self.page(kind, ref)["value"]
        return self.raw(
            "/api/v1/library/search",
            mode="browse",
            filters=json.dumps(page["rules"]),
            sort="year",
            dir="desc",
            limit=100,
            offset=0,
        )

    def detail(self, position: int) -> Any:
        return self.raw(f"/api/v1/library/tracks/{self.track(position)}")

    def similar(self, position: int, **params: Any) -> Dict[str, Any]:
        return self.get(api.SIMILAR_PATH, track_id=self.track(position), **params)


def _refusing(status: int) -> Callable[[Situation], Any]:
    def state(ctx: Situation) -> Any:
        ctx.world.failures.append(lambda _route, _params, _n: status)
        return ctx.half("label", "bp:40211")

    return state


def half_no_token(ctx: Situation) -> Any:
    use_beatport(BeatportWorld(access_token=""))
    return ctx.half("label", "bp:40211")


def half_not_resolved_resolvable(ctx: Situation) -> Any:
    """DJEFF's "Signal" matched after the resolve, so a resolve could read it."""
    ctx.resolved()
    own(ctx.track(4), 21)
    return ctx.half("artist", "name:DJEFF")


def similar_details(ctx: Situation) -> Any:
    """Each suggestion's row for seed 1, by id, as the view reads them."""
    suggestions = ctx.similar(1)["value"]["suggestions"]
    return {
        str(entry["track_id"]): ctx.raw(f"/api/v1/library/tracks/{entry['track_id']}")
        for entry in suggestions
    }


STATES: Dict[str, Callable[[Situation], Any]] = {
    # --- pages, in both identities
    "page_artist_name": lambda ctx: ctx.resolved().page("artist", "name:Kiko"),
    "page_artist_redirected": lambda ctx: ctx.resolved().page(
        "artist", "name:Mara Veil"
    ),
    "page_artist_id": lambda ctx: ctx.resolved().page("artist", "bp:301001"),
    "page_artist_shared": lambda ctx: ctx.resolved().page("artist", "name:Someone"),
    "page_label_id": lambda ctx: ctx.resolved().page("label", "bp:40211"),
    "page_label_name": lambda ctx: ctx.resolved().page("label", "name:Cold Room"),
    "page_refused": lambda ctx: ctx.page("artist", "Mara Veil"),
    # --- the library half: the Library's browse over each page's rules
    "library_artist_id": lambda ctx: ctx.resolved().library_half("artist", "bp:301001"),
    "library_artist_name": lambda ctx: ctx.resolved().library_half(
        "artist", "name:Kiko"
    ),
    "library_label_id": lambda ctx: ctx.resolved().library_half("label", "bp:40211"),
    # --- the Beatport half, in every state
    "half_artist_ok": lambda ctx: ctx.resolved().half("artist", "bp:301001"),
    "half_label_ok": lambda ctx: ctx.resolved().half("label", "bp:40211"),
    "half_label_owned_hidden": lambda ctx: ctx.resolved().half(
        "label", "bp:40211", owned="hide"
    ),
    "half_found_by_name": lambda ctx: ctx.half("label", "name:Nightfall Audio"),
    "half_no_token": half_no_token,
    "half_rejected": _refusing(401),
    "half_forbidden": _refusing(403),
    "half_rate_limited": _refusing(429),
    "half_unavailable": _refusing(503),
    "half_not_resolved_resolvable": half_not_resolved_resolvable,
    "half_not_resolved": lambda ctx: ctx.resolved().half("artist", "name:Kiko"),
    "half_shared": lambda ctx: ctx.resolved().half("artist", "name:Someone"),
    "half_not_on_beatport": lambda ctx: ctx.half("label", "name:Cold Room"),
    # --- the Inspector's links
    "detail_resolved": lambda ctx: ctx.resolved().detail(1),
    "detail_unresolved": lambda ctx: ctx.resolved().detail(3),
    # --- Similar tracks
    "similar": lambda ctx: ctx.similar(1),
    "similar_details": similar_details,
    "similar_no_bpm": lambda ctx: ctx.similar(7),
    "similar_none": lambda ctx: ctx.similar(1, q="nothing matches this"),
    "similar_gone": lambda ctx: ctx.get(api.SIMILAR_PATH, track_id=999),
}


def _committed() -> Dict[str, Any]:
    if not FIXTURES.exists():
        return {}
    return json.loads(FIXTURES.read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", sorted(STATES))
def test_the_committed_answer_is_what_the_engine_answers(
    name,
    engine,  # noqa: F811 - the route tests' fixtures, shared
    store,  # noqa: F811
):
    produced = normalize(STATES[name](Situation(engine, store)))

    if WRITE:
        committed = _committed()
        committed[name] = produced
        FIXTURES.write_text(
            json.dumps(committed, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    assert _committed().get(name) == produced, (
        f"{FIXTURES.name} no longer says what the engine answers for {name!r}; "
        "if the change is deliberate, write it again with CUEPOINT_WRITE_FIXTURES=1"
    )


def test_the_file_holds_no_state_nothing_builds():
    """A state removed here must not live on in the renderer's tests."""
    assert sorted(_committed()) == sorted(STATES)


def _value(name: str) -> Optional[Dict[str, Any]]:
    return _committed()[name]["value"]


def test_every_beatport_half_state_and_reason_the_page_draws_is_there():
    halves = [_value(name) for name in _committed() if name.startswith("half_")]
    assert {half["state"] for half in halves} == {
        "ok",
        "no_token",
        "rejected",
        "forbidden",
        "rate_limited",
        "unavailable",
        "name_only",
    }
    assert {half["reason"] for half in halves if half["state"] == "name_only"} == {
        "not_resolved",
        "shared",
        "not_on_beatport",
    }
    assert {half["action"] for half in halves} == {None, "settings", "resolve"}
    assert any(half["found_by_name"] for half in halves)


def test_the_pages_cover_both_identities_both_kinds_and_a_redirect():
    pages = [
        _value(name)
        for name in _committed()
        if name.startswith("page_") and _value(name)
    ]
    assert {(page["kind"], page["identity"]) for page in pages} == {
        ("artist", "name"),
        ("artist", "beatport"),
        ("label", "name"),
        ("label", "beatport"),
    }
    redirected = _value("page_artist_redirected")
    assert redirected["redirected_from"] == "name:mara veil"
    assert redirected["ref"] == "bp:301001"
    assert len(_value("page_artist_shared")["links"]) == 2
    assert _committed()["page_refused"]["refusal"]["code"] == "INVALID_REQUEST"


def test_each_library_half_is_what_its_header_counts():
    """The header's count is the table's (DISCOVER-07's promise, as recorded)."""
    for page, rows in (
        ("page_artist_id", "library_artist_id"),
        ("page_artist_name", "library_artist_name"),
        ("page_label_id", "library_label_id"),
    ):
        assert _value(page)["library"]["tracks"] == _committed()[rows]["total"], page


def test_the_inspectors_links_are_by_id_where_resolved_and_by_name_elsewhere():
    resolved = _committed()["detail_resolved"]["credits"]
    assert [(a["name"], a["ref"]) for a in resolved["artists"]] == [
        ("Mara Veil", "bp:301001"),
        ("Kiko", "name:kiko"),
    ]
    assert resolved["label"]["ref"] == "bp:40211"
    unresolved = _committed()["detail_unresolved"]["credits"]
    assert [(r["name"], r["ref"]) for r in unresolved["remixers"]] == [
        ("DJEFF", "name:djeff")
    ]
    assert unresolved["label"]["ref"] == "name:cold room"


def test_similar_tracks_hold_every_reason_the_list_is_drawn_with():
    similar = _value("similar")
    suggested = [entry["track_id"] for entry in similar["suggestions"]]
    assert suggested and sorted(_committed()["similar_details"]) == sorted(
        str(track_id) for track_id in suggested
    )
    components = {
        reason["component"]
        for entry in similar["suggestions"]
        for reason in entry["reasons"]
    }
    assert components == {"tempo", "key", "genre", "label", "artist"}
    assert _value("similar_no_bpm")["unused"] == ["tempo", "key", "label"]
    assert _value("similar_none")["suggestions"] == []
    assert _committed()["similar_gone"]["refusal"]["code"] == "TRACK_NOT_FOUND"


def test_the_file_holds_no_real_date_or_machine():
    text = FIXTURES.read_text(encoding="utf-8")
    assert "pytest" not in text and "Temp" not in text
    if date.today() != date(2026, 9, 20):
        assert date.today().isoformat() not in text
