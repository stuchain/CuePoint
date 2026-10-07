"""The expected-failure codes are spelled as the code that produces them spells them (DEC-153)."""

from __future__ import annotations

from cuepoint.reporting.expected import (
    EXPECTED_JOB_ERROR_CODES,
    EXPECTED_ROUTE_ERROR_CODES,
    is_expected_code,
)


def test_export_reasons_match_the_service_constants() -> None:
    from cuepoint.services import rekordbox_export_service as export

    for reason in (*export.SOURCE_REFUSALS, *export.DESTINATION_REFUSALS):
        assert reason in EXPECTED_JOB_ERROR_CODES, reason


def test_beatport_classes_match_the_client_constants() -> None:
    from cuepoint.services import beatport_api_client as client

    for error_class in (
        client.ERROR_NO_TOKEN,
        client.ERROR_REJECTED,
        client.ERROR_FORBIDDEN,
        client.ERROR_RATE_LIMITED,
        client.ERROR_UNAVAILABLE,
    ):
        assert f"BEATPORT_{error_class.upper()}" in EXPECTED_JOB_ERROR_CODES


def test_route_codes_match_the_api_constants() -> None:
    from cuepoint.engine.sets_api import SET_LIST_WRITE_FAILED

    assert SET_LIST_WRITE_FAILED in EXPECTED_ROUTE_ERROR_CODES


def test_generic_codes_are_never_expected() -> None:
    for code in (
        "JOB_FAILED",
        "CLEAN_MATCH_FAILED",
        "LIBRARY_IMPORT_FAILED",
        "MATCH_STORAGE_FAILED",
        "WAVEFORM_ANALYSIS_FAILED",
        "REKORDBOX_EXPORT_FAILED",
        "INTERNAL_ERROR",
    ):
        assert not is_expected_code(code)
    assert not is_expected_code(None)
    assert is_expected_code("BEATPORT_REJECTED")
    assert is_expected_code("SET_LIST_WRITE_FAILED")


def test_a_write_failure_is_the_users_only_with_an_oserror_behind_it() -> None:
    import errno

    from cuepoint.reporting.expected import is_expected_failure

    assert not is_expected_failure("EXPORT_WRITE_FAILED", None)
    assert not is_expected_failure("EXPORT_WRITE_FAILED", ValueError("bad rows"))
    assert is_expected_failure("EXPORT_WRITE_FAILED", OSError(errno.EIO, "io"))
    wrapped = RuntimeError("wrapped")
    wrapped.__cause__ = OSError(errno.ENOSPC, "no space")
    assert is_expected_failure("EXPORT_WRITE_FAILED", wrapped)


def test_a_generic_code_is_the_users_when_the_cause_is_their_files() -> None:
    import errno
    import xml.etree.ElementTree as ElementTree

    from cuepoint.reporting.expected import is_expected_failure

    for cause in (
        FileNotFoundError(2, "missing"),
        PermissionError(13, "denied"),
        IsADirectoryError(21, "dir"),
        ElementTree.ParseError("not xml"),
        OSError(errno.ENOSPC, "full"),
        OSError(errno.EROFS, "read only"),
        OSError(errno.EACCES, "denied"),
    ):
        assert is_expected_failure("LIBRARY_IMPORT_FAILED", cause), cause
    for cause in (None, ValueError("x"), OSError(errno.EIO, "io"), KeyError("k")):
        assert not is_expected_failure("LIBRARY_IMPORT_FAILED", cause), cause
    assert is_expected_failure("BEATPORT_REJECTED", None)
