#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Discovery over the library, kept as runs (DISCOVER-05).

Every test runs the real service over a real library database — tracks written
through ``TrackRepository``, so the credit index and label keys are the ones an
import writes — and DISCOVER-01's real ``BeatportApi`` over
:class:`~tests.fixtures.beatport_world.BeatportWorld`, an in-memory Beatport
that counts every request. The parity test runs inCrate's own
``run_discovery`` against the same world, while both exist (DISCOVER-12
deletes it with this test's parity class).
"""

from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pytest

from cuepoint.incrate.discovery import run_discovery
from cuepoint.models.discovery_run import (
    OWNED_ALL,
    OWNED_ONLY,
    RUN_CANCELLED,
    RUN_FAILED,
    RUN_SUCCEEDED,
    SORT_ARTIST,
    SORT_RELEASE_DATE,
    SORT_TITLE,
    DiscoveryRun,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.discovery_service import (
    DEFAULT_CHART_DAYS,
    DEFAULT_NEW_RELEASES_DAYS,
    EVENT_DISCOVERY_RAN,
    INTERRUPTED_ERROR,
    MAX_WINDOW_DAYS,
    NOT_FOUND_LOOKUP_MAX_AGE,
    STAGE_CHARTS,
    STAGE_LABELS,
    STAGE_RELEASES,
    DiscoveryRequest,
    DiscoveryService,
)
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import accept
from tests.fixtures.beatport_world import BeatportWorld, Chart

TODAY = date(2026, 9, 23)
NOW = datetime.combine(TODAY, time(12), tzinfo=timezone.utc)

NIGHTFALL = (40211, "Nightfall Audio")
MARA = (301001, "Mara Veil")
DJEFF = (132419, "DJEFF")

#: The library: three artists, two labels. "Cold Room" is not on Beatport.
LIBRARY = [
    ("One", "Mara Veil", "Nightfall Audio"),
    ("Two", "DJEFF", "Cold Room"),
    ("Three", "Kiko", "NIGHTFALL-AUDIO"),
]


class Clock:
    def __init__(self, now: datetime = NOW) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class Config:
    def __init__(self, values: Dict[str, Any]) -> None:
        self.values = values

    def get(self, key: str, default: Any = None) -> Any:
        return self.values.get(key, default)


def standard_world(today: date = TODAY) -> BeatportWorld:
    """Charts in two chosen genres and one not, and one label's releases.

    - C1 (genre 5, 3 days ago) by Mara Veil: tracks 1, 2, 3.
    - C2 (genre 5, 5 days ago) by DJEFF, whose account is named otherwise:
      tracks 3 and 4 — track 3's second reason.
    - C3 (genre 6) by no artist, published by the account "Kiko": track 5.
    - C4 (genre 6) by an artist not in the library: track 6.
    - C5 (genre 5) by Mara Veil but 60 days old; C6 by Mara Veil in genre 7.
    - Nightfall Audio: release 700 (2 days ago) with tracks 7 and 8, release
      701 (4 days ago) with track 2 — track 2's second reason — and release
      702 (90 days ago) with track 9.
    """
    world = BeatportWorld()
    day = lambda n: today - timedelta(days=n)  # noqa: E731
    for track_id in range(1, 7):
        world.add_track(track_id, day(20), (1, "Elsewhere"), (600 + track_id, "R"))
    world.add_track(7, day(2), NIGHTFALL, (700, "Lantern EP"), [MARA])
    world.add_track(8, day(2), NIGHTFALL, (700, "Lantern EP"))
    world.add_track(2, day(4), NIGHTFALL, (701, "Signal EP"))
    world.add_track(9, day(90), NIGHTFALL, (702, "Old EP"))
    world.add_track(10, day(20), (1, "Elsewhere"), (610, "R"))
    world.add_chart(
        Chart(1, "Mara's September", (5,), day(3), (1, 2, 3), MARA, "Mara Veil")
    )
    world.add_chart(
        Chart(2, "DJEFF picks", (5, 6), day(5), (3, 4), DJEFF, "OFFICIALDJEFFMUSIC")
    )
    world.add_chart(Chart(3, "Kiko's crate", (6,), day(10), (5,), None, "Kiko"))
    world.add_chart(Chart(4, "A stranger", (6,), day(1), (6,), (999, "Stranger"), "x"))
    world.add_chart(Chart(5, "Mara's July", (5,), day(60), (10,), MARA, "Mara Veil"))
    world.add_chart(Chart(6, "Mara elsewhere", (7,), day(3), (10,), MARA, "Mara Veil"))
    return world


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def add_library(db, rows: Sequence[Tuple[str, str, Optional[str]]]) -> List[int]:
    TrackRepository(db).add_many(
        [
            LibraryTrack(rekordbox_track_id=f"rb{i}", title=t, artist=a, label=lab)
            for i, (t, a, lab) in enumerate(rows, start=1)
        ]
    )
    return [
        int(r["id"]) for r in db.connect().execute("SELECT id FROM tracks ORDER BY id")
    ]


@pytest.fixture
def library(db) -> List[int]:
    return add_library(db, LIBRARY)


@pytest.fixture
def world() -> BeatportWorld:
    return standard_world()


def make(
    db, world, clock=None, config=None, activity=True, **kwargs
) -> DiscoveryService:
    return DiscoveryService(
        DiscoveryRepository(db),
        TrackCreditRepository(db),
        BeatportApi(world),
        ActivityService(ActivityRepository(db), TrackRepository(db))
        if activity
        else None,
        config,
        clock=clock or Clock(),
        **kwargs,
    )


def request(service: DiscoveryService, **kwargs: Any) -> DiscoveryRequest:
    kwargs.setdefault("genre_ids", [5, 6])
    return service.request(**kwargs)


def found(db, run_id: int) -> List[int]:
    page = DiscoveryRepository(db).run_tracks(run_id, owned=OWNED_ALL, limit=500)
    return [row.track.beatport_track_id for row in page.rows]


def reasons(db, run_id: int) -> Dict[int, List[Tuple[str, int, str]]]:
    by_track: Dict[int, List[Tuple[str, int, str]]] = {}
    for s in DiscoveryRepository(db).run_sources(run_id):
        by_track.setdefault(s.beatport_track_id, []).append(
            (s.source_type, s.source_id, s.matched_on)
        )
    return by_track


def events(db) -> List[Dict[str, Any]]:
    return [
        {"type": r[0], "summary": r[1], "detail": json.loads(r[2])}
        for r in db.connect().execute(
            "SELECT type, summary, detail_json FROM activity_events ORDER BY id"
        )
    ]


def searches(world: BeatportWorld) -> int:
    return len(world.paths("catalog/search")) + len(
        [p for p in world.paths("catalog/labels") if p == "catalog/labels"]
    )


# ------------------------------------------------------------------ request


class TestTheRequest:
    def test_defaults_come_from_config_and_incrate(self, db):
        config = Config(
            {
                "incrate.discovery_genre_ids": [5, "6", 5, "x", -1],
                "incrate.new_releases_days": 14,
            }
        )
        asked = make(db, BeatportWorld(), config=config).request()
        assert asked == DiscoveryRequest(
            genre_ids=(5, 6),
            charts_from=TODAY - timedelta(days=DEFAULT_CHART_DAYS),
            charts_to=TODAY,
            new_releases_days=14,
        )

    def test_with_no_config_there_are_no_genres_and_thirty_days(self, db):
        asked = make(db, BeatportWorld()).request()
        assert (asked.genre_ids, asked.new_releases_days) == (
            (),
            DEFAULT_NEW_RELEASES_DAYS,
        )

    @pytest.mark.parametrize("days", [0, 367, "30", None, 10.5])
    def test_nonsense_configured_days_fall_back(self, db, days):
        config = Config({"incrate.new_releases_days": days})
        assert (
            make(db, BeatportWorld(), config=config).request().new_releases_days == 30
        )

    def test_a_config_that_raises_falls_back(self, db):
        class Broken:
            def get(self, key, default=None):
                raise RuntimeError("config gone")

        asked = make(db, BeatportWorld(), config=Broken()).request()
        assert (asked.genre_ids, asked.new_releases_days) == ((), 30)

    def test_given_values_win_and_names_are_cleaned(self, db):
        asked = make(db, BeatportWorld()).request(
            genre_ids=[6, 5, 6],
            charts_from=date(2026, 9, 1),
            charts_to=date(2026, 9, 10),
            new_releases_days=7,
            artists=[" Mara Veil ", "", "Mara Veil", "Kiko"],
            labels=[],
        )
        assert asked == DiscoveryRequest(
            (6, 5), date(2026, 9, 1), date(2026, 9, 10), 7, ("Mara Veil", "Kiko"), ()
        )

    def test_only_the_end_of_the_window_given(self, db):
        asked = make(db, BeatportWorld()).request(charts_to=date(2026, 5, 31))
        assert asked.charts_from == date(2026, 5, 1)

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"genre_ids": [True]},
            {"genre_ids": [0]},
            {"genre_ids": ["house"]},
            {"genre_ids": list(range(1, 52))},
            {"charts_from": date(2026, 9, 10), "charts_to": date(2026, 9, 1)},
            {"charts_from": TODAY - timedelta(days=MAX_WINDOW_DAYS)},
            {"new_releases_days": 0},
            {"new_releases_days": MAX_WINDOW_DAYS + 1},
            {"new_releases_days": True},
            {"artists": "Mara Veil"},
            {"labels": [3]},
        ],
    )
    def test_what_a_run_cannot_use_is_refused(self, db, kwargs):
        with pytest.raises(ValueError):
            make(db, BeatportWorld()).request(**kwargs)


# ---------------------------------------------------------------------- run


class TestARun:
    def test_it_finds_chart_tracks_then_release_tracks_in_first_seen_order(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(request(service))
        assert run.outcome == RUN_SUCCEEDED
        assert found(db, run.id) == [1, 2, 3, 4, 5, 7, 8]

    def test_every_reason_is_kept_not_only_the_first(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service))
        why = reasons(db, run.id)
        assert why[3] == [("chart", 1, "Mara Veil"), ("chart", 2, "DJEFF")]
        assert why[2] == [
            ("chart", 1, "Mara Veil"),
            ("label_release", 701, "NIGHTFALL-AUDIO"),
        ]
        assert why[5] == [("chart", 3, "Kiko")]
        assert why[7] == [("label_release", 700, "NIGHTFALL-AUDIO")]

    def test_a_reason_names_its_source(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service))
        sources = {
            (s.source_type, s.source_id): s
            for s in DiscoveryRepository(db).run_sources(run.id)
        }
        chart = sources[("chart", 2)]
        assert (chart.source_name, chart.source_url) == (
            "DJEFF picks",
            "https://www.beatport.com/chart/chart-2/2",
        )
        release = sources[("label_release", 700)]
        assert (release.source_name, release.source_url) == ("Lantern EP", None)

    def test_its_counts(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service))
        assert (
            run.artists_in_scope,
            run.labels_in_scope,
            run.labels_resolved,
            run.charts_read,
            run.releases_read,
            run.tracks_found,
        ) == (3, 2, 1, 3, 2, 7)

    def test_only_matching_charts_cost_a_second_request(self, db, library, world):
        service = make(db, world)
        service.run(request(service))
        read = sorted(p for p in world.paths("catalog/charts/") if p.endswith("tracks"))
        assert read == [f"catalog/charts/{c}/tracks" for c in (1, 2, 3)]

    def test_every_found_track_is_in_the_catalog_cache(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service))
        cached = BeatportCatalogRepository(db).get_tracks(found(db, run.id))
        assert set(cached) == {1, 2, 3, 4, 5, 7, 8}
        assert cached[7].label_name == "Nightfall Audio"
        assert [c.artist_id for c in BeatportCatalogRepository(db).credits(7)] == [
            MARA[0]
        ]

    def test_the_scope_is_recorded_as_resolved(self, db, library, world):
        service = make(db, world)
        run = service.run(
            request(service, artists=None, labels=["nightfall audio", "Nobody"])
        )
        params = run.params
        assert params["genre_ids"] == [5, 6]
        assert params["charts_to"] == TODAY.isoformat()
        assert params["releases_from"] == (TODAY - timedelta(days=30)).isoformat()
        assert params["artists"] == {
            "picked": None,
            "count": 3,
            "linked_ids": 0,
            "scope": [
                {"key": "djeff", "name": "DJEFF"},
                {"key": "kiko", "name": "Kiko"},
                {"key": "mara veil", "name": "Mara Veil"},
            ],
        }
        assert params["labels"] == {
            "picked": ["nightfall audio", "Nobody"],
            "count": 1,
            "linked_ids": 0,
            "scope": [{"key": "nightfall audio", "name": "NIGHTFALL-AUDIO"}],
        }
        assert (run.labels_in_scope, run.artists_in_scope) == (1, 3)

    def test_one_activity_event_says_what_it_found(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service))
        [event] = events(db)
        assert event["type"] == EVENT_DISCOVERY_RAN
        assert event["summary"] == "Discovery found 7 tracks in 3 charts and 2 releases"
        assert event["detail"]["run_id"] == run.id
        assert event["detail"]["outcome"] == "succeeded"

    def test_progress_reports_each_stage(self, db, library, world):
        service = make(db, world)
        seen: List[Tuple[str, int, int]] = []
        service.run(request(service), on_progress=lambda *p: seen.append(p))
        assert seen == [
            (STAGE_CHARTS, 0, 2),
            (STAGE_CHARTS, 1, 2),
            (STAGE_CHARTS, 2, 2),
            (STAGE_LABELS, 0, 2),
            (STAGE_LABELS, 1, 2),
            (STAGE_LABELS, 2, 2),
            (STAGE_RELEASES, 0, 1),
            (STAGE_RELEASES, 1, 1),
        ]

    def test_the_job_id_is_kept(self, db, library, world):
        service = make(db, world)
        assert service.run(request(service), job_id="job-7").job_id == "job-7"

    def test_a_chart_in_two_chosen_genres_is_read_once(self, db, library, world):
        service = make(db, world)
        service.run(request(service))
        assert world.paths("catalog/charts/2/tracks") == ["catalog/charts/2/tracks"]

    def test_nothing_in_the_library_finds_nothing_and_asks_nothing(self, db, world):
        service = make(db, world)
        run = service.run(request(service))
        assert (run.outcome, run.tracks_found, world.requests) == (RUN_SUCCEEDED, 0, [])


class TestParityWithInCrate:
    """The same inputs give the tracks inCrate's run_discovery finds, in its
    order — and the second reasons inCrate dropped."""

    class Inventory:
        def get_library_artists(self) -> List[str]:
            return ["DJEFF", "Kiko", "Mara Veil"]

        def get_library_labels(self) -> List[str]:
            return ["Cold Room", "Nightfall Audio"]

    def test_the_same_tracks_in_the_same_order(self, db, library):
        today = date.today()
        world = standard_world(today)
        clock = Clock(datetime.combine(today, time(12), tzinfo=timezone.utc))
        incrate = run_discovery(
            self.Inventory(),
            BeatportApi(world),
            [5, 6],
            today - timedelta(days=30),
            today,
            new_releases_days=30,
        )
        service = make(db, world, clock=clock)
        run = service.run(
            service.request(
                genre_ids=[5, 6],
                charts_from=today - timedelta(days=30),
                charts_to=today,
                new_releases_days=30,
            )
        )
        assert found(db, run.id) == [t.beatport_track_id for t in incrate]
        assert len(DiscoveryRepository(db).run_sources(run.id)) == len(incrate) + 2

    def test_and_with_fewer_requests(self, db, library):
        today = date.today()
        world = standard_world(today)
        run_discovery(
            self.Inventory(),
            BeatportApi(world),
            [5, 6],
            today - timedelta(days=30),
            today,
        )
        incrate_requests = len(world.requests)
        world.requests.clear()
        clock = Clock(datetime.combine(today, time(12), tzinfo=timezone.utc))
        service = make(db, world, clock=clock)
        service.run(service.request(genre_ids=[5, 6]))
        assert len(world.requests) < incrate_requests


# ------------------------------------------------------------------- labels


class TestLabels:
    def test_a_second_run_makes_no_label_searches(self, db, library, world):
        service = make(db, world)
        service.run(request(service))
        first = searches(world)
        assert first > 0
        world.requests.clear()
        run = service.run(request(service))
        assert searches(world) == 0
        assert run.labels_resolved == 1
        assert found(db, run.id) == [1, 2, 3, 4, 5, 7, 8]

    def test_not_found_is_trusted_for_its_age_then_asked_again(
        self, db, library, world
    ):
        clock = Clock()
        service = make(db, world, clock=clock)
        service.run(request(service))
        clock.now = NOW + NOT_FOUND_LOOKUP_MAX_AGE - timedelta(minutes=1)
        world.requests.clear()
        service.run(request(service))
        assert searches(world) == 0
        clock.now = NOW + NOT_FOUND_LOOKUP_MAX_AGE + timedelta(minutes=1)
        world.requests.clear()
        service.run(request(service))
        # "Cold Room" is asked again; "Nightfall Audio", found, is not.
        asked = [params.get("q") for _, params in world.requests]
        assert "Cold Room" in asked
        assert "Nightfall Audio" not in asked

    def test_a_label_resolution_linked_is_used_without_a_search(self, db, world):
        """A library label spelled unlike Beatport's, linked by a resolved track."""
        ids = add_library(db, [("One", "Somebody", "Nightfall")])
        with db.transaction() as conn:
            accept(conn, ids[0], "8")
        BeatportCatalogRepository(db).upsert_tracks(
            [BeatportApi(world).get_track(8)], NOW.isoformat()
        )
        world.requests.clear()
        service = make(db, world)
        run = service.run(request(service, genre_ids=[]))
        assert searches(world) == 0
        assert (run.labels_resolved, found(db, run.id)) == (1, [7, 8, 2])
        assert run.params["labels"]["linked_ids"] == 1

    def test_a_failed_search_is_not_remembered(self, db, library, world):
        world.failures.append(
            lambda path, params, n: 503 if params.get("q") == "Cold Room" else None
        )
        service = make(db, world)
        run = service.run(request(service))
        assert run.outcome == RUN_SUCCEEDED
        assert DiscoveryRepository(db).lookups("label", ["cold room"]) == {}
        world.failures.clear()
        world.requests.clear()
        service.run(request(service))
        assert "Cold Room" in [p.get("q") for _, p in world.requests]

    def test_an_override_is_the_label_read(self, db, library, world):
        TrackMetadataRepository(db).set_override(library[1], "label", "Nightfall Audio")
        service = make(db, world)
        run = service.run(request(service))
        assert [e["key"] for e in run.params["labels"]["scope"]] == ["nightfall audio"]
        assert world.paths("catalog/search") and "Cold Room" not in [
            p.get("q") for _, p in world.requests
        ]


# ----------------------------------------------------------------- identity


class TestIdentity:
    """DEC-095: a Beatport id is the identity where resolution has one."""

    @pytest.fixture
    def linked(self, db, world):
        """Kiko resolved to Beatport artist 55 through an accepted match."""
        ids = add_library(db, [("One", "Kiko", None), ("Two", "Mara Veil", None)])
        world.add_track(
            20,
            TODAY - timedelta(days=100),
            (1, "Elsewhere"),
            (620, "R"),
            [(55, "Kiko")],
        )
        with db.transaction() as conn:
            accept(conn, ids[0], "20")
        BeatportCatalogRepository(db).upsert_tracks(
            [BeatportApi(world).get_track(20)], NOW.isoformat()
        )
        world.charts.clear()
        day = TODAY - timedelta(days=2)
        world.add_chart(Chart(11, "Renamed", (5,), day, (1,), (55, "KIKO (FR)"), "k"))
        world.add_chart(Chart(12, "Homonym", (5,), day, (2,), (56, "Kiko"), "k2"))
        world.add_chart(Chart(13, "Unlinked", (5,), day, (3,), MARA, "m"))
        world.add_chart(Chart(14, "Account", (5,), day, (4,), None, "Kiko"))
        return ids

    def test_by_id_by_name_and_by_account(self, db, world, linked):
        service = make(db, world)
        run = service.run(request(service, genre_ids=[5]))
        why = reasons(db, run.id)
        assert why[1] == [("chart", 11, "Kiko")]  # by id, whatever it is called
        assert 2 not in why  # another artist called Kiko
        assert why[3] == [("chart", 13, "Mara Veil")]  # by name: no id known
        assert why[4] == [("chart", 14, "Kiko")]  # an account, by its name
        assert run.params["artists"]["linked_ids"] == 1


# -------------------------------------------------------------------- scope


class TestScope:
    def test_picked_artists_narrow_the_charts_by_any_spelling(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, artists=["MARA VEIL"], labels=[]))
        assert found(db, run.id) == [1, 2, 3]
        assert (run.artists_in_scope, run.labels_in_scope) == (1, 0)

    def test_an_empty_selection_is_none_not_all(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, artists=[], labels=[]))
        assert (run.tracks_found, world.requests) == (0, [])

    def test_no_genres_reads_no_charts(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, genre_ids=[]))
        assert world.paths("catalog/charts") == []
        assert found(db, run.id) == [7, 8, 2]

    def test_a_picked_name_not_in_the_library_is_not_searched(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, artists=[], labels=["Anjunabeats"]))
        assert (run.labels_in_scope, searches(world)) == (0, 0)


# ------------------------------------------------------------ cancel, fail


class TestCancel:
    def test_a_cancel_mid_releases_keeps_the_charts_tracks(self, db, library, world):
        service = make(db, world)
        run = service.run(
            request(service),
            should_cancel=lambda: bool(world.paths("catalog/search")),
        )
        assert run.outcome == RUN_CANCELLED
        assert found(db, run.id) == [1, 2, 3, 4, 5]
        assert (run.charts_read, run.tracks_found, run.error) == (3, 5, None)
        assert events(db)[0]["summary"] == (
            "Discovery cancelled; found 5 tracks in 3 charts and 0 releases"
        )

    def test_a_cancel_mid_releases_keeps_what_the_labels_before_it_gave(
        self, db, library, world
    ):
        """Cold Room is on Beatport here too, and is read first (by key)."""
        world.add_track(
            30, TODAY - timedelta(days=1), (40300, "Cold Room"), (730, "Cold EP")
        )
        service = make(db, world)
        run = service.run(
            request(service),
            should_cancel=lambda: len(world.paths("catalog/tracks")) >= 1,
        )
        assert run.outcome == RUN_CANCELLED
        assert found(db, run.id) == [1, 2, 3, 4, 5, 30]
        assert (run.labels_resolved, run.releases_read, run.charts_read) == (2, 1, 3)
        assert world.paths("catalog/tracks") == ["catalog/tracks"]

    def test_a_cancel_before_anything_asks_nothing(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service), should_cancel=lambda: True)
        assert (run.outcome, world.requests) == (RUN_CANCELLED, [])


class TestFailures:
    def test_a_rejected_token_mid_run_fails_it_and_keeps_the_rows(
        self, db, library, world
    ):
        world.failures.append(
            lambda path, params, n: 401 if "label_id" in params else None
        )
        service = make(db, world)
        run = service.run(request(service))
        assert (run.outcome, run.error_class) == (RUN_FAILED, "rejected")
        assert found(db, run.id) == [1, 2, 3, 4, 5]
        assert run.labels_resolved == 1
        assert events(db)[0]["summary"] == (
            "Discovery stopped because Beatport rejected the token;"
            " found 5 tracks in 3 charts and 0 releases"
        )
        assert events(db)[0]["detail"]["error_class"] == "rejected"

    @pytest.mark.parametrize(
        "status, kind", [(403, "forbidden"), (429, "rate_limited")]
    )
    def test_a_refusal_every_request_would_repeat_stops_at_once(
        self, db, library, world, status, kind
    ):
        world.failures.append(lambda path, params, n: status)
        service = make(db, world)
        run = service.run(request(service))
        assert (run.outcome, run.error_class, len(world.requests)) == (
            RUN_FAILED,
            kind,
            1,
        )

    def test_three_failures_in_a_row_fail_it_as_unavailable(self, db, library, world):
        world.failures.append(lambda path, params, n: 503)
        service = make(db, world)
        run = service.run(request(service))
        assert (run.outcome, run.error_class, len(world.requests)) == (
            RUN_FAILED,
            "unavailable",
            3,
        )

    def test_one_failure_skips_what_failed_and_carries_on(self, db, library, world):
        world.failures.append(
            lambda path, params, n: 503 if path == "catalog/charts/2/tracks" else None
        )
        service = make(db, world)
        run = service.run(request(service))
        assert run.outcome == RUN_SUCCEEDED
        assert found(db, run.id) == [1, 2, 3, 5, 7, 8]
        assert run.charts_read == 2

    def test_a_run_with_no_token_fails_as_no_token(self, db, library, world):
        world.access_token = ""
        from cuepoint.services.beatport_api_client import BeatportApiClient

        service = DiscoveryService(
            DiscoveryRepository(db),
            TrackCreditRepository(db),
            BeatportApi(BeatportApiClient("https://api.beatport.com/v4", "")),
            clock=Clock(),
        )
        with pytest.raises(Exception):
            service.require_token()
        run = service.run(request(service))
        assert (run.outcome, run.error_class) == (RUN_FAILED, "no_token")

    def test_an_error_that_is_not_beatports_still_ends_the_run(
        self, db, library, world, monkeypatch
    ):
        from cuepoint.services import discovery_service

        def broken(*args, **kwargs):
            raise KeyError("a bug")

        monkeypatch.setattr(discovery_service, "chart_curator", broken)
        service = make(db, world)
        run = service.run(request(service))
        assert (run.outcome, run.error_class, run.error) == (
            RUN_FAILED,
            None,
            "'a bug'",
        )
        assert not DiscoveryRepository(db).get_run(run.id).is_running
        assert events(db)[0]["summary"].startswith(
            "Discovery stopped because of an error"
        )


# ---------------------------------------------------------------- ownership


class TestOwnership:
    def test_owned_tracks_are_hidden_and_counted(self, db, library, world):
        with db.transaction() as conn:
            accept(conn, library[0], "3")
        service = make(db, world)
        run = service.run(request(service))
        page = service.run_tracks(run.id)
        assert [r.track.beatport_track_id for r in page.rows] == [1, 2, 4, 5, 7, 8]
        assert (page.total, page.tracks, page.owned, page.hidden) == (6, 7, 1, 1)
        only = service.run_tracks(run.id, owned=OWNED_ONLY)
        assert [(r.track.beatport_track_id, r.owned) for r in only.rows] == [(3, True)]
        assert only.hidden == 0

    def test_a_track_accepted_after_the_run_reads_as_owned_when_reopened(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(request(service))
        assert service.run_tracks(run.id).owned == 0
        with db.transaction() as conn:
            accept(conn, library[2], "7", decided_by="user")
        page = service.run_tracks(run.id)
        assert (page.owned, page.hidden) == (1, 1)
        assert 7 not in [r.track.beatport_track_id for r in page.rows]


# ------------------------------------------------------------------ reading


class TestReadingRuns:
    @pytest.fixture
    def ran(self, db, library, world) -> Tuple[DiscoveryService, DiscoveryRun]:
        service = make(db, world)
        return service, service.run(request(service))

    def test_a_window_carries_its_artists_and_reasons(self, ran):
        service, run = ran
        [row] = service.run_tracks(run.id, owned=OWNED_ALL, offset=5, limit=1).rows
        assert (row.position, row.track.beatport_track_id, row.artists) == (
            5,
            7,
            ("Mara Veil",),
        )
        assert [(s.source_type, s.source_id) for s in row.sources] == [
            ("label_release", 700)
        ]

    @pytest.mark.parametrize(
        "sort, descending, expected",
        [
            (SORT_RELEASE_DATE, True, [7, 8, 2, 1, 3, 4, 5]),
            (SORT_TITLE, False, [1, 2, 3, 4, 5, 7, 8]),
            (SORT_ARTIST, False, [7, 1, 2, 3, 4, 5, 8]),
        ],
    )
    def test_its_sorts(self, ran, sort, descending, expected):
        service, run = ran
        page = service.run_tracks(
            run.id, owned=OWNED_ALL, sort=sort, descending=descending
        )
        assert [r.track.beatport_track_id for r in page.rows] == expected

    def test_a_missing_run(self, ran):
        service, _ = ran
        with pytest.raises(LookupError):
            service.run_tracks(999)

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"owned": "some"},
            {"sort": "bpm"},
            {"limit": 0},
            {"limit": 501},
            {"offset": -1},
        ],
    )
    def test_a_window_it_does_not_answer(self, ran, kwargs):
        service, run = ran
        with pytest.raises(ValueError):
            service.run_tracks(run.id, **kwargs)

    def test_runs_newest_first_and_deleted(self, db, ran, world):
        service, first = ran
        second = service.run(request(service))
        assert [r.id for r in service.list_runs()] == [second.id, first.id]
        assert service.get_run(first.id) == first
        assert service.delete_run(first.id) is True
        assert service.delete_run(first.id) is False
        assert [r.id for r in service.list_runs()] == [second.id]
        # The catalog rows stay: the other run holds them, and the cache is shared.
        assert len(BeatportCatalogRepository(db).get_tracks(range(1, 11))) == 7


class TestInterruptedRuns:
    def test_a_run_a_crash_left_open_is_closed_as_failed_keeping_its_tracks(self, db):
        runs = DiscoveryRepository(db)
        run = runs.start_run(DiscoveryRun(started_at=NOW.isoformat(), params_json="{}"))
        from tests.fixtures.beatport_library import catalog_track

        runs.record_found(run.id, [catalog_track(5)], [], NOW.isoformat(), {})
        service = make(db, BeatportWorld())
        assert service.close_interrupted() == [run.id]
        closed = runs.get_run(run.id)
        assert (closed.outcome, closed.error, closed.tracks_found) == (
            RUN_FAILED,
            INTERRUPTED_ERROR,
            1,
        )
        assert closed.finished_at == NOW.isoformat()
        assert service.close_interrupted() == []


# ------------------------------------------------------------------ commits


class Ticker:
    """A monotonic clock that moves on by ``step`` seconds each time it is read."""

    def __init__(self, step: float) -> None:
        self.step = step
        self.now = 0.0

    def __call__(self) -> float:
        self.now += self.step
        return self.now


class TestCommits:
    """A run commits what it finds at most once a second, and always before it
    ends, so a cancel or failure keeps everything and a crash loses at most a
    second's findings."""

    def spy(self, service, monkeypatch) -> List[int]:
        commits: List[int] = []
        real = service._runs.record_found

        def counting(run_id, tracks, sources, fetched_at, counts):
            commits.append(len(tracks))
            return real(run_id, tracks, sources, fetched_at, counts)

        monkeypatch.setattr(service._runs, "record_found", counting)
        return commits

    def test_within_a_second_everything_is_one_commit(
        self, db, library, world, monkeypatch
    ):
        service = make(db, world, monotonic=Ticker(0.0))
        commits = self.spy(service, monkeypatch)
        run = service.run(request(service))
        assert commits == [9]  # 5 chart reads' tracks and 3 release tracks, 1 repeated
        assert run.tracks_found == 7

    def test_once_a_second_has_passed_each_find_is_committed(
        self, db, library, world, monkeypatch
    ):
        service = make(db, world, monotonic=Ticker(2.0))
        commits = self.spy(service, monkeypatch)
        service.run(request(service))
        assert commits == [3, 2, 1, 3]  # C1, C2, C3, then Nightfall's releases

    def test_a_run_holding_many_tracks_commits_them(
        self, db, library, world, monkeypatch
    ):
        from cuepoint.services import discovery_service

        monkeypatch.setattr(discovery_service, "FLUSH_TRACKS", 3)
        service = make(db, world, monotonic=Ticker(0.0))
        commits = self.spy(service, monkeypatch)
        service.run(request(service))
        assert commits == [3, 3, 3]

    def test_a_cancel_commits_what_it_holds_first(
        self, db, library, world, monkeypatch
    ):
        service = make(db, world, monotonic=Ticker(0.0))
        commits = self.spy(service, monkeypatch)
        run = service.run(
            request(service), should_cancel=lambda: bool(world.paths("catalog/search"))
        )
        assert (commits, run.tracks_found) == ([6], 5)

    def test_a_failure_commits_what_it_holds_first(
        self, db, library, world, monkeypatch
    ):
        world.failures.append(
            lambda path, params, n: 401 if "label_id" in params else None
        )
        service = make(db, world, monotonic=Ticker(0.0))
        commits = self.spy(service, monkeypatch)
        run = service.run(request(service))
        assert (commits, run.tracks_found, run.outcome) == ([6], 5, RUN_FAILED)
