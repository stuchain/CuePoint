#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Looking for missing files in a folder (DEC-073's "Find in a folder").

A find answers one question: where, inside a folder the person chose, is the file
a missing track points at. It never changes a track's path and writes nothing, to
the database or to disk. Relinking stays Rekordbox's Relocate; this only says
where the file is now, so the person can point Rekordbox at it.

Matching is by file name (Unicode NFC, casefolded), over audio files only. A name
found once, for one wanted track, is the answer unless the file's length is known
and differs from the track's. A name found several times, or wanted by several
tracks, is settled by length: the one candidate whose duration is within
:data:`DURATION_TOLERANCE_SECONDS` of the track's, read only for those candidates.
Anything still undecided is reported as ambiguous with how many files had the
name, and no path, because guessing would send a person to the wrong file. One
path is never given to two tracks.
"""

from __future__ import annotations

import os
import re
import stat
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

from cuepoint.data.audio_decode import AUDIO_EXTENSIONS
from cuepoint.utils.long_path import os_path

#: The most files a walk looks at before it stops and says it was cut short.
MAX_FILES_LOOKED_AT = 500_000

#: How far a candidate's length may be from the track's and still be "the same".
DURATION_TOLERANCE_SECONDS = 2.0

#: Folders never entered besides dot-folders and ones the system marks hidden.
_SKIPPED_FOLDER_NAMES = frozenset(
    {"$recycle.bin", "system volume information", "@eadir", "lost+found"}
)

_SEPARATORS = re.compile(r"[\\/]")

_FILE_ATTRIBUTE_HIDDEN = 0x2
_FILE_ATTRIBUTE_SYSTEM = 0x4
_FILE_ATTRIBUTE_REPARSE_POINT = 0x400

#: Reads a file's length in seconds, or None when it cannot be read.
DurationReader = Callable[[str], Optional[float]]


@dataclass(frozen=True)
class WantedFile:
    """A missing track to look for.

    Attributes:
        track_id: The library track.
        path: Where the library says the file is (only its name is used).
        duration_seconds: The track's length, or None when unknown.
    """

    track_id: int
    path: str
    duration_seconds: Optional[float] = None


@dataclass
class FileFindResult:
    """What a find saw, in the shape the job hands the renderer."""

    folder: str
    looked: int = 0
    truncated: bool = False
    cancelled: bool = False
    found: List[Dict[str, Any]] = field(default_factory=list)
    ambiguous: List[Dict[str, Any]] = field(default_factory=list)
    not_found: List[int] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """The job result."""
        return {
            "folder": self.folder,
            "looked": self.looked,
            "truncated": self.truncated,
            "found": self.found,
            "ambiguous": self.ambiguous,
            "not_found": self.not_found,
        }

    def summary_line(self) -> str:
        """One line for a cancelled job's message."""
        return f"Stopped after looking at {self.looked} files"


def file_name_key(path: str) -> str:
    """The casefolded last segment of a path, spelled with either separator."""
    return _normal_name(_SEPARATORS.split(path.strip())[-1])


def _normal_name(name: str) -> str:
    """A file name as it is compared: NFC (a Mac spells accents apart), then casefolded."""
    return unicodedata.normalize("NFC", name).casefold()


def _directory_identity(path: str) -> Optional[tuple]:
    """``(device, inode)`` of a directory, or None when it cannot be read."""
    try:
        info = os.stat(os_path(path))
    except OSError:
        return None
    return (info.st_dev, info.st_ino) if info.st_ino else None


def _is_hidden(entry: "os.DirEntry[str]") -> bool:
    name = entry.name
    if name.startswith(".") or name.casefold() in _SKIPPED_FOLDER_NAMES:
        return True
    info = entry.stat(follow_symlinks=False)
    attributes = getattr(info, "st_file_attributes", 0)
    if attributes & (_FILE_ATTRIBUTE_HIDDEN | _FILE_ATTRIBUTE_SYSTEM):
        return True
    return bool(getattr(info, "st_flags", 0) & getattr(stat, "UF_HIDDEN", 0))


def _is_link_to_elsewhere(entry: "os.DirEntry[str]") -> bool:
    """A junction or other reparse point: a folder that may lead back up the tree."""
    is_junction = getattr(entry, "is_junction", None)
    if is_junction is not None and is_junction():
        return True
    attributes = getattr(entry.stat(follow_symlinks=False), "st_file_attributes", 0)
    return bool(attributes & _FILE_ATTRIBUTE_REPARSE_POINT)


def read_duration(path: str) -> Optional[float]:
    """A file's length in seconds, or None when mutagen cannot tell."""
    try:
        import mutagen

        audio = mutagen.File(os_path(path))
        length = getattr(getattr(audio, "info", None), "length", None)
        return None if length is None else float(length)
    except Exception:  # noqa: BLE001 — an unreadable candidate is simply not chosen
        return None


def find_files(
    folder: str,
    wanted: Sequence[WantedFile],
    *,
    on_progress: Optional[Callable[[int, int], None]] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
    duration_of: DurationReader = read_duration,
    max_files: int = MAX_FILES_LOOKED_AT,
) -> FileFindResult:
    """Walk ``folder`` and say where each wanted file is.

    Args:
        folder: An existing directory.
        wanted: The missing tracks.
        on_progress: Called with ``(directories scanned, directories known so
            far)`` after each directory.
        should_cancel: Polled between directories and between duration reads.
            A cancelled find answers with the matches it had settled; a track
            it had not reached is listed as not found, which then means "not
            looked for yet", and ``cancelled`` says so.
        duration_of: How a candidate's length is read; a test replaces it.
        max_files: The file count at which the walk stops.
    """
    result = FileFindResult(folder=folder)
    names = {file_name_key(item.path) for item in wanted}
    seen_folders = set()
    index: Dict[str, List[str]] = {}
    pending: List[str] = [folder]
    scanned = 0
    while pending:
        if should_cancel is not None and should_cancel():
            result.cancelled = True
            break
        directory = pending.pop()
        identity = _directory_identity(directory)
        if identity is not None:
            if identity in seen_folders:
                continue
            seen_folders.add(identity)
        scanned += 1
        try:
            entries = list(os.scandir(os_path(directory)))
        except OSError:
            entries = []
        for entry in entries:
            try:
                if entry.is_dir(follow_symlinks=False):
                    if not _is_hidden(entry) and not _is_link_to_elsewhere(entry):
                        pending.append(os.path.join(directory, entry.name))
                    continue
                if not entry.is_file():
                    continue
            except OSError:
                continue
            result.looked += 1
            key = _normal_name(entry.name)
            if key in names and os.path.splitext(key)[1] in AUDIO_EXTENSIONS:
                index.setdefault(key, []).append(os.path.join(directory, entry.name))
            if result.looked >= max_files:
                result.truncated = True
                break
        if on_progress is not None:
            on_progress(scanned, scanned + len(pending))
        if result.truncated:
            break

    sharing: Dict[str, int] = {}
    for item in wanted:
        sharing[file_name_key(item.path)] = sharing.get(file_name_key(item.path), 0) + 1
    lengths: Dict[str, Optional[float]] = {}

    def length_of(path: str) -> Optional[float]:
        if path not in lengths:
            lengths[path] = duration_of(path)
        return lengths[path]

    chosen: Dict[int, str] = {}
    for item in wanted:
        if should_cancel is not None and should_cancel():
            result.cancelled = True
            break
        key = file_name_key(item.path)
        picked = _choose(item, index.get(key, []), sharing[key] > 1, length_of)
        if picked is not None:
            chosen[item.track_id] = picked
    claims: Dict[str, int] = {}
    for path in chosen.values():
        claims[path] = claims.get(path, 0) + 1
    for item in wanted:
        candidates = index.get(file_name_key(item.path), [])
        path = chosen.get(item.track_id)
        if path is not None and claims[path] == 1:
            result.found.append({"track_id": item.track_id, "path": path})
        elif (
            len(candidates) > 1
            or path is not None
            or (candidates and sharing[file_name_key(item.path)] > 1)
        ):
            result.ambiguous.append(
                {"track_id": item.track_id, "count": max(1, len(candidates))}
            )
        else:
            result.not_found.append(item.track_id)
    return result


def _choose(
    item: WantedFile,
    candidates: List[str],
    shared: bool,
    length_of: Callable[[str], Optional[float]],
) -> Optional[str]:
    """The one file that is this track's, or None when it cannot be told."""
    if not candidates:
        return None
    wanted = item.duration_seconds

    def matches(path: str) -> Optional[bool]:
        length = length_of(path)
        if wanted is None or length is None:
            return None
        return abs(length - float(wanted)) <= DURATION_TOLERANCE_SECONDS

    if len(candidates) == 1 and not shared:
        return None if matches(candidates[0]) is False else candidates[0]
    close = [path for path in candidates if matches(path) is True]
    return close[0] if len(close) == 1 else None
