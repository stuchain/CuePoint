"""The hook through which Clean's matcher searches Beatport's signed-in catalog.

The matcher used to find candidates by asking DuckDuckGo and by scraping
Beatport's website, and by reading each candidate's page. Beatport's website now
answers those requests with a Cloudflare challenge, so a search that works has to
go through the signed-in API, which this layer must not import (``data`` sits
below ``services``). So the services register a provider here, and
:func:`~cuepoint.data.beatport.track_urls` asks it first.

A provider answers with :class:`CatalogHit` objects that already carry what a
candidate's page would have given (title, artists, key, year, BPM, label, genre,
release), so scoring is unchanged and no page is fetched for them.

``provider.available()`` is False when there is no sign-in; the website path then
runs as before. Failures are raised as :class:`CatalogSearchError` with a
:mod:`~cuepoint.data.search_health` kind, so a failed search is never mistaken for
a track Beatport does not have.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import List, Optional, Protocol, Tuple

#: What ``parse_track_page`` returns: title, artists, key, year, bpm, label,
#: genres, release name, release date.
TrackDetails = Tuple[
    str,
    str,
    Optional[str],
    Optional[int],
    Optional[str],
    Optional[str],
    Optional[str],
    Optional[str],
    Optional[str],
]


@dataclass(frozen=True)
class CatalogHit:
    """One track a catalog search found, with the details its page would give."""

    url: str
    details: TrackDetails
    preview_url: Optional[str] = None
    artwork_url: Optional[str] = None


class CatalogSearchError(Exception):
    """A catalog search that failed, as a ``search_health`` kind."""

    def __init__(
        self,
        kind: str,
        detail: str = "",
        retry_after: Optional[float] = None,
        cooldown: Optional[float] = None,
    ) -> None:
        super().__init__(f"{kind}: {detail}" if detail else kind)
        self.kind = kind
        self.detail = detail
        self.retry_after = retry_after
        #: Seconds to stop searching for, when the failure will repeat.
        self.cooldown = cooldown


class CatalogSearchProvider(Protocol):
    """Searches the signed-in catalog. Registered by the services."""

    def available(self) -> bool:
        """True when a sign-in exists to search with."""
        ...

    def search(self, query: str, max_results: int) -> List[CatalogHit]:
        """Return the tracks matching plain ``query``, best first.

        Raises:
            CatalogSearchError: When the search itself failed.
        """
        ...


_lock = threading.Lock()
_provider: Optional[CatalogSearchProvider] = None

#: Details of tracks a search returned, by URL, so scoring them needs no page.
_PREFETCHED_LIMIT = 5000
_prefetched: "OrderedDict[str, TrackDetails]" = OrderedDict()


def set_provider(provider: Optional[CatalogSearchProvider]) -> None:
    """Register the provider (None removes it). The services call this once."""
    global _provider
    with _lock:
        _provider = provider


def get_provider() -> Optional[CatalogSearchProvider]:
    with _lock:
        return _provider


def remember(hits: List[CatalogHit]) -> None:
    """Keep the details of ``hits`` for :func:`prefetched`."""
    with _lock:
        for hit in hits:
            _prefetched[hit.url] = hit.details
            _prefetched.move_to_end(hit.url)
        while len(_prefetched) > _PREFETCHED_LIMIT:
            _prefetched.popitem(last=False)


def prefetched(url: str) -> Optional[TrackDetails]:
    """Details a catalog search already returned for ``url``, or None."""
    with _lock:
        return _prefetched.get(url)


def clear_prefetched() -> None:
    with _lock:
        _prefetched.clear()


def plain_query(query: str) -> str:
    """The search words of a query, without a ``site:`` prefix or double quotes."""
    text = query or ""
    if "site:beatport.com" in text.lower():
        text = text.split("site:beatport.com", 1)[1].strip()
        if text.startswith("/track"):
            text = text[6:]
    return " ".join(text.replace('"', " ").split())


__all__ = (
    "CatalogHit",
    "CatalogSearchError",
    "CatalogSearchProvider",
    "TrackDetails",
    "clear_prefetched",
    "get_provider",
    "plain_query",
    "prefetched",
    "remember",
    "set_provider",
)
