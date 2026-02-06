#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Runtime Health Checks (Design 7)

Checks for key services: search (Beatport), parsing (rekordbox), caching.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from cuepoint.utils.network import NetworkState


@dataclass
class HealthCheckResult:
    """Result of a single health check."""

    name: str
    ok: bool
    message: str
    detail: Optional[str] = None


def check_search_service(beatport_service: Any = None) -> HealthCheckResult:
    """Check if search (Beatport) service is operational.

    Verifies network availability; does not make actual search calls.
    """
    try:
        if NetworkState.is_online():
            return HealthCheckResult("search", True, "Online", "Network available for Beatport search")
        return HealthCheckResult("search", False, "Offline", "No network; search will use cache only")
    except Exception as e:
        return HealthCheckResult("search", False, "Error", str(e))


def check_parsing_service() -> HealthCheckResult:
    """Check if XML parsing (rekordbox) is operational."""
    import tempfile

    try:
        from cuepoint.data.rekordbox import parse_rekordbox

        minimal = '<?xml version="1.0"?><DJ_PLAYLISTS Version="1.0"><COLLECTION/><PLAYLISTS><NODE Name="ROOT"/></PLAYLISTS></DJ_PLAYLISTS>'
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(minimal)
            path = f.name
        try:
            parse_rekordbox(path)
            return HealthCheckResult("parsing", True, "OK", "Rekordbox parser operational")
        finally:
            Path(path).unlink(missing_ok=True)
    except Exception as e:
        return HealthCheckResult("parsing", False, "Error", str(e))


def check_cache_service(cache_service: Any = None) -> HealthCheckResult:
    """Check if cache service is operational."""
    try:
        if cache_service is None:
            try:
                from cuepoint.services.interfaces import ICacheService
                from cuepoint.utils.di_container import get_container
                cache_service = get_container().resolve(ICacheService)
            except Exception:
                return HealthCheckResult("caching", False, "Unavailable", "Cache service not initialized")

        # Simple get/set round-trip
        key = "_health_check_"
        cache_service.set(key, "ok", ttl=5)
        val = cache_service.get(key)
        return HealthCheckResult(
            "caching",
            val == "ok",
            "OK" if val == "ok" else "Degraded",
            "Cache read/write operational" if val == "ok" else "Cache may be read-only",
        )
    except Exception as e:
        return HealthCheckResult("caching", False, "Error", str(e))


def run_all_health_checks(
    beatport_service: Any = None,
    cache_service: Any = None,
) -> Dict[str, HealthCheckResult]:
    """Run all health checks. Returns dict of name -> result."""
    return {
        "search": check_search_service(beatport_service),
        "parsing": check_parsing_service(),
        "caching": check_cache_service(cache_service),
    }
