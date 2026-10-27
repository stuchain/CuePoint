#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: a Beatport match title lost its mix name's parentheses (M454).

**What broke.** A track page read without a catalog search (the page parser,
``parse_track_page``) took its title from JSON-LD or ``__NEXT_DATA__``, and
when neither gave one, from the page's ``h1`` with ``get_text(" ")``. Beatport
writes the mix name in a ``<span>`` inside that ``h1``, so "It's Not Right" and
"Original Mix" were joined with a bare space: the match showed
"It's Not Right Original Mix". ``__NEXT_DATA__`` carries the mix name in its own
``mix_name`` field, which the parser never read, so that path dropped it
entirely. The catalog search and Discover already wrote "Name (Mix)".

**Why it is easy to reintroduce.** ``get_text(" ")`` is the obvious way to read
a heading, and the result looks like a plausible title. Only the parentheses
tell the two apart, and the remix detection that reads them
(``_extract_remixer_names_from_title``) silently finds nothing without them.

The pages are mocked: no network is touched.
"""

from __future__ import annotations

import json

import pytest
from bs4 import BeautifulSoup

from cuepoint.data import beatport

URL = "https://www.beatport.com/track/its-not-right/12345678"


def _parse(html: str, monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(
        beatport, "request_html", lambda url: BeautifulSoup(html, "html.parser")
    )
    title, *_ = beatport.parse_track_page.__wrapped__(URL)
    return title


def test_h1_title_keeps_the_mix_in_parentheses(monkeypatch: pytest.MonkeyPatch) -> None:
    html = (
        "<html><body><div>"
        "<h1>It's Not Right <span>Original Mix</span></h1>"
        '<a href="/artist/someone/1">Someone</a>'
        "</div></body></html>"
    )
    assert _parse(html, monkeypatch) == "It's Not Right (Original Mix)"


def test_next_data_title_keeps_the_mix_in_parentheses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data = {
        "props": {
            "pageProps": {
                "track": {
                    "title": "It's Not Right",
                    "mix_name": "Original Mix",
                    "artists": [{"name": "Someone"}],
                }
            }
        }
    }
    html = (
        '<html><body><script id="__NEXT_DATA__" type="application/json">'
        f"{json.dumps(data)}</script></body></html>"
    )
    assert _parse(html, monkeypatch) == "It's Not Right (Original Mix)"


def test_a_title_that_already_holds_its_mix_is_not_doubled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data = {
        "props": {
            "pageProps": {
                "track": {
                    "title": "It's Not Right (Original Mix)",
                    "mix_name": "Original Mix",
                    "artists": [{"name": "Someone"}],
                }
            }
        }
    }
    html = (
        '<html><body><script id="__NEXT_DATA__" type="application/json">'
        f"{json.dumps(data)}</script></body></html>"
    )
    assert _parse(html, monkeypatch) == "It's Not Right (Original Mix)"
