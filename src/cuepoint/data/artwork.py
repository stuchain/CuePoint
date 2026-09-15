#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading the picture embedded in an audio file (CLEAN-09, DEC-076).

Every container Rekordbox plays keeps its pictures differently:

- **ID3** — MP3, AIFF and WAV: ``APIC`` frames, each with a picture type;
- **FLAC**: native ``METADATA_BLOCK_PICTURE`` blocks;
- **Ogg** — Vorbis, Opus, FLAC in Ogg: a base64 ``METADATA_BLOCK_PICTURE``
  comment, and the older ``COVERART`` comment some taggers still write;
- **MP4** — M4A and ALAC: the ``covr`` atom, which has no picture types.

The first front cover is chosen, else the first picture of any kind. The bytes
come back as they are stored: nothing here decodes an image, because every
image CuePoint decodes goes through :mod:`cuepoint.data.artwork_image`.

Reading never raises. A file mutagen cannot read, or a picture tag that is
malformed, is reported through :class:`EmbeddedRead.error` so the scan can count
it, instead of failing a scan of fifty thousand files on one.

This module only reads. CLEAN-10 is the one job that writes to audio files.
"""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional, Tuple, Union

#: The picture type ID3 and FLAC use for a front cover.
PICTURE_FRONT_COVER = 3

#: A picture read from a container that has no picture types (MP4).
_UNTYPED = -1


@dataclass(frozen=True)
class EmbeddedRead:
    """What reading a file's embedded picture found.

    Attributes:
        data: The chosen picture's bytes, or None when there is none.
        error: Why the file's pictures could not be read, when they could not.
            A file whose tags were read and hold no picture has neither.
    """

    data: Optional[bytes] = None
    error: Optional[str] = None

    @property
    def present(self) -> bool:
        """True when a picture was found."""
        return self.data is not None

    @property
    def readable(self) -> bool:
        """True when the file's tags could be read at all."""
        return self.error is None


def read_embedded(path: Union[str, Path]) -> Optional[bytes]:
    """The picture embedded in a file: the first front cover, else the first."""
    return inspect_embedded(path).data


def inspect_embedded(path: Union[str, Path]) -> EmbeddedRead:
    """Read a file's embedded pictures and say what was found. Never raises."""
    try:
        import mutagen

        audio = mutagen.File(str(path))
    except Exception as exc:  # noqa: BLE001 — any file can be anything
        return EmbeddedRead(error=f"tags could not be read: {exc}")
    if audio is None:
        return EmbeddedRead(error="not an audio format whose tags can be read")
    try:
        pictures = _pictures(audio)
    except Exception as exc:  # noqa: BLE001 — a malformed picture tag
        return EmbeddedRead(error=f"a picture tag is malformed: {exc}")
    if not pictures:
        return EmbeddedRead()
    for kind, data in pictures:
        if kind == PICTURE_FRONT_COVER:
            return EmbeddedRead(data=data)
    return EmbeddedRead(data=pictures[0][1])


def _pictures(audio: Any) -> List[Tuple[int, bytes]]:
    """Every picture a file holds, as ``(type, bytes)``, in stored order."""
    found: List[Tuple[int, bytes]] = []

    flac_pictures = getattr(audio, "pictures", None)
    if flac_pictures:
        found.extend((int(p.type), bytes(p.data)) for p in flac_pictures if p.data)

    tags = getattr(audio, "tags", None)
    if tags is None:
        return found

    if hasattr(tags, "getall"):  # ID3
        found.extend(
            (int(frame.type), bytes(frame.data))
            for frame in tags.getall("APIC")
            if frame.data
        )
        return found

    keys = {str(key).lower(): key for key in _keys(tags)}
    if "covr" in keys:  # MP4
        found.extend((_UNTYPED, bytes(cover)) for cover in tags[keys["covr"]] if cover)
        return found

    if "metadata_block_picture" in keys or "coverart" in keys:  # Ogg
        from mutagen.flac import Picture

        for value in _values(tags, keys.get("metadata_block_picture")):
            picture = Picture(_base64(value))
            if picture.data:
                found.append((int(picture.type), bytes(picture.data)))
        for value in _values(tags, keys.get("coverart")):
            data = _base64(value)
            if data:
                found.append((_UNTYPED, data))
    return found


def _keys(tags: Any) -> List[Any]:
    try:
        return list(tags.keys())
    except Exception:  # noqa: BLE001 — a tag container with no keys has none
        return []


def _values(tags: Any, key: Any) -> List[str]:
    if key is None:
        return []
    value = tags[key]
    return [str(item) for item in value] if isinstance(value, list) else [str(value)]


def _base64(value: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"a picture is not valid base64: {exc}") from None


__all__ = (
    "EmbeddedRead",
    "PICTURE_FRONT_COVER",
    "inspect_embedded",
    "read_embedded",
)
