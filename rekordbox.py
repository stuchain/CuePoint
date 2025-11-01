#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Rekordbox XML parsing utilities
"""

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import xml.etree.ElementTree as ET


@dataclass
class RBTrack:
    """Rekordbox track data"""
    track_id: str
    title: str
    artists: str


def parse_rekordbox(xml_path: str) -> Tuple[Dict[str, RBTrack], Dict[str, List[str]]]:
    """Parse Rekordbox XML file and extract tracks and playlists"""
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
    """Extract artists from title string if formatted as 'Artists - Title'"""
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

