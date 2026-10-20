"""Engine revisions and the revision-keyed caches (C19b).

``revisions.py`` reads ``PRAGMA data_version`` on connections of its own, so a
commit by any other connection is a change and a read is not. The memo keeps a
read's answer while those numbers hold. These tests pin:

- the revision moves on another connection's commit, a restore (generation) and
  a replaced file, and does not move on a read;
- every GET a page sends on opening leaves both revisions where they were (if one
  wrote, the cache would never hit);
- a cached answer is reused until a write, and is the same as an uncached one for
  the six cached reads;
- the ten-minute ceiling, with a clock the test holds;
- an exception is never kept; the memo is bounded; the key is the whole params;
- ``GET /api/v1/jobs`` carries the revisions.
"""

from __future__ import annotations

import json
import socket
import sqlite3
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

import pytest

from cuepoint.engine import revisions
from cuepoint.engine.revisions import (
    LIBRARY,
    WAVEFORMS,
    RevisionMemo,
    Revisions,
    revision_cache,
)
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.waveform import STORED_FAILED, StoredWaveform
from cuepoint.persistence import file_watchers
from cuepoint.persistence.waveform_store import WaveformStore
from cuepoint.services.database_service import DatabaseService
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container
from tests.unit.key_support import accept_with_key

pytestmark = pytest.mark.unit

TOKEN = "revisions-token"


# ---------------------------------------------------------------------------
# The revision itself, over plain files
# ---------------------------------------------------------------------------


class _Files:
    """Two real SQLite files, a generation the test moves, and a Revisions over them."""

    def __init__(self, tmp_path: Path) -> None:
        self.library = tmp_path / "cuepoint.db"
        self.waveforms = tmp_path / "waveforms.db"
        self.generation = 0
        self.writers = {}
        for path in (self.library, self.waveforms):
            writer = sqlite3.connect(path, isolation_level=None)
            writer.execute("PRAGMA journal_mode=WAL")
            writer.execute("CREATE TABLE t (x INTEGER)")
            self.writers[path] = writer
        self.revisions = Revisions.for_files(
            lambda: self.library, lambda: self.waveforms, lambda: self.generation
        )

    def commit(self, path: Path) -> None:
        self.writers[path].execute("INSERT INTO t VALUES (1)")

    def read(self, path: Path) -> None:
        self.writers[path].execute("SELECT count(*) FROM t").fetchone()


@pytest.fixture
def files(tmp_path):
    held = _Files(tmp_path)
    yield held
    held.revisions.close()
    for writer in held.writers.values():
        writer.close()


def test_a_commit_on_another_connection_changes_the_revision(files):
    before = files.revisions.snapshot()
    files.commit(files.library)
    after = files.revisions.snapshot()
    assert after[LIBRARY] != before[LIBRARY]
    assert after[WAVEFORMS] == before[WAVEFORMS]
    files.commit(files.waveforms)
    assert files.revisions.snapshot()[WAVEFORMS] != after[WAVEFORMS]


def test_a_read_does_not_change_the_revision(files):
    before = files.revisions.snapshot()
    for _ in range(3):
        files.read(files.library)
        files.read(files.waveforms)
    assert files.revisions.snapshot() == before
    assert files.revisions.snapshot() == before


def test_a_generation_bump_changes_the_library_revision(files):
    before = files.revisions.snapshot()
    files.generation += 1
    after = files.revisions.snapshot()
    assert after[LIBRARY] != before[LIBRARY]


def test_a_replaced_file_is_reopened(files, tmp_path):
    before = files.revisions.revision(LIBRARY)
    files.writers[files.library].close()
    # Whatever moves a database asks its watchers to let go first: Windows will
    # not delete a file a connection still has open.
    file_watchers.release(files.library)
    files.library.unlink()
    for sidecar in tmp_path.glob("cuepoint.db-*"):
        sidecar.unlink()
    assert files.revisions.revision(LIBRARY) is None  # gone: cannot be watched
    fresh = sqlite3.connect(files.library, isolation_level=None)
    fresh.execute("CREATE TABLE t (x INTEGER)")
    files.writers[files.library] = fresh
    after = files.revisions.revision(LIBRARY)
    assert after is not None and after != before
    files.commit(files.library)
    assert files.revisions.revision(LIBRARY) != after


def test_a_library_that_is_not_a_file_cannot_be_cached(tmp_path):
    rev = Revisions.for_files(
        lambda: tmp_path / "nothing.db", lambda: tmp_path / "w.db", lambda: 0
    )
    assert rev.revision(LIBRARY) is None
    assert rev.revisions((LIBRARY,)) is None
    # A waveform store that does not exist yet is a state, not an unknown.
    assert rev.revision(WAVEFORMS) is not None
    rev.close()


def test_an_unwatchable_domain_reports_a_stable_number(tmp_path):
    rev = Revisions.for_files(
        lambda: tmp_path / "nothing.db", lambda: tmp_path / "w.db", lambda: 0
    )
    first = rev.snapshot()
    assert rev.snapshot() == first
    assert rev.snapshot() == first
    rev.close()


def test_the_number_moves_once_when_a_domain_becomes_watchable_and_back(tmp_path):
    library = tmp_path / "cuepoint.db"
    rev = Revisions.for_files(lambda: library, lambda: tmp_path / "w.db", lambda: 0)
    missing = rev.snapshot()[LIBRARY]
    assert rev.snapshot()[LIBRARY] == missing
    sqlite3.connect(library).close()
    watchable = rev.snapshot()[LIBRARY]
    assert watchable != missing
    assert rev.snapshot()[LIBRARY] == watchable
    file_watchers.release(library)  # as every mover does (Windows keeps open files)
    library.unlink()
    gone = rev.snapshot()[LIBRARY]
    assert gone != watchable
    assert rev.snapshot()[LIBRARY] == gone
    rev.close()


def test_a_unc_path_is_turned_into_a_readonly_uri():
    from pathlib import PureWindowsPath

    class _Fake:
        def resolve(self):
            return self

        def as_uri(self):
            return PureWindowsPath(r"\\server\share\a b.db").as_uri()

    uri = revisions._readonly_uri(_Fake())  # noqa: SLF001
    assert uri.startswith("file:") and uri.endswith("?mode=ro")

    class _Rejects(_Fake):
        def as_uri(self):
            raise ValueError("relative")

        def __str__(self):
            return "/tmp/x y.db"

    assert revisions._readonly_uri(_Rejects()).endswith("x%20y.db?mode=ro")  # noqa: SLF001


def test_a_failed_look_is_unknown_and_moves_nothing(files, monkeypatch):
    before = files.revisions.snapshot()
    watch = files.revisions._watches[LIBRARY]  # noqa: SLF001

    class _Busy:
        def execute(self, *_):
            raise sqlite3.OperationalError("database is locked")

        def close(self):
            pass

    watch._connection = _Busy()  # noqa: SLF001
    assert files.revisions.revisions((LIBRARY,)) is None
    assert files.revisions.snapshot() == before


# ---------------------------------------------------------------------------
# Letting go of a file that is about to move
# ---------------------------------------------------------------------------


def test_release_closes_the_watch_and_the_next_look_is_a_change(files):
    before = files.revisions.revision(LIBRARY)
    watch = files.revisions._watches[LIBRARY]  # noqa: SLF001
    connection = watch._connection  # noqa: SLF001
    file_watchers.release(files.library)
    assert watch._connection is None  # noqa: SLF001
    with pytest.raises(sqlite3.ProgrammingError):
        connection.execute("SELECT 1")
    after = files.revisions.revision(LIBRARY)
    assert after is not None and after != before
    assert files.revisions.revision(LIBRARY) == after  # and then steady


def test_a_condemned_store_is_released_before_it_is_set_aside(
    files, tmp_path, monkeypatch
):
    path = tmp_path / "waveforms.db"
    # Only the watch may hold the file: the fixture's own writer would keep
    # Windows from moving it whatever the watch does.
    files.writers.pop(path).close()
    store = WaveformStore(path)
    store.count()  # creates the store
    store.close_all()
    files.revisions.revision(WAVEFORMS)
    watch = files.revisions._watches[WAVEFORMS]  # noqa: SLF001
    assert watch._connection is not None  # noqa: SLF001
    store.condemn("test")

    seen: List[bool] = []
    original = Path.replace

    def replace(self, target):
        seen.append(watch._connection is None)  # noqa: SLF001
        return original(self, target)

    monkeypatch.setattr(Path, "replace", replace)
    WaveformStore(path).count()  # prepares: sets the condemned store aside
    assert seen and all(seen)


def test_close_all_releases_the_library_watch(files, tmp_path):
    database = DatabaseService(db_path=files.library)
    files.revisions.revision(LIBRARY)
    watch = files.revisions._watches[LIBRARY]  # noqa: SLF001
    assert watch._connection is not None  # noqa: SLF001
    database.close_all()
    assert watch._connection is None  # noqa: SLF001


# ---------------------------------------------------------------------------
# The memo
# ---------------------------------------------------------------------------


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _memo(files, clock=None, **kwargs) -> RevisionMemo:
    return RevisionMemo(files.revisions, clock=clock or _Clock(), **kwargs)


def test_the_memo_reuses_an_answer_until_the_library_changes(files):
    memo = _memo(files)
    calls: List[int] = []

    def compute() -> int:
        calls.append(1)
        return len(calls)

    assert memo.get("r", {"a": "1"}, (LIBRARY,), compute) == 1
    assert memo.get("r", {"a": "1"}, (LIBRARY,), compute) == 1
    files.read(files.library)
    assert memo.get("r", {"a": "1"}, (LIBRARY,), compute) == 1
    files.commit(files.waveforms)  # not a domain it depends on
    assert memo.get("r", {"a": "1"}, (LIBRARY,), compute) == 1
    files.commit(files.library)
    assert memo.get("r", {"a": "1"}, (LIBRARY,), compute) == 2
    files.generation += 1  # a restore
    assert memo.get("r", {"a": "1"}, (LIBRARY,), compute) == 3


def test_the_memo_follows_the_waveforms_only_when_asked(files):
    memo = _memo(files)
    calls: List[int] = []

    def compute() -> int:
        calls.append(1)
        return len(calls)

    memo.get("r", "", (LIBRARY, WAVEFORMS), compute)
    files.commit(files.waveforms)
    assert memo.get("r", "", (LIBRARY, WAVEFORMS), compute) == 2


def test_the_key_is_the_whole_sorted_params(files):
    memo = _memo(files)
    seen: List[Dict[str, str]] = []

    def asking(params: Dict[str, str]) -> Any:
        return memo.get("r", params, (LIBRARY,), lambda: seen.append(params) or params)

    asking({"scope": "library", "limit": "10"})
    asking({"limit": "10", "scope": "library"})  # same set, other order: a hit
    assert len(seen) == 1
    asking({"scope": "library", "limit": "25"})
    asking({"scope": "playlist:1", "limit": "10"})
    assert len(seen) == 3
    assert (
        memo.get("other", {"scope": "library", "limit": "10"}, (LIBRARY,), dict) == {}
    )


def test_the_ceiling_is_ten_minutes_on_an_injected_clock(files):
    clock = _Clock()
    memo = _memo(files, clock)
    calls: List[int] = []

    def compute() -> int:
        calls.append(1)
        return len(calls)

    assert memo.get("r", "", (LIBRARY,), compute) == 1
    clock.now += 599.0
    assert memo.get("r", "", (LIBRARY,), compute) == 1
    clock.now += 2.0  # 601 s after the answer was made
    assert memo.get("r", "", (LIBRARY,), compute) == 2
    clock.now += 599.0
    assert memo.get("r", "", (LIBRARY,), compute) == 2


def test_an_exception_is_never_cached(files):
    memo = _memo(files)
    state = {"n": 0}

    def compute() -> int:
        state["n"] += 1
        if state["n"] == 1:
            raise LookupError("gone")
        return state["n"]

    with pytest.raises(LookupError):
        memo.get("r", "", (LIBRARY,), compute)
    assert memo.get("r", "", (LIBRARY,), compute) == 2


def test_the_memo_is_bounded(files):
    memo = _memo(files, max_entries=3)
    for n in range(10):
        memo.get("r", str(n), (LIBRARY,), lambda n=n: n)
    assert len(memo._entries) == 3  # noqa: SLF001
    calls: List[int] = []
    memo.get("r", "9", (LIBRARY,), lambda: calls.append(1))  # newest: kept
    memo.get("r", "0", (LIBRARY,), lambda: calls.append(1))  # oldest: gone
    assert calls == [1]


def test_nothing_is_cached_when_the_revision_is_unknown(tmp_path):
    memo = RevisionMemo(
        Revisions.for_files(lambda: tmp_path / "no.db", lambda: tmp_path / "w.db")
    )
    calls: List[int] = []
    memo.get("r", "", (LIBRARY,), lambda: calls.append(1))
    memo.get("r", "", (LIBRARY,), lambda: calls.append(1))
    assert len(calls) == 2


# ---------------------------------------------------------------------------
# The engine: a real library, a real engine
# ---------------------------------------------------------------------------


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class _World:
    pass


@pytest.fixture
def world(tmp_path, monkeypatch):
    from cuepoint.models.collection import KIND_COLLECTION, Collection
    from cuepoint.persistence.collection_repository import CollectionRepository
    from cuepoint.persistence.waveform_store import WaveformStore
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import (
        IDatabaseService,
        IHealthService,
        ITrackRepository,
    )
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
    for number in range(1, 8):
        repo.add(
            LibraryTrack(
                rekordbox_track_id=str(number),
                file_path=f"/music/{number}.mp3",
                title=f"Track {number}",
                artist=f"Artist {number % 3}",
                label=f"Label {number % 2}",
                genre="House" if number % 2 else "Techno",
            )
        )
    ids = {t.rekordbox_track_id: t.id for t in repo.browse(limit=20)}
    for number, key in (("1", "8A"), ("2", "8A"), ("3", "9A")):
        accept_with_key(database, ids[number], key)
    box = CollectionRepository(database).create(
        Collection(kind=KIND_COLLECTION, name="Box")
    )
    CollectionRepository(database).add(box.id, [ids["1"], ids["2"]])
    store = container.resolve(WaveformStore)
    store.put(
        StoredWaveform(
            path="/music/1.mp3",
            size_bytes=10,
            mtime_ns=5,
            analysis_version=1,
            state=STORED_FAILED,
            analysed_at="2026-09-30T12:00:00+00:00",
            reason="undecodable",
        )
    )

    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    held = _World()
    held.base = f"http://127.0.0.1:{port}"
    held.database = database
    held.repo = repo
    held.ids = ids
    held.store = store
    held.health = container.resolve(IHealthService)
    held.box = int(box.id)
    revisions.clear_cache()
    try:
        yield held
    finally:
        server.shutdown()
        thread.join(timeout=2)
        reset_container()


def _get(world, path: str):
    req = urllib.request.Request(
        f"{world.base}{path}", headers={"Authorization": f"Bearer {TOKEN}"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(world, path: str, body: Dict[str, Any]):
    req = urllib.request.Request(
        f"{world.base}{path}",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


#: The reads a page sends on opening (and the six cached ones).
PAGE_OPENING_GETS = (
    "/api/v1/library/summary",
    "/api/v1/library/playlists",
    "/api/v1/collections",
    "/api/v1/tags",
    "/api/v1/library/filter-fields",
    "/api/v1/library/search?limit=50",
    "/api/v1/library/facets?field=genre",
    "/api/v1/jobs",
    "/api/v1/jobs?state=all",
    "/api/v1/activity/recent",
    "/api/v1/clean/health",
    "/api/v1/clean/match/resumable",
    "/api/v1/clean/duplicates",
    "/api/v1/statistics/plays",
    "/api/v1/statistics/plays?limit=25&scope=library",
    "/api/v1/statistics/spreads",
    "/api/v1/statistics/health",
    "/api/v1/discover/options",
    "/api/v1/discover/runs",
    "/api/v1/waveforms/analysis",
)


def test_pin_page_opening_reads_never_write(world):
    """If a GET wrote, a revision would move on every open and no cache would hit."""
    # Twice: the first open may build lazily (a migration, a view); the pin is
    # that opening the page again leaves the data where it was.
    for path in PAGE_OPENING_GETS:
        _get(world, path)
    before = revisions.current_revisions()
    moved = []
    for path in PAGE_OPENING_GETS:
        _get(world, path)
        after = revisions.current_revisions()
        if after != before:
            moved.append((path, before, after))
            before = after
    _post(world, "/api/v1/library/keys/population", {"sources": []})
    assert revisions.current_revisions() == before, "keys/population wrote"
    assert not moved, f"these GETs changed a revision: {moved}"


def test_pin_first_open_of_each_cached_route_does_not_write(world):
    _get(world, "/api/v1/jobs")  # let the revisions settle
    before = revisions.current_revisions()
    for path in (
        "/api/v1/clean/health",
        "/api/v1/statistics/plays",
        "/api/v1/statistics/spreads",
        "/api/v1/statistics/health",
        "/api/v1/discover/options",
    ):
        _get(world, path)
        assert revisions.current_revisions() == before, path


def test_a_cached_health_answer_is_reused_until_a_write(world, monkeypatch):
    cls = type(world.health)
    original = cls.report
    calls: List[int] = []

    def counting(self):
        calls.append(1)
        return original(self)

    monkeypatch.setattr(cls, "report", counting)

    _get(world, "/api/v1/clean/health")
    _get(world, "/api/v1/clean/health")
    _get(world, "/api/v1/library/summary")  # a read between: still a hit
    assert len(calls) == 1

    # A decision is a write on another connection: the next read recomputes.
    accept_with_key(world.database, world.ids["4"], "10A")
    _get(world, "/api/v1/clean/health")
    assert len(calls) == 2
    _get(world, "/api/v1/clean/health")
    assert len(calls) == 2

    # A restore closes every connection: the generation moves, nothing else does.
    world.database.close_all()
    _get(world, "/api/v1/clean/health")
    assert len(calls) == 3


def test_a_waveform_write_recomputes_statistics_health_but_not_plays(world):
    from cuepoint.engine import statistics_api

    plays_calls: List[int] = []
    first_health = _get(world, "/api/v1/statistics/health")
    original = statistics_api._resolve  # noqa: SLF001

    def watching(name):
        service = original(name)
        plays_calls.append(name)
        return service

    statistics_api._resolve = watching  # noqa: SLF001
    try:
        _get(world, "/api/v1/statistics/plays")
        _get(world, "/api/v1/statistics/plays")
        assert len(plays_calls) == 1
        world.store.put(
            StoredWaveform(
                path="/music/2.mp3",
                size_bytes=10,
                mtime_ns=5,
                analysis_version=1,
                state=STORED_FAILED,
                analysed_at="2026-09-30T12:00:00+00:00",
                reason="undecodable",
            )
        )
        _get(world, "/api/v1/statistics/plays")
        assert len(plays_calls) == 1  # waveforms is not a domain of plays
        _get(world, "/api/v1/statistics/health")
        assert len(plays_calls) == 2  # but it is one of health
    finally:
        statistics_api._resolve = original  # noqa: SLF001
    assert first_health["total"] == 7


def _six_answers(world) -> Dict[str, Any]:
    from cuepoint.engine import statistics_api
    from cuepoint.engine.clean_api import library_health
    from cuepoint.engine.discover_api import options
    from cuepoint.engine.library_api import library_keys_population

    opened = options({})
    return {
        "clean/health": library_health({}),
        "statistics/plays": statistics_api.plays({"limit": ["10"]}),
        "statistics/plays since": statistics_api.plays(
            {"since": ["2026-01-01"], "tz": ["+00:00"]}
        ),
        "statistics/spreads": statistics_api.spreads({}),
        "statistics/health": statistics_api.health({}),
        "statistics/health collection": statistics_api.health(
            {"scope": [f"collection:{world.box}"]}
        ),
        "keys/population": library_keys_population([{"kind": "all"}]),
        "keys/population collection": library_keys_population(
            [{"kind": "collection", "id": world.box}]
        ),
        "discover/options artists": opened["artists"],
        "discover/options labels": opened["labels"],
    }


def test_the_answer_is_the_same_cached_and_uncached(world):
    revisions.set_enabled(False)
    uncached = _six_answers(world)
    revisions.set_enabled(True)
    revisions.clear_cache()
    first = _six_answers(world)  # computed, then kept
    second = _six_answers(world)  # from the memo
    assert uncached["clean/health"]["track_count"] == 7
    assert uncached["discover/options artists"]["values"]
    for name, answer in uncached.items():
        assert first[name] == answer, name
        assert second[name] == answer, name


def test_each_of_the_six_routes_is_actually_kept(world):
    entries = revisions._default_memo._entries  # noqa: SLF001
    _six_answers(world)
    routes = {key[0] for key in entries}
    assert routes >= {
        "clean/health",
        "statistics/plays",
        "statistics/spreads",
        "statistics/health",
        "library/keys/population",
        "discover/options/artists",
        "discover/options/labels",
    }


def test_a_missing_source_is_refused_each_time_and_never_kept(world):
    from cuepoint.engine.library_api import (
        SourceNotFoundError,
        library_keys_population,
    )

    for _ in range(2):
        with pytest.raises(SourceNotFoundError):
            library_keys_population([{"kind": "playlist", "id": 9999}])


def test_the_jobs_list_carries_the_revisions(world):
    first = _get(world, "/api/v1/jobs")["revisions"]
    assert set(first) == {"library", "waveforms", "discover"}
    assert all(isinstance(number, int) for number in first.values())
    assert _get(world, "/api/v1/jobs")["revisions"] == first
    accept_with_key(world.database, world.ids["5"], "5A")
    moved = _get(world, "/api/v1/jobs")["revisions"]
    assert moved["library"] != first["library"]
    assert moved["waveforms"] == first["waveforms"]
    world.store.put(
        StoredWaveform(
            path="/music/3.mp3",
            size_bytes=10,
            mtime_ns=5,
            analysis_version=1,
            state=STORED_FAILED,
            analysed_at="2026-09-30T12:00:00+00:00",
            reason="undecodable",
        )
    )
    assert _get(world, "/api/v1/jobs")["revisions"]["waveforms"] != moved["waveforms"]


def test_revision_cache_without_services_just_computes():
    reset_container()
    calls: List[int] = []
    revision_cache("r", {}, (LIBRARY,), lambda: calls.append(1))
    revision_cache("r", {}, (LIBRARY,), lambda: calls.append(1))
    assert len(calls) == 2


def test_a_catalog_write_moves_discover_and_leaves_the_library(world):
    """A dig caches catalog rows about once a second; the library's reads stay kept."""
    from cuepoint.persistence.beatport_catalog_repository import (
        BeatportCatalogRepository,
    )
    from tests.fixtures.beatport_library import NOW, catalog_track

    first = _get(world, "/api/v1/jobs")["revisions"]
    BeatportCatalogRepository(world.database).upsert_tracks(
        [catalog_track(4242, artists=[(1, "Someone")])], NOW
    )
    moved = _get(world, "/api/v1/jobs")["revisions"]
    assert moved["discover"] != first["discover"]
    assert moved["library"] == first["library"]
    accept_with_key(world.database, world.ids["6"], "6A")
    after = _get(world, "/api/v1/jobs")["revisions"]
    assert after["library"] != moved["library"]
    assert after["discover"] == moved["discover"]


def test_the_resolve_counts_follow_the_catalog(world, monkeypatch):
    """They read the catalog cache, so a Discover write must recompute them."""
    from cuepoint.engine.discover_api import options
    from cuepoint.persistence.beatport_catalog_repository import (
        BeatportCatalogRepository,
    )
    from cuepoint.services.beatport_resolve_service import BeatportResolveService
    from tests.fixtures.beatport_library import NOW, catalog_track

    original = BeatportResolveService.plan
    calls: List[int] = []

    def counting(self):
        calls.append(1)
        return original(self)

    monkeypatch.setattr(BeatportResolveService, "plan", counting)
    options({})
    options({})
    assert len(calls) == 1
    BeatportCatalogRepository(world.database).upsert_tracks(
        [catalog_track(4343, artists=[(1, "Someone")])], NOW
    )
    options({})
    assert len(calls) == 2
