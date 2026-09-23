#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0019: a match state keeps its candidate's score (CLEAN-14).

The column is filled for every existing state and kept by every later write,
so sorting and filtering by match score read no candidate and answer what the
candidate says.
"""

from __future__ import annotations

from typing import List

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import (
    DECIDED_BY_AUTO,
    DECIDED_BY_USER,
    STATE_ACCEPTED,
    STATE_NEEDS_REVIEW,
    STATE_REJECTED,
    TrackMatch,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures import legacy_rows

NOW = "2026-09-17T12:00:00+00:00"


def _runner(service, through: int) -> MigrationRunner:
    return MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= through]
    )


def candidate(index: int, score: float) -> BeatportCandidate:
    return BeatportCandidate(
        url=f"https://www.beatport.com/track/t/{index}",
        title="T",
        artists="A",
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
        score=score,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=index,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=index == 0,
        release_year=None,
        release_name=None,
    )


def library(service) -> List[int]:
    return sorted(
        legacy_rows.add_tracks(
            service,
            [
                LibraryTrack(
                    rekordbox_track_id=str(n),
                    file_path=f"/m/{n}.mp3",
                    title=f"T{n}",
                    artist="A",
                )
                for n in range(3)
            ],
        )
    )


def attempt(repo: MatchRepository, track_id: int, *scores: float):
    found = [candidate(i, score) for i, score in enumerate(scores)]
    result = TrackResult(
        playlist_index=1,
        title="T",
        artist="A",
        matched=True,
        best_match=found[0],
        candidates=found,
        match_score=scores[0],
    )
    return repo.add_attempt(track_id, "job", result, Track(title="T", artist="A"))


def state(repo, track_id, stored, index=0, **fields) -> TrackMatch:
    """A state on ``stored``, pointing at its candidate at ``index`` (or none)."""
    candidates = [c.id for c in repo.candidates_for(stored.id)]
    fields.setdefault("state", STATE_ACCEPTED)
    fields.setdefault("decided_by", DECIDED_BY_AUTO)
    return TrackMatch(
        track_id=track_id,
        attempt_id=stored.id,
        candidate_id=None if index is None else candidates[index],
        decided_at=NOW,
        **fields,
    )


@pytest.fixture
def old(tmp_path):
    """A version 18 library with a state on each of two tracks."""
    service = DatabaseService(db_path=tmp_path / "v18.db")
    _runner(service, 18).migrate()
    ids = library(service)
    repo = MatchRepository(service)
    for track_id, scores in zip(ids, ((97.0, 60.0), (88.0, 70.0))):
        stored = attempt(repo, track_id, *scores)
        chosen = [c.id for c in repo.candidates_for(stored.id)][
            -1 if track_id == ids[1] else 0
        ]
        with service.transaction() as conn:
            conn.execute(
                "INSERT INTO track_match (track_id, state, decided_by, attempt_id,"
                " candidate_id, decided_at) VALUES (?, ?, ?, ?, ?, ?)",
                (track_id, STATE_ACCEPTED, DECIDED_BY_USER, stored.id, chosen, NOW),
            )
    yield service, ids
    service.close_all()


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "now.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


class TestUpgradingAVersionEighteenLibrary:
    def test_it_applies_alone(self, old):
        service, _ids = old
        assert [m.version for m in _runner(service, 19).migrate()] == [19]

    def test_every_state_gets_the_score_of_the_candidate_it_points_at(self, old):
        service, ids = old
        _runner(service, 19).migrate()
        matches = MatchRepository(service).get_matches(ids)
        # The first accepted its winner; the second a reviewer's second choice.
        assert matches[ids[0]].candidate_score == 97.0
        assert matches[ids[1]].candidate_score == 70.0
        assert ids[2] not in matches


class TestKeptOnEveryWrite:
    def test_a_written_state_carries_its_candidates_score(self, db):
        ids = library(db)
        repo = MatchRepository(db)
        stored = attempt(repo, ids[0], 91.5, 80.0)

        written = repo.set_match(
            state(repo, ids[0], stored, 0, state=STATE_NEEDS_REVIEW)
        )
        assert written.candidate_score == 91.5

        again = repo.set_match(
            state(repo, ids[0], stored, 1, decided_by=DECIDED_BY_USER)
        )
        assert again.candidate_score == 80.0
        assert repo.get_match(ids[0]).candidate_score == 80.0

    def test_a_state_without_a_candidate_has_no_score(self, db):
        ids = library(db)
        repo = MatchRepository(db)
        stored = attempt(repo, ids[0], 91.5)
        repo.set_match(state(repo, ids[0], stored, 0))

        rejected = repo.set_match(
            state(
                repo,
                ids[0],
                stored,
                None,
                state=STATE_REJECTED,
                decided_by=DECIDED_BY_USER,
            )
        )
        assert rejected.candidate_score is None

    def test_a_score_given_by_a_caller_is_not_stored(self, db):
        ids = library(db)
        repo = MatchRepository(db)
        stored = attempt(repo, ids[0], 91.5)
        written = repo.set_match(state(repo, ids[0], stored, 0, candidate_score=5.0))
        assert written.candidate_score == 91.5

    def test_it_is_not_part_of_a_states_identity(self):
        base = dict(
            track_id=1,
            state=STATE_ACCEPTED,
            decided_by=DECIDED_BY_AUTO,
            attempt_id=1,
            candidate_id=2,
            decided_at=NOW,
        )
        assert TrackMatch(**base) == TrackMatch(**base, candidate_score=97.0)

    def test_the_library_sorts_and_filters_by_it(self, db):
        ids = library(db)
        repo = MatchRepository(db)
        for track_id, score in zip(ids, (82.0, 99.0)):
            stored = attempt(repo, track_id, score)
            repo.set_match(state(repo, track_id, stored, 0))
        tracks = TrackRepository(db)

        order = [t.id for t in tracks.browse(BrowseQuery(sort="match_score"), 10)]
        assert order == [ids[0], ids[1], ids[2]]
        high = RuleSet(rules=(FilterRule("match_score", "gte", 90),))
        assert [t.id for t in tracks.browse(BrowseQuery(rules=high), 10)] == [ids[1]]
