"""Data models for Beatport API responses (Phase 2). Normalized in-memory shapes for charts and labels.

The ``Catalog*`` models (DISCOVER-01) keep the ids the Discover phase needs —
every artist, label, release and genre id on a track — where the older shapes
flatten artists to a string and drop them. They live here until DISCOVER-12
retires inCrate and moves them beside ``services/beatport_api.py``.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass(frozen=True)
class CatalogArtist:
    """A Beatport artist, by id."""

    id: int
    name: str


@dataclass(frozen=True)
class CatalogLabel:
    """A Beatport label, by id."""

    id: int
    name: str


@dataclass(frozen=True)
class CatalogTrack:
    """A Beatport catalog track with every id Discover reads.

    ``url`` is the www.beatport.com page, never the API URL. ``key`` is in
    classic notation, converted from Beatport's own spelling, because every
    other key in CuePoint is classic or Camelot. ``release_date`` is
    ``YYYY-MM-DD``. Anything Beatport left out is None or empty, never guessed.
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


@dataclass
class Genre:
    """Beatport genre from API."""

    id: int
    name: str
    slug: str


@dataclass
class ChartSummary:
    """Chart list item: id, name, author, published date, track count."""

    id: int
    name: str
    genre_id: int
    genre_slug: str
    author_id: Optional[int]
    author_name: str
    published_date: str
    track_count: int


@dataclass
class ChartTrack:
    """Single track entry in a chart."""

    track_id: int
    title: str
    artists: str
    beatport_url: str
    position: int
    catalog: Optional[CatalogTrack] = None


@dataclass
class ChartDetail:
    """Full chart with tracks."""

    id: int
    name: str
    author_name: str
    published_date: str
    tracks: List[ChartTrack]


@dataclass
class LabelReleaseTrack:
    """Track on a label release."""

    track_id: int
    title: str
    artists: str
    beatport_url: str
    release_date: str
    catalog: Optional[CatalogTrack] = None


@dataclass
class LabelRelease:
    """Label release with tracks."""

    release_id: int
    title: str
    release_date: str
    tracks: List[LabelReleaseTrack]


@dataclass
class DiscoveredTrack:
    """Single track from discovery (charts or label releases). For Phase 4 playlist and UI."""

    beatport_track_id: int
    beatport_url: str
    title: str
    artists: str
    source_type: str  # "chart" | "label_release"
    source_name: str  # chart name or release title
    source_label_name: Optional[str] = (
        None  # label name when source_type is label_release
    )
    source_url: Optional[str] = None  # link to open (track page, release, or chart)
