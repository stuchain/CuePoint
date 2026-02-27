"""Discovery flow: charts from library artists, new releases from library labels; dedupe (Phase 3)."""

import logging
import re
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


def _parse_track_artists(artists_str: str) -> Set[str]:
    """Parse 'Artist A, Artist B & Artist C' into normalized set of names."""
    if not (artists_str or "").strip():
        return set()
    # Split on comma, " & ", " and " (case-insensitive)
    parts = re.split(r"\s*,\s*|\s+&\s+|\s+and\s+", artists_str, flags=re.IGNORECASE)
    return {_normalize_artist(p) for p in parts if (p or "").strip()}


def _track_matches_library_artists(track_artists_str: str, library_artists: Set[str]) -> bool:
    """True if library_artists is empty (no filter) or any track artist is in library."""
    if not library_artists:
        return True
    track_artists = _parse_track_artists(track_artists_str or "")
    return bool(track_artists & library_artists)


def _chart_author_in_library(
    chart: Any,
    detail: Optional[Any],
    beatport_api: Any,
    library_artists: Set[str],
) -> bool:
    """True if the chart's curator/author is in library_artists."""
    author = (detail.author_name if detail else None) or (getattr(chart, "author_name", None) or "")
    if not author and chart and detail is None:
        try:
            d = beatport_api.get_chart(chart.id)
            if d:
                author = d.author_name or ""
        except Exception:
            pass
    return bool(library_artists and _normalize_artist(author) in library_artists)


def _charts_branch(
    inventory_service: Any,
    beatport_api: Any,
    genre_ids: List[int],
    charts_from_date: date,
    charts_to_date: date,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
    library_artist_names: Optional[List[str]] = None,
) -> List[DiscoveredTrack]:
    """Collect tracks from charts curated by selected artists: find charts by those artists and add ALL tracks from each."""
    _logger.info(
        "inCrate discovery: charts branch — %s genres, %s to %s (filter by chart author, add all tracks)",
        len(genre_ids),
        charts_from_date,
        charts_to_date,
    )
    library_artists: Set[str] = set()
    try:
        all_artists = inventory_service.get_library_artists()
        if library_artist_names is not None and len(library_artist_names) > 0:
            allowed = {_normalize_artist(a) for a in library_artist_names}
            all_artists = [a for a in all_artists if _normalize_artist(a) in allowed]
        for a in all_artists:
            library_artists.add(_normalize_artist(a))
        _logger.info(
            "inCrate discovery: chart authors (selected) = %s, names = %s",
            len(library_artists),
            sorted(library_artists)[:30],
        )
        if not library_artists:
            _logger.warning(
                "inCrate discovery: no chart authors selected — charts branch will add 0 tracks (select artists to find their charts)"
            )
    except Exception as e:
        _logger.warning("get_library_artists failed: %s", e)
        return []

    result: List[DiscoveredTrack] = []
    total_genres = len(genre_ids) or 1
    if not genre_ids and progress_callback:
        progress_callback("charts", 0, 1)

    def _process_charts(charts_list: List[Any], source_label: str = "charts") -> None:
        charts_list = charts_list or []
        _logger.info(
            "inCrate discovery: _process_charts(%s) — %s charts, include only charts by selected authors (then all tracks)",
            source_label,
            len(charts_list),
        )
        for idx_chart, chart in enumerate(charts_list):
            try:
                detail = beatport_api.get_chart(chart.id)
            except Exception as e:
                _logger.warning("inCrate discovery: get_chart(%s) failed: %s", chart.id, e)
                continue
            if not detail:
                _logger.info("inCrate discovery: get_chart(%s) returned no detail", chart.id)
                continue
            author = (detail.author_name or "").strip() or (getattr(chart, "author_name", None) or "")
            if not _chart_author_in_library(chart, detail, beatport_api, library_artists):
                _logger.info(
                    "inCrate discovery: chart %s (%r) skipped — author %r not in selected artists",
                    chart.id,
                    (detail.name or "")[:30],
                    author[:40] if author else "(empty)",
                )
                continue
            n_tracks_in_chart = len(detail.tracks)
            for t in detail.tracks:
                result.append(
                    DiscoveredTrack(
                        beatport_track_id=t.track_id,
                        beatport_url=t.beatport_url or "",
                        title=t.title or "",
                        artists=t.artists or "",
                        source_type="chart",
                        source_name=detail.name or "",
                        source_label_name=None,
                        source_url=t.beatport_url or "",
                    )
                )
            _logger.info(
                "inCrate discovery: chart %s (%r) by %r — added all %s tracks",
                chart.id,
                (detail.name or "")[:40],
                (author or "")[:30],
                n_tracks_in_chart,
            )
            if n_tracks_in_chart and idx_chart < 5:
                _logger.info(
                    "inCrate discovery:   first track titles: %s",
                    [(t.title or "")[:35] for t in detail.tracks[:3]],
                )
            if idx_chart >= 10 and len(charts_list) > 15 and idx_chart == 10:
                _logger.info(
                    "inCrate discovery: ... (logging first charts only; %s charts total)",
                    len(charts_list),
                )

    for idx_genre, genre_id in enumerate(genre_ids):
        _logger.info(
            "inCrate discovery: charts genre %s/%s (genre_id=%s)",
            idx_genre + 1,
            total_genres,
            genre_id,
        )
        try:
            charts = beatport_api.list_charts(genre_id, charts_from_date, charts_to_date)
            _logger.info(
                "inCrate discovery: list_charts(genre_id=%s, from=%s, to=%s) returned %s charts",
                genre_id,
                charts_from_date,
                charts_to_date,
                len(charts) if charts else 0,
            )
        except Exception as e:
            _logger.warning("inCrate discovery: list_charts failed for genre %s: %s", genre_id, e)
            if progress_callback:
                progress_callback("charts", idx_genre + 1, total_genres)
            continue
        _process_charts(charts, "genre")
        if progress_callback:
            progress_callback("charts", idx_genre + 1, total_genres)

    # If no chart tracks from genre-filtered list, try charts without genre (some APIs support genre_id=0 for "all")
    if len(result) == 0 and genre_ids:
        _logger.info(
            "inCrate discovery: 0 tracks from genre charts; trying fallback list_charts(genre_id=0, limit=200)"
        )
        try:
            charts_all = beatport_api.list_charts(0, charts_from_date, charts_to_date, limit=200)
            _logger.info(
                "inCrate discovery: charts fallback (no genre) — list_charts returned %s charts",
                len(charts_all) if charts_all else 0,
            )
            _process_charts(charts_all, "fallback")
        except Exception as e:
            _logger.warning("inCrate discovery: charts fallback (genre_id=0) failed: %s", e)
    _logger.info("inCrate discovery: charts branch done — %s tracks", len(result))
    return result


def _new_releases_branch(
    inventory_service: Any,
    beatport_api: Any,
    new_releases_days: int,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
    library_label_names: Optional[List[str]] = None,
) -> List[DiscoveredTrack]:
    """Collect tracks from label releases (last N days) for library labels."""
    _logger.info(
        "inCrate discovery: new releases branch — last %s days",
        new_releases_days,
    )
    try:
        library_labels = inventory_service.get_library_labels()
        if library_label_names is not None and len(library_label_names) > 0:
            allowed = {(n or "").strip().lower() for n in library_label_names}
            library_labels = [n for n in library_labels if (n or "").strip().lower() in allowed]
        _logger.info(
            "inCrate discovery: library labels count = %s, names = %s",
            len(library_labels) if library_labels else 0,
            (library_labels or [])[:20],
        )
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
            _logger.warning("inCrate discovery: search_label_by_name(%r) failed: %s", label_name, e)
            continue
        if label_id is not None:
            label_ids[label_name] = label_id
            _logger.info(
                "inCrate discovery: label %r -> id=%s",
                label_name[:50] + ("..." if len(label_name or "") > 50 else ""),
                label_id,
            )
        else:
            _logger.info("inCrate discovery: label %r -> not found", label_name[:50])

    _logger.info(
        "inCrate discovery: resolved %s/%s labels to ids: %s",
        len(label_ids),
        total_library_labels,
        list(label_ids.items())[:15],
    )
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
            "inCrate discovery: get_label_releases(label_id=%s, from=%s, to=%s) for label %s/%s: %r",
            label_id,
            from_date,
            to_date,
            idx + 1,
            total_labels,
            (label_name or "")[:40] + ("..." if len(label_name or "") > 40 else ""),
        )
        try:
            releases = beatport_api.get_label_releases(label_id, from_date, to_date)
        except Exception as e:
            _logger.warning("inCrate discovery: get_label_releases(label_id=%s) failed: %s", label_id, e)
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
        _logger.info(
            "inCrate discovery: label %r (id=%s) — %s releases, %s tracks",
            (label_name or "")[:40],
            label_id,
            n_releases,
            n_tracks,
        )
        if n_releases > 0 and n_tracks == 0:
            _logger.warning(
                "inCrate discovery: label %r (%s): %s releases but 0 tracks — API may return releases without track list",
                label_name,
                label_id,
                n_releases,
            )
        for rel in releases[:10]:
            _logger.info(
                "inCrate discovery:   release id=%s title=%r tracks=%s",
                getattr(rel, "release_id", "?"),
                (getattr(rel, "title", "") or "")[:40],
                len(rel.tracks) if rel.tracks else 0,
            )
        if len(releases) > 10:
            _logger.info("inCrate discovery:   ... and %s more releases", len(releases) - 10)
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
                        source_label_name=label_name or None,
                        source_url=t.beatport_url or "",
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
    removed = len(tracks) - len(out)
    _logger.info(
        "inCrate discovery: dedupe — %s tracks in, %s unique, %s duplicates removed",
        len(tracks),
        len(out),
        removed,
    )
    return out


def run_discovery(
    inventory_service: Any,
    beatport_api: Any,
    genre_ids: List[int],
    charts_from_date: date,
    charts_to_date: date,
    new_releases_days: int = 30,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
    library_artist_names: Optional[List[str]] = None,
    library_label_names: Optional[List[str]] = None,
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
        library_artist_names: If non-empty, only match chart authors in this list; None or empty = use all.
        library_label_names: If non-empty, only fetch releases for these labels; None or empty = use all.

    Returns:
        Deduplicated list of DiscoveredTrack (charts first, then releases; same track_id appears once).
    """
    _logger.info(
        "inCrate discovery: run_discovery — genres=%s, artists_filter=%s, labels_filter=%s, charts %s–%s, releases_days=%s",
        len(genre_ids),
        len(library_artist_names) if library_artist_names else "all",
        len(library_label_names) if library_label_names else "all",
        charts_from_date,
        charts_to_date,
        new_releases_days,
    )
    _logger.info(
        "inCrate discovery: genre_ids=%s, library_artist_names=%s, library_label_names=%s",
        genre_ids,
        (library_artist_names or [])[:20],
        (library_label_names or [])[:20],
    )
    chart_tracks = _charts_branch(
        inventory_service,
        beatport_api,
        genre_ids,
        charts_from_date,
        charts_to_date,
        progress_callback,
        library_artist_names=library_artist_names,
    )
    release_tracks = _new_releases_branch(
        inventory_service,
        beatport_api,
        new_releases_days,
        progress_callback,
        library_label_names=library_label_names,
    )
    combined = chart_tracks + release_tracks
    _logger.info(
        "inCrate discovery: combined chart + release tracks = %s (chart ids sample: %s)",
        len(combined),
        [t.beatport_track_id for t in combined[:8]],
    )
    deduped = _dedupe(combined)
    _logger.info(
        "inCrate discovery: done — charts=%s, releases=%s, combined=%s, deduped=%s",
        len(chart_tracks),
        len(release_tracks),
        len(combined),
        len(deduped),
    )
    if deduped:
        _logger.info(
            "inCrate discovery: sample tracks: %s",
            [(t.beatport_track_id, (t.title or "")[:30], (t.artists or "")[:30]) for t in deduped[:5]],
        )
    return deduped
