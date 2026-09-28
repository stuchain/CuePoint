#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Discover over HTTP (DISCOVER-09).

DISCOVER-04 to DISCOVER-08 test what each service decides. What only this
layer can get wrong, and so what is tested here, through a running engine over
a real library, the real job store and container, and DISCOVER-01's real
``BeatportApi`` talking to the in-memory Beatport of the service tests:

- **Every route answers its service's answer**, and every read echoes the
  window it answered, so a late response can be told from a current one.
- **Every refusal is typed.** A Beatport refusal arrives with its class, a busy
  job with the job to follow, a missing run or seed as its own code — and a
  refused start creates nothing.
- **A request is read strictly**: an unknown key or parameter, a parameter
  given twice, a number that is not one, is a 400 naming it, never a 500 and
  never silently ignored.
- **A push can name a run** and gets exactly the tracks its table shows.

No test reaches the network or reads the developer's configured token: the
container's ``BeatportApi`` is replaced with one over the in-memory Beatport,
and the configuration file is the suite's sandbox.
"""

from __future__ import annotations

import json
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from typing import Any, Callable, Dict, List, Optional, Tuple

import pytest

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION
from cuepoint.engine import discover_api as api
from cuepoint.engine.api_errors import bad_request
from cuepoint.engine.beatport_playlist_jobs import JOB_TYPE_BEATPORT_PLAYLIST
from cuepoint.engine.beatport_resolve_jobs import JOB_TYPE_BEATPORT_RESOLVE
from cuepoint.engine.discovery_jobs import JOB_TYPE_DISCOVERY
from cuepoint.engine.jobs import JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_api import LibraryUnavailableError
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError, ValidationError
from cuepoint.models.beatport_cache import CachedBeatportTrack
from cuepoint.models.discovery_run import DiscoveryRun
from cuepoint.models.filter_rule import FilterRuleError
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services import database_service as database_service_module
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.beatport_library import accept
from tests.fixtures.beatport_world import BeatportWorld
from tests.fixtures.job_settling import wait_until_settled
from tests.unit.services.test_discovery_service import LIBRARY, standard_world

pytestmark = pytest.mark.unit

TOKEN = "discover-api-token"
TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)

#: A run over the standard world's two chosen genres finds these seven tracks.
ASK = {"genre_ids": [5, 6], "new_releases_days": 30}
FOUND = {1, 2, 3, 4, 5, 7, 8}

#: What every Beatport table's row carries (DISCOVER-07's ``EntityTrackRow``).
TRACK_ROW = set(
    CachedBeatportTrack(
        beatport_track_id=1,
        title="t",
        url="https://www.beatport.com/track/t/1",
        fetched_at="x",
    ).to_dict()
) | {"artists", "remixers", "owned", "on_wantlist"}


# ------------------------------------------------------------------ helpers


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_until(
    predicate: Callable[[], bool], message: str, timeout: float = 30.0
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError(f"timed out waiting for {message}")


def resolve(name: str) -> Any:
    from cuepoint.services import interfaces

    return get_container().resolve(getattr(interfaces, name))


def call(
    base: str,
    method: str,
    path: str,
    body: Any = None,
    params: Optional[Any] = None,
    token: Optional[str] = TOKEN,
    raw: Optional[bytes] = None,
) -> Tuple[int, Dict[str, Any]]:
    """Make one request and return ``(status, payload)``, error or not.

    ``params`` is a mapping, or a list of pairs to send a parameter twice.
    """
    pairs = params.items() if isinstance(params, dict) else (params or [])
    query = urllib.parse.urlencode([(k, v) for k, v in pairs if v is not None])
    url = f"{base}{path}" + (f"?{query}" if query else "")
    data = (
        raw
        if raw is not None
        else (json.dumps(body).encode("utf-8") if method == "POST" else None)
    )
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def get(base: str, path: str, **params: Any) -> Tuple[int, Dict[str, Any]]:
    return call(base, "GET", path, params=params)


def post(base: str, path: str, body: Any = None) -> Tuple[int, Dict[str, Any]]:
    return call(base, "POST", path, {} if body is None else body)


def ok(result: Tuple[int, Dict[str, Any]], status: int = 200) -> Dict[str, Any]:
    assert result[0] == status, result
    return result[1]


def refused(
    result: Tuple[int, Dict[str, Any]], status: int, code: str, *words: str
) -> Dict[str, Any]:
    assert result[0] == status, result
    error = result[1]["error"]
    assert error["code"] == code, error
    for word in words:
        assert word in error["message"], error
    return error


def use_beatport(client: Any) -> None:
    get_container().register_factory(BeatportApi, lambda: BeatportApi(client))


def finished(store: JobStore, job_id: str) -> Any:
    wait_until(lambda: store.get(job_id).state in TERMINAL, f"job {job_id}")
    return store.get(job_id)


def blocking_job(store: JobStore, job_type: str) -> threading.Event:
    """A job of ``job_type`` that runs until the returned event is set."""
    release = threading.Event()
    store.create_job(
        job_type=job_type, runner=lambda _job: release.wait(30), exclusive=True
    )
    return release


def run_path(run_id: Any, suffix: str = "") -> str:
    return f"{api.PREFIX}runs/{run_id}{suffix}"


def ids_of(rows: List[Dict[str, Any]]) -> List[int]:
    return [row["beatport_track_id"] for row in rows]


def own(library_track_id: int, beatport_id: int) -> None:
    """Accept a Beatport match for a library track, so the library owns it."""
    with resolve("IDatabaseService").transaction() as conn:
        accept(conn, library_track_id, str(beatport_id))


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    """A sandboxed library database with services bootstrapped over it."""
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)
    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    resolve("IMigrationRunner").migrate()
    yield
    resolve("IDatabaseService").close_all()
    reset_container()


@pytest.fixture
def store(library_db) -> JobStore:
    job_store = JobStore(job_repository_provider=lambda: resolve("IJobRepository"))
    yield job_store
    wait_until_settled(job_store, "every job to finish")


@pytest.fixture
def engine(store):
    """A running engine over the test's job store."""
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=store
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


@pytest.fixture
def library(library_db) -> List[int]:
    """The discovery tests' library: three artists and two labels."""
    tracks = resolve("ITrackRepository")
    return [
        int(
            tracks.add(
                LibraryTrack(rekordbox_track_id=f"rb{i}", title=t, artist=a, label=lab)
            ).id
        )
        for i, (t, a, lab) in enumerate(LIBRARY, start=1)
    ]


@pytest.fixture
def world(library) -> BeatportWorld:
    beatport = standard_world(date.today())
    use_beatport(beatport)
    return beatport


@pytest.fixture
def ran(engine, store, world) -> int:
    """A finished run over the standard world, started over the wire."""
    job = ok(post(engine, api.RUN_START_PATH, ASK), 202)
    assert finished(store, job["id"]).state is JobState.SUCCEEDED
    return int(store.get(job["id"]).result["id"])


# ------------------------------------------------------------------ the routes


GET_PATHS = [
    api.OPTIONS_PATH,
    api.RUNS_PATH,
    run_path(1),
    run_path(1, "/tracks"),
    api.WANTLIST_PATH,
    api.ENTITY_PATH,
    api.ENTITY_BEATPORT_PATH,
    api.SIMILAR_PATH,
]
POST_PATHS = [
    api.RUN_START_PATH,
    run_path(1, "/delete"),
    api.WANTLIST_ADD_PATH,
    api.WANTLIST_REMOVE_PATH,
    api.WANTLIST_NOTE_PATH,
    api.WANTLIST_BOUGHT_PATH,
    api.PLAYLIST_START_PATH,
    api.RESOLVE_START_PATH,
]


class TestTheRoutes:
    def test_every_route_lives_under_its_own_prefix_and_none_is_incrate(self):
        for path in (*api.GET_PATHS, *api.POST_PATHS):
            assert path.startswith("/api/v1/discover/"), path
            assert "incrate" not in path, path

    def test_the_list_of_paths_is_the_one_tested_here(self):
        concrete = {p.replace("/runs/1", "/runs/{id}") for p in GET_PATHS}
        assert concrete == set(api.GET_PATHS)
        concrete = {p.replace("/runs/1", "/runs/{id}") for p in POST_PATHS}
        assert concrete == set(api.POST_PATHS)

    @pytest.mark.parametrize("path", GET_PATHS)
    def test_every_read_needs_the_engine_token(self, engine, path):
        refused(call(engine, "GET", path, token=None), 401, "UNAUTHORIZED")

    @pytest.mark.parametrize("path", POST_PATHS)
    def test_every_action_needs_the_engine_token(self, engine, path):
        refused(call(engine, "POST", path, {}, token=None), 401, "UNAUTHORIZED")

    def test_an_unknown_path_under_the_prefix_is_not_found(self, engine):
        refused(get(engine, api.PREFIX + "nothing"), 404, "NOT_FOUND")
        refused(post(engine, api.PREFIX + "nothing"), 404, "NOT_FOUND")

    def test_a_read_is_not_an_action_and_an_action_is_not_a_read(self, engine):
        refused(post(engine, api.OPTIONS_PATH), 404, "NOT_FOUND")
        refused(get(engine, api.WANTLIST_ADD_PATH), 404, "NOT_FOUND")
        # ``runs/start`` read as a run: its id is refused, not guessed at.
        refused(get(engine, api.RUN_START_PATH), 400, "INVALID_REQUEST", "'start'")

    def test_incrates_retired_routes_are_not_taken_over(self):
        # They retired in DISCOVER-12 and answer 404 as any unknown path does
        # (test_retired_incrate.py); Discover does not answer them instead.
        for path in (
            "/api/v1/incrate/discover/options",
            "/api/v1/incrate/inventory",
            "/api/v1/incrate/discover",
            "/api/v1/incrate/playlist",
        ):
            assert not api.handles_get(path) and not api.handles_post(path)

    def test_a_body_that_is_not_an_object_is_refused(self, engine):
        refused(
            call(engine, "POST", api.WANTLIST_REMOVE_PATH, raw=b"[1, 2]"),
            400,
            "INVALID_REQUEST",
            "object",
        )
        refused(
            call(engine, "POST", api.WANTLIST_REMOVE_PATH, raw=b"{nope"),
            400,
            "INVALID_REQUEST",
            "JSON",
        )

    def test_a_parameter_given_twice_is_refused(self, engine, library):
        result = call(
            engine,
            "GET",
            api.RUNS_PATH,
            params=[("limit", "5"), ("limit", "6")],
        )
        refused(result, 400, "INVALID_REQUEST", "once")


# ------------------------------------------------------------------ options


class TestOptions:
    def test_what_a_new_run_panel_starts_from(self, engine, world, library):
        answer = ok(get(engine, api.OPTIONS_PATH))
        assert answer["beatport"] == {
            "configured": True,
            "state": "ok",
            "message": None,
            "retry_after": None,
        }
        # Sorted by name for a picker, each with its id and slug.
        assert answer["genres"] == [
            {"id": 12, "name": "Deep House", "slug": "deep-house"},
            {"id": 5, "name": "House", "slug": "house"},
            {
                "id": 6,
                "name": "Techno (Peak Time / Driving)",
                "slug": "techno-peak-time-driving",
            },
        ]
        artists = {v["value"]: v["count"] for v in answer["artists"]["values"]}
        assert artists == {"Mara Veil": 1, "DJEFF": 1, "Kiko": 1}
        assert answer["artists"]["field"] == "artist_name"
        assert answer["labels"]["field"] == "label_name"
        assert sum(v["count"] for v in answer["labels"]["values"]) == 3
        defaults = answer["defaults"]
        assert defaults["genre_ids"] == []
        assert defaults["new_releases_days"] == 30
        assert date.fromisoformat(defaults["charts_to"]) == date.today()
        assert (
            date.fromisoformat(defaults["charts_to"])
            - date.fromisoformat(defaults["charts_from"])
        ).days == 30
        assert defaults["playlist_name"]
        assert answer["limits"]["max_run_window"] == 500
        assert answer["limits"]["max_similar"] == 200
        assert answer["resolve"] == {"owned": 0, "to_read": 0}

    def test_it_says_whether_the_name_index_is_current(self, engine, world, library):
        # Tracks written straight through the repository, as here, are indexed
        # but no rebuild has recorded the running rule: the facets may be
        # short, and the panel says so as the entity pages do.
        assert ok(get(engine, api.OPTIONS_PATH))["index_current"] is False
        resolve("ITrackCreditRepository").mark_built(
            ENTITY_NAMES_VERSION, "2026-09-26T10:00:00+00:00"
        )
        assert ok(get(engine, api.OPTIONS_PATH))["index_current"] is True

    def test_it_counts_what_a_resolve_would_read(self, engine, world, library):
        own(library[0], 3)
        own(library[1], 4)
        assert ok(get(engine, api.OPTIONS_PATH))["resolve"] == {
            "owned": 2,
            "to_read": 2,
        }

    def test_without_a_token_it_says_so_and_still_answers(self, engine, library):
        use_beatport(BeatportWorld(access_token=""))
        answer = ok(get(engine, api.OPTIONS_PATH))
        assert answer["beatport"]["configured"] is False
        assert answer["beatport"]["state"] == "no_token"
        assert answer["genres"] == []
        # The library half never needed Beatport.
        assert {v["value"] for v in answer["artists"]["values"]} == {
            "Mara Veil",
            "DJEFF",
            "Kiko",
        }

    @pytest.mark.parametrize(
        "status, state",
        [
            (401, "rejected"),
            (403, "forbidden"),
            (429, "rate_limited"),
            (500, "unavailable"),
        ],
    )
    def test_a_token_beatport_refuses_is_a_state(
        self, engine, world, library, status, state
    ):
        world.failures.append(lambda route, params, n: status)
        answer = ok(get(engine, api.OPTIONS_PATH))
        assert answer["beatport"]["configured"] is True
        assert answer["beatport"]["state"] == state
        assert answer["beatport"]["message"]
        assert answer["genres"] == []

    def test_every_genre_is_read_however_many_pages(self, engine, world, library):
        world.genres = [(i, f"Genre {i:03d}", f"genre-{i}") for i in range(1, 251)]
        answer = ok(get(engine, api.OPTIONS_PATH))
        assert [g["id"] for g in answer["genres"]] == list(range(1, 251))
        assert world.paths("catalog/genres") == ["catalog/genres"] * 3

    def test_a_genre_beatport_wrote_badly_is_left_out(self, engine, world, library):
        world.genres = [
            (0, "Zero", "zero"),
            (7, "", "blank"),
            (8, "Eight", "Not A Slug"),
        ]
        answer = ok(get(engine, api.OPTIONS_PATH))
        assert answer["genres"] == [{"id": 8, "name": "Eight", "slug": ""}]

    def test_it_takes_no_parameters(self, engine, world):
        refused(get(engine, api.OPTIONS_PATH, x="1"), 400, "INVALID_REQUEST", "x")


# ------------------------------------------------------------------ runs


class TestStartingARun:
    def test_it_answers_the_job_to_follow(self, engine, store, world):
        job = ok(post(engine, api.RUN_START_PATH, ASK), 202)
        assert job["type"] == JOB_TYPE_DISCOVERY
        assert job["state"] in ("queued", "running", "succeeded")
        done = finished(store, job["id"])
        assert done.state is JobState.SUCCEEDED
        assert done.result["tracks_found"] == len(FOUND)

    def test_every_field_is_carried_to_the_run(self, engine, store, world):
        today = date.today()
        body = {
            "genre_ids": [5],
            "charts_from": (today.replace(day=1)).isoformat(),
            "charts_to": today.isoformat(),
            "new_releases_days": 7,
            "artists": ["Mara Veil"],
            "labels": [],
        }
        job = ok(post(engine, api.RUN_START_PATH, body), 202)
        run_id = finished(store, job["id"]).result["id"]
        params = ok(get(engine, run_path(run_id)))["run"]["params"]
        assert params["genre_ids"] == [5]
        assert (params["charts_from"], params["charts_to"]) == (
            body["charts_from"],
            body["charts_to"],
        )
        assert params["new_releases_days"] == 7
        assert params["artists"] == {
            "picked": ["Mara Veil"],
            "count": 1,
            "linked_ids": 0,
        }
        assert params["labels"] == {"picked": [], "count": 0, "linked_ids": 0}

    def test_without_a_token_it_is_refused_as_a_value_and_starts_nothing(
        self, engine, store, library
    ):
        use_beatport(BeatportWorld(access_token=""))
        error = refused(post(engine, api.RUN_START_PATH, ASK), 409, "BEATPORT_REFUSED")
        assert error["reason"] == "no_token"
        assert error["retry_after"] is None
        assert store.list_all() == []
        assert resolve("IDiscoveryRepository").list_runs() == []

    @pytest.mark.parametrize(
        "body, words",
        [
            ({"genre_ids": [5], "days": 3}, "Unknown field days"),
            ({"genre_ids": "5"}, "genre_ids must be a list"),
            ({"genre_ids": [5], "charts_from": "yesterday"}, "YYYY-MM-DD"),
            ({"genre_ids": [5], "charts_from": "2026-02-30"}, "not a date"),
            ({"genre_ids": [5], "new_releases_days": 0}, "new_releases_days"),
            ({"genre_ids": [5], "new_releases_days": True}, "whole number"),
            ({"genre_ids": [-1]}, "genre id"),
            ({"genre_ids": [5], "artists": [3]}, "text"),
            ({"genre_ids": [5], "artists": "Kiko"}, "must be a list"),
        ],
    )
    def test_a_request_it_cannot_use_is_refused_and_starts_nothing(
        self, engine, store, world, body, words
    ):
        refused(post(engine, api.RUN_START_PATH, body), 400, "INVALID_REQUEST", words)
        assert store.list_all() == []

    def test_a_second_run_waits_for_nothing_but_is_refused_while_one_runs(
        self, engine, store, world
    ):
        release = blocking_job(store, JOB_TYPE_DISCOVERY)
        try:
            error = refused(post(engine, api.RUN_START_PATH, ASK), 409, "DISCOVER_BUSY")
            running = [j for j in store.list_all() if j.type == JOB_TYPE_DISCOVERY]
            assert error["job_id"] == running[0].id
            assert error["job_type"] == JOB_TYPE_DISCOVERY
        finally:
            release.set()


class TestReadingRuns:
    def test_the_list_is_newest_first_with_its_total(self, engine, store, ran):
        second = ok(post(engine, api.RUN_START_PATH, ASK), 202)
        second_id = finished(store, second["id"]).result["id"]
        answer = ok(get(engine, api.RUNS_PATH))
        assert [r["id"] for r in answer["runs"]] == [second_id, ran]
        assert (answer["total"], answer["limit"], answer["offset"]) == (2, 50, 0)
        page = ok(get(engine, api.RUNS_PATH, limit=1, offset=1))
        assert [r["id"] for r in page["runs"]] == [ran]
        assert page["total"] == 2

    def test_a_run_in_the_list_says_what_it_asked_without_its_names(self, engine, ran):
        (run,) = ok(get(engine, api.RUNS_PATH))["runs"]
        assert run["outcome"] == "succeeded" and run["running"] is False
        assert run["tracks_found"] == len(FOUND)
        assert run["params"]["genre_ids"] == [5, 6]
        assert run["params"]["artists"] == {
            "picked": None,
            "count": 3,
            "linked_ids": 0,
        }
        assert "params_json" not in run
        assert "scope" not in run["params"]["artists"]

    def test_the_header_adds_the_names_the_scope_resolved_to(self, engine, ran):
        header = ok(get(engine, run_path(ran)))
        assert header["run"]["id"] == ran
        assert {a["name"] for a in header["artists"]} == {"Mara Veil", "DJEFF", "Kiko"}
        assert all(set(a) == {"key", "name"} for a in header["artists"])
        # "Nightfall Audio" and "NIGHTFALL-AUDIO" are one label (DISCOVER-03).
        assert {lab["key"] for lab in header["labels"]} == {
            "nightfall audio",
            "cold room",
        }

    def test_a_run_still_running_says_so(self, engine, library):
        run = resolve("IDiscoveryRepository").start_run(
            DiscoveryRun(started_at="2026-09-26T10:00:00+00:00", params_json="{}")
        )
        header = ok(get(engine, run_path(run.id)))
        assert header["run"]["running"] is True
        assert header["run"]["outcome"] is None
        # A run recorded with nothing in its parameters reads as empty ones.
        assert header["run"]["params"]["artists"] == {
            "picked": None,
            "count": 0,
            "linked_ids": 0,
        }
        assert header["artists"] == [] and header["labels"] == []

    @pytest.mark.parametrize(
        "params, words",
        [
            ({"limit": 0}, "limit"),
            ({"limit": 201}, "limit"),
            ({"limit": "ten"}, "whole number"),
            ({"offset": -1}, "whole number"),
            ({"page": 2}, "Unknown parameter page"),
        ],
    )
    def test_a_list_window_it_cannot_answer_is_refused(
        self, engine, library, params, words
    ):
        refused(get(engine, api.RUNS_PATH, **params), 400, "INVALID_REQUEST", words)

    def test_a_run_that_is_not_there(self, engine, library):
        refused(get(engine, run_path(999)), 404, "DISCOVERY_RUN_NOT_FOUND", "999")
        refused(get(engine, run_path(999, "/tracks")), 404, "DISCOVERY_RUN_NOT_FOUND")

    @pytest.mark.parametrize("bad", ["abc", "0", "007", "-3", "99999999999999999999"])
    def test_a_run_id_that_is_not_one(self, engine, library, bad):
        refused(get(engine, run_path(bad)), 400, "INVALID_REQUEST", "run id")


class TestARunsTracks:
    def test_a_window_of_what_it_found_with_every_reason(self, engine, ran):
        page = ok(get(engine, run_path(ran, "/tracks")))
        assert page["run_id"] == ran
        assert set(ids_of(page["rows"])) == FOUND
        assert (page["total"], page["tracks"], page["owned"], page["hidden"]) == (
            7,
            7,
            0,
            0,
        )
        assert page["window"] == {
            "owned": "hide",
            "sort": "position",
            "dir": "asc",
            "offset": 0,
            "limit": 100,
        }
        row = next(r for r in page["rows"] if r["beatport_track_id"] == 3)
        assert set(row) == TRACK_ROW | {"position", "sources"}
        assert {s["matched_on"] for s in row["sources"]} == {"Mara Veil", "DJEFF"}
        assert all(
            set(s)
            == {"source_type", "source_id", "source_name", "source_url", "matched_on"}
            for s in row["sources"]
        )
        assert [r["position"] for r in page["rows"]] == list(range(7))

    def test_owned_tracks_are_hidden_counted_and_shown_when_asked(
        self, engine, ran, library
    ):
        own(library[0], 3)
        hidden = ok(get(engine, run_path(ran, "/tracks")))
        assert 3 not in ids_of(hidden["rows"])
        assert (hidden["total"], hidden["owned"], hidden["hidden"]) == (6, 1, 1)
        only = ok(get(engine, run_path(ran, "/tracks"), owned="only"))
        assert ids_of(only["rows"]) == [3]
        assert only["rows"][0]["owned"] is True and only["hidden"] == 0
        every = ok(get(engine, run_path(ran, "/tracks"), owned="all"))
        assert set(ids_of(every["rows"])) == FOUND

    def test_sorted_and_windowed_as_asked(self, engine, ran):
        whole = ok(get(engine, run_path(ran, "/tracks"), sort="title", dir="desc"))
        titles = [r["title"] for r in whole["rows"]]
        assert titles == sorted(titles, reverse=True)
        window = ok(
            get(
                engine,
                run_path(ran, "/tracks"),
                sort="title",
                dir="desc",
                offset=2,
                limit=3,
            )
        )
        assert ids_of(window["rows"]) == ids_of(whole["rows"])[2:5]
        assert window["window"]["dir"] == "desc" and window["total"] == 7

    @pytest.mark.parametrize(
        "params, words",
        [
            ({"owned": "some"}, "owned"),
            ({"sort": "bpm"}, "sort"),
            ({"dir": "up"}, "dir"),
            ({"limit": 501}, "limit"),
            ({"limit": 0}, "limit"),
            ({"offset": "x"}, "whole number"),
            ({"bought": "only"}, "Unknown parameter bought"),
        ],
    )
    def test_a_window_it_cannot_answer_is_refused(self, engine, ran, params, words):
        refused(
            get(engine, run_path(ran, "/tracks"), **params),
            400,
            "INVALID_REQUEST",
            words,
        )


class TestDeletingARun:
    def test_it_goes_with_its_tracks_and_the_catalog_stays(self, engine, ran):
        assert ok(post(engine, run_path(ran, "/delete"))) == {
            "id": ran,
            "deleted": True,
        }
        refused(get(engine, run_path(ran)), 404, "DISCOVERY_RUN_NOT_FOUND")
        assert ok(get(engine, api.RUNS_PATH))["total"] == 0
        assert len(resolve("IBeatportCatalogRepository").get_tracks(list(FOUND))) == 7

    def test_a_run_that_is_not_there(self, engine, library):
        refused(post(engine, run_path(5, "/delete")), 404, "DISCOVERY_RUN_NOT_FOUND")

    def test_a_running_run_is_refused_until_it_ends(self, engine, library):
        run = resolve("IDiscoveryRepository").start_run(
            DiscoveryRun(started_at="2026-09-26T10:00:00+00:00", params_json="{}")
        )
        refused(
            post(engine, run_path(run.id, "/delete")),
            409,
            "DISCOVERY_RUN_RUNNING",
            "still running",
        )
        assert resolve("IDiscoveryRepository").get_run(run.id) is not None

    def test_it_takes_no_fields(self, engine, ran):
        refused(
            post(engine, run_path(ran, "/delete"), {"force": True}),
            400,
            "INVALID_REQUEST",
            "Unknown field force",
        )


# ------------------------------------------------------------------ wantlist


class TestTheWantlist:
    def test_an_add_from_a_run_shows_on_the_list_and_on_the_run(self, engine, ran):
        change = ok(
            post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [3, 7], "run_id": ran})
        )
        assert change["action"] == "added"
        assert change["changed"] == [3, 7] and change["read_from_beatport"] == 0
        assert change["message"].startswith("Added 2 tracks")
        page = ok(get(engine, api.WANTLIST_PATH))
        assert set(ids_of(page["rows"])) == {3, 7}
        row = page["rows"][0]
        assert set(row) == TRACK_ROW | {
            "note",
            "added_at",
            "bought_at",
            "added_from_run_id",
        }
        assert row["on_wantlist"] is True and row["added_from_run_id"] == ran
        assert (page["total"], page["entries"], page["owned"], page["bought"]) == (
            2,
            2,
            0,
            0,
        )
        assert page["window"] == {
            "owned": "all",
            "bought": "all",
            "sort": "added_at",
            "dir": "desc",
            "offset": 0,
            "limit": 100,
        }
        marks = {
            r["beatport_track_id"]: r["on_wantlist"]
            for r in ok(get(engine, run_path(ran, "/tracks")))["rows"]
        }
        assert marks[3] and marks[7] and not marks[1]

    def test_adding_again_changes_nothing_and_says_so(self, engine, ran):
        post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [3]})
        change = ok(post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [3]}))
        assert (change["changed"], change["unchanged"]) == ([], [3])
        assert change["message"] == "Already on the wantlist"

    def test_a_track_not_cached_is_read_from_beatport(self, engine, world, library):
        change = ok(post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [9, 424242]}))
        assert change["changed"] == [9] and change["not_found"] == [424242]
        assert change["read_from_beatport"] == 1

    def test_a_read_without_a_token_is_refused_as_a_value_adding_nothing(
        self, engine, library
    ):
        use_beatport(BeatportWorld(access_token=""))
        error = refused(
            post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [9]}),
            409,
            "BEATPORT_REFUSED",
        )
        assert error["reason"] == "no_token"
        assert ok(get(engine, api.WANTLIST_PATH))["entries"] == 0

    @pytest.mark.parametrize(
        "status, reason, http",
        [
            (401, "rejected", 409),
            (403, "forbidden", 409),
            (429, "rate_limited", 429),
            (503, "unavailable", 502),
        ],
    )
    def test_a_read_beatport_refuses_arrives_with_its_class(
        self, engine, world, library, status, reason, http
    ):
        world.failures.append(lambda route, params, n: status)
        error = refused(
            post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [9]}),
            http,
            "BEATPORT_REFUSED",
        )
        assert error["reason"] == reason
        assert set(error) == {"code", "message", "reason", "retry_after"}

    def test_an_add_from_a_run_that_is_not_there(self, engine, ran):
        refused(
            post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [3], "run_id": 999}),
            404,
            "DISCOVERY_RUN_NOT_FOUND",
        )

    def test_an_add_from_a_run_that_did_not_find_it(self, engine, ran):
        refused(
            post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [9], "run_id": ran}),
            400,
            "INVALID_REQUEST",
            "did not find",
        )

    def test_remove_note_and_bought(self, engine, ran):
        post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [3, 7, 8]})
        noted = ok(
            post(engine, api.WANTLIST_NOTE_PATH, {"track_id": 3, "note": "  the dub  "})
        )
        assert noted["action"] == "noted" and noted["changed"] == [3]
        bought = ok(
            post(
                engine, api.WANTLIST_BOUGHT_PATH, {"track_ids": [3, 7], "bought": True}
            )
        )
        assert bought["action"] == "bought" and bought["changed"] == [3, 7]
        removed = ok(post(engine, api.WANTLIST_REMOVE_PATH, {"track_ids": [8, 1]}))
        assert (removed["changed"], removed["not_listed"]) == ([8], [1])
        rows = {
            r["beatport_track_id"]: r
            for r in ok(get(engine, api.WANTLIST_PATH))["rows"]
        }
        assert set(rows) == {3, 7}
        assert rows[3]["note"] == "the dub" and rows[3]["bought_at"]
        cleared = ok(
            post(engine, api.WANTLIST_NOTE_PATH, {"track_id": 3, "note": None})
        )
        assert cleared["message"].startswith("Cleared the note")
        unbought = ok(
            post(engine, api.WANTLIST_BOUGHT_PATH, {"track_ids": [7], "bought": False})
        )
        assert unbought["action"] == "unbought"
        rows = {
            r["beatport_track_id"]: r
            for r in ok(get(engine, api.WANTLIST_PATH))["rows"]
        }
        assert rows[3]["note"] is None and rows[7]["bought_at"] is None

    def test_the_filters_are_independent(self, engine, ran, library):
        post(engine, api.WANTLIST_ADD_PATH, {"track_ids": [3, 7, 8]})
        post(engine, api.WANTLIST_BOUGHT_PATH, {"track_ids": [3, 7], "bought": True})
        own(library[0], 3)
        # Bought and not owned yet: DEC-093's case.
        page = ok(get(engine, api.WANTLIST_PATH, bought="only", owned="hide"))
        assert ids_of(page["rows"]) == [7]
        assert (page["entries"], page["owned"], page["bought"]) == (3, 1, 2)
        assert page["window"]["bought"] == "only" and page["window"]["owned"] == "hide"
        by_title = ok(get(engine, api.WANTLIST_PATH, sort="title", dir="asc"))
        titles = [r["title"] for r in by_title["rows"]]
        assert titles == sorted(titles)

    @pytest.mark.parametrize(
        "path, body, words",
        [
            (api.WANTLIST_ADD_PATH, {}, "track_ids is required"),
            (api.WANTLIST_ADD_PATH, {"track_ids": 3}, "list"),
            (api.WANTLIST_ADD_PATH, {"track_ids": [True]}, "whole number"),
            (api.WANTLIST_ADD_PATH, {"track_ids": []}, "No Beatport tracks"),
            (api.WANTLIST_ADD_PATH, {"track_ids": [3], "run_id": "1"}, "run_id"),
            (
                api.WANTLIST_ADD_PATH,
                {"track_ids": [3], "note": "x"},
                "Unknown field note",
            ),
            (api.WANTLIST_REMOVE_PATH, {"track_ids": ["3"]}, "whole number"),
            (api.WANTLIST_NOTE_PATH, {"track_id": 3}, "note is required"),
            (api.WANTLIST_NOTE_PATH, {"note": "x"}, "track_id is required"),
            (api.WANTLIST_NOTE_PATH, {"track_id": 3, "note": 7}, "text or null"),
            (api.WANTLIST_NOTE_PATH, {"track_id": 3, "note": "x" * 1001}, "1000"),
            (api.WANTLIST_BOUGHT_PATH, {"track_ids": [3]}, "bought is required"),
            (
                api.WANTLIST_BOUGHT_PATH,
                {"track_ids": [3], "bought": 1},
                "true or false",
            ),
        ],
    )
    def test_a_change_it_cannot_make_is_refused(self, engine, ran, path, body, words):
        refused(post(engine, path, body), 400, "INVALID_REQUEST", words)

    @pytest.mark.parametrize(
        "params, words",
        [
            ({"owned": "no"}, "owned"),
            ({"bought": "yes"}, "bought"),
            ({"sort": "position"}, "sort"),
            ({"limit": 501}, "limit"),
        ],
    )
    def test_a_window_it_cannot_answer_is_refused(self, engine, library, params, words):
        refused(get(engine, api.WANTLIST_PATH, **params), 400, "INVALID_REQUEST", words)


# ------------------------------------------------------------------ pushes


class TestPushingAPlaylist:
    def test_by_ids_it_answers_the_job_and_the_job_pushes(
        self, engine, store, ran, world
    ):
        job = ok(
            post(
                engine, api.PLAYLIST_START_PATH, {"track_ids": [7, 3], "name": "Picks"}
            ),
            202,
        )
        assert job["type"] == JOB_TYPE_BEATPORT_PLAYLIST
        done = finished(store, job["id"])
        assert done.state is JobState.SUCCEEDED
        assert done.result["added"] == 2 and done.result["playlist_url"]
        (playlist,) = world.playlists.values()
        assert playlist == {"name": "Picks", "tracks": [7, 3]}

    def test_by_run_it_pushes_what_the_runs_table_shows(
        self, engine, store, ran, world, library
    ):
        own(library[0], 3)
        shown = ids_of(
            ok(get(engine, run_path(ran, "/tracks"), sort="title", dir="desc"))["rows"]
        )
        job = ok(
            post(
                engine,
                api.PLAYLIST_START_PATH,
                {"run_id": ran, "sort": "title", "dir": "desc"},
            ),
            202,
        )
        done = finished(store, job["id"])
        assert done.state is JobState.SUCCEEDED
        (playlist,) = world.playlists.values()
        assert playlist["tracks"] == shown and 3 not in shown
        assert done.result["requested"] == 6

    def test_by_run_with_owned_shown_the_owned_are_still_skipped(
        self, engine, store, ran, world, library
    ):
        own(library[0], 3)
        job = ok(
            post(engine, api.PLAYLIST_START_PATH, {"run_id": ran, "owned": "all"}), 202
        )
        done = finished(store, job["id"])
        assert (done.result["requested"], done.result["skipped_owned"]) == (7, 1)
        job = ok(
            post(
                engine,
                api.PLAYLIST_START_PATH,
                {"run_id": ran, "owned": "all", "include_owned": True},
            ),
            202,
        )
        assert finished(store, job["id"]).result["added"] == 7

    def test_a_run_showing_nothing_is_refused(self, engine, store, ran):
        refused(
            post(engine, api.PLAYLIST_START_PATH, {"run_id": ran, "owned": "only"}),
            400,
            "INVALID_REQUEST",
            "shows no tracks",
        )
        assert [
            j for j in store.list_all() if j.type == JOB_TYPE_BEATPORT_PLAYLIST
        ] == []

    def test_only_owned_tracks_is_refused_before_a_job(
        self, engine, store, ran, library
    ):
        own(library[0], 3)
        refused(
            post(engine, api.PLAYLIST_START_PATH, {"track_ids": [3]}),
            400,
            "INVALID_REQUEST",
            "already owns",
        )
        assert [
            j for j in store.list_all() if j.type == JOB_TYPE_BEATPORT_PLAYLIST
        ] == []

    def test_without_a_token_it_is_refused_as_a_value(self, engine, store, library):
        use_beatport(BeatportWorld(access_token=""))
        error = refused(
            post(engine, api.PLAYLIST_START_PATH, {"track_ids": [3]}),
            409,
            "BEATPORT_REFUSED",
        )
        assert error["reason"] == "no_token"
        assert store.list_all() == []

    def test_one_push_at_a_time(self, engine, store, ran):
        release = blocking_job(store, JOB_TYPE_BEATPORT_PLAYLIST)
        try:
            error = refused(
                post(engine, api.PLAYLIST_START_PATH, {"track_ids": [3]}),
                409,
                "DISCOVER_BUSY",
            )
            assert error["job_type"] == JOB_TYPE_BEATPORT_PLAYLIST
        finally:
            release.set()

    def test_a_run_that_is_not_there(self, engine, ran):
        refused(
            post(engine, api.PLAYLIST_START_PATH, {"run_id": 999}),
            404,
            "DISCOVERY_RUN_NOT_FOUND",
        )

    @pytest.mark.parametrize(
        "body, words",
        [
            ({}, "not both"),
            ({"track_ids": [3], "run_id": 1}, "not both"),
            ({"track_ids": [3], "owned": "all"}, "owned goes with run_id"),
            ({"track_ids": [3], "sort": "title"}, "sort goes with run_id"),
            ({"run_id": 0}, "positive"),
            ({"run_id": True}, "whole number"),
            ({"run_id": 1, "owned": "some"}, "owned must be one of"),
            ({"run_id": 1, "dir": "up"}, "dir must be one of"),
            ({"track_ids": [3], "name": 5}, "name must be text"),
            ({"track_ids": [3], "name": "x" * 201}, "200"),
            ({"track_ids": [3], "include_owned": "yes"}, "true or false"),
            ({"track_ids": [3], "public": True}, "Unknown field public"),
        ],
    )
    def test_a_push_it_cannot_make_is_refused(self, engine, store, ran, body, words):
        refused(
            post(engine, api.PLAYLIST_START_PATH, body), 400, "INVALID_REQUEST", words
        )
        assert [
            j for j in store.list_all() if j.type == JOB_TYPE_BEATPORT_PLAYLIST
        ] == []


class TestResolving:
    def test_it_answers_the_job_and_the_job_reads_what_options_counted(
        self, engine, store, world, library
    ):
        own(library[0], 3)
        own(library[1], 4)
        assert ok(get(engine, api.OPTIONS_PATH))["resolve"]["to_read"] == 2
        job = ok(post(engine, api.RESOLVE_START_PATH), 202)
        assert job["type"] == JOB_TYPE_BEATPORT_RESOLVE
        done = finished(store, job["id"])
        assert done.state is JobState.SUCCEEDED and done.result["resolved"] == 2
        assert ok(get(engine, api.OPTIONS_PATH))["resolve"] == {
            "owned": 2,
            "to_read": 0,
        }

    def test_an_empty_body_is_asking_for_nothing(self, engine, store, world):
        job = ok(call(engine, "POST", api.RESOLVE_START_PATH, raw=b""), 202)
        assert finished(store, job["id"]).state is JobState.SUCCEEDED

    def test_without_a_token_it_is_refused_as_a_value(self, engine, store, library):
        use_beatport(BeatportWorld(access_token=""))
        error = refused(post(engine, api.RESOLVE_START_PATH), 409, "BEATPORT_REFUSED")
        assert error["reason"] == "no_token" and store.list_all() == []

    def test_it_takes_no_fields(self, engine, store, world):
        refused(
            post(engine, api.RESOLVE_START_PATH, {"all": True}),
            400,
            "INVALID_REQUEST",
            "This request takes: nothing",
        )

    def test_one_resolve_at_a_time(self, engine, store, world):
        release = blocking_job(store, JOB_TYPE_BEATPORT_RESOLVE)
        try:
            refused(post(engine, api.RESOLVE_START_PATH), 409, "DISCOVER_BUSY")
        finally:
            release.set()


# ------------------------------------------------------------------ pages


class TestPages:
    def test_a_name_page_is_the_librarys_own_query(self, engine, world, library):
        page = ok(get(engine, api.ENTITY_PATH, kind="artist", ref="name:Mara Veil"))
        assert (page["kind"], page["ref"], page["identity"]) == (
            "artist",
            "name:mara veil",
            "name",
        )
        assert page["name"] == "Mara Veil" and page["redirected_from"] is None
        assert page["library"]["tracks"] == 1
        # The rules cross unchanged, and the Library's browse finds the same.
        browse = ok(
            get(
                engine,
                "/api/v1/library/search",
                mode="browse",
                filters=json.dumps(page["rules"]),
            )
        )
        assert browse["total"] == page["library"]["tracks"]

    def test_a_label_found_by_name_on_beatport(self, engine, world, library):
        half = ok(
            get(
                engine,
                api.ENTITY_BEATPORT_PATH,
                kind="label",
                ref="name:Nightfall Audio",
            )
        )
        assert half["state"] == "ok" and half["found_by_name"] is True
        assert half["beatport_id"] == 40211
        assert all(set(r) == TRACK_ROW for r in half["page"]["rows"])
        assert {7, 8} <= set(ids_of(half["page"]["rows"]))

    def test_an_artist_by_name_is_never_looked_up(self, engine, world, library):
        half = ok(get(engine, api.ENTITY_BEATPORT_PATH, kind="artist", ref="name:Kiko"))
        assert (half["state"], half["reason"]) == ("name_only", "not_resolved")
        assert world.requests == []

    def test_a_refusal_from_beatport_is_a_state_not_an_error(self, engine, library):
        use_beatport(BeatportWorld(access_token=""))
        half = ok(get(engine, api.ENTITY_BEATPORT_PATH, kind="label", ref="bp:40211"))
        assert (half["state"], half["action"]) == ("no_token", "settings")

    def test_the_window_and_refresh_are_read(self, engine, world, library):
        first = ok(
            get(
                engine,
                api.ENTITY_BEATPORT_PATH,
                kind="label",
                ref="bp:40211",
                limit=1,
                offset=1,
            )
        )
        assert len(first["page"]["rows"]) == 1 and first["from_cache"] is False
        again = ok(get(engine, api.ENTITY_BEATPORT_PATH, kind="label", ref="bp:40211"))
        assert again["from_cache"] is True
        fresh = ok(
            get(
                engine,
                api.ENTITY_BEATPORT_PATH,
                kind="label",
                ref="bp:40211",
                refresh="true",
            )
        )
        assert fresh["from_cache"] is False

    @pytest.mark.parametrize(
        "path, params, words",
        [
            (api.ENTITY_PATH, {"ref": "name:x"}, "kind is required"),
            (api.ENTITY_PATH, {"kind": "artist"}, "ref is required"),
            (api.ENTITY_PATH, {"kind": "band", "ref": "name:x"}, "kind"),
            (api.ENTITY_PATH, {"kind": "artist", "ref": "x"}, "bp:<id> or name:<key>"),
            (api.ENTITY_PATH, {"kind": "artist", "ref": "bp:007"}, "bp:<id>"),
            (
                api.ENTITY_PATH,
                {"kind": "artist", "ref": "name:x", "q": "y"},
                "Unknown parameter q",
            ),
            (
                api.ENTITY_BEATPORT_PATH,
                {"kind": "label", "ref": "bp:1", "refresh": "yes"},
                "true or false",
            ),
            (
                api.ENTITY_BEATPORT_PATH,
                {"kind": "label", "ref": "bp:1", "owned": "hidden"},
                "owned",
            ),
            (
                api.ENTITY_BEATPORT_PATH,
                {"kind": "label", "ref": "bp:1", "limit": 501},
                "limit",
            ),
        ],
    )
    def test_a_page_it_cannot_answer_is_refused(
        self, engine, world, library, path, params, words
    ):
        refused(get(engine, path, **params), 400, "INVALID_REQUEST", words)
        assert world.requests == []


# ------------------------------------------------------------------ similar


@pytest.fixture
def tempo_library(library_db) -> Dict[str, int]:
    """A seed and three candidates: one close, one near, one out of tempo."""
    tracks = resolve("ITrackRepository")

    def add(name: str, bpm: float, key: str, genre: str) -> int:
        return int(
            tracks.add(
                LibraryTrack(
                    rekordbox_track_id=name,
                    title=name,
                    artist=f"Artist {name}",
                    bpm=bpm,
                    key=key,
                    genre=genre,
                    file_path=f"/m/{name}.mp3",
                )
            ).id
        )

    return {
        "seed": add("seed", 128.0, "8A", "House"),
        "same": add("same", 128.0, "8A", "House"),
        "near": add("near", 126.0, "9A", "Techno"),
        "slow": add("slow", 90.0, "8A", "House"),
    }


class TestSimilarTracks:
    def test_suggestions_best_first_with_their_reasons(self, engine, tempo_library):
        t = tempo_library
        answer = ok(get(engine, api.SIMILAR_PATH, track_id=t["seed"]))
        assert answer["seed_id"] == t["seed"]
        assert [s["track_id"] for s in answer["suggestions"]] == [t["same"], t["near"]]
        best = answer["suggestions"][0]
        assert {r["component"] for r in best["reasons"]} == {"tempo", "key", "genre"}
        assert answer["considered"] == 2 and answer["unused"] == ["label"]
        assert ok(get(engine, api.SIMILAR_PATH, track_id=t["seed"])) == answer

    def test_the_limit(self, engine, tempo_library):
        answer = ok(
            get(engine, api.SIMILAR_PATH, track_id=tempo_library["seed"], limit=1)
        )
        assert [s["track_id"] for s in answer["suggestions"]] == [tempo_library["same"]]

    def test_the_librarys_scope_narrows_the_candidates(self, engine, tempo_library):
        t = tempo_library
        collections = resolve("ICollectionService")
        node = collections.create_collection("Only near")
        collections.add_tracks(int(node.id), [t["near"]])
        answer = ok(
            get(
                engine,
                api.SIMILAR_PATH,
                track_id=t["seed"],
                scope="collection",
                collection_id=node.id,
            )
        )
        assert [s["track_id"] for s in answer["suggestions"]] == [t["near"]]
        rules = {
            "match": "all",
            "rules": [{"field": "genre", "operator": "is", "value": "Techno"}],
        }
        answer = ok(
            get(engine, api.SIMILAR_PATH, track_id=t["seed"], filters=json.dumps(rules))
        )
        assert [s["track_id"] for s in answer["suggestions"]] == [t["near"]]
        answer = ok(get(engine, api.SIMILAR_PATH, track_id=t["seed"], q="same"))
        assert [s["track_id"] for s in answer["suggestions"]] == [t["same"]]

    def test_a_seed_that_is_not_in_the_library(self, engine, tempo_library):
        refused(
            get(engine, api.SIMILAR_PATH, track_id=999), 404, "TRACK_NOT_FOUND", "999"
        )

    @pytest.mark.parametrize(
        "params, words",
        [
            ({}, "track_id is required"),
            ({"track_id": "abc"}, "whole number"),
            ({"track_id": 0}, "track_id"),
            ({"track_id": 1, "limit": 0}, "limit"),
            ({"track_id": 1, "limit": 201}, "limit"),
            ({"track_id": 1, "filters": "{nope"}, "filters"),
            ({"track_id": 1, "scope": "collection"}, "collection_id"),
            ({"track_id": 1, "collection_id": 3}, "scope"),
            ({"track_id": 1, "playlist_id": "x"}, "playlist_id"),
            ({"track_id": 1, "sort": "bpm"}, "Unknown parameter sort"),
        ],
    )
    def test_a_request_it_cannot_answer_is_refused(
        self, engine, tempo_library, params, words
    ):
        refused(get(engine, api.SIMILAR_PATH, **params), 400, "INVALID_REQUEST", words)


# ------------------------------------------------------------------ status_for


class TestEveryRefusalIsTyped:
    @pytest.mark.parametrize(
        "exc, status, reason",
        [
            (
                BeatportAPIError(
                    "x", status_code=0, error_code="BEATPORT_API_NO_TOKEN"
                ),
                409,
                "no_token",
            ),
            (BeatportAPIError("x", status_code=401), 409, "rejected"),
            (BeatportAPIError("x", status_code=403), 409, "forbidden"),
            (
                BeatportAPIError("x", status_code=429, retry_after=12.5),
                429,
                "rate_limited",
            ),
            (BeatportAPIError("x", status_code=500), 502, "unavailable"),
            (BeatportAPIError("x"), 502, "unavailable"),
        ],
    )
    def test_a_beatport_refusal_carries_its_class(self, exc, status, reason):
        got, payload = api.status_for(exc)
        assert got == status
        assert payload["error"] == {
            "code": "BEATPORT_REFUSED",
            "message": "x",
            "reason": reason,
            "retry_after": exc.retry_after,
        }

    def test_the_rest(self):
        cases = [
            (JobTypeBusyError("discovery", "j-1"), 409, "DISCOVER_BUSY"),
            (ValueError("bad"), 400, "INVALID_REQUEST"),
            (FilterRuleError("bad"), 400, "INVALID_REQUEST"),
            (ValidationError("bad"), 400, "INVALID_REQUEST"),
            (bad_request("bad"), 400, "INVALID_REQUEST"),
            (api.DiscoverUnavailableError("db"), 503, "LIBRARY_UNAVAILABLE"),
            (LibraryUnavailableError("db"), 503, "LIBRARY_UNAVAILABLE"),
            (RuntimeError("surprise"), 500, "DISCOVER_FAILED"),
        ]
        for exc, status, code in cases:
            got, payload = api.status_for(exc)
            assert (got, payload["error"]["code"]) == (status, code), exc
        busy = api.status_for(JobTypeBusyError("discovery", "j-1"))[1]["error"]
        assert (busy["job_id"], busy["job_type"]) == ("j-1", "discovery")

    def test_every_code_a_refusal_can_carry_is_named(self):
        assert set(api.REFUSAL_CODES) == {
            "BEATPORT_REFUSED",
            "INVALID_REQUEST",
            "DISCOVER_BUSY",
            "DISCOVERY_RUN_NOT_FOUND",
            "DISCOVERY_RUN_RUNNING",
            "TRACK_NOT_FOUND",
        }


class TestTheRealContainer:
    def test_without_a_configured_token_the_container_refuses_as_no_token(
        self, engine, store, library
    ):
        # The container's own BeatportApi, over the sandboxed configuration,
        # with no token in the environment: nothing configured reads as such.
        error = refused(post(engine, api.RUN_START_PATH, ASK), 409, "BEATPORT_REFUSED")
        assert error["reason"] == "no_token"
        answer = ok(get(engine, api.OPTIONS_PATH))
        assert answer["beatport"]["state"] == "no_token"
