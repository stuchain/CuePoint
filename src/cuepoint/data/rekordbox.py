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
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple
from urllib.parse import unquote

import os
import tempfile

from cuepoint.core.mix_parser import _extract_remixer_names_from_title  # noqa: E402
from cuepoint.models.compat import track_from_rbtrack  # noqa: E402
from cuepoint.models.playlist import Playlist  # noqa: E402
from cuepoint.models.result import TrackResult  # noqa: E402
from cuepoint.models.track import Track  # noqa: E402
from cuepoint.utils.errors import error_xml_parsing  # noqa: E402

_logger = logging.getLogger(__name__)

# Design 4.70: Cap XML file size to mitigate DoS (entity expansion, huge files)
MAX_XML_SIZE_BYTES = 100 * 1024 * 1024  # 100 MiB

# Report progress every N tracks during streaming parse (and on first track)
_PARSE_PROGRESS_INTERVAL = 100


def playlist_path_for_display(path: str) -> str:
    """Return path with ROOT/ or ROOT prefix stripped for display and filenames.

    Use for CSV filenames, UI labels, etc., so we show "Untitled Playlist" not
    "ROOT/Untitled Playlist" or "ROOTUntitled Playlist".
    """
    if not path:
        return path
    p = path.strip()
    if p.upper() == "ROOT":
        return ""
    if p.upper().startswith("ROOT/"):
        return p[5:].lstrip()
    if p.upper().startswith("ROOT"):
        return p[4:].lstrip()
    return p


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
            _logger.info(
                "inCrate import: parsing progress — %s tracks so far", parsed_count
            )
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
                tid = (
                    elem.get("TrackID") or elem.get("ID") or elem.get("Key") or ""
                ).strip()
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


# Tree node: dict with "type" ("folder"|"playlist"), "name", "path"; folder has "children", playlist has "track_count"
def parse_playlist_tree(
    xml_path: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Playlist]]:
    """Parse Rekordbox XML preserving folder/playlist hierarchy.

    NODE Type="0" = folder, Type="1" = playlist. Folders contain NODE children;
    playlists contain TRACK references. Returns tree roots and path-keyed playlists.

    Args:
        xml_path: Path to Rekordbox XML export file.

    Returns:
        (tree_roots, playlists_by_path). tree_roots is a list of node dicts;
        each node has "type" ("folder"|"playlist"), "name", "path"; folders have
        "children", playlists have "track_count". playlists_by_path maps full path
        (e.g. "Folder/SubFolder/Playlist Name") to Playlist. Root-level playlists
        have path = name (no slash).
    """
    if not os.path.exists(xml_path):
        raise FileNotFoundError(f"XML file not found: {xml_path}")
    size = os.path.getsize(xml_path)
    if size > MAX_XML_SIZE_BYTES:
        raise ValueError(
            f"XML file too large: {size} bytes (max {MAX_XML_SIZE_BYTES}). "
            "Refusing to parse to prevent resource exhaustion."
        )
    tree = ET.parse(xml_path)
    root = tree.getroot()
    tracks_by_id: Dict[str, RBTrack] = {}
    collection = root.find(".//COLLECTION")
    if collection is not None:
        for t in collection.findall("TRACK"):
            tid = (t.get("TrackID") or t.get("ID") or t.get("Key") or "").strip()
            title = (t.get("Name") or t.get("Title") or "").strip()
            artists = (t.get("Artist") or t.get("Artists") or "").strip()
            if not tid or not title:
                continue
            tracks_by_id[tid] = RBTrack(track_id=tid, title=title, artists=artists)

    playlists_by_path: Dict[str, Playlist] = {}

    def _parse_nodes(parent_elem: ET.Element, path_prefix: str) -> List[Dict[str, Any]]:
        nodes: List[Dict[str, Any]] = []
        for node_elem in parent_elem.findall("NODE"):
            name = (node_elem.get("Name") or node_elem.get("name") or "Unnamed").strip()
            typ = (node_elem.get("Type") or node_elem.get("type") or "0").strip()
            full_path = f"{path_prefix}/{name}".lstrip("/") if path_prefix else name
            if typ == "1":
                track_refs = [
                    (tr.get("Key") or tr.get("TrackID") or tr.get("ID") or "").strip()
                    for tr in node_elem.findall("TRACK")
                ]
                track_ids = [r for r in track_refs if r]
                tracks = []
                for idx, track_id in enumerate(track_ids, start=1):
                    rbtrack = tracks_by_id.get(track_id)
                    if rbtrack:
                        track = track_from_rbtrack(rbtrack)
                        track.position = idx
                        tracks.append(track)
                pl = Playlist(name=name, tracks=tracks)
                playlists_by_path[full_path] = pl
                nodes.append(
                    {
                        "type": "playlist",
                        "name": name,
                        "path": full_path,
                        "track_count": len(track_ids),
                    }
                )
            else:
                children = _parse_nodes(node_elem, full_path)
                nodes.append(
                    {
                        "type": "folder",
                        "name": name,
                        "path": full_path,
                        "children": children,
                    }
                )
        return nodes

    playlists_root = root.find(".//PLAYLISTS")
    tree_roots: List[Dict[str, Any]] = []
    if playlists_root is not None:
        tree_roots = _parse_nodes(playlists_root, "")
    return (tree_roots, playlists_by_path)


def resolve_playlist_key(
    playlist_name: str, playlists_by_path: Dict[str, Playlist]
) -> Optional[str]:
    """Resolve a user-provided playlist name to the path key used in playlists_by_path.

    Accepts full path (e.g. ROOT/My Playlist), short name (My Playlist), or
    path without ROOT prefix. Returns the key to use for lookup, or None if not found.

    Args:
        playlist_name: Name or path provided by user/CLI.
        playlists_by_path: Dict from parse_playlist_tree (path -> Playlist).

    Returns:
        The key to use in playlists_by_path, or None.
    """
    if not playlist_name or not playlists_by_path:
        return None
    if playlist_name in playlists_by_path:
        return playlist_name
    path_without_root = playlist_name.strip()
    if path_without_root.upper().startswith("ROOT/"):
        path_without_root = path_without_root[5:].lstrip()
    elif path_without_root.upper().startswith("ROOT"):
        path_without_root = path_without_root[4:].lstrip()
    if path_without_root and path_without_root in playlists_by_path:
        return path_without_root
    if path_without_root:
        canonical = f"ROOT/{path_without_root}"
        if canonical in playlists_by_path:
            return canonical
    name_only = (
        path_without_root
        if path_without_root
        else (
            playlist_name.split("/")[-1].strip()
            if "/" in playlist_name
            else playlist_name
        )
    )
    for path, pl in playlists_by_path.items():
        if pl.name == playlist_name or pl.name == name_only:
            return path
    return None


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


def get_track_locations(xml_path: str) -> Dict[str, str]:
    """Return mapping of track_id to local file path from Rekordbox XML Location attribute.

    Rekordbox stores paths as file://localhost/D:/Music/track.mp3 (URL-encoded).
    Tracks without a Location attribute are omitted.

    Args:
        xml_path: Path to Rekordbox XML export file.

    Returns:
        Dict mapping track_id (str) to local filesystem path (str).

    Raises:
        FileNotFoundError: If xml_path does not exist.
        ValueError: If xml_path exceeds MAX_XML_SIZE_BYTES.
        ET.ParseError: If XML parsing fails.
    """
    if not os.path.exists(xml_path):
        raise FileNotFoundError(f"XML file not found: {xml_path}")
    size = os.path.getsize(xml_path)
    if size > MAX_XML_SIZE_BYTES:
        raise ValueError(
            f"XML file too large: {size} bytes (max {MAX_XML_SIZE_BYTES}). "
            "Refusing to parse to prevent resource exhaustion."
        )
    tree = ET.parse(xml_path)
    root = tree.getroot()
    collection = root.find(".//COLLECTION")
    if collection is None:
        return {}
    result: Dict[str, str] = {}
    for elem in collection.findall("TRACK"):
        tid = (elem.get("TrackID") or elem.get("ID") or elem.get("Key") or "").strip()
        location = (elem.get("Location") or "").strip()
        if not tid or not location:
            continue
        location = unquote(location)
        prefix = "file://localhost"
        if location.lower().startswith(prefix):
            location = location[len(prefix) :]
            # On Windows, Rekordbox uses file://localhost/D:/Music → strip leading slash.
            # On Unix, file://localhost/var/... must stay /var/... (absolute path).
            if os.name == "nt":
                location = location.lstrip("/")
        if not location:
            continue
        path = Path(location.replace("/", os.sep))
        result[tid] = str(path)
    return result


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


def get_playlist_track_ids(xml_path: str, playlist_name: str) -> List[str]:
    """Return list of track IDs in playlist order for the given playlist.

    playlist_name can be the playlist's full path (e.g. "ROOT/Folder/Playlist Name")
    or, when there are no folders, the playlist name. Path is the unique key from
    parse_playlist_tree.

    Args:
        xml_path: Path to Rekordbox XML export file.
        playlist_name: Playlist name or full path (path when using tree/keyed by path).

    Returns:
        List of track_id strings in the same order as in the playlist.

    Raises:
        FileNotFoundError: If XML file does not exist.
        ValueError: If XML is too large or playlist not found.
        ET.ParseError: If XML parsing fails.
    """
    _, playlists_by_path = parse_playlist_tree(xml_path)
    if playlist_name in playlists_by_path:
        return [
            t.track_id for t in playlists_by_path[playlist_name].tracks if t.track_id
        ]
    # Try path without ROOT prefix (with or without slash; some callers pass "ROOTUntitled" or "ROOT/Untitled")
    path_without_root = playlist_name.strip()
    if path_without_root.upper().startswith("ROOT/"):
        path_without_root = path_without_root[5:].lstrip()
    elif path_without_root.upper().startswith("ROOT"):
        path_without_root = path_without_root[4:].lstrip()
    if path_without_root and path_without_root in playlists_by_path:
        return [
            t.track_id
            for t in playlists_by_path[path_without_root].tracks
            if t.track_id
        ]
    # Try canonical path with slash (ROOT/Name) when input had no slash (e.g. from CSV filename)
    if path_without_root:
        canonical = f"ROOT/{path_without_root}"
        if canonical in playlists_by_path:
            return [
                t.track_id for t in playlists_by_path[canonical].tracks if t.track_id
            ]
    # Fallback: resolve by playlist name (last path segment or exact name)
    name_only = (
        path_without_root
        if path_without_root
        else (
            playlist_name.split("/")[-1].strip()
            if "/" in playlist_name
            else playlist_name
        )
    )
    for path, pl in playlists_by_path.items():
        if pl.name == playlist_name or pl.name == name_only:
            return [t.track_id for t in pl.tracks if t.track_id]
    raise ValueError(f"Playlist not found: {playlist_name}")


def write_updated_collection_xml(
    xml_path: str,
    updates: Dict[str, Dict[str, str]],
    output_path: str,
) -> None:
    """Write an updated Rekordbox XML with COLLECTION TRACK attributes applied.

    Only modifies attribute values on existing COLLECTION TRACK elements;
    structure and PLAYLISTS are preserved. Every updated track should
    include Comment="ok" (and optionally Key, BPM, Genre, Year).

    Args:
        xml_path: Path to source Rekordbox XML export file.
        updates: Map track_id -> { "Key": "Am", "BPM": "128", "Comment": "ok", ... }.
        output_path: Path for the written XML file.

    Raises:
        FileNotFoundError: If xml_path does not exist.
        ValueError: If xml_path exceeds MAX_XML_SIZE_BYTES.
        ET.ParseError: If XML parsing fails.
        OSError: If writing output fails.
    """
    if not os.path.exists(xml_path):
        raise FileNotFoundError(f"XML file not found: {xml_path}")
    size = os.path.getsize(xml_path)
    if size > MAX_XML_SIZE_BYTES:
        raise ValueError(
            f"XML file too large: {size} bytes (max {MAX_XML_SIZE_BYTES}). "
            "Refusing to parse to prevent resource exhaustion."
        )

    tree = ET.parse(xml_path)
    root = tree.getroot()
    collection = root.find(".//COLLECTION")
    if collection is not None:
        for elem in collection.findall("TRACK"):
            tid = (
                elem.get("TrackID") or elem.get("ID") or elem.get("Key") or ""
            ).strip()
            if tid in updates:
                for attr_name, attr_value in updates[tid].items():
                    elem.set(attr_name, attr_value)

    output_path_obj = Path(output_path)
    parent_dir = output_path_obj.parent
    parent_dir.mkdir(parents=True, exist_ok=True)
    temp_file = None
    try:
        fd, temp_file = tempfile.mkstemp(
            suffix=".xml", dir=str(parent_dir), prefix="cuepoint_rekordbox_"
        )
        os.close(fd)
        tree.write(
            temp_file,
            encoding="utf-8",
            xml_declaration=True,
            method="xml",
            default_namespace=None,
        )
        Path(temp_file).replace(output_path_obj)
    except Exception:
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except OSError:
                pass
        raise


def _short_key(key: Optional[str]) -> str:
    """Convert normal key to short format: 'A Minor' -> 'Amin', 'G Major' -> 'Gmaj'.

    Uses capital note letter and 'min'/'maj'. Handles sharps and flats (e.g. G# Minor -> G#min).
    Returns empty string if key is invalid or not parseable.
    """
    if not key:
        return ""
    import re

    s = (key or "").strip()
    s = s.replace("\u266d", "b").replace("\u266f", "#")  # Unicode flat/sharp
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"(?i)\bmaj(?:or)?\b", "Major", s)
    s = re.sub(r"(?i)\bmin(?:or)?\b", "Minor", s)
    m = re.match(r"^\s*([A-G])\s*(#|b)?\s*(Major|Minor)\s*$", s)
    if not m:
        return ""
    letter = m.group(1).upper()
    acc = m.group(2) or ""
    qual = m.group(3)
    note = letter + acc
    suffix = "maj" if qual == "Major" else "min"
    return note + suffix


def build_rekordbox_updates(
    xml_path: str,
    playlist_name: str,
    results: List[TrackResult],
    use_camelot_key: bool = False,
    sync_options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, str]]:
    """Build a track_id -> attributes map for writing tags (single playlist).

    Only matched results with valid playlist_index are included. When
    sync_options is None, all fields are included (backward compatible).
    When sync_options is provided, only enabled fields are included; key_format
    (normal|camelot|short), write_* flags and comment_text are respected.

    Args:
        xml_path: Path to Rekordbox XML export file.
        playlist_name: Name of the playlist that was processed.
        results: List of TrackResult in any order (sorted by playlist_index internally).
        use_camelot_key: If True, write Key in Camelot notation (ignored if sync_options.key_format set).
        sync_options: Optional dict with key_format, write_key, write_year, write_bpm,
            write_label, write_genre, write_comment (bool), comment_text (str).

    Returns:
        Dict mapping track_id -> { "Comment": "...", "Key": "...", ... } (only requested fields).
    """
    from cuepoint.core.matcher import _camelot_key
    from cuepoint.data.tag_writer import _normalize_year

    opts = sync_options
    if opts is None:
        key_fmt = "camelot" if use_camelot_key else "normal"
        write_key = write_year = write_bpm = write_label = write_genre = (
            write_comment
        ) = True
        comment_text = "ok"
    else:
        key_fmt = (opts.get("key_format") or "normal").lower()
        write_key = opts.get("write_key", True)
        write_year = opts.get("write_year", True)
        write_bpm = opts.get("write_bpm", False)
        write_label = opts.get("write_label", True)
        write_genre = opts.get("write_genre", False)
        write_comment = opts.get("write_comment", True)
        comment_text = opts.get("comment_text") or "ok"
        if not write_comment:
            comment_text = ""

    track_ids = get_playlist_track_ids(xml_path, playlist_name)
    updates: Dict[str, Dict[str, str]] = {}
    sorted_results = sorted(results, key=lambda r: r.playlist_index)
    for r in sorted_results:
        if not r.matched:
            continue
        idx = r.playlist_index
        if idx < 1 or idx > len(track_ids):
            continue
        tid = track_ids[idx - 1]
        updates[tid] = {}
        if write_comment and comment_text:
            updates[tid]["Comment"] = comment_text
        if write_key:
            if key_fmt == "camelot":
                key_val = (
                    r.beatport_key_camelot and str(r.beatport_key_camelot).strip()
                ) or (_camelot_key(r.beatport_key) if r.beatport_key else "")
            elif key_fmt == "short":
                key_val = _short_key(r.beatport_key) if r.beatport_key else ""
                if not key_val and r.beatport_key:
                    key_val = str(r.beatport_key).strip()
            else:
                key_val = (r.beatport_key and str(r.beatport_key).strip()) or ""
            if key_val:
                updates[tid]["Key"] = key_val
        if write_year:
            year_val = _normalize_year(r.beatport_year)
            if year_val:
                updates[tid]["Year"] = year_val
        if write_bpm and r.beatport_bpm is not None:
            try:
                bpm_val = float(r.beatport_bpm)
                updates[tid]["BPM"] = (
                    str(int(bpm_val)) if bpm_val == int(bpm_val) else f"{bpm_val:.1f}"
                )
            except (TypeError, ValueError):
                updates[tid]["BPM"] = str(r.beatport_bpm)
        if write_label and r.beatport_label and str(r.beatport_label).strip():
            updates[tid]["Label"] = str(r.beatport_label).strip()
        if write_genre and r.beatport_genres and str(r.beatport_genres).strip():
            genres = str(r.beatport_genres).strip()
            updates[tid]["Genre"] = (
                genres.split(",")[0].strip() if "," in genres else genres
            )
    return updates


def build_rekordbox_updates_batch(
    xml_path: str,
    results_dict: Dict[str, List[TrackResult]],
    use_camelot_key: bool = False,
    sync_options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, str]]:
    """Build a track_id -> attributes map for writing tags (batch playlists).

    Merges updates from all playlists; if a track appears in multiple playlists,
    the last playlist's result wins.

    Args:
        xml_path: Path to Rekordbox XML export file.
        results_dict: Map playlist_name -> list of TrackResult.
        use_camelot_key: If True, write Key in Camelot notation (ignored if sync_options set).
        sync_options: Optional sync options dict (same as build_rekordbox_updates).

    Returns:
        Dict mapping track_id -> attributes.
    """
    merged: Dict[str, Dict[str, str]] = {}
    for playlist_name, results in results_dict.items():
        if not results:
            continue
        try:
            single = build_rekordbox_updates(
                xml_path,
                playlist_name,
                results,
                use_camelot_key=use_camelot_key,
                sync_options=sync_options,
            )
            for tid, attrs in single.items():
                merged[tid] = attrs
        except ValueError:
            continue
    return merged


def write_key_comment_year_to_playlist_tracks(
    xml_path: str,
    playlist_name: str,
    results: List[TrackResult],
    use_camelot_key: bool = False,
    sync_options: Optional[Dict[str, Any]] = None,
) -> Tuple[int, int, List[str]]:
    """Write selected tags to audio files for matched tracks (single playlist).

    Uses Location from the Rekordbox XML to find each track's file path, then
    writes tags via the tag_writer module. When sync_options is provided, only
    selected fields are written (Key, Comment, Year, Label, BPM, Genre).

    Args:
        xml_path: Path to Rekordbox XML export file.
        playlist_name: Name of the playlist that was processed.
        results: List of TrackResult (matched only are written).
        use_camelot_key: If True, write Key in Camelot notation (ignored if sync_options set).
        sync_options: Optional dict with key_format, write_* flags, comment_text.

    Returns:
        Tuple of (written_count, failed_count, list_of_error_messages).
    """
    from cuepoint.data.tag_writer import (
        STATUS_OK,
        write_key_comment_year_to_file,
    )

    updates = build_rekordbox_updates(
        xml_path,
        playlist_name,
        results,
        use_camelot_key=use_camelot_key,
        sync_options=sync_options,
    )
    locations = get_track_locations(xml_path)
    if not locations:
        return (0, 0, ["No file paths (Location) in this XML."])
    written = 0
    failed = 0
    errors: List[str] = []
    for tid, attrs in updates.items():
        if tid not in locations:
            failed += 1
            errors.append(f"Track {tid}: no path in XML")
            continue
        path = locations[tid]
        status, err = write_key_comment_year_to_file(
            path,
            attrs.get("Key"),
            attrs.get("Comment"),
            attrs.get("Year"),
            attrs.get("Label"),
            attrs.get("BPM"),
            attrs.get("Genre"),
        )
        if status == STATUS_OK:
            written += 1
        else:
            failed += 1
            errors.append(f"{path}: {err or status}")
    return (written, failed, errors)


def write_key_comment_year_to_playlist_tracks_batch(
    xml_path: str,
    results_dict: Dict[str, List[TrackResult]],
    use_camelot_key: bool = False,
    sync_options: Optional[Dict[str, Any]] = None,
) -> Tuple[int, int, List[str]]:
    """Write selected tags to audio files for matched tracks (batch).

    Merges all playlists and writes each track at most once (last wins).

    Args:
        xml_path: Path to Rekordbox XML export file.
        results_dict: Map playlist_name -> list of TrackResult.
        use_camelot_key: If True, write Key in Camelot notation (ignored if sync_options set).
        sync_options: Optional sync options dict.

    Returns:
        Tuple of (written_count, failed_count, list_of_error_messages).
    """
    updates = build_rekordbox_updates_batch(
        xml_path,
        results_dict,
        use_camelot_key=use_camelot_key,
        sync_options=sync_options,
    )
    locations = get_track_locations(xml_path)
    if not locations:
        return (0, 0, ["No file paths (Location) in this XML."])
    from cuepoint.data.tag_writer import (
        STATUS_OK,
        write_key_comment_year_to_file,
    )

    written = 0
    failed = 0
    errors: List[str] = []
    for tid, attrs in updates.items():
        if tid not in locations:
            failed += 1
            errors.append(f"Track {tid}: no path in XML")
            continue
        path = locations[tid]
        status, err = write_key_comment_year_to_file(
            path,
            attrs.get("Key"),
            attrs.get("Comment"),
            attrs.get("Year"),
            attrs.get("Label"),
            attrs.get("BPM"),
            attrs.get("Genre"),
        )
        if status == STATUS_OK:
            written += 1
        else:
            failed += 1
            errors.append(f"{path}: {err or status}")
    return (written, failed, errors)


def write_tags_to_paths(
    results: List[TrackResult],
    sync_options: Optional[Dict[str, Any]] = None,
) -> Tuple[int, int, List[str]]:
    """Write selected tags to audio files by path (for M3U/M3U8 playlist file source).

    Only matched results with file_path set are written. sync_options has the same
    structure as for write_key_comment_year_to_playlist_tracks (key_format, write_*,
    comment_text). Does not require Rekordbox XML.

    Args:
        results: List of TrackResult; only those with file_path and matched=True are written.
        sync_options: Optional dict with key_format, write_key, write_year, write_bpm,
            write_label, write_genre, write_comment (bool), comment_text (str).

    Returns:
        Tuple of (written_count, failed_count, list_of_error_messages).
    """
    from cuepoint.core.matcher import _camelot_key
    from cuepoint.data.tag_writer import (
        STATUS_OK,
        _normalize_year,
        write_key_comment_year_to_file,
    )

    opts = sync_options
    if opts is None:
        key_fmt = "normal"
        write_key = write_year = write_bpm = write_label = write_genre = (
            write_comment
        ) = True
        comment_text = "ok"
    else:
        key_fmt = (opts.get("key_format") or "normal").lower()
        write_key = opts.get("write_key", True)
        write_year = opts.get("write_year", True)
        write_bpm = opts.get("write_bpm", False)
        write_label = opts.get("write_label", True)
        write_genre = opts.get("write_genre", False)
        write_comment = opts.get("write_comment", True)
        comment_text = opts.get("comment_text") or "ok"
        if not write_comment:
            comment_text = ""

    written = 0
    failed = 0
    errors: List[str] = []
    for r in results:
        if not r.matched or not r.file_path:
            continue
        path = r.file_path
        if not os.path.exists(path):
            failed += 1
            errors.append(f"{path}: File not found")
            continue
        key_val = None
        if write_key:
            if key_fmt == "camelot":
                key_val = (
                    r.beatport_key_camelot and str(r.beatport_key_camelot).strip()
                ) or (_camelot_key(r.beatport_key) if r.beatport_key else "")
            elif key_fmt == "short":
                key_val = _short_key(r.beatport_key) if r.beatport_key else ""
                if not key_val and r.beatport_key:
                    key_val = str(r.beatport_key).strip()
            else:
                key_val = (r.beatport_key and str(r.beatport_key).strip()) or ""
            if not key_val:
                key_val = None
        year_val = (
            _normalize_year(r.beatport_year) if write_year and r.beatport_year else None
        )
        bpm_val = None
        if write_bpm and r.beatport_bpm is not None:
            try:
                b = float(r.beatport_bpm)
                bpm_val = str(int(b)) if b == int(b) else f"{b:.1f}"
            except (TypeError, ValueError):
                bpm_val = str(r.beatport_bpm)
        label_val = (
            (r.beatport_label and str(r.beatport_label).strip())
            if write_label
            else None
        )
        genre_val = None
        if write_genre and r.beatport_genres and str(r.beatport_genres).strip():
            g = str(r.beatport_genres).strip()
            genre_val = g.split(",")[0].strip() if "," in g else g
        status, err = write_key_comment_year_to_file(
            path,
            key_val,
            comment_text if write_comment else None,
            year_val,
            label_val,
            bpm_val,
            genre_val,
        )
        if status == STATUS_OK:
            written += 1
        else:
            failed += 1
            errors.append(f"{path}: {err or status}")
    return (written, failed, errors)


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
