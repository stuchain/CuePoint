#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for tags and their assignment to tracks (ORG-03, DEC-015).

Two tables, one vocabulary. ``tags`` holds the flat, user-defined list DEC-015
chose over a hierarchy — ``{name, category?, colour?}``, with the category a
label written on the tag rather than a node above it — and ``track_tags`` says
which tracks carry which.

Identity is the name, case-insensitively
----------------------------------------
``m0009_organization`` puts a unique index on ``name COLLATE NOCASE``, so
``Peak-time`` and ``peak-time`` are one tag. The case a user typed is kept for
display; only *identity* ignores it. Every lookup here uses the same collation
as the index, because a query that compares differently from its index is a
query that quietly stops using it.

Set-shaped, not track-shaped
----------------------------
:meth:`TagRepository.assign` and :meth:`TagRepository.unassign` take a set of
track ids and do their work in one statement per chunk. ORG-10 will tag one
track and DEC-063's batches will tag forty thousand, and they are the same call
with different arguments — which is the only way the two paths cannot drift.

Both report **which tracks actually changed**, not how many were asked about.
The service needs that: a history entry per track that already carried the tag
would be a log of things that did not happen.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence

from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.tag import (
    Tag,
    TagUsage,
    normalize_tag_category,
    normalize_tag_colour,
    normalize_tag_name,
)
from cuepoint.persistence.id_chunks import chunked, unique_ids
from cuepoint.services.interfaces import IDatabaseService, ITagRepository

_SELECT = "SELECT id, name, category, colour, created_at FROM tags"

#: Tags in one list, ordered the way a person reads them. ``COLLATE NOCASE`` so
#: ``dub`` and ``Dub`` — which cannot both exist — would sort together anyway,
#: and so the order does not depend on capitalization.
#:
#: **The counts are grouped first, then joined.** The obvious form —
#: ``LEFT JOIN track_tags ... GROUP BY tags.id`` — makes SQLite scan the tags,
#: search the index once per tag, and then sort the result in a temporary
#: B-tree: 35 ms over 40 tags and 200,000 assignments. Grouping in a subquery
#: lets it scan ``idx_track_tags_tag`` as a covering index once and read the
#: tags in name order through ``idx_tags_name``, which is 14 ms for the same
#: answer. Measured, not assumed, and guarded by a query-plan test — the
#: difference has no symptom other than the time.
_SELECT_WITH_USAGE = (
    "SELECT tags.id, tags.name, tags.category, tags.colour, tags.created_at,"
    " coalesce(counts.track_count, 0) AS track_count"
    " FROM tags LEFT JOIN ("
    "   SELECT tag_id, count(*) AS track_count FROM track_tags GROUP BY tag_id"
    " ) AS counts ON counts.tag_id = tags.id"
    " ORDER BY tags.name COLLATE NOCASE"
)


class TagRepository(ITagRepository):
    """Persistence for the tag vocabulary and its assignments."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ------------------------------------------------------------------ read

    def get(self, tag_id: int) -> Optional[Tag]:
        """Return one tag, or ``None``."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT} WHERE id = ?", (int(tag_id),))
            .fetchone()
        )
        return None if row is None else Tag.from_row(row)

    def find_by_name(self, name: str) -> Optional[Tag]:
        """Return the tag with this name, ignoring case, or ``None``.

        The same collation the unique index uses, so this finds exactly what an
        insert would collide with.
        """
        row = (
            self._db.connect()
            .execute(f"{_SELECT} WHERE name = ? COLLATE NOCASE", (str(name).strip(),))
            .fetchone()
        )
        return None if row is None else Tag.from_row(row)

    def list_all(self) -> List[TagUsage]:
        """Return every tag with how many tracks carry it, by name.

        One query with a ``LEFT JOIN``, so a tag on nothing is present with a
        count of zero rather than missing — a vocabulary that hides its unused
        entries is one a user cannot clean up.
        """
        rows = self._db.connect().execute(_SELECT_WITH_USAGE).fetchall()
        return [TagUsage.from_row(row) for row in rows]

    def usage_count(self, tag_id: int) -> int:
        """Return how many tracks carry this tag."""
        row = (
            self._db.connect()
            .execute(
                "SELECT count(*) AS n FROM track_tags WHERE tag_id = ?", (int(tag_id),)
            )
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    def categories_in_use(self) -> List[str]:
        """Return the category labels currently written on tags, in order.

        There is no category table (DEC-015): the vocabulary of categories *is*
        whatever categories are in use, which is what this answers.
        """
        rows = (
            self._db.connect()
            .execute(
                "SELECT DISTINCT category FROM tags WHERE category IS NOT NULL"
                " ORDER BY category COLLATE NOCASE"
            )
            .fetchall()
        )
        return [str(row["category"]) for row in rows]

    def tags_for_track(self, track_id: int) -> List[Tag]:
        """Return the tags on one track, by name."""
        rows = (
            self._db.connect()
            .execute(
                "SELECT tags.id, tags.name, tags.category, tags.colour,"
                " tags.created_at"
                " FROM tags JOIN track_tags ON track_tags.tag_id = tags.id"
                " WHERE track_tags.track_id = ?"
                " ORDER BY tags.name COLLATE NOCASE",
                (int(track_id),),
            )
            .fetchall()
        )
        return [Tag.from_row(row) for row in rows]

    def tags_for_tracks(self, track_ids: Iterable[int]) -> Dict[int, List[Tag]]:
        """Return the tags on each track that has any, keyed by track id.

        The shape a window of rows needs. Tracks with no tags are absent rather
        than present with an empty list: the absence is the answer, and building
        empty lists for 50,000 untagged tracks is work nobody asked for.
        """
        wanted = unique_ids(track_ids)
        if not wanted:
            return {}

        found: Dict[int, List[Tag]] = {}
        connection = self._db.connect()
        for chunk in chunked(wanted):
            placeholders = ", ".join("?" for _ in chunk)
            rows = connection.execute(
                "SELECT track_tags.track_id AS track_id, tags.id, tags.name,"
                " tags.category, tags.colour, tags.created_at"
                " FROM track_tags JOIN tags ON tags.id = track_tags.tag_id"
                f" WHERE track_tags.track_id IN ({placeholders})"
                " ORDER BY tags.name COLLATE NOCASE",
                tuple(chunk),
            ).fetchall()
            for row in rows:
                found.setdefault(int(row["track_id"]), []).append(Tag.from_row(row))
        return found

    def tracks_with_tag(
        self, tag_id: int, track_ids: Optional[Iterable[int]] = None
    ) -> List[int]:
        """Return which tracks carry this tag, optionally within a given set.

        The narrowed form is how :meth:`assign` and :meth:`unassign` find out
        what will actually change before changing it.
        """
        connection = self._db.connect()
        if track_ids is None:
            rows = connection.execute(
                "SELECT track_id FROM track_tags WHERE tag_id = ?", (int(tag_id),)
            ).fetchall()
            return [int(row["track_id"]) for row in rows]

        wanted = unique_ids(track_ids)
        if not wanted:
            return []

        found: List[int] = []
        for chunk in chunked(wanted):
            placeholders = ", ".join("?" for _ in chunk)
            rows = connection.execute(
                "SELECT track_id FROM track_tags"
                f" WHERE tag_id = ? AND track_id IN ({placeholders})",
                (int(tag_id), *chunk),
            ).fetchall()
            found.extend(int(row["track_id"]) for row in rows)
        return found

    # ------------------------------------------------------- the vocabulary

    def create(self, tag: Tag) -> Tag:
        """Insert a tag and return it with its assigned id.

        Raises:
            sqlite3.IntegrityError: If a tag with that name already exists,
                ignoring case. Callers wanting "use the one that is there"
                should go through :class:`~cuepoint.services.tag_service.
                TagService`, which asks first.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "INSERT INTO tags (name, category, colour, created_at)"
                " VALUES (?, ?, ?, ?)",
                (
                    normalize_tag_name(tag.name),
                    normalize_tag_category(tag.category),
                    normalize_tag_colour(tag.colour),
                    tag.created_at or utc_now_iso(),
                ),
            )
            tag.id = int(cursor.lastrowid or 0)
        return tag

    def rename(self, tag_id: int, name: str) -> Optional[Tag]:
        """Rename a tag, leaving every assignment alone.

        Raises:
            sqlite3.IntegrityError: If another tag already has that name.
        """
        return self._update(tag_id, "name", normalize_tag_name(name))

    def set_category(self, tag_id: int, category: Optional[str]) -> Optional[Tag]:
        """Set or clear a tag's category label."""
        return self._update(tag_id, "category", normalize_tag_category(category))

    def set_colour(self, tag_id: int, colour: Optional[str]) -> Optional[Tag]:
        """Set or clear a tag's colour token."""
        return self._update(tag_id, "colour", normalize_tag_colour(colour))

    def delete(self, tag_id: int) -> bool:
        """Delete a tag and its assignments. Deletes no tracks.

        Returns:
            True when a tag was removed.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute("DELETE FROM tags WHERE id = ?", (int(tag_id),))
            return cursor.rowcount > 0

    def merge(self, source_id: int, target_id: int) -> int:
        """Move every assignment from one tag to another, then delete the source.

        ``UPDATE OR IGNORE`` moves the rows that can move; the ones that cannot
        are the tracks already carrying the target, where the move would collide
        with the ``(track_id, tag_id)`` primary key. Those are left behind and
        removed with the source tag, whose cascade takes them — which is exactly
        the wanted outcome: the track keeps the target tag, once.

        Returns:
            How many assignments moved.
        """
        source_id, target_id = int(source_id), int(target_id)
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE OR IGNORE track_tags SET tag_id = ? WHERE tag_id = ?",
                (target_id, source_id),
            )
            moved = int(cursor.rowcount or 0)
            conn.execute("DELETE FROM tags WHERE id = ?", (source_id,))
        return moved

    # ----------------------------------------------------------- assignment

    def assign(self, track_ids: Iterable[int], tag_id: int) -> List[int]:
        """Put a tag on tracks, and return the ones that did not have it.

        Idempotent: a track already carrying the tag is untouched and absent
        from the result, so a caller writing history writes it only for tracks
        that actually changed.
        """
        tag_id = int(tag_id)
        wanted = unique_ids(track_ids)
        if not wanted:
            return []

        already = set(self.tracks_with_tag(tag_id, wanted))
        changing = [track_id for track_id in wanted if track_id not in already]
        if not changing:
            return []

        now = utc_now_iso()
        with self._db.transaction(join_existing=True) as conn:
            for chunk in chunked(changing):
                conn.executemany(
                    "INSERT INTO track_tags (track_id, tag_id, created_at)"
                    " VALUES (?, ?, ?)",
                    [(track_id, tag_id, now) for track_id in chunk],
                )
        return changing

    def unassign(self, track_ids: Iterable[int], tag_id: int) -> List[int]:
        """Take a tag off tracks, and return the ones that had it.

        Idempotent in the same way as :meth:`assign`, and for the same reason.
        """
        tag_id = int(tag_id)
        wanted = unique_ids(track_ids)
        if not wanted:
            return []

        # The set is built once. Rebuilding it inside the comprehension would
        # be one query per track, which is the difference between one statement
        # and forty thousand.
        present = set(self.tracks_with_tag(tag_id, wanted))
        changing = [track_id for track_id in wanted if track_id in present]
        if not changing:
            return []

        with self._db.transaction(join_existing=True) as conn:
            for chunk in chunked(changing):
                placeholders = ", ".join("?" for _ in chunk)
                conn.execute(
                    "DELETE FROM track_tags"
                    f" WHERE tag_id = ? AND track_id IN ({placeholders})",
                    (tag_id, *chunk),
                )
        return changing

    # --------------------------------------------------------------- helpers

    def _update(self, tag_id: int, column: str, value: object) -> Optional[Tag]:
        """Write one column and return the tag, or ``None`` if there is no tag.

        The column name comes from this module's own calls and never from a
        caller; the value is always bound.
        """
        tag_id = int(tag_id)
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                f"UPDATE tags SET {column} = ? WHERE id = ?", (value, tag_id)
            )
            if not cursor.rowcount:
                return None
            row = conn.execute(f"{_SELECT} WHERE id = ?", (tag_id,)).fetchone()
        return Tag.from_row(row)


__all__: Sequence[str] = ("TagRepository",)
