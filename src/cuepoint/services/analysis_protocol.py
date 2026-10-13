#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The wire format between the engine and its analysis worker (C19g).

The engine hands the CPU half of a file's analysis (:mod:`waveform_computer`)
to a child process. The two talk over the child's standard input and output in
JSON lines: UTF-8, one object per ``\\n``-terminated line, and nothing else on
standard output. This module is the whole format, pure functions on dicts and
bytes, so the engine's half (``analysis_worker_client``) and the child's
(``engine/analysis_worker``) cannot drift apart, and so a test can speak it
without a process.

The lines
---------
- The child's first line is its hello: :func:`hello`. The engine refuses a
  child whose versions are not its own: a worker from another build, left
  behind by an update, would otherwise write rows the engine's store reads as
  another version.
- ``{"id", "path", "decoder", "overview", "detail"}``: analyse a file
  (:func:`request_line`). Many may be in flight at once; the id pairs a
  request with its answer.
- ``{"cancel": id}``: stop that request (:func:`cancel_line`). An id no longer
  running is ignored; the answer to a cancelled request is still sent.
- ``{"id", "outcome", "reason", "overview", "duration_ms", "loudness",
  "detail", "decode_errors"}``: a :class:`Computed` (:func:`result_line`).
  Pictures are base64.
- ``{"id", "error"}``: the child hit a programming error on that request
  (:func:`error_line`). The engine analyses that file itself.

Paths are strings and travel as ASCII JSON escapes, so a name beyond ASCII or
with spaces comes back whole whatever the pipe's encoding.

What raises
-----------
The ``parse_*`` functions and :func:`loads` raise :class:`ValueError` for
anything that is not exactly a line of this format. A reader catches it, logs
one warning and goes on: a stray line must not end the worker, nor the engine.
"""

from __future__ import annotations

import base64
import binascii
import json
from pathlib import Path
from typing import Any, Dict, NamedTuple, Optional, Sequence, Union

from cuepoint.core.waveform_detail import DETAIL_FORMAT_VERSION
from cuepoint.data.audio_decode import (
    ANALYSIS_VERSION,
    LOUDNESS_VERSION,
    Loudness,
)
from cuepoint.services.waveform_computer import Computed

#: The version of this format. A change here makes old and new refuse each other.
PROTOCOL_VERSION = 1


class Request(NamedTuple):
    """One file for the worker to analyse."""

    id: int
    path: str
    decoder: str
    overview: bool
    detail: bool


def hello() -> Dict[str, int]:
    """The line a worker says first: every version that decides the bytes."""
    return {
        "hello": PROTOCOL_VERSION,
        "analysis_version": ANALYSIS_VERSION,
        "loudness_version": LOUDNESS_VERSION,
        "detail_version": DETAIL_FORMAT_VERSION,
    }


def hello_matches(obj: object) -> bool:
    """Whether ``obj`` is the hello of a worker built like this engine."""
    return isinstance(obj, dict) and obj == hello()


def _line(obj: Dict[str, Any]) -> bytes:
    return (
        json.dumps(obj, ensure_ascii=True, separators=(",", ":")).encode("ascii")
        + b"\n"
    )


def hello_line() -> bytes:
    """:func:`hello` as a line."""
    return _line(dict(hello()))


def request_line(
    id: int, path: str, decoder: Union[str, Path], overview: bool, detail: bool
) -> bytes:
    """Ask the worker to analyse ``path``."""
    return _line(
        {
            "id": id,
            "path": str(path),
            "decoder": str(decoder),
            "overview": bool(overview),
            "detail": bool(detail),
        }
    )


def cancel_line(id: int) -> bytes:
    """Ask the worker to stop request ``id``."""
    return _line({"cancel": id})


def result_line(id: int, computed: Computed) -> bytes:
    """Answer request ``id`` with what came of it."""
    loudness = computed.loudness
    return _line(
        {
            "id": id,
            "outcome": computed.outcome,
            "reason": computed.reason,
            "overview": _encode(computed.overview),
            "duration_ms": computed.duration_ms,
            "loudness": {
                "integrated_lufs": loudness.integrated_lufs,
                "peak_dbfs": loudness.peak_dbfs,
                "reason": loudness.reason,
            },
            "detail": _encode(computed.detail),
            "decode_errors": computed.decode_errors,
        }
    )


def error_line(id: int, message: str) -> bytes:
    """Answer request ``id`` with a programming error, for the engine to log."""
    return _line({"id": id, "error": str(message)})


def loads(raw: bytes) -> Dict[str, Any]:
    """Read one line.

    Raises:
        ValueError: If it is not one JSON object.
    """
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
        raise ValueError("not a line of the analysis protocol") from error
    if not isinstance(obj, dict):
        raise ValueError("a line of the analysis protocol is an object")
    return obj


def _int(obj: Any, name: str) -> int:
    value = obj.get(name) if isinstance(obj, dict) else None
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{name} must be an integer, not {type(value).__name__}")
    return value


def _bool(obj: Dict[str, Any], name: str) -> bool:
    value = obj.get(name)
    if not isinstance(value, bool):
        raise ValueError(f"{name} must be true or false, not {type(value).__name__}")
    return value


def _str(obj: Dict[str, Any], name: str) -> str:
    value = obj.get(name)
    if not isinstance(value, str):
        raise ValueError(f"{name} must be a string, not {type(value).__name__}")
    return value


def line_id(obj: object) -> int:
    """The id of an answer, a result or an error."""
    return _int(obj, "id")


def parse_request(obj: object) -> Request:
    """Read a request.

    Raises:
        ValueError: If it is not exactly one.
    """
    if not isinstance(obj, dict):
        raise ValueError("a request is an object")
    return Request(
        _int(obj, "id"),
        _str(obj, "path"),
        _str(obj, "decoder"),
        _bool(obj, "overview"),
        _bool(obj, "detail"),
    )


def parse_cancel(obj: object) -> Optional[int]:
    """The id a line cancels, or ``None`` when the line is not a cancel.

    Raises:
        ValueError: If it is a cancel of something that is not an id.
    """
    if not isinstance(obj, dict) or "cancel" not in obj:
        return None
    return _int(obj, "cancel")


def parse_error(obj: object) -> Optional[str]:
    """The message of an error answer, or ``None`` when the line is not one.

    Raises:
        ValueError: If the message is not a string.
    """
    if not isinstance(obj, dict) or "error" not in obj:
        return None
    return _str(obj, "error")


def parse_result(obj: object) -> Computed:
    """Read a result.

    Raises:
        ValueError: If it is not exactly one, or if what it claims is
            impossible: :class:`Loudness` and :class:`Computed` keep their own
            invariants.
    """
    if not isinstance(obj, dict):
        raise ValueError("a result is an object")
    outcome = _str(obj, "outcome")
    reason = obj.get("reason")
    if reason is not None and not isinstance(reason, str):
        raise ValueError(
            f"reason must be a string or null, not {type(reason).__name__}"
        )
    duration_ms = obj.get("duration_ms")
    if duration_ms is not None and (
        not isinstance(duration_ms, int) or isinstance(duration_ms, bool)
    ):
        raise ValueError(
            f"duration_ms must be an integer or null, not {type(duration_ms).__name__}"
        )
    errors = _int(obj, "decode_errors")
    if errors < 0:
        raise ValueError("decode_errors cannot be negative")
    return Computed(
        outcome,
        reason,
        _decode(obj, "overview"),
        duration_ms,
        _loudness(obj.get("loudness")),
        _decode(obj, "detail"),
        errors,
    )


def _loudness(obj: object) -> Loudness:
    if not isinstance(obj, dict):
        raise ValueError("loudness is an object")
    reason = obj.get("reason")
    if reason is not None and not isinstance(reason, str):
        raise ValueError(
            f"loudness reason must be a string or null, not {type(reason).__name__}"
        )
    numbers = []
    for name in ("integrated_lufs", "peak_dbfs"):
        value = obj.get(name)
        if value is not None and (
            not isinstance(value, (int, float)) or isinstance(value, bool)
        ):
            raise ValueError(
                f"{name} must be a number or null, not {type(value).__name__}"
            )
        numbers.append(value)
    # Loudness holds its own rules (a value or a reason, a peak with a value).
    return Loudness(numbers[0], numbers[1], reason)


def _encode(data: Optional[bytes]) -> Optional[str]:
    return None if data is None else base64.b64encode(data).decode("ascii")


def _decode(obj: Dict[str, Any], name: str) -> Optional[bytes]:
    if name not in obj:
        raise ValueError(f"{name} is missing")
    value = obj[name]
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{name} must be base64 or null, not {type(value).__name__}")
    try:
        return base64.b64decode(value.encode("ascii"), validate=True)
    except (binascii.Error, UnicodeEncodeError) as error:
        raise ValueError(f"{name} is not base64") from error


__all__: Sequence[str] = (
    "PROTOCOL_VERSION",
    "Request",
    "cancel_line",
    "error_line",
    "hello",
    "hello_line",
    "hello_matches",
    "line_id",
    "loads",
    "parse_cancel",
    "parse_error",
    "parse_request",
    "parse_result",
    "request_line",
    "result_line",
)
