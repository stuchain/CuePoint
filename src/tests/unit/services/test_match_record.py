#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The pure mapping from a matcher result to the rows of an attempt (CLEAN-02).

No database here and no network: everything about *what* an attempt stores is
decided by ``match_record``, so it is tested on its own, twice over.

- **Against constructed results**, for the edges a real run rarely hands over:
  an error beside a best match, a URL scored twice, a best match missing from
  its own list, and each value the columns need converted.
- **Against the real pipeline**: ``ProcessorService.process_track`` and the
  real matcher, with only Beatport's search and page parsing stubbed. That is
  where the two findings behind this module's docstring are pinned — the
  similarities are fractional, and a best candidate turned down for its score
  still carries the matcher's winner flag.
"""

from __future__ import annotations

import dataclasses
import json
from typing import Any, Dict
from unittest.mock import Mock, patch

import pytest

from cuepoint.core.mix_parser import _parse_mix_flags
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.config import SETTINGS
from cuepoint.models.match_attempt import (
    OUTCOME_ERROR,
    OUTCOME_MATCHED,
    OUTCOME_NO_MATCH,
    MatchAttempt,
    MatchCandidate,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services.match_record import (
    UNEXPLAINED_ERROR,
    MatchRecord,
    attempt_from_result,
    beatport_track_id,
    outcome_of,
    question_json,
    started_at_for,
)
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.processor_service import ProcessorService
from cuepoint.version import __version__

TITLE = "Song 2 (Extended Mix)"
TRACK = Track(title=TITLE, artist="An Artist", key="Am", year=2024)

#: What a candidate row holds: every column but the two the database assigns.
CANDIDATE_COLUMNS = {f.name for f in dataclasses.fields(MatchCandidate)} - {
    "id",
    "attempt_id",
}

#: What a result decides about an attempt; the rest comes from the caller.
DECIDED_BY_THE_RESULT = {f.name for f in dataclasses.fields(MatchAttempt)} - {
    "id",
    "track_id",
    "job_id",
    "started_at",
    "finished_at",
    "best_candidate_id",
}

TEXT_COLUMNS = (
    "title",
    "artists",
    "remixers",
    "label",
    "genre",
    "subgenre",
    "key",
    "release_name",
    "release_date",
    "artwork_url",
    "preview_url",
    "reject_reason",
    "query_text",
)


def scored(number: int, **fields: Any) -> BeatportCandidate:
    values: Dict[str, Any] = dict(
        url=f"https://www.beatport.com/track/song-{number}/{1000 + number}",
        title=f"Song {number}",
        artists="An Artist",
        label="A Label",
        release_date="2024-05-17",
        bpm="128",
        key="A min",
        genre="Tech House",
        score=90.0 + number,
        title_sim=43.47826086956522,
        artist_sim=100,
        query_index=1,
        query_text="an artist song",
        candidate_index=number + 1,
        base_score=88.25,
        bonus_year=2,
        bonus_key=-3,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=312,
        is_winner=False,
        release_year=2024,
        release_name="Song EP",
        remixers="Someone",
        subgenre="Minimal",
        artwork_url="https://geo-media.beatport.com/image/1.jpg",
        preview_url="https://geo-samples.beatport.com/1.mp3",
    )
    values.update(fields)
    return BeatportCandidate(**values)


def result_with(candidates, best=None, **fields: Any) -> TrackResult:
    fields.setdefault("matched", best is not None)
    return TrackResult(
        playlist_index=1,
        title=TITLE,
        artist="An Artist",
        best_match=best,
        candidates=candidates,
        **fields,
    )


# ----------------------------------------------------------------- the shape


@pytest.mark.unit
class TestTheRecord:
    def test_it_holds_what_a_result_decides_and_nothing_else(self):
        candidates = [scored(0), scored(1)]
        record = attempt_from_result(result_with(candidates, candidates[0]), TRACK)
        assert set(record.attempt) == DECIDED_BY_THE_RESULT
        assert all(set(row) == CANDIDATE_COLUMNS for row in record.candidates)

    def test_it_unpacks_as_attempt_and_candidates(self):
        attempt, candidates = attempt_from_result(result_with([scored(0)]), TRACK)
        assert isinstance(attempt, dict) and len(candidates) == 1
        assert isinstance(attempt_from_result(result_with([]), TRACK), MatchRecord)

    def test_every_row_is_one_the_models_accept(self):
        candidates = [scored(0), scored(1, guard_ok=False, reject_reason="x")]
        record = attempt_from_result(result_with(candidates, candidates[0]), TRACK)
        MatchAttempt(track_id=1, started_at="a", finished_at="b", **record.attempt)
        for row in record.candidates:
            MatchCandidate(attempt_id=1, **row)


# --------------------------------------------------------------- the outcome


@pytest.mark.unit
class TestTheOutcome:
    def test_a_best_match_is_a_match(self):
        candidates = [scored(0)]
        result = result_with(candidates, candidates[0])
        assert outcome_of(result) == OUTCOME_MATCHED
        assert attempt_from_result(result, TRACK).attempt["error"] is None

    def test_no_best_match_is_no_match(self):
        assert outcome_of(result_with([scored(0)])) == OUTCOME_NO_MATCH
        assert outcome_of(result_with([])) == OUTCOME_NO_MATCH

    def test_a_matched_flag_without_a_best_match_is_no_match(self):
        """There is nothing to point at, so the flag alone is not a match."""
        assert outcome_of(result_with([scored(0)], matched=True)) == OUTCOME_NO_MATCH

    def test_an_error_beats_a_best_match_and_carries_no_winner(self):
        candidates = [scored(0)]
        result = result_with(candidates, candidates[0], error="Timed out after 45 s")
        record = attempt_from_result(result, TRACK)

        assert record.attempt["outcome"] == OUTCOME_ERROR
        assert record.attempt["error"] == "Timed out after 45 s"
        assert record.attempt["score"] is None
        assert [row["is_winner"] for row in record.candidates] == [False]

    @pytest.mark.parametrize("blank", ["", "   "])
    def test_an_error_without_a_message_still_says_it_was_one(self, blank):
        record = attempt_from_result(result_with([], error=blank), TRACK)
        assert record.attempt["outcome"] == OUTCOME_ERROR
        assert record.attempt["error"] == UNEXPLAINED_ERROR

    def test_the_score_is_the_winners_own(self):
        candidates = [scored(0), scored(1)]
        result = result_with(candidates, candidates[1], match_score=12.0)
        assert attempt_from_result(result, TRACK).attempt["score"] == 91.0

    def test_no_winner_has_no_score(self):
        assert (
            attempt_from_result(result_with([scored(0)]), TRACK).attempt["score"]
            is None
        )


# ---------------------------------------------------------------- the winner


@pytest.mark.unit
class TestTheWinner:
    def test_it_is_the_best_match_even_when_the_matcher_flagged_a_twin(self):
        """A URL scored by two queries: the matcher flags the first by URL."""
        first = scored(0, query_index=1)
        second = dataclasses.replace(first, query_index=2, score=95.0)
        first.is_winner = True
        record = attempt_from_result(result_with([first, second], second), TRACK)
        assert [row["is_winner"] for row in record.candidates] == [False, True]
        assert record.attempt["score"] == 95.0

    def test_the_matchers_flag_alone_makes_no_winner(self):
        flagged = scored(0, is_winner=True)
        record = attempt_from_result(result_with([flagged, scored(1)]), TRACK)
        assert not any(row["is_winner"] for row in record.candidates)

    def test_a_rebuilt_result_finds_its_winner_by_equality(self):
        candidates = [scored(0), scored(1), scored(2)]
        copy = dataclasses.replace(candidates[1])
        assert copy is not candidates[1] and copy == candidates[1]
        record = attempt_from_result(result_with(candidates, copy), TRACK)
        assert [row["is_winner"] for row in record.candidates] == [False, True, False]

    def test_exactly_one_winner(self):
        candidates = [scored(n) for n in range(6)]
        record = attempt_from_result(result_with(candidates, candidates[4]), TRACK)
        assert [row["rank"] for row in record.candidates if row["is_winner"]] == [4]

    def test_a_best_match_missing_from_its_candidates_is_refused(self):
        candidates = [scored(0), scored(1)]
        result = result_with(candidates, candidates[1])
        result.candidates.pop(1)
        with pytest.raises(ValueError, match="best match"):
            attempt_from_result(result, TRACK)


# ------------------------------------------------------------ the candidates


@pytest.mark.unit
class TestTheCandidates:
    def test_every_candidate_is_kept_in_scored_order(self):
        candidates = [
            scored(0, guard_ok=False, reject_reason="guard_title_sim_floor"),
            scored(1),
            scored(2, guard_ok=False, reject_reason="no_title", title=""),
        ]
        record = attempt_from_result(result_with(candidates, candidates[1]), TRACK)
        assert [row["rank"] for row in record.candidates] == [0, 1, 2]
        assert [row["url"] for row in record.candidates] == [c.url for c in candidates]
        assert [row["guard_ok"] for row in record.candidates] == [False, True, False]
        assert [row["reject_reason"] for row in record.candidates] == [
            "guard_title_sim_floor",
            None,
            "no_title",
        ]

    def test_the_matchers_numbers_are_copied_unchanged(self):
        candidate = scored(0, score=87.123456789, base_score=80.5)
        row = attempt_from_result(result_with([candidate]), TRACK).candidates[0]
        for name in (
            "score",
            "base_score",
            "title_sim",
            "artist_sim",
            "bonus_year",
            "bonus_key",
            "query_index",
            "candidate_index",
            "elapsed_ms",
        ):
            assert row[name] == getattr(candidate, name), name
        assert row["title_sim"] == 43.47826086956522

    def test_text_is_copied_exactly(self):
        candidate = scored(0, title="  Padded  Title ", artists="A & B")
        row = attempt_from_result(result_with([candidate]), TRACK).candidates[0]
        for name in TEXT_COLUMNS:
            assert row[name] == (getattr(candidate, name) or None), name
        assert row["title"] == "  Padded  Title "

    @pytest.mark.parametrize("name", TEXT_COLUMNS)
    @pytest.mark.parametrize("blank", ["", "   "])
    def test_blank_text_is_stored_as_nothing(self, name, blank):
        row = attempt_from_result(
            result_with([scored(0, **{name: blank})]), TRACK
        ).candidates[0]
        assert row[name] is None

    def test_an_unset_optional_is_stored_as_nothing(self):
        row = attempt_from_result(
            result_with([scored(0, remixers=None, label=None)]), TRACK
        ).candidates[0]
        assert (row["remixers"], row["label"]) == (None, None)

    @pytest.mark.parametrize(
        "url, expected",
        [
            ("https://www.beatport.com/track/strobe/1234567", "1234567"),
            ("https://www.beatport.com/track/strobe/1234567?utm=x", "1234567"),
            ("https://www.beatport.com/track/strobe/1234567/", "1234567"),
            ("https://www.beatport.com/release/strobe/1234567", None),
            ("https://www.beatport.com/track/strobe", None),
            ("", None),
            (None, None),
        ],
    )
    def test_the_beatport_id_is_read_from_the_url(self, url, expected):
        assert beatport_track_id(url) == expected

    def test_each_row_carries_its_beatport_id(self):
        row = attempt_from_result(result_with([scored(7)]), TRACK).candidates[0]
        assert row["beatport_track_id"] == "1007"

    @pytest.mark.parametrize(
        "given, stored",
        [
            ("128", 128.0),
            ("128.50", 128.5),
            (" 126 ", 126.0),
            (124, 124.0),
            (124.5, 124.5),
            ("", None),
            ("n/a", None),
            ("nan", None),
            ("inf", None),
            (None, None),
            (True, None),
        ],
    )
    def test_bpm_is_stored_as_a_number_or_nothing(self, given, stored):
        row = attempt_from_result(
            result_with([scored(0, bpm=given)]), TRACK
        ).candidates[0]
        assert row["bpm"] == stored
        assert row["bpm"] is None or isinstance(row["bpm"], float)

    @pytest.mark.parametrize(
        "given, stored",
        [
            (2009, 2009),
            ("2009", 2009),
            (" 2009 ", 2009),
            (2009.0, 2009),
            (2009.5, None),
            ("20x9", None),
            ("", None),
            (None, None),
            (True, None),
        ],
    )
    def test_the_release_year_is_a_whole_number_or_nothing(self, given, stored):
        row = attempt_from_result(
            result_with([scored(0, release_year=given)]), TRACK
        ).candidates[0]
        assert row["release_year"] == stored
        assert row["release_year"] is None or type(row["release_year"]) is int

    def test_a_candidate_that_was_never_scored_is_refused(self):
        result = result_with([scored(0), {"candidate_url": "https://x"}])
        with pytest.raises(ValueError, match="Candidate 1"):
            attempt_from_result(result, TRACK)


# -------------------------------------------------------------- the question


@pytest.mark.unit
class TestTheQuestion:
    def test_it_is_the_title_artist_key_year_and_mix(self):
        asked = json.loads(question_json(TRACK))
        assert set(asked) == {"title", "artist", "key", "year", "mix"}
        assert (asked["title"], asked["artist"], asked["key"], asked["year"]) == (
            TITLE,
            "An Artist",
            "Am",
            2024,
        )

    def test_the_mix_is_what_process_track_parses(self):
        track = Track(title="Tighter (CamelPhat Extended Remix)", artist="Artist")
        flags = _parse_mix_flags(track.title)
        expected = json.loads(json.dumps(flags, default=lambda s: sorted(s, key=str)))
        assert json.loads(question_json(track))["mix"] == expected
        assert expected["is_remix"] and expected["remixers"]

    def test_the_same_question_is_the_same_text(self):
        again = Track(title=TITLE, artist="An Artist", key="Am", year=2024)
        text = question_json(TRACK)
        assert question_json(again) == text
        assert text == json.dumps(json.loads(text), sort_keys=True, ensure_ascii=False)

    def test_a_changed_title_is_a_different_question(self):
        renamed = Track(title="Song 2 (Radio Edit)", artist="An Artist", key="Am")
        assert question_json(renamed) != question_json(TRACK)

    def test_text_is_kept_as_written(self):
        track = Track(title="Café del Mar", artist="Energy 52")
        assert "Café del Mar" in question_json(track)

    def test_the_attempt_carries_it(self):
        record = attempt_from_result(result_with([]), TRACK)
        assert record.attempt["input_json"] == question_json(TRACK)


# ------------------------------------------------------ queries and version


@pytest.mark.unit
class TestQueriesAndVersion:
    def test_the_queries_tried_are_kept(self):
        queries = [
            {"index": 1, "query": "an artist song", "candidates": 12, "elapsed_ms": 80},
            {"index": 2, "query": "song", "candidates": 0, "elapsed_ms": 40},
        ]
        record = attempt_from_result(result_with([], queries_data=queries), TRACK)
        assert json.loads(record.attempt["queries_json"]) == queries

    def test_no_queries_is_an_empty_list(self):
        assert (
            attempt_from_result(result_with([]), TRACK).attempt["queries_json"] == "[]"
        )

    @pytest.mark.parametrize("bad", [object(), float("nan")])
    def test_queries_that_are_not_json_are_refused(self, bad):
        result = result_with([], queries_data=[{"index": 1, "query": bad}])
        with pytest.raises(ValueError, match="queries"):
            attempt_from_result(result, TRACK)

    def test_the_version_defaults_to_this_engine(self):
        assert (
            attempt_from_result(result_with([]), TRACK).attempt["matcher_version"]
            == __version__
        )

    def test_a_given_version_is_kept(self):
        record = attempt_from_result(result_with([]), TRACK, matcher_version="0.9")
        assert record.attempt["matcher_version"] == "0.9"


# ----------------------------------------------------------------- the clock


@pytest.mark.unit
class TestStartedAt:
    END = "2026-09-13T12:00:45+00:00"

    def test_the_start_is_the_end_less_the_time_taken(self):
        assert started_at_for(self.END, 12.5) == "2026-09-13T12:00:32.500000+00:00"
        assert started_at_for(self.END, 0) == "2026-09-13T12:00:45+00:00"

    @pytest.mark.parametrize(
        "duration", [None, -1.0, float("nan"), float("inf"), True, "soon"]
    )
    def test_an_unknown_duration_is_an_instant(self, duration):
        assert started_at_for(self.END, duration) == self.END

    def test_an_end_that_is_not_iso_is_kept_as_the_start(self):
        assert started_at_for("yesterday", 5.0) == "yesterday"


# ----------------------------------------------------------- the real thing

#: Recorded-shape Beatport pages for four URLs: the track, an unrelated one the
#: artist guard rejects, a remix of the track, and a near title whose
#: similarity RapidFuzz scores as a fraction (82.35…).
PAGES = {
    "https://www.beatport.com/track/never-sleep-alone/444": (
        "Never Sleep Alone (Original Mix)",
        "Tim Green",
        "G min",
        2016,
        "123",
        "Bedrock",
        "Deep House",
        "Alone",
        "2016-02-01",
    ),
    "https://www.beatport.com/track/never-sleep-again/111": (
        "Never Sleep Again (Original Mix)",
        "Tim Green",
        "A min",
        2014,
        "124",
        "Bedrock",
        "Deep House",
        "Never Sleep Again",
        "2014-03-10",
    ),
    "https://www.beatport.com/track/something-else/222": (
        "Something Else Entirely",
        "Nobody At All",
        "C maj",
        2011,
        "128",
        "Other",
        "Techno",
        "Else",
        "2011-01-01",
    ),
    "https://www.beatport.com/track/never-sleep-again-remix/333": (
        "Never Sleep Again (Someone Remix)",
        "Tim Green, Someone",
        "F min",
        2015,
        "122.00",
        "Bedrock",
        "Deep House",
        "Remixes",
        "2015-06-01",
    ),
}


@pytest.fixture
def pipeline():
    """``process_track`` over the real matcher, with Beatport stubbed out."""
    config = Mock()
    config.get.side_effect = lambda key, default=None: SETTINGS.get(key, default)
    processor = ProcessorService(
        beatport_service=Mock(),
        matcher_service=MatcherService(),
        logging_service=Mock(),
        config_service=config,
    )
    with (
        patch(
            "cuepoint.core.matcher.track_urls",
            side_effect=lambda idx, query, max_results: list(PAGES),
        ) as search,
        patch(
            "cuepoint.core.matcher.parse_track_page", side_effect=lambda url: PAGES[url]
        ) as parse,
    ):
        yield processor, search, parse


@pytest.mark.unit
class TestTheRealPipeline:
    TRACK = Track(title="Never Sleep Again", artist="Tim Green")

    def test_a_real_match_is_stored_as_the_pipeline_chose(self, pipeline):
        processor, search, parse = pipeline
        result = processor.process_track(1, self.TRACK)
        assert result.best_match is not None and len(result.candidates) == 4

        calls = (search.call_count, parse.call_count)
        record = attempt_from_result(result, self.TRACK)
        assert (search.call_count, parse.call_count) == calls  # nothing re-fetched

        assert record.attempt["outcome"] == OUTCOME_MATCHED
        winners = [row for row in record.candidates if row["is_winner"]]
        assert [row["url"] for row in winners] == [result.best_match.url]
        assert record.attempt["score"] == result.best_match.score

        by_url = {c.url: c for c in result.candidates}
        for rank, row in enumerate(record.candidates):
            source = by_url[row["url"]]
            assert result.candidates[rank] is source
            assert (row["score"], row["title_sim"], row["artist_sim"]) == (
                source.score,
                source.title_sim,
                source.artist_sim,
            )
            assert row["guard_ok"] is source.guard_ok
            assert row["reject_reason"] == (source.reject_reason or None)
            MatchCandidate(attempt_id=1, **row)

        assert any(not row["guard_ok"] for row in record.candidates)
        assert json.loads(record.attempt["queries_json"]) == result.queries_data

    def test_similarities_really_are_fractional(self, pipeline):
        processor, _, _ = pipeline
        result = processor.process_track(1, self.TRACK)
        sims = [c.title_sim for c in result.candidates]
        assert any(isinstance(s, float) and not float(s).is_integer() for s in sims)
        record = attempt_from_result(result, self.TRACK)
        assert [row["title_sim"] for row in record.candidates] == sims

    def test_a_best_turned_down_for_its_score_is_no_winner(self, pipeline):
        processor, _, _ = pipeline
        result = processor.process_track(
            1, self.TRACK, settings={**SETTINGS, "MIN_ACCEPT_SCORE": 1_000}
        )
        assert result.best_match is None
        assert any(c.is_winner for c in result.candidates)  # the matcher's flag

        record = attempt_from_result(result, self.TRACK)
        assert record.attempt["outcome"] == OUTCOME_NO_MATCH
        assert record.attempt["score"] is None
        assert not any(row["is_winner"] for row in record.candidates)
        assert len(record.candidates) == len(result.candidates)
