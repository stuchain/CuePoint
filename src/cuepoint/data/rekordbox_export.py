#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Patching a Rekordbox XML with CuePoint's values (EXPORT-01, DEC-077).

CuePoint has never parsed a cue point or a beat grid: ``POSITION_MARK`` and
``TEMPO`` appear nowhere in ``src/``, and ``tracks`` holds twenty columns of
metadata and stops there. So an XML *generated* from the database would hand a
DJ back a library with every hot cue, memory cue and grid gone — silently, and
discovered in a booth. DEC-077 therefore never generates.

This module patches instead. It locates the ``COLLECTION/TRACK`` elements of the
file the library was imported from and rewrites **only the attribute values
CuePoint owns**, splicing bytes into a copy of the original. Everything else —
cue points, tempo marks, unknown attributes, the declaration, comments,
whitespace, attribute order, entity spellings — survives because nothing
rebuilds it.

Why bytes and not ``ElementTree``
---------------------------------
A tree round-trip cannot make the byte-preservation promise. ``ElementTree``
drops comments and processing instructions, rewrites the declaration, re-escapes
text its own way and normalizes empty elements, so a "patched" file would differ
from its source in thousands of places nobody asked to change — and a diff would
then be useless for telling whether CuePoint did what it said. Expat gives the
exact byte offset of every start tag, which is all a targeted rewrite needs, and
it is a real XML parser: a ``<TRACK`` inside a comment or a CDATA section is not
mistaken for an element, and attribute values arrive unescaped for comparison.

Why an attribute is written only when it differs
------------------------------------------------
DEC-079 writes the effective value — CuePoint's override when there is one,
otherwise the import — and sets an attribute only where that value differs from
what the file holds. For the four values that have a notation of their own, the
comparison is on the *parsed* value, so ``AverageBpm="128"`` and ``128.00`` are
one value and neither is rewritten as the other, and a ``Rating="3"`` written by
some other tool is not rewritten as ``153`` on a track nobody rated in CuePoint.
For the key it is the rendered text, because the notation is the user's choice
(DEC-089) and a Camelot export must actually put Camelot in the file.

What this module does not do
----------------------------
It does not render a key. ``services/tag_write_service.py::key_text`` is the one
implementation of that conversion and it lives a layer up, so the caller renders
and this module writes what it is given — which is also why nothing here imports
from ``services/``.
"""

import logging
import os
import tempfile
import xml.parsers.expat as expat
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Mapping, Optional, Sequence, Set, Tuple

from cuepoint.data.rekordbox import (
    MAX_XML_SIZE_BYTES,
    _measured_int,
    _optional_bpm,
    _optional_text,
    _rating_to_stars,
    _stars_to_rating,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError

_logger = logging.getLogger(__name__)

#: The COLLECTION TRACK attribute for each field CuePoint owns.
#:
#: These are the names the importer reads and Rekordbox itself writes. The
#: orphaned writer this replaces emitted ``BPM`` and ``Comment`` instead of
#: ``AverageBpm`` and ``Comments``, so neither value ever reached Rekordbox, and
#: it also set ``Key`` on a COLLECTION TRACK — which is Rekordbox's alternative
#: spelling of ``TrackID`` on a *playlist entry* and sits in the importer's own
#: ``TrackID or ID or Key`` identity fallback. Writing it would put a key where a
#: track id is looked for.
ATTR_KEY = "Tonality"
ATTR_BPM = "AverageBpm"
ATTR_GENRE = "Genre"
ATTR_LABEL = "Label"
ATTR_YEAR = "Year"
ATTR_RATING = "Rating"

#: The six fields, in a stable order, with the attribute each one writes.
EXPORT_FIELDS: Tuple[Tuple[str, str], ...] = (
    ("key", ATTR_KEY),
    ("bpm", ATTR_BPM),
    ("genre", ATTR_GENRE),
    ("label", ATTR_LABEL),
    ("year", ATTR_YEAR),
    ("rating", ATTR_RATING),
)

#: Attributes this module must never write, with the reason. Kept as data rather
#: than as a comment so a test can assert no exported field ever maps to one.
FORBIDDEN_ATTRS: Mapping[str, str] = {
    "Key": "Key is TrackID's alternative spelling on a playlist entry",
    "BPM": "Rekordbox writes AverageBpm",
    "Comment": "Rekordbox writes Comments",
    "Comments": "DEC-080 keeps notes and tags in CuePoint",
    "TotalTime": "a patch never rewrites a length it did not change",
    "Location": "DEC-073 fixes paths in Rekordbox, not here",
}

_ASCII_ENCODINGS = frozenset({"us-ascii", "ascii"})
_SUPPORTED_ENCODINGS = frozenset({"utf-8", "utf8"}) | _ASCII_ENCODINGS
_BOM = b"\xef\xbb\xbf"
_WHITESPACE = b" \t\r\n"
_NAME_STOP = _WHITESPACE + b"=/>"
_TAG_STOP = _WHITESPACE + b"/>"


@dataclass(frozen=True)
class TrackExportValues:
    """The effective values for one track (DEC-079).

    ``None`` means "no value to write", which is not the same as "write an empty
    value": DEC-079 never clears an attribute, so a field with nothing in either
    layer leaves the file's own value alone.

    ``key`` is the text to put in ``Tonality`` — already in the export's chosen
    notation, rendered by ``key_text`` a layer up. ``rating`` is a star count of
    0–5, and ``0`` is a rating a user gave rather than the absence of one.
    """

    key: Optional[str] = None
    bpm: Optional[float] = None
    genre: Optional[str] = None
    label: Optional[str] = None
    year: Optional[int] = None
    rating: Optional[int] = None


@dataclass
class PatchResult:
    """What a patch did, for EXPORT-04's preview and EXPORT-05's record."""

    #: COLLECTION TRACK elements the source held.
    tracks_seen: int = 0
    #: Distinct track ids this patch changed, counted once each.
    tracks_changed: int = 0
    #: Field name to the number of tracks whose value for it changed.
    fields_changed: Dict[str, int] = field(default_factory=dict)
    #: Track ids asked for that the source does not contain.
    not_found: Tuple[str, ...] = ()
    #: Start tags rewritten — above ``tracks_changed`` only if a source repeats
    #: a track id, which Rekordbox does not do but a hand-edited file might.
    elements_patched: int = 0

    @property
    def changed(self) -> bool:
        return self.tracks_changed > 0


@dataclass(frozen=True)
class _ValueSpan:
    """Where an attribute's value sits in the source bytes, and how it is quoted."""

    start: int
    end: int
    quote: int


@dataclass(frozen=True)
class _StartTag:
    """One start tag's attribute value spans and where a new attribute may go."""

    values: Mapping[str, _ValueSpan]
    insert_at: int


# --------------------------------------------------------------- public surface


def refuse_source_as_destination(source_path: str, destination_path: str) -> None:
    """Raise when a destination would overwrite the source XML (DEC-083).

    "Always a new file, never the source" has been this repository's safety
    property since the first attribute patch, and it has been a habit of the call
    sites rather than a rule the code enforces. It is enforced here, at the lowest
    level that writes, so every caller inherits it and EXPORT-05 has one
    implementation to reuse rather than a second to keep in step.

    Paths are compared resolved and case-folded, so a relative path, a trailing
    separator, a case difference on Windows or a symlink cannot defeat it.
    """

    def normalized(path: str) -> str:
        try:
            resolved = str(Path(path).resolve(strict=False))
        except OSError:  # pragma: no cover - resolve() on a hostile path
            resolved = os.path.abspath(path)
        return os.path.normcase(resolved)

    if normalized(source_path) == normalized(destination_path):
        raise ValidationError(
            "Refusing to write the export over the collection it was read from: "
            f"{destination_path}. Choose a different file."
        )


def patch_collection_xml(
    source_path: str,
    updates: Mapping[str, TrackExportValues],
    destination_path: str,
) -> PatchResult:
    """Write a copy of ``source_path`` with CuePoint's values applied.

    Args:
        source_path: The Rekordbox XML the library was imported from (DEC-035).
        updates: Track id, as the importer reads it, to that track's effective
            values. A track absent from this map is not touched at all.
        destination_path: Where to write. Never the source (DEC-083).

    Returns:
        A :class:`PatchResult` counting what changed and what was not found.

    Raises:
        FileNotFoundError: The source does not exist.
        ValidationError: The source is too large, its encoding is not one this
            can splice, it is not well-formed, or the destination is the source.
        OSError: Writing failed.
    """
    refuse_source_as_destination(source_path, destination_path)

    if not os.path.exists(source_path):
        raise FileNotFoundError(f"XML file not found: {source_path}")
    size = os.path.getsize(source_path)
    if size > MAX_XML_SIZE_BYTES:
        raise ValidationError(
            f"XML file too large: {size} bytes (max {MAX_XML_SIZE_BYTES}). "
            "Refusing to parse to prevent resource exhaustion."
        )

    with open(source_path, "rb") as handle:
        data = handle.read()

    encoding = _document_encoding(data)
    result = PatchResult()
    edits: List[Tuple[int, int, bytes]] = []
    seen_ids: Set[str] = set()
    changed_fields: Dict[str, Set[str]] = {}

    # One parse, one pass. Counting is per track id rather than per element so a
    # source that repeats one cannot inflate "how many tracks did this change".
    for offset, attrs in _collection_track_tags(data):
        result.tracks_seen += 1
        track_id = _identity(attrs)
        if track_id is not None:
            seen_ids.add(track_id)
        if track_id is None or track_id not in updates:
            continue
        changes = _changes_for(attrs, updates[track_id])
        if not changes:
            continue
        changed_fields.setdefault(track_id, set()).update(changes)
        edits.extend(_edits_for(_read_start_tag(data, offset), changes, encoding))
        result.elements_patched += 1

    result.tracks_changed = len(changed_fields)
    for fields in changed_fields.values():
        for name in fields:
            result.fields_changed[name] = result.fields_changed.get(name, 0) + 1
    result.not_found = tuple(
        track_id for track_id in updates if track_id not in seen_ids
    )

    _write_atomically(data, edits, destination_path)
    return result


# ------------------------------------------------------------------- internals


def _document_encoding(data: bytes) -> str:
    """The encoding the document declares, or raise when it cannot be spliced.

    Splicing bytes into a document means encoding replacement text the way the
    rest of the file is encoded. UTF-8 (with or without a BOM) and ASCII are
    byte-compatible with that, and are what Rekordbox writes. A UTF-16 document
    would make every offset and every splice wrong, so it is refused by name
    rather than corrupted quietly.

    Returns ``"utf-8"`` or ``"ascii"``. The distinction matters at write time:
    putting UTF-8 bytes into a document that declares ``us-ascii`` would make it
    malformed, so a non-ASCII value goes in as numeric character references
    instead (:func:`_escape`).
    """
    head = data[:256]
    if head.startswith(_BOM):
        head = head[len(_BOM) :]
    if not head.startswith(b"<?xml"):
        return "utf-8"
    closing = head.find(b"?>")
    if closing == -1:
        return "utf-8"
    declaration = head[:closing].decode("ascii", errors="replace")
    marker = declaration.find("encoding")
    if marker == -1:
        return "utf-8"
    fragment = declaration[marker + len("encoding") :].lstrip()
    if not fragment.startswith("="):
        return "utf-8"
    fragment = fragment[1:].lstrip()
    if fragment[:1] not in {'"', "'"}:
        return "utf-8"
    quote = fragment[0]
    end = fragment.find(quote, 1)
    if end == -1:
        return "utf-8"
    declared = fragment[1:end].strip().lower()
    if declared in _ASCII_ENCODINGS:
        return "ascii"
    if declared not in _SUPPORTED_ENCODINGS:
        raise ValidationError(
            f"Unsupported XML encoding {declared!r}: CuePoint can export only "
            "UTF-8 or ASCII Rekordbox collections. Re-export the collection from "
            "Rekordbox and import it again."
        )
    return "utf-8"


def _collection_track_tags(data: bytes) -> Sequence[Tuple[int, Dict[str, str]]]:
    """``(byte offset, attributes)`` for each ``COLLECTION/TRACK`` element.

    Expat does the finding, so a ``<TRACK`` inside a comment, a CDATA section or
    a processing instruction is not mistaken for one, and values arrive
    unescaped. Only a direct child of ``COLLECTION`` counts: a ``TRACK`` under
    ``PLAYLISTS`` is an entry referencing a track, not the track.
    """
    found: List[Tuple[int, Dict[str, str]]] = []
    stack: List[str] = []
    parser = expat.ParserCreate()

    def start(name: str, attrs: Dict[str, str]) -> None:
        if name == "TRACK" and stack and stack[-1] == "COLLECTION":
            found.append((parser.CurrentByteIndex, dict(attrs)))
        stack.append(name)

    def end(_name: str) -> None:
        if stack:
            stack.pop()

    parser.StartElementHandler = start
    parser.EndElementHandler = end
    try:
        parser.Parse(data, True)
    except expat.ExpatError as exc:
        raise ValidationError(f"The collection XML is not well-formed: {exc}") from exc
    return found


def _identity(attrs: Mapping[str, str]) -> Optional[str]:
    """The track id, read exactly as ``_library_track_from_element`` reads it."""
    raw = (attrs.get("TrackID") or attrs.get("ID") or attrs.get("Key") or "").strip()
    return raw or None


def _read_start_tag(data: bytes, offset: int) -> _StartTag:
    """Locate every attribute value span in one start tag, and where to append.

    Inside a start tag the only structure is ``name = "value"``, so a scan that
    respects quotes is exact — and expat has already proved the document
    well-formed before this runs, so anything unexpected ends the scan rather
    than being guessed at. A new attribute is inserted straight after the last
    existing one rather than before the closing bracket, which keeps
    ``<TRACK … />``'s own spacing instead of doubling a space.
    """
    index = offset + 1
    length = len(data)
    while index < length and data[index : index + 1] not in _TAG_STOP:
        index += 1
    insert_at = index
    values: Dict[str, _ValueSpan] = {}

    while index < length:
        while index < length and data[index : index + 1] in _WHITESPACE:
            index += 1
        if index >= length or data[index : index + 1] in b"/>":
            break
        name_start = index
        while index < length and data[index : index + 1] not in _NAME_STOP:
            index += 1
        name = data[name_start:index].decode("ascii", errors="replace")
        while index < length and data[index : index + 1] in _WHITESPACE:
            index += 1
        if index >= length or data[index : index + 1] != b"=":
            break
        index += 1
        while index < length and data[index : index + 1] in _WHITESPACE:
            index += 1
        if index >= length or data[index : index + 1] not in b"\"'":
            break
        quote = data[index]
        value_start = index + 1
        closing = data.find(bytes([quote]), value_start)
        if closing == -1:
            break
        values[name] = _ValueSpan(start=value_start, end=closing, quote=quote)
        index = closing + 1
        insert_at = index

    return _StartTag(values=values, insert_at=insert_at)


def _changes_for(
    attrs: Mapping[str, str],
    wanted: TrackExportValues,
) -> Dict[str, Tuple[str, str]]:
    """The attributes to write for one track: ``field -> (attribute, text)``.

    Empty where nothing differs, which is the common case for a library nobody
    has overridden — and the reason such an export is honestly a copy with
    playlists appended.
    """
    changes: Dict[str, Tuple[str, str]] = {}

    key = _optional_text(wanted.key)
    if key is not None and _optional_text(attrs.get(ATTR_KEY)) != key:
        changes["key"] = (ATTR_KEY, key)

    if wanted.bpm is not None:
        target = round(float(wanted.bpm), 2)
        current = _optional_bpm(attrs.get(ATTR_BPM))
        if current is None or round(current, 2) != target:
            changes["bpm"] = (ATTR_BPM, f"{target:.2f}")

    for name, attribute in (("genre", ATTR_GENRE), ("label", ATTR_LABEL)):
        text = _optional_text(getattr(wanted, name))
        if text is not None and _optional_text(attrs.get(attribute)) != text:
            changes[name] = (attribute, text)

    if wanted.year is not None:
        year = int(wanted.year)
        if _measured_int(attrs.get(ATTR_YEAR)) != year:
            changes["year"] = (ATTR_YEAR, str(year))

    if wanted.rating is not None:
        encoded = _stars_to_rating(wanted.rating)
        if encoded is not None and _rating_to_stars(attrs.get(ATTR_RATING)) != int(
            wanted.rating
        ):
            changes["rating"] = (ATTR_RATING, str(encoded))

    return changes


def _edits_for(
    tag: _StartTag,
    changes: Mapping[str, Tuple[str, str]],
    encoding: str,
) -> List[Tuple[int, int, bytes]]:
    """Turn changes into ``(start, end, replacement)`` splices for one tag."""
    edits: List[Tuple[int, int, bytes]] = []
    for attribute, text in changes.values():
        span = tag.values.get(attribute)
        if span is None:
            addition = f' {attribute}="{_escape(text, 0x22, encoding)}"'
            edits.append((tag.insert_at, tag.insert_at, addition.encode(encoding)))
        else:
            edits.append(
                (
                    span.start,
                    span.end,
                    _escape(text, span.quote, encoding).encode(encoding),
                )
            )
    return edits


def _escape(text: str, quote: int, encoding: str) -> str:
    """Escape a value for an attribute delimited by ``quote``.

    ``&`` first, or the escapes would themselves be escaped. ``>`` needs no
    escaping inside an attribute value and is left alone, because this module
    changes only what it must.

    In a document that declares ASCII, a character outside it becomes a numeric
    character reference rather than a UTF-8 byte: putting one in would make the
    document contradict its own declaration, and refusing the export instead
    would fail on a perfectly ordinary label. Rekordbox writes UTF-8, so this is
    for files that came from somewhere else.
    """
    escaped = text.replace("&", "&amp;").replace("<", "&lt;")
    escaped = (
        escaped.replace('"', "&quot;")
        if quote == 0x22
        else escaped.replace("'", "&apos;")
    )
    if encoding == "ascii":
        escaped = "".join(
            character if character.isascii() else f"&#{ord(character)};"
            for character in escaped
        )
    return escaped


def _write_atomically(
    data: bytes,
    edits: List[Tuple[int, int, bytes]],
    destination_path: str,
) -> None:
    """Splice the edits into ``data`` and write via a temp file in the same dir.

    A temp file beside the destination, then ``replace``: the pattern the
    orphaned writer used, and the reason an export that fails part-way leaves
    nothing at the destination and no temp file behind.
    """
    destination = Path(destination_path)
    parent = destination.parent
    parent.mkdir(parents=True, exist_ok=True)

    ordered = sorted(edits, key=lambda edit: (edit[0], edit[1]))
    out = bytearray()
    cursor = 0
    for start, end, replacement in ordered:
        if start < cursor:  # pragma: no cover - impossible by construction
            raise AssertionError("overlapping edits in one document")
        out += data[cursor:start]
        out += replacement
        cursor = end
    out += data[cursor:]

    temp_path: Optional[str] = None
    try:
        handle, temp_path = tempfile.mkstemp(
            suffix=".xml", dir=str(parent), prefix="cuepoint_export_"
        )
        with os.fdopen(handle, "wb") as stream:
            stream.write(out)
        Path(temp_path).replace(destination)
        temp_path = None
    finally:
        if temp_path is not None and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:  # pragma: no cover - best effort cleanup
                pass
