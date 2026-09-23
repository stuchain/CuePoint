#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tracks written into a database at an older schema version.

A migration test builds a library at the version *before* its migration and
fills it the way a user's would be filled. It cannot do that through today's
``TrackRepository``: the repository writes today's schema — ``tracks.label_key``
and ``track_credits`` since DISCOVER-03 — and a version-19 database has
neither. Writing through it fails, and writing around its checks by hand in
each test would drift.

So these insert a track with exactly the columns its table has at that
version, taken from ``PRAGMA table_info`` and filled from
:meth:`LibraryTrack.to_dict`. A column the version does not have is not
written; a column it has and the model does not know is left to its default.
"""

from __future__ import annotations

from typing import Iterable, List

from cuepoint.models.library_track import LibraryTrack


def add_tracks(service, tracks: Iterable[LibraryTrack]) -> List[int]:
    """Insert tracks with the columns this database's ``tracks`` has.

    Returns:
        The new rows' ids, in the order the tracks were given.
    """
    connection = service.connect()
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(tracks)")
    } - {"id"}
    ids: List[int] = []
    with service.transaction() as conn:
        for track in tracks:
            data = {
                name: value
                for name, value in track.to_dict().items()
                if name in columns
            }
            names = ", ".join(data)
            marks = ", ".join("?" for _ in data)
            cursor = conn.execute(
                f"INSERT INTO tracks ({names}) VALUES ({marks})",
                tuple(data.values()),
            )
            ids.append(int(cursor.lastrowid))
    return ids


def add_track(service, track: LibraryTrack) -> int:
    """Insert one track as :func:`add_tracks` does, and return its id."""
    return add_tracks(service, [track])[0]
