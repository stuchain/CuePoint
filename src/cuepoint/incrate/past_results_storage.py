"""Persist inCrate discovery results so users can access past runs."""

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.utils.paths import AppPaths

_logger = logging.getLogger(__name__)

MAX_SAVED_RUNS = 50


@dataclass
class PastDiscoveryRun:
    """One saved discovery run: metadata + tracks."""

    run_id: str
    timestamp: str  # ISO format
    genre_ids: List[int]
    artist_names: List[str]
    label_names: List[str]
    tracks: List[DiscoveredTrack]

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "timestamp": self.timestamp,
            "genre_ids": self.genre_ids,
            "artist_names": self.artist_names,
            "label_names": self.label_names,
            "tracks": [_track_to_dict(t) for t in self.tracks],
        }

    @staticmethod
    def from_dict(d: dict) -> "PastDiscoveryRun":
        tracks = [_dict_to_track(t) for t in d.get("tracks") or []]
        return PastDiscoveryRun(
            run_id=str(d.get("run_id", "")),
            timestamp=str(d.get("timestamp", "")),
            genre_ids=list(d.get("genre_ids") or []),
            artist_names=list(d.get("artist_names") or []),
            label_names=list(d.get("label_names") or []),
            tracks=tracks,
        )


def _track_to_dict(t: DiscoveredTrack) -> dict:
    return asdict(t)


def _dict_to_track(d: dict) -> DiscoveredTrack:
    return DiscoveredTrack(
        beatport_track_id=int(d.get("beatport_track_id", 0)),
        beatport_url=str(d.get("beatport_url", "")),
        title=str(d.get("title", "")),
        artists=str(d.get("artists", "")),
        source_type=str(d.get("source_type", "")),
        source_name=str(d.get("source_name", "")),
        source_label_name=d.get("source_label_name"),
        source_url=d.get("source_url"),
    )


def _path() -> Path:
    return AppPaths.data_dir() / "incrate_past_results.json"


def load_past_results() -> List[PastDiscoveryRun]:
    """Load all saved discovery runs (newest first in file; we return as-is or reversed so newest first)."""
    path = _path()
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        _logger.warning("inCrate past results: failed to load %s: %s", path, e)
        return []
    runs = []
    for item in data.get("runs") or []:
        try:
            runs.append(PastDiscoveryRun.from_dict(item))
        except Exception as e:
            _logger.debug("inCrate past results: skip invalid run: %s", e)
    return runs


def save_past_result(
    genre_ids: List[int],
    artist_names: List[str],
    label_names: List[str],
    tracks: List[DiscoveredTrack],
) -> Optional[PastDiscoveryRun]:
    """Append one run and trim to MAX_SAVED_RUNS. Returns the saved run."""
    if not tracks:
        return None
    run = PastDiscoveryRun(
        run_id=str(uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        genre_ids=list(genre_ids),
        artist_names=list(artist_names),
        label_names=list(label_names),
        tracks=list(tracks),
    )
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    runs = load_past_results()
    runs.insert(0, run)
    runs = runs[:MAX_SAVED_RUNS]
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"runs": [r.to_dict() for r in runs]}, f, indent=2)
    except Exception as e:
        _logger.warning("inCrate past results: failed to save %s: %s", path, e)
        return None
    return run
