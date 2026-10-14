#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Search Beatport for one track with words of the person's own (the Review's Search panel).

A track the matcher found nothing for, or whose search failed, is searched by hand: the
person types what they think the track is called, CuePoint asks Beatport's signed-in
catalog (the provider :mod:`cuepoint.data.catalog_search` holds) and the results are
**scored by the matcher's own scorer** against the track as it is in the library, not
against the words typed, so their order and their guards are the ones every other
candidate got.

What comes back is stored as an attempt, exactly as a match job's answer is, so the
results keep their scores and the reasons they were turned down, a later "Not this
track" remembers which one was refused, and the track's state follows the same rule
(a decision of the person's survives it). Accepting one is the existing Correct, which
names a candidate by id.

**A hand search never accepts.** The results are stored and shown; a track with no
state, or one Beatport had nothing for, moves to "waiting for you" pointing at the best
result the guards passed, and the person presses Use this. The automatic rule that
accepts a certain match is not applied here, and a state the track already has (a
decision of the person's above all) is left as it is. The attempt and that state are
written in one transaction, so a match job running beside it cannot interleave.

Nothing here searches without a sign-in: the website path answers with a challenge, so
the answer says so instead of searching in a way that cannot work.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from cuepoint.core.mix_parser import (
    _extract_generic_parenthetical_phrases,
    _parse_mix_flags,
)
from cuepoint.core.text_processing import sanitize_title_for_search
from cuepoint.data import catalog_search, search_health
from cuepoint.data.rekordbox import extract_artists_from_title
from cuepoint.models.result import TrackResult

#: The longest search words kept: a pasted paragraph is not a title.
QUERY_LIMIT = 200


def signed_in() -> bool:
    """Whether there is a Beatport sign-in to search with."""
    provider = catalog_search.get_provider()
    return provider is not None and provider.available()


def search_track(
    track_id: int,
    track: Any,
    query: str,
    matcher: Any,
    matches: Any,
    min_accept_score: float = 70.0,
) -> Dict[str, Any]:
    """Search for ``query``, score the results against ``track``, and store them.

    Args:
        track_id: The library track's id, which the attempt is stored under.
        track: The library's track (``match_input.library_track_to_track`` made it a
            ``Track`` for scoring).
        query: What the person typed.
        matcher: ``IMatcherService``: the existing scorer.
        matches: ``IMatchRepository``, which stores the attempt and the proposal in one transaction.

    Returns:
        ``{"attempt_id", "failure"}``: the stored attempt, and why the search failed
        when it did (None when it answered, even with nothing).
    """
    started = time.perf_counter()
    artists = track.artist or ""
    title = sanitize_title_for_search(track.title)
    title_only = False
    if not artists.strip():
        inferred = extract_artists_from_title(track.title)
        if inferred:
            artists, inferred_title = inferred
            title = sanitize_title_for_search(inferred_title)
        title_only = True

    with search_health.collect() as failures:
        best, candidates, _audit, _last = matcher.find_best_match(
            idx=1,
            track_title=title,
            track_artists_for_scoring=artists,
            title_only_mode=title_only,
            queries=[query],
            input_mix=_parse_mix_flags(track.title),
            input_generic_phrases=_extract_generic_parenthetical_phrases(track.title),
        )

    kind = failures.worst_kind()
    usable = any(
        getattr(candidate, "reject_reason", None) != "no_title"
        for candidate in candidates
    )
    failure = kind if kind is not None and not usable else None
    matched = best is not None and best.score >= min_accept_score and failure is None
    result = TrackResult(
        playlist_index=1,
        title=track.title,
        artist=track.artist or artists,
        matched=matched,
        best_match=best if matched else None,
        candidates=list(candidates),
        match_score=best.score if matched and best is not None else None,
        error=search_health.failure_error(failure) if failure else None,
        processing_time=time.perf_counter() - started,
        file_path=track.file_path,
    )
    # The attempt and the proposal commit together, inside the repository.
    attempt = matches.add_hand_search(track_id, result, track)
    return {"attempt_id": attempt.id, "failure": failure}


def clean_query(raw: Any) -> str:
    """The search words, trimmed and kept to a sane length; empty when there are none.

    Raises:
        ValueError: If ``raw`` is not text: a number or a list is not what anyone typed.
    """
    if raw is None:
        return ""
    if not isinstance(raw, str):
        raise ValueError("The search words must be text")
    return " ".join(raw.split())[:QUERY_LIMIT]


def failure_words(kind: Optional[str]) -> Optional[str]:
    """The sentence for a failed search, as the matcher words it."""
    return None if kind is None else search_health.sentence(kind)


__all__: List[str] = ["clean_query", "failure_words", "search_track", "signed_in"]
