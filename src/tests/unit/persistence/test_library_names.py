#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Artists and labels as things a rule can name (DISCOVER-03, DEC-094, DEC-095).

The credit index and the label keys are derived data, and derived data goes
wrong in one of three ways. Each class below is about one of them:

1. **It is not written when its source is.** Every path that writes a track's
   artist, remixer or label — insert, bulk insert, the import and refresh
   upsert, an update, a revert, a label override — must write the derived rows
   in the same transaction. The tests go through each path, including the
   services a user reaches them by.
2. **It is written when nothing changed.** A refresh that changes only a BPM
   must not touch a track's credits; a sentinel row proves it was left alone.
3. **It answers differently from where it came from.** A rebuild must produce
   exactly the rows the write path produces; a rule must count exactly what its
   facet counted; a Smart Collection must find exactly what the filter does.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import pytest

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION, name_key
from cuepoint.models.filter_rule import (
    FilterRule,
    FilterRuleError,
    RuleSet,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.track_credit import (
    LABEL_KEYS_INDEX,
    NAME_INDEXES,
    TRACK_CREDITS_INDEX,
)
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.track_credit_repository import (
    TrackCreditRepository,
    credit_rows,
    label_key_of,
)
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.credit_index_service import CreditIndexService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-23T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    return TrackRepository(db)


@pytest.fixture
def credits(db) -> TrackCreditRepository:
    return TrackCreditRepository(db)


def track(number: int, **fields) -> LibraryTrack:
    fields.setdefault("title", f"T{number}")
    fields.setdefault("artist", "An Artist")
    return LibraryTrack(
        rekordbox_track_id=str(number), file_path=f"/m/{number}.mp3", **fields
    )


def stored_credits(db, track_id: int) -> List[Tuple[str, int, str, str]]:
    return [
        (r["role"], r["position"], r["name"], r["name_key"])
        for r in db.connect().execute(
            "SELECT role, position, name, name_key FROM track_credits"
            " WHERE track_id = ? ORDER BY role, position",
            (track_id,),
        )
    ]


def all_credits(db) -> List[tuple]:
    return [
        tuple(r)
        for r in db.connect().execute(
            "SELECT track_id, role, position, name, name_key FROM track_credits"
            " ORDER BY track_id, role, position"
        )
    ]


def label_keys(db) -> Dict[int, Tuple[object, object]]:
    return {
        int(r["id"]): (r["label_key"], r["meta_key"])
        for r in db.connect().execute(
            "SELECT tracks.id AS id, tracks.label_key AS label_key,"
            " track_metadata.label_key AS meta_key FROM tracks"
            " LEFT JOIN track_metadata ON track_metadata.track_id = tracks.id"
        )
    }


def id_of(db, rekordbox_id: str) -> int:
    return int(
        db.connect()
        .execute("SELECT id FROM tracks WHERE rekordbox_track_id = ?", (rekordbox_id,))
        .fetchone()["id"]
    )


def rule(field: str, operator: str, value=None) -> BrowseQuery:
    return BrowseQuery(rules=RuleSet(rules=(FilterRule(field, operator, value),)))


def titles(tracks: TrackRepository, query: BrowseQuery) -> List[str]:
    return sorted(t.title for t in tracks.browse(query, limit=1000))


def add_sentinel(db, track_id: int) -> None:
    """A credit no write path would ever produce, to see whether one ran."""
    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO track_credits (track_id, role, position, name, name_key)"
            " VALUES (?, 'remixer', 99, 'Sentinel', 'sentinel')",
            (track_id,),
        )


def has_sentinel(db, track_id: int) -> bool:
    row = (
        db.connect()
        .execute(
            "SELECT 1 FROM track_credits WHERE track_id = ? AND name = 'Sentinel'",
            (track_id,),
        )
        .fetchone()
    )
    return row is not None


# ----------------------------------------------------- written where written


@pytest.mark.unit
class TestCreditsAreWrittenWithTheTrack:
    def test_add_writes_them(self, db, tracks):
        stored = tracks.add(track(1, artist="A, B feat. C", remixer="Âme"))
        assert stored_credits(db, stored.id) == [
            ("artist", 0, "A", "a"),
            ("artist", 1, "B", "b"),
            ("artist", 2, "C", "c"),
            ("remixer", 0, "Âme", "ame"),
        ]

    def test_add_many_writes_each_track_s_own(self, db, tracks):
        tracks.add_many(
            [track(1, artist="A"), track(2, artist="B, C"), track(3, artist="")]
        )
        assert [c[2] for c in stored_credits(db, id_of(db, "1"))] == ["A"]
        assert [c[2] for c in stored_credits(db, id_of(db, "2"))] == ["B", "C"]
        assert stored_credits(db, id_of(db, "3")) == []

    def test_an_import_writes_them(self, db, tracks):
        result = tracks.upsert_many_from_rekordbox(
            [track(i, artist=f"Artist {i}, Guest") for i in range(1, 6)]
        )
        assert result.inserted == 5
        for i in range(1, 6):
            names = [c[2] for c in stored_credits(db, id_of(db, str(i)))]
            assert names == [f"Artist {i}", "Guest"]

    def test_an_import_larger_than_one_batch_credits_every_track(self, db, tracks):
        tracks.upsert_many_from_rekordbox(
            [track(i, artist=f"Artist {i}") for i in range(1, 26)], batch_size=4
        )
        assert len(all_credits(db)) == 25

    def test_a_refresh_that_changes_an_artist_rewrites_its_credits(self, db, tracks):
        tracks.upsert_many_from_rekordbox([track(1, artist="A, B")])
        tracks.upsert_many_from_rekordbox([track(1, artist="A feat. C")])
        assert [c[2] for c in stored_credits(db, id_of(db, "1"))] == ["A", "C"]

    def test_a_refresh_that_changes_a_remixer_rewrites_its_credits(self, db, tracks):
        tracks.upsert_many_from_rekordbox([track(1, remixer="Old")])
        tracks.upsert_many_from_rekordbox([track(1, remixer="New")])
        assert ("remixer", 0, "New", "new") in stored_credits(db, id_of(db, "1"))

    def test_a_refresh_that_changes_only_the_bpm_leaves_them_alone(self, db, tracks):
        tracks.upsert_many_from_rekordbox([track(1, artist="A, B", bpm=120.0)])
        track_id = id_of(db, "1")
        add_sentinel(db, track_id)
        tracks.upsert_many_from_rekordbox([track(1, artist="A, B", bpm=128.0)])
        assert has_sentinel(db, track_id)
        assert tracks.get(track_id).bpm == 128.0

    def test_a_refresh_moving_between_none_and_empty_leaves_them_alone(
        self, db, tracks
    ):
        tracks.upsert_many_from_rekordbox([track(1, remixer=None)])
        track_id = id_of(db, "1")
        add_sentinel(db, track_id)
        tracks.upsert_many_from_rekordbox([track(1, remixer="")])
        assert has_sentinel(db, track_id)

    def test_a_relinked_track_keeps_its_id_and_its_credits_follow_it(self, db, tracks):
        tracks.upsert_many_from_rekordbox([track(1, artist="A")])
        track_id = id_of(db, "1")
        renumbered = LibraryTrack(
            rekordbox_track_id="900", file_path="/m/1.mp3", title="T1", artist="B"
        )
        result = tracks.upsert_many_from_rekordbox([renumbered])
        assert result.relinked_count == 1
        assert [c[2] for c in stored_credits(db, track_id)] == ["B"]

    def test_update_rewrites_them_when_a_credit_changed(self, db, tracks):
        stored = tracks.add(track(1, artist="A"))
        stored.artist = "B & C"
        tracks.update(stored)
        assert [c[2] for c in stored_credits(db, stored.id)] == ["B & C"]

    def test_update_leaves_them_alone_when_no_credit_changed(self, db, tracks):
        stored = tracks.add(track(1, artist="A"))
        add_sentinel(db, stored.id)
        stored.bpm = 126.0
        tracks.update(stored)
        assert has_sentinel(db, stored.id)

    def test_a_revert_of_the_artist_rewrites_them(self, db, tracks):
        activity = ActivityService(ActivityRepository(db), tracks)
        stored = tracks.add(track(1, artist="Old Name"))
        change = activity.apply_field_change(stored, "artist", "New Name")
        assert [c[2] for c in stored_credits(db, stored.id)] == ["New Name"]
        activity.revert_field_change(change.id)
        assert [c[2] for c in stored_credits(db, stored.id)] == ["Old Name"]

    def test_deleting_a_track_takes_its_credits(self, db, tracks):
        stored = tracks.add(track(1, artist="A, B"))
        tracks.delete(stored.id)
        assert all_credits(db) == []

    def test_a_refresh_that_deletes_tracks_takes_their_credits(self, db, tracks):
        tracks.upsert_many_from_rekordbox([track(1, artist="A"), track(2, artist="B")])
        result = tracks.upsert_many_from_rekordbox([track(1, artist="A")])
        tracks.delete_many(result.unclaimed_track_ids)
        assert [c[3] for c in all_credits(db)] == ["A"]

    def test_a_failed_import_writes_no_credits(self, db, tracks):
        with pytest.raises(Exception):
            with db.transaction() as conn:
                tracks.add_many([track(1, artist="A")])
                conn.execute("SELECT * FROM no_such_table")
        assert all_credits(db) == []


@pytest.mark.unit
class TestLabelKeysAreWrittenWithTheLabel:
    def test_an_imported_label_carries_its_key(self, db, tracks):
        stored = tracks.add(track(1, label="Nightfall-Audio"))
        assert label_keys(db)[stored.id] == ("nightfall audio", None)

    @pytest.mark.parametrize("label", [None, "", "   "])
    def test_no_label_and_a_blank_label_have_no_key(self, db, tracks, label):
        stored = tracks.add(track(1, label=label))
        assert label_keys(db)[stored.id][0] is None

    def test_a_refresh_that_changes_the_label_changes_the_key(self, db, tracks):
        tracks.upsert_many_from_rekordbox([track(1, label="Old")])
        tracks.upsert_many_from_rekordbox([track(1, label="New Label")])
        assert label_keys(db)[id_of(db, "1")][0] == "new label"

    def test_an_override_carries_its_key(self, db, tracks):
        stored = tracks.add(track(1, label="Imported"))
        TrackMetadataRepository(db).set_override(stored.id, "label", "Ámbar Records")
        assert label_keys(db)[stored.id] == ("imported", "ambar records")

    def test_clearing_the_override_clears_its_key(self, db, tracks):
        stored = tracks.add(track(1, label="Imported"))
        metadata = TrackMetadataRepository(db)
        metadata.set_override(stored.id, "label", "Override")
        metadata.set_override(stored.id, "label", None)
        assert label_keys(db)[stored.id] == ("imported", None)

    def test_another_override_leaves_the_label_key_alone(self, db, tracks):
        stored = tracks.add(track(1, label="Imported"))
        metadata = TrackMetadataRepository(db)
        metadata.set_override(stored.id, "label", "Override")
        metadata.set_override(stored.id, "genre", "Techno")
        metadata.set_rating(stored.id, 4)
        assert label_keys(db)[stored.id] == ("imported", "override")

    def test_a_rating_alone_makes_a_row_with_no_label_key(self, db, tracks):
        stored = tracks.add(track(1, label="Imported"))
        TrackMetadataRepository(db).set_rating(stored.id, 3)
        assert label_keys(db)[stored.id] == ("imported", None)


# -------------------------------------------------------------- the rules


@pytest.fixture
def library(db, tracks) -> Dict[str, int]:
    """Credits and labels chosen to catch every way a name rule can be wrong."""
    rows = {
        "1": dict(artist="A, B & C", label="Nightfall Audio"),
        "2": dict(artist="B feat. D", label="NIGHTFALL-AUDIO"),
        "3": dict(artist="Bob B", label="Other Label"),
        "4": dict(artist="A, B", remixer="Âme", label=""),
        "5": dict(artist="Ame", label=None),
        "6": dict(artist="", label="Kompakt"),
    }
    for number, fields in rows.items():
        tracks.add(track(int(number), **fields))
    return {number: id_of(db, number) for number in rows}


@pytest.mark.unit
class TestArtistNameRule:
    def test_is_finds_an_artist_in_a_list_and_a_featured_one(self, tracks, library):
        assert titles(tracks, rule("artist_name", "is", "B")) == ["T2", "T4"]

    def test_is_never_finds_a_name_that_merely_contains_it(self, tracks, library):
        assert "T3" not in titles(tracks, rule("artist_name", "is", "B"))

    def test_an_act_joined_by_an_ampersand_is_its_own_artist(self, tracks, library):
        assert titles(tracks, rule("artist_name", "is", "B & C")) == ["T1"]

    def test_case_accents_and_punctuation_do_not_matter(self, tracks, library):
        expected = ["T4", "T5"]
        for spelling in ("Ame", "AME", "Âme", " âme "):
            assert titles(tracks, rule("artist_name", "is", spelling)) == expected

    def test_remixer_credits_count(self, tracks, library):
        assert "T4" in titles(tracks, rule("artist_name", "is", "Âme"))

    def test_is_not_is_the_exact_complement_including_uncredited_tracks(
        self, tracks, library
    ):
        found = titles(tracks, rule("artist_name", "is_not", "B"))
        assert found == ["T1", "T3", "T5", "T6"]
        everyone = titles(tracks, BrowseQuery())
        assert sorted(found + titles(tracks, rule("artist_name", "is", "B"))) == (
            everyone
        )

    def test_any_of_is_by_any_of_them(self, tracks, library):
        assert titles(tracks, rule("artist_name", "any_of", ["d", "bob b"])) == [
            "T2",
            "T3",
        ]

    def test_a_track_crediting_a_name_twice_is_found_once(self, db, tracks):
        tracks.add(track(1, artist="A", remixer="A"))
        assert tracks.browse_count(rule("artist_name", "is", "A")) == 1

    def test_a_count_agrees_with_the_rows(self, tracks, library):
        query = rule("artist_name", "is", "B")
        assert tracks.browse_count(query) == len(titles(tracks, query))

    def test_the_rule_keeps_the_name_as_typed(self):
        checked = FilterRule("artist_name", "is", "  Âme  ").validated()
        assert checked.value == "Âme"

    @pytest.mark.parametrize("value", ["", "   "])
    def test_a_blank_name_is_refused_even_for_is(self, value):
        with pytest.raises(FilterRuleError, match="needs a name"):
            FilterRule("artist_name", "is", value).validated()

    @pytest.mark.parametrize("operator", ["contains", "starts_with", "is_empty"])
    def test_only_whole_name_operators_are_allowed(self, operator):
        with pytest.raises(FilterRuleError):
            FilterRule("artist_name", operator, "B").validated()

    def test_it_composes_with_other_rules(self, tracks, library):
        query = BrowseQuery(
            rules=RuleSet(
                rules=(
                    FilterRule("artist_name", "is", "B"),
                    FilterRule("label_name", "is", "nightfall audio"),
                )
            )
        )
        assert titles(tracks, query) == ["T2"]


@pytest.mark.unit
class TestLabelNameRule:
    def test_spellings_of_one_label_are_one_label(self, tracks, library):
        for spelling in ("Nightfall Audio", "nightfall-audio", "NIGHTFALL AUDIO"):
            assert titles(tracks, rule("label_name", "is", spelling)) == ["T1", "T2"]

    def test_an_override_puts_a_track_under_its_label(self, db, tracks, library):
        TrackMetadataRepository(db).set_override(
            library["6"], "label", "Nightfall Audio"
        )
        assert titles(tracks, rule("label_name", "is", "nightfall audio")) == [
            "T1",
            "T2",
            "T6",
        ]

    def test_an_override_takes_a_track_away_from_the_label_it_replaced(
        self, db, tracks, library
    ):
        TrackMetadataRepository(db).set_override(library["1"], "label", "Kompakt")
        assert titles(tracks, rule("label_name", "is", "nightfall audio")) == ["T2"]
        assert titles(tracks, rule("label_name", "is", "kompakt")) == ["T1", "T6"]

    def test_clearing_the_override_puts_it_back(self, db, tracks, library):
        metadata = TrackMetadataRepository(db)
        metadata.set_override(library["1"], "label", "Kompakt")
        metadata.set_override(library["1"], "label", None)
        assert titles(tracks, rule("label_name", "is", "nightfall audio")) == [
            "T1",
            "T2",
        ]

    def test_is_not_keeps_the_tracks_with_no_label(self, tracks, library):
        assert titles(tracks, rule("label_name", "is_not", "Nightfall Audio")) == [
            "T3",
            "T4",
            "T5",
            "T6",
        ]

    def test_any_of(self, tracks, library):
        assert titles(
            tracks, rule("label_name", "any_of", ["kompakt", "OTHER label"])
        ) == [
            "T3",
            "T6",
        ]

    def test_it_is_not_the_plain_label_rule(self, tracks, library):
        # The plain rule compares the spelling; this one compares identity.
        assert titles(tracks, rule("label", "is", "nightfall audio")) == ["T1"]


@pytest.mark.unit
class TestTheFacetsCountWhatTheRulesFind:
    @pytest.mark.parametrize("field", ["artist_name", "label_name"])
    def test_every_value_s_count_is_its_rule_s_count(self, tracks, library, field):
        facet = tracks.facet_values(None, field)
        assert facet.values
        for value in facet.values:
            if value.value is None:
                continue
            assert tracks.browse_count(rule(field, "is", value.value)) == value.count

    def test_the_artist_facet_lists_each_artist_once_by_a_name(self, tracks, library):
        facet = tracks.facet_values(None, "artist_name")
        shown = {v.value: v.count for v in facet.values if v.value is not None}
        assert shown == {"A": 2, "Ame": 2, "B": 2, "B & C": 1, "Bob B": 1, "D": 1}
        assert facet.total_values == 7  # six artists and the uncredited track

    def test_the_uncredited_tracks_are_the_no_value_bucket(self, tracks, library):
        facet = tracks.facet_values(None, "artist_name")
        assert facet.values[-1].value is None and facet.values[-1].count == 1

    def test_the_label_facet_groups_spellings_and_counts_the_unlabelled(
        self, tracks, library
    ):
        facet = tracks.facet_values(None, "label_name")
        shown = {v.value: v.count for v in facet.values}
        assert shown == {"NIGHTFALL-AUDIO": 2, "Other Label": 1, "Kompakt": 1, None: 2}

    def test_a_facet_honours_every_other_rule(self, tracks, library):
        narrowed = rule("label_name", "is", "Other Label")
        facet = tracks.facet_values(narrowed, "artist_name")
        assert [(v.value, v.count) for v in facet.values] == [("Bob B", 1)]

    def test_a_facet_ignores_its_own_rule(self, tracks, library):
        own = rule("artist_name", "is", "B")
        assert tracks.facet_values(own, "artist_name") == tracks.facet_values(
            None, "artist_name"
        )

    def test_a_facet_honours_a_text_search(self, tracks, library):
        facet = tracks.facet_values(BrowseQuery(query="T3"), "artist_name")
        assert [(v.value, v.count) for v in facet.values] == [("Bob B", 1)]

    def test_a_truncated_artist_facet_says_so(self, db, tracks):
        tracks.add_many([track(i, artist=f"Artist {i}") for i in range(1, 8)])
        facet = tracks.facet_values(None, "artist_name", limit=3)
        assert facet.truncated and len(facet.values) == 3 and facet.total_values == 7


@pytest.mark.unit
class TestASavedRuleFindsWhatTheFilterFinds:
    """DEC-043: one rule model, so a Smart Collection and a filter agree."""

    @pytest.mark.parametrize(
        "field, operator, value",
        [
            ("artist_name", "is", "B"),
            ("artist_name", "is_not", "Âme"),
            ("artist_name", "any_of", ["A", "D"]),
            ("label_name", "is", "nightfall audio"),
            ("label_name", "is_not", "Kompakt"),
        ],
    )
    def test_the_same_tracks(self, db, tracks, library, field, operator, value):
        activity = ActivityService(ActivityRepository(db), tracks)
        collections = CollectionService(CollectionRepository(db), db, tracks, activity)
        rules = RuleSet(rules=(FilterRule(field, operator, value),))
        smart = collections.create_smart("Saved", rules)
        saved = collections.resolve(int(smart.id)).require_query()
        assert titles(tracks, saved) == titles(tracks, BrowseQuery(rules=rules))
        assert collections.get(int(smart.id)) is not None


# ------------------------------------------------------------- the rebuild


@pytest.mark.unit
class TestTheRebuild:
    def _library_without_its_index(self, db, tracks) -> None:
        tracks.upsert_many_from_rekordbox(
            [
                track(1, artist="A, B feat. C", remixer="Âme", label="Nightfall"),
                track(2, artist="Above & Beyond", label=""),
                track(3, artist="", remixer=None, label="Kompakt"),
            ]
            + [track(i, artist=f"Artist {i}", label=f"L{i % 3}") for i in range(4, 40)]
        )
        TrackMetadataRepository(db).set_override(id_of(db, "3"), "label", "Ámbar")

    def test_it_builds_exactly_what_the_write_path_writes(self, db, tracks, credits):
        self._library_without_its_index(db, tracks)
        written = (all_credits(db), label_keys(db))
        with db.transaction() as conn:
            conn.execute("DELETE FROM track_credits")
            conn.execute("UPDATE tracks SET label_key = NULL")
            conn.execute("UPDATE track_metadata SET label_key = NULL")
        CreditIndexService(credits, chunk_size=7).rebuild()
        assert (all_credits(db), label_keys(db)) == written

    def test_it_replaces_stale_rows_rather_than_adding_to_them(
        self, db, tracks, credits
    ):
        self._library_without_its_index(db, tracks)
        written = all_credits(db)
        add_sentinel(db, id_of(db, "1"))
        with db.transaction() as conn:
            conn.execute("UPDATE track_credits SET name_key = 'stale'")
        CreditIndexService(credits, chunk_size=5).rebuild()
        assert all_credits(db) == written

    def test_it_records_every_name_index_at_its_version(self, db, tracks, credits):
        self._library_without_its_index(db, tracks)
        assert not credits.is_current(ENTITY_NAMES_VERSION)
        CreditIndexService(credits).rebuild()
        built = {index.name: index.version for index in credits.built()}
        assert built == {name: ENTITY_NAMES_VERSION for name in NAME_INDEXES}
        assert set(NAME_INDEXES) == {TRACK_CREDITS_INDEX, LABEL_KEYS_INDEX}
        assert credits.is_current(ENTITY_NAMES_VERSION)

    def test_a_version_bump_makes_it_stale_and_rebuilds(self, db, tracks, credits):
        self._library_without_its_index(db, tracks)
        CreditIndexService(credits).rebuild()
        bumped = CreditIndexService(credits, version=ENTITY_NAMES_VERSION + 1)
        assert not bumped.is_current()
        result = bumped.rebuild()
        assert result.tracks == 39 and not result.cancelled
        assert bumped.is_current()
        # And the older rule sees an index it did not build, after a downgrade.
        assert not CreditIndexService(credits).is_current()

    def test_one_index_missing_is_not_current(self, db, tracks, credits):
        CreditIndexService(credits).rebuild()
        with db.transaction() as conn:
            conn.execute(
                "DELETE FROM derived_indexes WHERE name = ?", (LABEL_KEYS_INDEX,)
            )
        assert not credits.is_current(ENTITY_NAMES_VERSION)

    def test_an_empty_library_is_indexed_at_once(self, db, credits):
        result = CreditIndexService(credits).rebuild()
        assert (result.tracks, result.total) == (0, 0)
        assert credits.is_current(ENTITY_NAMES_VERSION)

    def test_a_cancel_keeps_the_chunks_it_finished_and_records_nothing(
        self, db, tracks, credits
    ):
        self._library_without_its_index(db, tracks)
        with db.transaction() as conn:
            conn.execute("DELETE FROM track_credits")
        asked = []

        def cancel_after_two_chunks() -> bool:
            asked.append(1)
            return len(asked) > 2

        result = CreditIndexService(credits, chunk_size=10).rebuild(
            should_cancel=cancel_after_two_chunks
        )
        assert result.cancelled and result.tracks == 20
        assert credits.built() == []
        credited = {row[0] for row in all_credits(db)}
        assert len(credited) <= 20

    def test_progress_is_reported_per_chunk(self, db, tracks, credits):
        self._library_without_its_index(db, tracks)
        seen = []
        CreditIndexService(credits, chunk_size=10).rebuild(
            on_progress=lambda done, total: seen.append((done, total))
        )
        assert seen == [(0, 39), (10, 39), (20, 39), (30, 39), (39, 39)]

    def test_a_chunk_size_below_one_is_refused(self, credits):
        with pytest.raises(ValueError):
            CreditIndexService(credits, chunk_size=0)

    def test_the_rule_answers_the_same_before_and_after_a_rebuild(
        self, db, tracks, credits, library
    ):
        before = {
            name: titles(tracks, rule("artist_name", "is", name))
            for name in ("A", "B", "Ame", "D")
        }
        CreditIndexService(credits, chunk_size=2).rebuild()
        after = {
            name: titles(tracks, rule("artist_name", "is", name))
            for name in ("A", "B", "Ame", "D")
        }
        assert before == after


@pytest.mark.unit
class TestTheWritersAgreeWithTheRule:
    @pytest.mark.parametrize(
        "artist, remixer",
        [("A, B feat. C", "Âme"), ("", None), ("Above & Beyond", ""), ("!!!", "X")],
    )
    def test_credit_rows_use_split_credit_and_name_key(self, artist, remixer):
        rows = credit_rows(7, artist, remixer)
        assert all(row[4] == name_key(row[3]) for row in rows)
        assert all(row[0] == 7 for row in rows)

    @pytest.mark.parametrize(
        "label, key",
        [
            (None, None),
            ("", None),
            ("  ", None),
            ("Nightfall-Audio", "nightfall audio"),
        ],
    )
    def test_label_key_of(self, label, key):
        assert label_key_of(label) == key

    def test_credits_read_back_in_credit_order(self, db, tracks, credits):
        stored = tracks.add(track(1, artist="Z, A", remixer="M"))
        assert [(c.role, c.name) for c in credits.credits(stored.id)] == [
            ("artist", "Z"),
            ("artist", "A"),
            ("remixer", "M"),
        ]
