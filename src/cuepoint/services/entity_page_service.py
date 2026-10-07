#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Artist and Label pages' data (DISCOVER-07, DEC-094, DEC-095).

A page is named by a reference, ``bp:<id>`` or ``name:<key>`` (DEC-095), and
this service answers three questions about it. None of them writes to the
library, and only the Beatport half asks Beatport anything.

What does the reference name? (:meth:`EntityPageService.resolve`)
-----------------------------------------------------------------
A name's key is folded with DISCOVER-03's ``name_key``, so "Âme", "AME" and
"ame" are one page. A name resolution has since linked to one Beatport artist,
and a label linked to the Beatport label most of its resolved tracks are on,
**redirect** to that id: DEC-095's last implication, one page for a name group
and the id it turned out to be. A name linked to several Beatport artists does
not: it is several artists, and the page lists them. The links are
``track_credit_repository``'s, the ones an id's library half reads, so a name
redirects exactly when the id's page gathers its tracks.

What does the library hold? (:meth:`EntityPageService.page`)
------------------------------------------------------------
A rule set — ``artist_name``/``label_name is <name>`` for a name,
``beatport_artist``/``beatport_label is <id>`` for an id — that the renderer
passes to the Library's browse unchanged (DEC-023, DEC-040), and a header read
from the Library's own count and facets over the same rules: the tracks, the
years they span, their genres, and an artist's labels or a label's artists. So
the header and the table under it cannot disagree.

What does Beatport have? (:meth:`EntityPageService.beatport`)
--------------------------------------------------------------
For an id, the artist's or label's tracks released in the last
:data:`RECENT_DAYS` days, read whole through DISCOVER-01's listing and kept in
the catalog cache with a record of when (``beatport_listings``). The page reads
them back from the cache while that record is younger than
:data:`LISTING_MAX_AGE`, so reopening a page costs no request. Each track is
marked owned (DEC-092) and on the wantlist or not.

For a name, it depends on the kind. A **label** is looked up by name, through
DISCOVER-05's lookup cache and its rule for trusting it, and the page says it
was "found by name on Beatport". An **artist** is not: a name search for an
artist finds whoever else shares the name, which is the wrong answer DEC-095
exists to avoid, so the page is ``name_only`` and offers the resolve job when
some of the name's tracks are matched and not resolved yet.

Every answer carries a state (DEC-098): ``ok``; ``name_only`` with its reason;
or DISCOVER-01's error class — ``no_token``, ``rejected``, ``forbidden``,
``rate_limited``, ``unavailable`` — with what the page can offer.

What the API cannot give
------------------------
DISCOVER-01's recording found no listing of charts by artist or by label
(``catalog/charts/?artist_id=`` is not a filter), so a page offers recent
tracks and no charts, DEC-094's own fallback.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Protocol, Tuple

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION, name_key
from cuepoint.services.beatport_api_models import CatalogTrack
from cuepoint.models.beatport_cache import (
    ENTITY_ARTIST,
    ENTITY_LABEL,
    BeatportNameLookup,
)
from cuepoint.models.beatport_listing import BeatportListing
from cuepoint.models.discovery_run import OWNED_ALL, OWNED_FILTERS
from cuepoint.models.entity_page import (
    ACTION_RESOLVE,
    ACTION_SETTINGS,
    MAX_ENTITY_WINDOW,
    MAX_NAME_KEY_LENGTH,
    REASON_NOT_ON_BEATPORT,
    REASON_NOT_RESOLVED,
    REASON_SHARED,
    STATE_FORBIDDEN,
    STATE_NAME_ONLY,
    STATE_NO_TOKEN,
    STATE_OK,
    STATE_RATE_LIMITED,
    STATE_REJECTED,
    STATE_UNAVAILABLE,
    EntityBeatportHalf,
    EntityLibrarySummary,
    EntityPage,
    EntityRef,
    EntityResolution,
    LinkedEntity,
    LinkedName,
    parse_entity_ref,
)
from cuepoint.models.filter_rule import OP_IS, FilterRule, RuleSet
from cuepoint.services.beatport_api_client import (
    BeatportAPIError,
    classify_beatport_error,
)
from cuepoint.services.beatport_catalog import positive_id
from cuepoint.services.discovery_service import local_date, lookup_is_current
from cuepoint.services.interfaces import (
    IBeatportCatalogRepository,
    IDiscoveryRepository,
    IEntityPageService,
    ILibraryService,
    ITrackCreditRepository,
    IWantlistRepository,
)

_logger = logging.getLogger(__name__)

#: How many days of releases a page's Beatport half shows. An artist releases a
#: few times a year, so a quarter is often empty; a label releases weekly, so a
#: year would reach the listing's page cap (``MAX_LISTING_PAGES``) for a busy
#: one while a quarter stays well inside it.
RECENT_DAYS: Dict[str, int] = {ENTITY_ARTIST: 365, ENTITY_LABEL: 90}

#: How long a listing read from Beatport is shown without asking again.
#: Beatport publishes releases through the day, so a page reopened the same
#: morning costs nothing, and one reopened that evening is read again; a
#: ``refresh`` asks at once.
LISTING_MAX_AGE = timedelta(hours=12)

#: How many genres, labels or artists the header lists, most common first.
SUMMARY_TOP_VALUES = 5

#: The rule field each kind of page scopes the Library by, per identity.
NAME_FIELDS = {ENTITY_ARTIST: "artist_name", ENTITY_LABEL: "label_name"}
ID_FIELDS = {ENTITY_ARTIST: "beatport_artist", ENTITY_LABEL: "beatport_label"}

#: The facet a header lists beside the genres: an artist's labels, a label's
#: artists.
RELATED_FIELDS = {ENTITY_ARTIST: "label_name", ENTITY_LABEL: "artist_name"}

#: What each refusal says, and what the page can offer for it.
_REFUSALS: Dict[str, Tuple[str, Optional[str]]] = {
    STATE_NO_TOKEN: (
        "No Beatport token is set, so CuePoint cannot read Beatport",
        ACTION_SETTINGS,
    ),
    STATE_REJECTED: ("Beatport rejected the token", ACTION_SETTINGS),
    STATE_FORBIDDEN: (
        "The Beatport token is not allowed to read the catalog",
        ACTION_SETTINGS,
    ),
    STATE_RATE_LIMITED: (
        "Beatport asked CuePoint to slow down; try again shortly",
        None,
    ),
    STATE_UNAVAILABLE: ("Beatport could not be reached", None),
}

_NOUN = {ENTITY_ARTIST: "artist", ENTITY_LABEL: "label"}


class EntitySource(Protocol):
    """What a page needs from ``BeatportApi`` (DISCOVER-01)."""

    def require_token(self) -> None:
        """Raise a ``no_token`` ``BeatportAPIError`` when there is no token."""
        ...

    def artist_tracks(
        self, artist_id: int, since: Any, until: Any = None
    ) -> List[CatalogTrack]:
        """An artist's tracks released in a window, newest first."""
        ...

    def label_tracks(
        self, label_id: int, since: Any, until: Any = None
    ) -> List[CatalogTrack]:
        """A label's tracks released in a window, newest first."""
        ...

    def search_label_by_name(self, name: str) -> Optional[int]:
        """A label's Beatport id by name, or None."""
        ...


def _count(n: int, one: str, many: str) -> str:
    return f"{n:,} {one if n == 1 else many}"


class EntityPageService(IEntityPageService):
    """Resolves Artist and Label pages and reads both of their halves."""

    def __init__(
        self,
        credits: ITrackCreditRepository,
        catalog: IBeatportCatalogRepository,
        lookups: IDiscoveryRepository,
        wantlist: IWantlistRepository,
        library: ILibraryService,
        beatport: EntitySource,
        *,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._credits = credits
        self._catalog = catalog
        self._lookups = lookups
        self._wantlist = wantlist
        self._library = library
        self._beatport = beatport
        self._clock = clock

    # ------------------------------------------------------------ references

    def reference(self, kind: str, token: str) -> EntityRef:
        """Read a reference, with a name folded to its key.

        Raises:
            ValueError: If the kind is not ``artist`` or ``label``, or the
                reference is not ``bp:<id>`` or ``name:<key>`` with a value.
        """
        if isinstance(token, str) and len(token) > MAX_NAME_KEY_LENGTH + 16:
            raise ValueError("A reference that long names nothing")
        ref = parse_entity_ref(kind, token)
        if ref.name_key is None:
            return ref
        key = name_key(ref.name_key)
        if not key:
            raise ValueError(f"A name reference carries a name, got {token!r}")
        return EntityRef(kind=ref.kind, name_key=key)

    def _follow(
        self, kind: str, token: str
    ) -> Tuple[EntityRef, EntityRef, Tuple[LinkedEntity, ...]]:
        """``(requested, ref, links)``: a reference, followed to its id if linked."""
        requested = self.reference(kind, token)
        key = requested.name_key
        if key is None:
            return requested, requested, ()
        if kind == ENTITY_ARTIST:
            links = tuple(
                LinkedEntity(beatport_id=i, name=n, tracks=t)
                for i, n, t in self._credits.artist_links(key)
            )
            if len(links) == 1:
                return requested, EntityRef(kind, beatport_id=links[0].beatport_id), ()
            return requested, requested, links
        labels = self._credits.label_links(key)
        if labels:
            return requested, EntityRef(kind, beatport_id=labels[0][0]), ()
        return requested, requested, ()

    def resolve(self, kind: str, token: str) -> EntityResolution:
        """What a reference names, and the rule set its library half is.

        Raises:
            ValueError: As :meth:`reference` does.
        """
        requested, ref, links = self._follow(kind, token)
        if ref.beatport_id is not None:
            names = tuple(
                LinkedName(name_key=k, name=n, tracks=t)
                for k, n, t in self._credits.linked_names(kind, ref.beatport_id)
            )
            name = self._catalog.entity_name(kind, ref.beatport_id) or (
                names[0].name if names else None
            )
            rules = RuleSet(
                rules=(FilterRule(ID_FIELDS[kind], OP_IS, ref.beatport_id),)
            ).validated()
            return EntityResolution(
                ref=ref, requested=requested, name=name, rules=rules, names=names
            )
        key = str(ref.name_key)
        name = self._credits.library_name(kind, key)
        rules = RuleSet(
            rules=(FilterRule(NAME_FIELDS[kind], OP_IS, name or key),)
        ).validated()
        return EntityResolution(
            ref=ref, requested=requested, name=name, rules=rules, links=links
        )

    # ---------------------------------------------------------- library half

    def page(self, kind: str, token: str) -> EntityPage:
        """A reference resolved, with its library half's header.

        Every fact is the Library's own answer over the resolution's rules:
        the count ``browse`` gives, the ``year`` range and the ``genre`` and
        related facets, so a number on the header is the table's.

        Raises:
            ValueError: As :meth:`reference` does.
        """
        resolution = self.resolve(kind, token)
        rules = resolution.rules
        span = self._library.facet_range("year", rules=rules)
        summary = EntityLibrarySummary(
            tracks=self._library.browse_count(rules=rules),
            first_year=None if span.minimum is None else int(span.minimum),
            last_year=None if span.maximum is None else int(span.maximum),
            genres=self._library.facet("genre", rules=rules, limit=SUMMARY_TOP_VALUES),
            related=self._library.facet(
                RELATED_FIELDS[kind], rules=rules, limit=SUMMARY_TOP_VALUES
            ),
            index_current=self._credits.is_current(ENTITY_NAMES_VERSION),
        )
        return EntityPage(resolution=resolution, library=summary)

    # --------------------------------------------------------- Beatport half

    def beatport(
        self,
        kind: str,
        token: str,
        *,
        refresh: bool = False,
        owned: str = OWNED_ALL,
        offset: int = 0,
        limit: int = 100,
    ) -> EntityBeatportHalf:
        """A page's recent Beatport tracks, or the state that stands in for them.

        A refusal from Beatport is an answer, not an error: it comes back as
        the half's state. ``refresh`` reads the listing again however fresh it
        is.

        Raises:
            ValueError: As :meth:`reference` does, or if the owned filter or the
                window is not one a page answers. Checked before Beatport is
                asked anything.
        """
        if owned not in OWNED_FILTERS:
            raise ValueError(f"owned must be one of {OWNED_FILTERS}, got {owned!r}")
        if not 1 <= int(limit) <= MAX_ENTITY_WINDOW or int(offset) < 0:
            raise ValueError(
                f"A window is 1 to {MAX_ENTITY_WINDOW} tracks from offset 0 or later"
            )
        _, ref, links = self._follow(kind, token)
        now = self._clock()
        today = local_date(now)
        since = (today - timedelta(days=RECENT_DAYS[kind])).isoformat()
        until = today.isoformat()
        window: Dict[str, Any] = {"since": since, "until": until}

        beatport_id = ref.beatport_id
        found_by_name = False
        resolvable = 0
        if ref.name_key is not None:
            key = ref.name_key
            resolvable = self._credits.unresolved_owned(kind, key)
            if kind == ENTITY_ARTIST:
                return self._name_only(
                    ref,
                    REASON_SHARED if links else REASON_NOT_RESOLVED,
                    resolvable,
                    shared=len(links),
                )
            lookup = self._lookups.lookups(ENTITY_LABEL, [key]).get(key)
            if lookup is not None and lookup_is_current(lookup, now):
                beatport_id = lookup.beatport_id
            else:
                try:
                    self._beatport.require_token()
                    found = self._beatport.search_label_by_name(
                        self._credits.library_name(kind, key) or key
                    )
                except BeatportAPIError as exc:
                    return self._refused(ref, exc, None, False, resolvable, window)
                beatport_id = positive_id(found)
                self._lookups.save_lookup(
                    BeatportNameLookup(
                        kind=ENTITY_LABEL,
                        name_key=key,
                        looked_up_at=now.isoformat(),
                        beatport_id=beatport_id,
                    )
                )
            if beatport_id is None:
                return self._name_only(ref, REASON_NOT_ON_BEATPORT, resolvable)
            found_by_name = True

        if beatport_id is None:  # pragma: no cover - every path above sets it
            raise ValueError(f"{ref.token!r} names no Beatport {_NOUN[kind]}")
        try:
            self._beatport.require_token()
        except BeatportAPIError as exc:
            return self._refused(
                ref, exc, beatport_id, found_by_name, resolvable, window
            )
        listing = self._catalog.listing(kind, beatport_id)
        fresh = (
            not refresh
            and listing is not None
            and listing.answers_for(since)
            and listing.fetched_at >= (now - LISTING_MAX_AGE).isoformat()
        )
        if fresh and listing is not None:
            fetched_at = listing.fetched_at
        else:
            read = (
                self._beatport.artist_tracks
                if kind == ENTITY_ARTIST
                else self._beatport.label_tracks
            )
            try:
                tracks = read(
                    beatport_id, today - timedelta(days=RECENT_DAYS[kind]), today
                )
            except BeatportAPIError as exc:
                return self._refused(
                    ref, exc, beatport_id, found_by_name, resolvable, window
                )
            fetched_at = now.isoformat()
            self._catalog.store_listing(
                BeatportListing(
                    kind=kind,
                    beatport_id=beatport_id,
                    since=since,
                    fetched_at=fetched_at,
                    tracks=len(tracks),
                ),
                tracks,
            )
        page = self._catalog.entity_tracks(
            kind, beatport_id, since, until, owned, int(offset), int(limit)
        )
        listed = self._wantlist.entries(
            [row.track.beatport_track_id for row in page.rows]
        )
        page = replace(
            page,
            rows=tuple(
                replace(row, on_wantlist=row.track.beatport_track_id in listed)
                for row in page.rows
            ),
        )
        released = (
            f"{_count(page.tracks, 'track', 'tracks')} released on Beatport"
            f" since {since}"
        )
        return EntityBeatportHalf(
            ref=ref,
            state=STATE_OK,
            message=(
                f"Found by name on Beatport; {released}" if found_by_name else released
            ),
            beatport_id=beatport_id,
            found_by_name=found_by_name,
            since=since,
            until=until,
            fetched_at=fetched_at,
            from_cache=bool(fresh),
            page=page,
            resolvable=resolvable,
        )

    def _name_only(
        self, ref: EntityRef, reason: str, resolvable: int, *, shared: int = 0
    ) -> EntityBeatportHalf:
        """The Beatport half of a page CuePoint knows only by name."""
        noun = _NOUN[ref.kind]
        action: Optional[str] = None
        if reason == REASON_SHARED:
            message = (
                f"{shared} Beatport {noun}s share this name; choose one to see"
                " their releases"
            )
        elif reason == REASON_NOT_ON_BEATPORT:
            message = f"Beatport has no {noun} by this name"
        elif resolvable:
            message = (
                f"CuePoint knows this {noun} only by name. Resolving"
                f" {_count(resolvable, 'matched track', 'matched tracks')}"
                " will find them on Beatport"
            )
            action = ACTION_RESOLVE
        else:
            message = (
                f"CuePoint knows this {noun} only by name, and none of these"
                " tracks is matched to Beatport, so it cannot tell which"
                f" Beatport {noun} this is"
            )
        if reason == REASON_NOT_ON_BEATPORT and resolvable:
            action = ACTION_RESOLVE
        return EntityBeatportHalf(
            ref=ref,
            state=STATE_NAME_ONLY,
            message=message,
            action=action,
            reason=reason,
            resolvable=resolvable,
        )

    def _refused(
        self,
        ref: EntityRef,
        error: BeatportAPIError,
        beatport_id: Optional[int],
        found_by_name: bool,
        resolvable: int,
        window: Dict[str, Any],
    ) -> EntityBeatportHalf:
        """The Beatport half when Beatport, or the lack of a token, said no."""
        state = classify_beatport_error(error)
        message, action = _REFUSALS[state]
        _logger.info(
            "[discover] %s page %s: Beatport refused (%s): %s",
            ref.kind,
            ref.token,
            state,
            error,
        )
        retry_after = getattr(error, "retry_after", None)
        return EntityBeatportHalf(
            ref=ref,
            state=state,
            message=message,
            action=action,
            beatport_id=beatport_id,
            found_by_name=found_by_name,
            since=window["since"],
            until=window["until"],
            resolvable=resolvable,
            retry_after=(
                float(retry_after)
                if state == STATE_RATE_LIMITED and retry_after is not None
                else None
            ),
        )


__all__ = [
    "ID_FIELDS",
    "LISTING_MAX_AGE",
    "NAME_FIELDS",
    "RECENT_DAYS",
    "RELATED_FIELDS",
    "SUMMARY_TOP_VALUES",
    "EntityPageService",
    "EntitySource",
]
