#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Discovery runs and the name-lookup cache, as stored (DISCOVER-05).

``DiscoveryRepository`` is the one writer of the run tables and of
``beatport_name_lookups``. These tests hold it to what the service relies on:
a chart's or label's findings commit whole or not at all, a track keeps its
first place however often it is found again, every reason is kept once, an
ended run takes no more writes, and a window reads ownership as it is now.
The last class holds the library-side scope reads in ``TrackCreditRepository``.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from dataclasses import replace

import pytest

from cuepoint.models.beatport_cache import BeatportNameLookup
from cuepoint.models.discovery_run import (
    OWNED_ALL,
    OWNED_HIDE,
    OWNED_ONLY,
    RUN_CANCELLED,
    RUN_FAILED,
    RUN_SUCCEEDED,
    SORT_FOUND,
    DiscoveryRun,
    DiscoveryRunSource,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.discovery_repository import MAX_WINDOW, DiscoveryRepository
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import NOW, accept, catalog_track

LATER = "2026-09-23T13:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def runs(db) -> DiscoveryRepository:
    return DiscoveryRepository(db)


@pytest.fixture
def run(runs) -> DiscoveryRun:
    return runs.start_run(
        DiscoveryRun(
            started_at=NOW,
            params_json=json.dumps({"genre_ids": [5]}),
            job_id="job-1",
            labels_in_scope=3,
            artists_in_scope=4,
        )
    )


def source(run_id: int, track_id: int, source_id: int = 1, kind: str = "chart"):
    return DiscoveryRunSource(
        run_id=run_id,
        beatport_track_id=track_id,
        source_type=kind,
        source_id=source_id,
        matched_on="Mara Veil",
        source_name=f"Source {source_id}",
    )


def positions(runs, run_id):
    page = runs.run_tracks(run_id, owned=OWNED_ALL, limit=MAX_WINDOW)
    return [(r.position, r.track.beatport_track_id) for r in page.rows]


def count(db, table: str) -> int:
    return int(db.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


class TestStartingARun:
    def test_it_is_stored_running_with_its_id(self, runs, run):
        assert run.id is not None and run.is_running
        assert (run.job_id, run.labels_in_scope, run.artists_in_scope) == (
            "job-1",
            3,
            4,
        )
        assert runs.get_run(run.id) == run

    def test_a_run_is_stored_once(self, runs, run):
        with pytest.raises(ValueError):
            runs.start_run(run)
        with pytest.raises(ValueError):
            runs.start_run(
                DiscoveryRun(
                    started_at=NOW,
                    params_json="{}",
                    outcome=RUN_SUCCEEDED,
                    finished_at=NOW,
                )
            )

    def test_ids_are_never_reused(self, runs, run):
        runs.finish_run(run.id, RUN_SUCCEEDED, LATER)
        runs.delete_run(run.id)
        again = runs.start_run(DiscoveryRun(started_at=NOW, params_json="{}"))
        assert again.id > run.id


class TestRecordingWhatWasFound:
    def test_tracks_take_the_next_places_in_the_order_found(self, runs, run):
        assert (
            runs.record_found(
                run.id,
                [catalog_track(30), catalog_track(10)],
                [source(run.id, 30), source(run.id, 10)],
                NOW,
                {},
            )
            == 2
        )
        assert (
            runs.record_found(
                run.id,
                [catalog_track(10), catalog_track(20)],
                [source(run.id, 10, 2), source(run.id, 20, 2)],
                NOW,
                {},
            )
            == 1
        )
        assert positions(runs, run.id) == [(0, 30), (1, 10), (2, 20)]

    def test_every_reason_is_kept_once(self, runs, run):
        runs.record_found(run.id, [catalog_track(10)], [source(run.id, 10, 1)], NOW, {})
        runs.record_found(
            run.id,
            [catalog_track(10)],
            [source(run.id, 10, 1), source(run.id, 10, 7, "label_release")],
            NOW,
            {},
        )
        assert [(s.source_type, s.source_id) for s in runs.run_sources(run.id)] == [
            ("chart", 1),
            ("label_release", 7),
        ]

    def test_a_track_twice_in_one_answer_is_one_track(self, runs, run):
        assert (
            runs.record_found(
                run.id,
                [catalog_track(10), catalog_track(10)],
                [source(run.id, 10)],
                NOW,
                {},
            )
            == 1
        )

    def test_the_catalog_rows_are_written_with_them(self, db, runs, run):
        runs.record_found(
            run.id, [catalog_track(10, artists=[(5, "Mara Veil")])], [], NOW, {}
        )
        catalog = BeatportCatalogRepository(db)
        assert catalog.get_tracks([10])[10].fetched_at == NOW
        assert [c.artist_id for c in catalog.credits(10)] == [5]

    def test_a_track_that_cannot_be_stored_is_left_out_with_its_reason(
        self, db, runs, run
    ):
        bad = replace(catalog_track(11), url="http://example.com/")
        assert (
            runs.record_found(
                run.id,
                [catalog_track(10), bad],
                [source(run.id, 10), source(run.id, 11)],
                NOW,
                {},
            )
            == 1
        )
        assert positions(runs, run.id) == [(0, 10)]
        assert [s.beatport_track_id for s in runs.run_sources(run.id)] == [10]

    def test_a_reason_for_another_run_is_not_recorded_here(self, runs, run):
        runs.record_found(
            run.id, [catalog_track(10)], [source(run.id + 1, 10)], NOW, {}
        )
        assert runs.run_sources(run.id) == []

    def test_the_counts_go_with_the_rows(self, runs, run):
        runs.record_found(
            run.id,
            [catalog_track(10), catalog_track(11)],
            [],
            NOW,
            {"charts_read": 1, "releases_read": 0, "labels_resolved": 2},
        )
        stored = runs.get_run(run.id)
        assert (stored.charts_read, stored.labels_resolved, stored.tracks_found) == (
            1,
            2,
            2,
        )

    def test_counts_that_break_the_runs_rules_write_nothing(self, db, runs, run):
        with pytest.raises(ValueError):
            runs.record_found(
                run.id, [catalog_track(10)], [], NOW, {"labels_resolved": 4}
            )
        assert count(db, "discovery_run_tracks") == 0
        assert count(db, "beatport_tracks") == 0

    @pytest.mark.parametrize("counts", [{"tracks_found": 3}, {"songs": 1}])
    def test_only_the_counts_a_run_records(self, runs, run, counts):
        with pytest.raises(ValueError):
            runs.record_found(run.id, [], [], NOW, counts)
        with pytest.raises(ValueError):
            runs.update_counts(run.id, counts)

    def test_a_failure_part_way_writes_nothing(self, db, runs, run, monkeypatch):
        real = db.transaction

        @contextmanager
        def failing(*args, **kwargs):
            with real(*args, **kwargs) as conn:
                yield conn
                raise RuntimeError("disk gone")

        monkeypatch.setattr(db, "transaction", failing)
        with pytest.raises(RuntimeError):
            runs.record_found(
                run.id, [catalog_track(10)], [source(run.id, 10)], NOW, {}
            )
        monkeypatch.undo()
        for table in (
            "beatport_tracks",
            "discovery_run_tracks",
            "discovery_run_sources",
        ):
            assert count(db, table) == 0

    def test_an_ended_run_takes_no_more(self, runs, run):
        runs.finish_run(run.id, RUN_CANCELLED, LATER)
        with pytest.raises(ValueError):
            runs.record_found(run.id, [catalog_track(10)], [], NOW, {})
        with pytest.raises(ValueError):
            runs.update_counts(run.id, {"charts_read": 1})
        with pytest.raises(LookupError):
            runs.record_found(999, [], [], NOW, {})


class TestEndingARun:
    def test_it_gains_an_outcome_and_an_end_together(self, runs, run):
        ended = runs.finish_run(run.id, RUN_SUCCEEDED, LATER)
        assert (ended.outcome, ended.finished_at) == (RUN_SUCCEEDED, LATER)
        assert runs.get_run(run.id) == ended

    def test_a_failure_says_why_and_with_what_class(self, runs, run):
        ended = runs.finish_run(run.id, RUN_FAILED, LATER, "401", "rejected")
        assert (ended.error, ended.error_class) == ("401", "rejected")

    def test_the_models_rules_hold(self, runs, run):
        with pytest.raises(ValueError):
            runs.finish_run(run.id, RUN_FAILED, LATER)  # no reason
        with pytest.raises(ValueError):
            runs.finish_run(run.id, RUN_SUCCEEDED, LATER, error="why?")
        assert runs.get_run(run.id).is_running

    def test_it_ends_once(self, runs, run):
        runs.finish_run(run.id, RUN_SUCCEEDED, LATER)
        with pytest.raises(ValueError):
            runs.finish_run(run.id, RUN_FAILED, LATER, "again")
        with pytest.raises(LookupError):
            runs.finish_run(999, RUN_SUCCEEDED, LATER)

    def test_open_runs_are_closed_as_failed_and_ended_ones_left(self, runs, run):
        ended = runs.start_run(DiscoveryRun(started_at=NOW, params_json="{}"))
        runs.finish_run(ended.id, RUN_SUCCEEDED, LATER)
        runs.record_found(run.id, [catalog_track(10)], [], NOW, {})
        assert runs.close_interrupted(LATER, "stopped") == [run.id]
        closed = runs.get_run(run.id)
        assert (closed.outcome, closed.error, closed.tracks_found) == (
            RUN_FAILED,
            "stopped",
            1,
        )
        assert runs.get_run(ended.id).outcome == RUN_SUCCEEDED


class TestListingAndDeleting:
    def test_newest_first_in_pages(self, runs, run):
        second = runs.start_run(DiscoveryRun(started_at=NOW, params_json="{}"))
        assert [r.id for r in runs.list_runs()] == [second.id, run.id]
        assert [r.id for r in runs.list_runs(limit=1, offset=1)] == [run.id]

    def test_deleting_takes_its_tracks_and_reasons_and_leaves_the_catalog(
        self, db, runs, run
    ):
        runs.record_found(run.id, [catalog_track(10)], [source(run.id, 10)], NOW, {})
        runs.finish_run(run.id, RUN_SUCCEEDED, LATER)
        assert runs.delete_run(run.id) is True
        assert runs.get_run(run.id) is None
        assert count(db, "discovery_run_tracks") == 0
        assert count(db, "discovery_run_sources") == 0
        assert count(db, "beatport_tracks") == 1
        assert runs.delete_run(run.id) is False

    def test_a_running_run_is_not_deleted(self, runs, run):
        with pytest.raises(ValueError):
            runs.delete_run(run.id)


class TestReadingAWindow:
    @pytest.fixture
    def filled(self, db, runs, run):
        tracks = [
            replace(
                catalog_track(i, artists=[(i, name)], title=title), release_date=day
            )
            for i, name, title, day in [
                (10, "Zed", "b side", "2026-09-01"),
                (11, "Amy", "A side", None),
                (12, "Kit", "c side", "2026-09-20"),
                (13, "Bo", "D side", "2026-09-10"),
            ]
        ]
        runs.record_found(
            run.id, tracks, [source(run.id, t.id) for t in tracks], NOW, {}
        )
        with db.transaction() as conn:
            TrackRepository(db).add_many(
                [LibraryTrack(rekordbox_track_id="a", title="A", artist="A")]
            )
            accept(conn, 1, "12")
        return run

    def test_owned_hidden_by_default_and_counted(self, runs, filled):
        page = runs.run_tracks(filled.id)
        assert [r.track.beatport_track_id for r in page.rows] == [10, 11, 13]
        assert (page.total, page.tracks, page.owned, page.hidden) == (3, 4, 1, 1)

    def test_only_owned_and_all(self, runs, filled):
        only = runs.run_tracks(filled.id, owned=OWNED_ONLY)
        assert [(r.track.beatport_track_id, r.owned) for r in only.rows] == [(12, True)]
        assert (only.total, only.hidden) == (1, 0)
        every = runs.run_tracks(filled.id, owned=OWNED_ALL)
        assert [r.owned for r in every.rows] == [False, False, True, False]

    @pytest.mark.parametrize(
        "sort, descending, expected",
        [
            (SORT_FOUND, False, [10, 11, 12, 13]),
            (SORT_FOUND, True, [13, 12, 11, 10]),
            ("release_date", False, [10, 13, 12, 11]),
            ("release_date", True, [12, 13, 10, 11]),
            ("artist", False, [11, 13, 12, 10]),
            ("title", False, [11, 10, 12, 13]),
            ("title", True, [13, 12, 10, 11]),
        ],
    )
    def test_sorts_put_missing_values_last(
        self, runs, filled, sort, descending, expected
    ):
        page = runs.run_tracks(
            filled.id, owned=OWNED_ALL, sort=sort, descending=descending
        )
        assert [r.track.beatport_track_id for r in page.rows] == expected

    def test_windows_slice_the_list(self, runs, filled):
        page = runs.run_tracks(filled.id, owned=OWNED_ALL, offset=1, limit=2)
        assert [r.position for r in page.rows] == [1, 2]
        assert page.total == 4

    def test_rows_carry_credits_and_reasons(self, runs, filled):
        [row] = runs.run_tracks(filled.id, owned=OWNED_ALL, limit=1).rows
        assert (row.artists, row.remixers) == (("Zed",), ())
        assert [s.source_id for s in row.sources] == [1]

    def test_the_owned_set_is_built_once_per_statement(self, db, filled):
        """The plan builds the owned set once rather than asking per row."""
        from cuepoint.persistence import discovery_repository as module

        sql = (
            f"SELECT rt.position FROM discovery_run_tracks AS rt"
            f" WHERE rt.run_id = :run{module._OWNED_WHERE[OWNED_HIDE]}"
        )
        plan = " | ".join(
            r[3]
            for r in db.connect().execute(
                "EXPLAIN QUERY PLAN " + sql, {"run": filled.id, "owned": "[1]"}
            )
        )
        assert "LIST SUBQUERY" in plan and "CORRELATED LIST SUBQUERY" not in plan

    @pytest.mark.parametrize("owned", [OWNED_HIDE, OWNED_ONLY, OWNED_ALL])
    def test_the_ownership_view_is_read_once_per_window(self, db, runs, filled, owned):
        """DISCOVER-06: each ``IN (view)`` built every owned id again, and a
        window asked up to four times; at 40,000 accepted matches that was
        98 ms of a window. It is now read once, and every use shares it."""
        statements = []
        conn = db.connect()
        conn.set_trace_callback(statements.append)
        try:
            runs.run_tracks(filled.id, owned=owned)
        finally:
            conn.set_trace_callback(None)
        assert sum("library_beatport_tracks" in s for s in statements) == 1

    def test_an_empty_run(self, runs, run):
        page = runs.run_tracks(run.id)
        assert (page.rows, page.total, page.tracks) == ((), 0, 0)


class TestNameLookups:
    def test_saved_and_read_back_found_or_not(self, runs):
        found = BeatportNameLookup("label", "nightfall audio", NOW, 40211)
        missing = BeatportNameLookup("label", "cold room", NOW)
        runs.save_lookup(found)
        runs.save_lookup(missing)
        assert runs.lookups("label", ["nightfall audio", "cold room", "x"]) == {
            "nightfall audio": found,
            "cold room": missing,
        }
        assert runs.lookups("artist", ["nightfall audio"]) == {}

    def test_a_new_answer_replaces_the_old(self, runs):
        runs.save_lookup(BeatportNameLookup("label", "cold room", NOW))
        runs.save_lookup(BeatportNameLookup("label", "cold room", LATER, 7))
        assert runs.lookups("label", ["cold room"])["cold room"].beatport_id == 7

    def test_many_keys_at_once(self, runs):
        for i in range(700):
            runs.save_lookup(BeatportNameLookup("label", f"label {i}", NOW, i + 1))
        assert len(runs.lookups("label", [f"label {i}" for i in range(700)])) == 700


# ------------------------------------------------------ the library's scope


class TestTheLibrarysScope:
    @pytest.fixture
    def credits(self, db) -> TrackCreditRepository:
        TrackRepository(db).add_many(
            [
                LibraryTrack(
                    rekordbox_track_id="1",
                    title="a",
                    artist="Âme, Dixon",
                    label="Innervisions",
                ),
                LibraryTrack(
                    rekordbox_track_id="2",
                    title="b",
                    artist="Ame",
                    label="INNERVISIONS",
                ),
                LibraryTrack(
                    rekordbox_track_id="3", title="c", artist="Kiko", label="Cold Room"
                ),
                LibraryTrack(
                    rekordbox_track_id="4", title="d", artist="Kiko", label=None
                ),
            ]
        )
        return TrackCreditRepository(db)

    def test_every_credited_name_with_its_facet_spelling(self, credits):
        assert credits.library_artists() == [
            ("ame", "Ame"),
            ("dixon", "Dixon"),
            ("kiko", "Kiko"),
        ]

    def test_every_effective_label_overrides_included(self, db, credits):
        TrackMetadataRepository(db).set_override(3, "label", "Nightfall Audio")
        assert credits.library_labels() == [
            ("innervisions", "INNERVISIONS"),
            ("nightfall audio", "Nightfall Audio"),
        ]

    def test_an_artist_is_linked_only_where_both_sides_name_it(self, db, credits):
        catalog = BeatportCatalogRepository(db)
        catalog.upsert_tracks(
            [
                catalog_track(
                    100, artists=[(9, "Âme"), (8, "Dixon")], label=(70, "Innervisions")
                )
            ],
            NOW,
        )
        catalog.upsert_tracks(
            [catalog_track(101, artists=[(9, "Ame"), (7, "Someone Else")])], NOW
        )
        with db.transaction() as conn:
            accept(conn, 1, "100")
            accept(conn, 2, "101")
        # "Someone Else" is on track 2's Beatport track but not in its credit.
        assert credits.artist_ids_by_key() == {8: "dixon", 9: "ame"}

    def test_a_label_is_linked_by_its_tracks_and_the_majority_wins(self, db, credits):
        catalog = BeatportCatalogRepository(db)
        catalog.upsert_tracks(
            [
                catalog_track(100, label=(70, "Innervisions Records")),
                catalog_track(101, label=(71, "Wrong")),
                catalog_track(102, label=(72, "Cold Room")),
            ],
            NOW,
        )
        TrackRepository(db).add_many(
            [
                LibraryTrack(
                    rekordbox_track_id="5", title="e", artist="x", label="Innervisions"
                )
            ]
        )
        with db.transaction() as conn:
            accept(conn, 1, "100")
            accept(conn, 2, "101")
            accept(conn, 5, "100")
            accept(conn, 3, "102")
        assert credits.label_ids_by_key() == {"cold room": 72, "innervisions": 70}

    def test_a_tie_goes_to_the_lower_id(self, db, credits):
        catalog = BeatportCatalogRepository(db)
        catalog.upsert_tracks(
            [catalog_track(100, label=(71, "B")), catalog_track(101, label=(70, "A"))],
            NOW,
        )
        with db.transaction() as conn:
            accept(conn, 1, "100")
            accept(conn, 2, "101")
        assert credits.label_ids_by_key() == {"innervisions": 70}

    def test_nothing_resolved_links_nothing(self, credits):
        assert credits.artist_ids_by_key() == {}
        assert credits.label_ids_by_key() == {}
