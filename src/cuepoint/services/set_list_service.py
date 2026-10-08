#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's set list: copied as text, or saved as text, CSV or M3U8 (PREP-06).

DEC-110. The writers are ``data/set_list_file.py``; this service reads a Set
into their :class:`~cuepoint.data.set_list_file.SetList`, checks where a file
is to be saved, and records that it was.

What a set list reads
---------------------
The Set's plan (PREP-03): its chapters, each entry's planned times, and when
each starts. The values a user sees (DEC-068): the effective BPM, and the
effective key written in the library's notation. Title, artist and remixer
have no override and are read as imported. Each file's path, and whether it
was there when last checked (DEC-073). A file that was missing is listed and
counted, not dropped (DEC-088's reasoning).

Where a file may go
-------------------
To the path a save dialog returned, as DEC-083's export is, and nowhere else.
:meth:`SetListService.save` refuses a path whose extension is not ``.txt``,
``.csv`` or ``.m3u8``, a path that is a folder, and a folder that does not
exist. It refuses with a :class:`SetListDestinationError` whose ``reason`` a
view can act on (DISCOVER-09's pattern), before anything is read or written.
The file is written atomically. Then one activity event records the form and
the counts (DEC-110). No per-Set save record is kept, because nothing reads one.

Nothing here opens an audio file
--------------------------------
A set list names files by their paths and never reads them. The file-write
boundary test holds the writer to one caller, this module.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional, Sequence

from cuepoint.data.set_list_file import (
    FILE_MISSING,
    FILE_NOT_CHECKED,
    FILE_PRESENT,
    FILE_UNREADABLE,
    FORMAT_CSV,
    FORMAT_M3U8,
    FORMAT_TEXT,
    SetList,
    SetListChapter,
    SetListRow,
    form_of,
    render_text,
    write_set_list,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.models import file_status
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    ISetListService,
    ISetRepository,
    ISetService,
    ITrackRepository,
)
from cuepoint.services.override_values import (
    format_key,
    notation_from_counts,
    parse_key,
)
from cuepoint.utils.quoting import quoted

#: The activity event a save records (DEC-110).
EVENT_SET_LIST_SAVED = "set_list.saved"

#: Why a destination is refused, as :attr:`SetListDestinationError.reason`.
DESTINATION_BLANK = "destination_blank"
DESTINATION_NOT_SET_LIST = "destination_not_set_list"
DESTINATION_IS_FOLDER = "destination_is_folder"
DESTINATION_FOLDER_MISSING = "destination_folder_missing"
DESTINATION_REFUSALS = (
    DESTINATION_BLANK,
    DESTINATION_NOT_SET_LIST,
    DESTINATION_IS_FOLDER,
    DESTINATION_FOLDER_MISSING,
)

#: How each form is named in words.
FORM_WORDS = {
    FORMAT_TEXT: "a text set list",
    FORMAT_CSV: "a CSV set list",
    FORMAT_M3U8: "an M3U8 playlist",
}

#: A stored file status as a set list writes it. No check of the current path
#: is "not checked", which is not the same as missing (DEC-088).
_FILE_STATES: Mapping[Optional[str], str] = {
    None: FILE_NOT_CHECKED,
    file_status.FILE_PRESENT: FILE_PRESENT,
    file_status.FILE_MISSING: FILE_MISSING,
    file_status.FILE_UNREADABLE: FILE_UNREADABLE,
}


class SetListDestinationError(ValidationError):
    """A set list cannot be saved there, with the reason and the path.

    Raised before anything is read or written, so a refused save costs nothing
    and records nothing. A ``ValidationError``, as the export's destination
    refusal is, so the engine answers it the same way.
    """

    def __init__(self, reason: str, message: str, path: Optional[str] = None) -> None:
        """Record which refusal this is, and which path it is about."""
        super().__init__(message, error_code=reason, context={"path": path})
        self.reason = reason
        self.path = path


@dataclass(frozen=True)
class SetListSaved:
    """What a save wrote.

    Attributes:
        set_id: The Set.
        path: The file written, absolute.
        form: One of the set list forms.
        entries: How many entries it lists, repeats counted.
        missing_files: How many of them were missing when last checked.
        untimed: How many have no planned out time.
        bytes_written: The file's size.
    """

    set_id: int
    path: str
    form: str
    entries: int
    missing_files: int
    untimed: int
    bytes_written: int

    def to_dict(self) -> Dict[str, Any]:
        """The result on the wire."""
        return {
            "set_id": self.set_id,
            "path": self.path,
            "format": self.form,
            "entries": self.entries,
            "missing_files": self.missing_files,
            "untimed": self.untimed,
            "bytes_written": self.bytes_written,
        }


def _bpm(value: Any) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) and number > 0 else None


def _key(value: Any, notation: str) -> Optional[str]:
    """A key in the library's notation, or the text as written when not a key."""
    if not isinstance(value, str) or not value.strip():
        return None
    parsed = parse_key(value)
    return value.strip() if parsed is None else format_key(*parsed, notation)


def check_destination(path: str) -> str:
    """Return the destination as it will be written, and its form, or refuse it.

    Raises:
        SetListDestinationError: If the path is blank, its extension is not a
            set list's, it is a folder, or its folder does not exist.
    """
    text = str(path or "").strip()
    if not text:
        raise SetListDestinationError(
            DESTINATION_BLANK, "Choose where to save the set list."
        )
    destination = os.path.abspath(text)
    if form_of(destination) is None:
        raise SetListDestinationError(
            DESTINATION_NOT_SET_LIST,
            f"A set list is saved as a .txt, .csv or .m3u8 file: {quoted(destination)}",
            destination,
        )
    if os.path.isdir(destination):
        raise SetListDestinationError(
            DESTINATION_IS_FOLDER,
            f"That is a folder, not a file to save to: {quoted(destination)}",
            destination,
        )
    if not os.path.isdir(os.path.dirname(destination)):
        raise SetListDestinationError(
            DESTINATION_FOLDER_MISSING,
            f"The folder to save into does not exist: {quoted(destination)}",
            destination,
        )
    return destination


class SetListService(ISetListService):
    """Reads a Set as its set list, copies it and saves it."""

    def __init__(
        self,
        set_service: ISetService,
        set_repository: ISetRepository,
        track_repository: ITrackRepository,
        activity_service: IActivityService,
        database_service: IDatabaseService,
    ) -> None:
        """Wire the service to what it reads and where a save is recorded.

        Args:
            set_service: The Set's plan: chapters, planned times, starts.
            set_repository: Each entry's effective values, file check and
                track names.
            track_repository: The library's key notation.
            activity_service: Where a save is recorded (DEC-110).
            database_service: Opens the transaction a set list is read in and
                the one its event is recorded in. No SQL is run here.
        """
        self._sets = set_service
        self._set_rows = set_repository
        self._tracks = track_repository
        self._activity = activity_service
        self._db = database_service

    def set_list(self, set_id: int) -> SetList:
        """A Set as its set list is written, read in one transaction.

        Raises:
            ValueError: If there is no such Set, or the node is not one.
        """
        with self._db.transaction(join_existing=True):
            plan = self._sets.plan(int(set_id))
            facts = {
                row.entry_id: row for row in self._set_rows.entry_facts(int(set_id))
            }
            names = {
                row.entry_id: row for row in self._set_rows.entry_tracks(int(set_id))
            }
        notation = notation_from_counts(*self._tracks.key_notation_counts())
        chapter_of = {int(c.chapter.id or 0): c.chapter.position for c in plan.chapters}
        rows = []
        for entry in plan.entries:
            fact, name = facts[entry.entry_id], names[entry.entry_id]
            rows.append(
                SetListRow(
                    position=entry.position,
                    chapter=chapter_of[entry.chapter_id],
                    starts_at=entry.starts_at,
                    in_seconds=entry.in_seconds,
                    out_seconds=entry.out_seconds,
                    planned_seconds=entry.planned_seconds,
                    artist=name.artist,
                    title=name.title,
                    remixer=name.remixer,
                    bpm=_bpm(fact.bpm),
                    key=_key(fact.key, notation),
                    length_seconds=entry.length_seconds,
                    file_path=name.file_path,
                    file_status=_FILE_STATES.get(fact.file_status, FILE_NOT_CHECKED),
                    note=entry.note,
                )
            )
        return SetList(
            name=plan.set.name,
            chapters=tuple(
                SetListChapter(position=c.chapter.position, name=c.chapter.name)
                for c in plan.chapters
            ),
            rows=tuple(rows),
            running_seconds=plan.running_time.seconds,
            untimed=plan.running_time.untimed,
        )

    def text(self, set_id: int) -> str:
        """The plain-text set list, for the clipboard (DEC-110).

        Raises:
            ValueError: If there is no such Set, or the node is not one.
        """
        return render_text(self.set_list(set_id))

    def save(self, set_id: int, path: str) -> SetListSaved:
        """Write a set list file in the form its extension names (DEC-110).

        The destination is checked first, then the Set is read, the file
        written atomically, and one activity event recorded.

        Raises:
            SetListDestinationError: If the destination is refused. Nothing is
                read or written.
            ValueError: If there is no such Set, or the node is not one.
            OSError: If the file cannot be written; nothing is left behind.
        """
        destination = check_destination(path)
        form = form_of(destination)
        assert form is not None  # the destination check refused anything else
        set_list = self.set_list(set_id)
        written = write_set_list(set_list, form, destination)
        saved = SetListSaved(
            set_id=int(set_id),
            path=destination,
            form=form,
            entries=len(set_list.rows),
            missing_files=set_list.missing_files,
            untimed=set_list.untimed,
            bytes_written=written,
        )
        with self._db.transaction():
            self._record(set_list, saved)
        return saved

    def _record(self, set_list: SetList, saved: SetListSaved) -> None:
        """The one event a save writes: the form, and what it counted."""
        entries = f"{saved.entries} {'entry' if saved.entries == 1 else 'entries'}"
        extras = []
        if saved.missing_files:
            extras.append(
                f"{saved.missing_files} "
                f"{'file' if saved.missing_files == 1 else 'files'} missing"
            )
        if saved.untimed:
            extras.append(f"{saved.untimed} untimed")
        counted = ", ".join([entries, *extras])
        self._activity.record_event(
            EVENT_SET_LIST_SAVED,
            f"Saved {set_list.name!r} as {FORM_WORDS[saved.form]} — {counted}",
            {
                "set_id": saved.set_id,
                "set_name": set_list.name,
                "format": saved.form,
                "path": saved.path,
                "entries": saved.entries,
                "missing_files": saved.missing_files,
                "untimed": saved.untimed,
            },
        )


__all__: Sequence[str] = (
    "DESTINATION_BLANK",
    "DESTINATION_FOLDER_MISSING",
    "DESTINATION_IS_FOLDER",
    "DESTINATION_NOT_SET_LIST",
    "DESTINATION_REFUSALS",
    "EVENT_SET_LIST_SAVED",
    "FORM_WORDS",
    "SetListDestinationError",
    "SetListSaved",
    "SetListService",
    "check_destination",
)
