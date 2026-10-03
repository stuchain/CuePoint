#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The waveform analysis over the wire (WAVE-03).

WAVE-03's own result needs three routes, and they are built here. WAVE-05 adds
the rest of the module: the waveforms themselves, requests and "Delete waveform
data".

- ``GET /api/v1/waveforms/analysis``: the analysis as a whole: ``running``,
  ``paused``, ``idle`` or ``unavailable``, with the counts, the rate and the
  running job's id.
- ``POST /api/v1/waveforms/analysis/pause``: pause, persisted, and stop a
  running job. Answers the state after.
- ``POST /api/v1/waveforms/analysis/resume``: clear the pause and start a run.
  Answers the state after.

Every handler validates and delegates: when a run starts and what stops it is
``engine/waveform_jobs.py``'s. A query parameter or a body key a route does not
take is refused, naming it.

Refusals
--------
- ``INVALID_REQUEST`` (400): a parameter or a body.
- ``WAVEFORMS_SETTING_FAILED`` (500): the pause setting could not be saved, so
  nothing changed. Not a refusal a person can act on in the app, but named so
  the words can say the setting did not stick.
- 500 ``WAVEFORMS_FAILED`` for anything unrecognized.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable, Dict, List, Sequence, Tuple

from cuepoint.engine.api_errors import ApiError, bad_request, error_payload, not_found
from cuepoint.engine.jobs import JobStore

_logger = logging.getLogger(__name__)

PREFIX = "/api/v1/waveforms/"
ANALYSIS_PATH = PREFIX + "analysis"
PAUSE_PATH = ANALYSIS_PATH + "/pause"
RESUME_PATH = ANALYSIS_PATH + "/resume"

INVALID_REQUEST = "INVALID_REQUEST"
SETTING_FAILED = "WAVEFORMS_SETTING_FAILED"

#: The refusal codes a caller can branch on.
REFUSAL_CODES: Tuple[str, ...] = (INVALID_REQUEST, SETTING_FAILED)

GET_PATHS: Tuple[str, ...] = (ANALYSIS_PATH,)
POST_PATHS: Tuple[str, ...] = (PAUSE_PATH, RESUME_PATH)


def _no_params(params: Dict[str, List[str]]) -> None:
    if params:
        raise bad_request(
            f"This route takes no parameters, not {', '.join(sorted(params))}"
        )


def _no_body(raw: bytes) -> None:
    text = raw.decode("utf-8", errors="replace").strip() if raw else ""
    if not text:
        return
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise bad_request("The body is not JSON") from exc
    if not isinstance(data, dict):
        raise bad_request("The body must be a JSON object")
    if data:
        raise bad_request(f"This route takes no fields, not {', '.join(sorted(data))}")


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


_POST_ROUTES: Dict[str, Callable[[JobStore], Dict[str, Any]]] = {
    PAUSE_PATH: pause,
    RESUME_PATH: resume,
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
    if path != ANALYSIS_PATH:
        raise not_found("NOT_FOUND", "Unknown path")
    _no_params(params)
    return 200, analysis(job_store)


def handle_post(
    path: str, raw: bytes, *, job_store: JobStore
) -> Tuple[int, Dict[str, Any]]:
    """Answer a POST, or raise."""
    handler = _POST_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    _no_body(raw)
    return 200, handler(job_store)


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from any handler here to a status and an envelope."""
    from cuepoint.exceptions.cuepoint_exceptions import ConfigurationError

    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, ConfigurationError):
        _logger.warning("[waveforms] the pause setting was not saved: %s", exc)
        return 500, error_payload(
            SETTING_FAILED, "The waveform setting could not be saved"
        )
    _logger.warning("[waveforms] request failed: %s", exc, exc_info=exc)
    return 500, error_payload("WAVEFORMS_FAILED", str(exc))


__all__: Sequence[str] = (
    "ANALYSIS_PATH",
    "GET_PATHS",
    "INVALID_REQUEST",
    "PAUSE_PATH",
    "POST_PATHS",
    "PREFIX",
    "REFUSAL_CODES",
    "RESUME_PATH",
    "SETTING_FAILED",
    "handle_get",
    "handle_post",
    "handles_get",
    "handles_post",
    "status_for",
)
