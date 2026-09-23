#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The wantlist (DISCOVER-06, DEC-093).

Over a real database with the real repositories, activity service and
DISCOVER-01's ``BeatportApi``, answered by the in-memory Beatport of the
discovery tests. Every operation, the idempotent add, bought and owned held
independent, and the event each change writes, in the change's own
transaction. Nothing here reaches the network.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.models.discovery_run import (
    OWNED_HIDE,
    OWNED_ONLY,
    RUN_SUCCEEDED,
    DiscoveryRun,
    DiscoveryRunSource,
)
from cuepoint.models.wantlist import BOUGHT_HIDE, BOUGHT_ONLY, MAX_NOTE_LENGTH
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.wantlist_repository import WantlistRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import classify_beatport_error
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.wantlist_service import (
    ACTION_ADDED,
    ACTION_BOUGHT,
    ACTION_NOTED,
    ACTION_REMOVED,
    ACTION_UNBOUGHT,
    EVENT_ID_LIMIT,
    EVENTS,
    MAX_CHANGE,
    WantlistService,
)
from tests.fixtures.beatport_library import accept, add_tracks, catalog_track
from tests.fixtures.beatport_world import BeatportWorld

NOW = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def world() -> BeatportWorld:
    beatport = BeatportWorld()
    for track_id in (501, 502, 503):
        beatport.add_track(
            track_id,
            NOW.date(),
            (7, "Nightfall Audio"),
            (70, "Night EP"),
            [(1, "Mara Veil")],
        )
    return beatport


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def activity(db) -> ActivityService:
    return ActivityService(ActivityRepository(db), TrackRepository(db))


def make_service(db, world, activity, clock) -> WantlistService:
    return WantlistService(
        database_service=db,
        wantlist=WantlistRepository(db),
        catalog=BeatportCatalogRepository(db),
        runs=DiscoveryRepository(db),
        beatport=BeatportApi(world),
        activity_service=activity,
        clock=clock,
    )


@pytest.fixture
def service(db, world, activity, clock) -> WantlistService:
    return make_service(db, world, activity, clock)


@pytest.fixture
def catalog(db) -> BeatportCatalogRepository:
    return BeatportCatalogRepository(db)


@pytest.fixture
def cached(catalog):
    """Tracks 1 to 4 in the catalog cache, as a run or a page leaves them."""
    catalog.upsert_tracks(
        [
            catalog_track(1, artists=[(1, "Mara Veil")], title="Lanterns"),
            catalog_track(2, artists=[(2, "Ame"), (3, "Dixon")]),
            catalog_track(3),
            catalog_track(4),
        ],
        NOW.isoformat(),
    )


@pytest.fixture
def run(db, cached) -> DiscoveryRun:
    runs = DiscoveryRepository(db)
    started = runs.start_run(DiscoveryRun(started_at=NOW.isoformat(), params_json="{}"))
    runs.record_found(
        started.id,
        [catalog_track(1), catalog_track(2)],
        [
            DiscoveryRunSource(
                run_id=started.id,
                beatport_track_id=i,
                source_type="chart",
                source_id=9,
                matched_on="Mara Veil",
            )
            for i in (1, 2)
        ],
        NOW.isoformat(),
        {},
    )
    return runs.finish_run(started.id, RUN_SUCCEEDED, NOW.isoformat())


def events(db, prefix: str = "discover.wantlist.") -> list:
    return [
        (row[0], row[1], json.loads(row[2]) if row[2] else {})
        for row in db.connect().execute(
            "SELECT type, summary, detail_json FROM activity_events"
            " WHERE type LIKE ? ORDER BY id",
            (prefix + "%",),
        )
    ]


def own(db, *beatport_ids: int) -> None:
    with db.transaction() as conn:
        start = int(
            conn.execute("SELECT coalesce(max(id), 0) + 1 FROM tracks").fetchone()[0]
        )
        for track_id, beatport_id in zip(
            add_tracks(conn, len(beatport_ids), start=start), beatport_ids
        ):
            accept(conn, track_id, str(beatport_id))


def listed(service) -> list:
    return [r.entry.beatport_track_id for r in service.page(descending=False).rows]


# ---------------------------------------------------------------------- add


class TestAdding:
    def test_from_a_run(self, db, service, run, world):
        change = service.add([2, 1], run_id=run.id)
        assert (change.action, change.changed) == (ACTION_ADDED, (2, 1))
        assert change.message == "Added 2 tracks to the wantlist"
        entry = service.get(1)
        assert (entry.added_from_run_id, entry.added_at) == (run.id, NOW.isoformat())
        assert world.requests == []
        assert events(db) == [
            (
                EVENTS[ACTION_ADDED],
                "Added 2 tracks to the wantlist",
                {"count": 2, "beatport_track_ids": [2, 1], "run_id": run.id},
            )
        ]

    def test_from_a_page_by_id(self, db, service, cached, world):
        change = service.add([1])
        assert (
            change.message
            == "Added “Lanterns (Original Mix)” by Mara Veil to the wantlist"
        )
        assert service.get(1).added_from_run_id is None
        assert world.requests == []

    def test_a_track_never_read_is_read_and_stored_with_it(
        self, db, service, catalog, world
    ):
        change = service.add([501])
        assert (change.changed, change.read_from_beatport) == ((501,), 1)
        assert catalog.get_tracks([501])[501].label_name == "Nightfall Audio"
        assert [p for p, _ in world.requests] == ["catalog/tracks/501"]
        assert events(db)[0][2]["read_from_beatport"] == 1

    def test_several_never_read_are_one_batched_request(self, service, world, cached):
        change = service.add([1, 501, 502, 503])
        assert change.changed == (1, 501, 502, 503)
        assert [p for p, _ in world.requests] == ["catalog/tracks"]

    def test_a_track_beatport_does_not_have_is_reported_not_added(
        self, db, service, cached
    ):
        change = service.add([1, 999])
        assert (change.changed, change.not_found) == ((1,), (999,))
        assert change.message.endswith("; 1 track not found on Beatport")
        assert listed(service) == [1]

    def test_nothing_found_writes_nothing(self, db, service):
        change = service.add([999])
        assert (change.changed, change.not_found) == ((), (999,))
        assert change.message == "Nothing changed: 1 track not found on Beatport"
        assert events(db) == []


class TestAddingIsIdempotent:
    def test_an_entry_that_exists_changes_nothing_and_says_so(
        self, db, service, cached
    ):
        service.add([1])
        service.set_note(1, "the dub")
        service.set_bought([1], True)
        before = service.get(1)
        change = service.add([1])
        assert (change.changed, change.unchanged) == ((), (1,))
        assert change.message == "Already on the wantlist"
        assert service.get(1) == before
        assert [e[0] for e in events(db)].count(EVENTS[ACTION_ADDED]) == 1

    def test_several_that_exist(self, service, cached):
        service.add([1, 2])
        assert service.add([2, 1]).message == "All 2 tracks are already on the wantlist"

    def test_some_new_some_not(self, db, service, cached):
        service.add([1])
        change = service.add([1, 2, 3])
        assert (change.changed, change.unchanged) == ((2, 3), (1,))
        assert change.message == "Added 2 tracks to the wantlist; 1 track already on it"

    def test_an_entry_that_exists_is_never_read_from_beatport(self, service, world):
        service.add([501])
        world.requests.clear()
        service.add([501])
        assert world.requests == []


class TestAddRefusals:
    @pytest.mark.parametrize(
        "ids", [[], [0], [-1], [True], ["1"], [1.0], "1", None, [2**63]]
    )
    def test_ids_that_are_not_beatport_track_ids(self, service, ids):
        with pytest.raises(ValueError):
            service.add(ids)

    def test_more_than_one_call_changes(self, service):
        with pytest.raises(ValueError):
            service.add(list(range(1, MAX_CHANGE + 2)))

    @pytest.mark.parametrize("run_id", [0, True, "1", 1.5])
    def test_a_run_id_that_is_not_one(self, service, cached, run_id):
        with pytest.raises(ValueError):
            service.add([1], run_id=run_id)

    def test_a_run_that_does_not_exist(self, db, service, cached, world):
        with pytest.raises(LookupError):
            service.add([1], run_id=404)
        assert listed(service) == [] and world.requests == []

    def test_a_track_the_run_did_not_find(self, db, service, run, world):
        with pytest.raises(ValueError, match="did not find 1 track: 3"):
            service.add([1, 3], run_id=run.id)
        assert listed(service) == [] and world.requests == [] and events(db) == []

    def test_no_token_when_a_track_must_be_read(self, db, activity, clock, cached):
        service = make_service(db, BeatportWorld(access_token=""), activity, clock)
        with pytest.raises(BeatportAPIError) as refused:
            service.add([1, 501])
        assert classify_beatport_error(refused.value) == "no_token"
        assert listed(service) == [] and events(db) == []

    def test_no_token_is_fine_when_nothing_must_be_read(
        self, db, activity, clock, cached
    ):
        service = make_service(db, BeatportWorld(access_token=""), activity, clock)
        assert service.add([1]).changed == (1,)

    def test_a_read_beatport_refuses_adds_nothing(self, db, service, world, cached):
        world.failures.append(lambda route, params, n: 401)
        with pytest.raises(BeatportAPIError) as refused:
            service.add([1, 501])
        assert classify_beatport_error(refused.value) == "rejected"
        assert listed(service) == [] and events(db) == []


# ------------------------------------------------------------------- remove


class TestRemoving:
    def test_it_removes_and_records_it(self, db, service, cached):
        service.add([1, 2, 3])
        change = service.remove([3, 1])
        assert (change.action, change.changed) == (ACTION_REMOVED, (3, 1))
        assert listed(service) == [2]
        assert events(db)[-1] == (
            EVENTS[ACTION_REMOVED],
            "Removed 2 tracks from the wantlist",
            {"count": 2, "beatport_track_ids": [3, 1]},
        )

    def test_one_is_named_even_though_it_is_gone(self, db, service, cached):
        service.add([1])
        assert service.remove([1]).message == (
            "Removed “Lanterns (Original Mix)” by Mara Veil from the wantlist"
        )

    def test_an_id_not_on_the_list_is_reported(self, db, service, cached):
        service.add([1])
        change = service.remove([1, 2])
        assert (change.changed, change.not_listed) == ((1,), (2,))
        assert change.message.endswith("; 1 track not on the wantlist")

    def test_removing_nothing_writes_nothing(self, db, service, cached):
        assert service.remove([1]).message == "That track is not on the wantlist"
        assert service.remove([1, 2]).message == (
            "Nothing changed: 2 tracks not on the wantlist"
        )
        assert events(db) == []

    def test_it_can_be_added_again(self, service, cached):
        service.add([1])
        service.remove([1])
        assert service.add([1]).changed == (1,)


# --------------------------------------------------------------------- note


class TestNotes:
    def test_set_trimmed_and_recorded(self, db, service, cached):
        service.add([1])
        change = service.set_note(1, "  the dub, not the original \n")
        assert (change.action, change.changed) == (ACTION_NOTED, (1,))
        assert service.get(1).note == "the dub, not the original"
        kind, summary, detail = events(db)[-1]
        assert (kind, detail["note"]) == (
            EVENTS[ACTION_NOTED],
            "the dub, not the original",
        )
        assert summary == "Noted “Lanterns (Original Mix)” by Mara Veil on the wantlist"

    @pytest.mark.parametrize("cleared", [None, "", "   "])
    def test_cleared_by_none_or_blank(self, db, service, cached, cleared):
        service.add([1])
        service.set_note(1, "x")
        change = service.set_note(1, cleared)
        assert change.changed == (1,) and service.get(1).note is None
        assert events(db)[-1][1].startswith("Cleared the note on ")

    def test_the_same_note_changes_nothing(self, db, service, cached):
        service.add([1])
        service.set_note(1, "x")
        change = service.set_note(1, " x ")
        assert (change.changed, change.unchanged) == ((), (1,))
        assert [e[0] for e in events(db)].count(EVENTS[ACTION_NOTED]) == 1

    def test_not_on_the_list(self, db, service):
        change = service.set_note(1, "x")
        assert (change.changed, change.not_listed) == ((), (1,))
        assert events(db) == []

    @pytest.mark.parametrize("note", [5, ["x"], "x" * (MAX_NOTE_LENGTH + 1)])
    def test_a_note_it_does_not_keep(self, service, cached, note):
        service.add([1])
        with pytest.raises(ValueError):
            service.set_note(1, note)

    @pytest.mark.parametrize("track_id", [0, True, "1"])
    def test_an_id_that_is_not_one(self, service, track_id):
        with pytest.raises(ValueError):
            service.set_note(track_id, "x")


# ------------------------------------------------------------------- bought


class TestBought:
    def test_mark_and_unmark(self, db, service, cached, clock):
        service.add([1, 2])
        change = service.set_bought([2, 1], True)
        assert (change.action, change.changed) == (ACTION_BOUGHT, (2, 1))
        assert service.get(1).bought_at == NOW.isoformat()
        change = service.set_bought([1], False)
        assert (change.action, change.changed) == (ACTION_UNBOUGHT, (1,))
        assert service.get(1).bought_at is None
        assert [e[0] for e in events(db)][-2:] == [
            EVENTS[ACTION_BOUGHT],
            EVENTS[ACTION_UNBOUGHT],
        ]

    def test_marking_again_keeps_the_first_moment(self, db, service, cached, clock):
        service.add([1, 2])
        service.set_bought([1], True)
        clock.now = LATER
        change = service.set_bought([1, 2], True)
        assert (change.changed, change.unchanged) == ((2,), (1,))
        assert change.message == "Marked 1 track bought; 1 track already bought"
        assert service.get(1).bought_at == NOW.isoformat()
        assert service.get(2).bought_at == LATER.isoformat()

    def test_nothing_to_change(self, db, service, cached):
        service.add([1])
        service.set_bought([1], True)
        assert service.set_bought([1], True).message == "Already marked bought"
        assert (
            service.set_bought([3], True).message == "That track is not on the wantlist"
        )
        assert service.set_bought([1, 3], True).message == (
            "Nothing changed: 1 track already bought, 1 track not on the wantlist"
        )
        assert [e[0] for e in events(db)].count(EVENTS[ACTION_BOUGHT]) == 1

    @pytest.mark.parametrize("bought", [1, "yes", None])
    def test_bought_is_a_boolean(self, service, cached, bought):
        with pytest.raises(ValueError):
            service.set_bought([1], bought)


# --------------------------------------------------------- owned and bought


class TestOwnedAndBoughtAreIndependent:
    def test_all_four_combinations(self, db, service, cached):
        service.add([1, 2, 3, 4])
        service.set_bought([2, 4], True)
        own(db, 3, 4)
        rows = {
            r.entry.beatport_track_id: (r.owned, r.entry.is_bought)
            for r in service.page().rows
        }
        assert rows == {
            1: (False, False),
            2: (False, True),
            3: (True, False),
            4: (True, True),
        }

    def test_bought_and_not_owned_yet(self, db, service, cached):
        service.add([1, 2, 3])
        service.set_bought([1, 2], True)
        own(db, 2)
        page = service.page(owned=OWNED_HIDE, bought=BOUGHT_ONLY)
        assert [r.entry.beatport_track_id for r in page.rows] == [1]
        page = service.page(owned=OWNED_ONLY, bought=BOUGHT_HIDE)
        assert page.rows == ()

    def test_becoming_owned_removes_nothing_and_marks_nothing(
        self, db, service, cached
    ):
        service.add([1])
        before = service.get(1)
        own(db, 1)
        assert service.get(1) == before
        assert service.page().rows[0].owned is True

    def test_marking_bought_does_not_make_it_owned(self, service, cached):
        service.add([1])
        service.set_bought([1], True)
        assert service.page().rows[0].owned is False


# ------------------------------------------------------------ transactions


class FailingActivity(ActivityService):
    def record_event(self, event_type, summary, detail=None):
        raise RuntimeError("the feed is full")


class TestAChangeAndItsEventAreOne:
    @pytest.mark.parametrize(
        "change",
        [
            lambda s: s.add([2]),
            lambda s: s.remove([1]),
            lambda s: s.set_note(1, "x"),
            lambda s: s.set_bought([1], True),
        ],
    )
    def test_an_event_that_cannot_be_written_undoes_the_change(
        self, db, world, clock, cached, change
    ):
        good = make_service(
            db,
            world,
            ActivityService(ActivityRepository(db), TrackRepository(db)),
            clock,
        )
        good.add([1])
        before = [(r.entry, r.owned) for r in good.page().rows]
        failing = make_service(
            db,
            world,
            FailingActivity(ActivityRepository(db), TrackRepository(db)),
            clock,
        )
        with pytest.raises(RuntimeError):
            change(failing)
        assert [(r.entry, r.owned) for r in good.page().rows] == before

    def test_a_catalog_row_read_for_a_failed_add_is_not_kept(
        self, db, world, clock, catalog
    ):
        failing = make_service(
            db,
            world,
            FailingActivity(ActivityRepository(db), TrackRepository(db)),
            clock,
        )
        with pytest.raises(RuntimeError):
            failing.add([501])
        assert catalog.get_tracks([501]) == {}


class TestEvents:
    def test_a_large_change_lists_the_first_ids_and_counts_them_all(
        self, db, service, catalog
    ):
        ids = list(range(1, EVENT_ID_LIMIT + 51))
        catalog.upsert_tracks([catalog_track(i) for i in ids], NOW.isoformat())
        service.add(ids)
        (_, summary, detail) = events(db)[-1]
        assert summary == f"Added {len(ids)} tracks to the wantlist"
        assert detail["count"] == len(ids)
        assert detail["beatport_track_ids"] == ids[:EVENT_ID_LIMIT]

    def test_no_library_history_is_written(self, db, service, cached):
        service.add([1])
        service.set_bought([1], True)
        assert (
            db.connect().execute("SELECT count(*) FROM track_history").fetchone()[0]
            == 0
        )


# ------------------------------------------------------------------- keeping


class TestItIsKept:
    def test_across_a_relaunch(self, tmp_path, world, clock):
        path = tmp_path / "kept.db"
        first = DatabaseService(db_path=path)
        MigrationRunner(first).migrate()
        BeatportCatalogRepository(first).upsert_tracks(
            [catalog_track(1)], NOW.isoformat()
        )
        activity = ActivityService(ActivityRepository(first), TrackRepository(first))
        make_service(first, world, activity, clock).add([1])
        make_service(first, world, activity, clock).set_note(1, "keep")
        first.close_all()
        second = DatabaseService(db_path=path)
        activity = ActivityService(ActivityRepository(second), TrackRepository(second))
        assert make_service(second, world, activity, clock).get(1).note == "keep"
        second.close_all()

    def test_a_deleted_run_leaves_its_entries(self, db, service, run):
        service.add([1], run_id=run.id)
        DiscoveryRepository(db).delete_run(run.id)
        assert service.get(1).added_from_run_id is None

    def test_a_change_to_dict_is_what_a_caller_shows(self, service, cached):
        service.add([1])
        assert service.add([1, 2]).to_dict() == {
            "action": ACTION_ADDED,
            "changed": [2],
            "unchanged": [1],
            "not_listed": [],
            "not_found": [],
            "read_from_beatport": 0,
            "message": "Added “Track 2 (Original Mix)” by Ame, Dixon to the wantlist;"
            " 1 track already on it",
        }
