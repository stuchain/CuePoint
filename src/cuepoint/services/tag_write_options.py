#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a tag write writes: the options inKey's Sync Tags had, and one more (DEC-070).

One definition of the options and their defaults, for CLEAN-10's job.
:func:`normalize_sync_options` moved here from the engine unchanged while inKey's
Sync Tags still shared it, so the two could not drift apart; Sync Tags retired
with inKey (CLEAN-14, DEC-071) and the defaults it defined carry on here.

Today's options and defaults
----------------------------
- ``key_format``: ``normal`` (Rekordbox's classic ``Am``), ``camelot`` (``8A``)
  or ``short`` (``Amin``); ``normal`` by default.
- ``write_key``, ``write_year``, ``write_label`` and ``write_comment`` are on by
  default; ``write_bpm`` and ``write_genre`` are off.
- ``comment_text`` is what the comment says; ``ok`` when blank.

CLEAN-10 adds ``embed_missing_artwork``, **off** by default: putting a picture
into a user's files is new, and it is something a person asks for (DEC-076).

``keep_existing`` is **off** by default too, so a request that does not name it
means what it always did: a field the file already holds is replaced. When on, a
field whose file value is not empty is left alone (C29).

Why the job is stricter than Sync Tags was
------------------------------------------
Sync Tags read a toggle with ``bool(...)``, so ``"false"`` turned a field on.
That was tolerable for a button the renderer drove; it is not for the one job
that writes into files, where a request that meant "no genre" must not write
genre into ten thousand of them. :meth:`TagWriteOptions.from_request` refuses
anything that is not exactly an option of the right type, and only then applies
the shared defaults.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

#: The key notations a write can use.
KEY_FORMAT_NORMAL = "normal"
KEY_FORMAT_CAMELOT = "camelot"
KEY_FORMAT_SHORT = "short"
KEY_FORMATS = (KEY_FORMAT_NORMAL, KEY_FORMAT_CAMELOT, KEY_FORMAT_SHORT)

#: A comment longer than this is a paste gone wrong, not a comment.
MAX_COMMENT_LENGTH = 255


def clean_comment_text(text: str) -> str:
    """A comment as a file may hold it: one line, no control characters, trimmed.

    A line break or tab becomes a space (a pasted paragraph stays readable); any
    other control character (NUL, escape, the C1 range) is dropped, because a
    tag frame must not carry them and Rekordbox shows them as boxes.
    """
    kept = []
    for char in text:
        if ord(char) in range(9, 14) or unicodedata.category(char) in ("Zl", "Zp"):
            kept.append(" ")
        elif unicodedata.category(char) not in ("Cc", "Cs"):
            kept.append(char)
    return "".join(kept).strip()


#: Each tag field and the toggle that writes it, in the tag fields' order.
FIELD_TOGGLES: Tuple[Tuple[str, str], ...] = (
    ("key", "write_key"),
    ("year", "write_year"),
    ("label", "write_label"),
    ("bpm", "write_bpm"),
    ("genre", "write_genre"),
    ("comment", "write_comment"),
)

_FLAGS = tuple(toggle for _field, toggle in FIELD_TOGGLES) + (
    "embed_missing_artwork",
    "keep_existing",
)
_TEXTS = ("key_format", "comment_text")
_NAMES = frozenset(_FLAGS + _TEXTS)


def normalize_sync_options(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Each option with its default filled in, tolerant of anything missing.

    Lenient on its own, as Sync Tags used it; :meth:`TagWriteOptions.from_request`
    refuses a wrong type before it gets here.
    """
    opts = raw if isinstance(raw, dict) else {}
    key_format = str(opts.get("key_format") or KEY_FORMAT_NORMAL).strip().lower()
    if key_format not in KEY_FORMATS:
        key_format = KEY_FORMAT_NORMAL
    comment_text = clean_comment_text(str(opts.get("comment_text") or "")) or "ok"
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
    keep_existing: bool = False

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
        if clean_comment_text(self.comment_text) != self.comment_text.strip():
            raise ValueError("comment_text may not hold control characters")
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
        raw = cls._checked(raw)
        values = normalize_sync_options(raw)
        return cls(
            **values,
            embed_missing_artwork=bool(raw.get("embed_missing_artwork", False)),
            keep_existing=bool(raw.get("keep_existing", False)),
        )

    @classmethod
    def nothing_ticked(cls, raw: Any) -> bool:
        """True when a well-formed request, defaults applied, writes nothing at all.

        A save window with every box unticked is a question with an answer, not a
        bad request; this lets a counting route tell it from a malformed one.

        Raises:
            ValueError: Naming the option at fault, as :meth:`from_request` does.
        """
        raw = cls._checked(raw)
        values = normalize_sync_options(raw)
        ticked = any(values[toggle] for _field, toggle in FIELD_TOGGLES)
        return not ticked and not bool(raw.get("embed_missing_artwork", False))

    @staticmethod
    def _checked(raw: Any) -> Dict[str, Any]:
        """The request as an object, once every option in it is of the right type."""
        if raw is None:
            raw = {}
        if not isinstance(raw, dict):
            raise ValueError("options must be an object")
        unknown = sorted(str(name) for name in raw if name not in _NAMES)
        if unknown:
            raise ValueError(
                f"Unknown option {', '.join(unknown)!r}. Options: {', '.join(sorted(_NAMES))}"
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
        return raw

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
            "keep_existing": self.keep_existing,
        }


__all__ = (
    "FIELD_TOGGLES",
    "KEY_FORMATS",
    "KEY_FORMAT_CAMELOT",
    "KEY_FORMAT_NORMAL",
    "KEY_FORMAT_SHORT",
    "MAX_COMMENT_LENGTH",
    "TagWriteOptions",
    "clean_comment_text",
    "normalize_sync_options",
)
