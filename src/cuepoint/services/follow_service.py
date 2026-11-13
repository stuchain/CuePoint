#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Following Beatport artists and labels (Discover's Following tab, DEC-317).

A follow is a Beatport artist or label id the user wants new releases from.
Only an id can be followed: a library name linked to several Beatport ids names
none of them (DEC-095), so its page is a name page and offers no Follow.

Reading never asks Beatport
---------------------------
:meth:`FollowService.follows`, :meth:`~FollowService.suggestions` and
:meth:`~FollowService.feed` read the catalog cache only. The cache is filled by
:meth:`~FollowService.check`, a job's work: for each follow it goes through
:meth:`EntityPageService.beatport`, the one place that reads an artist's or
label's listing and keeps it (``beatport_listings``, ``LISTING_MAX_AGE``), so
there is one Beatport path, one freshness rule and one set of refusal states
(DEC-098). A refusal for one follow is that follow's state and the job goes on;
no token ends it, since every follow would be refused the same way.

What is new
-----------
Releases dated after the follow's ``seen_through``. A new follow starts it 30
days back so its first look is not empty; marking seen moves it to yesterday
and never backwards, so a track Beatport lists later today (the feed starts the
day after ``seen_through``) is still new until the next day's look. A track by
two follows appears once, naming both.

What is not stored
------------------
A follow's last refusal is held in memory for the life of the engine: it says
"the last check could not read this one", which means nothing after a restart.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.models.beatport_cache import ENTITY_KINDS, MAX_BEATPORT_ID
from cuepoint.models.discovery_run import (
    OWNED_FILTERS,
    OWNED_HIDE,
)
from cuepoint.models.entity_page import (
    MAX_ENTITY_WINDOW,
    STATE_NO_TOKEN,
    STATE_OK,
    STATE_UNAVAILABLE,
)
from cuepoint.models.follow import FOLLOW_LOOKBACK_DAYS, Follow
from cuepoint.services.discovery_service import local_date
from cuepoint.services.interfaces import (
    IActivityService,
    IBeatportCatalogRepository,
    IDatabaseService,
    IEntityPageService,
    IFollowRepository,
    IFollowService,
    ITrackCreditRepository,
    IWantlistRepository,
)

_logger = logging.getLogger(__name__)

#: The most a name may be.
MAX_NAME = 300

#: The most suggestions asked for at once.
MAX_SUGGESTIONS = 100

EVENT_ADDED = "discover.follow.added"
EVENT_REMOVED = "discover.follow.removed"
EVENT_SEEN = "discover.follow.seen"

_NOUN = {"artist": "artist", "label": "label"}

#: Each follow's last refusal, by ``(kind, id)``: ``{state, message}``.
_STATES: Dict[Tuple[str, int], Dict[str, str]] = {}
_STATES_LOCK = threading.Lock()


def forget_states() -> None:
    """Clear every remembered refusal (tests)."""
    with _STATES_LOCK:
        _STATES.clear()


def _state_of(kind: str, beatport_id: int) -> Optional[Dict[str, str]]:
    with _STATES_LOCK:
        found = _STATES.get((kind, beatport_id))
        return None if found is None else dict(found)


def _check_kind(kind: Any) -> str:
    if kind not in ENTITY_KINDS:
        raise ValueError(f"kind must be one of {ENTITY_KINDS}, got {kind!r}")
    return str(kind)


def _check_id(value: Any) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not 1 <= value <= MAX_BEATPORT_ID
    ):
        raise ValueError(f"beatport_id must be a positive whole number, got {value!r}")
    return int(value)


def _check_which(
    kind: Optional[str], beatport_id: Optional[int]
) -> Tuple[Optional[str], Optional[int]]:
    """``(kind, id)`` both given and valid, or both None."""
    if kind is None and beatport_id is None:
        return None, None
    if kind is None or beatport_id is None:
        raise ValueError("Name a follow by kind and beatport_id together, or neither")
    return _check_kind(kind), _check_id(beatport_id)


class FollowService(IFollowService):
    """Follows, their new tracks from the cache, and the check that fills it."""

    def __init__(
        self,
        database_service: IDatabaseService,
        follows: IFollowRepository,
        catalog: IBeatportCatalogRepository,
        credits: ITrackCreditRepository,
        wantlist: IWantlistRepository,
        entity_pages: IEntityPageService,
        activity_service: IActivityService,
        *,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._db = database_service
        self._follows = follows
        self._catalog = catalog
        self._credits = credits
        self._wantlist = wantlist
        self._pages = entity_pages
        self._activity = activity_service
        self._clock = clock

    # ----------------------------------------------------------------- reads

    def is_followed(self, kind: str, beatport_id: int) -> bool:
        """Whether an artist or label is followed."""
        return self._follows.get(_check_kind(kind), _check_id(beatport_id)) is not None

    def follows(self) -> Dict[str, Any]:
        """Every follow, with how many new tracks it has in the cache.

        A follow's ``new_count`` is tracks released after its ``seen_through``
        that the library does not own: what the feed shows by default. The
        top-level ``new_count`` counts each track once, so it is the feed's
        ``total`` for ``owned="hide"``. Ownership is read once for all follows.
        """
        today = local_date(self._clock()).isoformat()
        every = self._follows.list()
        live = [(f, _day_after(f.seen_through)) for f in every]
        live = [(f, since) for f, since in live if since <= today]
        counts: Dict[Tuple[str, int], int] = {}
        total = 0
        if live:
            page = self._catalog.followed_tracks(
                [(f.kind, f.beatport_id, since) for f, since in live],
                today,
                OWNED_HIDE,
                0,
                1,
            )
            total = page.total
            for (f, _), count in zip(live, page.per_source):
                counts[(f.kind, f.beatport_id)] = count
        rows = [self._row(f, counts.get((f.kind, f.beatport_id), 0)) for f in every]
        return {"follows": rows, "new_count": total}

    def _row(self, follow: Follow, new_count: int) -> Dict[str, Any]:
        listing = self._catalog.listing(follow.kind, follow.beatport_id)
        return {
            **follow.to_dict(),
            "new_count": new_count,
            "checked_at": None if listing is None else listing.fetched_at,
            "state": _state_of(follow.kind, follow.beatport_id),
        }

    def suggestions(self, limit: int = 20) -> Dict[str, Any]:
        """The artists and labels the library holds most tracks by.

        Only names resolution has linked to exactly one Beatport id, and none
        already followed. Ranked together by owned track count.
        """
        if (
            isinstance(limit, bool)
            or not isinstance(limit, int)
            or not 1 <= limit <= MAX_SUGGESTIONS
        ):
            raise ValueError(f"limit is 1 to {MAX_SUGGESTIONS}, got {limit!r}")
        found: List[Dict[str, Any]] = []
        for kind in ENTITY_KINDS:
            for beatport_id, name, tracks in self._credits.follow_candidates(
                kind, limit
            ):
                found.append(
                    {
                        "kind": kind,
                        "beatport_id": beatport_id,
                        "name": name,
                        "track_count": tracks,
                        "followed": False,
                    }
                )
        found.sort(key=lambda s: (-s["track_count"], s["name"].casefold(), s["kind"]))
        return {"suggestions": found[:limit]}

    def feed(
        self,
        kind: Optional[str] = None,
        beatport_id: Optional[int] = None,
        owned: str = OWNED_HIDE,
        offset: int = 0,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Cached tracks released after each follow's ``seen_through``.

        Merged across the follows (one, when named), newest release first and
        then by title. Each track is the shape the Beatport tables send, with
        ``follows``: which follow or follows it came from. Asks Beatport
        nothing; ``checked_at`` is when the oldest listing was read, None when
        a follow has none yet (``unchecked`` counts those).

        Raises:
            ValueError: If the filter, the window or the follow named is not
                one this answers.
        """
        if owned not in OWNED_FILTERS:
            raise ValueError(f"owned must be one of {OWNED_FILTERS}, got {owned!r}")
        if (
            isinstance(offset, bool)
            or isinstance(limit, bool)
            or not isinstance(offset, int)
            or not isinstance(limit, int)
            or not 1 <= limit <= MAX_ENTITY_WINDOW
            or offset < 0
        ):
            raise ValueError(
                f"A window is 1 to {MAX_ENTITY_WINDOW} tracks from offset 0 or later"
            )
        which = _check_which(kind, beatport_id)
        follows = [
            f
            for f in self._follows.list()
            if which == (None, None) or (f.kind, f.beatport_id) == which
        ]
        today = local_date(self._clock()).isoformat()
        fetched: List[str] = []
        unchecked = 0
        states: List[Dict[str, Any]] = []
        live: List[Tuple[Follow, str]] = []
        for follow in follows:
            listing = self._catalog.listing(follow.kind, follow.beatport_id)
            if listing is None:
                unchecked += 1
            else:
                fetched.append(listing.fetched_at)
            failed = _state_of(follow.kind, follow.beatport_id)
            if failed is not None:
                states.append(
                    {"kind": follow.kind, "beatport_id": follow.beatport_id, **failed}
                )
            since = _day_after(follow.seen_through)
            if since <= today:
                live.append((follow, since))
        rows: List[Dict[str, Any]] = []
        total = 0
        hidden = 0
        if live:
            page = self._catalog.followed_tracks(
                [(f.kind, f.beatport_id, since) for f, since in live],
                today,
                owned,
                offset,
                limit,
            )
            total = page.total
            hidden = page.owned
            listed = self._wantlist.entries(
                [row.track.beatport_track_id for row, _ in page.rows]
            )
            for row, positions in page.rows:
                rows.append(
                    {
                        **replace(
                            row, on_wantlist=row.track.beatport_track_id in listed
                        ).to_dict(),
                        "follows": [
                            {
                                "kind": live[p][0].kind,
                                "beatport_id": live[p][0].beatport_id,
                                "name": live[p][0].name,
                            }
                            for p in positions
                        ],
                    }
                )
        return {
            "rows": rows,
            "total": total,
            "hidden_owned": hidden if owned == OWNED_HIDE else 0,
            "checked_at": min(fetched) if fetched and not unchecked else None,
            "unchecked": unchecked,
            "states": states,
            "follow_count": len(follows),
            "window": {
                "kind": which[0],
                "beatport_id": which[1],
                "owned": owned,
                "offset": offset,
                "limit": limit,
            },
        }

    # ---------------------------------------------------------------- writes

    def add(self, kind: str, beatport_id: int, name: str) -> Dict[str, Any]:
        """Follow an artist or label by Beatport id. Following twice is a no-op.

        ``seen_through`` starts 30 days back.

        Raises:
            ValueError: If the kind, id or name is not one a follow takes.
        """
        kind = _check_kind(kind)
        beatport_id = _check_id(beatport_id)
        if not isinstance(name, str) or not name.strip():
            raise ValueError("name is required")
        if len(name.strip()) > MAX_NAME:
            raise ValueError(f"name is at most {MAX_NAME} characters")
        now = self._clock()
        seen = local_date(now) - timedelta(days=FOLLOW_LOOKBACK_DAYS)
        follow = Follow(
            kind=kind,
            beatport_id=beatport_id,
            name=name,
            followed_at=now.isoformat(),
            seen_through=seen.isoformat(),
        )
        with self._db.transaction():
            added = self._follows.add(follow)
            if added:
                self._activity.record_event(
                    EVENT_ADDED,
                    f"Followed the {_NOUN[kind]} {follow.name}",
                    {"kind": kind, "beatport_id": beatport_id, "name": follow.name},
                )
        stored = self._follows.get(kind, beatport_id) or follow
        return {"changed": added, "followed": True, "follow": stored.to_dict()}

    def remove(self, kind: str, beatport_id: int) -> Dict[str, Any]:
        """Unfollow. Not following is reported, not refused."""
        kind = _check_kind(kind)
        beatport_id = _check_id(beatport_id)
        with self._db.transaction():
            existing = self._follows.get(kind, beatport_id)
            removed = self._follows.remove(kind, beatport_id)
            if removed and existing is not None:
                self._activity.record_event(
                    EVENT_REMOVED,
                    f"Unfollowed the {_NOUN[kind]} {existing.name}",
                    {"kind": kind, "beatport_id": beatport_id, "name": existing.name},
                )
        if removed:
            with _STATES_LOCK:
                _STATES.pop((kind, beatport_id), None)
        return {"changed": removed, "followed": False}

    def mark_seen(
        self, kind: Optional[str] = None, beatport_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Mark one follow's, or every follow's, tracks seen through yesterday.

        Not today: the feed starts the day after ``seen_through``, and Beatport
        can list a track dated today later in the day, so today's releases
        stay new until the next day's look.
        """
        which = _check_which(kind, beatport_id)
        through = (local_date(self._clock()) - timedelta(days=1)).isoformat()
        with self._db.transaction():
            moved = self._follows.mark_seen(through, which[0], which[1])
            if moved:
                names = ", ".join(f.name for f in moved[:3])
                self._activity.record_event(
                    EVENT_SEEN,
                    f"Marked new releases seen for {names}"
                    + ("" if len(moved) <= 3 else f" and {len(moved) - 3} more"),
                    {
                        "count": len(moved),
                        "follows": [
                            {"kind": f.kind, "beatport_id": f.beatport_id}
                            for f in moved[:100]
                        ],
                        "seen_through": through,
                    },
                )
        return {"changed": len(moved), "seen_through": through}

    # ----------------------------------------------------------------- check

    def check(
        self,
        refresh: bool = False,
        *,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> Dict[str, Any]:
        """Read each follow's recent releases where the cache is stale.

        Sequential, one follow at a time, through the entity page service, so
        a listing younger than its maximum age costs no request unless
        ``refresh``. A refusal is recorded as that follow's state and the next
        follow is read; ``no_token`` stops the check, since all would be
        refused alike.

        Returns ``{outcome, state, checked, from_cache, failed, total}``:
        ``outcome`` is ``ok``, ``no_token`` or ``cancelled``; ``failed`` lists
        ``{kind, beatport_id, name, state, message}`` for the follows refused
        (not for ``no_token``, which is the outcome). An error other than
        Beatport's refusals is that follow's ``unavailable``.
        """
        follows = self._follows.list()
        total = len(follows)
        checked = cached = 0
        failed: List[Dict[str, Any]] = []
        outcome = "ok"
        if on_progress is not None:
            on_progress(0, total)
        for done, follow in enumerate(follows):
            if should_cancel is not None and should_cancel():
                outcome = "cancelled"
                break
            key = (follow.kind, follow.beatport_id)
            try:
                half = self._pages.beatport(
                    follow.kind,
                    f"bp:{follow.beatport_id}",
                    refresh=refresh,
                    limit=1,
                    listing_only=True,
                )
                state, message, from_cache = half.state, half.message, half.from_cache
            except Exception as exc:  # noqa: BLE001 - one follow must not end the check
                _logger.warning(
                    "[follows] %s %s: check failed: %s",
                    follow.kind,
                    follow.beatport_id,
                    exc,
                    exc_info=True,
                )
                state, message, from_cache = (
                    STATE_UNAVAILABLE,
                    f"The check could not read this one: {exc}",
                    False,
                )
            if state == STATE_OK:
                with _STATES_LOCK:
                    _STATES.pop(key, None)
                checked += 1
                cached += 1 if from_cache else 0
            elif state == STATE_NO_TOKEN:
                # The check's state, not this follow's: every follow would be
                # refused alike, and none is marked.
                _logger.info("[follows] no Beatport token; the check stops")
                outcome = STATE_NO_TOKEN
                break
            else:
                entry = {"state": state, "message": message}
                # A follow removed while it was being read gets no state.
                if self._follows.get(follow.kind, follow.beatport_id) is not None:
                    with _STATES_LOCK:
                        _STATES[key] = entry
                    failed.append(
                        {
                            "kind": follow.kind,
                            "beatport_id": follow.beatport_id,
                            "name": follow.name,
                            **entry,
                        }
                    )
                _logger.info(
                    "[follows] %s %s: Beatport said %s",
                    follow.kind,
                    follow.beatport_id,
                    state,
                )
            if on_progress is not None:
                on_progress(done + 1, total)
        return {
            "outcome": outcome,
            "state": outcome,
            "checked": checked,
            "from_cache": cached,
            "failed": failed,
            "total": total,
        }


def _day_after(day: str) -> str:
    """The ISO date after ``day``: releases from then on are new."""
    return (date.fromisoformat(day) + timedelta(days=1)).isoformat()


__all__: Sequence[str] = (
    "EVENT_ADDED",
    "EVENT_REMOVED",
    "EVENT_SEEN",
    "FollowService",
    "forget_states",
)
