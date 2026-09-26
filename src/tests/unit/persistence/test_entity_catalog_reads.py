#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""An Artist or Label page's Beatport half, as the catalog stores and reads it (DISCOVER-07).

A listing is stored with its tracks in one transaction and read back from the
cache by the artist's or label's id and a window of release days: newest
first, each marked owned (DEC-092), with the counts a page draws.
"""

from __future__ import annotations

import sqlite3
from typing import List

import pytest

from cuepoint.models.beatport_listing import BeatportListing
from cuepoint.models.discovery_run import OWNED_ALL, OWNED_HIDE, OWNED_ONLY
from cuepoint.models.entity_page import MAX_ENTITY_WINDOW
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import NOW, accept, add_tracks, catalog_track

pytestmark = pytest.mark.unit

SINCE, UNTIL = "2026-06-25", "2026-09-23"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def catalog(db) -> BeatportCatalogRepository:
    return BeatportCatalogRepository(db)


def _ids(page) -> List[int]:
    return [row.track.beatport_track_id for row in page.rows]


@pytest.fixture
def listed(catalog):
    """Artist 7 and label 90's tracks across and around the window."""
    catalog.store_listing(
        BeatportListing("artist", 7, SINCE, NOW, 5),
        [
            catalog_track(
                1,
                artists=[(7, "Âme")],
                label=(90, "Innervisions"),
                release_date="2026-09-01",
            ),
            catalog_track(
                2, artists=[(7, "Âme"), (8, "Dixon")], release_date="2026-09-01"
            ),
            catalog_track(
                3,
                artists=[(8, "Dixon")],
                remixers=[(7, "Âme")],
                label=(90, "Innervisions"),
                release_date="2026-07-10",
            ),
            catalog_track(4, artists=[(7, "Âme")], release_date=SINCE),
            catalog_track(5, artists=[(7, "Âme")], release_date=UNTIL),
        ],
    )
    catalog.upsert_tracks(
        [
            catalog_track(6, artists=[(7, "Âme")], release_date="2026-06-24"),
            catalog_track(7, artists=[(7, "Âme")], release_date="2026-09-24"),
            catalog_track(8, artists=[(7, "Âme")]),
            # Read by a discovery run, not by the listing: still one of hers.
            catalog_track(
                9, artists=[(7, "Âme")], label=(91, "Other"), release_date="2026-08-01"
            ),
            catalog_track(
                10,
                artists=[(8, "Dixon")],
                label=(90, "Innervisions"),
                release_date="2026-08-15",
            ),
            # A label's release announced for after the window's last day.
            catalog_track(
                11,
                artists=[(8, "Dixon")],
                label=(90, "Innervisions"),
                release_date="2026-09-30",
            ),
            catalog_track(
                12,
                artists=[(8, "Dixon")],
                label=(90, "Innervisions"),
                release_date="2026-06-24",
            ),
        ],
        NOW,
    )


class TestStoringAListing:
    def test_the_tracks_and_the_record_are_stored_together(self, catalog, db):
        stored = catalog.store_listing(
            BeatportListing("label", 90, SINCE, NOW, 2),
            [catalog_track(1, label=(90, "X")), catalog_track(2, label=(90, "X"))],
        )
        assert stored == 2
        assert set(catalog.get_tracks([1, 2])) == {1, 2}
        assert catalog.listing("label", 90) == BeatportListing(
            "label", 90, SINCE, NOW, 2
        )

    def test_a_listing_that_found_nothing_is_recorded(self, catalog):
        assert (
            catalog.store_listing(BeatportListing("artist", 7, SINCE, NOW, 0), []) == 0
        )
        assert catalog.listing("artist", 7).tracks == 0

    def test_a_failure_stores_neither(self, catalog, db):
        catalog.store_listing(
            BeatportListing("artist", 7, SINCE, NOW, 1), [catalog_track(1)]
        )
        with db.transaction() as conn:
            conn.execute(
                "CREATE TRIGGER refuse BEFORE UPDATE ON beatport_listings"
                " BEGIN SELECT RAISE(ABORT, 'refused'); END"
            )
        with pytest.raises(sqlite3.DatabaseError):
            catalog.store_listing(
                BeatportListing("artist", 7, SINCE, "2026-09-24T00:00:00+00:00", 1),
                [catalog_track(2)],
            )
        assert set(catalog.get_tracks([1, 2])) == {1}
        assert catalog.listing("artist", 7).fetched_at == NOW

    def test_a_refused_track_is_left_out_and_the_rest_stored(self, catalog):
        from dataclasses import replace

        bad = replace(catalog_track(2), url="http://not-https.example")
        stored = catalog.store_listing(
            BeatportListing("artist", 7, SINCE, NOW, 2), [catalog_track(1), bad]
        )
        assert stored == 1
        assert catalog.listing("artist", 7) is not None

    def test_no_listing_is_none(self, catalog):
        assert catalog.listing("label", 12345) is None


class TestAnEntitysName:
    def test_the_spelling_on_most_tracks_is_the_name(self, catalog):
        catalog.upsert_tracks(
            [
                catalog_track(1, artists=[(7, "Ame")], label=(90, "Nightfall")),
                catalog_track(2, artists=[(7, "Âme")], label=(90, "Nightfall Audio")),
                catalog_track(3, artists=[(7, "Âme")], label=(90, "Nightfall Audio")),
            ],
            NOW,
        )
        assert catalog.entity_name("artist", 7) == "Âme"
        assert catalog.entity_name("label", 90) == "Nightfall Audio"

    def test_a_tie_is_broken_alphabetically(self, catalog):
        catalog.upsert_tracks(
            [
                catalog_track(1, artists=[(7, "B")]),
                catalog_track(2, artists=[(7, "A")]),
            ],
            NOW,
        )
        assert catalog.entity_name("artist", 7) == "A"

    def test_an_id_the_cache_has_not_seen_has_no_name(self, catalog):
        assert catalog.entity_name("artist", 7) is None
        assert catalog.entity_name("label", 7) is None
        with pytest.raises(ValueError):
            catalog.entity_name("genre", 7)


class TestReadingItBack:
    def test_an_artist_s_tracks_in_the_window_newest_first(self, catalog, listed):
        page = catalog.entity_tracks("artist", 7, SINCE, UNTIL)
        # Both ends of the window are in it; a remix is theirs; undated, and
        # out-of-window, tracks are not; a track another read cached is.
        assert _ids(page) == [5, 2, 1, 9, 3, 4]
        assert (page.total, page.tracks, page.owned) == (6, 6, 0)

    def test_a_label_s_tracks(self, catalog, listed):
        page = catalog.entity_tracks("label", 90, SINCE, UNTIL)
        assert _ids(page) == [1, 10, 3]

    def test_each_row_carries_its_credits(self, catalog, listed):
        rows = {
            r.track.beatport_track_id: r
            for r in catalog.entity_tracks("artist", 7, SINCE, UNTIL).rows
        }
        assert rows[2].artists == ("Âme", "Dixon")
        assert rows[3].artists == ("Dixon",) and rows[3].remixers == ("Âme",)
        assert all(not r.on_wantlist for r in rows.values())

    def test_owned_is_marked_counted_and_filtered(self, catalog, listed, db):
        with db.transaction() as conn:
            library = add_tracks(conn, 2)
            accept(conn, library[0], "2")
            accept(conn, library[1], "9")
        every = catalog.entity_tracks("artist", 7, SINCE, UNTIL, OWNED_ALL)
        assert {r.track.beatport_track_id for r in every.rows if r.owned} == {2, 9}
        assert (every.total, every.tracks, every.owned) == (6, 6, 2)
        hidden = catalog.entity_tracks("artist", 7, SINCE, UNTIL, OWNED_HIDE)
        assert _ids(hidden) == [5, 1, 3, 4]
        assert (hidden.total, hidden.tracks, hidden.owned) == (4, 6, 2)
        only = catalog.entity_tracks("artist", 7, SINCE, UNTIL, OWNED_ONLY)
        assert _ids(only) == [2, 9] and only.total == 2

    def test_a_window_is_a_slice_of_the_list(self, catalog, listed):
        first = catalog.entity_tracks("artist", 7, SINCE, UNTIL, limit=2)
        second = catalog.entity_tracks("artist", 7, SINCE, UNTIL, offset=2, limit=2)
        assert _ids(first) == [5, 2] and _ids(second) == [1, 9]
        assert first.total == second.total == 6

    def test_a_listing_nobody_read_is_empty(self, catalog):
        page = catalog.entity_tracks("label", 404, SINCE, UNTIL)
        assert page.rows == () and page.total == 0

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"kind": "genre"},
            {"owned": "some"},
            {"limit": 0},
            {"limit": MAX_ENTITY_WINDOW + 1},
            {"offset": -1},
        ],
    )
    def test_what_a_page_never_asks_is_refused(self, catalog, kwargs):
        args = {
            "kind": "artist",
            "beatport_id": 7,
            "since": SINCE,
            "until": UNTIL,
            **kwargs,
        }
        with pytest.raises(ValueError):
            catalog.entity_tracks(**args)

    def test_ownership_is_read_once_per_window(self, catalog, listed, db):
        conn = db.connect()
        traced: List[str] = []
        conn.set_trace_callback(traced.append)
        try:
            catalog.entity_tracks("artist", 7, SINCE, UNTIL, OWNED_HIDE)
        finally:
            conn.set_trace_callback(None)
        assert sum("library_beatport_tracks" in s for s in traced) == 1
