#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The image guard every picture CuePoint decodes goes through (CLEAN-09, DEC-076).

The input is untrusted twice over — pictures from files that came from anywhere,
bytes from the web — so each step of the guard is tested with the input that
step exists for, and every refusal is an :class:`ArtworkRefused` with a reason,
never another exception:

- **An oversized input** is refused before any decoder sees it.
- **A disallowed format** is refused from its bytes, whatever it claims to be.
- **A decompression bomb** is refused from its header, and Pillow's own warning
  is a refusal too.
- **A truncated or corrupt image** is refused rather than half-decoded.
- **EXIF orientation is applied**, and **no metadata survives** into the output.
"""

from __future__ import annotations

import io
import struct
import zlib
from typing import Tuple
from unittest import mock

import pytest
from PIL import Image, PngImagePlugin

from cuepoint.data import artwork_image
from cuepoint.data.artwork_image import (
    ALLOWED_FORMATS,
    MAX_INPUT_BYTES,
    MAX_PIXELS,
    MAX_THUMBNAIL_SIZE,
    REFUSAL_REASONS,
    REFUSED_CORRUPT,
    REFUSED_DIMENSIONS,
    REFUSED_FORMAT,
    REFUSED_TOO_LARGE,
    ArtworkRefused,
    decode_image,
    encode_jpeg,
    make_thumbnail,
)

RED = (255, 0, 0)
BLUE = (0, 0, 255)


def encoded(image: Image.Image, fmt: str, **options) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, fmt, **options)
    return buffer.getvalue()


def solid(
    size: Tuple[int, int] = (40, 30), colour=RED, mode: str = "RGB"
) -> Image.Image:
    return Image.new(mode, size, colour)


def near(pixel, colour, tolerance: int = 40) -> bool:
    return all(abs(int(a) - int(b)) <= tolerance for a, b in zip(pixel, colour))


def refusal(data) -> str:
    with pytest.raises(ArtworkRefused) as refused:
        decode_image(data)
    return refused.value.reason


def png_declaring(width: int, height: int) -> bytes:
    """A tiny PNG whose header claims a canvas of ``width`` × ``height``."""
    data = bytearray(encoded(solid((1, 1)), "PNG"))
    ihdr = data.index(b"IHDR")
    data[ihdr + 4 : ihdr + 12] = struct.pack(">II", width, height)
    crc = zlib.crc32(bytes(data[ihdr : ihdr + 17])) & 0xFFFFFFFF
    data[ihdr + 17 : ihdr + 21] = struct.pack(">I", crc)
    return bytes(data)


@pytest.mark.unit
class TestWhatIsAllowed:
    @pytest.mark.parametrize("fmt", ALLOWED_FORMATS)
    def test_each_allowed_format_decodes_to_plain_rgb(self, fmt):
        image = decode_image(encoded(solid(), fmt))

        assert image.mode == "RGB"
        assert image.size == (40, 30)
        assert near(image.getpixel((20, 15)), RED)

    def test_the_allow_list_is_the_designed_one(self):
        assert set(ALLOWED_FORMATS) == {"JPEG", "PNG", "WEBP", "GIF", "BMP"}

    def test_a_gif_gives_its_first_frame(self):
        frames = [solid(colour=RED, mode="RGB"), solid(colour=BLUE, mode="RGB")]
        data = encoded(frames[0], "GIF", save_all=True, append_images=frames[1:])

        assert near(decode_image(data).getpixel((0, 0)), RED)

    def test_transparency_is_composited_onto_black(self):
        image = Image.new("RGBA", (10, 10), (255, 0, 0, 0))
        image.putpixel((0, 0), (255, 0, 0, 255))

        decoded = decode_image(encoded(image, "PNG"))

        assert decoded.mode == "RGB"
        assert decoded.getpixel((5, 5)) == (0, 0, 0)
        assert decoded.getpixel((0, 0)) == RED

    def test_a_palette_image_is_converted(self):
        decoded = decode_image(encoded(solid(mode="RGB").convert("P"), "PNG"))

        assert decoded.mode == "RGB" and near(decoded.getpixel((1, 1)), RED)

    @pytest.mark.parametrize("wrap", [bytes, bytearray, memoryview])
    def test_any_bytes_like_input_is_accepted(self, wrap):
        assert decode_image(wrap(encoded(solid(), "PNG"))).size == (40, 30)


@pytest.mark.unit
class TestTooLarge:
    def test_an_input_over_the_byte_cap_is_refused_before_any_decoder_runs(self):
        with mock.patch.object(artwork_image.Image, "open") as opened:
            assert refusal(b"\xff" * (MAX_INPUT_BYTES + 1)) == REFUSED_TOO_LARGE
        opened.assert_not_called()

    def test_an_input_at_the_cap_reaches_the_decoder(self):
        # At exactly the cap it is decoded — and, being noise, refused as such.
        assert refusal(b"\xff" * MAX_INPUT_BYTES) != REFUSED_TOO_LARGE


@pytest.mark.unit
class TestDisallowedFormats:
    @pytest.mark.parametrize("fmt", ["TIFF", "ICO", "PPM", "TGA", "PCX"])
    def test_a_format_off_the_list_is_refused(self, fmt):
        image = solid((16, 16))
        assert refusal(encoded(image, fmt)) == REFUSED_FORMAT

    def test_a_tiff_named_and_typed_as_a_jpeg_is_still_refused(self):
        # Nothing but bytes reaches the guard: a name or MIME type cannot vouch.
        disguised = encoded(solid((16, 16)), "TIFF")

        assert refusal(disguised) == REFUSED_FORMAT

    def test_svg_text_is_refused(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
        assert refusal(svg) == REFUSED_FORMAT

    def test_noise_is_refused(self):
        assert refusal(b"definitely not an image") == REFUSED_FORMAT


@pytest.mark.unit
class TestDecompressionBombs:
    def test_a_small_file_declaring_a_huge_canvas_is_refused_from_its_header(self):
        data = png_declaring(20_000, 20_000)

        assert len(data) < 200
        assert refusal(data) == REFUSED_DIMENSIONS

    def test_just_over_the_pixel_cap_is_refused(self):
        assert refusal(png_declaring(MAX_PIXELS + 1, 1)) == REFUSED_DIMENSIONS

    def test_pillows_bomb_warning_is_a_refusal(self, monkeypatch):
        # Pillow warns above MAX_IMAGE_PIXELS and raises above twice it. The
        # warning alone is refused, so a limit Pillow only warns about holds.
        monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 300)
        assert refusal(encoded(solid((20, 20)), "PNG")) == REFUSED_DIMENSIONS

    def test_pillows_bomb_error_is_a_refusal(self, monkeypatch):
        monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 100)
        assert refusal(encoded(solid((20, 20)), "PNG")) == REFUSED_DIMENSIONS

    def test_a_zero_sized_canvas_is_refused(self):
        assert refusal(png_declaring(0, 10)) in (
            REFUSED_DIMENSIONS,
            REFUSED_FORMAT,
            REFUSED_CORRUPT,
        )


@pytest.mark.unit
class TestCorrupt:
    @pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP", "GIF", "BMP"])
    def test_a_truncated_image_is_refused(self, fmt):
        data = encoded(Image.effect_noise((64, 64), 64).convert("RGB"), fmt)

        assert refusal(data[: len(data) // 2]) == REFUSED_CORRUPT

    def test_no_bytes_is_refused(self):
        assert refusal(b"") == REFUSED_CORRUPT

    @pytest.mark.parametrize("value", [None, "a string", 42])
    def test_something_that_is_not_bytes_is_refused(self, value):
        assert refusal(value) == REFUSED_CORRUPT

    def test_a_refusal_is_a_value_error_with_its_reason(self):
        with pytest.raises(ValueError, match="corrupt"):
            decode_image(b"")

    def test_a_refusal_names_a_known_reason(self):
        with pytest.raises(ValueError):
            ArtworkRefused("because", "no")
        assert ArtworkRefused(REFUSED_FORMAT, "x").reason in REFUSAL_REASONS


@pytest.mark.unit
class TestOrientationAndMetadata:
    def test_an_exif_rotation_comes_out_upright(self):
        # Stored landscape, left half red; orientation 6 says "rotate 90° clockwise
        # to display", so shown upright it is portrait with red on top.
        stored = Image.new("RGB", (40, 20), BLUE)
        stored.paste(RED, (0, 0, 20, 20))
        exif = Image.Exif()
        exif[0x0112] = 6

        upright = decode_image(encoded(stored, "JPEG", exif=exif.tobytes(), quality=95))

        assert upright.size == (20, 40)
        assert near(upright.getpixel((10, 5)), RED)
        assert near(upright.getpixel((10, 35)), BLUE)

    def test_no_metadata_survives_into_a_thumbnail(self):
        exif = Image.Exif()
        exif[0x010F] = "A Camera Maker"
        exif[0x0112] = 1
        icc = b"\x00" * 128
        source = encoded(
            solid((300, 300)),
            "JPEG",
            exif=exif.tobytes(),
            icc_profile=icc,
            comment=b"a comment",
        )
        assert Image.open(io.BytesIO(source)).info.get("icc_profile")

        thumbnail = Image.open(io.BytesIO(make_thumbnail(source, 108)))

        assert thumbnail.format == "JPEG"
        assert not {"exif", "icc_profile", "comment"} & set(thumbnail.info)
        assert len(thumbnail.getexif()) == 0

    def test_png_text_does_not_survive(self):
        text = PngImagePlugin.PngInfo()
        text.add_text("Author", "someone")
        source = encoded(solid((50, 50)), "PNG", pnginfo=text)

        decoded = decode_image(source)

        assert decoded.info == {}
        assert b"someone" not in encode_jpeg(decoded)


@pytest.mark.unit
class TestThumbnails:
    def test_a_thumbnail_keeps_the_aspect_ratio(self):
        thumbnail = Image.open(
            io.BytesIO(make_thumbnail(encoded(solid((400, 200)), "PNG"), 108))
        )

        assert thumbnail.size == (108, 54)

    def test_a_small_image_is_never_enlarged(self):
        thumbnail = Image.open(
            io.BytesIO(make_thumbnail(encoded(solid((50, 50)), "PNG"), 288))
        )

        assert thumbnail.size == (50, 50)

    @pytest.mark.parametrize("size", [0, -1, MAX_THUMBNAIL_SIZE + 1, True, 1.5, "108"])
    def test_a_size_out_of_range_is_refused(self, size):
        with pytest.raises(ValueError, match="thumbnail size"):
            make_thumbnail(encoded(solid(), "PNG"), size)

    def test_a_refused_image_makes_no_thumbnail(self):
        with pytest.raises(ArtworkRefused):
            make_thumbnail(b"nope", 108)


@pytest.mark.unit
def test_only_the_allowed_decoders_are_ever_tried():
    # The format check after opening is a second line; the first is that no
    # other decoder parses a single header byte.
    with mock.patch.object(artwork_image.Image, "open", wraps=Image.open) as opened:
        with pytest.raises(ArtworkRefused):
            decode_image(encoded(solid((16, 16)), "TIFF"))

    assert opened.call_args.kwargs["formats"] == list(ALLOWED_FORMATS)
