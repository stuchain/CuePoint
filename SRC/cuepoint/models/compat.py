#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Compatibility helpers for migrating from old to new data models.

This module provides conversion functions to bridge old and new model implementations,
enabling gradual migration without breaking changes.
"""

from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:
    from cuepoint.data.beatport import BeatportCandidate as OldBeatportCandidate
    from cuepoint.data.rekordbox import RBTrack
    from cuepoint.ui.gui_interface import TrackResult as OldTrackResult

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track


def track_from_rbtrack(rbtrack: "RBTrack") -> Track:
    """Convert RBTrack to Track model.

    Args:
        rbtrack: Rekordbox track from XML parsing.

    Returns:
        Track instance with data from RBTrack.

    Example:
        >>> from cuepoint.data.rekordbox import RBTrack
        >>> rb = RBTrack(track_id="123", title="Test", artists="Artist")
        >>> track = track_from_rbtrack(rb)
        >>> track.title == "Test"
        True
        >>> track.artist == "Artist"
        True
    """
    # Handle empty artist field - try to extract from title, or use default
    artist = rbtrack.artists.strip() if rbtrack.artists else ""
    
    # If artist is still empty, try to extract from title
    if not artist:
        from cuepoint.data.rekordbox import extract_artists_from_title
        extracted = extract_artists_from_title(rbtrack.title)
        if extracted:
            artist = extracted[0]  # Use extracted artist
    
    # If still empty, use a default value to satisfy validation
    if not artist:
        artist = "Unknown Artist"
    
    return Track(
        title=rbtrack.title,
        artist=artist,
        track_id=rbtrack.track_id,
    )


def beatport_candidate_from_old(old: "OldBeatportCandidate") -> BeatportCandidate:
    # Lazy import to avoid circular dependency
    from cuepoint.data.beatport import BeatportCandidate as OldBeatportCandidate
    """Convert old BeatportCandidate to new model.

    Args:
        old: Old BeatportCandidate from cuepoint.data.beatport.

    Returns:
        New BeatportCandidate instance with validation.

    Raises:
        ValueError: If validation fails (e.g., empty URL, invalid scores).

    Example:
        >>> from cuepoint.data.beatport import BeatportCandidate as Old
        >>> old = Old(url="https://beatport.com/track/test/123", ...)
        >>> new = beatport_candidate_from_old(old)
        >>> new.url == old.url
        True
    """
    return BeatportCandidate(
        url=old.url,
        title=old.title,
        artists=old.artists,
        key=old.key,
        release_year=old.release_year,
        bpm=old.bpm,
        label=old.label,
        genre=old.genres,  # Note: old uses "genres", new uses "genre"
        release_name=old.release_name,
        release_date=old.release_date,
        score=old.score,
        title_sim=old.title_sim,
        artist_sim=old.artist_sim,
        query_index=old.query_index,
        query_text=old.query_text,
        candidate_index=old.candidate_index,
        base_score=old.base_score,
        bonus_year=old.bonus_year,
        bonus_key=old.bonus_key,
        guard_ok=old.guard_ok,
        reject_reason=old.reject_reason,
        elapsed_ms=old.elapsed_ms,
        is_winner=old.is_winner,
    )


def track_result_from_old(old: "OldTrackResult") -> TrackResult:
    # Lazy import to avoid circular dependency
    from cuepoint.ui.gui_interface import TrackResult as OldTrackResult
    """Convert old TrackResult to new model.

    This function handles the conversion of the `candidates` field from
    `List[Dict[str, Any]]` to `List[BeatportCandidate]`, and preserves
    the original dict format in `candidates_data`.

    Args:
        old: Old TrackResult from cuepoint.ui.gui_interface.

    Returns:
        New TrackResult instance with validation.

    Example:
        >>> from cuepoint.ui.gui_interface import TrackResult as Old
        >>> old = Old(playlist_index=1, title="Test", artist="Artist", matched=True)
        >>> new = track_result_from_old(old)
        >>> new.title == old.title
        True
    """
    # Convert candidates from Dict to BeatportCandidate
    candidates: List[BeatportCandidate] = []
    if old.candidates:
        for cand_dict in old.candidates:
            # Try to convert if it's a dict, otherwise skip
            if isinstance(cand_dict, dict):
                # Handle field name differences:
                # 1. Old candidate dicts may use "candidate_url", "candidate_title", etc.
                # 2. Old uses "genres", new uses "genre"
                cand_data = {}
                
                # Map candidate_* fields to direct fields (processor.py format)
                field_mapping = {
                    "candidate_url": "url",
                    "candidate_title": "title",
                    "candidate_artists": "artists",
                    "candidate_key": "key",
                    "candidate_year": "release_year",
                    "candidate_bpm": "bpm",
                    "candidate_label": "label",
                    "candidate_genres": "genres",  # Will be converted to "genre" below
                    "candidate_release": "release_name",
                    "candidate_release_date": "release_date",
                    "final_score": "score",
                    "search_query_index": "query_index",
                    "search_query_text": "query_text",
                    "winner": "is_winner",
                }
                
                # Copy fields, mapping candidate_* to direct names
                for old_key, new_key in field_mapping.items():
                    if old_key in cand_dict:
                        cand_data[new_key] = cand_dict[old_key]
                
                # Also copy direct fields if they exist (processor_service.py format)
                # Only copy if not already set from mapping
                direct_fields = [
                    "url", "title", "artists", "key", "release_year", "bpm", "label",
                    "genres", "release_name", "release_date", "score", "title_sim",
                    "artist_sim", "query_index", "query_text", "candidate_index",
                    "base_score", "bonus_year", "bonus_key", "guard_ok", "reject_reason",
                    "elapsed_ms", "is_winner",
                ]
                for field in direct_fields:
                    if field in cand_dict and field not in cand_data:
                        cand_data[field] = cand_dict[field]
                
                # Handle genres -> genre conversion
                if "genres" in cand_data and "genre" not in cand_data:
                    cand_data["genre"] = cand_data.pop("genres")
                
                # Handle string conversions for numeric fields
                if "title_sim" in cand_data and isinstance(cand_data["title_sim"], str):
                    try:
                        cand_data["title_sim"] = int(cand_data["title_sim"])
                    except (ValueError, TypeError):
                        cand_data["title_sim"] = 0
                
                if "artist_sim" in cand_data and isinstance(cand_data["artist_sim"], str):
                    try:
                        cand_data["artist_sim"] = int(cand_data["artist_sim"])
                    except (ValueError, TypeError):
                        cand_data["artist_sim"] = 0
                
                if "score" in cand_data and isinstance(cand_data["score"], str):
                    try:
                        cand_data["score"] = float(cand_data["score"])
                    except (ValueError, TypeError):
                        cand_data["score"] = 0.0
                
                if "base_score" in cand_data and isinstance(cand_data["base_score"], str):
                    try:
                        cand_data["base_score"] = float(cand_data["base_score"])
                    except (ValueError, TypeError):
                        cand_data["base_score"] = 0.0
                
                # Handle guard_ok conversion (Y/N -> bool)
                if "guard_ok" in cand_data:
                    if isinstance(cand_data["guard_ok"], str):
                        cand_data["guard_ok"] = cand_data["guard_ok"].upper() in ("Y", "TRUE", "1", "YES")
                    elif not isinstance(cand_data["guard_ok"], bool):
                        cand_data["guard_ok"] = bool(cand_data["guard_ok"])
                
                # Handle is_winner conversion (Y/N -> bool)
                if "winner" in cand_dict and "is_winner" not in cand_data:
                    cand_data["is_winner"] = str(cand_dict.get("winner", "")).upper() in ("Y", "TRUE", "1", "YES")
                elif "is_winner" in cand_data and isinstance(cand_data["is_winner"], str):
                    cand_data["is_winner"] = cand_data["is_winner"].upper() in ("Y", "TRUE", "1", "YES")
                
                # Ensure all required fields have defaults
                required_fields = {
                    "url": "",
                    "title": "",
                    "artists": "",
                    "label": None,
                    "release_date": None,
                    "bpm": None,
                    "key": None,
                    "genre": None,
                    "score": 0.0,
                    "title_sim": 0,
                    "artist_sim": 0,
                    "query_index": 0,
                    "query_text": "",
                    "candidate_index": 0,
                    "base_score": 0.0,
                    "bonus_year": 0,
                    "bonus_key": 0,
                    "guard_ok": False,
                    "reject_reason": "",
                    "elapsed_ms": 0,
                    "is_winner": False,
                }
                
                # Fill in missing required fields (but don't overwrite existing values)
                for key, default_value in required_fields.items():
                    if key not in cand_data:
                        cand_data[key] = default_value
                
                # Convert numeric fields
                if "query_index" in cand_data and isinstance(cand_data["query_index"], str):
                    try:
                        cand_data["query_index"] = int(cand_data["query_index"])
                    except (ValueError, TypeError):
                        cand_data["query_index"] = 0
                
                if "candidate_index" in cand_data and isinstance(cand_data["candidate_index"], str):
                    try:
                        cand_data["candidate_index"] = int(cand_data["candidate_index"])
                    except (ValueError, TypeError):
                        cand_data["candidate_index"] = 0
                
                if "bonus_year" in cand_data and isinstance(cand_data["bonus_year"], str):
                    try:
                        cand_data["bonus_year"] = int(cand_data["bonus_year"])
                    except (ValueError, TypeError):
                        cand_data["bonus_year"] = 0
                
                if "bonus_key" in cand_data and isinstance(cand_data["bonus_key"], str):
                    try:
                        cand_data["bonus_key"] = int(cand_data["bonus_key"])
                    except (ValueError, TypeError):
                        cand_data["bonus_key"] = 0
                
                if "elapsed_ms" in cand_data and isinstance(cand_data["elapsed_ms"], str):
                    try:
                        cand_data["elapsed_ms"] = int(cand_data["elapsed_ms"])
                    except (ValueError, TypeError):
                        cand_data["elapsed_ms"] = 0
                
                # Skip if URL is empty or missing (validation will fail)
                url_value = cand_data.get("url")
                if not url_value or (isinstance(url_value, str) and not url_value.strip()):
                    continue
                
                # Try to create from dict
                # This will raise ValueError if validation fails
                try:
                    candidate = BeatportCandidate.from_dict(cand_data)
                    candidates.append(candidate)
                except (ValueError, KeyError, TypeError) as e:
                    # Skip invalid candidates - log would be helpful but we don't have logger here
                    # In production, this should be logged
                    pass

    return TrackResult(
        playlist_index=old.playlist_index,
        title=old.title,
        artist=old.artist,
        matched=old.matched,
        candidates=candidates,  # Pass the converted BeatportCandidate list
        beatport_url=old.beatport_url,
        beatport_title=old.beatport_title,
        beatport_artists=old.beatport_artists,
        beatport_key=old.beatport_key,
        beatport_key_camelot=old.beatport_key_camelot,
        beatport_year=old.beatport_year,
        beatport_bpm=old.beatport_bpm,
        beatport_label=old.beatport_label,
        beatport_genres=old.beatport_genres,
        beatport_release=old.beatport_release,
        beatport_release_date=old.beatport_release_date,
        beatport_track_id=old.beatport_track_id,
        match_score=old.match_score,
        title_sim=old.title_sim,
        artist_sim=old.artist_sim,
        confidence=old.confidence,
        search_query_index=old.search_query_index,
        search_stop_query_index=old.search_stop_query_index,
        candidate_index=old.candidate_index,
        candidates_data=old.candidates,  # Keep original dict format for backward compatibility
        queries_data=old.queries,
    )


def track_result_to_old(new: TrackResult) -> "OldTrackResult":
    # Lazy import to avoid circular dependency
    from cuepoint.ui.gui_interface import TrackResult as OldTrackResult
    """Convert new TrackResult back to old model (for backward compatibility).

    This is useful when you need to pass a TrackResult to code that still
    expects the old model format.

    Args:
        new: New TrackResult from cuepoint.models.result.

    Returns:
        Old TrackResult instance.

    Example:
        >>> from cuepoint.models.result import TrackResult
        >>> new = TrackResult(playlist_index=1, title="Test", artist="Artist", matched=True)
        >>> old = track_result_to_old(new)
        >>> old.title == new.title
        True
    """
    # Convert candidates from BeatportCandidate to Dict
    candidates_dict: List[dict] = []
    if new.candidates:
        candidates_dict = [c.to_dict() for c in new.candidates]
    elif new.candidates_data:
        # Use candidates_data if available (preserves original format)
        candidates_dict = new.candidates_data

    return OldTrackResult(
        playlist_index=new.playlist_index,
        title=new.title,
        artist=new.artist,
        matched=new.matched,
        beatport_url=new.beatport_url,
        beatport_title=new.beatport_title,
        beatport_artists=new.beatport_artists,
        beatport_key=new.beatport_key,
        beatport_key_camelot=new.beatport_key_camelot,
        beatport_year=new.beatport_year,
        beatport_bpm=new.beatport_bpm,
        beatport_label=new.beatport_label,
        beatport_genres=new.beatport_genres,
        beatport_release=new.beatport_release,
        beatport_release_date=new.beatport_release_date,
        beatport_track_id=new.beatport_track_id,
        match_score=new.match_score,
        title_sim=new.title_sim,
        artist_sim=new.artist_sim,
        confidence=new.confidence,
        search_query_index=new.search_query_index,
        search_stop_query_index=new.search_stop_query_index,
        candidate_index=new.candidate_index,
        candidates=candidates_dict,
        queries=new.queries_data if new.queries_data else [],
    )

