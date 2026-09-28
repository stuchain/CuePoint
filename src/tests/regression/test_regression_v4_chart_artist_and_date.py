#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: charts made by artists were missed, and no chart had a date.

Found by recording the live v4 API with a real token (DISCOVER-01's spike,
2026-09-23), in data the reconstructed fixtures had not had. First fixed in
the parsers inCrate's discovery ran on; inCrate retired in DISCOVER-12, and the
test now holds the parser and the matcher that replaced them —
``parse_catalog_chart``, ``BeatportApi.charts`` and ``chart_curator`` — to the
same recorded page.

**What broke.**

1. *A chart made by an artist was credited to its account.* v4 puts the
   artist in ``artist: {id, name, slug}`` and the publishing account in
   ``person``. The parsers read only the account's ``owner_name``, which can
   differ from the artist: DJEFF's chart is owned by "OFFICIALDJEFFMUSIC". So a
   user with DJEFF in their library never had that chart found, because
   discovery matches library artists against the chart's curator. The chart's
   artist id was never read either.
2. *Every chart parsed with no date.* v4 calls it ``publish_date``; the parsers
   read ``published_date`` and ``published``. A chart with no date is kept
   whatever the window, so the date filter and the newest-first sort did
   nothing.

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

from cuepoint.core.entity_names import name_key
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_catalog import parse_catalog_chart
from cuepoint.services.discovery_service import chart_curator

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
    chart = parse_catalog_chart(_djeff(_page()))
    assert chart is not None
    assert chart.artist is not None
    assert (chart.artist.id, chart.artist.name) == (132419, "DJEFF")
    assert chart.owner_name == "OFFICIALDJEFFMUSIC"
    library = {name_key("DJEFF"): "DJEFF"}
    # By name, when resolution linked no id to the library's DJEFF ...
    assert chart_curator(chart, library, {}) == "DJEFF"
    # ... and by id, when it did.
    assert chart_curator(chart, library, {132419: name_key("DJEFF")}) == "DJEFF"


def test_a_chart_no_artist_made_keeps_its_account_as_curator():
    [plain] = [c for c in _page()["results"] if not c.get("artist")][:1]
    chart = parse_catalog_chart(plain)
    assert chart is not None
    assert chart.artist is None
    assert chart.owner_name == plain["person"]["owner_name"]


def test_every_recorded_chart_has_its_date():
    for raw in _page()["results"]:
        chart = parse_catalog_chart(raw)
        assert chart is not None
        assert chart.publish_date == raw["publish_date"][:10]


def test_the_window_excludes_a_chart_outside_it_even_if_beatport_does_not():
    page = _page()
    page["results"][0]["publish_date"] = "2019-01-01T00:00:00-06:00"
    api = BeatportApi(_Client(page), cache_service=None)  # type: ignore[arg-type]
    charts = api.charts(None, date(2026, 9, 1), date(2026, 9, 30))
    assert page["results"][0]["id"] not in {c.id for c in charts}
    assert len(charts) == len(page["results"]) - 1
    dates = [c.publish_date or "" for c in charts]
    assert dates == sorted(dates, reverse=True)
