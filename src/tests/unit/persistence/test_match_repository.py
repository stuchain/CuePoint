#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Match attempts, their candidates and match states at the storage layer.

CLEAN-02's persistence half of DEC-066. Three properties are worth more than
the rest, and each has a test that would fail without it:

1. **An attempt round-trips completely.** A winner, only rejected candidates,
   no candidates and an error each come back field for field — checked against
   the matcher's own objects, not only against the mapping, so the test is not
   the mapping compared with itself.
2. **An attempt is whole or absent.** A candidate row that fails takes the
   attempt with it, including inside a caller's transaction that catches the
   error and commits anyway.
3. **Nothing is overwritten and nothing reaches Beatport.** A second attempt
   changes no row of the first, and reading candidates runs with every network
   path patched to fail.

The state writes CLEAN-04 will drive are here too, with the one rule foreign
keys cannot express: a state rests on its own track's evidence.
"""

from __future__ import annotations

import json
import socket
import sqlite3
from contextlib import ExitStack
from datetime import datetime
from pathlib import Path
from typing import Any, List
from unittest.mock import patch

import pytest

import cuepoint.persistence.match_repository as match_repository_module
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import (
    DECIDED_BY_AUTO,
    DECIDED_BY_USER,
    OUTCOME_ERROR,
    OUTCOME_MATCHED,
    OUTCOME_NO_MATCH,
    STATE_ACCEPTED,
    STATE_NEEDS_REVIEW,
    STATE_NO_MATCH,
    STATE_REJECTED,
    MatchAttempt,
    MatchCandidate,
    TrackMatch,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_record import attempt_from_result, question_json
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.version import __version__

NOW = "2026-09-13T12:00:00+00:00"
LATER = "2026-09-13T12:00:45+00:00"

QUERIES = [
    {"index": 1, "query": "an artist song 2", "candidates": 3, "elapsed_ms": 820},
    {"index": 2, "query": "song 2", "candidates": 0, "elapsed_ms": 410},
]

TITLE = "Song 2 (Extended Mix)"


# --------------------------------------------------------------------- helpers


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db):
    return MatchRepository(db)


@pytest.fixture
def track_ids(db) -> List[int]:
    TrackRepository(db).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/m/{i}.mp3",
                title=f"T{i}",
                artist="An Artist",
            )
            for i in range(1, 5)
        ]
    )
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


def count(db, table: str) -> int:
    return int(db.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


def the_track() -> Track:
    return Track(title=TITLE, artist="An Artist", key="Am", year=2024)


def scored(number: int, score: float = 90.0, guard_ok: bool = True, **fields: Any):
    """A candidate shaped as the matcher builds one, fractional similarity and all."""
    values: dict = dict(
        url=f"https://www.beatport.com/track/song-{number}/{1000 + number}",
        title=f"Song {number} (Extended Mix)",
        artists="An Artist, Another",
        label="A Label",
        release_date="2024-05-17",
        bpm="128",
        key="A min",
        genre="Tech House",
        score=score,
        title_sim=87.5,
        artist_sim=100,
        query_index=1,
        query_text="an artist song 2",
        candidate_index=number + 1,
        base_score=score - 2.0,
        bonus_year=2,
        bonus_key=-1,
        guard_ok=guard_ok,
        reject_reason="" if guard_ok else "guard_title_sim_floor",
        elapsed_ms=312,
        is_winner=False,
        release_year=2024,
        release_name="Song EP",
    )
    values.update(fields)
    return BeatportCandidate(**values)


def matched_result(winner_rank: int = 1, size: int = 3) -> TrackResult:
    candidates = [scored(n, score=80.0 + n) for n in range(size)]
    best = candidates[winner_rank]
    best.is_winner = True
    return TrackResult(
        playlist_index=1,
        title=TITLE,
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=candidates,
        match_score=best.score,
        processing_time=12.5,
        queries_data=list(QUERIES),
    )


def rejected_result() -> TrackResult:
    return TrackResult(
        playlist_index=1,
        title=TITLE,
        artist="An Artist",
        matched=False,
        candidates=[scored(n, score=40.0 + n, guard_ok=False) for n in range(3)],
        processing_time=30.0,
        queries_data=list(QUERIES),
    )


def empty_result() -> TrackResult:
    return TrackResult(
        playlist_index=1,
        title=TITLE,
        artist="An Artist",
        matched=False,
        processing_time=3.0,
        queries_data=list(QUERIES),
    )


def error_result() -> TrackResult:
    return TrackResult(
        playlist_index=1,
        title=TITLE,
        artist="An Artist",
        matched=False,
        error="Processing timed out",
    )


def store(repo, track_id: int, result: TrackResult, job_id: str = "job-1"):
    return repo.add_attempt(
        track_id, job_id, result, the_track(), started_at=NOW, finished_at=LATER
    )


def assert_candidates_are_the_matchers(
    read: List[MatchCandidate], source: List[BeatportCandidate]
) -> None:
    """Compare stored candidates with the matcher's objects, column by column."""
    assert len(read) == len(source)
    for rank, (row, cand) in enumerate(zip(read, source)):
        assert row.rank == rank
        assert (row.url, row.title, row.artists, row.label, row.key, row.genre) == (
            cand.url,
            cand.title,
            cand.artists,
            cand.label,
            cand.key,
            cand.genre,
        )
        assert (row.release_name, row.release_date, row.release_year) == (
            cand.release_name,
            cand.release_date,
            cand.release_year,
        )
        assert row.bpm == float(cand.bpm)
        assert row.score == cand.score and row.base_score == cand.base_score
        assert (row.title_sim, row.artist_sim) == (cand.title_sim, cand.artist_sim)
        assert (row.bonus_year, row.bonus_key) == (cand.bonus_year, cand.bonus_key)
        assert (row.query_index, row.query_text, row.candidate_index) == (
            cand.query_index,
            cand.query_text,
            cand.candidate_index,
        )
        assert row.elapsed_ms == cand.elapsed_ms
        assert row.guard_ok is cand.guard_ok
        assert row.reject_reason == (cand.reject_reason or None)
        assert row.beatport_track_id == cand.url.rsplit("/", 1)[1]


# -------------------------------------------------------------- storing one


@pytest.mark.unit
class TestStoringAnAttempt:
    def test_a_match_reads_back_field_for_field(self, repo, track_ids):
        result = matched_result(winner_rank=1)
        stored = store(repo, track_ids[0], result)
        record = attempt_from_result(result, the_track())

        read = repo.candidates_for(stored.id)
        assert stored == repo.get_attempt(stored.id)
        assert stored == MatchAttempt(
            id=stored.id,
            track_id=track_ids[0],
            job_id="job-1",
            started_at=NOW,
            finished_at=LATER,
            best_candidate_id=read[1].id,
            **record.attempt,
        )
        assert stored.outcome == OUTCOME_MATCHED
        assert stored.score == 81.0
        assert stored.error is None
        assert stored.input == json.loads(question_json(the_track()))
        assert stored.queries == QUERIES
        assert stored.matcher_version == __version__

        assert [c.to_dict() for c in read] == [
            MatchCandidate(id=c.id, attempt_id=stored.id, **row).to_dict()
            for c, row in zip(read, record.candidates)
        ]
        assert_candidates_are_the_matchers(read, result.candidates)

    def test_order_and_the_winner_survive(self, repo, track_ids):
        stored = store(repo, track_ids[0], matched_result(winner_rank=2, size=5))
        read = repo.candidates_for(stored.id)
        assert [c.rank for c in read] == [0, 1, 2, 3, 4]
        assert [c.is_winner for c in read] == [False, False, True, False, False]
        assert stored.best_candidate_id == read[2].id
        assert repo.winner_of(stored.id) == read[2]

    def test_only_rejected_candidates_are_all_kept(self, repo, track_ids):
        result = rejected_result()
        stored = store(repo, track_ids[0], result)
        read = repo.candidates_for(stored.id)

        assert stored.outcome == OUTCOME_NO_MATCH
        assert (stored.score, stored.best_candidate_id, stored.error) == (
            None,
            None,
            None,
        )
        assert [c.guard_ok for c in read] == [False, False, False]
        assert {c.reject_reason for c in read} == {"guard_title_sim_floor"}
        assert not any(c.is_winner for c in read)
        assert repo.winner_of(stored.id) is None
        assert_candidates_are_the_matchers(read, result.candidates)

    def test_no_candidates_is_still_an_attempt(self, repo, track_ids):
        stored = store(repo, track_ids[0], empty_result())
        assert stored.outcome == OUTCOME_NO_MATCH
        assert repo.candidates_for(stored.id) == []
        assert stored.queries == QUERIES
        assert repo.get_attempt(stored.id) == stored

    def test_an_error_is_kept_with_what_went_wrong(self, repo, track_ids):
        stored = store(repo, track_ids[0], error_result())
        assert stored.outcome == OUTCOME_ERROR
        assert stored.error == "Processing timed out"
        assert (stored.score, stored.best_candidate_id) == (None, None)
        assert stored.queries == []
        assert repo.candidates_for(stored.id) == []
        assert repo.get_attempt(stored.id) == stored

    def test_a_single_match_needs_no_job(self, repo, track_ids):
        stored = store(repo, track_ids[0], matched_result(), job_id=None)
        assert stored.job_id is None

    def test_times_default_to_now_less_the_time_it_took(self, repo, track_ids):
        before = datetime.now().astimezone()
        stored = repo.add_attempt(track_ids[0], "job-1", matched_result(), the_track())
        after = datetime.now().astimezone()

        finished = datetime.fromisoformat(stored.finished_at)
        started = datetime.fromisoformat(stored.started_at)
        assert finished.utcoffset().total_seconds() == 0
        assert before <= finished <= after
        assert (finished - started).total_seconds() == 12.5

    def test_a_given_start_is_kept_when_the_end_is_defaulted(self, repo, track_ids):
        stored = repo.add_attempt(
            track_ids[0], "job-1", matched_result(), the_track(), started_at=NOW
        )
        assert stored.started_at == NOW
        assert stored.finished_at != NOW

    def test_a_given_matcher_version_is_kept(self, repo, track_ids):
        stored = repo.add_attempt(
            track_ids[0],
            "job-1",
            matched_result(),
            the_track(),
            matcher_version="0.9.0",
        )
        assert stored.matcher_version == "0.9.0"


@pytest.mark.unit
class TestASecondAttempt:
    def test_it_adds_rows_and_changes_none_of_the_first(self, db, repo, track_ids):
        first = store(repo, track_ids[0], matched_result(winner_rank=0))

        def rows_of(attempt_id: int):
            connection = db.connect()
            return (
                dict(
                    connection.execute(
                        "SELECT * FROM match_attempts WHERE id = ?", (attempt_id,)
                    ).fetchone()
                ),
                [
                    dict(row)
                    for row in connection.execute(
                        "SELECT * FROM match_candidates WHERE attempt_id = ?"
                        " ORDER BY id",
                        (attempt_id,),
                    )
                ],
            )

        before = rows_of(first.id)
        second = store(repo, track_ids[0], rejected_result())

        assert rows_of(first.id) == before
        assert second.id > first.id
        assert count(db, "match_attempts") == 2
        assert count(db, "match_candidates") == 6

    def test_attempts_read_newest_first(self, repo, track_ids):
        first = store(repo, track_ids[0], matched_result())
        second = store(repo, track_ids[0], error_result())
        third = store(repo, track_ids[0], empty_result())
        store(repo, track_ids[1], matched_result())

        assert [a.id for a in repo.attempts_for(track_ids[0])] == [
            third.id,
            second.id,
            first.id,
        ]
        assert repo.latest_attempt(track_ids[0]) == third

    def test_newest_is_the_last_stored_even_when_its_clock_says_otherwise(
        self, repo, track_ids
    ):
        first = store(repo, track_ids[0], matched_result())
        second = repo.add_attempt(
            track_ids[0],
            "job-1",
            matched_result(),
            the_track(),
            started_at="2020-01-01T00:00:00+00:00",
            finished_at="2020-01-01T00:00:01+00:00",
        )
        assert repo.latest_attempt(track_ids[0]).id == second.id > first.id


@pytest.mark.unit
class TestReadingNothing:
    def test_unknown_ids_read_as_nothing(self, repo, track_ids):
        assert repo.get_attempt(999) is None
        assert repo.get_candidate(999) is None
        assert repo.winner_of(999) is None
        assert repo.candidates_for(999) == []
        assert repo.attempts_for(track_ids[0]) == []
        assert repo.latest_attempt(track_ids[0]) is None

    def test_a_candidate_reads_back_by_its_id(self, repo, track_ids):
        stored = store(repo, track_ids[0], matched_result())
        for candidate in repo.candidates_for(stored.id):
            assert repo.get_candidate(candidate.id) == candidate


# ---------------------------------------------------------- whole or absent


def fail_candidate_at_rank(db, rank: int) -> None:
    """Make the database refuse one candidate row, as a constraint would."""
    db.connect().execute(
        "CREATE TEMP TRIGGER refuse_candidate BEFORE INSERT ON match_candidates"
        f" WHEN NEW.rank = {int(rank)}"
        " BEGIN SELECT RAISE(ABORT, 'candidate refused'); END"
    )


@pytest.mark.unit
class TestWholeOrAbsent:
    def test_a_failing_candidate_row_takes_the_attempt_with_it(
        self, db, repo, track_ids
    ):
        fail_candidate_at_rank(db, 2)
        with pytest.raises(sqlite3.IntegrityError, match="candidate refused"):
            store(repo, track_ids[0], matched_result(size=4))

        assert count(db, "match_attempts") == 0
        assert count(db, "match_candidates") == 0
        assert not db.connect().in_transaction

    def test_inside_a_callers_transaction_that_carries_on(self, db, repo, track_ids):
        with db.transaction():
            kept = store(repo, track_ids[0], matched_result(size=3))
            fail_candidate_at_rank(db, 2)
            with pytest.raises(sqlite3.IntegrityError):
                store(repo, track_ids[1], matched_result(size=4))

        assert [a.id for a in repo.attempts_for(track_ids[0])] == [kept.id]
        assert repo.attempts_for(track_ids[1]) == []
        assert count(db, "match_candidates") == 3

    def test_a_candidate_the_model_refuses_writes_nothing(self, db, repo, track_ids):
        result = matched_result()
        result.candidates[2].score = float("nan")
        with pytest.raises(ValueError, match="score"):
            store(repo, track_ids[0], result)
        assert count(db, "match_attempts") == 0
        assert count(db, "match_candidates") == 0

    def test_an_unknown_track_writes_nothing(self, db, repo, track_ids):
        with pytest.raises(sqlite3.IntegrityError):
            store(repo, 99_999, matched_result())
        assert count(db, "match_attempts") == 0

    def test_a_blank_job_id_is_refused_before_anything_is_written(
        self, db, repo, track_ids
    ):
        with pytest.raises(ValueError, match="job_id"):
            store(repo, track_ids[0], matched_result(), job_id="  ")
        assert count(db, "match_attempts") == 0

    def test_a_result_that_contradicts_itself_writes_nothing(self, db, repo, track_ids):
        result = matched_result()
        result.candidates.remove(result.best_match)
        with pytest.raises(ValueError, match="best match"):
            store(repo, track_ids[0], result)
        assert count(db, "match_attempts") == 0

    def test_a_later_attempt_still_stores_after_one_failed(self, db, repo, track_ids):
        fail_candidate_at_rank(db, 3)
        with pytest.raises(sqlite3.IntegrityError):
            store(repo, track_ids[0], matched_result(size=4))
        stored = store(repo, track_ids[0], matched_result(size=3))
        assert len(repo.candidates_for(stored.id)) == 3


# ------------------------------------------------------------- no network


@pytest.fixture
def no_network():
    """Every path to Beatport, and to any socket, fails the test if reached."""

    def refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("the network was reached")

    with ExitStack() as stack:
        stack.enter_context(patch.object(socket.socket, "connect", refuse))
        stack.enter_context(patch.object(socket, "create_connection", refuse))
        for target in (
            "requests.Session.request",
            "cuepoint.data.beatport.request_html",
            "cuepoint.data.beatport.parse_track_page",
            "cuepoint.data.beatport.track_urls",
            "cuepoint.core.matcher.track_urls",
            "cuepoint.core.matcher.parse_track_page",
        ):
            stack.enter_context(patch(target, side_effect=refuse))
        yield


@pytest.mark.unit
class TestNoNetwork:
    def test_storing_and_reading_never_reach_beatport(
        self, repo, track_ids, no_network
    ):
        stored = store(repo, track_ids[0], matched_result())

        candidates = repo.candidates_for(stored.id)
        assert len(candidates) == 3
        assert repo.winner_of(stored.id) is not None
        assert repo.get_candidate(candidates[0].id) == candidates[0]
        assert repo.attempts_for(track_ids[0]) == [stored]
        assert repo.latest_attempt(track_ids[0]) == stored

    def test_the_network_patches_are_live(self, no_network):
        with pytest.raises(AssertionError, match="network"):
            socket.create_connection(("www.beatport.com", 443))

    def test_neither_module_imports_a_beatport_client(self):
        repository = Path(match_repository_module.__file__).read_text(encoding="utf-8")
        record = (
            Path(match_repository_module.__file__).parents[1]
            / "services"
            / "match_record.py"
        ).read_text(encoding="utf-8")
        for source in (repository, record):
            assert "cuepoint.data" not in source
            assert "requests" not in source


# ------------------------------------------------------------------- state


def decision(track_id: int, attempt_id: int, **fields: Any) -> TrackMatch:
    fields.setdefault("state", STATE_ACCEPTED)
    fields.setdefault("decided_by", DECIDED_BY_AUTO)
    fields.setdefault("decided_at", NOW)
    return TrackMatch(track_id=track_id, attempt_id=attempt_id, **fields)


@pytest.mark.unit
class TestMatchState:
    def test_a_track_never_matched_has_no_state(self, repo, track_ids):
        assert repo.get_match(track_ids[0]) is None
        assert repo.get_matches(track_ids) == {}

    def test_an_automatic_acceptance_reads_back(self, repo, track_ids):
        attempt = store(repo, track_ids[0], matched_result())
        written = repo.set_match(
            decision(track_ids[0], attempt.id, candidate_id=attempt.best_candidate_id)
        )
        assert written == repo.get_match(track_ids[0])
        assert written.candidate_id == attempt.best_candidate_id

    def test_writing_again_replaces_the_state(self, db, repo, track_ids):
        first = store(repo, track_ids[0], matched_result())
        second = store(repo, track_ids[0], matched_result(winner_rank=0))
        repo.set_match(
            decision(
                track_ids[0],
                first.id,
                candidate_id=first.best_candidate_id,
                decided_by=DECIDED_BY_USER,
                newer_attempt_id=second.id,
            )
        )
        replaced = repo.set_match(
            decision(
                track_ids[0],
                second.id,
                state=STATE_REJECTED,
                decided_by=DECIDED_BY_USER,
                decided_at=LATER,
            )
        )
        assert replaced == repo.get_match(track_ids[0])
        assert (replaced.state, replaced.candidate_id, replaced.newer_attempt_id) == (
            STATE_REJECTED,
            None,
            None,
        )
        assert count(db, "track_match") == 1

    def test_every_state_can_be_written(self, repo, track_ids):
        for track_id, state in zip(
            track_ids,
            (STATE_NO_MATCH, STATE_NEEDS_REVIEW, STATE_ACCEPTED, STATE_REJECTED),
        ):
            attempt = store(repo, track_id, matched_result())
            candidate = None if state == STATE_NO_MATCH else attempt.best_candidate_id
            repo.set_match(
                decision(track_id, attempt.id, state=state, candidate_id=candidate)
            )
        assert {m.state for m in repo.get_matches(track_ids).values()} == {
            STATE_NO_MATCH,
            STATE_NEEDS_REVIEW,
            STATE_ACCEPTED,
            STATE_REJECTED,
        }

    def test_a_candidate_from_an_older_attempt_can_be_chosen(self, repo, track_ids):
        older = store(repo, track_ids[0], matched_result())
        newer = store(repo, track_ids[0], matched_result())
        second_choice = repo.candidates_for(older.id)[2]
        written = repo.set_match(
            decision(
                track_ids[0],
                older.id,
                candidate_id=second_choice.id,
                decided_by=DECIDED_BY_USER,
                newer_attempt_id=newer.id,
            )
        )
        assert written.candidate_id == second_choice.id
        assert written.is_disputed

    def test_states_are_read_many_at_a_time(self, repo, track_ids, monkeypatch):
        monkeypatch.setattr(match_repository_module, "CHUNK_SIZE", 2)
        for track_id in track_ids[:3]:
            attempt = store(repo, track_id, rejected_result())
            repo.set_match(decision(track_id, attempt.id, state=STATE_NO_MATCH))

        found = repo.get_matches([track_ids[2], track_ids[0], track_ids[0], 99_999])
        assert sorted(found) == [track_ids[0], track_ids[2]]
        assert all(found[t].track_id == t for t in found)
        assert sorted(repo.get_matches(track_ids)) == track_ids[:3]

    def test_a_state_joins_the_callers_transaction(self, db, repo, track_ids):
        attempt = store(repo, track_ids[0], rejected_result())
        with pytest.raises(RuntimeError):
            with db.transaction():
                repo.set_match(decision(track_ids[0], attempt.id, state=STATE_NO_MATCH))
                raise RuntimeError("the caller's work failed")
        assert repo.get_match(track_ids[0]) is None


@pytest.mark.unit
class TestAStateRestsOnItsOwnEvidence:
    @pytest.fixture
    def two(self, repo, track_ids):
        mine = store(repo, track_ids[0], matched_result())
        theirs = store(repo, track_ids[1], matched_result())
        return mine, theirs

    def refused(self, repo, db, match: TrackMatch, message: str) -> None:
        before = [dict(r) for r in db.connect().execute("SELECT * FROM track_match")]
        with pytest.raises(ValueError, match=message):
            repo.set_match(match)
        after = [dict(r) for r in db.connect().execute("SELECT * FROM track_match")]
        assert after == before

    def test_another_tracks_attempt(self, db, repo, track_ids, two):
        _, theirs = two
        self.refused(
            repo,
            db,
            decision(track_ids[0], theirs.id, candidate_id=theirs.best_candidate_id),
            "not track",
        )

    def test_an_attempt_that_does_not_exist(self, db, repo, track_ids, two):
        self.refused(
            repo,
            db,
            decision(track_ids[0], 999, state=STATE_NO_MATCH),
            "does not exist",
        )

    def test_another_tracks_candidate(self, db, repo, track_ids, two):
        mine, theirs = two
        self.refused(
            repo,
            db,
            decision(track_ids[0], mine.id, candidate_id=theirs.best_candidate_id),
            "not attempt",
        )

    def test_a_candidate_from_another_of_the_tracks_attempts(
        self, db, repo, track_ids, two
    ):
        mine, _ = two
        later = store(repo, track_ids[0], matched_result())
        self.refused(
            repo,
            db,
            decision(track_ids[0], later.id, candidate_id=mine.best_candidate_id),
            "rests on the attempt its candidate came from",
        )

    def test_a_candidate_that_does_not_exist(self, db, repo, track_ids, two):
        mine, _ = two
        self.refused(
            repo,
            db,
            decision(track_ids[0], mine.id, candidate_id=999),
            "does not exist",
        )

    def test_another_tracks_newer_attempt(self, db, repo, track_ids, two):
        mine, theirs = two
        self.refused(
            repo,
            db,
            decision(
                track_ids[0],
                mine.id,
                candidate_id=mine.best_candidate_id,
                decided_by=DECIDED_BY_USER,
                newer_attempt_id=theirs.id,
            ),
            "not track",
        )

    def test_a_newer_attempt_that_is_older(self, db, repo, track_ids, two):
        mine, _ = two
        later = store(repo, track_ids[0], matched_result())
        self.refused(
            repo,
            db,
            decision(
                track_ids[0],
                later.id,
                candidate_id=later.best_candidate_id,
                decided_by=DECIDED_BY_USER,
                newer_attempt_id=mine.id,
            ),
            "older",
        )

    def test_a_newer_attempt_that_does_not_exist(self, db, repo, track_ids, two):
        mine, _ = two
        self.refused(
            repo,
            db,
            decision(
                track_ids[0],
                mine.id,
                candidate_id=mine.best_candidate_id,
                decided_by=DECIDED_BY_USER,
                newer_attempt_id=999,
            ),
            "does not exist",
        )

    def test_a_refused_state_leaves_the_existing_one_alone(
        self, db, repo, track_ids, two
    ):
        mine, theirs = two
        kept = repo.set_match(
            decision(track_ids[0], mine.id, candidate_id=mine.best_candidate_id)
        )
        self.refused(
            repo,
            db,
            decision(track_ids[0], theirs.id, candidate_id=theirs.best_candidate_id),
            "not track",
        )
        assert repo.get_match(track_ids[0]) == kept
