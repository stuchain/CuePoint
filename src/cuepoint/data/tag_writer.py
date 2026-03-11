"""Write Key, Comment, and Year to audio file tags (ID3/Vorbis) for Reload Tags in Rekordbox."""

from __future__ import annotations

import logging
import struct
from pathlib import Path
from typing import Optional, Tuple

_logger = logging.getLogger(__name__)

# Status return values
STATUS_OK = "OK"
STATUS_FILE_NOT_FOUND = "FILE_NOT_FOUND"
STATUS_UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
STATUS_WRITE_ERROR = "WRITE_ERROR"


def _str_opt(value: Optional[str]) -> Optional[str]:
    """Return stripped non-empty string or None. Ensures key/comment/label/bpm/genre are written consistently."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _latin1_safe(value: Optional[str]) -> Optional[str]:
    """Return a string safe for ID3v2.3 Latin-1 (encoding 0); non-ASCII replaced with '?'."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s.encode("latin-1", errors="replace").decode("latin-1")


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
    # Resolve to absolute path so we always open the same file (avoids relative-path issues)
    path = Path(str(file_path).strip()).resolve()
    if not path.exists():
        return (STATUS_FILE_NOT_FOUND, f"File not found: {file_path}")
    # Normalize so empty/whitespace is not written and key is never skipped
    key = _str_opt(key)
    comment = _str_opt(comment)
    label = _str_opt(label)
    bpm = _str_opt(bpm)
    genre = _str_opt(genre)
    suffix = path.suffix.lower().strip()
    try:
        if suffix == ".mp3":
            return _write_id3(path, key, comment, year, label, bpm, genre)
        if suffix == ".wav":
            return _write_wav(path, key, comment, year, label, bpm, genre)
        if suffix in (".aiff", ".aif"):
            return _write_id3_in_container(path, key, comment, year, label, bpm, genre)
        if suffix == ".flac":
            return _write_flac(path, key, comment, year, label, bpm, genre)
        if suffix == ".ogg":
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


def _build_wav_list_info_data(
    comment: Optional[str],
    key: Optional[str],
    year: Optional[str],
    label: Optional[str],
    genre: Optional[str],
) -> bytes:
    """Build RIFF LIST-INFO chunk data (INFO type + subchunks) for WAV.

    Many apps (including Rekordbox) read WAV metadata from LIST-INFO rather than
    ID3. Subchunks: ICMT (comment), IKEY (key), ICRD (date), IPRD (label), IGNR (genre).
    """
    parts: list[bytes] = [b"INFO"]
    year_norm = _normalize_year(year)

    def _add(id4: str, value: Optional[str]) -> None:
        if not value or not str(value).strip():
            return
        raw = str(value).strip().encode("utf-8") + b"\x00"
        if len(raw) % 2:
            raw += b"\x00"
        parts.append(id4.encode("ascii"))
        parts.append(struct.pack("<I", len(raw)))
        parts.append(raw)

    _add("ICMT", comment)
    _add("IKEY", key)
    _add("ICRD", year_norm)
    _add("IPRD", label)
    _add("IGNR", genre)
    if len(parts) == 1:
        return b""
    return b"".join(parts[1:])


def _write_wav_list_info(
    path: Path,
    comment: Optional[str],
    key: Optional[str],
    year: Optional[str],
    label: Optional[str],
    genre: Optional[str],
) -> None:
    """Append a RIFF LIST-INFO chunk to a WAV file so Rekordbox can read metadata.

    Does not raise; logs and returns if mutagen internals or file structure fail.
    """
    data = _build_wav_list_info_data(comment, key, year, label, genre)
    if not data:
        return
    try:
        from mutagen.wave import _WaveFile  # noqa: PLC2701
    except ImportError:
        _logger.debug("mutagen.wave not available for LIST-INFO write")
        return
    try:
        with open(path, "r+b") as f:
            wave_file = _WaveFile(f)
            wave_file.insert_chunk("LIST", b"INFO" + data)
    except Exception as e:
        _logger.warning("Could not write LIST-INFO to WAV %s: %s", path, e)


def _delete_wav_id3_chunk(path: Path) -> None:
    """Remove existing id3 chunk from WAV so a new one can be appended last (for Rekordbox)."""
    try:
        from mutagen.wave import _WaveFile  # noqa: PLC2701

        with open(path, "r+b") as f:
            wave_file = _WaveFile(f)
            if "id3" in wave_file:
                wave_file.delete_chunk("id3")
    except Exception as e:
        _logger.debug("Could not delete existing id3 chunk from WAV %s: %s", path, e)


def _write_wav(
    path: Path,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    """Write ID3v2.3 tags (Latin-1 only) to WAV; id3 chunk is always last. No LIST-INFO (ID3 is better supported)."""
    try:
        from mutagen.wave import WAVE
        from mutagen.id3 import COMM, TKEY, TBPM, TCON, TPUB, TYER
    except ImportError:
        return (STATUS_UNSUPPORTED_FORMAT, "mutagen not available")
    path_str = str(path)
    try:
        audio = WAVE(path_str)
    except Exception as e:
        return (STATUS_UNSUPPORTED_FORMAT, str(e))
    if audio.tags is None:
        try:
            audio.add_tags()
        except Exception as e:
            return (STATUS_WRITE_ERROR, str(e))
    # ID3v2.3 only allows Latin-1 (0) and UTF-16 (1); use 0 for maximum compatibility (e.g. Rekordbox).
    encoding = 0
    k = _latin1_safe(key)
    if k:
        audio.tags["TKEY"] = TKEY(encoding=encoding, text=[k])
    c = _latin1_safe(comment)
    if c:
        audio.tags.delall("COMM")
        audio.tags.add(COMM(encoding=encoding, lang="XXX", desc="", text=[c]))
    year_norm = _normalize_year(year)
    if year_norm:
        audio.tags["TYER"] = TYER(encoding=encoding, text=[year_norm])
    lb = _latin1_safe(label)
    if lb:
        audio.tags["TPUB"] = TPUB(encoding=encoding, text=[lb])
    b = _latin1_safe(bpm)
    if b:
        audio.tags["TBPM"] = TBPM(encoding=encoding, text=[b])
    g = _latin1_safe(genre)
    if g:
        audio.tags["TCON"] = TCON(encoding=encoding, text=[g])
    # Ensure id3 is the last chunk: remove any existing id3, then save (mutagen appends new id3).
    _delete_wav_id3_chunk(path)
    try:
        audio.save(v2_version=3)
    except Exception as e:
        return (STATUS_WRITE_ERROR, str(e))
    return (STATUS_OK, None)


def _write_flac(
    path: Path,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    """Write Vorbis comments to FLAC; KEY and INITIALKEY for key (Windows/Serato use INITIALKEY)."""
    try:
        from mutagen.flac import FLAC
    except ImportError:
        return (STATUS_UNSUPPORTED_FORMAT, "mutagen not available")
    try:
        audio = FLAC(str(path))
    except Exception as e:
        return (STATUS_WRITE_ERROR, str(e))
    if key:
        audio["KEY"] = [key]
        audio["INITIALKEY"] = [key]
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
    try:
        audio.save()
    except Exception as e:
        return (STATUS_WRITE_ERROR, str(e))
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
    """Write ID3 TKEY/COMM/TYER/TPUB/TBPM/TCON to AIFF via mutagen File container."""
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
        if suffix == ".flac":
            audio["INITIALKEY"] = [key]
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
                audio["KEY"] = [key]
                written = True
            except Exception:
                try:
                    audio["KEY"] = key
                    written = True
                except Exception:
                    pass
        if comment:
            try:
                audio["COMMENT"] = [comment]
                written = True
            except Exception:
                try:
                    audio["COMMENT"] = comment
                    written = True
                except Exception:
                    pass
        year_norm = _normalize_year(year)
        if year_norm:
            try:
                audio["DATE"] = [year_norm]
                written = True
            except Exception:
                try:
                    audio["DATE"] = year_norm
                    written = True
                except Exception:
                    pass
        if label:
            try:
                audio["LABEL"] = [label]
                written = True
            except Exception:
                try:
                    audio["LABEL"] = label
                    written = True
                except Exception:
                    pass
        if bpm:
            try:
                audio["BPM"] = [str(bpm)]
                written = True
            except Exception:
                try:
                    audio["BPM"] = str(bpm)
                    written = True
                except Exception:
                    pass
        if genre:
            try:
                audio["GENRE"] = [str(genre)]
                written = True
            except Exception:
                try:
                    audio["GENRE"] = str(genre)
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
