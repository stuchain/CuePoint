"""inCrate Discover section: genre multi-select, Discover button, progress bar, logs (Phase 5)."""

from typing import List, Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QGroupBox,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class IncrateDiscoverSection(QWidget):
    """Discover section: genre list (multi-select), Discover button, progress bar, progress text."""

    discovery_done = Signal(list)  # List[DiscoveredTrack]
    discovery_progress = Signal(str)

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._init_ui()
        self._genres: List[dict] = []  # [{"id": int, "name": str}, ...]

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        group = QGroupBox("Discover")
        group_layout = QVBoxLayout(group)
        group_layout.addWidget(
            QLabel("Charts: past month · New releases: last 30 days")
        )
        self.genre_list = QListWidget()
        self.genre_list.setSelectionMode(QListWidget.SelectionMode.MultiSelection)
        self.genre_list.setMinimumHeight(120)
        group_layout.addWidget(QLabel("Genres (multi-select):"))
        group_layout.addWidget(self.genre_list)
        self.discover_btn = QPushButton("Discover")
        self.discover_btn.setObjectName("incrate_discover")
        group_layout.addWidget(self.discover_btn)
        self.progress_label = QLabel("")
        self.progress_label.setStyleSheet("color: #888; font-size: 12px;")
        group_layout.addWidget(self.progress_label)
        self.progress_bar = QProgressBar()
        self.progress_bar.setMinimum(0)
        self.progress_bar.setMaximum(100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(True)
        self.progress_bar.setVisible(False)
        group_layout.addWidget(self.progress_bar)
        layout.addWidget(group)

    def set_genres(self, genres: List[dict]) -> None:
        """Set genre list; each item is dict with id and name."""
        self._genres = list(genres)
        self.genre_list.clear()
        for g in self._genres:
            item = QListWidgetItem(g.get("name", str(g.get("id", ""))))
            item.setData(Qt.ItemDataRole.UserRole, g.get("id"))
            self.genre_list.addItem(item)

    def get_selected_genre_ids(self) -> List[int]:
        ids: List[int] = []
        for item in self.genre_list.selectedItems():
            val = item.data(Qt.ItemDataRole.UserRole)
            if val is not None:
                try:
                    ids.append(int(val))
                except (TypeError, ValueError):
                    pass
        return ids

    def set_discovering(self, discovering: bool) -> None:
        self.discover_btn.setEnabled(not discovering)

    def set_progress(self, text: str) -> None:
        self.progress_label.setText(text)

    def show_progress_bar(self, visible: bool = True) -> None:
        self.progress_bar.setVisible(visible)
        if visible:
            self.progress_bar.setMaximum(0)
            self.progress_bar.setValue(0)

    def set_progress_bar_range(self, current: int, total: int) -> None:
        """Set determinate progress (e.g. Charts 2/5). total <= 0 = indeterminate."""
        if total <= 0:
            self.progress_bar.setMaximum(0)
            self.progress_bar.setValue(0)
            return
        self.progress_bar.setVisible(True)
        self.progress_bar.setMaximum(total)
        self.progress_bar.setValue(min(current, total))
        self.progress_bar.setFormat("%v / %m")

    def hide_progress_bar(self) -> None:
        self.progress_bar.setVisible(False)

    def set_discover_enabled(self, enabled: bool) -> None:
        self.discover_btn.setEnabled(enabled)
