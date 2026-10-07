"""The error-reporting choice, held in one in-process flag (REPORT-01, DEC-128).

This is the one flag every sender (REPORT-03..06) checks in ``before_send`` and
``before_breadcrumb``, so turning reporting off drops anything already captured
but not yet sent. Electron main owns the stored choice and passes it at launch
in ``CUEPOINT_ERROR_REPORTING``; ``POST /api/v1/reporting`` changes it without
a restart. Nothing here sends anything.
"""

from __future__ import annotations

import json
import threading
from typing import Dict, Mapping

#: Set by Electron main at launch: "1" for on, "0" for off.
REPORTING_ENV = "CUEPOINT_ERROR_REPORTING"

_lock = threading.Lock()
_enabled = False


def initial_reporting_enabled(environ: Mapping[str, str]) -> bool:
    """On only for an exact "1". An engine the app did not start (the CLI,
    ``python -m cuepoint.engine``) has no value and is off."""
    return environ.get(REPORTING_ENV) == "1"


def reporting_enabled() -> bool:
    with _lock:
        return _enabled


def set_reporting_enabled(enabled: bool) -> Dict[str, object]:
    global _enabled
    with _lock:
        _enabled = enabled
    return {"enabled": enabled}


def parse_reporting_body(body: bytes) -> bool:
    """The ``enabled`` value of ``{"enabled": bool}``; ``ValueError`` otherwise.

    Only a real JSON boolean counts: 0, 1, "true" and null are refused.
    """
    try:
        data = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    enabled = data.get("enabled")
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be true or false")
    return enabled
