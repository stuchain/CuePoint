#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The picture of a Beatport artist or label, by id (DEC-318).

``DiscoveryService.entity_art_url`` serves suggestions, follows and pages. It
shares the on-view picture budget with a card's and a track's lookups: a short
timeout, no retry, no wait on a rate limit, one engine-wide pause on a 429. A
dig keeps the pictures its listings carry as the entity's own, and a card's
lookup reads and writes the same row, so a card and a follow of the same artist
make one request. Nothing here reaches the network.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from cuepoint.models.beatport_cache import ENTITY_ART_MISS_DAYS
from cuepoint.models.discovery_run import GROUP_ARTIST, GROUP_LABEL
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.services.test_discovery_groups import ART
from tests.unit.services.test_discovery_service import (
    LIBRARY,
    MARA,
    NIGHTFALL,
    NOW,
    Clock,
    add_library,
    make,
    request,
    standard_world,
)

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def fresh_process_state(monkeypatch):
    from cuepoint.services import discovery_service

    monkeypatch.setattr(discovery_service, "_ART_MISSES", set())
    monkeypatch.setattr(discovery_service, "_COVER_MISSES", set())
    monkeypatch.setattr(discovery_service, "_ENTITY_ART_MISSES", set())
    monkeypatch.setattr(discovery_service, "_RATE_LIMITED_UNTIL", [0.0])


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def library(db):
    return add_library(db, LIBRARY)


@pytest.fixture
def world():
    beatport = standard_world()
    beatport.images[("artist", MARA[0])] = ART % "mara"
    beatport.images[("label", NIGHTFALL[0])] = ART % "label"
    # Only the entity's own page carries the picture: no listing names one.
    beatport.no_credit_images = {("artist", MARA[0]), ("label", NIGHTFALL[0])}
    return beatport


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def catalog(db):
    return BeatportCatalogRepository(db)


def asked(world, kind, entity_id):
    return world.paths(f"catalog/{kind}s/{entity_id}")


class TestAskingOnce:
    def test_an_unknown_name_is_asked_for_once_with_the_cover_budget(
        self, db, world, monkeypatch
    ):
        service = make(db, world)
        seen = []
        original = world.get

        def spy(path, params=None, **options):
            seen.append((path.strip("/"), options))
            return original(path, params, **options)

        monkeypatch.setattr(world, "get", spy)
        assert service.entity_art_url("artist", MARA[0]) == ART % "mara"
        assert service.entity_art_url("label", NIGHTFALL[0]) == ART % "label"
        budget = {
            "timeout": 8.0,
            "retry_on_timeout": False,
            "wait_on_rate_limit": False,
        }
        assert seen == [
            (f"catalog/artists/{MARA[0]}", budget),
            (f"catalog/labels/{NIGHTFALL[0]}", budget),
        ]

    def test_the_answer_is_kept_and_a_stored_url_means_no_request(
        self, db, world, catalog
    ):
        service = make(db, world)
        assert service.entity_art_url("artist", MARA[0]) == ART % "mara"
        assert catalog.entity_art([("artist", MARA[0])])[("artist", MARA[0])].image_url
        before = len(world.requests)
        again = make(db, world)
        assert again.entity_art_url("artist", MARA[0]) == ART % "mara"
        assert len(world.requests) == before

    def test_a_kind_outside_artist_and_label_is_refused(self, db, world):
        with pytest.raises(ValueError):
            make(db, world).entity_art_url("chart", 1)


class TestNoPicture:
    def test_none_is_stored_and_not_asked_again_within_thirty_days(
        self, db, world, catalog, clock
    ):
        world.images.pop(("artist", MARA[0]))
        service = make(db, world, clock=clock)
        assert service.entity_art_url("artist", MARA[0]) is None
        row = catalog.entity_art([("artist", MARA[0])])[("artist", MARA[0])]
        assert row.image_url is None and row.read_at == NOW.isoformat()
        clock.now = NOW + timedelta(days=ENTITY_ART_MISS_DAYS - 1)
        assert service.entity_art_url("artist", MARA[0]) is None
        assert len(asked(world, "artist", MARA[0])) == 1

    def test_it_is_asked_again_after_thirty_days(self, db, world, catalog, clock):
        world.images.pop(("artist", MARA[0]))
        service = make(db, world, clock=clock)
        service.entity_art_url("artist", MARA[0])
        world.images[("artist", MARA[0])] = ART % "late"
        clock.now = NOW + timedelta(days=ENTITY_ART_MISS_DAYS + 1)
        assert service.entity_art_url("artist", MARA[0]) == ART % "late"
        assert len(asked(world, "artist", MARA[0])) == 2


class TestFailuresAndLimits:
    def test_a_failure_is_not_stored_and_not_asked_again_in_the_process(
        self, db, world, catalog
    ):
        service = make(db, world)
        world.failures.append(
            lambda path, params, n: 500 if "catalog/artists/" in path else None
        )
        assert service.entity_art_url("artist", MARA[0]) is None
        assert service.entity_art_url("artist", MARA[0]) is None
        assert len(asked(world, "artist", MARA[0])) == 1
        assert catalog.entity_art([("artist", MARA[0])]) == {}

    def test_a_429_pauses_every_picture_lookup_and_records_nothing(
        self, db, library, world, catalog
    ):
        now = [1000.0]
        service = make(db, world, monotonic=lambda: now[0])
        run = service.run(
            request(service, artists=["Mara Veil"], labels=["Nightfall Audio"])
        )
        world.failures.append(
            lambda path, params, n: (429, 30) if "catalog/artists/" in path else None
        )
        assert service.entity_art_url("artist", MARA[0]) is None
        assert catalog.entity_art([("artist", MARA[0])]) == {}
        paused = len(world.requests)
        # Paused for everything else that asks on view.
        assert service.entity_art_url("label", NIGHTFALL[0]) is None
        assert service.group_art_url(run.id, GROUP_LABEL, "nightfall audio") is None
        track = (
            DiscoveryRepository(db)
            .run_tracks(run.id, "all", "position", False, 0, 5)
            .rows[0]
            .track.beatport_track_id
        )
        with db.transaction() as conn:
            conn.execute(
                "UPDATE beatport_tracks SET release_image_url = NULL,"
                " release_cover_read = 0"
            )
        assert service.cached_track_art_url(track) is None
        assert len(world.requests) == paused
        # After the Retry-After it is asked again, and answered.
        now[0] += 31
        world.failures.clear()
        assert service.entity_art_url("artist", MARA[0]) == ART % "mara"

    def test_a_card_s_429_pauses_the_entity_lookup_too(self, db, library, world):
        now = [0.0]
        service = make(db, world, monotonic=lambda: now[0])
        run = service.run(request(service, artists=["Mara Veil"], labels=[]))
        world.failures.append(lambda path, params, n: (429, 20))
        assert service.group_art_url(run.id, GROUP_ARTIST, "mara veil") is None
        world.failures.clear()
        before = len(world.requests)
        assert service.entity_art_url("label", NIGHTFALL[0]) is None
        assert len(world.requests) == before

    def test_signed_out_nothing_is_asked_and_nothing_is_stored(
        self, db, world, catalog
    ):
        service = make(db, world)
        world.access_token = ""
        assert service.entity_art_url("artist", MARA[0]) is None
        assert world.requests == []
        assert catalog.entity_art([("artist", MARA[0])]) == {}
        world.access_token = "token"
        assert service.entity_art_url("artist", MARA[0]) == ART % "mara"


class TestSharedWithCards:
    def test_a_card_and_a_follow_of_one_artist_make_one_request(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil"], labels=[]))
        before = len(asked(world, "artist", MARA[0]))
        assert service.group_art_url(run.id, GROUP_ARTIST, "mara veil") == ART % "mara"
        assert service.entity_art_url("artist", MARA[0]) == ART % "mara"
        assert len(asked(world, "artist", MARA[0])) == before + 1

    def test_a_card_reads_the_row_a_follow_wrote(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil"], labels=[]))
        assert service.entity_art_url("artist", MARA[0]) == ART % "mara"
        before = len(asked(world, "artist", MARA[0]))
        assert service.group_art_url(run.id, GROUP_ARTIST, "mara veil") == ART % "mara"
        assert len(asked(world, "artist", MARA[0])) == before


class TestADigKeepsWhatItsListingsCarry:
    def test_an_artist_s_and_a_label_s_pictures_are_kept_for_every_page(
        self, db, library, world, catalog
    ):
        world.no_credit_images = set()
        service = make(db, world)
        service.run(request(service, artists=["Mara Veil"], labels=["Nightfall Audio"]))
        found = catalog.entity_art([("artist", MARA[0]), ("label", NIGHTFALL[0])])
        assert found[("artist", MARA[0])].image_url == ART % "mara"
        assert found[("label", NIGHTFALL[0])].image_url == ART % "label"
        # So nothing is asked for them again.
        before = len(world.requests)
        assert make(db, world).entity_art_url("artist", MARA[0]) == ART % "mara"
        assert len(world.requests) == before

    def test_a_dig_whose_listings_name_none_writes_no_row(
        self, db, library, world, catalog
    ):
        service = make(db, world)
        service.run(request(service, artists=["Mara Veil"], labels=[]))
        assert catalog.entity_art([("artist", MARA[0])]) == {}
