#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading the picture a file carries (CLEAN-09, DEC-076).

Every container Rekordbox plays keeps pictures its own way, so each is tested on
a real file: the silent fixtures in ``fixtures/audio`` as they are (no picture),
and a copy of each given a picture by mutagen. Ogg has no fixture and no encoder
on a developer machine, so a minimal Ogg Opus stream is built page by page.

- **Each format with a picture, and without one.**
- **The front cover wins**, else the first picture.
- **A malformed picture or an unreadable file is a finding, never an exception.**
- **Reading changes nothing** in the file.
"""

from __future__ import annotations

import base64
import io
import shutil
import struct
from pathlib import Path
from typing import Callable, Dict

import pytest
from mutagen.aiff import AIFF
from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, ID3
from mutagen.mp4 import MP4, MP4Cover
from mutagen.ogg import OggPage
from mutagen.oggopus import OggOpus
from mutagen.wave import WAVE
from PIL import Image

from cuepoint.data.artwork import (
    PICTURE_FRONT_COVER,
    EmbeddedRead,
    inspect_embedded,
    read_embedded,
)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "audio"

PICTURE_OTHER = 0
PICTURE_BACK_COVER = 4


def png(colour: str) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), colour).save(buffer, "PNG")
    return buffer.getvalue()


FRONT = png("red")
BACK = png("blue")


def flac_picture(data: bytes, kind: int) -> Picture:
    picture = Picture()
    picture.type = kind
    picture.mime = "image/png"
    picture.data = data
    return picture


def copy_fixture(tmp_path: Path, name: str) -> Path:
    target = tmp_path / name
    shutil.copy(FIXTURES / name, target)
    return target


def build_opus(path: Path) -> Path:
    """A one-second Ogg Opus stream: identification, comments, one audio page."""
    head = b"OpusHead" + bytes([1, 2]) + struct.pack("<HIhB", 312, 48000, 0, 0)
    comments = b"OpusTags" + struct.pack("<I", 4) + b"test" + struct.pack("<I", 0)
    packets = [(head, 0), (comments, 0), (b"\xfc\xff\xfe", 48312)]
    stream = b""
    for sequence, (packet, position) in enumerate(packets):
        page = OggPage()
        page.serial = 7
        page.sequence = sequence
        page.position = position
        page.first = sequence == 0
        page.last = sequence == len(packets) - 1
        page.packets = [packet]
        stream += page.write()
    path.write_bytes(stream)
    return path


def with_id3(kind: Callable[[str], object]) -> Callable[[Path, Dict[int, bytes]], None]:
    def add(path: Path, pictures: Dict[int, bytes]) -> None:
        audio = kind(str(path))
        if audio.tags is None:  # type: ignore[attr-defined]
            audio.add_tags()  # type: ignore[attr-defined]
        for picture_type, data in pictures.items():
            audio.tags.add(  # type: ignore[attr-defined]
                APIC(
                    encoding=3,
                    mime="image/png",
                    type=picture_type,
                    desc=str(picture_type),
                    data=data,
                )
            )
        audio.save()  # type: ignore[attr-defined]

    return add


def mp3_pictures(path: Path, pictures: Dict[int, bytes]) -> None:
    tags = ID3()
    for picture_type, data in pictures.items():
        tags.add(
            APIC(
                encoding=3,
                mime="image/png",
                type=picture_type,
                desc=str(picture_type),
                data=data,
            )
        )
    tags.save(str(path))


def flac_pictures(path: Path, pictures: Dict[int, bytes]) -> None:
    audio = FLAC(str(path))
    for picture_type, data in pictures.items():
        audio.add_picture(flac_picture(data, picture_type))
    audio.save()


def opus_pictures(path: Path, pictures: Dict[int, bytes]) -> None:
    audio = OggOpus(str(path))
    audio["metadata_block_picture"] = [
        base64.b64encode(flac_picture(data, kind).write()).decode("ascii")
        for kind, data in pictures.items()
    ]
    audio.save()


#: name: how a picture is added to a copy of it.
TYPED_FORMATS = {
    "tone.mp3": mp3_pictures,
    "tone.wav": with_id3(WAVE),
    "tone.aiff": with_id3(AIFF),
    "tone.flac": flac_pictures,
    "tone.opus": opus_pictures,
}


def audio_file(tmp_path: Path, name: str) -> Path:
    if name == "tone.opus":
        return build_opus(tmp_path / name)
    return copy_fixture(tmp_path, name)


@pytest.mark.unit
class TestEachFormat:
    @pytest.mark.parametrize("name", [*TYPED_FORMATS, "tone.m4a"])
    def test_a_file_without_a_picture_has_none(self, tmp_path, name):
        found = inspect_embedded(audio_file(tmp_path, name))

        assert found == EmbeddedRead()
        assert found.readable and not found.present

    @pytest.mark.parametrize("name", TYPED_FORMATS)
    def test_a_file_with_a_picture_gives_its_bytes(self, tmp_path, name):
        path = audio_file(tmp_path, name)
        TYPED_FORMATS[name](path, {PICTURE_FRONT_COVER: FRONT})

        found = inspect_embedded(path)

        assert found.data == FRONT
        assert found.present and found.readable
        assert read_embedded(path) == FRONT

    def test_an_mp4_cover_is_read(self, tmp_path):
        path = copy_fixture(tmp_path, "tone.m4a")
        audio = MP4(str(path))
        audio["covr"] = [MP4Cover(FRONT, imageformat=MP4Cover.FORMAT_PNG)]
        audio.save()

        assert read_embedded(path) == FRONT

    def test_the_first_mp4_cover_is_chosen(self, tmp_path):
        # MP4 has no picture types, so "front cover" cannot be asked.
        path = copy_fixture(tmp_path, "tone.m4a")
        audio = MP4(str(path))
        audio["covr"] = [
            MP4Cover(BACK, imageformat=MP4Cover.FORMAT_PNG),
            MP4Cover(FRONT, imageformat=MP4Cover.FORMAT_PNG),
        ]
        audio.save()

        assert read_embedded(path) == BACK

    def test_the_legacy_ogg_coverart_comment_is_read(self, tmp_path):
        path = build_opus(tmp_path / "tone.opus")
        audio = OggOpus(str(path))
        audio["coverart"] = [base64.b64encode(FRONT).decode("ascii")]
        audio.save()

        assert read_embedded(path) == FRONT


@pytest.mark.unit
class TestWhichPicture:
    @pytest.mark.parametrize("name", TYPED_FORMATS)
    def test_the_front_cover_wins_over_a_picture_stored_before_it(self, tmp_path, name):
        path = audio_file(tmp_path, name)
        TYPED_FORMATS[name](
            path, {PICTURE_BACK_COVER: BACK, PICTURE_FRONT_COVER: FRONT}
        )

        assert read_embedded(path) == FRONT

    @pytest.mark.parametrize("name", TYPED_FORMATS)
    def test_without_a_front_cover_the_first_picture_is_used(self, tmp_path, name):
        path = audio_file(tmp_path, name)
        TYPED_FORMATS[name](path, {PICTURE_BACK_COVER: BACK, PICTURE_OTHER: FRONT})

        assert read_embedded(path) == BACK

    def test_an_empty_picture_is_no_picture(self, tmp_path):
        path = copy_fixture(tmp_path, "tone.flac")
        flac_pictures(path, {PICTURE_FRONT_COVER: b""})

        assert inspect_embedded(path) == EmbeddedRead()


@pytest.mark.unit
class TestNeverRaises:
    def test_a_picture_that_is_not_base64_is_a_malformed_tag(self, tmp_path):
        path = build_opus(tmp_path / "tone.opus")
        audio = OggOpus(str(path))
        audio["metadata_block_picture"] = ["this is not base64!"]
        audio.save()

        found = inspect_embedded(path)

        assert found.data is None
        assert not found.readable
        assert "malformed" in (found.error or "")

    def test_a_picture_block_that_is_not_a_picture_is_a_malformed_tag(self, tmp_path):
        path = build_opus(tmp_path / "tone.opus")
        audio = OggOpus(str(path))
        audio["metadata_block_picture"] = [
            base64.b64encode(b"\x00\x00").decode("ascii")
        ]
        audio.save()

        found = inspect_embedded(path)

        assert found.data is None and not found.readable

    def test_a_file_that_is_not_audio_is_reported(self, tmp_path):
        path = tmp_path / "notes.mp3"
        path.write_bytes(b"not audio at all")

        found = inspect_embedded(path)

        assert found.data is None and not found.readable

    def test_a_missing_file_is_reported(self, tmp_path):
        found = inspect_embedded(tmp_path / "gone.flac")

        assert found.data is None and not found.readable
        assert read_embedded(tmp_path / "gone.flac") is None

    def test_a_truncated_file_is_reported_or_empty_but_never_raises(self, tmp_path):
        path = copy_fixture(tmp_path, "tone.flac")
        flac_pictures(path, {PICTURE_FRONT_COVER: FRONT})
        data = path.read_bytes()
        path.write_bytes(data[: len(data) // 3])

        found = inspect_embedded(path)

        assert isinstance(found, EmbeddedRead)


@pytest.mark.unit
@pytest.mark.parametrize("name", [*TYPED_FORMATS, "tone.m4a"])
def test_reading_changes_nothing_in_the_file(tmp_path, name):
    path = audio_file(tmp_path, name)
    if name in TYPED_FORMATS:
        TYPED_FORMATS[name](path, {PICTURE_FRONT_COVER: FRONT})
    before = (path.read_bytes(), path.stat().st_mtime_ns)

    inspect_embedded(path)
    read_embedded(path)

    assert (path.read_bytes(), path.stat().st_mtime_ns) == before


@pytest.mark.unit
def test_an_empty_ogg_picture_is_no_picture(tmp_path):
    path = build_opus(tmp_path / "tone.opus")
    opus_pictures(path, {PICTURE_FRONT_COVER: b""})

    assert inspect_embedded(path) == EmbeddedRead()
