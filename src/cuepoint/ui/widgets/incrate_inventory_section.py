"""inCrate Inventory tab: view database table, search, refresh, export CSV."""

import csv
from pathlib import Path
from typing import Any, Dict, List, Optional

from PySide6.QtCore import QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)


class IncrateInventorySection(QWidget):
    """Inventory database viewer: table, search, refresh, export CSV, open Beatport link."""

    refresh_requested = Signal()

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._rows: List[Dict[str, Any]] = []
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        group = QGroupBox("Inventory")
        group_layout = QVBoxLayout(group)

        self.path_label = QLabel("Database: —")
        self.path_label.setStyleSheet("color: #666; font-size: 11px;")
        self.path_label.setWordWrap(True)
        group_layout.addWidget(self.path_label)

        toolbar = QHBoxLayout()
        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText("Search artist, title, label...")
        self.search_edit.setClearButtonEnabled(True)
        self.search_edit.returnPressed.connect(self._on_refresh)
        toolbar.addWidget(self.search_edit)

        self.refresh_btn = QPushButton("Refresh")
        self.refresh_btn.setToolTip("Reload inventory from database")
        self.refresh_btn.clicked.connect(self._on_refresh)
        toolbar.addWidget(self.refresh_btn)

        self.export_btn = QPushButton("Export CSV")
        self.export_btn.setToolTip("Save visible rows to a CSV file")
        self.export_btn.clicked.connect(self._on_export_csv)
        toolbar.addWidget(self.export_btn)

        toolbar.addStretch()
        group_layout.addLayout(toolbar)

        self.count_label = QLabel("0 rows")
        self.count_label.setStyleSheet("color: #666; font-size: 12px;")
        group_layout.addWidget(self.count_label)

        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(
            ["Artist", "Title", "Label", "Beatport URL", "Updated"]
        )
        self.table.horizontalHeader().setSectionResizeMode(
            QHeaderView.ResizeMode.Stretch
        )
        self.table.setColumnWidth(3, 120)
        self.table.cellDoubleClicked.connect(self._on_cell_double_clicked)
        group_layout.addWidget(self.table)

        layout.addWidget(group)

    def set_db_path(self, path: str) -> None:
        self.path_label.setText(f"Database: {path or '—'}")

    def set_rows(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = list(rows)
        self.table.setRowCount(len(self._rows))
        for r, row in enumerate(self._rows):
            self.table.setItem(r, 0, QTableWidgetItem(str(row.get("artist") or "")))
            self.table.setItem(r, 1, QTableWidgetItem(str(row.get("title") or "")))
            self.table.setItem(r, 2, QTableWidgetItem(str(row.get("label") or "")))
            url = str(row.get("beatport_url") or "")
            self.table.setItem(r, 3, QTableWidgetItem(url))
            self.table.setItem(r, 4, QTableWidgetItem(str(row.get("updated_at") or "")))
        self.count_label.setText(
            f"{len(self._rows)} rows"
            + (" (max 5000)" if len(self._rows) >= 5000 else "")
        )

    def get_search_text(self) -> str:
        return (self.search_edit.text() or "").strip()

    def _on_refresh(self) -> None:
        self.refresh_requested.emit()

    def _on_cell_double_clicked(self, row: int, col: int) -> None:
        if col == 3 and row < len(self._rows):
            url = self._rows[row].get("beatport_url") or ""
            if url and url.startswith("http"):
                QDesktopServices.openUrl(QUrl(url))

    def _on_export_csv(self) -> None:
        if not self._rows:
            QMessageBox.information(self, "Export", "No rows to export.")
            return
        from PySide6.QtWidgets import QFileDialog

        path, _ = QFileDialog.getSaveFileName(
            self,
            "Export inventory to CSV",
            str(Path.home() / "inventory.csv"),
            "CSV files (*.csv);;All files (*)",
        )
        if not path:
            return
        try:
            with open(path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(
                    f,
                    fieldnames=[
                        "artist",
                        "title",
                        "label",
                        "beatport_url",
                        "track_id",
                        "updated_at",
                    ],
                    extrasaction="ignore",
                )
                w.writeheader()
                for row in self._rows:
                    w.writerow({k: (v or "") for k, v in row.items()})
            QMessageBox.information(
                self, "Export", f"Exported {len(self._rows)} rows to {path}"
            )
        except Exception as e:
            QMessageBox.warning(self, "Export failed", str(e))
