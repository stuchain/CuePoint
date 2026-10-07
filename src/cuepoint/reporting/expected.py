"""The failures that are the user's to fix, so they are not reported (DEC-153).

A job ends ``FAILED`` with an error code. Most codes mean CuePoint has a bug; a few mean the
user's own situation stopped it: a Beatport token that was rejected, a drive that was unplugged,
the wrong XML picked. Those are refusals in all but name, and reporting them would bury the bugs.
``JOB_FAILED`` and every ``*_FAILED`` fallback code are deliberately absent: a runner that could
not say what went wrong is, by definition, not a cause the user owns.

A code belongs here only when it says whose problem it is. When in doubt it stays out, because a
report that was not needed costs a glance and one that was missing costs a bug. The test beside
this module ties the spellings to the constants that produce them.
"""

from __future__ import annotations

import errno
import xml.etree.ElementTree as ElementTree

EXPECTED_JOB_ERROR_CODES: frozenset[str] = frozenset(
    {
        # A job cancelled by the user is not a failure at all; the listener also checks the state.
        "JOB_CANCELLED",
        # Beatport, because of the user's token: absent, rejected, without the scope, or limited.
        "BEATPORT_NO_TOKEN",
        "BEATPORT_REJECTED",
        "BEATPORT_FORBIDDEN",
        "BEATPORT_RATE_LIMITED",
        "BEATPORT_API_NO_TOKEN",
        "BEATPORT_API_AUTH",
        "BEATPORT_API_FORBIDDEN",
        "BEATPORT_API_RATE_LIMIT",
        # Beatport or the network is unreachable. A run that ends this way carries no exception
        # (the job classified its own outcome), so a report would have no stack to read.
        "BEATPORT_UNAVAILABLE",
        "MATCH_SEARCH_UNAVAILABLE",
        "BEATPORT_API_TIMEOUT",
        "BEATPORT_API_SERVER_ERROR",
        "CIRCUIT_OPEN",
        # The library the user pointed at: never imported, not a Rekordbox collection, a refresh
        # that needs their confirmation, or a diff the world has since moved past.
        "LIBRARY_NOT_IMPORTED",
        "LIBRARY_XML_NO_COLLECTION",
        "LIBRARY_REFRESH_NEEDS_CONFIRMATION",
        "LIBRARY_REFRESH_DIFF_NOT_FOUND",
        "LIBRARY_REFRESH_DIFF_STALE",
        # A tag-write preview that has expired or was never made: the user is asked to preview again.
        "TAG_WRITE_PREVIEW_NOT_FOUND",
        # The Rekordbox export's source XML: never imported, gone, unreadable, or not exportable.
        "source_never_imported",
        "source_missing",
        "source_unreadable",
        "source_invalid",
        # Its destination: blank, the source itself, not .xml, a folder, or in a folder that is gone.
        "destination_blank",
        "destination_is_source",
        "destination_not_xml",
        "destination_is_folder",
        "destination_folder_missing",
        # A file export to a place the user chose that is refused.
        "EXPORT_PATH_REFUSED",
        # A library database written by a newer CuePoint than this one.
        "DB_SCHEMA_TOO_NEW",
    }
)

#: Codes a *route* answers 500 with when the cause is the user's folder, not a bug. A route's 500
#: is reported unless its code is here or in :data:`EXPECTED_JOB_ERROR_CODES`.
EXPECTED_ROUTE_ERROR_CODES: frozenset[str] = frozenset(
    {
        # The set list's destination refused the write: a full or read-only disk.
        "SET_LIST_WRITE_FAILED",
    }
)


#: Codes that are the user's only when the exception behind them says so (see
#: :func:`is_expected_failure`): ``EXPORT_WRITE_FAILED`` wraps any failure, and only an
#: ``OSError`` (a full, read-only or unplugged disk) is the user's.
CAUSE_GATED_JOB_ERROR_CODES: frozenset[str] = frozenset({"EXPORT_WRITE_FAILED"})

#: Exceptions whose cause is the user's files or disk, whatever code the job ended with.
_USER_FILE_ERRORS = (
    FileNotFoundError,
    PermissionError,
    IsADirectoryError,
    ElementTree.ParseError,
)
_USER_ERRNOS = frozenset({errno.ENOSPC, errno.EROFS, errno.EACCES})
_CHAIN_DEPTH = 5


def _chain(cause: BaseException | None) -> list[BaseException]:
    out: list[BaseException] = []
    while cause is not None and len(out) < _CHAIN_DEPTH and cause not in out:
        out.append(cause)
        cause = cause.__cause__ or cause.__context__
    return out


def is_expected_failure(code: object, cause: BaseException | None = None) -> bool:
    """True when a failure ended with ``code`` because of something the user owns.

    A listed code is enough, except the cause-gated ones, which need an ``OSError`` behind them.
    Any other code (a generic ``*_FAILED``) is still the user's when the exception, or one it was
    raised from, is a missing file, a refused permission, a directory where a file was expected, a
    malformed XML file, or an ``OSError`` for a full, read-only or unwritable disk.
    """
    chain = _chain(cause)
    if isinstance(code, str):
        if code in CAUSE_GATED_JOB_ERROR_CODES:
            if any(isinstance(exc, OSError) for exc in chain):
                return True
        elif is_expected_code(code):
            return True
    for exc in chain:
        if isinstance(exc, _USER_FILE_ERRORS):
            return True
        if isinstance(exc, OSError) and exc.errno in _USER_ERRNOS:
            return True
    return False


def is_expected_code(code: object) -> bool:
    """True when ``code`` names a cause the user owns (a job's or a route's)."""
    return isinstance(code, str) and (
        code in EXPECTED_JOB_ERROR_CODES or code in EXPECTED_ROUTE_ERROR_CODES
    )
