#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Rekordbox XML parsing utilities.

This module provides data access functions for parsing Rekordbox XML export files.
It extracts track information and playlist definitions from the XML structure.

Key Functions:
    parse_rekordbox(): Main parser that extracts tracks and playlists from XML
    extract_artists_from_title(): Extracts artist names from title when artist
        field is empty

Data Classes:
    RBTrack: Represents a single track from Rekordbox with track_id, title, and artists

Example:
    >>> from cuepoint.data.rekordbox import parse_rekordbox
    >>> tracks, playlists = parse_rekordbox("collection.xml")
    >>> print(f"Found {len(tracks)} tracks and {len(playlists)} playlists")
    >>> for track_id, track in tracks.items():
    ...     print(f"{track.title} by {track.artists}")
"""

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from cuepoint.models.compat import track_from_rbtrack
from cuepoint.models.playlist import Playlist
from cuepoint.models.track import Track
from cuepoint.utils.errors import error_xml_parsing


@dataclass
class RBTrack:
    """Rekordbox track data structure.

    Represents a single track extracted from a Rekordbox XML export file.

    Attributes:
        track_id: Unique track ID from Rekordbox (string format).
        title: Track title (may contain prefixes like [F], [3]).
        artists: Artist string (may be empty if artist info is in title).
    """

    track_id: str
    title: str
    artists: str


def parse_rekordbox(xml_path: str) -> Dict[str, Playlist]:
    """
    Parse Rekordbox XML export file and extract playlists with tracks.

    Rekordbox XML structure:
    - COLLECTION: Contains all tracks
    - PLAYLISTS: Contains playlist definitions
    - Each playlist (NODE with Type="1") contains TRACK references

    Args:
        xml_path: Path to Rekordbox XML export file

    Returns:
        Dictionary mapping playlist name -> Playlist object.
        Each Playlist contains Track objects (converted from RBTrack).

    Raises:
        FileNotFoundError: If XML file doesn't exist
        ET.ParseError: If XML parsing fails

    Example:
        >>> playlists = parse_rekordbox("collection.xml")
        >>> print(f"Found {len(playlists)} playlists")
        >>> for name, playlist in playlists.items():
        ...     print(f"{name}: {playlist.get_track_count()} tracks")
    """
    # Check if file exists first
    import os

    if not os.path.exists(xml_path):
        raise FileNotFoundError(f"XML file not found: {xml_path}")

    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except ET.ParseError as e:
        # Try to get line number from error if available
        line_number = None
        if hasattr(e, "position"):
            # ElementTree ParseError position is (line, column)
            if isinstance(e.position, tuple) and len(e.position) > 0:
                line_number = e.position[0]
        elif hasattr(e, "lineno"):
            line_number = e.lineno

        # Create comprehensive error message and raise a custom exception
        # We'll format it but need to preserve the original error
        formatted_msg = error_xml_parsing(xml_path, e, line_number)
        # Create a new exception with formatted message but preserve original
        formatted_error = ET.ParseError(formatted_msg)
        formatted_error.__cause__ = e
        raise formatted_error from e
    except Exception as e:
        # Handle any other parsing-related exceptions
        if isinstance(e, (FileNotFoundError, ET.ParseError)):
            raise
        # For other exceptions, provide generic error
        formatted_msg = error_xml_parsing(xml_path, e, None)
        new_error = Exception(formatted_msg)
        new_error.__cause__ = e
        raise new_error from e

    # First, parse all tracks into RBTrack objects (for XML parsing)
    tracks_by_id: Dict[str, RBTrack] = {}
    playlist_data: Dict[str, List[str]] = {}  # Temporary: playlist name -> track IDs

    collection = root.find(".//COLLECTION")
    if collection is not None:
        for t in collection.findall("TRACK"):
            tid = t.get("TrackID") or t.get("ID") or t.get("Key") or ""
            title = t.get("Name") or t.get("Title") or ""
            artists = t.get("Artist") or t.get("Artists") or ""
            if tid and title:
                tracks_by_id[tid] = RBTrack(track_id=tid, title=title, artists=artists)

    # Parse playlist definitions (playlist name -> list of track IDs)
    playlists_root = root.find(".//PLAYLISTS")
    if playlists_root is not None:
        for node in playlists_root.findall(".//NODE"):
            typ = (node.get("Type") or node.get("type") or "").strip()
            if typ == "1":  # playlist
                pname = node.get("Name") or node.get("name") or "Unnamed Playlist"
                track_ids: List[str] = []
                for tr in node.findall("./TRACK"):
                    ref = tr.get("Key") or tr.get("TrackID") or tr.get("ID")
                    if ref:
                        track_ids.append(ref)
                # Always add playlist, even if empty (empty playlists are valid)
                playlist_data[pname] = track_ids

    # Convert to Playlist objects with Track objects
    playlists: Dict[str, Playlist] = {}
    for playlist_name, track_ids in playlist_data.items():
        # Convert RBTrack objects to Track objects and create Playlist
        tracks: List[Track] = []
        for idx, track_id in enumerate(track_ids, start=1):
            rbtrack = tracks_by_id.get(track_id)
            if rbtrack:
                # Convert RBTrack to Track
                track = track_from_rbtrack(rbtrack)
                # Set position in playlist
                track.position = idx
                tracks.append(track)

        # Create Playlist object
        playlist = Playlist(name=playlist_name, tracks=tracks)
        playlists[playlist_name] = playlist

    return playlists


def extract_artists_from_title(title: str) -> Optional[Tuple[str, str]]:
    """Extract artist names from title if title follows "Artists - Title" format.

    Some Rekordbox tracks have artist information embedded in the title field
    instead of the artist field. This function attempts to extract it by
    parsing common title formats.

    Args:
        title: Title string that may contain artist information. May include
            prefixes like [F], [3], or numeric prefixes that are stripped.

    Returns:
        Tuple of (artists, cleaned_title) if extraction successful, None otherwise.
        The cleaned_title has artist info, feat. clauses, and parentheses removed.

    Example:
        >>> extract_artists_from_title("John Smith - Never Sleep Again")
        ('John Smith', 'Never Sleep Again')
        >>> extract_artists_from_title("[F] Artist - Track (feat. Other)")
        ('Artist', 'Track')
        >>> extract_artists_from_title("Just a Title")
        None
    """
    if not title:
        return None
    t = title.strip()
    t = re.sub(r"^\s*(?:[\[(]?\d+[\])\.]?|\(F\))\s*[-–—:\s]\s*", "", t, flags=re.I)
    parts = re.split(r"\s*[-–—:]\s*", t, maxsplit=1)
    if len(parts) != 2:
        return None
    artists, rest = parts[0].strip(), parts[1].strip()
    rest = re.sub(r"\s*\((?:feat\.?|ft\.?|featuring)\s+[^\)]*\)", " ", rest, flags=re.I)
    rest = re.sub(r"\s*\[(?:feat\.?|ft\.?|featuring)\s+[^\]]*\]", " ", rest, flags=re.I)
    rest = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", rest)
    rest = re.sub(r"\s{2,}", " ", rest).strip()
    return (artists, rest) if (artists and rest) else None
