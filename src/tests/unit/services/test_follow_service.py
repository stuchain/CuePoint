#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Following Beatport artists and labels (DEC-317).

Over a real library and the real entity page service, answered by the
in-memory Beatport of the discovery tests:

- **reads never ask Beatport**: follows, suggestions and the feed come from the
  cache, which only a check fills;
- **what is new** is what was released after ``seen_through``, which starts 30
  days back and moves forward only;
- **a check** goes through the entity page service, records one follow's
  refusal as that follow's state, and stops for no token.

Nothing here reaches the network.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.persistence.follow_repository import FollowRepository
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.wantlist_repository import WantlistRepository
from cuepoint.models.wantlist import WantlistEntry
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.discovery_service import local_date
from cuepoint.services.entity_page_service import EntityPageService
from cuepoint.services.follow_service import (
    EVENT_ADDED,
    EVENT_REMOVED,
    EVENT_SEEN,
    FollowService,
    forget_states,
)
from cuepoint.services.library_service import LibraryService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import accept, catalog_track
from tests.fixtures.beatport_world import BeatportWorld

pytestmark = pytest.mark.unit

NOW = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)
TODAY = local_date(NOW)


def days(n: int):
    return TODAY - timedelta(days=n)


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture(autouse=True)
def _forget_states():
    forget_states()
    yield
    forget_states()


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def world() -> BeatportWorld:
    """Âme (100) and Dixon (8) on Innervisions (900), at various ages."""
    beatport = BeatportWorld()
    beatport.add_track(11, days(10), (900, "Innervisions"), (1, "EP"), [(100, "Âme")])
    beatport.add_track(
        12, days(40), (900, "Innervisions"), (2, "LP"), [(100, "Âme"), (8, "Dixon")]
    )
    beatport.add_track(15, days(5), (900, "Innervisions"), (5, "New"), [(8, "Dixon")])
    beatport.add_track(16, days(5), (901, "Other"), (6, "Same Day"), [(100, "Âme")])
    return beatport


@pytest.fixture
def service(db, world, clock):
    return make_service(db, world, clock)


def make_service(db, world, clock) -> FollowService:
    catalog = BeatportCatalogRepository(db)
    credits = TrackCreditRepository(db)
    wantlist = WantlistRepository(db)
    library = LibraryService(
        TrackRepository(db),
        CollectionRepository(db),
        TrackMetadataRepository(db),
        AuthoredDataRepository(db),
    )
    pages = EntityPageService(
        credits=credits,
        catalog=catalog,
        lookups=DiscoveryRepository(db),
        wantlist=wantlist,
        library=library,
        beatport=BeatportApi(world),
        clock=clock,
    )
    return FollowService(
        db,
        FollowRepository(db),
        catalog,
        credits,
        wantlist,
        pages,
        ActivityService(ActivityRepository(db), TrackRepository(db)),
        clock=clock,
    )


class Library:
    def __init__(self, db) -> None:
        self.db = db
        self.tracks = TrackRepository(db)
        self.catalog = BeatportCatalogRepository(db)
        self._bp = 5_000_000

    def add(
        self,
        ref: str,
        artist: str,
        label: Optional[str] = None,
        *,
        beatport: Optional[Sequence[Tuple[int, str]]] = None,
        beatport_label: Optional[Tuple[int, str]] = None,
        owns: Optional[int] = None,
    ) -> int:
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=ref,
                file_path=f"/m/{ref}.mp3",
                title=ref,
                artist=artist,
                label=label,
            )
        )
        assert stored.id is not None
        if owns is not None:
            with self.db.transaction() as conn:
                accept(conn, stored.id, str(owns))
        elif beatport is not None or beatport_label is not None:
            self._bp += 1
            with self.db.transaction() as conn:
                accept(conn, stored.id, str(self._bp))
            self.catalog.upsert_tracks(
                [
                    catalog_track(
                        self._bp,
                        artists=list(beatport or ()),
                        label=beatport_label,
                    )
                ],
                NOW.isoformat(),
            )
        return stored.id


@pytest.fixture
def lib(db) -> Library:
    return Library(db)


def events(db, kind: str) -> List[Any]:
    return list(
        db.connect().execute(
            "SELECT summary FROM activity_events WHERE type = ?", (kind,)
        )
    )


def asked(world: BeatportWorld) -> int:
    return len(world.paths("catalog/tracks"))


def titles(feed: Dict[str, Any]) -> List[str]:
    return [row["title"] for row in feed["rows"]]


# ------------------------------------------------------------------ following


class TestFollowing:
    def test_a_follow_starts_its_new_window_thirty_days_back(self, service):
        change = service.add("artist", 100, "Âme")
        assert change["changed"] is True and change["followed"] is True
        assert change["follow"]["seen_through"] == days(30).isoformat()
        assert change["follow"]["followed_at"] == NOW.isoformat()
        assert service.is_followed("artist", 100)
        assert not service.is_followed("label", 100)

    def test_following_twice_changes_nothing_and_says_so_once(self, db, service):
        service.add("artist", 100, "Âme")
        again = service.add("artist", 100, "Renamed")
        assert again["changed"] is False
        assert again["follow"]["name"] == "Âme"
        assert len(events(db, EVENT_ADDED)) == 1

    def test_every_write_records_an_activity_event(self, db, service):
        service.add("label", 900, "Innervisions")
        service.mark_seen()
        service.remove("label", 900)
        assert [
            len(events(db, e)) for e in (EVENT_ADDED, EVENT_SEEN, EVENT_REMOVED)
        ] == [
            1,
            1,
            1,
        ]

    def test_an_unfollow_of_what_is_not_followed_is_reported_not_refused(
        self, db, service
    ):
        assert service.remove("artist", 1) == {"changed": False, "followed": False}
        assert events(db, EVENT_REMOVED) == []

    @pytest.mark.parametrize(
        "args",
        [
            ("genre", 1, "x"),
            ("artist", 0, "x"),
            ("artist", -4, "x"),
            ("artist", True, "x"),
            ("artist", "7", "x"),
            ("artist", 1, ""),
            ("artist", 1, "   "),
            ("artist", 1, 5),
            ("artist", 1, "x" * 301),
        ],
    )
    def test_what_cannot_be_followed_is_refused(self, service, args):
        with pytest.raises(ValueError):
            service.add(*args)
        assert service.follows()["follows"] == []

    def test_mark_seen_names_a_follow_by_kind_and_id_together(self, service):
        with pytest.raises(ValueError):
            service.mark_seen("artist", None)
        with pytest.raises(ValueError):
            service.mark_seen(None, 3)


# ------------------------------------------------------------------ suggestions


class TestSuggestions:
    @pytest.fixture
    def filled(self, lib):
        for i in range(3):
            lib.add(f"a{i}", "Âme", "Innervisions", beatport=[(100, "Âme")])
        lib.add("s1", "Solo", beatport=[(200, "Solo")])
        # Two Beatport artists share a name: it names neither.
        lib.add("t1", "Twin", beatport=[(300, "Twin")])
        lib.add("t2", "Twin", beatport=[(301, "Twin")])
        # A name resolution never linked.
        lib.add("u1", "Unlinked")
        for i in range(2):
            lib.add(
                f"n{i}", "Mara", "Nightfall", beatport_label=(900, "Nightfall Audio")
            )

    def test_artists_and_labels_are_ranked_together_by_owned_tracks(
        self, service, filled
    ):
        found = service.suggestions()["suggestions"]
        assert [(s["kind"], s["beatport_id"], s["track_count"]) for s in found][:2] == [
            ("artist", 100, 3),
            ("label", 900, 2),
        ]
        assert all(s["followed"] is False for s in found)
        assert {"kind", "beatport_id", "name", "track_count", "followed"} == set(
            found[0]
        )
        assert found[0]["name"] == "Âme"

    def test_a_name_linked_to_several_ids_or_none_is_not_offered(self, service, filled):
        ids = {
            (s["kind"], s["beatport_id"]) for s in service.suggestions()["suggestions"]
        }
        assert ("artist", 300) not in ids and ("artist", 301) not in ids
        assert all(
            s["name"] not in ("Twin", "Unlinked")
            for s in service.suggestions()["suggestions"]
        )

    def test_what_is_followed_is_left_out(self, service, filled):
        service.add("artist", 100, "Âme")
        found = service.suggestions()["suggestions"]
        assert ("artist", 100) not in {(s["kind"], s["beatport_id"]) for s in found}
        # A label with the same id is a different follow.
        service.add("label", 100, "Elsewhere")
        assert ("label", 900) in {(s["kind"], s["beatport_id"]) for s in found}

    def test_the_limit_applies_after_ranking(self, service, filled):
        found = service.suggestions(limit=1)["suggestions"]
        assert [(s["kind"], s["beatport_id"]) for s in found] == [("artist", 100)]

    @pytest.mark.parametrize("limit", [0, -1, 101, True, "5"])
    def test_a_limit_it_cannot_serve_is_refused(self, service, limit):
        with pytest.raises(ValueError):
            service.suggestions(limit=limit)

    def test_no_library_means_no_suggestions(self, service):
        assert service.suggestions() == {"suggestions": []}


# ------------------------------------------------------------------ check


class TestChecking:
    def test_it_reads_each_follow_through_the_entity_pages_once(self, service, world):
        service.add("artist", 100, "Âme")
        service.add("label", 900, "Innervisions")
        result = service.check()
        assert result["outcome"] == "ok" and result["failed"] == []
        assert (result["checked"], result["total"], result["from_cache"]) == (2, 2, 0)
        first = asked(world)
        assert first >= 2

    def test_a_fresh_listing_costs_nothing_but_refresh_asks_again(self, service, world):
        service.add("artist", 100, "Âme")
        service.check()
        first = asked(world)
        again = service.check()
        assert asked(world) == first and again["from_cache"] == 1
        service.check(refresh=True)
        assert asked(world) > first

    def test_a_listing_older_than_twelve_hours_is_read_again(
        self, service, world, clock
    ):
        service.add("artist", 100, "Âme")
        service.check()
        first = asked(world)
        clock.now = NOW + timedelta(hours=13)
        service.check()
        assert asked(world) > first

    def test_a_refusal_is_that_follows_state_and_the_rest_are_read(
        self, service, world
    ):
        service.add("artist", 100, "Âme")
        service.add("artist", 8, "Dixon")
        service.add("label", 900, "Innervisions")
        world.failures.append(
            lambda path, params, n: 403 if params.get("artist_id") == 8 else None
        )
        result = service.check()
        assert result["outcome"] == "ok"
        assert [
            (f["kind"], f["beatport_id"], f["state"]) for f in result["failed"]
        ] == [("artist", 8, "forbidden")]
        assert result["checked"] == 2
        listed = {f["beatport_id"]: f for f in service.follows()["follows"]}
        assert listed[8]["state"]["state"] == "forbidden"
        assert listed[8]["checked_at"] is None
        assert listed[100]["state"] is None and listed[100]["checked_at"] is not None
        feed = service.feed()
        assert [(s["beatport_id"], s["state"]) for s in feed["states"]] == [
            (8, "forbidden")
        ]

    def test_a_later_good_check_clears_the_state(self, service, world):
        service.add("artist", 8, "Dixon")
        world.failures.append(lambda path, params, n: 500)
        assert service.check()["failed"][0]["state"] == "unavailable"
        world.failures.clear()
        assert service.check()["failed"] == []
        assert service.follows()["follows"][0]["state"] is None

    def test_unfollowing_forgets_the_state(self, service, world):
        service.add("artist", 8, "Dixon")
        world.failures.append(lambda path, params, n: 500)
        service.check()
        service.remove("artist", 8)
        service.add("artist", 8, "Dixon")
        assert service.follows()["follows"][0]["state"] is None

    def test_no_token_ends_the_check_with_that_state(self, service, world):
        service.add("artist", 100, "Âme")
        service.add("label", 900, "Innervisions")
        world.access_token = ""
        result = service.check()
        assert result["outcome"] == "no_token" and result["state"] == "no_token"
        # It is the check's state, not any one follow's.
        assert result["failed"] == []
        assert all(f["state"] is None for f in service.follows()["follows"])
        assert service.feed()["states"] == []
        assert world.requests == []

    def test_it_reports_progress_and_can_be_stopped(self, service):
        service.add("artist", 100, "Âme")
        service.add("artist", 8, "Dixon")
        seen: List[Tuple[int, int]] = []
        service.check(on_progress=lambda done, total: seen.append((done, total)))
        assert seen == [(0, 2), (1, 2), (2, 2)]
        stop = {"now": False}

        def progress(done: int, total: int) -> None:
            stop["now"] = done >= 1

        result = service.check(
            refresh=True, on_progress=progress, should_cancel=lambda: stop["now"]
        )
        assert result["outcome"] == "cancelled" and result["checked"] == 1

    def test_with_nothing_followed_it_has_nothing_to_do(self, service, world):
        assert service.check() == {
            "outcome": "ok",
            "state": "ok",
            "checked": 0,
            "from_cache": 0,
            "failed": [],
            "total": 0,
        }
        assert world.requests == []


# ------------------------------------------------------------------ the feed


class TestTheFeed:
    @pytest.fixture
    def following(self, service):
        service.add("artist", 100, "Âme")
        service.add("artist", 8, "Dixon")
        service.add("label", 900, "Innervisions")
        service.check()

    def test_reads_never_ask_beatport(self, service, world, following):
        before = list(world.requests)
        service.follows()
        service.feed()
        service.feed("artist", 100, owned="all")
        service.suggestions()
        assert world.requests == before

    def test_a_follow_that_was_never_checked_has_an_empty_feed(self, service, world):
        service.add("artist", 100, "Âme")
        feed = service.feed()
        assert feed["rows"] == [] and feed["total"] == 0
        assert feed["checked_at"] is None and feed["unchecked"] == 1
        assert world.requests == []

    def test_only_releases_after_seen_through_are_new_newest_first(
        self, service, following
    ):
        feed = service.feed()
        # Track 12 is 40 days old, before the 30-day start. 15 and 16 share a
        # day, so the higher id comes first (as the entity page orders); 11 is
        # older.
        assert titles(feed) == ["Track 16", "Track 15", "Track 11"]
        assert feed["total"] == 3 and feed["hidden_owned"] == 0
        assert feed["follow_count"] == 3

    def test_a_track_by_two_follows_appears_once_naming_both(self, service, following):
        rows = {r["title"]: r for r in service.feed()["rows"]}
        assert [(s["kind"], s["beatport_id"]) for s in rows["Track 15"]["follows"]] == [
            ("artist", 8),
            ("label", 900),
        ]
        assert [s["name"] for s in rows["Track 16"]["follows"]] == ["Âme"]

    def test_a_row_is_the_shape_every_beatport_table_sends(self, service, following):
        row = service.feed()["rows"][0]
        assert {
            "beatport_track_id",
            "title",
            "release_date",
            "artists",
            "remixers",
            "owned",
            "on_wantlist",
            "follows",
        } <= set(row)

    def test_a_follow_is_picked_by_kind_and_id(self, service, following):
        feed = service.feed("artist", 100)
        assert titles(feed) == ["Track 16", "Track 11"]
        assert (
            feed["window"]["kind"] == "artist" and feed["window"]["beatport_id"] == 100
        )

    def test_mark_seen_empties_the_feed_and_only_moves_forward(
        self, service, following
    ):
        service.mark_seen("artist", 100)
        assert titles(service.feed("artist", 100)) == []
        assert titles(service.feed("artist", 8)) == ["Track 15"]
        moved = service.mark_seen()
        assert moved["changed"] == 2 and moved["seen_through"] == days(1).isoformat()
        assert service.feed()["rows"] == []
        assert service.mark_seen() == {
            "changed": 0,
            "seen_through": days(1).isoformat(),
        }

    def test_a_release_after_the_day_marked_seen_is_new(self, service, world, clock):
        service.add("artist", 100, "Âme")
        service.check()
        service.mark_seen()
        clock.now = NOW + timedelta(days=2)
        world.add_track(
            30,
            TODAY + timedelta(days=1),
            (900, "Innervisions"),
            (9, "Next"),
            [(100, "Âme")],
        )
        service.check(refresh=True)
        assert titles(service.feed()) == ["Track 30"]

    def test_owned_tracks_are_hidden_and_counted_by_default(
        self, service, lib, following
    ):
        lib.add("mine", "Âme", owns=11)
        hidden = service.feed()
        assert titles(hidden) == ["Track 16", "Track 15"]
        assert hidden["hidden_owned"] == 1 and hidden["total"] == 2
        shown = service.feed(owned="all")
        assert titles(shown) == ["Track 16", "Track 15", "Track 11"]
        assert shown["hidden_owned"] == 0
        owned_only = service.feed(owned="only")
        assert titles(owned_only) == ["Track 11"]
        assert owned_only["rows"][0]["owned"] is True

    def test_the_wantlist_is_marked(self, db, service, following):
        WantlistRepository(db).add(
            [WantlistEntry(beatport_track_id=16, added_at=NOW.isoformat())],
            [],
            NOW.isoformat(),
        )
        marks = {r["title"]: r["on_wantlist"] for r in service.feed()["rows"]}
        assert marks == {"Track 15": False, "Track 16": True, "Track 11": False}

    def test_it_pages(self, service, following):
        first = service.feed(offset=0, limit=2)
        rest = service.feed(offset=2, limit=2)
        assert titles(first) == ["Track 16", "Track 15"]
        assert titles(rest) == ["Track 11"]
        assert first["total"] == rest["total"] == 3

    def test_checked_at_is_the_oldest_listing_read(self, service, world, clock):
        service.add("artist", 100, "Âme")
        service.check()
        clock.now = NOW + timedelta(hours=10)
        service.add("label", 900, "Innervisions")
        service.check()
        feed = service.feed()
        assert feed["checked_at"] == NOW.isoformat() and feed["unchecked"] == 0

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"owned": "some"},
            {"offset": -1},
            {"limit": 0},
            {"limit": 501},
            {"limit": True},
            {"kind": "artist"},
            {"beatport_id": 5},
            {"kind": "genre", "beatport_id": 5},
        ],
    )
    def test_a_window_or_follow_it_cannot_answer_is_refused(self, service, kwargs):
        with pytest.raises(ValueError):
            service.feed(**kwargs)

    def test_new_counts_exclude_owned_and_come_from_the_cache(
        self, service, lib, world, following
    ):
        lib.add("mine", "Âme", owns=11)
        before = list(world.requests)
        listed = service.follows()
        assert world.requests == before
        counts = {
            (f["kind"], f["beatport_id"]): f["new_count"] for f in listed["follows"]
        }
        assert counts == {("artist", 100): 1, ("artist", 8): 1, ("label", 900): 1}
        # Track 15 is by two follows: the total counts it once, as the feed does.
        assert listed["new_count"] == 2 == service.feed()["total"]

    def test_a_follow_marked_seen_has_none_new(self, service, following):
        service.mark_seen("label", 900)
        counts = {
            f["beatport_id"]: f["new_count"] for f in service.follows()["follows"]
        }
        assert counts[900] == 0


# ------------------------------------------------------------------ review fixes


class TestMarkSeenKeepsTodayVisible:
    def test_a_release_published_later_today_is_still_new(self, service, world):
        service.add("artist", 100, "Âme")
        service.check()
        moved = service.mark_seen()
        assert moved["seen_through"] == days(1).isoformat()
        world.add_track(
            40, TODAY, (900, "Innervisions"), (9, "Later Today"), [(100, "Âme")]
        )
        service.check(refresh=True)
        assert titles(service.feed()) == ["Track 40"]
        assert service.follows()["follows"][0]["new_count"] == 1


class TestManyCachedTracks:
    @pytest.fixture
    def many(self, db, service):
        service.add("label", 900, "Innervisions")
        catalog = BeatportCatalogRepository(db)
        catalog.upsert_tracks(
            [
                catalog_track(
                    1000 + i,
                    artists=[(7, "Bulk")],
                    label=(900, "Innervisions"),
                    release_date=days(1).isoformat(),
                )
                for i in range(650)
            ],
            NOW.isoformat(),
        )

    def test_the_total_and_any_window_agree_with_the_count(self, service, many):
        counted = service.follows()["follows"][0]["new_count"]
        assert counted == 650
        assert service.follows()["new_count"] == 650
        feed = service.feed(limit=100)
        assert feed["total"] == 650
        seen = []
        for offset in range(0, 700, 100):
            page = service.feed(offset=offset, limit=100)
            assert page["total"] == 650
            seen += [r["beatport_track_id"] for r in page["rows"]]
        assert len(seen) == 650 and len(set(seen)) == 650
        assert seen == sorted(seen, reverse=True)

    def test_a_window_past_the_old_cap_has_rows(self, service, many):
        page = service.feed(offset=600, limit=100)
        assert len(page["rows"]) == 50


class TestOwnershipIsReadOnce:
    @pytest.fixture
    def following(self, service):
        service.add("artist", 100, "Âme")
        service.add("artist", 8, "Dixon")
        service.add("label", 900, "Innervisions")
        service.check()

    @pytest.fixture
    def reads(self, service, monkeypatch):
        calls: List[int] = []
        catalog = service._catalog
        real = catalog.owned_among
        real_tracks = catalog.entity_tracks

        def spy(ids):
            calls.append(1)
            return real(ids)

        def spy_tracks(*a, **k):
            calls.append(1)
            return real_tracks(*a, **k)

        monkeypatch.setattr(catalog, "owned_among", spy)
        monkeypatch.setattr(catalog, "entity_tracks", spy_tracks)
        return calls

    def test_follows_and_feed_read_it_once_each(self, service, following, reads):
        service.follows()
        assert len(reads) == 1
        service.feed()
        assert len(reads) == 2

    def test_a_check_reads_none(self, service, following, reads):
        service.check(refresh=True)
        assert reads == []


class TestSuggestionsCache:
    @pytest.fixture
    def statements(self, db):
        seen: List[str] = []
        db.connect().set_trace_callback(seen.append)
        return seen

    def aggregates(self, statements) -> int:
        return sum(1 for s in statements if "WITH links AS" in s)

    def test_reopening_reruns_nothing_until_the_library_changes(
        self, service, lib, statements
    ):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        first = service.suggestions()
        ran = self.aggregates(statements)
        assert ran >= 1
        assert service.suggestions() == first
        assert self.aggregates(statements) == ran
        lib.add("a2", "Solo", beatport=[(200, "Solo")])
        assert {s["beatport_id"] for s in service.suggestions()["suggestions"]} == {
            100,
            200,
        }
        assert self.aggregates(statements) > ran

    def test_a_follow_still_leaves_a_cached_candidate_out(self, service, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        assert len(service.suggestions()["suggestions"]) == 1
        service.add("artist", 100, "Âme")
        assert service.suggestions() == {"suggestions": []}
        service.remove("artist", 100)
        assert len(service.suggestions()["suggestions"]) == 1


class _Pages:
    """An entity page service that answers by follow, for the check's edges."""

    def __init__(self, real, behaviour) -> None:
        self._real = real
        self._behaviour = behaviour

    def beatport(self, kind, token, **kwargs):
        return self._behaviour(self._real, kind, token, kwargs)

    def __getattr__(self, name):
        return getattr(self._real, name)


class TestCheckEdges:
    def test_a_follow_removed_mid_check_gets_no_state(self, service, world):
        service.add("artist", 100, "Âme")
        service.add("artist", 8, "Dixon")
        world.failures.append(lambda path, params, n: 500)

        def behaviour(real, kind, token, kwargs):
            half = real.beatport(kind, token, **kwargs)
            if token == "bp:100":
                service.remove("artist", 100)
            return half

        service._pages = _Pages(service._pages, behaviour)
        result = service.check()
        assert [f["beatport_id"] for f in result["failed"]] == [8]
        service.add("artist", 100, "Âme")
        assert [
            f["state"] for f in service.follows()["follows"] if f["beatport_id"] == 100
        ] == [None]

    def test_an_unexpected_error_is_that_follows_unavailable_state(
        self, service, caplog
    ):
        service.add("artist", 100, "Âme")
        service.add("artist", 8, "Dixon")

        def behaviour(real, kind, token, kwargs):
            if token == "bp:8":
                raise RuntimeError("disk on fire")
            return real.beatport(kind, token, **kwargs)

        service._pages = _Pages(service._pages, behaviour)
        with caplog.at_level("WARNING"):
            result = service.check()
        assert result["outcome"] == "ok" and result["checked"] == 1
        assert [(f["beatport_id"], f["state"]) for f in result["failed"]] == [
            (8, "unavailable")
        ]
        assert "disk on fire" in caplog.text
        listed = {f["beatport_id"]: f for f in service.follows()["follows"]}
        assert listed[8]["state"]["state"] == "unavailable"
        assert listed[100]["state"] is None
