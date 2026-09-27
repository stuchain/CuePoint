#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A library track's artists and label, as links to their pages (DISCOVER-11).

The Inspector draws a track's artist credit as one link per artist and its
label as a link, each opening that artist's or label's page (DEC-094). Which
artists a credit names is DISCOVER-03's rule, ``split_credit``, and which page
each opens is DEC-095's: the Beatport id where CuePoint knows it, the name's
key where it does not. Both are business rules, so the renderer is handed the
answer rather than a second copy of either.

**Split here, not read from the credit index.** ``track_credits`` holds the
same split, but only once DISCOVER-03's index is built; a track read while it
is still building would have no links at all. Splitting the one credit being
shown costs nothing and is always the current rule.

**A resolved track links by id.** Its accepted Beatport track says who it is
by and which label it is on (``track_identity``), so a name Beatport credits
under the same key links to that artist's id, and the label to the label's.
A name Beatport does not credit on the track, or a track not resolved, links
by name, and the name's page follows it to an id if resolution has linked it
since (DISCOVER-07).
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from cuepoint.core.entity_names import name_key, split_credit
from cuepoint.models.beatport_cache import ENTITY_ARTIST, ENTITY_LABEL
from cuepoint.models.entity_page import (
    MAX_NAME_KEY_LENGTH,
    CreditLink,
    EntityRef,
    TrackCreditLinks,
)
from cuepoint.models.track_credit import ROLE_ARTIST, ROLE_REMIXER
from cuepoint.services.interfaces import ITrackCreditRepository


def _ref(kind: str, key: str, beatport_id: Optional[int]) -> Optional[EntityRef]:
    """The page a name opens, or None when a key is too long to be a reference."""
    if beatport_id is not None:
        return EntityRef(kind, beatport_id=beatport_id)
    if not key or len(key) > MAX_NAME_KEY_LENGTH:
        return None
    return EntityRef(kind, name_key=key)


def _artists(
    credit: Optional[str], role: str, ids: Dict[str, int]
) -> Tuple[CreditLink, ...]:
    links: List[CreditLink] = []
    for name in split_credit(credit or ""):
        key = name_key(name)
        ref = _ref(ENTITY_ARTIST, key, ids.get(key))
        if ref is not None:
            links.append(CreditLink(name=name, ref=ref, role=role))
    return tuple(links)


def track_credit_links(
    credits: ITrackCreditRepository,
    track_id: int,
    artist: Optional[str],
    remixer: Optional[str],
    label: Optional[str],
) -> TrackCreditLinks:
    """The links for one track's artist and remixer credits and its label.

    Args:
        credits: The name index's repository, for the track's Beatport identity.
        track_id: The library track.
        artist: Its artist credit, as the Inspector shows it.
        remixer: Its remixer credit.
        label: Its effective label (DEC-068): the override where there is one.
    """
    artist_ids, label_id = credits.track_identity(int(track_id))
    label_link: Optional[CreditLink] = None
    shown = (label or "").strip()
    if shown:
        ref = _ref(ENTITY_LABEL, name_key(shown), label_id)
        if ref is not None:
            label_link = CreditLink(name=shown, ref=ref)
    return TrackCreditLinks(
        artists=_artists(artist, ROLE_ARTIST, artist_ids),
        remixers=_artists(remixer, ROLE_REMIXER, artist_ids),
        label=label_link,
    )


__all__ = ["track_credit_links"]
