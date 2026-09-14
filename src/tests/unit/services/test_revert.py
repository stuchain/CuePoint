#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reverting CuePoint's own changes, per field and per batch (CLEAN-06, DEC-068).

What is worth a test, and why:

- **Every CuePoint field reverts, through the service that owns it**, and the
  revert is a new history row: the row it reverts is never touched (DEC-008).
- **A stale revert is refused with both values named.** Without that, revert is
  a second way to lose data — the part of this step that matters most.
- **A restored override keeps its provenance**, because the Inspector reads a
  value's source from the latest history row.
- **A batch reverts newest first under a new batch id**, skips and counts what
  is stale, and can itself be reverted.
- **Collection membership is refused with its reason**, and each revert path
  refuses the other's fields by name.
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services import revert_service as revert_module
from cuepoint.services.activity_service import (
    CUEPOINT_REVERTABLE_FIELDS,
    EVENT_FIELD_REVERTED,
    REVERTABLE_FIELDS,
    ActivityService,
)
from cuepoint.services.batch_service import (
    OPERATION_ACCEPT_MATCH,
    OPERATION_ADD_TAG,
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_APPLY_MATCH,
    OPERATION_REMOVE_FROM_COLLECTION,
    OPERATION_SET_OVERRIDE,
    OPERATION_SET_RATING,
    BatchOperation,
    BatchSelection,
    BatchService,
)
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IRevertService
from cuepoint.services.match_apply import MatchApplyService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.revert_service import (
    EVENT_BATCH_REVERTED,
    MEMBERSHIP_REFUSAL,
    BatchRevert,
    RevertService,
    StaleRevertError,
)
from cuepoint.services.tag_service import TagService

QUESTION = Track(title="A Title", artist="An Artist")

#: The imported record: a Camelot library of four tracks.
IMPORTED = (
    ("1", dict(key="8A", bpm=124.0, genre="House", label="Defected", year=2020)),
    ("2", dict(key="9A", bpm=128.0, genre="Techno", label="Drumcode", year=2015)),
    ("3", dict(key=None, bpm=None, genre=None, label=None, year=None)),
    ("4", dict(key="10A", bpm=120.0, genre="Disco", label="Glitterbox", year=1999)),
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
def tags(db, activity) -> TagService:
    return TagService(TagRepository(db), activity, db)


@pytest.fixture
def collections(db, tracks, activity) -> CollectionService:
    return CollectionService(CollectionRepository(db), db, tracks, activity)


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
def batch(db, tracks, activity, metadata, tags, collections, states, apply):
    return BatchService(
        metadata, tags, collections, tracks, activity, db, states, apply
    )


@pytest.fixture
def revert(db, tracks, activity, metadata, tags, states, matches) -> RevertService:
    return RevertService(
        ActivityRepository(db),
        activity,
        metadata,
        tags,
        states,
        matches,
        tracks,
        db,
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
    """Store an attempt for a track, winner numbered ``number``, and run the rule."""

    def store(track_id: int, score: float = 97.0, number: Optional[int] = None):
        winner = number if number is not None else track_id * 10
        best = candidate(winner, score)
        attempt = matches.add_attempt(
            track_id,
            "job",
            TrackResult(
                playlist_index=1,
                title="A Title",
                artist="An Artist",
                matched=True,
                best_match=best,
                candidates=[best, candidate(winner + 1, 50.0)],
                match_score=score,
            ),
            QUESTION,
        )
        states.apply_attempt(attempt)
        return attempt

    return store


def rows(db, where: str = "1 = 1", params: tuple = ()) -> List[dict]:
    return [
        {
            "id": row["id"],
            "track_id": row["track_id"],
            "field": row["field"],
            "old": None
            if row["old_value_json"] is None
            else json.loads(row["old_value_json"]),
            "new": None
            if row["new_value_json"] is None
            else json.loads(row["new_value_json"]),
            "source": row["source"],
            "batch_id": row["batch_id"],
        }
        for row in db.connect().execute(
            f"SELECT * FROM track_history WHERE {where} ORDER BY id", params
        )
    ]


def last_change(db, field: str, track_id: int) -> int:
    return rows(db, "field = ? AND track_id = ?", (field, track_id))[-1]["id"]


def raw_history(db) -> List[tuple]:
    return [tuple(row) for row in db.connect().execute("SELECT * FROM track_history")]


def state_of(matches, track_id: int):
    match = matches.get_match(track_id)
    if match is None:
        return None
    return (match.state, match.decided_by, match.candidate_id, match.newer_attempt_id)


# ----------------------------------------------------- every field reverts


def _favorite(ctx):
    ctx["metadata"].set_favorite(ctx["track"], True)
    return "favorite", lambda: bool(ctx["metadata"].get(ctx["track"]).favorite), False


def _rating(ctx):
    ctx["metadata"].set_rating(ctx["track"], 2)
    ctx["metadata"].set_rating(ctx["track"], 4)
    return "cuepoint_rating", lambda: ctx["metadata"].get(ctx["track"]).rating, 2


def _notes(ctx):
    ctx["metadata"].set_notes(ctx["track"], "warm-up")
    ctx["metadata"].set_notes(ctx["track"], "closer")
    return "notes", lambda: ctx["metadata"].get(ctx["track"]).notes, "warm-up"


def _override(field, first, second, restored):
    def make(ctx):
        ctx["metadata"].set_override(ctx["track"], field, first)
        ctx["metadata"].set_override(ctx["track"], field, second)
        return (
            f"cuepoint_{field}",
            lambda: getattr(ctx["metadata"].get(ctx["track"]), field),
            restored,
        )

    return make


def _tag(ctx):
    tag = ctx["tags"].create_or_get("Peak-time")
    ctx["tags"].assign([ctx["track"]], tag.id)
    return (
        "tag",
        lambda: [t.name for t in ctx["tags"].tags_for_track(ctx["track"])],
        [],
    )


def _decision(ctx):
    attempt = ctx["matched"](ctx["track"], score=80.0)
    ctx["states"].accept(ctx["track"], attempt.best_candidate_id)
    return (
        "match_state",
        lambda: state_of(ctx["matches"], ctx["track"]),
        ("needs_review", "auto", attempt.best_candidate_id, None),
    )


EVERY_FIELD = {
    "favorite": _favorite,
    "cuepoint_rating": _rating,
    "notes": _notes,
    "cuepoint_key": _override("key", "F minor", "G minor", "4A"),
    "cuepoint_bpm": _override("bpm", 125.5, 126, 125.5),
    "cuepoint_genre": _override("genre", "Dub", "Ambient", "Dub"),
    "cuepoint_label": _override("label", "Kompakt", "Ostgut", "Kompakt"),
    "cuepoint_year": _override("year", 2001, 2002, 2001),
    "tag": _tag,
    "match_state": _decision,
}


class TestEveryCuepointFieldReverts:
    def test_the_table_covers_exactly_the_fields_cuepoint_owns(self):
        assert set(EVERY_FIELD) == set(CUEPOINT_REVERTABLE_FIELDS)
        assert set(revert_module._FIELD_WORDS) | {"tag"} == set(
            CUEPOINT_REVERTABLE_FIELDS
        )

    @pytest.fixture
    def ctx(self, ids, metadata, tags, states, matches, matched) -> dict:
        return dict(
            track=ids["1"],
            metadata=metadata,
            tags=tags,
            states=states,
            matches=matches,
            matched=matched,
        )

    @pytest.mark.parametrize("field", sorted(EVERY_FIELD))
    def test_it_reverts_and_records_a_new_row(self, revert, db, ctx, field):
        history_field, read, restored = EVERY_FIELD[field](ctx)
        change_id = last_change(db, history_field, ctx["track"])
        before = raw_history(db)
        reverted = rows(db, "id = ?", (change_id,))[0]

        outcome = revert.revert_change(change_id)

        assert read() == restored
        assert outcome.changed
        assert (outcome.change_id, outcome.field) == (change_id, history_field)
        after = raw_history(db)
        assert after[: len(before)] == before, "a revert rewrote history"
        (appended,) = rows(db, "id > ?", (before[-1][0],))
        assert appended["field"] == history_field
        assert appended["old"] == reverted["new"]
        if history_field != "match_state":
            # A decision restored to automatic is re-derived, not replayed.
            assert appended["new"] == reverted["old"]
        assert appended["batch_id"] is None

    @pytest.mark.parametrize("field", sorted(EVERY_FIELD))
    def test_reverting_the_revert_puts_the_change_back(self, revert, db, ctx, field):
        history_field, read, _ = EVERY_FIELD[field](ctx)
        changed = read()
        revert.revert_change(last_change(db, history_field, ctx["track"]))

        revert.revert_change(last_change(db, history_field, ctx["track"]))

        assert read() == changed

    def test_a_revert_records_one_event_naming_what_it_reverted(
        self, revert, activity, metadata, db, ids
    ):
        metadata.set_override(ids["1"], "bpm", 131)
        change_id = last_change(db, "cuepoint_bpm", ids["1"])

        revert.revert_change(change_id)

        (event,) = activity.recent_events(event_type=EVENT_FIELD_REVERTED)
        assert event.summary == "Reverted your BPM on A - T1"
        assert event.detail == {
            "track_id": ids["1"],
            "field": "cuepoint_bpm",
            "revert_of": change_id,
            "restored_value": None,
        }

    def test_clearing_an_override_by_revert_falls_back_to_rekordbox(
        self, revert, metadata, tracks, db, ids
    ):
        metadata.set_override(ids["1"], "genre", "Dub")
        revert.revert_change(last_change(db, "cuepoint_genre", ids["1"]))

        assert metadata.get(ids["1"]).genre is None
        assert tracks.get(ids["1"]).genre == "House"

    def test_a_revert_goes_through_the_owning_services_validation(
        self, revert, metadata, db, ids, monkeypatch
    ):
        metadata.set_rating(ids["1"], 3)
        change_id = last_change(db, "cuepoint_rating", ids["1"])
        calls = []
        real = metadata.set_rating
        monkeypatch.setattr(
            metadata,
            "set_rating",
            lambda *args, **kwargs: calls.append(args) or real(*args, **kwargs),
        )

        revert.revert_change(change_id)

        assert calls == [(ids["1"], None, None)]

    def test_the_service_is_the_interface(self, revert):
        assert isinstance(revert, IRevertService)


# ------------------------------------------------------------- provenance


class TestAnOverrideKeepsWhereItCameFrom:
    def test_reverting_a_hand_edit_restores_the_beatport_value_as_beatport(
        self, revert, metadata, apply, states, matched, db, ids
    ):
        attempt = matched(ids["1"])
        assert attempt.best_candidate_id
        apply.apply_match(ids["1"], ["genre"])
        metadata.set_override(ids["1"], "genre", "Dub")

        revert.revert_change(last_change(db, "cuepoint_genre", ids["1"]))

        assert metadata.get(ids["1"]).genre == "Minimal / Deep Tech"
        assert rows(db, "field = 'cuepoint_genre'")[-1]["source"] == "beatport"

    def test_reverting_an_apply_restores_the_hand_edit_as_yours(
        self, revert, metadata, apply, matched, db, ids
    ):
        matched(ids["1"])
        metadata.set_override(ids["1"], "label", "Dial")
        apply.apply_match(ids["1"], ["label"])

        revert.revert_change(last_change(db, "cuepoint_label", ids["1"]))

        assert metadata.get(ids["1"]).label == "Dial"
        assert rows(db, "field = 'cuepoint_label'")[-1]["source"] == "cuepoint"

    def test_reverting_the_first_apply_clears_it_as_yours(
        self, revert, metadata, apply, matched, db, ids
    ):
        matched(ids["1"])
        apply.apply_match(ids["1"], ["year"])

        revert.revert_change(last_change(db, "cuepoint_year", ids["1"]))

        assert metadata.get(ids["1"]).year is None
        assert rows(db, "field = 'cuepoint_year'")[-1]["source"] == "cuepoint"

    def test_a_value_not_set_by_the_change_before_is_recorded_as_yours(
        self, revert, metadata, activity, db, ids
    ):
        # A history that does not explain the value — the change before it set
        # something else — cannot vouch for Beatport.
        metadata.set_override(ids["1"], "bpm", 125, source="beatport")
        activity.record_field_change(ids["1"], "cuepoint_bpm", 125, 127, "beatport")
        metadata.set_override(ids["1"], "bpm", 130)
        revert.revert_change(last_change(db, "cuepoint_bpm", ids["1"]))

        assert rows(db, "field = 'cuepoint_bpm'")[-1]["source"] == "cuepoint"

    def test_a_restored_key_is_stored_in_the_librarys_notation_now(
        self, revert, metadata, db, ids
    ):
        metadata.set_override(ids["3"], "key", "Am")
        metadata.set_override(ids["3"], "key", "Bm")
        with db.transaction() as conn:
            conn.execute("UPDATE tracks SET key = 'Dm' WHERE key IN ('8A', '9A')")

        revert.revert_change(last_change(db, "cuepoint_key", ids["3"]))

        assert metadata.get(ids["3"]).key == "Am"


# ------------------------------------------------------------------ stale


class TestAStaleRevertIsRefused:
    def test_a_later_rating_refuses_the_earlier_revert_naming_both_values(
        self, revert, metadata, db, ids
    ):
        metadata.set_rating(ids["1"], 2)
        metadata.set_rating(ids["1"], 4)
        earlier = last_change(db, "cuepoint_rating", ids["1"])
        metadata.set_rating(ids["1"], 5)
        before = raw_history(db)

        with pytest.raises(StaleRevertError) as refused:
            revert.revert_change(earlier)

        assert "set it to 4" in str(refused.value)
        assert "now 5" in str(refused.value)
        assert (refused.value.change.id, refused.value.current) == (earlier, 5)
        assert metadata.get(ids["1"]).rating == 5
        assert raw_history(db) == before

    @pytest.mark.parametrize(
        "setter, first, later, field",
        [
            ("set_notes", "a", "b", "notes"),
            ("set_favorite", True, False, "favorite"),
        ],
    )
    def test_notes_and_favorites_are_held_to_the_same_rule(
        self, revert, metadata, db, ids, setter, first, later, field
    ):
        getattr(metadata, setter)(ids["1"], first)
        change = last_change(db, field, ids["1"])
        getattr(metadata, setter)(ids["1"], later)

        with pytest.raises(StaleRevertError):
            revert.revert_change(change)

    @pytest.mark.parametrize("field", ["key", "bpm", "genre", "label", "year"])
    def test_an_override_changed_since_is_refused(
        self, revert, metadata, db, ids, field
    ):
        values = {
            "key": ("Am", "Bm"),
            "bpm": (120, 121),
            "genre": ("Dub", "Dubstep"),
            "label": ("Dial", "Kompakt"),
            "year": (2001, 2002),
        }[field]
        metadata.set_override(ids["1"], field, values[0])
        change = last_change(db, f"cuepoint_{field}", ids["1"])
        metadata.set_override(ids["1"], field, values[1])

        with pytest.raises(StaleRevertError, match="Revert the later change first"):
            revert.revert_change(change)

    def test_reverting_the_later_change_first_lets_the_earlier_one_revert(
        self, revert, metadata, db, ids
    ):
        metadata.set_override(ids["1"], "genre", "Dub")
        earlier = last_change(db, "cuepoint_genre", ids["1"])
        metadata.set_override(ids["1"], "genre", "Ambient")
        later = last_change(db, "cuepoint_genre", ids["1"])

        revert.revert_change(later)
        revert.revert_change(earlier)

        assert metadata.get(ids["1"]).genre is None

    def test_a_tag_taken_off_since_is_refused(self, revert, tags, db, ids):
        tag = tags.create_or_get("Peak-time")
        tags.assign([ids["1"]], tag.id)
        added = last_change(db, "tag", ids["1"])
        tags.unassign([ids["1"]], tag.id)

        with pytest.raises(StaleRevertError, match="off the track"):
            revert.revert_change(added)

    def test_a_tag_put_back_since_is_refused(self, revert, tags, db, ids):
        tag = tags.create_or_get("Peak-time")
        tags.assign([ids["1"]], tag.id)
        tags.unassign([ids["1"]], tag.id)
        removed = last_change(db, "tag", ids["1"])
        tags.assign([ids["1"]], tag.id)

        with pytest.raises(StaleRevertError, match="on the track"):
            revert.revert_change(removed)

    def test_a_tag_renamed_since_is_still_the_tag_the_track_carries(
        self, revert, tags, db, ids
    ):
        tag = tags.create_or_get("peaktime")
        tags.assign([ids["1"]], tag.id)
        tags.rename(tag.id, "Peaktime")

        revert.revert_change(last_change(db, "tag", ids["1"]))

        assert tags.tags_for_track(ids["1"]) == []

    def test_a_different_decision_since_is_refused(
        self, revert, states, matches, matched, db, ids
    ):
        attempt = matched(ids["1"], score=80.0)
        first, second = [c.id for c in matches.candidates_for(attempt.id)]
        states.accept(ids["1"], first)
        earlier = last_change(db, "match_state", ids["1"])
        states.accept(ids["1"], second)

        with pytest.raises(StaleRevertError) as refused:
            revert.revert_change(earlier)

        message = str(refused.value)
        assert f"accepted by you (candidate {first})" in message
        assert f"accepted by you (candidate {second})" in message

    def test_a_rematch_that_only_moved_the_flag_does_not_make_a_decision_stale(
        self, revert, states, matches, matched, db, ids
    ):
        attempt = matched(ids["1"], score=80.0)
        states.accept(ids["1"], attempt.best_candidate_id)
        decision = last_change(db, "match_state", ids["1"])
        newer = matched(ids["1"], score=99.0, number=999)
        assert matches.get_match(ids["1"]).newer_attempt_id == newer.id

        revert.revert_change(decision)

        # Back to what the newest evidence says, automatically.
        assert state_of(matches, ids["1"]) == (
            "accepted",
            "auto",
            newer.best_candidate_id,
            None,
        )


# -------------------------------------------------------- match decisions


class TestADecisionComesBackAsAPersonMadeIt:
    def test_reverting_a_clear_restores_the_users_decision_after_a_rematch(
        self, revert, states, matches, matched, db, ids
    ):
        attempt = matched(ids["1"], score=80.0)
        states.accept(ids["1"], attempt.best_candidate_id)
        states.clear_decision(ids["1"])
        cleared = last_change(db, "match_state", ids["1"])
        # A re-match replaces the automatic state and records nothing.
        newer = matched(ids["1"], score=99.0, number=10)

        revert.revert_change(cleared)

        # The same Beatport track won again, so the decision is not disputed.
        assert state_of(matches, ids["1"]) == (
            "accepted",
            "user",
            attempt.best_candidate_id,
            None,
        )
        assert newer.id > attempt.id

    def test_a_restored_decision_is_judged_by_an_attempt_newer_than_it_knew(
        self, revert, states, matches, matched, db, ids
    ):
        attempt = matched(ids["1"], score=80.0)
        states.accept(ids["1"], attempt.best_candidate_id)
        states.clear_decision(ids["1"])
        cleared = last_change(db, "match_state", ids["1"])
        newer = matched(ids["1"], score=99.0, number=555)

        revert.revert_change(cleared)

        assert state_of(matches, ids["1"]) == (
            "accepted",
            "user",
            attempt.best_candidate_id,
            newer.id,
        )

    def test_a_restored_decision_keeps_the_flag_it_carried(
        self, revert, states, matches, matched, db, ids
    ):
        attempt = matched(ids["1"], score=80.0)
        states.accept(ids["1"], attempt.best_candidate_id)
        newer = matched(ids["1"], score=99.0, number=555)
        states.reject(ids["1"])
        rejected = last_change(db, "match_state", ids["1"])

        revert.revert_change(rejected)

        assert state_of(matches, ids["1"]) == (
            "accepted",
            "user",
            attempt.best_candidate_id,
            newer.id,
        )

    def test_reverting_the_first_decision_on_a_never_answered_track_unmatches_it(
        self, revert, states, matches, db, ids
    ):
        matches.add_attempt(
            ids["2"],
            "job",
            TrackResult(
                playlist_index=1,
                title="A Title",
                artist="An Artist",
                matched=False,
                candidates=[],
            ),
            QUESTION,
        )
        states.reject(ids["2"])
        assert rows(db, "field = 'match_state'")[-1]["old"] is None

        revert.revert_change(last_change(db, "match_state", ids["2"]))

        assert matches.get_match(ids["2"]) is None

    def test_a_recorded_decision_that_cannot_be_read_is_refused(self, states, ids):
        with pytest.raises(ValueError, match="cannot be read"):
            states.restore_decision(ids["1"], {"decided_by": "user", "state": "x"})

    def test_restoring_nothing_on_a_track_with_no_state_writes_nothing(
        self, states, db, ids
    ):
        assert states.restore_decision(ids["3"], None) is None
        assert rows(db) == []


# ----------------------------------------------------- the two paths


class TestEachPathRefusesTheOthersFields:
    def test_the_two_sets_do_not_overlap(self):
        assert not REVERTABLE_FIELDS & CUEPOINT_REVERTABLE_FIELDS

    @pytest.mark.parametrize("field", sorted(REVERTABLE_FIELDS))
    def test_the_cuepoint_path_refuses_a_rekordbox_field_by_name(
        self, revert, activity, db, ids, field
    ):
        change = activity.record_field_change(ids["1"], field, "before", "after")
        before = raw_history(db)

        with pytest.raises(ValueError, match=f"Rekordbox's, not CuePoint's: {field}"):
            revert.revert_change(change.id)

        assert raw_history(db) == before

    @pytest.mark.parametrize("field", sorted(CUEPOINT_REVERTABLE_FIELDS))
    def test_the_rekordbox_path_refuses_a_cuepoint_field_by_name(
        self, activity, tracks, db, ids, field
    ):
        change = activity.record_field_change(ids["1"], field, None, "after")
        before = raw_history(db)
        imported = tracks.get(ids["1"])

        with pytest.raises(
            ValueError, match=f"CuePoint's own, not Rekordbox's: {field}"
        ):
            activity.revert_field_change(change.id)

        assert raw_history(db) == before
        assert tracks.get(ids["1"]) == imported

    def test_a_field_neither_path_owns_is_not_revertable(self, revert, activity, ids):
        change = activity.record_field_change(ids["1"], "normalized_path", "a", "b")
        with pytest.raises(ValueError, match="not revertable: normalized_path"):
            revert.revert_change(change.id)

    def test_an_unknown_change_is_refused(self, revert):
        with pytest.raises(ValueError, match="Unknown field change: 424242"):
            revert.revert_change(424242)

    def test_the_rekordbox_path_still_reverts_its_own(self, activity, tracks, ids):
        change = activity.apply_field_change(tracks.get(ids["1"]), "title", "Renamed")
        reverted = activity.revert_field_change(change.id)

        assert tracks.get(ids["1"]).title == "T1"
        (event,) = activity.recent_events(event_type=EVENT_FIELD_REVERTED)
        assert event.detail["revert_of"] == change.id
        assert event.detail["reverted_change_id"] == change.id
        assert reverted.new_value == "T1"


# ---------------------------------------------------------------- batches


def everyone(ids) -> BatchSelection:
    return BatchSelection.of_ids(sorted(ids.values()))


class TestRevertingABatch:
    def test_a_rating_batch_reverts_under_a_new_batch_id(
        self, revert, batch, metadata, activity, db, ids
    ):
        metadata.set_rating(ids["1"], 1)
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_SET_RATING, 5)
        )

        result = revert.revert_batch(applied.batch_id)

        assert metadata.get(ids["1"]).rating == 1
        for rid in ("2", "3", "4"):
            assert metadata.get(ids[rid]).rating is None
        assert (result.total, result.reverted, result.skipped) == (4, 4, 0)
        assert result.batch_id != applied.batch_id
        written = rows(db, "batch_id = ?", (result.batch_id,))
        assert len(written) == 4
        assert {row["old"] for row in written} == {5}

        (event,) = activity.recent_events(event_type=EVENT_BATCH_REVERTED)
        assert event.summary == "Reverted 4 changes of “Rated 4 tracks 5 stars”"
        assert event.detail == result.to_dict()
        assert event.detail["revert_of"] == applied.batch_id
        assert event.detail["skipped"] == 0

    def test_reverting_the_revert_restores_the_batch(
        self, revert, batch, metadata, ids
    ):
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_SET_RATING, 5)
        )
        undone = revert.revert_batch(applied.batch_id)

        redone = revert.revert_batch(undone.batch_id)

        assert redone.reverted == 4
        assert all(metadata.get(t).rating == 5 for t in ids.values())

    def test_changes_are_reverted_newest_first(self, revert, metadata, db, ids):
        # One field changed twice in one batch unwinds only in reverse order:
        # oldest first, the first row's value is not what the field holds.
        metadata.set_rating(ids["1"], 2, batch_id="twice")
        metadata.set_rating(ids["1"], 3, batch_id="twice")

        result = revert.revert_batch("twice")

        assert (result.reverted, result.skipped) == (2, 0)
        assert metadata.get(ids["1"]).rating is None

    def test_stale_changes_are_skipped_and_counted(
        self, revert, batch, metadata, activity, ids
    ):
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_SET_RATING, 5)
        )
        metadata.set_rating(ids["2"], 3)

        result = revert.revert_batch(applied.batch_id)

        assert (result.reverted, result.skipped, result.failed) == (3, 1, 0)
        assert metadata.get(ids["2"]).rating == 3
        (event,) = activity.recent_events(event_type=EVENT_BATCH_REVERTED)
        assert event.summary.endswith("1 skipped because they changed since")

    def test_a_tag_batch_reverts(self, revert, batch, tags, ids):
        tag = tags.create_or_get("Warm-up")
        tags.assign([ids["1"]], tag.id)
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_ADD_TAG, tag.id)
        )

        result = revert.revert_batch(applied.batch_id)

        assert result.reverted == 3
        assert [t.name for t in tags.tags_for_track(ids["1"])] == ["Warm-up"]
        for rid in ("2", "3", "4"):
            assert tags.tags_for_track(ids[rid]) == []

    def test_a_deleted_tag_comes_back_on_every_track_that_had_it(
        self, revert, tags, ids
    ):
        tag = tags.create_or_get("Peak-time")
        tags.assign([ids["1"], ids["2"]], tag.id)
        tags.delete(tag.id, batch_id="deleted")

        result = revert.revert_batch("deleted")

        assert result.reverted == 2
        for rid in ("1", "2"):
            assert [t.name for t in tags.tags_for_track(ids[rid])] == ["Peak-time"]

    def test_a_merge_unwinds_to_both_tags(self, revert, tags, ids):
        source = tags.create_or_get("Peaktime")
        target = tags.create_or_get("Peak-time")
        tags.assign([ids["1"], ids["2"]], source.id)
        tags.assign([ids["2"], ids["3"]], target.id)
        tags.merge(source.id, target.id, batch_id="merged")

        revert.revert_batch("merged")

        names = {
            rid: sorted(t.name for t in tags.tags_for_track(ids[rid]))
            for rid in ("1", "2", "3")
        }
        assert names == {
            "1": ["Peaktime"],
            "2": ["Peak-time", "Peaktime"],
            "3": ["Peak-time"],
        }

    def test_an_apply_batch_reverts_and_its_revert_says_beatport_again(
        self, revert, batch, metadata, matched, db, ids
    ):
        for rid in ("1", "2"):
            matched(ids[rid])
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_APPLY_MATCH, ["genre", "bpm"])
        )

        undone = revert.revert_batch(applied.batch_id)
        assert metadata.get(ids["1"]).genre is None
        assert undone.reverted == 4

        revert.revert_batch(undone.batch_id)
        assert metadata.get(ids["1"]).genre == "Minimal / Deep Tech"
        assert {row["source"] for row in rows(db, "field LIKE 'cuepoint_%'")} == {
            "beatport",
            "cuepoint",
        }
        redone = rows(db, "batch_id NOT IN (?, ?)", (applied.batch_id, undone.batch_id))
        assert {row["source"] for row in redone} == {"beatport"}

    def test_a_decision_batch_reverts_to_automatic(
        self, revert, batch, matches, matched, ids
    ):
        for rid in ("1", "2"):
            matched(ids[rid], score=80.0)
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_ACCEPT_MATCH)
        )

        revert.revert_batch(applied.batch_id)

        for rid in ("1", "2"):
            assert state_of(matches, ids[rid])[:2] == ("needs_review", "auto")

    def test_a_hand_edit_batch_reverts(self, revert, batch, metadata, ids):
        applied = batch.apply_batch(
            everyone(ids),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "year", "value": 1990}),
        )

        result = revert.revert_batch(applied.batch_id)

        assert result.reverted == 4
        assert all(metadata.get(t).year is None for t in ids.values())

    def test_a_key_batch_asks_the_librarys_notation_once(self, revert, batch, db, ids):
        applied = batch.apply_batch(
            everyone(ids),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "key", "value": "Am"}),
        )
        redo = revert.revert_batch(applied.batch_id)
        statements: List[str] = []
        connection = db.connect()
        connection.set_trace_callback(statements.append)
        try:
            revert.revert_batch(redo.batch_id)
        finally:
            connection.set_trace_callback(None)
        assert sum("GLOB" in sql for sql in statements) == 1

    def test_a_batch_without_keys_never_counts_the_notation(
        self, revert, batch, db, ids
    ):
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_SET_RATING, 4)
        )
        statements: List[str] = []
        connection = db.connect()
        connection.set_trace_callback(statements.append)
        try:
            revert.revert_batch(applied.batch_id)
        finally:
            connection.set_trace_callback(None)
        assert not any("GLOB" in sql for sql in statements)


class TestWhatABatchRevertRefuses:
    @pytest.mark.parametrize(
        "operation", [OPERATION_ADD_TO_COLLECTION, OPERATION_REMOVE_FROM_COLLECTION]
    )
    def test_collection_membership_is_refused_with_the_reason(
        self, revert, batch, collections, db, ids, operation
    ):
        node = collections.create_collection("Set")
        if operation == OPERATION_REMOVE_FROM_COLLECTION:
            collections.add_tracks(node.id, sorted(ids.values()))
        applied = batch.apply_batch(everyone(ids), BatchOperation(operation, node.id))
        entries = collections.entries(node.id)
        before = raw_history(db)

        for attempt in (revert.check_batch, revert.revert_batch):
            with pytest.raises(ValueError) as refused:
                attempt(applied.batch_id)
            assert str(refused.value) == MEMBERSHIP_REFUSAL

        assert "right only sometimes" in MEMBERSHIP_REFUSAL
        assert collections.entries(node.id) == entries
        assert raw_history(db) == before

    def test_an_unknown_batch_is_refused(self, revert):
        with pytest.raises(ValueError, match="No such batch: nope"):
            revert.check_batch("nope")

    @pytest.mark.parametrize("blank", ["", "   ", None])
    def test_a_batch_must_be_named(self, revert, blank):
        with pytest.raises(ValueError, match="Name the batch"):
            revert.revert_batch(blank)

    def test_a_batch_that_changed_nothing_says_so(self, revert, batch, metadata, ids):
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_SET_RATING, None)
        )
        assert applied.changed == 0
        with pytest.raises(ValueError, match="changed nothing"):
            revert.check_batch(applied.batch_id)

    def test_a_batch_carrying_a_rekordbox_field_is_refused_before_anything(
        self, revert, activity, metadata, db, ids
    ):
        metadata.set_rating(ids["1"], 4, batch_id="mixed")
        activity.record_field_change(ids["1"], "title", "a", "b", batch_id="mixed")

        with pytest.raises(ValueError, match="cannot write: title"):
            revert.revert_batch("mixed")

        assert metadata.get(ids["1"]).rating == 4

    def test_check_counts_the_changes(self, revert, batch, ids):
        applied = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_SET_RATING, 2)
        )
        assert revert.check_batch(f"  {applied.batch_id} ") == 4


class TestABatchRevertRunsInChunks:
    @pytest.fixture
    def small_chunks(self, monkeypatch):
        monkeypatch.setattr(revert_module, "BATCH_CHUNK_SIZE", 2)

    @pytest.fixture
    def rated(self, batch, ids) -> str:
        return batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_SET_RATING, 5)
        ).batch_id

    def test_progress_is_reported_per_chunk(self, revert, rated, small_chunks):
        ticks: List[tuple] = []
        revert.revert_batch(
            rated, on_progress=lambda done, total: ticks.append((done, total))
        )
        assert ticks == [(0, 4), (2, 4), (4, 4)]

    def test_a_cancel_leaves_what_was_reverted_reverted(
        self, revert, rated, metadata, activity, ids, small_chunks
    ):
        asked = []

        def cancel_after_one_chunk() -> bool:
            asked.append(True)
            return len(asked) > 1

        result = revert.revert_batch(rated, should_cancel=cancel_after_one_chunk)

        assert result.cancelled and (result.completed, result.total) == (2, 4)
        ratings = sorted((metadata.get(t).rating is None) for t in ids.values())
        assert ratings == [False, False, True, True]
        (event,) = activity.recent_events(event_type=EVENT_BATCH_REVERTED)
        assert event.summary.endswith("cancelled after 2 of 4")

    def test_a_failing_change_costs_one_change_and_is_rolled_back_alone(
        self, revert, rated, metadata, db, ids, small_chunks, monkeypatch
    ):
        real = metadata.set_rating

        def half_written(track_id, rating, batch_id=None):
            record = real(track_id, rating, batch_id)
            if track_id == ids["2"]:
                raise ValueError("the disk said no")
            return record

        monkeypatch.setattr(metadata, "set_rating", half_written)

        result = revert.revert_batch(rated)

        assert (result.reverted, result.failed) == (3, 1)
        # Written and then refused: rolled back alone, not committed half done.
        assert metadata.get(ids["2"]).rating == 5
        assert len(rows(db, "batch_id = ?", (result.batch_id,))) == 3
        for rid in ("1", "3", "4"):
            assert metadata.get(ids[rid]).rating is None

    def test_a_change_gone_by_the_time_its_chunk_runs_is_counted_as_failed(
        self, revert, rated, monkeypatch
    ):
        real = revert._history.batch_change_ids
        monkeypatch.setattr(
            revert._history,
            "batch_change_ids",
            lambda batch_id: [9_999_999, *real(batch_id)],
        )

        result = revert.revert_batch(rated)

        assert (result.total, result.reverted, result.failed) == (5, 4, 1)

    def test_a_change_already_holding_its_old_value_is_unchanged(
        self, revert, states, matches, matched, db, ids
    ):
        # Accepting the same candidate again only clears a flag: its revert
        # puts back a flag the newest attempt already moved.
        attempt = matched(ids["1"], score=80.0)
        states.accept(ids["1"], attempt.best_candidate_id)
        matched(ids["1"], score=99.0, number=555)
        states.accept(ids["1"], attempt.best_candidate_id, batch_id="again")
        matched(ids["1"], score=99.0, number=10)

        result = revert.revert_batch("again")

        assert (result.reverted, result.unchanged) == (0, 1)


class TestTheResult:
    def test_counts_that_do_not_add_up_are_refused(self):
        with pytest.raises(ValueError, match="accounts for every change"):
            BatchRevert(batch_id="n", reverted_batch_id="o", total=3, reverted=2)
        with pytest.raises(ValueError, match="cannot account"):
            BatchRevert(
                batch_id="n", reverted_batch_id="o", total=1, reverted=2, cancelled=True
            )

    def test_the_payload_is_a_batch_result_plus_what_a_revert_adds(self):
        result = BatchRevert(
            batch_id="new",
            reverted_batch_id="old",
            total=5,
            reverted=2,
            skipped=1,
            unchanged=1,
            failed=1,
        )
        assert result.to_dict() == {
            "batch_id": "new",
            "operation": "revert_batch",
            "target": "old",
            "total": 5,
            "changed": 2,
            "unchanged": 1,
            "skipped": 1,
            "failed": 1,
            "cancelled": False,
            "revert_of": "old",
        }


class TestFindingABatch:
    def test_a_batch_is_read_through_its_index(self, db):
        plan = " ".join(
            str(tuple(row))
            for row in db.connect().execute(
                "EXPLAIN QUERY PLAN SELECT id FROM track_history"
                " WHERE batch_id = ? ORDER BY id DESC",
                ("b",),
            )
        )
        assert "idx_track_history_batch" in plan
        assert "TEMP B-TREE" not in plan

    def test_the_ids_come_newest_first_and_only_the_batchs(
        self, metadata, activity, db, ids
    ):
        metadata.set_rating(ids["1"], 1, batch_id="b")
        metadata.set_rating(ids["2"], 1)
        metadata.set_rating(ids["3"], 1, batch_id="b")
        repository = ActivityRepository(db)

        found = repository.batch_change_ids("b")

        expected = [row["id"] for row in rows(db, "batch_id = 'b'")]
        assert found == list(reversed(expected))
        assert [c.id for c in repository.get_field_changes(found)] == found
        assert repository.batch_field_counts("b") == {"cuepoint_rating": 2}


class TestWhatTheTableDidNotCover:
    def test_a_restored_runner_up_is_not_flagged_by_the_attempt_it_chose_from(
        self, revert, states, matches, matched, db, ids
    ):
        # The user accepted the second candidate knowing the winner. Only an
        # attempt newer than the decision may dispute it.
        attempt = matched(ids["1"], score=80.0)
        runner_up = matches.candidates_for(attempt.id)[1].id
        states.accept(ids["1"], runner_up)
        states.clear_decision(ids["1"])

        revert.revert_change(last_change(db, "match_state", ids["1"]))

        assert state_of(matches, ids["1"]) == ("accepted", "user", runner_up, None)

    def test_a_favorite_on_a_track_with_no_metadata_left_reverts(
        self, revert, metadata, db, ids
    ):
        # ``clear`` deletes the row, so the favorite's current value is read
        # with nothing there. Nothing else in the batch recreates the row first.
        metadata.set_favorite(ids["1"], True)
        metadata.clear(ids["1"], batch_id="forgot")
        assert metadata.get(ids["1"]) is None

        result = revert.revert_batch("forgot")

        assert (result.reverted, result.skipped) == (1, 0)
        assert bool(metadata.get(ids["1"]).favorite) is True

    def test_a_restored_flag_survives_an_attempt_with_no_winner(
        self, revert, states, matches, matched, db, ids
    ):
        # A later answer with no winner says nothing new about an accept, so
        # the flag the decision carried is the one it must come back with.
        attempt = matched(ids["1"], score=80.0)
        states.accept(ids["1"], attempt.best_candidate_id)
        disputing = matched(ids["1"], score=99.0, number=555)
        states.reject(ids["1"])
        rejected = last_change(db, "match_state", ids["1"])
        silent = matches.add_attempt(
            ids["1"],
            "job",
            TrackResult(
                playlist_index=1,
                title="A Title",
                artist="An Artist",
                matched=False,
                candidates=[candidate(777, 40.0)],
            ),
            QUESTION,
        )
        states.apply_attempt(silent)
        assert matches.latest_answered_attempt(ids["1"]).id == silent.id

        revert.revert_change(rejected)

        assert state_of(matches, ids["1"]) == (
            "accepted",
            "user",
            attempt.best_candidate_id,
            disputing.id,
        )

    def test_forgetting_a_track_reverts_field_by_field(
        self, revert, metadata, tags, db, ids
    ):
        metadata.set_rating(ids["1"], 4)
        metadata.set_favorite(ids["1"], True)
        metadata.set_notes(ids["1"], "opener")
        metadata.set_override(ids["1"], "genre", "Dub")
        metadata.clear(ids["1"], batch_id="forgot")
        assert metadata.get(ids["1"]) is None

        result = revert.revert_batch("forgot")

        record = metadata.get(ids["1"])
        assert (result.reverted, result.skipped) == (4, 0)
        assert (record.rating, bool(record.favorite), record.notes, record.genre) == (
            4,
            True,
            "opener",
            "Dub",
        )
