#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run Context (Design 7.52)

Thread-local run ID for correlating logs and diagnostics.
"""

import uuid
from typing import Optional

_run_id: Optional[str] = None


def set_run_id(run_id: Optional[str] = None) -> str:
    """Set current run ID. Returns the ID (new or existing)."""
    global _run_id
    if run_id:
        _run_id = run_id
    elif _run_id is None:
        _run_id = str(uuid.uuid4())[:12]
    return _run_id


def get_current_run_id() -> Optional[str]:
    """Get current run ID."""
    return _run_id


def clear_run_id() -> None:
    """Clear run ID (e.g. at end of run)."""
    global _run_id
    _run_id = None
