"""The Beatport catalog models Discover reads (DISCOVER-01).

They keep the ids the Discover phase needs — every artist, label, release and
genre id on a track — where inCrate's shapes flattened artists to a string and
dropped them. They moved here from ``incrate/`` when inCrate retired
(DISCOVER-12), beside ``beatport_api.py`` and ``beatport_catalog.py``, which
build them.
"""

from dataclasses import dataclass, field
from typing import Optional, Tuple


@dataclass(frozen=True)
class CatalogArtist:
    """A Beatport artist, by id.

    ``image_url`` is the artist's picture when Beatport named one (the recorded
    artist and track-credit objects both carry an ``image``); it is checked to be
    on Beatport's own hosts and never sent to the renderer. It is a picture, not
    an identity, so two credits of one artist are equal whatever picture they
    carry.
    """

    id: int
    name: str
    image_url: Optional[str] = field(default=None, compare=False)


@dataclass(frozen=True)
class CatalogLabel:
    """A Beatport label, by id; ``image_url`` as on :class:`CatalogArtist`."""

    id: int
    name: str
    image_url: Optional[str] = field(default=None, compare=False)


@dataclass(frozen=True)
class CatalogTrack:
    """A Beatport catalog track with every id Discover reads.

    ``url`` is the www.beatport.com page, never the API URL. ``key`` is in
    classic notation, converted from Beatport's own spelling, because every
    other key in CuePoint is classic or Camelot. ``release_date`` is
    ``YYYY-MM-DD``. ``sample_url`` is the audio preview on Beatport's sample
    host, kept only when it passes ``is_beatport_media_url``. Anything Beatport
    left out is None or empty, never guessed.
    """

    id: int
    title: str
    mix_name: str
    url: str
    artists: Tuple[CatalogArtist, ...]
    remixers: Tuple[CatalogArtist, ...]
    label_id: Optional[int]
    label_name: Optional[str]
    release_id: Optional[int]
    release_name: Optional[str]
    release_date: Optional[str]
    bpm: Optional[float]
    key: Optional[str]
    genre_id: Optional[int]
    genre_name: Optional[str]
    sample_url: Optional[str] = None
    #: The label's picture, from the release's own ``label`` object; a picture,
    #: not an identity, so it is left out of equality.
    label_image_url: Optional[str] = field(default=None, compare=False)


@dataclass(frozen=True)
class CatalogChart:
    """A Beatport chart as a v4 listing gives it (DISCOVER-05).

    ``artist`` is the Beatport artist who made it, when one did; ``owner_name``
    is the account that published it, which can be named differently
    (DISCOVER-01's recording). ``url`` is the www.beatport.com page.
    ``publish_date`` is ``YYYY-MM-DD``; ``genre_ids`` are the chart's genres.
    ``image_url`` is the chart's picture when Beatport named one.
    """

    id: int
    name: str
    url: str
    publish_date: Optional[str]
    artist: Optional[CatalogArtist]
    owner_name: Optional[str]
    genre_ids: Tuple[int, ...]
    track_count: Optional[int]
    image_url: Optional[str] = field(default=None, compare=False)


@dataclass
class Genre:
    """Beatport genre from API."""

    id: int
    name: str
    slug: str
