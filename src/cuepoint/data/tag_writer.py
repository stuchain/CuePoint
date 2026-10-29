"""Write Key, Comment, and Year to audio file tags (ID3/Vorbis) for Reload Tags in Rekordbox."""

from __future__ import annotations

import logging
import struct
from pathlib import Path
from typing import Any, List, Optional, Tuple

from cuepoint.data.tag_save import MESSAGE_TAGS_DIFFER, TagSaveError, save_via_copy
from cuepoint.utils.long_path import os_path

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


def _set_id3_year(tags, year: str, encoding: int) -> None:
    """Set an ID3 tag's year so that the save keeps it.

    mutagen reads a year as the v2.4 ``TDRC`` frame, translating a v2.3 ``TYER``
    into one, and on saving translates between the two for the version written.
    A ``TYER`` added beside a ``TDRC`` the file already had was therefore dropped
    by every save, whichever version it wrote: the write reported success and the
    file kept its old year. So the year is set as ``TDRC``, and any ``TYER`` is
    removed.
    """
    from mutagen.id3 import TDRC

    tags.delall("TYER")
    tags["TDRC"] = TDRC(encoding=encoding, text=[year])


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
    MP3, WAV, AIFF (ID3), FLAC/OGG (Vorbis comments) and M4A/MP4 (iTunes atoms). Does not raise;
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
    path = Path(os_path(str(Path(str(file_path).strip()).resolve()), reserve=64))
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
        # HARDEN-04 / DEC-183: every write goes to a copy beside the file, which
        # is checked and then replaces the original (see tag_save).
        return save_via_copy(
            path,
            lambda work: _dispatch(work, suffix, key, comment, year, label, bpm, genre),
            accept=lambda outcome: outcome[0] == STATUS_OK,
            verify=lambda work: _verify_tags(
                work, suffix, key, comment, year, label, bpm, genre
            ),
        )
    except TagSaveError as e:
        _logger.warning("Tag write refused for %s: %s", file_path, e)
        return (STATUS_WRITE_ERROR, str(e))
    except Exception as e:
        _logger.warning("Tag write failed for %s", file_path, exc_info=True)
        return (STATUS_WRITE_ERROR, str(e))


def _dispatch(
    path: Path,
    suffix: str,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str],
    bpm: Optional[str],
    genre: Optional[str],
) -> Tuple[str, Optional[str]]:
    """Run the writer for a format on ``path`` (the copy; ``suffix`` is the file's)."""
    if suffix == ".mp3":
        return _write_id3(path, key, comment, year, label, bpm, genre)
    if suffix == ".wav":
        return _write_wav(path, key, comment, year, label, bpm, genre)
    if suffix in (".aiff", ".aif"):
        return _write_id3_in_container(path, key, comment, year, label, bpm, genre)
    if suffix == ".flac":
        return _write_flac(path, key, comment, year, label, bpm, genre)
    if suffix == ".ogg":
        return _write_vorbis(path, key, comment, year, label, bpm, genre, suffix)
    if suffix in MP4_SUFFIXES:
        return _write_mp4(path, key, comment, year, label, bpm, genre)
    return _write_mutagen_auto(path, key, comment, year, label, bpm, genre)


#: The MP4 family the writer has a dedicated path for.
MP4_SUFFIXES = (".m4a", ".mp4", ".m4b")

# M4A / MP4 atoms (before 1.0.0 these went under made-up atoms nothing reads).
#
# comment, genre, year and BPM use the iTunes atoms every player and Rekordbox
# read: ``\xa9cmt``, ``\xa9gen``, ``\xa9day`` and ``tmpo`` (a list of integers).
#
# key is the freeform ``----:com.apple.iTunes:initialkey``: Mixed In Key writes
# the key there, and MusicBrainz Picard and mutagen's own docs map "key" to it.
# label is the freeform ``----:com.apple.iTunes:LABEL``: that is Picard's mapping
# for a label (M4A has no standard label atom), and it matches the ``LABEL``
# comment the Vorbis writers use. Freeform values are UTF-8 bytes.
MP4_ATOMS = {
    "key": "----:com.apple.iTunes:initialkey",
    "comment": "\xa9cmt",
    "year": "\xa9day",
    "label": "----:com.apple.iTunes:LABEL",
    "bpm": "tmpo",
    "genre": "\xa9gen",
}

#: What versions before 1.0.0 wrote, as mutagen stores them (four bytes, padded
#: with NUL). Read as a fallback, and removed whenever a file is written.
MP4_LEGACY_ATOMS = {
    "key": "KEY\x00",
    "comment": "COMM",
    "year": "DATE",
    "label": "LABE",
    "bpm": "BPM\x00",
    "genre": "GENR",
}


def _mp4_text(value: Any) -> str:
    """One atom value as text: freeform values are bytes, the rest are str or int."""
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", errors="replace")
    return str(value)


def _mp4_bpm(bpm: Optional[str]) -> Optional[int]:
    """The integer ``tmpo`` holds for a BPM text (``126.4`` -> 126), or None."""
    if bpm is None:
        return None
    try:
        value = int(round(float(str(bpm).strip())))
    except (ValueError, OverflowError):
        return None
    return value if 0 < value < 65536 else None


def read_mp4_fields(tags: Any, legacy_fallback: bool = True) -> "dict[str, str]":
    """The six fields of an M4A/MP4 tag set, as text, by their standard atoms.

    With ``legacy_fallback`` a field the standard atom does not hold is read from
    the atom older versions wrote it under, so a file saved before 1.0.0 still
    shows its values. Fields the file holds nowhere are left out.
    """
    found: dict[str, str] = {}
    for field, atom in MP4_ATOMS.items():
        names = (atom, MP4_LEGACY_ATOMS[field]) if legacy_fallback else (atom,)
        for name in names:
            values = [_mp4_text(v) for v in (tags.get(name) or [])]
            if values:
                found[field] = values[0]
                break
    return found


def _write_mp4(
    path: Path,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    """Write the six fields to an M4A/MP4 under the standard atoms (see MP4_ATOMS).

    A value an earlier version stored under a made-up atom and that this call
    does not replace is carried over to the standard atom; the made-up atoms are
    then removed, so the file ends up clean.
    """
    try:
        from mutagen.mp4 import MP4, AtomDataType, MP4FreeForm
    except ImportError:
        return (STATUS_UNSUPPORTED_FORMAT, "mutagen not available")
    try:
        audio = MP4(str(path))
    except Exception as e:
        return (STATUS_UNSUPPORTED_FORMAT, str(e))
    if audio.tags is None:
        audio.add_tags()
    tags = audio.tags
    if tags is None:  # add_tags always sets them
        return (STATUS_WRITE_ERROR, "Could not create MP4 tags")

    def freeform(text: str) -> Any:
        return MP4FreeForm(text.encode("utf-8"), dataformat=AtomDataType.UTF8)

    carried = read_mp4_fields(tags)  # standard first, then the made-up atoms
    new: dict[str, Any] = {}
    if key:
        new["key"] = [freeform(key)]
    if comment:
        new["comment"] = [comment]
    year_norm = _normalize_year(year)
    if year_norm:
        new["year"] = [year_norm]
    if label:
        new["label"] = [freeform(label)]
    tempo = _mp4_bpm(bpm)
    if tempo is not None:
        new["bpm"] = [tempo]
    if genre:
        new["genre"] = [genre]
    for field, atom in MP4_ATOMS.items():
        if field in new:
            tags[atom] = new[field]
        elif atom not in tags and field in carried:
            text = carried[field]
            if field == "bpm":
                number = _mp4_bpm(text)
                if number is not None:
                    tags[atom] = [number]
            elif field in ("key", "label"):
                tags[atom] = [freeform(text)]
            else:
                tags[atom] = [text]
    for legacy in MP4_LEGACY_ATOMS.values():
        if legacy in tags:
            del tags[legacy]
    try:
        audio.save()
    except Exception as e:
        return (STATUS_WRITE_ERROR, str(e))
    return (STATUS_OK, None)


def _texts(frame: Any) -> List[str]:
    return ["\x00".join(str(item) for item in getattr(frame, "text", []))]


def _verify_id3(tags: Any, expected: "dict[str, Optional[str]]") -> bool:
    singles = {
        "key": "TKEY",
        "year": "TDRC",
        "label": "TPUB",
        "bpm": "TBPM",
        "genre": "TCON",
    }
    for field, frame_id in singles.items():
        wanted = expected.get(field)
        if wanted is None:
            continue
        frames = tags.getall(frame_id)
        if not frames or _texts(frames[0])[0] != wanted:
            return False
    comment = expected.get("comment")
    if comment is not None:
        if comment not in [_texts(frame)[0] for frame in tags.getall("COMM")]:
            return False
    return True


def _verify_comments(
    audio: Any, expected: "dict[str, Optional[str]]", flac: bool
) -> bool:
    names = {
        "key": "KEY",
        "year": "DATE",
        "label": "LABEL",
        "bpm": "BPM",
        "genre": "GENRE",
        "comment": "COMMENT",
    }
    for field, name in names.items():
        wanted = expected.get(field)
        if wanted is None:
            continue
        if [str(v) for v in (audio.get(name) or [])] != [wanted]:
            return False
        if field == "key" and flac:
            if [str(v) for v in (audio.get("INITIALKEY") or [])] != [wanted]:
                return False
    return True


def _verify_mp4(tags: Any, expected: "dict[str, Optional[str]]") -> bool:
    """The standard atoms hold what was written and no made-up atom is left."""
    if tags is None:
        return False
    held = read_mp4_fields(tags, legacy_fallback=False)
    for field, wanted in expected.items():
        if wanted is None:
            continue
        if field == "bpm":
            tempo = _mp4_bpm(wanted)
            if tempo is not None and held.get("bpm") != str(tempo):
                return False
        elif held.get(field) != wanted:
            return False
    return not any(name in tags for name in MP4_LEGACY_ATOMS.values())


def _verify_tags(
    work: Path,
    suffix: str,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str],
    bpm: Optional[str],
    genre: Optional[str],
) -> None:
    """Raise TagSaveError unless the copy's tags read back as the writer wrote them.

    The writer's own rules decide the expected text: WAV is Latin-1, years are
    four digits, M4A values sit under the standard iTunes atoms. A format
    whose tags this does not know how to read back (APE, ASF, ...) is only
    checked to open.
    """
    wav = suffix == ".wav"
    clean = _latin1_safe if wav else _str_opt
    expected = {
        "key": clean(key),
        "comment": clean(comment),
        "year": _normalize_year(year),
        "label": clean(label),
        "bpm": clean(bpm),
        "genre": clean(genre),
    }
    from mutagen import File
    from mutagen.id3 import ID3
    from mutagen._vorbis import VComment  # noqa: PLC2701
    from mutagen.mp4 import MP4

    try:
        if suffix == ".mp3":
            ok = _verify_id3(ID3(str(work)), expected)
        else:
            audio = File(str(work))
            if audio is None:
                raise TagSaveError(MESSAGE_TAGS_DIFFER)
            tags = getattr(audio, "tags", None)
            if isinstance(tags, ID3):
                ok = _verify_id3(tags, expected)
            elif isinstance(audio, MP4):
                ok = _verify_mp4(audio.tags, expected)
            elif isinstance(tags, VComment):
                ok = _verify_comments(audio, expected, suffix == ".flac")
            else:
                ok = tags is not None  # unknown tag kind: it opened and has tags
    except TagSaveError:
        raise
    except Exception as exc:  # noqa: BLE001 - a copy that cannot be read back
        raise TagSaveError(MESSAGE_TAGS_DIFFER) from exc
    if not ok:
        raise TagSaveError(MESSAGE_TAGS_DIFFER)


def _write_id3(
    path: Path,
    key: Optional[str],
    comment: Optional[str],
    year: Optional[str],
    label: Optional[str] = None,
    bpm: Optional[str] = None,
    genre: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    from mutagen.id3 import ID3, COMM, TKEY, TBPM, TCON, TPUB
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
        _set_id3_year(audio, year_norm, encoding)
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

    def append(work: Path) -> None:
        with open(work, "r+b") as f:
            wave_file = _WaveFile(f)
            wave_file.insert_chunk("LIST", b"INFO" + data)

    def has_list(work: Path) -> None:
        with open(work, "rb") as f:
            if "LIST" not in _WaveFile(f):
                raise TagSaveError(MESSAGE_TAGS_DIFFER)

    try:
        save_via_copy(path, append, verify=has_list)  # HARDEN-04: copy, check, swap
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
        from mutagen.id3 import COMM, TKEY, TBPM, TCON, TPUB
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
    tags = audio.tags
    if tags is None:  # add_tags always sets them
        return (STATUS_WRITE_ERROR, "Could not create ID3 tags")
    # ID3v2.3 only allows Latin-1 (0) and UTF-16 (1); use 0 for maximum compatibility (e.g. Rekordbox).
    encoding = 0
    k = _latin1_safe(key)
    if k:
        tags["TKEY"] = TKEY(encoding=encoding, text=[k])
    c = _latin1_safe(comment)
    if c:
        tags.delall("COMM")
        tags.add(COMM(encoding=encoding, lang="XXX", desc="", text=[c]))
    year_norm = _normalize_year(year)
    if year_norm:
        _set_id3_year(tags, year_norm, encoding)
    lb = _latin1_safe(label)
    if lb:
        tags["TPUB"] = TPUB(encoding=encoding, text=[lb])
    b = _latin1_safe(bpm)
    if b:
        tags["TBPM"] = TBPM(encoding=encoding, text=[b])
    g = _latin1_safe(genre)
    if g:
        tags["TCON"] = TCON(encoding=encoding, text=[g])
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
        from mutagen.id3 import ID3, COMM, TKEY, TBPM, TCON, TPUB
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
        _set_id3_year(audio.tags, year_norm, encoding)
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
    suffix: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    suffix = (suffix or path.suffix).lower()
    audio: "FLAC | OggVorbis"
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
