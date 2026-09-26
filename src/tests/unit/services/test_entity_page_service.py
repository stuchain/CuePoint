#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Artist and Label pages (DISCOVER-07, DEC-094, DEC-095, DEC-098).

Over a real library, the Library's own service, and DISCOVER-01's real
``BeatportApi`` answered by the in-memory Beatport of the discovery tests:

- **references** parse, fold and redirect as DEC-095 asks;
- **the library half** is a rule set the Library's browse takes as it is, and
  every number in the header is the Library's own answer over it;
- **the Beatport half** has every state from a mocked API, reads a listing
  once and then from the cache, looks a label up by name and never an artist.

Nothing here reaches the network.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional, Sequence, Tuple

import pytest

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION
from cuepoint.models.beatport_cache import ENTITY_LABEL, BeatportNameLookup
from cuepoint.models.beatport_listing import BeatportListing
from cuepoint.models.discovery_run import OWNED_HIDE
from cuepoint.models.entity_page import (
    ACTION_RESOLVE,
    ACTION_SETTINGS,
    IDENTITY_BEATPORT,
    IDENTITY_NAME,
    REASON_NOT_ON_BEATPORT,
    REASON_NOT_RESOLVED,
    REASON_SHARED,
    STATE_FORBIDDEN,
    STATE_NAME_ONLY,
    STATE_NO_TOKEN,
    STATE_OK,
    STATE_RATE_LIMITED,
    STATE_REJECTED,
    STATE_UNAVAILABLE,
)
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.wantlist import WantlistEntry
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.wantlist_repository import WantlistRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.discovery_service import NOT_FOUND_LOOKUP_MAX_AGE, local_date
from cuepoint.services.entity_page_service import (
    LISTING_MAX_AGE,
    RECENT_DAYS,
    SUMMARY_TOP_VALUES,
    EntityPageService,
)
from cuepoint.services.library_service import LibraryService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import accept, catalog_track
from tests.fixtures.beatport_world import BeatportWorld

pytestmark = pytest.mark.unit

NOW = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)
TODAY = local_date(NOW)


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
def clock() -> Clock:
    return Clock()


@pytest.fixture
def world() -> BeatportWorld:
    """Beatport: Âme (100) on Innervisions (900), Dixon (8), and older tracks."""
    beatport = BeatportWorld()
    days = lambda n: TODAY - timedelta(days=n)  # noqa: E731
    beatport.add_track(11, days(10), (900, "Innervisions"), (1, "EP"), [(100, "Âme")])
    beatport.add_track(
        12, days(40), (900, "Innervisions"), (2, "LP"), [(100, "Âme"), (8, "Dixon")]
    )
    beatport.add_track(13, days(200), (901, "Other"), (3, "Old"), [(100, "Âme")])
    beatport.add_track(
        14, days(400), (900, "Innervisions"), (4, "Older"), [(100, "Âme")]
    )
    beatport.add_track(15, days(5), (900, "Innervisions"), (5, "New"), [(8, "Dixon")])
    return beatport


class Library:
    def __init__(self, db) -> None:
        self.db = db
        self.tracks = TrackRepository(db)
        self.catalog = BeatportCatalogRepository(db)
        self.credits = TrackCreditRepository(db)
        self._bp = 5_000_000

    def add(
        self,
        ref: str,
        artist: str,
        label: Optional[str] = None,
        *,
        beatport: Optional[Sequence[Tuple[int, str]]] = None,
        beatport_label: Optional[Tuple[int, str]] = None,
        bp_track: Optional[int] = None,
        genre: Optional[str] = None,
        year: Optional[int] = None,
        read: bool = True,
    ) -> int:
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=ref,
                file_path=f"/m/{ref}.mp3",
                title=ref,
                artist=artist,
                label=label,
                genre=genre,
                year=year,
            )
        )
        assert stored.id is not None
        if beatport is not None or beatport_label is not None or not read:
            self._bp += 1
            number = bp_track or self._bp
            with self.db.transaction() as conn:
                accept(conn, stored.id, str(number))
            if read:
                self.catalog.upsert_tracks(
                    [
                        catalog_track(
                            number,
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


@pytest.fixture
def library(db) -> LibraryService:
    return LibraryService(
        TrackRepository(db),
        CollectionRepository(db),
        TrackMetadataRepository(db),
        AuthoredDataRepository(db),
    )


def make_service(db, library, world, clock) -> EntityPageService:
    return EntityPageService(
        credits=TrackCreditRepository(db),
        catalog=BeatportCatalogRepository(db),
        lookups=DiscoveryRepository(db),
        wantlist=WantlistRepository(db),
        library=library,
        beatport=BeatportApi(world),
        clock=clock,
    )


@pytest.fixture
def service(db, library, world, clock) -> EntityPageService:
    return make_service(db, library, world, clock)


def titles(library: LibraryService, rules: RuleSet) -> List[str]:
    return sorted(
        t.title for t in library.browse_tracks(rules=rules, limit=1000).tracks
    )


# --------------------------------------------------------------- references


class TestReferences:
    def test_a_name_of_punctuation_keeps_it(self, service):
        assert service.reference("artist", "name:!!!").token == "name:!!!"

    def test_a_name_is_folded_to_its_key(self, service):
        assert service.reference("artist", "name:ÂME").token == "name:ame"
        assert service.reference("label", "name:  Nightfall   Audio ").token == (
            "name:nightfall audio"
        )

    def test_an_id_is_as_written(self, service):
        assert service.reference("label", "bp:900").beatport_id == 900

    @pytest.mark.parametrize(
        "kind, token",
        [
            ("artist", "bp:0"),
            ("artist", "name:"),
            ("artist", "Âme"),
            ("genre", "bp:1"),
            ("artist", "name:" + "a" * 5000),
        ],
    )
    def test_what_names_nothing_is_refused(self, service, kind, token):
        with pytest.raises(ValueError):
            service.reference(kind, token)


class TestResolving:
    def test_an_id_page_is_named_by_beatport_and_scoped_by_its_id(self, service, lib):
        lib.add("a1", "Ame", beatport=[(100, "Âme")])
        resolution = service.resolve("artist", "bp:100")
        assert resolution.ref.identity == IDENTITY_BEATPORT
        assert resolution.name == "Âme"
        assert (
            resolution.rules
            == RuleSet(rules=(FilterRule("beatport_artist", "is", 100),)).validated()
        )
        assert [(n.name_key, n.tracks) for n in resolution.names] == [("ame", 1)]
        assert not resolution.redirected

    def test_an_unlinked_name_is_a_name_page(self, service, lib):
        lib.add("a1", "Âme")
        lib.add("a2", "AME, Dixon")
        resolution = service.resolve("artist", "name:ame")
        assert resolution.ref.identity == IDENTITY_NAME
        assert resolution.name == "AME"
        assert resolution.rules.rules == (FilterRule("artist_name", "is", "AME"),)
        assert resolution.links == ()

    def test_a_name_linked_to_one_artist_redirects_to_its_id(self, service, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.add("a2", "Ame")
        resolution = service.resolve("artist", "name:Ame")
        assert resolution.ref.token == "bp:100"
        assert resolution.requested.token == "name:ame"
        assert resolution.redirected
        assert resolution.to_dict()["redirected_from"] == "name:ame"

    def test_a_name_two_artists_share_stays_a_name_and_lists_both(self, service, lib):
        lib.add("t1", "Twin", beatport=[(300, "Twin")])
        lib.add("t2", "Twin", beatport=[(301, "Twin")])
        lib.add("t3", "Twin", beatport=[(301, "Twin")])
        resolution = service.resolve("artist", "name:twin")
        assert resolution.ref.identity == IDENTITY_NAME
        assert [(link.beatport_id, link.tracks) for link in resolution.links] == [
            (301, 2),
            (300, 1),
        ]

    def test_a_label_linked_by_resolution_redirects(self, service, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n2", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n3", "A", "Nightfall", beatport_label=(950, "Nightfall Records"))
        resolution = service.resolve("label", "name:nightfall")
        assert resolution.ref.token == "bp:900"
        assert resolution.name == "Nightfall Audio"
        assert [n.name_key for n in resolution.names] == ["nightfall"]

    def test_a_name_the_library_does_not_hold_is_scoped_by_its_key(self, service):
        resolution = service.resolve("label", "name:somewhere")
        assert resolution.name is None
        assert resolution.rules.rules == (FilterRule("label_name", "is", "somewhere"),)

    def test_an_id_nothing_knows_has_no_name(self, service):
        resolution = service.resolve("artist", "bp:424242")
        assert resolution.name is None and resolution.names == ()


# ------------------------------------------------------------- library half


@pytest.fixture
def filled(lib, db):
    lib.add(
        "a1", "Âme", "Innervisions", beatport=[(100, "Âme")], genre="House", year=2019
    )
    lib.add("a2", "Ame", "Innervisions", genre="House", year=2021)
    lib.add("a3", "Ame, Dixon", "Diynamic", genre="Techno", year=2024)
    lib.add("a4", "AME", None, genre=None, year=None)
    lib.add(
        "x1",
        "Solo",
        "Innervisions",
        beatport=[(200, "Solo")],
        genre="Techno",
        year=2010,
    )
    lib.add(
        "n1", "Mara", "Nightfall", beatport_label=(900, "Nightfall Audio"), year=2015
    )
    lib.add("n2", "Mara, Âme", "Nightfall", genre="Deep House")
    TrackCreditRepository(db).mark_built(ENTITY_NAMES_VERSION, NOW.isoformat())


class TestTheLibraryHalf:
    @pytest.mark.parametrize(
        "kind, token",
        [
            ("artist", "bp:100"),
            ("artist", "name:ame"),
            ("artist", "name:solo"),
            ("label", "bp:900"),
            ("label", "name:innervisions"),
            ("label", "name:nightfall"),
        ],
    )
    def test_the_header_is_the_library_s_own_answer(
        self, service, library, filled, kind, token
    ):
        page = service.page(kind, token)
        rules = page.resolution.rules
        table = library.browse_tracks(rules=rules, limit=1000)
        assert page.library.tracks == table.total == len(table.tracks) > 0
        assert page.library.genres == library.facet(
            "genre", rules=rules, limit=SUMMARY_TOP_VALUES
        )
        related = "label_name" if kind == "artist" else "artist_name"
        assert page.library.related == library.facet(
            related, rules=rules, limit=SUMMARY_TOP_VALUES
        )
        years = [t.year for t in table.tracks if t.year is not None]
        assert (page.library.first_year, page.library.last_year) == (
            (min(years), max(years)) if years else (None, None)
        )
        # Every facet count adds up to the table: the header cannot disagree.
        assert sum(v.count for v in page.library.genres.values) == table.total

    def test_an_artist_page_by_id_gathers_the_name_s_unresolved_tracks(
        self, service, library, filled
    ):
        page = service.page("artist", "bp:100")
        assert titles(library, page.resolution.rules) == ["a1", "a2", "a3", "a4", "n2"]

    def test_a_name_page_and_its_id_page_hold_the_same_tracks(
        self, service, library, filled
    ):
        # "name:ame" redirects to bp:100, and nothing is lost on the way.
        by_name = service.page("artist", "name:ame")
        assert by_name.resolution.redirected
        assert titles(library, by_name.resolution.rules) == titles(
            library, RuleSet(rules=(FilterRule("artist_name", "is", "Âme"),))
        )

    def test_the_labels_an_artist_is_on(self, service, filled):
        page = service.page("artist", "bp:100")
        assert page.library.related.field == "label_name"
        assert {v.value for v in page.library.related.values} == {
            "Innervisions",
            "Diynamic",
            "Nightfall",
            None,
        }

    def test_the_artists_on_a_label(self, service, filled):
        page = service.page("label", "name:nightfall")
        assert page.resolution.ref.token == "bp:900"
        assert {v.value for v in page.library.related.values} == {"Mara", "Âme"}

    @pytest.mark.parametrize(
        "kind, token", [("artist", "bp:100"), ("label", "name:nightfall")]
    )
    def test_the_rules_cross_the_bridge_unchanged(
        self, service, library, filled, kind, token
    ):
        # The renderer hands the rule set to the Library as it came, as JSON.
        page = service.page(kind, token)
        sent = page.to_dict()["rules"]
        assert sent == page.resolution.rules.to_dict()
        assert titles(library, RuleSet.from_dict(sent)) == titles(
            library, page.resolution.rules
        )

    @pytest.mark.parametrize("kind, token", [("artist", "bp:100"), ("label", "bp:900")])
    def test_a_smart_collection_of_the_rules_finds_the_same_tracks(
        self, db, service, library, filled, kind, token
    ):
        # DEC-043: the page and a saved Smart Collection mean the same thing.
        tracks = TrackRepository(db)
        activity = ActivityService(ActivityRepository(db), tracks)
        collections = CollectionService(CollectionRepository(db), db, tracks, activity)
        rules = service.page(kind, token).resolution.rules
        smart = collections.create_smart("Saved", rules)
        saved = collections.resolve(int(smart.id)).require_query()
        assert sorted(
            t.title for t in tracks.browse(saved, limit=1000, offset=0)
        ) == titles(library, rules)

    def test_it_says_when_the_name_index_is_still_being_built(self, service, lib, db):
        lib.add("a1", "Âme")
        assert service.page("artist", "name:ame").library.index_current is False
        TrackCreditRepository(db).mark_built(ENTITY_NAMES_VERSION, NOW.isoformat())
        assert service.page("artist", "name:ame").library.index_current is True

    def test_an_empty_page_is_an_answer(self, service):
        page = service.page("label", "bp:31337")
        assert page.library.tracks == 0
        assert (page.library.first_year, page.library.last_year) == (None, None)


# ------------------------------------------------------------ Beatport half


def _tracks(half) -> List[int]:
    return [row.track.beatport_track_id for row in half.page.rows]


class TestTheBeatportHalfOfAnId:
    def test_an_artist_s_recent_tracks_newest_first(self, service, world):
        half = service.beatport("artist", "bp:100")
        assert half.state == STATE_OK and half.page is not None
        # A year back: 13 at 200 days is in it, 14 at 400 is not.
        assert _tracks(half) == [11, 12, 13]
        assert half.since == (TODAY - timedelta(days=RECENT_DAYS["artist"])).isoformat()
        assert half.until == TODAY.isoformat()
        assert half.beatport_id == 100 and not half.found_by_name
        assert not half.from_cache and half.fetched_at == NOW.isoformat()
        assert world.paths("catalog/tracks") and all(
            params.get("artist_id") == 100
            for path, params in world.requests
            if path == "catalog/tracks"
        )

    def test_a_label_s_recent_tracks_cover_a_shorter_window(self, service):
        half = service.beatport("label", "bp:900")
        # Ninety days: 15 and 11 and 12; 14, at 400 days, is not.
        assert _tracks(half) == [15, 11, 12]

    def test_each_track_is_marked_owned_and_on_the_wantlist(self, service, lib, db):
        lib.add("own", "Âme", beatport=[(100, "Âme")], bp_track=12)
        service.beatport("artist", "bp:100")
        WantlistRepository(db).add([WantlistEntry(11, NOW.isoformat())])
        half = service.beatport("artist", "bp:100")
        marks = {
            r.track.beatport_track_id: (r.owned, r.on_wantlist) for r in half.page.rows
        }
        assert marks == {11: (False, True), 12: (True, False), 13: (False, False)}
        assert half.page.owned == 1

    def test_the_owned_filter_and_window(self, service, lib):
        lib.add("own", "Âme", beatport=[(100, "Âme")], bp_track=12)
        hidden = service.beatport("artist", "bp:100", owned=OWNED_HIDE)
        assert _tracks(hidden) == [11, 13] and hidden.page.total == 2
        window = service.beatport("artist", "bp:100", offset=1, limit=1)
        assert _tracks(window) == [12] and window.page.total == 3

    def test_an_artist_with_no_recent_releases_is_ok_and_empty(self, service):
        half = service.beatport("artist", "bp:77777")
        assert half.state == STATE_OK and half.page.total == 0
        assert "0 tracks" in half.message


class TestTheListingIsReadOnceAndThenFromTheCache:
    def test_a_second_look_asks_beatport_nothing(self, service, world):
        service.beatport("artist", "bp:100")
        asked = len(world.requests)
        again = service.beatport("artist", "bp:100")
        assert len(world.requests) == asked
        assert again.from_cache and _tracks(again) == [11, 12, 13]
        assert again.fetched_at == NOW.isoformat()

    def test_a_stale_listing_is_read_again(self, service, world, clock):
        service.beatport("artist", "bp:100")
        asked = len(world.requests)
        clock.now = NOW + LISTING_MAX_AGE + timedelta(minutes=1)
        again = service.beatport("artist", "bp:100")
        assert len(world.requests) > asked and not again.from_cache

    def test_one_just_inside_its_age_is_not(self, service, world, clock):
        service.beatport("artist", "bp:100")
        asked = len(world.requests)
        clock.now = NOW + LISTING_MAX_AGE - timedelta(minutes=1)
        assert service.beatport("artist", "bp:100").from_cache
        assert len(world.requests) == asked

    def test_refresh_reads_it_again_however_fresh(self, service, world):
        service.beatport("label", "bp:900")
        asked = len(world.requests)
        assert not service.beatport("label", "bp:900", refresh=True).from_cache
        assert len(world.requests) > asked

    def test_a_listing_for_a_shorter_window_does_not_answer_a_longer_one(
        self, service, world, db
    ):
        BeatportCatalogRepository(db).store_listing(
            BeatportListing("artist", 100, TODAY.isoformat(), NOW.isoformat(), 0),
            [],
        )
        half = service.beatport("artist", "bp:100")
        assert not half.from_cache and _tracks(half) == [11, 12, 13]

    def test_a_new_release_reaches_the_page_once_it_is_read_again(
        self, service, world, clock
    ):
        service.beatport("label", "bp:900")
        world.add_track(16, TODAY, (900, "Innervisions"), (6, "Today"), [(8, "Dixon")])
        assert 16 not in _tracks(service.beatport("label", "bp:900"))
        clock.now = NOW + LISTING_MAX_AGE + timedelta(hours=1)
        assert 16 in _tracks(service.beatport("label", "bp:900"))


class TestEveryStateFromTheApi:
    def test_no_token_asks_nothing_and_points_to_settings(self, service, world):
        world.access_token = ""
        half = service.beatport("artist", "bp:100")
        assert (half.state, half.action) == (STATE_NO_TOKEN, ACTION_SETTINGS)
        assert half.page is None and world.requests == []
        assert half.beatport_id == 100

    @pytest.mark.parametrize(
        "status, state, action",
        [
            (401, STATE_REJECTED, ACTION_SETTINGS),
            (403, STATE_FORBIDDEN, ACTION_SETTINGS),
            (429, STATE_RATE_LIMITED, None),
            (500, STATE_UNAVAILABLE, None),
            (503, STATE_UNAVAILABLE, None),
        ],
    )
    def test_a_refusal_is_its_state(self, service, world, status, state, action):
        world.failures.append(lambda path, params, n: status)
        half = service.beatport("label", "bp:900")
        assert (half.state, half.action) == (state, action)
        assert half.page is None and half.message
        assert half.since is not None

    def test_a_refusal_stores_no_listing(self, service, world, db):
        world.failures.append(lambda path, params, n: 500)
        service.beatport("label", "bp:900")
        assert BeatportCatalogRepository(db).listing("label", 900) is None
        world.failures.clear()
        assert service.beatport("label", "bp:900").state == STATE_OK

    def test_a_fresh_cache_answers_while_beatport_is_down(self, service, world):
        service.beatport("label", "bp:900")
        world.failures.append(lambda path, params, n: 503)
        half = service.beatport("label", "bp:900")
        assert half.state == STATE_OK and half.from_cache

    def test_no_token_is_said_even_when_the_cache_is_fresh(self, service, world):
        service.beatport("label", "bp:900")
        world.access_token = ""
        assert service.beatport("label", "bp:900").state == STATE_NO_TOKEN

    def test_a_rate_limit_carries_the_wait_beatport_asked_for(self, service, world):
        from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError

        def limited(path, params, n):
            raise BeatportAPIError("slow down", status_code=429, retry_after=45.0)

        world.failures.append(limited)
        half = service.beatport("label", "bp:900")
        assert half.state == STATE_RATE_LIMITED and half.retry_after == 45.0

    def test_what_a_page_never_asks_is_refused_before_beatport_is(self, service, world):
        for kwargs in ({"owned": "some"}, {"limit": 0}, {"limit": 501}, {"offset": -1}):
            with pytest.raises(ValueError):
                service.beatport("label", "bp:900", **kwargs)
        with pytest.raises(ValueError):
            service.beatport("label", "900")
        assert world.requests == []


class TestAName:
    def test_an_artist_is_never_looked_up_by_name(self, service, lib, world):
        lib.add("a1", "Âme")
        half = service.beatport("artist", "name:ame")
        assert (half.state, half.reason) == (STATE_NAME_ONLY, REASON_NOT_RESOLVED)
        assert half.action is None and half.resolvable == 0
        assert "none of these tracks is matched" in half.message
        assert world.requests == []

    def test_resolving_is_offered_when_it_would_link_the_name(
        self, service, lib, world
    ):
        lib.add("a1", "Âme", read=False)
        lib.add("a2", "Âme", read=False)
        half = service.beatport("artist", "name:ame")
        assert (half.reason, half.action, half.resolvable) == (
            REASON_NOT_RESOLVED,
            ACTION_RESOLVE,
            2,
        )
        assert "2 matched tracks" in half.message
        assert world.requests == []

    def test_a_shared_name_says_so(self, service, lib, world):
        lib.add("t1", "Twin", beatport=[(300, "Twin")])
        lib.add("t2", "Twin", beatport=[(301, "Twin")])
        half = service.beatport("artist", "name:twin")
        assert (half.state, half.reason) == (STATE_NAME_ONLY, REASON_SHARED)
        assert half.message.startswith("2 Beatport artists")
        assert world.requests == []

    def test_a_linked_artist_name_is_its_id_s_page(self, service, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        half = service.beatport("artist", "name:ame")
        assert half.state == STATE_OK and half.ref.token == "bp:100"
        assert not half.found_by_name

    def test_a_label_is_found_by_name_and_says_so(self, service, lib, world, db):
        lib.add("n1", "A", "Innervisions")
        half = service.beatport("label", "name:innervisions")
        assert half.state == STATE_OK and half.found_by_name
        assert half.beatport_id == 900 and half.ref.token == "name:innervisions"
        assert half.message.startswith("Found by name on Beatport")
        assert _tracks(half) == [15, 11, 12]
        lookup = DiscoveryRepository(db).lookups(ENTITY_LABEL, ["innervisions"])
        assert lookup["innervisions"].beatport_id == 900

    def test_a_second_look_searches_nothing(self, service, lib, world):
        lib.add("n1", "A", "Innervisions")
        service.beatport("label", "name:innervisions")
        searches = len(world.paths("catalog/search")) + len(
            world.paths("catalog/labels")
        )
        service.beatport("label", "name:innervisions", refresh=True)
        assert (
            len(world.paths("catalog/search")) + len(world.paths("catalog/labels"))
            == searches
        )

    def test_a_label_beatport_does_not_have_is_named_as_such(
        self, service, lib, world, db
    ):
        lib.add("n1", "A", "Unknown Label")
        half = service.beatport("label", "name:unknown label")
        assert (half.state, half.reason) == (STATE_NAME_ONLY, REASON_NOT_ON_BEATPORT)
        assert (
            DiscoveryRepository(db)
            .lookups(ENTITY_LABEL, ["unknown label"])["unknown label"]
            .beatport_id
            is None
        )

    def test_not_found_is_trusted_for_its_age_then_asked_again(
        self, service, lib, world, clock
    ):
        lib.add("n1", "A", "Unknown Label")
        service.beatport("label", "name:unknown label")
        asked = len(world.requests)
        clock.now = NOW + NOT_FOUND_LOOKUP_MAX_AGE - timedelta(days=1)
        service.beatport("label", "name:unknown label")
        assert len(world.requests) == asked
        clock.now = NOW + NOT_FOUND_LOOKUP_MAX_AGE + timedelta(days=1)
        service.beatport("label", "name:unknown label")
        assert len(world.requests) > asked

    def test_a_discovery_run_s_lookup_is_used(self, service, lib, world, db):
        lib.add("n1", "A", "Innervisions")
        DiscoveryRepository(db).save_lookup(
            BeatportNameLookup(ENTITY_LABEL, "innervisions", NOW.isoformat(), 900)
        )
        half = service.beatport("label", "name:innervisions")
        assert half.found_by_name and half.beatport_id == 900
        assert (
            world.paths("catalog/search") == [] and world.paths("catalog/labels") == []
        )

    def test_a_failed_search_is_its_state_and_is_not_kept(
        self, service, lib, world, db
    ):
        lib.add("n1", "A", "Innervisions")
        world.failures.append(lambda path, params, n: 401)
        half = service.beatport("label", "name:innervisions")
        assert (half.state, half.action) == (STATE_REJECTED, ACTION_SETTINGS)
        assert DiscoveryRepository(db).lookups(ENTITY_LABEL, ["innervisions"]) == {}

    def test_no_token_is_said_before_a_search(self, service, lib, world):
        lib.add("n1", "A", "Innervisions")
        world.access_token = ""
        half = service.beatport("label", "name:innervisions")
        assert half.state == STATE_NO_TOKEN and world.requests == []

    def test_a_label_linked_by_resolution_is_not_found_by_name(
        self, service, lib, world
    ):
        lib.add("n1", "A", "Innervisions", beatport_label=(900, "Innervisions"))
        half = service.beatport("label", "name:innervisions")
        assert half.state == STATE_OK and not half.found_by_name
        assert half.ref.token == "bp:900"
        assert world.paths("catalog/search") == []


class TestTheContainer:
    def test_it_builds_the_service(self, tmp_path, monkeypatch):
        from cuepoint.services import database_service as database_service_module
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IDatabaseService, IEntityPageService
        from cuepoint.utils.di_container import get_container, reset_container

        monkeypatch.setattr(
            database_service_module, "default_database_path", lambda: tmp_path / "c.db"
        )
        reset_container()
        try:
            bootstrap_services()
            service = get_container().resolve(IEntityPageService)
            assert isinstance(service, EntityPageService)
            assert service.page("artist", "name:nobody").library.tracks == 0
        finally:
            get_container().resolve(IDatabaseService).close_all()
            reset_container()
