#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A match candidate's audio preview, served by the engine (DEC-012, DEC-066).

The renderer never loads a remote URL: it asks the engine for a candidate's
preview and plays the bytes. This module is what the engine does to answer.

A candidate's preview URL is the sample its Beatport page named when the matcher
parsed it. A candidate stored before that was recorded has none, so its page is
read once through the same :class:`~cuepoint.services.artwork_service.FetchGate`
artwork uses and what it names is held in memory; the stored candidate is never
rewritten.

Every request is bounded and guarded:

- **HTTPS, on Beatport's sample host only** (:func:`cuepoint.data.beatport.is_beatport_media_url`),
  and a redirect is never followed.
- **At most** :data:`MAX_PREVIEW_BYTES`: a longer sample is refused, not truncated.
- **Timeouts** as an artwork download has, and the engine's one
  :class:`~cuepoint.services.artwork_service.FetchGate`, so Beatport traffic
  stays bounded across artwork and previews together and an offline failure is
  remembered once for both.
- **The last** :data:`PREVIEW_CACHE_SIZE` **previews are kept in memory**,
  nothing on disk.

Offline is an empty state, never an error: a failed request is remembered for
:data:`~cuepoint.services.artwork_service.RETRY_FAILED_AFTER_SECONDS`, and the
answer is nothing.
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable, Optional

from cuepoint.services.artwork_service import (
    BEATPORT_FETCH_TIMEOUT,
    FetchGate,
)
from cuepoint.services.interfaces import IMatchRepository

_logger = logging.getLogger(__name__)

#: The longest sample served. Beatport's samples are two minutes of low-bitrate
#: MP3, well under this; anything longer is not a sample.
MAX_PREVIEW_BYTES = 8 * 1024 * 1024

#: Previews kept in memory at once; the least recently used is forgotten first.
PREVIEW_CACHE_SIZE = 8

#: Seconds to connect and to read a preview, as artwork has.
PREVIEW_FETCH_TIMEOUT = BEATPORT_FETCH_TIMEOUT

#: Candidates whose page was read, remembered at once.
_PAGE_MEMORY_LIMIT = 512

#: Preview requests in flight at once.
PREVIEW_FETCH_WORKERS = 2

#: The content type a preview is served as when the upstream names none.
DEFAULT_CONTENT_TYPE = "audio/mpeg"


@dataclass(frozen=True)
class PreviewAudio:
    """A preview's bytes, and the audio content type to label them with."""

    data: bytes
    content_type: str = DEFAULT_CONTENT_TYPE


#: Downloads a preview; returns it, or None when it could not.
PreviewFetcher = Callable[[str], Optional[PreviewAudio]]

#: Reads a Beatport track page; returns the sample it names, "" for none, or
#: None when the page could not be read.
PagePreviewLookup = Callable[[str], Optional[str]]


def fetch_preview(url: str) -> Optional[PreviewAudio]:
    """Download a preview from Beatport, no further than the cap allows.

    Returns the audio, labelled with the upstream ``audio/*`` content type or
    ``audio/mpeg``, or None when it could not be downloaded or is not an
    acceptable sample: off Beatport's sample host, not audio, empty, or longer
    than :data:`MAX_PREVIEW_BYTES`. Redirects are not followed.
    """
    from cuepoint.data.beatport import beatport_request_url
    from cuepoint.models.config import HEADERS

    # The URL requested is rebuilt from the parts that were checked.
    target = beatport_request_url(url, media=True)
    if target is None:
        return None
    from cuepoint.data import beatport_fixture

    fixture = beatport_fixture.active()
    if fixture is not None:
        # End-to-end tests answer from files (CLEAN-14).
        listed = fixture.preview(target)
        return None if listed is None else PreviewAudio(listed)
    try:
        import requests

        with requests.get(
            target,
            headers=HEADERS,
            timeout=PREVIEW_FETCH_TIMEOUT,
            stream=True,
            allow_redirects=False,
        ) as response:
            if response.status_code != 200:
                return None
            kind = str(response.headers.get("Content-Type") or "").lower()
            kind = kind.split(";", 1)[0].strip()
            if kind and not kind.startswith(("audio/", "application/octet-stream")):
                return None
            label = kind if kind.startswith("audio/") else DEFAULT_CONTENT_TYPE
            declared = str(response.headers.get("Content-Length") or "")
            if declared.isdigit() and int(declared) > MAX_PREVIEW_BYTES:
                return None
            chunks: list[bytes] = []
            received = 0
            for chunk in response.iter_content(64 * 1024):
                chunks.append(chunk)
                received += len(chunk)
                if received > MAX_PREVIEW_BYTES:
                    return None
            data = b"".join(chunks)
            return PreviewAudio(data, label) if data else None
    except Exception as exc:  # noqa: BLE001 — offline is an empty state
        _logger.debug("[preview] could not fetch %s: %s", target, exc)
        return None


def lookup_page_preview(page_url: str) -> Optional[str]:
    """The sample a Beatport track page names: a URL, "" for none, None if unread."""
    from cuepoint.data.beatport import request_html, sample_url_from_page

    try:
        soup = request_html(page_url)
    except Exception as exc:  # noqa: BLE001 — offline is an empty state
        _logger.debug("[preview] could not read %s: %s", page_url, exc)
        return None
    if soup is None:
        return None
    return sample_url_from_page(soup) or ""


class CandidatePreviewService:
    """Serves a candidate's preview as bytes, remembering the last few."""

    def __init__(
        self,
        match_repository: IMatchRepository,
        *,
        gate: Optional[FetchGate] = None,
        fetcher: PreviewFetcher = fetch_preview,
        page_lookup: PagePreviewLookup = lookup_page_preview,
        limit: int = PREVIEW_CACHE_SIZE,
    ) -> None:
        """Store collaborators.

        ``fetcher`` and ``page_lookup`` are where the service meets the network;
        tests replace them, so no test reaches Beatport.

        Raises:
            ValueError: If ``limit`` is not positive.
        """
        if limit <= 0:
            raise ValueError("A preview cache needs a positive size")
        self._matches = match_repository
        self._gate = (
            gate if gate is not None else FetchGate(workers=PREVIEW_FETCH_WORKERS)
        )
        self._fetch = fetcher
        self._lookup_page = page_lookup
        self._limit = int(limit)
        self._lock = threading.Lock()
        self._previews: "OrderedDict[int, PreviewAudio]" = OrderedDict()
        self._pages: "OrderedDict[str, str]" = OrderedDict()

    def preview(self, candidate_id: int) -> Optional[PreviewAudio]:
        """A candidate's preview audio, or None when it has none.

        Raises:
            LookupError: If there is no such candidate.
        """
        from cuepoint.data.beatport import is_beatport_media_url

        cid = int(candidate_id)
        with self._lock:
            kept = self._previews.get(cid)
            if kept is not None:
                self._previews.move_to_end(cid)
                return kept
        found = self._matches.get_candidate(cid)
        if found is None:
            raise LookupError(f"There is no match candidate {candidate_id}")
        source = found.preview_url or self._page_preview(found.url)
        if not source or not is_beatport_media_url(source):
            return None
        data = self._gate.run(f"preview:{source}", lambda: self._fetch(source))
        if data is None:
            return None
        with self._lock:
            self._previews[cid] = data
            self._previews.move_to_end(cid)
            while len(self._previews) > self._limit:
                self._previews.popitem(last=False)
        return data

    def _page_preview(self, page_url: str) -> Optional[str]:
        """The sample a candidate's page names, read once and held in memory."""
        with self._lock:
            if page_url in self._pages:
                return self._pages[page_url]
        looked = self._gate.run(
            f"page-preview:{page_url}", lambda: self._lookup_page(page_url)
        )
        if looked is None:
            return None
        with self._lock:
            self._pages[page_url] = looked
            self._pages.move_to_end(page_url)
            while len(self._pages) > _PAGE_MEMORY_LIMIT:
                self._pages.popitem(last=False)
        return looked


_shared_lock = threading.Lock()
_shared: Optional[tuple[object, CandidatePreviewService]] = None


def shared_preview_service() -> CandidatePreviewService:
    """The engine's one preview service, over the container's candidates.

    It goes through the artwork service's gate, so Beatport requests for
    artwork and previews are bounded together.

    One per container, so the last eight previews are kept across requests; a
    new container (a new library) starts a new one.
    """
    global _shared
    from cuepoint.utils.di_container import get_container

    container = get_container()
    with _shared_lock:
        if _shared is None or _shared[0] is not container:
            from cuepoint.services.interfaces import IArtworkService

            _shared = (
                container,
                CandidatePreviewService(
                    container.resolve(IMatchRepository),
                    gate=getattr(container.resolve(IArtworkService), "gate", None),
                    fetcher=fetch_preview,
                    page_lookup=lookup_page_preview,
                ),
            )
        return _shared[1]


__all__ = (
    "MAX_PREVIEW_BYTES",
    "PREVIEW_CACHE_SIZE",
    "PREVIEW_FETCH_TIMEOUT",
    "CandidatePreviewService",
    "PreviewAudio",
    "fetch_preview",
    "lookup_page_preview",
    "shared_preview_service",
)
