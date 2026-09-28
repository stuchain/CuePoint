#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The wantlist: Beatport tracks a user wants and does not have (DISCOVER-06, DEC-093).

An entry is added from a discovery run, from a page (DISCOVER-07) or by id,
and can then be given a note, marked bought or removed. Nothing else changes
it: not becoming owned, not being bought, not a run being deleted.

Bought is the user's word; owned is the library's
-------------------------------------------------
"Bought" is a mark the user sets. "Owned" is computed when the list is read,
from Clean's accepted matches (DEC-092), and nothing here writes it. Neither
changes the other: a track bought yesterday and not imported yet is bought and
not owned, and a track matched in the library and never marked is owned and
not bought. Nothing removes an entry automatically, becoming owned included.

An entry needs its catalog row
------------------------------
The table references the catalog cache, so a track is added with its catalog
row. A run's tracks and a page's always have one. An id CuePoint has never
read is read from Beatport first — outside the transaction, so no write lock is
held across a network request — and stored with the entry. A track Beatport
does not have is reported as not found and not added. A read that fails adds
nothing and raises, with DISCOVER-01's class, so the caller can say why.

Every change is one transaction with its event
----------------------------------------------
Each call that changes the list writes one activity event, inside the same
transaction as the change, so the Activity panel's history of the list is
exactly the list's history (DEC-008): a change that rolls back takes its event
with it. One event per call, not per entry — adding forty tracks is one thing
the user did. A call that changes nothing writes nothing and says so.

No ``track_history`` row is written: there is no library track.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import (
    Any,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Protocol,
    Sequence,
    Tuple,
)

from cuepoint.services.beatport_api_models import CatalogTrack
from cuepoint.models.discovery_run import OWNED_ALL
from cuepoint.models.wantlist import (
    BOUGHT_ALL,
    MAX_NOTE_LENGTH,
    SORT_ADDED,
    WantlistEntry,
    WantlistPage,
)
from cuepoint.services.beatport_ownership import requested_track_ids
from cuepoint.services.interfaces import (
    IActivityService,
    IBeatportCatalogRepository,
    IDatabaseService,
    IDiscoveryRepository,
    IWantlistRepository,
    IWantlistService,
)


#: The most tracks one call changes: a whole discovery run's worth, bounded so
#: a request from outside the engine cannot ask for more.
MAX_CHANGE = 10_000

#: The most ids an activity event lists; its ``count`` is always the whole.
EVENT_ID_LIMIT = 100

ACTION_ADDED = "added"
ACTION_REMOVED = "removed"
ACTION_NOTED = "noted"
ACTION_BOUGHT = "bought"
ACTION_UNBOUGHT = "unbought"

#: The activity event each action records.
EVENTS = {
    ACTION_ADDED: "discover.wantlist.added",
    ACTION_REMOVED: "discover.wantlist.removed",
    ACTION_NOTED: "discover.wantlist.noted",
    ACTION_BOUGHT: "discover.wantlist.bought",
    ACTION_UNBOUGHT: "discover.wantlist.unbought",
}


class WantlistSource(Protocol):
    """What an add needs from ``BeatportApi``: DISCOVER-01's batched read."""

    def require_token(self) -> None:
        """Raise a ``no_token`` ``BeatportAPIError`` when there is no token."""
        ...

    def get_tracks(self, track_ids: Iterable[int]) -> List[CatalogTrack]:
        """Catalog tracks by id, leaving out any Beatport does not have."""
        ...


def _tracks(n: int) -> str:
    return f"{n:,} track{'' if n == 1 else 's'}"


@dataclass(frozen=True)
class WantlistChange:
    """What one call did to the list.

    Attributes:
        action: One of the ``ACTION_*`` words.
        changed: Entries this call changed, in the order asked.
        unchanged: Entries already as asked: on the list for an add, already
            bought or not bought, the same note.
        not_listed: Ids asked about that are not on the list.
        not_found: For an add, ids Beatport has no readable track for.
        read_from_beatport: For an add, catalog rows read to add them.
        message: What happened, in a sentence.
    """

    action: str
    message: str
    changed: Tuple[int, ...] = ()
    unchanged: Tuple[int, ...] = ()
    not_listed: Tuple[int, ...] = ()
    not_found: Tuple[int, ...] = ()
    read_from_beatport: int = 0
    detail: Dict[str, Any] = field(default_factory=dict, compare=False, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        """The response a caller shows."""
        return {
            "action": self.action,
            "changed": list(self.changed),
            "unchanged": list(self.unchanged),
            "not_listed": list(self.not_listed),
            "not_found": list(self.not_found),
            "read_from_beatport": self.read_from_beatport,
            "message": self.message,
        }


def _count(ids: Sequence[int], what: str) -> str:
    return f"{_tracks(len(ids))} {what}" if ids else ""


def _sentence(summary: str, parts: Sequence[str], single: Optional[str]) -> str:
    """What a call did: its summary and what it left alone, or why nothing.

    ``single`` is the whole answer when it is given and nothing changed.
    """
    left = ", ".join(p for p in parts if p)
    if summary:
        return f"{summary}; {left}" if left else summary
    if single is not None:
        return single
    return f"Nothing changed: {left}"


def _note(value: Any) -> Optional[str]:
    """A note as stored: trimmed text, or None for none.

    Raises:
        ValueError: If it is not text, or is longer than the list keeps.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"A note is text, got {type(value).__name__}")
    text = value.strip()
    if len(text) > MAX_NOTE_LENGTH:
        raise ValueError(f"A note is at most {MAX_NOTE_LENGTH} characters")
    return text or None


def _run_id(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"A run id is a positive whole number, got {value!r}")
    return int(value)


class WantlistService(IWantlistService):
    """Adds, notes, marks and removes wantlist entries, each with its event."""

    def __init__(
        self,
        database_service: IDatabaseService,
        wantlist: IWantlistRepository,
        catalog: IBeatportCatalogRepository,
        runs: IDiscoveryRepository,
        beatport: WantlistSource,
        activity_service: IActivityService,
        *,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._db = database_service
        self._wantlist = wantlist
        self._catalog = catalog
        self._runs = runs
        self._beatport = beatport
        self._activity = activity_service
        self._clock = clock

    # ----------------------------------------------------------------- read

    def get(self, track_id: int) -> Optional[WantlistEntry]:
        """One entry, or None."""
        return self._wantlist.get(track_id)

    def page(
        self,
        owned: str = OWNED_ALL,
        bought: str = BOUGHT_ALL,
        sort: str = SORT_ADDED,
        descending: bool = True,
        offset: int = 0,
        limit: int = 100,
    ) -> WantlistPage:
        """A window of the list, newest first, with ownership as it is now.

        Raises:
            ValueError: If a filter, the sort or the window is not one the
                list answers.
        """
        return self._wantlist.page(
            owned=owned,
            bought=bought,
            sort=sort,
            descending=descending,
            offset=offset,
            limit=limit,
        )

    # ---------------------------------------------------------------- write

    def add(
        self, track_ids: Sequence[int], *, run_id: Optional[int] = None
    ) -> WantlistChange:
        """Add Beatport tracks, reading any the catalog cache lacks.

        With ``run_id``, the tracks are added from that run, which must have
        found every one of them; the entries remember it while it exists.

        Raises:
            ValueError: If the ids or the run id are not ones this takes, or
                the run did not find every track.
            LookupError: If there is no such run.
            BeatportAPIError: If tracks had to be read and the read failed,
                ``no_token`` included. Nothing is added.
        """
        ids = requested_track_ids(track_ids, limit=MAX_CHANGE)
        run = _run_id(run_id)
        if run is not None:
            self._require_run_found(run, ids)
        listed = self._wantlist.entries(ids)
        wanted = [i for i in ids if i not in listed]
        cached = self._catalog.get_tracks(wanted)
        missing = [i for i in wanted if i not in cached]
        fetched: List[CatalogTrack] = []
        if missing:
            self._beatport.require_token()
            asked = set(missing)
            fetched = [t for t in self._beatport.get_tracks(missing) if t.id in asked]
        now = self._clock().isoformat()
        entries = [
            WantlistEntry(beatport_track_id=i, added_at=now, added_from_run_id=run)
            for i in wanted
        ]
        with self._db.transaction():
            if run is not None:
                self._require_run_found(run, ids)
            already = self._wantlist.entries(ids)
            added = self._wantlist.add(
                [e for e in entries if e.beatport_track_id not in already],
                fetched,
                now,
            )
            unchanged = tuple(i for i in ids if i in already)
            not_found = tuple(i for i in ids if i not in already and i not in added)
            change = self._describe_add(
                tuple(added), unchanged, not_found, len(fetched), run
            )
            self._record(change)
        return change

    def remove(self, track_ids: Sequence[int]) -> WantlistChange:
        """Remove entries. An id not on the list is reported, not refused.

        Raises:
            ValueError: If the ids are not ones this takes.
        """
        ids = requested_track_ids(track_ids, limit=MAX_CHANGE)
        with self._db.transaction():
            label = self._label_of(ids)
            removed = tuple(self._wantlist.remove(ids))
            not_listed = tuple(i for i in ids if i not in removed)
            summary = f"Removed {label(removed)} from the wantlist" if removed else ""
            message = _sentence(
                summary,
                [_count(not_listed, "not on the wantlist")],
                single="That track is not on the wantlist" if len(ids) == 1 else None,
            )
            change = WantlistChange(
                action=ACTION_REMOVED,
                message=message,
                changed=removed,
                not_listed=not_listed,
                detail=self._detail(removed, summary),
            )
            self._record(change)
        return change

    def set_note(self, track_id: int, note: Optional[str]) -> WantlistChange:
        """Set an entry's note, or clear it with None or blank text.

        Raises:
            ValueError: If the id or the note is not one this takes.
        """
        (tid,) = requested_track_ids([track_id], limit=1)
        text = _note(note)
        with self._db.transaction():
            entry = self._wantlist.get(tid)
            if entry is None:
                return WantlistChange(
                    action=ACTION_NOTED,
                    message="That track is not on the wantlist",
                    not_listed=(tid,),
                )
            if entry.note == text:
                return WantlistChange(
                    action=ACTION_NOTED,
                    message="The note is already that",
                    unchanged=(tid,),
                )
            self._wantlist.set_note(tid, text)
            label = self._label_of([tid])((tid,))
            summary = (
                f"Noted {label} on the wantlist"
                if text is not None
                else f"Cleared the note on {label}"
            )
            detail = self._detail((tid,), summary)
            detail["note"] = text
            change = WantlistChange(
                action=ACTION_NOTED,
                message=summary,
                changed=(tid,),
                detail=detail,
            )
            self._record(change)
        return change

    def set_bought(self, track_ids: Sequence[int], bought: bool) -> WantlistChange:
        """Mark entries bought, or unmark them.

        An entry already as asked keeps its mark and the moment it was made.
        Owned is not touched, and nothing is removed.

        Raises:
            ValueError: If the ids are not ones this takes, or ``bought`` is
                not a boolean.
        """
        if not isinstance(bought, bool):
            raise ValueError(f"bought is true or false, got {bought!r}")
        ids = requested_track_ids(track_ids, limit=MAX_CHANGE)
        action = ACTION_BOUGHT if bought else ACTION_UNBOUGHT
        with self._db.transaction():
            listed = self._wantlist.entries(ids)
            label = self._label_of(ids)
            changed = tuple(
                self._wantlist.set_bought(
                    [i for i in ids if i in listed],
                    self._clock().isoformat() if bought else None,
                )
            )
            unchanged = tuple(i for i in ids if i in listed and i not in changed)
            not_listed = tuple(i for i in ids if i not in listed)
            word = "bought" if bought else "not bought"
            summary = f"Marked {label(changed)} {word}" if changed else ""
            message = _sentence(
                summary,
                [
                    _count(unchanged, f"already {word}"),
                    _count(not_listed, "not on the wantlist"),
                ],
                single=(
                    f"Already marked {word}"
                    if unchanged
                    else "That track is not on the wantlist"
                )
                if len(ids) == 1
                else None,
            )
            change = WantlistChange(
                action=action,
                message=message,
                changed=changed,
                unchanged=unchanged,
                not_listed=not_listed,
                detail=self._detail(changed, summary),
            )
            self._record(change)
        return change

    # -------------------------------------------------------------- helpers

    def _require_run_found(self, run_id: int, ids: Sequence[int]) -> None:
        if self._runs.get_run(run_id) is None:
            raise LookupError(f"No discovery run {run_id}")
        found = self._runs.tracks_in_run(run_id, ids)
        stray = [i for i in ids if i not in found]
        if stray:
            raise ValueError(
                f"Discovery run {run_id} did not find {_tracks(len(stray))}:"
                f" {', '.join(str(i) for i in stray[:5])}"
                + (" and more" if len(stray) > 5 else "")
            )

    def _label_of(self, ids: Sequence[int]) -> Callable[[Sequence[int]], str]:
        """How a summary names the entries it changed.

        One track by its artists and title, read before the change so a
        removal can still name what it removed; several by their number.
        """
        first = ids[0] if len(ids) == 1 else None
        name = self._track_name(first) if first is not None else None

        def label(changed: Sequence[int]) -> str:
            if len(changed) == 1 and name is not None and changed[0] == first:
                return name
            return _tracks(len(changed))

        return label

    def _track_name(self, track_id: int) -> Optional[str]:
        track = self._catalog.get_tracks([track_id]).get(track_id)
        if track is None:
            return None
        title = track.title + (f" ({track.mix_name})" if track.mix_name else "")
        artists = [
            c.name for c in self._catalog.credits(track_id) if c.role == "artist"
        ]
        return f"“{title}” by {', '.join(artists)}" if artists else f"“{title}”"

    def _describe_add(
        self,
        added: Tuple[int, ...],
        unchanged: Tuple[int, ...],
        not_found: Tuple[int, ...],
        read: int,
        run_id: Optional[int],
    ) -> WantlistChange:
        summary = (
            f"Added {self._label_of(added)(added)} to the wantlist" if added else ""
        )
        everything_listed = not added and not not_found
        message = _sentence(
            summary,
            [
                _count(unchanged, "already on it"),
                _count(not_found, "not found on Beatport"),
            ],
            single=(
                "Already on the wantlist"
                if len(unchanged) == 1
                else f"All {_tracks(len(unchanged))} are already on the wantlist"
            )
            if everything_listed
            else None,
        )
        detail = self._detail(added, summary)
        if run_id is not None:
            detail["run_id"] = run_id
        if read:
            detail["read_from_beatport"] = read
        return WantlistChange(
            action=ACTION_ADDED,
            message=message,
            changed=added,
            unchanged=unchanged,
            not_found=not_found,
            read_from_beatport=read,
            detail=detail,
        )

    @staticmethod
    def _detail(changed: Sequence[int], summary: str) -> Dict[str, Any]:
        return {
            "summary": summary,
            "count": len(changed),
            "beatport_track_ids": list(changed[:EVENT_ID_LIMIT]),
        }

    def _record(self, change: WantlistChange) -> None:
        """Write the change's event, inside the change's transaction."""
        if not change.changed:
            return
        detail = dict(change.detail)
        summary = detail.pop("summary")
        self._activity.record_event(EVENTS[change.action], summary, detail)
