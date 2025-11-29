"""
Data models.

Contains track, result, playlist, and configuration models with validation and serialization.
"""

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.compat import (
    beatport_candidate_from_old,
    track_from_rbtrack,
    track_result_from_old,
    track_result_to_old,
)
from cuepoint.models.config_models import (
    AppConfig,
    BeatportConfig,
    CacheConfig,
    ExportConfig,
    LoggingConfig,
    MatchingConfig,
    ProcessingConfig,
    UIConfig,
)
from cuepoint.models.playlist import Playlist
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track

__all__ = [
    # Track models
    "Track",
    "BeatportCandidate",
    "Playlist",
    "TrackResult",
    # Configuration models
    "AppConfig",
    "BeatportConfig",
    "CacheConfig",
    "ExportConfig",
    "LoggingConfig",
    "MatchingConfig",
    "ProcessingConfig",
    "UIConfig",
    # Compatibility helpers
    "track_from_rbtrack",
    "beatport_candidate_from_old",
    "track_result_from_old",
    "track_result_to_old",
]
