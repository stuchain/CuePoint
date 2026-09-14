#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What makes two tracks look like the same recording, as text (CLEAN-08, DEC-074).

The text signal groups tracks whose artist, title and mix say the same thing and
whose lengths agree within two seconds. Everything here is a pure function of a
track's own fields, so a key can be tested without a library and recomputed
identically on every scan.

Why the matcher's normalization, and not all of it
--------------------------------------------------
DEC-074 asks for the normalization matching already uses, so that two tracks
the matcher would call the same are grouped the same. Artists go through
``split_artists``, which is the matcher's own ``normalize_text`` per name, and
the order they are listed in stops mattering.

A title cannot go through ``normalize_text`` whole. That function deliberately
throws mix words away — "Track (Extended Mix)" becomes ``track`` — because the
matcher scores the mix separately. For identity that is exactly wrong: the
Extended and the Original of a record are two tracks a DJ owns on purpose.
``_parse_mix_flags`` was measured as the alternative and does not keep enough
either: for "Track - CamelPhat Remix" it reports a remix with no remixer, so two
different remixes would share a key.

So a title is split into a **base** and a set of **mix phrases**:

- every bracketed phrase is a mix phrase, except a featured-artist credit and
  "Original Mix", which say nothing about the recording;
- a trailing " - …" segment is a mix phrase when the matcher's ``MIX_PATTERNS``
  recognize it, which keeps "Artist - Title" styles in the base;
- what is left is the base.

Both keep their words. A phrase that is not really a mix — "(Part 2)",
"(Live)" — therefore stays part of the key rather than being thrown away, and
the one way this can err is by *not* grouping two tracks, never by grouping two
that differ. That is the direction DEC-074's risk points: a false group is what
a user has to dismiss.
"""

from __future__ import annotations

import html
import re
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from cuepoint.core.mix_parser import MIX_PATTERNS
from cuepoint.core.text_processing import _strip_accents, split_artists

#: Tracks whose lengths differ by at most this many seconds from a group's
#: shortest can be the same recording (DEC-074). Rekordbox stores whole seconds.
DURATION_TOLERANCE_SECONDS = 2

#: Separates the parts of a key. Normalized text never contains it.
KEY_SEPARATOR = "|"

_BRACKETED = re.compile(r"\(([^()]*)\)|\[([^\[\]]*)\]")
_DASH_SEGMENT = re.compile(r"\s+[-–—‐]\s+")
_FEATURING = re.compile(r"^(feat\.?|ft\.?|featuring)(\s|$)")
_TRAILING_FEATURING = re.compile(r"\s+(feat\.?|ft\.|featuring)(\s.*)?$")
_ORIGINAL = re.compile(r"^original( mix)?$")
_NOT_WORD = re.compile(r"[^a-z0-9&/\s]+")
_SPACES = re.compile(r"\s+")


def _plain(text: str) -> str:
    """Lower-case words: accents, entities, dashes and punctuation gone.

    The first steps of ``normalize_text`` without its mix-word removal, which
    is the part identity cannot afford.
    """
    value = _strip_accents(html.unescape(text or "")).lower()
    value = value.replace("—", " ").replace("–", " ").replace("‐", " ")
    value = value.replace("-", " ")
    value = _NOT_WORD.sub(" ", value)
    return _SPACES.sub(" ", value).strip()


def _names_a_mix(phrase: str) -> bool:
    """True when the matcher's mix vocabulary recognizes ``phrase``."""
    words = _plain(phrase)
    return any(pattern.search(words) for pattern in MIX_PATTERNS.values())


def artist_key(artist: Optional[str]) -> str:
    """The artists, normalized as the matcher does, in a fixed order.

    "B, A & C feat. D" and "A & B, C feat. D" are the same artists.
    """
    return " & ".join(sorted(set(split_artists(artist or ""))))


def title_parts(title: Optional[str]) -> Tuple[str, str]:
    """Split a title into its normalized base and its mix phrases.

    Returns:
        ``(base, mix)``. ``mix`` is the phrases, normalized, de-duplicated and
        sorted, joined by ``+``; empty for a plain title or an Original Mix.
    """
    text = html.unescape(title or "")
    phrases: List[str] = []

    def take(match: "re.Match[str]") -> str:
        phrases.append(match.group(1) if match.group(1) is not None else match.group(2))
        return " "

    text = _BRACKETED.sub(take, text)

    segments = _DASH_SEGMENT.split(text)
    while len(segments) > 1 and _names_a_mix(segments[-1]):
        phrases.append(segments.pop())
    base = _plain(_TRAILING_FEATURING.sub("", " - ".join(segments)))

    mixes = set()
    for phrase in phrases:
        words = _plain(phrase)
        if not words or _FEATURING.match(words) or _ORIGINAL.match(words):
            continue
        mixes.add(words)
    return base, "+".join(sorted(mixes))


def text_key(artist: Optional[str], title: Optional[str]) -> Optional[str]:
    """The key two tracks share when their artist, title and mix agree.

    None when there is not enough to say: no artist, or no title once the mix
    phrases are taken out. Grouping every untitled track by an unknown artist
    would be a group of guesses.
    """
    artists = artist_key(artist)
    base, mix = title_parts(title)
    if not artists or not base:
        return None
    return KEY_SEPARATOR.join((artists, base, mix))


def duration_clusters(
    members: Iterable[Tuple[int, int]],
    tolerance: int = DURATION_TOLERANCE_SECONDS,
) -> List[Tuple[int, Tuple[int, ...]]]:
    """Split tracks sharing a key into clusters of lengths close to the shortest.

    Each cluster starts at the shortest track not yet placed and takes every
    track at most ``tolerance`` seconds longer. Measured from the shortest
    rather than chained from neighbour to neighbour, so a run of tracks a
    second apart cannot stretch one group across a minute.

    Args:
        members: ``(track_id, duration_seconds)`` pairs.

    Returns:
        ``(shortest duration, track ids)`` for every cluster, in length order,
        ids sorted. Clusters of one are included; the caller decides what a
        group needs.
    """
    ordered = sorted((int(duration), int(track_id)) for track_id, duration in members)
    clusters: List[Tuple[int, Tuple[int, ...]]] = []
    index = 0
    while index < len(ordered):
        shortest = ordered[index][0]
        ids: List[int] = []
        while index < len(ordered) and ordered[index][0] - shortest <= tolerance:
            ids.append(ordered[index][1])
            index += 1
        clusters.append((shortest, tuple(sorted(ids))))
    return clusters


def text_groups(
    rows: Iterable[Tuple[int, Optional[str], Optional[str], Optional[int]]],
    tolerance: int = DURATION_TOLERANCE_SECONDS,
) -> Dict[str, Tuple[int, ...]]:
    """Group ``(track_id, artist, title, duration)`` rows by the text signal.

    A track with no length cannot be held to the two-second rule, so it is
    not grouped by text; the path and Beatport signals still see it.

    Returns:
        ``{group key: track ids}`` for every group of two or more. The key is
        the text key and the cluster's shortest length, so two recordings with
        the same name and different lengths are two groups.
    """
    by_key: Dict[str, List[Tuple[int, int]]] = {}
    for track_id, artist, title, duration in rows:
        if duration is None or int(duration) <= 0:
            continue
        key = text_key(artist, title)
        if key is None:
            continue
        by_key.setdefault(key, []).append((int(track_id), int(duration)))
    groups: Dict[str, Tuple[int, ...]] = {}
    for key, members in by_key.items():
        if len(members) < 2:
            continue
        for shortest, ids in duration_clusters(members, tolerance):
            if len(ids) >= 2:
                groups[f"{key}{KEY_SEPARATOR}{shortest}"] = ids
    return groups


__all__: Sequence[str] = (
    "DURATION_TOLERANCE_SECONDS",
    "KEY_SEPARATOR",
    "artist_key",
    "duration_clusters",
    "text_groups",
    "text_key",
    "title_parts",
)
