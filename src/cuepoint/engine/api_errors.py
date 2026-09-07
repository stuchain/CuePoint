#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The one error envelope every engine route answers with.

``{"error": {"code": …, "message": …}}`` has been the shape since Phase 1 and is
a public contract under the "preserve error envelopes" invariant. It lived in
``server.py`` while one module built it; ORG-08 added a second, and two builders
of one shape is how the shape stops being one.

:class:`ApiError` is the other half. A handler that knows both what went wrong
and what a caller should be told raises it, and one place turns that into a
status and an envelope — rather than every handler ending in the same five
``except`` clauses written slightly differently each time.
"""

from __future__ import annotations

from typing import Any, Dict


def error_payload(code: str, message: str, **extra: Any) -> Dict[str, Any]:
    """Build the error envelope.

    ``extra`` goes *inside* the error object rather than beside it, which is
    where the one existing caller that adds anything puts it: a busy-library
    refusal carries the running job's id so a caller can follow it rather than
    only being told no.
    """
    payload: Dict[str, Any] = {"code": code, "message": message}
    payload.update(extra)
    return {"error": payload}


class ApiError(Exception):
    """A refusal a handler can name, with the status it should arrive as.

    Raised rather than returned so a handler can refuse from wherever it
    notices, including inside a helper, without every caller in between having
    to carry a status code it has no opinion about.
    """

    def __init__(self, status: int, code: str, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra

    def payload(self) -> Dict[str, Any]:
        """Return the envelope for this refusal."""
        return error_payload(self.code, self.message, **self.extra)


def bad_request(message: str) -> ApiError:
    """A request that cannot be honoured as written.

    The envelope a rejected filter clause, an unknown sort and a malformed body
    all arrive in — 400 with the offending clause named, never a 500.
    """
    return ApiError(400, "INVALID_REQUEST", message)


def not_found(code: str, message: str) -> ApiError:
    """A resource named in a path that is not there."""
    return ApiError(404, code, message)
