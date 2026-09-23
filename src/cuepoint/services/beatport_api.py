"""High-level Beatport API: list genres, charts, chart detail, label releases, search label (Phase 2).

DISCOVER-01 adds the catalog half: tracks, artists and labels by id, an
artist's or label's recent tracks, and a chart's tracks, parsed by
``services/beatport_catalog.py`` into the ``Catalog*`` models that keep every
id. The older parsers below, which guess between several nestings, are left
alone for inCrate and retire with it in DISCOVER-12.

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

import json
import logging
import re
from datetime import date
from typing import Any, Dict, Iterable, Iterator, List, Optional

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.incrate.beatport_api_models import (
    CatalogArtist,
    CatalogLabel,
    CatalogTrack,
    ChartDetail,
    ChartSummary,
    ChartTrack,
    Genre,
    LabelRelease,
    LabelReleaseTrack,
)
from cuepoint.services.beatport_api_client import BeatportApiClient
from cuepoint.services.beatport_catalog import (
    BEATPORT_WEB_BASE,
    catalog_text,
    chart_owner_name,
    page_items,
    parse_catalog_artist,
    parse_catalog_label,
    parse_catalog_track,
    positive_id,
)

# Web track URL format: https://www.beatport.com/track/{slug}/{id} or /track/t/{id}
BEATPORT_WEB_TRACK_BASE = "https://www.beatport.com/track"
# API returns URLs like https://api.beatport.com/v4/catalog/tracks/23332107/
_API_TRACK_ID_RE = re.compile(r"/catalog/tracks/(\d+)/?$")

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

# Cache key prefixes and TTLs
_CACHE_GENRES = "beatport_api:genres"
_CACHE_GENRES_TTL = 86400
_CACHE_CHARTS = "beatport_api:charts"
_CACHE_CHARTS_TTL = 3600
_CACHE_CHART = "beatport_api:chart"
_CACHE_CHART_TTL = 3600
_CACHE_LABEL_RELEASES = "beatport_api:label_releases"
_CACHE_LABEL_RELEASES_TTL = 3600
_CACHE_LABEL_SEARCH = "beatport_api:label_search"

# Log raw label-releases response once per process to debug 0 tracks
_label_releases_raw_logged = False
_CACHE_LABEL_SEARCH_TTL = 3600


def _parse_date(s: Optional[str]) -> str:
    """Return date part YYYY-MM-DD from ISO string or empty."""
    if not s:
        return ""
    return str(s).split("T")[0].strip()


def api_track_url_to_web(
    url: str, track_id: Optional[int] = None, slug: Optional[str] = None
) -> str:
    """Convert API track URL to www Beatport track URL so the browser can open it.

    API returns e.g. https://api.beatport.com/v4/catalog/tracks/23332107/
    Web format is https://www.beatport.com/track/{slug}/{id} or /track/t/{id}.
    """
    u = (url or "").strip()
    if not u:
        return ""
    # Already a web track URL
    if "www.beatport.com" in u and "/track/" in u and "/catalog/" not in u:
        return u
    # API URL: extract track ID and build web URL
    if "api.beatport.com" in u or "/catalog/tracks/" in u:
        m = _API_TRACK_ID_RE.search(u)
        tid = track_id if track_id is not None else (int(m.group(1)) if m else None)
        if tid is not None:
            slug_part = (slug or "").strip() or "t"
            return f"{BEATPORT_WEB_TRACK_BASE}/{slug_part}/{tid}"
    return u


def _parse_genre(obj: Any) -> Genre:
    """Build Genre from API object."""
    return Genre(
        id=int(obj.get("id", 0) or 0),
        name=str(obj.get("name") or "").strip(),
        slug=str(obj.get("slug") or "").strip(),
    )


def _parse_chart_summary(
    obj: Any, genre_id: int = 0, genre_slug: str = ""
) -> ChartSummary:
    """Build ChartSummary from API object."""
    author = obj.get("author") or obj.get("user") or obj.get("creator") or {}
    if isinstance(author, dict):
        author_name = str(author.get("name") or "").strip()
        author_id = author.get("id")
    else:
        author_name = str(author).strip() if author else ""
        author_id = None
    if not author_name:
        # v4 names a chart's curator in ``person.owner_name``.
        author_name = chart_owner_name(obj)
    return ChartSummary(
        id=int(obj.get("id", 0) or 0),
        name=str(obj.get("name") or "").strip(),
        genre_id=int(obj.get("genre_id", genre_id) or genre_id),
        genre_slug=str(obj.get("genre_slug") or genre_slug).strip(),
        author_id=int(author_id) if author_id is not None else None,
        author_name=author_name,
        published_date=_parse_date(
            obj.get("published_date") or obj.get("published") or ""
        ),
        track_count=int(obj.get("track_count", obj.get("tracks_count", 0)) or 0),
    )


def _parse_chart_track(obj: Any, position: int = 0) -> ChartTrack:
    """Build ChartTrack from API object."""
    artists = obj.get("artists") or obj.get("performers")
    if isinstance(artists, list):
        artists_str = ", ".join(
            (a.get("name") or str(a)).strip() for a in artists if a
        ).strip()
    else:
        artists_str = str(artists or "").strip()
    raw_url = str(obj.get("url") or obj.get("beatport_url") or "").strip()
    track_id = int((obj.get("id", obj.get("track_id", 0)) or 0))
    slug = str(obj.get("slug") or "").strip()
    beatport_url = api_track_url_to_web(raw_url, track_id=track_id, slug=slug or None)
    if not beatport_url:
        beatport_url = raw_url
    return ChartTrack(
        track_id=track_id,
        title=str(obj.get("title") or "").strip(),
        artists=artists_str,
        beatport_url=beatport_url,
        position=int(obj.get("position", position) or position),
        catalog=parse_catalog_track(obj),
    )


def _parse_chart_detail(obj: Any) -> ChartDetail:
    """Build ChartDetail from API object."""
    author = (
        obj.get("author")
        or obj.get("user")
        or obj.get("creator")
        or obj.get("person")
        or obj.get("artist")
        or {}
    )
    author_name = (
        author.get("name", "") if isinstance(author, dict) else str(author or "")
    ).strip()
    if not author_name:
        # v4 names a chart's curator in ``person.owner_name``.
        author_name = chart_owner_name(obj)
    # API may nest tracks under "tracks", "track_list", "results", or "data"
    tracks_raw = (
        obj.get("tracks")
        or obj.get("track_list")
        or obj.get("results")
        or obj.get("data")
        or []
    )
    if isinstance(tracks_raw, dict):
        tracks_raw = tracks_raw.get(
            "tracks", tracks_raw.get("items", tracks_raw.get("results", []))
        )
    if not tracks_raw and isinstance(obj, dict):
        for key in ("tracks", "track_list", "results", "items", "data"):
            val = obj.get(key)
            if isinstance(val, list) and val and isinstance(val[0], dict):
                tracks_raw = val
                break
            if isinstance(val, dict):
                inner = (
                    val.get("tracks") or val.get("items") or val.get("results") or []
                )
                if isinstance(inner, list) and inner:
                    tracks_raw = inner
                    break
    tracks = [
        _parse_chart_track(t, i + 1)
        for i, t in enumerate(tracks_raw)
        if isinstance(t, dict)
    ]
    return ChartDetail(
        id=int(obj.get("id", 0) or 0),
        name=str(obj.get("name") or "").strip(),
        author_name=author_name,
        published_date=_parse_date(
            obj.get("published_date") or obj.get("published") or ""
        ),
        tracks=tracks,
    )


def _parse_label_release_track(obj: Any) -> LabelReleaseTrack:
    """Build LabelReleaseTrack from API object."""
    artists = obj.get("artists") or obj.get("performers")
    if isinstance(artists, list):
        artists_str = ", ".join(
            (a.get("name") or str(a)).strip() for a in artists if a
        ).strip()
    else:
        artists_str = str(artists or "").strip()
    raw_url = str(obj.get("url") or obj.get("beatport_url") or "").strip()
    track_id = int((obj.get("id", obj.get("track_id", 0)) or 0))
    slug = str(obj.get("slug") or "").strip()
    beatport_url = api_track_url_to_web(raw_url, track_id=track_id, slug=slug or None)
    if not beatport_url:
        beatport_url = raw_url
    return LabelReleaseTrack(
        track_id=track_id,
        title=str(obj.get("title") or obj.get("name") or "").strip(),
        artists=artists_str,
        beatport_url=beatport_url,
        release_date=_parse_date(obj.get("release_date") or obj.get("date") or ""),
        catalog=parse_catalog_track(obj),
    )


def _parse_label_release(obj: Any) -> LabelRelease:
    """Build LabelRelease from API object."""
    tracks_raw = obj.get("tracks") or obj.get("releases") or obj.get("track_list") or []
    # Accept list of track-like dicts (must have id/track_id and title or name)
    if tracks_raw and isinstance(tracks_raw[0], dict):
        first = tracks_raw[0]
        if "title" in first or "name" in first or "id" in first or "track_id" in first:
            tracks = [
                _parse_label_release_track(t) for t in tracks_raw if isinstance(t, dict)
            ]
        else:
            tracks = []
            _logger.debug(
                "label release %s: tracks list present but first item has no title/name/id (keys: %s)",
                obj.get("id") or obj.get("release_id"),
                list(first.keys()) if isinstance(first, dict) else type(first).__name__,
            )
    else:
        tracks = []
        if tracks_raw:
            _logger.debug(
                "label release %s: unexpected tracks shape (keys: %s, first type: %s)",
                obj.get("id") or obj.get("release_id"),
                list(obj.keys()),
                type(tracks_raw[0]).__name__ if tracks_raw else "none",
            )
    return LabelRelease(
        release_id=int(obj.get("id", obj.get("release_id", 0)) or 0),
        title=str(obj.get("title") or obj.get("name") or "").strip(),
        release_date=_parse_date(obj.get("release_date") or obj.get("date") or ""),
        tracks=tracks,
    )


class BeatportApi:
    """High-level Beatport API: genres, charts, chart detail, label releases, label search."""

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

    def list_genres(self) -> List[Genre]:
        """List genres. Cached 24h."""
        if self._cache:
            cached = self._cache.get(_CACHE_GENRES)
            if cached is not None:
                _logger.info(
                    "Beatport API: list_genres — cache hit, %s genres", len(cached)
                )
                return cached
        _logger.info("Beatport API: list_genres — cache miss, fetching")
        data = self._client.get("/catalog/genres") or self._client.get("/genres")
        if data is None:
            return []
        results = (
            data
            if isinstance(data, list)
            else (data.get("results") or data.get("data") or [])
        )
        if isinstance(results, dict):
            results = results.get("genres", results.get("items", []))
        genres = [
            _parse_genre(o)
            for o in results
            if isinstance(o, dict) and (o.get("id") is not None)
        ]
        _logger.info(
            "Beatport API: list_genres — parsed %s genres from API", len(genres)
        )
        if self._cache:
            self._cache.set(_CACHE_GENRES, genres, ttl=_CACHE_GENRES_TTL)
        return genres

    def list_charts(
        self,
        genre_id: int,
        from_date: date,
        to_date: date,
        limit: int = 100,
    ) -> List[ChartSummary]:
        """List charts for genre and date range. Cached 1h. Uses API publish_date (slice) and page/per_page."""
        cache_key = f"{_CACHE_CHARTS}:{genre_id}:{from_date!s}:{to_date!s}"
        if self._cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                _logger.info(
                    "Beatport API: list_charts(genre_id=%s) — cache hit, %s charts",
                    genre_id,
                    len(cached),
                )
                return cached
        _logger.info(
            "Beatport API: list_charts(genre_id=%s, from=%s, to=%s, limit=%s) — cache miss, fetching",
            genre_id,
            from_date,
            to_date,
            limit,
        )
        # API uses publish_date slice and page/per_page (not from/to/limit)
        publish_slice = f"{from_date.isoformat()}:{to_date.isoformat()}"
        per_page = min(max(1, limit), 100)
        all_raw: List[Dict[str, Any]] = []
        page = 1
        while True:
            params: Dict[str, Any] = {
                "publish_date": publish_slice,
                "per_page": per_page,
                "page": page,
            }
            if genre_id:
                params["genre_id"] = genre_id
            data = self._client.get(
                "/catalog/charts", params=params
            ) or self._client.get("/charts", params=params)
            if data is None and genre_id and page == 1:
                # Fallback: some docs show published_after / published_before
                params_alt = {
                    "genre_id": genre_id,
                    "published_after": from_date.isoformat(),
                    "published_before": to_date.isoformat(),
                    "per_page": per_page,
                    "page": page,
                }
                data = self._client.get(
                    "/catalog/charts", params=params_alt
                ) or self._client.get("/charts", params=params_alt)
            if data is None:
                break
            results = (
                data
                if isinstance(data, list)
                else (
                    data.get("results") or data.get("data") or data.get("charts") or []
                )
            )
            if isinstance(results, dict):
                results = results.get("charts", results.get("items", []))
            raw_page = [c for c in results if isinstance(c, dict)]
            _logger.info(
                "Beatport API: list_charts page %s — got %s items (total so far %s)",
                page,
                len(raw_page),
                len(all_raw) + len(raw_page),
            )
            if not raw_page:
                break
            all_raw.extend(raw_page)
            if len(raw_page) < per_page:
                break
            if len(all_raw) >= limit:
                break
            page += 1
        if not all_raw:
            _logger.info(
                "Beatport API: list_charts(genre_id=%s, from=%s, to=%s) — no charts returned (raw empty)",
                genre_id,
                from_date,
                to_date,
            )
            if self._cache:
                self._cache.set(cache_key, [], ttl=_CACHE_CHARTS_TTL)
            return []
        # Dedupe by id (keep first)
        seen: set = set()
        unique_raw: List[Dict[str, Any]] = []
        for c in all_raw:
            cid = c.get("id")
            if cid is not None and cid not in seen:
                seen.add(cid)
                unique_raw.append(c)
        charts = [
            _parse_chart_summary(c, genre_id=genre_id, genre_slug="")
            for c in unique_raw
            if c.get("id") is not None
        ]
        from_d = from_date.isoformat()
        to_d = to_date.isoformat()
        # Include charts with date in range; include charts with empty published_date (API may omit it)
        filtered = [
            c
            for c in charts
            if not c.published_date or from_d <= c.published_date <= to_d
        ]
        filtered.sort(key=lambda c: c.published_date or "", reverse=True)
        _logger.info(
            "Beatport API: list_charts(genre_id=%s, from=%s, to=%s) — %s charts (after date filter)",
            genre_id,
            from_date,
            to_date,
            len(filtered),
        )
        if self._cache:
            self._cache.set(cache_key, filtered, ttl=_CACHE_CHARTS_TTL)
        return filtered

    def get_chart(self, chart_id: int) -> Optional[ChartDetail]:
        """Get chart detail by id. Cached 1h."""
        cache_key = f"{_CACHE_CHART}:{chart_id}"
        if self._cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                _logger.info(
                    "Beatport API: get_chart(%s) — cache hit, %s tracks",
                    chart_id,
                    len(cached.tracks) if cached else 0,
                )
                return cached
        _logger.info("Beatport API: get_chart(%s) — cache miss, fetching", chart_id)
        data = self._client.get(f"/catalog/charts/{chart_id}") or self._client.get(
            f"/charts/{chart_id}"
        )
        if data is None or not isinstance(data, dict):
            _logger.debug("Beatport API: get_chart(%s) — no data or not dict", chart_id)
            return None
        detail = _parse_chart_detail(data)
        # Chart detail may not include tracks; try dedicated tracks endpoint
        if not detail.tracks and (data.get("track_count") or 0) > 0:
            _logger.info(
                "Beatport API: get_chart(%s) — main response had 0 tracks but track_count=%s, fetching /tracks",
                chart_id,
                data.get("track_count"),
            )
            tracks_data = self._client.get(
                f"/catalog/charts/{chart_id}/tracks"
            ) or self._client.get(f"/charts/{chart_id}/tracks")
            if tracks_data:
                track_list = (
                    tracks_data
                    if isinstance(tracks_data, list)
                    else (
                        tracks_data.get("results")
                        or tracks_data.get("data")
                        or tracks_data.get("tracks")
                        or []
                    )
                )
                if isinstance(track_list, dict):
                    track_list = track_list.get("tracks", track_list.get("items", []))
                if isinstance(track_list, list) and track_list:
                    track_objs = [t for t in track_list if isinstance(t, dict)]
                    if track_objs:
                        author_name = detail.author_name
                        if not author_name and isinstance(data.get("artist"), dict):
                            author_name = (data.get("artist") or {}).get("name", "")
                        if not author_name and isinstance(data.get("person"), dict):
                            author_name = (data.get("person") or {}).get("name", "")
                        detail = ChartDetail(
                            id=detail.id,
                            name=detail.name,
                            author_name=author_name or "",
                            published_date=detail.published_date
                            or _parse_date(data.get("publish_date") or ""),
                            tracks=[
                                _parse_chart_track(t, i + 1)
                                for i, t in enumerate(track_objs)
                            ],
                        )
        if not detail.tracks:
            _logger.info(
                "Beatport API: get_chart(%s) — chart %r has 0 tracks",
                chart_id,
                (detail.name or "")[:40],
            )
        if self._cache:
            self._cache.set(cache_key, detail, ttl=_CACHE_CHART_TTL)
        return detail

    def get_label_releases(
        self,
        label_id: int,
        from_date: date,
        to_date: date,
    ) -> List[LabelRelease]:
        """Get releases for label in date range. Cached 1h. Filter release_date in app."""
        cache_key = f"{_CACHE_LABEL_RELEASES}:{label_id}:{from_date!s}:{to_date!s}"
        if self._cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                n_t = sum(len(r.tracks) for r in cached)
                _logger.info(
                    "Beatport API: get_label_releases(label_id=%s) — cache hit, %s releases, %s tracks",
                    label_id,
                    len(cached),
                    n_t,
                )
                return cached
        _logger.info(
            "Beatport API: get_label_releases(label_id=%s, from=%s, to=%s) — cache miss, fetching",
            label_id,
            from_date,
            to_date,
        )
        data = self._client.get(
            f"/catalog/labels/{label_id}/releases",
            params={"from": from_date.isoformat(), "to": to_date.isoformat()},
        ) or self._client.get(
            f"/labels/{label_id}/releases",
            params={"from": from_date.isoformat(), "to": to_date.isoformat()},
        )
        global _label_releases_raw_logged
        if not _label_releases_raw_logged:
            if data is None:
                _logger.info(
                    "inCrate discovery: raw get_label_releases response (label_id=%s, from=%s, to=%s): null",
                    label_id,
                    from_date,
                    to_date,
                )
            else:
                try:
                    raw_str = json.dumps(data, indent=2, default=str)
                    if len(raw_str) > 8000:
                        raw_str = raw_str[:8000] + "\n... (truncated)"
                    _logger.info(
                        "inCrate discovery: raw get_label_releases response (label_id=%s, from=%s, to=%s):\n%s",
                        label_id,
                        from_date,
                        to_date,
                        raw_str,
                    )
                except Exception as e:
                    _logger.warning(
                        "inCrate discovery: could not serialize raw response: %s", e
                    )
            _label_releases_raw_logged = True
        if data is None:
            if self._cache:
                self._cache.set(cache_key, [], ttl=_CACHE_LABEL_RELEASES_TTL)
            return []
        # API may return { "releases": [...] }, { "results": [...] }, { "data": [...] }, or list
        results = (
            data
            if isinstance(data, list)
            else (data.get("releases") or data.get("results") or data.get("data") or [])
        )
        if isinstance(results, dict):
            results = results.get("releases", results.get("items", []))
        raw = [r for r in results if isinstance(r, dict)]
        releases = [
            _parse_label_release(r)
            for r in raw
            if r.get("id") is not None or r.get("release_id") is not None
        ]
        from_d = from_date.isoformat()
        to_d = to_date.isoformat()
        # Include releases with date in range; include releases with empty release_date
        filtered = [
            r
            for r in releases
            if not r.release_date or from_d <= r.release_date <= to_d
        ]
        filtered.sort(key=lambda r: r.release_date or "", reverse=True)
        total_tracks = sum(len(r.tracks) for r in filtered)
        # When releases have no inline tracks but have track_count, fetch per-release tracks
        if total_tracks == 0 and filtered and raw:
            raw_by_id = {
                int(r.get("id", r.get("release_id", 0))): r
                for r in raw
                if r.get("id") or r.get("release_id")
            }
            new_filtered = []
            for rel in filtered:
                if rel.tracks:
                    new_filtered.append(rel)
                    continue
                r_raw = raw_by_id.get(rel.release_id)
                track_count = (r_raw or {}).get("track_count") or 0
                if track_count <= 0:
                    new_filtered.append(rel)
                    continue
                tracks_data = self._client.get(
                    f"/catalog/releases/{rel.release_id}/tracks"
                ) or self._client.get(f"/releases/{rel.release_id}/tracks")
                if not tracks_data:
                    new_filtered.append(rel)
                    continue
                track_list = (
                    tracks_data
                    if isinstance(tracks_data, list)
                    else (
                        tracks_data.get("results")
                        or tracks_data.get("data")
                        or tracks_data.get("tracks")
                        or []
                    )
                )
                if isinstance(track_list, dict):
                    track_list = track_list.get("tracks", track_list.get("items", []))
                track_objs = [t for t in track_list if isinstance(t, dict)]
                if track_objs:
                    new_filtered.append(
                        LabelRelease(
                            release_id=rel.release_id,
                            title=rel.title,
                            release_date=rel.release_date,
                            tracks=[_parse_label_release_track(t) for t in track_objs],
                        )
                    )
                else:
                    new_filtered.append(rel)
            filtered = new_filtered
            total_tracks = sum(len(r.tracks) for r in filtered)
        if total_tracks == 0 and filtered and raw:
            _logger.debug(
                "inCrate discovery: label %s releases have 0 tracks; first release keys: %s",
                label_id,
                list(raw[0].keys()) if isinstance(raw[0], dict) else type(raw[0]),
            )
        if total_tracks == 0:
            tracks_data = self._client.get(
                f"/catalog/labels/{label_id}/tracks",
                params={"from": from_d, "to": to_d},
            ) or self._client.get(
                f"/labels/{label_id}/tracks",
                params={"from": from_d, "to": to_d},
            )
            if tracks_data:
                track_list = (
                    tracks_data
                    if isinstance(tracks_data, list)
                    else (
                        tracks_data.get("results")
                        or tracks_data.get("data")
                        or tracks_data.get("tracks")
                        or []
                    )
                )
                if isinstance(track_list, dict):
                    track_list = track_list.get("tracks", track_list.get("items", []))
                track_objs = [t for t in track_list if isinstance(t, dict)]
                if track_objs:
                    virtual_release = LabelRelease(
                        release_id=0,
                        title=f"Label {label_id} tracks",
                        release_date=to_d,
                        tracks=[_parse_label_release_track(t) for t in track_objs],
                    )
                    filtered = [virtual_release]
                    _logger.info(
                        "inCrate discovery: label %s releases had 0 tracks; used /tracks fallback, %s tracks",
                        label_id,
                        len(virtual_release.tracks),
                    )
        n_tracks = sum(len(r.tracks) for r in filtered)
        _logger.info(
            "Beatport API: get_label_releases(label_id=%s) — returning %s releases, %s tracks",
            label_id,
            len(filtered),
            n_tracks,
        )
        if self._cache:
            self._cache.set(cache_key, filtered, ttl=_CACHE_LABEL_RELEASES_TTL)
        return filtered

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
                return cached
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
                r for r in results if isinstance(r, dict) and r.get("id") is not None
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
                for item in results2:
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
