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

What an import does, in order:

1. Refuse a file that has no ``COLLECTION`` element. It would otherwise import
   as a successful import of nothing, which is worse than an error.
2. Upsert every track, applying DEC-002 identity and reporting re-links.
3. Replace the mirrored playlist tree (DEC-031).
4. Record where the library came from (DEC-035).

The order is deliberate. There is no single transaction spanning all of it —
``DatabaseService`` refuses nested transactions on purpose, since SQLite has no
nested transaction and pretending otherwise would silently commit partial work —
so the steps are explicit batches, and the **source record is written last**. An
import that fails part way therefore leaves no source record, and the library
correctly reports that it has not been imported from a file. Because every track
write is an upsert, re-running the import converges rather than duplicating.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable, Iterator, Optional, Tuple

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
from cuepoint.models.rekordbox_playlist import PlaylistTreeWriteResult
from cuepoint.persistence.track_repository import RelinkedTrack
from cuepoint.services.interfaces import (
    IActivityService,
    ILibraryImportService,
    ILibrarySourceRepository,
    IPlaylistRepository,
    ITrackRepository,
)

_logger = logging.getLogger(__name__)

#: Activity event recorded when an import finishes (DEC-029's pattern).
EVENT_LIBRARY_IMPORTED = "library.imported"

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


class LibraryImportService(ILibraryImportService):
    """Imports a Rekordbox export into the persistent library."""

    def __init__(
        self,
        track_repository: ITrackRepository,
        playlist_repository: IPlaylistRepository,
        source_repository: ILibrarySourceRepository,
        activity_service: Optional[IActivityService] = None,
    ) -> None:
        """Initialize the service.

        Args:
            track_repository: Owns the ``tracks`` table.
            playlist_repository: Owns the mirrored playlist tree.
            source_repository: Owns the DEC-035 source record.
            activity_service: Records the completion event. Optional because the
                feed is a record of what happened, not a dependency of it — the
                same contract the engine's launch producers keep.
        """
        self._tracks = track_repository
        self._playlists = playlist_repository
        self._source = source_repository
        self._activity = activity_service

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

        **Where cancellation is honoured, and where it stops being.** The check
        runs before anything is written and then between tracks, inside the
        upsert's transaction — so a cancel during the long phase rolls that
        transaction back and leaves the library untouched. Once those tracks are
        committed the import runs to completion: what remains is the playlist
        mirror and the source record, together a small fraction of the work, and
        stopping between them would leave a mirror that disagrees with the
        tracks. The result either way is a library that is never half-imported,
        and a source record that only ever describes an import that finished.

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

        # Shared with the generator so the phase-transition tick below reports
        # the total the track pass actually reached. Reporting `declared` here
        # made a file that under-declares its Entries count jump backwards —
        # 5/5 tracks, then 2/2 playlists.
        observed = {"total": declared}
        tracks = self._tracks.upsert_many_from_rekordbox(
            self._observed_tracks(xml_path, observed, on_progress, should_cancel)
        )
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

        summary = ImportSummary(
            source=source,
            tracks_inserted=tracks.inserted,
            tracks_updated=tracks.updated,
            relinked=tracks.relinked,
            playlists=playlists,
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
