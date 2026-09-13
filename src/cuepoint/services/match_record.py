#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Turn one matcher result into the rows of a stored attempt (CLEAN-02).

Pure: no database, no clock, no network. ``MatchRepository.add_attempt`` is
the one caller that writes what this returns, and everything about *what* is
stored is decided here, where it can be tested without a job, a database or
Beatport.

What is stored is what was scored
---------------------------------
Every candidate in ``TrackResult.candidates`` becomes a row, in the order the
matcher scored them, including the ones its guards rejected — a rejected
candidate is what explains a "no match" (DEC-066). Nothing is re-fetched and
nothing is re-scored.

- ``rank`` is the candidate's place in that list.
- ``outcome`` is ``error`` when ``TrackResult.error`` is set, ``matched`` when
  there is a best match, and ``no_match`` otherwise.
- ``is_winner`` marks ``TrackResult.best_match``: the candidate the pipeline
  chose, found by identity. It is deliberately *not* the matcher's own
  ``BeatportCandidate.is_winner``, for two reasons found reading the matcher.
  The matcher sets that flag on the first candidate sharing the best one's
  URL, and a URL can be considered twice, so on a repeat it can mark the wrong
  row. And ``process_track`` turns a best candidate down when it scores under
  ``MIN_ACCEPT_SCORE`` but leaves the flag set, so a ``no_match`` result can
  carry a flagged "winner". Stored, that would be an attempt that says both
  "nothing matched" and "this matched".
- Only a ``matched`` attempt has a winner and a score. An error attempt has
  neither even when the result carries a best match: an error is not evidence
  (CLEAN-04 keeps a previous state across one).

Values are copied as the matcher held them, with four exceptions, each forced
by what the column holds:

- **Blank text is stored as null.** The matcher spells "not found" as an empty
  string (``title or ""``, ``reject_reason = ""``), and one spelling of absence
  in the database is what lets a later query ask for it. Text that is not
  blank is stored exactly, surrounding whitespace included.
- **BPM is a number.** The parser hands it over as text (``"128"``); text that
  is not a finite number is stored as null rather than refusing an attempt that
  took forty-five seconds of Beatport time.
- **The release year is a whole number**, for the same reason.
- **``beatport_track_id`` is read from the URL**, the way the matcher reads it
  to de-duplicate: ``/track/<slug>/<id>``. A slug can change; the id does not.

The scores, similarities, bonuses and indexes are the matcher's own numbers,
and ``MatchCandidate`` refuses one that is not a number of the right kind — a
NaN score is a matcher bug, and storing it would hide one.

The question, not only the answer
---------------------------------
``input_json`` is what the matcher was asked: the title, artist, key and year
it was given and the mix flags ``process_track`` parses from that title. A
re-match after a refresh changed the title is a different question, and the
attempt must say which one it answered. It is serialized with sorted keys, so
the same question is always the same text.
"""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, NamedTuple, Optional

from cuepoint.core.mix_parser import _parse_mix_flags
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.match_attempt import (
    OUTCOME_ERROR,
    OUTCOME_MATCHED,
    OUTCOME_NO_MATCH,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.version import __version__

#: A Beatport track page is ``/track/<slug>/<id>``. The matcher reads the id the
#: same way when it de-duplicates candidates.
_TRACK_ID = re.compile(r"/track/[^/]+/(\d+)")

#: What an error attempt says when the result carried an empty error. A
#: failure recorded as a no-match would be worse than a vague message.
UNEXPLAINED_ERROR = "The matcher reported an error without a message"

#: Candidate text columns: blank is stored as null, anything else exactly.
_TEXT_COLUMNS = (
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

#: Candidate columns that are the matcher's own numbers, copied unchanged.
_NUMBER_COLUMNS = (
    "score",
    "base_score",
    "title_sim",
    "artist_sim",
    "bonus_year",
    "bonus_key",
    "query_index",
    "candidate_index",
    "elapsed_ms",
)


class MatchRecord(NamedTuple):
    """The rows one result becomes, before any of them has an id.

    Attributes:
        attempt: ``match_attempts`` columns other than ``id``, ``track_id``,
            ``job_id``, the two timestamps and ``best_candidate_id`` — the
            ones a result decides.
        candidates: One mapping per candidate, in rank order, holding every
            ``match_candidates`` column except ``id`` and ``attempt_id``.
    """

    attempt: Dict[str, Any]
    candidates: List[Dict[str, Any]]


def attempt_from_result(
    result: TrackResult, track: Track, matcher_version: str = __version__
) -> MatchRecord:
    """Return the attempt fields and candidate rows for one matcher result.

    Args:
        result: What ``process_track`` returned.
        track: The track it was given — the question the attempt answers.
        matcher_version: The engine version that ran the matcher.

    Raises:
        ValueError: If the result contradicts itself (a best match that is not
            among its candidates), holds a candidate that is not a
            ``BeatportCandidate``, or carries queries that are not JSON.
    """
    outcome = outcome_of(result)
    winner = _winner_rank(result) if outcome == OUTCOME_MATCHED else None
    candidates = [
        _candidate_row(rank, candidate, rank == winner)
        for rank, candidate in enumerate(result.candidates)
    ]
    attempt: Dict[str, Any] = {
        "outcome": outcome,
        "score": None if winner is None else candidates[winner]["score"],
        "error": _error_text(result) if outcome == OUTCOME_ERROR else None,
        "input_json": question_json(track),
        "queries_json": _to_json(list(result.queries_data or []), "queries"),
        "matcher_version": matcher_version,
    }
    return MatchRecord(attempt=attempt, candidates=candidates)


def outcome_of(result: TrackResult) -> str:
    """Return what one result found: an error, a match, or no match."""
    if result.error is not None:
        return OUTCOME_ERROR
    if result.best_match is not None:
        return OUTCOME_MATCHED
    return OUTCOME_NO_MATCH


def question_json(track: Track) -> str:
    """Return the question a track puts to the matcher, as stable JSON text."""
    return _to_json(
        {
            "title": track.title,
            "artist": track.artist,
            "key": track.key,
            "year": track.year,
            "mix": _parse_mix_flags(track.title),
        },
        "question",
    )


def beatport_track_id(url: Optional[str]) -> Optional[str]:
    """Return the Beatport id in a track URL, or ``None`` when it has none."""
    if not url:
        return None
    match = _TRACK_ID.search(url)
    return match.group(1) if match else None


def started_at_for(finished_at: str, processing_time: Any) -> str:
    """Return when an attempt began, from when it ended and how long it took.

    ``TrackResult`` carries a duration, not a start time. A duration that is
    missing, negative or not a number, or an end time that is not ISO-8601,
    gives a start equal to the end: an attempt of unknown length is recorded as
    instantaneous rather than given a made-up one.
    """
    if processing_time is None or isinstance(processing_time, bool):
        return finished_at
    try:
        seconds = float(processing_time)
        finished = datetime.fromisoformat(finished_at)
    except (TypeError, ValueError):
        return finished_at
    if not math.isfinite(seconds) or seconds < 0:
        return finished_at
    return (finished - timedelta(seconds=seconds)).isoformat()


# ------------------------------------------------------------------ helpers


def _winner_rank(result: TrackResult) -> int:
    """Return the rank of the result's best match among its candidates.

    Identity first, because the matcher hands back the very object it chose;
    equality only for a result that was rebuilt. ``TrackResult`` puts a best
    match that is missing from the list at its front, so a miss here means the
    list was changed afterwards.
    """
    best = result.best_match
    for rank, candidate in enumerate(result.candidates):
        if candidate is best:
            return rank
    for rank, candidate in enumerate(result.candidates):
        if candidate == best:
            return rank
    raise ValueError("The result's best match is not one of its candidates")


def _candidate_row(rank: int, candidate: Any, is_winner: bool) -> Dict[str, Any]:
    """Return the ``match_candidates`` columns for one scored candidate."""
    if not isinstance(candidate, BeatportCandidate):
        raise ValueError(
            f"Candidate {rank} is a {type(candidate).__name__}, not a scored"
            " BeatportCandidate"
        )
    row: Dict[str, Any] = {
        "rank": rank,
        "url": candidate.url,
        "beatport_track_id": beatport_track_id(candidate.url),
        "bpm": _bpm(candidate.bpm),
        "release_year": _year(candidate.release_year),
        "guard_ok": candidate.guard_ok,
        "is_winner": is_winner,
    }
    for name in _TEXT_COLUMNS:
        row[name] = _text(getattr(candidate, name))
    for name in _NUMBER_COLUMNS:
        row[name] = getattr(candidate, name)
    return row


def _error_text(result: TrackResult) -> str:
    """Return the result's error, never blank."""
    text = str(result.error)
    return text if text.strip() else UNEXPLAINED_ERROR


def _text(value: Any) -> Optional[str]:
    """Return text as given, or ``None`` when there is none or it is blank."""
    if value is None:
        return None
    text = value if isinstance(value, str) else str(value)
    return text if text.strip() else None


def _bpm(value: Any) -> Optional[float]:
    """Return a BPM as a finite number, or ``None`` when it is not one."""
    if value is None or isinstance(value, bool):
        return None
    try:
        bpm = float(value.strip() if isinstance(value, str) else value)
    except (TypeError, ValueError):
        return None
    return bpm if math.isfinite(bpm) else None


def _year(value: Any) -> Optional[int]:
    """Return a release year as a whole number, or ``None`` when it is not one."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _to_json(value: Any, name: str) -> str:
    """Serialize with sorted keys; a set becomes a sorted list.

    Raises:
        ValueError: If the value holds something JSON cannot say, or a number
            JSON has no spelling for.
    """
    try:
        return json.dumps(
            value,
            sort_keys=True,
            ensure_ascii=False,
            allow_nan=False,
            default=_json_default,
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(f"The {name} cannot be stored as JSON: {exc}") from None


def _json_default(value: Any) -> Any:
    """Spell a set as a sorted list; refuse anything else JSON cannot hold."""
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=str)
    raise TypeError(f"{type(value).__name__} is not JSON")


__all__ = (
    "MatchRecord",
    "UNEXPLAINED_ERROR",
    "attempt_from_result",
    "beatport_track_id",
    "outcome_of",
    "question_json",
    "started_at_for",
)
