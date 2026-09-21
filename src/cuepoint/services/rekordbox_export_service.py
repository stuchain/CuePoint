#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What an export would write, and then writing it (EXPORT-04, EXPORT-05).

The Rekordbox export — not ``export_service.py``, which is the CSV, JSON and
Excel one reached from Settings. Nothing in this module is named so that the two
can be confused, and the phase's own rule says a reviewer should never have to
open a file to learn which export it is.

Two calls. :meth:`RekordboxExportService.preview` answers, for a chosen set of
Collections and the file the library came from, exactly what an export would do,
and writes nothing. :meth:`RekordboxExportService.export` does it: one file at a
destination a person chose, then one row recording how it ended and, when it
wrote, one activity event.

Why a plan, and then a preview of it
------------------------------------
DEC-084 says the preview "is the same query the write walks", which is easy to
write in a document and easy to lose the first time the write gains a case the
preview does not know about. So the shape here is deliberate:
:meth:`RekordboxExportService.plan` produces everything a write needs — the
effective values per track, the playlist tree resolved to track ids, the source
and its staleness — and :meth:`RekordboxExportService.preview` hands that plan to
``plan_collection_xml``, which is ``patch_collection_xml`` with the write left
out. :meth:`RekordboxExportService.export` hands the same plan to the patch
itself and reports through the same :meth:`RekordboxExportService.report`. There
is no second accounting to keep in step, and a test asserts the two report the
same numbers.

The two layers are resolved once, in Python
-------------------------------------------
DEC-079's rule lives in ``effective_value`` and ``effective_rating``, reached
through :class:`ExportTrackValues`. The key is then rendered by ``key_text``,
the file-tag path's own converter, into the notation the caller chose (DEC-089) —
which is why the notation is validated here, against ``KEY_FORMATS``, rather
than restated as a vocabulary of this module's own.

What refuses, and what is merely reported
-----------------------------------------
A library that was never imported, and a source file that is gone or cannot be
read, refuse: there is nothing to patch, and DEC-082 says so with the path
named. A source that has *changed* since the import does not refuse. It is
reported with the signal that changed and both values, because refusing on an
mtime is a hard block on a routine action, and the counts that follow — tracks
the file holds that CuePoint does not know, tracks CuePoint knows the file lacks,
references dropped from each playlist — are what make the consequence legible
before anything is written.

Where the export may write
--------------------------
DEC-083 refuses the source as a destination, and :meth:`validate` enforces that
before anything is parsed, through the same comparison the writer makes: resolved
and case-folded, so a relative path, a trailing separator, a case difference on
Windows or a symlink cannot defeat it. Three more refusals stand beside it, each
closing a way a path could reach something it should not. The destination must
end in ``.xml``, because the one file this phase writes is an XML document and a
path ending ``.mp3`` would otherwise replace somebody's audio file — DEC-085 made
a rule the destination is held to as well. It must not be a folder. And its
folder must already exist: a save dialog cannot produce one that does not, so a
path that names one came from somewhere else, and creating directories on a
user's disk that nobody chose is not an export's business.

How an export ends, and what is recorded
----------------------------------------
Every export that gets past :meth:`validate` ends in exactly one row: ``written``
with its playlists and an activity event, ``cancelled`` or ``failed`` with
neither. A refusal records nothing, because nothing was attempted. The counts
on a row are what was *written* (DEC-086 records what CuePoint wrote), so a
cancelled or failed export records zero changed tracks and no fields, and its
outcome is what qualifies the zeros. The source's staleness and the library's
missing-file count are facts about the moment rather than about the file, and a
row records them whatever the outcome.
"""

from __future__ import annotations

import json
import logging
import os
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Set, Tuple

from cuepoint.data.rekordbox_export import (
    EXPORT_FIELDS,
    PHASE_TRACKS,
    ExportCancelled,
    ExportFolder,
    ExportNode,
    ExportPlaylist,
    PatchResult,
    PlaylistResult,
    TrackExportValues,
    patch_collection_xml,
    plan_collection_xml,
    refuse_source_as_destination,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.models.collection import Collection
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.rekordbox_export import (
    EXPORT_CANCELLED,
    EXPORT_FAILED,
    EXPORT_WRITTEN,
    RekordboxExport,
    RekordboxExportPlaylist,
)
from cuepoint.models.rekordbox_export_values import ExportTrackValues
from cuepoint.models.library_source import LibrarySource, describe_file
from cuepoint.models.row_values import one_of
from cuepoint.services.interfaces import (
    IActivityService,
    ICollectionRepository,
    ICollectionService,
    IDatabaseService,
    IFileStatusRepository,
    ILibrarySourceRepository,
    IRekordboxExportRepository,
    IRekordboxExportService,
    ITrackRepository,
)
from cuepoint.services.tag_write_options import KEY_FORMAT_NORMAL, KEY_FORMATS
from cuepoint.services.tag_write_service import key_text

#: The notation an export uses unless the caller names another (DEC-089).
DEFAULT_KEY_FORMAT = KEY_FORMAT_NORMAL

#: Why a source cannot be exported from. Reasons rather than sentences, so
#: EXPORT-06 can render each one its own way and a caller can branch on them.
SOURCE_NEVER_IMPORTED = "source_never_imported"
SOURCE_MISSING = "source_missing"
SOURCE_UNREADABLE = "source_unreadable"
#: The file is there and readable, and is not a collection the export can patch:
#: too large to parse, not well-formed, or in an encoding it cannot write back.
#: Found only by reading it, so only the preview can say it before a job does.
SOURCE_INVALID = "source_invalid"
SOURCE_REFUSALS = (
    SOURCE_NEVER_IMPORTED,
    SOURCE_MISSING,
    SOURCE_UNREADABLE,
    SOURCE_INVALID,
)

#: The two signals DEC-082 compares, named so a preview can say which changed.
SIGNAL_MODIFIED = "mtime"
SIGNAL_SIZE = "size"

#: Why a destination cannot be written to (DEC-083, DEC-085).
DESTINATION_BLANK = "destination_blank"
DESTINATION_IS_SOURCE = "destination_is_source"
DESTINATION_NOT_XML = "destination_not_xml"
DESTINATION_IS_FOLDER = "destination_is_folder"
DESTINATION_FOLDER_MISSING = "destination_folder_missing"
DESTINATION_REFUSALS = (
    DESTINATION_BLANK,
    DESTINATION_IS_SOURCE,
    DESTINATION_NOT_XML,
    DESTINATION_IS_FOLDER,
    DESTINATION_FOLDER_MISSING,
)

#: The one kind of file an export writes.
EXPORT_SUFFIX = ".xml"

#: The activity event a written export records (DEC-029, DEC-084). One per
#: export, carrying the destination and the counts; none for a cancel or a
#: failure, which the export row and the job record already say.
EVENT_REKORDBOX_EXPORTED = "rekordbox.exported"

_logger = logging.getLogger(__name__)

#: Ids per query while a Smart Collection's membership is read. ``browse_ids``
#: caps one request, so this is not an optimization: it is what keeps a Smart
#: Collection over a library larger than one page exporting all of its tracks
#: rather than the first page of them.
SMART_PAGE_SIZE = 10_000


class ExportSourceError(ValidationError):
    """The source XML cannot be exported from, with the reason and the path.

    A :class:`ValidationError`, so the engine's existing handling of a request
    that cannot be honoured applies unchanged; the ``reason`` is what EXPORT-06
    puts in the error envelope and EXPORT-07 branches on, because "find the
    file again" and "import a library first" are different things to offer.
    """

    def __init__(self, reason: str, message: str, path: Optional[str] = None) -> None:
        """Record which refusal this is, and which file it is about."""
        super().__init__(message, error_code=reason, context={"path": path})
        self.reason = reason
        self.path = path


class ExportDestinationError(ValidationError):
    """The destination cannot be written to, with the reason and the path.

    Raised before anything is parsed, so a refused export costs nothing and
    records nothing. A :class:`ValidationError` for the same reason
    :class:`ExportSourceError` is one.
    """

    def __init__(self, reason: str, message: str, path: Optional[str] = None) -> None:
        """Record which refusal this is, and which path it is about."""
        super().__init__(message, error_code=reason, context={"path": path})
        self.reason = reason
        self.path = path


@dataclass(frozen=True)
class SourceState:
    """The source file as the import recorded it, beside how it is now (DEC-082).

    Attributes:
        path: The file the library was imported from, as it was recorded.
        stale: True when the file differs from the import, False when it is
            demonstrably the same one, and ``None`` when that cannot be known —
            the import's own ``stat`` failed, so there is nothing to compare
            against. ``None`` is not "unchanged": it is "nobody can say".
        signals: Which of :data:`SIGNAL_MODIFIED` and :data:`SIGNAL_SIZE`
            differ, in that order. Empty when nothing differs or nothing can be
            compared.
        recorded_modified_at: The modified time the import stored, or ``None``.
        actual_modified_at: The file's modified time now.
        recorded_size_bytes: The size the import stored, or ``None``.
        actual_size_bytes: The file's size now.
    """

    path: str
    stale: Optional[bool] = None
    signals: Tuple[str, ...] = ()
    recorded_modified_at: Optional[str] = None
    actual_modified_at: Optional[str] = None
    recorded_size_bytes: Optional[int] = None
    actual_size_bytes: Optional[int] = None

    @property
    def comparable(self) -> bool:
        """True when the import recorded enough to compare the file against."""
        return self.stale is not None

    def to_dict(self) -> Dict[str, Any]:
        """The state under the names the preview payload carries it."""
        return {
            "path": self.path,
            "stale": self.stale,
            "signals": list(self.signals),
            "recorded_modified_at": self.recorded_modified_at,
            "actual_modified_at": self.actual_modified_at,
            "recorded_size_bytes": self.recorded_size_bytes,
            "actual_size_bytes": self.actual_size_bytes,
        }


@dataclass(frozen=True)
class PlaylistPreview:
    """One playlist an export would append, with the numbers it would report.

    Attributes:
        collection_id: The Collection or Smart Collection this came from.
        kind: ``collection`` or ``smart``. A folder is structure in the written
            tree and never one of these.
        name: What it is called, as it would be written.
        path: Where it would land, the parent folder included:
            ``CuePoint/Gigs/Saturday``.
        entry_count: Entries that would be written.
        dropped_count: References the source file does not hold, counted once
            per appearance so the arithmetic below holds (DEC-082).
    """

    collection_id: int
    kind: str
    name: str
    path: str
    entry_count: int
    dropped_count: int = 0

    @property
    def requested_count(self) -> int:
        """What the Collection holds on screen: what is written plus what is not."""
        return self.entry_count + self.dropped_count

    def to_dict(self) -> Dict[str, Any]:
        """The playlist under the names the preview payload carries it."""
        return {
            "collection_id": self.collection_id,
            "kind": self.kind,
            "name": self.name,
            "path": self.path,
            "entry_count": self.entry_count,
            "dropped_count": self.dropped_count,
            "requested_count": self.requested_count,
        }


@dataclass(frozen=True)
class ExportPreview:
    """Everything an export would do, before it is asked to do it (DEC-084).

    Attributes:
        source: The file that would be patched, and whether it is stale.
        key_format: The notation ``Tonality`` would be written in (DEC-089).
        track_count: ``COLLECTION`` tracks the exported file would hold, which
            is the source's own count — the export patches the file rather than
            producing a document from the database, so this is what lands.
        changed_track_count: How many of those would have an attribute rewritten.
        fields_changed: Field name to how many tracks would change for it.
        unknown_track_count: Tracks the file holds that CuePoint does not know.
            The visible sign that a refresh is owed (DEC-082).
        absent_track_count: Tracks CuePoint knows that the file lacks. These are
            what get dropped from appended playlists.
        missing_file_count: Tracks whose audio file the last check did not find,
            or ``None`` when no track has ever been checked (DEC-088). ``None``
            is not zero.
        playlists: One entry per playlist that would be written, in tree order.
        playlist_folder: The parent folder's name as it would be written —
            ``CuePoint``, or ``CuePoint (2)`` when the tree already holds one.
            ``None`` when no playlist was chosen and no folder would be made.
        playlist_folder_renamed: True when that name had to change, which is the
            collision DEC-078 reports rather than merging into.
    """

    source: SourceState
    key_format: str
    track_count: int
    changed_track_count: int
    fields_changed: Mapping[str, int]
    unknown_track_count: int
    absent_track_count: int
    missing_file_count: Optional[int]
    playlists: Tuple[PlaylistPreview, ...] = ()
    playlist_folder: Optional[str] = None
    playlist_folder_renamed: bool = False

    @property
    def changed_fields(self) -> Tuple[str, ...]:
        """The fields at least one track would change, in the export's order."""
        return tuple(
            name for name, _attribute in EXPORT_FIELDS if self.fields_changed.get(name)
        )

    @property
    def dropped_reference_count(self) -> int:
        """Entries dropped across every playlist, once per appearance."""
        return sum(playlist.dropped_count for playlist in self.playlists)

    @property
    def file_check_known(self) -> bool:
        """True when a file check has run, so the missing count is a count."""
        return self.missing_file_count is not None

    @property
    def changes_nothing(self) -> bool:
        """True when the export would be a copy of the source, nothing appended.

        Worth answering here rather than in the renderer: a library where nobody
        has overridden anything and no Collection was chosen produces a file
        identical to its source, and describing that honestly is the difference
        between a useful preview and a reassuring one.
        """
        return self.changed_track_count == 0 and not self.playlists

    def to_dict(self) -> Dict[str, Any]:
        """The preview under the names the engine payload carries it."""
        return {
            "source": self.source.to_dict(),
            "key_format": self.key_format,
            "track_count": self.track_count,
            "changed_track_count": self.changed_track_count,
            "fields_changed": dict(self.fields_changed),
            "changed_fields": list(self.changed_fields),
            "unknown_track_count": self.unknown_track_count,
            "absent_track_count": self.absent_track_count,
            "missing_file_count": self.missing_file_count,
            "file_check_known": self.file_check_known,
            "dropped_reference_count": self.dropped_reference_count,
            "changes_nothing": self.changes_nothing,
            "playlists": [playlist.to_dict() for playlist in self.playlists],
            "playlist_folder": self.playlist_folder,
            "playlist_folder_renamed": self.playlist_folder_renamed,
        }


@dataclass(frozen=True)
class ExportPlan:
    """What a write needs, computed once and used twice (DEC-084).

    The preview reads this and stops; EXPORT-05's job reads the same thing and
    goes on to write. Holding it as a value rather than as steps inside one
    method is what lets both do that.

    Attributes:
        source_path: The file to patch.
        source: Its recorded state beside its current one.
        key_format: The notation ``Tonality`` is written in.
        updates: Rekordbox track id to the values that track would carry.
        playlists: The nodes to append, resolved to track ids in export order.
        collections: Each exported playlist's ``ref`` to the node it came from,
            so a result can be reported and recorded against the right
            Collection. Two Collections in different folders may share a name,
            so matching on the name would be guessing.
        missing_file_count: What the last file check found, or ``None``.
    """

    source_path: str
    source: SourceState
    key_format: str
    updates: Mapping[str, TrackExportValues]
    playlists: Tuple[ExportNode, ...] = ()
    collections: Mapping[str, Collection] = field(default_factory=dict)
    missing_file_count: Optional[int] = None


@dataclass(frozen=True)
class ExportRequest:
    """An export that :meth:`RekordboxExportService.validate` accepted.

    Attributes:
        collection_ids: The chosen nodes, each once, in the order first named.
        key_format: One of ``KEY_FORMATS``.
        destination_path: Absolute, as the file will be written and recorded.
        source_path: The file it patches.
    """

    collection_ids: Tuple[int, ...]
    key_format: str
    destination_path: str
    source_path: str


@dataclass(frozen=True)
class ExportResult:
    """How one export ended, with the row that records it.

    Attributes:
        record: The export row, with its id.
        playlists: The playlist rows, for a written export; empty otherwise.
        report: The numbers the export produced, for a written export — the
            same type and the same translation the preview uses, which is what
            lets a test hold the two side by side — and it carries the count per
            field, which the row keeps only the names of. ``None`` otherwise.
    """

    record: RekordboxExport
    playlists: Tuple[RekordboxExportPlaylist, ...] = ()
    report: Optional[ExportPreview] = None

    @property
    def outcome(self) -> str:
        """``written``, ``cancelled`` or ``failed``."""
        return self.record.outcome

    @property
    def written(self) -> bool:
        """True when the file is at the destination."""
        return self.record.outcome == EXPORT_WRITTEN

    @property
    def cancelled(self) -> bool:
        """True when a person stopped it before anything was written."""
        return self.record.outcome == EXPORT_CANCELLED

    @property
    def failed(self) -> bool:
        """True when it could not finish, for the reason on the record."""
        return self.record.outcome == EXPORT_FAILED

    def summary_line(self) -> str:
        """One sentence for a log, a job's message and the activity feed."""
        record = self.record
        name = Path(record.destination_path).name
        if self.cancelled:
            return f"Rekordbox export to {name} cancelled; nothing was written"
        if self.failed:
            return f"Rekordbox export to {name} failed: {record.error}"
        playlists = len(self.playlists)
        return (
            f"Exported {_count(record.track_count, 'track')} to Rekordbox as {name}: "
            f"{_count(record.changed_track_count, 'track')} changed, "
            f"{_count(playlists, 'playlist')} added"
        )

    def to_dict(self) -> Dict[str, Any]:
        """What a finished export job answers with."""
        record = self.record
        return {
            "export_id": record.id,
            "outcome": record.outcome,
            "destination_path": record.destination_path,
            "source_path": record.source_path,
            "source_stale": record.source_stale,
            "key_format": record.key_format,
            "track_count": record.track_count,
            "changed_track_count": record.changed_track_count,
            "fields": list(record.fields),
            "missing_file_count": record.missing_file_count,
            "dropped_reference_count": record.dropped_reference_count,
            "playlist_count": len(self.playlists),
            "error": record.error,
            "summary": self.summary_line(),
            "report": None if self.report is None else self.report.to_dict(),
        }


@dataclass(frozen=True)
class RememberedExport:
    """What the next export starts from: the last one that wrote (DEC-083, DEC-089).

    Read from the export record rather than kept as a setting of its own, so it
    cannot disagree with where the last export actually went. A cancelled or
    failed export is not remembered: nothing was written where it pointed.

    Attributes:
        folder: The folder the last written export went to, or ``None`` when
            nothing has been exported. Only the folder: DEC-083 never remembers
            the file name, so no export silently overwrites the previous one.
        folder_exists: True when that folder is still there. A drive that has
            been unplugged is not somewhere to open a save dialog.
        key_format: The notation it used, or the default when there is none.
        export_id: The export these came from, or ``None``.
    """

    folder: Optional[str] = None
    folder_exists: bool = False
    key_format: str = DEFAULT_KEY_FORMAT
    export_id: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """The choices under the names the history payload carries them."""
        return {
            "folder": self.folder,
            "folder_exists": self.folder_exists,
            "key_format": self.key_format,
            "export_id": self.export_id,
        }


class RekordboxExportService(IRekordboxExportService):
    """Answers what an export would write, and writes it when asked."""

    def __init__(
        self,
        track_repository: ITrackRepository,
        collection_repository: ICollectionRepository,
        collection_service: ICollectionService,
        library_source_repository: ILibrarySourceRepository,
        file_status_repository: IFileStatusRepository,
        export_repository: IRekordboxExportRepository,
        activity_service: IActivityService,
        database_service: IDatabaseService,
    ) -> None:
        """Wire the five reads a preview is made of, and the three an export adds.

        Args:
            track_repository: The library's two value layers, and the ids a
                Smart Collection's rules match.
            collection_repository: CuePoint's tree and each Collection's own
                order (DEC-058).
            collection_service: A Smart Collection's rules, resolved live
                (DEC-061) — the same resolution the Library table browses with,
                so an exported playlist and the screen cannot disagree.
            library_source_repository: Which file the library came from, and
                what it looked like then (DEC-035).
            file_status_repository: What the last file check found (DEC-088).
            export_repository: Where each export's row goes (DEC-086).
            activity_service: Where a written export's event goes (DEC-029).
            database_service: The transaction a row, its playlists and its
                event commit in together. No SQL is run here.
        """
        self._tracks = track_repository
        self._collections = collection_repository
        self._collection_service = collection_service
        self._sources = library_source_repository
        self._files = file_status_repository
        self._exports = export_repository
        self._activity = activity_service
        self._db = database_service

    # -------------------------------------------------------------- the plan

    def plan(
        self,
        collection_ids: Sequence[int] = (),
        key_format: str = DEFAULT_KEY_FORMAT,
    ) -> ExportPlan:
        """Work out everything an export of these Collections would write.

        Args:
            collection_ids: The nodes the user chose. A folder stands for every
                Collection and Smart Collection beneath it; a node named twice
                is exported once. An empty sequence is a legitimate request: it
                exports CuePoint's values with no playlists appended.
            key_format: One of ``KEY_FORMATS`` (DEC-089).

        Returns:
            The plan, which writes nothing on its own.

        Raises:
            ExportSourceError: The library was never imported, or its source
                file is gone or cannot be read.
            ValueError: The notation is not one of ``KEY_FORMATS``, or an id
                names no node in the tree. A missing node is refused rather
                than skipped: an export quietly short one playlist is worse
                than one that says which node it cannot find.
            BrokenRuleError: A chosen Smart Collection's saved rules cannot be
                run — a tag it names was deleted, say. Refused where it is run,
                as everywhere else.
        """
        notation = one_of(key_format, KEY_FORMATS, "key_format")
        source = self._require_source()
        state = self._source_state(source)

        updates: Dict[str, TrackExportValues] = {}
        rekordbox_ids: Dict[int, str] = {}
        for values in self._tracks.iter_export_values():
            rekordbox_ids[values.track_id] = values.rekordbox_track_id
            updates[values.rekordbox_track_id] = _export_values(values, notation)

        playlists, collections = self._export_tree(collection_ids, rekordbox_ids)
        return ExportPlan(
            source_path=source.xml_path,
            source=state,
            key_format=notation,
            updates=updates,
            playlists=playlists,
            collections=collections,
            missing_file_count=self._files.missing_count(),
        )

    # ----------------------------------------------------------- the preview

    def preview(
        self,
        collection_ids: Sequence[int] = (),
        key_format: str = DEFAULT_KEY_FORMAT,
    ) -> ExportPreview:
        """Return what an export of these Collections would write (DEC-084).

        The plan handed to the patch with the write left out, so every number
        here is the number the export itself would report.

        Raises:
            ExportSourceError: As :meth:`plan`, and also when the source cannot
                be read at the moment the preview reads it.
            ValidationError: The source is too large to parse, or is not
                well-formed XML. Both name the file, and neither is something
                the export can work around.
            ValueError: As :meth:`plan`.
            BrokenRuleError: As :meth:`plan`.
        """
        plan = self.plan(collection_ids, key_format)
        return self.preview_of(plan)

    def preview_of(self, plan: ExportPlan) -> ExportPreview:
        """Return the preview for a plan already computed.

        Separate from :meth:`preview` so EXPORT-05 can report what its own plan
        came to without building a second one, and so a test can hand the same
        plan to this and to the real patch.
        """
        try:
            result = plan_collection_xml(plan.source_path, plan.updates, plan.playlists)
        except FileNotFoundError as exc:
            raise ExportSourceError(
                SOURCE_MISSING,
                f"The collection file is no longer there: {plan.source_path}",
                plan.source_path,
            ) from exc
        except OSError as exc:
            raise ExportSourceError(
                SOURCE_UNREADABLE,
                f"The collection file could not be read: {plan.source_path}",
                plan.source_path,
            ) from exc
        except ExportSourceError:
            raise
        except ValidationError as exc:
            # Every refusal the patch makes while reading is about the file:
            # its size, its encoding, its well-formedness. (Its one other, the
            # tree-depth guard, is unreachable from here: a Collection tree is
            # half as deep as that guard allows.) Given a reason so the preview
            # can say which of the source's problems this is.
            raise ExportSourceError(
                SOURCE_INVALID, exc.message, plan.source_path
            ) from exc
        return self.report(plan, result)

    def remembered(self) -> RememberedExport:
        """Return the folder and notation the next export should start from.

        The last export that wrote, as DEC-086's record holds it — the one
        store, rather than a copy in settings that could drift from it.
        """
        latest = self._exports.latest_written()
        if latest is None:
            return RememberedExport()
        folder = os.path.dirname(latest.destination_path) or None
        return RememberedExport(
            folder=folder,
            folder_exists=folder is not None and os.path.isdir(folder),
            key_format=latest.key_format,
            export_id=latest.id,
        )

    def report(self, plan: ExportPlan, result: PatchResult) -> ExportPreview:
        """Turn a plan and a patch's own result into the numbers to show.

        One translation, used by the preview and — in EXPORT-05 — by the export
        that ran. Which is the point: "the preview cannot disagree with the
        result" is not a property of two implementations that agree, it is a
        property of there being one.
        """
        return ExportPreview(
            source=plan.source,
            key_format=plan.key_format,
            track_count=result.tracks_seen,
            changed_track_count=result.tracks_changed,
            fields_changed=dict(result.fields_changed),
            unknown_track_count=result.tracks_unknown,
            absent_track_count=len(result.not_found),
            missing_file_count=plan.missing_file_count,
            playlists=tuple(
                _playlist_preview(written, plan.collections)
                for written in result.playlists
            ),
            playlist_folder=result.playlist_folder,
            playlist_folder_renamed=result.playlist_folder_renamed,
        )

    # ------------------------------------------------------------ the export

    def validate(
        self,
        collection_ids: Sequence[int],
        key_format: str,
        destination_path: str,
    ) -> ExportRequest:
        """Refuse an export that cannot run, before anything is parsed.

        Everything that can be known cheaply is checked here, so a job is only
        ever started for an export that can reasonably be expected to finish:
        the notation, the source, the destination, that every chosen node
        exists, and that every chosen Smart Collection's rules can run. What is
        left to fail inside the job is what cannot be known without doing the
        work — a malformed source, a full disk.

        Raises:
            ValueError: The notation is not one of ``KEY_FORMATS``, or an id
                names no node.
            ExportSourceError: As :meth:`plan`.
            ExportDestinationError: The destination is blank, is the source,
                does not end in ``.xml``, is a folder, or is in a folder that
                does not exist.
            BrokenRuleError: A chosen Smart Collection's rules cannot be run.
        """
        notation = one_of(key_format, KEY_FORMATS, "key_format")
        source = self._require_source()
        destination = self._check_destination(destination_path, source.xml_path)

        chosen: List[int] = []
        for raw in collection_ids:
            identifier = int(raw)
            if identifier not in chosen:
                chosen.append(identifier)
        by_id = {int(node.id): node for node in self._collections.tree() if node.id}
        for identifier in chosen:
            if identifier not in by_id:
                raise ValueError(f"No such collection to export: {identifier}")
        children: Dict[Optional[int], List[Collection]] = defaultdict(list)
        for node in by_id.values():
            children[node.parent_id].append(node)
        for identifier in chosen:
            for node in _playlists_under(by_id[identifier], children):
                if node.is_smart:
                    self._collection_service.resolve(int(node.id or 0)).require_query()

        return ExportRequest(
            collection_ids=tuple(chosen),
            key_format=notation,
            destination_path=destination,
            source_path=source.xml_path,
        )

    def export(
        self,
        collection_ids: Sequence[int],
        key_format: str,
        destination_path: str,
        *,
        job_id: Optional[str] = None,
        on_progress: Optional[Callable[[str, int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> ExportResult:
        """Write the export, and record how it ended whatever that was.

        Validated first, again: a job starts moments after the request that
        validated it, and the source can go in between. A refusal still raises
        and records nothing. Past that, every ending is a row — ``written`` with
        its playlists and one activity event, all in one transaction after the
        file is in place; ``cancelled`` or ``failed`` with neither, and nothing
        at the destination, because the write is a temp file and a ``replace``.

        Args:
            collection_ids: As :meth:`plan` takes them.
            key_format: As :meth:`plan` takes it.
            destination_path: Where to write; see :meth:`validate`.
            job_id: The job running this, recorded on the row so the two can be
                read together.
            on_progress: As ``patch_collection_xml`` takes it: a phase, how far
                through it, and its total.
            should_cancel: Asked between tracks, between playlists, and before
                the written file replaces anything.

        Raises:
            ValueError, ExportSourceError, ExportDestinationError,
            BrokenRuleError: As :meth:`validate`.
        """
        request = self.validate(collection_ids, key_format, destination_path)
        started_at = utc_now_iso()
        source = self._require_source()
        state = self._source_state(source)
        missing = self._files.missing_count()
        try:
            plan = self.plan(request.collection_ids, request.key_format)
            state, missing = plan.source, plan.missing_file_count
            if should_cancel is not None and should_cancel():
                raise ExportCancelled(PHASE_TRACKS)
            result = patch_collection_xml(
                plan.source_path,
                plan.updates,
                request.destination_path,
                plan.playlists,
                on_progress=on_progress,
                should_cancel=should_cancel,
            )
        except ExportCancelled:
            ended = self._record_ending(
                request, job_id, started_at, state, missing, EXPORT_CANCELLED, None
            )
        except Exception as exc:  # noqa: BLE001 — recorded, then reported
            _logger.warning(
                "[rekordbox export] failed writing %s: %s",
                request.destination_path,
                exc,
                exc_info=True,
            )
            ended = self._record_ending(
                request,
                job_id,
                started_at,
                state,
                missing,
                EXPORT_FAILED,
                _describe_failure(exc),
            )
        else:
            ended = self._record_written(request, job_id, started_at, plan, result)
        _logger.info("[rekordbox export] %s (job %s)", ended.summary_line(), job_id)
        return ended

    def _record_written(
        self,
        request: ExportRequest,
        job_id: Optional[str],
        started_at: str,
        plan: ExportPlan,
        result: PatchResult,
    ) -> ExportResult:
        """Record a written export, its playlists and its event, as one unit.

        Called after the ``replace``, so the row never claims a file that is not
        there. The reverse can happen — the file is written and the database
        then refuses the row — and is logged and raised rather than hidden: the
        file is the user's and stays; what is lost is only CuePoint's note of it.
        """
        report = self.report(plan, result)
        record = RekordboxExport(
            job_id=job_id,
            started_at=started_at,
            finished_at=utc_now_iso(),
            outcome=EXPORT_WRITTEN,
            destination_path=request.destination_path,
            source_path=plan.source_path,
            source_stale=bool(plan.source.stale),
            track_count=report.track_count,
            changed_track_count=report.changed_track_count,
            fields_json=json.dumps(list(report.changed_fields)),
            key_format=report.key_format,
            missing_file_count=report.missing_file_count,
            dropped_reference_count=report.dropped_reference_count,
        )
        with self._db.transaction(join_existing=True):
            stored = self._exports.add(record)
            playlists = self._exports.add_playlists(
                [
                    _playlist_row(int(stored.id or 0), written, plan.collections)
                    for written in report.playlists
                ]
            )
            ended = ExportResult(
                record=stored, playlists=tuple(playlists), report=report
            )
            self._activity.record_event(
                EVENT_REKORDBOX_EXPORTED,
                ended.summary_line(),
                {
                    "export_id": stored.id,
                    "job_id": job_id,
                    "destination_path": stored.destination_path,
                    "source_path": stored.source_path,
                    "source_stale": stored.source_stale,
                    "key_format": stored.key_format,
                    "track_count": stored.track_count,
                    "changed_track_count": stored.changed_track_count,
                    "fields": list(stored.fields),
                    "playlist_count": len(playlists),
                    "dropped_reference_count": stored.dropped_reference_count,
                    "missing_file_count": stored.missing_file_count,
                },
            )
        return ended

    def _record_ending(
        self,
        request: ExportRequest,
        job_id: Optional[str],
        started_at: str,
        state: SourceState,
        missing: Optional[int],
        outcome: str,
        error: Optional[str],
    ) -> ExportResult:
        """Record an export that wrote nothing: cancelled, or failed and why.

        The counts are zero because nothing was written, not because nothing
        was in scope — the outcome is what qualifies them. No playlist rows and
        no activity event: neither would describe anything that happened.
        """
        record = RekordboxExport(
            job_id=job_id,
            started_at=started_at,
            finished_at=utc_now_iso(),
            outcome=outcome,
            destination_path=request.destination_path,
            source_path=request.source_path,
            source_stale=bool(state.stale),
            track_count=0,
            changed_track_count=0,
            fields_json="[]",
            key_format=request.key_format,
            missing_file_count=missing,
            error=error,
        )
        with self._db.transaction(join_existing=True):
            stored = self._exports.add(record)
        return ExportResult(record=stored)

    @staticmethod
    def _check_destination(destination_path: str, source_path: str) -> str:
        """Return the destination as it will be written, or refuse it (DEC-083).

        Absolute, so the row records where the file actually went rather than
        a path that meant something only relative to the engine's working
        directory. The source comparison is the writer's own, so the check here
        and the check at the moment of writing cannot disagree.
        """
        text = str(destination_path or "").strip()
        if not text:
            raise ExportDestinationError(
                DESTINATION_BLANK, "Choose where to save the export."
            )
        destination = os.path.abspath(text)
        try:
            refuse_source_as_destination(source_path, destination)
        except ValidationError as exc:
            raise ExportDestinationError(
                DESTINATION_IS_SOURCE, exc.message, destination
            ) from exc
        if Path(destination).suffix.lower() != EXPORT_SUFFIX:
            raise ExportDestinationError(
                DESTINATION_NOT_XML,
                f"An export is saved as an {EXPORT_SUFFIX} file: {destination}",
                destination,
            )
        if os.path.isdir(destination):
            raise ExportDestinationError(
                DESTINATION_IS_FOLDER,
                f"That is a folder, not a file to save to: {destination}",
                destination,
            )
        if not os.path.isdir(os.path.dirname(destination)):
            raise ExportDestinationError(
                DESTINATION_FOLDER_MISSING,
                f"The folder to save into does not exist: {destination}",
                destination,
            )
        return destination

    # ------------------------------------------------------------- the source

    def _require_source(self) -> LibrarySource:
        """Return the recorded source, or refuse with the reason (DEC-082).

        Three refusals rather than one, because they are three different things
        for a user to do: import a library, find the file again, or work out why
        the file will not open.
        """
        source = self._sources.get()
        if source is None or not source.xml_path:
            raise ExportSourceError(
                SOURCE_NEVER_IMPORTED,
                "There is no collection file to export from: this library has "
                "not been imported from a Rekordbox XML yet.",
            )
        path = source.xml_path
        if not os.path.isfile(path):
            raise ExportSourceError(
                SOURCE_MISSING,
                f"The collection this library was imported from is not there: "
                f"{path}. Import or refresh from the file's new location.",
                path,
            )
        try:
            with open(path, "rb") as handle:
                handle.read(1)
        except OSError as exc:
            raise ExportSourceError(
                SOURCE_UNREADABLE,
                f"The collection file cannot be read: {path} ({exc.strerror or exc}).",
                path,
            ) from exc
        return source

    @staticmethod
    def _source_state(source: LibrarySource) -> SourceState:
        """Compare the file with what the import recorded (DEC-082).

        ``stat`` only: nothing is hashed, because the source may be hundreds of
        megabytes and DEC-082 chose the cheap comparison deliberately.
        """
        path = source.xml_path
        described = describe_file(path)
        modified, size = described if described is not None else (None, None)
        if not source.is_stat_known:
            # The import's own stat failed, so there is nothing to compare
            # against. "Cannot tell" rather than "unchanged", which is the same
            # conservative answer ``SourceFileState.changed`` gives.
            return SourceState(
                path=path,
                stale=None,
                actual_modified_at=modified,
                actual_size_bytes=size,
            )
        signals: List[str] = []
        if modified != source.xml_modified_at:
            signals.append(SIGNAL_MODIFIED)
        if size != source.xml_size_bytes:
            signals.append(SIGNAL_SIZE)
        return SourceState(
            path=path,
            stale=bool(signals),
            signals=tuple(signals),
            recorded_modified_at=source.xml_modified_at,
            actual_modified_at=modified,
            recorded_size_bytes=source.xml_size_bytes,
            actual_size_bytes=size,
        )

    # --------------------------------------------------------------- the tree

    def _export_tree(
        self,
        collection_ids: Sequence[int],
        rekordbox_ids: Mapping[int, str],
    ) -> Tuple[Tuple[ExportNode, ...], Dict[str, Collection]]:
        """Turn the chosen nodes into the tree the writer appends (DEC-059).

        Every exported playlist keeps the path it is filed under, from the top
        level down, because that filing is how a user finds it again. A folder
        nobody chose is created only when something chosen is inside it, and a
        folder with nothing exported beneath it is not created at all: an empty
        folder in a DJ's tree is litter, which is the same reason an export with
        no playlists creates no ``CuePoint`` folder either.
        """
        nodes = self._collections.tree()
        by_id: Dict[int, Collection] = {
            int(node.id): node for node in nodes if node.id is not None
        }
        children: Dict[Optional[int], List[Collection]] = defaultdict(list)
        for node in nodes:
            children[node.parent_id].append(node)

        exported: Dict[int, Collection] = {}
        for raw in collection_ids:
            chosen = by_id.get(int(raw))
            if chosen is None:
                raise ValueError(f"No such collection to export: {int(raw)}")
            for node in _playlists_under(chosen, children):
                exported[int(node.id or 0)] = node

        # Every folder on the path to something exported, and nothing else.
        keep: Set[int] = set(exported)
        for node in exported.values():
            parent = node.parent_id
            while parent is not None and parent not in keep:
                keep.add(parent)
                parent = by_id[parent].parent_id if parent in by_id else None

        def build(parent_id: Optional[int]) -> List[ExportNode]:
            out: List[ExportNode] = []
            for node in children[parent_id]:
                identifier = int(node.id or 0)
                if identifier not in keep:
                    continue
                if node.is_folder:
                    # Always non-empty: a folder is in ``keep`` only because
                    # something exported sits beneath it, so there is no empty
                    # folder to guard against here. The filtering happened when
                    # ``keep`` was built.
                    out.append(
                        ExportFolder(name=node.name, children=tuple(build(identifier)))
                    )
                    continue
                out.append(
                    ExportPlaylist(
                        name=node.name,
                        track_ids=self._entries(node, rekordbox_ids),
                        ref=str(identifier),
                    )
                )
            return out

        return tuple(build(None)), {
            str(identifier): node for identifier, node in exported.items()
        }

    def _entries(
        self, node: Collection, rekordbox_ids: Mapping[int, str]
    ) -> Tuple[str, ...]:
        """The track ids one playlist would carry, in export order.

        A Collection's own order, repeats included (DEC-058); a Smart
        Collection's current membership in its saved sort (DEC-061, DEC-081).
        Library ids become the ``TrackID``s the file speaks, and a track the
        library no longer holds contributes nothing — it is not CuePoint's to
        export, and the file's own reference count is the writer's business.
        """
        identifier = int(node.id or 0)
        if node.is_smart:
            wanted = self._smart_membership(identifier)
        else:
            wanted = self._collections.track_ids(identifier)
        return tuple(
            rekordbox_ids[track_id] for track_id in wanted if track_id in rekordbox_ids
        )

    def _smart_membership(self, collection_id: int) -> List[int]:
        """Every track a Smart Collection's rules match now, in its saved order.

        Paged, because ``browse_ids`` caps one request: an unpaged read would
        export the first page of a large Smart Collection and call it the
        playlist.
        """
        query = self._collection_service.resolve(collection_id).require_query()
        found: List[int] = []
        while True:
            page = self._tracks.browse_ids(
                query, limit=SMART_PAGE_SIZE, offset=len(found)
            )
            found.extend(page)
            if len(page) < SMART_PAGE_SIZE:
                return found


# ------------------------------------------------------------------- helpers


def _count(number: int, noun: str) -> str:
    """``1 track``, ``2 tracks``, ``50,000 tracks``."""
    return f"{number:,} {noun}{'' if number == 1 else 's'}"


def _describe_failure(exc: BaseException) -> str:
    """The reason a failed export's row carries, in words a person can act on.

    A :class:`CuePointException`'s own message, which already names the file;
    otherwise the exception's text, or its type when it has none — a row that
    says only "failed" is the one the model refuses.
    """
    message = getattr(exc, "message", None) or str(exc)
    return str(message).strip() or type(exc).__name__


def _playlist_row(
    export_id: int, written: PlaylistPreview, collections: Mapping[str, Collection]
) -> RekordboxExportPlaylist:
    """One written playlist as its export row (DEC-086).

    A Smart Collection's row keeps the rules it was resolved from: DEC-081 makes
    them the only thing that can later explain its count, and the Smart
    Collection itself may be edited or deleted tomorrow.
    """
    node = collections.get(str(written.collection_id))
    return RekordboxExportPlaylist(
        export_id=export_id,
        collection_id=written.collection_id,
        kind=written.kind,
        name=written.name,
        path=written.path,
        entry_count=written.entry_count,
        dropped_count=written.dropped_count,
        rules_json=node.rules_json if node is not None and node.is_smart else None,
    )


def _export_values(values: ExportTrackValues, key_format: str) -> TrackExportValues:
    """The six values one track would carry, resolved and rendered.

    DEC-079's rule is applied by :class:`ExportTrackValues`, not here, and the
    key is rendered by ``key_text``, not here. This is the join between them:
    the notation the caller chose applied to the key that won.

    A key CuePoint cannot parse renders as nothing, so the file's own
    ``Tonality`` is left alone rather than replaced by a guess — writing
    ``"Open 1m"`` into a Camelot field would not be Camelot.
    """
    rendered, _reason = key_text(values.effective_key, key_format)
    return TrackExportValues(
        key=rendered,
        bpm=values.effective_bpm,
        genre=values.effective_genre,
        label=values.effective_label,
        year=values.effective_year,
        rating=values.effective_stars,
    )


def _playlist_preview(
    written: PlaylistResult, collections: Mapping[str, Collection]
) -> PlaylistPreview:
    """One written playlist reported against the node it came from.

    The writer echoes the caller's own ``ref`` back rather than a name or a
    path, because two Collections in different folders may share either.
    """
    node = collections.get(str(written.ref))
    return PlaylistPreview(
        collection_id=int(node.id or 0) if node is not None else 0,
        kind=node.kind if node is not None else "",
        name=written.name,
        path=written.path,
        entry_count=written.entry_count,
        dropped_count=written.dropped_count,
    )


def _playlists_under(
    node: Collection, children: Mapping[Optional[int], List[Collection]]
) -> List[Collection]:
    """The node itself if it exports as a playlist, or everything beneath it.

    A folder stands for its contents, at any depth. Order is the tree's own, so
    two users who chose the same folder get the same file.
    """
    if not node.is_folder:
        return [node]
    found: List[Collection] = []
    queue = list(children.get(int(node.id or 0), ()))
    while queue:
        child = queue.pop(0)
        if child.is_folder:
            queue.extend(children.get(int(child.id or 0), ()))
            continue
        found.append(child)
    return found


__all__ = (
    "DEFAULT_KEY_FORMAT",
    "DESTINATION_BLANK",
    "DESTINATION_FOLDER_MISSING",
    "DESTINATION_IS_FOLDER",
    "DESTINATION_IS_SOURCE",
    "DESTINATION_NOT_XML",
    "DESTINATION_REFUSALS",
    "EVENT_REKORDBOX_EXPORTED",
    "EXPORT_SUFFIX",
    "ExportDestinationError",
    "ExportPlan",
    "ExportPreview",
    "ExportRequest",
    "ExportResult",
    "ExportSourceError",
    "PlaylistPreview",
    "RekordboxExportService",
    "RememberedExport",
    "SIGNAL_MODIFIED",
    "SIGNAL_SIZE",
    "SOURCE_MISSING",
    "SOURCE_NEVER_IMPORTED",
    "SOURCE_INVALID",
    "SOURCE_REFUSALS",
    "SOURCE_UNREADABLE",
    "SourceState",
)
