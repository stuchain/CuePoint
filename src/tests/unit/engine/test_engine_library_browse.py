#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The browse, playlists, facets and track-detail endpoints (LIBUI-03).

DEC-023 said Phase 4 would extend the one search path rather than add a second
one, so browsing arrives as parameters on ``/api/v1/library/search``. The test
that matters most is therefore the one that proves the *old* request still
answers exactly as it did: global search is a live caller, and "we extended it"
must not mean "we changed it".

The rest is the shape of the four new answers, and what each of them does with
a request it cannot honour — a filter naming a field that does not exist, a
sort that is not sortable, a track id that is not a number, a track that is not
there. Each of those is a 400 or a 404 with a message, never a 500 and never an
empty object a panel would render as a track with no title.

Everything runs against a temporary database and a fresh DI container; the
user's real ``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
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

TOKEN = "library-browse-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _get(url: str, token: str | None = TOKEN):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(url, headers=headers, method="GET")
    return urllib.request.urlopen(req, timeout=5)


def get_json(base: str, path: str, **params) -> dict:
    """GET a library endpoint with query parameters, returning the payload."""
    query = urllib.parse.urlencode(
        {k: v for k, v in params.items() if v is not None}, quote_via=urllib.parse.quote
    )
    url = f"{base}{path}" + (f"?{query}" if query else "")
    with _get(url) as resp:
        payload: dict = json.loads(resp.read().decode("utf-8"))
    return payload


def get_error(base: str, path: str, **params) -> tuple:
    """GET an endpoint expected to fail, returning ``(status, payload)``."""
    query = urllib.parse.urlencode(
        {k: v for k, v in params.items() if v is not None}, quote_via=urllib.parse.quote
    )
    url = f"{base}{path}" + (f"?{query}" if query else "")
    try:
        with _get(url) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    """A sandboxed library database with services bootstrapped over it."""
    from cuepoint.services.bootstrap import bootstrap_services

    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    bootstrap_services()
    yield db_path
    reset_container()


TRACKS = (
    # id, title, artist, genre, bpm, rating, label
    ("1", "Strobe", "deadmau5", "Progressive House", 128.0, 5, "mau5trap"),
    ("2", "Ghosts n Stuff", "Deadmau5", "progressive house", 128.0, 4, "mau5trap"),
    ("3", "Rej", "Ame", "Deep House", 122.5, 1, "Innervisions"),
    ("4", "Opus", "Eric Prydz", None, None, None, None),
)


@pytest.fixture
def seeded(library_db):
    """Four tracks and a small playlist tree, through the real repositories."""
    from cuepoint.services.interfaces import IPlaylistRepository, ITrackRepository
    from cuepoint.utils.di_container import get_container

    repo = get_container().resolve(ITrackRepository)
    for track_id, title, artist, genre, bpm, rating, label in TRACKS:
        repo.add(
            LibraryTrack(
                rekordbox_track_id=track_id,
                file_path=f"/music/{track_id}.mp3",
                title=title,
                artist=artist,
                genre=genre,
                bpm=bpm,
                rating=rating,
                label=label,
            )
        )

    playlists = get_container().resolve(IPlaylistRepository)
    playlists.replace_tree(
        [
            RekordboxPlaylist(
                name="SETS",
                kind=KIND_FOLDER,
                depth=0,
                position=0,
                rekordbox_path="SETS",
            ),
            RekordboxPlaylist(
                name="warmup",
                kind=KIND_PLAYLIST,
                depth=1,
                position=0,
                rekordbox_path="SETS/warmup",
                parent_path="SETS",
                track_refs=["3", "1"],
            ),
            # A real export had four playlists with a separator in the name.
            RekordboxPlaylist(
                name="COZMO_11/02",
                kind=KIND_PLAYLIST,
                depth=1,
                position=1,
                rekordbox_path="SETS/COZMO_11/02",
                parent_path="SETS",
                track_refs=["2"],
            ),
        ]
    )
    return library_db


@pytest.fixture
def engine(library_db):
    """A running engine on a free port, shut down afterwards."""
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    server, thread = start_engine_thread(config)
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


def playlist_id(base: str, path: str) -> int:
    """The id of a playlist, by its Rekordbox path."""
    tree = get_json(base, "/api/v1/library/playlists")
    for node in tree["playlists"]:
        if node["path"] == path:
            return int(node["id"])
    raise AssertionError(f"no playlist at {path}")


@pytest.mark.unit
class TestTodaysCallerIsUntouched:
    """The DEC-023 guard. Global search is a live caller of this endpoint."""

    def test_a_request_with_no_new_parameters_answers_as_it_did(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/search", q="deadmau5")

        # Every key SHELL-04 shipped, with the values it shipped.
        assert payload["query"] == "deadmau5"
        assert payload["total"] == 2
        assert payload["limit"] == 50
        assert payload["offset"] == 0
        assert payload["library_empty"] is False
        assert [t["title"] for t in payload["tracks"]] == ["Ghosts n Stuff", "Strobe"]

    def test_a_blank_search_still_finds_nothing(self, engine, seeded):
        # An empty search box is not a request to read the whole library.
        payload = get_json(engine, "/api/v1/library/search", q="")
        assert payload["tracks"] == []
        assert payload["total"] == 0

    def test_the_response_gained_only_additive_keys(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/search", q="deadmau5")
        assert set(payload) == {
            # SHELL-04's shape...
            "query",
            "total",
            "limit",
            "offset",
            "tracks",
            "library_empty",
            # ...plus what LIBUI-03 echoes back.
            "mode",
            "scope",
            "sort",
            "dir",
            "filters",
        }

    def test_it_answers_as_a_search_unless_told_otherwise(self, engine, seeded):
        assert get_json(engine, "/api/v1/library/search", q="x")["mode"] == "search"


@pytest.mark.unit
class TestBrowse:
    def test_a_blank_query_returns_the_library(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/search", mode="browse")
        assert payload["total"] == 4
        assert len(payload["tracks"]) == 4
        assert payload["mode"] == "browse"

    def test_it_defaults_to_artist_then_title(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/search", mode="browse")
        assert [t["rekordbox_track_id"] for t in payload["tracks"]] == [
            "3",
            "2",
            "1",
            "4",
        ]

    def test_sort_and_direction_are_honoured_and_echoed(self, engine, seeded):
        payload = get_json(
            engine, "/api/v1/library/search", mode="browse", sort="bpm", dir="desc"
        )
        assert payload["sort"] == "bpm"
        assert payload["dir"] == "desc"
        ids = [t["rekordbox_track_id"] for t in payload["tracks"]]
        assert ids[0] in {"1", "2"} and ids[-1] == "4"

    def test_paging_reports_the_unpaged_total(self, engine, seeded):
        payload = get_json(
            engine, "/api/v1/library/search", mode="browse", limit=2, offset=2
        )
        assert payload["total"] == 4
        assert len(payload["tracks"]) == 2
        assert payload["offset"] == 2

    def test_a_playlist_scope_narrows_it_and_is_echoed(self, engine, seeded):
        scope = playlist_id(engine, "SETS/warmup")
        payload = get_json(
            engine, "/api/v1/library/search", mode="browse", playlist_id=scope
        )
        assert payload["scope"] == scope
        assert sorted(t["rekordbox_track_id"] for t in payload["tracks"]) == ["1", "3"]

    def test_a_folder_scope_reaches_its_playlists(self, engine, seeded):
        scope = playlist_id(engine, "SETS")
        payload = get_json(
            engine, "/api/v1/library/search", mode="browse", playlist_id=scope
        )
        assert sorted(t["rekordbox_track_id"] for t in payload["tracks"]) == [
            "1",
            "2",
            "3",
        ]

    def test_filters_narrow_it(self, engine, seeded):
        filters = json.dumps(
            {
                "match": "all",
                "rules": [{"field": "bpm", "operator": "gte", "value": 128}],
            }
        )
        payload = get_json(
            engine, "/api/v1/library/search", mode="browse", filters=filters
        )
        assert payload["total"] == 2

    def test_filters_compose_with_scope_and_query(self, engine, seeded):
        scope = playlist_id(engine, "SETS")
        filters = json.dumps(
            {"rules": [{"field": "genre", "operator": "contains", "value": "house"}]}
        )
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            playlist_id=scope,
            q="deadmau5",
            filters=filters,
        )
        assert [t["rekordbox_track_id"] for t in payload["tracks"]] == ["2", "1"]

    def test_the_filters_are_echoed_back(self, engine, seeded):
        # LIBUI-05 tells a late response from a current one by what it answers.
        # A filter changes neither the scope, the sort nor the text, so without
        # this the two requests are indistinguishable.
        filters = json.dumps(
            {"rules": [{"field": "bpm", "operator": "gte", "value": 128}]}
        )
        payload = get_json(
            engine, "/api/v1/library/search", mode="browse", filters=filters
        )
        assert payload["filters"] == {
            "match": "all",
            "rules": [{"field": "bpm", "operator": "gte", "value": 128.0}],
        }

    def test_no_filters_echoes_an_empty_rule_set(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/search", mode="browse")
        assert payload["filters"] == {"match": "all", "rules": []}

    def test_playlist_order_is_available_inside_a_playlist(self, engine, seeded):
        scope = playlist_id(engine, "SETS/warmup")
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            playlist_id=scope,
            sort="playlist_position",
        )
        assert [t["rekordbox_track_id"] for t in payload["tracks"]] == ["3", "1"]


@pytest.mark.unit
class TestIdsProjection:
    def test_it_returns_ids_in_the_same_order_as_the_rows(self, engine, seeded):
        rows = get_json(engine, "/api/v1/library/search", mode="browse", sort="bpm")
        ids = get_json(
            engine, "/api/v1/library/search", mode="browse", sort="bpm", fields="id"
        )
        assert ids["track_ids"] == [t["id"] for t in rows["tracks"]]

    def test_it_sends_no_rows(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/search", mode="browse", fields="id")
        assert payload["tracks"] == []
        assert payload["total"] == 4

    def test_it_honours_the_same_predicate(self, engine, seeded):
        filters = json.dumps(
            {"rules": [{"field": "rating", "operator": "gte", "value": 4}]}
        )
        payload = get_json(
            engine,
            "/api/v1/library/search",
            mode="browse",
            fields="id",
            filters=filters,
        )
        assert len(payload["track_ids"]) == 2
        assert payload["total"] == 2

    def test_a_search_mode_request_never_carries_ids(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/search", q="deadmau5")
        assert "track_ids" not in payload


@pytest.mark.unit
class TestRefusals:
    @pytest.mark.parametrize(
        "params,fragment",
        [
            ({"mode": "sideways"}, "mode must be"),
            ({"mode": "browse", "sort": "popularity"}, "Cannot sort by"),
            ({"mode": "browse", "dir": "sideways"}, "dir must be"),
            ({"mode": "browse", "playlist_id": "the good one"}, "must be a number"),
            ({"mode": "browse", "fields": "everything"}, "fields may only be"),
            ({"mode": "browse", "filters": "not json"}, "JSON"),
            ({"mode": "browse", "limit": "loads"}, "must be an integer"),
        ],
    )
    def test_a_request_that_cannot_be_honoured_is_a_400(
        self, engine, seeded, params, fragment
    ):
        status, payload = get_error(engine, "/api/v1/library/search", **params)
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert fragment in payload["error"]["message"]

    def test_an_unsortable_column_is_refused_in_search_mode_too(self, engine, seeded):
        # Search does not sort by this parameter, so nothing downstream would
        # ever look at it: without the check at the edge, a typo would be
        # accepted in silence and the caller would believe it had been honoured.
        status, payload = get_error(
            engine, "/api/v1/library/search", q="deadmau5", sort="popularity"
        )
        assert status == 400
        assert "Cannot sort by" in payload["error"]["message"]

    def test_an_unknown_filter_field_names_what_is_filterable(self, engine, seeded):
        filters = json.dumps(
            {"rules": [{"field": "vibe", "operator": "is", "value": "dark"}]}
        )
        status, payload = get_error(
            engine, "/api/v1/library/search", mode="browse", filters=filters
        )
        assert status == 400
        assert "genre" in payload["error"]["message"]

    def test_a_bad_value_names_the_clause(self, engine, seeded):
        filters = json.dumps(
            {"rules": [{"field": "bpm", "operator": "gte", "value": "fast"}]}
        )
        status, payload = get_error(
            engine, "/api/v1/library/search", mode="browse", filters=filters
        )
        assert status == 400
        assert "BPM" in payload["error"]["message"]

    def test_matching_any_rule_says_when_it_arrives(self, engine, seeded):
        filters = json.dumps(
            {
                "match": "any",
                "rules": [{"field": "bpm", "operator": "gte", "value": 100}],
            }
        )
        status, payload = get_error(
            engine, "/api/v1/library/search", mode="browse", filters=filters
        )
        assert status == 400
        assert "Smart Collections" in payload["error"]["message"]

    def test_playlist_order_outside_a_playlist_is_refused(self, engine, seeded):
        status, payload = get_error(
            engine, "/api/v1/library/search", mode="browse", sort="playlist_position"
        )
        assert status == 400
        assert "playlist" in payload["error"]["message"]

    def test_a_value_carrying_sql_stays_a_value(self, engine, seeded):
        filters = json.dumps(
            {
                "rules": [
                    {
                        "field": "genre",
                        "operator": "is",
                        "value": "House'); DROP TABLE tracks;--",
                    }
                ]
            }
        )
        payload = get_json(
            engine, "/api/v1/library/search", mode="browse", filters=filters
        )
        assert payload["total"] == 0
        # The library is still there.
        assert get_json(engine, "/api/v1/library/search", mode="browse")["total"] == 4


@pytest.mark.unit
class TestPlaylistsEndpoint:
    def test_it_returns_the_tree_parents_first(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/playlists")
        assert payload["total"] == 3
        assert [n["name"] for n in payload["playlists"]] == [
            "SETS",
            "warmup",
            "COZMO_11/02",
        ]

    def test_nesting_is_by_parent_id(self, engine, seeded):
        nodes = {
            n["name"]: n
            for n in get_json(engine, "/api/v1/library/playlists")["playlists"]
        }
        assert nodes["SETS"]["parent_id"] is None
        assert nodes["warmup"]["parent_id"] == nodes["SETS"]["id"]
        assert nodes["warmup"]["depth"] == 1

    def test_a_name_containing_a_separator_stays_a_name(self, engine, seeded):
        # Four playlists in a real export are named this way.
        nodes = {
            n["name"]: n
            for n in get_json(engine, "/api/v1/library/playlists")["playlists"]
        }
        assert "COZMO_11/02" in nodes
        assert nodes["COZMO_11/02"]["kind"] == "playlist"

    def test_it_carries_the_counts(self, engine, seeded):
        nodes = {
            n["name"]: n
            for n in get_json(engine, "/api/v1/library/playlists")["playlists"]
        }
        assert nodes["warmup"]["track_count"] == 2
        assert nodes["SETS"]["kind"] == "folder"

    def test_an_empty_library_has_an_empty_tree(self, engine, library_db):
        assert get_json(engine, "/api/v1/library/playlists") == {
            "playlists": [],
            "total": 0,
        }


@pytest.mark.unit
class TestFacetsEndpoint:
    def test_it_counts_the_values_of_a_field(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/facets", field="genre")
        assert [(v["value"], v["count"]) for v in payload["values"]] == [
            ("Progressive House", 2),
            ("Deep House", 1),
            (None, 1),
        ]
        assert payload["total_values"] == 3
        assert payload["truncated"] is False

    def test_a_text_field_carries_no_range(self, engine, seeded):
        assert (
            get_json(engine, "/api/v1/library/facets", field="genre")["range"] is None
        )

    def test_a_number_field_carries_its_range(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/facets", field="bpm")
        assert payload["range"]["min"] == 122.5
        assert payload["range"]["max"] == 128.0
        assert payload["range"]["missing"] == 1

    def test_it_honours_the_scope_and_other_filters(self, engine, seeded):
        filters = json.dumps(
            {"rules": [{"field": "bpm", "operator": "gte", "value": 128}]}
        )
        payload = get_json(
            engine, "/api/v1/library/facets", field="genre", filters=filters
        )
        assert [v["value"] for v in payload["values"]] == ["Progressive House"]

    def test_it_ignores_its_own_field(self, engine, seeded):
        filters = json.dumps(
            {"rules": [{"field": "genre", "operator": "is", "value": "Deep House"}]}
        )
        payload = get_json(
            engine, "/api/v1/library/facets", field="genre", filters=filters
        )
        assert len(payload["values"]) == 3

    def test_the_field_is_required(self, engine, seeded):
        status, payload = get_error(engine, "/api/v1/library/facets")
        assert status == 400
        assert "field is required" in payload["error"]["message"]

    def test_an_unknown_field_is_refused(self, engine, seeded):
        status, payload = get_error(engine, "/api/v1/library/facets", field="vibe")
        assert status == 400
        assert "Cannot filter by" in payload["error"]["message"]


@pytest.mark.unit
class TestFilterFieldsEndpoint:
    def test_it_describes_what_can_be_filtered(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/filter-fields")
        by_name = {f["name"]: f for f in payload["fields"]}
        assert by_name["bpm"]["type"] == "number"
        assert "between" in by_name["bpm"]["operators"]
        assert by_name["genre"]["facetable"] is True

    def test_it_lists_what_can_be_sorted(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/filter-fields")
        assert "artist" in payload["sortable"]
        assert "playlist_position" in payload["sortable"]

    def test_it_says_how_many_values_each_operator_takes(self, engine, seeded):
        # LIBUI-08 builds one control for "between" and another for "is empty".
        # Arity comes from the engine so a renderer cannot offer a clause the
        # engine would refuse.
        operators = get_json(engine, "/api/v1/library/filter-fields")["operators"]
        assert operators["is"]["arity"] == "single"
        assert operators["between"]["arity"] == "pair"
        assert operators["any_of"]["arity"] == "list"
        assert operators["is_empty"]["arity"] == "none"

    def test_every_operator_a_field_allows_is_described(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/filter-fields")
        described = set(payload["operators"])
        for field in payload["fields"]:
            assert set(field["operators"]) <= described

    def test_every_facetable_field_is_a_field(self, engine, seeded):
        payload = get_json(engine, "/api/v1/library/filter-fields")
        names = {f["name"] for f in payload["fields"]}
        assert set(payload["facetable"]) <= names


@pytest.mark.unit
class TestTrackDetailEndpoint:
    def track_id(self, base: str, rekordbox_id: str) -> int:
        payload = get_json(base, "/api/v1/library/search", mode="browse")
        for track in payload["tracks"]:
            if track["rekordbox_track_id"] == rekordbox_id:
                return int(track["id"])
        raise AssertionError(f"no track {rekordbox_id}")

    def test_it_returns_the_whole_row(self, engine, seeded):
        payload = get_json(
            engine, f"/api/v1/library/tracks/{self.track_id(engine, '1')}"
        )
        track = payload["track"]
        assert track["title"] == "Strobe"
        # DEC-047: everything imported, including the DEC-034 fields.
        for field in (
            "remixer",
            "rating",
            "play_count",
            "colour",
            "date_added",
            "comment",
            "bitrate",
        ):
            assert field in track
        assert track["rating"] == 5

    def test_it_lists_the_playlists_holding_the_track(self, engine, seeded):
        payload = get_json(
            engine, f"/api/v1/library/tracks/{self.track_id(engine, '1')}"
        )
        assert [p["name"] for p in payload["playlists"]] == ["warmup"]
        assert payload["playlist_count"] == 1

    def test_a_track_in_no_playlist_says_so(self, engine, seeded):
        payload = get_json(
            engine, f"/api/v1/library/tracks/{self.track_id(engine, '4')}"
        )
        assert payload["playlists"] == []
        assert payload["playlist_count"] == 0

    def test_a_missing_track_is_a_404(self, engine, seeded):
        status, payload = get_error(engine, "/api/v1/library/tracks/999999")
        assert status == 404
        assert payload["error"]["code"] == "TRACK_NOT_FOUND"

    def test_an_id_that_is_not_a_number_is_a_400(self, engine, seeded):
        status, payload = get_error(engine, "/api/v1/library/tracks/abc")
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"


@pytest.mark.unit
class TestAuthentication:
    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/library/search?mode=browse",
            "/api/v1/library/playlists",
            "/api/v1/library/facets?field=genre",
            "/api/v1/library/filter-fields",
            "/api/v1/library/tracks/1",
        ],
    )
    def test_every_new_endpoint_needs_the_token(self, engine, seeded, path):
        with pytest.raises(urllib.error.HTTPError) as exc:
            _get(f"{engine}{path}", token=None)
        assert exc.value.code == 401

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/library/playlists",
            "/api/v1/library/facets?field=genre",
        ],
    )
    def test_a_wrong_token_is_refused(self, engine, seeded, path):
        with pytest.raises(urllib.error.HTTPError) as exc:
            _get(f"{engine}{path}", token="wrong")
        assert exc.value.code == 401
