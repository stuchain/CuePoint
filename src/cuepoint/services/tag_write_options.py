#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a tag write writes: the options inKey's Sync Tags has, and one more (DEC-070).

One definition of the options and their defaults, used by inKey's Sync Tags
(``engine/sync_tags_api.py``) until it retires and by CLEAN-10's job from now
on. :func:`normalize_sync_options` moved here from the engine unchanged, so the
two cannot drift apart: a key format, a toggle and a comment text mean the same
thing, and default the same way, in both.

Today's options and defaults
----------------------------
- ``key_format``: ``normal`` (Rekordbox's classic ``Am``), ``camelot`` (``8A``)
  or ``short`` (``Amin``); ``normal`` by default.
- ``write_key``, ``write_year``, ``write_label`` and ``write_comment`` are on by
  default; ``write_bpm`` and ``write_genre`` are off.
- ``comment_text`` is what the comment says; ``ok`` when blank.

CLEAN-10 adds ``embed_missing_artwork``, **off** by default: putting a picture
into a user's files is new, and it is something a person asks for (DEC-076).

Why the job is stricter than Sync Tags
--------------------------------------
Sync Tags reads a toggle with ``bool(...)``, so ``"false"`` turns a field on.
That is tolerable for a button the renderer drives; it is not for the one job
that writes into files, where a request that meant "no genre" must not write
genre into ten thousand of them. :meth:`TagWriteOptions.from_request` refuses
anything that is not exactly an option of the right type, and only then applies
the shared defaults.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

#: The key notations a write can use.
KEY_FORMAT_NORMAL = "normal"
KEY_FORMAT_CAMELOT = "camelot"
KEY_FORMAT_SHORT = "short"
KEY_FORMATS = (KEY_FORMAT_NORMAL, KEY_FORMAT_CAMELOT, KEY_FORMAT_SHORT)

#: A comment longer than this is a paste gone wrong, not a comment.
MAX_COMMENT_LENGTH = 255

#: Each tag field and the toggle that writes it, in the tag fields' order.
FIELD_TOGGLES: Tuple[Tuple[str, str], ...] = (
    ("key", "write_key"),
    ("year", "write_year"),
    ("label", "write_label"),
    ("bpm", "write_bpm"),
    ("genre", "write_genre"),
    ("comment", "write_comment"),
)

_FLAGS = tuple(toggle for _field, toggle in FIELD_TOGGLES) + ("embed_missing_artwork",)
_TEXTS = ("key_format", "comment_text")
_NAMES = frozenset(_FLAGS + _TEXTS)


def normalize_sync_options(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Today's sync options with their defaults, tolerant of anything missing."""
    opts = raw if isinstance(raw, dict) else {}
    key_format = str(opts.get("key_format") or KEY_FORMAT_NORMAL).strip().lower()
    if key_format not in KEY_FORMATS:
        key_format = KEY_FORMAT_NORMAL
    comment_text = str(opts.get("comment_text") or "ok").strip() or "ok"
    return {
        "key_format": key_format,
        "write_key": bool(opts.get("write_key", True)),
        "write_year": bool(opts.get("write_year", True)),
        "write_bpm": bool(opts.get("write_bpm", False)),
        "write_label": bool(opts.get("write_label", True)),
        "write_genre": bool(opts.get("write_genre", False)),
        "write_comment": bool(opts.get("write_comment", True)),
        "comment_text": comment_text,
    }


@dataclass(frozen=True)
class TagWriteOptions:
    """The fields a tag write writes, and how.

    Build one with :meth:`from_request`, which applies the shared defaults.
    """

    key_format: str
    write_key: bool
    write_year: bool
    write_bpm: bool
    write_label: bool
    write_genre: bool
    write_comment: bool
    comment_text: str
    embed_missing_artwork: bool = False

    def __post_init__(self) -> None:
        """Hold the options to what a write can do.

        Raises:
            ValueError: If an option has the wrong type or value, or nothing
                would be written.
        """
        if self.key_format not in KEY_FORMATS:
            raise ValueError(
                f"key_format must be one of {', '.join(KEY_FORMATS)},"
                f" not {self.key_format!r}"
            )
        for name in _FLAGS:
            if not isinstance(getattr(self, name), bool):
                raise ValueError(f"{name} must be true or false")
        if not isinstance(self.comment_text, str) or not self.comment_text.strip():
            raise ValueError("comment_text must be text")
        if len(self.comment_text) > MAX_COMMENT_LENGTH:
            raise ValueError(
                f"comment_text may be at most {MAX_COMMENT_LENGTH} characters,"
                f" not {len(self.comment_text)}"
            )
        if not self.fields and not self.embed_missing_artwork:
            raise ValueError("Choose at least one field to write, or artwork to embed")

    @classmethod
    def from_request(cls, raw: Any) -> "TagWriteOptions":
        """Build options from a request, refusing anything that is not an option.

        Raises:
            ValueError: Naming the option at fault.
        """
        if raw is None:
            raw = {}
        if not isinstance(raw, dict):
            raise ValueError("options must be an object")
        unknown = sorted(str(name) for name in raw if name not in _NAMES)
        if unknown:
            raise ValueError(
                f"Unknown option {', '.join(unknown)}. Options: {', '.join(sorted(_NAMES))}"
            )
        for name in _FLAGS:
            if name in raw and not isinstance(raw[name], bool):
                raise ValueError(f"{name} must be true or false, not {raw[name]!r}")
        for name in _TEXTS:
            if name in raw and not isinstance(raw[name], str):
                raise ValueError(f"{name} must be text, not {raw[name]!r}")
        if "key_format" in raw and raw["key_format"].strip().lower() not in KEY_FORMATS:
            raise ValueError(
                f"key_format must be one of {', '.join(KEY_FORMATS)},"
                f" not {raw['key_format']!r}"
            )
        values = normalize_sync_options(raw)
        return cls(
            **values,
            embed_missing_artwork=bool(raw.get("embed_missing_artwork", False)),
        )

    @property
    def fields(self) -> Tuple[str, ...]:
        """The tag fields these options write, in the tag fields' order."""
        return tuple(field for field, toggle in FIELD_TOGGLES if getattr(self, toggle))

    def to_dict(self) -> Dict[str, Any]:
        """The options as a request names them."""
        return {
            "key_format": self.key_format,
            "write_key": self.write_key,
            "write_year": self.write_year,
            "write_bpm": self.write_bpm,
            "write_label": self.write_label,
            "write_genre": self.write_genre,
            "write_comment": self.write_comment,
            "comment_text": self.comment_text,
            "embed_missing_artwork": self.embed_missing_artwork,
        }


__all__ = (
    "FIELD_TOGGLES",
    "KEY_FORMATS",
    "KEY_FORMAT_CAMELOT",
    "KEY_FORMAT_NORMAL",
    "KEY_FORMAT_SHORT",
    "MAX_COMMENT_LENGTH",
    "TagWriteOptions",
    "normalize_sync_options",
)
