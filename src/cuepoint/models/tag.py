#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A tag (ORG-01, DEC-015).

Flat and user-defined, with an optional category label and an optional colour —
``{name, category?, colour?}``, exactly the shape DEC-015 chose over a nested
hierarchy. There is no tag tree, and there is no category *entity*: a category
is a label written on a tag, and the vocabulary of categories is whatever
categories are currently in use.

That is worth stating plainly because the pull towards a category table is
strong and DEC-015 already refused it. "Mood: Dark" is one tag with a label on
it, not a child of a Mood node.

Names are one namespace, case-insensitively
-------------------------------------------
``Peak-time`` and ``peak-time`` are the same tag, enforced by a unique index on
``name COLLATE NOCASE`` in ``m0009_organization``. The normalization here is
only whitespace: the name keeps the case the user typed, because a tag they
wrote as ``DUB`` should read as ``DUB``. Case-insensitive *identity* with
case-preserving *display* is what the collation buys, and it is why creating a
tag that already exists is answered by handing back the existing one (ORG-03)
rather than by an error about capitalization.

Colour
------
A **token name**, not a colour. ORG-01 left this free-form and said ORG-03 would
constrain it; this is that constraint. Every theme defines the same accent
tokens, so a tag coloured ``danger`` is red in one theme and a different red in
the next, and stays legible in all five — while a hex value picked against the
dark theme is unreadable in three of the other four
(``PIXEL_DESIGN_SYSTEM.md`` §2). A tag colour is chrome, not content.

Five, plus none. ``--accent-secondary`` is excluded deliberately: in
``clubNeon`` it is ``#1a1a28``, a near-black panel fill rather than a hue, so a
tag wearing it would be invisible in exactly the theme most likely to be
running.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from cuepoint.models.library_track import utc_now_iso

#: A tag name is a label, not a paragraph. Long enough for anything a DJ would
#: type, short enough that a chip stays a chip.
MAX_TAG_NAME_LENGTH = 60

#: Same reasoning, for the optional category label.
MAX_TAG_CATEGORY_LENGTH = 60

#: The colours a tag may wear, as theme-token names. The renderer resolves each
#: to ``var(--accent-<name>)``; nothing here knows what red looks like, which is
#: what keeps a tag legible when the theme changes underneath it.
TAG_COLOURS = ("primary", "success", "warning", "danger", "info")


@dataclass
class Tag:
    """One tag in the flat, user-defined vocabulary.

    Attributes:
        name: What the user typed, trimmed. Unique case-insensitively across
            the table; the case is preserved for display.
        category: An optional grouping label, or ``None``. Not a foreign key,
            not a node, not a parent — DEC-015 is explicit about this.
        colour: One of :data:`TAG_COLOURS`, or ``None``. A theme-token name
            rather than a colour value.
        id: Database primary key; ``None`` until persisted.
        created_at: When the tag was made.
    """

    name: str
    category: Optional[str] = None
    colour: Optional[str] = None
    id: Optional[int] = None
    created_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        """Normalize and validate the label fields."""
        self.name = normalize_tag_name(self.name)
        self.category = normalize_tag_category(self.category)
        self.colour = normalize_tag_colour(self.colour)

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "colour": self.colour,
            "created_at": self.created_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "Tag":
        """Build a tag from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            name=data.get("name") or "",
            category=data.get("category"),
            colour=data.get("colour"),
            created_at=data.get("created_at") or utc_now_iso(),
        )


def _normalize_optional(value: Any) -> Optional[str]:
    """Return a trimmed string, or ``None`` when there is nothing there.

    An empty string and ``None`` would look different in the database and
    identical to a user; only one of them can be the way to say "unset".
    """
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_tag_name(value: Any) -> str:
    """Return a usable tag name.

    Raises:
        ValueError: If the name is empty or too long. An unnamed tag cannot be
            found again, applied deliberately, or told apart from another one.
    """
    name = "" if value is None else str(value).strip()
    if not name:
        raise ValueError("A tag needs a name")
    if len(name) > MAX_TAG_NAME_LENGTH:
        raise ValueError(
            f"A tag name may be at most {MAX_TAG_NAME_LENGTH} characters, "
            f"got {len(name)}"
        )
    return name


def normalize_tag_category(value: Any) -> Optional[str]:
    """Return a category label, or ``None``.

    Raises:
        ValueError: If the label is longer than
            :data:`MAX_TAG_CATEGORY_LENGTH`.
    """
    category = _normalize_optional(value)
    if category is not None and len(category) > MAX_TAG_CATEGORY_LENGTH:
        raise ValueError(
            f"A tag category may be at most {MAX_TAG_CATEGORY_LENGTH} characters, "
            f"got {len(category)}"
        )
    return category


def normalize_tag_colour(value: Any) -> Optional[str]:
    """Return a colour token, or ``None`` for an uncoloured tag.

    Raises:
        ValueError: If the value is not one of :data:`TAG_COLOURS`. Refused
            rather than ignored: a tag silently losing the colour a user picked
            is a change they would notice and could not explain.
    """
    colour = _normalize_optional(value)
    if colour is None:
        return None
    if colour not in TAG_COLOURS:
        known = ", ".join(TAG_COLOURS)
        raise ValueError(f"A tag colour must be one of {known}, got {value!r}")
    return colour


@dataclass(frozen=True)
class TagUsage:
    """A tag and how many tracks carry it.

    Every surface over the vocabulary needs the count beside the tag — a list
    to pick from shows what is actually used, and every destructive action has
    to say how much it affects before it happens. Answering it in the same
    query as the tags themselves is what keeps that from becoming one count
    query per row.
    """

    tag: Tag
    track_count: int = 0

    @classmethod
    def from_row(cls, row: Any) -> "TagUsage":
        """Build from a row carrying the tag columns plus ``track_count``."""
        data = dict(row)
        return cls(
            tag=Tag.from_row(data), track_count=int(data.get("track_count") or 0)
        )
