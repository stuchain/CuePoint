"""High-level Beatport API: list genres, charts, chart detail, label releases, search label (Phase 2)."""

import json
import logging
from datetime import date
from typing import Any, Dict, List, Optional

from cuepoint.incrate.beatport_api_models import (
    ChartDetail,
    ChartSummary,
    ChartTrack,
    Genre,
    LabelRelease,
    LabelReleaseTrack,
)
from cuepoint.services.beatport_api_client import BeatportApiClient

_logger = logging.getLogger(__name__)

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


def _parse_genre(obj: Any) -> Genre:
    """Build Genre from API object."""
    return Genre(
        id=int(obj.get("id", 0) or 0),
        name=str(obj.get("name") or "").strip(),
        slug=str(obj.get("slug") or "").strip(),
    )


def _parse_chart_summary(obj: Any, genre_id: int = 0, genre_slug: str = "") -> ChartSummary:
    """Build ChartSummary from API object."""
    author = obj.get("author") or obj.get("user") or obj.get("creator") or {}
    if isinstance(author, dict):
        author_name = str(author.get("name") or "").strip()
        author_id = author.get("id")
    else:
        author_name = str(author).strip() if author else ""
        author_id = None
    return ChartSummary(
        id=int(obj.get("id", 0) or 0),
        name=str(obj.get("name") or "").strip(),
        genre_id=int(obj.get("genre_id", genre_id) or genre_id),
        genre_slug=str(obj.get("genre_slug") or genre_slug).strip(),
        author_id=int(author_id) if author_id is not None else None,
        author_name=author_name,
        published_date=_parse_date(obj.get("published_date") or obj.get("published") or ""),
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
    url = str(obj.get("url") or obj.get("beatport_url") or "").strip()
    return ChartTrack(
        track_id=int(obj.get("id", obj.get("track_id", 0)) or 0),
        title=str(obj.get("title") or "").strip(),
        artists=artists_str,
        beatport_url=url,
        position=int(obj.get("position", position) or position),
    )


def _parse_chart_detail(obj: Any) -> ChartDetail:
    """Build ChartDetail from API object."""
    author = obj.get("author") or obj.get("user") or obj.get("creator") or obj.get("person") or obj.get("artist") or {}
    author_name = (
        author.get("name", "") if isinstance(author, dict) else str(author or "")
    ).strip()
    # API may nest tracks under "tracks", "track_list", "results", or "data"
    tracks_raw = (
        obj.get("tracks") or obj.get("track_list") or obj.get("results") or obj.get("data") or []
    )
    if isinstance(tracks_raw, dict):
        tracks_raw = tracks_raw.get("tracks", tracks_raw.get("items", tracks_raw.get("results", [])))
    if not tracks_raw and isinstance(obj, dict):
        for key in ("tracks", "track_list", "results", "items", "data"):
            val = obj.get(key)
            if isinstance(val, list) and val and isinstance(val[0], dict):
                tracks_raw = val
                break
            if isinstance(val, dict):
                inner = val.get("tracks") or val.get("items") or val.get("results") or []
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
        published_date=_parse_date(obj.get("published_date") or obj.get("published") or ""),
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
    return LabelReleaseTrack(
        track_id=int(obj.get("id", obj.get("track_id", 0)) or 0),
        title=str(obj.get("title") or obj.get("name") or "").strip(),
        artists=artists_str,
        beatport_url=str(obj.get("url") or obj.get("beatport_url") or "").strip(),
        release_date=_parse_date(obj.get("release_date") or obj.get("date") or ""),
    )


def _parse_label_release(obj: Any) -> LabelRelease:
    """Build LabelRelease from API object."""
    tracks_raw = obj.get("tracks") or obj.get("releases") or obj.get("track_list") or []
    # Accept list of track-like dicts (must have id/track_id and title or name)
    if tracks_raw and isinstance(tracks_raw[0], dict):
        first = tracks_raw[0]
        if "title" in first or "name" in first or "id" in first or "track_id" in first:
            tracks = [_parse_label_release_track(t) for t in tracks_raw if isinstance(t, dict)]
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

    def list_genres(self) -> List[Genre]:
        """List genres. Cached 24h."""
        if self._cache:
            cached = self._cache.get(_CACHE_GENRES)
            if cached is not None:
                return cached
        data = self._client.get("/catalog/genres") or self._client.get("/genres")
        if data is None:
            return []
        results = data if isinstance(data, list) else (data.get("results") or data.get("data") or [])
        if isinstance(results, dict):
            results = results.get("genres", results.get("items", []))
        genres = [_parse_genre(o) for o in results if isinstance(o, dict) and (o.get("id") is not None)]
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
                return cached
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
            data = self._client.get("/catalog/charts", params=params) or self._client.get("/charts", params=params)
            if data is None and genre_id and page == 1:
                # Fallback: some docs show published_after / published_before
                params_alt = {
                    "genre_id": genre_id,
                    "published_after": from_date.isoformat(),
                    "published_before": to_date.isoformat(),
                    "per_page": per_page,
                    "page": page,
                }
                data = self._client.get("/catalog/charts", params=params_alt) or self._client.get("/charts", params=params_alt)
            if data is None:
                break
            results = data if isinstance(data, list) else (
                data.get("results") or data.get("data") or data.get("charts") or []
            )
            if isinstance(results, dict):
                results = results.get("charts", results.get("items", []))
            raw_page = [c for c in results if isinstance(c, dict)]
            if not raw_page:
                break
            all_raw.extend(raw_page)
            if len(raw_page) < per_page:
                break
            if len(all_raw) >= limit:
                break
            page += 1
        if not all_raw:
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
            c for c in charts
            if not c.published_date or from_d <= c.published_date <= to_d
        ]
        filtered.sort(key=lambda c: c.published_date or "", reverse=True)
        if self._cache:
            self._cache.set(cache_key, filtered, ttl=_CACHE_CHARTS_TTL)
        return filtered

    def get_chart(self, chart_id: int) -> Optional[ChartDetail]:
        """Get chart detail by id. Cached 1h."""
        cache_key = f"{_CACHE_CHART}:{chart_id}"
        if self._cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached
        data = self._client.get(f"/catalog/charts/{chart_id}") or self._client.get(f"/charts/{chart_id}")
        if data is None or not isinstance(data, dict):
            return None
        detail = _parse_chart_detail(data)
        # Chart detail may not include tracks; try dedicated tracks endpoint
        if not detail.tracks and (data.get("track_count") or 0) > 0:
            tracks_data = self._client.get(f"/catalog/charts/{chart_id}/tracks") or self._client.get(
                f"/charts/{chart_id}/tracks"
            )
            if tracks_data:
                track_list = tracks_data if isinstance(tracks_data, list) else (
                    tracks_data.get("results") or tracks_data.get("data") or tracks_data.get("tracks") or []
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
                            published_date=detail.published_date or _parse_date(data.get("publish_date") or ""),
                            tracks=[_parse_chart_track(t, i + 1) for i, t in enumerate(track_objs)],
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
                return cached
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
                    _logger.warning("inCrate discovery: could not serialize raw response: %s", e)
            _label_releases_raw_logged = True
        if data is None:
            if self._cache:
                self._cache.set(cache_key, [], ttl=_CACHE_LABEL_RELEASES_TTL)
            return []
        # API may return { "releases": [...] }, { "results": [...] }, { "data": [...] }, or list
        results = data if isinstance(data, list) else (
            data.get("releases") or data.get("results") or data.get("data") or []
        )
        if isinstance(results, dict):
            results = results.get("releases", results.get("items", []))
        raw = [r for r in results if isinstance(r, dict)]
        releases = [_parse_label_release(r) for r in raw if r.get("id") is not None or r.get("release_id") is not None]
        from_d = from_date.isoformat()
        to_d = to_date.isoformat()
        # Include releases with date in range; include releases with empty release_date
        filtered = [
            r for r in releases
            if not r.release_date or from_d <= r.release_date <= to_d
        ]
        filtered.sort(key=lambda r: r.release_date or "", reverse=True)
        total_tracks = sum(len(r.tracks) for r in filtered)
        # When releases have no inline tracks but have track_count, fetch per-release tracks
        if total_tracks == 0 and filtered and raw:
            raw_by_id = {int(r.get("id", r.get("release_id", 0))): r for r in raw if r.get("id") or r.get("release_id")}
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
                track_list = tracks_data if isinstance(tracks_data, list) else (
                    tracks_data.get("results") or tracks_data.get("data") or tracks_data.get("tracks") or []
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
                track_list = tracks_data if isinstance(tracks_data, list) else (
                    tracks_data.get("results") or tracks_data.get("data") or tracks_data.get("tracks") or []
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
        if self._cache:
            self._cache.set(cache_key, filtered, ttl=_CACHE_LABEL_RELEASES_TTL)
        return filtered

    def search_label_by_name(self, name: str) -> Optional[int]:
        """Resolve label name to id. Returns first match id or None. Cached 1h."""
        if not (name or "").strip():
            return None
        normalized = (name or "").strip().lower()
        cache_key = f"{_CACHE_LABEL_SEARCH}:{normalized}"
        if self._cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached
        data = self._client.get("/catalog/labels", params={"q": name.strip()}) or self._client.get(
            "/labels", params={"q": name.strip()}
        )
        if data is None:
            if self._cache:
                self._cache.set(cache_key, None, ttl=_CACHE_LABEL_SEARCH_TTL)
            return None
        # API may return { "labels": [...] }, { "results": [...] }, { "data": [...] }, or list
        results = data if isinstance(data, list) else (
            data.get("labels") or data.get("results") or data.get("data") or []
        )
        if isinstance(results, dict):
            results = results.get("labels", results.get("items", []))
        want_name = (name or "").strip().lower()
        want_slug = want_name.replace(" ", "-").replace("_", "-")
        for item in results:
            if not isinstance(item, dict) or item.get("id") is None:
                continue
            item_name = (item.get("name") or item.get("title") or "").strip().lower()
            label_id = int(item["id"])
            if item_name == want_name:
                if self._cache:
                    self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                return label_id
        for item in results:
            if not isinstance(item, dict) or item.get("id") is None:
                continue
            item_slug = (item.get("slug") or "").strip().lower().replace("_", "-")
            if item_slug and want_slug and item_slug == want_slug:
                label_id = int(item["id"])
                if self._cache:
                    self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                return label_id
        # Try slug-style query (e.g. "nothing-but") to get canonical label
        if want_slug != want_name:
            data2 = self._client.get("/catalog/labels", params={"q": want_slug}) or self._client.get(
                "/labels", params={"q": want_slug}
            )
            if data2:
                results2 = data2 if isinstance(data2, list) else (
                    data2.get("labels") or data2.get("results") or data2.get("data") or []
                )
                if isinstance(results2, dict):
                    results2 = results2.get("labels", results2.get("items", []))
                for item in results2:
                    if not isinstance(item, dict) or item.get("id") is None:
                        continue
                    item_slug = (item.get("slug") or "").strip().lower().replace("_", "-")
                    item_name = (item.get("name") or item.get("title") or "").strip().lower()
                    if item_slug == want_slug or item_name == want_name:
                        label_id = int(item["id"])
                        if self._cache:
                            self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                        return label_id
        for item in results:
            if not isinstance(item, dict) or item.get("id") is None:
                continue
            item_name = (item.get("name") or item.get("title") or "").strip().lower()
            label_id = int(item["id"])
            if want_name in item_name or item_name in want_name:
                if self._cache:
                    self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                return label_id
        for item in results:
            if isinstance(item, dict) and item.get("id") is not None:
                label_id = int(item["id"])
                if self._cache:
                    self._cache.set(cache_key, label_id, ttl=_CACHE_LABEL_SEARCH_TTL)
                return label_id
        if self._cache:
            self._cache.set(cache_key, None, ttl=_CACHE_LABEL_SEARCH_TTL)
        return None
