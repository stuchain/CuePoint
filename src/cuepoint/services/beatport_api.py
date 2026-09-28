"""The Beatport v4 catalog and playlists that Discover reads and writes.

Tracks, artists and labels by id, an artist's or label's recent tracks,
charts and a chart's tracks, genres, a label search, and playlist creation
(DISCOVER-01, DISCOVER-05, DISCOVER-06, DISCOVER-09). Every response is parsed
by ``services/beatport_catalog.py``, one shape each, into the ``Catalog*``
models that keep every id. inCrate's parsers, which guessed between several
nestings and dropped the ids, retired with it in DISCOVER-12.

The route map, established against the live API — its router answers 404 for
a path it lacks and 401 for one it has, before it checks a token:

- ``catalog/tracks/{id}/``, ``catalog/tracks/`` (filters ``artist_id``,
  ``label_id``), ``catalog/artists/{id}/``, ``catalog/labels/{id}/``,
  ``catalog/charts/{id}/tracks/``, ``my/playlists/`` and
  ``my/playlists/{id}/tracks/`` exist.
- ``catalog/artists/{id}/charts/``, ``catalog/labels/{id}/charts/``,
  ``catalog/labels/{id}/tracks/`` and the ``top-10-tracks`` routes do not.
  So there is no listing of charts by artist or by label, and nothing here
  offers one.
- Every path wants its trailing slash; without it Beatport answers 301.
"""

import logging
import re
from datetime import date
from typing import Any, Dict, Iterable, Iterator, List, Optional

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.beatport_api_models import (
    CatalogArtist,
    CatalogChart,
    CatalogLabel,
    CatalogTrack,
    Genre,
)
from cuepoint.services.beatport_api_client import BeatportApiClient
from cuepoint.services.beatport_catalog import (
    BEATPORT_WEB_BASE,
    catalog_text,
    page_items,
    parse_catalog_artist,
    parse_catalog_chart,
    parse_catalog_genre,
    parse_catalog_label,
    parse_catalog_track,
    positive_id,
)

_logger = logging.getLogger(__name__)

#: Beatport's largest page.
MAX_PER_PAGE = 100
#: Most pages one listing reads, so one call cannot page forever.
MAX_LISTING_PAGES = 10
#: Ids asked for in one batched track lookup.
TRACK_BATCH_SIZE = MAX_PER_PAGE

#: Where a playlist of the user's own lives on the website. No API response
#: names it; it is the page the website itself opens for a playlist.
PLAYLIST_WEB_BASE = f"{BEATPORT_WEB_BASE}/library/playlists"
_PLAYLIST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Cache key prefixes and TTLs. The genre key is DISCOVER-09's whole listing;
# inCrate's first-page key, ``beatport_api:genres``, retired with it.
_CACHE_CATALOG_GENRES = "beatport_api:catalog_genres"
_CACHE_GENRES_TTL = 86400
_CACHE_LABEL_SEARCH = "beatport_api:label_search"
_CACHE_LABEL_SEARCH_TTL = 3600


class BeatportApi:
    """The Beatport v4 catalog and playlists, over one authenticated client."""

    def __init__(
        self,
        client: BeatportApiClient,
        cache_service: Optional[Any] = None,
    ):
        self._client = client
        self._cache = cache_service
        # Whether ``catalog/tracks/?id=a,b,c`` answers exactly the tracks it
        # was asked for: None until a lookup has shown it, then True or False.
        self._batch_lookup: Optional[bool] = None
        self._playlist_web_urls: Dict[str, str] = {}

    def _search_label_via_catalog_search(self, name: str) -> Optional[int]:
        """Try GET /catalog/search?q=... to find labels; return first matching label id or None."""
        query = (name or "").strip()
        if not query:
            return None
        # Try catalog search endpoint (often returns relevant labels first)
        for param_q in [query, query.lower().replace(" ", "-")]:
            data = self._client.get(
                "/catalog/search", params={"q": param_q}
            ) or self._client.get("/catalog/search", params={"query": param_q})
            if data is None or not isinstance(data, dict):
                continue
            # Response may be { "labels": [...] }, { "labels": { "results": [...] } }, or { "results": [ { "type": "label", ... } ] }
            labels_raw: List[Dict[str, Any]] = []
            if "labels" in data:
                lab = data["labels"]
                if isinstance(lab, list):
                    labels_raw = [
                        r
                        for r in lab
                        if isinstance(r, dict) and r.get("id") is not None
                    ]
                elif isinstance(lab, dict) and "results" in lab:
                    labels_raw = [
                        r
                        for r in lab["results"]
                        if isinstance(r, dict) and r.get("id") is not None
                    ]
            if not labels_raw and "results" in data:
                for r in data["results"]:
                    if (
                        isinstance(r, dict)
                        and (r.get("type") == "label" or "slug" in r)
                        and r.get("id") is not None
                    ):
                        labels_raw.append(r)
            if not labels_raw:
                continue
            want_name = query.lower()
            want_slug = want_name.replace(" ", "-").replace("_", "-")
            for item in labels_raw:
                item_name = (
                    (item.get("name") or item.get("title") or "").strip().lower()
                )
                item_slug = (item.get("slug") or "").strip().lower().replace("_", "-")
                if item_name == want_name or (item_slug and item_slug == want_slug):
                    return int(item["id"])
                if want_name in item_name or item_name in want_name:
                    return int(item["id"])
            # First result if it looks like a name match (substring)
            if labels_raw:
                first_name = (
                    (labels_raw[0].get("name") or labels_raw[0].get("title") or "")
                    .strip()
                    .lower()
                )
                if want_name in first_name or first_name in want_name:
                    return int(labels_raw[0]["id"])
        return None

    def search_label_by_name(self, name: str) -> Optional[int]:
        """Resolve label name to id. Returns first match id or None. Cached 1h."""
        if not (name or "").strip():
            return None
        normalized = (name or "").strip().lower()
        cache_key = f"{_CACHE_LABEL_SEARCH}:{normalized}"
        if self._cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                _logger.info(
                    "Beatport API: search_label_by_name(%r) — cache hit, id=%s",
                    name[:50],
                    cached,
                )
                return positive_id(cached)
        _logger.info(
            "Beatport API: search_label_by_name(%r) — cache miss, fetching", name[:50]
        )
        # Prefer catalog search endpoint (returns relevant labels for the query)
        search_id = self._search_label_via_catalog_search(name)
        if search_id is not None:
            _logger.info(
                "Beatport API: search_label_by_name(%r) — found via /catalog/search, id=%s",
                name[:50],
                search_id,
            )
            if self._cache:
                self._cache.set(cache_key, search_id, ttl=_CACHE_LABEL_SEARCH_TTL)
            return search_id
        query = name.strip()
        raw_list: List[Dict[str, Any]] = []
        page = 1
        per_page = 50
        total_count: Optional[int] = None
        max_pages = 15  # fetch up to 15 pages (e.g. 750 results) to find a match
        while page <= max_pages:
            data = self._client.get(
                "/catalog/labels",
                params={"q": query, "per_page": per_page, "page": page},
            ) or self._client.get(
                "/labels",
                params={"q": query, "per_page": per_page, "page": page},
            )
            if data is None:
                if page == 1:
                    _logger.info(
                        "Beatport API: search_label_by_name(%r) — API returned no data",
                        name[:50],
                    )
                    if self._cache:
                        self._cache.set(cache_key, None, ttl=_CACHE_LABEL_SEARCH_TTL)
                    return None
                break
            if isinstance(data, dict) and page == 1:
                total_count = data.get("count")
                _logger.info(
                    "Beatport API: search_label_by_name(%r) — response count=%s, page=%s, per_page=%s",
                    name[:50],
                    total_count,
                    data.get("page"),
                    data.get("per_page"),
                )
            results = (
                data
                if isinstance(data, list)
                else (
                    data.get("labels") or data.get("results") or data.get("data") or []
                )
            )
            if isinstance(results, dict):
                results = results.get("labels", results.get("items", []))
            page_items = [
                r
                for r in (results if isinstance(results, list) else [])
                if isinstance(r, dict) and r.get("id") is not None
            ]
            if not page_items:
                break
            raw_list.extend(page_items)
            if page == 1 and raw_list:
                first = raw_list[0]
                _logger.info(
                    "Beatport API: search_label_by_name(%r) — first result name=%r, slug=%r",
                    name[:50],
                    first.get("name"),
                    first.get("slug"),
                )
            # If we have enough to find a match, or no more pages, stop fetching
            if len(page_items) < per_page:
                break
            if total_count is not None and len(raw_list) >= total_count:
                break
            page += 1
            _logger.debug(
                "Beatport API: search_label_by_name(%r) — fetching page %s (%s items so far)",
                name[:50],
                page,
                len(raw_list),
            )
        if not raw_list:
            _logger.info(
                "Beatport API: search_label_by_name(%r) — API returned 0 label items after %s page(s)",
                name[:50],
                page,
            )
            if self._cache:
                self._cache.set(cache_key, None, ttl=_CACHE_LABEL_SEARCH_TTL)
            return None
        want_name = (name or "").strip().lower()
        want_slug = want_name.replace(" ", "-").replace("_", "-")

        # Normalize for flexible match: remove punctuation like ":", collapse spaces
        def _norm(s: str) -> str:
            s = (s or "").strip().lower()
            for c in ".:-_":
                s = s.replace(c, " ")
            return " ".join(s.split())

        want_norm = _norm(want_name)
        for item in raw_list:
            item_name = (item.get("name") or item.get("title") or "").strip().lower()
            label_id = int(item["id"])
            if item_name == want_name:
                if self._cache:
                    self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                return label_id
        for item in raw_list:
            item_slug = (item.get("slug") or "").strip().lower().replace("_", "-")
            if item_slug and want_slug and item_slug == want_slug:
                label_id = int(item["id"])
                if self._cache:
                    self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                return label_id
        # Try slug-style query (e.g. "nothing-but") to get canonical label
        if want_slug != want_name:
            data2 = self._client.get(
                "/catalog/labels", params={"q": want_slug}
            ) or self._client.get("/labels", params={"q": want_slug})
            if data2:
                results2 = (
                    data2
                    if isinstance(data2, list)
                    else (
                        data2.get("labels")
                        or data2.get("results")
                        or data2.get("data")
                        or []
                    )
                )
                if isinstance(results2, dict):
                    results2 = results2.get("labels", results2.get("items", []))
                for item in results2 if isinstance(results2, list) else []:
                    if not isinstance(item, dict) or item.get("id") is None:
                        continue
                    item_slug = (
                        (item.get("slug") or "").strip().lower().replace("_", "-")
                    )
                    item_name = (
                        (item.get("name") or item.get("title") or "").strip().lower()
                    )
                    if item_slug == want_slug or item_name == want_name:
                        label_id = int(item["id"])
                        if self._cache:
                            self._cache.set(
                                cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL
                            )
                        return label_id
        # Substring match (either direction)
        for item in raw_list:
            item_name = (item.get("name") or item.get("title") or "").strip().lower()
            label_id = int(item["id"])
            if want_name in item_name or item_name in want_name:
                if self._cache:
                    self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                return label_id
        # Normalized match (e.g. "d:vision" vs "d vision" or "dvision")
        for item in raw_list:
            item_name = (item.get("name") or item.get("title") or "").strip().lower()
            item_norm = _norm(item_name)
            label_id = int(item["id"])
            if (
                want_norm == item_norm
                or want_norm in item_norm
                or item_norm in want_norm
            ):
                if self._cache:
                    self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                return label_id
        # Single result fallback: when API returns exactly one label for the query, use it
        if len(raw_list) == 1:
            label_id = int(raw_list[0]["id"])
            item_name = (
                raw_list[0].get("name") or raw_list[0].get("title") or ""
            ).strip()
            _logger.info(
                "Beatport API: search_label_by_name(%r) — no exact match, using single result id=%s name=%r",
                name[:50],
                label_id,
                item_name[:40],
            )
            if self._cache:
                self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
            return label_id
        _logger.info(
            "Beatport API: search_label_by_name(%r) — no match among %s results (sample: %s)",
            name[:50],
            len(raw_list),
            [(r.get("name") or r.get("title") or r.get("id")) for r in raw_list[:5]],
        )
        if self._cache:
            self._cache.set(cache_key, None, ttl=_CACHE_LABEL_SEARCH_TTL)
        return None

    # --- Catalog (DISCOVER-01) -------------------------------------------------

    def require_token(self) -> None:
        """Refuse, as ``no_token``, when no token is configured (DISCOVER-04).

        Raises:
            BeatportAPIError: Classified ``no_token`` by
                ``classify_beatport_error``.
        """
        self._client.require_token()

    def get_track(self, track_id: int) -> Optional[CatalogTrack]:
        """One catalog track by id, or None when Beatport has no such track."""
        tid = positive_id(track_id)
        if tid is None:
            return None
        return parse_catalog_track(self._client.get(f"/catalog/tracks/{tid}/"))

    def get_tracks(self, track_ids: Iterable[int]) -> List[CatalogTrack]:
        """Catalog tracks by id, in the order asked, leaving out any not found.

        Asks ``catalog/tracks/?id=a,b,c`` for up to :data:`TRACK_BATCH_SIZE` at
        a time, and checks the answer rather than trusting the filter: a batch
        that returns a track it was not asked for, or leaves out one that a
        single lookup finds, means the filter is not what it seems, and every
        lookup from then on is one request per track. Errors are raised, so a
        caller counting failures (DISCOVER-04) sees each one.
        """
        wanted: List[int] = []
        seen: set = set()
        for raw in track_ids:
            tid = positive_id(raw)
            if tid is not None and tid not in seen:
                seen.add(tid)
                wanted.append(tid)
        found: Dict[int, CatalogTrack] = {}
        for start in range(0, len(wanted), TRACK_BATCH_SIZE):
            chunk = wanted[start : start + TRACK_BATCH_SIZE]
            batch = self._get_tracks_batch(chunk) if len(chunk) > 1 else None
            if batch is None:
                batch = {}
                for tid in chunk:
                    track = self.get_track(tid)
                    if track is not None:
                        batch[tid] = track
            found.update(batch)
        return [found[tid] for tid in wanted if tid in found]

    def _get_tracks_batch(self, chunk: List[int]) -> Optional[Dict[int, CatalogTrack]]:
        """One batched lookup, or None when batching cannot be trusted."""
        if self._batch_lookup is False:
            return None
        try:
            data = self._client.get(
                "/catalog/tracks/",
                params={"id": ",".join(str(t) for t in chunk), "per_page": len(chunk)},
            )
        except BeatportAPIError as e:
            if e.status_code == 400:
                self._stop_batching("refused the id filter (400)")
                return None
            raise
        items, _ = page_items(data)
        found: Dict[int, CatalogTrack] = {}
        for item in items:
            track = parse_catalog_track(item)
            if track is not None:
                found[track.id] = track
        asked = set(chunk)
        if any(tid not in asked for tid in found):
            self._stop_batching("answered tracks it was not asked for")
            return None
        if self._batch_lookup is None:
            missing = [tid for tid in chunk if tid not in found]
            if missing and self.get_track(missing[0]) is not None:
                self._stop_batching("left out a track a single lookup finds")
                return None
            if found:
                self._batch_lookup = True
        return found

    def _stop_batching(self, reason: str) -> None:
        _logger.warning(
            "Beatport API: batched track lookup %s; looking tracks up one at a time",
            reason,
        )
        self._batch_lookup = False

    def get_artist(self, artist_id: int) -> Optional[CatalogArtist]:
        """One artist by id, or None when Beatport has no such artist."""
        aid = positive_id(artist_id)
        if aid is None:
            return None
        return parse_catalog_artist(self._client.get(f"/catalog/artists/{aid}/"))

    def get_label(self, label_id: int) -> Optional[CatalogLabel]:
        """One label by id, or None when Beatport has no such label."""
        lid = positive_id(label_id)
        if lid is None:
            return None
        return parse_catalog_label(self._client.get(f"/catalog/labels/{lid}/"))

    def artist_tracks(
        self,
        artist_id: int,
        since: date,
        until: Optional[date] = None,
        max_pages: int = MAX_LISTING_PAGES,
    ) -> List[CatalogTrack]:
        """An artist's tracks released from ``since`` to ``until``, newest first."""
        return self._recent_tracks("artist_id", artist_id, since, until, max_pages)

    def label_tracks(
        self,
        label_id: int,
        since: date,
        until: Optional[date] = None,
        max_pages: int = MAX_LISTING_PAGES,
    ) -> List[CatalogTrack]:
        """A label's tracks released from ``since`` to ``until``, newest first."""
        return self._recent_tracks("label_id", label_id, since, until, max_pages)

    def charts(
        self,
        genre_id: Optional[int],
        since: date,
        until: date,
        max_pages: int = MAX_LISTING_PAGES,
    ) -> List[CatalogChart]:
        """Charts published from ``since`` to ``until``, newest first (DISCOVER-05).

        Asks ``catalog/charts/`` with ``publish_date=since:until`` — a filter
        DISCOVER-01's recording showed Beatport applies — and ``genre_id``,
        which the recording did not test. Both are applied here as well, as
        ``_recent_tracks`` applies its window, so the answer is right whether
        or not Beatport honours them: a chart dated outside the window, or
        naming genres none of which is ``genre_id``, is left out. A chart
        with no date or no genres is kept, as the filtered listing gave it.
        """
        first, last = since.isoformat(), until.isoformat()
        params: Dict[str, Any] = {
            "publish_date": f"{first}:{last}",
            "per_page": MAX_PER_PAGE,
        }
        wanted_genre = positive_id(genre_id) if genre_id is not None else None
        if wanted_genre is not None:
            params["genre_id"] = wanted_genre
        charts: List[CatalogChart] = []
        seen: set = set()
        for item in self._paginate("/catalog/charts/", params, max_pages):
            chart = parse_catalog_chart(item)
            if chart is None or chart.id in seen:
                continue
            seen.add(chart.id)
            if chart.publish_date is not None and not (
                first <= chart.publish_date <= last
            ):
                continue
            if (
                wanted_genre is not None
                and chart.genre_ids
                and wanted_genre not in chart.genre_ids
            ):
                continue
            charts.append(chart)
        charts.sort(key=lambda c: c.publish_date or "", reverse=True)
        return charts

    def genres(self, max_pages: int = MAX_LISTING_PAGES) -> List[Genre]:
        """Every genre on ``catalog/genres/``, each once, in Beatport's order.

        What a Discover run's genre picker offers (DISCOVER-09): every page,
        through the parser every catalog read uses, kept for a day. Raises as
        the client does, so a caller can say why there are none.
        """
        if self._cache:
            cached = self._cache.get(_CACHE_CATALOG_GENRES)
            if isinstance(cached, list):
                return list(cached)
        genres: List[Genre] = []
        seen: set = set()
        for item in self._paginate(
            "/catalog/genres/", {"per_page": MAX_PER_PAGE}, max_pages
        ):
            genre = parse_catalog_genre(item)
            if genre is not None and genre.id not in seen:
                seen.add(genre.id)
                genres.append(genre)
        if self._cache and genres:
            self._cache.set(_CACHE_CATALOG_GENRES, genres, ttl=_CACHE_GENRES_TTL)
        return genres

    def chart_tracks(
        self, chart_id: int, max_pages: int = MAX_LISTING_PAGES
    ) -> List[CatalogTrack]:
        """Every track of a chart, in chart order, with its ids."""
        cid = positive_id(chart_id)
        if cid is None:
            return []
        tracks: List[CatalogTrack] = []
        seen: set = set()
        for item in self._paginate(
            f"/catalog/charts/{cid}/tracks/", {"per_page": MAX_PER_PAGE}, max_pages
        ):
            track = parse_catalog_track(item)
            if track is not None and track.id not in seen:
                seen.add(track.id)
                tracks.append(track)
        return tracks

    def _recent_tracks(
        self,
        filter_name: str,
        entity_id: int,
        since: date,
        until: Optional[date],
        max_pages: int,
    ) -> List[CatalogTrack]:
        """``catalog/tracks/`` filtered to one artist or label and a date window.

        The window is also applied here, and the listing stops at the first
        page older than it, so the answer is right whether or not Beatport
        applies the date filter itself.
        """
        eid = positive_id(entity_id)
        if eid is None:
            return []
        end = until or date.today()
        first, last = since.isoformat(), end.isoformat()
        params = {
            filter_name: eid,
            "publish_date": f"{first}:{last}",
            "order_by": "-publish_date",
            "per_page": MAX_PER_PAGE,
        }
        tracks: List[CatalogTrack] = []
        seen: set = set()
        for page in self._paginate_pages("/catalog/tracks/", params, max_pages):
            dated_older = 0
            dated = 0
            for item in page:
                track = parse_catalog_track(item)
                if track is None or track.id in seen:
                    continue
                if track.release_date is not None:
                    dated += 1
                    if track.release_date < first:
                        dated_older += 1
                        continue
                    if track.release_date > last:
                        continue
                seen.add(track.id)
                tracks.append(track)
            if dated and dated_older == dated:
                break
        return tracks

    def _paginate(
        self, path: str, params: Dict[str, Any], max_pages: int
    ) -> Iterator[Dict[str, Any]]:
        for page in self._paginate_pages(path, params, max_pages):
            yield from page

    def _paginate_pages(
        self, path: str, params: Dict[str, Any], max_pages: int
    ) -> Iterator[List[Dict[str, Any]]]:
        """Each page of a v4 listing, until ``next`` is null or the cap is hit."""
        for number in range(1, max(0, max_pages) + 1):
            data = self._client.get(path, params={**params, "page": number})
            items, has_next = page_items(data)
            if items:
                yield items
            if not items or not has_next:
                return
        _logger.info(
            "Beatport API: %s stopped at the %s-page cap with more pages left",
            path,
            max_pages,
        )

    # --- Playlists ------------------------------------------------------------

    def create_playlist(self, name: str) -> Optional[str]:
        """Create a playlist for the current user. Returns playlist id or None."""
        if not (name or "").strip():
            return None
        post = getattr(self._client, "post", None)
        if not callable(post):
            return None
        try:
            data = post("my/playlists/", json={"name": (name or "").strip()})
            if data is None or not isinstance(data, dict):
                return None
            pid = data.get("id")
            if pid is None or not _PLAYLIST_ID_RE.match(str(pid)):
                return None
            web_url = catalog_text(data.get("url"))
            if web_url.startswith(f"{BEATPORT_WEB_BASE}/"):
                self._playlist_web_urls[str(pid)] = web_url
            return str(pid)
        except BeatportAPIError:
            raise
        except Exception as e:
            _logger.warning("create_playlist failed: %s", e)
            return None

    def add_track_to_playlist(self, playlist_id: str, track_id: int) -> None:
        """Add a track to a playlist. Raises on failure."""
        post = getattr(self._client, "post", None)
        if not callable(post):
            raise RuntimeError("API client does not support POST")
        if not _PLAYLIST_ID_RE.match(str(playlist_id)):
            raise ValueError(f"Not a Beatport playlist id: {playlist_id!r}")
        post(f"my/playlists/{playlist_id}/tracks/", json={"track_id": int(track_id)})

    def playlist_url(self, playlist_id: str) -> Optional[str]:
        """The www.beatport.com page of one of the user's playlists.

        The create response's own URL when it carried a website one, otherwise
        the page the website itself opens for a playlist.
        """
        pid = str(playlist_id or "")
        if not _PLAYLIST_ID_RE.match(pid):
            return None
        return self._playlist_web_urls.get(pid) or f"{PLAYLIST_WEB_BASE}/{pid}"
