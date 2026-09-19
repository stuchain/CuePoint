#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Beatport answered from files, for end-to-end tests (CLEAN-14).

A test must never reach Beatport, and an end-to-end journey still has to see a
match accepted and another left for review. ``CUEPOINT_SKIP_BEATPORT`` answers
every search with nothing, which can show neither. ``CUEPOINT_BEATPORT_FIXTURE``
names a JSON file instead, and the three places CuePoint reaches Beatport answer
from it:

- a search (:func:`cuepoint.data.beatport.track_urls`),
- a track page (:func:`cuepoint.data.beatport.request_html`), and
- an image (:func:`cuepoint.services.artwork_service.fetch_image`).

Nothing else changes. The matcher parses the pages it is given, and scores and
guards the candidates as it would live ones; that is the point of stubbing at
the network rather than at the matcher. The variable is read on every call, like
``CUEPOINT_SKIP_BEATPORT``, and works the same in a packaged engine, which is
where the journey runs. Like any environment variable it is trusted: whoever
sets it already controls the process.

The file::

    {
      "searches": [
        {"contains": "tone one", "urls": ["https://www.beatport.com/track/tone-one/1001"]}
      ],
      "pages": {"https://www.beatport.com/track/tone-one/1001": "pages/1001.html"},
      "images": {"https://geo-media.beatport.com/image_size/500x500/c.jpg": "c.jpg"}
    }

A search answers the URLs of every entry whose ``contains`` appears in the
query, ignoring case, in the order listed and each once. A page or image the
file does not list answers as a page that is gone does: nothing. Paths are
relative to the file and must stay inside its folder.
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

#: The variable naming the fixture file.
ENV_VAR = "CUEPOINT_BEATPORT_FIXTURE"


class BeatportFixtureError(ValueError):
    """The fixture file cannot be used. Raised loudly: a test must not pass on
    a stub that silently answered nothing."""


@dataclass(frozen=True)
class _Search:
    contains: str
    urls: Tuple[str, ...]


@dataclass(frozen=True)
class BeatportFixture:
    """A fixture file, read."""

    root: Path
    searches: Tuple[_Search, ...]
    pages: Dict[str, str]
    images: Dict[str, str]

    def search(self, query: str, max_results: int) -> List[str]:
        """The URLs every matching entry lists, in order, each once."""
        wanted = (query or "").lower()
        found: List[str] = []
        for entry in self.searches:
            if entry.contains in wanted:
                found.extend(url for url in entry.urls if url not in found)
        return found[: max(0, int(max_results))]

    def page(self, url: str) -> Optional[str]:
        """A track page's HTML, or None for a page the file does not list."""
        name = self.pages.get(url)
        return None if name is None else self._read(name).decode("utf-8")

    def image(self, url: str) -> Optional[bytes]:
        """An image's bytes, or None for one the file does not list."""
        name = self.images.get(url)
        return None if name is None else self._read(name)

    def _read(self, name: str) -> bytes:
        path = (self.root / name).resolve()
        if self.root not in path.parents:
            raise BeatportFixtureError(f"{name!r} is outside the fixture's folder")
        try:
            return path.read_bytes()
        except OSError as exc:
            raise BeatportFixtureError(f"cannot read {name!r}: {exc}") from exc


_cache: Dict[Tuple[str, float], BeatportFixture] = {}
_cache_lock = threading.Lock()


def _strings(value: object, what: str) -> Tuple[str, ...]:
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise BeatportFixtureError(f"{what} must be a list of strings")
    return tuple(value)


def _mapping(value: object, what: str) -> Dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in value.items()
    ):
        raise BeatportFixtureError(f"{what} must map URLs to file names")
    return dict(value)


def load(path: Path) -> BeatportFixture:
    """Read a fixture file.

    Raises:
        BeatportFixtureError: If the file is missing or not a fixture.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise BeatportFixtureError(f"cannot read {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise BeatportFixtureError("a fixture is a JSON object")
    raw_searches = data.get("searches")
    if raw_searches is None:
        raw_searches = []
    if not isinstance(raw_searches, list):
        raise BeatportFixtureError("searches must be a list")
    searches = []
    for entry in raw_searches:
        if not isinstance(entry, dict) or not isinstance(entry.get("contains"), str):
            raise BeatportFixtureError("each search needs a 'contains' text")
        contains = entry["contains"].strip().lower()
        if not contains:
            raise BeatportFixtureError("a search's 'contains' cannot be blank")
        searches.append(_Search(contains, _strings(entry.get("urls"), "urls")))
    return BeatportFixture(
        root=path.resolve().parent,
        searches=tuple(searches),
        pages=_mapping(data.get("pages"), "pages"),
        images=_mapping(data.get("images"), "images"),
    )


def active() -> Optional[BeatportFixture]:
    """The fixture the environment names, or None when it names none.

    Read again whenever the file changes, so a test can rewrite it between
    steps.
    """
    raw = os.environ.get(ENV_VAR, "").strip()
    if not raw:
        return None
    path = Path(raw)
    try:
        stamp = path.stat().st_mtime
    except OSError as exc:
        raise BeatportFixtureError(
            f"{ENV_VAR} names {raw}, which is not there"
        ) from exc
    key = (str(path.resolve()), stamp)
    with _cache_lock:
        fixture = _cache.get(key)
        if fixture is None:
            fixture = load(path)
            _cache.clear()
            _cache[key] = fixture
        return fixture


__all__ = ("ENV_VAR", "BeatportFixture", "BeatportFixtureError", "active", "load")
