#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Correct: accept a candidate and apply ticked fields as one act (C14, DEC-068).

DEC-004 kept accepting and applying apart; the Match area's Correct button does
both with the fields the person ticked. What is worth a test, and why:

- **One transaction.** A set_override that fails half way leaves the decision
  and the earlier fields as they were, not a track accepted with a third of its
  values.
- **A field is only written when it has something to say.** A candidate with no
  usable value is *skipped*, one equal to the current value is *unchanged*, and
  neither erases an override the person already has.
- **The key is the person's to keep.** ``replace_key`` clears an override only
  when it is the person's own correction (DEC-201, DEC-203); a key that came
  from Beatport is a no-op, reported as one.
- **Undo is revert-batch.** Everything one Correct wrote shares one batch id, and
  reverting that batch puts the decision and the fields back.
- **A selection takes the same path**, track by track, under one batch id, and
  leaves a person's earlier decision alone while still giving it the fields.
"""

from __future__ import annotations

from typing import Dict, List

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import STATE_ACCEPTED, STATE_NEEDS_REVIEW
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.batch_service import (
    OPERATION_CORRECT_MATCH,
    BatchOperation,
    BatchSelection,
    BatchService,
)
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_apply import MatchApplyService
from cuepoint.services.match_correct import MatchCorrectService, correct_fields
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.revert_service import RevertService
from cuepoint.services.tag_service import TagService

QUESTION = Track(title="A Title", artist="An Artist")

IMPORTED = (
    ("1", dict(key="8A", bpm=124.0, genre="House", label="Defected", year=2020)),
    ("2", dict(key="9A", bpm=128.0, genre="Techno", label="Drumcode", year=2015)),
    ("3", dict(key=None, bpm=None, genre=None, label=None, year=None)),
)


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
def correct(states, matches, metadata, tracks, db) -> MatchCorrectService:
    return MatchCorrectService(
        states, matches, metadata, TrackMetadataRepository(db), tracks, db
    )


@pytest.fixture
def revert(db, tracks, activity, metadata, states, matches) -> RevertService:
    tags = TagService(TagRepository(db), activity, db)
    return RevertService(
        ActivityRepository(db), activity, metadata, tags, states, matches, tracks, db
    )


@pytest.fixture
def batch(db, tracks, activity, metadata, states, matches, correct) -> BatchService:
    tags = TagService(TagRepository(db), activity, db)
    collections = CollectionService(CollectionRepository(db), db, tracks, activity)
    apply = MatchApplyService(matches, metadata, tracks, db)
    return BatchService(
        metadata,
        tags,
        collections,
        tracks,
        activity,
        db,
        states,
        apply,
        correct,
    )


def candidate(number: int, score: float = 80.0, **fields) -> BeatportCandidate:
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
def proposed(matches, states):
    """Store an attempt whose winner is waiting for review; return its candidate id."""

    def store(track_id: int, score: float = 80.0, **fields) -> int:
        best = candidate(track_id * 10, score, **fields)
        attempt = matches.add_attempt(
            track_id,
            "job",
            TrackResult(
                playlist_index=1,
                title="A Title",
                artist="An Artist",
                matched=True,
                best_match=best,
                candidates=[best, candidate(track_id * 10 + 1, 50.0)],
                match_score=score,
            ),
            QUESTION,
        )
        states.apply_attempt(attempt)
        winner = matches.winner_of(attempt.id)
        assert winner is not None and winner.id is not None
        return int(winner.id)

    return store


def history(db, track_id: int) -> List[tuple]:
    return [
        tuple(row)
        for row in db.connect().execute(
            "SELECT field, old_value_json, new_value_json, source, batch_id"
            " FROM track_history WHERE track_id = ? ORDER BY id",
            (track_id,),
        )
    ]


def state_of(matches, track_id: int):
    match = matches.get_match(track_id)
    if match is None:
        return None
    return (match.state, match.decided_by, match.candidate_id)


# ------------------------------------------------------------- the fields


class TestTheFieldsAsked:
    def test_none_is_allowed(self):
        assert correct_fields([]) == []

    def test_each_once_in_the_order_given(self):
        assert correct_fields(["year", "bpm", "year"]) == ["year", "bpm"]

    @pytest.mark.parametrize("fields", ["genre", None, [1], ["colour"]])
    def test_what_is_not_a_list_of_fields_is_refused(self, fields):
        with pytest.raises(ValueError):
            correct_fields(fields)

    def test_the_key_is_never_a_field(self):
        with pytest.raises(ValueError, match="replace_key"):
            correct_fields(["bpm", "key"])


# ------------------------------------------------------------- one track


class TestCorrectingOneTrack:
    def test_it_accepts_and_applies_the_ticked_fields_under_one_batch(
        self, correct, proposed, matches, metadata, db, ids
    ):
        candidate_id = proposed(ids["1"])

        outcome = correct.correct(ids["1"], candidate_id, ["bpm", "genre"])

        assert state_of(matches, ids["1"]) == (STATE_ACCEPTED, "user", candidate_id)
        record = metadata.get(ids["1"])
        assert (record.bpm, record.genre, record.label) == (
            126.0,
            "Minimal / Deep Tech",
            None,
        )
        assert outcome.applied == ["bpm", "genre"]
        assert outcome.skipped == [] and outcome.unchanged == []
        assert outcome.match.state == STATE_ACCEPTED
        rows = history(db, ids["1"])
        assert {row[0] for row in rows} == {
            "match_state",
            "cuepoint_bpm",
            "cuepoint_genre",
        }
        assert {row[4] for row in rows} == {outcome.batch_id}
        by_field = {row[0]: row[3] for row in rows}
        assert by_field["match_state"] == "cuepoint"
        assert by_field["cuepoint_bpm"] == "beatport"

    def test_no_fields_is_just_an_accept(
        self, correct, proposed, matches, metadata, ids
    ):
        candidate_id = proposed(ids["1"])

        outcome = correct.correct(ids["1"], candidate_id, [])

        assert state_of(matches, ids["1"]) == (STATE_ACCEPTED, "user", candidate_id)
        assert metadata.get(ids["1"]) is None
        assert outcome.applied == []

    def test_a_field_the_candidate_has_no_value_for_is_skipped(
        self, correct, proposed, metadata, ids
    ):
        candidate_id = proposed(ids["1"], genre=None, label="  ")

        outcome = correct.correct(ids["1"], candidate_id, ["genre", "label", "bpm"])

        assert outcome.skipped == ["genre", "label"]
        assert outcome.applied == ["bpm"]
        record = metadata.get(ids["1"])
        assert (record.genre, record.label, record.bpm) == (None, None, 126.0)

    def test_a_skipped_field_does_not_erase_an_override_the_person_has(
        self, correct, proposed, metadata, ids
    ):
        metadata.set_override(ids["1"], "genre", "Disco")
        candidate_id = proposed(ids["1"], genre=None)

        correct.correct(ids["1"], candidate_id, ["genre"])

        assert metadata.get(ids["1"]).genre == "Disco"

    def test_a_value_equal_to_the_current_one_is_unchanged_and_writes_nothing(
        self, correct, proposed, metadata, db, ids
    ):
        metadata.set_override(ids["1"], "bpm", 126.0)
        candidate_id = proposed(ids["1"])
        before = len(history(db, ids["1"]))

        outcome = correct.correct(ids["1"], candidate_id, ["bpm", "year"])

        assert outcome.unchanged == ["bpm"]
        assert outcome.applied == ["year"]
        fields = [row[0] for row in history(db, ids["1"])[before:]]
        assert "cuepoint_bpm" not in fields
        assert "cuepoint_year" in fields

    def test_another_tracks_candidate_is_refused_and_nothing_is_written(
        self, correct, proposed, matches, metadata, db, ids
    ):
        theirs = proposed(ids["2"])
        before = len(history(db, ids["1"]))

        with pytest.raises(ValueError):
            correct.correct(ids["1"], theirs, ["bpm"])

        assert matches.get_match(ids["1"]) is None
        assert metadata.get(ids["1"]) is None
        assert len(history(db, ids["1"])) == before

    def test_an_unknown_track_or_candidate_is_refused(self, correct, proposed, ids):
        candidate_id = proposed(ids["1"])
        with pytest.raises(ValueError, match="track"):
            correct.correct(99999, candidate_id, [])
        with pytest.raises(ValueError, match="andidate"):
            correct.correct(ids["1"], 99999, [])

    def test_a_fields_list_that_is_refused_writes_no_decision(
        self, correct, proposed, matches, ids
    ):
        candidate_id = proposed(ids["1"])
        with pytest.raises(ValueError):
            correct.correct(ids["1"], candidate_id, ["colour"])
        assert matches.get_match(ids["1"]).state == STATE_NEEDS_REVIEW


# ------------------------------------------------------- one transaction


class TestItIsOneTransaction:
    def test_a_failure_in_the_second_field_undoes_the_accept_and_the_first(
        self, correct, proposed, matches, metadata, db, ids, monkeypatch
    ):
        candidate_id = proposed(ids["1"])
        metadata.set_override(ids["1"], "year", 1999)
        decision = state_of(matches, ids["1"])
        before = history(db, ids["1"])
        real = metadata.set_override
        calls: List[str] = []

        def flaky(track_id, field, value, *args, **kwargs):
            calls.append(field)
            if len(calls) == 2:
                raise RuntimeError("disk full")
            return real(track_id, field, value, *args, **kwargs)

        monkeypatch.setattr(metadata, "set_override", flaky)

        with pytest.raises(RuntimeError, match="disk full"):
            correct.correct(ids["1"], candidate_id, ["bpm", "genre", "label"])

        assert calls == ["bpm", "genre"]
        assert state_of(matches, ids["1"]) == decision
        assert matches.get_match(ids["1"]).state == STATE_NEEDS_REVIEW
        record = metadata.get(ids["1"])
        assert (record.bpm, record.genre, record.year) == (None, None, 1999)
        assert history(db, ids["1"]) == before


class TestACorrectThatChangesNothing:
    def test_it_has_no_batch_to_undo_and_says_so(self, correct, proposed, db, ids):
        candidate_id = proposed(ids["1"])
        first = correct.correct(ids["1"], candidate_id, ["bpm"])
        assert first.changed and first.batch_id
        before = history(db, ids["1"])

        again = correct.correct(ids["1"], candidate_id, ["bpm"])

        assert again.changed is False
        assert again.batch_id is None
        assert again.unchanged == ["bpm"]
        assert history(db, ids["1"]) == before

    def test_an_accept_alone_that_was_already_so_changes_nothing(
        self, correct, proposed, ids
    ):
        candidate_id = proposed(ids["1"])
        correct.correct(ids["1"], candidate_id, [])

        again = correct.correct(ids["1"], candidate_id, [])

        assert again.changed is False and again.batch_id is None

    def test_an_accept_that_took_hold_is_a_change_even_with_no_field(
        self, correct, proposed, ids
    ):
        outcome = correct.correct(ids["1"], proposed(ids["1"]), [])
        assert outcome.changed is True and outcome.batch_id


# ----------------------------------------------------------------- the key


class TestReplacingTheKey:
    def test_it_clears_a_key_that_is_the_persons_own(
        self, correct, proposed, metadata, db, ids
    ):
        metadata.set_override(ids["1"], "key", "5A")
        candidate_id = proposed(ids["1"], key="F min")

        outcome = correct.correct(ids["1"], candidate_id, [], replace_key=True)

        assert outcome.key == "replaced"
        assert metadata.get(ids["1"]).key is None
        rows = [row for row in history(db, ids["1"]) if row[0] == "cuepoint_key"]
        assert rows[-1][2] is None and rows[-1][4] == outcome.batch_id

    def test_a_key_from_beatport_is_left_and_the_answer_says_so(
        self, correct, proposed, metadata, ids
    ):
        metadata.set_override(ids["1"], "key", "5A", source="beatport")
        candidate_id = proposed(ids["1"])

        outcome = correct.correct(ids["1"], candidate_id, [], replace_key=True)

        assert outcome.key == "not_yours"
        assert metadata.get(ids["1"]).key == "5A"

    def test_no_override_at_all_is_the_same_no_op(self, correct, proposed, ids):
        candidate_id = proposed(ids["1"])
        outcome = correct.correct(ids["1"], candidate_id, [], replace_key=True)
        assert outcome.key == "not_yours"

    def test_a_candidate_with_no_key_does_not_cost_the_person_theirs(
        self, correct, proposed, metadata, ids
    ):
        metadata.set_override(ids["1"], "key", "5A")
        candidate_id = proposed(ids["1"], key=None)

        outcome = correct.correct(ids["1"], candidate_id, [], replace_key=True)

        assert outcome.key == "no_beatport_key"
        assert metadata.get(ids["1"]).key == "5A"

    def test_not_asking_leaves_it_alone(self, correct, proposed, metadata, ids):
        metadata.set_override(ids["1"], "key", "5A")
        candidate_id = proposed(ids["1"])

        outcome = correct.correct(ids["1"], candidate_id, ["bpm"])

        assert outcome.key is None
        assert metadata.get(ids["1"]).key == "5A"


# ----------------------------------------------------------------- undo


class TestUndo:
    def test_reverting_the_batch_restores_the_decision_and_the_fields(
        self, correct, revert, proposed, matches, metadata, ids
    ):
        metadata.set_override(ids["1"], "genre", "Disco")
        metadata.set_override(ids["1"], "key", "5A")
        candidate_id = proposed(ids["1"])
        decision = state_of(matches, ids["1"])

        outcome = correct.correct(
            ids["1"], candidate_id, ["bpm", "genre"], replace_key=True
        )
        assert metadata.get(ids["1"]).genre == "Minimal / Deep Tech"
        assert metadata.get(ids["1"]).key is None

        result = revert.revert_batch(outcome.batch_id)

        assert result.skipped == 0
        record = metadata.get(ids["1"])
        assert (record.bpm, record.genre, record.key) == (None, "Disco", "5A")
        assert state_of(matches, ids["1"]) == decision


# ----------------------------------------------------------- a selection


def of(*track_ids: int) -> BatchSelection:
    return BatchSelection.of_ids(list(track_ids))


class TestCorrectingASelection:
    def test_the_fields_are_validated_and_listed_once(self):
        operation = BatchOperation(
            OPERATION_CORRECT_MATCH, {"fields": ["bpm", "bpm"], "replace_key": True}
        ).validated()
        assert operation.value == {"fields": ("bpm",), "replace_key": True}

    def test_no_fields_is_an_accept_alone(self):
        operation = BatchOperation(OPERATION_CORRECT_MATCH, {"fields": []}).validated()
        assert operation.value == {"fields": (), "replace_key": False}

    @pytest.mark.parametrize(
        "value",
        [
            None,
            [],
            {"fields": "bpm"},
            {"fields": ["key"]},
            {"fields": ["bpm"], "other": 1},
            {"fields": ["bpm"], "replace_key": "yes"},
        ],
    )
    def test_a_value_that_is_not_a_request_is_refused(self, value):
        with pytest.raises(ValueError):
            BatchOperation(OPERATION_CORRECT_MATCH, value).validated()

    def test_each_track_takes_what_it_proposes_under_one_batch(
        self, batch, proposed, matches, metadata, db, ids
    ):
        proposed(ids["1"])
        proposed(ids["2"])

        result = batch.apply_batch(
            of(ids["1"], ids["2"], ids["3"]),
            BatchOperation(OPERATION_CORRECT_MATCH, {"fields": ["bpm"]}),
        )

        assert result.changed == 2
        assert result.unchanged == 1
        assert state_of(matches, ids["1"])[:2] == (STATE_ACCEPTED, "user")
        assert metadata.get(ids["1"]).bpm == 126.0
        assert metadata.get(ids["2"]).bpm == 126.0
        assert metadata.get(ids["3"]) is None
        batches = {
            row[4] for track in (ids["1"], ids["2"]) for row in history(db, track)
        }
        assert batches == {result.batch_id}

    def test_a_track_that_fails_after_its_accept_is_rolled_back_alone(
        self, batch, proposed, matches, metadata, db, ids, monkeypatch
    ):
        proposed(ids["1"])
        proposed(ids["2"])
        real = metadata.set_override

        def flaky(track_id, field, value, *args, **kwargs):
            if track_id == ids["2"]:
                raise ValueError("gone")
            return real(track_id, field, value, *args, **kwargs)

        monkeypatch.setattr(metadata, "set_override", flaky)

        result = batch.apply_batch(
            of(ids["1"], ids["2"]),
            BatchOperation(OPERATION_CORRECT_MATCH, {"fields": ["bpm"]}),
        )

        assert (result.changed, result.failed) == (1, 1)
        assert state_of(matches, ids["1"])[:2] == (STATE_ACCEPTED, "user")
        assert metadata.get(ids["1"]).bpm == 126.0
        assert matches.get_match(ids["2"]).state == STATE_NEEDS_REVIEW
        assert metadata.get(ids["2"]) is None or metadata.get(ids["2"]).bpm is None
        assert history(db, ids["2"]) == []

    def test_a_decision_the_person_made_is_kept_but_still_gets_the_fields(
        self, batch, proposed, states, matches, metadata, ids
    ):
        proposed(ids["1"])
        attempt_id = matches.get_match(ids["1"]).attempt_id
        runner_up = matches.candidates_for(attempt_id)[1]
        states.accept(ids["1"], runner_up.id)

        result = batch.apply_batch(
            of(ids["1"]),
            BatchOperation(OPERATION_CORRECT_MATCH, {"fields": ["bpm"]}),
        )

        assert result.changed == 1
        assert state_of(matches, ids["1"])[2] == runner_up.id
        assert metadata.get(ids["1"]).bpm == 126.0

    def test_a_rejection_the_person_made_gets_nothing(
        self, batch, proposed, states, metadata, ids
    ):
        proposed(ids["1"])
        states.reject(ids["1"])

        result = batch.apply_batch(
            of(ids["1"]),
            BatchOperation(OPERATION_CORRECT_MATCH, {"fields": ["bpm"]}),
        )

        assert result.changed == 0
        assert metadata.get(ids["1"]) is None

    def test_reverting_the_batch_takes_back_every_track(
        self, batch, revert, proposed, matches, metadata, ids
    ):
        proposed(ids["1"])
        proposed(ids["2"])
        result = batch.apply_batch(
            of(ids["1"], ids["2"]),
            BatchOperation(OPERATION_CORRECT_MATCH, {"fields": ["bpm", "label"]}),
        )

        revert.revert_batch(result.batch_id)

        for key in ("1", "2"):
            record = metadata.get(ids[key])
            assert record is None or (record.bpm, record.label) == (None, None)
            assert matches.get_match(ids[key]).state == STATE_NEEDS_REVIEW
