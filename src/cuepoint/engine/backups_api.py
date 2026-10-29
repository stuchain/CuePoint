"""Backups HTTP API for the engine (HARDEN-01).

``GET /api/v1/backups`` lists the library's backups, newest first;
``POST /api/v1/backups`` makes one now (reason ``manual``);
``DELETE /api/v1/backups/<name>`` deletes one. There is deliberately no restore
route: a restore runs with the engine stopped (``--restore``), because every
open connection and cache would otherwise hold the old file.

Messages here may be shown to the user, so they say "library" and "backup".
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Tuple
from urllib.parse import unquote

from cuepoint.engine.api_errors import ApiError, error_payload
from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.services.backup_service import BackupInfo
from cuepoint.services.interfaces import IActivityService, IBackupService

_logger = logging.getLogger(__name__)

BACKUPS_PATH = "/api/v1/backups"
_ITEM_PREFIX = BACKUPS_PATH + "/"

_STATUS_BY_CODE = {
    "BACKUP_INVALID_NAME": 400,
    "BACKUP_NOT_FOUND": 404,
    "BACKUP_NO_DATABASE": 409,
    "BACKUP_NEEDS_SPACE": 507,
}


def _service() -> IBackupService:
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.utils.di_container import get_container

    bootstrap_services()
    return get_container().resolve(IBackupService)


def backup_json(info: BackupInfo) -> Dict[str, Any]:
    """One backup as the API shows it."""
    payload: Dict[str, Any] = {
        "name": info.name,
        "createdAt": info.created_at,
        "reason": info.reason,
        "appVersion": info.app_version,
        "bytes": info.size_bytes,
    }
    if info.from_version or info.to_version:
        payload["fromVersion"] = info.from_version
        payload["toVersion"] = info.to_version
    return payload


def handles(method: str, path: str) -> bool:
    """True when this module answers ``method`` for ``path``."""
    if method in ("GET", "POST"):
        return path == BACKUPS_PATH
    if method == "DELETE":
        return path.startswith(_ITEM_PREFIX) and len(path) > len(_ITEM_PREFIX)
    return False


def _record_manual(info: BackupInfo) -> None:
    """Record ``backup.created`` the way the launch backup is; best effort."""
    try:
        from cuepoint.utils.di_container import get_container

        get_container().resolve(IActivityService).record_event(
            event_type="backup.created",
            summary="Library backed up",
            detail={"file": info.name, "reason": info.reason},
        )
    except Exception as exc:  # noqa: BLE001 - the feed is best-effort
        _logger.debug("[activity] could not record backup.created: %s", exc)


def handle(method: str, path: str) -> Tuple[int, Dict[str, Any]]:
    """Answer one request, or raise."""
    service = _service()
    if method == "GET":
        # ``folder`` lets the app show the backups in the file manager.
        folder = getattr(service, "backup_dir", None)
        return 200, {
            "backups": [backup_json(b) for b in service.list_backups()],
            "folder": str(folder) if folder else None,
        }
    if method == "POST":
        info = service.create_backup(reason="manual")
        _record_manual(info)
        return 200, backup_json(info)
    if method == "DELETE":
        service.delete_backup(unquote(path[len(_ITEM_PREFIX) :]))
        return 200, {"ok": True}
    raise ApiError(404, "NOT_FOUND", "Unknown path")


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from a handler here to a status and an envelope."""
    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, DatabaseError):
        code = getattr(exc, "error_code", None) or "BACKUP_FAILED"
        return _STATUS_BY_CODE.get(code, 500), error_payload(code, exc.message)
    return 500, error_payload("BACKUP_FAILED", "The backup could not be made")
