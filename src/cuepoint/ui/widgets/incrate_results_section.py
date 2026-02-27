"""inCrate Results section: table of DiscoveredTrack, export CSV (Phase 5)."""

import csv
from pathlib import Path
from typing import List, Optional

from PySide6.QtCore import Qt
from PySide6.QtGui import QBrush, QColor, QDesktopServices
from PySide6.QtWidgets import (
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)


class IncrateResultsSection(QWidget):
    """Results section: table with Title, Artists, Source; Export CSV."""

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._tracks: List[object] = []
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        group = QGroupBox("Results")
        group_layout = QVBoxLayout(group)
        row = QHBoxLayout()
        self.count_label = QLabel("0 tracks")
        self.count_label.setStyleSheet("color: #666; font-size: 12px;")
        row.addWidget(self.count_label)
        self.export_btn = QPushButton("Export CSV")
        self.export_btn.setToolTip("Save discovered tracks to a CSV file")
        self.export_btn.clicked.connect(self._on_export_csv)
        row.addWidget(self.export_btn)
        row.addStretch()
        group_layout.addLayout(row)
        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Title", "Artists", "Source"])
        self.table.horizontalHeader().setSectionResizeMode(
            QHeaderView.ResizeMode.Stretch
        )
        self.table.setMinimumHeight(320)
        self.table.setMinimumWidth(400)
        self.table.cellClicked.connect(self._on_cell_clicked)
        group_layout.addWidget(self.table)
        layout.addWidget(group)

    def _format_source_text(self, t: object) -> str:
        """Format Source column: 'Label | Album' for label_release, chart name for chart."""
        source_type = getattr(t, "source_type", "")
        source_name = getattr(t, "source_name", "") or ""
        if source_type == "label_release":
            label_name = getattr(t, "source_label_name", "") or ""
            if label_name and source_name:
                return f"{label_name} | {source_name}"
            if label_name:
                return label_name
        return source_name or source_type or ""

    def _on_cell_clicked(self, row: int, column: int) -> None:
        """Open link when Source column (column 2) is clicked."""
        if column != 2 or row < 0 or row >= len(self._tracks):
            return
        item = self.table.item(row, column)
        if item is None:
            return
        url = item.data(Qt.ItemDataRole.UserRole)
        if url and isinstance(url, str) and url.startswith("http"):
            QDesktopServices.openUrl(url)

    def _on_export_csv(self) -> None:
        if not self._tracks:
            QMessageBox.information(self, "Export", "No tracks to export. Run Discover first.")
            return
        path, _ = QFileDialog.getSaveFileName(
            self,
            "Export results to CSV",
            str(Path.home() / "discovered_tracks.csv"),
            "CSV files (*.csv);;All files (*)",
        )
        if not path:
            return
        try:
            with open(path, "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(["Title", "Artists", "Source"])
                for t in self._tracks:
                    title = getattr(t, "title", str(t))
                    artists = getattr(t, "artists", "")
                    src = self._format_source_text(t) or f"{getattr(t, 'source_type', '')} {getattr(t, 'source_name', '')}".strip()
                    w.writerow([title, artists, src])
            QMessageBox.information(self, "Export", f"Exported {len(self._tracks)} tracks to {path}")
        except Exception as e:
            QMessageBox.warning(self, "Export failed", str(e))

    def set_tracks(self, tracks: List[object]) -> None:
        """Set rows from list of DiscoveredTrack-like objects (title, artists, source_type, source_name, etc.)."""
        self._tracks = list(tracks)
        self.table.setRowCount(len(self._tracks))
        for row, t in enumerate(self._tracks):
            title = getattr(t, "title", str(t))
            artists = getattr(t, "artists", "")
            src_text = self._format_source_text(t) or f"{getattr(t, 'source_type', '')} {getattr(t, 'source_name', '')}".strip()
            url = getattr(t, "source_url", None) or getattr(t, "beatport_url", None) or ""
            self.table.setItem(row, 0, QTableWidgetItem(title))
            self.table.setItem(row, 1, QTableWidgetItem(artists))
            src_item = QTableWidgetItem(src_text)
            if url:
                src_item.setData(Qt.ItemDataRole.UserRole, url)
                src_item.setToolTip("Click to open in browser")
                src_item.setForeground(QBrush(QColor("#1976d2")))
            self.table.setItem(row, 2, src_item)
        self.count_label.setText(f"{len(self._tracks)} tracks")

    def get_tracks(self) -> List[object]:
        return list(self._tracks)
