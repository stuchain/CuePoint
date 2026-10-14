"""Clean's Beatport search, through the signed-in catalog API.

Beatport's website answers CuePoint's searches with a Cloudflare challenge, so the
matcher's candidates now come from ``GET /catalog/search/`` with the sign-in the
engine already holds (:mod:`~cuepoint.services.beatport_token`). Each track the
API returns becomes a :class:`~cuepoint.data.catalog_search.CatalogHit` with the
fields a track page would have given (and the preview and artwork it names), so
the matcher scores it exactly as before and fetches no page.

Requests go through :class:`BeatportApiClient`, so they share the engine's
request gate (four in flight at most). A search waits at most
:data:`SEARCH_TIMEOUT_SECONDS` and is not retried after a timeout, so a dead
connection costs seconds. A 429 is waited out once, for at most
:data:`MAX_RATE_LIMIT_WAIT_SECONDS`, and every search shares that wait. Failures
are raised as :class:`CatalogSearchError` with a ``search_health`` kind, and with
a ``cooldown`` when they will repeat for every track.

The shape of ``/catalog/search/`` is read defensively: tracks may arrive as
``{"tracks": [...]}``, ``{"tracks": {"results": [...]}}`` or
``{"results": [{"type": "track", ...}]}``. When the answer has no tracks part at
all (or Beatport answers the question with a plain 4xx), ``/catalog/tracks/?name=``
is asked instead; a 4xx there is "no results". Tracks that arrive but cannot be
read are a failed search, not an empty one.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from typing import Any, Callable, Dict, List, Optional

import requests

from cuepoint.data import search_health
from cuepoint.data.beatport import is_beatport_artwork_url
from cuepoint.data.catalog_search import (
    CatalogHit,
    CatalogSearchError,
    TrackDetails,
)
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.beatport_api_client import (
    ERROR_FORBIDDEN,
    ERROR_NO_TOKEN,
    ERROR_RATE_LIMITED,
    ERROR_REJECTED,
    BeatportApiClient,
    classify_beatport_error,
)
from cuepoint.services.beatport_api_models import CatalogTrack
from cuepoint.services.beatport_catalog import page_items, parse_catalog_track
from cuepoint.services.beatport_token import resolve_access_token

_logger = logging.getLogger(__name__)

#: The longest one search request may take.
SEARCH_TIMEOUT_SECONDS = 8.0

#: The longest a search waits for a rate limit to lift before it fails.
MAX_RATE_LIMIT_WAIT_SECONDS = 30.0

#: Seconds a refusal that repeats pauses further searches.
COOLDOWN_SECONDS = 120.0

#: Seconds a timeout, lost connection or run of server errors pauses searches.
TRANSIENT_COOLDOWN_SECONDS = 30.0

#: Server errors in a row before the API counts as down.
UNAVAILABLE_STREAK = 3

#: The most tracks one search asks for.
MAX_PER_PAGE = 50

_DEFAULT_BASE_URL = "https://api.beatport.com/v4"

_unreadable_logged = False


def track_details(track: CatalogTrack) -> TrackDetails:
    """What ``parse_track_page`` would return for ``track``'s page."""
    title = track.title
    if track.mix_name:
        title = f"{title} ({track.mix_name})"
    names: List[str] = []
    for artist in (*track.artists, *track.remixers):
        if artist.name not in names:
            names.append(artist.name)
    bpm: Optional[str] = None
    if track.bpm is not None:
        bpm = str(int(track.bpm)) if float(track.bpm).is_integer() else str(track.bpm)
    year = int(track.release_date[:4]) if track.release_date else None
    return (
        title,
        ", ".join(names),
        track.key,
        year,
        bpm,
        track.label_name,
        track.genre_name,
        track.release_name,
        track.release_date,
    )


def _track_objects(data: Any) -> Optional[List[Dict[str, Any]]]:
    """The track objects in a search answer, or None when it has no tracks part."""
    if not isinstance(data, dict):
        return None
    if "tracks" in data:
        tracks = data["tracks"]
        if isinstance(tracks, list):
            return [t for t in tracks if isinstance(t, dict)]
        items, _ = page_items(tracks)
        return items
    results = data.get("results")
    if isinstance(results, list):
        return [
            item
            for item in results
            if isinstance(item, dict)
            and (item.get("type") in ("track", "tracks") or "mix_name" in item)
        ]
    return None


def _artwork_url(item: Dict[str, Any]) -> Optional[str]:
    """The release artwork a catalog track names, if it is a Beatport image."""
    for holder in (item.get("release"), item):
        image = holder.get("image") if isinstance(holder, dict) else None
        if isinstance(image, dict):
            uri = image.get("uri")
            if isinstance(uri, str) and is_beatport_artwork_url(uri):
                return uri.strip()
    return None


class BeatportCatalogSearch:
    """:class:`~cuepoint.data.catalog_search.CatalogSearchProvider` over the API."""

    def __init__(
        self,
        config_service: Any = None,
        session: Optional[requests.Session] = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._config = config_service
        self._session = session if session is not None else requests.Session()
        self._sleep = sleep
        self._clock = clock
        self._lock = threading.Lock()
        self._refused_token: Optional[str] = None
        self._resume_at = 0.0
        self._unavailable_streak = 0

    # ------------------------------------------------------------ provider

    def available(self) -> bool:
        """True when a sign-in exists. Forgets a refusal once the token changes."""
        token, _source = resolve_access_token(self._config)
        if not token:
            return False
        with self._lock:
            if self._refused_token is not None and self._refused_token != self._digest(
                token
            ):
                # Decided and cleared together, so a sign-in racing a refusal
                # can neither keep a stale pause nor drop a fresh one.
                self._refused_token = None
                search_health.clear(search_health.BACKEND_BEATPORT_API)
        return True

    def search(self, query: str, max_results: int) -> List[CatalogHit]:
        text = (query or "").strip()
        if not text:
            return []
        token, _source = resolve_access_token(self._config)
        if not token:
            raise CatalogSearchError(
                search_health.KIND_SIGNED_OUT, "no sign-in", cooldown=COOLDOWN_SECONDS
            )
        client = BeatportApiClient(
            base_url=self._base_url(),
            access_token=token,
            timeout=int(SEARCH_TIMEOUT_SECONDS),
            session=self._session,
            sleep=self._sleep,
        )
        per_page = max(10, min(int(max_results or 10), MAX_PER_PAGE))
        items = self._items(client, text, per_page, token)
        hits: List[CatalogHit] = []
        seen = set()
        for item in items:
            track = parse_catalog_track(item)
            if track is None or track.url in seen:
                continue
            seen.add(track.url)
            hits.append(
                CatalogHit(
                    url=track.url,
                    details=track_details(track),
                    preview_url=track.sample_url,
                    artwork_url=_artwork_url(item),
                )
            )
            if len(hits) >= max_results:
                break
        if items and not hits:
            self._log_unreadable()
            raise CatalogSearchError(
                search_health.KIND_UNAVAILABLE, "unreadable answer"
            )
        return hits

    # ------------------------------------------------------------- helpers

    def _items(
        self, client: BeatportApiClient, text: str, per_page: int, token: str
    ) -> List[Dict[str, Any]]:
        """Ask, waiting out one rate limit, and turn failures into search errors."""
        attempt = 0
        while True:
            attempt += 1
            self._wait_for_rate_limit()
            try:
                items = self._ask(client, text, per_page)
            except BeatportAPIError as exc:
                error = self._as_search_error(exc, token)
                if error.kind == search_health.KIND_RATE_LIMITED and attempt == 1:
                    self._note_rate_limit(error.retry_after)
                    continue
                raise error from exc
            except requests.exceptions.RequestException as exc:
                raise CatalogSearchError(
                    search_health.KIND_NETWORK,
                    type(exc).__name__,
                    cooldown=TRANSIENT_COOLDOWN_SECONDS,
                ) from exc
            with self._lock:
                self._unavailable_streak = 0
            return items

    def _note_rate_limit(self, retry_after: Optional[float]) -> None:
        wait = min(
            MAX_RATE_LIMIT_WAIT_SECONDS,
            retry_after if retry_after is not None else 2.0,
        )
        with self._lock:
            self._resume_at = max(self._resume_at, self._clock() + wait)

    def _wait_for_rate_limit(self) -> None:
        """Every search waits out a limit one of them met, instead of repeating it."""
        with self._lock:
            wait = self._resume_at - self._clock()
        if wait > 0:
            self._sleep(min(wait, MAX_RATE_LIMIT_WAIT_SECONDS))

    def _ask(
        self, client: BeatportApiClient, text: str, per_page: int
    ) -> List[Dict[str, Any]]:
        items: Optional[List[Dict[str, Any]]] = None
        try:
            data = client.get(
                "/catalog/search/",
                params={"q": text, "type": "tracks", "per_page": per_page},
                timeout=SEARCH_TIMEOUT_SECONDS,
                retry_on_timeout=False,
            )
            items = _track_objects(data)
        except BeatportAPIError as exc:
            if not self._is_plain_client_error(exc):
                raise
        if items is not None:
            return items
        _logger.info("Beatport catalog search had no tracks part; asking tracks")
        try:
            data = client.get(
                "/catalog/tracks/",
                params={"name": text, "per_page": per_page},
                timeout=SEARCH_TIMEOUT_SECONDS,
                retry_on_timeout=False,
            )
        except BeatportAPIError as exc:
            if self._is_plain_client_error(exc):
                return []  # a question Beatport cannot answer is no results
            raise
        listed, _ = page_items(data)
        return listed

    @staticmethod
    def _is_plain_client_error(exc: BeatportAPIError) -> bool:
        """A 4xx that is neither a refused sign-in nor a rate limit."""
        status = exc.status_code or 0
        return 400 <= status < 500 and status not in (401, 403, 429)

    def _base_url(self) -> str:
        configured = ""
        if self._config is not None:
            configured = str(
                self._config.get("incrate.beatport_api_base_url") or ""
            ).strip()
        return configured or _DEFAULT_BASE_URL

    @staticmethod
    def _digest(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _log_unreadable() -> None:
        global _unreadable_logged
        if not _unreadable_logged:
            _unreadable_logged = True
            _logger.warning(
                "Beatport catalog search returned tracks CuePoint could not read"
            )

    def _as_search_error(self, exc: BeatportAPIError, token: str) -> CatalogSearchError:
        error_class = classify_beatport_error(exc)
        if exc.error_code == "BEATPORT_API_BLOCKED":
            return CatalogSearchError(
                search_health.KIND_BLOCKED, "HTTP 403", cooldown=COOLDOWN_SECONDS
            )
        if error_class in (ERROR_NO_TOKEN, ERROR_REJECTED, ERROR_FORBIDDEN):
            with self._lock:
                self._refused_token = self._digest(token)
            return CatalogSearchError(
                search_health.KIND_SIGNED_OUT,
                f"HTTP {exc.status_code or 401}",
                cooldown=COOLDOWN_SECONDS,
            )
        if error_class == ERROR_RATE_LIMITED:
            return CatalogSearchError(
                search_health.KIND_RATE_LIMITED,
                "HTTP 429",
                retry_after=exc.retry_after,
                cooldown=min(
                    MAX_RATE_LIMIT_WAIT_SECONDS,
                    exc.retry_after if exc.retry_after is not None else 30.0,
                ),
            )
        if exc.error_code == "BEATPORT_API_TIMEOUT":
            return CatalogSearchError(
                search_health.KIND_TIMEOUT,
                "API timeout",
                cooldown=TRANSIENT_COOLDOWN_SECONDS,
            )
        status = exc.status_code
        if not status:
            return CatalogSearchError(
                search_health.KIND_NETWORK,
                "no answer",
                cooldown=TRANSIENT_COOLDOWN_SECONDS,
            )
        error = CatalogSearchError(search_health.KIND_UNAVAILABLE, f"HTTP {status}")
        with self._lock:
            self._unavailable_streak += 1
            if self._unavailable_streak >= UNAVAILABLE_STREAK:
                error.cooldown = TRANSIENT_COOLDOWN_SECONDS
        return error


__all__ = ("BeatportCatalogSearch", "SEARCH_TIMEOUT_SECONDS", "track_details")
