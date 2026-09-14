#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Writing CuePoint's override layer: by hand, by applying a match, in batch.

CLEAN-05 (DEC-068, DEC-069, DEC-004). What is worth a test, and why:

- **History is the record of where a value came from.** A hand edit records
  ``cuepoint``, an applied match ``beatport``, each under ``cuepoint_<field>``,
  and one apply shares one batch id. The Inspector reads the source from here,
  so a wrong source is a wrong label.
- **Apply copies exactly what was chosen, from exactly the decided candidate**,
  and refuses rather than writing ``None`` over an override the user has.
- **Validation happens in the engine**, before anything is written, with the
  field named.
- **A no-op is not history**, and clearing falls back to Rekordbox's value.
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.batch_service import (
    EVENT_BATCH_APPLIED,
    OPERATION_APPLY_MATCH,
    OPERATION_SET_OVERRIDE,
    BatchOperation,
    BatchSelection,
    BatchService,
)
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_apply import MatchApplyService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import TagService

QUESTION = Track(title="A Title", artist="An Artist")

#: The imported record. Two Camelot keys and one classic: a Camelot library.
IMPORTED = (
    ("1", dict(key="8A", bpm=124.0, genre="House", label="Defected", year=2020)),
    ("2", dict(key="9A", bpm=128.0, genre="Techno", label="Drumcode", year=2015)),
    ("3", dict(key=None, bpm=None, genre=None, label=None, year=None)),
    ("4", dict(key="Am", bpm=120.0, genre="Disco", label="Glitterbox", year=1999)),
)


# --------------------------------------------------------------------- setup


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
            LibraryTrack(rekordbox_track_id=rid, title=f"T{rid}", artist="A", **values)
            for rid, values in IMPORTED
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks) -> Dict[str, int]:
    rows = db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
    return {row["rekordbox_track_id"]: int(row["id"]) for row in rows}


@pytest.fixture
def activity(db, tracks) -> ActivityService:
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def metadata(db, tracks, activity) -> MetadataService:
    return MetadataService(TrackMetadataRepository(db), tracks, activity, db)


@pytest.fixture
def matches(db) -> MatchRepository:
    return MatchRepository(db)


@pytest.fixture
def states(matches, tracks, activity, db) -> MatchStateService:
    return MatchStateService(matches, tracks, activity, db)


@pytest.fixture
def apply(matches, metadata, tracks, db) -> MatchApplyService:
    return MatchApplyService(matches, metadata, tracks, db)


@pytest.fixture
def batch(db, tracks, activity, metadata, states, apply) -> BatchService:
    return BatchService(
        metadata,
        TagService(TagRepository(db), activity, db),
        CollectionService(CollectionRepository(db), db, tracks, activity),
        tracks,
        activity,
        db,
        states,
        apply,
    )


def candidate(number: int, score: float = 97.0, **fields) -> BeatportCandidate:
    values: dict = dict(
        url=f"https://www.beatport.com/track/a-title/{number}",
        title="A Title",
        artists="An Artist",
        label="Kompakt",
        release_date="2019-03-01",
        bpm="126",
        key="F min",
        genre="Minimal / Deep Tech",
        score=score,
        title_sim=95,
        artist_sim=95,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=False,
        release_year=2019,
        release_name="EP",
    )
    values.update(fields)
    return BeatportCandidate(**values)


@pytest.fixture
def matched(matches, states):
    """Store an attempt for a track whose winner scores ``score``."""

    def store(
        track_id: int, score: float = 97.0, runner_up: Optional[dict] = None, **winner
    ):
        best = candidate(track_id * 10, score, **winner)
        others = [candidate(track_id * 10 + 1, 50.0, **(runner_up or {}))]
        attempt = matches.add_attempt(
            track_id,
            "job",
            TrackResult(
                playlist_index=1,
                title="A Title",
                artist="An Artist",
                matched=True,
                best_match=best,
                candidates=[best, *others],
                match_score=score,
            ),
            QUESTION,
        )
        states.apply_attempt(attempt)
        return attempt

    return store


def history(db, track_id: int) -> List[tuple]:
    return [
        (
            row["field"],
            None
            if row["old_value_json"] is None
            else json.loads(row["old_value_json"]),
            None
            if row["new_value_json"] is None
            else json.loads(row["new_value_json"]),
            row["source"],
            row["batch_id"],
        )
        for row in db.connect().execute(
            "SELECT field, old_value_json, new_value_json, source, batch_id"
            " FROM track_history WHERE track_id = ? AND field LIKE 'cuepoint_%'"
            " ORDER BY id",
            (track_id,),
        )
    ]


def count(db, table: str) -> int:
    return int(db.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


def matching(tracks, field: str, operator: str, value) -> List[int]:
    query = BrowseQuery(rules=RuleSet(rules=(FilterRule(field, operator, value),)))
    return tracks.browse_ids(query, limit=100)


# ---------------------------------------------------------------- hand edits


class TestHandEdits:
    @pytest.mark.parametrize(
        "field, typed, stored",
        [
            ("key", "F minor", "4A"),
            ("bpm", 125.5, 125.5),
            ("genre", "  Deep House ", "Deep House"),
            ("label", "Innervisions", "Innervisions"),
            ("year", 2009, 2009),
        ],
    )
    def test_a_hand_edit_is_stored_and_recorded_as_yours(
        self, metadata, db, ids, field, typed, stored
    ):
        record = metadata.set_override(ids["1"], field, typed)

        assert getattr(record, field) == stored
        imported = dict(IMPORTED)["1"][field]
        assert history(db, ids["1"]) == [
            (f"cuepoint_{field}", None, stored, "cuepoint", None)
        ]
        assert imported != stored

    def test_a_key_is_stored_in_the_librarys_own_notation(
        self, metadata, tracks, db, ids
    ):
        # Two Camelot keys against one classic one: a Camelot library.
        assert metadata.key_notation() == "camelot"
        assert metadata.set_override(ids["3"], "key", "C#m").key == "12A"

        with db.transaction() as conn:
            conn.execute("UPDATE tracks SET key = 'Dm' WHERE key = '9A'")
        assert metadata.key_notation() == "classic"
        assert metadata.set_override(ids["3"], "key", "12A").key == "C#m"

    def test_a_key_given_its_notation_does_not_count_the_library_again(
        self, metadata, db, ids
    ):
        statements: List[str] = []
        connection = db.connect()
        connection.set_trace_callback(statements.append)
        try:
            metadata.set_override(ids["3"], "key", "Am", notation="classic")
        finally:
            connection.set_trace_callback(None)
        assert not any("GLOB" in sql for sql in statements)

    def test_clearing_falls_back_to_rekordboxs_value(self, metadata, tracks, db, ids):
        metadata.set_override(ids["1"], "genre", "Ambient")
        assert matching(tracks, "genre", "is", "Ambient") == [ids["1"]]

        cleared = metadata.set_override(ids["1"], "genre", None)

        assert cleared.genre is None
        assert matching(tracks, "genre", "is", "House") == [ids["1"]]
        assert matching(tracks, "genre", "is", "Ambient") == []
        assert history(db, ids["1"])[-1] == (
            "cuepoint_genre",
            "Ambient",
            None,
            "cuepoint",
            None,
        )

    def test_a_write_that_changes_nothing_writes_nothing(self, metadata, db, ids):
        metadata.set_override(ids["1"], "bpm", 126)
        metadata.set_override(ids["1"], "bpm", 126.0)
        assert len(history(db, ids["1"])) == 1

    def test_clearing_what_was_never_set_creates_no_row(self, metadata, db, ids):
        record = metadata.set_override(ids["2"], "label", None)
        assert record.label is None and record.is_empty
        assert count(db, "track_metadata") == 0
        assert history(db, ids["2"]) == []

    @pytest.mark.parametrize(
        "field, value, named",
        [
            ("bpm", 19, "bpm"),
            ("bpm", 128.123, "bpm"),
            ("year", 1800, "year"),
            ("genre", "", "genre"),
            ("label", "x" * 201, "label"),
            ("key", "H minor", "key"),
            ("title", "New Title", "title"),
            ("artist", "Someone", "artist"),
        ],
    )
    def test_what_the_engine_refuses_is_refused_with_the_field_named(
        self, metadata, db, ids, field, value, named
    ):
        with pytest.raises(ValueError, match=named):
            metadata.set_override(ids["1"], field, value)
        assert count(db, "track_metadata") == 0
        assert count(db, "track_history") == 0

    def test_a_track_that_is_not_there_is_refused(self, metadata):
        with pytest.raises(ValueError, match="No such track"):
            metadata.set_override(987_654, "bpm", 120)

    def test_an_override_comes_from_beatport_or_a_user(self, metadata, ids):
        with pytest.raises(ValueError, match="beatport or cuepoint"):
            metadata.set_override(ids["1"], "bpm", 120, source="rekordbox")

    def test_a_batch_id_is_carried(self, metadata, db, ids):
        metadata.set_override(ids["1"], "year", 2001, batch_id="the-batch")
        assert history(db, ids["1"])[0][4] == "the-batch"

    def test_clear_forgets_each_override_with_one_row_each(self, metadata, db, ids):
        for field, value in (("key", "Am"), ("bpm", 121), ("label", "L")):
            metadata.set_override(ids["4"], field, value)

        assert metadata.clear(ids["4"]) is True

        forgotten = [row for row in history(db, ids["4"]) if row[2] is None]
        assert sorted(row[0] for row in forgotten) == [
            "cuepoint_bpm",
            "cuepoint_key",
            "cuepoint_label",
        ]
        assert count(db, "track_metadata") == 0

    def test_the_same_key_already_imported_is_still_an_override(
        self, metadata, db, ids
    ):
        # An override equal to Rekordbox's value is the user's statement, and it
        # survives Rekordbox changing its mind.
        record = metadata.set_override(ids["1"], "key", "Am")
        assert record.key == "8A"
        assert len(history(db, ids["1"])) == 1


# -------------------------------------------------------------------- apply


class TestApplyingAMatch:
    def test_it_copies_exactly_the_chosen_fields_under_one_batch_id(
        self, apply, matched, metadata, db, ids
    ):
        matched(ids["1"], bpm="126.50", genre="Techno", label="Kompakt")

        record = apply.apply_match(ids["1"], ["key", "bpm", "label"])

        assert (record.key, record.bpm, record.label) == ("4A", 126.5, "Kompakt")
        assert (record.genre, record.year) == (None, None)
        rows = history(db, ids["1"])
        assert [(field, source) for field, _, _, source, _ in rows] == [
            ("cuepoint_key", "beatport"),
            ("cuepoint_bpm", "beatport"),
            ("cuepoint_label", "beatport"),
        ]
        assert len({batch_id for *_, batch_id in rows}) == 1
        assert rows[0][4] is not None

    def test_it_copies_from_the_candidate_a_user_accepted_not_the_winner(
        self, apply, matched, states, matches, ids
    ):
        attempt = matched(
            ids["2"], score=80.0, runner_up={"genre": "Acid", "release_year": 1994}
        )
        runner_up = next(
            c for c in matches.candidates_for(int(attempt.id)) if not c.is_winner
        )
        states.accept(ids["2"], int(runner_up.id))

        record = apply.apply_match(ids["2"], ["genre", "year"])

        assert (record.genre, record.year) == ("Acid", 1994)

    @pytest.mark.parametrize("state", ["needs_review", "rejected", "never"])
    def test_a_track_that_is_not_accepted_is_refused(
        self, apply, matched, states, db, ids, state
    ):
        if state == "needs_review":
            matched(ids["1"], score=80.0)
        elif state == "rejected":
            matched(ids["1"])
            states.reject(ids["1"])
        with pytest.raises(ValueError, match="no accepted match"):
            apply.apply_match(ids["1"], ["bpm"])
        assert count(db, "track_metadata") == 0

    def test_a_field_the_candidate_has_no_value_for_refuses_the_whole_apply(
        self, apply, matched, metadata, db, ids
    ):
        metadata.set_override(ids["1"], "genre", "Mine")
        matched(ids["1"], genre=None)

        with pytest.raises(ValueError, match="no usable genre"):
            apply.apply_match(ids["1"], ["bpm", "genre"])

        record = metadata.get(ids["1"])
        assert (record.genre, record.bpm) == ("Mine", None)

    @pytest.mark.parametrize(
        "fields, message",
        [([], "at least one"), (["title"], "cannot be overridden"), ("bpm", "list")],
    )
    def test_the_fields_must_be_a_list_of_override_fields(
        self, apply, matched, ids, fields, message
    ):
        matched(ids["1"])
        with pytest.raises(ValueError, match=message):
            apply.apply_match(ids["1"], fields)

    def test_an_apply_replaces_a_hand_edit_and_a_later_hand_edit_wins(
        self, apply, matched, metadata, db, ids
    ):
        metadata.set_override(ids["1"], "bpm", 130)
        matched(ids["1"], bpm="126")

        apply.apply_match(ids["1"], ["bpm"])
        metadata.set_override(ids["1"], "bpm", 127)

        assert metadata.get(ids["1"]).bpm == 127.0
        assert [
            (old, new, source) for _, old, new, source, _ in history(db, ids["1"])
        ] == [
            (None, 130.0, "cuepoint"),
            (130.0, 126.0, "beatport"),
            (126.0, 127.0, "cuepoint"),
        ]

    def test_applying_the_same_values_again_writes_nothing(
        self, apply, matched, db, ids
    ):
        matched(ids["1"])
        apply.apply_match(ids["1"], ["bpm", "year"])
        apply.apply_match(ids["1"], ["bpm", "year"])
        assert len(history(db, ids["1"])) == 2

    def test_applying_changes_no_decision(self, apply, matched, matches, ids):
        matched(ids["1"])
        before = matches.get_match(ids["1"])
        apply.apply_match(ids["1"], ["key"])
        assert matches.get_match(ids["1"]) == before

    def test_a_track_that_is_not_there_is_refused(self, apply):
        with pytest.raises(ValueError, match="No such track"):
            apply.apply_match(987_654, ["bpm"])


# -------------------------------------------------------------------- batch


class TestBatchHandEdits:
    def test_one_value_onto_many_tracks_under_one_batch_id(self, batch, db, ids):
        result = batch.apply_batch(
            BatchSelection.of_ids([ids["1"], ids["2"], ids["3"]]),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "bpm", "value": 125.5}),
        )

        assert (result.changed, result.unchanged, result.failed) == (3, 0, 0)
        batch_ids = {row[4] for rid in ("1", "2", "3") for row in history(db, ids[rid])}
        assert batch_ids == {result.batch_id}
        assert {row[3] for row in history(db, ids["1"])} == {"cuepoint"}

    def test_a_track_already_holding_the_value_is_unchanged(self, batch, metadata, ids):
        metadata.set_override(ids["1"], "genre", "Dub")
        result = batch.apply_batch(
            BatchSelection.of_ids([ids["1"], ids["2"]]),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "genre", "value": "Dub"}),
        )
        assert (result.changed, result.unchanged) == (1, 1)

    def test_a_key_is_stored_in_the_librarys_notation(self, batch, metadata, ids):
        batch.apply_batch(
            BatchSelection.of_ids([ids["3"]]),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "key", "value": "Bbm"}),
        )
        assert metadata.get(ids["3"]).key == "3A"

    def test_clearing_in_batch_and_its_sentence(self, batch, metadata, activity, ids):
        metadata.set_override(ids["1"], "label", "Mine")
        batch.apply_batch(
            BatchSelection.of_ids([ids["1"], ids["2"]]),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "label", "value": None}),
        )
        (event,) = activity.recent_events(event_type=EVENT_BATCH_APPLIED)
        assert event.summary == "Cleared the label override on 1 track — 1 unchanged"
        assert metadata.get(ids["1"]).label is None

    def test_setting_in_batch_and_its_sentence(self, batch, activity, ids):
        batch.apply_batch(
            BatchSelection.of_ids([ids["1"], ids["2"]]),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "bpm", "value": 125.5}),
        )
        (event,) = activity.recent_events(event_type=EVENT_BATCH_APPLIED)
        assert event.summary == "Set the BPM to 125.5 on 2 tracks"

    @pytest.mark.parametrize(
        "value, message",
        [
            ({"field": "bpm", "value": 400}, "bpm must be between"),
            ({"field": "key", "value": "H"}, "key"),
            ({"field": "title", "value": "x"}, "cannot be overridden"),
            ({"field": "bpm"}, "set_override needs"),
            (125, "set_override needs"),
        ],
    )
    def test_a_bad_request_is_refused_before_any_track_is_touched(
        self, batch, db, ids, value, message
    ):
        with pytest.raises(ValueError, match=message):
            batch.apply_batch(
                BatchSelection.of_ids(list(ids.values())),
                BatchOperation(OPERATION_SET_OVERRIDE, value),
            )
        assert count(db, "track_metadata") == 0
        assert count(db, "activity_events") == 0

    def test_a_deleted_track_is_counted_as_failed(self, batch, tracks, ids):
        tracks.delete(ids["2"])
        result = batch.apply_batch(
            BatchSelection.of_ids([ids["1"], ids["2"]]),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "year", "value": 2000}),
        )
        assert (result.changed, result.failed) == (1, 1)


class TestBatchApply:
    def test_accepted_tracks_take_their_own_values_and_the_rest_are_unchanged(
        self, batch, matched, metadata, db, ids
    ):
        matched(ids["1"], bpm="126")
        matched(ids["2"], bpm="132", genre=None)
        matched(ids["4"], score=80.0)  # needs review: left alone

        result = batch.apply_batch(
            BatchSelection.of_ids([ids["1"], ids["2"], ids["3"], ids["4"]]),
            BatchOperation(OPERATION_APPLY_MATCH, ["bpm", "genre"]),
        )

        assert (result.changed, result.unchanged, result.failed) == (2, 2, 0)
        assert (metadata.get(ids["1"]).bpm, metadata.get(ids["1"]).genre) == (
            126.0,
            "Minimal / Deep Tech",
        )
        # The candidate had no genre: the BPM is applied, the genre left as it was.
        assert (metadata.get(ids["2"]).bpm, metadata.get(ids["2"]).genre) == (
            132.0,
            None,
        )
        assert metadata.get(ids["4"]) is None
        assert {row[3] for row in history(db, ids["1"])} == {"beatport"}
        assert {row[4] for row in history(db, ids["1"]) + history(db, ids["2"])} == {
            result.batch_id
        }

    def test_its_sentence_names_the_fields(self, batch, matched, activity, ids):
        matched(ids["1"])
        batch.apply_batch(
            BatchSelection.of_ids([ids["1"]]),
            BatchOperation(OPERATION_APPLY_MATCH, ["key", "bpm"]),
        )
        (event,) = activity.recent_events(event_type=EVENT_BATCH_APPLIED)
        assert event.summary == "Applied the Beatport key, BPM to 1 track"

    def test_the_library_notation_is_asked_once_for_the_batch(
        self, batch, matched, db, ids
    ):
        for rid in ("1", "2", "4"):
            matched(ids[rid])
        statements: List[str] = []
        connection = db.connect()
        connection.set_trace_callback(statements.append)
        try:
            batch.apply_batch(
                BatchSelection.of_ids([ids["1"], ids["2"], ids["4"]]),
                BatchOperation(OPERATION_APPLY_MATCH, ["key"]),
            )
        finally:
            connection.set_trace_callback(None)
        assert sum("GLOB" in sql for sql in statements) == 1

    @pytest.mark.parametrize(
        "value, message",
        [
            ("bpm", "list of fields"),
            ([], "at least one"),
            (["artist"], "cannot be overridden"),
        ],
    )
    def test_a_bad_field_list_is_refused_before_any_track_is_touched(
        self, batch, matched, db, ids, value, message
    ):
        matched(ids["1"])
        with pytest.raises(ValueError, match=message):
            batch.apply_batch(
                BatchSelection.of_ids([ids["1"]]),
                BatchOperation(OPERATION_APPLY_MATCH, value),
            )
        assert count(db, "track_metadata") == 0

    def test_a_deleted_track_is_counted_as_failed(self, batch, matched, tracks, ids):
        matched(ids["1"])
        tracks.delete(ids["2"])
        result = batch.apply_batch(
            BatchSelection.of_ids([ids["1"], ids["2"]]),
            BatchOperation(OPERATION_APPLY_MATCH, ["bpm"]),
        )
        assert (result.changed, result.failed) == (1, 1)

    def test_a_field_the_candidate_lacks_keeps_the_override_already_there(
        self, batch, matched, metadata, db, ids
    ):
        metadata.set_override(ids["1"], "label", "Typed by hand")
        metadata.set_override(ids["1"], "genre", "Dub")
        matched(ids["1"], label=None, genre="   ")

        result = batch.apply_batch(
            BatchSelection.of_ids([ids["1"]]),
            BatchOperation(OPERATION_APPLY_MATCH, ["label", "genre", "bpm"]),
        )

        record = metadata.get(ids["1"])
        assert (record.label, record.genre, record.bpm) == (
            "Typed by hand",
            "Dub",
            126.0,
        )
        assert result.changed == 1
        assert [row[0] for row in history(db, ids["1"]) if row[3] == "beatport"] == [
            "cuepoint_bpm"
        ]


class TestTheLibrarysNotation:
    """The notation is counted in SQL, so its pattern is tested against real rows."""

    @pytest.fixture
    def keyed(self, db):
        def build(*keys: Optional[str]) -> TrackRepository:
            repo = TrackRepository(db)
            repo.add_many(
                [
                    LibraryTrack(
                        rekordbox_track_id=str(n), title=f"T{n}", artist="A", key=k
                    )
                    for n, k in enumerate(keys)
                ]
            )
            return repo

        return build

    def test_every_camelot_code_counts_including_ten_to_twelve(self, keyed):
        repo = keyed("10A", "11B", "12A", "12b", " 10a ", "Am", None, "")
        assert repo.key_notation_counts() == (5, 1)

    def test_what_only_looks_like_camelot_does_not_count(self, keyed):
        repo = keyed("13A", "0B", "8C", "1AA", "8A")
        assert repo.key_notation_counts() == (1, 4)

    def test_a_library_keyed_ten_to_twelve_stores_overrides_in_camelot(self, db, keyed):
        repo = keyed("10A", "11A", "12B", "Am")
        activity = ActivityService(ActivityRepository(db), repo)
        service = MetadataService(TrackMetadataRepository(db), repo, activity, db)
        first = repo.browse_ids(BrowseQuery(), limit=1)[0]
        assert service.key_notation() == "camelot"
        assert service.set_override(first, "key", "F minor").key == "4A"
