#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The keys of chosen sources: ``POST /api/v1/library/keys/population`` (PAGES-16).

The Keys page counts each Camelot key over the playlists, Collections and Sets
the user ticked. A track filed in several of them counts once, the keys are
Beatport's (PAGES-15), never Rekordbox's imported one, and a source that does
not exist is refused with the engine's error envelope.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import (
    KIND_FOLDER,
    KIND_PLAYLIST,
    RekordboxPlaylist,
)
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container
from tests.unit.key_support import accept_with_key

TOKEN = "keys-population-token"
PATH = "/api/v1/library/keys/population"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _post(base: str, body, token: str | None = TOKEN):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base}{PATH}", data=data, method="POST", headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


@pytest.fixture
def world(tmp_path, monkeypatch):
    """Seven tracks, two playlists, a Collection and a Set, and a running engine.

    ======  ======  =============  ===================  =======================
    track   key     Rekordbox key  filed in             note
    ======  ======  =============  ===================  =======================
    1       8A      12B            warm, box            two sources, counted once
    2       8A      —              warm
    3       9A      —              peak, plan (Set)
    4       —       8A             peak                 Rekordbox's key is ignored
    5       —       —              box
    6       11B     —              (nowhere)
    7       8A      —              (nowhere)
    ======  ======  =============  ===================  =======================
    """
    from cuepoint.persistence.collection_repository import CollectionRepository
    from cuepoint.persistence.playlist_repository import PlaylistRepository
    from cuepoint.models.collection import (
        KIND_COLLECTION,
        KIND_SET,
        Collection,
    )
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IDatabaseService, ITrackRepository
    from cuepoint.utils.di_container import get_container

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    container = get_container()
    repo = container.resolve(ITrackRepository)
    database = container.resolve(IDatabaseService)
    for number, rekordbox_key in (
        ("1", "12B"),
        ("2", None),
        ("3", None),
        ("4", "8A"),
        ("5", None),
        ("6", None),
        ("7", None),
    ):
        repo.add(
            LibraryTrack(
                rekordbox_track_id=number,
                file_path=f"/music/{number}.mp3",
                title=f"Track {number}",
                artist="Artist",
                key=rekordbox_key,
            )
        )
    ids = {t.rekordbox_track_id: t.id for t in repo.browse(limit=20)}
    for number, key in (("1", "8A"), ("2", "8A"), ("3", "9A"), ("6", "A Major")):
        accept_with_key(database, ids[number], key)
    accept_with_key(database, ids["7"], "A Minor")

    playlists = PlaylistRepository(database)
    playlists.replace_tree(
        [
            RekordboxPlaylist(
                name="ROOT",
                kind=KIND_FOLDER,
                depth=0,
                position=0,
                rekordbox_path="ROOT",
            ),
            RekordboxPlaylist(
                name="warm",
                kind=KIND_PLAYLIST,
                depth=1,
                position=0,
                rekordbox_path="ROOT/warm",
                parent_path="ROOT",
                track_refs=["1", "2"],
            ),
            RekordboxPlaylist(
                name="peak",
                kind=KIND_PLAYLIST,
                depth=1,
                position=1,
                rekordbox_path="ROOT/peak",
                parent_path="ROOT",
                track_refs=["3", "4"],
            ),
        ]
    )
    found = {n.rekordbox_path: int(n.id) for n in playlists.list_all()}
    collections = CollectionRepository(database)
    box = collections.create(Collection(kind=KIND_COLLECTION, name="Box"))
    collections.add(box.id, [ids["1"], ids["5"]])
    plan = collections.create(Collection(kind=KIND_SET, name="Plan"))
    collections.add(plan.id, [ids["3"]])

    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield {
            "base": f"http://127.0.0.1:{port}",
            "warm": found["ROOT/warm"],
            "peak": found["ROOT/peak"],
            "folder": found["ROOT"],
            "box": int(box.id),
            "plan": int(plan.id),
        }
    finally:
        server.shutdown()
        thread.join(timeout=2)
        reset_container()


def _sources(*items):
    return {"sources": [{"kind": kind, "id": ident} for kind, ident in items]}


@pytest.mark.unit
class TestKeysPopulation:
    def test_the_whole_library(self, world):
        status, payload = _post(world["base"], _sources(("all", 0)))
        assert status == 200
        assert payload == {
            "total": 7,
            "keys": [
                {"code": "8A", "count": 3},
                {"code": "9A", "count": 1},
                {"code": "11B", "count": 1},
            ],
            "no_key": 2,
        }

    def test_an_all_source_without_an_id_is_the_library(self, world):
        status, payload = _post(world["base"], {"sources": [{"kind": "all"}]})
        assert status == 200
        assert payload["total"] == 7

    def test_no_sources_is_the_whole_library(self, world):
        status, payload = _post(world["base"], {"sources": []})
        assert status == 200
        assert payload["total"] == 7

    def test_one_playlist(self, world):
        status, payload = _post(world["base"], _sources(("playlist", world["warm"])))
        assert status == 200
        assert payload == {
            "total": 2,
            "keys": [{"code": "8A", "count": 2}],
            "no_key": 0,
        }

    def test_rekordboxs_imported_key_is_never_counted(self, world):
        _, payload = _post(world["base"], _sources(("playlist", world["peak"])))
        assert payload == {
            "total": 2,
            "keys": [{"code": "9A", "count": 1}],
            "no_key": 1,
        }

    def test_several_sources_of_different_kinds(self, world):
        _, payload = _post(
            world["base"],
            _sources(
                ("playlist", world["peak"]),
                ("collection", world["box"]),
                ("set", world["plan"]),
            ),
        )
        # peak: 3, 4. Box: 1, 5. Plan: 3. Track 3 is in two sources.
        assert payload == {
            "total": 4,
            "keys": [
                {"code": "8A", "count": 1},
                {"code": "9A", "count": 1},
            ],
            "no_key": 2,
        }

    def test_a_track_in_two_sources_counts_once(self, world):
        _, payload = _post(
            world["base"],
            _sources(("playlist", world["warm"]), ("collection", world["box"])),
        )
        # warm: 1, 2. Box: 1, 5. Track 1 is in both.
        assert payload["total"] == 3
        assert payload["keys"] == [{"code": "8A", "count": 2}]
        assert payload["no_key"] == 1

    def test_a_folder_counts_everything_under_it(self, world):
        _, payload = _post(world["base"], _sources(("playlist", world["folder"])))
        assert payload["total"] == 4

    def test_keys_come_back_in_camelot_order(self, world):
        _, payload = _post(world["base"], _sources(("all", 0)))
        assert [k["code"] for k in payload["keys"]] == ["8A", "9A", "11B"]

    def test_an_unknown_kind_is_a_400_envelope(self, world):
        status, payload = _post(world["base"], _sources(("album", 1)))
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert "album" in payload["error"]["message"]

    def test_an_unknown_playlist_is_a_404_envelope(self, world):
        status, payload = _post(world["base"], _sources(("playlist", 9999)))
        assert status == 404
        assert payload["error"]["code"] == "SOURCE_NOT_FOUND"

    def test_an_unknown_collection_is_a_404_envelope(self, world):
        status, payload = _post(world["base"], _sources(("collection", 9999)))
        assert status == 404

    def test_a_collection_id_is_not_a_set_id(self, world):
        status, _ = _post(world["base"], _sources(("set", world["box"])))
        assert status == 404

    def test_a_body_that_is_not_json_is_a_400(self, world):
        status, payload = _post(world["base"], b"{nope")
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"

    def test_it_needs_the_token(self, world):
        status, payload = _post(world["base"], _sources(("all", 0)), token=None)
        assert status == 401
        assert payload["error"]["code"] == "UNAUTHORIZED"


# The page's numbers are the Library's: each count is what the Library shows when it is
# filtered by "Key is X" and "In playlist is any of ..." (what Open in Library carries).
_SOURCE_SETS = {
    "whole library": (),
    "one playlist": (("playlist", "warm"),),
    "two playlists": (("playlist", "warm"), ("playlist", "peak")),
    "mixed kinds": (("playlist", "peak"), ("collection", "box"), ("set", "plan")),
    "overlap": (("playlist", "warm"), ("collection", "box")),
    "a folder": (("playlist", "folder"),),
}


@pytest.mark.unit
@pytest.mark.parametrize("label", sorted(_SOURCE_SETS))
def test_counts_equal_the_librarys_browse_count(world, label):
    from cuepoint.models.filter_rule import FilterRule, RuleSet
    from cuepoint.services.interfaces import ILibraryService
    from cuepoint.utils.di_container import get_container

    library = get_container().resolve(ILibraryService)
    named = [{"kind": kind, "id": world[name]} for kind, name in _SOURCE_SETS[label]]
    source_rule = (FilterRule("in_playlist", "any_of", named),) if named else ()

    body = (
        _sources(*[(item["kind"], item["id"]) for item in named])
        if named
        else {"sources": []}
    )
    status, payload = _post(world["base"], body)
    assert status == 200

    assert payload["total"] == library.browse_count(rules=RuleSet(rules=source_rule))
    assert payload["total"] > 0
    for entry in payload["keys"]:
        rules = RuleSet(rules=(FilterRule("key", "is", entry["code"]),) + source_rule)
        assert entry["count"] == library.browse_count(rules=rules), entry["code"]
    assert payload["no_key"] == library.browse_count(
        rules=RuleSet(rules=(FilterRule("key", "is_empty", None),) + source_rule)
    )
    assert (
        sum(e["count"] for e in payload["keys"]) + payload["no_key"] == payload["total"]
    )
