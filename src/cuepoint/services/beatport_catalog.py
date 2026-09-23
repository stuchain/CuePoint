"""Parsers for Beatport v4 catalog responses (DISCOVER-01).

Every catalog response is untrusted input. These functions read one
documented shape each — see ``src/tests/fixtures/beatport_v4/README.md`` for
where each shape comes from — keep every id Discover needs, bound every string
and list they keep, and answer None for anything they cannot use rather than
guessing. Nothing here does I/O; :class:`~cuepoint.services.beatport_api.BeatportApi`
makes the requests.

The older parsers in ``beatport_api.py`` try several nestings for each answer.
They stay as they are for inCrate and retire with it in DISCOVER-12; nothing
new copies them.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.incrate.beatport_api_models import (
    CatalogArtist,
    CatalogLabel,
    CatalogTrack,
)
from cuepoint.services.override_values import NOTATION_CLASSIC, format_key, parse_key

#: Longest string kept from a catalog response.
MAX_TEXT_LENGTH = 500
#: Most artists (or remixers) kept on one track.
MAX_CREDITS = 50

BEATPORT_WEB_BASE = "https://www.beatport.com"
BEATPORT_WEB_TRACK_BASE = f"{BEATPORT_WEB_BASE}/track"

_ISO_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def catalog_text(value: Any) -> str:
    """A catalog string, stripped and bounded; anything else is empty."""
    if not isinstance(value, str):
        return ""
    return value.strip()[:MAX_TEXT_LENGTH]


def _optional_text(value: Any) -> Optional[str]:
    return catalog_text(value) or None


def positive_id(value: Any) -> Optional[int]:
    """A catalog id: a positive integer, or the digits of one."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.strip().isdigit():
        number = int(value.strip())
        return number if number > 0 else None
    return None


def _iso_date(value: Any) -> Optional[str]:
    """``YYYY-MM-DD`` from a date or datetime string, or None."""
    match = _ISO_DATE_RE.match(catalog_text(value))
    return match.group(1) if match else None


def _bpm(value: Any) -> Optional[float]:
    """A tempo Beatport stated, or None for a missing or impossible one."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    tempo = float(value)
    if not 0 < tempo < 1000:
        return None
    return tempo


def _object(value: Any) -> Dict[str, Any]:
    """``value`` when it is a JSON object, otherwise an empty one."""
    return value if isinstance(value, dict) else {}


def catalog_key(value: Any) -> Optional[str]:
    """Beatport's key object in classic notation, or None.

    The Camelot number and letter are read first, being structured; the
    display name ("Eb Minor", "F# Major") is the fallback. Both go through
    :func:`parse_key`, the one reader of key spellings in CuePoint.
    """
    key = _object(value)
    number = key.get("camelot_number")
    letter = catalog_text(key.get("camelot_letter"))
    parsed = None
    if isinstance(number, int) and not isinstance(number, bool) and letter:
        parsed = parse_key(f"{number}{letter}")
    if parsed is None:
        name = catalog_text(key.get("name"))
        parsed = parse_key(name) if name else None
    if parsed is None:
        return None
    return format_key(parsed[0], parsed[1], NOTATION_CLASSIC)


def parse_catalog_artist(obj: Any) -> Optional[CatalogArtist]:
    """A ``catalog/artists/{id}/`` object, or an artist on a track."""
    artist = _object(obj)
    artist_id = positive_id(artist.get("id"))
    name = catalog_text(artist.get("name"))
    if artist_id is None or not name:
        return None
    return CatalogArtist(id=artist_id, name=name)


def parse_catalog_label(obj: Any) -> Optional[CatalogLabel]:
    """A ``catalog/labels/{id}/`` object, or the label on a release."""
    label = _object(obj)
    label_id = positive_id(label.get("id"))
    name = catalog_text(label.get("name"))
    if label_id is None or not name:
        return None
    return CatalogLabel(id=label_id, name=name)


def _catalog_artists(value: Any) -> Tuple[CatalogArtist, ...]:
    if not isinstance(value, list):
        return ()
    found = (parse_catalog_artist(item) for item in value[:MAX_CREDITS])
    return tuple(artist for artist in found if artist is not None)


def track_web_url(track_id: int, slug: Any = None) -> str:
    """The www.beatport.com page of a track.

    A slug that is not plain lowercase words and hyphens is replaced by
    ``t``: the page is found by its id, and the slug is only decoration.
    """
    slug_text = catalog_text(slug).lower()
    slug_part = slug_text if _SLUG_RE.match(slug_text) else "t"
    return f"{BEATPORT_WEB_TRACK_BASE}/{slug_part}/{int(track_id)}"


def parse_catalog_track(obj: Any) -> Optional[CatalogTrack]:
    """A ``catalog/tracks/{id}/`` object, or one item of a track listing.

    None when it has no usable id or name. Every other field may be missing
    and is then None, never a guess. The label is the release's; the date is
    the store's release date, falling back to the publish date.
    """
    track = _object(obj)
    track_id = positive_id(track.get("id"))
    title = catalog_text(track.get("name"))
    if track_id is None or not title:
        return None
    release = _object(track.get("release"))
    label = parse_catalog_label(release.get("label"))
    genre = _object(track.get("genre"))
    return CatalogTrack(
        id=track_id,
        title=title,
        mix_name=catalog_text(track.get("mix_name")),
        url=track_web_url(track_id, track.get("slug")),
        artists=_catalog_artists(track.get("artists")),
        remixers=_catalog_artists(track.get("remixers")),
        label_id=label.id if label else None,
        label_name=label.name if label else None,
        release_id=positive_id(release.get("id")),
        release_name=_optional_text(release.get("name")),
        release_date=_iso_date(track.get("new_release_date"))
        or _iso_date(track.get("publish_date")),
        bpm=_bpm(track.get("bpm")),
        key=catalog_key(track.get("key")),
        genre_id=positive_id(genre.get("id")),
        genre_name=_optional_text(genre.get("name")),
    )


def page_items(data: Any) -> Tuple[List[Dict[str, Any]], bool]:
    """The items of one page of a v4 listing, and whether another follows.

    The shape is ``{"count", "next", "previous", "page", "per_page",
    "results"}``; ``next`` is null on the last page. ``page`` is not read: it
    is a string such as ``"1/4"``, and ``next`` says everything needed.
    """
    page = _object(data)
    results = page.get("results")
    if not isinstance(results, list):
        return [], False
    items = [item for item in results if isinstance(item, dict)]
    return items, bool(page.get("next"))


def chart_owner_name(obj: Any) -> str:
    """The name of a v4 chart's curator, from its ``person`` object."""
    return catalog_text(_object(_object(obj).get("person")).get("owner_name"))
