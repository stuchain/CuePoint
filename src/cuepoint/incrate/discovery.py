"""Discovery flow: charts from library artists, new releases from library labels; dedupe (Phase 3)."""

import logging
from datetime import date, timedelta
from typing import Any, Callable, List, Optional, Set

from cuepoint.incrate.beatport_api_models import DiscoveredTrack

_logger = logging.getLogger(__name__)

# Known Beatport label IDs when search returns a different label (e.g. duplicate names).
# Key: normalized label name (lowercase), value: canonical Beatport label id.
_CANONICAL_LABEL_IDS = {
    "nothing but": 43219,
}


def _normalize_artist(name: str) -> str:
    """Normalize artist name for comparison: strip, lower."""
    return (name or "").strip().lower()


def _charts_branch(
    inventory_service: Any,
    beatport_api: Any,
    genre_ids: List[int],
    charts_from_date: date,
    charts_to_date: date,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
) -> List[DiscoveredTrack]:
    """Collect tracks from charts whose author is in library artists."""
    _logger.info(
        "inCrate discovery: charts branch — %s genres, %s to %s",
        len(genre_ids),
        charts_from_date,
        charts_to_date,
    )
    library_artists: Set[str] = set()
    try:
        for a in inventory_service.get_library_artists():
            library_artists.add(_normalize_artist(a))
        _logger.info("inCrate discovery: library artists count = %s", len(library_artists))
    except Exception as e:
        _logger.warning("get_library_artists failed: %s", e)
        return []

    result: List[DiscoveredTrack] = []
    total_genres = len(genre_ids) or 1
    if not genre_ids and progress_callback:
        progress_callback("charts", 0, 1)
    for idx_genre, genre_id in enumerate(genre_ids):
        _logger.debug("inCrate discovery: charts genre %s/%s (id=%s)", idx_genre + 1, total_genres, genre_id)
        try:
            charts = beatport_api.list_charts(genre_id, charts_from_date, charts_to_date)
            _logger.debug("inCrate discovery: genre %s returned %s charts", genre_id, len(charts) if charts else 0)
        except Exception as e:
            _logger.warning("list_charts failed for genre %s: %s", genre_id, e)
            if progress_callback:
                progress_callback("charts", idx_genre + 1, total_genres)
            continue
        for chart in charts or []:
            # When list_charts returns empty author, still fetch detail and check author there
            author_to_check = chart.author_name
            if not author_to_check:
                try:
                    detail_for_author = beatport_api.get_chart(chart.id)
                    if detail_for_author:
                        author_to_check = detail_for_author.author_name or ""
                except Exception:
                    pass
            if not author_to_check or _normalize_artist(author_to_check) not in library_artists:
                continue
            try:
                detail = beatport_api.get_chart(chart.id)
            except Exception as e:
                _logger.debug("get_chart %s failed: %s", chart.id, e)
                continue
            if not detail:
                continue
            for t in detail.tracks:
                result.append(
                    DiscoveredTrack(
                        beatport_track_id=t.track_id,
                        beatport_url=t.beatport_url or "",
                        title=t.title or "",
                        artists=t.artists or "",
                        source_type="chart",
                        source_name=detail.name or "",
                    )
                )
        if progress_callback:
            progress_callback("charts", idx_genre + 1, total_genres)
    # If no chart tracks from genre-filtered list, try charts without genre (some APIs support genre_id=0 for "all")
    if len(result) == 0 and library_artists and genre_ids:
        try:
            charts_all = beatport_api.list_charts(0, charts_from_date, charts_to_date, limit=200)
            _logger.info("inCrate discovery: charts fallback (no genre): %s charts", len(charts_all) if charts_all else 0)
            for chart in charts_all or []:
                author_to_check = chart.author_name
                if not author_to_check:
                    try:
                        detail_for_author = beatport_api.get_chart(chart.id)
                        if detail_for_author:
                            author_to_check = detail_for_author.author_name or ""
                    except Exception:
                        pass
                if not author_to_check or _normalize_artist(author_to_check) not in library_artists:
                    continue
                try:
                    detail = beatport_api.get_chart(chart.id)
                except Exception as e:
                    _logger.debug("get_chart %s failed: %s", chart.id, e)
                    continue
                if not detail:
                    continue
                for t in detail.tracks:
                    result.append(
                        DiscoveredTrack(
                            beatport_track_id=t.track_id,
                            beatport_url=t.beatport_url or "",
                            title=t.title or "",
                            artists=t.artists or "",
                            source_type="chart",
                            source_name=detail.name or "",
                        )
                    )
        except Exception as e:
            _logger.debug("charts fallback (genre_id=0) failed: %s", e)
    _logger.info("inCrate discovery: charts branch done — %s tracks", len(result))
    return result


def _new_releases_branch(
    inventory_service: Any,
    beatport_api: Any,
    new_releases_days: int,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
) -> List[DiscoveredTrack]:
    """Collect tracks from label releases (last N days) for library labels."""
    _logger.info(
        "inCrate discovery: new releases branch — last %s days",
        new_releases_days,
    )
    try:
        library_labels = inventory_service.get_library_labels()
        _logger.info("inCrate discovery: library labels count = %s", len(library_labels) if library_labels else 0)
    except Exception as e:
        _logger.warning("get_library_labels failed: %s", e)
        return []

    label_ids: dict = {}
    total_library_labels = len(library_labels)
    if progress_callback and total_library_labels > 0:
        progress_callback("resolving", 0, total_library_labels)
    for i, label_name in enumerate(library_labels):
        if not (label_name or "").strip():
            continue
        if progress_callback:
            progress_callback("resolving", i + 1, total_library_labels)
        _logger.info(
            "inCrate discovery: resolving label %s/%s: %r",
            i + 1,
            total_library_labels,
            label_name[:40] + "..." if len(label_name or "") > 40 else label_name,
        )
        try:
            label_id = beatport_api.search_label_by_name(label_name.strip())
        except Exception as e:
            _logger.debug("search_label_by_name %r failed: %s", label_name, e)
            continue
        if label_id is not None:
            label_ids[label_name] = label_id

    to_date = date.today()
    from_date = to_date - timedelta(days=new_releases_days)
    result: List[DiscoveredTrack] = []
    total_labels = len(label_ids) or 1
    if not label_ids and progress_callback:
        progress_callback("releases", 0, 1)
    total_releases_seen = 0
    for idx, (label_name, label_id) in enumerate(label_ids.items()):
        if progress_callback:
            progress_callback("releases", idx + 1, total_labels)
        _logger.info(
            "inCrate discovery: fetching releases for label %s/%s: %r",
            idx + 1,
            total_labels,
            (label_name or "")[:40] + ("..." if len(label_name or "") > 40 else ""),
        )
        try:
            releases = beatport_api.get_label_releases(label_id, from_date, to_date)
        except Exception as e:
            _logger.warning("get_label_releases for label %s failed: %s", label_id, e)
            if progress_callback:
                progress_callback("releases", idx + 1, total_labels)
            continue
        n_releases = len(releases)
        n_tracks = sum(len(r.tracks) for r in releases)
        # If 0 tracks, try canonical label id (e.g. "Nothing But" -> 43219)
        if n_tracks == 0 and label_name:
            canonical_id = _CANONICAL_LABEL_IDS.get(label_name.strip().lower())
            if canonical_id is not None and canonical_id != label_id:
                try:
                    releases = beatport_api.get_label_releases(canonical_id, from_date, to_date)
                    n_releases = len(releases)
                    n_tracks = sum(len(r.tracks) for r in releases)
                    if n_tracks > 0:
                        _logger.info(
                            "inCrate discovery: label %r used canonical id %s -> %s tracks",
                            label_name,
                            canonical_id,
                            n_tracks,
                        )
                except Exception as e:
                    _logger.debug("get_label_releases(canonical %s) failed: %s", canonical_id, e)
        total_releases_seen += n_releases
        if n_releases > 0 and n_tracks == 0:
            _logger.warning(
                "inCrate discovery: label %r (%s): %s releases but 0 tracks — API may return releases without track list",
                label_name,
                label_id,
                n_releases,
            )
        _logger.debug(
            "inCrate discovery: label %r — %s releases, %s tracks",
            label_name,
            n_releases,
            n_tracks,
        )
        for release in releases:
            for t in release.tracks:
                result.append(
                    DiscoveredTrack(
                        beatport_track_id=t.track_id,
                        beatport_url=t.beatport_url or "",
                        title=t.title or "",
                        artists=t.artists or "",
                        source_type="label_release",
                        source_name=release.title or "",
                    )
                )
        if progress_callback:
            progress_callback("releases", idx + 1, total_labels)
    _logger.info(
        "inCrate discovery: new releases branch done — %s labels, %s releases, %s tracks",
        len(label_ids),
        total_releases_seen,
        len(result),
    )
    return result


def _dedupe(tracks: List[DiscoveredTrack]) -> List[DiscoveredTrack]:
    """Deduplicate by beatport_track_id; preserve first-seen order."""
    seen: Set[int] = set()
    out: List[DiscoveredTrack] = []
    for t in tracks:
        if t.beatport_track_id not in seen:
            seen.add(t.beatport_track_id)
            out.append(t)
    return out


def run_discovery(
    inventory_service: Any,
    beatport_api: Any,
    genre_ids: List[int],
    charts_from_date: date,
    charts_to_date: date,
    new_releases_days: int = 30,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
) -> List[DiscoveredTrack]:
    """Run discovery: charts from library artists + new releases from library labels; dedupe by track id.

    Args:
        inventory_service: Service with get_library_artists(), get_library_labels().
        beatport_api: API with list_charts, get_chart, search_label_by_name, get_label_releases.
        genre_ids: Genre IDs to fetch charts for.
        charts_from_date: Start date for charts.
        charts_to_date: End date for charts.
        new_releases_days: Number of days back for label releases.
        progress_callback: Optional (stage, current, total) e.g. ("charts", 1, 2), ("releases", 1, 1).

    Returns:
        Deduplicated list of DiscoveredTrack (charts first, then releases; same track_id appears once).
    """
    _logger.info(
        "inCrate discovery: run_discovery — genres=%s, charts %s–%s, releases_days=%s",
        len(genre_ids),
        charts_from_date,
        charts_to_date,
        new_releases_days,
    )
    chart_tracks = _charts_branch(
        inventory_service,
        beatport_api,
        genre_ids,
        charts_from_date,
        charts_to_date,
        progress_callback,
    )
    release_tracks = _new_releases_branch(
        inventory_service,
        beatport_api,
        new_releases_days,
        progress_callback,
    )
    combined = chart_tracks + release_tracks
    deduped = _dedupe(combined)
    _logger.info(
        "inCrate discovery: done — charts=%s, releases=%s, combined=%s, deduped=%s",
        len(chart_tracks),
        len(release_tracks),
        len(combined),
        len(deduped),
    )
    return deduped
