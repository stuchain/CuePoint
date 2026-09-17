#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What the Library's Clean columns read and how they sort (CLEAN-13).

CLEAN-13 draws match state, match score and file status as columns, and marks
a value CuePoint overrides with where it came from. Over one library holding
every state, a score each way, every file status and both override sources:

- **Each sorts by its meaning, not its spelling**: what needs a person first,
  every row once, and the same order reversed.
- **A score sorts as a number**, and a track with none sorts last either way.
- **A row reads the score its state points at**, as the filter does.
- **An override's source is the latest history row for it**, and only an
  override that is set now is answered.
- **A fixed-value field names its values**, and refuses a word it never holds.
"""

from __future__ import annotations

from typing import Dict, List

import pytest

from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    TrackFileStatus,
)
from cuepoint.models.filter_rule import (
    FIELDS,
    FilterRule,
    FilterRuleError,
    RuleSet,
    describe_fields,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import (
    SOURCE_BEATPORT,
    SOURCE_CUEPOINT,
    ActivityRepository,
)
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import (
    FILE_STATUS_ORDER,
    MATCH_STATE_ORDER,
    SORTABLE_COLUMNS,
    BrowseQuery,
)
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.persistence.test_match_filters import QUESTION, judged, won

NOON = "2026-09-14T12:00:00+00:00"

#: The sorts this module covers, which ``test_track_browse`` counts as tested.
CLEAN_SORTS = ("match_state", "match_score", "file_status")

#: Name → (match state it reaches, file status, score of what the state points at).
LIBRARY = {
    "review": ("needs_review", FILE_MISSING, 81.0),
    "nothing": ("no_match", FILE_UNREADABLE, None),
    "refused": ("rejected", FILE_PRESENT, 82.0),
    "taken": ("accepted", None, 97.0),
    "untouched": ("not_matched", FILE_PRESENT, None),
}


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
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=name,
                title=name,
                artist="A",
                file_path=f"/m/{name}.mp3",
            )
            for name in LIBRARY
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

    def attempt(name, result):
        return states.apply_attempt(
            matches.add_attempt(ids[name], "job", result, QUESTION)
        )

    attempt("review", won("11", 81.0))
    attempt("nothing", judged())
    attempt("refused", won("12", 82.0))
    states.reject(ids["refused"])
    attempt("taken", won("13", 97.0))

    FileStatusRepository(db).record(
        [
            TrackFileStatus(ids[name], status, f"/m/{name}.mp3", NOON)
            for name, (_, status, _) in LIBRARY.items()
            if status is not None
        ]
    )
    return ids


def names(rows, library) -> List[str]:
    by_id = {track_id: name for name, track_id in library.items()}
    return [by_id[int(row.id)] for row in rows]


def browse(tracks, sort, direction="asc"):
    return tracks.browse(BrowseQuery(sort=sort, direction=direction), limit=100)


@pytest.mark.unit
class TestSortingByMeaning:
    def test_the_sorts_exist(self):
        assert set(CLEAN_SORTS) <= set(SORTABLE_COLUMNS)

    def test_match_state_puts_what_needs_a_person_first(self, tracks, library):
        order = names(browse(tracks, "match_state"), library)
        assert [LIBRARY[name][0] for name in order] == list(MATCH_STATE_ORDER)

    def test_match_state_descending_is_the_reverse(self, tracks, library):
        order = names(browse(tracks, "match_state", "desc"), library)
        assert [LIBRARY[name][0] for name in order] == list(reversed(MATCH_STATE_ORDER))

    def test_file_status_puts_the_missing_first(self, tracks, library):
        order = [
            LIBRARY[name][1] or "not_checked"
            for name in names(browse(tracks, "file_status"), library)
        ]
        # Two present files, tied, fall back to artist and title.
        assert order == ["missing", "unreadable", "present", "present", "not_checked"]
        assert order == sorted(order, key=FILE_STATUS_ORDER.index)

    @pytest.mark.parametrize("direction", ["asc", "desc"])
    def test_a_score_sorts_as_a_number_and_none_last(self, tracks, library, direction):
        order = names(browse(tracks, "match_score", direction), library)
        scores = [LIBRARY[name][2] for name in order]
        present = [score for score in scores if score is not None]
        assert present == sorted(present, reverse=direction == "desc")
        assert scores[len(present) :] == [None] * (len(scores) - len(present))

    @pytest.mark.parametrize("sort", CLEAN_SORTS)
    def test_every_row_once(self, tracks, library, sort):
        assert sorted(names(browse(tracks, sort), library)) == sorted(LIBRARY)


@pytest.mark.unit
class TestTheRowReadsTheScore:
    def test_the_score_its_state_points_at(self, tracks, library):
        states = tracks.clean_states(library.values())
        for name, (state, _, score) in LIBRARY.items():
            assert states[library[name]].match_state == state
            assert states[library[name]].match_score == score, name


@pytest.fixture
def metadata(db, tracks) -> MetadataService:
    return MetadataService(
        TrackMetadataRepository(db),
        tracks,
        ActivityService(ActivityRepository(db), tracks),
        db,
    )


@pytest.mark.unit
class TestOverrideSources:
    def test_applied_and_typed_values_say_so(self, db, metadata, library):
        metadata.set_override(
            library["taken"], "genre", "Techno", source=SOURCE_BEATPORT
        )
        metadata.set_override(library["taken"], "bpm", 128, source=SOURCE_CUEPOINT)
        assert TrackMetadataRepository(db).override_sources(library.values()) == {
            library["taken"]: {"genre": SOURCE_BEATPORT, "bpm": SOURCE_CUEPOINT}
        }

    def test_the_latest_change_decides(self, db, metadata, library):
        metadata.set_override(
            library["taken"], "label", "Kompakt", source=SOURCE_BEATPORT
        )
        metadata.set_override(
            library["taken"], "label", "Cocoon", source=SOURCE_CUEPOINT
        )
        answer = TrackMetadataRepository(db).override_sources([library["taken"]])
        assert answer == {library["taken"]: {"label": SOURCE_CUEPOINT}}

    def test_a_cleared_override_says_nothing(self, db, metadata, library):
        metadata.set_override(library["taken"], "year", 2020, source=SOURCE_BEATPORT)
        metadata.set_override(library["taken"], "year", None, source=SOURCE_CUEPOINT)
        assert TrackMetadataRepository(db).override_sources([library["taken"]]) == {}

    def test_a_cleared_override_says_nothing_beside_one_that_is_set(
        self, db, metadata, library
    ):
        metadata.set_override(library["taken"], "year", 2020, source=SOURCE_BEATPORT)
        metadata.set_override(library["taken"], "key", "8A", source=SOURCE_CUEPOINT)
        metadata.set_override(library["taken"], "year", None, source=SOURCE_CUEPOINT)
        assert TrackMetadataRepository(db).override_sources([library["taken"]]) == {
            library["taken"]: {"key": SOURCE_CUEPOINT}
        }

    def test_a_rating_is_not_an_override(self, db, metadata, library):
        metadata.set_rating(library["taken"], 5)
        assert TrackMetadataRepository(db).override_sources([library["taken"]]) == {}

    def test_a_later_rating_leaves_an_overrides_source_alone(
        self, db, metadata, library
    ):
        metadata.set_override(library["taken"], "key", "8A", source=SOURCE_BEATPORT)
        metadata.set_rating(library["taken"], 5)
        assert TrackMetadataRepository(db).override_sources([library["taken"]]) == {
            library["taken"]: {"key": SOURCE_BEATPORT}
        }

    def test_nothing_asked_is_nothing_answered(self, db):
        assert TrackMetadataRepository(db).override_sources([]) == {}

    def test_past_one_chunk(self, db, tracks, metadata):
        tracks.add_many(
            [
                LibraryTrack(rekordbox_track_id=f"x{i}", title=f"x{i}", artist="A")
                for i in range(1100)
            ]
        )
        ids = [
            int(row["id"])
            for row in db.connect().execute("SELECT id FROM tracks ORDER BY id")
        ]
        # More overridden tracks than one chunk holds, so every chunk is asked.
        for track_id in ids:
            metadata.set_override(track_id, "genre", "House", source=SOURCE_BEATPORT)
        answer = TrackMetadataRepository(db).override_sources(ids)
        assert set(answer) == set(ids)
        assert answer[ids[-1]] == {"genre": SOURCE_BEATPORT}


@pytest.mark.unit
class TestChoices:
    CHOSEN = {
        "match_state": [
            "needs_review",
            "accepted",
            "rejected",
            "no_match",
            "not_matched",
        ],
        "match_decided_by": ["auto", "user"],
        "file_status": ["present", "missing", "unreadable", "not_checked"],
        "duplicate_signal": ["path", "beatport", "text"],
        "artwork": ["embedded", "beatport", "none", "unknown"],
    }

    def test_exactly_these_fields_name_their_values(self):
        described = {
            field["name"]: [choice["value"] for choice in field["choices"]]
            for field in describe_fields()
            if field["choices"] is not None
        }
        assert described == self.CHOSEN

    def test_every_field_says_whether_it_has_choices(self):
        assert all("choices" in field for field in describe_fields())
        assert len(describe_fields()) == len(FIELDS)

    def test_each_value_has_a_name(self):
        for field in describe_fields():
            for choice in field["choices"] or []:
                assert choice["label"].strip(), (field["name"], choice)

    @pytest.mark.parametrize("operator", ["is", "is_not"])
    def test_a_word_it_never_holds_is_refused(self, operator):
        with pytest.raises(FilterRuleError, match="needs_review"):
            FilterRule("match_state", operator, "needs revew").validated()

    def test_any_of_refuses_one_bad_word(self):
        with pytest.raises(FilterRuleError, match="File status"):
            FilterRule("file_status", "any_of", ["missing", "gone"]).validated()

    def test_case_is_forgiven_and_the_word_kept(self):
        rule = FilterRule("duplicate_signal", "any_of", ["PATH", " Text "]).validated()
        assert rule.value == ("path", "text")

    def test_a_partial_match_is_still_a_question(self):
        # "contains" asks about part of a word, so no whole word is required.
        assert FilterRule("match_state", "contains", "review").validated().value == (
            "review"
        )

    def test_the_rules_health_counts_with_are_valid(self):
        RuleSet(
            rules=(
                FilterRule("match_state", "is", "needs_review"),
                FilterRule("file_status", "any_of", ["missing", "unreadable"]),
            )
        ).validated()
