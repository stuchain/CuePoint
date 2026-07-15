"""Frozen Write + Index columns for results table (Rollout Phase B sticky cols)."""

from __future__ import annotations

from typing import Callable, List, Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QAbstractItemView,
    QHBoxLayout,
    QHeaderView,
    QSizePolicy,
    QTableWidget,
    QTableWidgetItem,
    QWidget,
)

from cuepoint.ui.widgets.results_column_layout import (
    COLUMN_COUNT,
    DEFAULT_COLUMN_WIDTHS,
    ResultsColumnLayoutManager,
    clamp_column_width,
    load_column_widths,
    save_column_widths,
)

FROZEN_COLUMN_COUNT = 2
SCROLL_COLUMN_OFFSET = FROZEN_COLUMN_COUNT


class _UnifiedHorizontalHeader:
    """Proxy header mapping logical columns 0–13 onto frozen + scroll tables."""

    def __init__(self, host: "ResultsFrozenTableHost") -> None:
        self._host = host

    def sortIndicatorSection(self) -> int:
        frozen_col = self._host._frozen.horizontalHeader().sortIndicatorSection()
        if frozen_col >= 0:
            return frozen_col
        scroll_col = self._host._scroll.horizontalHeader().sortIndicatorSection()
        if scroll_col >= 0:
            return scroll_col + SCROLL_COLUMN_OFFSET
        return -1

    def sortIndicatorOrder(self) -> Qt.SortOrder:
        frozen_order = self._host._frozen.horizontalHeader().sortIndicatorOrder()
        if self._host._frozen.horizontalHeader().sortIndicatorSection() >= 0:
            return frozen_order
        return self._host._scroll.horizontalHeader().sortIndicatorOrder()

    def setSortIndicator(self, logical_index: int, order: Qt.SortOrder) -> None:
        if logical_index < FROZEN_COLUMN_COUNT:
            self._host._frozen.horizontalHeader().setSortIndicator(logical_index, order)
            self._host._scroll.horizontalHeader().setSortIndicator(-1, Qt.AscendingOrder)
        else:
            self._host._scroll.horizontalHeader().setSortIndicator(
                logical_index - SCROLL_COLUMN_OFFSET, order
            )
            self._host._frozen.horizontalHeader().setSortIndicator(-1, Qt.AscendingOrder)

    def sectionClicked(self):
        return _MergedSignal(self._host)

    def __getattr__(self, name: str):
        return getattr(self._host._scroll.horizontalHeader(), name)


class _MergedSignal:
    def __init__(self, host: "ResultsFrozenTableHost") -> None:
        self._host = host

    def connect(self, slot: Callable[[int], None]) -> None:
        self._host._frozen.horizontalHeader().sectionClicked.connect(slot)
        self._host._scroll.horizontalHeader().sectionClicked.connect(
            lambda index: slot(index + SCROLL_COLUMN_OFFSET)
        )


class ResultsFrozenTableHost(QWidget):
    """Two-table host: frozen Write/Index + horizontally scrollable remaining columns."""

    doubleClicked = Signal(object)
    customContextMenuRequested = Signal(object)

    def __init__(
        self,
        column_layout: ResultsColumnLayoutManager,
        header_labels: List[str],
        parent: Optional[QWidget] = None,
    ) -> None:
        super().__init__(parent)
        self._column_layout = column_layout
        self._header = _UnifiedHorizontalHeader(self)
        self._syncing_scroll = False
        self._syncing_selection = False

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self._frozen = QTableWidget(0, FROZEN_COLUMN_COUNT, self)
        self._frozen.setHorizontalHeaderLabels(header_labels[:FROZEN_COLUMN_COUNT])
        self._frozen.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self._frozen.verticalHeader().setVisible(False)
        self._frozen.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Expanding)

        self._scroll = QTableWidget(0, COLUMN_COUNT - FROZEN_COLUMN_COUNT, self)
        self._scroll.setHorizontalHeaderLabels(header_labels[FROZEN_COLUMN_COUNT:])
        self._scroll.verticalHeader().setVisible(False)
        self._scroll.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

        for table in (self._frozen, self._scroll):
            table.setSortingEnabled(False)
            table.setAlternatingRowColors(False)
            table.setSelectionBehavior(QTableWidget.SelectRows)
            table.setEditTriggers(QTableWidget.NoEditTriggers)
            table.setSelectionMode(QAbstractItemView.ExtendedSelection)

        layout.addWidget(self._frozen)
        layout.addWidget(self._scroll, 1)

        self._apply_column_widths()
        self._connect_sync()
        self._connect_resize_persistence()

        self._scroll.doubleClicked.connect(self.doubleClicked.emit)
        self._frozen.doubleClicked.connect(self.doubleClicked.emit)
        self._scroll.customContextMenuRequested.connect(self.customContextMenuRequested.emit)
        self._frozen.customContextMenuRequested.connect(self.customContextMenuRequested.emit)

    @property
    def frozen_table(self) -> QTableWidget:
        return self._frozen

    @property
    def scroll_table(self) -> QTableWidget:
        return self._scroll

    def horizontalHeader(self) -> _UnifiedHorizontalHeader:
        return self._header

    def verticalHeader(self):
        return self._scroll.verticalHeader()

    def viewport(self):
        return self._scroll.viewport()

    def columnCount(self) -> int:
        return COLUMN_COUNT

    def rowCount(self) -> int:
        return self._scroll.rowCount()

    def setRowCount(self, rows: int) -> None:
        self._frozen.setRowCount(rows)
        self._scroll.setRowCount(rows)

    def setColumnCount(self, _count: int) -> None:
        pass

    def setHorizontalHeaderLabels(self, labels: List[str]) -> None:
        self._frozen.setHorizontalHeaderLabels(labels[:FROZEN_COLUMN_COUNT])
        self._scroll.setHorizontalHeaderLabels(labels[FROZEN_COLUMN_COUNT:])

    def setSortingEnabled(self, enabled: bool) -> None:
        self._frozen.setSortingEnabled(enabled)
        self._scroll.setSortingEnabled(enabled)

    def setAlternatingRowColors(self, enabled: bool) -> None:
        self._frozen.setAlternatingRowColors(enabled)
        self._scroll.setAlternatingRowColors(enabled)

    def setSelectionBehavior(self, behavior: QAbstractItemView.SelectionBehavior) -> None:
        self._frozen.setSelectionBehavior(behavior)
        self._scroll.setSelectionBehavior(behavior)

    def setEditTriggers(self, triggers: QAbstractItemView.EditTrigger) -> None:
        self._frozen.setEditTriggers(triggers)
        self._scroll.setEditTriggers(triggers)

    def setContextMenuPolicy(self, policy: Qt.ContextMenuPolicy) -> None:
        self._frozen.setContextMenuPolicy(policy)
        self._scroll.setContextMenuPolicy(policy)

    def setItemDelegate(self, delegate) -> None:
        self._frozen.setItemDelegate(delegate)
        self._scroll.setItemDelegate(delegate)

    def columnWidth(self, col: int) -> int:
        if col < FROZEN_COLUMN_COUNT:
            return self._frozen.columnWidth(col)
        return self._scroll.columnWidth(col - SCROLL_COLUMN_OFFSET)

    def setColumnWidth(self, col: int, width: int) -> None:
        clamped = clamp_column_width(col, width)
        if col < FROZEN_COLUMN_COUNT:
            self._frozen.setColumnWidth(col, clamped)
            self._update_frozen_width()
        else:
            self._scroll.setColumnWidth(col - SCROLL_COLUMN_OFFSET, clamped)

    def setItem(self, row: int, col: int, item: Optional[QTableWidgetItem]) -> None:
        if col < FROZEN_COLUMN_COUNT:
            self._frozen.setItem(row, col, item)
        else:
            self._scroll.setItem(row, col - SCROLL_COLUMN_OFFSET, item)

    def item(self, row: int, col: int) -> Optional[QTableWidgetItem]:
        if col < FROZEN_COLUMN_COUNT:
            return self._frozen.item(row, col)
        return self._scroll.item(row, col - SCROLL_COLUMN_OFFSET)

    def sortItems(self, col: int, order: Qt.SortOrder = Qt.AscendingOrder) -> None:
        rows = self.rowCount()
        if rows <= 1:
            return
        captured: List[List[Optional[QTableWidgetItem]]] = []
        for row in range(rows):
            row_items: List[Optional[QTableWidgetItem]] = []
            for column in range(COLUMN_COUNT):
                item = self.item(row, column)
                if item is not None:
                    item = item.clone()
                row_items.append(item)
            captured.append(row_items)

        def sort_key(row_items: List[Optional[QTableWidgetItem]]):
            item = row_items[col]
            if item is None:
                return ""
            try:
                return float(item.text())
            except ValueError:
                return item.text().lower()

        captured.sort(key=sort_key, reverse=order == Qt.DescendingOrder)
        self.setSortingEnabled(False)
        self.setRowCount(len(captured))
        for row, row_items in enumerate(captured):
            for column, item in enumerate(row_items):
                self.setItem(row, column, item)
        self.setSortingEnabled(True)
        self._header.setSortIndicator(col, order)

    def selectedItems(self) -> List[QTableWidgetItem]:
        return self._frozen.selectedItems() + self._scroll.selectedItems()

    def selectionModel(self):
        return self._scroll.selectionModel()

    def selectAll(self) -> None:
        self._frozen.selectAll()
        self._scroll.selectAll()

    def itemAt(self, position):
        item = self._scroll.itemAt(position)
        if item is not None:
            return item
        mapped = self._frozen.mapFrom(self._scroll, position)
        return self._frozen.itemAt(mapped)

    def _apply_column_widths(self) -> None:
        widths = load_column_widths() or list(DEFAULT_COLUMN_WIDTHS)
        for col in range(FROZEN_COLUMN_COUNT):
            self._frozen.setColumnWidth(col, clamp_column_width(col, widths[col]))
        for col in range(SCROLL_COLUMN_OFFSET, COLUMN_COUNT):
            self._scroll.setColumnWidth(
                col - SCROLL_COLUMN_OFFSET,
                clamp_column_width(col, widths[col]),
            )
        self._update_frozen_width()

    def _update_frozen_width(self) -> None:
        total = sum(self._frozen.columnWidth(col) for col in range(FROZEN_COLUMN_COUNT))
        total += self._frozen.verticalHeader().width() if self._frozen.verticalHeader().isVisible() else 0
        total += self.frameWidth() * 2
        self._frozen.setFixedWidth(max(total, 80))

    def _all_column_widths(self) -> List[int]:
        return [self.columnWidth(col) for col in range(COLUMN_COUNT)]

    def _connect_resize_persistence(self) -> None:
        def on_frozen_resized(logical_index: int, _old: int, _new: int) -> None:
            if logical_index < 0 or logical_index >= FROZEN_COLUMN_COUNT:
                return
            clamped = clamp_column_width(logical_index, self._frozen.columnWidth(logical_index))
            if clamped != self._frozen.columnWidth(logical_index):
                self._frozen.setColumnWidth(logical_index, clamped)
            self._update_frozen_width()
            save_column_widths(self._all_column_widths())

        def on_scroll_resized(logical_index: int, _old: int, _new: int) -> None:
            col = logical_index + SCROLL_COLUMN_OFFSET
            if col < 0 or col >= COLUMN_COUNT:
                return
            clamped = clamp_column_width(col, self._scroll.columnWidth(logical_index))
            if clamped != self._scroll.columnWidth(logical_index):
                self._scroll.setColumnWidth(logical_index, clamped)
            save_column_widths(self._all_column_widths())

        def reset_frozen(logical_index: int) -> None:
            if 0 <= logical_index < FROZEN_COLUMN_COUNT:
                self._frozen.setColumnWidth(logical_index, DEFAULT_COLUMN_WIDTHS[logical_index])
                self._update_frozen_width()
                save_column_widths(self._all_column_widths())

        def reset_scroll(logical_index: int) -> None:
            col = logical_index + SCROLL_COLUMN_OFFSET
            if 0 <= col < COLUMN_COUNT:
                self._scroll.setColumnWidth(logical_index, DEFAULT_COLUMN_WIDTHS[col])
                save_column_widths(self._all_column_widths())

        frozen_header = self._frozen.horizontalHeader()
        scroll_header = self._scroll.horizontalHeader()
        frozen_header.setSectionResizeMode(QHeaderView.Interactive)
        scroll_header.setSectionResizeMode(QHeaderView.Interactive)
        frozen_header.setStretchLastSection(False)
        scroll_header.setStretchLastSection(False)
        frozen_header.setMinimumSectionSize(24)
        scroll_header.setMinimumSectionSize(24)
        frozen_header.sectionResized.connect(on_frozen_resized)
        scroll_header.sectionResized.connect(on_scroll_resized)
        frozen_header.sectionHandleDoubleClicked.connect(reset_frozen)
        scroll_header.sectionHandleDoubleClicked.connect(reset_scroll)

    def _connect_sync(self) -> None:
        self._frozen.verticalScrollBar().valueChanged.connect(self._on_frozen_scroll)
        self._scroll.verticalScrollBar().valueChanged.connect(self._on_scroll_scroll)
        self._frozen.itemSelectionChanged.connect(self._sync_selection_from_frozen)
        self._scroll.itemSelectionChanged.connect(self._sync_selection_from_scroll)

    def _on_frozen_scroll(self, value: int) -> None:
        if self._syncing_scroll:
            return
        self._syncing_scroll = True
        self._scroll.verticalScrollBar().setValue(value)
        self._syncing_scroll = False

    def _on_scroll_scroll(self, value: int) -> None:
        if self._syncing_scroll:
            return
        self._syncing_scroll = True
        self._frozen.verticalScrollBar().setValue(value)
        self._syncing_scroll = False

    def _sync_selection_from_frozen(self) -> None:
        if self._syncing_selection:
            return
        self._syncing_selection = True
        rows = {index.row() for index in self._frozen.selectionModel().selectedRows()}
        self._scroll.clearSelection()
        for row in rows:
            self._scroll.selectRow(row)
        self._syncing_selection = False

    def _sync_selection_from_scroll(self) -> None:
        if self._syncing_selection:
            return
        self._syncing_selection = True
        rows = {index.row() for index in self._scroll.selectionModel().selectedRows()}
        self._frozen.clearSelection()
        for row in rows:
            self._frozen.selectRow(row)
        self._syncing_selection = False

    def _sync_row_order_from(self, source: QTableWidget) -> None:
        return

    def ensure_minimums(self) -> None:
        for col in range(FROZEN_COLUMN_COUNT):
            current = self._frozen.columnWidth(col)
            minimum = clamp_column_width(col, current)
            if current < minimum:
                self._frozen.setColumnWidth(col, minimum)
        for col in range(SCROLL_COLUMN_OFFSET, COLUMN_COUNT):
            scroll_col = col - SCROLL_COLUMN_OFFSET
            current = self._scroll.columnWidth(scroll_col)
            minimum = clamp_column_width(col, current)
            if current < minimum:
                self._scroll.setColumnWidth(scroll_col, minimum)
        self._update_frozen_width()
