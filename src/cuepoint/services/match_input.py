#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The question a library track puts to the matcher (CLEAN-03, DEC-065).

DEC-065 changes what matching is *given*, not how it scores: a library track
instead of a track parsed out of an XML file. :func:`library_track_to_track` is
the whole of that change. It is pure — no database, no clock beyond the year
bound :class:`~cuepoint.models.track.Track` itself applies, no network.

Imported values, never effective ones
-------------------------------------
The adapter is handed a :class:`~cuepoint.models.library_track.LibraryTrack`,
which is the ``tracks`` row: what Rekordbox exported. CuePoint's override layer
lives in ``track_metadata`` and is deliberately not part of that type. Matching
asks "which Beatport track is this file?", and a key applied from last week's
match must not become evidence for this week's.

The same question the CLI asks
------------------------------
``process_track`` searches and scores on the title and artist alone, so those
two are built by the CLI's own rule, :func:`~cuepoint.models.compat.
track_from_rbtrack`, rather than a copy of it: a track with no artist takes one
from an "Artist - Title" title, and failing that is asked about as
"Unknown Artist". Calling the rule instead of restating it is what keeps Clean
and ``main.py --xml`` matching identically for the same export.

The other fields — album, duration, BPM, key, year, genre, label, path — are
carried for the record: ``input_json`` stores the key and year the matcher was
given (CLEAN-02). A year ``Track`` would refuse is dropped rather than refusing
the track, because the matcher never reads it and a typo in Rekordbox's year
column is no reason to skip a track.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from cuepoint.data.rekordbox import RBTrack
from cuepoint.models.compat import track_from_rbtrack
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.track import Track

#: The earliest year :class:`~cuepoint.models.track.Track` accepts.
EARLIEST_YEAR = 1900


def plausible_year(year: Optional[int]) -> Optional[int]:
    """Return ``year`` when ``Track`` would accept it, otherwise ``None``.

    The bound is ``Track``'s: 1900 to next year. A test feeds both edges and one
    past each into ``Track`` itself, so the two cannot drift apart.
    """
    if year is None:
        return None
    if EARLIEST_YEAR <= year <= datetime.now().year + 1:
        return year
    return None


def library_track_to_track(track: LibraryTrack) -> Track:
    """Return the matcher's input for a stored library track.

    Args:
        track: A track read from ``tracks``, with its id.

    Returns:
        A ``Track`` whose ``track_id`` is the library id, as text.

    Raises:
        ValueError: If the track has no id, or no title. A track with no title
            gives the matcher nothing to search for — the CLI's parser skips
            one too — so a match job counts it as skipped rather than asking
            Beatport about an empty string.
    """
    if track.id is None:
        raise ValueError("Only a stored library track can be matched, and it has no id")
    title = track.title or ""
    if not title.strip():
        raise ValueError(
            f"Track {track.id} has no title, so there is nothing to ask Beatport"
        )

    asked = track_from_rbtrack(
        RBTrack(track_id=str(track.id), title=title, artists=track.artist or "")
    )
    duration = track.duration_seconds
    return Track(
        title=asked.title,
        artist=asked.artist,
        album=track.album,
        duration=None if duration is None or duration < 0 else float(duration),
        bpm=track.bpm,
        key=track.key,
        year=plausible_year(track.year),
        genre=track.genre,
        label=track.label,
        file_path=track.file_path or None,
        track_id=asked.track_id,
    )


__all__ = ("EARLIEST_YEAR", "library_track_to_track", "plausible_year")
