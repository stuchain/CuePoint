#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The wantlist, as stored (DISCOVER-06, DEC-093).

``WantlistRepository`` is the one reader and writer of ``wantlist``. These
tests hold it to what the service relies on: an add never touches an entry
already there, an entry always has its catalog row, bought marks keep the
moment they were first made, every write joins a transaction it is given, and
a window reads ownership as it is now, with bought and owned filtered
independently.
"""

from __future__ import annotations

import json
from dataclasses import replace

import pytest

from cuepoint.models.discovery_run import (
    OWNED_ALL,
    OWNED_FILTERS,
    OWNED_HIDE,
    OWNED_ONLY,
    RUN_SUCCEEDED,
    SORT_ARTIST,
    SORT_RELEASE_DATE,
    SORT_TITLE,
    DiscoveryRun,
    DiscoveryRunSource,
)
from cuepoint.models.wantlist import (
    BOUGHT_ALL,
    BOUGHT_FILTERS,
    BOUGHT_HIDE,
    BOUGHT_ONLY,
    MAX_NOTE_LENGTH,
    SORT_ADDED,
    WantlistEntry,
    WantlistPage,
    WantlistRow,
)
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.persistence.wantlist_repository import (
    MAX_WINDOW,
    WantlistRepository,
    listed_ids_sql,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import NOW, accept, add_tracks, catalog_track

LATER = "2026-09-24T09:00:00+00:00"
LATEST = "2026-09-25T09:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def wantlist(db) -> WantlistRepository:
    return WantlistRepository(db)


@pytest.fixture
def catalog(db) -> BeatportCatalogRepository:
    return BeatportCatalogRepository(db)


def entry(track_id: int, **kwargs) -> WantlistEntry:
    return WantlistEntry(beatport_track_id=track_id, added_at=NOW, **kwargs)


def cache(catalog, *ids: int, **kwargs) -> None:
    catalog.upsert_tracks([catalog_track(i, **kwargs) for i in ids], NOW)


def own(db, *beatport_ids: int) -> None:
    """Make the library own each id, through an accepted match (DEC-092)."""
    with db.transaction() as conn:
        start = int(
            conn.execute("SELECT coalesce(max(id), 0) + 1 FROM tracks").fetchone()[0]
        )
        for track_id, beatport_id in zip(
            add_tracks(conn, len(beatport_ids), start=start), beatport_ids
        ):
            accept(conn, track_id, str(beatport_id))


def count(db, table: str) -> int:
    return int(db.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


def ids_of(page: WantlistPage) -> list:
    return [row.entry.beatport_track_id for row in page.rows]


# ---------------------------------------------------------------------- add


class TestAdding:
    def test_it_stores_entries_and_answers_the_ids_added(self, wantlist, catalog):
        cache(catalog, 1, 2)
        assert wantlist.add([entry(2), entry(1)]) == [2, 1]
        assert wantlist.get(1) == entry(1)
        assert set(wantlist.entries([1, 2, 3])) == {1, 2}

    def test_an_entry_already_there_is_left_exactly_as_it_is(self, wantlist, catalog):
        cache(catalog, 1)
        wantlist.add([entry(1, note="the dub")])
        wantlist.set_bought([1], LATER)
        assert wantlist.add([replace(entry(1), added_at=LATEST)]) == []
        assert wantlist.get(1) == entry(1, note="the dub", bought_at=LATER)

    def test_an_id_given_twice_is_added_once(self, wantlist, catalog):
        cache(catalog, 1)
        assert wantlist.add([entry(1), entry(1)]) == [1]

    def test_it_stores_new_catalog_rows_with_the_entries(self, db, wantlist, catalog):
        added = wantlist.add([entry(9)], [catalog_track(9, artists=[(5, "Ame")])], NOW)
        assert added == [9]
        assert catalog.get_tracks([9])[9].title == "Track 9"
        assert [c.name for c in catalog.credits(9)] == ["Ame"]

    def test_catalog_rows_need_when_they_were_read(self, wantlist):
        with pytest.raises(ValueError):
            wantlist.add([entry(9)], [catalog_track(9)])

    def test_an_entry_with_no_catalog_row_is_left_out(self, db, wantlist, catalog):
        cache(catalog, 1)
        assert wantlist.add([entry(1), entry(2)]) == [1]
        assert count(db, "wantlist") == 1

    def test_a_track_the_catalog_refuses_is_left_out_not_the_rest(
        self, wantlist, catalog
    ):
        refused = replace(catalog_track(8), url="http://insecure.example/track/8")
        assert wantlist.add([entry(7), entry(8)], [catalog_track(7), refused], NOW) == [
            7
        ]

    def test_a_run_that_does_not_exist_writes_nothing(self, db, wantlist):
        with pytest.raises(Exception) as refused:
            wantlist.add([entry(9, added_from_run_id=404)], [catalog_track(9)], NOW)
        assert "FOREIGN KEY" in str(refused.value)
        assert count(db, "wantlist") == 0
        assert count(db, "beatport_tracks") == 0

    def test_it_joins_a_transaction_it_is_given(self, db, wantlist, catalog):
        cache(catalog, 1)
        with pytest.raises(RuntimeError):
            with db.transaction():
                wantlist.add([entry(1)])
                raise RuntimeError("the caller's work failed")
        assert count(db, "wantlist") == 0


# ------------------------------------------------------------------- remove


class TestRemoving:
    def test_it_answers_what_was_there_in_the_order_given(self, wantlist, catalog):
        cache(catalog, 1, 2, 3)
        wantlist.add([entry(1), entry(2), entry(3)])
        assert wantlist.remove([3, 99, 1, 3]) == [3, 1]
        assert set(wantlist.entries([1, 2, 3])) == {2}

    def test_the_catalog_row_stays(self, db, wantlist, catalog):
        cache(catalog, 1)
        wantlist.add([entry(1)])
        wantlist.remove([1])
        assert count(db, "beatport_tracks") == 1

    def test_a_catalog_row_the_list_holds_cannot_be_deleted(
        self, db, wantlist, catalog
    ):
        cache(catalog, 1)
        wantlist.add([entry(1)])
        with pytest.raises(Exception):
            with db.transaction() as conn:
                conn.execute("DELETE FROM beatport_tracks WHERE beatport_track_id = 1")


# --------------------------------------------------------------------- note


class TestNotes:
    def test_set_and_clear(self, wantlist, catalog):
        cache(catalog, 1)
        wantlist.add([entry(1)])
        assert wantlist.set_note(1, "the dub, not the original")
        assert wantlist.get(1).note == "the dub, not the original"
        assert wantlist.set_note(1, None)
        assert wantlist.get(1).note is None

    def test_no_entry_is_false(self, wantlist):
        assert wantlist.set_note(1, "x") is False

    @pytest.mark.parametrize("note", ["", "   ", "x" * (MAX_NOTE_LENGTH + 1)])
    def test_a_note_the_model_refuses_changes_nothing(self, wantlist, catalog, note):
        cache(catalog, 1)
        wantlist.add([entry(1, note="kept")])
        with pytest.raises(ValueError):
            wantlist.set_note(1, note)
        assert wantlist.get(1).note == "kept"

    def test_the_longest_note_is_kept(self, wantlist, catalog):
        cache(catalog, 1)
        wantlist.add([entry(1)])
        assert wantlist.set_note(1, "x" * MAX_NOTE_LENGTH)


# ------------------------------------------------------------------- bought


class TestBought:
    def test_marking_touches_only_the_unmarked(self, wantlist, catalog):
        cache(catalog, 1, 2)
        wantlist.add([entry(1), entry(2)])
        assert wantlist.set_bought([1], LATER) == [1]
        assert wantlist.set_bought([2, 1, 99], LATEST) == [2]
        assert wantlist.get(1).bought_at == LATER
        assert wantlist.get(2).bought_at == LATEST

    def test_unmarking(self, wantlist, catalog):
        cache(catalog, 1, 2)
        wantlist.add([entry(1), entry(2)])
        wantlist.set_bought([1], LATER)
        assert wantlist.set_bought([1, 2], None) == [1]
        assert wantlist.get(1).bought_at is None


# --------------------------------------------------------------------- read


@pytest.fixture
def four(db, wantlist, catalog):
    """Owned and bought in every combination:

    1 neither, 2 bought only, 3 owned only, 4 owned and bought.
    """
    cache(catalog, 1, 2, 3, 4)
    wantlist.add([entry(i) for i in (1, 2, 3, 4)])
    wantlist.set_bought([2, 4], LATER)
    own(db, 3, 4)


class TestFilters:
    @pytest.mark.parametrize(
        ("owned", "bought", "expected"),
        [
            (OWNED_ALL, BOUGHT_ALL, [1, 2, 3, 4]),
            (OWNED_ONLY, BOUGHT_ALL, [3, 4]),
            (OWNED_HIDE, BOUGHT_ALL, [1, 2]),
            (OWNED_ALL, BOUGHT_ONLY, [2, 4]),
            (OWNED_ALL, BOUGHT_HIDE, [1, 3]),
            (OWNED_HIDE, BOUGHT_ONLY, [2]),
            (OWNED_ONLY, BOUGHT_HIDE, [3]),
            (OWNED_ONLY, BOUGHT_ONLY, [4]),
            (OWNED_HIDE, BOUGHT_HIDE, [1]),
        ],
    )
    def test_bought_and_owned_filter_independently(
        self, wantlist, four, owned, bought, expected
    ):
        page = wantlist.page(
            owned=owned, bought=bought, sort=SORT_ADDED, descending=False
        )
        assert ids_of(page) == expected
        assert page.total == len(expected)
        assert (page.entries, page.owned, page.bought) == (4, 2, 2)

    def test_each_row_says_owned_and_bought_separately(self, wantlist, four):
        rows = {
            r.entry.beatport_track_id: (r.owned, r.entry.is_bought)
            for r in wantlist.page().rows
        }
        assert rows == {
            1: (False, False),
            2: (False, True),
            3: (True, False),
            4: (True, True),
        }

    def test_ownership_is_read_now(self, db, wantlist, catalog):
        cache(catalog, 1)
        wantlist.add([entry(1)])
        assert wantlist.page().owned == 0
        own(db, 1)
        page = wantlist.page()
        assert (page.owned, page.rows[0].owned) == (1, True)
        assert wantlist.get(1) == entry(1)

    def test_owned_twice_in_the_library_is_counted_once(self, db, wantlist, catalog):
        cache(catalog, 1)
        wantlist.add([entry(1)])
        own(db, 1, 1)
        page = wantlist.page()
        assert (page.entries, page.owned, len(page.rows)) == (1, 1, 1)

    @pytest.mark.parametrize(
        "bad", [{"owned": "some"}, {"bought": "yes"}, {"sort": "bpm"}]
    )
    def test_a_filter_or_sort_it_does_not_know_is_refused(self, wantlist, bad):
        with pytest.raises(ValueError):
            wantlist.page(**bad)

    def test_the_vocabularies_are_the_run_windows(self):
        assert set(BOUGHT_FILTERS) == set(OWNED_FILTERS)


class TestOrderAndWindow:
    @pytest.fixture
    def listed(self, wantlist, catalog):
        tracks = [
            catalog_track(
                1, title="beta", artists=[(1, "Zed")], release_date="2026-01-02"
            ),
            catalog_track(2, title="Alpha", artists=[(2, "amy")]),
            catalog_track(
                3, title="gamma", artists=[(3, "Bo")], release_date="2025-12-01"
            ),
            catalog_track(4, title="alpha", release_date="2026-01-02"),
        ]
        catalog.upsert_tracks(tracks, NOW)
        wantlist.add([entry(1), entry(4)])
        wantlist.add(
            [replace(entry(2), added_at=LATER), replace(entry(3), added_at=LATEST)]
        )

    def test_newest_first_by_default_with_ties_by_id(self, wantlist, listed):
        assert ids_of(wantlist.page()) == [3, 2, 1, 4]

    def test_oldest_first(self, wantlist, listed):
        assert ids_of(wantlist.page(descending=False)) == [1, 4, 2, 3]

    def test_by_release_date_missing_last(self, wantlist, listed):
        assert ids_of(wantlist.page(sort=SORT_RELEASE_DATE, descending=False)) == [
            3,
            1,
            4,
            2,
        ]
        assert ids_of(wantlist.page(sort=SORT_RELEASE_DATE, descending=True)) == [
            1,
            4,
            3,
            2,
        ]

    def test_by_first_artist_missing_last(self, wantlist, listed):
        assert ids_of(wantlist.page(sort=SORT_ARTIST, descending=False)) == [2, 3, 1, 4]

    def test_by_title_ignoring_case(self, wantlist, listed):
        assert ids_of(wantlist.page(sort=SORT_TITLE, descending=False)) == [2, 4, 1, 3]

    def test_a_window_is_a_slice_of_the_total(self, wantlist, listed):
        page = wantlist.page(offset=1, limit=2)
        assert (ids_of(page), page.total) == ([2, 1], 4)
        assert ids_of(wantlist.page(offset=4)) == []

    @pytest.mark.parametrize(
        ("offset", "limit"), [(0, 0), (0, MAX_WINDOW + 1), (-1, 10)]
    )
    def test_a_window_it_does_not_answer_is_refused(self, wantlist, offset, limit):
        with pytest.raises(ValueError):
            wantlist.page(offset=offset, limit=limit)

    def test_rows_carry_the_track_and_its_credits(self, wantlist, catalog):
        catalog.upsert_tracks(
            [catalog_track(5, artists=[(1, "A"), (2, "B")], remixers=[(3, "R")])], NOW
        )
        wantlist.add([entry(5, note="n")])
        (row,) = wantlist.page().rows
        assert row.entry == entry(5, note="n")
        assert (row.track.title, row.track.mix_name) == ("Track 5", "Original Mix")
        assert (row.artists, row.remixers) == (("A", "B"), ("R",))

    def test_an_empty_list(self, wantlist):
        page = wantlist.page()
        assert (page.rows, page.total, page.entries, page.owned, page.bought) == (
            (),
            0,
            0,
            0,
            0,
        )


class TestQueryPlan:
    @pytest.mark.parametrize("sql", ["owned", "listed"])
    def test_membership_is_not_asked_once_per_row(self, db, wantlist, four, sql):
        from cuepoint.persistence import wantlist_repository as module

        test = (
            module._OWNED
            if sql == "owned"
            else (f"w.beatport_track_id IN ({listed_ids_sql()})")
        )
        plan = " ".join(
            str(tuple(row))
            for row in db.connect().execute(
                "EXPLAIN QUERY PLAN SELECT w.beatport_track_id FROM wantlist AS w"
                f" WHERE {test}",
                {"owned": "[3, 4]"},
            )
        )
        assert "CORRELATED" not in plan

    @pytest.mark.parametrize("owned", OWNED_FILTERS)
    @pytest.mark.parametrize("bought", BOUGHT_FILTERS)
    def test_the_ownership_view_is_read_once_per_window(
        self, db, wantlist, four, owned, bought
    ):
        """Each ``IN (view)`` built every owned id again, and the window asked
        up to four times: 137 ms at 40,000 accepted matches. Once is 35."""
        statements = []
        conn = db.connect()
        conn.set_trace_callback(statements.append)
        try:
            wantlist.page(owned=owned, bought=bought)
        finally:
            conn.set_trace_callback(None)
        assert sum("library_beatport_tracks" in s for s in statements) == 1


# ------------------------------------------------------------ run and models


class TestTheRunItCameFrom:
    @pytest.fixture
    def run(self, db, catalog):
        runs = DiscoveryRepository(db)
        run = runs.start_run(DiscoveryRun(started_at=NOW, params_json=json.dumps({})))
        runs.record_found(
            run.id,
            [catalog_track(1), catalog_track(2)],
            [
                DiscoveryRunSource(
                    run_id=run.id,
                    beatport_track_id=i,
                    source_type="chart",
                    source_id=1,
                    matched_on="Mara Veil",
                )
                for i in (1, 2)
            ],
            NOW,
            {},
        )
        runs.finish_run(run.id, RUN_SUCCEEDED, NOW)
        return runs, run

    def test_an_entry_remembers_it_and_forgets_it_when_it_goes(self, wantlist, run):
        runs, found = run
        wantlist.add([entry(1, added_from_run_id=found.id)])
        assert wantlist.get(1).added_from_run_id == found.id
        runs.delete_run(found.id)
        assert wantlist.get(1) == entry(1)

    def test_the_run_window_says_which_tracks_are_on_the_wantlist(self, wantlist, run):
        runs, found = run
        assert [
            r.on_wantlist for r in runs.run_tracks(found.id, owned=OWNED_ALL).rows
        ] == [
            False,
            False,
        ]
        wantlist.add([entry(2)])
        rows = runs.run_tracks(found.id, owned=OWNED_ALL).rows
        assert [(r.track.beatport_track_id, r.on_wantlist) for r in rows] == [
            (1, False),
            (2, True),
        ]

    def test_which_tracks_a_run_found(self, run):
        runs, found = run
        assert runs.tracks_in_run(found.id, [2, 3, 1]) == {1, 2}
        assert runs.tracks_in_run(found.id + 1, [1]) == set()


class TestModels:
    def test_a_note_is_bounded(self):
        assert entry(1, note="x" * MAX_NOTE_LENGTH).note == "x" * MAX_NOTE_LENGTH
        with pytest.raises(ValueError):
            entry(1, note="x" * (MAX_NOTE_LENGTH + 1))

    def test_a_row_is_its_entrys_track(self, wantlist, catalog):
        cache(catalog, 1, 2)
        wantlist.add([entry(1)])
        (row,) = wantlist.page().rows
        other = catalog.get_tracks([2])[2]
        with pytest.raises(ValueError):
            WantlistRow(entry=row.entry, track=other)

    @pytest.mark.parametrize(
        "counts",
        [
            {"total": 3, "entries": 2, "owned": 0, "bought": 0},
            {"total": 0, "entries": 2, "owned": 3, "bought": 0},
            {"total": 0, "entries": 2, "owned": 0, "bought": 3},
            {"total": -1, "entries": 2, "owned": 0, "bought": 0},
        ],
    )
    def test_a_pages_counts_are_checked(self, counts):
        with pytest.raises(ValueError):
            WantlistPage(rows=(), **counts)

    def test_a_window_cannot_outgrow_its_total(self, wantlist, catalog):
        cache(catalog, 1)
        wantlist.add([entry(1)])
        rows = wantlist.page().rows
        with pytest.raises(ValueError):
            WantlistPage(rows=rows, total=0, entries=1, owned=0, bought=0)
