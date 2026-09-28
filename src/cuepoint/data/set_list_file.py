#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set written as a set list: plain text, CSV or M3U8 (PREP-06, DEC-110).

Three renderers over one :class:`SetList`, and one writer. The renderers are
pure: they build a string and touch nothing. :func:`write_set_list` is the only
function here that writes, and it writes one file, the set list, at the path
the caller has already validated. It never opens an audio file, and the
file-write boundary test (CLEAN-10) holds it to that and names its one caller.

The three forms
---------------
**Text** is a tracklist a DJ posts after a gig or prints for the booth: the
Set's name and running time, each chapter as a heading, and each entry as
``NN. [starts at]  Artist – Title``, with its planned times when it has them.

**CSV** is the working copy: one row per entry with every field, including the
file path and whether the file was there when last checked. It is UTF-8 with a
byte-order mark, so a spreadsheet program reads accents rather than guessing an
encoding. A cell that begins with ``=``, ``+``, ``-``, ``@``, a tab or a
carriage return is prefixed with an apostrophe, so no title runs as a formula.
Times are written ``h:mm:ss``, because a spreadsheet reads ``3:45`` as three
hours and forty-five minutes.

**M3U8** carries the Set to another player or a USB stick: ``#EXTM3U``, the
Set's name as ``#PLAYLIST``, each chapter as a ``# Chapter:`` comment, and each
entry as ``#EXTINF:<length or -1>,Artist - Title`` followed by its file's path.
A repeat is listed again. M3U8 has no standard way to say where to start or
stop, so it carries no planned times (DEC-110). A file that was missing when
last checked is still listed, by DEC-088's reasoning: dropping it would make the
playlist quietly differ from the Set.

What a line holds
-----------------
A track's words are written on one line in every form: a line break inside a
title would end an ``#EXTINF`` line early and split a text line in two. So
every run of whitespace in a value becomes one space. A title is written as
Rekordbox holds it, which usually names its mix already ("Strobe (Original
Mix)"). A remixer the title does not mention is added as "(Remixer Remix)", so
"artist – title (mix)" reads whole (DEC-110).

The chapters
------------
A Set that has only its one unnamed chapter is drawn as a plain list, with no
heading (DEC-103). Otherwise every chapter is written, an empty one included,
and an unnamed one as "Chapter N".
"""

from __future__ import annotations

import csv
import io
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.core.set_timing import format_time

#: The three forms, and the extension each is saved with.
FORMAT_TEXT = "text"
FORMAT_CSV = "csv"
FORMAT_M3U8 = "m3u8"
FORMATS: Tuple[str, ...] = (FORMAT_TEXT, FORMAT_CSV, FORMAT_M3U8)
EXTENSIONS = {".txt": FORMAT_TEXT, ".csv": FORMAT_CSV, ".m3u8": FORMAT_M3U8}

#: The file-check states a row can carry, as the CSV writes them.
FILE_PRESENT = "present"
FILE_MISSING = "missing"
FILE_UNREADABLE = "unreadable"
FILE_NOT_CHECKED = "not checked"
FILE_STATES: Tuple[str, ...] = (
    FILE_PRESENT,
    FILE_MISSING,
    FILE_UNREADABLE,
    FILE_NOT_CHECKED,
)

#: The CSV's columns, in order.
CSV_COLUMNS: Tuple[str, ...] = (
    "Position",
    "Chapter",
    "Starts at",
    "In",
    "Out",
    "Planned",
    "Artist",
    "Title",
    "Remixer",
    "BPM",
    "Key",
    "Length",
    "File",
    "File status",
    "Note",
)

#: What a spreadsheet reads as the start of a formula (OWASP's list).
_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")

_WHITESPACE = re.compile(r"\s+")


class SetListCancelled(Exception):
    """The write was stopped before the set list took its place."""


@dataclass(frozen=True)
class SetListChapter:
    """One chapter, in the Set's order.

    Attributes:
        position: Its place among the chapters, from 0.
        name: Its name; empty when unnamed.
    """

    position: int
    name: str = ""


@dataclass(frozen=True)
class SetListRow:
    """One entry, as a set list writes it.

    Attributes:
        position: The entry's place in the Set, from 0.
        chapter: The position of its chapter among the Set's chapters.
        starts_at: When it starts, from the Set's start, or None after an
            untimed entry (DEC-107).
        in_seconds: The planned in time, or None.
        out_seconds: The planned out time, or None.
        planned_seconds: How long it is planned to play, or None.
        artist: The artist, or None.
        title: The title, or None.
        remixer: The remixer, or None.
        bpm: The effective BPM (DEC-068), or None.
        key: The effective key in the library's notation, or None.
        length_seconds: The track's length, or None when not known.
        file_path: The track's file, as the library holds it.
        file_status: One of :data:`FILE_STATES`.
        note: The entry's note, or None.
    """

    position: int
    chapter: int
    starts_at: Optional[int] = None
    in_seconds: Optional[int] = None
    out_seconds: Optional[int] = None
    planned_seconds: Optional[int] = None
    artist: Optional[str] = None
    title: Optional[str] = None
    remixer: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    length_seconds: Optional[int] = None
    file_path: str = ""
    file_status: str = FILE_NOT_CHECKED
    note: Optional[str] = None

    def __post_init__(self) -> None:
        """Refuse a file state the writers do not know."""
        if self.file_status not in FILE_STATES:
            raise ValueError(
                f"file_status must be one of {FILE_STATES}, got {self.file_status!r}"
            )


@dataclass(frozen=True)
class SetList:
    """A Set, as its set list is written.

    Attributes:
        name: The Set's name.
        chapters: Every chapter, in order, empty ones included.
        rows: Every entry, in order, repeats included.
        running_seconds: The timed entries' sum (DEC-107).
        untimed: How many entries have no out time.
    """

    name: str
    chapters: Tuple[SetListChapter, ...]
    rows: Tuple[SetListRow, ...]
    running_seconds: int = 0
    untimed: int = 0

    @property
    def missing_files(self) -> int:
        """How many entries' files were missing when last checked."""
        return sum(1 for row in self.rows if row.file_status == FILE_MISSING)

    @property
    def shows_chapters(self) -> bool:
        """False for a Set with only its one unnamed chapter (DEC-103)."""
        return len(self.chapters) > 1 or any(c.name for c in self.chapters)


# ---------------------------------------------------------------- the words


def _line(value: Optional[str]) -> str:
    """A value on one line: every run of whitespace is one space."""
    return _WHITESPACE.sub(" ", value or "").strip()


def _chapter_label(chapter: SetListChapter) -> str:
    return _line(chapter.name) or f"Chapter {chapter.position + 1}"


def display_title(row: SetListRow) -> str:
    """The title, with a remixer it does not already name (DEC-110)."""
    title = _line(row.title)
    remixer = _line(row.remixer)
    if remixer and remixer.casefold() not in title.casefold():
        return f"{title} ({remixer} Remix)" if title else f"({remixer} Remix)"
    return title


def _artist_title(row: SetListRow, dash: str) -> str:
    """ "Artist – Title", or whichever of the two is known, or the file name."""
    artist, title = _line(row.artist), display_title(row)
    if artist and title:
        return f"{artist}{dash}{title}"
    return artist or title or Path(row.file_path).name or "Untitled"


def _bpm(value: Optional[float]) -> str:
    """A BPM as a DJ reads it: "128", "127.5", never "128.00"."""
    if value is None:
        return ""
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text or "0"


def _clock(seconds: Optional[int]) -> str:
    """Whole seconds as ``h:mm:ss``, which a spreadsheet cannot misread."""
    if seconds is None:
        return ""
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}"


def _safe_cell(value: str) -> str:
    """A cell no spreadsheet runs as a formula."""
    return f"'{value}" if value.startswith(_FORMULA_STARTS) else value


def _chapters_by_position(
    set_list: SetList,
) -> List[Tuple[SetListChapter, List[SetListRow]]]:
    """Each chapter with its entries, in order; an empty chapter keeps its place."""
    members: Dict[int, List[SetListRow]] = {c.position: [] for c in set_list.chapters}
    for row in set_list.rows:
        if row.chapter not in members:
            raise ValueError(
                f"Entry {row.position + 1} is in chapter {row.chapter + 1},"
                " which the set list does not have"
            )
        members[row.chapter].append(row)
    return [(chapter, members[chapter.position]) for chapter in set_list.chapters]


# -------------------------------------------------------------- the renderers


def render_text(set_list: SetList) -> str:
    """The Set as a plain-text tracklist."""
    rows = set_list.rows
    width = max(2, len(str(len(rows))))
    running = f"Running time {format_time(set_list.running_seconds)}"
    if set_list.untimed:
        running += (
            f" ({set_list.untimed} untimed "
            f"{'entry' if set_list.untimed == 1 else 'entries'} not counted)"
        )
    lines = [_line(set_list.name) or "Set", running]
    for chapter, members in _chapters_by_position(set_list):
        lines.append("")
        if set_list.shows_chapters:
            lines.append(_chapter_label(chapter))
        for row in members:
            starts = (
                f"[{format_time(row.starts_at)}]  " if row.starts_at is not None else ""
            )
            line = f"{row.position + 1:0{width}d}. {starts}{_artist_title(row, ' – ')}"
            planned = []
            if row.in_seconds is not None:
                planned.append(f"in {format_time(row.in_seconds)}")
            if row.out_seconds is not None:
                planned.append(f"out {format_time(row.out_seconds)}")
            if planned:
                line += f"  ({', '.join(planned)})"
            lines.append(line)
    return "\n".join(lines) + "\n"


def render_csv(set_list: SetList) -> str:
    """The Set as a CSV, one row per entry, every field (no byte-order mark)."""
    labels = {c.position: _chapter_label(c) for c in set_list.chapters}
    buffer = io.StringIO()
    table = csv.writer(buffer, lineterminator="\r\n")
    table.writerow(CSV_COLUMNS)
    for row in set_list.rows:
        cells = (
            str(row.position + 1),
            labels.get(row.chapter, "") if set_list.shows_chapters else "",
            _clock(row.starts_at),
            _clock(row.in_seconds),
            _clock(row.out_seconds),
            _clock(row.planned_seconds),
            _line(row.artist),
            _line(row.title),
            _line(row.remixer),
            _bpm(row.bpm),
            _line(row.key),
            _clock(row.length_seconds),
            row.file_path,
            row.file_status,
            _line(row.note),
        )
        table.writerow([_safe_cell(cell) for cell in cells])
    return buffer.getvalue()


def render_m3u8(set_list: SetList) -> str:
    """The Set as an extended M3U playlist in UTF-8, with no planned times."""
    lines = ["#EXTM3U", f"#PLAYLIST:{_line(set_list.name) or 'Set'}"]
    for chapter, members in _chapters_by_position(set_list):
        if set_list.shows_chapters:
            lines.append(f"# Chapter: {_chapter_label(chapter)}")
        for row in members:
            length = row.length_seconds if row.length_seconds is not None else -1
            lines.append(f"#EXTINF:{length},{_artist_title(row, ' - ')}")
            lines.append(row.file_path)
    return "\n".join(lines) + "\n"


def render(set_list: SetList, form: str) -> str:
    """The Set in one of :data:`FORMATS`.

    Raises:
        ValueError: If ``form`` is not one of them.
    """
    if form == FORMAT_TEXT:
        return render_text(set_list)
    if form == FORMAT_CSV:
        return render_csv(set_list)
    if form == FORMAT_M3U8:
        return render_m3u8(set_list)
    raise ValueError(f"A set list is one of {FORMATS}, not {form!r}")


def encoded(set_list: SetList, form: str) -> bytes:
    """The bytes a set list file holds: UTF-8, with a byte-order mark for CSV."""
    return render(set_list, form).encode("utf-8-sig" if form == FORMAT_CSV else "utf-8")


def form_of(path: str) -> Optional[str]:
    """The form a path's extension names, or None for any other extension."""
    return EXTENSIONS.get(Path(path).suffix.lower())


# ----------------------------------------------------------------- the writer


def write_set_list(
    set_list: SetList,
    form: str,
    destination_path: str,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> int:
    """Write a set list file atomically, and return how many bytes it holds.

    A temporary file beside the destination, then ``replace``: the pattern the
    Rekordbox export uses, so a write that fails or is stopped part-way leaves
    nothing at the destination and no temporary file behind. A stop asked for
    while the temporary file was written is honoured before the ``replace``,
    the last moment it can be.

    The caller validates the destination; this writes only to it.

    Raises:
        SetListCancelled: If ``should_cancel`` answered True before the file
            took its place.
        OSError: If the folder cannot be written to.
    """
    data = encoded(set_list, form)
    destination = Path(destination_path)
    temp_path: Optional[str] = None
    try:
        handle, temp_path = tempfile.mkstemp(
            suffix=destination.suffix,
            dir=str(destination.parent),
            prefix=".cuepoint_set_",
        )
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
        if should_cancel is not None and should_cancel():
            raise SetListCancelled(destination_path)
        Path(temp_path).replace(destination)
        temp_path = None
    finally:
        if temp_path is not None and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:  # pragma: no cover - best effort cleanup
                pass
    return len(data)


__all__: Sequence[str] = (
    "CSV_COLUMNS",
    "EXTENSIONS",
    "FILE_MISSING",
    "FILE_NOT_CHECKED",
    "FILE_PRESENT",
    "FILE_STATES",
    "FILE_UNREADABLE",
    "FORMATS",
    "FORMAT_CSV",
    "FORMAT_M3U8",
    "FORMAT_TEXT",
    "SetList",
    "SetListCancelled",
    "SetListChapter",
    "SetListRow",
    "display_title",
    "encoded",
    "form_of",
    "render",
    "render_csv",
    "render_m3u8",
    "render_text",
    "write_set_list",
)
