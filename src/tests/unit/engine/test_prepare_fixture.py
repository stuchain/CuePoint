#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Prepare page, answered by the real engine (PREP-10).

PREP-10 draws a Set on its own page: its chapters as heading rows, its entries
with their planned times, notes and warnings, and the edits a user makes to
them. Its component tests render from the engine's own answers rather than
from shapes a renderer test wrote (the Phase 7 and 9 practice, PREP-09's
``librarySets.fixture.json``).

So the answers live in one file, ``prepare.fixture.json``, with two readers.
This test **produces** it: it starts the real engine over a real database,
builds Sets through the routes the page's gestures reach, and asserts the file
still matches what came back. The renderer's Prepare tests **consume** it.

Regenerate with::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \
        src/tests/unit/engine/test_prepare_fixture.py

and read the diff before committing it.

The library, and why each part is here:

* **Friday**, in the folder **Gigs**: six entries, track 1 played twice, in
  three named chapters. "Warm-up" has a target and a BPM range, and runs over
  one and outside the other. Two entries are timed, one has a note. The
  tempo jump into "Peak Two" is left standing and its key clash acknowledged.
* **Plain**, one unnamed chapter, so no heading row: a track with no BPM and no
  key after one with both, so the transition says what it cannot compare.
* **Scratch**, a copy of Friday, takes the edits whose answers the page reads
  and whose effects would otherwise reshape Friday: an entry moved, a chapter
  moved and deleted, a repeat inserted, an entry removed, an acknowledgement
  withdrawn.
* The refusals the page acts on: a Set that is gone, a time that is not one,
  a chapter that cannot be deleted, and a chapter started where one starts.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from cuepoint.models.library_track import LibraryTrack
from tests.unit.engine.test_engine_library_browse import (
    engine,  # noqa: F401 — a pytest fixture, used by name
    get_error,
    get_json,
    library_db,  # noqa: F401 — a pytest fixture, used by name
)
from tests.unit.engine.test_engine_organization_api import ok, post

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
    / "prepare.fixture.json"
)

#: Set to rewrite the fixture instead of asserting against it.
WRITE_ENV = "CUEPOINT_WRITE_FIXTURES"

TRACKS = (
    # title, artist, bpm, key, seconds
    ("Warm One", "Ada", 122.0, "8A", 300),
    ("Warm Two", "Bea", 124.0, "9A", 320),
    ("Peak One", "Cal", 128.0, "8A", 360),
    ("Peak Two", "Dee", 140.0, "3B", 280),
    ("Close", "Ada", 125.0, "8B", 400),
    ("Unknown", "Eve", None, None, None),
)

#: Fields that differ between two identical runs.
VOLATILE = frozenset({"created_at", "updated_at", "added_at", "imported_at"})


def _resolve(name: str):
    from cuepoint.services import interfaces
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(getattr(interfaces, name))


@pytest.fixture
def track_ids(library_db):  # noqa: F811 — the fixture is used by name
    repo = _resolve("ITrackRepository")
    return [
        int(
            repo.add(
                LibraryTrack(
                    rekordbox_track_id=str(i),
                    file_path=f"/music/{i}.mp3",
                    title=title,
                    artist=artist,
                    bpm=bpm,
                    key=key,
                    duration_seconds=seconds,
                )
            ).id
        )
        for i, (title, artist, bpm, key, seconds) in enumerate(TRACKS, start=1)
    ]


def _sets(base: str, path: str, body: dict) -> dict:
    return ok(base, f"/api/v1/sets/{path}", body)


def _read(base: str, path: str, set_id: int) -> dict:
    return get_json(base, f"/api/v1/sets/{path}", set_id=set_id)


def _refused(base: str, path: str, body: dict) -> dict:
    status, payload = post(base, path, body)
    return {"status": status, "payload": payload}


def _refused_read(base: str, path: str, set_id: int) -> dict:
    status, payload = get_error(base, path, set_id=set_id)
    return {"status": status, "payload": payload}


def _whole(base: str, set_id: int) -> dict:
    """Everything the page reads for one Set."""
    return {
        "plan": _read(base, "plan", set_id),
        "entries": _read(base, "entries", set_id),
        "analysis": _read(base, "analysis", set_id),
    }


def _capture(base: str, ids: list[int]) -> dict:
    gigs = ok(base, "/api/v1/collections/create", {"kind": "folder", "name": "Gigs"})[
        "collection"
    ]
    friday = _sets(base, "create", {"name": "Friday", "parent_id": gigs["id"]})["set"][
        "id"
    ]
    # Tracks 1 to 5, then track 1 again before the last: 1 2 3 4 1 5.
    ok(
        base,
        "/api/v1/collections/tracks/add",
        {"collection_id": friday, "track_ids": ids[:5]},
    )
    ok(
        base,
        "/api/v1/collections/tracks/insert",
        {"collection_id": friday, "track_id": ids[0], "position": 4},
    )
    entry_ids = [e["entry_id"] for e in _read(base, "plan", friday)["entries"]]

    # Three chapters: Warm-up (1, 2), Peak (3, 4), Close (1, 5).
    split = _sets(base, "chapters/split", {"entry_id": entry_ids[2], "name": "Peak"})
    _sets(base, "chapters/split", {"entry_id": entry_ids[4], "name": "Close"})
    first = _read(base, "plan", friday)["chapters"][0]["id"]
    updated = _sets(
        base,
        "chapters/update",
        {
            "chapter_id": first,
            "name": "Warm-up",
            "notes": "Keep it low",
            "target": "8:00",
            "bpm_min": 120,
            "bpm_max": 123,
        },
    )

    times = _sets(
        base,
        "entries/times",
        {"entry_id": entry_ids[0], "in_time": "0:30", "out_time": "4:30"},
    )
    _sets(
        base,
        "entries/times",
        {"entry_id": entry_ids[1], "in_time": None, "out_time": "5:00"},
    )
    note = _sets(
        base, "entries/note", {"entry_id": entry_ids[2], "note": "Let the break run"}
    )
    acknowledged = _sets(
        base,
        "acknowledge",
        {
            "from_entry_id": entry_ids[2],
            "to_entry_id": entry_ids[3],
            "warning": "key_clash",
        },
    )

    plain = _sets(base, "create", {"name": "Plain"})["set"]["id"]
    ok(
        base,
        "/api/v1/collections/tracks/add",
        {"collection_id": plain, "track_ids": [ids[0], ids[5]]},
    )
    plain_chapter = _read(base, "plan", plain)["chapters"][0]["id"]

    # Scratch: a copy of Friday that takes the edits that would reshape it.
    scratch = _sets(base, "duplicate", {"set_id": friday, "name": "Scratch"})["set"][
        "id"
    ]
    scratch_plan = _read(base, "plan", scratch)
    s_entries = [e["entry_id"] for e in scratch_plan["entries"]]
    s_chapters = [c["id"] for c in scratch_plan["chapters"]]
    moved = _sets(
        base,
        "entries/move",
        {"entry_id": s_entries[3], "position": 2, "chapter_id": s_chapters[1]},
    )
    chapter_moved = _sets(
        base, "chapters/move", {"chapter_id": s_chapters[2], "position": 0}
    )
    chapter_deleted = _sets(base, "chapters/delete", {"chapter_id": s_chapters[1]})
    repeat = ok(
        base,
        "/api/v1/collections/tracks/insert",
        {
            "collection_id": scratch,
            "track_id": ids[1],
            "position": 2,
            "chapter_id": s_chapters[0],
        },
    )
    removed = ok(
        base, "/api/v1/collections/tracks/remove", {"entry_ids": [s_entries[5]]}
    )
    unacknowledged = _sets(
        base,
        "unacknowledge",
        {
            "from_entry_id": entry_ids[2],
            "to_entry_id": entry_ids[3],
            "warning": "tempo_jump",
        },
    )

    return {
        "_comment": (
            "Real engine responses, produced by "
            "src/tests/unit/engine/test_prepare_fixture.py. Do not hand-edit: "
            "regenerate with CUEPOINT_WRITE_FIXTURES=1 and read the diff."
        ),
        "ids": {
            "gigs": gigs["id"],
            "friday": friday,
            "plain": plain,
            "scratch": scratch,
            "tracks": ids,
            "friday_entries": entry_ids,
        },
        "tree": get_json(base, "/api/v1/collections"),
        "friday": _whole(base, friday),
        "plain": _whole(base, plain),
        "edits": {
            "split": split,
            "chapter_updated": updated,
            "times": times,
            "note": note,
            "acknowledged": acknowledged,
            "unacknowledged": unacknowledged,
            "moved": moved,
            "chapter_moved": chapter_moved,
            "chapter_deleted": chapter_deleted,
            "repeat_inserted": repeat,
            "removed": removed,
        },
        "refusals": {
            "set_gone": _refused_read(base, "/api/v1/sets/plan", 999_999),
            "bad_time": _refused(
                base,
                "/api/v1/sets/entries/times",
                {"entry_id": entry_ids[0], "in_time": "4:30", "out_time": "0:30"},
            ),
            "last_chapter": _refused(
                base, "/api/v1/sets/chapters/delete", {"chapter_id": plain_chapter}
            ),
            "split_at_start": _refused(
                base, "/api/v1/sets/chapters/split", {"entry_id": entry_ids[2]}
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
            "the engine no longer answers what the Prepare page's tests render from; "
            f"regenerate with {WRITE_ENV}=1 and read the diff"
        )


class TestEachStateIsWhatItClaims:
    """Asserted against a fresh capture, so a fixture regenerated from a broken
    engine cannot quietly become the new expectation."""

    @pytest.fixture
    def got(self, captured):
        return captured

    def test_friday_has_three_named_chapters_in_order(self, got):
        chapters = got["friday"]["plan"]["chapters"]
        assert [c["name"] for c in chapters] == ["Warm-up", "Peak", "Close"]
        assert [len(c["entry_ids"]) for c in chapters] == [2, 2, 2]

    def test_friday_plays_track_one_twice(self, got):
        tracks = [e["track_id"] for e in got["friday"]["entries"]["entries"]]
        first = got["ids"]["tracks"][0]
        assert tracks.count(first) == 2
        assert len(tracks) == 6

    def test_each_entry_carries_the_librarys_row(self, got):
        for entry in got["friday"]["entries"]["entries"]:
            assert entry["track"]["id"] == entry["track_id"]

    def test_the_running_time_counts_the_timed_entries(self, got):
        running = got["friday"]["plan"]["running_time"]
        # 0:30 to 4:30 is four minutes; the start to 5:00 is five.
        assert running == {"seconds": 540, "timed": 2, "untimed": 4}

    def test_starts_at_stops_at_the_first_untimed_entry(self, got):
        starts = [e["starts_at"] for e in got["friday"]["plan"]["entries"]]
        assert starts[:3] == [0, 240, 540]
        assert starts[3:] == [None, None, None]

    def test_warm_up_runs_over_its_target_and_outside_its_range(self, got):
        (warm,) = [
            c
            for c in got["friday"]["analysis"]["chapters"]
            if c["chapter_id"] == got["friday"]["plan"]["chapters"][0]["id"]
        ]
        kinds = {w["kind"] for w in warm["warnings"]}
        assert kinds == {"over_target", "bpm_outside_range"}

    def test_the_jump_into_peak_two_stands_and_its_clash_is_acknowledged(self, got):
        entries = got["ids"]["friday_entries"]
        (transition,) = [
            t
            for t in got["friday"]["analysis"]["transitions"]
            if (t["from_entry_id"], t["to_entry_id"]) == (entries[2], entries[3])
        ]
        states = {w["kind"]: w["acknowledged"] for w in transition["warnings"]}
        assert states == {"tempo_jump": False, "key_clash": True}
        assert got["friday"]["analysis"]["acknowledged"] == 1

    def test_the_repeat_is_a_notice(self, got):
        assert got["friday"]["analysis"]["notices"] == {"repeat": 2}

    def test_plain_is_one_unnamed_chapter(self, got):
        chapters = got["plain"]["plan"]["chapters"]
        assert len(chapters) == 1
        assert chapters[0]["name"] == ""

    def test_plain_cannot_compare_the_unknown_track(self, got):
        (transition,) = got["plain"]["analysis"]["transitions"]
        kinds = {w["kind"] for w in transition["warnings"]}
        assert kinds == {"tempo_unknown", "key_unknown"}

    def test_the_edits_answer_what_they_changed(self, got):
        edits = got["edits"]
        assert edits["split"]["chapter"]["name"] == "Peak"
        assert edits["chapter_updated"]["chapter"]["target_seconds"] == 480
        assert edits["times"]["plan"]["planned_seconds"] == 240
        assert edits["note"]["plan"]["note"] == "Let the break run"
        assert edits["acknowledged"]["acknowledgement"]["warning"] == "key_clash"
        assert edits["unacknowledged"] == {"removed": False}
        assert edits["moved"]["entry"]["position"] == 2
        assert edits["chapter_moved"]["chapter"]["position"] == 0
        assert edits["removed"] == {"removed": 1}
        assert edits["repeat_inserted"]["entry"]["position"] == 2

    def test_the_refusals_carry_their_codes(self, got):
        refusals = got["refusals"]
        gone = refusals["set_gone"]
        assert gone["status"] == 404
        assert gone["payload"]["error"]["code"] == "SET_NOT_FOUND"
        for name in ("bad_time", "last_chapter", "split_at_start"):
            assert refusals[name]["status"] == 400, name
            assert refusals[name]["payload"]["error"]["code"] == "INVALID_REQUEST"
