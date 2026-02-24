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

import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterator, List, Optional, Tuple

from cuepoint.core.mix_parser import _extract_remixer_names_from_title  # noqa: E402
from cuepoint.models.compat import track_from_rbtrack  # noqa: E402
from cuepoint.models.playlist import Playlist  # noqa: E402
from cuepoint.models.track import Track  # noqa: E402
from cuepoint.utils.errors import error_xml_parsing  # noqa: E402

_logger = logging.getLogger(__name__)

# Design 4.70: Cap XML file size to mitigate DoS (entity expansion, huge files)
MAX_XML_SIZE_BYTES = 100 * 1024 * 1024  # 100 MiB

# Report progress every N tracks during streaming parse (and on first track)
_PARSE_PROGRESS_INTERVAL = 100


def parse_collection(
    xml_path: str,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Iterator[Tuple[str, str, str, str, Optional[str]]]:
    """Yield (track_id, title, artist, remix_version, label) for each TRACK in COLLECTION.

    Uses streaming iterparse so the full tree is not loaded into memory; progress_callback
    is invoked with (parsed_count, -1) periodically (total -1 means unknown). Parses only
    the COLLECTION section; does not read PLAYLISTS.

    Args:
        xml_path: Path to Rekordbox XML export file.
        progress_callback: Optional callback(current_count, total). total=-1 during parse.

    Yields:
        Tuples of (track_id, title, artist, remix_version, label). label is None if missing.

    Raises:
        FileNotFoundError: If XML file does not exist.
        ValueError: If XML file exceeds MAX_XML_SIZE_BYTES.
        ET.ParseError: If XML parsing fails.
    """
    import os

    if not os.path.exists(xml_path):
        raise FileNotFoundError(f"XML file not found: {xml_path}")

    size = os.path.getsize(xml_path)
    if size > MAX_XML_SIZE_BYTES:
        raise ValueError(
            f"XML file too large: {size} bytes (max {MAX_XML_SIZE_BYTES}). "
            "Refusing to parse to prevent resource exhaustion."
        )

    in_collection = False
    parsed_count = 0
    _logger.info("inCrate import: starting streaming parse of %s", xml_path)

    def maybe_report() -> None:
        nonlocal parsed_count
        if progress_callback is None:
            return
        if parsed_count == 0:
            return
        if parsed_count == 1 or parsed_count % _PARSE_PROGRESS_INTERVAL == 0:
            _logger.info("inCrate import: parsing progress — %s tracks so far", parsed_count)
            progress_callback(parsed_count, -1)

    context = ET.iterparse(xml_path, events=("start", "end"))
    try:
        for event, elem in context:
            if event == "start":
                if elem.tag == "COLLECTION":
                    in_collection = True
                continue
            # event == "end"
            if elem.tag == "TRACK" and in_collection:
                tid = (elem.get("TrackID") or elem.get("ID") or elem.get("Key") or "").strip()
                if not tid:
                    _logger.debug(
                        "[reliability] Skipping TRACK with missing TrackID in %s",
                        xml_path,
                    )
                    elem.clear()
                    continue
                title = (elem.get("Name") or elem.get("Title") or "").strip()
                if not title:
                    _logger.debug(
                        "[reliability] Skipping TRACK id=%s (missing title) in %s",
                        tid,
                        xml_path,
                    )
                    elem.clear()
                    continue
                artist = (elem.get("Artist") or elem.get("Artists") or "").strip()
                remix_raw = (elem.get("Remixer") or "").strip()
                if remix_raw:
                    remix_version = remix_raw
                else:
                    derived = _extract_remixer_names_from_title(title)
                    remix_version = ", ".join(derived) if derived else ""
                label_raw = (elem.get("Label") or "").strip()
                label = label_raw or None
                parsed_count += 1
                maybe_report()
                yield (tid, title, artist, remix_version, label)
            elif elem.tag == "COLLECTION":
                in_collection = False
            elem.clear()
    finally:
        del context
    _logger.info("inCrate import: parse complete — %s tracks", parsed_count)


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

    # Design 4.70: Limit XML file size (safe parsing)
    size = os.path.getsize(xml_path)
    if size > MAX_XML_SIZE_BYTES:
        raise ValueError(
            f"XML file too large: {size} bytes (max {MAX_XML_SIZE_BYTES}). "
            "Refusing to parse to prevent resource exhaustion."
        )

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

    # Design 5.15, 5.44: Skip malformed track entries, log and continue (audit trail)
    collection = root.find(".//COLLECTION")
    if collection is not None:
        for t in collection.findall("TRACK"):
            tid = (t.get("TrackID") or t.get("ID") or t.get("Key") or "").strip()
            title = (t.get("Name") or t.get("Title") or "").strip()
            artists = (t.get("Artist") or t.get("Artists") or "").strip()
            if not tid:
                _logger.debug(
                    "[reliability] Skipping TRACK with missing TrackID in %s", xml_path
                )
                continue
            if not title:
                _logger.debug(
                    "[reliability] Skipping TRACK id=%s (missing title) in %s",
                    tid,
                    xml_path,
                )
                continue
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


def read_playlist_index(xml_path: str) -> Tuple[Dict[str, int], List[str]]:
    """Return a mapping of playlist names to track counts, plus duplicates.

    This is a lightweight helper for preflight validation. It only reads
    playlist nodes and track references, without expanding full track data.

    Returns:
        (playlist_counts, duplicate_names)
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    playlist_counts: Dict[str, int] = {}
    duplicate_names: List[str] = []

    playlists_root = root.find(".//PLAYLISTS")
    if playlists_root is None:
        return playlist_counts, duplicate_names

    for node in playlists_root.findall(".//NODE"):
        typ = (node.get("Type") or node.get("type") or "").strip()
        if typ != "1":
            continue
        name = node.get("Name") or node.get("name") or "Unnamed Playlist"
        track_count = len(node.findall("./TRACK"))
        if name in playlist_counts and name not in duplicate_names:
            duplicate_names.append(name)
        playlist_counts[name] = track_count

    return playlist_counts, duplicate_names


def inspect_rekordbox_xml(xml_path: str) -> Dict[str, object]:
    """Inspect XML structure for preflight integrity checks."""
    tree = ET.parse(xml_path)
    root = tree.getroot()
    root_tag = root.tag if root is not None else ""

    playlists_root = root.find(".//PLAYLISTS")
    has_playlists = playlists_root is not None
    playlist_nodes = (
        playlists_root.findall(".//NODE") if playlists_root is not None else []
    )

    playlist_names: List[str] = []
    playlist_name_duplicates: List[str] = []
    playlist_name_empty: List[str] = []
    playlist_track_counts: Dict[str, int] = {}

    for node in playlist_nodes:
        typ = (node.get("Type") or node.get("type") or "").strip()
        if typ != "1":
            continue
        name = node.get("Name") or node.get("name") or ""
        if not name.strip():
            playlist_name_empty.append(name)
        if name in playlist_names and name not in playlist_name_duplicates:
            playlist_name_duplicates.append(name)
        playlist_names.append(name)
        playlist_track_counts[name] = len(node.findall("./TRACK"))

    collection = root.find(".//COLLECTION")
    track_nodes = collection.findall("TRACK") if collection is not None else []
    has_tracks = len(track_nodes) > 0
    tracks_missing_title = 0
    tracks_missing_artist = 0
    for track in track_nodes:
        title = track.get("Name") or track.get("Title") or ""
        artist = track.get("Artist") or track.get("Artists") or ""
        if not title.strip():
            tracks_missing_title += 1
        if not artist.strip():
            tracks_missing_artist += 1

    return {
        "root_tag": root_tag,
        "has_playlists": has_playlists,
        "has_tracks": has_tracks,
        "playlist_names": playlist_names,
        "playlist_duplicates": playlist_name_duplicates,
        "playlist_empty_names": playlist_name_empty,
        "playlist_track_counts": playlist_track_counts,
        "tracks_missing_title": tracks_missing_title,
        "tracks_missing_artist": tracks_missing_artist,
    }


def is_readable(path: Path) -> bool:
    """Return True if a file can be read."""
    try:
        with path.open("rb"):
            return True
    except OSError:
        return False


def is_writable(path: Path) -> bool:
    """Return True if a directory can be written to."""
    try:
        test_file = path / ".cuepoint_write_test"
        with test_file.open("w", encoding="utf-8") as handle:
            handle.write("ok")
        test_file.unlink()
        return True
    except OSError:
        return False
