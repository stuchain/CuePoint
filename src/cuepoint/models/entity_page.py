#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""An Artist or Label page's data (DISCOVER-07, DEC-094, DEC-095).

A page is about one artist or label, named by an :class:`EntityRef`: its
Beatport id when resolution knows it, otherwise its normalized name, and the
page says which (DEC-095). It has two halves.

- **The library half** is a rule set the renderer hands to the Library's own
  browse unchanged (DEC-023, DEC-040), as Health's counts are (CLEAN-11), and a
  header of facts read from the Library's own facets over that rule set
  (:class:`EntityLibrarySummary`), so a number in the header and the count of
  the table under it cannot disagree.
- **The Beatport half** (:class:`EntityBeatportHalf`) is the artist's or label's
  recent tracks on Beatport, each marked owned or not, and always a state: what
  it is when there is nothing to show says why (DEC-098).

References are written ``bp:<id>`` or ``name:<key>``, the form a page's route
carries. A model imports only from ``cuepoint.models``, so a name's key is
checked here for shape and folded by the service, through DISCOVER-03's
``name_key``, which is idempotent: a key that is already a key is unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.models.beatport_cache import (
    ENTITY_ARTIST,
    ENTITY_KINDS,
    ENTITY_LABEL,
    MAX_BEATPORT_ID,
    CachedBeatportTrack,
)
from cuepoint.models.filter_rule import Facet, RuleSet
from cuepoint.models.row_values import non_negative, one_of

#: The prefix of a reference by Beatport id: ``bp:1190547``.
REF_BEATPORT_PREFIX = "bp:"

#: The prefix of a reference by normalized name: ``name:ame``.
REF_NAME_PREFIX = "name:"

#: A page whose identity is a Beatport id.
IDENTITY_BEATPORT = "beatport"

#: A page whose identity is a name, a name-matched group (DEC-095).
IDENTITY_NAME = "name"

IDENTITIES = (IDENTITY_BEATPORT, IDENTITY_NAME)

#: The longest name key a reference carries. A key comes from a credit or a
#: label, which the catalog bounds at 500 characters; the bound keeps text
#: from outside the engine from growing a query without limit.
MAX_NAME_KEY_LENGTH = 1000

#: The largest window of the Beatport half's tracks answered at once: a run's
#: (DISCOVER-05).
MAX_ENTITY_WINDOW = 500

#: The Beatport half's states. ``ok`` has tracks to show; ``name_only`` is a
#: page CuePoint will not look up by name; the rest are DISCOVER-01's error
#: classes (``beatport_api_client.BEATPORT_ERROR_CLASSES``), which a model
#: cannot import and a test holds these to.
STATE_OK = "ok"
STATE_NO_TOKEN = "no_token"
STATE_REJECTED = "rejected"
STATE_FORBIDDEN = "forbidden"
STATE_RATE_LIMITED = "rate_limited"
STATE_UNAVAILABLE = "unavailable"
STATE_NAME_ONLY = "name_only"

BEATPORT_STATES = (
    STATE_OK,
    STATE_NO_TOKEN,
    STATE_REJECTED,
    STATE_FORBIDDEN,
    STATE_RATE_LIMITED,
    STATE_UNAVAILABLE,
    STATE_NAME_ONLY,
)

#: Why a page is ``name_only``. An artist is never looked up by name, because
#: a search finds whoever else shares it (DEC-095): until resolution links the
#: name it stays a name (``not_resolved``), and a name resolution linked to
#: several artists stays one too (``shared``). A label is looked up by name,
#: and Beatport can know no label called that (``not_on_beatport``).
REASON_NOT_RESOLVED = "not_resolved"
REASON_SHARED = "shared"
REASON_NOT_ON_BEATPORT = "not_on_beatport"

NAME_ONLY_REASONS = (REASON_NOT_RESOLVED, REASON_SHARED, REASON_NOT_ON_BEATPORT)

#: What a page can offer instead of tracks: Settings, for a token Beatport
#: will not take, or a resolve job (DISCOVER-04), for a name it could link.
ACTION_SETTINGS = "settings"
ACTION_RESOLVE = "resolve"

ACTIONS = (ACTION_SETTINGS, ACTION_RESOLVE)


def _beatport_id(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} is a whole number, got {value!r}")
    if not 0 < value <= MAX_BEATPORT_ID:
        raise ValueError(f"{name} is from 1 to {MAX_BEATPORT_ID}, got {value}")
    return int(value)


@dataclass(frozen=True)
class EntityRef:
    """An artist or a label, by Beatport id or by normalized name.

    Exactly one of :attr:`beatport_id` and :attr:`name_key` is set.
    """

    kind: str
    beatport_id: Optional[int] = None
    name_key: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the reference."""
        one_of(self.kind, ENTITY_KINDS, "kind")
        if (self.beatport_id is None) == (self.name_key is None):
            raise ValueError("A reference is a Beatport id or a name, not both")
        if self.beatport_id is not None:
            _beatport_id(self.beatport_id, "beatport_id")
        else:
            key = self.name_key
            if not isinstance(key, str) or not key.strip():
                raise ValueError("A name reference carries a name")
            if key != key.strip():
                raise ValueError("A name key has no surrounding space")
            if len(key) > MAX_NAME_KEY_LENGTH:
                raise ValueError(
                    f"A name key is at most {MAX_NAME_KEY_LENGTH} characters"
                )

    @property
    def identity(self) -> str:
        """``beatport`` or ``name``: what the page groups by (DEC-095)."""
        return IDENTITY_BEATPORT if self.beatport_id is not None else IDENTITY_NAME

    @property
    def token(self) -> str:
        """The reference as a route writes it: ``bp:<id>`` or ``name:<key>``."""
        if self.beatport_id is not None:
            return f"{REF_BEATPORT_PREFIX}{self.beatport_id}"
        return f"{REF_NAME_PREFIX}{self.name_key}"

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "kind": self.kind,
            "ref": self.token,
            "identity": self.identity,
            "beatport_id": self.beatport_id,
            "name_key": self.name_key,
        }


def parse_entity_ref(kind: str, token: Any) -> EntityRef:
    """Read a reference as a route writes it.

    ``bp:`` takes the plain decimal of an id, with no sign, space or leading
    zero, so one id has one spelling. ``name:`` takes the rest of the text,
    trimmed; the service folds it to a key.

    Raises:
        ValueError: If it is neither form, or its value is not one.
    """
    if not isinstance(token, str):
        raise ValueError(f"A reference is text, got {token!r}")
    text = token.strip()
    if text.startswith(REF_BEATPORT_PREFIX):
        digits = text[len(REF_BEATPORT_PREFIX) :]
        if not (digits.isascii() and digits.isdigit()) or digits.startswith("0"):
            raise ValueError(f"A Beatport reference is bp:<id>, got {token!r}")
        return EntityRef(kind=kind, beatport_id=int(digits))
    if text.startswith(REF_NAME_PREFIX):
        return EntityRef(kind=kind, name_key=text[len(REF_NAME_PREFIX) :].strip())
    raise ValueError(f"A reference is bp:<id> or name:<key>, got {token!r}")


@dataclass(frozen=True)
class LinkedEntity:
    """A Beatport artist or label a library name is linked to.

    Attributes:
        beatport_id: Its id.
        name: How Beatport spells it, when known.
        tracks: How many of the name's resolved library tracks it is on.
    """

    beatport_id: int
    name: Optional[str]
    tracks: int

    def __post_init__(self) -> None:
        """Validate the link."""
        _beatport_id(self.beatport_id, "beatport_id")
        object.__setattr__(self, "tracks", non_negative(self.tracks, "tracks"))

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API, with the reference a page links to."""
        return {
            "ref": f"{REF_BEATPORT_PREFIX}{self.beatport_id}",
            "beatport_id": self.beatport_id,
            "name": self.name,
            "tracks": self.tracks,
        }


@dataclass(frozen=True)
class LinkedName:
    """A library name whose unresolved tracks a Beatport id's page gathers.

    Attributes:
        name_key: The name's key.
        name: How the library spells it.
        tracks: How many library tracks carry it.
    """

    name_key: str
    name: str
    tracks: int

    def __post_init__(self) -> None:
        """Validate the name."""
        object.__setattr__(self, "tracks", non_negative(self.tracks, "tracks"))

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {"name_key": self.name_key, "name": self.name, "tracks": self.tracks}


@dataclass(frozen=True)
class EntityResolution:
    """What a reference names, and the rule set its library half is.

    Attributes:
        ref: The page's identity. A name resolution has since linked to one
            Beatport id is that id (DEC-095's last implication).
        requested: The reference asked for; :attr:`ref` unless it redirected.
        name: What to call the page: Beatport's spelling for an id, the
            library's for a name. ``None`` when neither knows it.
        links: For a name page, the Beatport artists resolution linked the
            name to: two or more who share it. A name linked to one id, and a
            label linked to any, redirects to that id, so a name page is left
            with none or several. Empty for an id page.
        names: For an id page, the library names whose unresolved tracks it
            gathers. Empty for a name page.
        rules: The library half, for the Library's browse as it is.
    """

    ref: EntityRef
    requested: EntityRef
    name: Optional[str]
    rules: RuleSet
    links: Tuple[LinkedEntity, ...] = ()
    names: Tuple[LinkedName, ...] = ()

    def __post_init__(self) -> None:
        """Validate the resolution."""
        if self.ref.kind != self.requested.kind:
            raise ValueError("A reference resolves to the same kind of page")
        if self.ref.identity == IDENTITY_BEATPORT and self.links:
            raise ValueError("An id page has no links; it is the link")
        if self.ref.identity == IDENTITY_NAME and self.names:
            raise ValueError("A name page gathers no other names")

    @property
    def redirected(self) -> bool:
        """True when the name asked for is now known by an id."""
        return self.ref != self.requested

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            **self.ref.to_dict(),
            "name": self.name,
            "redirected_from": self.requested.token if self.redirected else None,
            "links": [link.to_dict() for link in self.links],
            "names": [name.to_dict() for name in self.names],
            "rules": self.rules.to_dict(),
        }


@dataclass(frozen=True)
class EntityLibrarySummary:
    """The header's facts, each read from the Library over the page's rules.

    Attributes:
        tracks: How many library tracks the rule set selects: the table's count.
        first_year: The earliest year among them, or None.
        last_year: The latest, or None.
        genres: The ``genre`` facet, most common first.
        related: For an artist, the ``label_name`` facet — the labels they are
            on; for a label, the ``artist_name`` facet — its artists.
        index_current: False while DISCOVER-03's credit index is still being
            built, when a name page may be short (its second binding note).
    """

    tracks: int
    first_year: Optional[int]
    last_year: Optional[int]
    genres: Facet
    related: Facet
    index_current: bool = True

    def __post_init__(self) -> None:
        """Validate the facts."""
        object.__setattr__(self, "tracks", non_negative(self.tracks, "tracks"))
        if (
            self.first_year is not None
            and self.last_year is not None
            and self.first_year > self.last_year
        ):
            raise ValueError("The first year comes before the last")

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "tracks": self.tracks,
            "years": {"first": self.first_year, "last": self.last_year},
            "genres": self.genres.to_dict(),
            "related": self.related.to_dict(),
            "index_current": self.index_current,
        }


@dataclass(frozen=True)
class EntityPage:
    """A page's identity and its library half: what the ``entity`` route answers."""

    resolution: EntityResolution
    library: EntityLibrarySummary

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {**self.resolution.to_dict(), "library": self.library.to_dict()}


@dataclass(frozen=True)
class EntityTrackRow:
    """One Beatport track on a page's Beatport half, as it reads now.

    Attributes:
        track: The cached catalog track.
        artists: Its artists' names, in Beatport's order.
        remixers: Its remixers' names, in Beatport's order.
        owned: Whether the library owns it now (DEC-092).
        on_wantlist: Whether it is on the wantlist now (DISCOVER-06).
    """

    track: CachedBeatportTrack
    artists: Tuple[str, ...] = ()
    remixers: Tuple[str, ...] = ()
    owned: bool = False
    on_wantlist: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            **self.track.to_dict(),
            "artists": list(self.artists),
            "remixers": list(self.remixers),
            "owned": self.owned,
            "on_wantlist": self.on_wantlist,
        }


@dataclass(frozen=True)
class EntityTracksPage:
    """A window of the Beatport half's tracks, and its counts.

    Attributes:
        rows: The window, newest release first.
        total: Tracks under the owned filter; the window is a slice of these.
        tracks: Every track the listing holds.
        owned: How many of those the library owns now.
    """

    rows: Tuple[EntityTrackRow, ...]
    total: int
    tracks: int
    owned: int

    def __post_init__(self) -> None:
        """Validate the counts."""
        for name in ("total", "tracks", "owned"):
            object.__setattr__(self, name, non_negative(getattr(self, name), name))
        if self.owned > self.tracks or self.total > self.tracks:
            raise ValueError("A listing's counts cannot exceed its tracks")
        if len(self.rows) > self.total:
            raise ValueError("A window cannot hold more rows than its list")

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "rows": [row.to_dict() for row in self.rows],
            "total": self.total,
            "tracks": self.tracks,
            "owned": self.owned,
        }


@dataclass(frozen=True)
class EntityBeatportHalf:
    """What a page's Beatport half shows, and why when it shows nothing.

    Attributes:
        ref: The page's identity, as :class:`EntityResolution` resolved it.
        state: One of :data:`BEATPORT_STATES`.
        message: What happened, in a sentence.
        action: What the page can offer: :data:`ACTION_SETTINGS`,
            :data:`ACTION_RESOLVE`, or None.
        reason: For ``name_only``, one of :data:`NAME_ONLY_REASONS`.
        beatport_id: The Beatport id the tracks are for, when there is one.
        found_by_name: True when a label's id came from a name search rather
            than from resolution: the page says "found by name on Beatport".
        since: The first release day the tracks cover, ``YYYY-MM-DD``.
        until: The last.
        fetched_at: When the listing was read from Beatport.
        from_cache: True when this answer asked Beatport nothing.
        page: The tracks, for ``ok``; None otherwise.
        resolvable: For a name, how many of its tracks a resolve job could
            still identify (DISCOVER-04).
        retry_after: For ``rate_limited``, the seconds Beatport asked for.
    """

    ref: EntityRef
    state: str
    message: str
    action: Optional[str] = None
    reason: Optional[str] = None
    beatport_id: Optional[int] = None
    found_by_name: bool = False
    since: Optional[str] = None
    until: Optional[str] = None
    fetched_at: Optional[str] = None
    from_cache: bool = False
    page: Optional[EntityTracksPage] = None
    resolvable: int = 0
    retry_after: Optional[float] = None

    def __post_init__(self) -> None:
        """Validate the half."""
        one_of(self.state, BEATPORT_STATES, "state")
        if self.action is not None:
            one_of(self.action, ACTIONS, "action")
        if (self.state == STATE_OK) != (self.page is not None):
            raise ValueError("Tracks are shown exactly when the state is ok")
        if (self.state == STATE_NAME_ONLY) != (self.reason is not None):
            raise ValueError("A reason is given exactly for a name-only page")
        if self.reason is not None:
            one_of(self.reason, NAME_ONLY_REASONS, "reason")
        if self.state == STATE_OK and self.beatport_id is None:
            raise ValueError("Tracks are some Beatport artist's or label's")
        if self.beatport_id is not None:
            _beatport_id(self.beatport_id, "beatport_id")
        if not isinstance(self.message, str) or not self.message.strip():
            raise ValueError("Every state says what happened")
        object.__setattr__(
            self, "resolvable", non_negative(self.resolvable, "resolvable")
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "kind": self.ref.kind,
            "ref": self.ref.token,
            "state": self.state,
            "message": self.message,
            "action": self.action,
            "reason": self.reason,
            "beatport_id": self.beatport_id,
            "found_by_name": self.found_by_name,
            "since": self.since,
            "until": self.until,
            "fetched_at": self.fetched_at,
            "from_cache": self.from_cache,
            "page": None if self.page is None else self.page.to_dict(),
            "resolvable": self.resolvable,
            "retry_after": self.retry_after,
        }


__all__: List[str] = [
    "ACTIONS",
    "ACTION_RESOLVE",
    "ACTION_SETTINGS",
    "BEATPORT_STATES",
    "ENTITY_ARTIST",
    "ENTITY_LABEL",
    "EntityBeatportHalf",
    "EntityLibrarySummary",
    "EntityPage",
    "EntityRef",
    "EntityResolution",
    "EntityTrackRow",
    "EntityTracksPage",
    "IDENTITIES",
    "IDENTITY_BEATPORT",
    "IDENTITY_NAME",
    "LinkedEntity",
    "LinkedName",
    "MAX_ENTITY_WINDOW",
    "MAX_NAME_KEY_LENGTH",
    "NAME_ONLY_REASONS",
    "REASON_NOT_ON_BEATPORT",
    "REASON_NOT_RESOLVED",
    "REASON_SHARED",
    "REF_BEATPORT_PREFIX",
    "REF_NAME_PREFIX",
    "STATE_FORBIDDEN",
    "STATE_NAME_ONLY",
    "STATE_NO_TOKEN",
    "STATE_OK",
    "STATE_RATE_LIMITED",
    "STATE_REJECTED",
    "STATE_UNAVAILABLE",
    "parse_entity_ref",
]
