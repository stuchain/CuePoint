#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading, restoring and embedding the tag fields CLEAN-10 writes (DEC-070, DEC-076).

``tag_writer.write_key_comment_year_to_file`` is how values go *into* a file,
for the CLI and for CLEAN-10 alike. This module is the other half a recorded
write needs: what the file held before, exactly enough to put it back.

Fields as the writer touches them
---------------------------------
A field is recorded as the frames or comments the writer replaces, not as the
text a user sees, because a restore has to undo exactly what the write did:

==========  ===================  =====================  ==================
Field       ID3 (MP3, AIFF)      FLAC                   Ogg Vorbis
==========  ===================  =====================  ==================
key         ``TKEY``             ``KEY``, ``INITIALKEY``  ``KEY``
year        ``TDRC``             ``DATE``               ``DATE``
label       ``TPUB``             ``LABEL``              ``LABEL``
bpm         ``TBPM``             ``BPM``                ``BPM``
genre       ``TCON``             ``GENRE``              ``GENRE``
comment     every ``COMM``       ``COMMENT``            ``COMMENT``
==========  ===================  =====================  ==================

==========  =========================================  ===================
Field       M4A, MP4, M4B: standard atom               legacy atom
==========  =========================================  ===================
key         ``----:com.apple.iTunes:initialkey``       ``KEY\x00``
year        ``\xa9day``                                 ``DATE``
label       ``----:com.apple.iTunes:LABEL``            ``LABE``
bpm         ``tmpo`` (a list of integers)              ``BPM\x00``
genre       ``\xa9gen``                                 ``GENR``
comment     ``\xa9cmt``                                 ``COMM``
==========  =========================================  ===================

The MP4 writer removes the legacy atom (what versions before 1.0.0 wrote) once
the standard atom holds a value, so a field's slots are both atoms and a restore
puts both back. A freeform atom's payload is stored as text when it is UTF-8
text with the UTF-8 data type, and otherwise as ``{"dataformat", "data"}`` (data
in base64), so a restore gives back the same bytes with the same data type.

"Exactly" holds for values and freeform payloads, not for the file's bytes: a
legacy ``gnre`` genre becomes ``\xa9gen`` once a genre is written, and the
freeform atom's version flag and the order of atoms in the file are not kept.
A file holding an atom of ours that mutagen cannot parse (a ``tmpo`` that is
text, a UTF-16 ``\xa9cmt``) is refused as unreadable rather than risk replacing it.

The writer deletes every ``COMM`` frame before adding its own, so a comment's
value is all of them — the ``iTunNORM`` a player wrote as well as the text a
user typed — and a restore puts all of them back. The writer saves ID3v2.4, in
which a year is ``TDRC``; mutagen reads a v2.3 ``TYER`` as ``TDRC`` too.

A value is a mapping of slot to what the slot holds — a list of strings, or for
``COMM`` a sorted list of ``[language, description, [text, ...]]`` — with only
the slots present, and ``None`` when none is. That shape is JSON, so it is what
``file_writes`` stores, and two values compare equal exactly when a restore
would have nothing to do. Encodings are not part of a value: text is text.

Formats
-------
MP3, AIFF, FLAC, Ogg Vorbis and the MP4 family (``.m4a``, ``.mp4``, ``.m4b``).
WAV is skipped by the rule both existing callers apply, and every other
container is refused, ``.m4p`` (protected purchases) among them.

Pictures
--------
A snapshot lists a SHA-256 of every picture a file holds, in stored order. A
picture is embedded only into a file that holds none, checked here immediately
before the save as well as by the caller, and removed by its hash, so a restore
removes the picture CuePoint added and nothing else (DEC-076). In an MP4 the
pictures are its ``covr`` atoms, and a cover is embedded as a JPEG ``MP4Cover``.
"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple, Union
from cuepoint.data.tag_save import (
    MESSAGE_TAGS_DIFFER,
    TagSaveError,
    save_via_copy,
)
from cuepoint.data.tag_writer import (
    MP4_ATOMS,
    MP4_LEGACY_ATOMS,
    MP4_SUFFIXES,
    _mp4_bpm,
    _same_year,
)
from cuepoint.utils.long_path import os_path
from cuepoint.utils.quoting import quoted

#: The fields a tag write replaces, in the order options name them.
FIELD_KEY = "key"
FIELD_YEAR = "year"
FIELD_LABEL = "label"
FIELD_BPM = "bpm"
FIELD_GENRE = "genre"
FIELD_COMMENT = "comment"
TAG_FIELDS: Tuple[str, ...] = (
    FIELD_KEY,
    FIELD_YEAR,
    FIELD_LABEL,
    FIELD_BPM,
    FIELD_GENRE,
    FIELD_COMMENT,
)

#: The tag families this module reads and writes.
FORMAT_ID3 = "id3"
FORMAT_FLAC = "flac"
FORMAT_VORBIS = "vorbis"
FORMAT_MP4 = "mp4"

#: Which family a file is, by its extension — the rule ``tag_writer`` routes by.
_FORMAT_BY_SUFFIX: Dict[str, str] = {
    ".mp3": FORMAT_ID3,
    ".aiff": FORMAT_ID3,
    ".aif": FORMAT_ID3,
    ".flac": FORMAT_FLAC,
    ".ogg": FORMAT_VORBIS,
    **{suffix: FORMAT_MP4 for suffix in MP4_SUFFIXES},
}

_ID3_SLOTS: Dict[str, Tuple[str, ...]] = {
    FIELD_KEY: ("TKEY",),
    FIELD_YEAR: ("TDRC",),
    FIELD_LABEL: ("TPUB",),
    FIELD_BPM: ("TBPM",),
    FIELD_GENRE: ("TCON",),
    FIELD_COMMENT: ("COMM",),
}

_VORBIS_SLOTS: Dict[str, Tuple[str, ...]] = {
    FIELD_KEY: ("KEY",),
    FIELD_YEAR: ("DATE",),
    FIELD_LABEL: ("LABEL",),
    FIELD_BPM: ("BPM",),
    FIELD_GENRE: ("GENRE",),
    FIELD_COMMENT: ("COMMENT",),
}

#: FLAC writes the key twice: ``INITIALKEY`` is what Windows and Serato read.
_FLAC_SLOTS: Dict[str, Tuple[str, ...]] = {
    **_VORBIS_SLOTS,
    FIELD_KEY: ("KEY", "INITIALKEY"),
}

#: MP4 holds each field in the standard atom and the legacy one the writer removes.
_MP4_SLOTS: Dict[str, Tuple[str, ...]] = {
    field: (MP4_ATOMS[field], MP4_LEGACY_ATOMS[field]) for field in TAG_FIELDS
}

_SLOTS: Dict[str, Dict[str, Tuple[str, ...]]] = {
    FORMAT_ID3: _ID3_SLOTS,
    FORMAT_FLAC: _FLAC_SLOTS,
    FORMAT_VORBIS: _VORBIS_SLOTS,
    FORMAT_MP4: _MP4_SLOTS,
}

#: The MP4 picture atom, and the key a freeform atom's name starts with.
_MP4_COVER = "covr"
_MP4_FREEFORM_PREFIX = "----:"

#: The language and description the writer gives the comment it adds.
WRITER_COMMENT_LANGUAGE = "XXX"
WRITER_COMMENT_DESCRIPTION = ""

#: The picture type for a front cover, in ID3 and FLAC alike.
PICTURE_FRONT_COVER = 3

#: A field's value: slot → contents, or None when the file holds none of it.
FieldValue = Optional[Dict[str, Any]]

PathLike = Union[str, Path]


class _HoldsPicture(Exception):
    """Inside a copy: the file already holds a picture (said in words by the caller)."""


class TagFieldsError(Exception):
    """A file's tags could not be read or written."""


class UnsupportedTagFormat(TagFieldsError):
    """The file is not a format whose tag fields are written here."""


class PictureAlreadyPresent(TagFieldsError):
    """The file holds a picture, so none is embedded (DEC-076)."""


@dataclass(frozen=True)
class TagSnapshot:
    """What a file holds for every tag field, and the pictures it carries.

    Attributes:
        format: One of the tag families.
        fields: Each of :data:`TAG_FIELDS` and its value.
        pictures: SHA-256 of each picture's bytes, in stored order.
    """

    format: str
    fields: Dict[str, FieldValue]
    pictures: Tuple[str, ...] = ()

    def value(self, field: str) -> FieldValue:
        """One field's value."""
        return self.fields.get(require_field(field))


def require_field(field: str) -> str:
    """Return a tag field's name, or refuse one that is not.

    Raises:
        ValueError: Naming the fields that exist.
    """
    if field not in TAG_FIELDS:
        raise ValueError(
            f"{field!r} is not a tag field. Fields: {', '.join(TAG_FIELDS)}"
        )
    return field


def tag_format_of(path: PathLike) -> Optional[str]:
    """The tag family of a file by its extension, or None when it is not written."""
    return _FORMAT_BY_SUFFIX.get(Path(str(path)).suffix.lower())


def picture_hash(data: bytes) -> str:
    """The SHA-256 a picture is known by."""
    return hashlib.sha256(bytes(data)).hexdigest()


def predicted_value(
    tag_format: str, field: str, text: str, before: FieldValue = None
) -> Dict[str, Any]:
    """The value a field holds after the writer writes ``text`` into it.

    Mirrors ``tag_writer``'s per-format writers; the round-trip tests hold the
    two to each other for every field and format. ``before`` is what the file
    held, which only an MP4 year needs: the writer keeps a full date in the same
    year (``2019-05-04`` for 2019) rather than replacing it.

    Raises:
        ValueError: If the format or field is unknown, or the text is blank.
    """
    slots = _slots_for(tag_format)[require_field(field)]
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"A {field} to write cannot be blank")
    if tag_format == FORMAT_ID3 and field == FIELD_COMMENT:
        return {"COMM": [[WRITER_COMMENT_LANGUAGE, WRITER_COMMENT_DESCRIPTION, [text]]]}
    if tag_format == FORMAT_MP4:
        # Only the standard atom: the writer removes the legacy one. A BPM is
        # the whole number ``tmpo`` holds; one it cannot hold is left as text,
        # which no file reads back as, so the write is reported as failed.
        if field == FIELD_YEAR and before:
            held = before.get(slots[0]) or []
            if held and isinstance(held[0], str) and _same_year(held[0], text):
                return {slots[0]: list(held)}
        if field == FIELD_BPM:
            tempo = _mp4_bpm(text)
            return {slots[0]: [tempo if tempo is not None else text]}
        return {slots[0]: [text]}
    return {slot: [text] for slot in slots}


def mp4_migrated_value(field: str, before: FieldValue) -> FieldValue:
    """What an MP4 write leaves in a field it was *not* asked to write, or None.

    The writer moves a value held only under the legacy atom to the standard
    atom, and drops a legacy atom the standard one stands beside, for every
    field whatever the call writes. None when the field is left as it is.
    """
    standard, legacy = _slots_for(FORMAT_MP4)[require_field(field)]
    if not before or legacy not in before:
        return None
    if standard in before:
        return {standard: list(before[standard])}
    carried: List[Any] = []
    for item in before[legacy]:
        text = str(item)
        if field == FIELD_BPM:
            tempo = _mp4_bpm(text)
            if tempo is not None:
                carried.append(tempo)
        else:
            carried.append(text)
    return {standard: carried} if carried else None


def _binary_display(item: Dict[str, Any]) -> str:
    """A freeform atom stored with a non-text data type, as text when it is text.

    The library scan reads such an atom as UTF-8 (``tag_writer._mp4_text``), so a
    value that decodes cleanly is shown as that text; anything else stays
    "(binary)". Only the display changes: the record keeps the exact bytes.
    """
    try:
        decoded = base64.b64decode(item["data"], validate=True).decode("utf-8")
    except (KeyError, TypeError, ValueError):
        return "(binary)"
    return decoded if decoded.strip() else "(binary)"


def display_value(value: FieldValue) -> Optional[str]:
    """A value as a person reads it: the texts it holds, joined; None for none.

    For ``COMM``, the comments a player wrote for itself (a description such as
    ``iTunNORM``) are left out, because they are not a comment anyone typed.
    """
    if not value:
        return None
    texts: List[str] = []
    for slot, contents in value.items():
        if slot == "COMM":
            for _language, description, comment_texts in contents:
                if not description:
                    texts.extend(str(text) for text in comment_texts)
            continue
        for text in contents:
            shown = _binary_display(text) if isinstance(text, dict) else str(text)
            if shown not in texts:
                texts.append(shown)
    shown = "; ".join(text for text in texts if text)
    return shown or None


# ---------------------------------------------------------------------- read


def read_tag_fields(path: PathLike) -> TagSnapshot:
    """Read every tag field and picture a file holds.

    Raises:
        UnsupportedTagFormat: If the file is not MP3, AIFF, FLAC, Ogg Vorbis or MP4.
        TagFieldsError: If its tags cannot be read.
    """
    tag_format = _require_format(path)
    try:
        return _read_fields(path, tag_format, Path(str(path)).suffix.lower())
    except TagFieldsError:
        raise
    except Exception as exc:  # noqa: BLE001 — any file can be anything
        raise TagFieldsError(
            f"The tags of {quoted(path)} could not be read: {exc}"
        ) from exc


def _read_fields(path: PathLike, tag_format: str, suffix: str) -> TagSnapshot:
    """``read_tag_fields`` for a file whose name may not say what it is (a copy).

    Raises whatever mutagen raises; ``read_tag_fields`` says it in words.
    """
    if tag_format == FORMAT_ID3:
        _audio, tags = _load_id3(path, suffix)
        fields = {field: _id3_value(tags, slots) for field, slots in _ID3_SLOTS.items()}
        pictures = tuple(picture_hash(frame.data) for frame in tags.getall("APIC"))
    elif tag_format == FORMAT_MP4:
        mp4_tags = _load_mp4(path).tags
        _require_parsed_atoms(path, mp4_tags)
        fields = {
            field: _mp4_value(mp4_tags, slots) for field, slots in _MP4_SLOTS.items()
        }
        pictures = _mp4_pictures(mp4_tags)
    else:
        audio = _load_vorbis(path, tag_format)
        comments = audio.tags
        fields = {
            field: _vorbis_value(comments, slots)
            for field, slots in _SLOTS[tag_format].items()
        }
        pictures = _vorbis_pictures(audio, tag_format)
    return TagSnapshot(tag_format, fields, pictures)


# ------------------------------------------------------------------- restore


def restore_tag_fields(path: PathLike, values: Mapping[str, FieldValue]) -> None:
    """Make each named field hold exactly the given value; None removes it.

    Every slot of a named field is set to what the value holds and every slot
    the value does not hold is removed, so the field reads back equal to the
    value. Fields not named are not touched.

    Raises:
        ValueError: If a field is unknown or a value is not a field value.
        UnsupportedTagFormat: If the file is not a supported format.
        TagFieldsError: If the file cannot be read or saved.
    """
    tag_format = _require_format(path)
    wanted = {require_field(field): _checked(value) for field, value in values.items()}
    if not wanted:
        return
    slots_by_field = _SLOTS[tag_format]
    suffix = Path(str(path)).suffix.lower()

    def apply(work: Path) -> None:
        if tag_format == FORMAT_ID3:
            audio, tags = _load_id3(work, suffix)
            for field, value in wanted.items():
                for slot in slots_by_field[field]:
                    _set_id3_slot(tags, slot, (value or {}).get(slot))
            _save_id3(work, audio, tags)
        elif tag_format == FORMAT_MP4:
            mp4 = _load_mp4(work)
            if mp4.tags is None:
                mp4.add_tags()
            for field, value in wanted.items():
                for slot in slots_by_field[field]:
                    _set_mp4_slot(mp4.tags, slot, (value or {}).get(slot))
            mp4.save()
        else:
            vorbis = _load_vorbis(work, tag_format)
            if vorbis.tags is None:
                vorbis.add_tags()
            for field, value in wanted.items():
                for slot in slots_by_field[field]:
                    _set_vorbis_slot(vorbis.tags, slot, (value or {}).get(slot))
            vorbis.save()

    def verify(work: Path) -> None:
        read = _read_fields(work, tag_format, suffix)
        for field, value in wanted.items():
            if read.value(field) != value:
                raise TagSaveError(MESSAGE_TAGS_DIFFER)

    try:
        save_via_copy(path, apply, verify=verify)
    except (TagFieldsError, ValueError):
        raise
    except TagSaveError as exc:
        raise TagFieldsError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surfaced as a failed restore
        raise TagFieldsError(
            f"The tags of {quoted(path)} could not be written: {exc}"
        ) from exc


# ------------------------------------------------------------------ pictures


def embed_front_cover(path: PathLike, jpeg: bytes, width: int, height: int) -> str:
    """Embed a JPEG as the front cover of a file that holds no picture.

    The caller has already checked; this checks again against the tags it is
    about to save, so a picture that arrived in between is never replaced.

    Returns:
        The picture's SHA-256.

    Raises:
        PictureAlreadyPresent: If the file holds any picture.
        UnsupportedTagFormat: If the file is not a supported format.
        TagFieldsError: If the file cannot be read or saved.
    """
    tag_format = _require_format(path)
    data = bytes(jpeg)
    if not data:
        raise ValueError("A picture to embed cannot be empty")
    suffix = Path(str(path)).suffix.lower()
    wanted_hash = picture_hash(data)

    def apply(work: Path) -> None:
        if tag_format == FORMAT_ID3:
            from mutagen.id3 import APIC

            audio, tags = _load_id3(work, suffix)
            if tags.getall("APIC"):
                raise _HoldsPicture()
            tags.add(
                APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=PICTURE_FRONT_COVER,
                    desc="",
                    data=data,
                )
            )
            _save_id3(work, audio, tags)
        elif tag_format == FORMAT_MP4:
            from mutagen.mp4 import MP4Cover

            mp4 = _load_mp4(work)
            if mp4.tags is None:
                mp4.add_tags()
            if _mp4_pictures(mp4.tags):
                raise _HoldsPicture()
            mp4.tags[_MP4_COVER] = [MP4Cover(data, imageformat=MP4Cover.FORMAT_JPEG)]
            mp4.save()
        else:
            vorbis = _load_vorbis(work, tag_format)
            if _vorbis_pictures(vorbis, tag_format):
                raise _HoldsPicture()
            picture = _flac_picture(data, width, height)
            if tag_format == FORMAT_FLAC:
                vorbis.add_picture(picture)
            else:
                if vorbis.tags is None:
                    vorbis.add_tags()
                vorbis.tags["METADATA_BLOCK_PICTURE"] = [
                    base64.b64encode(picture.write()).decode("ascii")
                ]
            vorbis.save()

    def verify(work: Path) -> None:
        if wanted_hash not in _read_fields(work, tag_format, suffix).pictures:
            raise TagSaveError(MESSAGE_TAGS_DIFFER)

    try:
        save_via_copy(path, apply, verify=verify)
    except _HoldsPicture:
        raise PictureAlreadyPresent(f"{quoted(path)} already holds a picture") from None
    except (TagFieldsError, ValueError):
        raise
    except TagSaveError as exc:
        raise TagFieldsError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surfaced as a failed write
        raise TagFieldsError(
            f"A picture could not be embedded in {quoted(path)}: {exc}"
        ) from exc
    return picture_hash(data)


def remove_picture(path: PathLike, sha256: str) -> bool:
    """Remove one picture with this hash from a file, and nothing else.

    Returns:
        True when a picture was removed; False when the file holds none with it.

    Raises:
        UnsupportedTagFormat: If the file is not a supported format.
        TagFieldsError: If the file cannot be read or saved.
    """
    tag_format = _require_format(path)
    suffix = Path(str(path)).suffix.lower()

    def apply(work: Path) -> bool:
        if tag_format == FORMAT_ID3:
            audio, tags = _load_id3(work, suffix)
            for frame in tags.getall("APIC"):
                if picture_hash(frame.data) == sha256:
                    del tags[frame.HashKey]
                    _save_id3(work, audio, tags)
                    return True
            return False
        if tag_format == FORMAT_MP4:
            mp4 = _load_mp4(work)
            covers = list(mp4.tags.get(_MP4_COVER) or []) if mp4.tags else []
            for index, cover in enumerate(covers):
                if picture_hash(bytes(cover)) == sha256:
                    del covers[index]
                    _set_mp4_slot(mp4.tags, _MP4_COVER, covers or None)
                    mp4.save()
                    return True
            return False
        vorbis = _load_vorbis(work, tag_format)
        if tag_format == FORMAT_FLAC:
            for block in list(vorbis.metadata_blocks):
                if (
                    getattr(block, "code", None) == 6
                    and picture_hash(block.data) == sha256
                ):
                    vorbis.metadata_blocks.remove(block)
                    vorbis.save()
                    return True
        comments = vorbis.tags
        if comments is not None:
            for slot in ("METADATA_BLOCK_PICTURE", "COVERART"):
                values = list(comments.get(slot) or [])
                for index, value in enumerate(values):
                    if _comment_picture_hash(slot, value) == sha256:
                        del values[index]
                        _set_vorbis_slot(comments, slot, values or None)
                        vorbis.save()
                        return True
        return False

    def verify(work: Path) -> None:
        # Exactly one picture with this hash went; the original is still as it was.
        before = _read_fields(path, tag_format, suffix).pictures
        after = _read_fields(work, tag_format, suffix).pictures
        if after.count(sha256) != before.count(sha256) - 1:
            raise TagSaveError(MESSAGE_TAGS_DIFFER)

    try:
        return save_via_copy(
            path, apply, verify=verify, accept=lambda removed: removed is True
        )
    except TagFieldsError:
        raise
    except TagSaveError as exc:
        raise TagFieldsError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surfaced as a failed restore
        raise TagFieldsError(
            f"A picture could not be removed from {quoted(path)}: {exc}"
        ) from exc


# ------------------------------------------------------------------- helpers


def _require_format(path: PathLike) -> str:
    tag_format = tag_format_of(path)
    if tag_format is None:
        raise UnsupportedTagFormat(
            f"{Path(str(path)).suffix or 'A file with no extension'!r} is not a format"
            " whose tags CuePoint writes"
        )
    return tag_format


def _slots_for(tag_format: str) -> Dict[str, Tuple[str, ...]]:
    if tag_format not in _SLOTS:
        raise ValueError(f"Unknown tag format {tag_format!r}")
    return _SLOTS[tag_format]


def _os(path: PathLike) -> str:
    """``path`` as the operating system opens it (the long-path prefix, HARDEN-06)."""
    return os_path(str(path), reserve=64) or ""


def _load_id3(path: PathLike, suffix: Optional[str] = None) -> Tuple[Any, Any]:
    """``(container, ID3 tags)``: the container is None for an MP3's bare tag.

    ``suffix`` says what the file is when its name does not (a copy beside it).
    """
    from mutagen.aiff import AIFF
    from mutagen.id3 import ID3, ID3NoHeaderError

    if (suffix or Path(str(path)).suffix).lower() == ".mp3":
        try:
            return None, ID3(_os(path))
        except ID3NoHeaderError:
            if not Path(_os(path)).is_file():
                raise TagFieldsError(f"{quoted(path)} is not a file") from None
            return None, ID3()
    audio = AIFF(_os(path))
    if audio.tags is None:
        audio.add_tags()
    return audio, audio.tags


def _save_id3(path: PathLike, audio: Any, tags: Any) -> None:
    if audio is None:
        tags.save(_os(path))
    else:
        audio.save()


def _load_vorbis(path: PathLike, tag_format: str) -> Any:
    if tag_format == FORMAT_FLAC:
        from mutagen.flac import FLAC

        return FLAC(_os(path))
    from mutagen.oggvorbis import OggVorbis

    return OggVorbis(_os(path))


def _load_mp4(path: PathLike) -> Any:
    from mutagen.mp4 import MP4

    return MP4(_os(path))


def _require_parsed_atoms(path: PathLike, tags: Any) -> None:
    """Refuse a file with an atom of ours that mutagen could not parse.

    Such an atom is kept aside and read as absent, so a snapshot would say the
    field is empty while a write replaces (and so loses) what is there.
    """
    failed = getattr(tags, "_failed_atoms", None) or {}
    ours = {slot for slots in _MP4_SLOTS.values() for slot in slots} | {_MP4_COVER}
    unreadable = sorted(name for name in failed if name in ours)
    if unreadable:
        raise TagFieldsError(
            f"{quoted(path)} holds an atom CuePoint cannot read"
            f" ({', '.join(repr(name) for name in unreadable)})"
        )


def _mp4_item(slot: str, item: Any) -> Any:
    """One atom value as JSON: text, an integer, or a freeform atom's exact bytes."""
    from mutagen.mp4 import AtomDataType, MP4FreeForm

    if isinstance(item, MP4FreeForm):
        raw = bytes(item)
        if item.dataformat == AtomDataType.UTF8:
            try:
                return raw.decode("utf-8")
            except UnicodeDecodeError:
                pass
        return {
            "dataformat": int(item.dataformat),
            "data": base64.b64encode(raw).decode("ascii"),
        }
    if isinstance(item, bool) or not isinstance(item, (str, int)):
        return str(item)
    return item


def _mp4_value(tags: Any, slots: Sequence[str]) -> FieldValue:
    value: Dict[str, Any] = {}
    if tags is None:
        return None
    for slot in slots:
        found = tags.get(slot)
        if found:
            value[slot] = [_mp4_item(slot, item) for item in found]
    return value or None


def _mp4_pictures(tags: Any) -> Tuple[str, ...]:
    if tags is None:
        return ()
    return tuple(picture_hash(bytes(cover)) for cover in tags.get(_MP4_COVER) or [])


def _set_mp4_slot(tags: Any, slot: str, contents: Any) -> None:
    from mutagen.mp4 import AtomDataType, MP4FreeForm

    if contents is None:
        if slot in tags:
            del tags[slot]
        return
    items: List[Any] = []
    for item in contents:
        if slot == _MP4_COVER:
            items.append(item)
        elif isinstance(item, dict):
            items.append(
                MP4FreeForm(
                    base64.b64decode(item["data"]),
                    dataformat=int(item["dataformat"]),
                )
            )
        elif slot.startswith(_MP4_FREEFORM_PREFIX):
            items.append(
                MP4FreeForm(str(item).encode("utf-8"), dataformat=AtomDataType.UTF8)
            )
        else:
            items.append(item)
    tags[slot] = items


def _id3_value(tags: Any, slots: Sequence[str]) -> FieldValue:
    value: Dict[str, Any] = {}
    for slot in slots:
        frames = tags.getall(slot)
        if not frames:
            continue
        if slot == "COMM":
            value[slot] = sorted(
                [str(frame.lang), str(frame.desc), [str(text) for text in frame.text]]
                for frame in frames
            )
        else:
            value[slot] = [str(text) for frame in frames for text in frame.text]
    return value or None


def _set_id3_slot(tags: Any, slot: str, contents: Any) -> None:
    from mutagen import id3

    tags.delall(slot)
    if slot == "TDRC":
        # A v2.3 year the save would otherwise translate over this one.
        tags.delall("TYER")
    if contents is None:
        return
    if slot == "COMM":
        for language, description, texts in contents:
            tags.add(
                id3.COMM(
                    encoding=3,
                    lang=str(language),
                    desc=str(description),
                    text=[str(text) for text in texts],
                )
            )
        return
    frame: Callable[..., Any] = getattr(id3, slot)
    tags.add(frame(encoding=3, text=[str(text) for text in contents]))


def _vorbis_value(comments: Any, slots: Sequence[str]) -> FieldValue:
    value: Dict[str, Any] = {}
    if comments is None:
        return None
    for slot in slots:
        found = comments.get(slot)
        if found:
            value[slot] = [str(text) for text in found]
    return value or None


def _set_vorbis_slot(comments: Any, slot: str, contents: Any) -> None:
    if contents is None:
        if comments.get(slot) is not None:
            del comments[slot]
        return
    comments[slot] = [str(text) for text in contents]


def _vorbis_pictures(audio: Any, tag_format: str) -> Tuple[str, ...]:
    found: List[str] = []
    if tag_format == FORMAT_FLAC:
        found.extend(picture_hash(picture.data) for picture in audio.pictures)
    comments = audio.tags
    if comments is not None:
        for slot in ("METADATA_BLOCK_PICTURE", "COVERART"):
            for value in comments.get(slot) or []:
                found.append(_comment_picture_hash(slot, value))
    return tuple(found)


def _comment_picture_hash(slot: str, value: Any) -> str:
    """The hash of a picture held in a comment; a malformed one still counts.

    A picture comment that cannot be decoded is still a picture a user put
    there, so it is counted — by the hash of its text — and never replaced.
    """
    from mutagen.flac import Picture

    text = str(value)
    try:
        raw = base64.b64decode(text, validate=True)
        data = Picture(raw).data if slot == "METADATA_BLOCK_PICTURE" else raw
    except Exception:  # noqa: BLE001 — see above
        return picture_hash(text.encode("utf-8"))
    return picture_hash(data)


def _flac_picture(data: bytes, width: int, height: int) -> Any:
    from mutagen.flac import Picture

    picture = Picture()
    picture.type = PICTURE_FRONT_COVER
    picture.mime = "image/jpeg"
    picture.desc = ""
    picture.width = int(width)
    picture.height = int(height)
    picture.depth = 24
    picture.data = data
    return picture


def _checked(value: Any) -> FieldValue:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError(f"A field value is a mapping of slots or None, not {value!r}")
    return value


__all__ = (
    "FIELD_BPM",
    "FIELD_COMMENT",
    "FIELD_GENRE",
    "FIELD_KEY",
    "FIELD_LABEL",
    "FIELD_YEAR",
    "FORMAT_FLAC",
    "FORMAT_ID3",
    "FORMAT_MP4",
    "FORMAT_VORBIS",
    "FieldValue",
    "PICTURE_FRONT_COVER",
    "PictureAlreadyPresent",
    "TAG_FIELDS",
    "TagFieldsError",
    "TagSnapshot",
    "UnsupportedTagFormat",
    "display_value",
    "embed_front_cover",
    "mp4_migrated_value",
    "picture_hash",
    "predicted_value",
    "read_tag_fields",
    "remove_picture",
    "require_field",
    "restore_tag_fields",
    "tag_format_of",
)
