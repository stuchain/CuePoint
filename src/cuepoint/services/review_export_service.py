#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Export review list: a selection's match states and decided candidates (CLEAN-11).

A new row source for ``export_service``, not a route through the retired
``TrackResult`` export: a review list is about library tracks and the candidate
each one's state points at, which a ``TrackResult`` — one run of inKey's
file-based match — cannot describe.

One row per track, in the selection's order, with two halves:

- **the track** as the Library shows it: effective key, BPM, genre, label and
  year (DEC-068), and where it stands — state, who decided, disputed, score;
- **the candidate the state points at**: the one accepted, the one rejected, or
  the winner a "needs review" proposes. A track never matched, or with no
  candidate, leaves that half empty.

Every value is read through the rule vocabulary's expressions, so an exported
"needs review" is what the filter of that name finds.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from cuepoint.persistence.track_query import (
    REVIEW_CANDIDATE_COLUMNS,
    REVIEW_TRACK_FIELDS,
)
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.interfaces import (
    IBatchService,
    IExportService,
    IReviewExportService,
    ITrackRepository,
)

#: The columns of an exported review list, in order. A public shape: a column
#: may be added at the end, never renamed.
REVIEW_COLUMNS: Tuple[str, ...] = (
    "track_id",
    *REVIEW_TRACK_FIELDS,
    "match_decided_at",
    *(f"candidate_{column}" for column in REVIEW_CANDIDATE_COLUMNS),
)

#: What the Excel sheet is called.
SHEET_TITLE = "Review list"


def review_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """One stored review row as its exported columns.

    ``id`` becomes ``track_id`` and the dispute flag a boolean; everything else
    is written as read.
    """
    exported = {column: row.get(column) for column in REVIEW_COLUMNS}
    exported["track_id"] = int(row["id"])
    disputed = row.get("match_disputed")
    exported["match_disputed"] = None if disputed is None else bool(disputed)
    return exported


@dataclass(frozen=True)
class ReviewExport:
    """What an export wrote."""

    file_path: str
    file_format: str
    count: int

    def to_dict(self) -> Dict[str, Any]:
        """The answer a route returns."""
        return {
            "file_path": self.file_path,
            "format": self.file_format,
            "count": self.count,
            "columns": list(REVIEW_COLUMNS),
        }


class ReviewExportService(IReviewExportService):
    """Resolves a selection once, reads its rows, and hands them to the export service."""

    def __init__(
        self,
        batch_service: IBatchService,
        track_repository: ITrackRepository,
        export_service: IExportService,
    ) -> None:
        """Resolve through the batch path, so a selection means what a batch's does."""
        self._batch = batch_service
        self._tracks = track_repository
        self._export = export_service

    def export(
        self,
        selection: BatchSelection,
        file_format: str,
        file_path: str,
        overwrite: bool = False,
    ) -> ReviewExport:
        """Write a selection's review rows to ``file_path``.

        Raises:
            ValueError: If the selection names no tracks.
            BrowseQueryError: If a query selection cannot be built.
            ExportError: If the format is unknown or the file cannot be written.
        """
        track_ids = self._batch.resolve(selection)
        rows: List[Dict[str, Any]] = [
            review_row(row) for row in self._tracks.review_rows(track_ids)
        ]
        self._export.export_table(
            REVIEW_COLUMNS,
            rows,
            file_path,
            file_format,
            overwrite=overwrite,
            sheet_title=SHEET_TITLE,
        )
        return ReviewExport(
            file_path=file_path, file_format=file_format, count=len(rows)
        )


__all__ = (
    "REVIEW_COLUMNS",
    "ReviewExport",
    "ReviewExportService",
    "review_row",
)
