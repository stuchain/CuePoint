"""inCrate inventory endpoints for engine HTTP API (Phase 3 P1)."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

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
