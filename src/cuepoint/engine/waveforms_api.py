#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Waveforms and their analysis over the wire (WAVE-03, WAVE-05).

WAVE-03 built the analysis's three routes; WAVE-05 adds the waveforms
themselves, requests and "Delete waveform data".

- ``GET /api/v1/waveforms?track_ids=1,2&width=120&marks=0|1&data=0|1``: each
  track's state, and for a ready one its duration, its loudness (WAVE-08) and
  its picture at ``width`` (16–1,200) as base64, ``width × 4`` bytes: each
  column's full, low, mid and high band. At most 200 ids. With ``marks=1``,
  each track's cues and every grid marker. With ``data=0``, no picture is read
  at all, and ``width`` is neither needed nor taken: the states and loudness
  alone, for a column that shows a number. ``paused`` is the analysis's, so a
  ``waiting`` track can be said to wait for a paused analysis. An id that is no
  track is listed under ``unknown`` rather than refused, so one track deleted
  mid-scroll does not refuse the 199 beside it.
- ``GET /api/v1/waveforms/analysis``: the analysis as a whole: ``running``,
  ``paused``, ``idle`` or ``unavailable``, with the counts, the rate, the
  running job's id and the store's size on disk.
- ``POST /api/v1/waveforms/analysis/pause``: pause, persisted, and stop a
  running job. Answers the state after.
- ``POST /api/v1/waveforms/analysis/resume``: clear the pause and start a run.
  Answers the state after.
- ``POST /api/v1/waveforms/request``: ``{"track_ids": […]}``, at most 50, put
  at the front of the analysis's queue (WAVE-03), even while paused.
- ``POST /api/v1/waveforms/delete-data``: empty the store, and start the
  analysis again unless paused. Answers what went and the state after.

T4 (ADR-011) adds the zoomed waveform:

- ``GET /api/v1/waveforms/detail?track_id=N``: ``{"track_id", "state", "reason",
  "rate_hz", "duration_ms", "columns", "data"}``. ``state`` is the overview's
  words (``ready``, ``waiting``, ``missing``, ``unchecked``, ``failed``,
  ``unavailable``) and ``working``, a ``waiting`` track whose detail is being
  made now. ``data`` is the base64 of ``columns × 4`` bytes (each column's full,
  low, mid and high at ``rate_hz`` columns a second) only when ``ready``,
  otherwise null. An id that is no track answers 404 ``NOT_FOUND``.
- ``POST /api/v1/waveforms/detail/request``: ``{"track_id": N}``. Answers
  ``{"track_id", "state"}``: ``ready`` when it is stored, ``working`` once it is
  queued (even while the analysis is paused), or the reason it cannot be made
  (``missing``, ``unchecked``, ``failed``, ``unavailable``). Not a job: Activity
  and the status strip never show it.

Every handler validates and delegates: when a run starts and what stops it is
``engine/waveform_jobs.py``'s, and a picture is ``services/waveform_service.py``'s.
A query parameter or a body key a route does not take is refused, naming it.

Refusals
--------
- ``INVALID_REQUEST`` (400): a parameter or a body.
- ``WAVEFORMS_SETTING_FAILED`` (500): the pause setting could not be saved, so
  nothing changed.
- ``WAVEFORMS_STORE_FAILED`` (500): the store could not be emptied, so nothing
  was deleted.
- 503 ``WAVEFORMS_UNAVAILABLE`` when the library's services cannot be reached,
  and 500 ``WAVEFORMS_FAILED`` for anything unrecognized. Neither is a refusal
  a person can act on, so the client throws them.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from cuepoint.engine.api_errors import ApiError, bad_request, error_payload, not_found
from cuepoint.engine.jobs import JobStore

_logger = logging.getLogger(__name__)

PREFIX = "/api/v1/waveforms/"
WAVEFORMS_PATH = PREFIX.rstrip("/")
ANALYSIS_PATH = PREFIX + "analysis"
PAUSE_PATH = ANALYSIS_PATH + "/pause"
RESUME_PATH = ANALYSIS_PATH + "/resume"
REQUEST_PATH = PREFIX + "request"
DELETE_DATA_PATH = PREFIX + "delete-data"
DETAIL_PATH = PREFIX + "detail"
DETAIL_REQUEST_PATH = DETAIL_PATH + "/request"

INVALID_REQUEST = "INVALID_REQUEST"
SETTING_FAILED = "WAVEFORMS_SETTING_FAILED"
STORE_FAILED = "WAVEFORMS_STORE_FAILED"
UNAVAILABLE = "WAVEFORMS_UNAVAILABLE"

#: The refusal codes a caller can branch on.
REFUSAL_CODES: Tuple[str, ...] = (INVALID_REQUEST, SETTING_FAILED, STORE_FAILED)

GET_PATHS: Tuple[str, ...] = (WAVEFORMS_PATH, ANALYSIS_PATH, DETAIL_PATH)
POST_PATHS: Tuple[str, ...] = (
    PAUSE_PATH,
    RESUME_PATH,
    REQUEST_PATH,
    DELETE_DATA_PATH,
    DETAIL_REQUEST_PATH,
)

#: A detail whose decode is queued or going, as a track's state: the overview's
#: ``waiting`` with something on the way.
STATE_WORKING = "working"

#: Tracks one waveform read answers: one library query and one store query.
MAX_TRACKS = 200

#: Tracks one request queues. A view asks for what a person is looking at.
MAX_REQUESTED = 50


class WaveformsUnavailableError(RuntimeError):
    """A service could not be resolved: the database is unreachable."""


def _resolve(interface_name: str) -> Any:
    """Resolve one interface by name, per call: imported before bootstrap."""
    try:
        from cuepoint.services import interfaces
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(getattr(interfaces, interface_name))
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise WaveformsUnavailableError(str(exc)) from exc


# ---------------------------------------------------------------------------
# Parameters and bodies
# ---------------------------------------------------------------------------


def _no_params(params: Dict[str, List[str]]) -> None:
    if params:
        raise bad_request(
            f"This route takes no parameters, not {', '.join(sorted(params))!r}"
        )


def _params(params: Dict[str, List[str]], allowed: Sequence[str]) -> Dict[str, str]:
    """One value per name, refusing names this route does not take."""
    unknown = sorted(set(params) - set(allowed))
    if unknown:
        raise bad_request(f"Unknown parameter: {', '.join(unknown)!r}")
    single: Dict[str, str] = {}
    for name, values in params.items():
        if len(values) != 1:
            raise bad_request(f"{name} must be given once")
        single[name] = values[0]
    return single


def _body(raw: bytes) -> Dict[str, Any]:
    text = raw.decode("utf-8", errors="replace").strip() if raw else ""
    if not text:
        return {}
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise bad_request("The body is not JSON") from exc
    if not isinstance(data, dict):
        raise bad_request("The body must be a JSON object")
    return data


def _only(data: Mapping[str, Any], allowed: Sequence[str]) -> None:
    unknown = sorted(set(data) - set(allowed))
    if unknown:
        raise bad_request(f"This route takes no fields {', '.join(unknown)!r}")


def _id(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise bad_request(
            f"Each track id must be a whole number above 0, not {value!r}"
        )
    return int(value)


def _unique(ids: Sequence[int], limit: int) -> List[int]:
    wanted = list(dict.fromkeys(ids))
    if not wanted:
        raise bad_request("track_ids must name at least one track")
    if len(wanted) > limit:
        raise bad_request(f"At most {limit} track ids at once, not {len(wanted)}")
    return wanted


def _query_ids(raw: str) -> List[int]:
    ids: List[int] = []
    for part in raw.split(","):
        text = part.strip()
        if not text.isdigit():
            raise bad_request(
                f"track_ids must be whole numbers above 0, separated by commas,"
                f" not {part!r}"
            )
        ids.append(_id(int(text)))
    return _unique(ids, MAX_TRACKS)


def _width(raw: str) -> int:
    from cuepoint.core.waveform import COLUMNS, MIN_WIDTH

    text = raw.strip()
    if not text.isdigit() or not MIN_WIDTH <= int(text) <= COLUMNS:
        raise bad_request(f"width must be a whole number from {MIN_WIDTH} to {COLUMNS}")
    return int(text)


def _flag(raw: str, name: str) -> bool:
    if raw not in ("0", "1"):
        raise bad_request(f"{name} must be 0 or 1, not {raw!r}")
    return raw == "1"


# ---------------------------------------------------------------------------
# The routes
# ---------------------------------------------------------------------------


def waveforms(params: Dict[str, List[str]], store: JobStore) -> Dict[str, Any]:
    """Each track's state, picture and, when asked, marks."""
    from cuepoint.engine.waveform_jobs import analysis_paused

    query = _params(params, ("track_ids", "width", "marks", "data"))
    if "track_ids" not in query:
        raise bad_request("track_ids is required")
    with_data = _flag(query.get("data", "1"), "data")
    if with_data and "width" not in query:
        raise bad_request("width is required")
    if not with_data and "width" in query:
        raise bad_request("width is only taken with the picture: drop it, or data=0")
    ids = _query_ids(query["track_ids"])
    width = _width(query["width"]) if with_data else None
    with_marks = _flag(query.get("marks", "0"), "marks")

    service = _resolve("IWaveformService")
    answers: List[Tuple[Any, Optional[bytes]]] = (
        [(answer.state, answer.data) for answer in service.waveforms(ids, width)]
        if width is not None
        else [(state, None) for state in service.states(ids)]
    )
    marks: Dict[int, Any] = {}
    marks_read = False
    if with_marks:
        repository = _resolve("ITrackMarksRepository")
        found = [state.track_id for state, _ in answers]
        marks = repository.get_many(found) if found else {}
        marks_read = bool(repository.is_read())
    answered = {state.track_id for state, _ in answers}
    return {
        "width": width,
        "paused": analysis_paused(store),
        "waveforms": [
            {
                **state.to_dict(),
                "data": (
                    base64.b64encode(data).decode("ascii") if data is not None else None
                ),
                "marks": (
                    marks[state.track_id].drawing(marks_read) if with_marks else None
                ),
            }
            for state, data in answers
        ],
        "unknown": [track_id for track_id in ids if track_id not in answered],
    }


def _detail_answer(track_id: int) -> Any:
    """The service's answer for one track, or a 404."""
    answer = _resolve("IWaveformService").detail(track_id)
    if answer is None:
        raise not_found("NOT_FOUND", "No such track")
    return answer


def _working(state: str, track_id: int, store: JobStore) -> str:
    from cuepoint.engine.waveform_jobs import detail_in_flight

    if state == "waiting" and detail_in_flight(store, track_id):
        return STATE_WORKING
    return state


def detail(params: Dict[str, List[str]], store: JobStore) -> Dict[str, Any]:
    """One track's zoomed waveform, or the state that explains its absence."""
    query = _params(params, ("track_id",))
    if "track_id" not in query:
        raise bad_request("track_id is required")
    text = query["track_id"].strip()
    if not text.isdigit():
        raise bad_request("track_id must be a whole number above 0")
    track_id = _id(int(text))
    answer = _detail_answer(track_id)
    state = answer.state
    ready = answer.data is not None
    return {
        "track_id": track_id,
        "state": _working(state.state, track_id, store),
        "reason": state.reason,
        "rate_hz": answer.rate_hz if ready else None,
        "duration_ms": state.duration_ms if ready else None,
        "columns": answer.columns if ready else None,
        "data": base64.b64encode(answer.data).decode("ascii") if ready else None,
    }


def request_detail(body: Dict[str, Any], store: JobStore) -> Dict[str, Any]:
    """Queue a track's zoomed waveform; its state after."""
    from cuepoint.engine.waveform_jobs import request_detail as queue

    _only(body, ("track_id",))
    track_id = _id(body.get("track_id"))
    answer = _detail_answer(track_id)
    state = answer.state.state
    if state == "waiting":
        state = STATE_WORKING if queue(store, track_id) else "unavailable"
    return {"track_id": track_id, "state": state}


def analysis(store: JobStore) -> Dict[str, Any]:
    """The analysis as a whole."""
    from cuepoint.engine.waveform_jobs import analysis_status

    return analysis_status(store).to_dict()


def pause(store: JobStore) -> Dict[str, Any]:
    """Pause the analysis; its state after."""
    from cuepoint.engine.waveform_jobs import pause_analysis

    return pause_analysis(store).to_dict()


def resume(store: JobStore) -> Dict[str, Any]:
    """Resume the analysis; its state after."""
    from cuepoint.engine.waveform_jobs import resume_analysis

    return resume_analysis(store).to_dict()


def request(body: Dict[str, Any], store: JobStore) -> Dict[str, Any]:
    """Put tracks at the front of the analysis's queue."""
    from cuepoint.engine.waveform_jobs import request_analysis

    _only(body, ("track_ids",))
    raw = body.get("track_ids")
    if not isinstance(raw, list):
        raise bad_request("track_ids must be a list of track ids")
    ids = _unique([_id(value) for value in raw], MAX_REQUESTED)
    job = request_analysis(store, ids)
    return {"requested": ids, "job_id": job.id if job is not None else None}


def delete_data(store: JobStore) -> Dict[str, Any]:
    """Empty the store; what went, and the analysis after."""
    from cuepoint.engine.waveform_jobs import analysis_status, delete_waveform_data

    deleted = delete_waveform_data(store)
    return {"deleted": deleted.to_dict(), "analysis": analysis_status(store).to_dict()}


def _without_body(
    route: Callable[[JobStore], Dict[str, Any]],
) -> Callable[[Dict[str, Any], JobStore], Dict[str, Any]]:
    def handler(body: Dict[str, Any], store: JobStore) -> Dict[str, Any]:
        _only(body, ())
        return route(store)

    return handler


_POST_ROUTES: Dict[str, Callable[[Dict[str, Any], JobStore], Dict[str, Any]]] = {
    PAUSE_PATH: _without_body(pause),
    RESUME_PATH: _without_body(resume),
    REQUEST_PATH: request,
    DELETE_DATA_PATH: _without_body(delete_data),
    DETAIL_REQUEST_PATH: request_detail,
}


def handles_get(path: str) -> bool:
    """True when this module answers a GET for ``path``."""
    return path in GET_PATHS


def handles_post(path: str) -> bool:
    """True when this module answers a POST for ``path``."""
    return path in POST_PATHS


def handle_get(
    path: str, params: Dict[str, List[str]], *, job_store: JobStore
) -> Tuple[int, Dict[str, Any]]:
    """Answer a GET, or raise."""
    if path == WAVEFORMS_PATH:
        return 200, waveforms(params, job_store)
    if path == ANALYSIS_PATH:
        _no_params(params)
        return 200, analysis(job_store)
    if path == DETAIL_PATH:
        return 200, detail(params, job_store)
    raise not_found("NOT_FOUND", "Unknown path")


def handle_post(
    path: str, raw: bytes, *, job_store: JobStore
) -> Tuple[int, Dict[str, Any]]:
    """Answer a POST, or raise."""
    handler = _POST_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    return 200, handler(_body(raw), job_store)


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from any handler here to a status and an envelope."""
    from cuepoint.exceptions.cuepoint_exceptions import ConfigurationError
    from cuepoint.persistence.waveform_store import WaveformStoreError

    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, ConfigurationError):
        _logger.warning("[waveforms] the pause setting was not saved: %s", exc)
        return 500, error_payload(
            SETTING_FAILED, "The waveform setting could not be saved"
        )
    if isinstance(exc, WaveformStoreError):
        _logger.warning("[waveforms] the waveform data was not deleted: %s", exc)
        return 500, error_payload(
            STORE_FAILED, "The waveform data could not be deleted"
        )
    if isinstance(exc, WaveformsUnavailableError):
        _logger.warning("[waveforms] the library is unavailable: %s", exc)
        return 503, error_payload(UNAVAILABLE, "The library is not available")
    _logger.warning("[waveforms] request failed: %s", exc, exc_info=exc)
    return 500, error_payload("WAVEFORMS_FAILED", str(exc))


__all__: Sequence[str] = (
    "ANALYSIS_PATH",
    "DELETE_DATA_PATH",
    "DETAIL_PATH",
    "DETAIL_REQUEST_PATH",
    "GET_PATHS",
    "INVALID_REQUEST",
    "MAX_REQUESTED",
    "MAX_TRACKS",
    "PAUSE_PATH",
    "POST_PATHS",
    "PREFIX",
    "REFUSAL_CODES",
    "REQUEST_PATH",
    "RESUME_PATH",
    "SETTING_FAILED",
    "STATE_WORKING",
    "STORE_FAILED",
    "UNAVAILABLE",
    "WAVEFORMS_PATH",
    "WaveformsUnavailableError",
    "handle_get",
    "handle_post",
    "handles_get",
    "handles_post",
    "status_for",
)
