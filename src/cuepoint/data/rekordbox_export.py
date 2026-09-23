#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Patching a Rekordbox XML with CuePoint's values (EXPORT-01, EXPORT-02).

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

Why the playlists go in the same pass
-------------------------------------
EXPORT-02 appends CuePoint's own Collections as ``PLAYLISTS`` nodes. That is a
second change to the same document, and doing it as a second function over the
first one's output would mean reading and rewriting the file twice, and reading
back a destination the caller has just been handed — which is the one shape
:func:`refuse_source_as_destination` exists to stop anyone talking themselves
into. So ``playlists`` is an argument to the same call: one read, one splice
list, one atomic write, and a failure anywhere still leaves nothing behind.

The nodes are appended inside the tree's root folder rather than replacing
anything, under a single parent folder named ``CuePoint`` (DEC-078), so a user
can see which nodes are CuePoint's and delete them in one gesture. Rekordbox's
own tree above that folder is not reordered and not rewritten — the one
attribute this touches outside its own subtree is the root folder's ``Count``,
because a folder that has gained a child and still declares the old number is a
document contradicting itself, and the reader that believes it is Rekordbox.

What this module does not do
----------------------------
It does not render a key. ``services/tag_write_service.py::key_text`` is the one
implementation of that conversion and it lives a layer up, so the caller renders
and this module writes what it is given — which is also why nothing here imports
from ``services/``.

It does not know what a Collection is either. A Smart Collection's membership,
the order a Collection's entries are stored in and the folders they are filed
under are database questions, answered by EXPORT-04 and EXPORT-05; what arrives
here is a finished tree of :class:`ExportFolder` and :class:`ExportPlaylist`. So
every test over this module runs without a database, which is what makes the two
riskiest steps of the phase the two cheapest to prove.

Progress, and stopping part way (EXPORT-05)
-------------------------------------------
A patch reports progress in two phases — :data:`PHASE_TRACKS`, proportional to
the collection, then :data:`PHASE_PLAYLISTS`, proportional to the selection —
because one bar that jumps from the first to the second is worse than two honest
ones. It asks whether to stop between every track, between every playlist, and
once more after the new file is written and before it replaces anything, and a
stop raises :class:`ExportCancelled`. Nothing is at the destination then, and no
temp file is left behind: a cancelled export is not a partial one. The parse
itself is one call into expat and is not interrupted; at 50,000 tracks it is
about a second, which is the bound on how long a stop waits.
"""

import logging
import os
import re
import tempfile
import xml.parsers.expat as expat
from dataclasses import dataclass, field
from pathlib import Path
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Mapping,
    Optional,
    Sequence,
    Set,
    Tuple,
    Union,
)

from cuepoint.data.rekordbox import (
    MAX_XML_SIZE_BYTES,
    _measured_int,
    _optional_bpm,
    _optional_text,
    _rating_to_stars,
    _stars_to_rating,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.models.rekordbox_playlist import build_path

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

#: The folder every playlist this phase writes goes inside (DEC-078).
#:
#: One parent, so the answer to "which of these did CuePoint put here" is a
#: glance rather than an audit, and removing all of it is one gesture. A
#: top-level folder of this name that CuePoint did not create is never merged
#: into; the export renames its own folder instead.
CUEPOINT_FOLDER_NAME = "CuePoint"

#: The two phases a patch reports progress in (EXPORT-05).
PHASE_TRACKS = "tracks"
PHASE_PLAYLISTS = "playlists"
PHASES = (PHASE_TRACKS, PHASE_PLAYLISTS)

#: Not a phase anything reports progress in: the moment between the temp file
#: being written and it replacing the destination, which a stop can still reach.
PHASE_WRITE = "write"

#: Tracks between two progress reports. A report is a callback into the job
#: store, which takes a lock and wakes the event stream; per track would be
#: 50,000 of them for a bar that cannot show the difference.
PROGRESS_EVERY_TRACKS = 1000

#: What a progress callback is: the phase, how far through it, and of how many.
ProgressCallback = Callable[[str, int, int], None]

#: What a stop request is: asked often, answered cheaply.
CancelCheck = Callable[[], bool]


class ExportCancelled(Exception):
    """The caller asked the patch to stop, and it did before writing anything.

    Not a :class:`ValidationError`: nothing is wrong with the request, and a
    handler that turns validation errors into "that cannot be done" must not
    turn a user's own cancel into one.
    """

    def __init__(self, phase: str) -> None:
        super().__init__(f"Export cancelled while {phase_description(phase)}")
        self.phase = phase


def phase_description(phase: str) -> str:
    """How a phase is described in a sentence about stopping during it."""
    if phase == PHASE_TRACKS:
        return "patching tracks"
    if phase == PHASE_PLAYLISTS:
        return "building playlists"
    return "writing the file"


#: How a name collision on that folder is resolved: ``CuePoint (2)``, then (3).
_COLLISION_SUFFIX = "{name} ({number})"

#: How deep a tree this module will render before refusing.
#:
#: ``MAX_COLLECTION_DEPTH`` is 8, so this is slack rather than a limit a user
#: can reach by filing things. It is here because rendering is recursive and a
#: malformed tree should be a refusal with a name on it rather than a
#: ``RecursionError`` from somewhere inside a splice.
MAX_EXPORT_DEPTH = 16

#: Characters XML 1.0 has no way to represent, stripped from a name before it is
#: written. A Collection name reaches here from a text field, so this guards
#: against a paste rather than against the user.
_ILLEGAL_IN_XML = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")

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


@dataclass(frozen=True)
class ExportPlaylist:
    """One Collection, as a Rekordbox playlist node.

    ``track_ids`` is the export order and may repeat an id: DEC-058 lets a
    Collection hold a track twice, and a playlist with a closing reprise is two
    entries pointing at one ``TrackID``. Nothing here dedupes.

    ``ref`` is the caller's own token, echoed back in :class:`PlaylistResult`
    and never written to the file. EXPORT-05 records one row per exported
    playlist and has to know which Collection each result came from; matching on
    the name or the path would be guessing, because two Collections in different
    folders may share a name.
    """

    name: str
    track_ids: Tuple[str, ...] = ()
    ref: Optional[str] = None


@dataclass(frozen=True)
class ExportFolder:
    """A folder on the path to something the user chose (DEC-059)."""

    name: str
    children: Tuple["ExportNode", ...] = ()


#: Either kind of node in the tree handed to :func:`patch_collection_xml`.
ExportNode = Union[ExportFolder, ExportPlaylist]


@dataclass(frozen=True)
class PlaylistResult:
    """What one playlist became, for EXPORT-04's preview and EXPORT-05's record."""

    #: Where it landed, including the parent folder: ``CuePoint/Gigs/Saturday``.
    path: str
    name: str
    ref: Optional[str]
    #: Entries actually written — the Collection's length minus the drops.
    entry_count: int
    #: Track ids the source file does not contain, in the order they appeared
    #: and once per appearance, so ``entry_count + len(dropped)`` is always the
    #: Collection's own length (DEC-082).
    dropped: Tuple[str, ...] = ()

    @property
    def dropped_count(self) -> int:
        return len(self.dropped)


@dataclass
class PatchResult:
    """What a patch did, for EXPORT-04's preview and EXPORT-05's record."""

    #: COLLECTION TRACK elements the source held.
    tracks_seen: int = 0
    #: COLLECTION TRACK elements whose id is not in ``updates``, including any
    #: element carrying no id at all. On a whole-library export — where
    #: ``updates`` holds every track CuePoint has — this is DEC-082's "tracks
    #: the file holds that CuePoint does not know", which is the visible sign
    #: that a refresh is owed.
    tracks_unknown: int = 0
    #: Distinct track ids this patch changed, counted once each.
    tracks_changed: int = 0
    #: Field name to the number of tracks whose value for it changed.
    fields_changed: Dict[str, int] = field(default_factory=dict)
    #: Track ids asked for that the source does not contain.
    not_found: Tuple[str, ...] = ()
    #: Start tags rewritten — above ``tracks_changed`` only if a source repeats
    #: a track id, which Rekordbox does not do but a hand-edited file might.
    elements_patched: int = 0
    #: One entry per playlist written, in the order they appear in the file.
    playlists: Tuple[PlaylistResult, ...] = ()
    #: The parent folder's name as written — ``CuePoint``, or ``CuePoint (2)``
    #: when the tree already held one. ``None`` when nothing was appended.
    playlist_folder: Optional[str] = None
    #: True when that name had to be changed, which the preview reports.
    playlist_folder_renamed: bool = False

    @property
    def changed(self) -> bool:
        """Whether this export differs from its source at all."""
        return self.tracks_changed > 0 or bool(self.playlists)

    @property
    def dropped_reference_count(self) -> int:
        """Entries dropped across every playlist, for the export record."""
        return sum(len(playlist.dropped) for playlist in self.playlists)


@dataclass(frozen=True)
class _ValueSpan:
    """Where an attribute's value sits in the source bytes, and how it is quoted."""

    start: int
    end: int
    quote: int


@dataclass(frozen=True)
class _StartTag:
    """One start tag, read byte by byte: its values and its insertion points."""

    #: Attribute name to where its value sits.
    values: Mapping[str, _ValueSpan]
    #: Just after the last attribute, where a new attribute goes.
    insert_at: int
    #: The element's name, as spelled in the file.
    name: str = ""
    #: Whether the tag closes itself, so appending a child means opening it.
    self_closing: bool = False
    #: The ``/`` of a self-closing tag, or the ``>`` of a paired one.
    close_at: int = 0
    #: One byte past the ``>``.
    tag_end: int = 0


@dataclass(frozen=True)
class _Element:
    """One element the appender may need: where it is and what it holds."""

    name: str
    #: Byte offset of the ``<``.
    start: int
    #: Expat's index at the end event: the ``<`` of the closing tag when the
    #: element is paired, and one byte past ``/>`` when it closes itself. Which
    #: of the two it is comes from the start tag, not from this number, because
    #: a self-closing element is very often followed by its parent's ``</``.
    end: int
    #: Distance from the document root, which is 0.
    depth: int
    attrs: Mapping[str, str]
    #: The names of its direct ``NODE`` children, in document order.
    child_node_names: Tuple[str, ...] = ()


@dataclass
class _Scan:
    """What one parse of the document yields, for both halves of the export."""

    tracks: List[Tuple[int, Dict[str, str]]] = field(default_factory=list)
    #: The document's root element, whatever it is called.
    document: Optional[_Element] = None
    #: Its ``PLAYLISTS`` child, if it has one.
    playlists: Optional[_Element] = None
    #: The first ``NODE`` inside that, which in a Rekordbox file is ``ROOT``.
    first_playlists_node: Optional[_Element] = None


@dataclass(frozen=True)
class _Layout:
    """How the document lays out a nested element, so an insertion matches it.

    ``newline`` is empty for a document written without line breaks, and then so
    is everything else: a file with no whitespace between tags gets an insertion
    with none either, rather than one block of pretty-printing in the middle of
    a single line.
    """

    newline: str
    #: The container's own indentation.
    indent: str
    #: One level of it.
    unit: str


@dataclass(frozen=True)
class _Appended:
    """The result of rendering a playlist tree into splices."""

    edits: List[Tuple[int, int, bytes]]
    folder: str
    renamed: bool
    playlists: Tuple[PlaylistResult, ...]


#: The wrappers an append may have to create, as ``(opening, closing)``. A
#: Rekordbox export always has both, so these are for a hand-made file — and
#: they are written rather than skipped because a ``PLAYLISTS`` element with no
#: ``ROOT`` folder is not a tree Rekordbox reads.
_PLAYLISTS_WRAPPER = ("<PLAYLISTS>", "</PLAYLISTS>")
_ROOT_WRAPPER = ('<NODE Type="0" Name="ROOT" Count="1">', "</NODE>")


# --------------------------------------------------------------- public surface


def refuse_source_as_destination(source_path: str, destination_path: str) -> None:
    """Raise when a destination would overwrite the source XML (DEC-083).

    "Always a new file, never the source" has been this repository's safety
    property since the first attribute patch, and it has been a habit of the call
    sites rather than a rule the code enforces. It is enforced here, at the lowest
    level that writes, so every caller inherits it and EXPORT-05 has one
    implementation to reuse rather than a second to keep in step.

    The filesystem is asked first, and only then the path strings. ``samefile``
    answers the question that matters — is this the same file — for a case
    difference, a hard link or a mount reached by two names, none of which a
    string comparison can see. ``os.path.normcase`` cannot stand in for it:
    it folds case on Windows and does nothing at all on POSIX, so on a
    case-insensitive macOS volume — the default for APFS and HFS+ —
    ``COLLECTION.XML`` compared unequal to ``collection.xml`` and named the
    very same bytes. That is the source being overwritten, silently, which is
    the one thing this function exists to prevent.

    The string comparison stays for the case ``samefile`` cannot answer: a
    destination that does not exist yet, which is the ordinary export. It is
    resolved and case-folded, so a relative path, a trailing separator, a case
    difference on Windows or a symlink cannot defeat it either.
    """

    def normalized(path: str) -> str:
        try:
            resolved = str(Path(path).resolve(strict=False))
        except OSError:  # pragma: no cover - resolve() on a hostile path
            resolved = os.path.abspath(path)
        return os.path.normcase(resolved)

    def is_the_same_file() -> bool:
        try:
            return os.path.samefile(source_path, destination_path)
        except OSError:
            # One of them does not exist, or cannot be stat'ed. A destination
            # that is not there cannot be the source, so fall back to the paths.
            return normalized(source_path) == normalized(destination_path)

    if is_the_same_file():
        raise ValidationError(
            "Refusing to write the export over the collection it was read from: "
            f"{destination_path}. Choose a different file."
        )


def plan_collection_xml(
    source_path: str,
    updates: Mapping[str, TrackExportValues],
    playlists: Optional[Sequence[ExportNode]] = None,
    *,
    on_progress: Optional[ProgressCallback] = None,
    should_cancel: Optional[CancelCheck] = None,
) -> PatchResult:
    """Return what :func:`patch_collection_xml` would do, without writing.

    EXPORT-04's preview, and the reason DEC-084's "the preview is computed, not
    estimated" is a property of the code rather than a promise. This is not a
    second implementation that walks the same file the same way: it is the
    patch itself with the serialization skipped, so the only thing that can put
    a number here and a number in the result apart is a genuine change between
    the two reads.

    Args:
        source_path: The Rekordbox XML the library was imported from (DEC-035).
        updates: As :func:`patch_collection_xml` takes them.
        playlists: As :func:`patch_collection_xml` takes them.
        on_progress: As :func:`patch_collection_xml` takes it.
        should_cancel: As :func:`patch_collection_xml` takes it.

    Returns:
        The same :class:`PatchResult` the write returns: every attribute that
        would change, every track id the file does not hold, and what each
        playlist would become — the folder's name included, so a collision is
        reported before anything is written.

    Raises:
        FileNotFoundError: The source does not exist.
        ValidationError: The source is too large, its encoding is not one this
            can splice, it is not well-formed, or the tree is deeper than
            :data:`MAX_EXPORT_DEPTH`.
        ExportCancelled: ``should_cancel`` answered yes.
    """
    return _plan(source_path, updates, playlists, on_progress, should_cancel)[0]


def patch_collection_xml(
    source_path: str,
    updates: Mapping[str, TrackExportValues],
    destination_path: str,
    playlists: Optional[Sequence[ExportNode]] = None,
    *,
    on_progress: Optional[ProgressCallback] = None,
    should_cancel: Optional[CancelCheck] = None,
) -> PatchResult:
    """Write a copy of ``source_path`` with CuePoint's values and playlists.

    Args:
        source_path: The Rekordbox XML the library was imported from (DEC-035).
        updates: Track id, as the importer reads it, to that track's effective
            values. A track absent from this map is not touched at all.
        destination_path: Where to write. Never the source (DEC-083).
        playlists: The nodes to append under the ``CuePoint`` folder, already
            resolved to track ids in export order. ``None`` and an empty
            sequence both mean "append nothing", and then no folder is created:
            an empty ``CuePoint`` folder in a DJ's tree is litter, not a result.
        on_progress: Called with a phase from :data:`PHASES`, how far through
            it the patch is, and the phase's total — at the start and end of
            each phase and every :data:`PROGRESS_EVERY_TRACKS` tracks between.
        should_cancel: Asked between every track, between every playlist, and
            once more before the written file replaces anything. Answering yes
            raises :class:`ExportCancelled` with nothing at the destination.

    Returns:
        A :class:`PatchResult` counting what changed, what was not found, and
        what each playlist became.

    Raises:
        FileNotFoundError: The source does not exist.
        ValidationError: The source is too large, its encoding is not one this
            can splice, it is not well-formed, the tree is deeper than
            :data:`MAX_EXPORT_DEPTH`, or the destination is the source.
        ExportCancelled: ``should_cancel`` answered yes.
        OSError: Writing failed.
    """
    refuse_source_as_destination(source_path, destination_path)
    result, data, edits = _plan(
        source_path, updates, playlists, on_progress, should_cancel
    )
    _write_atomically(data, edits, destination_path, should_cancel)
    return result


def _plan(
    source_path: str,
    updates: Mapping[str, TrackExportValues],
    playlists: Optional[Sequence[ExportNode]],
    on_progress: Optional[ProgressCallback] = None,
    should_cancel: Optional[CancelCheck] = None,
) -> Tuple[PatchResult, bytes, List[Tuple[int, int, bytes]]]:
    """The whole of a patch except the write: what it would do, and the edits.

    One implementation, two callers. The preview stops here; the export goes on
    to :func:`_write_atomically`. That is what makes EXPORT-04's numbers and
    EXPORT-05's numbers the same numbers rather than two that happen to agree.
    """
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
    scan = _scan_document(data)
    total = len(scan.tracks)
    _report(on_progress, PHASE_TRACKS, 0, total)
    for offset, attrs in scan.tracks:
        if should_cancel is not None and should_cancel():
            raise ExportCancelled(PHASE_TRACKS)
        if result.tracks_seen and result.tracks_seen % PROGRESS_EVERY_TRACKS == 0:
            _report(on_progress, PHASE_TRACKS, result.tracks_seen, total)
        result.tracks_seen += 1
        track_id = _identity(attrs)
        if track_id is not None:
            seen_ids.add(track_id)
        if track_id is None or track_id not in updates:
            result.tracks_unknown += 1
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
    _report(on_progress, PHASE_TRACKS, total, total)

    wanted = _count_playlists(playlists or ())
    written = 0

    def tick() -> None:
        # Once per playlist, before it is rendered: a stop is honoured between
        # playlists, and the count reported is the number already finished.
        nonlocal written
        if should_cancel is not None and should_cancel():
            raise ExportCancelled(PHASE_PLAYLISTS)
        _report(on_progress, PHASE_PLAYLISTS, written, wanted)
        written += 1

    if playlists:
        appended = _append_playlists(data, scan, playlists, seen_ids, encoding, tick)
        edits.extend(appended.edits)
        result.playlists = appended.playlists
        result.playlist_folder = appended.folder
        result.playlist_folder_renamed = appended.renamed
    _report(on_progress, PHASE_PLAYLISTS, wanted, wanted)

    return result, data, edits


def _report(
    on_progress: Optional[ProgressCallback], phase: str, done: int, total: int
) -> None:
    """Hand one progress tick to the caller, if it asked for them."""
    if on_progress is not None:
        on_progress(phase, done, total)


def _count_playlists(nodes: Sequence[ExportNode]) -> int:
    """How many playlists a tree holds, at any depth — the playlist phase's total."""
    count = 0
    pending: List[ExportNode] = list(nodes)
    while pending:
        node = pending.pop()
        if isinstance(node, ExportFolder):
            pending.extend(node.children)
        else:
            count += 1
    return count


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


def _scan_document(data: bytes) -> _Scan:
    """One parse, answering both halves of the export.

    Expat does the finding, so a ``<TRACK`` inside a comment, a CDATA section or
    a processing instruction is not mistaken for an element, and attribute
    values arrive unescaped. Only a direct child of ``COLLECTION`` counts as a
    track: a ``TRACK`` under ``PLAYLISTS`` is an entry referencing one.

    It also locates where a playlist may be appended and what is already there.
    Siblings close in the order they opened, so the first ``NODE`` inside
    ``PLAYLISTS`` to reach its end event is the first one in the file.
    """
    scan = _Scan()
    stack: List[Dict[str, Any]] = []
    parser = expat.ParserCreate()

    def start(name: str, attrs: Dict[str, str]) -> None:
        if name == "TRACK" and stack and stack[-1]["name"] == "COLLECTION":
            scan.tracks.append((parser.CurrentByteIndex, dict(attrs)))
        stack.append(
            {
                "name": name,
                "start": parser.CurrentByteIndex,
                "attrs": dict(attrs),
                "children": [],
            }
        )

    def end(name: str) -> None:
        if not stack:  # pragma: no cover - expat balances the tags
            return
        frame = stack.pop()
        parent = stack[-1] if stack else None
        element = _Element(
            name=name,
            start=int(frame["start"]),
            end=parser.CurrentByteIndex,
            depth=len(stack),
            attrs=frame["attrs"],
            child_node_names=tuple(frame["children"]),
        )
        if parent is None:
            scan.document = element
            return
        if name == "NODE":
            parent["children"].append(_node_name(element.attrs))
        if name == "PLAYLISTS" and element.depth == 1 and scan.playlists is None:
            scan.playlists = element
        elif (
            name == "NODE"
            and element.depth == 2
            and parent["name"] == "PLAYLISTS"
            and scan.first_playlists_node is None
        ):
            scan.first_playlists_node = element

    parser.StartElementHandler = start
    parser.EndElementHandler = end
    try:
        parser.Parse(data, True)
    except expat.ExpatError as exc:
        raise ValidationError(f"The collection XML is not well-formed: {exc}") from exc
    return scan


def _node_name(attrs: Mapping[str, str]) -> str:
    """A ``NODE``'s name, read the way :func:`iter_playlist_nodes` reads it."""
    return (attrs.get("Name") or attrs.get("name") or "").strip()


def _is_folder(attrs: Mapping[str, str]) -> bool:
    """Whether a ``NODE`` holds other nodes. ``Type="1"`` is a playlist."""
    return (attrs.get("Type") or attrs.get("type") or "0").strip() != "1"


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

    It also reports how the tag closes, because appending a child to an element
    written as ``<NODE …/>`` means turning it into a pair. Expat's own end index
    cannot answer that: for a self-closing element it points one byte past
    ``/>``, which is very often the ``</`` of the parent.
    """
    index = offset + 1
    length = len(data)
    while index < length and data[index : index + 1] not in _TAG_STOP:
        index += 1
    element_name = data[offset + 1 : index].decode("ascii", errors="replace")
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

    closing_at = index
    marker = data[closing_at : closing_at + 1]
    if marker not in (b"/", b">"):  # pragma: no cover - well-formed by now
        # The scan above stops on one of the two in any document expat accepted.
        # This is a floor under that reasoning rather than a path with a case.
        found = data.find(b">", closing_at)
        closing_at = found if found != -1 else max(length - 1, 0)
        if data[closing_at - 1 : closing_at] == b"/":
            closing_at -= 1
        marker = data[closing_at : closing_at + 1]
    self_closing = marker == b"/"

    return _StartTag(
        values=values,
        insert_at=insert_at,
        name=element_name,
        self_closing=self_closing,
        close_at=closing_at,
        tag_end=closing_at + (2 if self_closing else 1),
    )


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


# ------------------------------------------------ appending CuePoint's own tree


def _append_playlists(
    data: bytes,
    scan: _Scan,
    nodes: Sequence[ExportNode],
    known_ids: Set[str],
    encoding: str,
    tick: Callable[[], None] = lambda: None,
) -> _Appended:
    """Render ``nodes`` under the ``CuePoint`` folder and return the splices."""
    container, wrappers = _append_target(scan)
    folder, renamed = _folder_name(() if wrappers else container.child_node_names)

    results: List[PlaylistResult] = []
    lines: List[Tuple[int, str]] = []
    level = 0
    for opening, _closing in wrappers:
        lines.append((level, opening))
        level += 1
    _emit(
        ExportFolder(name=folder, children=tuple(nodes)),
        level,
        None,
        known_ids,
        results,
        lines,
        encoding,
        tick,
    )
    for opening, closing in reversed(wrappers):
        level -= 1
        lines.append((level, closing))

    tag = _read_start_tag(data, container.start)
    layout = _layout_for(data, container)
    edits = [_insert_children(data, container, tag, lines, layout, encoding)]
    count = _count_edit(container, tag, bool(wrappers), encoding)
    if count is not None:
        edits.append(count)
    return _Appended(
        edits=edits, folder=folder, renamed=renamed, playlists=tuple(results)
    )


def _append_target(scan: _Scan) -> Tuple[_Element, Tuple[Tuple[str, str], ...]]:
    """The element a new node goes inside, and any wrappers to create first.

    In a Rekordbox export this is the ``ROOT`` folder and no wrappers, every
    time. The other three answers are for files Rekordbox did not write, and
    they exist because the alternative is an export that silently drops the
    playlists a user explicitly asked for:

    - ``PLAYLISTS`` holding playlists directly, with no folder: append beside
      them rather than inventing a parent around somebody else's nodes.
    - ``PLAYLISTS`` empty: create the ``ROOT`` folder inside it, because a tree
      with no root folder is not one Rekordbox reads.
    - no ``PLAYLISTS`` at all: create both, at the end of the document.
    """
    root = scan.first_playlists_node
    if root is not None and _is_folder(root.attrs):
        return root, ()
    if scan.playlists is not None:
        if scan.playlists.child_node_names:
            return scan.playlists, ()
        return scan.playlists, (_ROOT_WRAPPER,)
    if scan.document is None:  # pragma: no cover - expat requires a root element
        raise ValidationError("The collection XML has no root element.")
    return scan.document, (_PLAYLISTS_WRAPPER, _ROOT_WRAPPER)


def _folder_name(taken: Sequence[str]) -> Tuple[str, bool]:
    """``CuePoint``, or the first free ``CuePoint (n)``, and whether it moved.

    The comparison folds case, because two nodes a user cannot tell apart in the
    tree are a collision whatever the bytes say. Merging into an existing node is
    never an option: a folder called ``CuePoint`` may be the user's own, holding
    work this export has no business writing into or, later, deleting.
    """
    existing = {name.casefold() for name in taken}
    if CUEPOINT_FOLDER_NAME.casefold() not in existing:
        return CUEPOINT_FOLDER_NAME, False
    number = 2
    while True:
        candidate = _COLLISION_SUFFIX.format(name=CUEPOINT_FOLDER_NAME, number=number)
        if candidate.casefold() not in existing:
            return candidate, True
        number += 1


def _emit(
    node: ExportNode,
    level: int,
    parent_path: Optional[str],
    known_ids: Set[str],
    results: List[PlaylistResult],
    lines: List[Tuple[int, str]],
    encoding: str,
    tick: Callable[[], None] = lambda: None,
) -> None:
    """Append one node's lines, depth first, and record what a playlist became.

    The node shape is Rekordbox's own, read from real exports and from
    :func:`iter_playlist_nodes`: ``Type="0"`` with a ``Count`` for a folder,
    ``Type="1" KeyType="0"`` with an ``Entries`` for a playlist, and ``TRACK
    Key="…"`` children. ``Key`` is the right name here and the wrong one on a
    ``COLLECTION`` track, which is why :data:`FORBIDDEN_ATTRS` forbids it there.

    ``Count`` and ``Entries`` are computed from what is actually written, after
    the drops, so they cannot disagree with the children below them.
    """
    if level > MAX_EXPORT_DEPTH:
        raise ValidationError(
            f"Refusing to export a playlist tree more than {MAX_EXPORT_DEPTH} "
            "levels deep: something has gone wrong with the folder structure."
        )
    name = _xml_safe(node.name)
    path = build_path(parent_path, name)
    quoted = _escape(name, 0x22, encoding)

    if isinstance(node, ExportFolder):
        opening = f'<NODE Name="{quoted}" Type="0" Count="{len(node.children)}"'
        if not node.children:
            lines.append((level, opening + "/>"))
            return
        lines.append((level, opening + ">"))
        for child in node.children:
            _emit(child, level + 1, path, known_ids, results, lines, encoding, tick)
        lines.append((level, "</NODE>"))
        return

    tick()
    entries, dropped = _split_entries(node.track_ids, known_ids)
    results.append(
        PlaylistResult(
            path=path,
            name=name,
            ref=node.ref,
            entry_count=len(entries),
            dropped=dropped,
        )
    )
    opening = f'<NODE Name="{quoted}" Type="1" KeyType="0" Entries="{len(entries)}"'
    if not entries:
        # An empty Collection exports as an empty playlist rather than being
        # skipped: the user selected it, which said something.
        lines.append((level, opening + "/>"))
        return
    lines.append((level, opening + ">"))
    for track_id in entries:
        lines.append((level + 1, f'<TRACK Key="{_escape(track_id, 0x22, encoding)}"/>'))
    lines.append((level, "</NODE>"))


def _split_entries(
    track_ids: Sequence[str], known_ids: Set[str]
) -> Tuple[List[str], Tuple[str, ...]]:
    """Split a Collection's entries into what the file can reference and what it cannot.

    An id the ``COLLECTION`` does not hold would be a dangling reference, so it
    is dropped and counted (DEC-082) — the only reason an exported playlist may
    be shorter than the Collection on screen. A track whose *file* is missing is
    a different fact and is exported unchanged (DEC-088): the XML still has the
    track, so the reference still resolves.

    Order is preserved and nothing is deduped (DEC-058).
    """
    entries: List[str] = []
    dropped: List[str] = []
    for raw in track_ids:
        track_id = str(raw).strip()
        if track_id and track_id in known_ids:
            entries.append(track_id)
        else:
            dropped.append(track_id)
    return entries, tuple(dropped)


def _xml_safe(text: str) -> str:
    """A name as it can actually be written, so what is read back is what it is.

    A tab or a newline inside an attribute value is legal but every parser turns
    it into a space, so it becomes one here instead of appearing to survive.
    Surrounding whitespace goes for the same reason: ``_playlist_node_from_element``
    trims a name it reads, as does every other reader of this tree, so a name
    written with it would not be the name anybody sees. Characters XML 1.0
    cannot represent at all are dropped, because the promise this module makes
    is a well-formed file.
    """
    collapsed = re.sub("[\t\n\r]+", " ", str(text))
    return _ILLEGAL_IN_XML.sub("", collapsed).strip()


def _layout_for(data: bytes, container: _Element) -> _Layout:
    """How the document indents, read off the container itself.

    Two places say it, and the better one is asked first. The whitespace before
    a paired element's closing tag is the indentation that tag sits at, which is
    the container's own, and it is right even when the start tag shares a line
    with something else. A self-closing element has no such run — its end index
    is one byte past ``/>`` — so that reading simply does not apply, and the line
    the start tag sits on answers instead.

    The unit comes from dividing that indentation by the container's depth, which
    is exact for any document that indents one level at a time — every Rekordbox
    export, and every file anyone has pretty-printed since. Where it does not
    divide, a guess that keeps the file readable beats refusing to export.
    """
    run = container.end
    while run > 0 and data[run - 1 : run] in _WHITESPACE:
        run -= 1
    line_start = data.rfind(b"\n", run, container.end)
    if line_start == -1:
        line_start = data.rfind(b"\n", 0, container.start)
        if line_start == -1:
            return _Layout("", "", "")
        prefix = data[line_start + 1 : container.start]
        if prefix.strip(_WHITESPACE):
            # Something else shares the line, so the document is not indenting.
            return _Layout("", "", "")
    else:
        prefix = data[line_start + 1 : container.end]

    newline = "\r\n" if data[line_start - 1 : line_start] == b"\r" else "\n"
    indent = prefix.decode("ascii", errors="replace")
    if indent and container.depth > 0 and len(indent) % container.depth == 0:
        unit = indent[: len(indent) // container.depth]
    elif "\t" in indent:
        unit = "\t"
    else:
        unit = "  "
    return _Layout(newline=newline, indent=indent, unit=unit)


def _render_lines(lines: Sequence[Tuple[int, str]], layout: _Layout) -> str:
    """Join rendered lines, indenting each one level deeper than the container."""
    if not layout.newline:
        return "".join(text for _level, text in lines)
    return "".join(
        layout.newline + layout.indent + layout.unit * (level + 1) + text
        for level, text in lines
    )


def _insert_children(
    data: bytes,
    container: _Element,
    tag: _StartTag,
    lines: Sequence[Tuple[int, str]],
    layout: _Layout,
    encoding: str,
) -> Tuple[int, int, bytes]:
    """The one splice that puts the rendered tree inside ``container``.

    For a paired element the whitespace before its closing tag is consumed and
    written back, so the block lands on its own lines and the closing tag stays
    where it was instead of being pushed along by an insertion that begins with
    the indentation already in front of it.
    """
    body = _render_lines(lines, layout)
    if tag.self_closing:
        replacement = f">{body}{layout.newline}{layout.indent}</{container.name}>"
        return (tag.close_at, tag.tag_end, replacement.encode(encoding))

    start = container.end
    if layout.newline:
        while start > tag.tag_end and data[start - 1 : start] in _WHITESPACE:
            start -= 1
    return (
        start,
        container.end,
        f"{body}{layout.newline}{layout.indent}".encode(encoding),
    )


def _count_edit(
    container: _Element,
    tag: _StartTag,
    created: bool,
    encoding: str,
) -> Optional[Tuple[int, int, bytes]]:
    """Correct the container folder's ``Count``, which has gained a child.

    The only attribute this phase writes outside its own subtree. A folder whose
    ``Count`` says three while four nodes sit inside it is a document that
    contradicts itself, and the reader that has to choose is Rekordbox. The value
    written is the real number of child nodes rather than the old number plus
    one, so a file that was already wrong comes out right.

    Nothing is added where nothing was: a document that never declared a
    ``Count`` is not given one.
    """
    if created or container.name != "NODE":
        return None
    for spelling in ("Count", "count"):
        if spelling not in container.attrs:
            continue
        wanted = str(len(container.child_node_names) + 1)
        if (container.attrs[spelling] or "").strip() == wanted:
            return None
        span = tag.values.get(spelling)
        if span is None:  # pragma: no cover - the attrs came from this same tag
            return None
        return (span.start, span.end, wanted.encode(encoding))
    return None


def _write_atomically(
    data: bytes,
    edits: List[Tuple[int, int, bytes]],
    destination_path: str,
    should_cancel: Optional[CancelCheck] = None,
) -> None:
    """Splice the edits into ``data`` and write via a temp file in the same dir.

    A temp file beside the destination, then ``replace``: the pattern the
    orphaned writer used, and the reason an export that fails part-way leaves
    nothing at the destination and no temp file behind.

    A stop asked for while the temp file was being written is honoured before
    the ``replace``, which is the last moment it can be: afterwards the file is
    the user's, and removing it again would be deleting something rather than
    declining to write it.
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
        if should_cancel is not None and should_cancel():
            raise ExportCancelled(PHASE_WRITE)
        Path(temp_path).replace(destination)
        temp_path = None
    finally:
        if temp_path is not None and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:  # pragma: no cover - best effort cleanup
                pass
