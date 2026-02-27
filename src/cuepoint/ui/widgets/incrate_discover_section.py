"""inCrate Discover section: genre / artists / labels checkboxes, Discover button, progress bar (Phase 5)."""

from datetime import date, timedelta
from typing import List, Optional

from PySide6.QtCore import QDate, Qt, Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QDateEdit,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

# Simple layout: clear spacing and borders, no overlap
SECTION_SPACING = 20
GROUP_CONTENT_MARGIN = 16
GROUP_SPACING = 12
# List area: one fixed height so more candidates visible; content scrolls inside
LIST_VIEWPORT_HEIGHT = 380
SCROLL_MIN_WIDTH = 420
SPACING_BETWEEN_SECTIONS = 20
CHECKBOX_ROW_HEIGHT = 28
# Clear border around each list box
LIST_BOX_STYLE = """
    QScrollArea {
        background-color: palette(base);
        border: 1px solid palette(mid);
        border-radius: 6px;
    }
"""


def _clear_layout(layout: QVBoxLayout) -> None:
    """Remove and delete all widgets from a vertical layout."""
    while layout.count():
        item = layout.takeAt(0)
        if item.widget():
            item.widget().deleteLater()


class IncrateDiscoverSection(QWidget):
    """Discover section: genre, artists, labels (checkboxes); Discover button; progress bar."""

    discovery_done = Signal(list)  # List[DiscoveredTrack]
    discovery_progress = Signal(str)

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._genres: List[dict] = []  # [{"id": int, "name": str}, ...]
        self._artists: List[str] = []
        self._labels: List[str] = []
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setSpacing(SECTION_SPACING)
        layout.setContentsMargins(0, 0, 0, 0)

        group = QGroupBox("Discover")
        group.setStyleSheet(
            "QGroupBox { font-weight: 600; font-size: 13px; border: 1px solid palette(mid); border-radius: 8px; margin-top: 10px; padding-top: 4px; } "
            "QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 6px; }"
        )
        group_layout = QVBoxLayout(group)
        group_layout.setSpacing(GROUP_SPACING)
        group_layout.setContentsMargins(GROUP_CONTENT_MARGIN, GROUP_CONTENT_MARGIN + 8, GROUP_CONTENT_MARGIN, GROUP_CONTENT_MARGIN)

        # Period: charts date range + new releases days
        period_row = QHBoxLayout()
        period_row.addWidget(QLabel("Charts from"))
        self.charts_from = QDateEdit()
        self.charts_from.setCalendarPopup(True)
        self.charts_from.setDisplayFormat("yyyy-MM-dd")
        today = date.today()
        from_default = today - timedelta(days=31)
        self.charts_from.setDate(QDate(from_default.year, from_default.month, from_default.day))
        period_row.addWidget(self.charts_from)
        period_row.addWidget(QLabel("to"))
        self.charts_to = QDateEdit()
        self.charts_to.setCalendarPopup(True)
        self.charts_to.setDisplayFormat("yyyy-MM-dd")
        self.charts_to.setDate(QDate(today.year, today.month, today.day))
        period_row.addWidget(self.charts_to)
        period_row.addSpacing(16)
        period_row.addWidget(QLabel("New releases: last"))
        self.new_releases_days = QSpinBox()
        self.new_releases_days.setRange(1, 365)
        self.new_releases_days.setValue(30)
        self.new_releases_days.setSuffix(" days")
        period_row.addWidget(self.new_releases_days)
        period_row.addStretch()
        group_layout.addLayout(period_row)

        # ---- Genres ----
        genre_box = QGroupBox("Genres")
        genre_box.setStyleSheet("QGroupBox { font-weight: 500; font-size: 12px; border: 1px solid palette(mid); border-radius: 6px; margin-top: 8px; padding-top: 2px; } QGroupBox::title { subcontrol-origin: margin; left: 8px; padding: 0 4px; }")
        genre_box_layout = QVBoxLayout(genre_box)
        genre_box_layout.setContentsMargins(12, 16, 12, 12)
        genre_box_layout.setSpacing(10)
        self.genre_search = QLineEdit()
        self.genre_search.setPlaceholderText("Search genres...")
        self.genre_search.setClearButtonEnabled(True)
        self.genre_search.setMinimumHeight(28)
        self.genre_search.textChanged.connect(self._apply_genre_filter)
        genre_box_layout.addWidget(self.genre_search)
        genre_scroll = QScrollArea()
        genre_scroll.setWidgetResizable(True)
        genre_scroll.setFrameShape(QFrame.Shape.NoFrame)
        genre_scroll.setStyleSheet(LIST_BOX_STYLE)
        genre_scroll.setMinimumHeight(LIST_VIEWPORT_HEIGHT)
        genre_scroll.setMinimumWidth(SCROLL_MIN_WIDTH)
        genre_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        genre_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.genre_inner = QWidget()
        self.genre_layout = QVBoxLayout(self.genre_inner)
        self.genre_layout.setContentsMargins(10, 10, 10, 10)
        self.genre_layout.setSpacing(4)
        genre_scroll.setWidget(self.genre_inner)
        genre_box_layout.addWidget(genre_scroll)
        group_layout.addWidget(genre_box)

        group_layout.addSpacing(SPACING_BETWEEN_SECTIONS)

        # ---- Artists ----
        artist_box = QGroupBox("Artists (empty = all)")
        artist_box.setStyleSheet("QGroupBox { font-weight: 500; font-size: 12px; border: 1px solid palette(mid); border-radius: 6px; margin-top: 8px; padding-top: 2px; } QGroupBox::title { subcontrol-origin: margin; left: 8px; padding: 0 4px; }")
        artist_box_layout = QVBoxLayout(artist_box)
        artist_box_layout.setContentsMargins(12, 16, 12, 12)
        artist_box_layout.setSpacing(10)
        self.artist_search = QLineEdit()
        self.artist_search.setPlaceholderText("Search artists...")
        self.artist_search.setClearButtonEnabled(True)
        self.artist_search.setMinimumHeight(28)
        self.artist_search.textChanged.connect(self._apply_artist_filter)
        artist_box_layout.addWidget(self.artist_search)
        artist_scroll = QScrollArea()
        artist_scroll.setWidgetResizable(True)
        artist_scroll.setFrameShape(QFrame.Shape.NoFrame)
        artist_scroll.setStyleSheet(LIST_BOX_STYLE)
        artist_scroll.setMinimumHeight(LIST_VIEWPORT_HEIGHT)
        artist_scroll.setMinimumWidth(SCROLL_MIN_WIDTH)
        artist_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        artist_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.artist_inner = QWidget()
        self.artist_layout = QVBoxLayout(self.artist_inner)
        self.artist_layout.setContentsMargins(10, 10, 10, 10)
        self.artist_layout.setSpacing(4)
        artist_scroll.setWidget(self.artist_inner)
        artist_box_layout.addWidget(artist_scroll)
        group_layout.addWidget(artist_box)

        group_layout.addSpacing(SPACING_BETWEEN_SECTIONS)

        # ---- Labels ----
        label_box = QGroupBox("Labels (empty = all)")
        label_box.setStyleSheet("QGroupBox { font-weight: 500; font-size: 12px; border: 1px solid palette(mid); border-radius: 6px; margin-top: 8px; padding-top: 2px; } QGroupBox::title { subcontrol-origin: margin; left: 8px; padding: 0 4px; }")
        label_box_layout = QVBoxLayout(label_box)
        label_box_layout.setContentsMargins(12, 16, 12, 12)
        label_box_layout.setSpacing(10)
        self.label_search = QLineEdit()
        self.label_search.setPlaceholderText("Search labels...")
        self.label_search.setClearButtonEnabled(True)
        self.label_search.setMinimumHeight(28)
        self.label_search.textChanged.connect(self._apply_label_filter)
        label_box_layout.addWidget(self.label_search)
        label_scroll = QScrollArea()
        label_scroll.setWidgetResizable(True)
        label_scroll.setFrameShape(QFrame.Shape.NoFrame)
        label_scroll.setStyleSheet(LIST_BOX_STYLE)
        label_scroll.setMinimumHeight(LIST_VIEWPORT_HEIGHT)
        label_scroll.setMinimumWidth(SCROLL_MIN_WIDTH)
        label_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        label_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.label_inner = QWidget()
        self.label_layout = QVBoxLayout(self.label_inner)
        self.label_layout.setContentsMargins(10, 10, 10, 10)
        self.label_layout.setSpacing(4)
        label_scroll.setWidget(self.label_inner)
        label_box_layout.addWidget(label_scroll)
        group_layout.addWidget(label_box)

        group_layout.addSpacing(12)

        self.discover_btn = QPushButton("Discover")
        self.discover_btn.setObjectName("incrate_discover")
        self.discover_btn.setMinimumHeight(36)
        group_layout.addWidget(self.discover_btn)
        self.progress_label = QLabel("")
        self.progress_label.setStyleSheet("color: #888; font-size: 12px;")
        self.progress_label.setWordWrap(True)
        group_layout.addWidget(self.progress_label)
        self.progress_bar = QProgressBar()
        self.progress_bar.setMinimum(0)
        self.progress_bar.setMaximum(100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(True)
        self.progress_bar.setVisible(False)
        group_layout.addWidget(self.progress_bar)
        layout.addWidget(group)

    def _apply_genre_filter(self) -> None:
        """Rebuild genre checkboxes by search text; preserve checked state."""
        query = (self.genre_search.text() or "").strip().lower()
        checked_ids = set()
        for i in range(self.genre_layout.count()):
            w = self.genre_layout.itemAt(i).widget()
            if isinstance(w, QCheckBox) and w.isChecked():
                gid = w.property("genre_id")
                if gid is not None:
                    checked_ids.add(int(gid))
        if not checked_ids and getattr(self, "_initial_checked_genre_ids", None) is not None:
            checked_ids = set(self._initial_checked_genre_ids)
        _clear_layout(self.genre_layout)
        for g in self._genres:
            name = (g.get("name") or str(g.get("id", ""))).lower()
            if query and query not in name:
                continue
            cb = QCheckBox(g.get("name", str(g.get("id", ""))))
            cb.setProperty("genre_id", g.get("id"))
            cb.setMinimumHeight(CHECKBOX_ROW_HEIGHT)
            cb.setChecked(g.get("id") in checked_ids)
            self.genre_layout.addWidget(cb)
        self._update_list_inner_height(self.genre_inner, self.genre_layout)

    def _apply_artist_filter(self) -> None:
        """Rebuild artist checkboxes by search text; preserve checked state."""
        query = (self.artist_search.text() or "").strip().lower()
        checked = set()
        for i in range(self.artist_layout.count()):
            w = self.artist_layout.itemAt(i).widget()
            if isinstance(w, QCheckBox) and w.isChecked():
                n = w.property("artist_name")
                if n is not None:
                    checked.add(str(n).strip())
        if not checked and getattr(self, "_initial_checked_artist_names", None) is not None:
            checked = set(self._initial_checked_artist_names)
        _clear_layout(self.artist_layout)
        if not self._artists:
            placeholder = QLabel("Import a Rekordbox XML to see artists from your library.")
            placeholder.setStyleSheet("color: palette(mid); font-style: italic; padding: 8px;")
            placeholder.setWordWrap(True)
            self.artist_layout.addWidget(placeholder)
            self._update_list_inner_height(self.artist_inner, self.artist_layout)
        else:
            for name in sorted(self._artists, key=lambda s: (s or "").lower()):
                if query and query not in (name or "").lower():
                    continue
                cb = QCheckBox(name or "")
                cb.setProperty("artist_name", name)
                cb.setMinimumHeight(CHECKBOX_ROW_HEIGHT)
                cb.setChecked((name or "").strip() in checked)
                self.artist_layout.addWidget(cb)
        self._update_list_inner_height(self.artist_inner, self.artist_layout)

    def _apply_label_filter(self) -> None:
        """Rebuild label checkboxes by search text; preserve checked state."""
        query = (self.label_search.text() or "").strip().lower()
        checked = set()
        for i in range(self.label_layout.count()):
            w = self.label_layout.itemAt(i).widget()
            if isinstance(w, QCheckBox) and w.isChecked():
                n = w.property("label_name")
                if n is not None:
                    checked.add(str(n).strip())
        if not checked and getattr(self, "_initial_checked_label_names", None) is not None:
            checked = set(self._initial_checked_label_names)
        _clear_layout(self.label_layout)
        if not self._labels:
            placeholder = QLabel("Import a Rekordbox XML to see labels from your library.")
            placeholder.setStyleSheet("color: palette(mid); font-style: italic; padding: 8px;")
            placeholder.setWordWrap(True)
            self.label_layout.addWidget(placeholder)
            self._update_list_inner_height(self.label_inner, self.label_layout)
        else:
            for name in sorted(self._labels, key=lambda s: (s or "").lower()):
                if query and query not in (name or "").lower():
                    continue
                cb = QCheckBox(name or "")
                cb.setProperty("label_name", name)
                cb.setMinimumHeight(CHECKBOX_ROW_HEIGHT)
                cb.setChecked((name or "").strip() in checked)
                self.label_layout.addWidget(cb)
        self._update_list_inner_height(self.label_inner, self.label_layout)

    def _update_list_inner_height(self, inner: QWidget, layout: QVBoxLayout) -> None:
        """Set inner widget height to content so rows are not squashed or clipped in the scroll area."""
        count = layout.count()
        # Compute height so scroll area gives enough space; sizeHint() can be 0 before layout runs
        if count == 0:
            h = 60
        else:
            margins = 20
            h = layout.sizeHint().height()
            if h < 50 and count > 0:
                h = margins + count * (CHECKBOX_ROW_HEIGHT + 4) - 4
        h = max(1, h)
        inner.setMinimumHeight(h)
        inner.setMaximumHeight(h)
        inner.setMinimumWidth(SCROLL_MIN_WIDTH - 30)
        inner.updateGeometry()

    def set_genres(self, genres: List[dict], selected_ids: Optional[List[int]] = None) -> None:
        """Set genre list; each item is dict with id and name. Optionally restore checked state from selected_ids."""
        self._genres = list(genres)
        if selected_ids is not None:
            self._initial_checked_genre_ids = list(selected_ids)
        self._apply_genre_filter()

    def set_artists(self, names: List[str], selected_names: Optional[List[str]] = None) -> None:
        """Set artist list from library (display names). Optionally restore checked state from selected_names."""
        self._artists = sorted(names or [], key=lambda s: (s or "").lower())
        if selected_names is not None:
            self._initial_checked_artist_names = [str(n).strip() for n in selected_names if n and str(n).strip()]
        self._apply_artist_filter()

    def set_labels(self, names: List[str], selected_names: Optional[List[str]] = None) -> None:
        """Set label list from library (display names). Optionally restore checked state from selected_names."""
        self._labels = sorted(names or [], key=lambda s: (s or "").lower())
        if selected_names is not None:
            self._initial_checked_label_names = [str(n).strip() for n in selected_names if n and str(n).strip()]
        self._apply_label_filter()

    def set_period(self, from_date: date, to_date: date, new_releases_days: int) -> None:
        """Set charts date range and new releases days (e.g. when restoring saved selection)."""
        self.charts_from.setDate(QDate(from_date.year, from_date.month, from_date.day))
        self.charts_to.setDate(QDate(to_date.year, to_date.month, to_date.day))
        self.new_releases_days.setValue(max(1, min(365, new_releases_days)))

    def get_selected_genre_ids(self) -> List[int]:
        ids: List[int] = []
        for i in range(self.genre_layout.count()):
            w = self.genre_layout.itemAt(i).widget()
            if isinstance(w, QCheckBox) and w.isChecked():
                gid = w.property("genre_id")
                if gid is not None:
                    try:
                        ids.append(int(gid))
                    except (TypeError, ValueError):
                        pass
        return ids

    def get_selected_artist_names(self) -> List[str]:
        names: List[str] = []
        for i in range(self.artist_layout.count()):
            w = self.artist_layout.itemAt(i).widget()
            if isinstance(w, QCheckBox) and w.isChecked():
                n = w.property("artist_name")
                if n is not None and str(n).strip():
                    names.append(str(n).strip())
        return names

    def get_selected_label_names(self) -> List[str]:
        names: List[str] = []
        for i in range(self.label_layout.count()):
            w = self.label_layout.itemAt(i).widget()
            if isinstance(w, QCheckBox) and w.isChecked():
                n = w.property("label_name")
                if n is not None and str(n).strip():
                    names.append(str(n).strip())
        return names

    def get_charts_from_date(self) -> date:
        qd = self.charts_from.date()
        return date(qd.year(), qd.month(), qd.day())

    def get_charts_to_date(self) -> date:
        qd = self.charts_to.date()
        return date(qd.year(), qd.month(), qd.day())

    def get_new_releases_days(self) -> int:
        return self.new_releases_days.value()

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
