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
change. For artwork it confirms Beatport's image can be fetched and passes the
guard, and skips a file whose image cannot be.

A write writes what its preview planned, and nothing else. Each file is looked
at again first: a track whose path, file check, effective values or accepted
artwork changed since the preview is skipped as ``changed_since_preview`` rather
than written with either the old values or the new ones, because neither is
what a person confirmed. A field the file already holds is not written.

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
FIELD_SKIP_REASONS: Tuple[str, ...] = (
    FIELD_NO_VALUE,
    FIELD_UNCHANGED,
    FIELD_KEY_UNRECOGNIZED,
    FIELD_HAS_ARTWORK,
    FIELD_NO_BEATPORT_ARTWORK,
    FIELD_ARTWORK_UNAVAILABLE,
)

#: Files whose tags a preview reads at once, and per chunk between cancels.
#: Reading waits on the disk, as a file check and an artwork scan do.
PREVIEW_WORKERS = 8
PREVIEW_CHUNK_SIZE = 200

#: Tracks whose Beatport image a preview fetches between two looks at the cancel.
ARTWORK_CHUNK_SIZE = 20

#: How many files each list in a preview or result names; the counts are whole.
EXAMPLE_LIMIT = 50

#: How long a write keeps trying to record while another job is writing.
DATABASE_BUSY_PATIENCE_SECONDS = 120.0
_BUSY_RETRY_INTERVAL_SECONDS = 0.05

NOTHING_TO_WRITE = (
    "That selection names no tracks in the library, so there are no files to write"
)
NOTHING_TO_RESTORE = (
    "There is nothing to restore: CuePoint has written no tags there that it has"
    " not already restored"
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
        reason = FIELD_NO_VALUE
        text: Optional[str]
        if name == FIELD_KEY:
            text, reason = key_text(target.key, options.key_format)
        elif name == FIELD_YEAR:
            text = None if target.year is None else _normalize_year(str(target.year))
        elif name == FIELD_BPM:
            text = bpm_text(target.bpm)
        elif name == FIELD_LABEL:
            text = _text(target.label)
        elif name == FIELD_GENRE:
            text = _text(target.genre)
        else:
            text = _text(options.comment_text)
        if text:
            values[name] = text
        else:
            missing[name] = reason or FIELD_NO_VALUE
    return values, missing


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _count(number: int, noun: str) -> str:
    return f"{number:,} {noun}{'' if number == 1 else 's'}"


def describe_interrupted_tags(restoring: bool, recorded: int, unconfirmed: int) -> str:
    """Offer a stopped write or restore for restoring, in one sentence (CLEAN-13).

    An unconfirmed row is a value CuePoint recorded and may not have written;
    the sentence says how many, and never calls them written.
    """
    if restoring:
        head = "Restoring tags stopped when CuePoint closed"
        if unconfirmed:
            return (
                f"{head}: {_count(unconfirmed, 'value')} may not have been put back."
                " Restore again to finish"
            )
        return f"{head} before every file was put back. Restore again to finish"
    head = "Writing tags stopped when CuePoint closed"
    written = recorded - unconfirmed
    if unconfirmed:
        return (
            f"{head}: {_count(unconfirmed, 'value')} may not have finished"
            f" writing, and {written:,} did. Restore them to put the files back"
        )
    return (
        f"{head} after writing {_count(written, 'value')}."
        " Restore them to put the files back"
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
            embedded.
    """

    track_id: int
    file_path: str
    tag_format: str
    values: Dict[str, str]
    changes: Dict[str, Tuple[FieldValue, Dict[str, Any]]]
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
        counts = {name: 0 for name in WRITE_FIELDS}
        for planned in self.files:
            for name in planned.fields:
                counts[name] += 1
        return counts

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
            f" having written tags to {self.written:,}"
            if self.cancelled
            else f"Wrote tags to {_count(self.written, 'file')}"
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
            f"Stopped after restoring {_count(self.restored, 'field')} of {self.total:,}"
            if self.cancelled
            else f"Restored {_count(self.restored, 'field')}"
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
class _Read:
    """A file the preview read, and what it would change in it."""

    target: TagTarget
    tag_format: str
    values: Dict[str, str]
    snapshot: TagSnapshot
    changes: Dict[str, Tuple[FieldValue, Dict[str, Any]]] = field(default_factory=dict)
    artwork_url: Optional[str] = None


@dataclass
class _Tally:
    written: int = 0
    failed: int = 0
    failed_fields: int = 0
    skipped: Dict[str, int] = field(default_factory=dict)
    fields: Dict[str, int] = field(default_factory=dict)
    field_skipped: Dict[str, Dict[str, int]] = field(default_factory=dict)
    problems: List[FileProblem] = field(default_factory=list)

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
            raise ValueError(f"A preview needs at least one worker, not {workers}")
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

        to_read: List[Tuple[TagTarget, str, Dict[str, str]]] = []
        for target in targets:
            reason = _file_skip(target)
            if reason is not None:
                skip(reason, target.track_id, target.file_path)
                continue
            values, missing = written_values(target, options)
            for name, why in missing.items():
                skip_field(name, why)
            if not values and not options.embed_missing_artwork:
                skip(SKIP_NOTHING_TO_WRITE, target.track_id, target.file_path)
                continue
            tag_format = tag_format_of(target.file_path)
            assert tag_format is not None  # _file_skip refused every other format
            to_read.append((target, tag_format, values))

        decided = total - len(to_read)
        _report(on_progress, decided, total)
        cancelled = False
        reads: List[_Read] = []
        with ThreadPoolExecutor(
            max_workers=self._workers, thread_name_prefix="tag-preview"
        ) as pool:
            for start in range(0, len(to_read), PREVIEW_CHUNK_SIZE):
                if should_cancel is not None and should_cancel():
                    cancelled = True
                    break
                chunk = to_read[start : start + PREVIEW_CHUNK_SIZE]
                snapshots = list(
                    pool.map(lambda item: self._read_quietly(item[0].file_path), chunk)
                )
                for (target, tag_format, values), snapshot in zip(chunk, snapshots):
                    if snapshot is None:
                        skip(SKIP_TAGS_UNREADABLE, target.track_id, target.file_path)
                        decided += 1
                        continue
                    read = _Read(target, tag_format, values, snapshot)
                    for name, text in values.items():
                        after = predicted_value(tag_format, name, text)
                        before = snapshot.value(name)
                        if before == after:
                            skip_field(name, FIELD_UNCHANGED)
                        else:
                            read.changes[name] = (before, after)
                    reads.append(read)
                _report(on_progress, decided + len(reads), total)

            if options.embed_missing_artwork and not cancelled:
                cancelled = self._preview_artwork(
                    reads, pool, skip_field, should_cancel
                )

        files: List[PlannedFile] = []
        for read in reads:
            if not read.changes and read.artwork_url is None:
                skip(SKIP_NOTHING_TO_WRITE, read.target.track_id, read.target.file_path)
                continue
            files.append(
                PlannedFile(
                    track_id=read.target.track_id,
                    file_path=read.target.file_path,
                    tag_format=read.tag_format,
                    values=dict(read.values),
                    changes=dict(read.changes),
                    artwork_url=read.artwork_url,
                )
            )
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
        )
        _report(on_progress, preview.decided, total)
        _logger.info("[tags] preview %s: %s", preview_id, preview.summary_line())
        return preview

    def _preview_artwork(
        self,
        reads: Sequence[_Read],
        pool: ThreadPoolExecutor,
        skip_field: Callable[[str, str], None],
        should_cancel: Optional[Callable[[], bool]],
    ) -> bool:
        """Find which files with no picture can receive Beatport's; True if cancelled."""
        wanting: List[_Read] = []
        for read in reads:
            if read.snapshot.pictures:
                skip_field(FIELD_ARTWORK, FIELD_HAS_ARTWORK)
            else:
                wanting.append(read)
        failures_in_a_row = 0
        for start in range(0, len(wanting), ARTWORK_CHUNK_SIZE):
            chunk = wanting[start : start + ARTWORK_CHUNK_SIZE]
            if failures_in_a_row >= UNREACHABLE_AFTER_FAILURES:
                # Beatport cannot be reached; every further track would only
                # spend a timeout to say the same.
                for _read in chunk:
                    skip_field(FIELD_ARTWORK, FIELD_ARTWORK_UNAVAILABLE)
                continue
            if should_cancel is not None and should_cancel():
                return True
            looks = list(
                pool.map(
                    lambda read: self._artwork_quietly(read.target.track_id), chunk
                )
            )
            for read, look in zip(chunk, looks):
                if look.ready:
                    read.artwork_url = look.source_url
                elif look.status == ARTWORK_NONE:
                    skip_field(FIELD_ARTWORK, FIELD_NO_BEATPORT_ARTWORK)
                else:
                    skip_field(FIELD_ARTWORK, FIELD_ARTWORK_UNAVAILABLE)
                failures_in_a_row = (
                    failures_in_a_row + 1 if look.status == ARTWORK_FAILED else 0
                )
        return False

    # ---------------------------------------------------------------- write

    def write(
        self,
        preview: TagWritePreview,
        job_id: str,
        *,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> TagWriteResult:
        """Write what a preview planned, one file at a time, recording each field first.

        Raises:
            ValueError: If the preview was cancelled.
        """
        required_text(job_id, "job_id")
        if preview.cancelled:
            raise ValueError("A cancelled preview cannot be written; preview again")
        started = self._monotonic()
        total = len(preview.files)
        tally = _Tally()
        cancelled = False
        _report(on_progress, 0, total)
        for index, planned in enumerate(preview.files):
            if should_cancel is not None and should_cancel():
                cancelled = True
                break
            self._write_file(planned, preview.options, job_id, tally)
            _report(on_progress, index + 1, total)

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
        self._record_event(
            EVENT_TAGS_WRITTEN,
            result.summary_line(),
            {
                "job_id": job_id,
                "total": result.total,
                "written": result.written,
                "skipped": result.skipped_count,
                "failed": result.failed,
                "fields": {name: result.fields.get(name, 0) for name in WRITE_FIELDS},
                "failed_fields": result.failed_fields,
                "cancelled": result.cancelled,
            },
            when=total > 0,
        )
        return result

    def _write_file(
        self,
        planned: PlannedFile,
        options: TagWriteOptions,
        job_id: str,
        tally: _Tally,
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
        if planned.artwork_url is not None:
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
            if before == after:
                tally.skip_field(name, FIELD_UNCHANGED)
            else:
                changes[name] = (text, before, after)

        image: Optional[EmbeddableArtwork] = None
        if planned.artwork_url is not None:
            if snapshot.pictures:
                tally.skip_field(FIELD_ARTWORK, FIELD_HAS_ARTWORK)
            else:
                look = self._artwork_quietly(planned.track_id)
                if look.ready and look.source_url == planned.artwork_url:
                    image = look
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
                    reason = error or "The file did not take the restored value"
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
    "FIELD_ARTWORK",
    "FIELD_SKIP_REASONS",
    "FILE_SKIP_REASONS",
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
    "describe_interrupted_tags",
    "key_text",
    "written_values",
)
