#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Pushing tracks to a Beatport playlist (DISCOVER-06, DEC-099).

A push creates a playlist on the user's Beatport account through the v4 API
and adds tracks to it one at a time, as a job. It is the only way CuePoint
writes to Beatport, and it is always something the user asked for.

Owned tracks are skipped unless asked for
-----------------------------------------
A playlist pushed from a run or the wantlist is a list for buying, and a track
the library already owns does not belong on it: that is the mistake DEC-092
exists to prevent. :meth:`BeatportPlaylistService.plan` decides once, before
the job exists, which tracks go and which are skipped as owned (DEC-063: a
scope is resolved at the start). A push that would add nothing is refused
rather than creating an empty playlist.

Through the API only
--------------------
There is no browser fallback (DEC-099). A 403 when creating the playlist is
refused as ``forbidden``, saying Beatport accepted the token but won't allow making playlists with it. The
URL reported is the real one, ``BeatportApi.playlist_url``'s, never a
placeholder.

Not a transaction
-----------------
A track Beatport will not add is reported and skipped, as DEC-063 said of
batches: the playlist keeps what was added. A refusal every later request
would repeat — a rejected token, a missing scope, a rate limit still in force
— stops the push at once, and :data:`MAX_CONSECUTIVE_FAILURES` failures in a
row that are not about the track stop it too (the shared policy DISCOVER-04
and DISCOVER-05 use). A refusal that is about the track — a 404 for an id
Beatport does not have, a 400 — proves Beatport is answering, so it resets
that count. Cancel is checked before each track, and what was added stays.

One activity event records every push, whatever its outcome, with the real
playlist URL when a playlist was created.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Protocol, Sequence, Tuple

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.playlist_name import default_playlist_name
from cuepoint.services.beatport_api_client import (
    ERROR_FORBIDDEN,
    ERROR_NO_TOKEN,
    ERROR_RATE_LIMITED,
    ERROR_REJECTED,
    MAX_CONSECUTIVE_FAILURES,
    REPEATING_ERROR_CLASSES,
    classify_beatport_error,
)
from cuepoint.services.beatport_ownership import requested_track_ids
from cuepoint.services.discovery_service import local_date
from cuepoint.services.interfaces import (
    IActivityService,
    IBeatportCatalogRepository,
    IBeatportPlaylistService,
)

_logger = logging.getLogger(__name__)

#: The most tracks one push adds. Each is one request, so this is also the
#: most requests one push makes after creating the playlist.
MAX_PLAYLIST_TRACKS = 10_000

#: The longest playlist name CuePoint sends.
MAX_PLAYLIST_NAME_LENGTH = 200

#: The most failed ids the activity event lists; the job's result lists all.
EVENT_ID_LIMIT = 100

#: The activity event every push records.
EVENT_PLAYLIST_PUSHED = "discover.playlist.pushed"

#: The stages a push reports its progress in.
STAGE_CREATING = "Creating the Beatport playlist"
STAGE_ADDING = "Adding tracks to the Beatport playlist"

OUTCOME_SUCCEEDED = "succeeded"
OUTCOME_CANCELLED = "cancelled"
OUTCOME_FAILED = "failed"

#: The config key naming the default playlist name's format (inCrate's; the
#: prefix is historical, the phase's cross-cutting fact 7).
NAME_FORMAT_KEY = "incrate.playlist_name_format"

_NAME_FORMATS = ("short", "iso")

_STOPPED_BECAUSE = {
    ERROR_NO_TOKEN: "you are not signed in to Beatport",
    ERROR_REJECTED: "Beatport refused the sign-in",
    ERROR_FORBIDDEN: "this sign-in is not allowed to change playlists",
    ERROR_RATE_LIMITED: "Beatport asked CuePoint to slow down",
}

#: What a refused create says, by class. A 403 here is DEC-099's case.
_CREATE_REFUSED = {
    ERROR_NO_TOKEN: "you are not signed in to Beatport",
    ERROR_REJECTED: "Beatport refused the sign-in; it may have ended",
    ERROR_FORBIDDEN: ("Beatport let CuePoint in but won't allow making playlists."),
    ERROR_RATE_LIMITED: "Beatport asked CuePoint to slow down; try again later",
}

#: The statuses that mean Beatport answered and refused this one request.
_ACCOUNT_STATUSES = (401, 403, 429)

#: What a Beatport playlist id looks like (as ``BeatportApi`` checks it).
_PLAYLIST_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class PlaylistWriter(Protocol):
    """What a push needs from ``BeatportApi`` (DISCOVER-01's playlist methods)."""

    def require_token(self) -> None:
        """Raise a ``no_token`` ``BeatportAPIError`` when there is no token."""
        ...

    def create_playlist(self, name: str) -> Optional[str]:
        """Create a playlist; its id, or None when Beatport named none."""
        ...

    def add_track_to_playlist(self, playlist_id: str, track_id: int) -> None:
        """Add one track; raise on failure."""
        ...

    def playlist_url(self, playlist_id: str) -> Optional[str]:
        """The playlist's page on www.beatport.com."""
        ...

    def my_playlists(self) -> List[Tuple[str, str]]:
        """The user's own playlists as ``(id, name)``."""
        ...

    def playlist_track_ids(self, playlist_id: str) -> Optional[List[int]]:
        """The track ids already in a playlist, or None when that cannot be told."""
        ...


def _tracks(n: int) -> str:
    return f"{n:,} track{'' if n == 1 else 's'}"


def _refuses_the_track(error: BaseException) -> bool:
    """True when Beatport answered and refused this track, not the account.

    A 404 for an id it does not have, or a 400, says nothing about the next
    track, so it neither stops a push nor counts toward the failures in a row
    that do.
    """
    if not isinstance(error, BeatportAPIError):
        return False
    status = error.status_code
    return (
        isinstance(status, int)
        and 400 <= status < 500
        and status not in _ACCOUNT_STATUSES
    )


@dataclass(frozen=True)
class PlaylistPush:
    """What a push will do, decided before its job exists.

    Attributes:
        name: The playlist's name.
        track_ids: The tracks to add, in the order asked.
        skipped_owned: Tracks left out because the library owns them.
        include_owned: Whether owned tracks were asked for.
        playlist_id: An existing playlist of the user's to add to instead of
            creating one; ``None`` creates a new playlist named ``name``.
    """

    name: str
    track_ids: Tuple[int, ...]
    skipped_owned: Tuple[int, ...] = ()
    include_owned: bool = False
    playlist_id: Optional[str] = None

    @property
    def requested(self) -> int:
        """Tracks the caller asked for."""
        return len(self.track_ids) + len(self.skipped_owned)

    def to_dict(self) -> Dict[str, Any]:
        """The plan, as a caller shows it."""
        return {
            "name": self.name,
            "requested": self.requested,
            "to_add": len(self.track_ids),
            "skipped_owned": len(self.skipped_owned),
            "include_owned": self.include_owned,
            "existing_playlist": self.playlist_id is not None,
        }


@dataclass(frozen=True)
class BeatportPlaylistResult:
    """What one push did.

    Attributes:
        name: The playlist's name.
        requested: Tracks asked for.
        skipped_owned: Tracks skipped because the library owns them.
        to_add: Tracks the push set out to add.
        added: Tracks Beatport added.
        failed_track_ids: Tracks Beatport would not add, in order.
        playlist_id: The playlist's id, once it was created.
        playlist_url: Its page on www.beatport.com, once it was created.
        cancelled: True when it stopped because it was asked to.
        error_class: DISCOVER-01's class of the failure that stopped it.
        error: Why it stopped, when it failed.
        existing_playlist: True when the tracks went to a playlist that was
            already the user's, not one this push made.
        already_in_playlist: Tracks left out because that playlist held them.
    """

    name: str
    requested: int
    skipped_owned: int
    to_add: int
    added: int = 0
    failed_track_ids: Tuple[int, ...] = ()
    playlist_id: Optional[str] = None
    playlist_url: Optional[str] = None
    cancelled: bool = False
    error_class: Optional[str] = None
    error: Optional[str] = None
    existing_playlist: bool = False
    already_in_playlist: int = 0

    @property
    def failed(self) -> int:
        """Tracks Beatport would not add."""
        return len(self.failed_track_ids)

    @property
    def not_attempted(self) -> int:
        """Tracks never asked about, because the push stopped first."""
        return self.to_add - self.added - self.failed

    @property
    def outcome(self) -> str:
        """``succeeded``, ``cancelled`` or ``failed``."""
        if self.error is not None:
            return OUTCOME_FAILED
        return OUTCOME_CANCELLED if self.cancelled else OUTCOME_SUCCEEDED

    def summary_line(self) -> str:
        """The activity feed's sentence."""
        name = f"“{self.name}”"
        if self.playlist_id is None:
            if self.cancelled:
                return f"Cancelled the Beatport playlist {name} before creating it"
            return f"Could not create the Beatport playlist {name}: {self.error}"
        line = (
            f"Added {self.added:,} of {_tracks(self.to_add)}"
            f" to the Beatport playlist {name}"
        )
        extras = []
        if self.failed:
            extras.append(f"{self.failed:,} failed")
        if self.skipped_owned:
            extras.append(f"{self.skipped_owned:,} owned skipped")
        if extras:
            line += " (" + ", ".join(extras) + ")"
        if self.error is not None:
            reason = (
                _STOPPED_BECAUSE.get(self.error_class, "Beatport could not be reached")
                if self.error_class is not None
                else self.error
            )
            return f"{line}; stopped because {reason}"
        if self.cancelled:
            return f"{line}; cancelled"
        return line

    def to_dict(self, id_limit: Optional[int] = None) -> Dict[str, Any]:
        """The job result, and with ``id_limit`` the activity event's detail."""
        failed_ids = list(self.failed_track_ids)
        if id_limit is not None:
            failed_ids = failed_ids[:id_limit]
        return {
            "outcome": self.outcome,
            "name": self.name,
            "playlist_id": self.playlist_id,
            "playlist_url": self.playlist_url,
            "requested": self.requested,
            "skipped_owned": self.skipped_owned,
            "to_add": self.to_add,
            "added": self.added,
            "failed": self.failed,
            "not_attempted": self.not_attempted,
            "failed_track_ids": failed_ids,
            "cancelled": self.cancelled,
            "error_class": self.error_class,
            "error": self.error,
            "existing_playlist": self.existing_playlist,
            "already_in_playlist": self.already_in_playlist,
        }


class BeatportPlaylistService(IBeatportPlaylistService):
    """Plans and runs pushes of Beatport tracks to a new Beatport playlist."""

    def __init__(
        self,
        catalog: IBeatportCatalogRepository,
        beatport: PlaylistWriter,
        activity_service: Optional[IActivityService] = None,
        config_service: Optional[Any] = None,
        *,
        max_consecutive_failures: int = MAX_CONSECUTIVE_FAILURES,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        if max_consecutive_failures < 1:
            raise ValueError("max_consecutive_failures must be at least 1")
        self._catalog = catalog
        self._beatport = beatport
        self._activity = activity_service
        self._config = config_service
        self._max_failures = max_consecutive_failures
        self._clock = clock

    def require_token(self) -> None:
        """Refuse, as ``no_token``, when no Beatport token is configured.

        Raises:
            BeatportAPIError: Classified ``no_token``.
        """
        self._beatport.require_token()

    # ------------------------------------------------------------- planning

    def plan(
        self,
        track_ids: Sequence[int],
        name: Optional[str] = None,
        include_owned: bool = False,
        playlist_id: Optional[str] = None,
    ) -> PlaylistPush:
        """What a push of ``track_ids`` will do.

        With ``playlist_id`` the tracks are added to that playlist of the
        user's own and none is created; ``name`` is then only what the result
        calls it.

        ``name`` defaults to inCrate's dated name (``incrate.playlist_name_format``,
        "short" as ``sep23`` or "iso"), in the user's own date.

        Raises:
            ValueError: If the ids, the name or ``include_owned`` are not ones
                this takes, or every track is owned and owned tracks were not
                asked for.
        """
        ids = requested_track_ids(track_ids, limit=MAX_PLAYLIST_TRACKS)
        if not isinstance(include_owned, bool):
            raise ValueError(f"include_owned is true or false, got {include_owned!r}")
        if playlist_id is not None and (
            not isinstance(playlist_id, str) or not _PLAYLIST_ID.match(playlist_id)
        ):
            raise ValueError("That is not a Beatport playlist id")
        title = self._name(name)
        owned = set() if include_owned else self._catalog.owned_among(ids)
        to_add = tuple(i for i in ids if i not in owned)
        skipped = tuple(i for i in ids if i in owned)
        if not to_add:
            raise ValueError(
                "Already in your library: "
                + ("that track" if len(ids) == 1 else f"all {_tracks(len(ids))}")
                + ". Include tracks already in your library to make the playlist anyway"
            )
        return PlaylistPush(
            name=title,
            track_ids=to_add,
            skipped_owned=skipped,
            include_owned=include_owned,
            playlist_id=playlist_id,
        )

    def my_playlists(self) -> List[Dict[str, str]]:
        """The user's own Beatport playlists, for choosing one to add to.

        Raises:
            BeatportAPIError: As the client does, so a caller can say why.
        """
        return [
            {"id": playlist_id, "name": name}
            for playlist_id, name in self._beatport.my_playlists()
        ]

    def default_name(self) -> str:
        """The name a push given none would take today.

        inCrate's dated name, in the format ``incrate.playlist_name_format``
        configures and the user's own date: what a push dialog offers before
        anyone types (DISCOVER-10).
        """
        return default_playlist_name(self._name_format(), local_date(self._clock()))

    def _name(self, name: Optional[str]) -> str:
        if name is None or (isinstance(name, str) and not name.strip()):
            return self.default_name()
        if not isinstance(name, str):
            raise ValueError(f"A playlist name is text, got {type(name).__name__}")
        text = " ".join(name.split())
        if len(text) > MAX_PLAYLIST_NAME_LENGTH:
            raise ValueError(
                f"A playlist name is at most {MAX_PLAYLIST_NAME_LENGTH} characters"
            )
        return text

    def _name_format(self) -> str:
        if self._config is None:
            return "short"
        try:
            value = self._config.get(NAME_FORMAT_KEY)
        except Exception:  # noqa: BLE001 — a broken config falls back to the default
            return "short"
        return value if value in _NAME_FORMATS else "short"

    # -------------------------------------------------------------- pushing

    def push(
        self,
        plan: PlaylistPush,
        *,
        on_progress: Optional[Callable[[str, int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> BeatportPlaylistResult:
        """Create the playlist and add the plan's tracks, in order.

        ``should_cancel`` is asked before creating the playlist and before
        each track; ``on_progress`` is told ``(stage, done, total)``. The
        activity feed gets one event whatever the outcome. A failure is
        returned, not raised.
        """
        total = len(plan.track_ids)
        start = BeatportPlaylistResult(
            name=plan.name,
            requested=plan.requested,
            skipped_owned=len(plan.skipped_owned),
            to_add=total,
            existing_playlist=plan.playlist_id is not None,
        )

        def report(stage: str, done: int) -> None:
            if on_progress is not None:
                on_progress(stage, done, total)

        def cancelled() -> bool:
            return should_cancel is not None and bool(should_cancel())

        report(STAGE_CREATING, 0)
        if cancelled():
            return self._record(replace(start, cancelled=True))
        playlist_id: Optional[str] = plan.playlist_id
        try:
            if playlist_id is None:
                playlist_id = self._beatport.create_playlist(plan.name)
        except Exception as exc:  # noqa: BLE001 — classified and reported
            kind = classify_beatport_error(exc)
            _logger.warning("[beatport] playlist create failed (%s): %s", kind, exc)
            return self._record(
                replace(
                    start,
                    error_class=kind,
                    error=_CREATE_REFUSED.get(
                        kind, f"Beatport could not be reached: {exc}"
                    ),
                )
            )
        if playlist_id is None:
            return self._record(
                replace(start, error="Beatport did not say which playlist it created")
            )
        url = self._beatport.playlist_url(playlist_id)
        added = 0
        failed: List[int] = []
        in_a_row = 0
        stopped_by: Optional[str] = None
        stopped_with: Optional[str] = None
        was_cancelled = False
        track_ids = plan.track_ids
        already = 0
        if plan.playlist_id is not None:
            # An existing playlist: what it holds is read first, so no track is added twice.
            try:
                held = self._beatport.playlist_track_ids(plan.playlist_id)
            except Exception as exc:  # noqa: BLE001 — classified and reported
                kind = classify_beatport_error(exc)
                return self._record(
                    replace(
                        start,
                        playlist_id=playlist_id,
                        playlist_url=url,
                        error_class=kind,
                        error=f"Beatport would not say what is in that playlist: {exc}",
                    )
                )
            if held is None:
                return self._record(
                    replace(
                        start,
                        playlist_id=playlist_id,
                        playlist_url=url,
                        error="Beatport did not say what is in that playlist, so nothing was added",
                    )
                )
            have = set(held)
            track_ids = tuple(t for t in plan.track_ids if t not in have)
            already = len(plan.track_ids) - len(track_ids)
            start = replace(start, to_add=len(track_ids), already_in_playlist=already)
            total = len(track_ids)
        report(STAGE_ADDING, 0)
        for track_id in track_ids:
            if cancelled():
                was_cancelled = True
                break
            try:
                self._beatport.add_track_to_playlist(playlist_id, track_id)
            except Exception as exc:  # noqa: BLE001 — classified and reported
                failed.append(track_id)
                kind = classify_beatport_error(exc)
                _logger.warning(
                    "[beatport] adding track %s to a playlist failed (%s): %s",
                    track_id,
                    kind,
                    exc,
                )
                if _refuses_the_track(exc):
                    in_a_row = 0
                else:
                    in_a_row += 1
                    if (
                        kind in REPEATING_ERROR_CLASSES
                        or in_a_row >= self._max_failures
                    ):
                        stopped_by, stopped_with = kind, str(exc)
                        report(STAGE_ADDING, added + len(failed))
                        break
            else:
                added += 1
                in_a_row = 0
            report(STAGE_ADDING, added + len(failed))
        return self._record(
            replace(
                start,
                added=added,
                failed_track_ids=tuple(failed),
                playlist_id=playlist_id,
                playlist_url=url,
                cancelled=was_cancelled,
                error_class=stopped_by,
                error=stopped_with,
            )
        )

    def _record(self, result: BeatportPlaylistResult) -> BeatportPlaylistResult:
        if self._activity is not None:
            try:
                self._activity.record_event(
                    EVENT_PLAYLIST_PUSHED,
                    result.summary_line(),
                    result.to_dict(id_limit=EVENT_ID_LIMIT),
                )
            except Exception as exc:  # noqa: BLE001 — the feed is best-effort
                _logger.debug("[activity] could not record the playlist push: %s", exc)
        return result
