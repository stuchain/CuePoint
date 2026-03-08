"""Write Key, Comment, and Year to audio file tags (ID3/Vorbis) for Reload Tags in Rekordbox."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Tuple

_logger = logging.getLogger(__name__)

# Status return values
STATUS_OK = "OK"
STATUS_FILE_NOT_FOUND = "FILE_NOT_FOUND"
STATUS_UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
STATUS_WRITE_ERROR = "WRITE_ERROR"


def _normalize_year(value: Optional[str]) -> Optional[str]:
    """Return a 4-digit year string (e.g. '2023') or None if invalid.

    Handles int, float, or str so that '2023.0' or 2023.0 from exports don't
    get written as-is (some players expect exactly 4 digits).
    """
    if value is None:
        return None
    if isinstance(value, int):
        if 1900 <= value <= 2100:
            return str(value)
        return None
    if isinstance(value, float):
        try:
            y = int(value)
            if 1900 <= y <= 2100:
                return str(y)
        except (ValueError, OverflowError):
            pass
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        y = int(float(s))
        if 1900 <= y <= 2100:
            return str(y)
    except (ValueError, OverflowError):
        pass
    return None


def write_key_comment_year_to_file(
    file_path: str,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    """Write Key, Comment, Year, Label, BPM, and Genre to a single audio file's tags.

    Only writes tags that are provided (non-None, non-empty for text). Supports
    MP3, WAV, AIFF (ID3), and FLAC/OGG (Vorbis comments). Does not raise;
    returns (status, error_message).

    Args:
        file_path: Local path to the audio file.
        key: Musical key. Optional.
        comment: Comment text. Optional; skip writing if None or empty.
        year: Release year. Optional.
        label: Record label. Optional.
        bpm: BPM value. Optional (ID3 TBPM / Vorbis BPM).
        genre: Genre. Optional (ID3 TCON / Vorbis GENRE).

    Returns:
        Tuple of (status, error_message).
    """
    path = Path(file_path)
    if not path.exists():
        return (STATUS_FILE_NOT_FOUND, f"File not found: {file_path}")
    suffix = path.suffix.lower()
    try:
        if suffix == ".mp3":
            return _write_id3(path, key, comment, year, label, bpm, genre)
        if suffix in (".wav", ".aiff", ".aif"):
            return _write_id3_in_container(path, key, comment, year, label, bpm, genre)
        if suffix in (".flac", ".ogg"):
            return _write_vorbis(path, key, comment, year, label, bpm, genre)
        return _write_mutagen_auto(path, key, comment, year, label, bpm, genre)
    except Exception as e:
        _logger.exception("Tag write failed for %s", file_path)
        return (STATUS_WRITE_ERROR, str(e))


def _write_id3(
    path: Path,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    from mutagen.id3 import ID3, COMM, TKEY, TBPM, TCON, TPUB, TYER
    from mutagen.id3 import ID3NoHeaderError

    try:
        audio = ID3(str(path))
    except ID3NoHeaderError:
        audio = ID3()
    encoding = 3
    if key:
        audio["TKEY"] = TKEY(encoding=encoding, text=[key])
    if comment:
        audio.delall("COMM")
        audio.add(COMM(encoding=encoding, lang="XXX", desc="", text=[comment]))
    year_norm = _normalize_year(year)
    if year_norm:
        audio["TYER"] = TYER(encoding=encoding, text=[year_norm])
    if label:
        audio["TPUB"] = TPUB(encoding=encoding, text=[label])
    if bpm:
        audio["TBPM"] = TBPM(encoding=encoding, text=[str(bpm).strip()])
    if genre:
        audio["TCON"] = TCON(encoding=encoding, text=[str(genre).strip()])
    audio.save(str(path))
    return (STATUS_OK, None)


def _write_id3_in_container(
    path: Path,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    """Write ID3 TKEY/COMM/TYER/TPUB/TBPM/TCON to WAV or AIFF via container."""
    try:
        from mutagen import File
        from mutagen.id3 import ID3, COMM, TKEY, TBPM, TCON, TPUB, TYER
    except ImportError:
        return (STATUS_UNSUPPORTED_FORMAT, "mutagen not available")
    try:
        audio = File(str(path))
    except Exception as e:
        return (STATUS_UNSUPPORTED_FORMAT, str(e))
    if audio is None or not hasattr(audio, "tags"):
        return (STATUS_UNSUPPORTED_FORMAT, "Not a supported container")
    if audio.tags is None:
        audio.add_tags()
    if not isinstance(audio.tags, ID3):
        return (STATUS_UNSUPPORTED_FORMAT, "Container has no ID3 tags")
    encoding = 3
    if key:
        audio.tags["TKEY"] = TKEY(encoding=encoding, text=[key])
    if comment:
        audio.tags.delall("COMM")
        audio.tags.add(COMM(encoding=encoding, lang="XXX", desc="", text=[comment]))
    year_norm = _normalize_year(year)
    if year_norm:
        audio.tags["TYER"] = TYER(encoding=encoding, text=[year_norm])
    if label:
        audio.tags["TPUB"] = TPUB(encoding=encoding, text=[label])
    if bpm:
        audio.tags["TBPM"] = TBPM(encoding=encoding, text=[str(bpm).strip()])
    if genre:
        audio.tags["TCON"] = TCON(encoding=encoding, text=[str(genre).strip()])
    try:
        audio.save()
    except Exception as e:
        return (STATUS_WRITE_ERROR, str(e))
    return (STATUS_OK, None)


def _write_vorbis(
    path: Path,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    suffix = path.suffix.lower()
    if suffix == ".flac":
        from mutagen.flac import FLAC

        audio = FLAC(str(path))
    else:
        from mutagen.oggvorbis import OggVorbis

        audio = OggVorbis(str(path))
    if key:
        audio["KEY"] = [key]
    if comment:
        audio["COMMENT"] = [comment]
    year_norm = _normalize_year(year)
    if year_norm:
        audio["DATE"] = [year_norm]
    if label:
        audio["LABEL"] = [label]
    if bpm:
        audio["BPM"] = [str(bpm).strip()]
    if genre:
        audio["GENRE"] = [str(genre).strip()]
    audio.save()
    return (STATUS_OK, None)


def _write_mutagen_auto(
    path: Path,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    try:
        from mutagen import File
    except ImportError:
        return (STATUS_UNSUPPORTED_FORMAT, "mutagen not available")
    try:
        audio = File(str(path))
    except Exception as e:
        return (STATUS_UNSUPPORTED_FORMAT, str(e))
    if audio is None:
        return (STATUS_UNSUPPORTED_FORMAT, "Unknown format")
    if hasattr(audio, "tags") and audio.tags is None:
        audio.add_tags()
    written = False
    if hasattr(audio, "tags"):
        if key and hasattr(audio.tags, "__setitem__"):
            try:
                audio["KEY"] = key
                written = True
            except Exception:
                pass
        if comment:
            try:
                audio["COMMENT"] = comment
                written = True
            except Exception:
                pass
        year_norm = _normalize_year(year)
        if year_norm:
            try:
                audio["DATE"] = year_norm
                written = True
            except Exception:
                pass
        if label:
            try:
                audio["LABEL"] = label
                written = True
            except Exception:
                pass
        if bpm:
            try:
                audio["BPM"] = str(bpm).strip()
                written = True
            except Exception:
                pass
        if genre:
            try:
                audio["GENRE"] = str(genre).strip()
                written = True
            except Exception:
                pass
    if written:
        try:
            audio.save()
            return (STATUS_OK, None)
        except Exception as e:
            return (STATUS_WRITE_ERROR, str(e))
    return (STATUS_UNSUPPORTED_FORMAT, "Format does not support Key/Comment/Year")
