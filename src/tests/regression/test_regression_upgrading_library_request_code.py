#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: a library request during the first-launch upgrade answered with raw text.

On the first launch after an update the engine migrates the library on a
thread, and holds every other thread's migrations back with ``DB_UPGRADING``
(``CuePoint is still getting your library ready.``). A library request in that
window resolves its service, the hold-back raises, and ``library_api`` wrapped it
as ``LibraryUnavailableError(str(exc))``. ``str()`` of a CuePoint exception is
``[CODE] message``, and the route answered ``LIBRARY_UNAVAILABLE`` with that
text: the person saw "[DB_UPGRADING] CuePoint is still getting your library
ready." and the app could not tell the upgrade from a broken library.

It is easy to reintroduce because every route has its own inline
``except LibraryUnavailableError`` that bypasses ``library_state.status_for``,
which already maps these failures to the right code and a plain sentence.
"""

from __future__ import annotations

import pytest

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.services import library_errors
from tests.unit.engine import test_library_state as state_helpers
from tests.unit.engine.test_library_state import call, make_library

pytestmark = pytest.mark.unit


# The sandboxed library and the running engine are the ones the library-state tests use.
library = state_helpers.library
engine = state_helpers.engine


@pytest.fixture
def upgrading(library):
    """A library with a migration pending, held back as it is mid-upgrade."""
    make_library(library, behind=1)
    library_errors.block_migrations(
        DatabaseError(
            message="CuePoint is still getting your library ready.",
            error_code="DB_UPGRADING",
        ),
        library,
    )
    yield library  # conftest's autouse _forget_library_state lifts the block


#: Every route whose ``except LibraryUnavailableError`` goes through
#: ``_send_library_unavailable``, each with its own method.
ROUTES = [
    ("GET", "/api/v1/library/summary"),
    ("GET", "/api/v1/library/search?q=strobe"),
    ("GET", "/api/v1/library/playlists"),
    ("GET", "/api/v1/library/facets?field=genre"),
    ("POST", "/api/v1/library/facets"),
    ("GET", "/api/v1/library/tracks/1"),
    ("POST", "/api/v1/library/keys/population"),
]


@pytest.mark.parametrize(("method", "path"), ROUTES)
def test_a_library_request_during_the_upgrade_answers_db_upgrading(
    upgrading, engine, method, path
):
    status, body = call(engine, method, path)

    assert status == 503, body
    assert body["error"]["code"] == "DB_UPGRADING"
    assert "[" not in body["error"]["message"]
    assert "getting your library ready" in body["error"]["message"]
