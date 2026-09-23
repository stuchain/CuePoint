#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What the library owns on Beatport, defined once (DISCOVER-04, DEC-092).

A Beatport track is **owned** when it is the Beatport track of a library
track's **accepted** match — automatic or the user's (DEC-067) — with the id
taken from the accepted candidate's ``beatport_track_id``, or, when that is not
a Beatport id, from the ``/track/<slug>/<id>`` in its URL. A rejected
candidate, one waiting for review and a track never matched own nothing.

The rule exists twice, on purpose, and is held to itself:

- **In SQL**, as the view ``library_beatport_tracks`` (migration 0023), which
  :func:`owned_beatport_ids_sql` selects from. Every query that asks "owned?"
  about many tracks — a discovery run's window, the wantlist, a page — joins
  it, so the answer is computed when it is read and never stored (DEC-092).
- **In Python**, as :func:`accepted_beatport_track_id`, for a caller holding
  a candidate rather than a query.

``src/tests/unit/services/test_beatport_ownership.py`` builds a library with
every case and asserts the two agree on every track. A third copy is not
allowed: :func:`is_owned` runs the SQL, and a later step that needs ownership
imports from here.

Ownership is only as complete as Clean's matches: a library track that was
never matched is not known to be owned, and the pages that show "not owned"
say where the answer comes from (DEC-092's last implication).
"""

from __future__ import annotations

from typing import Iterable, Optional, Set

from cuepoint.services.interfaces import IBeatportCatalogRepository

#: The view holding the rule in SQL (migration 0023).
OWNED_VIEW = "library_beatport_tracks"

#: The largest id SQLite stores as an integer. An id beyond it would be cast
#: to this value, so the rule refuses it rather than match the wrong track.
MAX_BEATPORT_ID = 2**63 - 1

#: Where a Beatport track page's id begins: ``/track/<slug>/<id>``.
_TRACK_PATH = "/track/"

_DIGITS = "0123456789"


def owned_beatport_ids_sql() -> str:
    """A ``SELECT`` of every owned Beatport track id, one column, for ``IN (…)``.

    An id appears once per library track that owns it, so two library copies of
    one Beatport track give it twice; ``IN`` does not care, and a caller that
    counts adds ``DISTINCT``.
    """
    return f"SELECT beatport_track_id FROM {OWNED_VIEW}"


def beatport_id(text: Optional[str]) -> Optional[int]:
    """``text`` as a Beatport id, or None when it is not the plain decimal of one.

    ASCII digits, no sign, no whitespace, no leading zero, above zero and within
    64 bits — exactly what the view's cast-and-compare accepts.
    """
    if not isinstance(text, str) or not text:
        return None
    if not (text.isascii() and text.isdigit()) or text[0] == "0":
        return None
    value = int(text)
    return value if value <= MAX_BEATPORT_ID else None


def url_beatport_id(url: Optional[str]) -> Optional[int]:
    """The id in a Beatport track URL, read the way the view reads it.

    After the first ``/track/``: a slug of at least one character with no
    ``/``, a ``/``, then the digits that follow, which must be a
    :func:`beatport_id`. Anything after the digits is ignored, so a trailing
    ``/``, query string or fragment does not hide the id.
    """
    if not isinstance(url, str):
        return None
    at = url.find(_TRACK_PATH)
    if at < 0:
        return None
    path = url[at + len(_TRACK_PATH) :]
    slash = path.find("/")
    if slash < 1:
        return None
    tail = path[slash + 1 :]
    digits = tail[: len(tail) - len(tail.lstrip(_DIGITS))]
    return beatport_id(digits)


def accepted_beatport_track_id(
    stored_id: Optional[str], url: Optional[str]
) -> Optional[int]:
    """The Beatport track an accepted candidate stands for, or None.

    Args:
        stored_id: The candidate's ``beatport_track_id`` column, as text.
        url: The candidate's page.
    """
    found = beatport_id(stored_id)
    return found if found is not None else url_beatport_id(url)


def is_owned(catalog: IBeatportCatalogRepository, ids: Iterable[int]) -> Set[int]:
    """Which of ``ids`` the library owns, by the view's rule."""
    return catalog.owned_among(ids)
