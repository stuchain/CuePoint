#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Model serialization utilities.

Provides JSON serialization/deserialization for data models.
"""

import json
from pathlib import Path
from typing import Any, List

from cuepoint.models.playlist import Playlist
from cuepoint.models.result import TrackResult


def serialize_result(result: TrackResult) -> str:
    """Serialize result to JSON string.

    Args:
        result: TrackResult to serialize.

    Returns:
        JSON string representation.
    """
    return json.dumps(result.to_dict(), indent=2)


def deserialize_result(json_str: str) -> TrackResult:
    """Deserialize result from JSON string.

    Args:
        json_str: JSON string to deserialize.

    Returns:
        TrackResult instance.
    """
    data = json.loads(json_str)
    return TrackResult.from_dict(data)


def save_results_to_json(results: List[TrackResult], filepath: Path) -> None:
    """Save results to JSON file.

    Args:
        results: List of TrackResult instances.
        filepath: Path to JSON file.

    Raises:
        IOError: If file cannot be written.
    """
    data = [r.to_dict() for r in results]
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_results_from_json(filepath: Path) -> List[TrackResult]:
    """Load results from JSON file.

    Args:
        filepath: Path to JSON file.

    Returns:
        List of TrackResult instances.

    Raises:
        IOError: If file cannot be read.
        json.JSONDecodeError: If file is not valid JSON.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("JSON file must contain a list of results")

    return [TrackResult.from_dict(item) for item in data]


def serialize_playlist(playlist: Playlist) -> str:
    """Serialize playlist to JSON string.

    Args:
        playlist: Playlist to serialize.

    Returns:
        JSON string representation.
    """
    return json.dumps(playlist.to_dict(), indent=2)


def deserialize_playlist(json_str: str) -> Playlist:
    """Deserialize playlist from JSON string.

    Args:
        json_str: JSON string to deserialize.

    Returns:
        Playlist instance.
    """
    data = json.loads(json_str)
    return Playlist.from_dict(data)


def save_playlist_to_json(playlist: Playlist, filepath: Path) -> None:
    """Save playlist to JSON file.

    Args:
        playlist: Playlist instance.
        filepath: Path to JSON file.

    Raises:
        IOError: If file cannot be written.
    """
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(playlist.to_dict(), f, indent=2, ensure_ascii=False)


def load_playlist_from_json(filepath: Path) -> Playlist:
    """Load playlist from JSON file.

    Args:
        filepath: Path to JSON file.

    Returns:
        Playlist instance.

    Raises:
        IOError: If file cannot be read.
        json.JSONDecodeError: If file is not valid JSON.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    return Playlist.from_dict(data)

