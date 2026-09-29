#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Sets in the Library, answered by the real engine (PREP-09).

PREP-09 draws Sets in the Library: the tree, the scope, "Add to Set", "New Set
from…", the Inspector, the delete and refresh wording, and the set list
actions. Its component tests render from the engine's own answers rather than
from shapes a renderer test wrote — the Phase 7 and 9 practice, and the reason
``emptyLibrary.fixture.json`` exists.

So the answers live in one file, ``librarySets.fixture.json``, with two
readers. This test **produces** it: it starts the real engine over a real
database, builds a small CuePoint tree through the API a user's clicks reach,
and asserts the file still matches what came back. The renderer's Set tests
**consume** it.

An engine change that reshapes one of these answers fails here first, with the
new payload in the diff. Regenerate with::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \
        src/tests/unit/engine/test_library_sets_fixture.py

and read the diff before committing it.

The library, and why each part is here:

* **Gigs**, a folder, holding **Friday**, a Set that plays track 1 twice: a
  Set in a folder, and a Set whose entries and tracks differ, which is what
  the scope's note and the tree's count are about.
* **Warm-up**, a Collection with a repeat, and **Ada**, a Smart Collection:
  the two CuePoint sources "New Set from…" copies, each copied.
* **Empty**, a Set with nothing in it.
* A Rekordbox playlist, copied into a Set.
* A Set duplicated, a Set that is gone, a batch "Add to Set" that skips a
  track already there, and a track's Inspector read naming a Collection and a
  Set.
* What a refresh's references and a folder's delete preview say about Sets.
* A set list copied, saved, and refused a destination.
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
    / "library"
    / "librarySets.fixture.json"
)

#: Set to rewrite the fixture instead of asserting against it.
WRITE_ENV = "CUEPOINT_WRITE_FIXTURES"

#: Where a set list is saved in the file: the test's own folder is replaced by
#: this, so no machine's path is committed and the file is the same everywhere.
SET_LIST_FOLDER = "/music/set lists"

TRACKS = (
    # title, artist, bpm, key, seconds
    ("Warm One", "Ada", 122.0, "8A", 300),
    ("Warm Two", "Bea", 124.0, "9A", 320),
    ("Peak One", "Cal", 128.0, "8A", 360),
    ("Peak Two", "Dee", 130.0, "9A", 280),
    ("Close", "Ada", 125.0, "8B", 400),
)

#: Fields that differ between two identical runs.
VOLATILE = frozenset(
    {"created_at", "updated_at", "added_at", "imported_at", "batch_id"}
)


def _resolve(name: str):
    from cuepoint.services import interfaces
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(getattr(interfaces, name))


@pytest.fixture
def track_ids(library_db):  # noqa: F811 — the fixture is used by name
    """Five tracks and a Rekordbox playlist that plays track 2 twice."""
    repo = _resolve("ITrackRepository")
    made = [
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
    _resolve("IPlaylistRepository").replace_tree(
        [
            RekordboxPlaylist(
                name="SETS",
                kind=KIND_FOLDER,
                depth=0,
                position=0,
                rekordbox_path="SETS",
            ),
            RekordboxPlaylist(
                name="Sunday",
                kind=KIND_PLAYLIST,
                depth=1,
                position=0,
                rekordbox_path="SETS/Sunday",
                parent_path="SETS",
                track_refs=["2", "1", "2"],
            ),
        ]
    )
    return made


def _playlist_id(base: str) -> int:
    tree = get_json(base, "/api/v1/library/playlists")
    (node,) = [n for n in tree["playlists"] if n["path"] == "SETS/Sunday"]
    return int(node["id"])


def _sets(base: str, path: str, body: dict) -> dict:
    return ok(base, f"/api/v1/sets/{path}", body)


def _refused(base: str, path: str, body: dict) -> dict:
    status, payload = post(base, path, body)
    return {"status": status, "payload": payload}


def _capture(base: str, ids: list[int], folder: Path) -> dict:
    """Build the tree through the API and return exactly what it answered."""
    gigs = ok(base, "/api/v1/collections/create", {"kind": "folder", "name": "Gigs"})[
        "collection"
    ]

    # A Collection that holds track 1 twice.
    warmup = ok(
        base, "/api/v1/collections/create", {"kind": "collection", "name": "Warm-up"}
    )["collection"]
    ok(
        base,
        "/api/v1/collections/tracks/add",
        {"collection_id": warmup["id"], "track_ids": ids[:2]},
    )
    ok(
        base,
        "/api/v1/collections/tracks/insert",
        {"collection_id": warmup["id"], "track_id": ids[0], "position": 2},
    )

    smart = ok(
        base,
        "/api/v1/collections/smart/save",
        {
            "name": "Ada",
            "rules": {
                "match": "all",
                "rules": [{"field": "artist", "operator": "is", "value": "Ada"}],
            },
        },
    )["collection"]

    # "Friday": tracks 1 to 4, then 1 again, in the folder.
    created = _sets(base, "create", {"name": "Friday", "parent_id": gigs["id"]})
    friday = created["set"]["id"]
    ok(
        base,
        "/api/v1/collections/tracks/add",
        {"collection_id": friday, "track_ids": ids[:4]},
    )
    ok(
        base,
        "/api/v1/collections/tracks/insert",
        {"collection_id": friday, "track_id": ids[0], "position": 4},
    )
    _sets(base, "create", {"name": "Empty"})

    # Track 1 is in Warm-up and in Friday, and nothing else yet.
    detail = get_json(base, f"/api/v1/library/tracks/{ids[0]}")
    references = _resolve("ILibraryService").references_for([ids[0]]).to_dict()

    # "Add to Set…" over tracks 4 and 5: 4 is there already, so it is skipped.
    added = ok(
        base,
        "/api/v1/library/batch",
        {
            "selection": {"track_ids": [ids[3], ids[4]]},
            "operation": {"kind": "add_to_collection", "value": friday},
        },
    )

    from_collection = _sets(
        base,
        "create-from",
        {
            "source": {"kind": "collection", "id": warmup["id"]},
            "parent_id": gigs["id"],
        },
    )
    from_smart = _sets(
        base,
        "create-from",
        {"source": {"kind": "collection", "id": smart["id"]}, "parent_id": gigs["id"]},
    )
    from_playlist = _sets(
        base,
        "create-from",
        {"source": {"kind": "playlist", "id": _playlist_id(base)}},
    )
    duplicated = _sets(base, "duplicate", {"set_id": friday})
    gone = _refused(base, "/api/v1/sets/duplicate", {"set_id": 999_999})

    browse = get_json(
        base,
        "/api/v1/library/search",
        mode="browse",
        scope="collection",
        collection_id=friday,
        sort="collection_position",
        dir="asc",
        limit=100,
    )
    delete_preview = ok(base, "/api/v1/collections/delete/preview", {"id": gigs["id"]})
    text = get_json(base, "/api/v1/sets/set-list/text", set_id=friday)
    saved = _sets(
        base,
        "set-list/save",
        {"set_id": friday, "destination_path": str(folder / "Friday.csv")},
    )
    refused_destination = _refused(
        base,
        "/api/v1/sets/set-list/save",
        {"set_id": friday, "destination_path": str(folder / "Friday.mp3")},
    )

    return {
        "_comment": (
            "Real engine responses, produced by "
            "src/tests/unit/engine/test_library_sets_fixture.py. Do not "
            "hand-edit: regenerate with CUEPOINT_WRITE_FIXTURES=1 and read "
            "the diff."
        ),
        "ids": {
            "gigs": gigs["id"],
            "warmup": warmup["id"],
            "smart": smart["id"],
            "friday": friday,
            "tracks": ids,
        },
        "tree": get_json(base, "/api/v1/collections"),
        "created": created,
        "created_from_collection": from_collection,
        "created_from_smart": from_smart,
        "created_from_playlist": from_playlist,
        "duplicated": duplicated,
        "set_gone": gone,
        "added_to_set": added,
        "set_browse": browse,
        "track_detail": detail,
        "references": references,
        "delete_preview": delete_preview,
        "set_list_text": text,
        "set_list_saved": saved,
        "set_list_refused": refused_destination,
    }


def _sanitized(payload: dict, folder: Path) -> dict:
    """The capture as the file holds it: no timestamps, no machine's path.

    A timestamp would rewrite the file on every run and bury a real change in
    noise. The set list's folder is the test's temporary one, which names this
    machine; it becomes ``SET_LIST_FOLDER`` wherever it appears, messages
    included, written with forward slashes on every platform.
    """
    real = str(folder)

    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k not in VOLATILE}
        if isinstance(value, list):
            return [clean(v) for v in value]
        if isinstance(value, str) and real in value:
            head, _, tail = value.partition(real)
            return head + SET_LIST_FOLDER + tail.replace("\\", "/")
        return value

    return clean(json.loads(json.dumps(payload)))


@pytest.fixture
def captured(engine, track_ids, tmp_path):  # noqa: F811 — fixtures used by name
    folder = tmp_path / "set lists"
    folder.mkdir()
    return _capture(engine, track_ids, folder), folder


class TestTheFixtureIsWhatTheEngineSays:
    def test_it_matches_the_checked_in_file(self, captured):
        raw, folder = captured
        stored_form = _sanitized(raw, folder)
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
            "the engine no longer answers what the Library's Set tests render from; "
            f"regenerate with {WRITE_ENV}=1 and read the diff"
        )

    def test_no_path_of_this_machine_reaches_the_file(self, captured):
        raw, folder = captured
        text = json.dumps(_sanitized(raw, folder))
        assert str(folder) not in text
        assert str(folder).replace("\\", "\\\\") not in text
        assert SET_LIST_FOLDER in text


class TestEachStateIsWhatItClaims:
    """Asserted against a fresh capture, so a fixture regenerated from a broken
    engine cannot quietly become the new expectation."""

    @pytest.fixture
    def got(self, captured):
        return captured[0]

    def _node(self, got: dict, name: str) -> dict:
        (node,) = [n for n in got["tree"]["collections"] if n["name"] == name]
        return node

    def test_the_tree_holds_every_kind_with_sets_as_sets(self, got):
        # By id: a Set copied from "Warm-up" is called "Warm-up" too.
        kinds = {n["id"]: n["kind"] for n in got["tree"]["collections"]}
        ids = got["ids"]
        assert kinds[ids["gigs"]] == "folder"
        assert kinds[ids["warmup"]] == "collection"
        assert kinds[ids["smart"]] == "smart"
        assert kinds[ids["friday"]] == "set"
        assert kinds[got["created_from_collection"]["set"]["id"]] == "set"
        assert self._node(got, "Empty")["kind"] == "set"

    def test_friday_is_filed_in_its_folder(self, got):
        assert self._node(got, "Friday")["parent_id"] == got["ids"]["gigs"]

    def test_friday_plays_a_track_twice(self, got):
        friday = self._node(got, "Friday")
        # Tracks 1 to 4, track 1 again, and track 5 from "Add to Set".
        assert (friday["entry_count"], friday["track_count"]) == (6, 5)

    def test_the_scope_lists_each_track_once(self, got):
        browse = got["set_browse"]
        assert browse["total"] == 5
        ids = [row["id"] for row in browse["tracks"]]
        assert len(ids) == len(set(ids)) == 5

    def test_add_to_set_skips_what_it_holds(self, got):
        applied = got["added_to_set"]["applied"]
        assert (applied["changed"], applied["unchanged"]) == (1, 1)

    def test_each_source_becomes_a_set_named_after_it(self, got):
        assert got["created_from_collection"]["set"]["kind"] == "set"
        assert got["created_from_collection"]["set"]["name"] == "Warm-up"
        # A Collection's repeat is kept: three entries, two tracks.
        assert got["created_from_collection"]["track_count"] == 3
        assert got["created_from_smart"]["source"]["name"] == "Ada"
        assert got["created_from_smart"]["track_count"] == 2
        assert got["created_from_playlist"]["set"]["name"] == "Sunday"
        assert got["created_from_playlist"]["track_count"] == 3
        assert got["created_from_playlist"]["set"]["parent_id"] is None

    def test_a_duplicate_is_a_second_set(self, got):
        copy = got["duplicated"]["set"]
        assert copy["kind"] == "set"
        assert copy["id"] != got["ids"]["friday"]
        assert copy["entry_count"] == 6

    def test_a_set_that_is_gone_is_refused_as_not_found(self, got):
        error = got["set_gone"]["payload"]["error"]
        assert got["set_gone"]["status"] == 404
        assert (error["code"], error["reason"]) == ("SET_NOT_FOUND", "set")

    def test_the_inspector_names_a_collection_and_a_set(self, got):
        holders = {(c["name"], c["kind"]) for c in got["track_detail"]["collections"]}
        assert holders == {("Warm-up", "collection"), ("Friday", "set")}

    def test_references_count_the_set_as_its_own_kind(self, got):
        refs = got["references"]
        assert (refs["collection_count"], refs["set_count"]) == (1, 1)
        assert refs["set_track_count"] == 1
        assert refs["set_ids"] == [got["ids"]["friday"]]
        assert refs["collection_ids"] == [got["ids"]["warmup"]]

    def test_the_folder_delete_counts_its_sets(self, got):
        removes = got["delete_preview"]["removes"]
        # Friday, the two copies filed beside it, and Friday's duplicate, which
        # is made where its original is.
        assert removes["sets"] == 4
        assert removes["folders"] == 1

    def test_the_set_list_is_friday_in_order(self, got):
        text = got["set_list_text"]["text"]
        assert "Friday" in text
        assert text.index("Warm One") < text.index("Peak Two")

    def test_a_saved_set_list_counts_its_entries(self, got):
        saved = got["set_list_saved"]["saved"]
        assert (saved["format"], saved["entries"]) == ("csv", 6)

    def test_a_destination_refusal_carries_its_reason_and_path(self, got):
        error = got["set_list_refused"]["payload"]["error"]
        assert got["set_list_refused"]["status"] == 400
        assert error["code"] == "SET_LIST_DESTINATION_REFUSED"
        assert error["reason"] == "destination_not_set_list"
        assert error["path"].endswith("Friday.mp3")
