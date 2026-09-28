#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What fits at a point in a Set, over a real library (PREP-04, DEC-105).

Through the real repositories and migrations:

- **The gap is two entries.** Adjacent in that order, or at an end; anything
  else is refused as stale, and an empty Set or a gap with no neighbour is
  refused with its own reason.
- **Both sides are fitted**, each side's reasons kept apart and written as
  Similar Tracks writes them; ``against`` fits one side, which is how each
  side's own list is offered when the gap cannot be bridged.
- **No fit**: neighbours too far apart in tempo give an empty answer that says
  by how much, and how their keys relate. The gate is never loosened.
- **The chapter's BPM range** narrows the pool, and the answer says so.
- **The neighbours and their duplicates** are left out; any other track in the
  Set is kept and says how many times it is there.
- **The pool** restricts as a browse does, and a broken one is refused.
- **Every candidate is scored in Python**: over generated libraries the answer
  is exactly ``rank_fits`` over every track, read from the tracks' own
  columns, independently of the SQL.
- Nothing is written.
"""

from __future__ import annotations

import random
from typing import Dict, List, Optional, Tuple

import pytest

from cuepoint.core.entity_names import name_key, split_credit
from cuepoint.core.similarity import (
    REASONS,
    MusicalKey,
    Traits,
    fit_tempo_ranges,
    rank_fits,
)
from cuepoint.models.collection import KIND_COLLECTION, KIND_SET, Collection
from cuepoint.models.duplicate_group import SIGNAL_TEXT, ScannedGroup
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST, RekordboxPlaylist
from cuepoint.models.set_suggestions import SetSuggestions
from cuepoint.models.similar_tracks import MAX_SIMILAR_LIMIT
from cuepoint.models.tag import Tag
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.duplicate_repository import DuplicateRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.rule_references import BrokenRuleError
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.persistence.similarity_repository import SimilarityRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery, BrowseQueryError
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.override_values import parse_key
from cuepoint.services.set_service import SetService
from cuepoint.services.set_suggestion_service import (
    EMPTY_SET,
    NO_NEIGHBOUR,
    STALE,
    InsertionPointError,
    SetSuggestionService,
)

pytestmark = pytest.mark.unit

NOW = "2026-09-28T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


class Library:
    """Tracks, a Set and the services, over one database."""

    def __init__(self, db) -> None:
        self.db = db
        self.tracks = TrackRepository(db)
        self.meta = TrackMetadataRepository(db)
        self.credits = TrackCreditRepository(db)
        self.collections = CollectionRepository(db)
        self.sets = SetService(self.collections, SetRepository(db), db)
        self.service = SetSuggestionService(
            self.collections,
            SetRepository(db),
            SimilarityRepository(db),
            self.credits,
            self.tracks,
        )
        self.count = 0

    def add(
        self,
        artist: str = "Someone",
        *,
        bpm: Optional[float] = None,
        key: Optional[str] = None,
        genre: Optional[str] = None,
        label: Optional[str] = None,
        remixer: Optional[str] = None,
    ) -> int:
        self.count += 1
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=str(self.count),
                file_path=f"/m/{self.count}.mp3",
                title=f"T{self.count}",
                artist=artist,
                remixer=remixer,
                bpm=bpm,
                key=key,
                genre=genre,
                label=label,
            )
        )
        assert stored.id is not None
        return stored.id

    def make_set(
        self, track_ids: List[int], name: str = "Friday"
    ) -> Tuple[int, List[int]]:
        """A Set holding these tracks in order; returns it and its entry ids."""
        set_id = int(self.collections.create(Collection(name=name, kind=KIND_SET)).id)
        if track_ids:
            self.collections.append(set_id, track_ids)
        return set_id, [int(e.id) for e in self.collections.entries(set_id)]

    def entries(self, set_id: int) -> List[int]:
        return [int(e.id) for e in self.collections.entries(set_id)]


@pytest.fixture
def lib(db) -> Library:
    return Library(db)


def ids(result: SetSuggestions) -> List[int]:
    return [s.track_id for s in result.suggestions]


# --------------------------------------------------------------- the answer


class TestTheAnswer:
    def test_both_sides_with_their_own_reasons(self, lib):
        before = lib.add("A", bpm=124.0, key="8A", genre="Deep House")
        after = lib.add("B", bpm=126.0, key="9A", genre="Deep House")
        both = lib.add("C", bpm=125.0, key="8A", genre="Deep House")
        tempo_only = lib.add("D", bpm=125.0, key="3B", genre="Techno")
        lib.add("E", bpm=140.0, key="8A", genre="Deep House")  # outside both
        set_id, entries = lib.make_set([before, after])
        result = lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[1]
        )
        assert ids(result) == [both, tempo_only]
        top = result.suggestions[0]
        assert top.before is not None and top.after is not None
        assert [r["detail"] for r in top.before.reasons] == ["close", "same", "same"]
        assert [r["detail"] for r in top.after.reasons] == ["close", "adjacent", "same"]
        assert (
            top.after.reasons[1]["from"] == "9A" and top.after.reasons[1]["to"] == "8A"
        )
        assert top.score == round((top.before.score + top.after.score) / 2, 1)
        assert result.sides == ("before", "after")
        assert result.no_fit is None and result.bpm_range is None
        # The 140 BPM track is outside both windows, so the SQL never reads it.
        assert result.considered == 2
        assert result.notation == "camelot"

    def test_the_answer_on_the_wire(self, lib):
        before = lib.add("A", bpm=124.0, key="8A")
        after = lib.add("B", bpm=126.0, key="9A")
        lib.add("C", bpm=125.0, key="8A")
        set_id, entries = lib.make_set([before, after])
        wire = lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[1]
        ).to_dict()
        assert set(wire) == {
            "set_id",
            "before_entry_id",
            "after_entry_id",
            "sides",
            "chapter_id",
            "bpm_range",
            "notation",
            "unused",
            "considered",
            "duplicates_excluded",
            "index_current",
            "no_fit",
            "suggestions",
        }
        assert wire["before_entry_id"] == entries[0]
        assert wire["unused"] == {
            "before": ["genre", "label"],
            "after": ["genre", "label"],
        }
        [suggestion] = wire["suggestions"]
        assert set(suggestion) == {"track_id", "score", "in_set", "before", "after"}
        assert set(suggestion["before"]) == {"score", "reasons"}
        for side in ("before", "after"):
            for reason in suggestion[side]["reasons"]:
                assert (reason["component"], reason["detail"]) in REASONS

    def test_the_same_gap_gives_the_same_list_twice(self, lib):
        before = lib.add("A", bpm=124.0, key="8A")
        after = lib.add("B", bpm=126.0, key="9A")
        for bpm in (123.0, 124.0, 125.0, 126.0, 125.0, 124.5):
            lib.add("C", bpm=bpm, key="8A")
        set_id, entries = lib.make_set([before, after])
        ask = dict(before_entry_id=entries[0], after_entry_id=entries[1])
        first = lib.service.suggest(set_id, **ask)
        assert lib.service.suggest(set_id, **ask) == first
        scores = [s.score for s in first.suggestions]
        assert scores == sorted(scores, reverse=True)

    def test_ties_break_by_track_id(self, lib):
        before = lib.add("A", bpm=124.0)
        after = lib.add("B", bpm=124.0)
        twins = [lib.add("C", bpm=124.0) for _ in range(4)]
        set_id, entries = lib.make_set([before, after])
        result = lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[1]
        )
        assert ids(result) == twins

    def test_the_limit(self, lib):
        before = lib.add("A", bpm=124.0)
        for _ in range(8):
            lib.add("C", bpm=124.0)
        set_id, entries = lib.make_set([before])
        assert (
            len(
                lib.service.suggest(
                    set_id, before_entry_id=entries[0], limit=3
                ).suggestions
            )
            == 3
        )

    @pytest.mark.parametrize("limit", [0, MAX_SIMILAR_LIMIT + 1, 1.5, True, "5"])
    def test_a_limit_that_is_not_one(self, lib, limit):
        set_id, entries = lib.make_set([lib.add("A", bpm=124.0)])
        with pytest.raises(ValueError, match="limit"):
            lib.service.suggest(set_id, before_entry_id=entries[0], limit=limit)


# ----------------------------------------------------------------- the ends


class TestTheEnds:
    def test_at_the_end_the_track_before_is_the_only_side(self, lib):
        first = lib.add("A", bpm=124.0)
        last = lib.add("B", bpm=128.0, key="8A")
        near_last = lib.add("C", bpm=128.0, key="8A")
        near_first = lib.add("D", bpm=118.0)  # within 6% of 124 only
        set_id, entries = lib.make_set([first, last])
        result = lib.service.suggest(set_id, before_entry_id=entries[1])
        assert result.sides == ("before",)
        assert result.after_entry_id is None
        assert near_last in ids(result) and near_first not in ids(result)
        top = result.suggestions[0]
        assert top.after is None and top.before is not None
        assert set(result.unused) == {"before"}

    def test_at_the_start_the_track_after_is_the_only_side(self, lib):
        first = lib.add("A", bpm=124.0, key="8A")
        lib.add("B", bpm=128.0)
        fits = lib.add("C", bpm=124.0, key="8A")
        set_id, entries = lib.make_set([first, lib.count - 1])
        result = lib.service.suggest(set_id, after_entry_id=entries[0])
        assert result.sides == ("after",)
        assert ids(result)[0] == fits
        assert result.suggestions[0].before is None

    def test_one_side_is_similar_tracks_for_that_neighbour(self, lib, db):
        from cuepoint.services.similarity_service import SimilarityService

        rnd = random.Random(7)
        for _ in range(60):
            lib.add(
                rnd.choice(["A", "B", "C"]),
                bpm=rnd.choice([None, 122.0, 124.0, 126.0, 62.0]),
                key=rnd.choice([None, "8A", "9A", "3B"]),
                genre=rnd.choice([None, "House", "Techno"]),
            )
        seed = 5
        set_id, entries = lib.make_set([seed])
        mine = lib.service.suggest(set_id, before_entry_id=entries[0], limit=200)
        theirs = SimilarityService(
            SimilarityRepository(db), lib.credits, lib.tracks
        ).similar(seed, limit=200)
        assert [(s.track_id, s.score) for s in mine.suggestions] == [
            (s.track_id, s.score) for s in theirs.suggestions
        ]
        assert [s.before.reasons for s in mine.suggestions] == [
            s.reasons for s in theirs.suggestions
        ]


# ---------------------------------------------------------------- refusals


class TestTheInsertionPoint:
    @pytest.fixture
    def three(self, lib):
        tracks = [
            lib.add("A", bpm=124.0),
            lib.add("B", bpm=125.0),
            lib.add("C", bpm=126.0),
        ]
        set_id, entries = lib.make_set(tracks)
        return set_id, entries

    def refused(self, lib, set_id, reason, **ask):
        with pytest.raises(InsertionPointError) as caught:
            lib.service.suggest(set_id, **ask)
        assert caught.value.reason == reason
        assert isinstance(caught.value, ValueError)
        return str(caught.value)

    def test_an_empty_set(self, lib):
        set_id, _ = lib.make_set([])
        message = self.refused(lib, set_id, EMPTY_SET)
        assert "'Friday' is empty" in message

    def test_no_neighbour_named(self, lib, three):
        set_id, _ = three
        assert "Name the entry" in self.refused(lib, set_id, NO_NEIGHBOUR)

    @pytest.mark.parametrize(
        "ask",
        [
            {"before": 0, "after": 2},  # not adjacent
            {"before": 1, "after": 0},  # the wrong way round
            {"before": 1, "after": 1},
            {"before": 0},  # not the last
            {"after": 1},  # not the first
            {"before": 99},  # not in the Set
            {"after": 99},
        ],
    )
    def test_a_gap_that_is_not_one_is_stale(self, lib, three, ask):
        set_id, entries = three
        entries = entries + [999_999]
        named = {
            f"{side}_entry_id": entries[min(index, 3)] for side, index in ask.items()
        }
        assert "has changed since this gap was chosen" in self.refused(
            lib, set_id, STALE, **named
        )

    def test_a_gap_goes_stale_when_the_set_changes(self, lib, three):
        set_id, entries = three
        ask = dict(before_entry_id=entries[0], after_entry_id=entries[1])
        lib.service.suggest(set_id, **ask)
        lib.sets.move_entry(entries[1], 2)
        self.refused(lib, set_id, STALE, **ask)
        lib.collections.remove_entries([entries[1]])
        self.refused(
            lib, set_id, STALE, before_entry_id=entries[0], after_entry_id=entries[1]
        )
        lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[2]
        )

    def test_another_sets_entry_is_stale(self, lib, three):
        set_id, _ = three
        _, others = lib.make_set([lib.add("Z", bpm=124.0)], name="Saturday")
        self.refused(lib, set_id, STALE, before_entry_id=others[0])

    def test_not_a_set(self, lib):
        crate = int(
            lib.collections.create(Collection(name="Crate", kind=KIND_COLLECTION)).id
        )
        lib.collections.add(crate, [lib.add("A", bpm=124.0)])
        with pytest.raises(ValueError, match="'Crate' is a collection, not a Set"):
            lib.service.suggest(crate, before_entry_id=1)
        with pytest.raises(ValueError, match="No such Set"):
            lib.service.suggest(999_999, before_entry_id=1)

    @pytest.mark.parametrize("value", [0, -1, 1.5, True, "1"])
    def test_an_entry_id_that_is_not_one(self, lib, three, value):
        set_id, _ = three
        with pytest.raises(ValueError, match="before_entry_id must be an entry id"):
            lib.service.suggest(set_id, before_entry_id=value)

    def test_against(self, lib, three):
        set_id, entries = three
        with pytest.raises(ValueError, match="against must be one of"):
            lib.service.suggest(set_id, before_entry_id=entries[2], against="both")
        with pytest.raises(ValueError, match="no entry after this gap"):
            lib.service.suggest(set_id, before_entry_id=entries[2], against="after")
        with pytest.raises(ValueError, match="no entry before this gap"):
            lib.service.suggest(set_id, after_entry_id=entries[0], against="before")


# ------------------------------------------------------------------ no fit


class TestNoFit:
    def gap(
        self, lib, before_bpm=120.0, after_bpm=140.0, before_key="8A", after_key="9A"
    ):
        before = lib.add("A", bpm=before_bpm, key=before_key)
        after = lib.add("B", bpm=after_bpm, key=after_key)
        near_before = lib.add("C", bpm=before_bpm + 1)
        near_after = lib.add("D", bpm=after_bpm - 1)
        set_id, entries = lib.make_set([before, after])
        return set_id, entries, near_before, near_after

    def test_it_says_how_wide_the_gap_is_and_how_the_keys_relate(self, lib):
        set_id, entries, _, _ = self.gap(lib)
        result = lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[1]
        )
        assert result.suggestions == () and result.considered == 0
        assert result.no_fit is not None
        assert result.to_dict()["no_fit"] == {
            "tempo": {"from": 120.0, "to": 140.0, "gap_percent": 16.7},
            "key": {"from": "8A", "to": "9A", "relation": "adjacent"},
        }

    def test_a_key_clash_and_an_unknown_key(self, lib):
        set_id, entries, _, _ = self.gap(lib, before_key="8A", after_key="3B")
        ask = dict(before_entry_id=entries[0], after_entry_id=entries[1])
        assert lib.service.suggest(set_id, **ask).to_dict()["no_fit"]["key"] == {
            "from": "8A",
            "to": "3B",
            "relation": None,
        }
        set_id, entries, _, _ = self.gap(lib, after_key=None)
        ask = dict(before_entry_id=entries[0], after_entry_id=entries[1])
        assert lib.service.suggest(set_id, **ask).to_dict()["no_fit"]["key"] is None

    def test_each_side_offers_its_own_list(self, lib):
        set_id, entries, near_before, near_after = self.gap(lib)
        ask = dict(before_entry_id=entries[0], after_entry_id=entries[1])
        own_before = lib.service.suggest(set_id, **ask, against="before")
        own_after = lib.service.suggest(set_id, **ask, against="after")
        assert own_before.no_fit is None and own_before.sides == ("before",)
        assert ids(own_before) == [near_before]
        assert ids(own_after) == [near_after]
        assert own_after.suggestions[0].before is None

    def test_half_time_is_not_a_gap(self, lib):
        before = lib.add("A", bpm=128.0)
        after = lib.add("B", bpm=64.0)
        middle = lib.add("C", bpm=128.0)
        set_id, entries = lib.make_set([before, after])
        result = lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[1]
        )
        assert result.no_fit is None and ids(result) == [middle]

    def test_a_neighbour_without_a_bpm_is_never_a_gap(self, lib):
        before = lib.add("A", bpm=120.0, key="8A")
        after = lib.add("B", key="8A")
        fits = lib.add("C", bpm=121.0, key="8A")
        set_id, entries = lib.make_set([before, after])
        result = lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[1]
        )
        assert result.no_fit is None and ids(result) == [fits]


# ----------------------------------------------------------------- chapters


class TestTheChapter:
    @pytest.fixture
    def chaptered(self, lib):
        """Warm-up (122, 123), Peak (127, 128), and candidates at 120-130."""
        tracks = [
            lib.add("W", bpm=122.0),
            lib.add("W", bpm=123.0),
            lib.add("P", bpm=127.0),
            lib.add("P", bpm=128.0),
        ]
        pool = {
            bpm: lib.add("X", bpm=bpm)
            for bpm in (120.0, 122.5, 124.0, 125.0, 126.0, 128.5, 130.0)
        }
        set_id, entries = lib.make_set(tracks)
        peak = lib.sets.split_chapter_at(entries[2], "Peak")
        warm = lib.collections.chapters(set_id)[0]
        return set_id, entries, int(warm.id), int(peak.id), pool

    def test_the_range_narrows_the_pool_and_the_answer_says_so(self, lib, chaptered):
        set_id, entries, warm, peak, pool = chaptered
        lib.sets.set_chapter_targets(peak, None, 126.0, 129.0)
        result = lib.service.suggest(
            set_id, before_entry_id=entries[2], after_entry_id=entries[3]
        )
        assert result.chapter_id == peak
        assert result.to_dict()["bpm_range"] == {
            "chapter_id": peak,
            "min": 126.0,
            "max": 129.0,
        }
        assert set(ids(result)) == {pool[126.0], pool[128.5]}

    def test_an_open_ended_range(self, lib, chaptered):
        set_id, entries, warm, peak, pool = chaptered
        lib.sets.set_chapter_targets(peak, None, 128.0, None)
        result = lib.service.suggest(set_id, before_entry_id=entries[3])
        assert set(ids(result)) == {pool[128.5], pool[130.0]}

    def test_without_a_range_nothing_is_narrowed(self, lib, chaptered):
        set_id, entries, warm, peak, pool = chaptered
        result = lib.service.suggest(set_id, before_entry_id=entries[3])
        assert result.bpm_range is None
        assert pool[124.0] in ids(result)

    def test_at_a_boundary_the_chapter_before_by_default(self, lib, chaptered):
        set_id, entries, warm, peak, pool = chaptered
        lib.sets.set_chapter_targets(warm, None, 120.0, 124.0)
        lib.sets.set_chapter_targets(peak, None, 126.0, 129.0)
        ask = dict(before_entry_id=entries[1], after_entry_id=entries[2])
        default = lib.service.suggest(set_id, **ask)
        assert default.chapter_id == warm
        # The Set's own first track (122 BPM) is kept, and marked.
        first_track = lib.collections.track_ids(set_id)[0]
        assert set(ids(default)) == {first_track, pool[120.0], pool[122.5], pool[124.0]}
        marked = {x.track_id: x.in_set for x in default.suggestions}
        assert marked[first_track] == 1
        named = lib.service.suggest(set_id, **ask, chapter_id=peak)
        assert named.chapter_id == peak
        last_track = lib.collections.track_ids(set_id)[3]  # 128 BPM, in the Set
        assert set(ids(named)) == {last_track, pool[126.0], pool[128.5]}

    def test_at_the_start_the_first_chapter(self, lib, chaptered):
        set_id, entries, warm, peak, pool = chaptered
        empty = lib.sets.create_chapter(set_id, "Intro", position=0)
        result = lib.service.suggest(set_id, after_entry_id=entries[0])
        assert result.chapter_id == int(empty.id)

    def test_a_chapter_that_does_not_reach_the_gap(self, lib, chaptered):
        set_id, entries, warm, peak, pool = chaptered
        with pytest.raises(ValueError, match="'Peak' does not reach this gap"):
            lib.service.suggest(
                set_id,
                before_entry_id=entries[0],
                after_entry_id=entries[1],
                chapter_id=peak,
            )
        other, _ = lib.make_set([lib.add("Z", bpm=124.0)], name="Saturday")
        foreign = int(lib.collections.chapters(other)[0].id)
        with pytest.raises(ValueError, match="not a chapter of 'Friday'"):
            lib.service.suggest(
                set_id,
                before_entry_id=entries[0],
                after_entry_id=entries[1],
                chapter_id=foreign,
            )

    def test_a_range_the_windows_miss_is_empty_and_not_a_gap(self, lib, chaptered):
        set_id, entries, warm, peak, pool = chaptered
        lib.sets.set_chapter_targets(peak, None, 150.0, 160.0)
        result = lib.service.suggest(
            set_id, before_entry_id=entries[2], after_entry_id=entries[3]
        )
        assert result.suggestions == () and result.no_fit is None
        assert result.considered == 0

    def test_a_range_drops_tracks_with_no_bpm_when_the_neighbours_have_none(self, lib):
        before = lib.add("A", key="8A", genre="House")
        after = lib.add("B", key="8A", genre="House")
        no_bpm = lib.add("C", key="8A", genre="House")
        in_range = lib.add("D", bpm=124.0, key="8A", genre="House")
        lib.add("E", bpm=140.0, key="8A", genre="House")
        set_id, entries = lib.make_set([before, after])
        ask = dict(before_entry_id=entries[0], after_entry_id=entries[1])
        assert no_bpm in ids(lib.service.suggest(set_id, **ask))
        chapter = int(lib.collections.chapters(set_id)[0].id)
        lib.sets.set_chapter_targets(chapter, None, 120.0, 130.0)
        assert ids(lib.service.suggest(set_id, **ask)) == [in_range]


# ------------------------------------------------------ exclusions, the Set


class TestWhatIsLeftOut:
    def test_the_neighbours_and_their_duplicates_are_left_out(self, lib, db):
        before = lib.add("A", bpm=124.0)
        after = lib.add("B", bpm=124.0)
        copy_of_before = lib.add("A", bpm=124.0)
        copy_of_after = lib.add("B", bpm=124.0)
        other = lib.add("C", bpm=124.0)
        repo = DuplicateRepository(db)
        with db.transaction():
            repo.replace_signal(
                SIGNAL_TEXT,
                [
                    ScannedGroup(SIGNAL_TEXT, "a|t", (before, copy_of_before)),
                    ScannedGroup(SIGNAL_TEXT, "b|t", (after, copy_of_after)),
                ],
                NOW,
            )
        set_id, entries = lib.make_set([before, after])
        result = lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[1]
        )
        assert ids(result) == [other]
        assert result.duplicates_excluded == 2

    def test_other_tracks_in_the_set_are_kept_and_counted(self, lib):
        before = lib.add("A", bpm=124.0)
        after = lib.add("B", bpm=124.0)
        twice = lib.add("C", bpm=124.0)
        fresh = lib.add("D", bpm=124.0)
        set_id, entries = lib.make_set([twice, before, after, twice])
        result = lib.service.suggest(
            set_id, before_entry_id=entries[1], after_entry_id=entries[2]
        )
        marks = {s.track_id: s.in_set for s in result.suggestions}
        assert marks == {twice: 2, fresh: 0}

    def test_a_neighbour_repeated_elsewhere_is_still_left_out(self, lib):
        before = lib.add("A", bpm=124.0)
        after = lib.add("B", bpm=124.0)
        set_id, entries = lib.make_set([before, after, before])
        result = lib.service.suggest(
            set_id, before_entry_id=entries[0], after_entry_id=entries[1]
        )
        assert before not in ids(result) and after not in ids(result)


# -------------------------------------------------------------------- pools


class TestThePool:
    def test_a_collection(self, lib):
        before = lib.add("A", bpm=124.0)
        inside = lib.add("B", bpm=124.0)
        lib.add("C", bpm=124.0)
        crate = int(
            lib.collections.create(Collection(name="Crate", kind=KIND_COLLECTION)).id
        )
        lib.collections.add(crate, [inside])
        set_id, entries = lib.make_set([before])
        result = lib.service.suggest(
            set_id, before_entry_id=entries[0], pool=BrowseQuery(collection_id=crate)
        )
        assert ids(result) == [inside] and result.considered == 1

    def test_a_playlist(self, lib, db):
        before = lib.add("A", bpm=124.0)
        lib.add("B", bpm=124.0)
        third = lib.add("C", bpm=124.0)
        playlists = PlaylistRepository(db)
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="warmup",
                    kind=KIND_PLAYLIST,
                    depth=0,
                    position=0,
                    rekordbox_path="warmup",
                    track_refs=["3"],
                )
            ]
        )
        set_id, entries = lib.make_set([before])
        pool = BrowseQuery(playlist_id=playlists.list_all()[0].id)
        assert ids(
            lib.service.suggest(set_id, before_entry_id=entries[0], pool=pool)
        ) == [third]

    def test_rules(self, lib):
        before = lib.add("A", bpm=124.0)
        house = lib.add("B", bpm=124.0, genre="House")
        lib.add("C", bpm=124.0, genre="Techno")
        set_id, entries = lib.make_set([before])
        pool = BrowseQuery(rules=RuleSet(rules=(FilterRule("genre", "is", "House"),)))
        assert ids(
            lib.service.suggest(set_id, before_entry_id=entries[0], pool=pool)
        ) == [house]

    def test_a_broken_pool_is_refused_even_when_nothing_could_fit(self, lib, db):
        tags = TagRepository(db)
        tag = tags.create(Tag(name="gone"))
        tags.delete(tag.id)
        broken = BrowseQuery(
            rules=RuleSet(rules=(FilterRule("tag", "any_of", [tag.id]),))
        )
        set_id, entries = lib.make_set(
            [lib.add("A", bpm=120.0), lib.add("B", bpm=140.0)]
        )
        ask = dict(before_entry_id=entries[0], after_entry_id=entries[1])
        with pytest.raises(BrokenRuleError):
            lib.service.suggest(set_id, **ask, pool=broken)
        with pytest.raises(BrowseQueryError):
            lib.service.suggest(set_id, **ask, pool=BrowseQuery(collection_id="many"))


# ------------------------------------------------------------ read only


def test_nothing_is_written(lib, db):
    before = lib.add("A", bpm=124.0, key="8A")
    after = lib.add("B", bpm=140.0)
    lib.add("C", bpm=125.0)
    set_id, entries = lib.make_set([before, after])

    def everything():
        conn = db.connect()
        tables = [
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
                " AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        return {
            name: conn.execute(f"SELECT * FROM {name}").fetchall() for name in tables
        }

    before_state = {k: [tuple(r) for r in v] for k, v in everything().items()}
    lib.service.suggest(set_id, before_entry_id=entries[0], after_entry_id=entries[1])
    lib.service.suggest(
        set_id, before_entry_id=entries[0], after_entry_id=entries[1], against="before"
    )
    lib.service.suggest(set_id, before_entry_id=entries[1])
    assert {k: [tuple(r) for r in v] for k, v in everything().items()} == before_state


# ------------------------------------------------ against scoring every track


def every_track(lib: Library) -> Dict[int, Traits]:
    """Each track's traits from its own columns, without the service's SQL."""
    rows = lib.db.connect().execute("SELECT * FROM tracks").fetchall()
    overrides = lib.meta.get_many([row["id"] for row in rows])
    traits: Dict[int, Traits] = {}
    for row in rows:
        meta = overrides.get(row["id"])

        def value(field: str, row=row, meta=meta):
            own = getattr(meta, field, None) if meta is not None else None
            return own if own is not None else row[field]

        parsed = parse_key(value("key")) if value("key") else None
        genre, label = value("genre"), value("label")
        traits[row["id"]] = Traits(
            bpm=value("bpm"),
            key=MusicalKey(*parsed) if parsed else None,
            genre_key=name_key(genre) if genre and genre.strip() else None,
            label_key=name_key(label) if label and label.strip() else None,
            artist_keys=frozenset(
                name_key(name)
                for credit in (row["artist"], row["remixer"])
                if credit
                for name in split_credit(credit)
            ),
        )
    return traits


class TestAgainstScoringEveryTrack:
    @pytest.mark.parametrize("seed_of_library", [1, 2, 3])
    def test_the_service_answers_what_scoring_every_track_answers(
        self, lib, seed_of_library
    ):
        rnd = random.Random(seed_of_library)
        names = ["Âme", "AME", "Dixon", "Kerri Chandler", "Bob"]
        for _ in range(220):
            track = lib.add(
                ", ".join(rnd.sample(names, rnd.randrange(1, 3))),
                bpm=rnd.choice(
                    [None, 62.0, 64.0, 118.0, 122.5, 124.0, 126.0, 128.0, 131.0, 140.0]
                ),
                key=rnd.choice(
                    ["8A", "Am", "9A", "Em", "8B", "C", "1A", "12A", "x", None]
                ),
                genre=rnd.choice(["Deep House", "deep-house", "Techno", None]),
                label=rnd.choice(["Innervisions", "INNERVISIONS", "Nite", None]),
                remixer=rnd.choice([None, None, rnd.choice(names)]),
            )
            if rnd.random() < 0.15:
                lib.meta.set_override(track, "bpm", rnd.choice([124.0, 64.0, 90.0]))
            if rnd.random() < 0.1:
                lib.meta.set_override(track, "key", rnd.choice(["8A", "3B"]))
        order = rnd.sample(range(1, 221), 30)
        order[5] = order[3]  # a repeat, kept and counted
        set_id, entries = lib.make_set(order)
        lib.sets.split_chapter_at(entries[10], "Peak")
        peak = int(lib.collections.chapters(set_id)[1].id)
        lib.sets.set_chapter_targets(peak, None, 120.0, 130.0)
        traits = every_track(lib)

        for index in range(-1, len(entries)):
            before = entries[index] if index >= 0 else None
            after = entries[index + 1] if index + 1 < len(entries) else None
            for against in (None, "before", "after"):
                if (against == "before" and before is None) or (
                    against == "after" and after is None
                ):
                    continue
                result = lib.service.suggest(
                    set_id,
                    before_entry_id=before,
                    after_entry_id=after,
                    against=against,
                    limit=MAX_SIMILAR_LIMIT,
                )
                track_of = dict(zip(entries, order))
                first = (
                    traits[track_of[before]]
                    if before and against in (None, "before")
                    else None
                )
                second = (
                    traits[track_of[after]]
                    if after and against in (None, "after")
                    else None
                )
                neighbours = {track_of[e] for e in (before, after) if e is not None}
                # A gap is in the chapter of the entry before it (PREP-02).
                in_peak = before is not None and index >= 10
                pool = [
                    (track_id, t)
                    for track_id, t in sorted(traits.items())
                    if not in_peak or (t.bpm is not None and 120.0 <= t.bpm <= 130.0)
                ]
                expected = rank_fits(
                    first, second, pool, MAX_SIMILAR_LIMIT, exclude=sorted(neighbours)
                )
                assert [(s.track_id, s.score) for s in result.suggestions] == [
                    (s.track_id, s.score) for s in expected
                ], (index, against)
                if result.no_fit is not None:
                    assert first is not None and second is not None
                    assert first.bpm is not None and second.bpm is not None
                    assert fit_tempo_ranges(first.bpm, second.bpm) == ()
                    assert against is None and expected == []
                counts = {t: order.count(t) for t in order}
                for suggestion in result.suggestions:
                    assert suggestion.in_set == counts.get(suggestion.track_id, 0)


# ------------------------------------------------------------ the container


def test_the_container_builds_the_service(tmp_path, monkeypatch):
    from cuepoint.services import database_service as database_service_module
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IDatabaseService, ISetSuggestionService
    from cuepoint.utils.di_container import get_container, reset_container

    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: tmp_path / "c.db"
    )
    reset_container()
    try:
        bootstrap_services()
        service = get_container().resolve(ISetSuggestionService)
        assert isinstance(service, SetSuggestionService)
        with pytest.raises(ValueError, match="No such Set"):
            service.suggest(1, before_entry_id=1)
    finally:
        get_container().resolve(IDatabaseService).close_all()
        reset_container()
