"""The plays, spreads and health routes over the wire (STATS-02, STATS-03).

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
    HEALTH_PATH,
    INVALID_REQUEST,
    NOT_FOUND,
    PLAYS_PATH,
    PREFIX,
    REFUSAL_CODES,
    SPREADS_PATH,
    UNAVAILABLE,
    handles_get,
)
from cuepoint.services.interfaces import IStatisticsService
from cuepoint.utils.di_container import get_container, reset_container
from tests.unit.services.test_statistics_plays import World, build_world, scope_of
from tests.unit.services.test_statistics_spreads import build_spread_world

pytestmark = pytest.mark.unit

TOKEN = "statistics-test-token"

#: The keys of the answer, and of each row in it.
ANSWER_KEYS = {
    "since",
    "since_clamped",
    "history_from",
    "last_read",
    "last_read_id",
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

    def get(
        self, query: str = "", *, token: str | None = TOKEN, path: str = PLAYS_PATH
    ) -> tuple[int, Any]:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        request = urllib.request.Request(f"{self.base}{path}{query}", headers=headers)
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


def test_the_module_answers_exactly_its_three_routes():
    assert PLAYS_PATH == "/api/v1/statistics/plays"
    assert SPREADS_PATH == "/api/v1/statistics/spreads"
    assert HEALTH_PATH == "/api/v1/statistics/health"
    assert PREFIX == "/api/v1/statistics/"
    assert GET_PATHS == (PLAYS_PATH, SPREADS_PATH, HEALTH_PATH)
    for path in GET_PATHS:
        assert handles_get(path)
        assert not handles_get(path + "/")
    assert not handles_get(PREFIX.rstrip("/"))
    assert not handles_get("/api/v1/statistics/keys")


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


# ---------------------------------------------------------------- STATS-03


@pytest.fixture
def spread_engine(tmp_path, reports):
    """An engine over the nine-track library the spreads and health tests use."""
    world = build_spread_world(tmp_path)
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
        world.store.close_all()
        world.db.close_all()


ROUTES = pytest.mark.parametrize("path", [SPREADS_PATH, HEALTH_PATH])


class TestSpreadsAndHealth:
    @ROUTES
    def test_the_route_needs_the_token(self, spread_engine, path):
        assert spread_engine.get(token=None, path=path)[0] == 401

    def test_spreads_answers_the_six_fields(self, spread_engine):
        status, payload = spread_engine.get(path=SPREADS_PATH)

        assert status == 200
        assert set(payload) == {
            "scope",
            "total",
            "genre",
            "tempo",
            "year",
            "date_added",
            "rating",
            "loudness",
        }
        assert payload["scope"] == "library"
        assert payload["total"] == 9
        assert payload["genre"]["buckets"][0] == {
            "label": "HOUSE",
            "value": "HOUSE",
            "count": 3,
            "rules": {
                "match": "all",
                "rules": [{"field": "genre", "operator": "is", "value": "HOUSE"}],
            },
        }

    def test_health_answers_files_beatport_and_analysis(self, spread_engine):
        status, payload = spread_engine.get(path=HEALTH_PATH)

        assert status == 200
        assert set(payload) == {
            "scope",
            "total",
            "files",
            "beatport",
            "analyzed",
            "checked_at",
        }
        assert payload["files"]["present"]["count"] == 5
        assert payload["analyzed"]["analyzed"] == 2
        assert payload["checked_at"] == "2026-10-02T08:00:00+00:00"

    @ROUTES
    def test_a_scope_is_taken_and_echoed(self, spread_engine, path):
        scope = spread_engine.world.scope("collection")

        status, payload = spread_engine.get(f"?scope=collection:{scope.id}", path=path)

        assert status == 200
        assert payload["scope"] == f"collection:{scope.id}"
        assert payload["total"] == 4

    @ROUTES
    def test_a_playlist_scope(self, spread_engine, path):
        scope = f"playlist:{spread_engine.world.playlist_id}"

        status, payload = spread_engine.get(f"?scope={scope}", path=path)

        assert status == 200
        assert payload["scope"] == scope
        assert payload["total"] == 4

    @ROUTES
    def test_the_library_scope_by_name(self, spread_engine, path):
        assert (
            spread_engine.get("?scope=library", path=path)[1]
            == spread_engine.get(path=path)[1]
        )

    @ROUTES
    @pytest.mark.parametrize(
        "query, word",
        [
            ("?limit=10", "limit"),
            ("?since=2026-03-10", "since"),
            ("?colour=blue", "colour"),
            ("?scope=everything", "scope"),
            ("?scope=collection:0", "scope"),
            ("?scope=library&scope=library", "scope"),
        ],
    )
    def test_a_bad_parameter_is_invalid_and_named(
        self, spread_engine, reports, path, query, word
    ):
        status, payload = spread_engine.get(query, path=path)

        assert status == 400, payload
        assert payload["error"]["code"] == INVALID_REQUEST
        assert word in payload["error"]["message"]
        assert reports == []

    @ROUTES
    @pytest.mark.parametrize(
        "query", ["?scope=collection:99999", "?scope=playlist:99999"]
    )
    def test_a_scope_that_is_not_there_is_not_found(
        self, spread_engine, reports, path, query
    ):
        status, payload = spread_engine.get(query, path=path)

        assert status == 404
        assert payload["error"]["code"] == NOT_FOUND
        assert reports == []

    @ROUTES
    def test_a_smart_collection_that_cannot_run_is_invalid(
        self, spread_engine, reports, path
    ):
        scope = spread_engine.world.scope("smart")
        with spread_engine.world.db.transaction() as conn:
            conn.execute(
                "UPDATE collections SET rules_json = ? WHERE id = ?",
                (
                    '{"match":"all","rules":[{"field":"gone","operator":"is"}]}',
                    scope.id,
                ),
            )

        status, payload = spread_engine.get(f"?scope=collection:{scope.id}", path=path)

        assert status == 400
        assert payload["error"]["code"] == INVALID_REQUEST
        assert reports == []

    @ROUTES
    def test_a_library_that_cannot_be_reached_is_unavailable(
        self, spread_engine, reports, path
    ):
        reset_container()

        def unreachable():
            raise RuntimeError("database locked")

        get_container().register_factory(IStatisticsService, unreachable)

        status, payload = spread_engine.get(path=path)

        assert status == 503
        assert payload["error"]["code"] == UNAVAILABLE
        assert reports == []

    @pytest.mark.parametrize(
        "path, method", [(SPREADS_PATH, "spreads"), (HEALTH_PATH, "health")]
    )
    def test_anything_else_is_a_500_and_is_reported(
        self, spread_engine, reports, monkeypatch, path, method
    ):
        def broken(*_args, **_kwargs):
            raise RuntimeError("the query failed")

        monkeypatch.setattr(spread_engine.world.statistics, method, broken)

        status, payload = spread_engine.get(path=path)

        assert status == 500
        assert payload["error"]["code"] == "STATISTICS_FAILED"
        assert len(reports) == 1
