#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Beatport answered from files, for end-to-end tests (CLEAN-14).

A test must never reach Beatport, and an end-to-end journey still has to see a
match accepted and another left for review. ``CUEPOINT_SKIP_BEATPORT`` answers
every search with nothing, which can show neither. ``CUEPOINT_BEATPORT_FIXTURE``
names a JSON file instead, and the four places CuePoint reaches Beatport answer
from it:

- a search (:func:`cuepoint.data.beatport.track_urls`),
- a track page (:func:`cuepoint.data.beatport.request_html`),
- an image (:func:`cuepoint.services.artwork_service.fetch_image`), and
- a v4 API request (:class:`cuepoint.services.beatport_api_client.BeatportApiClient`),
  which Discover makes (DISCOVER-10).

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
      "images": {"https://geo-media.beatport.com/image_size/500x500/c.jpg": "c.jpg"},
      "api": [
        {"path": "catalog/charts", "params": {"genre_id": 5}, "body": {"results": []}},
        {"method": "POST", "path": "my/playlists", "status": 403, "body": {}}
      ]
    }

A search answers the URLs of every entry whose ``contains`` appears in the
query, ignoring case, in the order listed and each once. A page or image the
file does not list answers as a page that is gone does: nothing. Paths are
relative to the file and must stay inside its folder.

An API request answers from the first ``api`` entry with its method (``GET``
when left out) and path (slashes at either end ignored) whose every listed
``params`` — or, for a POST, ``json`` — equals the request's, compared as text.
What an entry does not list is not compared, so an entry can ignore the dates a
request computes from today. It answers ``status`` (200 when left out) with
``body`` as JSON, and ``headers`` if it lists any, so a refusal — a 401, a 429
with its ``Retry-After`` — reaches the client as Beatport's own would. An entry
can hold its answer back for ``delay_ms`` (at most :data:`MAX_DELAY_MS`), so a
job asking it runs long enough to be watched. A request
no entry answers is a 404, as an unknown path on Beatport is. With a fixture
active, no API request reaches the network, whatever the file lists.

A string in a ``body`` that is exactly ``{{today}}`` or ``{{today-N}}`` answers
as that day's date, ``YYYY-MM-DD``, counted when the answer is sent
(DISCOVER-12). A page of an artist's recent releases keeps only tracks dated
inside its window, so a fixture with fixed dates would stop passing as the
calendar moved; a relative one never does.
"""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Tuple

#: The variable naming the fixture file.
ENV_VAR = "CUEPOINT_BEATPORT_FIXTURE"


class BeatportFixtureError(ValueError):
    """The fixture file cannot be used. Raised loudly: a test must not pass on
    a stub that silently answered nothing."""


@dataclass(frozen=True)
class _Search:
    contains: str
    urls: Tuple[str, ...]


#: The methods an API entry can answer: the two ``BeatportApiClient`` sends.
API_METHODS = ("GET", "POST")

#: What a request no entry answers gets: Beatport's own answer to a path it
#: does not have.
UNLISTED_STATUS = 404

#: The keys an API entry may have. Anything else is a typo that would
#: otherwise be ignored, and an entry that silently matches more than meant.
_API_KEYS = frozenset(
    {"method", "path", "params", "json", "status", "body", "headers", "delay_ms"}
)

#: A body string naming a day relative to today: ``{{today}}``, ``{{today-10}}``.
_RELATIVE_DAY = re.compile(r"^\{\{today(?:-(\d{1,4}))?\}\}$")


def _dated(value: Any, today: date) -> Any:
    """``value`` with every relative day in it written as that day's date."""
    if isinstance(value, str):
        found = _RELATIVE_DAY.match(value)
        if found is None:
            return value
        return (today - timedelta(days=int(found.group(1) or 0))).isoformat()
    if isinstance(value, list):
        return [_dated(item, today) for item in value]
    if isinstance(value, dict):
        return {key: _dated(item, today) for key, item in value.items()}
    return value


#: The longest an answer may be held back. Long enough for an end-to-end
#: test to watch a job run; short enough that a typo cannot hang one.
MAX_DELAY_MS = 30_000


@dataclass(frozen=True)
class ApiAnswer:
    """One v4 API answer: a status, a JSON body, and any headers."""

    status: int
    body: Any
    headers: Dict[str, str] = field(default_factory=dict)
    #: How long to hold the answer back, so a job asking it can be watched
    #: while it runs rather than finishing faster than anything can look.
    delay_ms: int = 0

    def content(self, today: Optional[date] = None) -> bytes:
        """The body as the wire carries it, relative days written as dates."""
        return json.dumps(_dated(self.body, today or date.today())).encode("utf-8")


@dataclass(frozen=True)
class _ApiEntry:
    method: str
    path: str
    match: Tuple[Tuple[str, str], ...]
    answer: ApiAnswer

    def answers(self, method: str, path: str, sent: Mapping[str, Any]) -> bool:
        if method != self.method or path != self.path:
            return False
        return all(
            key in sent and _text(sent[key]) == wanted for key, wanted in self.match
        )


def _text(value: Any) -> str:
    """A value as a query string carries it; a bool as JSON spells it."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _api_path(path: str) -> str:
    return path.strip().strip("/")


@dataclass(frozen=True)
class BeatportFixture:
    """A fixture file, read."""

    root: Path
    searches: Tuple[_Search, ...]
    pages: Dict[str, str]
    images: Dict[str, str]
    api: Tuple[_ApiEntry, ...] = ()

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

    def api_answer(
        self,
        method: str,
        path: str,
        params: Optional[Mapping[str, Any]] = None,
        body: Optional[Mapping[str, Any]] = None,
    ) -> ApiAnswer:
        """The answer to one v4 API request: the first entry's, or a 404."""
        wanted = method.upper()
        sent = (body if wanted == "POST" else params) or {}
        route = _api_path(path)
        for entry in self.api:
            if entry.answers(wanted, route, sent):
                return entry.answer
        return ApiAnswer(UNLISTED_STATUS, {"detail": "Not found."})

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


def _headers(value: object) -> Dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in value.items()
    ):
        raise BeatportFixtureError("headers must map names to text")
    return dict(value)


def _api_entry(entry: object) -> _ApiEntry:
    if not isinstance(entry, dict):
        raise BeatportFixtureError("each api entry is an object")
    unknown = set(entry) - _API_KEYS
    if unknown:
        raise BeatportFixtureError(
            f"an api entry does not take {', '.join(sorted(unknown))}"
        )
    method = entry.get("method", "GET")
    if not isinstance(method, str) or method.upper() not in API_METHODS:
        raise BeatportFixtureError("an api entry's method is GET or POST")
    method = method.upper()
    path = entry.get("path")
    if not isinstance(path, str) or not _api_path(path):
        raise BeatportFixtureError("each api entry needs a 'path'")
    key, other = ("json", "params") if method == "POST" else ("params", "json")
    if other in entry:
        raise BeatportFixtureError(
            f"a {method} entry matches on '{key}', not '{other}'"
        )
    match = entry.get(key)
    if match is None:
        match = {}
    if not isinstance(match, dict) or not all(
        isinstance(k, str) and isinstance(v, (str, int, float, bool))
        for k, v in match.items()
    ):
        raise BeatportFixtureError(f"'{key}' must map names to plain values")
    delay = entry.get("delay_ms", 0)
    if isinstance(delay, bool) or not isinstance(delay, int):
        raise BeatportFixtureError("an api entry's delay_ms is a whole number")
    if not 0 <= delay <= MAX_DELAY_MS:
        raise BeatportFixtureError(f"an api entry's delay_ms is 0 to {MAX_DELAY_MS}")
    status = entry.get("status", 200)
    if isinstance(status, bool) or not isinstance(status, int):
        raise BeatportFixtureError("an api entry's status is a whole number")
    if not 100 <= status <= 599:
        raise BeatportFixtureError("an api entry's status is an HTTP status")
    return _ApiEntry(
        method=method,
        path=_api_path(path),
        match=tuple((k, _text(v)) for k, v in match.items()),
        answer=ApiAnswer(
            status, entry.get("body"), _headers(entry.get("headers")), delay
        ),
    )


def _api_entries(value: object) -> Tuple[_ApiEntry, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise BeatportFixtureError("api must be a list")
    return tuple(_api_entry(entry) for entry in value)


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
        api=_api_entries(data.get("api")),
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


__all__ = (
    "API_METHODS",
    "ENV_VAR",
    "MAX_DELAY_MS",
    "UNLISTED_STATUS",
    "ApiAnswer",
    "BeatportFixture",
    "BeatportFixtureError",
    "active",
    "load",
)
