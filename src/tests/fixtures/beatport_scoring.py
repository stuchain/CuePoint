#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Scoring the recorded Beatport pages, with nothing reaching Beatport (CLEAN-09).

Cross-cutting fact 4 of Phase 7: the matcher does not change, and the one parser
change the phase makes — reading a track's artwork — must be proved not to move
a score. :func:`score_recorded_pages` runs the real ``best_beatport_match`` over
the recorded track pages, with the search and the page fetch replaced by the
fixtures, and returns everything scoring decides: every candidate's parsed
fields, score and its parts, guard verdict and rejection reason, and the winner.

``scoring_baseline.json`` beside the fixtures was written by this function
*before* the parser learned about artwork. The test compares against it.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List
from unittest import mock

from bs4 import BeautifulSoup

FIXTURES = Path(__file__).parent / "beatport"

#: Each recorded track page, at the URL the matcher is told it lives at.
PAGES = {
    "https://www.beatport.com/track/strobe/1696999": "track_page_artwork.html",
    "https://www.beatport.com/track/test-track/123": "track_page_standard.html",
}

#: The questions asked of those pages: artist and title, title only, a mix.
CASES = [
    {
        "name": "strobe by deadmau5",
        "title": "Strobe",
        "artists": "deadmau5",
        "title_only": False,
        "queries": ["deadmau5 Strobe", "Strobe"],
        "mix": {"is_original": True, "prefer_plain": False},
    },
    {
        "name": "test track by test artist",
        "title": "Test Track",
        "artists": "Test Artist",
        "title_only": False,
        "queries": ["Test Artist Test Track"],
        "mix": None,
    },
    {
        "name": "strobe, title only",
        "title": "Strobe",
        "artists": "",
        "title_only": True,
        "queries": ["Strobe"],
        "mix": None,
    },
    {
        "name": "a remix nobody made",
        "title": "Strobe (Somebody Remix)",
        "artists": "deadmau5",
        "title_only": False,
        "queries": ["deadmau5 Strobe Somebody Remix"],
        "mix": {"is_remix": True, "remixer_tokens": {"somebody"}},
    },
]

#: What scoring decides about a candidate. Timing is left out: it is measured.
CANDIDATE_FIELDS = (
    "url",
    "title",
    "artists",
    "key",
    "release_year",
    "bpm",
    "label",
    "genre",
    "release_name",
    "release_date",
    "score",
    "base_score",
    "title_sim",
    "artist_sim",
    "bonus_year",
    "bonus_key",
    "guard_ok",
    "reject_reason",
    "query_index",
    "query_text",
)


def _soup(url: str) -> Any:
    name = PAGES.get(url)
    if name is None:
        return None
    return BeautifulSoup((FIXTURES / name).read_text(encoding="utf-8"), "lxml")


def score_recorded_pages() -> List[Dict[str, Any]]:
    """Run the matcher over every case and return what it decided, per case."""
    from cuepoint.core import matcher
    from cuepoint.data import beatport

    urls = list(PAGES)
    results: List[Dict[str, Any]] = []
    with (
        mock.patch.object(beatport, "request_html", side_effect=_soup),
        mock.patch.object(matcher, "track_urls", return_value=urls),
    ):
        for case in CASES:
            best, candidates, _, _ = matcher.best_beatport_match(
                idx=1,
                track_title=case["title"],
                track_artists_for_scoring=case["artists"],
                title_only_mode=case["title_only"],
                queries=case["queries"],
                input_mix=case["mix"],
            )
            rows = sorted(
                (
                    {field: getattr(candidate, field) for field in CANDIDATE_FIELDS}
                    for candidate in candidates
                ),
                key=lambda row: (row["query_index"], row["url"]),
            )
            results.append(
                {
                    "case": case["name"],
                    "winner": best.url if best is not None else None,
                    "winner_score": best.score if best is not None else None,
                    "candidates": rows,
                }
            )
    return results
