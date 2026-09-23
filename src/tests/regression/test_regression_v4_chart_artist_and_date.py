#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: inCrate missed charts made by artists, and read no chart's date.

Found by recording the live v4 API with a real token (DISCOVER-01's spike,
2026-09-23), in data the reconstructed fixtures had not had.

**What broke.** Two things, in the parsers inCrate's discovery runs on:

1. *A chart made by an artist was credited to its account.* v4 puts the
   artist in ``artist: {id, name, slug}`` and the publishing account in
   ``person``. The parsers read only the account's ``owner_name``, which can
   differ from the artist: DJEFF's chart is owned by "OFFICIALDJEFFMUSIC". So a
   user with DJEFF in their library never had that chart found, because
   discovery matches library artists against the chart's author. The chart's
   artist id was never read either — ``author_id`` was always ``None``.
2. *Every chart parsed with no date.* v4 calls it ``publish_date``; the parsers
   read ``published_date`` and ``published``. ``list_charts`` keeps a chart
   with no date whatever the window, so its date filter and its newest-first
   sort did nothing.

**Why it is easy to reintroduce.** The guessed field names are still read as
fallbacks, and ``person`` still carries a name. A parser rewritten to "take the
curator from ``person``" would look right and bring the first bug back.

The test reads the recorded page, so it is held to what Beatport really sends.
"""

from __future__ import annotations

import copy
import json
from datetime import date
from pathlib import Path

from cuepoint.incrate.discovery import _chart_author_in_library, _normalize_artist
from cuepoint.services.beatport_api import (
    BeatportApi,
    _parse_chart_detail,
    _parse_chart_summary,
)

RECORDED = Path(__file__).resolve().parents[1] / "fixtures" / "beatport_v4" / "recorded"


def _page() -> dict:
    return json.loads((RECORDED / "charts_page.json").read_text(encoding="utf-8"))


def _djeff(page: dict) -> dict:
    [chart] = [
        c for c in page["results"] if (c.get("artist") or {}).get("name") == "DJEFF"
    ]
    return chart


class _Client:
    """Answers the charts listing with a fixed page, whatever it is asked."""

    def __init__(self, page: dict) -> None:
        self.page = page

    def get(self, path, params=None):
        answer = copy.deepcopy(self.page)
        answer["next"] = None
        return answer


def test_the_recording_holds_the_case():
    chart = _djeff(_page())
    assert chart["person"]["owner_name"] == "OFFICIALDJEFFMUSIC"
    assert chart["artist"]["id"] == 132419


def test_a_chart_an_artist_made_is_found_for_that_artist():
    chart = _djeff(_page())
    summary = _parse_chart_summary(chart)
    detail = _parse_chart_detail(chart)
    library = {_normalize_artist("DJEFF")}
    assert _chart_author_in_library(summary, detail, None, library)
    assert (summary.author_name, summary.author_id) == ("DJEFF", 132419)
    assert detail.author_name == "DJEFF"
    assert summary.artist is not None and summary.artist.id == 132419


def test_a_chart_no_artist_made_keeps_its_account_as_author():
    [plain] = [c for c in _page()["results"] if not c.get("artist")][:1]
    summary = _parse_chart_summary(plain)
    assert summary.author_name == plain["person"]["owner_name"]
    assert summary.author_id is None and summary.artist is None


def test_every_recorded_chart_has_its_date():
    for chart in _page()["results"]:
        assert _parse_chart_summary(chart).published_date == chart["publish_date"][:10]
        assert _parse_chart_detail(chart).published_date == chart["publish_date"][:10]


def test_the_window_excludes_a_chart_outside_it_even_if_beatport_does_not():
    page = _page()
    page["results"][0]["publish_date"] = "2019-01-01T00:00:00-06:00"
    api = BeatportApi(_Client(page), cache_service=None)  # type: ignore[arg-type]
    charts = api.list_charts(5, date(2026, 9, 1), date(2026, 9, 30))
    assert page["results"][0]["id"] not in {c.id for c in charts}
    assert len(charts) == len(page["results"]) - 1
    assert [c.published_date for c in charts] == sorted(
        (c.published_date for c in charts), reverse=True
    )
