#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The quick-filter route and what a search says it matched on (FLW-4, FLW-5).

``POST /api/v1/library/facets`` takes the same filter body the browse route
does and answers for that view: keys in Camelot order with counts, the BPM
range, the genres. A search row says whether it matched on its key or its tempo
rather than its words, so "8A" is never a mystery.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.library_api import matched_on
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container
from tests.unit.key_support import accept_with_key

TOKEN = "quick-filter-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _request(base: str, path: str, body=None, method="POST"):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


@pytest.fixture
def library_db(tmp_path, monkeypatch):
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
def engine(library_db):
    from cuepoint.services.interfaces import IDatabaseService, ITrackRepository
    from cuepoint.utils.di_container import get_container

    repo = get_container().resolve(ITrackRepository)
    for track_id, title, genre, bpm in (
        ("1", "Strobe", "House", 128.0),
        ("2", "Ghosts", "House", 124.0),
        ("3", "Rej", "Techno", 122.5),
        ("4", "Opus", None, None),
    ):
        repo.add(
            LibraryTrack(
                rekordbox_track_id=track_id,
                file_path=f"/music/{track_id}.mp3",
                title=title,
                artist="Artist",
                genre=genre,
                bpm=bpm,
            )
        )
    database = get_container().resolve(IDatabaseService)
    by_rekordbox = {t.rekordbox_track_id: t.id for t in repo.browse(limit=10)}
    accept_with_key(database, by_rekordbox["1"], "A Minor")
    accept_with_key(database, by_rekordbox["2"], "9A")

    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


@pytest.mark.unit
class TestQuickFacetsRoute:
    def test_it_answers_for_the_library(self, engine):
        status, payload = _request(engine, "/api/v1/library/facets", {})
        assert status == 200
        assert payload["keys"] == [
            {"value": "8A", "count": 1},
            {"value": "9A", "count": 1},
        ]
        assert payload["no_key"] == 2
        assert payload["bpm"] == {"min": 122.5, "max": 128.0, "missing": 1}
        assert [g["value"] for g in payload["genres"]] == ["House", "Techno"]
        assert payload["genres_truncated"] is False

    def test_it_takes_the_browse_routes_filter_body(self, engine):
        body = {
            "q": "",
            "filters": {
                "match": "all",
                "rules": [{"field": "genre", "operator": "is", "value": "House"}],
            },
        }
        _, payload = _request(engine, "/api/v1/library/facets", body)
        assert payload["no_key"] == 0
        assert payload["bpm"]["min"] == 124.0

    def test_a_bad_filter_is_a_400_that_names_the_clause(self, engine):
        body = {"filters": {"rules": [{"field": "vibe", "operator": "is", "value": 1}]}}
        status, payload = _request(engine, "/api/v1/library/facets", body)
        assert status == 400
        assert "vibe" in payload["error"]["message"]

    def test_a_body_that_is_not_an_object_is_a_400(self, engine):
        status, _ = _request(engine, "/api/v1/library/facets", [1, 2])
        assert status == 400

    def test_it_needs_the_token(self, engine):
        req = urllib.request.Request(
            f"{engine}/api/v1/library/facets", data=b"{}", method="POST"
        )
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(req, timeout=5)
        assert exc.value.code == 401

    def test_the_one_field_get_route_still_answers(self, engine):
        req = urllib.request.Request(
            f"{engine}/api/v1/library/facets?field=genre",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            assert json.loads(resp.read())["field"] == "genre"


@pytest.mark.unit
class TestRowsSayWhatTheyMatchedOn:
    def search(self, engine, text):
        req = urllib.request.Request(
            f"{engine}/api/v1/library/search?mode=browse&q={text}",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())["tracks"]

    def test_a_key_search_says_key(self, engine):
        rows = self.search(engine, "Am")
        assert [(r["title"], r["matched_on"], r["effective_key"]) for r in rows] == [
            ("Strobe", "key", "8A")
        ]

    def test_a_tempo_search_says_bpm(self, engine):
        rows = self.search(engine, "124")
        assert [(r["title"], r["matched_on"]) for r in rows] == [("Ghosts", "bpm")]

    def test_a_words_search_says_nothing_special(self, engine):
        rows = self.search(engine, "Strobe")
        assert [(r["title"], r["matched_on"]) for r in rows] == [("Strobe", None)]

    def test_global_search_carries_it_too(self, engine):
        req = urllib.request.Request(
            f"{engine}/api/v1/library/search?q=9A",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            rows = json.loads(resp.read())["tracks"]
        assert [(r["title"], r["matched_on"]) for r in rows] == [("Ghosts", "key")]


class TestMatchedOn:
    ROW = {
        "title": "Strobe",
        "artist": "deadmau5",
        "album": None,
        "effective_label": "mau5trap",
        "effective_key": "8A",
        "effective_bpm": 124.0,
    }

    def test_words_win_over_a_key_or_a_tempo(
        self,
    ):
        assert matched_on("strobe", self.ROW) is None
        assert matched_on("124", {**self.ROW, "title": "124 Days"}) is None

    def test_a_blank_query_matched_on_nothing(self):
        assert matched_on("", self.ROW) is None
        assert matched_on("   ", self.ROW) is None

    def test_a_key_in_any_notation(self):
        assert matched_on("8a", self.ROW) == "key"
        assert matched_on("A minor", self.ROW) == "key"
        assert matched_on("9A", self.ROW) is None

    def test_a_tempo_rounds_to_a_whole_number(self):
        assert matched_on("124", self.ROW) == "bpm"
        assert matched_on("124", {**self.ROW, "effective_bpm": 124.49}) == "bpm"
        assert matched_on("124", {**self.ROW, "effective_bpm": 124.5}) is None
