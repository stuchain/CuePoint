#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Rekordbox XML parsing utilities

This module parses Rekordbox XML export files and extracts:
1. Track information (ID, title, artists)
2. Playlist definitions (playlist names and their track IDs)

Key functions:
- parse_rekordbox(): Main parser that extracts tracks and playlists
- extract_artists_from_title(): Extracts artist names from title when artist field is empty
"""

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import xml.etree.ElementTree as ET


@dataclass
class RBTrack:
    """
    Rekordbox track data structure
    
    Attributes:
        track_id: Unique track ID from Rekordbox
        title: Track title (may contain prefixes like [F], [3])
        artists: Artist string (may be empty)
    """
    track_id: str
    title: str
    artists: str


def parse_rekordbox(xml_path: str) -> Tuple[Dict[str, RBTrack], Dict[str, List[str]]]:
    """
    Parse Rekordbox XML export file and extract tracks and playlists
    
    Rekordbox XML structure:
    - COLLECTION: Contains all tracks
    - PLAYLISTS: Contains playlist definitions
    - Each playlist (NODE with Type="1") contains TRACK references
    
    Args:
        xml_path: Path to Rekordbox XML export file
    
    Returns:
        Tuple of:
        - tracks_by_id: Dictionary mapping track ID -> RBTrack
        - playlists: Dictionary mapping playlist name -> list of track IDs
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    tracks_by_id: Dict[str, RBTrack] = {}
    playlists: Dict[str, List[str]] = {}

    collection = root.find(".//COLLECTION")
    if collection is not None:
        for t in collection.findall("TRACK"):
            tid = t.get("TrackID") or t.get("ID") or t.get("Key") or ""
            title = t.get("Name") or t.get("Title") or ""
            artists = t.get("Artist") or t.get("Artists") or ""
            if tid and title:
                tracks_by_id[tid] = RBTrack(track_id=tid, title=title, artists=artists)

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
                if track_ids:
                    playlists[pname] = track_ids

    return tracks_by_id, playlists


def extract_artists_from_title(title: str) -> Optional[Tuple[str, str]]:
    """
    Extract artist names from title if title follows "Artists - Title" format
    
    Some Rekordbox tracks have artist information embedded in the title field
    instead of the artist field. This function attempts to extract it.
    
    Example:
        "John Smith - Never Sleep Again" → ("John Smith", "Never Sleep Again")
    
    Args:
        title: Title string that may contain artist information
    
    Returns:
        Tuple of (artists, cleaned_title) if extraction successful, else None
    """
    if not title:
        return None
    t = title.strip()
    t = re.sub(r'^\s*(?:[\[(]?\d+[\])\.]?|\(F\))\s*[-–—:\s]\s*', '', t, flags=re.I)
    parts = re.split(r'\s*[-–—:]\s*', t, maxsplit=1)
    if len(parts) != 2:
        return None
    artists, rest = parts[0].strip(), parts[1].strip()
    rest = re.sub(r'\s*\((?:feat\.?|ft\.?|featuring)\s+[^\)]*\)', ' ', rest, flags=re.I)
    rest = re.sub(r'\s*\[(?:feat\.?|ft\.?|featuring)\s+[^\]]*\]', ' ', rest, flags=re.I)
    rest = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', rest)
    rest = re.sub(r'\s{2,}', ' ', rest).strip()
    return (artists, rest) if (artists and rest) else None

