#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The one decoder every image CuePoint reads goes through (CLEAN-09, DEC-076 as amended).

Artwork arrives from two untrusted places: pictures embedded in audio files that
came from anywhere, and bytes a web server returned. Image decoders are a
classic attack surface, so no other code in CuePoint decodes an image: the table
row and the Inspector get a thumbnail made here, and CLEAN-10 embeds a picture
re-encoded here.

The guard, in the order it is applied:

1. **A byte cap before anything is parsed.** An embedded picture or a download
   larger than :data:`MAX_INPUT_BYTES` is refused unread.
2. **An allow-list of formats, decided from the bytes.** JPEG, PNG, WebP, GIF
   (its first frame) and BMP only. Pillow is asked to try only those decoders,
   so a file's name, a MIME type or a server's claim play no part, and a TIFF,
   an SVG or a PSD dressed as a JPEG is simply not recognized.
3. **A dimension cap before pixels are decoded**, and Pillow's own
   decompression-bomb check with its warning treated as a refusal. A small file
   that declares a gigantic canvas is refused from its header.
4. **A full decode**, so a truncated or corrupt image fails here rather than
   producing half a picture.
5. **EXIF orientation applied, then converted to RGB**, transparency composited
   onto black, and **every piece of metadata dropped**: EXIF, ICC profiles and
   comments do not survive into what CuePoint writes.

A refusal is :class:`ArtworkRefused` with a reason from :data:`REFUSAL_REASONS`.
It is an answer about the image, not a failure of the caller: the scan records
the artwork as unreadable and counts it, and nobody retries it in a loop.
"""

from __future__ import annotations

import io
import struct
import warnings
from typing import Tuple, Union

from PIL import Image, ImageOps, UnidentifiedImageError

#: Bytes refused before decoding. Front covers are rarely over a few megabytes;
#: a Beatport image at its largest is well under one.
MAX_INPUT_BYTES = 16 * 1024 * 1024

#: Pixels refused before decoding: 6,000 × 6,000 and a little. Beyond any cover
#: art, and far below what would exhaust memory decoding it.
MAX_PIXELS = 36_000_000

#: The decoders an image may be read by, named as Pillow names them.
ALLOWED_FORMATS: Tuple[str, ...] = ("JPEG", "PNG", "WEBP", "GIF", "BMP")

#: The largest thumbnail anything may ask for.
MAX_THUMBNAIL_SIZE = 2048

#: JPEG quality for everything written here.
JPEG_QUALITY = 85

#: Why an image was refused.
REFUSED_TOO_LARGE = "too_large"
REFUSED_FORMAT = "format"
REFUSED_DIMENSIONS = "dimensions"
REFUSED_CORRUPT = "corrupt"
REFUSAL_REASONS = (
    REFUSED_TOO_LARGE,
    REFUSED_FORMAT,
    REFUSED_DIMENSIONS,
    REFUSED_CORRUPT,
)

ImageBytes = Union[bytes, bytearray, memoryview]


class ArtworkRefused(ValueError):
    """An image the guard would not decode, and why."""

    def __init__(self, reason: str, detail: str) -> None:
        if reason not in REFUSAL_REASONS:
            raise ValueError(f"reason must be one of {REFUSAL_REASONS}, got {reason!r}")
        super().__init__(f"Artwork refused ({reason}): {detail}")
        self.reason = reason
        self.detail = detail


def decode_image(data: ImageBytes) -> Image.Image:
    """Decode untrusted bytes into an upright, metadata-free RGB image.

    Raises:
        ArtworkRefused: If any step of the guard refuses the image.
    """
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise ArtworkRefused(
            REFUSED_CORRUPT, f"expected bytes, got {type(data).__name__}"
        )
    size = len(data)
    if size == 0:
        raise ArtworkRefused(REFUSED_CORRUPT, "no bytes")
    if size > MAX_INPUT_BYTES:
        raise ArtworkRefused(
            REFUSED_TOO_LARGE,
            f"{size:,} bytes is over the {MAX_INPUT_BYTES:,}-byte cap",
        )

    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            with Image.open(
                io.BytesIO(bytes(data)), formats=list(ALLOWED_FORMATS)
            ) as source:
                if (
                    source.format not in ALLOWED_FORMATS
                ):  # pragma: no cover - belt and braces
                    raise ArtworkRefused(
                        REFUSED_FORMAT, f"{source.format} is not allowed"
                    )
                width, height = source.size
                if width <= 0 or height <= 0 or width * height > MAX_PIXELS:
                    raise ArtworkRefused(
                        REFUSED_DIMENSIONS,
                        f"{width} × {height} is over the {MAX_PIXELS:,}-pixel cap",
                    )
                source.seek(0)
                source.load()
                upright = ImageOps.exif_transpose(source)
                return _rgb(upright if upright is not None else source)
        except ArtworkRefused:
            raise
        except UnidentifiedImageError as exc:
            raise ArtworkRefused(
                REFUSED_FORMAT, f"not an allowed image format: {exc}"
            ) from None
        except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise ArtworkRefused(REFUSED_DIMENSIONS, str(exc)) from None
        except (OSError, SyntaxError, ValueError, EOFError, struct.error) as exc:
            raise ArtworkRefused(
                REFUSED_CORRUPT, str(exc) or type(exc).__name__
            ) from None


def _rgb(image: Image.Image) -> Image.Image:
    """The image as plain RGB with nothing but its pixels."""
    if image.mode == "P":
        image = image.convert("RGBA")
    if image.mode in ("RGBA", "LA"):
        ground = Image.new("RGB", image.size, (0, 0, 0))
        ground.paste(image.convert("RGBA"), mask=image.convert("RGBA").getchannel("A"))
        converted = ground
    else:
        converted = image.convert("RGB")
    # A fresh image carries no metadata. `convert` would copy `info`, and the
    # JPEG writer reads an ICC profile from it when none is passed.
    clean = Image.new("RGB", converted.size)
    clean.paste(converted)
    return clean


def encode_jpeg(image: Image.Image) -> bytes:
    """Write an image the guard produced as a JPEG with no metadata."""
    out = io.BytesIO()
    image.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def make_thumbnail(data: ImageBytes, size: int) -> bytes:
    """Decode untrusted bytes and return a JPEG no larger than ``size`` on a side.

    The aspect ratio is kept, and a smaller image is never enlarged.

    Raises:
        ValueError: If ``size`` is not between 1 and :data:`MAX_THUMBNAIL_SIZE`.
        ArtworkRefused: If the guard refuses the image.
    """
    if (
        isinstance(size, bool)
        or not isinstance(size, int)
        or not 1 <= size <= MAX_THUMBNAIL_SIZE
    ):
        raise ValueError(f"A thumbnail size is 1 to {MAX_THUMBNAIL_SIZE}, not {size!r}")
    image = decode_image(data)
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    return encode_jpeg(image)


__all__ = (
    "ALLOWED_FORMATS",
    "ArtworkRefused",
    "JPEG_QUALITY",
    "MAX_INPUT_BYTES",
    "MAX_PIXELS",
    "MAX_THUMBNAIL_SIZE",
    "REFUSAL_REASONS",
    "REFUSED_CORRUPT",
    "REFUSED_DIMENSIONS",
    "REFUSED_FORMAT",
    "REFUSED_TOO_LARGE",
    "decode_image",
    "encode_jpeg",
    "make_thumbnail",
)
