"""Privacy HTTP API for engine sidecar (Phase 6)."""

from __future__ import annotations

from typing import Dict

from cuepoint.services.artwork_cache import clear_artwork_cache
from cuepoint.utils.privacy import DataDeletionManager


def clear_logs_now() -> Dict[str, object]:
    DataDeletionManager.clear_logs()
    return {"ok": True}


def clear_cache_now() -> Dict[str, object]:
    DataDeletionManager.clear_cache()
    # Artwork thumbnails (CLEAN-09) live under the platform cache directory,
    # which the line above clears, except when CUEPOINT_HOME moves them.
    clear_artwork_cache()
    return {"ok": True}
