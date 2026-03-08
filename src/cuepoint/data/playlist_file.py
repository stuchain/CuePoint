"""Parse M3U/M3U8 playlist files for track paths and metadata."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List, Optional, Tuple

_logger = logging.getLogger(__name__)


def parse_m3u(playlist_path: str) -> List[Tuple[str, Optional[str], Optional[str]]]:
    """Parse an M3U or M3U8 file and return (file_path, title, artist) per track.

    Encoding: tries UTF-8 first; on decode error falls back to Latin-1 then cp1252.
    #EXTINF: split DisplayString on first " - " (space-dash-space) for artist/title;
    if no " - ", use whole string as title, artist None. Missing/empty EXTINF yields
    (path, None, None); caller can use read_title_artist_from_file().

    Relative paths are resolved against the directory of playlist_path.

    Args:
        playlist_path: Path to the .m3u or .m3u8 file.

    Returns:
        List of (file_path, title, artist). file_path is absolute or resolved.
    """
    path = Path(playlist_path)
    if not path.exists():
        raise FileNotFoundError(f"Playlist file not found: {playlist_path}")
    base_dir = path.parent

    raw: str
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            raw = path.read_text(encoding="latin-1")
        except Exception:
            raw = path.read_text(encoding="cp1252")

    result: List[Tuple[str, Optional[str], Optional[str]]] = []
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line or line.startswith("#EXTM3U"):
            continue
        if line.upper().startswith("#EXTINF:"):
            # Format: #EXTINF:duration,DisplayString
            display = ""
            if "," in line:
                display = line.split(",", 1)[1].strip()
            title: Optional[str] = None
            artist: Optional[str] = None
            if display:
                if " - " in display:
                    idx = display.index(" - ")
                    artist = display[:idx].strip() or None
                    title = display[idx + 3 :].strip() or None
                else:
                    title = display
            # Next non-empty line is the path
            path_line = ""
            while i < len(lines):
                path_line = lines[i].strip()
                i += 1
                if path_line and not path_line.startswith("#"):
                    break
            if not path_line:
                continue
            file_path = path_line
            if not os.path.isabs(file_path):
                file_path = str((base_dir / file_path).resolve())
            result.append((file_path, title, artist))
            continue
        # Standalone path (no EXTINF)
        if line and not line.startswith("#"):
            file_path = line
            if not os.path.isabs(file_path):
                file_path = str((base_dir / file_path).resolve())
            result.append((file_path, None, None))
    return result


def read_title_artist_from_file(file_path: str) -> Tuple[Optional[str], Optional[str]]:
    """Read title and artist from audio file tags (ID3/Vorbis) if present.

    Does not raise; returns (None, None) on missing file, unsupported format, or
    missing tags.

    Args:
        file_path: Path to the audio file.

    Returns:
        (title, artist) or (None, None).
    """
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        return (None, None)
    suffix = path.suffix.lower()
    try:
        if suffix == ".mp3" or suffix in (".wav", ".aiff", ".aif"):
            return _read_id3_title_artist(str(path))
        if suffix in (".flac", ".ogg"):
            return _read_vorbis_title_artist(str(path))
        return _read_mutagen_auto_title_artist(str(path))
    except Exception as e:
        _logger.debug("Could not read tags from %s: %s", file_path, e)
        return (None, None)


def _read_id3_title_artist(path: str) -> Tuple[Optional[str], Optional[str]]:
    try:
        from mutagen.id3 import ID3
        from mutagen.id3 import ID3NoHeaderError
    except ImportError:
        return (None, None)
    try:
        audio = ID3(path)
    except ID3NoHeaderError:
        return (None, None)
    except Exception:
        return (None, None)
    title = None
    if "TIT2" in audio and audio["TIT2"].text:
        title = str(audio["TIT2"].text[0]).strip() or None
    artist = None
    if "TPE1" in audio and audio["TPE1"].text:
        artist = str(audio["TPE1"].text[0]).strip() or None
    return (title, artist)


def _read_vorbis_title_artist(path: str) -> Tuple[Optional[str], Optional[str]]:
    try:
        from mutagen.flac import FLAC
        from mutagen.oggvorbis import OggVorbis
    except ImportError:
        return (None, None)
    suffix = Path(path).suffix.lower()
    try:
        if suffix == ".flac":
            audio = FLAC(path)
        else:
            audio = OggVorbis(path)
    except Exception:
        return (None, None)
    title = None
    if "title" in audio and audio["title"]:
        title = str(audio["title"][0]).strip() or None
    artist = None
    if "artist" in audio and audio["artist"]:
        artist = str(audio["artist"][0]).strip() or None
    return (title, artist)


def _read_mutagen_auto_title_artist(path: str) -> Tuple[Optional[str], Optional[str]]:
    try:
        import mutagen
        audio = mutagen.File(path)
    except Exception:
        return (None, None)
    if audio is None:
        return (None, None)
    title = None
    artist = None
    if hasattr(audio, "get") and callable(audio.get):
        title = audio.get("title")
        artist = audio.get("artist")
    if hasattr(audio, "tags") and audio.tags:
        if title is None and "title" in audio.tags:
            title = audio.tags["title"]
        if artist is None and "artist" in audio.tags:
            artist = audio.tags["artist"]
    if isinstance(title, list) and title:
        title = str(title[0]).strip() or None
    elif title is not None:
        title = str(title).strip() or None
    if isinstance(artist, list) and artist:
        artist = str(artist[0]).strip() or None
    elif artist is not None:
        artist = str(artist).strip() or None
    return (title, artist)
