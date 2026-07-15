"""inCrate inventory endpoints for engine HTTP API (Phase 3 P1)."""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.incrate.playlist_writer import PlaylistResult, create_playlist_and_add_tracks

_services_bootstrapped = False


def _ensure_services() -> None:
    global _services_bootstrapped
    if _services_bootstrapped:
        return
    from cuepoint.services.bootstrap import bootstrap_services

    bootstrap_services()
    _services_bootstrapped = True


def _get_inventory_service(db_path: Optional[str] = None):
    _ensure_services()
    from cuepoint.services.inventory_service import InventoryService

    if db_path:
        return InventoryService(db_path=db_path)
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(InventoryService)


def _get_config_service():
    _ensure_services()
    from cuepoint.utils.di_container import get_container
    from cuepoint.services.interfaces import IConfigService

    return get_container().resolve(IConfigService)


def _get_beatport_api():
    _ensure_services()
    from cuepoint.utils.di_container import get_container
    from cuepoint.services.beatport_api import BeatportApi

    return get_container().resolve(BeatportApi)


def _get_discovery_service():
    _ensure_services()
    from cuepoint.utils.di_container import get_container
    from cuepoint.services.incrate_discovery_service import IncrateDiscoveryService

    return get_container().resolve(IncrateDiscoveryService)


def discovered_track_to_dict(track: DiscoveredTrack) -> Dict[str, Any]:
    return {
        "beatport_track_id": track.beatport_track_id,
        "beatport_url": track.beatport_url,
        "title": track.title,
        "artists": track.artists,
        "source_type": track.source_type,
        "source_name": track.source_name,
        "source_label_name": track.source_label_name,
        "source_url": track.source_url,
    }


def playlist_result_to_dict(result: PlaylistResult) -> Dict[str, Any]:
    return {
        "success": result.success,
        "playlist_url": result.playlist_url,
        "playlist_id": result.playlist_id,
        "added_count": result.added_count,
        "error": result.error,
    }


def get_discover_options(*, db_path: Optional[str] = None) -> Dict[str, Any]:
    inventory = _get_inventory_service(db_path)
    stats = inventory.get_inventory_stats()
    artists = inventory.get_library_artists() or []
    labels = inventory.get_library_labels() or []
    token = str(_get_config_service().get("incrate.beatport_access_token") or "").strip()
    genres: List[Dict[str, Any]] = []
    if token:
        try:
            genres = [
                {"id": g.id, "name": g.name, "slug": g.slug}
                for g in _get_beatport_api().list_genres()
            ]
        except Exception:
            genres = []
    return {
        "inventory_stats": stats,
        "artists": [{"name": name} for name in artists],
        "labels": [{"name": name} for name in labels],
        "genres": genres,
        "token_configured": bool(token),
        "defaults": {
            "charts_from": (date.today() - timedelta(days=30)).isoformat(),
            "charts_to": date.today().isoformat(),
            "new_releases_days": int(_get_config_service().get("incrate.new_releases_days") or 30),
        },
    }


def parse_discover_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Request body required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    if bool(data.get("demo")):
        return {"demo": True}
    genre_ids = data.get("genre_ids") or []
    if not isinstance(genre_ids, list):
        raise ValueError("genre_ids must be an array")
    charts_from = data.get("charts_from")
    charts_to = data.get("charts_to")
    new_releases_days = data.get("new_releases_days", 30)
    artist_names = data.get("artist_names") or []
    label_names = data.get("label_names") or []
    if not isinstance(artist_names, list) or not isinstance(label_names, list):
        raise ValueError("artist_names and label_names must be arrays")
    from_date = date.fromisoformat(str(charts_from)) if charts_from else None
    to_date = date.fromisoformat(str(charts_to)) if charts_to else None
    try:
        days = int(new_releases_days)
    except (TypeError, ValueError) as exc:
        raise ValueError("new_releases_days must be an integer") from exc
    return {
        "demo": False,
        "genre_ids": [int(g) for g in genre_ids],
        "charts_from_date": from_date,
        "charts_to_date": to_date,
        "new_releases_days": days,
        "artist_names": [str(name) for name in artist_names if str(name).strip()],
        "label_names": [str(name) for name in label_names if str(name).strip()],
    }


def demo_discover_tracks() -> List[Dict[str, Any]]:
    return [
        discovered_track_to_dict(
            DiscoveredTrack(
                beatport_track_id=9001,
                beatport_url="https://www.beatport.com/track/demo-chart/9001",
                title="Demo Chart Track",
                artists="Demo Artist",
                source_type="chart",
                source_name="Demo Top 100",
                source_url="https://www.beatport.com/chart/demo/1",
            )
        ),
        discovered_track_to_dict(
            DiscoveredTrack(
                beatport_track_id=9002,
                beatport_url="https://www.beatport.com/track/demo-release/9002",
                title="Demo Label Release",
                artists="Other Artist",
                source_type="label_release",
                source_name="Demo EP",
                source_label_name="Demo Label",
                source_url="https://www.beatport.com/release/demo/2",
            )
        ),
    ]


def run_discover(body: Dict[str, Any]) -> Dict[str, Any]:
    if body.get("demo"):
        tracks = demo_discover_tracks()
        return {"tracks": tracks, "count": len(tracks), "demo": True}
    service = _get_discovery_service()
    tracks = service.run_discovery(
        genre_ids=body.get("genre_ids"),
        charts_from_date=body.get("charts_from_date"),
        charts_to_date=body.get("charts_to_date"),
        new_releases_days=body.get("new_releases_days"),
        library_artist_names=body.get("artist_names") or None,
        library_label_names=body.get("label_names") or None,
    )
    serialized = [discovered_track_to_dict(track) for track in tracks]
    return {"tracks": serialized, "count": len(serialized)}


def parse_playlist_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Request body required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    name = str(data.get("name") or "").strip()
    if not name:
        raise ValueError("name is required")
    tracks_raw = data.get("tracks") or []
    if not isinstance(tracks_raw, list):
        raise ValueError("tracks must be an array")
    tracks: List[DiscoveredTrack] = []
    for item in tracks_raw:
        if not isinstance(item, dict):
            continue
        track_id = item.get("beatport_track_id")
        if track_id is None:
            continue
        tracks.append(
            DiscoveredTrack(
                beatport_track_id=int(track_id),
                beatport_url=str(item.get("beatport_url") or ""),
                title=str(item.get("title") or ""),
                artists=str(item.get("artists") or ""),
                source_type=str(item.get("source_type") or "chart"),
                source_name=str(item.get("source_name") or ""),
                source_label_name=item.get("source_label_name"),
                source_url=item.get("source_url"),
            )
        )
    return {"name": name, "tracks": tracks}


def run_playlist_create(body: Dict[str, Any]) -> Dict[str, Any]:
    api = _get_beatport_api()
    result = create_playlist_and_add_tracks(
        body["name"],
        body["tracks"],
        api_client=api,
        browser_add_to_playlist=None,
    )
    return playlist_result_to_dict(result)


def get_inventory_snapshot(
    *,
    limit: int = 100,
    search: Optional[str] = None,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    service = _get_inventory_service(db_path)
    stats = service.get_inventory_stats()
    rows = service.list_inventory(limit=max(1, min(limit, 5000)), search=search or None)
    return {
        "stats": stats,
        "rows": rows,
        "limit": limit,
        "search": search or "",
    }


def parse_incrate_import_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Request body required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    xml_path = data.get("xml_path")
    if not xml_path or not str(xml_path).strip():
        raise ValueError("xml_path is required")
    return {
        "xml_path": str(xml_path),
        "enrich": bool(data.get("enrich", False)),
        "db_path": data.get("db_path"),
    }


def run_incrate_import(body: Dict[str, Any]) -> Dict[str, Any]:
    service = _get_inventory_service(body.get("db_path"))
    return service.import_from_xml(body["xml_path"], enrich=body["enrich"])


def demo_inventory_snapshot() -> Dict[str, Any]:
    """Static demo payload when no DB rows exist (Electron dev)."""
    return {
        "stats": {"total": 3, "with_label": 2},
        "rows": [
            {
                "id": 1,
                "track_id": "demo-1",
                "artist": "Demo Artist",
                "title": "Demo Track One",
                "label": "Demo Label",
                "beatport_url": None,
            },
            {
                "id": 2,
                "track_id": "demo-2",
                "artist": "Demo Artist",
                "title": "Demo Track Two",
                "label": "",
                "beatport_url": None,
            },
            {
                "id": 3,
                "track_id": "demo-3",
                "artist": "Other Artist",
                "title": "Demo Track Three",
                "label": "Anjunabeats",
                "beatport_url": "https://www.beatport.com/track/demo/3",
            },
        ],
        "limit": 100,
        "search": "",
        "demo": True,
    }
