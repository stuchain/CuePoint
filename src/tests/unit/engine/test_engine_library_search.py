#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library search endpoint (SHELL-04, DEC-023).

DEC-023 chose a real engine-backed search over a client-side filter, which made
this a desktop-contract change rather than renderer work. These tests cover the
HTTP half: the response shape (a public contract under the "preserve response
shapes" invariant), authentication, and what happens when the request or the
library is not what the handler hoped for.

Everything runs against a temporary database and a fresh DI container; the
user's real ``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container

TOKEN = "library-search-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _get(url: str, token: str | None = TOKEN):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(url, headers=headers, method="GET")
    return urllib.request.urlopen(req, timeout=5)


def _get_json(base: str, query: str) -> dict:
    with _get(f"{base}{query}") as resp:
        payload: dict = json.loads(resp.read().decode("utf-8"))
    return payload


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


@pytest.fixture
def seeded(library_db):
    """Four tracks, enough to tell matching, ordering and paging apart."""
    from cuepoint.services.interfaces import ITrackRepository
    from cuepoint.utils.di_container import get_container

    repo = get_container().resolve(ITrackRepository)
    rows = [
        ("1", "Strobe", "deadmau5", "mau5trap"),
        ("2", "Ghosts n Stuff", "deadmau5", "mau5trap"),
        ("3", "Opus", "Eric Prydz", "Virgin EMI"),
        ("4", "Rej", "Ame", "Innervisions"),
    ]
    for track_id, title, artist, label in rows:
        repo.add(
            LibraryTrack(
                rekordbox_track_id=track_id,
                file_path=f"/music/{track_id}.mp3",
                title=title,
                artist=artist,
                label=label,
            )
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


@pytest.fixture
def seeded_from_rekordbox(library_db, tmp_path):
    """One track imported the way a real import will, straight from an export."""
    from cuepoint.data.rekordbox import iter_collection_tracks
    from cuepoint.services.interfaces import ITrackRepository
    from cuepoint.utils.di_container import get_container

    xml = tmp_path / "export.xml"
    xml.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="1">\n'
        '<TRACK TrackID="900" Name="Tataki" Artist="Argy" Genre="Melodic House"'
        ' Album="Tataki" Label="Anjunadeep" Tonality="10B" AverageBpm="122.00"'
        ' Year="2022" TotalTime="328" BitRate="320" Rating="204" PlayCount="7"'
        ' DateAdded="2022-10-03" Comments="peak time"'
        ' Location="file://localhost/music/Tataki.mp3"/>\n'
        "</COLLECTION></DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )

    repo = get_container().resolve(ITrackRepository)
    for track in iter_collection_tracks(str(xml)):
        repo.add(track)
    return library_db


@pytest.mark.unit
class TestImportedTrackReachesTheApi:
    """DEC-038: the response field that carries a length must actually carry one.

    Before DEC-038 the parser wrote TotalTime into a separate total_time column
    and this endpoint — whose shape has always named duration_seconds — reported
    null for every imported track. This is the whole path in one test: export
    attribute, parser, repository, HTTP response.
    """

    def test_duration_comes_through_from_totaltime(self, seeded_from_rekordbox, engine):
        payload = _get_json(engine, "/api/v1/library/search?q=Tataki")

        (track,) = payload["tracks"]
        assert track["duration_seconds"] == 328

    def test_the_other_imported_fields_come_through_too(
        self, seeded_from_rekordbox, engine
    ):
        payload = _get_json(engine, "/api/v1/library/search?q=Tataki")

        (track,) = payload["tracks"]
        assert track["bpm"] == 122.0
        assert track["key"] == "10B"
        assert track["year"] == 2022
        assert track["label"] == "Anjunadeep"
        assert track["file_path"] == "/music/Tataki.mp3"


@pytest.mark.unit
class TestResponseShape:
    def test_returns_the_documented_envelope(self, seeded, engine):
        payload = _get_json(engine, "/api/v1/library/search?q=deadmau5")

        assert set(payload) == {
            "query",
            "total",
            "limit",
            "offset",
            "tracks",
            "library_empty",
        }
        assert payload["query"] == "deadmau5"
        assert payload["total"] == 2
        assert payload["limit"] == 50
        assert payload["offset"] == 0
        assert payload["library_empty"] is False

    def test_each_track_carries_the_documented_fields(self, seeded, engine):
        payload = _get_json(engine, "/api/v1/library/search?q=Strobe")

        assert set(payload["tracks"][0]) == {
            "id",
            "rekordbox_track_id",
            "title",
            "artist",
            "album",
            "label",
            "genre",
            "key",
            "bpm",
            "year",
            "duration_seconds",
            "file_path",
        }

    def test_total_is_the_match_count_not_the_page_length(self, seeded, engine):
        payload = _get_json(engine, "/api/v1/library/search?q=deadmau5&limit=1")

        assert len(payload["tracks"]) == 1
        assert payload["total"] == 2


@pytest.mark.unit
class TestQuerying:
    def test_matches_case_insensitively(self, seeded, engine):
        assert _get_json(engine, "/api/v1/library/search?q=DEADMAU5")["total"] == 2

    def test_pages_with_limit_and_offset(self, seeded, engine):
        first = _get_json(engine, "/api/v1/library/search?q=deadmau5&limit=1&offset=0")
        second = _get_json(engine, "/api/v1/library/search?q=deadmau5&limit=1&offset=1")

        assert first["tracks"][0]["title"] != second["tracks"][0]["title"]

    def test_clamps_limit_to_the_maximum(self, seeded, engine):
        assert (
            _get_json(engine, "/api/v1/library/search?q=a&limit=99999")["limit"] == 200
        )

    def test_missing_query_returns_an_empty_result(self, seeded, engine):
        payload = _get_json(engine, "/api/v1/library/search")

        assert payload["tracks"] == []
        assert payload["total"] == 0

    def test_blank_query_does_not_return_the_library(self, seeded, engine):
        payload = _get_json(engine, "/api/v1/library/search?q=%20%20")

        assert payload["tracks"] == []
        assert payload["total"] == 0

    def test_url_encoded_query_is_decoded(self, seeded, engine):
        # "Ghosts n Stuff" — spaces arrive as %20.
        assert _get_json(engine, "/api/v1/library/search?q=Ghosts%20n")["total"] == 1

    def test_like_wildcards_are_literal(self, seeded, engine):
        # Unescaped, `%` would match every track.
        assert _get_json(engine, "/api/v1/library/search?q=%25")["total"] == 0


@pytest.mark.unit
class TestEmptyLibrary:
    def test_reports_an_empty_library_distinctly_from_no_results(
        self, library_db, engine
    ):
        # "no library yet" and "no matches" need different answers in the UI,
        # so the response has to tell them apart.
        payload = _get_json(engine, "/api/v1/library/search?q=anything")

        assert payload["tracks"] == []
        assert payload["total"] == 0
        assert payload["library_empty"] is True

    def test_search_works_before_any_import(self, library_db, engine):
        # DEC-023 accepted that this returns nothing until the Library phase
        # lands. Returning nothing is fine; failing is not.
        with _get(f"{engine}/api/v1/library/search?q=x") as resp:
            assert resp.status == 200


@pytest.mark.unit
class TestErrors:
    def test_requires_a_token(self, seeded, engine):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/library/search?q=a", token=None)

        assert excinfo.value.code == 401
        body = json.loads(excinfo.value.read().decode("utf-8"))
        assert body["error"]["code"] == "UNAUTHORIZED"

    def test_rejects_a_wrong_token(self, seeded, engine):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/library/search?q=a", token="not-the-token")

        assert excinfo.value.code == 401

    @pytest.mark.parametrize("param", ["limit", "offset"])
    def test_rejects_a_non_numeric_paging_parameter(self, seeded, engine, param):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/library/search?q=a&{param}=abc")

        assert excinfo.value.code == 400
        body = json.loads(excinfo.value.read().decode("utf-8"))
        assert body["error"]["code"] == "INVALID_REQUEST"
        assert param in body["error"]["message"]

    def test_error_body_uses_the_shared_envelope(self, seeded, engine):
        # The engine error envelope is an invariant; this endpoint does not get
        # to invent its own shape.
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/library/search?q=a&limit=abc")

        body = json.loads(excinfo.value.read().decode("utf-8"))
        assert set(body) == {"error"}
        assert set(body["error"]) == {"code", "message"}
