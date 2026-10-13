#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Writing tags to files, with a record (CLEAN-10, DEC-070, DEC-076).

The one job in Phase 7 that writes outside the database. It writes effective
values — CuePoint's override over Rekordbox's value (DEC-068) — and, when asked,
Beatport's artwork into files that have none, through ``tag_writer``. Three
properties make that acceptable, and none is optional: the preview says what
will happen before anything does, every value is recorded before it is
replaced, and every write can be restored.

Preview
-------
:meth:`TagWriteService.preview` reads every file in scope and writes none. It
answers which files will change, field by field, and which are skipped and
why: WAV (the rule both existing callers apply), a format whose tags CuePoint
does not write, a file the check found missing or unreadable or never checked
at its current path (DEC-073), tags that cannot be read, or nothing that would
change. For artwork it counts the files with no picture whose accepted match
has Beatport artwork, from what is already recorded; it fetches nothing, and the
write reports an image it then cannot fetch (C29, amending DEC-076).

One preview covers every save choice (C29)
------------------------------------------
Each file is read once, and what it holds is kept beside what every field would
become — key in all three notations, genre, label, year and BPM whether or not
they were asked, and the comment when it was — as a :class:`FileChoices`. The
files a write changes under *any* options the preview covers are then planned
from those records without reading a file again (:meth:`TagWritePreview.plan`),
and :attr:`TagWritePreview.field_choices` counts, per field, the files a choice
would fill (empty now) and replace (a different value now).

A write writes what its preview planned, and nothing else. Each file is looked
at again first: a track whose path, file check, effective values or accepted
artwork changed since the preview is skipped as ``changed_since_preview`` rather
than written with either the old values or the new ones, because neither is
what a person confirmed. A field the file already holds is not written, and
with ``keep_existing`` neither is a field holding any other value.

Recorded before written
-----------------------
For each file: read what every field about to change holds now, insert a
``file_writes`` row per field marked ``pending``, commit, write the file, read
it back, and confirm each row against what the file now holds — or mark it
failed. A crash between the record and the write leaves a pending record of a
write that may not have happened; a crash can never leave a written file with
no record. A restore treats a file that already holds the old value as done.

Artwork is embedded only into a file whose picture count is zero at the moment
of writing, read again then — and checked once more by the embedding function
against the tags it saves — so a picture that arrived after the preview is
never replaced. It is recorded with the old value ``"none"`` and the new
picture's hash.

Restore
-------
:meth:`TagWriteService.restore` writes recorded old values back for a job or a
track, newest write first, recording each as a new row naming the write it
undid. CLEAN-06's staleness rule applies: a field whose file value is no longer
what CuePoint wrote is skipped and reported, never overwritten. Restoring an
embedded picture removes that picture, by its hash, and nothing else.

After a write
-------------
The file's size and check time in ``track_files`` are refreshed, and an
embedded picture is recorded in ``track_artwork``. Tracks are not changed:
Rekordbox reads new tags only when told to re-read a file. One activity event
per job carries its counts (DEC-029). A file that fails is reported and
skipped; the job is not a transaction.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.data.tag_fields import (
    FIELD_BPM,
    FIELD_COMMENT,
    FIELD_GENRE,
    FIELD_KEY,
    FIELD_LABEL,
    FIELD_YEAR,
    TAG_FIELDS,
    FieldValue,
    PictureAlreadyPresent,
    TagFieldsError,
    TagSnapshot,
    display_value,
    embed_front_cover,
    picture_hash,
    predicted_value,
    read_tag_fields,
    remove_picture,
    restore_tag_fields,
    tag_format_of,
)
from cuepoint.data.tag_writer import (
    STATUS_OK,
    _normalize_year,
    write_key_comment_year_to_file,
)
from cuepoint.models.artwork import EMBEDDED_NONE, EMBEDDED_PRESENT
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_NOT_CHECKED,
    FILE_UNREADABLE,
)
from cuepoint.models.file_write import (
    WRITE_RESTORED,
    WRITE_SKIPPED,
    WRITE_WRITTEN,
    FileWrite,
)
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.row_values import required_text
from cuepoint.persistence.artwork_repository import EmbeddedRecord
from cuepoint.persistence.file_write_repository import TagTarget
from cuepoint.persistence.id_chunks import unique_ids
from cuepoint.persistence.track_query import BrowseQueryError
from cuepoint.services.artwork_service import (
    ARTWORK_FAILED,
    ARTWORK_NONE,
    ARTWORK_READY,
    ARTWORK_UNKNOWN,
    UNREACHABLE_AFTER_FAILURES,
    EmbeddableArtwork,
)
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.busy_wait import write_waiting
from cuepoint.services.interfaces import (
    IActivityService,
    IArtworkRepository,
    IArtworkService,
    IBatchService,
    IDatabaseService,
    IFileStatusRepository,
    IFileWriteRepository,
    ITagWriteService,
)
from cuepoint.services.override_values import (
    NOTATION_CAMELOT,
    NOTATION_CLASSIC,
    format_key,
    parse_key,
)
from cuepoint.services.tag_write_options import (
    KEY_FORMAT_CAMELOT,
    KEY_FORMAT_SHORT,
    KEY_FORMATS,
    TagWriteOptions,
)

_logger = logging.getLogger(__name__)

#: Recorded once per write job and once per restore job, with their counts.
EVENT_TAGS_WRITTEN = "clean.tags.written"
EVENT_TAGS_RESTORED = "clean.tags.restored"

#: Recorded once, as the engine starts, for each write or restore a stop cut
#: short (CLEAN-13). Neither of the two above is recorded for such a job, so
#: without this its writes would be invisible everywhere but the record.
EVENT_TAGS_INTERRUPTED = "clean.tags.interrupted"

#: The record's name for an embedded picture, beside the tag fields.
FIELD_ARTWORK = "artwork"
WRITE_FIELDS: Tuple[str, ...] = (*TAG_FIELDS, FIELD_ARTWORK)

#: The old value an embedded picture is recorded with (DEC-076).
ARTWORK_ABSENT = "none"

#: Why a whole file is not written.
SKIP_WAV = "wav"
SKIP_UNSUPPORTED_FORMAT = "unsupported_format"
SKIP_NOT_CHECKED = FILE_NOT_CHECKED
SKIP_MISSING = FILE_MISSING
SKIP_UNREADABLE = FILE_UNREADABLE
SKIP_TAGS_UNREADABLE = "tags_unreadable"
SKIP_NOTHING_TO_WRITE = "nothing_to_write"
SKIP_CHANGED_SINCE_PREVIEW = "changed_since_preview"
SKIP_VANISHED = "vanished"
FILE_SKIP_REASONS: Tuple[str, ...] = (
    SKIP_WAV,
    SKIP_UNSUPPORTED_FORMAT,
    SKIP_NOT_CHECKED,
    SKIP_MISSING,
    SKIP_UNREADABLE,
    SKIP_TAGS_UNREADABLE,
    SKIP_NOTHING_TO_WRITE,
    SKIP_CHANGED_SINCE_PREVIEW,
    SKIP_VANISHED,
)

#: Why one field of a file is not written.
FIELD_NO_VALUE = "no_value"
FIELD_UNCHANGED = "unchanged"
FIELD_KEY_UNRECOGNIZED = "key_unrecognized"
FIELD_HAS_ARTWORK = "has_artwork"
FIELD_NO_BEATPORT_ARTWORK = "no_beatport_artwork"
FIELD_ARTWORK_UNAVAILABLE = "artwork_unavailable"
FIELD_FILE_HAS_VALUE = "file_has_value"
FIELD_SKIP_REASONS: Tuple[str, ...] = (
    FIELD_NO_VALUE,
    FIELD_UNCHANGED,
    FIELD_FILE_HAS_VALUE,
    FIELD_KEY_UNRECOGNIZED,
    FIELD_HAS_ARTWORK,
    FIELD_NO_BEATPORT_ARTWORK,
    FIELD_ARTWORK_UNAVAILABLE,
)

#: Files whose tags a preview reads at once, and per chunk between cancels.
#: Reading waits on the disk, as a file check and an artwork scan do.
PREVIEW_WORKERS = 8
PREVIEW_CHUNK_SIZE = 200

#: A planned picture whose URL the preview could not know, because the accepted
#: match's page was never read (C29). The write fetches and finds out.
ARTWORK_URL_UNKNOWN = "unknown"

#: The tag fields a preview keeps choices for whether or not they were asked.
CHOICE_FIELDS: Tuple[str, ...] = tuple(
    name for name in TAG_FIELDS if name != FIELD_COMMENT
)

#: Skipped rows a write holds before recording them in one go (C29).
KEPT_ROWS_CHUNK = 500

#: Why a ticked field was recorded as skipped: the file already holds the value,
#: or the person chose to keep the file's own.
KEPT_REASONS = {
    FIELD_UNCHANGED: "The file already holds this value",
    FIELD_FILE_HAS_VALUE: "Kept the value the file already holds",
}

#: How many files each list in a preview or result names; the counts are whole.
EXAMPLE_LIMIT = 50

#: How long a write keeps trying to record while another job is writing.
DATABASE_BUSY_PATIENCE_SECONDS = 120.0
_BUSY_RETRY_INTERVAL_SECONDS = 0.05

NOTHING_TO_WRITE = (
    "That selection names no tracks in the library, so there are no files to write"
)
NOTHING_TO_RESTORE = (
    "There is nothing to undo: CuePoint has saved nothing to files there that it has"
    " not already undone"
)

#: Reads a file's tag fields.
TagReader = Callable[[str], TagSnapshot]

#: Writes tag values into a file: ``tag_writer.write_key_comment_year_to_file``.
TagWriter = Callable[..., Tuple[str, Optional[str]]]


# ---------------------------------------------------------------------------
# What a write writes
# ---------------------------------------------------------------------------


def key_text(key: Optional[str], key_format: str) -> Tuple[Optional[str], str]:
    """A key in a write's notation, or None and why.

    Keys are read in any notation CuePoint stores or Rekordbox exports, and
    written as Rekordbox's classic spelling (``Am``, ``F#``), Camelot (``8A``) or
    short (``Amin``). A key that is not a key is not written: writing
    ``"Open 1m"`` into a Camelot field would not be Camelot.
    """
    if key is None or not str(key).strip():
        return None, FIELD_NO_VALUE
    parsed = parse_key(str(key))
    if parsed is None:
        return None, FIELD_KEY_UNRECOGNIZED
    pitch, minor = parsed
    if key_format == KEY_FORMAT_CAMELOT:
        return format_key(pitch, minor, NOTATION_CAMELOT), ""
    classic = format_key(pitch, minor, NOTATION_CLASSIC)
    if key_format == KEY_FORMAT_SHORT:
        note = classic[:-1] if minor else classic
        return f"{note}{'min' if minor else 'maj'}", ""
    return classic, ""


def bpm_text(bpm: Optional[float]) -> Optional[str]:
    """A BPM as a tag holds it: ``128``, ``124.5``, ``124.98``; None for none."""
    if bpm is None or not math.isfinite(float(bpm)) or float(bpm) <= 0:
        return None
    return f"{round(float(bpm), 2):.2f}".rstrip("0").rstrip(".")


def _text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _field_text(
    target: TagTarget, name: str, key_format: str, comment_text: str
) -> Tuple[Optional[str], str]:
    """The text a field would write for a track, or None and why not."""
    reason = FIELD_NO_VALUE
    text: Optional[str]
    if name == FIELD_KEY:
        text, reason = key_text(target.key, key_format)
    elif name == FIELD_YEAR:
        text = None if target.year is None else _normalize_year(str(target.year))
    elif name == FIELD_BPM:
        text = bpm_text(target.bpm)
    elif name == FIELD_LABEL:
        text = _text(target.label)
    elif name == FIELD_GENRE:
        text = _text(target.genre)
    else:
        text = _text(comment_text)
    return (text, "") if text else (None, reason or FIELD_NO_VALUE)


def written_values(
    target: TagTarget, options: TagWriteOptions
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """The text each enabled field would write for a track, and why the rest won't.

    Returns:
        ``(values, missing)``: field → text for every field with a value, and
        field → reason for every enabled field without one.
    """
    values: Dict[str, str] = {}
    missing: Dict[str, str] = {}
    for name in options.fields:
        text, reason = _field_text(
            target, name, options.key_format, options.comment_text
        )
        if text:
            values[name] = text
        else:
            missing[name] = reason
    return values, missing


def _held(before: FieldValue, after: FieldValue, keep_existing: bool) -> Optional[str]:
    """Why a field is left alone, or None to write it.

    A file already holding the value is ``unchanged``; with ``keep_existing`` a
    file holding any other value is ``file_has_value``.
    """
    if before == after:
        return FIELD_UNCHANGED
    if keep_existing and display_value(before) is not None:
        return FIELD_FILE_HAS_VALUE
    return None


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _count(number: int, noun: str) -> str:
    return f"{number:,} {noun}{'' if number == 1 else 's'}"


def count_fields(files: Sequence["PlannedFile"]) -> Dict[str, int]:
    """How many of these files each field will be written into, artwork included."""
    counts = {name: 0 for name in WRITE_FIELDS}
    for planned in files:
        for name in planned.fields:
            counts[name] += 1
    return counts


def describe_interrupted_tags(restoring: bool, recorded: int, unconfirmed: int) -> str:
    """Offer a stopped write or restore for restoring, in one sentence (CLEAN-13).

    An unconfirmed row is a value CuePoint recorded and may not have written;
    the sentence says how many, and never calls them written.
    """
    if restoring:
        head = "Undoing the save stopped when CuePoint closed"
        if unconfirmed:
            return (
                f"{head}: {_count(unconfirmed, 'value')} may not have been undone."
                " Undo again to finish"
            )
        return (
            f"{head} before every file was back to its old values. Undo again to finish"
        )
    head = "Saving to files stopped when CuePoint closed"
    written = recorded - unconfirmed
    if unconfirmed:
        return (
            f"{head}: {_count(unconfirmed, 'value')} may not have finished"
            f" saving, and {written:,} did. Undo the save to bring back the files' old values"
        )
    return (
        f"{head} after saving {_count(written, 'value')}."
        " Undo the save to bring back the files' old values"
    )


# ---------------------------------------------------------------------------
# Answers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FileRef:
    """A file a preview or a result names."""

    track_id: Optional[int]
    file_path: str

    def to_dict(self) -> Dict[str, Any]:
        return {"track_id": self.track_id, "file_path": self.file_path}


@dataclass(frozen=True)
class FileProblem:
    """A file, or one field of it, that was not written or restored, and why."""

    track_id: Optional[int]
    file_path: str
    message: str
    field: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "file_path": self.file_path,
            "field": self.field,
            "message": self.message,
        }


@dataclass(frozen=True)
class PlannedFile:
    """One file a write will change.

    Attributes:
        track_id: The library track.
        file_path: The file, as the preview read it.
        tag_format: Its tag family.
        values: The text every enabled field would write, changed or not — what
            a write compares against to tell whether the preview still holds.
        changes: For each field that will change, what the file holds now and
            what it will hold.
        artwork_url: The accepted match's artwork, when a picture will be
            embedded; :data:`ARTWORK_URL_UNKNOWN` when one is planned but the
            match's page was never read, so the write finds the URL out.
    """

    track_id: int
    file_path: str
    tag_format: str
    values: Dict[str, str]
    changes: Dict[str, Tuple[FieldValue, FieldValue]]
    artwork_url: Optional[str] = None

    @property
    def fields(self) -> Tuple[str, ...]:
        """The fields that will change, artwork last."""
        named = tuple(name for name in TAG_FIELDS if name in self.changes)
        return named + ((FIELD_ARTWORK,) if self.artwork_url else ())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "file_path": self.file_path,
            "fields": {
                name: {
                    "from": display_value(self.changes[name][0]),
                    "to": self.values[name],
                }
                for name in TAG_FIELDS
                if name in self.changes
            },
            "artwork": self.artwork_url is not None,
        }


#: What a field would become: the text to write, and how the tag holds it.
Prediction = Tuple[str, FieldValue]


@dataclass(frozen=True)
class FileChoices:
    """What one readable file holds, and what every choice would make of it (C29).

    Kept by a preview from the one read it makes of the file, so that the
    files a write changes under other options are known without reading again.

    Attributes:
        track_id: The library track.
        file_path: The file, as the preview read it.
        tag_format: Its tag family.
        before: What the file holds now, for key, year, label, BPM and genre,
            and the comment when the preview asked for it.
        after: For those fields, the text the track would write and how the tag
            holds it, whenever the track has a value; the key is in the
            preview's notation.
        after_key: The key in each of the three notations, when it has one.
        has_picture: Whether the file already holds a picture.
        artwork_url: When the preview asked for artwork and the file has no
            picture: the accepted match's image, :data:`ARTWORK_URL_UNKNOWN`
            when it is not known yet, and None when there is none.
    """

    track_id: int
    file_path: str
    tag_format: str
    before: Dict[str, FieldValue]
    after: Dict[str, Prediction]
    after_key: Dict[str, Prediction]
    has_picture: bool = False
    artwork_url: Optional[str] = None

    def chosen(self, options: TagWriteOptions) -> Dict[str, Prediction]:
        """The fields ``options`` write that the track has a value for."""
        chosen: Dict[str, Prediction] = {}
        for name in options.fields:
            picked = (
                self.after_key.get(options.key_format)
                if name == FIELD_KEY
                else self.after.get(name)
            )
            if picked is not None:
                chosen[name] = picked
        return chosen

    def plan(self, options: TagWriteOptions) -> Optional["PlannedFile"]:
        """The file a write of ``options`` would change, or None if it changes nothing."""
        chosen = self.chosen(options)
        changes: Dict[str, Tuple[FieldValue, FieldValue]] = {}
        for name, (_text_value, after) in chosen.items():
            if _held(self.before[name], after, options.keep_existing) is None:
                changes[name] = (self.before[name], after)
        artwork_url = (
            self.artwork_url
            if options.embed_missing_artwork and not self.has_picture
            else None
        )
        if not changes and artwork_url is None:
            return None
        return PlannedFile(
            track_id=self.track_id,
            file_path=self.file_path,
            tag_format=self.tag_format,
            values={name: text for name, (text, _after) in chosen.items()},
            changes=changes,
            artwork_url=artwork_url,
        )


@dataclass(frozen=True)
class TagWritePreview:
    """What a tag write would do, before it does anything.

    Attributes:
        preview_id: The id a write names it by.
        options: The options it was computed for.
        total: Tracks the preview was asked about.
        files: The files a write will change, in path order.
        skipped: For each reason, the files skipped for it.
        field_skipped: For each field, how many files will not have it written,
            by reason.
        cancelled: Whether a cancel stopped it; a cancelled preview is not written.
        computed_at: When.
        duration_seconds: How long it took.
        choices: Every readable file the preview read that was not skipped for
            what it is, with what each choice would make of it, in path order.
    """

    preview_id: str
    options: TagWriteOptions
    total: int
    files: Tuple[PlannedFile, ...] = ()
    skipped: Dict[str, Tuple[FileRef, ...]] = field(default_factory=dict)
    field_skipped: Dict[str, Dict[str, int]] = field(default_factory=dict)
    cancelled: bool = False
    computed_at: str = ""
    duration_seconds: float = 0.0
    choices: Tuple[FileChoices, ...] = ()

    def __post_init__(self) -> None:
        """Hold the counts to what a preview can produce."""
        required_text(self.preview_id, "preview_id")
        unknown = set(self.skipped) - set(FILE_SKIP_REASONS)
        if unknown:
            raise ValueError(f"Unknown skip reasons {sorted(unknown)}")
        for name, reasons in self.field_skipped.items():
            if name not in WRITE_FIELDS or set(reasons) - set(FIELD_SKIP_REASONS):
                raise ValueError(f"Unknown field skip {name}: {sorted(reasons)}")
        if not self.cancelled and self.decided != self.total:
            raise ValueError(
                f"A preview of {self.total} tracks accounts for each, not {self.decided}"
            )

    @property
    def skipped_count(self) -> int:
        """Files that will not be written."""
        return sum(len(files) for files in self.skipped.values())

    @property
    def decided(self) -> int:
        """Tracks the preview reached an answer for."""
        return len(self.files) + self.skipped_count

    @property
    def field_counts(self) -> Dict[str, int]:
        """How many files each field will be written into, artwork included."""
        return count_fields(self.files)

    @property
    def field_choices(self) -> Dict[str, Any]:
        """For each choice, the files it would fill and the files it would replace.

        ``fill``: files whose value is empty now and would receive one.
        ``replace``: files holding a different value now. Files already holding
        the value count in neither. The key is counted in each notation; the
        comment only when the preview asked for it, and artwork (``fill`` only)
        likewise.
        """

        def tally() -> Dict[str, int]:
            return {"replace": 0, "fill": 0}

        def count(
            counts: Dict[str, int], before: FieldValue, after: FieldValue
        ) -> None:
            if before == after:
                return
            counts["fill" if display_value(before) is None else "replace"] += 1

        names = [
            *CHOICE_FIELDS,
            *((FIELD_COMMENT,) if self.options.write_comment else ()),
        ]
        counts = {name: tally() for name in names if name != FIELD_KEY}
        styles = {style: tally() for style in KEY_FORMATS}
        pictures = 0
        for choice in self.choices:
            for style, (_text_value, after) in choice.after_key.items():
                count(styles[style], choice.before[FIELD_KEY], after)
            for name, tallies in counts.items():
                if name in choice.after:
                    count(tallies, choice.before[name], choice.after[name][1])
            if choice.artwork_url is not None and not choice.has_picture:
                pictures += 1
        choices: Dict[str, Any] = {FIELD_KEY: styles, **counts}
        if self.options.embed_missing_artwork:
            choices[FIELD_ARTWORK] = {"fill": pictures}
        return choices

    def uncovered(self, options: TagWriteOptions) -> List[str]:
        """What ``options`` ask for that this preview did not read, one phrase each.

        A preview covers key (any notation), year, label, BPM and genre always;
        the comment only when it asked, and then only the text it used; artwork
        only when it asked.
        """
        beyond: List[str] = []
        if options.write_comment:
            if not self.options.write_comment:
                beyond.append("comment: the preview did not read it")
            elif options.comment_text != self.options.comment_text:
                beyond.append("comment_text: the preview used a different text")
        if options.embed_missing_artwork and not self.options.embed_missing_artwork:
            beyond.append("artwork: the preview did not look for it")
        return beyond

    def covers(self, options: TagWriteOptions) -> bool:
        """True when this preview holds everything ``options`` need."""
        return not self.uncovered(options)

    def require_covers(self, options: TagWriteOptions) -> None:
        """Refuse options this preview did not cover, naming what it did not.

        Raises:
            ValueError: Listing each part of ``options`` beyond the preview.
        """
        if not isinstance(options, TagWriteOptions):
            raise ValueError("options must be TagWriteOptions")
        beyond = self.uncovered(options)
        if beyond:
            raise ValueError(
                "These options go beyond what the preview covers"
                f" ({'; '.join(beyond)}); preview again"
            )

    def plan(self, options: TagWriteOptions) -> Tuple[PlannedFile, ...]:
        """The files a write of ``options`` would change, without reading a file.

        Built from the choices the preview kept, honouring ``keep_existing``;
        ``plan(preview.options)`` is :attr:`files`.

        Raises:
            ValueError: If the preview does not cover ``options``.
        """
        self.require_covers(options)
        planned = (choice.plan(options) for choice in self.choices)
        return tuple(file for file in planned if file is not None)

    def summary_line(self) -> str:
        """What the preview found, in a sentence."""
        counts = self.field_counts
        head = (
            f"Stopped after reading {_count(self.decided, 'track')} of {self.total:,}"
            if self.cancelled
            else f"{_count(len(self.files), 'file')} would change"
        )
        written = [f"{counts[name]:,} {name}" for name in TAG_FIELDS if counts[name]]
        if counts[FIELD_ARTWORK]:
            written.append(f"{_count(counts[FIELD_ARTWORK], 'picture')}")
        line = f"{head}: {', '.join(written)}" if written else head
        if self.skipped_count:
            line += f". {_count(self.skipped_count, 'file')} skipped"
        return line

    def to_dict(self) -> Dict[str, Any]:
        """The preview's answer. A public shape; extend rather than rename."""
        return {
            "preview_id": self.preview_id,
            "options": self.options.to_dict(),
            "total": self.total,
            "files": len(self.files),
            "fields": self.field_counts,
            "skipped": {
                reason: {
                    "count": len(files),
                    "examples": [ref.to_dict() for ref in files[:EXAMPLE_LIMIT]],
                }
                for reason, files in self.skipped.items()
            },
            "field_skipped": {
                name: dict(reasons) for name, reasons in self.field_skipped.items()
            },
            "changes": [planned.to_dict() for planned in self.files[:EXAMPLE_LIMIT]],
            "field_choices": self.field_choices,
            "cancelled": self.cancelled,
            "computed_at": self.computed_at,
            "duration_seconds": round(self.duration_seconds, 3),
            "summary_line": self.summary_line(),
        }


@dataclass(frozen=True)
class TagWriteResult:
    """What one write job did.

    Attributes:
        job_id: The job, as ``file_writes`` records it.
        preview_id: The preview it wrote.
        total: Files the preview planned.
        written: Files at least one field was written into.
        failed: Files nothing could be written into.
        skipped: For each reason, files not written.
        fields: For each field, files it was written into.
        field_skipped: For each field, files it was not written into, by reason.
        failed_fields: Fields that were recorded and did not take.
        problems: Failures, by file and field.
        cancelled: Whether a cancel stopped it.
        duration_seconds: How long it took.
    """

    job_id: str
    preview_id: str
    total: int
    written: int = 0
    failed: int = 0
    skipped: Dict[str, int] = field(default_factory=dict)
    fields: Dict[str, int] = field(default_factory=dict)
    field_skipped: Dict[str, Dict[str, int]] = field(default_factory=dict)
    failed_fields: int = 0
    problems: Tuple[FileProblem, ...] = ()
    cancelled: bool = False
    duration_seconds: float = 0.0

    def __post_init__(self) -> None:
        """Hold the counts to what a write can produce."""
        if min(self.total, self.written, self.failed, self.failed_fields) < 0:
            raise ValueError("A tag write cannot count below zero")
        if not self.cancelled and self.completed != self.total:
            raise ValueError(
                f"A write of {self.total} files accounts for each, not {self.completed}"
            )

    @property
    def skipped_count(self) -> int:
        return sum(self.skipped.values())

    @property
    def completed(self) -> int:
        """Files the write reached an answer for."""
        return self.written + self.failed + self.skipped_count

    def summary_line(self) -> str:
        """The activity feed's sentence."""
        head = (
            f"Stopped after {self.completed:,} of {_count(self.total, 'file')},"
            f" having saved to {self.written:,}"
            if self.cancelled
            else f"Saved to {_count(self.written, 'file')}"
        )
        parts = []
        if self.skipped_count:
            parts.append(f"{self.skipped_count:,} skipped")
        if self.failed:
            parts.append(f"{self.failed:,} failed")
        pictures = self.fields.get(FIELD_ARTWORK, 0)
        line = head
        if pictures:
            line += f", embedding {_count(pictures, 'picture')}"
        if parts:
            line += f". {', '.join(parts)}"
        if self.failed_fields:
            line += f". {_count(self.failed_fields, 'field')} did not take"
        return line

    def to_dict(self) -> Dict[str, Any]:
        """The job's answer. A public shape; extend rather than rename."""
        return {
            "job_id": self.job_id,
            "preview_id": self.preview_id,
            "total": self.total,
            "completed": self.completed,
            "written": self.written,
            "failed": self.failed,
            "skipped": dict(self.skipped),
            "fields": {name: self.fields.get(name, 0) for name in WRITE_FIELDS},
            "field_skipped": {
                name: dict(reasons) for name, reasons in self.field_skipped.items()
            },
            "failed_fields": self.failed_fields,
            "problems": [
                problem.to_dict() for problem in self.problems[:EXAMPLE_LIMIT]
            ],
            "problems_truncated": len(self.problems) > EXAMPLE_LIMIT,
            "cancelled": self.cancelled,
            "duration_seconds": round(self.duration_seconds, 3),
            "summary_line": self.summary_line(),
        }


@dataclass(frozen=True)
class TagRestoreResult:
    """What one restore job did.

    Attributes:
        job_id: The restore job, as ``file_writes`` records it.
        restored_job_id: The write job restored, when a job was named.
        track_id: The track restored, when a track was named.
        total: Recorded writes the restore was asked to undo.
        restored: Of those, undone — including ones the file already held the
            old value for.
        already: Of the restored, ones that needed no write.
        skipped: Stale: the file no longer holds what CuePoint wrote.
        failed: Could not be written back.
        files: Files looked at.
        problems: Every stale and failed field.
        cancelled: Whether a cancel stopped it.
        duration_seconds: How long it took.
    """

    job_id: str
    total: int
    restored_job_id: Optional[str] = None
    track_id: Optional[int] = None
    restored: int = 0
    already: int = 0
    skipped: int = 0
    failed: int = 0
    files: int = 0
    problems: Tuple[FileProblem, ...] = ()
    cancelled: bool = False
    duration_seconds: float = 0.0

    def __post_init__(self) -> None:
        """Hold the counts to what a restore can produce."""
        counts = (self.total, self.restored, self.already, self.skipped, self.failed)
        if min(counts) < 0 or self.already > self.restored:
            raise ValueError("A restore's counts do not add up")
        if not self.cancelled and self.completed != self.total:
            raise ValueError(
                f"A restore of {self.total} writes accounts for each, not {self.completed}"
            )

    @property
    def completed(self) -> int:
        return self.restored + self.skipped + self.failed

    def summary_line(self) -> str:
        """The activity feed's sentence."""
        head = (
            f"Stopped after undoing {_count(self.restored, 'field')} of {self.total:,}"
            if self.cancelled
            else f"Undid {_count(self.restored, 'field')}"
            f" in {_count(self.files, 'file')}"
        )
        parts = []
        if self.skipped:
            parts.append(f"{self.skipped:,} skipped because the file has changed since")
        if self.failed:
            parts.append(f"{self.failed:,} failed")
        return f"{head}. {'; '.join(parts)}" if parts else head

    def to_dict(self) -> Dict[str, Any]:
        """The job's answer. A public shape; extend rather than rename."""
        return {
            "job_id": self.job_id,
            "restored_job_id": self.restored_job_id,
            "track_id": self.track_id,
            "total": self.total,
            "completed": self.completed,
            "restored": self.restored,
            "already": self.already,
            "skipped": self.skipped,
            "failed": self.failed,
            "files": self.files,
            "problems": [
                problem.to_dict() for problem in self.problems[:EXAMPLE_LIMIT]
            ],
            "problems_truncated": len(self.problems) > EXAMPLE_LIMIT,
            "cancelled": self.cancelled,
            "duration_seconds": round(self.duration_seconds, 3),
            "summary_line": self.summary_line(),
        }


@dataclass
class _Candidate:
    """A file the preview will read, and what its track would write into it."""

    target: TagTarget
    tag_format: str
    values: Dict[str, str]
    after: Dict[str, Prediction]
    after_key: Dict[str, Prediction]

    @property
    def worth_reading(self) -> bool:
        """True when some choice has a value to put in the file."""
        return bool(self.values or self.after or self.after_key)


@dataclass
class _Tally:
    written: int = 0
    failed: int = 0
    failed_fields: int = 0
    skipped: Dict[str, int] = field(default_factory=dict)
    fields: Dict[str, int] = field(default_factory=dict)
    field_skipped: Dict[str, Dict[str, int]] = field(default_factory=dict)
    problems: List[FileProblem] = field(default_factory=list)
    kept: List[FileWrite] = field(default_factory=list)
    kept_recorded: int = 0
    artwork_failures: int = 0

    def skip(self, reason: str) -> None:
        self.skipped[reason] = self.skipped.get(reason, 0) + 1

    def skip_field(self, name: str, reason: str) -> None:
        reasons = self.field_skipped.setdefault(name, {})
        reasons[reason] = reasons.get(reason, 0) + 1

    def wrote(self, name: str) -> None:
        self.fields[name] = self.fields.get(name, 0) + 1


# ---------------------------------------------------------------------------
# The service
# ---------------------------------------------------------------------------


class TagWriteService(ITagWriteService):
    """Previews, writes and restores tags in audio files, recording every value."""

    def __init__(
        self,
        file_write_repository: IFileWriteRepository,
        file_status_repository: IFileStatusRepository,
        artwork_repository: IArtworkRepository,
        artwork_service: IArtworkService,
        batch_service: IBatchService,
        activity_service: Optional[IActivityService],
        database_service: IDatabaseService,
        *,
        reader: TagReader = read_tag_fields,
        writer: TagWriter = write_key_comment_year_to_file,
        clock: Callable[[], str] = utc_now_iso,
        monotonic: Callable[[], float] = time.monotonic,
        workers: int = PREVIEW_WORKERS,
    ) -> None:
        """Store collaborators.

        ``reader`` and ``writer`` are where the service meets the files; a test
        replaces them to fail a read or a write at a chosen moment.

        Raises:
            ValueError: If ``workers`` is below one.
        """
        if int(workers) < 1:
            raise ValueError(f"A preview needs at least one worker, not {workers!r}")
        self._writes = file_write_repository
        self._files = file_status_repository
        self._artwork_records = artwork_repository
        self._artwork = artwork_service
        self._batch = batch_service
        self._activity = activity_service
        self._db = database_service
        self._read = reader
        self._write_tags = writer
        self._clock = clock
        self._monotonic = monotonic
        self._workers = int(workers)

    # ---------------------------------------------------------------- scope

    def resolve(self, selection: BatchSelection) -> List[int]:
        """The library tracks a selection names.

        Raises:
            ValueError: If it names none.
            BrowseQueryError: If a query selection cannot be built.
        """
        try:
            named = self._batch.resolve(selection)
        except BrowseQueryError:
            raise
        except ValueError:
            raise ValueError(NOTHING_TO_WRITE) from None
        found = self._files.existing(named)
        if not found:
            raise ValueError(NOTHING_TO_WRITE)
        return found

    # -------------------------------------------------------------- preview

    def preview(
        self,
        track_ids: Sequence[int],
        options: TagWriteOptions,
        *,
        preview_id: str,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> TagWritePreview:
        """Say what writing ``options`` into these tracks' files would do.

        Reads every file that could change and writes nothing, to a file or to
        the database — except what reading a Beatport page teaches the artwork
        record, which a thumbnail would record as well.
        """
        if not isinstance(options, TagWriteOptions):
            raise ValueError("options must be TagWriteOptions")
        required_text(preview_id, "preview_id")
        started = self._monotonic()
        wanted = unique_ids(track_ids)
        total = len(wanted)
        targets = sorted(
            self._writes.targets(wanted), key=lambda t: (t.file_path, t.track_id)
        )
        found = {target.track_id for target in targets}
        skipped: Dict[str, List[FileRef]] = {}
        field_skipped: Dict[str, Dict[str, int]] = {}

        def skip(reason: str, track_id: int, path: str) -> None:
            skipped.setdefault(reason, []).append(FileRef(track_id, path))

        def skip_field(name: str, reason: str) -> None:
            reasons = field_skipped.setdefault(name, {})
            reasons[reason] = reasons.get(reason, 0) + 1

        for track_id in wanted:
            if track_id not in found:
                skip(SKIP_VANISHED, track_id, "")

        # Files the asked options have no value for are listed first, as they
        # were when such a file was never read.
        quiet: List[FileRef] = []
        to_read: List[_Candidate] = []
        for target in targets:
            reason = _file_skip(target)
            if reason is not None:
                skip(reason, target.track_id, target.file_path)
                continue
            values, missing = written_values(target, options)
            for name, why in missing.items():
                skip_field(name, why)
            tag_format = tag_format_of(target.file_path)
            assert tag_format is not None  # _file_skip refused every other format
            candidate = _Candidate(
                target, tag_format, values, *_predictions(target, tag_format, options)
            )
            if not candidate.worth_reading and not options.embed_missing_artwork:
                quiet.append(FileRef(target.track_id, target.file_path))
                continue
            to_read.append(candidate)

        decided = total - len(to_read)
        _report(on_progress, decided, total)
        cancelled = False
        reads: List[Tuple[FileChoices, Optional[PlannedFile], bool]] = []
        with ThreadPoolExecutor(
            max_workers=self._workers, thread_name_prefix="tag-preview"
        ) as pool:
            for start in range(0, len(to_read), PREVIEW_CHUNK_SIZE):
                if should_cancel is not None and should_cancel():
                    cancelled = True
                    break
                chunk = to_read[start : start + PREVIEW_CHUNK_SIZE]
                snapshots = list(
                    pool.map(
                        lambda item: self._read_quietly(item.target.file_path), chunk
                    )
                )
                for candidate, snapshot in zip(chunk, snapshots):
                    target = candidate.target
                    asked_empty = (
                        not candidate.values and not options.embed_missing_artwork
                    )
                    if snapshot is None:
                        if asked_empty:
                            quiet.append(FileRef(target.track_id, target.file_path))
                        else:
                            skip(
                                SKIP_TAGS_UNREADABLE, target.track_id, target.file_path
                            )
                        decided += 1
                        continue
                    choices = self._choices_of(candidate, snapshot, options, skip_field)
                    for name, (_text_value, after) in choices.chosen(options).items():
                        held = _held(choices.before[name], after, options.keep_existing)
                        if held is not None:
                            skip_field(name, held)
                    reads.append((choices, choices.plan(options), asked_empty))
                _report(on_progress, decided + len(reads), total)

        files: List[PlannedFile] = []
        for choices, planned, asked_empty in reads:
            if planned is None:
                ref = FileRef(choices.track_id, choices.file_path)
                if asked_empty:
                    quiet.append(ref)
                else:
                    skip(SKIP_NOTHING_TO_WRITE, choices.track_id, choices.file_path)
                continue
            files.append(planned)
        if quiet:
            quiet.sort(key=lambda ref: (ref.file_path, ref.track_id or 0))
            late = skipped.get(SKIP_NOTHING_TO_WRITE, [])
            skipped[SKIP_NOTHING_TO_WRITE] = [*quiet, *late]
        preview = TagWritePreview(
            preview_id=preview_id,
            options=options,
            total=total,
            files=tuple(files),
            skipped={reason: tuple(refs) for reason, refs in skipped.items()},
            field_skipped=field_skipped,
            cancelled=cancelled,
            computed_at=self._clock(),
            duration_seconds=self._monotonic() - started,
            choices=tuple(choices for choices, _planned, _quiet in reads),
        )
        _report(on_progress, preview.decided, total)
        _logger.info("[tags] preview %s: %s", preview_id, preview.summary_line())
        return preview

    def _choices_of(
        self,
        candidate: _Candidate,
        snapshot: TagSnapshot,
        options: TagWriteOptions,
        skip_field: Callable[[str, str], None],
    ) -> FileChoices:
        """What a read file holds, and what each choice would make of it.

        When artwork was asked, counts it from what is recorded: a file with no
        picture whose accepted match has an image, or may have (its page was
        never read). Fetches nothing.
        """
        names = [*CHOICE_FIELDS, *((FIELD_COMMENT,) if options.write_comment else ())]
        artwork_url: Optional[str] = None
        has_picture = bool(snapshot.pictures)
        if options.embed_missing_artwork:
            if has_picture:
                skip_field(FIELD_ARTWORK, FIELD_HAS_ARTWORK)
            else:
                status, url = self._known_artwork_quietly(candidate.target.track_id)
                if status == ARTWORK_READY and url:
                    artwork_url = url
                elif status == ARTWORK_UNKNOWN:
                    artwork_url = ARTWORK_URL_UNKNOWN
                else:
                    skip_field(FIELD_ARTWORK, FIELD_NO_BEATPORT_ARTWORK)
        return FileChoices(
            track_id=candidate.target.track_id,
            file_path=candidate.target.file_path,
            tag_format=candidate.tag_format,
            before={name: snapshot.value(name) for name in names},
            after=candidate.after,
            after_key=candidate.after_key,
            has_picture=has_picture,
            artwork_url=artwork_url,
        )

    # ---------------------------------------------------------------- write

    def write(
        self,
        preview: TagWritePreview,
        job_id: str,
        options: Optional[TagWriteOptions] = None,
        *,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> TagWriteResult:
        """Write what a preview planned, one file at a time, recording each field first.

        With no ``options`` that is the preview's own files and options. With
        ``options`` it is the files those would change, planned from what the
        preview kept (:meth:`TagWritePreview.plan`): any choice the preview
        covers, and nothing it does not.

        With ``options``, a ticked field the file already holds, or keeps under
        ``keep_existing``, is recorded as a ``skipped`` row (old value, the value
        that would have been written) for every file the preview read, even when
        no file changes. A write may then plan no files at all. Restore ignores
        these rows.

        Raises:
            ValueError: If the preview was cancelled, or does not cover ``options``.
        """
        required_text(job_id, "job_id")
        if preview.cancelled:
            raise ValueError("A cancelled preview cannot be written; preview again")
        given = options is not None
        if options is None:
            options, files = preview.options, preview.files
        else:
            files = preview.plan(options)
        record_kept = given
        started = self._monotonic()
        total = len(files)
        tally = _Tally()
        cancelled = False
        _report(on_progress, 0, total)
        if record_kept:
            cancelled = self._record_unvisited(
                preview, files, options, job_id, tally, should_cancel
            )
        for index, planned in enumerate(files if not cancelled else ()):
            if should_cancel is not None and should_cancel():
                cancelled = True
                break
            self._write_file(planned, options, job_id, tally, record_kept)
            if len(tally.kept) >= KEPT_ROWS_CHUNK:
                self._flush_kept(tally)
            _report(on_progress, index + 1, total)
        self._flush_kept(tally)

        result = TagWriteResult(
            job_id=job_id,
            preview_id=preview.preview_id,
            total=total,
            written=tally.written,
            failed=tally.failed,
            skipped=dict(tally.skipped),
            fields=dict(tally.fields),
            field_skipped=tally.field_skipped,
            failed_fields=tally.failed_fields,
            problems=tuple(tally.problems),
            cancelled=cancelled,
            duration_seconds=self._monotonic() - started,
        )
        _logger.info("[tags] %s (job %s)", result.summary_line(), job_id)
        marked_only = total == 0 and tally.kept_recorded > 0
        self._record_event(
            EVENT_TAGS_WRITTEN,
            (
                f"Marked {_count(tally.kept_recorded, 'value')} as already in the files"
                if marked_only
                else result.summary_line()
            ),
            {
                "job_id": job_id,
                "kept": tally.kept_recorded,
                "total": result.total,
                "written": result.written,
                "skipped": result.skipped_count,
                "failed": result.failed,
                "fields": {name: result.fields.get(name, 0) for name in WRITE_FIELDS},
                "failed_fields": result.failed_fields,
                "cancelled": result.cancelled,
                "options": {
                    name: value
                    for name, value in options.to_dict().items()
                    if name != "comment_text"
                },
            },
            when=total > 0 or marked_only,
        )
        return result

    def _write_file(
        self,
        planned: PlannedFile,
        options: TagWriteOptions,
        job_id: str,
        tally: _Tally,
        record_kept: bool = False,
    ) -> None:
        """Look at one planned file again, record, write, read back, confirm."""
        path = planned.file_path
        now = self._writes.targets([planned.track_id])
        if not now:
            tally.skip(SKIP_VANISHED)
            return
        target = now[0]
        if target.file_path != path:
            tally.skip(SKIP_CHANGED_SINCE_PREVIEW)
            return
        status_reason = _file_skip(target)
        if status_reason is not None:
            tally.skip(status_reason)
            return
        values, _missing = written_values(target, options)
        if values != planned.values:
            tally.skip(SKIP_CHANGED_SINCE_PREVIEW)
            return
        known_url = planned.artwork_url not in (None, ARTWORK_URL_UNKNOWN)
        if known_url:
            _status, artwork_now = self._artwork.beatport_artwork_source(
                planned.track_id
            )
            if artwork_now != planned.artwork_url:
                tally.skip(SKIP_CHANGED_SINCE_PREVIEW)
                return

        try:
            snapshot = self._read(path)
        except TagFieldsError as exc:
            tally.failed += 1
            tally.problems.append(
                FileProblem(
                    planned.track_id, path, f"The tags could not be read: {exc}"
                )
            )
            return

        changes: Dict[str, Tuple[str, FieldValue, Dict[str, Any]]] = {}
        for name in planned.changes:
            text = planned.values[name]
            after = predicted_value(planned.tag_format, name, text)
            before = snapshot.value(name)
            why = _held(before, after, options.keep_existing)
            if why is not None:
                tally.skip_field(name, why)
            else:
                changes[name] = (text, before, after)
        if record_kept:
            for name, text in planned.values.items():
                after = predicted_value(planned.tag_format, name, text)
                before = snapshot.value(name)
                kept_why = _held(before, after, options.keep_existing)
                if kept_why is not None:
                    tally.kept.append(
                        self._kept_row(planned, name, before, after, kept_why, job_id)
                    )

        image: Optional[EmbeddableArtwork] = None
        if planned.artwork_url is not None:
            if snapshot.pictures:
                tally.skip_field(FIELD_ARTWORK, FIELD_HAS_ARTWORK)
            elif tally.artwork_failures >= UNREACHABLE_AFTER_FAILURES:
                # Beatport cannot be reached; every further file would only
                # spend a timeout to say the same.
                tally.skip_field(FIELD_ARTWORK, FIELD_ARTWORK_UNAVAILABLE)
            else:
                look = self._artwork_quietly(planned.track_id)
                tally.artwork_failures = (
                    tally.artwork_failures + 1 if look.status == ARTWORK_FAILED else 0
                )
                if look.ready and (
                    not known_url or look.source_url == planned.artwork_url
                ):
                    image = look
                elif look.status == ARTWORK_NONE:
                    tally.skip_field(FIELD_ARTWORK, FIELD_NO_BEATPORT_ARTWORK)
                else:
                    tally.skip_field(FIELD_ARTWORK, FIELD_ARTWORK_UNAVAILABLE)

        if not changes and image is None:
            tally.skip(SKIP_NOTHING_TO_WRITE)
            return

        when = self._clock()
        rows = [
            FileWrite(
                job_id=job_id,
                file_path=path,
                field=name,
                outcome=WRITE_WRITTEN,
                written_at=when,
                track_id=planned.track_id,
                old_value_json=_dumps(before),
                new_value_json=_dumps(after),
                pending=True,
            )
            for name, (_text_value, before, after) in changes.items()
        ]
        picture: Optional[Dict[str, Any]] = None
        if image is not None and image.jpeg is not None:
            picture = {
                "sha256": picture_hash(image.jpeg),
                "width": image.width,
                "height": image.height,
                "bytes": len(image.jpeg),
            }
            rows.append(
                FileWrite(
                    job_id=job_id,
                    file_path=path,
                    field=FIELD_ARTWORK,
                    outcome=WRITE_WRITTEN,
                    written_at=when,
                    track_id=planned.track_id,
                    old_value_json=_dumps(ARTWORK_ABSENT),
                    new_value_json=_dumps(picture),
                    pending=True,
                )
            )
        # The record is committed before the file is touched (DEC-070).
        ids = self._with_database(lambda: self._writes.record(rows))

        error: Optional[str] = None
        picture_error: Optional[str] = None
        if changes:
            try:
                status, message = self._write_tags(
                    path,
                    changes[FIELD_KEY][0] if FIELD_KEY in changes else None,
                    changes[FIELD_COMMENT][0] if FIELD_COMMENT in changes else None,
                    changes[FIELD_YEAR][0] if FIELD_YEAR in changes else None,
                    changes[FIELD_LABEL][0] if FIELD_LABEL in changes else None,
                    changes[FIELD_BPM][0] if FIELD_BPM in changes else None,
                    changes[FIELD_GENRE][0] if FIELD_GENRE in changes else None,
                )
            except Exception as exc:  # noqa: BLE001 — a writer that raised
                status, message = "WRITE_ERROR", str(exc)
            if status != STATUS_OK:
                error = message or status
        if image is not None and image.jpeg is not None:
            if error is not None:
                picture_error = "Not embedded, because the tags could not be written"
            else:
                try:
                    embed_front_cover(path, image.jpeg, image.width, image.height)
                except PictureAlreadyPresent:
                    picture_error = "The file gained a picture before it was written"
                except (TagFieldsError, ValueError) as exc:
                    picture_error = str(exc)

        try:
            after_write: Optional[TagSnapshot] = self._read(path)
        except TagFieldsError as exc:
            after_write = None
            error = error or f"The file could not be read back: {exc}"

        confirmed: List[str] = []
        failed: List[Tuple[str, str]] = []

        def settle() -> None:
            confirmed.clear()
            failed.clear()
            for row_id, row in zip(ids, rows):
                if after_write is None:
                    # Unknown: the row stays pending, which is what it is.
                    continue
                if row.field == FIELD_ARTWORK:
                    assert picture is not None
                    if picture["sha256"] in after_write.pictures:
                        self._writes.confirm(row_id, row.new_value_json)
                        confirmed.append(row.field)
                    else:
                        reason = picture_error or "The picture was not embedded"
                        self._writes.fail(row_id, reason)
                        failed.append((row.field, reason))
                    continue
                held = after_write.value(row.field)
                if held == row.new_value:
                    self._writes.confirm(row_id, row.new_value_json)
                    confirmed.append(row.field)
                elif held == row.old_value:
                    reason = error or "The file did not take the value"
                    self._writes.fail(row_id, reason)
                    failed.append((row.field, reason))
                else:
                    # Written, but not as predicted: record what the file holds,
                    # because that is what a restore must recognise as ours.
                    _logger.warning(
                        "[tags] %s: %s reads back as %r, not %r",
                        path,
                        row.field,
                        held,
                        row.new_value,
                    )
                    self._writes.confirm(row_id, _dumps(held))
                    confirmed.append(row.field)
            if confirmed:
                self._after_write(
                    planned.track_id,
                    path,
                    picture if FIELD_ARTWORK in confirmed else None,
                )

        self._with_database(settle)

        for name in confirmed:
            tally.wrote(name)
        for name, reason in failed:
            tally.problems.append(FileProblem(planned.track_id, path, reason, name))
        if after_write is None:
            tally.failed += 1
            tally.problems.append(
                FileProblem(planned.track_id, path, error or "Unknown failure")
            )
        elif confirmed:
            tally.written += 1
            tally.failed_fields += len(failed)
        else:
            tally.failed += 1
            tally.failed_fields += len(failed)

    def _after_write(
        self, track_id: int, path: str, picture: Optional[Dict[str, Any]]
    ) -> None:
        """Refresh what the database knows about a file CuePoint just wrote."""
        try:
            size = os.stat(path).st_size
        except OSError:
            size = None
        when = self._clock()
        if size is not None:
            self._files.refresh_size(track_id, path, int(size), when)
        if picture is not None:
            self._artwork_records.record_embedded(
                [
                    EmbeddedRecord(
                        track_id, EMBEDDED_PRESENT, picture["sha256"], when, path
                    )
                ]
            )

    # -------------------------------------------------------------- restore

    def restorable_count(
        self, *, job_id: Optional[str] = None, track_id: Optional[int] = None
    ) -> int:
        """How many recorded writes a restore of a job or a track would undo.

        Counted in SQL rather than by reading every row: a write over a whole
        library records hundreds of thousands (CLEAN-11).
        """
        return self._writes.restorable_counts(job_id=job_id, track_id=track_id)[0]

    def restore(
        self,
        restore_job_id: str,
        *,
        job_id: Optional[str] = None,
        track_id: Optional[int] = None,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> TagRestoreResult:
        """Write recorded old values back for a job or a track, newest first.

        Raises:
            ValueError: Unless exactly one of ``job_id`` and ``track_id`` is
                given, or when there is nothing to restore.
        """
        required_text(restore_job_id, "restore_job_id")
        started = self._monotonic()
        rows = self._writes.restorable(job_id=job_id, track_id=track_id)
        if not rows:
            raise ValueError(NOTHING_TO_RESTORE)
        by_file: Dict[str, List[FileWrite]] = {}
        for row in rows:
            by_file.setdefault(row.file_path, []).append(row)

        counts = {"restored": 0, "already": 0, "skipped": 0, "failed": 0, "files": 0}
        problems: List[FileProblem] = []
        done = 0
        cancelled = False
        _report(on_progress, 0, len(rows))
        for path, writes in by_file.items():
            if should_cancel is not None and should_cancel():
                cancelled = True
                break
            self._restore_file(restore_job_id, path, writes, counts, problems)
            counts["files"] += 1
            done += len(writes)
            _report(on_progress, done, len(rows))

        result = TagRestoreResult(
            job_id=restore_job_id,
            total=len(rows),
            restored_job_id=job_id,
            track_id=track_id,
            restored=counts["restored"],
            already=counts["already"],
            skipped=counts["skipped"],
            failed=counts["failed"],
            files=counts["files"],
            problems=tuple(problems),
            cancelled=cancelled,
            duration_seconds=self._monotonic() - started,
        )
        _logger.info("[tags] %s (job %s)", result.summary_line(), restore_job_id)
        self._record_event(
            EVENT_TAGS_RESTORED,
            result.summary_line(),
            {
                "job_id": restore_job_id,
                "restored_job_id": job_id,
                "track_id": track_id,
                "total": result.total,
                "restored": result.restored,
                "skipped": result.skipped,
                "failed": result.failed,
                "files": result.files,
                "cancelled": result.cancelled,
            },
        )
        return result

    def _restore_file(
        self,
        restore_job_id: str,
        path: str,
        writes: Sequence[FileWrite],
        counts: Dict[str, int],
        problems: List[FileProblem],
    ) -> None:
        """Restore one file's recorded writes, newest first, in one file write."""
        when = self._clock()
        try:
            snapshot = self._read(path)
        except TagFieldsError as exc:
            reason = f"The file could not be read: {exc}"
            failures = [
                FileWrite(
                    job_id=restore_job_id,
                    file_path=path,
                    field=row.field,
                    outcome="failed",
                    written_at=when,
                    track_id=row.track_id,
                    new_value_json=row.old_value_json,
                    reason=reason,
                    restore_of=row.id,
                )
                for row in writes
            ]
            self._with_database(lambda: self._writes.record(failures))
            counts["failed"] += len(writes)
            problems.extend(
                FileProblem(row.track_id, path, reason, row.field) for row in writes
            )
            return

        state: Dict[str, FieldValue] = dict(snapshot.fields)
        pictures = list(snapshot.pictures)
        rows: List[FileWrite] = []
        to_restore: List[int] = []  # indexes into rows that need the file written
        removals: List[str] = []
        restored_fields: Dict[str, FieldValue] = {}
        track_ids = {row.track_id for row in writes if row.track_id is not None}

        for row in writes:
            assert row.id is not None
            if row.field == FIELD_ARTWORK:
                ours = str((row.new_value or {}).get("sha256") or "")
                if ours in pictures:
                    pictures.remove(ours)
                    removals.append(ours)
                    decision, before = "restore", row.new_value
                elif not pictures:
                    decision, before = "already", ARTWORK_ABSENT
                else:
                    decision, before = "stale", {"pictures": len(pictures)}
            else:
                current = state.get(row.field)
                before = current
                if current == row.old_value:
                    decision = "already"
                elif current == row.new_value:
                    decision = "restore"
                    state[row.field] = row.old_value
                    restored_fields[row.field] = row.old_value
                else:
                    decision = "stale"

            if decision == "stale":
                shown = (
                    "a different picture"
                    if row.field == FIELD_ARTWORK
                    else display_value(before) or "empty"
                )
                reason = (
                    f"The file's {row.field} is now {shown}, not what CuePoint wrote;"
                    " it was left as it is"
                )
                rows.append(
                    FileWrite(
                        job_id=restore_job_id,
                        file_path=path,
                        field=row.field,
                        outcome=WRITE_SKIPPED,
                        written_at=when,
                        track_id=row.track_id,
                        old_value_json=_dumps(before),
                        new_value_json=row.old_value_json,
                        reason=reason,
                        restore_of=row.id,
                    )
                )
                problems.append(FileProblem(row.track_id, path, reason, row.field))
                continue
            rows.append(
                FileWrite(
                    job_id=restore_job_id,
                    file_path=path,
                    field=row.field,
                    outcome=WRITE_RESTORED,
                    written_at=when,
                    track_id=row.track_id,
                    old_value_json=_dumps(before),
                    new_value_json=row.old_value_json,
                    pending=decision == "restore",
                    restore_of=row.id,
                )
            )
            if decision == "restore":
                to_restore.append(len(rows) - 1)

        ids = self._with_database(lambda: self._writes.record(rows))
        counts["skipped"] += sum(1 for row in rows if row.outcome == WRITE_SKIPPED)
        counts["already"] += sum(
            1
            for index, row in enumerate(rows)
            if row.outcome == WRITE_RESTORED and index not in to_restore
        )
        counts["restored"] += sum(
            1
            for index, row in enumerate(rows)
            if row.outcome == WRITE_RESTORED and index not in to_restore
        )
        if not to_restore:
            return

        error: Optional[str] = None
        try:
            if restored_fields:
                restore_tag_fields(path, restored_fields)
            for sha256 in removals:
                remove_picture(path, sha256)
        except (TagFieldsError, ValueError) as exc:
            error = str(exc)
        try:
            after: Optional[TagSnapshot] = self._read(path)
        except TagFieldsError as exc:
            after = None
            error = error or f"The file could not be read back: {exc}"

        outcome: Dict[int, Optional[str]] = {}

        def settle() -> None:
            outcome.clear()
            for index in to_restore:
                row = rows[index]
                row_id = ids[index]
                if after is None:
                    continue
                if row.field == FIELD_ARTWORK:
                    ours = str((row.old_value or {}).get("sha256") or "")
                    took = list(after.pictures).count(ours) < list(
                        snapshot.pictures
                    ).count(ours)
                else:
                    took = after.value(row.field) == state.get(row.field)
                if took:
                    self._writes.confirm(row_id, row.new_value_json)
                    outcome[index] = None
                else:
                    reason = error or "The file did not take the old value back"
                    self._writes.fail(row_id, reason)
                    outcome[index] = reason
            if after is not None and any(reason is None for reason in outcome.values()):
                for track in track_ids:
                    self._restored_file(track, path, after, removals)

        self._with_database(settle)
        for index in to_restore:
            row = rows[index]
            if index not in outcome:
                counts["failed"] += 1
                problems.append(
                    FileProblem(
                        row.track_id, path, error or "Unknown failure", row.field
                    )
                )
            elif outcome[index] is None:
                counts["restored"] += 1
            else:
                counts["failed"] += 1
                problems.append(
                    FileProblem(row.track_id, path, str(outcome[index]), row.field)
                )

    def _restored_file(
        self, track_id: int, path: str, after: TagSnapshot, removals: Sequence[str]
    ) -> None:
        try:
            size = os.stat(path).st_size
        except OSError:
            size = None
        when = self._clock()
        if size is not None:
            self._files.refresh_size(track_id, path, int(size), when)
        if removals and not after.pictures:
            self._artwork_records.record_embedded(
                [EmbeddedRecord(track_id, EMBEDDED_NONE, None, when, path)]
            )

    # -------------------------------------------------------------- helpers

    def _read_quietly(self, path: str) -> Optional[TagSnapshot]:
        try:
            return self._read(path)
        except TagFieldsError as exc:
            _logger.info("[tags] %s: %s", path, exc)
            return None

    def _artwork_quietly(self, track_id: int) -> EmbeddableArtwork:
        try:
            return self._artwork.embeddable_artwork(track_id)
        except Exception as exc:  # noqa: BLE001 — one track does not stop a job
            _logger.warning("[tags] track %s: artwork not fetched: %s", track_id, exc)
            return EmbeddableArtwork(ARTWORK_FAILED)

    def _kept_row(
        self,
        planned: Any,
        name: str,
        before: FieldValue,
        after: FieldValue,
        why: str,
        job_id: str,
    ) -> FileWrite:
        """The record that a ticked field was not written because the file holds it."""
        return FileWrite(
            job_id=job_id,
            file_path=planned.file_path,
            field=name,
            outcome=WRITE_SKIPPED,
            written_at=self._clock(),
            track_id=planned.track_id,
            old_value_json=_dumps(before),
            new_value_json=_dumps(after),
            reason=KEPT_REASONS[why],
        )

    def _record_unvisited(
        self,
        preview: TagWritePreview,
        files: Sequence[PlannedFile],
        options: TagWriteOptions,
        job_id: str,
        tally: _Tally,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> bool:
        """Record the kept fields of files the write has nothing to write into.

        These files are never visited, so the preview's own read is what they
        held. A track whose path, file check or values changed since the preview
        gets no row: it is no longer the file the person saw. Returns True if a
        cancel stopped it.
        """
        visited = {planned.track_id for planned in files}
        waiting = [c for c in preview.choices if c.track_id not in visited]
        for start in range(0, len(waiting), KEPT_ROWS_CHUNK):
            if should_cancel is not None and should_cancel():
                return True
            chunk = waiting[start : start + KEPT_ROWS_CHUNK]
            now = {
                t.track_id: t for t in self._writes.targets([c.track_id for c in chunk])
            }
            for choice in chunk:
                chosen = choice.chosen(options)
                target = now.get(choice.track_id)
                if (
                    target is None
                    or target.file_path != choice.file_path
                    or _file_skip(target) is not None
                    or written_values(target, options)[0]
                    != {name: text for name, (text, _after) in chosen.items()}
                ):
                    continue
                for name, (_text_value, after) in chosen.items():
                    why = _held(choice.before[name], after, options.keep_existing)
                    if why is not None:
                        tally.kept.append(
                            self._kept_row(
                                choice, name, choice.before[name], after, why, job_id
                            )
                        )
            self._flush_kept(tally)
        return False

    def _flush_kept(self, tally: _Tally) -> None:
        """Record the skipped rows held so far, in one go."""
        if not tally.kept:
            return
        rows = list(tally.kept)
        tally.kept.clear()
        self._with_database(lambda: self._writes.record(rows))
        tally.kept_recorded += len(rows)

    def _known_artwork_quietly(self, track_id: int) -> Tuple[str, Optional[str]]:
        """What is recorded about a track's Beatport image; none if it cannot say."""
        try:
            return self._artwork.known_beatport_artwork(track_id)
        except Exception as exc:  # noqa: BLE001 — one track does not stop a job
            _logger.warning("[tags] track %s: artwork not looked up: %s", track_id, exc)
            return ARTWORK_NONE, None

    def _with_database(self, work: Callable[[], Any]) -> Any:
        return write_waiting(
            self._db,
            work,
            patience_seconds=DATABASE_BUSY_PATIENCE_SECONDS,
            interval_seconds=_BUSY_RETRY_INTERVAL_SECONDS,
        )

    def _record_event(
        self, event_type: str, summary: str, detail: Dict[str, Any], when: bool = True
    ) -> None:
        if self._activity is None or not when:
            return
        try:
            self._activity.record_event(event_type, summary, detail)
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug("[activity] could not record %s: %s", event_type, exc)


def _predictions(
    target: TagTarget, tag_format: str, options: TagWriteOptions
) -> Tuple[Dict[str, Prediction], Dict[str, Prediction]]:
    """What every choice would write for a track, from the track alone.

    Returns:
        ``(after, after_key)``: for key, year, label, BPM and genre whenever the
        track has a value, and for the comment when ``options`` ask for it; and
        the key in each notation.
    """
    after: Dict[str, Prediction] = {}
    names = [*CHOICE_FIELDS, *((FIELD_COMMENT,) if options.write_comment else ())]
    for name in names:
        text, _why = _field_text(target, name, options.key_format, options.comment_text)
        if text:
            after[name] = (text, predicted_value(tag_format, name, text))
    after_key: Dict[str, Prediction] = {}
    for style in KEY_FORMATS:
        text, _why = key_text(target.key, style)
        if text:
            after_key[style] = (text, predicted_value(tag_format, FIELD_KEY, text))
    return after, after_key


def _file_skip(target: TagTarget) -> Optional[str]:
    """Why a whole file is not written, from the database alone, or None."""
    if not target.file_path:
        return SKIP_NOT_CHECKED
    if Path(target.file_path).suffix.lower() == ".wav":
        return SKIP_WAV
    if tag_format_of(target.file_path) is None:
        return SKIP_UNSUPPORTED_FORMAT
    status = target.current_file_status
    if status == FILE_NOT_CHECKED:
        return SKIP_NOT_CHECKED
    if status == FILE_MISSING:
        return SKIP_MISSING
    if status == FILE_UNREADABLE:
        return SKIP_UNREADABLE
    return None


def _report(
    on_progress: Optional[Callable[[int, int], None]], completed: int, total: int
) -> None:
    if on_progress is not None:
        on_progress(completed, total)


__all__: Sequence[str] = (
    "ARTWORK_ABSENT",
    "EVENT_TAGS_INTERRUPTED",
    "EVENT_TAGS_RESTORED",
    "EVENT_TAGS_WRITTEN",
    "ARTWORK_URL_UNKNOWN",
    "CHOICE_FIELDS",
    "FIELD_ARTWORK",
    "FIELD_FILE_HAS_VALUE",
    "FIELD_SKIP_REASONS",
    "FILE_SKIP_REASONS",
    "FileChoices",
    "FileProblem",
    "FileRef",
    "NOTHING_TO_RESTORE",
    "NOTHING_TO_WRITE",
    "PlannedFile",
    "TagRestoreResult",
    "TagWritePreview",
    "TagWriteResult",
    "TagWriteService",
    "WRITE_FIELDS",
    "bpm_text",
    "count_fields",
    "describe_interrupted_tags",
    "key_text",
    "written_values",
)
