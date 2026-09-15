#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Real audio files for tests that read and write tags (CLEAN-10).

The recorded tones in ``fixtures/audio`` are copied, never touched. Ogg Vorbis
has no recorded fixture and no encoder on a developer machine, so a minimal
stream is built page by page: an identification header, the comment header and
setup header on one page (as mutagen rewrites them), and one audio page.

:func:`tag_dump` reads a file's tags **without** ``cuepoint.data.tag_fields``,
so a test that restores through that module is checked by something else.
"""

from __future__ import annotations

import base64
import hashlib
import io
import shutil
import struct
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

FIXTURES = Path(__file__).resolve().parent / "audio"

#: The formats CLEAN-10 writes, by extension.
SUPPORTED = ("mp3", "aiff", "flac", "ogg")


def build_ogg_vorbis(path: Path) -> Path:
    """A one-second Ogg Vorbis stream mutagen reads, tags and saves."""
    from mutagen.ogg import OggPage

    ident = (
        b"\x01vorbis"
        + struct.pack("<IBIiii", 0, 2, 44100, 0, 128000, 0)
        + bytes([0xB8, 1])
    )
    comment = (
        b"\x03vorbis" + struct.pack("<I", 4) + b"test" + struct.pack("<I", 0) + b"\x01"
    )
    setup = b"\x05vorbis" + b"\x00" * 16
    pages = [
        ([ident], 0, True, False),
        ([comment, setup], 0, False, False),
        ([b"\x00" * 10], 44100, False, True),
    ]
    stream = b""
    for sequence, (packets, position, first, last) in enumerate(pages):
        page = OggPage()
        page.serial = 9
        page.sequence = sequence
        page.position = position
        page.first = first
        page.last = last
        page.packets = packets
        stream += page.write()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(stream)
    return path


def audio_copy(directory: Path, kind: str, name: Optional[str] = None) -> Path:
    """A fresh file of a kind (``mp3``, ``aiff``, ``flac``, ``ogg``, ``wav``, ``m4a``)."""
    target = Path(directory) / (name or f"tone.{kind}")
    target.parent.mkdir(parents=True, exist_ok=True)
    if kind == "ogg":
        return build_ogg_vorbis(target)
    shutil.copy(FIXTURES / f"tone.{kind}", target)
    return target


def jpeg_bytes(colour: str = "red", size: Tuple[int, int] = (40, 20)) -> bytes:
    """A small JPEG."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, colour).save(buffer, "JPEG")
    return buffer.getvalue()


def _sha(data: bytes) -> str:
    return hashlib.sha256(bytes(data)).hexdigest()


def tag_dump(path: Path) -> Dict[str, Any]:
    """Every tag value a file holds, read with mutagen directly.

    Text frames and comments by value, pictures by type, MIME type, description
    and a hash of their bytes. Encodings are not values, and neither is the
    order comments are stored in.
    """
    suffix = Path(path).suffix.lower()
    if suffix in (".mp3", ".aiff", ".aif"):
        from mutagen.aiff import AIFF
        from mutagen.id3 import ID3, ID3NoHeaderError

        if suffix == ".mp3":
            try:
                tags: Any = ID3(str(path))
            except ID3NoHeaderError:
                return {}
        else:
            tags = AIFF(str(path)).tags
            if tags is None:
                return {}
        dump: Dict[str, Any] = {}
        for key in sorted(tags.keys()):
            frame = tags[key]
            if frame.FrameID == "APIC":
                dump[key] = (frame.type, frame.mime, frame.desc, _sha(frame.data))
            elif frame.FrameID == "COMM":
                dump[key] = (frame.lang, frame.desc, [str(t) for t in frame.text])
            elif hasattr(frame, "text"):
                dump[key] = [str(t) for t in frame.text]
            else:
                dump[key] = repr(frame)
        return dump
    if suffix in (".flac", ".ogg"):
        from mutagen.flac import FLAC, Picture
        from mutagen.oggvorbis import OggVorbis

        audio: Any = FLAC(str(path)) if suffix == ".flac" else OggVorbis(str(path))
        comments: List[Tuple[str, str]] = []
        for key, value in audio.tags or []:
            if key.lower() == "metadata_block_picture":
                picture = Picture(base64.b64decode(value))
                comments.append(
                    (key.lower(), f"picture:{picture.type}:{_sha(picture.data)}")
                )
            else:
                comments.append((key.lower(), value))
        pictures = [
            (picture.type, picture.mime, picture.desc, _sha(picture.data))
            for picture in getattr(audio, "pictures", [])
        ]
        return {"comments": sorted(comments), "pictures": pictures}
    raise ValueError(f"No dump for {suffix}")
