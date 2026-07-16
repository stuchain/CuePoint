"""Results table column widths — lab parity (per-column mins, QSettings persistence)."""

from __future__ import annotations

from typing import Dict, List, Optional

from PySide6.QtCore import QSettings
from PySide6.QtWidgets import QHeaderView, QTableWidget

# Column indices aligned with results_view.py COL_* and lab resultsColumns.ts
COL_WRITE = 0
COL_INDEX = 1
COL_ORIGINAL_TITLE = 2
COL_ORIGINAL_ARTISTS = 3
COL_BEATPORT_TITLE = 4
COL_BEATPORT_ARTISTS = 5
COL_KEY = 6
COL_CAMELOT_KEY = 7
COL_RELEASE_YEAR = 8
COL_LABEL = 9
COL_MATCHED = 10
COL_SCORE = 11
COL_CONFIDENCE = 12
COL_BPM = 13

COLUMN_COUNT = 14
SETTINGS_KEY = "results/columnWidths"
DEFAULT_MIN_PX = 80

# Minimum width in CSS/desktop pixels (lab minWidthPx @ 1× scale)
COLUMN_MIN_WIDTHS: Dict[int, int] = {
    COL_WRITE: 36,
    COL_INDEX: 48,
    COL_KEY: 56,
    COL_CAMELOT_KEY: 64,
    COL_RELEASE_YEAR: 64,
    COL_MATCHED: 56,
    COL_SCORE: 56,
    COL_CONFIDENCE: 64,
    COL_BPM: 56,
}

DEFAULT_COLUMN_WIDTHS: List[int] = [
    COLUMN_MIN_WIDTHS[COL_WRITE],
    COLUMN_MIN_WIDTHS[COL_INDEX],
    140,  # Original Title
    120,  # Original Artists
    140,  # Beatport Title
    120,  # Beatport Artists
    COLUMN_MIN_WIDTHS[COL_KEY],
    96,  # Camelot Key
    96,  # Release Year
    120,  # Label
    COLUMN_MIN_WIDTHS[COL_MATCHED],
    COLUMN_MIN_WIDTHS[COL_SCORE],
    96,  # Confidence
    COLUMN_MIN_WIDTHS[COL_BPM],
]


def column_minimum(col: int) -> int:
    return COLUMN_MIN_WIDTHS.get(col, DEFAULT_MIN_PX)


def clamp_column_width(col: int, width: int) -> int:
    return max(column_minimum(col), int(width))


def load_column_widths() -> Optional[List[int]]:
    settings = QSettings()
    raw = settings.value(SETTINGS_KEY)
    if raw is None:
        return None
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        try:
            widths = [int(p) for p in parts]
        except ValueError:
            return None
    elif isinstance(raw, (list, tuple)):
        try:
            widths = [int(x) for x in raw]
        except (TypeError, ValueError):
            return None
    else:
        return None
    if len(widths) != COLUMN_COUNT:
        return None
    return [clamp_column_width(i, w) for i, w in enumerate(widths)]


def save_column_widths(widths: List[int]) -> None:
    if len(widths) != COLUMN_COUNT:
        return
    settings = QSettings()
    settings.setValue(SETTINGS_KEY, ",".join(str(clamp_column_width(i, w)) for i, w in enumerate(widths)))


FROZEN_COLUMN_COUNT = 2
SCROLL_COLUMN_OFFSET = FROZEN_COLUMN_COUNT


def sticky_left_offset(widths: list[int], column_index: int) -> int:
    """Pixel offset for sticky column (lab resultsTableLayout parity)."""
    if column_index <= 0:
        return 0
    total = 0
    for index in range(min(column_index, len(widths))):
        total += widths[index]
    return total


class ResultsColumnLayoutManager:
    """Apply interactive resize, persistence, and double-click reset to results tables."""

    def __init__(self) -> None:
        self._restoring = False
        self._connected_headers: set[int] = set()

    def configure_table(self, table: QTableWidget) -> None:
        header = table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.Interactive)
        header.setStretchLastSection(False)
        header.setMinimumSectionSize(24)

        widths = load_column_widths() or list(DEFAULT_COLUMN_WIDTHS)
        self._apply_widths(table, widths)

        header_id = id(header)
        if header_id in self._connected_headers:
            return
        header.sectionResized.connect(
            lambda logical_index, _old, new_size, tbl=table: self._on_section_resized(
                tbl, logical_index, new_size
            )
        )
        header.sectionHandleDoubleClicked.connect(
            lambda logical_index, tbl=table: self._on_section_double_clicked(tbl, logical_index)
        )
        self._connected_headers.add(header_id)

    def _apply_widths(self, table: QTableWidget, widths: List[int]) -> None:
        self._restoring = True
        try:
            for col, width in enumerate(widths[:COLUMN_COUNT]):
                table.setColumnWidth(col, clamp_column_width(col, width))
        finally:
            self._restoring = False

    def _on_section_resized(self, table: QTableWidget, col: int, new_size: int) -> None:
        if self._restoring or col < 0 or col >= COLUMN_COUNT:
            return
        clamped = clamp_column_width(col, new_size)
        if clamped != new_size:
            self._restoring = True
            try:
                table.setColumnWidth(col, clamped)
            finally:
                self._restoring = False
        save_column_widths([table.columnWidth(c) for c in range(COLUMN_COUNT)])

    def _on_section_double_clicked(self, table: QTableWidget, col: int) -> None:
        if col < 0 or col >= COLUMN_COUNT:
            return
        self._restoring = True
        try:
            table.setColumnWidth(col, DEFAULT_COLUMN_WIDTHS[col])
        finally:
            self._restoring = False
        save_column_widths([table.columnWidth(c) for c in range(COLUMN_COUNT)])

    def ensure_minimums(self, table: QTableWidget) -> None:
        """Clamp columns without resetting user widths (e.g. after repopulate)."""
        self._restoring = True
        try:
            for col in range(COLUMN_COUNT):
                current = table.columnWidth(col)
                minimum = column_minimum(col)
                if current < minimum:
                    table.setColumnWidth(col, minimum)
        finally:
            self._restoring = False
