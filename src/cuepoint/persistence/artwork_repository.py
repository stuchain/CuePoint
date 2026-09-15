#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for artwork: which files to read, and what was found (CLEAN-09).

``track_artwork`` holds one row per track: what the file held when it was read,
Beatport's image for the accepted match, and anything the image guard refused.
The two halves are written by different paths — a scan reads files, a display
or a fetch looks at Beatport — so each write touches only its own columns and
leaves the other half as it was.

A scan reads only files the file check found present at the path the track has
now (CLEAN-07), so it never opens a missing file. A track deleted while a scan
ran is skipped, as in every chunked write here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from cuepoint.models.artwork import TrackArtwork
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.services.interfaces import IArtworkRepository, IDatabaseService

_COLUMNS = (
    "track_id",
    "embedded",
    "embedded_hash",
    "beatport_url",
    "cache_key",
    "checked_at",
    "checked_path",
    "embedded_refused",
    "beatport_refused",
    "beatport_page",
)

# A scan writes the file half. A refusal of the same picture is kept, so a
# picture the guard refused is not decoded again; a different picture clears it.
_RECORD_EMBEDDED = (
    "INSERT INTO track_artwork"
    " (track_id, embedded, embedded_hash, checked_at, checked_path, embedded_refused)"
    " SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM tracks WHERE tracks.id = ?)"
    " ON CONFLICT (track_id) DO UPDATE SET"
    " embedded = excluded.embedded,"
    " checked_at = excluded.checked_at,"
    " checked_path = excluded.checked_path,"
    " embedded_refused = CASE"
    "   WHEN excluded.embedded_refused IS NOT NULL THEN excluded.embedded_refused"
    "   WHEN track_artwork.embedded_hash IS excluded.embedded_hash"
    "     AND track_artwork.embedded_refused IS NOT 'tags'"
    "   THEN track_artwork.embedded_refused"
    "   ELSE NULL END,"
    " embedded_hash = excluded.embedded_hash"
)


@dataclass(frozen=True)
class EmbeddedRecord:
    """What reading one file's picture found, ready to be stored.

    Attributes:
        track_id: The track.
        embedded: ``present``, ``none``, or ``unknown`` when the tags could not
            be read.
        embedded_hash: SHA-256 of the picture's bytes, when one is present.
        checked_at: When the file was read.
        checked_path: The path read.
        refused: ``tags`` when the tags could not be read.
    """

    track_id: int
    embedded: str
    embedded_hash: Optional[str]
    checked_at: str
    checked_path: str
    refused: Optional[str] = None


class ArtworkRepository(IArtworkRepository):
    """Persistence for what CuePoint knows about each track's artwork."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # -------------------------------------------------------------- reading

    def get(self, track_id: int) -> Optional[TrackArtwork]:
        """A track's artwork record, or ``None``."""
        row = (
            self._db.connect()
            .execute(
                f"SELECT {', '.join(_COLUMNS)} FROM track_artwork WHERE track_id = ?",
                (int(track_id),),
            )
            .fetchone()
        )
        return None if row is None else TrackArtwork.from_row(row)

    def library_ids(self) -> List[int]:
        """Every library track's id, in id order."""
        return [
            int(row["id"])
            for row in self._db.connect().execute("SELECT id FROM tracks ORDER BY id")
        ]

    def existing(self, track_ids: Iterable[int]) -> List[int]:
        """The ids that are library tracks, once each, in the order given."""
        wanted = unique_ids(track_ids)
        found: Set[int] = set()
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            found.update(
                int(row["id"])
                for row in connection.execute(
                    f"SELECT id FROM tracks WHERE id IN ({placeholders})", chunk
                )
            )
        return [track_id for track_id in wanted if track_id in found]

    def present_files(self, track_ids: Iterable[int]) -> List[Tuple[int, str]]:
        """``(track id, path)`` for the tracks whose file was found present.

        Present at the path the track has now, by the file check (CLEAN-07).
        A track never checked, checked at another path, or found missing or
        unreadable is left out, so a scan never opens a file that is not there.
        """
        wanted = unique_ids(track_ids)
        found: Dict[int, str] = {}
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            for row in connection.execute(
                "SELECT tracks.id AS id, tracks.file_path AS file_path FROM tracks"
                " JOIN track_files AS f ON f.track_id = tracks.id"
                " AND f.checked_path = tracks.file_path AND f.status = 'present'"
                f" WHERE tracks.id IN ({placeholders})",
                chunk,
            ):
                found[int(row["id"])] = str(row["file_path"])
        return [(track_id, found[track_id]) for track_id in wanted if track_id in found]

    def file_is_present(self, track_id: int) -> Optional[bool]:
        """Whether the file check found the track's current file present.

        None when there is no check for the current path, which is not the same
        as missing: the file may well be there, nobody has looked.
        """
        row = (
            self._db.connect()
            .execute(
                "SELECT f.status AS status FROM tracks"
                " JOIN track_files AS f ON f.track_id = tracks.id"
                " AND f.checked_path = tracks.file_path WHERE tracks.id = ?",
                (int(track_id),),
            )
            .fetchone()
        )
        return None if row is None else row["status"] == "present"

    def accepted_candidate(self, track_id: int) -> Optional[Tuple[str, Optional[str]]]:
        """``(candidate page, artwork URL)`` of a track's accepted match, if any.

        Accepted by the rule or by a user. A candidate only proposed is not
        evidence of which record the track is (DEC-076: accepted matches only).
        """
        row = (
            self._db.connect()
            .execute(
                "SELECT c.url AS url, c.artwork_url AS artwork_url FROM track_match AS m"
                " JOIN match_candidates AS c ON c.id = m.candidate_id"
                " WHERE m.track_id = ? AND m.state = 'accepted'",
                (int(track_id),),
            )
            .fetchone()
        )
        return None if row is None else (str(row["url"]), row["artwork_url"])

    def accepted_tracks(self, track_ids: Iterable[int]) -> List[int]:
        """The tracks, in the order given, that have an accepted match."""
        wanted = unique_ids(track_ids)
        found: Set[int] = set()
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            found.update(
                int(row["track_id"])
                for row in connection.execute(
                    "SELECT track_id FROM track_match WHERE state = 'accepted'"
                    f" AND track_id IN ({placeholders})",
                    chunk,
                )
            )
        return [track_id for track_id in wanted if track_id in found]

    # -------------------------------------------------------------- writing

    def record_embedded(self, records: Sequence[EmbeddedRecord]) -> Set[int]:
        """Store what a scan read; return the tracks written.

        Joins the caller's transaction. A track that has left the library is
        skipped.
        """
        written: Set[int] = set()
        if not records:
            return written
        with self._db.transaction(join_existing=True) as conn:
            for record in records:
                cursor = conn.execute(
                    _RECORD_EMBEDDED,
                    (
                        record.track_id,
                        record.embedded,
                        record.embedded_hash,
                        record.checked_at,
                        record.checked_path,
                        record.refused,
                        record.track_id,
                    ),
                )
                if cursor.rowcount == 1:
                    written.add(record.track_id)
        return written

    def refuse_embedded(self, track_id: int, embedded_hash: str, reason: str) -> bool:
        """Record that the guard refused a track's picture, if it is still that picture."""
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE track_artwork SET embedded_refused = ?"
                " WHERE track_id = ? AND embedded = 'present' AND embedded_hash = ?",
                (reason, int(track_id), embedded_hash),
            )
            return cursor.rowcount == 1

    def record_beatport(
        self,
        track_id: int,
        beatport_page: str,
        beatport_url: str,
        refused: Optional[str] = None,
    ) -> bool:
        """Store the image a Beatport page names for a track, ``""`` for none.

        Leaves the file half as it was. The page is kept with the answer, so an
        answer for one candidate is never read as another's; a refusal names
        the URL it was for, and a different URL clears it.

        Raises:
            ValueError: If there is no page, or a refusal names no image.
        """
        if not (beatport_page or "").strip():
            raise ValueError("Beatport's image is recorded with the page it came from")
        if refused is not None and not (beatport_url or "").strip():
            raise ValueError("A refused Beatport image must name its URL")
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "INSERT INTO track_artwork"
                " (track_id, beatport_page, beatport_url, beatport_refused)"
                " SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM tracks WHERE tracks.id = ?)"
                " ON CONFLICT (track_id) DO UPDATE SET"
                " beatport_page = excluded.beatport_page,"
                " beatport_url = excluded.beatport_url,"
                " beatport_refused = excluded.beatport_refused",
                (int(track_id), beatport_page, beatport_url, refused, int(track_id)),
            )
            return cursor.rowcount == 1


__all__: Sequence[str] = ("ArtworkRepository", "EmbeddedRecord")
