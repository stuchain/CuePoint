"""The plays route over the wire (STATS-02).

A real engine on a loopback port over the library ``test_statistics_plays`` builds
(four reads, three refreshes among them): the route's shape, its defaults, the
date and the read it can be asked since, the scopes, and every refusal: a
parameter it does not take, a value it cannot read, a Collection or playlist or
read that is not there, a library that cannot be reached, and no token.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from typing import Any

import pytest

from cuepoint.engine import server as server_module
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.engine.statistics_api import (
    GET_PATHS,
    INVALID_REQUEST,
    NOT_FOUND,
    PLAYS_PATH,
    PREFIX,
    REFUSAL_CODES,
    UNAVAILABLE,
    handles_get,
)
from cuepoint.services.interfaces import IStatisticsService
from cuepoint.utils.di_container import get_container, reset_container
from tests.unit.services.test_statistics_plays import World, build_world, scope_of

pytestmark = pytest.mark.unit

TOKEN = "statistics-test-token"

#: The keys of the answer, and of each row in it.
ANSWER_KEYS = {
    "since",
    "since_clamped",
    "history_from",
    "last_read",
    "tracks",
    "artists",
    "labels",
    "never_played",
    "unknown",
}


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Engine:
    def __init__(self, base: str, world: World) -> None:
        self.base = base
        self.world = world

    def get(self, query: str = "", *, token: str | None = TOKEN) -> tuple[int, Any]:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        request = urllib.request.Request(
            f"{self.base}{PLAYS_PATH}{query}", headers=headers
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))


@pytest.fixture
def reports(monkeypatch):
    """The failures the engine would have sent to Sentry."""
    seen: list[BaseException] = []

    def record(exc, route=None):
        seen.append(exc)
        return None

    monkeypatch.setattr(server_module, "report_unexpected", record)
    return seen


@pytest.fixture
def engine(tmp_path, reports):
    world = build_world(tmp_path)
    reset_container()
    get_container().register_singleton(IStatisticsService, world.statistics)
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield Engine(f"http://127.0.0.1:{port}", world)
    finally:
        server.shutdown()
        thread.join(timeout=2)
        reset_container()
        world.db.close_all()


def test_the_module_answers_exactly_its_one_route():
    assert PLAYS_PATH == "/api/v1/statistics/plays"
    assert PREFIX == "/api/v1/statistics/"
    assert GET_PATHS == (PLAYS_PATH,)
    assert handles_get(PLAYS_PATH)
    assert not handles_get(PLAYS_PATH + "/")
    assert not handles_get(PREFIX.rstrip("/"))
    assert not handles_get("/api/v1/statistics/spreads")


def test_the_route_needs_the_token(engine):
    assert engine.get(token=None)[0] == 401
    status, payload = engine.get(token="not-the-token")
    assert status == 401
    assert payload["error"]["code"] == "UNAUTHORIZED"


class TestTheAnswer:
    def test_it_has_the_documented_shape(self, engine):
        status, payload = engine.get()

        assert status == 200
        assert set(payload) == ANSWER_KEYS
        assert set(payload["tracks"][0]) == {"id", "title", "artist", "plays"}
        assert set(payload["artists"][0]) == {
            "name",
            "name_key",
            "plays",
            "tracks",
            "rules",
            "opens_more",
        }
        assert set(payload["labels"][0]) == {
            "name",
            "label_key",
            "plays",
            "tracks",
            "rules",
            "opens_more",
        }
        assert (
            set(payload["never_played"])
            == set(payload["unknown"])
            == {"count", "rules"}
        )
        assert payload["artists"][0]["rules"]["match"] == "all"

    def test_it_defaults_to_ten_rows_all_time_over_the_whole_library(self, engine):
        status, payload = engine.get()

        assert status == 200
        assert payload["since"] is None
        assert len(payload["tracks"]) == 9  # every played track, under the ten
        assert payload["tracks"][0]["plays"] == 20

    def test_a_limit_is_taken(self, engine):
        _, payload = engine.get("?limit=25")

        assert len(payload["tracks"]) == 9

    def test_since_a_date_with_the_offset(self, engine):
        status, payload = engine.get("?since=2026-03-10&tz=-10:00")

        assert status == 200
        assert payload["since"] == "2026-03-10"
        assert [t["title"] for t in payload["tracks"]][:2] == ["Alpha", "echo"]
        assert payload["tracks"][0]["plays"] == 6

    def test_a_plus_sign_the_query_decoded_to_a_space_is_still_a_plus(self, engine):
        # `+03:00` unescaped in a query string arrives as " 03:00".
        status, payload = engine.get("?since=2026-03-10&tz=+12:00")

        assert status == 200
        assert payload["tracks"][0]["plays"] == 6

    def test_an_escaped_plus_sign_is_taken(self, engine):
        status, _ = engine.get("?since=2026-03-10&tz=%2B12:00")

        assert status == 200

    def test_since_a_read(self, engine):
        last = engine.world.reads[-1]

        status, payload = engine.get(f"?since_read={last}")

        assert status == 200
        assert payload["since"] is None
        assert [t["title"] for t in payload["tracks"]] == [
            "Alpha",
            "echo",
            "Foxtrot",
            "Charlie",
            "Golf",
        ]

    def test_a_collection_scope(self, engine):
        scope = scope_of(engine.world, "collection")

        status, payload = engine.get(f"?scope=collection:{scope.id}")

        assert status == 200
        assert [t["title"] for t in payload["tracks"]] == ["Alpha", "Foxtrot"]

    def test_a_playlist_scope(self, engine):
        status, payload = engine.get(f"?scope=playlist:{engine.world.playlist_id}")

        assert status == 200
        assert [t["title"] for t in payload["tracks"]] == ["Alpha", "Bravo"]

    def test_the_library_scope_by_name(self, engine):
        assert engine.get("?scope=library")[1] == engine.get()[1]


class TestRefusals:
    @pytest.mark.parametrize(
        "query, word",
        [
            ("?limit=7", "limit"),
            ("?limit=0", "limit"),
            ("?limit=ten", "limit"),
            ("?limit=10&limit=25", "limit"),
            ("?since=2026-13-01&tz=%2B00:00", "since"),
            ("?since=yesterday&tz=%2B00:00", "since"),
            ("?since=2026-3-1&tz=%2B00:00", "since"),
            ("?since=2026-03-10", "tz"),
            ("?tz=%2B03:00", "since"),
            ("?since=2026-03-10&tz=0300", "tz"),
            ("?since=2026-03-10&tz=%2B3", "tz"),
            ("?since=2026-03-10&tz=%2B24:00", "tz"),
            ("?since=0001-01-01&tz=%2B03:00", "since"),
            ("?since=1899-12-31&tz=%2B03:00", "since"),
            ("?since=9999-12-31&tz=-03:00", "since"),
            ("?since=%D9%A3%D9%A3%D9%A3%D9%A3-01-01&tz=%2B03:00", "since"),
            ("?since=2026-03-10&tz=%2B03:60", "tz"),
            ("?since=2026-03-10&tz=UTC", "tz"),
            ("?since_read=abc", "since_read"),
            ("?since_read=0", "since_read"),
            ("?since_read=-3", "since_read"),
            ("?since_read=1.5", "since_read"),
            ("?since=2026-03-10&tz=%2B00:00&since_read=1", "since_read"),
            ("?scope=everything", "scope"),
            ("?scope=collection", "scope"),
            ("?scope=collection:", "scope"),
            ("?scope=collection:abc", "scope"),
            ("?scope=collection:0", "scope"),
            ("?scope=playlist:-1", "scope"),
            ("?scope=set:1", "scope"),
            ("?scope=library:1", "scope"),
            ("?colour=blue", "colour"),
            ("?limit=10&top=5&sort=plays", "sort, top"),
        ],
    )
    def test_a_bad_parameter_is_invalid_and_named(self, engine, reports, query, word):
        status, payload = engine.get(query)

        assert status == 400, payload
        assert payload["error"]["code"] == INVALID_REQUEST
        assert word in payload["error"]["message"]
        assert reports == []

    @pytest.mark.parametrize(
        "query", ["?scope=collection:99999", "?scope=playlist:99999"]
    )
    def test_a_collection_or_playlist_that_is_not_there_is_not_found(
        self, engine, reports, query
    ):
        status, payload = engine.get(query)

        assert status == 404
        assert payload["error"]["code"] == NOT_FOUND
        assert reports == []

    def test_a_folder_is_not_a_collection(self, engine, reports):
        folder = engine.world.collections.create_folder("Crates")

        status, payload = engine.get(f"?scope=collection:{folder.id}")

        assert status == 404
        assert payload["error"]["code"] == NOT_FOUND
        assert reports == []

    def test_a_read_that_is_not_there_is_not_found(self, engine, reports):
        status, payload = engine.get(f"?since_read={engine.world.reads[-1] + 100}")

        assert status == 404
        assert payload["error"]["code"] == NOT_FOUND
        assert reports == []

    def test_a_smart_collection_that_cannot_run_is_invalid(self, engine, reports):
        scope = scope_of(engine.world, "smart")
        with engine.world.db.transaction() as conn:
            conn.execute(
                "UPDATE collections SET rules_json = ? WHERE id = ?",
                (
                    '{"match":"all","rules":[{"field":"gone","operator":"is"}]}',
                    scope.id,
                ),
            )

        status, payload = engine.get(f"?scope=collection:{scope.id}")

        assert status == 400
        assert payload["error"]["code"] == INVALID_REQUEST
        assert reports == []

    def test_a_library_that_cannot_be_reached_is_unavailable(self, engine, reports):
        reset_container()

        def unreachable():
            raise RuntimeError("database locked")

        get_container().register_factory(IStatisticsService, unreachable)

        status, payload = engine.get()

        assert status == 503
        assert payload["error"]["code"] == UNAVAILABLE
        assert reports == []

    def test_anything_else_is_a_500_and_is_reported(self, engine, reports, monkeypatch):
        def broken(**_kwargs):
            raise RuntimeError("the query failed")

        monkeypatch.setattr(engine.world.statistics, "plays", broken)

        status, payload = engine.get()

        assert status == 500
        assert payload["error"]["code"] == "STATISTICS_FAILED"
        assert len(reports) == 1


def test_every_refusal_code_is_declared():
    assert set(REFUSAL_CODES) == {INVALID_REQUEST, NOT_FOUND, UNAVAILABLE}
    assert UNAVAILABLE == "LIBRARY_UNAVAILABLE"
