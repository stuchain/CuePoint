#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Library import: turning a Rekordbox export into the persistent library.

Separate from :class:`~cuepoint.services.library_service.LibraryService`, which
reads the library, because this is the other half of the Library phase and it
grows: LIBRARY-07 and LIBRARY-09 add computing and applying a refresh diff, and
LIBRARY-05 hands the whole thing to a background job. Putting all of that on the
read service would give the engine's search endpoint a dependency on the parser,
the playlist repository and the activity feed, and give the import job a
dependency on search. Each caller resolves the one it needs.

What writing an export does, in order:

1. Refuse a file that has no ``COLLECTION`` element. It would otherwise import
   as a successful import of nothing, which is worse than an error.
2. Upsert every track, applying DEC-002 identity and reporting re-links.
3. Delete the library rows the export no longer claimed — **refresh only**
   (DEC-003), and only once DEC-011's reference check has been consulted.
4. Replace the mirrored playlist tree (DEC-031).
5. Record where the library came from (DEC-035).

An import and a refresh are the same pass differing only in step 3, and they run
the same code (:meth:`LibraryImportService._write_export`) rather than two
versions of it that can drift about what a write means.

All of it happens **inside one transaction**. A refresh requires that, because
it deletes: half of one would be a library missing tracks its owner never agreed
to lose. The first import gets the same property for free. Repositories join the
open transaction instead of opening their own — see
``DatabaseService.transaction(join_existing=True)``, which participates without
committing, so the outer block still decides the outcome. Every track write is
an upsert, so re-running either converges rather than duplicating.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable, Iterable, Iterator, Optional, Tuple

from cuepoint.data.rekordbox import (
    collection_entry_count,
    iter_collection_tracks,
    iter_playlist_nodes,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.models.library_source import LibrarySource, source_for_import
from cuepoint.models.library_track import resolve_identity, utc_now_iso
from cuepoint.models.refresh_diff import (
    DEFAULT_DETAIL_LIMIT,
    PlaylistChange,
    PlaylistSummary,
    RefreshDiff,
    TrackChange,
    changed_fields,
    summarize,
)
from cuepoint.models.references import NO_REFERENCES, ReferenceSummary
from cuepoint.models.rekordbox_playlist import PlaylistTreeWriteResult
from cuepoint.persistence.track_repository import (
    BulkUpsertResult,
    RelinkedTrack,
)
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    ILibraryImportService,
    ILibraryService,
    ILibrarySourceRepository,
    IPlaylistRepository,
    ITrackRepository,
)

_logger = logging.getLogger(__name__)

#: Activity event recorded when an import finishes (DEC-029's pattern).
EVENT_LIBRARY_IMPORTED = "library.imported"

#: Recorded when a refresh finishes. Distinct from an import because a
#: refresh can delete, and DEC-029's feed is the only durable record a user
#: has that it did.
EVENT_LIBRARY_REFRESHED = "library.refreshed"

#: Phase names reported through ``on_progress``, for a status message.
PHASE_TRACKS = "tracks"
PHASE_PLAYLISTS = "playlists"


class ImportCancelled(Exception):
    """Raised inside an import when the caller asked it to stop.

    Raised from the track iterator on purpose: that runs inside the upsert's
    transaction, so the exception rolls it back and the library is left exactly
    as it was. Cancelling is therefore all-or-nothing for the part of the import
    that takes the time.
    """


#: Called with ``(completed, total, phase)`` as an import proceeds. ``total`` is
#: Rekordbox's declared entry count, which is a claim rather than a fact, so it
#: is clamped upward if more tracks turn up than were declared.
ProgressCallback = Callable[[int, int, str], None]

#: Called between tracks; returning True stops the import.
CancelCheck = Callable[[], bool]


@dataclass(frozen=True)
class ImportSummary:
    """What one import did.

    Attributes:
        source: The DEC-035 record written at the end of the import.
        tracks_inserted: Tracks the library had not seen before.
        tracks_updated: Tracks matched to an existing row and refreshed.
        relinked: Tracks matched by path because Rekordbox renumbered them.
            Listed, not counted, because DEC-002 requires re-links to be
            reported rather than applied silently.
        playlists: What the mirrored playlist tree write produced.
        duration_seconds: Wall-clock time for the whole import.
    """

    source: LibrarySource
    tracks_inserted: int
    tracks_updated: int
    relinked: Tuple[RelinkedTrack, ...]
    playlists: PlaylistTreeWriteResult
    duration_seconds: float

    @property
    def track_count(self) -> int:
        """Tracks written, inserted and updated together."""
        return self.tracks_inserted + self.tracks_updated

    @property
    def relinked_count(self) -> int:
        """How many tracks kept their CuePoint data through a renumbering."""
        return len(self.relinked)

    def summary_line(self) -> str:
        """One line a user can read, for the activity feed."""
        parts = [f"{self.track_count} tracks"]
        if self.tracks_inserted:
            parts.append(f"{self.tracks_inserted} new")
        if self.tracks_updated:
            parts.append(f"{self.tracks_updated} updated")
        if self.relinked_count:
            parts.append(f"{self.relinked_count} re-linked")
        if self.playlists.playlists:
            parts.append(f"{self.playlists.playlists} playlists")
        return "Library imported — " + ", ".join(parts)


@dataclass(frozen=True)
class ExportWriteResult:
    """What one pass over an export wrote.

    Internal to this service: an import and a refresh each produce one, and each
    turns it into the summary its own callers know.
    """

    tracks: BulkUpsertResult
    playlists: PlaylistTreeWriteResult
    source: LibrarySource
    deleted: int = 0
    references: ReferenceSummary = NO_REFERENCES


@dataclass(frozen=True)
class RefreshSummary:
    """What one refresh did.

    :class:`ImportSummary` plus the one thing an import never has: a count of
    what was deleted. Reported on its own rather than folded into a total,
    because DEC-003 makes that the irreversible part.

    Attributes:
        source: The DEC-035 record written by the refresh.
        tracks_inserted: Tracks the export added.
        tracks_updated: Tracks matched to an existing row and refreshed.
        tracks_deleted: Tracks the export no longer contains, now gone along
            with their tags, ratings, history and playlist membership.
        relinked: Tracks matched by path because Rekordbox renumbered them.
            Listed rather than counted, as DEC-002 requires.
        playlists: What the mirrored playlist tree write produced.
        references: What DEC-011's seam said about the deleted tracks, asked at
            the moment they were deleted rather than when the diff was computed.
        duration_seconds: Wall-clock time for the whole refresh.
    """

    source: LibrarySource
    tracks_inserted: int
    tracks_updated: int
    tracks_deleted: int
    relinked: Tuple[RelinkedTrack, ...]
    playlists: PlaylistTreeWriteResult
    references: ReferenceSummary
    duration_seconds: float

    @property
    def track_count(self) -> int:
        """Tracks the library holds after the refresh."""
        return self.tracks_inserted + self.tracks_updated

    @property
    def relinked_count(self) -> int:
        """How many tracks kept their CuePoint data through a renumbering."""
        return len(self.relinked)

    def summary_line(self) -> str:
        """One line a user can read, for the activity feed."""
        parts = []
        if self.tracks_inserted:
            parts.append(f"{self.tracks_inserted} added")
        if self.tracks_updated:
            parts.append(f"{self.tracks_updated} updated")
        if self.tracks_deleted:
            parts.append(f"{self.tracks_deleted} removed")
        if self.relinked_count:
            parts.append(f"{self.relinked_count} re-linked")
        parts.append(f"{self.track_count} tracks now")
        return "Library refreshed — " + ", ".join(parts)


class LibraryImportService(ILibraryImportService):
    """Imports and refreshes a Rekordbox export into the persistent library."""

    def __init__(
        self,
        track_repository: ITrackRepository,
        playlist_repository: IPlaylistRepository,
        source_repository: ILibrarySourceRepository,
        database_service: IDatabaseService,
        activity_service: Optional[IActivityService] = None,
        library_service: Optional[ILibraryService] = None,
    ) -> None:
        """Initialize the service.

        Args:
            track_repository: Owns the ``tracks`` table.
            playlist_repository: Owns the mirrored playlist tree.
            source_repository: Owns the DEC-035 source record.
            database_service: Opens the one transaction a write runs inside.
                Required rather than optional: a service built without it would
                delete tracks in a transaction of their own and could then fail
                with them already gone, which is the exact outcome this step
                exists to make impossible. Nothing here runs SQL — the
                repositories do — but this is the only place that knows those
                writes belong together.
            activity_service: Records the completion event. Optional because the
                feed is a record of what happened, not a dependency of it — the
                same contract the engine's launch producers keep.
            library_service: Answers DEC-011's reference check. Optional only so
                a caller that never computes a diff need not build one; when a
                diff *is* computed without it, the summary is the same
                ``NO_REFERENCES`` the real seam returns today, so the shape a
                caller sees never changes.
        """
        self._tracks = track_repository
        self._playlists = playlist_repository
        self._source = source_repository
        self._db = database_service
        self._activity = activity_service
        self._library = library_service

    # ----------------------------------------------------------------- import

    def import_rekordbox_xml(
        self,
        xml_path: str,
        on_progress: Optional[ProgressCallback] = None,
        should_cancel: Optional[CancelCheck] = None,
    ) -> ImportSummary:
        """Import a Rekordbox export, and return what it did.

        Idempotent: importing the same file twice reports zero inserted and
        every track updated, and leaves exactly the same number of rows. That is
        the property most likely to break subtly, and the one a user notices
        last, so it is what the tests lean on hardest.

        **Cancellation is all-or-nothing.** The check runs before anything is
        written and then between tracks, inside the single transaction the whole
        import runs in — so a cancel at any point rolls everything back and
        leaves the library exactly as it was, source record included. That
        record therefore only ever describes an import that finished.

        Args:
            xml_path: Path to the Rekordbox XML export.
            on_progress: Called with ``(completed, total, phase)`` as the import
                proceeds. Called on the calling thread; a slow callback slows
                the import, so a caller that persists should sample.
            should_cancel: Called between tracks; returning True stops the
                import with :class:`ImportCancelled` and writes nothing.

        Returns:
            An :class:`ImportSummary`.

        Raises:
            FileNotFoundError: If the file does not exist.
            ValidationError: If the file has no ``COLLECTION`` element.
            ImportCancelled: If ``should_cancel`` asked it to stop.
            ValueError: If the file exceeds the parser's size limit.
            xml.etree.ElementTree.ParseError: If the XML is malformed.
        """
        started = time.perf_counter()
        declared = self._require_collection(xml_path)

        if should_cancel is not None and should_cancel():
            raise ImportCancelled("Cancelled before the import began")

        written = self._write_export(
            xml_path, declared, on_progress, should_cancel, delete_unclaimed=False
        )

        summary = ImportSummary(
            source=written.source,
            tracks_inserted=written.tracks.inserted,
            tracks_updated=written.tracks.updated,
            relinked=written.tracks.relinked,
            playlists=written.playlists,
            duration_seconds=time.perf_counter() - started,
        )
        self._record_activity(summary)
        _logger.info(
            "[library] Imported %s: %s inserted, %s updated, %s re-linked, "
            "%s playlist nodes, %s entries in %.2fs",
            xml_path,
            summary.tracks_inserted,
            summary.tracks_updated,
            summary.relinked_count,
            summary.playlists.nodes,
            summary.playlists.entries,
            summary.duration_seconds,
        )
        return summary

    # ------------------------------------------------------------------ reads

    def current_source(self) -> Optional[LibrarySource]:
        """Return the file the library was imported from, or None."""
        return self._source.get()

    # --------------------------------------------------------------- internal

    @staticmethod
    def _observed_tracks(
        xml_path: str,
        observed: dict,
        on_progress: Optional[ProgressCallback],
        should_cancel: Optional[CancelCheck],
    ) -> Iterator:
        """Yield parsed tracks, reporting progress and honouring cancellation.

        A generator wrapped around the parser rather than a loop inside the
        repository, so that both concerns stay out of the SQL and — the part
        that matters — so a cancel raises *inside* the upsert's transaction and
        rolls it back.

        ``observed["total"]`` is clamped upward when more tracks arrive than the
        file declared: ``Entries`` is Rekordbox's claim, and a progress bar that
        reads 104% is a worse bug than one that finishes early. It is written
        back so the caller's phase-transition tick reports the same total.
        """
        total = observed["total"]
        for completed, track in enumerate(iter_collection_tracks(xml_path), start=1):
            if should_cancel is not None and should_cancel():
                raise ImportCancelled(f"Cancelled after reading {completed - 1} tracks")
            yield track
            if completed > total:
                total = completed
                observed["total"] = total
            if on_progress is not None:
                on_progress(completed, total, PHASE_TRACKS)

    @staticmethod
    def _require_collection(xml_path: str) -> int:
        """Fail clearly on a file that is not a Rekordbox collection export.

        Checked before anything is written. The alternative — importing and
        finding nothing — leaves a user with an empty library and a success
        message, which reads as CuePoint losing their collection.

        Returns:
            The number of tracks the file declares, for progress reporting.
        """
        declared: Optional[int] = collection_entry_count(xml_path)
        if declared is not None:
            return declared
        raise ValidationError(
            message=(
                f"{xml_path} has no COLLECTION section, so it is not a Rekordbox "
                "collection export. In Rekordbox, use File > Export Collection in "
                "xml format."
            ),
            error_code="LIBRARY_XML_NO_COLLECTION",
            context={"xml_path": str(xml_path)},
        )

    # ------------------------------------------------------------------ apply

    def apply_refresh(
        self,
        diff: RefreshDiff,
        confirm_references: bool = False,
        on_progress: Optional[ProgressCallback] = None,
        should_cancel: Optional[CancelCheck] = None,
    ) -> RefreshSummary:
        """Make the library match the export the diff was computed against.

        The only irreversible operation in this phase. DEC-003 deletes tracks
        that have left Rekordbox, and their tags, ratings, history and playlist
        membership go with them.

        **One transaction, and that is the whole safety story.** Deleting,
        upserting, rewriting the playlist mirror and recording the source all
        happen inside a single block, so a failure at any point leaves the
        library exactly as it was. A half-applied refresh would be a library
        missing tracks nobody agreed to lose.

        **The removals are recomputed, not replayed.** ``diff`` names the file
        and carries the numbers a user was shown, but *which rows to delete*
        comes from the pass this method runs — the same identity resolution,
        against a snapshot taken now. Replaying the diff's list would act on what
        was true when the preview was computed, and the file or the library may
        have moved since. Where neither has, the counts match what the preview
        promised, which is what the tests assert.

        Args:
            diff: The preview a user confirmed. Its ``xml_path`` is re-read.
            confirm_references: Required when Collections or Sets hold tracks
                that would be deleted (DEC-011). Always unnecessary today
                because nothing in this build can reference a track; the gate
                exists so Phase 6 fills in one method rather than reshaping
                this flow.
            on_progress: Called with ``(completed, total, phase)``.
            should_cancel: Checked between tracks. Cancelling rolls the whole
                transaction back, so nothing is applied.

        Returns:
            A :class:`RefreshSummary`.

        Raises:
            ValidationError: If the file has no ``COLLECTION`` element, or
                references exist and were not confirmed.
            FileNotFoundError: If the file is gone.
            ImportCancelled: If ``should_cancel`` asked it to stop.
        """
        started = time.perf_counter()
        xml_path = diff.xml_path
        declared = self._require_collection(xml_path)

        if should_cancel is not None and should_cancel():
            raise ImportCancelled("Cancelled before the refresh began")

        written = self._write_export(
            xml_path,
            declared,
            on_progress,
            should_cancel,
            delete_unclaimed=True,
            confirm_references=confirm_references,
        )

        summary = RefreshSummary(
            source=written.source,
            tracks_inserted=written.tracks.inserted,
            tracks_updated=written.tracks.updated,
            tracks_deleted=written.deleted,
            relinked=written.tracks.relinked,
            playlists=written.playlists,
            references=written.references,
            duration_seconds=time.perf_counter() - started,
        )
        self._record_refresh_activity(summary)
        _logger.info(
            "[library] Refreshed %s: %s inserted, %s updated, %s deleted, "
            "%s re-linked, %s playlist nodes in %.2fs",
            xml_path,
            summary.tracks_inserted,
            summary.tracks_updated,
            summary.tracks_deleted,
            summary.relinked_count,
            summary.playlists.nodes,
            summary.duration_seconds,
        )
        return summary

    # --------------------------------------------------------- shared writing

    def _write_export(
        self,
        xml_path: str,
        declared: int,
        on_progress: Optional[ProgressCallback],
        should_cancel: Optional[CancelCheck],
        *,
        delete_unclaimed: bool,
        confirm_references: bool = False,
    ) -> ExportWriteResult:
        """Write an export into the library — all of it, or none of it.

        The one place an import and a refresh both go through, so the two cannot
        drift on what a write means. They differ in exactly one thing, and it is
        the argument: an import never deletes, a refresh does.

        Which rows a refresh deletes is not decided here and not passed in. It
        is whatever ``upsert_many_from_rekordbox`` reports as *unclaimed* —
        the library rows this very pass failed to match to anything in the file.
        Taking it from the pass that did the matching is what stops the deleting
        and the matching from ever disagreeing.

        Everything runs inside a single transaction. That is what makes a failed
        refresh a no-op rather than a partly destroyed library, and it gives the
        first import the same property for free: before this, an import that
        failed after its tracks were committed left them behind.
        """
        # Shared with the generator so the phase-transition tick below reports
        # the total the track pass actually reached. Reporting `declared` here
        # made a file that under-declares its Entries count jump backwards —
        # 5/5 tracks, then 2/2 playlists.
        observed = {"total": declared}

        with self._db.transaction():
            tracks = self._tracks.upsert_many_from_rekordbox(
                self._observed_tracks(xml_path, observed, on_progress, should_cancel)
            )

            deleted = 0
            references = NO_REFERENCES
            if delete_unclaimed and tracks.unclaimed_track_ids:
                references = self._check_references(
                    tracks.unclaimed_track_ids, confirm_references
                )
                deleted = self._tracks.delete_many(tracks.unclaimed_track_ids)

            if on_progress is not None:
                on_progress(observed["total"], observed["total"], PHASE_PLAYLISTS)
            playlists = self._playlists.replace_tree(iter_playlist_nodes(xml_path))

            source = self._source.replace(
                source_for_import(
                    xml_path=xml_path,
                    imported_at=utc_now_iso(),
                    track_count=self._tracks.count(),
                    playlist_count=self._playlists.count(),
                )
            )

        return ExportWriteResult(
            tracks=tracks,
            playlists=playlists,
            source=source,
            deleted=deleted,
            references=references,
        )

    def _check_references(
        self, track_ids: Iterable[int], confirmed: bool
    ) -> ReferenceSummary:
        """Consult DEC-011's seam before deleting, and refuse if it says wait.

        Asked here rather than trusted from the diff: the preview may have been
        computed some time ago, and this is the moment the tracks actually go.

        The refusal is unreachable today — nothing in this build can reference a
        track — which is exactly why the gate is written now. Phase 6 makes the
        seam answer, and finds this flow, its error code and the confirmation
        that clears it already in place.
        """
        if self._library is None:
            return NO_REFERENCES

        references = self._library.references_for(track_ids)
        if references.has_references and not confirmed:
            raise ValidationError(
                message=(
                    f"{references.referenced_track_count} tracks removed from "
                    f"Rekordbox are used in {references.collection_count} "
                    f"Collections and {references.set_count} Sets. Confirm to "
                    "remove them and everything attached to them."
                ),
                error_code="LIBRARY_REFRESH_NEEDS_CONFIRMATION",
                context={
                    "collection_count": references.collection_count,
                    "set_count": references.set_count,
                    "referenced_track_count": references.referenced_track_count,
                },
            )
        return references

    # ---------------------------------------------------------------- refresh

    def compute_refresh_diff(
        self,
        xml_path: Optional[str] = None,
        detail_limit: int = DEFAULT_DETAIL_LIMIT,
        should_cancel: Optional[CancelCheck] = None,
    ) -> RefreshDiff:
        """Work out what a refresh would change, and change nothing (DEC-032).

        Every write is deliberately absent. DEC-003 deletes tracks that have
        left Rekordbox along with the tags and ratings attached to them, and
        that cannot be undone — the preview is what makes it a decision instead
        of a surprise.

        **The classification has to match what an import would actually do.**
        Identity is resolved with the same
        :func:`~cuepoint.models.library_track.resolve_identity`, against the same
        kind of snapshot, with the same rule that a library row is claimed at
        most once. A preview computed a different way would eventually promise
        one thing while the apply did another, which is worse than no preview.

        Args:
            xml_path: The export to compare against. Defaults to the file the
                library was imported from (DEC-035) — a refresh re-reads that
                without asking, which is why it is recorded.
            detail_limit: How many examples each category keeps. Counts stay
                exact regardless.
            should_cancel: Checked between tracks; returning True aborts with
                :class:`ImportCancelled`. Nothing was written, so there is
                nothing to undo.

        Returns:
            A :class:`RefreshDiff`.

        Raises:
            ValidationError: If no path was given and nothing has been imported,
                or the file has no ``COLLECTION`` element.
            FileNotFoundError: If the file does not exist.
            ImportCancelled: If ``should_cancel`` asked it to stop.
        """
        started = time.perf_counter()
        path = self._resolve_refresh_path(xml_path)
        self._require_collection(path)

        diff = RefreshDiff(xml_path=path)
        for category in (
            diff.added,
            diff.changed,
            diff.removed,
            diff.relinked,
            diff.playlists_added,
            diff.playlists_changed,
            diff.playlists_removed,
        ):
            category.limit = detail_limit

        snapshot = self._tracks.identity_snapshot()
        rows_for_refs = self._diff_tracks(path, diff, snapshot, should_cancel)
        self._diff_playlists(path, diff, rows_for_refs)
        diff.references = self._references_for_removed(diff)
        diff.duration_seconds = time.perf_counter() - started

        _logger.info(
            "[library] Refresh diff for %s: +%s ~%s -%s relinked=%s "
            "playlists +%s ~%s -%s in %.2fs",
            path,
            diff.added.count,
            diff.changed.count,
            diff.removed.count,
            diff.relinked.count,
            diff.playlists_added.count,
            diff.playlists_changed.count,
            diff.playlists_removed.count,
            diff.duration_seconds,
        )
        return diff

    def _references_for_removed(self, diff: RefreshDiff) -> ReferenceSummary:
        """Ask DEC-011's question about the tracks this refresh would delete.

        Only removals: a track that is changing or being re-linked keeps its row
        and everything attached to it, so nothing is at risk. Asked even when
        nothing would be removed, because a caller reading ``diff.references``
        should never have to handle it being absent.

        The ids come from the sample rather than the count, so a diff whose
        detail was capped asks about the tracks it can name. That is a floor on
        a number that is zero in every library this build can produce, and
        Phase 6 inherits a note saying so.
        """
        if self._library is None:
            return NO_REFERENCES
        return self._library.references_for(
            track.id for track in self._removed_track_rows(diff)
        )

    def _removed_track_rows(self, diff: RefreshDiff) -> list:
        """Return the library rows behind the diff's removed sample."""
        rows = []
        for summary_item in diff.removed.items:
            stored = self._tracks.find_by_rekordbox_id(summary_item.rekordbox_track_id)
            if stored is not None and stored.id is not None:
                rows.append(stored)
        return rows

    def _resolve_refresh_path(self, xml_path: Optional[str]) -> str:
        """Return the export to diff against, defaulting to the source record."""
        if xml_path is not None and str(xml_path).strip():
            return str(xml_path).strip()

        source = self._source.get()
        if source is None:
            raise ValidationError(
                message=(
                    "No library has been imported yet, so there is nothing to "
                    "refresh. Import a Rekordbox collection first."
                ),
                error_code="LIBRARY_NOT_IMPORTED",
                context={},
            )
        path: str = source.xml_path
        return path

    @staticmethod
    def _diff_tracks(
        xml_path: str,
        diff: RefreshDiff,
        snapshot: Tuple[dict, dict],
        should_cancel: Optional[CancelCheck],
    ) -> dict:
        """Classify every track, and return where each of its ids will land.

        The mapping comes back because the playlist comparison needs it: after a
        Rekordbox renumbering the same tracks are still in the same playlists,
        and comparing membership by TrackID would report every playlist as
        edited. Comparing by the *library row* each reference resolves to says
        what actually changed. Streaming the collection a second time to work
        this out would double the cost of the expensive half.

        A reference that resolves to nothing maps to ``None``: it is a track the
        refresh would add, so a playlist holding it has genuinely changed.

        Whatever the export never claimed is what a refresh would delete.
        """
        by_rekordbox_id, by_path = snapshot
        unclaimed = {track.id: track for track in by_rekordbox_id.values()}
        claimed: set = set()
        rows_for_refs: dict = {}

        for incoming in iter_collection_tracks(xml_path):
            if should_cancel is not None and should_cancel():
                raise ImportCancelled("Cancelled while computing the diff")

            match = resolve_identity(
                incoming.rekordbox_track_id,
                incoming.file_path,
                by_rekordbox_id.get,
                by_path.get,
            )
            stored = match.track if match is not None else None
            if stored is None or stored.id in claimed:
                rows_for_refs[incoming.rekordbox_track_id] = None
                diff.added.add(summarize(incoming))
                continue

            rows_for_refs[incoming.rekordbox_track_id] = stored.id
            claimed.add(stored.id)
            unclaimed.pop(stored.id, None)

            if match.relinked:
                diff.relinked.add(
                    RelinkedTrack(
                        rekordbox_track_id=incoming.rekordbox_track_id,
                        previous_rekordbox_track_id=stored.rekordbox_track_id,
                        file_path=incoming.file_path,
                    )
                )

            fields = changed_fields(stored, incoming)
            if fields:
                diff.changed.add(
                    TrackChange(
                        rekordbox_track_id=incoming.rekordbox_track_id,
                        title=incoming.title,
                        artist=incoming.artist,
                        fields=fields,
                    )
                )

        for stored in unclaimed.values():
            diff.removed.add(summarize(stored))
        return rows_for_refs

    def _diff_playlists(
        self,
        xml_path: str,
        diff: RefreshDiff,
        rows_for_refs: dict,
    ) -> None:
        """Compare the mirrored tree with the export's.

        Keyed on the full path, because that is what a user recognizes in a
        preview and what ``--playlist`` already speaks. A path is not guaranteed
        unique — a real export has a playlist named ``COZMO_11/02`` — so two
        nodes rendering the same path are compared as one. That is a cosmetic
        limit on the preview, not a correctness one: applying a refresh replaces
        the mirror wholesale (LIBRARY-03), so nothing downstream depends on this
        pairing being exact.

        Membership is compared **by library row**, not by Rekordbox TrackID. A
        renumbering changes every id in the file while leaving the tracks exactly
        where they are: comparing ids reported 185 of one real export's 206
        playlists as edited when not one of them had been touched. A reference
        resolving to no existing row compares as ``None`` — a track the refresh
        would add, which is a real change to any playlist holding it.
        """
        stored_nodes = {
            node.rekordbox_path: node for node in self._playlists.list_all()
        }
        stored_members = {
            path: self._playlists.track_ids_for(node.id)
            for path, node in stored_nodes.items()
            if not node.is_folder
        }

        seen: set = set()
        for node in iter_playlist_nodes(xml_path):
            seen.add(node.rekordbox_path)
            stored = stored_nodes.get(node.rekordbox_path)
            if stored is None:
                diff.playlists_added.add(
                    PlaylistSummary(
                        rekordbox_path=node.rekordbox_path,
                        kind=node.kind,
                        track_count=node.track_count,
                    )
                )
                continue

            if stored.kind != node.kind:
                diff.playlists_changed.add(
                    PlaylistChange(
                        rekordbox_path=node.rekordbox_path,
                        kind=node.kind,
                        change="kind",
                        track_count=node.track_count,
                        previous_track_count=stored.track_count,
                    )
                )
                continue

            if node.is_folder:
                continue

            # A reference the export itself does not contain names nothing and
            # would not be stored, so it is dropped rather than counted as a
            # change the refresh would never make.
            incoming_rows = [
                rows_for_refs[ref] for ref in node.track_refs if ref in rows_for_refs
            ]
            previous = stored_members.get(node.rekordbox_path, [])
            if previous != incoming_rows:
                diff.playlists_changed.add(
                    PlaylistChange(
                        rekordbox_path=node.rekordbox_path,
                        kind=node.kind,
                        change="membership",
                        track_count=len(incoming_rows),
                        previous_track_count=len(previous),
                    )
                )

        for path, node in stored_nodes.items():
            if path not in seen:
                diff.playlists_removed.add(
                    PlaylistSummary(
                        rekordbox_path=path,
                        kind=node.kind,
                        track_count=node.track_count,
                    )
                )

    def _record_refresh_activity(self, summary: RefreshSummary) -> None:
        """Record what a refresh did, or quietly do nothing.

        DEC-029's feed is the only durable record a user has of a destructive
        refresh, so it matters most here — but it still must not be able to fail
        one that has already succeeded and committed.
        """
        if self._activity is None:
            return
        try:
            self._activity.record_event(
                EVENT_LIBRARY_REFRESHED,
                summary.summary_line(),
                {
                    "xml_path": summary.source.xml_path,
                    "inserted": summary.tracks_inserted,
                    "updated": summary.tracks_updated,
                    "deleted": summary.tracks_deleted,
                    "relinked": summary.relinked_count,
                    "playlists": summary.playlists.playlists,
                    "folders": summary.playlists.folders,
                    "entries": summary.playlists.entries,
                    "duration_seconds": round(summary.duration_seconds, 3),
                },
            )
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug("[activity] could not record the refresh: %s", exc)

    def _record_activity(self, summary: ImportSummary) -> None:
        """Record the completion event, or quietly do nothing.

        Never raises: an import that succeeded must not be reported as failed
        because the feed could not be written.
        """
        if self._activity is None:
            return
        try:
            self._activity.record_event(
                EVENT_LIBRARY_IMPORTED,
                summary.summary_line(),
                {
                    "xml_path": summary.source.xml_path,
                    "inserted": summary.tracks_inserted,
                    "updated": summary.tracks_updated,
                    "relinked": summary.relinked_count,
                    "playlists": summary.playlists.playlists,
                    "folders": summary.playlists.folders,
                    "entries": summary.playlists.entries,
                    "missing_track_refs": summary.playlists.missing_count,
                    "duration_seconds": round(summary.duration_seconds, 3),
                },
            )
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug("[activity] could not record the import: %s", exc)
