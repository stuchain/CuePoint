"""A test's ``LoggingService`` must not change logging for the tests after it.

``LoggingService`` turns the ``cuepoint`` logger's propagation off for the whole
process. Before ``conftest.py`` restored that logger after every test, a test
that asserted a ``cuepoint.*`` warning with ``caplog`` failed whenever one of
the 55 tests constructing a ``LoggingService`` ran before it: the full suite
failed ``test_audio_decode``'s loudness warning test, which passed alone.

The two tests run in file order: the first leaves the logger as a
``LoggingService`` does, the second needs it as it was.
"""

from __future__ import annotations

import logging

import pytest

from cuepoint.services.logging_service import LoggingService

pytestmark = pytest.mark.unit


def test_a_logging_service_turns_the_cuepoint_loggers_propagation_off():
    LoggingService(enable_file_logging=False, enable_console_logging=False)
    assert logging.getLogger("cuepoint").propagate is False


def test_the_next_test_still_hears_cuepoint_warnings(caplog):
    with caplog.at_level("WARNING", logger="cuepoint.data.audio_decode"):
        logging.getLogger("cuepoint.data.audio_decode").warning("heard")
    assert [r.message for r in caplog.records] == ["heard"]


def test_a_default_logging_service_writes_under_cuepoint_home_not_the_real_home(
    tmp_path, monkeypatch
):
    """A test that builds a ``LoggingService`` must not write ``~/.cuepoint/logs``.

    Running ``tests/unit/persistence`` put ``migration_runner`` INFO lines into a
    developer's real ``cuepoint.log``: the service defaulted to
    ``Path.home() / ".cuepoint"`` and ignored ``CUEPOINT_HOME``, the seam
    ``conftest.py`` sandboxes.
    """
    home = tmp_path / "home"
    monkeypatch.setenv("CUEPOINT_HOME", str(home))
    service = LoggingService(enable_console_logging=False, logger_name="cuepoint.iso")
    try:
        assert service.get_log_path() == home / "logs" / "cuepoint.log"
    finally:
        for handler in list(service.logger.handlers):
            handler.close()
            service.logger.removeHandler(handler)
