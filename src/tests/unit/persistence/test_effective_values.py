#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The plain field names mean the value a user sees (CLEAN-05, DEC-068).

Five fields change meaning at once — in every filter, facet, sort and saved
Smart Collection — so these tests assert the new meaning, not the absence of
errors, and assert that each layer is still reachable under its own name:

- a filter finds a track by its override and stops finding it by the value it
  covers; ``<field>_rekordbox`` still does;
- **a saved Smart Collection with a ``bpm`` rule changes membership when an
  override is applied** — the test that states DEC-068's meaning change;
- a facet counts, and a sort orders by, effective values;
- the queue and the row payload carry them too; clearing falls back.
"""

from __future__ import annotations

from typing import Dict, List

import pytest

from cuepoint.engine.library_api import track_to_dict
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id="1",
                title="One",
                artist="A",
                key="8A",
                bpm=124.0,
                genre="House",
                label="Defected",
                year=2001,
            ),
            LibraryTrack(
                rekordbox_track_id="2",
                title="Two",
                artist="B",
                key="9A",
                bpm=130.0,
                genre="Techno",
                label="Drumcode",
                year=2010,
            ),
            LibraryTrack(
                rekordbox_track_id="3",
                title="Three",
                artist="C",
                key="10A",
                bpm=128.0,
                genre="House",
                label="Kompakt",
                year=2005,
            ),
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks) -> Dict[str, int]:
    rows = db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
    return {row["rekordbox_track_id"]: int(row["id"]) for row in rows}


@pytest.fixture
def activity(db, tracks):
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def metadata(db, tracks, activity) -> MetadataService:
    return MetadataService(TrackMetadataRepository(db), tracks, activity, db)


@pytest.fixture
def collections(db, tracks, activity) -> CollectionService:
    return CollectionService(CollectionRepository(db), db, tracks, activity)


@pytest.fixture
def library(db, tracks) -> LibraryService:
    return LibraryService(
        track_repository=tracks,
        collection_repository=CollectionRepository(db),
        metadata_repository=TrackMetadataRepository(db),
        authored_repository=AuthoredDataRepository(db),
    )


def rules(*clauses) -> BrowseQuery:
    return BrowseQuery(rules=RuleSet(rules=tuple(FilterRule(*c) for c in clauses)))


def named(tracks, ids, query: BrowseQuery) -> List[str]:
    by_id = {track_id: rid for rid, track_id in ids.items()}
    return [by_id[track_id] for track_id in tracks.browse_ids(query, limit=100)]


class TestFilters:
    @pytest.mark.parametrize(
        "field, value, operator, by_override, by_import",
        [
            ("bpm", 140, "gt", 132.0, 129),
            ("key", "Fm", "is", "Fm", "8A"),
            ("genre", "Dub", "is", "Dub", "House"),
            ("label", "Mine", "is", "Mine", "Defected"),
            ("year", 2030, "is", 2024, 2001),
        ],
    )
    def test_a_track_is_found_by_its_override_and_not_by_what_it_covers(
        self, tracks, metadata, ids, field, value, operator, by_override, by_import
    ):
        override = {
            "bpm": 150,
            "key": "Fm",
            "genre": "Dub",
            "label": "Mine",
            "year": 2024,
        }
        metadata.set_override(ids["1"], field, override[field], notation="classic")

        found = named(
            tracks,
            ids,
            rules((field, "is", override[field] if field != "bpm" else 150)),
        )
        assert "1" in found
        if field != "bpm":
            assert "1" not in named(tracks, ids, rules((field, "is", by_import)))
            assert "1" in named(
                tracks, ids, rules((f"{field}_rekordbox", "is", by_import))
            )
        else:
            assert named(tracks, ids, rules(("bpm", "lt", 125))) == []
            assert named(tracks, ids, rules(("bpm_rekordbox", "lt", 125))) == ["1"]

    def test_the_override_alone_is_addressable(self, tracks, metadata, ids):
        metadata.set_override(ids["2"], "genre", "Dub")
        assert named(tracks, ids, rules(("cuepoint_genre", "is_not_empty"))) == ["2"]
        assert sorted(named(tracks, ids, rules(("cuepoint_genre", "is_empty")))) == [
            "1",
            "3",
        ]

    def test_clearing_an_override_falls_back_to_rekordboxs_value(
        self, tracks, metadata, ids
    ):
        metadata.set_override(ids["1"], "genre", "Dub")
        metadata.set_override(ids["1"], "genre", None)
        assert sorted(named(tracks, ids, rules(("genre", "is", "House")))) == ["1", "3"]


class TestASavedSmartCollection:
    def test_its_membership_changes_when_an_override_is_applied(
        self, tracks, metadata, collections, ids
    ):
        smart = collections.create_smart(
            "Fast", RuleSet(rules=(FilterRule("bpm", "gt", 128),))
        )

        def members() -> List[str]:
            query = collections.resolve(smart.id).require_query()
            return sorted(named(tracks, ids, query))

        assert members() == ["2"]
        metadata.set_override(ids["1"], "bpm", 132)
        assert members() == ["1", "2"]
        metadata.set_override(ids["2"], "bpm", 120, source="beatport")
        assert members() == ["1"]
        metadata.set_override(ids["1"], "bpm", None)
        assert members() == []


class TestFacetsAndSorting:
    def test_a_facet_counts_effective_values_and_the_import_is_still_countable(
        self, tracks, metadata, ids
    ):
        metadata.set_override(ids["1"], "genre", "Techno")
        effective = tracks.facet_values(BrowseQuery(), "genre")
        imported = tracks.facet_values(BrowseQuery(), "genre_rekordbox")
        assert {v.value: v.count for v in effective.values} == {"Techno": 2, "House": 1}
        assert {v.value: v.count for v in imported.values} == {"House": 2, "Techno": 1}

    def test_a_facet_count_is_the_count_of_its_rule(self, tracks, metadata, ids):
        metadata.set_override(ids["3"], "key", "Am", notation="camelot")
        for value in tracks.facet_values(BrowseQuery(), "key").values:
            assert tracks.browse_count(rules(("key", "is", value.value))) == value.count

    def test_a_range_spans_effective_values(self, tracks, metadata, ids):
        metadata.set_override(ids["2"], "bpm", 175)
        span = tracks.facet_range(BrowseQuery(), "bpm")
        assert (span.minimum, span.maximum) == (124.0, 175.0)

    @pytest.mark.parametrize(
        "sort, field, value, expected",
        [
            ("bpm", "bpm", 100, ["2", "1", "3"]),
            ("year", "year", 1990, ["3", "1", "2"]),
            ("genre", "genre", "Acid", ["2", "1", "3"]),
            ("label", "label", "Aardvark", ["3", "1", "2"]),
            ("key", "key", "1A", ["3", "1", "2"]),
        ],
    )
    def test_sorting_orders_by_the_effective_value(
        self, tracks, metadata, ids, sort, field, value, expected
    ):
        target = expected[0]
        metadata.set_override(ids[target], field, value, notation="camelot")
        query = BrowseQuery(sort=sort)
        assert named(tracks, ids, query) == expected
        rows = tracks.browse(query, limit=10)
        assert [row.id for row in rows] == tracks.browse_ids(query, limit=10)
        assert tracks.browse_count(query) == 3

    def test_sorting_needs_no_rule_to_bring_in_the_join(self, tracks, metadata, ids):
        from cuepoint.persistence.track_query import build_count, build_select

        assert "track_metadata" in build_select(BrowseQuery(sort="bpm"))[0]
        # A count cannot be changed by an order, so it asks for no join.
        assert "track_metadata" not in build_count(BrowseQuery(sort="bpm"))[0]
        assert "track_metadata" not in build_select(BrowseQuery(sort="title"))[0]


class TestWhatAWindowCarries:
    def test_the_queue_plays_the_effective_key_and_bpm(self, tracks, metadata, ids):
        metadata.set_override(ids["1"], "key", "Fm", notation="classic")
        metadata.set_override(ids["1"], "bpm", 126)
        queue = {
            entry.id: entry for entry in tracks.browse_queue(BrowseQuery(), limit=10)
        }
        assert (queue[ids["1"]].key, queue[ids["1"]].bpm) == ("Fm", 126.0)
        assert (queue[ids["2"]].key, queue[ids["2"]].bpm) == ("9A", 130.0)

    def test_a_row_carries_both_layers_and_names_what_is_overridden(
        self, library, metadata, ids
    ):
        metadata.set_override(ids["1"], "bpm", 126)
        metadata.set_override(ids["1"], "label", "Mine")
        window = library.browse_tracks(sort="title")
        rows = {
            row["rekordbox_track_id"]: row
            for row in (
                track_to_dict(track, window.metadata.get(track.id))
                for track in window.tracks
            )
        }

        one = rows["1"]
        assert (one["bpm"], one["effective_bpm"]) == (124.0, 126.0)
        assert (one["label"], one["effective_label"]) == ("Defected", "Mine")
        assert (one["genre"], one["effective_genre"]) == ("House", "House")
        assert one["overridden"] == ["bpm", "label"]
        two = rows["2"]
        assert two["overridden"] == []
        assert two["effective_key"] == two["key"] == "9A"


class TestTextSearch:
    """A text query searches the effective label (DEC-068), in both search paths."""

    def test_the_library_table_finds_a_track_by_its_label_override(
        self, library, metadata, ids
    ):
        metadata.set_override(ids["1"], "label", "Hidden Gem Records")

        found = library.browse_tracks(query="Hidden Gem")
        covered = library.browse_tracks(query="Defected")

        assert [t.rekordbox_track_id for t in found.tracks] == ["1"]
        assert found.total == 1
        assert covered.tracks == [] and covered.total == 0

    def test_global_search_finds_it_too_and_counts_what_it_returns(
        self, tracks, metadata, ids
    ):
        metadata.set_override(ids["2"], "label", "Hidden Gem Records")
        rows = tracks.search("hidden gem")
        assert [row.rekordbox_track_id for row in rows] == ["2"]
        assert tracks.search_count("hidden gem") == 1
        # The rows are the imported record: the join is only for the search.
        assert rows[0].label == "Drumcode"

    def test_title_and_artist_are_still_searched(self, tracks, metadata, ids):
        metadata.set_override(ids["3"], "label", "Mine")
        assert [row.rekordbox_track_id for row in tracks.search("Three")] == ["3"]
        assert tracks.search_count("B") >= 1


class TestAWholeLibraryFacetCountsALayerAtATime:
    """An unfiltered effective facet is counted per layer, for speed (CLEAN-05).

    The imported half groups through the facet index and the overrides group
    on their own; any rule brings back the joined scan. The two must never
    disagree, so every whole-library facet is compared, page size and all,
    with the same facet under a rule that matches every track.
    """

    @pytest.fixture
    def messy(self, db, tracks, metadata) -> Dict[str, int]:
        tracks.add_many(
            [
                LibraryTrack(
                    rekordbox_track_id="4",
                    title="Four",
                    artist="D",
                    genre="house",
                    key="8a",
                    label="defected",
                    year=None,
                ),
                LibraryTrack(
                    rekordbox_track_id="5",
                    title="Five",
                    artist="E",
                    genre="HOUSE",
                    key="",
                    label="",
                    year=2001,
                ),
                LibraryTrack(
                    rekordbox_track_id="6",
                    title="Six",
                    artist="F",
                    genre="",
                    key=None,
                    label=None,
                    year=2001,
                ),
                LibraryTrack(
                    rekordbox_track_id="7",
                    title="Seven",
                    artist="G",
                    genre=None,
                    key="9A",
                    label="Kompakt",
                    year=2010,
                ),
            ]
        )
        rows = {
            row["rekordbox_track_id"]: int(row["id"])
            for row in db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
        }
        # Overrides that merge with an imported spelling, stand alone, cover a
        # blank or a missing value, and one set and then cleared.
        metadata.set_override(rows["1"], "genre", "techno")
        metadata.set_override(rows["6"], "genre", "Dub")
        metadata.set_override(rows["7"], "genre", "house")
        metadata.set_override(rows["5"], "label", "DEFECTED")
        metadata.set_override(rows["6"], "key", "Am", notation="camelot")
        metadata.set_override(rows["4"], "year", 2010)
        metadata.set_override(rows["2"], "year", 1995)
        metadata.set_override(rows["3"], "label", "Gone")
        metadata.set_override(rows["3"], "label", None)
        return rows

    @pytest.mark.parametrize("limit", [0, 1, 2])
    @pytest.mark.parametrize("field", ["genre", "key", "label", "year"])
    def test_it_answers_exactly_what_the_joined_scan_answers(
        self, tracks, messy, field, limit
    ):
        everything = rules(("title", "is_not_empty"))
        assert tracks.browse_count(everything) == tracks.browse_count(BrowseQuery())

        split = tracks.facet_values(BrowseQuery(), field, limit).to_dict()
        joined = tracks.facet_values(everything, field, limit).to_dict()

        assert split == joined
        assert split["values"], "a facet over this library is never empty"

    def test_the_counts_are_the_effective_ones(self, tracks, messy):
        genre = {
            (v["value"] or "").lower(): v["count"]
            for v in tracks.facet_values(BrowseQuery(), "genre").to_dict()["values"]
        }
        # House: track 3 imported "House", 4 "house", 5 "HOUSE", 7 by override.
        # One group, shown as its first spelling, as the joined scan shows it.
        assert genre["house"] == 4
        assert genre["techno"] == 2 and genre["dub"] == 1
        shown = [
            v["value"]
            for v in tracks.facet_values(BrowseQuery(), "genre").to_dict()["values"]
        ]
        assert "HOUSE" in shown and "House" not in shown

    def test_the_registry_keeps_the_shape_the_split_relies_on(self):
        from cuepoint.models.filter_rule import METADATA_ALIAS, field_spec
        from cuepoint.models.track_metadata import OVERRIDE_FIELDS

        for name in OVERRIDE_FIELDS:
            assert (
                field_spec(name).expression
                == f"COALESCE({METADATA_ALIAS}.{name}, tracks.{name})"
            )
