#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine answers the Discover page's tests are written against (DISCOVER-10).

DISCOVER-10's specification asks for "component tests with fixtures the Python
suite produces from the real engine (EXPORT-07's practice)". A shape typed by
hand in a renderer test is the renderer's belief about the engine, and a test
over it passes the day the two stop agreeing. So the page's fixtures are
produced here — by a running engine over a real library, the real job store,
and DISCOVER-01's real ``BeatportApi`` talking to the in-memory Beatport — and
committed as JSON beside the page: ``discoverPage.fixture.json``.

Each state below builds one situation the page has to draw and asserts the
committed JSON is what the engine answers for it now, as the renderer receives
it: ``{value, refusal}``, through the translation ``engineClient.ts`` makes. A
change to a payload therefore fails here, in Python, where it is made. To write
the file again after a deliberate change::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \\
        src/tests/unit/engine/test_discover_page_fixture.py

and read the diff before committing it.

What varies from run to run is normalized, and nothing else: every date moves
by the same number of days, so today is always the same fictional day and a
track released two days ago still was; every recorded moment is one fixed
moment on that day; every job id
is named by its order; and the default playlist name is the fictional day's.
"""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import date
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import pytest

from cuepoint.engine import discover_api as api
from cuepoint.engine.discovery_jobs import JOB_TYPE_DISCOVERY
from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.services.playlist_name import default_playlist_name
from cuepoint.models.library_track import LibraryTrack
from tests.fixtures.beatport_world import BeatportWorld

# The HTTP harness and its fixtures, shared with the route tests so a fixture
# is produced exactly as those tests drive the engine.
from tests.unit.engine.test_engine_discover_api import (  # noqa: F401
    ASK,
    call,
    engine,
    finished,
    get,
    library,
    library_db,
    own,
    post,
    resolve,
    run_path,
    store,
    use_beatport,
    world,
)

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURES = (
    REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "discover"
    / "discoverPage.fixture.json"
)
WRITE = os.environ.get("CUEPOINT_WRITE_FIXTURES") == "1"

#: The fictional today every date is moved relative to.
FIXED_TODAY = date(2026, 9, 20)

#: The one moment every recorded time is put at. A moment is recorded in UTC,
#: whose date is not always the local one a run's windows are counted from, so
#: a moment is fixed whole rather than moved with the dates.
FIXED_MOMENT = "2026-09-20T12:00:00+00:00"

_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_MOMENT = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)?"
)
_JOB_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

# ------------------------------------------------------------ normalization


def normalize(value: Any) -> Any:
    """The answer with today and this run's ids taken out of it."""
    shift = FIXED_TODAY - date.today()
    today_name = default_playlist_name("short", date.today())
    fixed_name = default_playlist_name("short", FIXED_TODAY)
    jobs: Dict[str, str] = {}

    def moved(match: "re.Match[str]") -> str:
        return (date.fromisoformat(match.group(0)) + shift).isoformat()

    def job(match: "re.Match[str]") -> str:
        return jobs.setdefault(match.group(0), f"job-{len(jobs) + 1}")

    def walk(item: Any) -> Any:
        if isinstance(item, dict):
            return {key: walk(inner) for key, inner in item.items()}
        if isinstance(item, list):
            return [walk(inner) for inner in item]
        if isinstance(item, str):
            if item == today_name:
                return fixed_name
            text = _JOB_ID.sub(job, item)
            text = _MOMENT.sub(FIXED_MOMENT, text)
            # Only dates left now: moved, except the fixed moment's own.
            parts = text.split(FIXED_MOMENT)
            return FIXED_MOMENT.join(_DATE.sub(moved, part) for part in parts)
        return item

    return walk(value)


def answer(result: Tuple[int, Dict[str, Any]]) -> Dict[str, Any]:
    """An answer as the renderer receives it.

    ``readDiscover`` in ``engineClient.ts``, restated field for field: a
    success is the value, one of the six refusal codes is a refusal with its
    class, and anything else throws — which no state here records.
    """
    status, body = result
    if 200 <= status < 300:
        return {"value": body, "refusal": None}
    error = body["error"]
    assert error["code"] in api.REFUSAL_CODES, body

    def text(key: str) -> Optional[str]:
        value = error.get(key)
        return value if isinstance(value, str) else None

    retry = error.get("retry_after")
    return {
        "value": None,
        "refusal": {
            "code": error["code"],
            "message": error["message"],
            "reason": text("reason"),
            "retry_after": retry if isinstance(retry, (int, float)) else None,
            "job_id": text("job_id"),
            "job_type": text("job_type"),
        },
    }


# ------------------------------------------------------------ the situations


class Situation:
    """A running engine over the discovery tests' library and Beatport."""

    def __init__(
        self, base: str, jobs: JobStore, beatport: BeatportWorld, ids: List[int]
    ):
        self.base = base
        self.store = jobs
        self.world = beatport
        self.ids = ids

    def get(self, path: str, **params: Any) -> Dict[str, Any]:
        return answer(get(self.base, path, **params))

    def post(self, path: str, body: Any = None) -> Dict[str, Any]:
        return answer(post(self.base, path, body))

    def own_two(self) -> None:
        """The library owns Beatport tracks 3 and 4 through accepted matches."""
        own(self.ids[0], 3)
        own(self.ids[1], 4)

    def job(self, path: str, body: Any = None) -> Dict[str, Any]:
        started = self.post(path, body)
        assert started["refusal"] is None, started
        return started["value"]

    def ran(self) -> int:
        """A finished run over the standard world."""
        started = self.job(api.RUN_START_PATH, ASK)
        assert finished(self.store, started["id"]).state is JobState.SUCCEEDED
        return int(self.store.get(started["id"]).result["id"])

    def failed_run(self) -> int:
        """A run Beatport's refusal of the token stopped, keeping nothing."""
        self.world.failures.append(
            lambda route, _params, _n: (
                401 if route.startswith("catalog/charts") else None
            )
        )
        started = self.job(api.RUN_START_PATH, ASK)
        assert finished(self.store, started["id"]).state is JobState.FAILED
        self.world.failures.clear()
        return int(self.store.get(started["id"]).result["id"])


def _refusing(status: int) -> Callable[[Situation], Any]:
    def state(ctx: Situation) -> Any:
        ctx.world.failures.append(lambda _route, _params, _n: status)
        return ctx.get(api.OPTIONS_PATH)

    return state


def options_ok(ctx: Situation) -> Any:
    """Beatport answered; two matched tracks have not been read from it."""
    ctx.own_two()
    return ctx.get(api.OPTIONS_PATH)


def options_resolved(ctx: Situation) -> Any:
    """The same library after a resolve: nothing left to read."""
    ctx.own_two()
    started = ctx.job(api.RESOLVE_START_PATH)
    assert finished(ctx.store, started["id"]).state is JobState.SUCCEEDED
    return ctx.get(api.OPTIONS_PATH)


def options_no_token(ctx: Situation) -> Any:
    use_beatport(BeatportWorld(access_token=""))
    return ctx.get(api.OPTIONS_PATH)


def runs_empty(ctx: Situation) -> Any:
    return ctx.get(api.RUNS_PATH)


def runs(ctx: Situation) -> Any:
    """A finished run, then one Beatport stopped: newest first."""
    ctx.own_two()
    ctx.ran()
    ctx.failed_run()
    return ctx.get(api.RUNS_PATH)


def run_header(ctx: Situation) -> Any:
    ctx.own_two()
    return ctx.get(run_path(ctx.ran()))


def run_tracks_hidden(ctx: Situation) -> Any:
    """Owned hidden, the default: two of the run's tracks are the library's."""
    ctx.own_two()
    return ctx.get(run_path(ctx.ran(), "/tracks"))


def run_tracks_all(ctx: Situation) -> Any:
    """Owned shown, after two tracks went on the wantlist from the run."""
    ctx.own_two()
    run_id = ctx.ran()
    ctx.post(api.WANTLIST_ADD_PATH, {"track_ids": [1, 2], "run_id": run_id})
    return ctx.get(run_path(run_id, "/tracks"), owned="all")


def run_tracks_all_owned(ctx: Situation) -> Any:
    """A run whose every track the library owns: owned hidden shows none."""
    tracks = resolve("ITrackRepository")
    for track_id in (1, 2, 3, 4, 5, 7, 8):
        added = tracks.add(
            LibraryTrack(
                rekordbox_track_id=f"owned{track_id}",
                title=f"Track {track_id}",
                artist="Someone",
            )
        )
        own(int(added.id), track_id)
    return ctx.get(run_path(ctx.ran(), "/tracks"))


def run_started(ctx: Situation) -> Any:
    started = ctx.post(api.RUN_START_PATH, ASK)
    finished(ctx.store, started["value"]["id"])
    return started


def run_deleted(ctx: Situation) -> Any:
    return ctx.post(run_path(ctx.ran(), "/delete"))


def refusal_busy(ctx: Situation) -> Any:
    """A run asked for while another runs."""
    release = threading.Event()
    ctx.store.create_job(
        job_type=JOB_TYPE_DISCOVERY,
        runner=lambda _job: release.wait(30),
        exclusive=True,
    )
    try:
        return ctx.post(api.RUN_START_PATH, ASK)
    finally:
        release.set()


def refusal_no_token(ctx: Situation) -> Any:
    use_beatport(BeatportWorld(access_token=""))
    return ctx.post(api.RUN_START_PATH, ASK)


def refusal_note_too_long(ctx: Situation) -> Any:
    ctx.post(api.WANTLIST_ADD_PATH, {"track_ids": [1], "run_id": ctx.ran()})
    return ctx.post(api.WANTLIST_NOTE_PATH, {"track_id": 1, "note": "x" * 1001})


def refusal_run_gone(ctx: Situation) -> Any:
    return ctx.get(run_path(41, "/tracks"))


def wantlist_added(ctx: Situation) -> Any:
    return ctx.post(api.WANTLIST_ADD_PATH, {"track_ids": [1, 2], "run_id": ctx.ran()})


def wantlist_added_again(ctx: Situation) -> Any:
    run_id = ctx.ran()
    ctx.post(api.WANTLIST_ADD_PATH, {"track_ids": [1], "run_id": run_id})
    return ctx.post(api.WANTLIST_ADD_PATH, {"track_ids": [1, 2], "run_id": run_id})


def _wanted(ctx: Situation) -> None:
    """Four wanted tracks: one noted, one bought, one the library owns."""
    ctx.own_two()
    run_id = ctx.ran()
    ctx.post(api.WANTLIST_ADD_PATH, {"track_ids": [1, 2, 7, 8], "run_id": run_id})
    ctx.post(api.WANTLIST_NOTE_PATH, {"track_id": 7, "note": "For the Friday warm-up"})
    ctx.post(api.WANTLIST_BOUGHT_PATH, {"track_ids": [2], "bought": True})
    own(ctx.ids[2], 8)


def wantlist_all(ctx: Situation) -> Any:
    _wanted(ctx)
    return ctx.get(api.WANTLIST_PATH)


def wantlist_bought_only(ctx: Situation) -> Any:
    _wanted(ctx)
    return ctx.get(api.WANTLIST_PATH, bought="only")


def wantlist_not_owned(ctx: Situation) -> Any:
    _wanted(ctx)
    return ctx.get(api.WANTLIST_PATH, owned="hide")


def wantlist_empty(ctx: Situation) -> Any:
    return ctx.get(api.WANTLIST_PATH)


def wantlist_bought(ctx: Situation) -> Any:
    _wanted(ctx)
    return ctx.post(api.WANTLIST_BOUGHT_PATH, {"track_ids": [1], "bought": True})


def wantlist_removed(ctx: Situation) -> Any:
    _wanted(ctx)
    return ctx.post(api.WANTLIST_REMOVE_PATH, {"track_ids": [1, 7]})


def wantlist_noted(ctx: Situation) -> Any:
    _wanted(ctx)
    return ctx.post(api.WANTLIST_NOTE_PATH, {"track_id": 1, "note": "Ask the shop"})


def playlist_result(ctx: Situation) -> Any:
    """A push of three tracks, one of them owned and left out."""
    ctx.own_two()
    started = ctx.job(
        api.PLAYLIST_START_PATH, {"track_ids": [7, 3, 1], "name": "Friday finds"}
    )
    assert finished(ctx.store, started["id"]).state is JobState.SUCCEEDED
    return ctx.store.get(started["id"]).result


def playlist_refused(ctx: Situation) -> Any:
    """A push whose playlist Beatport would not make: a token without scope."""
    ctx.world.failures.append(
        lambda route, _params, _n: 403 if route == "my/playlists" else None
    )
    started = ctx.job(api.PLAYLIST_START_PATH, {"track_ids": [7, 1], "name": "Friday"})
    assert finished(ctx.store, started["id"]).state is JobState.FAILED
    return ctx.store.get(started["id"]).result


def resolve_result(ctx: Situation) -> Any:
    ctx.own_two()
    started = ctx.job(api.RESOLVE_START_PATH)
    assert finished(ctx.store, started["id"]).state is JobState.SUCCEEDED
    return ctx.store.get(started["id"]).result


def discovery_result(ctx: Situation) -> Any:
    ctx.own_two()
    started = ctx.job(api.RUN_START_PATH, ASK)
    assert finished(ctx.store, started["id"]).state is JobState.SUCCEEDED
    return ctx.store.get(started["id"]).result


STATES: Dict[str, Callable[[Situation], Any]] = {
    "options_ok": options_ok,
    "options_resolved": options_resolved,
    "options_no_token": options_no_token,
    "options_rejected": _refusing(401),
    "options_forbidden": _refusing(403),
    "options_rate_limited": _refusing(429),
    "options_unavailable": _refusing(503),
    "runs_empty": runs_empty,
    "runs": runs,
    "run_header": run_header,
    "run_tracks_hidden": run_tracks_hidden,
    "run_tracks_all": run_tracks_all,
    "run_tracks_all_owned": run_tracks_all_owned,
    "run_started": run_started,
    "run_deleted": run_deleted,
    "refusal_busy": refusal_busy,
    "refusal_no_token": refusal_no_token,
    "refusal_note_too_long": refusal_note_too_long,
    "refusal_run_gone": refusal_run_gone,
    "wantlist_added": wantlist_added,
    "wantlist_added_again": wantlist_added_again,
    "wantlist_all": wantlist_all,
    "wantlist_bought_only": wantlist_bought_only,
    "wantlist_not_owned": wantlist_not_owned,
    "wantlist_empty": wantlist_empty,
    "wantlist_bought": wantlist_bought,
    "wantlist_removed": wantlist_removed,
    "wantlist_noted": wantlist_noted,
    "playlist_result": playlist_result,
    "playlist_refused": playlist_refused,
    "resolve_result": resolve_result,
    "discovery_result": discovery_result,
}


def _committed() -> Dict[str, Any]:
    if not FIXTURES.exists():
        return {}
    return json.loads(FIXTURES.read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", sorted(STATES))
def test_the_committed_answer_is_what_the_engine_answers(
    name,
    engine,  # noqa: F811 - the route tests' fixtures, shared
    store,  # noqa: F811
    world,  # noqa: F811
    library,  # noqa: F811
):
    produced = normalize(STATES[name](Situation(engine, store, world, library)))

    if WRITE:
        committed = _committed()
        committed[name] = produced
        FIXTURES.write_text(
            json.dumps(committed, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    assert _committed().get(name) == produced, (
        f"{FIXTURES.name} no longer says what the engine answers for {name!r}; "
        "if the change is deliberate, write it again with CUEPOINT_WRITE_FIXTURES=1"
    )


def test_the_file_holds_no_state_nothing_builds():
    """A state removed here must not live on in the renderer's tests."""
    assert sorted(_committed()) == sorted(STATES)


def test_every_beatport_state_and_refusal_the_page_draws_is_there():
    committed = _committed()
    states = {
        committed[name]["value"]["beatport"]["state"]
        for name in committed
        if name.startswith("options_")
    }
    assert states == {
        "ok",
        "no_token",
        "rejected",
        "forbidden",
        "rate_limited",
        "unavailable",
    }
    codes = {
        committed[name]["refusal"]["code"]
        for name in committed
        if name.startswith("refusal_")
    }
    assert codes == {
        "DISCOVER_BUSY",
        "BEATPORT_REFUSED",
        "INVALID_REQUEST",
        "DISCOVERY_RUN_NOT_FOUND",
    }


def test_the_file_holds_no_real_date_or_machine():
    """Committed, so it may carry only the fictional day and nothing local."""
    text = FIXTURES.read_text(encoding="utf-8")
    assert "pytest" not in text and "Temp" not in text
    assert not _JOB_ID.search(text)
    if date.today() != FIXED_TODAY:
        assert date.today().isoformat() not in text


def test_normalizing_moves_dates_together_and_names_jobs_by_order():
    today = date.today()
    shifted = normalize(
        {
            "a": "2025-01-02T23:31:07.123456+00:00",
            "b": [today.isoformat(), "0f0e0d0c-0b0a-4908-8706-050403020100"],
            "c": "0f0e0d0c-0b0a-4908-8706-050403020100",
            "d": default_playlist_name("short", today),
        }
    )
    assert shifted == {
        "a": "2026-09-20T12:00:00+00:00",
        "b": ["2026-09-20", "job-1"],
        "c": "job-1",
        "d": default_playlist_name("short", FIXED_TODAY),
    }
