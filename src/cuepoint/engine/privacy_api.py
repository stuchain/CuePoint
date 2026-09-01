"""Privacy HTTP API for engine sidecar (Phase 6)."""

from __future__ import annotations

from typing import Dict

from cuepoint.utils.privacy import DataDeletionManager


def clear_logs_now() -> Dict[str, object]:
    DataDeletionManager.clear_logs()
    return {"ok": True}


def clear_cache_now() -> Dict[str, object]:
    DataDeletionManager.clear_cache()
    return {"ok": True}
