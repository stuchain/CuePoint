#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Match state as a filter, a count and a facet (CLEAN-04, DEC-072, DEC-075).

What lets "needs review" be a Smart Collection and a Health count is that match
state is an ordinary rule field, compiled, counted and faceted by the path every
other field uses. The tests are the ones every field gets, over a library that
holds every state at once:

- **Every value finds exactly its tracks**, including ``not_matched``, which has
  no row to find — it is the anti-join.
- **A facet's count is the count of applying that value as a rule**, so what a
  Health number says and what its click shows cannot disagree.
- **The join is written only when asked for**, and never multiplies a row, alone
  or beside CuePoint's metadata join.
"""

from __future__ import annotations

from typing import Dict, List, Set

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.filter_rule import (
    ARTWORK_ALIAS,
    FILES_ALIAS,
    MATCH_ALIAS,
    MATCH_CANDIDATE_ALIAS,
    METADATA_ALIAS,
    FIELDS,
    FilterRule,
    RuleSet,
    describe_fields,
    field_spec,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import (
    MATCH_STATES,
    STATE_NOT_MATCHED,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.filter_sql import required_joins, requires_metadata
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import (
    JOINS,
    BrowseQuery,
    BrowseQueryError,
    _joins,
    build_count,
    build_select,
)
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_state import FILTER_STATES, MatchStateService
from cuepoint.services.migration_runner import MigrationRunner

QUESTION = Track(title="A Title", artist="An Artist")

NAMES = (
    "never_a",
    "never_b",
    "no_match_a",
    "no_match_b",
    "review_a",
    "review_b",
    "auto_accepted",
    "user_accepted",
    "rejected_disputed",
    "rejected_nothing",
)


def candidate(beatport_id: str, score: float) -> BeatportCandidate:
    return BeatportCandidate(
        url=f"https://www.beatport.com/track/a-title/{beatport_id}",
        title="A Title",
        artists="An Artist",
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
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=False,
        release_year=None,
        release_name=None,
    )


def won(beatport_id: str, score: float) -> TrackResult:
    best = candidate(beatport_id, score)
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best, candidate("40" + beatport_id, 40.0)],
        match_score=score,
    )


def judged() -> TrackResult:
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=False,
        candidates=[candidate("3003", 30.0)],
    )


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
def library(db, tracks) -> Dict[str, int]:
    """Ten tracks holding every state, the flag, and a score each way."""
    tracks.add_many(
        [
            LibraryTrack(rekordbox_track_id=name, title=name, artist="A")
            for name in NAMES
        ]
    )
    ids = {
        row["title"]: int(row["id"])
        for row in db.connect().execute("SELECT id, title FROM tracks")
    }
    matches = MatchRepository(db)
    states = MatchStateService(
        matches, tracks, ActivityService(ActivityRepository(db), tracks), db
    )

    def rematch(name: str, result: TrackResult):
        return states.apply_attempt(
            matches.add_attempt(ids[name], "job", result, QUESTION)
        )

    rematch("no_match_a", judged())
    rematch("no_match_b", judged())
    rematch("review_a", won("11", 80.0))
    rematch("review_b", won("12", 81.0))
    rematch("auto_accepted", won("13", 97.0))

    user = matches.add_attempt(ids["user_accepted"], "job", won("14", 80.0), QUESTION)
    states.apply_attempt(user)
    runner_up = next(c for c in matches.candidates_for(int(user.id)) if not c.is_winner)
    states.accept(ids["user_accepted"], int(runner_up.id))  # a score of 40

    rematch("rejected_disputed", won("15", 82.0))
    states.reject(ids["rejected_disputed"])
    rematch("rejected_disputed", won("99", 99.0))  # disagrees: flagged

    rematch("rejected_nothing", judged())
    states.reject(ids["rejected_nothing"])
    return ids


def rules(*clauses) -> RuleSet:
    return RuleSet(rules=tuple(FilterRule(*clause) for clause in clauses))


def count(tracks, *clauses) -> int:
    return tracks.browse_count(BrowseQuery(rules=rules(*clauses)))


def named(tracks, library, *clauses) -> Set[str]:
    by_id = {track_id: name for name, track_id in library.items()}
    return {
        by_id[track_id]
        for track_id in tracks.browse_ids(BrowseQuery(rules=rules(*clauses)), limit=100)
    }


def facet_counts(tracks, field: str, *clauses) -> Dict[object, int]:
    facet = tracks.facet_values(BrowseQuery(rules=rules(*clauses)), field)
    return {value.value: value.count for value in facet.values}


# --------------------------------------------------------------- match_state


class TestMatchState:
    @pytest.mark.parametrize(
        "state, expected",
        [
            (STATE_NOT_MATCHED, {"never_a", "never_b"}),
            ("no_match", {"no_match_a", "no_match_b"}),
            ("needs_review", {"review_a", "review_b"}),
            ("accepted", {"auto_accepted", "user_accepted"}),
            ("rejected", {"rejected_disputed", "rejected_nothing"}),
        ],
    )
    def test_each_state_finds_exactly_its_tracks(
        self, tracks, library, state, expected
    ):
        assert named(tracks, library, ("match_state", "is", state)) == expected
        assert count(tracks, ("match_state", "is", state)) == len(expected)

    def test_not_matched_is_every_track_with_no_state_row(self, db, tracks, library):
        with_state = (
            db.connect().execute("SELECT count(*) FROM track_match").fetchone()[0]
        )
        assert count(tracks, ("match_state", "is", STATE_NOT_MATCHED)) == (
            len(NAMES) - with_state
        )

    def test_not_matched_follows_a_state_row_going(self, db, tracks, library):
        with db.transaction() as conn:
            conn.execute(
                "DELETE FROM track_match WHERE track_id = ?", (library["review_a"],)
            )
        assert named(tracks, library, ("match_state", "is", STATE_NOT_MATCHED)) == {
            "never_a",
            "never_b",
            "review_a",
        }

    def test_the_other_text_operators_work_on_it(self, tracks, library):
        assert count(tracks, ("match_state", "is_not", "needs_review")) == 8
        assert (
            count(tracks, ("match_state", "any_of", ["needs_review", "accepted"])) == 4
        )
        assert count(tracks, ("match_state", "is", "Needs_Review")) == 2
        assert count(tracks, ("match_state", "is_empty")) == 0

    def test_every_state_the_facet_offers_counts_what_its_rule_finds(
        self, tracks, library
    ):
        counts = facet_counts(tracks, "match_state")
        assert set(counts) == set(FILTER_STATES)
        for value, facet_count in counts.items():
            assert facet_count == count(tracks, ("match_state", "is", value)), value
        assert sum(counts.values()) == len(NAMES)

    def test_a_facet_leaves_its_own_rule_out(self, tracks, library):
        counts = facet_counts(tracks, "match_state", ("match_state", "is", "accepted"))
        assert set(counts) == set(FILTER_STATES)

    def test_a_facet_honours_the_other_rules(self, tracks, library):
        assert facet_counts(
            tracks, "match_state", ("match_decided_by", "is", "user")
        ) == {
            "accepted": 1,
            "rejected": 2,
        }


# ------------------------------------------------------ who, disputed, score


class TestDecidedBy:
    def test_users_automatic_and_nobody(self, tracks, library):
        assert count(tracks, ("match_decided_by", "is", "user")) == 3
        assert count(tracks, ("match_decided_by", "is", "auto")) == 5
        assert named(tracks, library, ("match_decided_by", "is_empty")) == {
            "never_a",
            "never_b",
        }

    def test_its_facet_counts_what_its_rules_find(self, tracks, library):
        counts = facet_counts(tracks, "match_decided_by")
        assert counts == {"auto": 5, "user": 3, None: 2}


class TestDisputed:
    def test_only_the_decision_a_newer_attempt_disagrees_with(self, tracks, library):
        assert named(tracks, library, ("match_disputed", "is", True)) == {
            "rejected_disputed"
        }
        assert count(tracks, ("match_disputed", "is", False)) == 9

    def test_its_facet_counts_what_its_rules_find(self, tracks, library):
        counts = facet_counts(tracks, "match_disputed")
        assert sorted(counts.values()) == [1, 9]


class TestScore:
    def test_it_is_the_decided_candidates_score_not_the_winners(self, tracks, library):
        # user_accepted's winner scored 80; the candidate the user chose, 40.
        assert named(tracks, library, ("match_score", "lt", 50)) == {"user_accepted"}
        assert named(tracks, library, ("match_score", "gte", 95)) == {"auto_accepted"}
        assert count(tracks, ("match_score", "between", [70, 90])) == 3

    def test_a_track_pointing_at_no_candidate_has_no_score(self, tracks, library):
        assert named(tracks, library, ("match_score", "is_empty")) == {
            "never_a",
            "never_b",
            "no_match_a",
            "no_match_b",
            "rejected_nothing",
        }

    def test_its_range_spans_the_decided_candidates(self, tracks, library):
        span = tracks.facet_range(BrowseQuery(), "match_score")
        assert (span.minimum, span.maximum, span.missing) == (40.0, 97.0, 5)


# ---------------------------------------------------------------- the joins


class TestTheJoins:
    def test_a_view_that_mentions_no_match_field_has_no_match_join(self):
        for sql, _ in (
            build_select(BrowseQuery(rules=rules(("genre", "is", "House")))),
            build_count(BrowseQuery(rules=rules(("rating", "gte", 3)))),
        ):
            assert "track_match" not in sql
            assert "match_candidates" not in sql

    def test_several_match_rules_join_once_and_the_candidate_after_the_state(self):
        sql, _ = build_count(
            BrowseQuery(
                rules=rules(
                    ("match_state", "is", "accepted"),
                    ("match_disputed", "is", False),
                    ("match_score", "gte", 90),
                    # The candidate is read for Beatport's artwork.
                    ("artwork", "is", "beatport"),
                )
            )
        )
        assert sql.count("JOIN track_match") == 1
        assert sql.count("JOIN match_candidates") == 1
        assert sql.index("JOIN track_match") < sql.index("JOIN match_candidates")

    def test_beside_the_metadata_join_nothing_is_multiplied(self, db, tracks, library):
        metadata = TrackMetadataRepository(db)
        metadata.set_rating(library["auto_accepted"], 5)
        metadata.set_rating(library["review_a"], 5)
        both = (("rating", "is", 5), ("match_state", "is", "accepted"))

        assert count(tracks, *both) == 1
        rows = tracks.browse(
            BrowseQuery(rules=rules(("match_state", "is_not_empty"))), 100
        )
        assert len(rows) == len({row.id for row in rows}) == len(NAMES)

    def test_each_join_a_rule_set_needs_is_named(self):
        # The score is kept on the state (migration 0019): no candidate read.
        assert required_joins(rules(("match_score", "gte", 1))) == {MATCH_ALIAS}
        assert MATCH_CANDIDATE_ALIAS in required_joins(
            rules(("artwork", "is", "beatport"))
        )
        assert required_joins(rules(("match_state", "is", "accepted"))) == {MATCH_ALIAS}
        assert requires_metadata(rules(("rating", "is", 1))) is True
        assert requires_metadata(rules(("match_state", "is", "accepted"))) is False

    def test_every_alias_a_field_names_is_a_registered_join(self):
        for spec in FIELDS:
            assert set(spec.joins) <= set(JOINS), spec.name
        assert list(JOINS) == [
            METADATA_ALIAS,
            MATCH_ALIAS,
            MATCH_CANDIDATE_ALIAS,
            FILES_ALIAS,
            ARTWORK_ALIAS,
        ]

    def test_an_alias_with_no_join_is_refused(self):
        with pytest.raises(BrowseQueryError, match="No join"):
            _joins(["nowhere"])


# ----------------------------------------------------------- the vocabulary


class TestTheVocabulary:
    def test_the_four_fields_cross_the_wire(self):
        described = {entry["name"]: entry for entry in describe_fields()}
        expected: List[tuple] = [
            ("match_state", "text", True),
            ("match_decided_by", "text", True),
            ("match_disputed", "bool", True),
            ("match_score", "number", False),
        ]
        for name, kind, facetable in expected:
            assert (described[name]["type"], described[name]["facetable"]) == (
                kind,
                facetable,
            ), name

    def test_the_filter_states_are_the_stored_ones_and_not_matched(self):
        assert set(FILTER_STATES) == set(MATCH_STATES) | {STATE_NOT_MATCHED}
        assert STATE_NOT_MATCHED not in MATCH_STATES

    def test_match_state_reads_the_state_through_its_join(self):
        spec = field_spec("match_state")
        assert spec.joins == (MATCH_ALIAS,)
        assert STATE_NOT_MATCHED in spec.expression
        assert spec.metadata is False
