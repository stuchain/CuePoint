"""The activity feed over the engine HTTP API (SHELL-08, DEC-026).

FOUNDATION-08 built an append-only ``activity_events`` table and the service
over it; nothing has ever displayed it. This is the read side.

**Not under ``/history``, deliberately.** ``/api/v1/history/*`` already exists
and means something else entirely: past *match runs*, which are CSV files on
disk. Two different things called history — one a feed of what the app did, one
a list of exported result files — would be a lasting confusion in both the API
and the UI, so this is ``/activity`` and the panel is called Activity.

Read-only by design. The table supports reverting a field change (DEC-008), but
a revert button here would act on fields nothing can yet edit; that belongs to
the phases that produce editable fields.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

RECENT_LIMIT_DEFAULT = 50
RECENT_LIMIT_MAX = 200


class ActivityUnavailableError(RuntimeError):
    """The activity service could not be resolved.

    Raised rather than returning an empty feed: "nothing has happened yet" and
    "the database is unreachable" look identical in an empty panel and need
    different answers.
    """


def _resolve_activity_service() -> Any:
    """Resolve ``IActivityService`` from the DI container.

    Per call, not at import: this module is imported while the engine server is
    being built, before ``bootstrap_services()`` has run. Same pattern as the
    job store and the library search endpoint.
    """
    try:
        from cuepoint.services.interfaces import IActivityService
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(IActivityService)
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise ActivityUnavailableError(str(exc)) from exc


def event_to_dict(event: Any) -> Dict[str, Any]:
    """Serialize one activity event for the API.

    An explicit field list rather than ``asdict``: this is a public response
    shape, and a field added to the model for internal reasons should not
    silently join it.
    """
    return {
        "id": event.id,
        "type": event.type,
        "summary": event.summary,
        "detail": event.detail or {},
        "created_at": event.created_at,
    }


def recent_activity(
    limit: int = RECENT_LIMIT_DEFAULT,
    event_type: Optional[str] = None,
) -> Dict[str, Any]:
    """Return recent activity events, newest first.

    ``total`` is every event ever recorded, not the page length, so a caller
    showing 50 can say how many exist without asking twice.
    """
    safe_limit = max(1, min(int(limit), RECENT_LIMIT_MAX))
    service = _resolve_activity_service()
    events = service.recent_events(limit=safe_limit, event_type=event_type)
    return {
        "events": [event_to_dict(event) for event in events],
        "total": service.event_count(),
        "limit": safe_limit,
    }
