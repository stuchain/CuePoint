"""Data models for Beatport API responses (Phase 2). Normalized in-memory shapes for charts and labels."""

from dataclasses import dataclass
from typing import List, Optional


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
