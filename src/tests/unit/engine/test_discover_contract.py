#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Discover's two copies of every shape agree with what the engine sends (DISCOVER-09).

The engine serializes options, runs, a run's tracks, the wantlist, a page's two
halves, Similar Tracks, three job results and a refusal; the Electron client
declares each as a TypeScript type, and the renderer's bridge types copy them
(``desktopContract.test.ts`` holds the two TypeScript copies together). What
neither side can check alone is that the TypeScript agrees with what Python
actually sends — Vite will not read a file outside its app — so this does, from
Python, against real answers: a real run over the in-memory Beatport, a real
wantlist, real pages, rather than a list of keys written out a second time.

A field the engine sends and the client never declares is a value a Discover
screen cannot show; one the client declares and the engine never sends is one
it shows as ``undefined``. Every nested object is held to its own type, and
every vocabulary a union spells is held to the engine's.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Any, Dict, Iterable, Set

import pytest

from cuepoint.core import similarity
from cuepoint.engine import discover_api as api
from cuepoint.engine.beatport_playlist_jobs import JOB_TYPE_BEATPORT_PLAYLIST
from cuepoint.engine.beatport_resolve_jobs import JOB_TYPE_BEATPORT_RESOLVE
from cuepoint.engine.discovery_jobs import JOB_TYPE_DISCOVERY, _result
from cuepoint.engine.jobs import Job, JobState, JobTypeBusyError
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.models import entity_page
from cuepoint.models.beatport_cache import ENTITY_KINDS
from cuepoint.models.discovery_run import (
    OWNED_FILTERS,
    RUN_OUTCOMES,
    RUN_TRACK_SORTS,
    SOURCE_TYPES,
)
from cuepoint.models.entity_page import LinkedEntity, LinkedName
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.wantlist import BOUGHT_FILTERS, WANTLIST_SORTS
from cuepoint.services import database_service as database_service_module
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BEATPORT_ERROR_CLASSES
from cuepoint.services.beatport_playlist_service import BeatportPlaylistResult
from cuepoint.services.beatport_resolve_service import BeatportResolveResult
from cuepoint.services.override_values import NOTATION_CAMELOT, NOTATION_CLASSIC
from cuepoint.services.wantlist_service import EVENTS
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.beatport_library import accept
from tests.unit.services.test_discovery_service import LIBRARY, standard_world

pytestmark = pytest.mark.unit

_APP = Path(__file__).resolve().parents[4] / "apps" / "desktop-electron"
_CLIENT = _APP / "electron" / "engineClient.ts"
_STRIP = _APP / "renderer" / "src" / "components" / "shell" / "useActiveJob.ts"


def _client() -> str:
    return _CLIENT.read_text(encoding="utf-8")


def _fields(interface: str) -> Set[str]:
    """The fields one exported interface declares, its parent's included."""
    text = _client()
    start = text.find(f"export interface {interface} ")
    assert start != -1, f"{interface} is not declared in engineClient.ts"
    body = text[start : text.index("\n}", start)]
    heading = body[: body.index("{")]
    fields = set(re.findall(r"^ {2}([a-z_]+)\??:", body, re.M))
    parent = re.search(r"\bextends ([A-Za-z]+)", heading)
    return fields | (_fields(parent.group(1)) if parent else set())


def _union(name: str) -> Set[str]:
    """The string literals one exported type alias is made of."""
    text = _client()
    start = text.find(f"export type {name} =")
    assert start != -1, f"{name} is not declared in engineClient.ts"
    return set(re.findall(r'"([^"]+)"', text[start : text.index(";\n", start)]))


def _field_union(interface: str, field: str) -> Set[str]:
    """The string literals one field of an interface is typed as."""
    text = _client()
    start = text.index(f"export interface {interface} ")
    body = text[start : text.index("\n}", start)]
    line = re.search(rf"^ {{2}}{field}\??: (.*);$", body, re.M)
    assert line, (interface, field)
    return set(re.findall(r'"([^"]+)"', line.group(1)))


def _method_params(name: str) -> Set[str]:
    """The keys a client method's inline ``params`` object names."""
    text = _client()
    start = text.index(f"  async {name}(")
    signature = text[start : text.index("): Promise<", start)]
    return set(re.findall(r"^ {4}([a-z_]+)\??:", signature, re.M)) | set(
        re.findall(r"[{;] ([a-z_]+)\??:", signature)
    )


def holds(interface: str, value: Dict[str, Any]) -> None:
    assert isinstance(value, dict), (interface, value)
    assert _fields(interface) == set(value), interface


def first(values: Iterable[Any]) -> Any:
    items = list(values)
    assert items, "a list the test needs an item of is empty"
    return items[0]


def resolve(name: str) -> Any:
    from cuepoint.services import interfaces

    return get_container().resolve(getattr(interfaces, name))


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def engine_state(tmp_path, monkeypatch):
    """A sandboxed library with a real run, a wantlist, owned and tempo tracks."""
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
    world = standard_world(date.today())
    get_container().register_factory(BeatportApi, lambda: BeatportApi(world))
    tracks = resolve("ITrackRepository")
    ids = [
        int(
            tracks.add(
                LibraryTrack(
                    rekordbox_track_id=f"rb{i}",
                    title=t,
                    artist=a,
                    label=lab,
                    bpm=128.0,
                    key="8A",
                    genre="House",
                )
            ).id
        )
        for i, (t, a, lab) in enumerate(LIBRARY, start=1)
    ]
    discovery = resolve("IDiscoveryService")
    run = discovery.run(discovery.request(genre_ids=[5, 6], new_releases_days=30))
    with resolve("IDatabaseService").transaction() as conn:
        accept(conn, ids[0], "3")
    resolve("IWantlistService").add([3, 7], run_id=run.id)
    yield {"run": run, "ids": ids, "world": world}
    resolve("IDatabaseService").close_all()
    reset_container()


class TestTheFileIsWhereThisTestThinks:
    def test_it_exists(self):
        assert _CLIENT.is_file(), _CLIENT
        assert _STRIP.is_file(), _STRIP


# ------------------------------------------------------------------ shapes


class TestOptions:
    def test_every_part(self, engine_state):
        options = api.options({})
        holds("DiscoverOptions", options)
        holds("DiscoverBeatportStatus", options["beatport"])
        holds("DiscoverGenre", first(options["genres"]))
        holds("DiscoverFacet", options["artists"])
        holds("DiscoverFacet", options["labels"])
        holds("DiscoverDefaults", options["defaults"])
        holds("DiscoverLimits", options["limits"])
        holds("DiscoverResolvePlan", options["resolve"])

    def test_a_facet_value_is_the_librarys(self, engine_state):
        value = first(api.options({})["artists"]["values"])
        # ``label`` only when a value has one: a tag's; a name never does.
        assert set(value) <= _fields("LibraryFacetValue")


class TestRuns:
    def test_the_list_and_a_run(self, engine_state):
        answer = api.runs({})
        holds("DiscoverRunList", answer)
        run = first(answer["runs"])
        holds("DiscoverRun", run)
        holds("DiscoverRunParams", run["params"])
        holds("DiscoverRunScope", run["params"]["artists"])
        holds("DiscoverRunScope", run["params"]["labels"])

    def test_the_header(self, engine_state):
        header = api.run_header(engine_state["run"].id, {})
        holds("DiscoverRunHeader", header)
        holds("DiscoverScopeName", first(header["artists"]))
        holds("DiscoverScopeName", first(header["labels"]))

    def test_a_page_of_its_tracks(self, engine_state):
        page = api.run_tracks(engine_state["run"].id, {"owned": ["all"]})
        holds("DiscoverRunTracksPage", page)
        holds("DiscoverRunTracksWindow", page["window"])
        row = first(page["rows"])
        holds("DiscoverRunTrackRow", row)
        holds("DiscoverRunSource", first(row["sources"]))

    def test_a_deleted_run(self, engine_state):
        holds("DiscoverRunDeleted", api.run_delete(engine_state["run"].id, {}))

    def test_a_started_job(self):
        for job_type in (
            JOB_TYPE_DISCOVERY,
            JOB_TYPE_BEATPORT_PLAYLIST,
            JOB_TYPE_BEATPORT_RESOLVE,
        ):
            status, started = api._job_started(Job(id="j-1", type=job_type))
            assert status == 202
            holds("DiscoverJobStarted", started)


class TestTheWantlist:
    def test_a_page(self, engine_state):
        page = api.wantlist({})
        holds("WantlistPage", page)
        holds("WantlistWindow", page["window"])
        holds("WantlistRow", first(page["rows"]))

    def test_a_change(self, engine_state):
        holds("WantlistChange", resolve("IWantlistService").add([8]).to_dict())


class TestJobResults:
    def test_a_runs(self, engine_state):
        holds("DiscoveryRunResult", _result(engine_state["run"]))

    def test_a_pushs(self):
        result = BeatportPlaylistResult(
            name="n", requested=2, skipped_owned=0, to_add=2
        )
        holds("BeatportPlaylistResult", result.to_dict())

    def test_a_resolves(self):
        holds(
            "BeatportResolveResult", BeatportResolveResult(owned=3, to_read=1).to_dict()
        )


class TestPages:
    def test_the_library_half(self, engine_state):
        page = api.entity({"kind": ["label"], "ref": ["name:Nightfall Audio"]})
        holds("EntityPage", page)
        holds("EntityLibrarySummary", page["library"])
        holds("EntityYears", page["library"]["years"])
        holds("DiscoverFacet", page["library"]["genres"])
        holds("DiscoverFacet", page["library"]["related"])
        assert set(page["rules"]) == _fields("FilterRuleSet")

    def test_links_and_names(self):
        holds("EntityLink", LinkedEntity(beatport_id=5, name="A", tracks=2).to_dict())
        holds(
            "EntityLinkedName", LinkedName(name_key="a", name="A", tracks=2).to_dict()
        )

    def test_the_beatport_half_with_tracks(self, engine_state):
        half = api.entity_beatport({"kind": ["label"], "ref": ["bp:40211"]})
        assert half["state"] == "ok"
        holds("EntityBeatportHalf", half)
        holds("EntityTracksPage", half["page"])
        holds("BeatportTrackRow", first(half["page"]["rows"]))

    def test_the_beatport_half_standing_in(self, engine_state):
        half = api.entity_beatport({"kind": ["artist"], "ref": ["name:Kiko"]})
        assert half["state"] == "name_only" and half["page"] is None
        holds("EntityBeatportHalf", half)


class TestTrackCredits:
    """DISCOVER-11: the Inspector's links, on the track detail read."""

    def test_a_tracks_artists_and_label(self, engine_state):
        from cuepoint.engine.library_api import library_track_detail

        detail = library_track_detail(engine_state["ids"][0])
        assert set(detail) >= _fields("LibraryTrackDetail")
        credits = detail["credits"]
        holds("TrackCreditLinks", credits)
        holds("TrackCreditLink", first(credits["artists"]))
        holds("TrackCreditLink", credits["label"])

    def test_the_words(self):
        assert _union("TrackCreditRole") == set(entity_page.CREDIT_LINK_ROLES)


class TestSimilarTracks:
    def test_the_answer_and_a_suggestion(self, engine_state):
        seed = engine_state["ids"][0]
        answer = api.similar({"track_id": [str(seed)]})
        holds("SimilarTracks", answer)
        holds("SimilarTrack", first(answer["suggestions"]))


class TestTheRefusal:
    def test_it_carries_every_extra_any_refusal_sends(self):
        sent: Set[str] = set()
        for exc in (
            BeatportAPIError("x", status_code=429, retry_after=3.0),
            JobTypeBusyError("discovery", "j-9"),
            ValueError("bad"),
            api.not_found(api.RUN_NOT_FOUND, "gone"),
        ):
            sent |= set(api.status_for(exc)[1]["error"])
        assert _fields("DiscoverRefusal") == sent


# ------------------------------------------------------------------ requests


class TestRequests:
    """What the client sends is what each route takes."""

    def test_a_runs_request(self):
        assert _fields("DiscoverRunRequest") == set(api.RUN_START_FIELDS)

    def test_similar_tracks_request(self):
        assert _fields("SimilarTracksRequest") == set(api.SIMILAR_PARAMS)

    def test_a_push(self):
        text = _client()
        start = text.index("export type BeatportPlaylistRequest =")
        declared = text[start : text.index(");\n", start)]
        keys = set(re.findall(r"([a-z_]+)\??:", declared))
        assert keys == set(api.PLAYLIST_START_FIELDS)

    @pytest.mark.parametrize(
        "method, taken, in_path",
        [
            ("listDiscoveryRuns", api.RUNS_PARAMS, set()),
            ("getDiscoveryRunTracks", api.RUN_TRACKS_PARAMS, {"run_id"}),
            ("getWantlist", api.WANTLIST_PARAMS, set()),
            ("getEntityPage", api.ENTITY_PARAMS, set()),
            ("getEntityBeatport", api.ENTITY_BEATPORT_PARAMS, set()),
            ("addToWantlist", api.WANTLIST_ADD_FIELDS, set()),
            ("removeFromWantlist", api.WANTLIST_REMOVE_FIELDS, set()),
            ("setWantlistNote", api.WANTLIST_NOTE_FIELDS, set()),
            ("setWantlistBought", api.WANTLIST_BOUGHT_FIELDS, set()),
        ],
    )
    def test_each_methods_parameters(self, method, taken, in_path):
        assert _method_params(method) == set(taken) | in_path, method


# ------------------------------------------------------------------ vocabularies


class TestVocabularies:
    def test_the_beatport_classes(self):
        assert _union("BeatportErrorClass") == set(BEATPORT_ERROR_CLASSES)
        text = _client()
        start = text.index("export const BEATPORT_ERROR_CLASSES")
        listed = set(re.findall(r'"([a-z_]+)"', text[start : text.index("];", start)]))
        assert listed == set(BEATPORT_ERROR_CLASSES)

    def test_the_refusal_codes(self):
        assert _union("DiscoverRefusalCode") == set(api.REFUSAL_CODES)
        text = _client()
        start = text.index("export const DISCOVER_REFUSAL_CODES")
        listed = set(re.findall(r'"([A-Z_]+)"', text[start : text.index("];", start)]))
        assert listed == set(api.REFUSAL_CODES)

    def test_the_token_states(self):
        assert _union("DiscoverBeatportState") == {"ok", *BEATPORT_ERROR_CLASSES}

    def test_the_filters_and_sorts(self):
        assert (
            _union("DiscoverOwnedFilter") == set(OWNED_FILTERS) == set(BOUGHT_FILTERS)
        )
        assert _union("DiscoverRunSort") == set(RUN_TRACK_SORTS)
        assert _union("WantlistSort") == set(WANTLIST_SORTS)
        assert _union("DiscoverSortDirection") == {"asc", "desc"}

    def test_how_a_run_ends_and_why_it_found_a_track(self):
        assert _union("DiscoverRunOutcome") == set(RUN_OUTCOMES)
        assert _union("DiscoverSourceType") == set(SOURCE_TYPES)

    def test_the_jobs(self):
        assert _union("DiscoverJobType") == {
            JOB_TYPE_DISCOVERY,
            JOB_TYPE_BEATPORT_PLAYLIST,
            JOB_TYPE_BEATPORT_RESOLVE,
        }
        assert _field_union("DiscoverJobStarted", "state") == {
            state.value for state in JobState
        }

    def test_the_wantlist_actions(self):
        assert _union("WantlistAction") == set(EVENTS)

    def test_a_pages_words(self):
        assert _union("EntityKind") == set(ENTITY_KINDS)
        assert _union("EntityIdentity") == set(entity_page.IDENTITIES)
        assert _union("EntityBeatportState") == set(entity_page.BEATPORT_STATES)
        assert _union("EntityNameOnlyReason") == set(entity_page.NAME_ONLY_REASONS)
        assert _union("EntityAction") == set(entity_page.ACTIONS)

    def test_similar_tracks_words(self):
        assert _union("SimilarKeyNotation") == {NOTATION_CLASSIC, NOTATION_CAMELOT}
        assert _union("SimilarComponent") == set(similarity.COMPONENTS)


# ------------------------------------------------------------------ routes


class TestRoutes:
    def test_the_client_calls_every_route_the_engine_answers(self):
        text = _client()
        for path in (*api.GET_PATHS, *api.POST_PATHS):
            fixed = path.split("{id}")[0]
            assert fixed in text, path

    def test_the_status_strip_names_every_job_a_route_starts(self):
        strip = _STRIP.read_text(encoding="utf-8")
        start = strip.index("const JOB_VERBS")
        verbs = strip[start : strip.index("};", start)]
        for job_type in (
            JOB_TYPE_DISCOVERY,
            JOB_TYPE_BEATPORT_PLAYLIST,
            JOB_TYPE_BEATPORT_RESOLVE,
        ):
            assert re.search(rf"^\s+{job_type}: \"", verbs, re.M), job_type
