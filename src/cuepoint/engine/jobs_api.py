"""Listing jobs over the engine HTTP API (SHELL-07, DEC-026).

Until now the only way to ask about a job was ``/api/v1/jobs/{id}``, which
means a caller could only learn about jobs it started itself. The status strip
has to report on jobs it did not start — one begun before a renderer reload,
or by another window — so it needs to be able to ask what exists.

Two sources are merged. The in-memory store is authoritative for anything this
process is running: its progress is current, while persisted progress is
sampled at most once a second (FOUNDATION-07). The repository covers what the
in-memory store cannot — jobs that outlived an engine restart, which DEC-007
made durable and nothing has displayed until now.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

# Jobs a user would consider "happening now", and the only ones the status
# strip follows.
ACTIVE_STATES = frozenset({"queued", "running"})

LIST_LIMIT_DEFAULT = 20
LIST_LIMIT_MAX = 100


def _resolve_job_repository() -> Optional[Any]:
    """Resolve the job repository, or None when persistence is unavailable.

    Resolved per call rather than at import, matching the pattern the job store
    already uses: this module is imported while the server is being built,
    before ``bootstrap_services()`` has run.

    A missing repository is not an error. Job records are a convenience; if the
    database cannot be reached the engine still runs jobs and this endpoint
    still reports the ones in memory.
    """
    try:
        from cuepoint.services.interfaces import IJobRepository
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(IJobRepository)
    except Exception:  # noqa: BLE001 — persistence is best-effort
        return None


def _record_to_dict(record: Any) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "id": record.id,
        "type": record.type,
        "state": record.state,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "demo": bool(record.demo),
    }
    if record.progress is not None:
        payload["progress"] = record.progress
    if record.error is not None:
        payload["error"] = record.error
    return payload


def _live_to_dict(job: Any) -> Dict[str, Any]:
    """Return a live job's payload, without inventing a type for it.

    The in-memory job carries the discriminator itself now (DEC-033), but a
    store holding something older — or a test double — may not report one.
    Defaulting here would make "this job says it is a match" and "this job did
    not say" indistinguishable, and the merge below has to tell them apart to
    know whether the live answer or the persisted column is the better one.
    """
    return dict(job.to_status_dict())


def list_jobs(
    state: str = "active",
    limit: int = LIST_LIMIT_DEFAULT,
    *,
    job_store: Any,
) -> Dict[str, Any]:
    """Return jobs, newest first.

    Args:
        state: ``"active"`` for queued and running jobs, ``"all"`` for every
            job either source knows about.
        limit: Maximum jobs to return, clamped to ``LIST_LIMIT_MAX``.
        job_store: The engine's in-memory store.

    Returns:
        ``{"jobs": [...], "active_count": int}``. ``active_count`` counts
        active jobs regardless of ``state`` or ``limit``, so a caller showing
        only the first job can still say how many are running.
    """
    safe_limit = max(1, min(int(limit), LIST_LIMIT_MAX))
    want_active = state != "all"

    merged: Dict[str, Dict[str, Any]] = {}

    repository = _resolve_job_repository()
    if repository is not None:
        try:
            for record in repository.list_recent(limit=LIST_LIMIT_MAX):
                merged[record.id] = _record_to_dict(record)
        except Exception:  # noqa: BLE001 — persistence is best-effort
            pass

    # In-memory last, so it wins: its progress is live, the persisted copy is
    # sampled.
    for job in job_store.list_all():
        live = _live_to_dict(job)
        existing = merged.get(live["id"])
        if not live.get("type"):
            # A live job that cannot say what it is falls back to the persisted
            # column, then to the historical default. A job that *can* say keeps
            # its own answer: it is the source, and letting the sampled record
            # win would relabel a running import as a match.
            live["type"] = (existing or {}).get("type", "match")
        merged[live["id"]] = live

    jobs = list(merged.values())
    active_count = sum(1 for job in jobs if job.get("state") in ACTIVE_STATES)

    if want_active:
        jobs = [job for job in jobs if job.get("state") in ACTIVE_STATES]

    jobs.sort(
        key=lambda job: (job.get("created_at") or "", job.get("id") or ""), reverse=True
    )
    return {"jobs": jobs[:safe_limit], "active_count": active_count}
