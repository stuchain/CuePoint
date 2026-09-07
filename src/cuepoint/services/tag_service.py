#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Building and applying the tag vocabulary (ORG-03, DEC-015, DEC-008).

Two kinds of change live here, and telling them apart is most of the design.

**A change to the vocabulary** — creating a tag, renaming it, recolouring it,
labelling it with a category — is a change to a *word*, not to any track.
Renaming ``Peaktime`` to ``Peak-time`` does not change what any track is; the
same tracks carry the same tag, spelled better. Those write no track history,
because a History tab listing "notes changed" on three hundred tracks after a
typo fix is noise that buries the entries that matter.

**A change to a track** — putting a tag on it, taking one off — does write
history, one entry per track that actually changed, naming the tag: field
``tag``, old ``None``, new ``"Peak-time"`` for an addition and the inverse for a
removal. That is what lets the History tab read "added Peak-time" rather than
"tags changed", which is the difference between a log and a record.

Deleting and merging are both at once, and are recorded as what they do to
tracks: a delete removes the tag from everything carrying it, and each of those
tracks gets its removal recorded. Anything else would make a tag disappear from
a track with nothing to say where it went.

Create-or-get, not create-or-fail
---------------------------------
Tags are made by typing them. A user who types ``peak-time`` when ``Peak-time``
exists means the tag they already have — the unique index says so, ignoring
case — and answering that with an error about capitalization would be a worse
answer than simply using it. :meth:`TagService.create_or_get` is therefore the
only way to make a tag through this service.

One transaction per operation
-----------------------------
Every method that changes more than one row opens a transaction and lets the
repository and the history writer join it, so tagging twelve thousand tracks
either happens or does not. ORG-03 is what made that possible: the history
writer used to demand its own transaction and raised inside anyone else's.

:meth:`TagService.assign` and :meth:`TagService.unassign` in turn join an outer
transaction when a caller has opened one, which is how ORG-07's batch commits a
thousand tracks at a time rather than a thousand times.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from cuepoint.models.tag import (
    Tag,
    TagUsage,
    normalize_tag_category,
    normalize_tag_colour,
    normalize_tag_name,
)
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    ITagRepository,
    ITagService,
)

#: The history field a tag change is recorded under. One name for both
#: directions: the values say which way it went, and a History tab grouping by
#: field should show a track's tag activity together.
FIELD_TAG = "tag"

#: Who made the change, as ``track_history.source`` records it.
SOURCE_USER = "cuepoint"


class TagService(ITagService):
    """Owns the tag vocabulary and records what tagging does to tracks."""

    def __init__(
        self,
        tag_repository: ITagRepository,
        activity_service: IActivityService,
        database_service: IDatabaseService,
    ) -> None:
        """Wire the vocabulary to its store, the history log, and transactions.

        Args:
            tag_repository: Where tags and assignments live.
            activity_service: Where each change to a track is recorded.
            database_service: Used only to open the transaction that a
                multi-track operation and its history entries share.
        """
        self._tags = tag_repository
        self._activity = activity_service
        self._db = database_service

    # ------------------------------------------------------------ vocabulary

    def create_or_get(
        self,
        name: str,
        category: Optional[str] = None,
        colour: Optional[str] = None,
    ) -> Tag:
        """Return the tag with this name, creating it if it is not there.

        The name is matched ignoring case, so typing ``peak-time`` when
        ``Peak-time`` exists returns the existing tag rather than failing. An
        existing tag is returned **as it is**: the category and colour given
        here apply to a tag being created, and do not quietly re-style one that
        a user already set up.

        Raises:
            ValueError: If the name is empty or too long, or the colour is not
                a theme token.
        """
        wanted = normalize_tag_name(name)
        category = normalize_tag_category(category)
        colour = normalize_tag_colour(colour)

        existing = self._tags.find_by_name(wanted)
        if existing is not None:
            return existing
        return self._tags.create(Tag(name=wanted, category=category, colour=colour))

    def rename(self, tag_id: int, name: str) -> Tag:
        """Rename a tag. Assignments and track history are untouched.

        Raises:
            ValueError: If there is no such tag, the name is unusable, or
                another tag already has it.
        """
        wanted = normalize_tag_name(name)
        tag = self._require_tag(tag_id)
        if tag.name == wanted:
            return tag

        clash = self._tags.find_by_name(wanted)
        if clash is not None and clash.id != tag.id:
            # Refused rather than merged: merging is a different operation with
            # a different blast radius, and guessing which one was meant is not
            # this method's decision to make.
            raise ValueError(
                f"A tag called {clash.name!r} already exists. "
                "Merge the two tags instead of renaming."
            )

        renamed = self._tags.rename(tag_id, wanted)
        assert renamed is not None  # the tag existed a statement ago
        return renamed

    def set_category(self, tag_id: int, category: Optional[str]) -> Tag:
        """Set or clear a tag's category label.

        Raises:
            ValueError: If there is no such tag, or the label is too long.
        """
        self._require_tag(tag_id)
        updated = self._tags.set_category(tag_id, normalize_tag_category(category))
        assert updated is not None
        return updated

    def set_colour(self, tag_id: int, colour: Optional[str]) -> Tag:
        """Set or clear a tag's colour token.

        Raises:
            ValueError: If there is no such tag, or the colour is not one of
                the theme tokens.
        """
        self._require_tag(tag_id)
        updated = self._tags.set_colour(tag_id, normalize_tag_colour(colour))
        assert updated is not None
        return updated

    def delete(self, tag_id: int, batch_id: Optional[str] = None) -> int:
        """Delete a tag, recording its removal from every track that had it.

        Deletes no tracks — only the word and the assignments. Each track that
        carried it gets a history entry, because from that track's point of view
        the tag is gone and nothing else would say where.

        Raises:
            ValueError: If there is no such tag.

        Returns:
            How many tracks lost the tag.
        """
        tag = self._require_tag(tag_id)
        with self._db.transaction():
            affected = self._tags.tracks_with_tag(tag_id)
            self._tags.delete(tag_id)
            self._record(affected, tag.name, added=False, batch_id=batch_id)
        return len(affected)

    def merge(
        self, source_id: int, target_id: int, batch_id: Optional[str] = None
    ) -> int:
        """Merge one tag into another and delete the source.

        The operation a typo needs. Two tags that should have been one is the
        single most likely thing a user will want undone, and without this the
        answer is "retag three hundred tracks by hand".

        History is written from the track's point of view, which is the only one
        that matters here: a track that carried the source loses it, and gains
        the target unless it already had it. A track that had both loses the
        source and gains nothing — and is recorded that way rather than as an
        unchanged track, because the tag it was carrying really is gone.

        Raises:
            ValueError: If either tag does not exist, or they are the same tag.

        Returns:
            How many tracks ended up carrying the target that did not before.
        """
        source = self._require_tag(source_id)
        target = self._require_tag(target_id)
        if source.id == target.id:
            raise ValueError("Cannot merge a tag into itself")

        with self._db.transaction():
            had_source = self._tags.tracks_with_tag(source_id)
            had_target = set(self._tags.tracks_with_tag(target_id))
            gained = [t for t in had_source if t not in had_target]

            self._tags.merge(source_id, target_id)

            self._record(had_source, source.name, added=False, batch_id=batch_id)
            self._record(gained, target.name, added=True, batch_id=batch_id)
        return len(gained)

    # ------------------------------------------------------------ assignment

    def assign(
        self, track_ids: Iterable[int], tag_id: int, batch_id: Optional[str] = None
    ) -> List[int]:
        """Put a tag on tracks and record it.

        Idempotent: tracks already carrying the tag are untouched and write no
        history. One call serves one track and forty thousand.

        Raises:
            ValueError: If there is no such tag.

        Returns:
            The tracks that did not have the tag and now do.
        """
        tag = self._require_tag(tag_id)
        with self._db.transaction(join_existing=True):
            changed = self._tags.assign(track_ids, tag_id)
            self._record(changed, tag.name, added=True, batch_id=batch_id)
        return changed

    def unassign(
        self, track_ids: Iterable[int], tag_id: int, batch_id: Optional[str] = None
    ) -> List[int]:
        """Take a tag off tracks and record it.

        Idempotent in the same way as :meth:`assign`.

        Raises:
            ValueError: If there is no such tag.

        Returns:
            The tracks that had the tag and now do not.
        """
        tag = self._require_tag(tag_id)
        with self._db.transaction(join_existing=True):
            changed = self._tags.unassign(track_ids, tag_id)
            self._record(changed, tag.name, added=False, batch_id=batch_id)
        return changed

    # ------------------------------------------------------------------ read

    def list_all(self) -> List[TagUsage]:
        """Return every tag with how many tracks carry it, by name."""
        return self._tags.list_all()

    def categories_in_use(self) -> List[str]:
        """Return the category labels currently written on tags (DEC-015)."""
        return self._tags.categories_in_use()

    def tags_for_track(self, track_id: int) -> List[Tag]:
        """Return the tags on one track, by name."""
        return self._tags.tags_for_track(track_id)

    def tags_for_tracks(self, track_ids: Iterable[int]) -> Dict[int, List[Tag]]:
        """Return the tags on each track that has any, keyed by track id."""
        return self._tags.tags_for_tracks(track_ids)

    # --------------------------------------------------------------- helpers

    def _record(
        self,
        track_ids: Iterable[int],
        tag_name: str,
        added: bool,
        batch_id: Optional[str],
    ) -> None:
        """Write one history entry per track that actually changed.

        The tag's *name* is recorded rather than its id, deliberately. A history
        entry has to stay readable after the tag it names is deleted or renamed,
        and an id that no longer resolves is not a record of anything.
        """
        for track_id in track_ids:
            self._activity.record_field_change(
                track_id=int(track_id),
                field_name=FIELD_TAG,
                old_value=None if added else tag_name,
                new_value=tag_name if added else None,
                source=SOURCE_USER,
                batch_id=batch_id,
            )

    def _require_tag(self, tag_id: int) -> Tag:
        """Return the tag, or refuse the operation by name.

        Raises:
            ValueError: If there is no such tag.
        """
        tag = self._tags.get(int(tag_id))
        if tag is None:
            raise ValueError(f"No such tag: {tag_id}")
        return tag
