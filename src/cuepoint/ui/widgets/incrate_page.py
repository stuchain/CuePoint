"""inCrate main page: Import, Discover, Results, Playlist sections (Phase 5)."""

import logging
from datetime import date, timedelta
from typing import Any, List, Optional

from PySide6.QtCore import QObject, QThread, Signal
from PySide6.QtWidgets import (
    QMessageBox,
    QPushButton,
    QScrollArea,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.incrate.playlist_name import default_playlist_name
from cuepoint.incrate.playlist_writer import create_playlist_and_add_tracks
from cuepoint.ui.widgets.incrate_discover_section import IncrateDiscoverSection
from cuepoint.ui.widgets.incrate_import_section import IncrateImportSection
from cuepoint.ui.widgets.incrate_inventory_section import IncrateInventorySection
from cuepoint.ui.widgets.incrate_playlist_section import IncratePlaylistSection
from cuepoint.ui.widgets.incrate_results_section import IncrateResultsSection

_logger = logging.getLogger(__name__)


class ImportThread(QThread):
    """Thread that runs import_from_xml. Overriding run() ensures work runs when thread starts."""

    finished_result = Signal(dict)
    progress = Signal(str)
    progress_range = Signal(int, int)  # current, total (0,0 = indeterminate)
    error = Signal(str)

    def __init__(self, inventory_service: Any, xml_path: str, enrich: bool = True, parent: Optional[QObject] = None):
        super().__init__(parent)
        self._inventory = inventory_service
        self._path = xml_path
        self._enrich = enrich

    def run(self) -> None:
        """Runs in worker thread; guaranteed to execute when thread starts."""
        try:
            _logger.info("inCrate import: thread run() started, emitting initial Parsing XML...")
            self.progress.emit("Parsing XML...")
            self.progress_range.emit(0, 0)

            def progress_cb(current: int, total: int) -> None:
                if total == -1:
                    msg = f"Parsing XML... ({current} tracks)"
                    _logger.info("inCrate import: progress_cb(total=-1) -> %s", msg)
                    self.progress.emit(msg)
                    self.progress_range.emit(0, 0)
                    return
                if current == -1:
                    msg = f"Importing {total} tracks to database..."
                    _logger.info("inCrate import: progress_cb(import phase) -> %s", msg)
                    self.progress.emit(msg)
                    self.progress_range.emit(0, 0)
                    return
                if total == 0:
                    msg = "No tracks to enrich."
                    _logger.info("inCrate import: progress_cb -> %s", msg)
                    self.progress.emit(msg)
                    self.progress_range.emit(0, 0)
                    return
                msg = f"Enriching {current}/{total}..."
                if current == 0 or current == 1 or current % 50 == 0 or current == total:
                    _logger.info("inCrate import: progress_cb(enrich) -> %s", msg)
                self.progress.emit(msg)
                self.progress_range.emit(current, total)

            result = self._inventory.import_from_xml(
                self._path,
                enrich=self._enrich,
                progress_callback=progress_cb,
            )
            self.finished_result.emit(result)
        except Exception as e:
            _logger.exception("inCrate import: thread run() failed")
            self.error.emit(str(e))


class DiscoveryThread(QThread):
    """Thread that runs run_discovery. Overriding run() ensures work runs when thread starts."""

    finished_result = Signal(list)
    progress = Signal(str)
    progress_range = Signal(int, int)  # current, total (0,0 = indeterminate)
    error = Signal(str)

    def __init__(
        self,
        discovery_service: Any,
        genre_ids: List[int],
        from_date: date,
        to_date: date,
        new_releases_days: int = 30,
        parent: Optional[QObject] = None,
    ):
        super().__init__(parent)
        self._service = discovery_service
        self._genre_ids = genre_ids
        self._from_date = from_date
        self._to_date = to_date
        self._days = new_releases_days

    def run(self) -> None:
        try:
            _logger.info(
                "inCrate discovery: thread run() started — genres=%s, from=%s, to=%s, days=%s",
                len(self._genre_ids),
                self._from_date,
                self._to_date,
                self._days,
            )
            self.progress.emit("Discovering...")
            self.progress_range.emit(0, 0)

            def progress_cb(stage: str, current: int, total: int) -> None:
                if stage == "charts":
                    msg = f"Charts: {current}/{total} genres" if total > 0 else "Charts..."
                elif stage == "resolving":
                    msg = f"Resolving labels: {current}/{total}" if total > 0 else "Resolving labels..."
                elif stage == "releases":
                    msg = f"New releases: {current}/{total} labels" if total > 0 else "New releases..."
                else:
                    msg = f"{stage}: {current}/{total}"
                _logger.info("inCrate discovery: progress_cb -> %s", msg)
                self.progress.emit(msg)
                self.progress_range.emit(current, total)

            result = self._service.run_discovery(
                genre_ids=self._genre_ids,
                charts_from_date=self._from_date,
                charts_to_date=self._to_date,
                new_releases_days=self._days,
                progress_callback=progress_cb,
            )
            _logger.info("inCrate discovery: finished — %s tracks", len(result) if result else 0)
            self.finished_result.emit(result)
        except Exception as e:
            _logger.exception("inCrate discovery: thread run() failed")
            self.error.emit(str(e))


class IncratePage(QWidget):
    """Main inCrate widget: Import, Discover, Results, Playlist."""

    back_to_tools_requested = Signal()

    def __init__(
        self,
        inventory_service: Any,
        beatport_api: Any,
        discovery_service: Any,
        config_service: Optional[Any] = None,
        parent: Optional[QWidget] = None,
    ):
        super().__init__(parent)
        self._inventory = inventory_service
        self._beatport_api = beatport_api
        self._discovery = discovery_service
        self._config = config_service
        self._discovered_tracks: List[DiscoveredTrack] = []
        self._import_thread: Optional[QThread] = None
        self._discovery_thread: Optional[QThread] = None
        self._init_ui()
        self._refresh_stats()
        self._load_genres()
        self._set_playlist_name_default()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        back_btn = QPushButton("← Back to tools")
        back_btn.clicked.connect(self.back_to_tools_requested.emit)
        layout.addWidget(back_btn)

        self.tabs = QTabWidget()
        # Workflow tab: Import, Discover, Results, Playlist
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(scroll.Shape.NoFrame)
        scroll_content = QWidget()
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setSpacing(16)

        self.import_section = IncrateImportSection(self)
        self.import_section.import_done.connect(self._on_import_done)
        self.import_section.import_progress.connect(self._on_import_progress)
        self.import_section.import_btn.clicked.connect(self._on_import_clicked)
        self.import_section.reset_requested.connect(self._on_reset_db_requested)
        scroll_layout.addWidget(self.import_section)

        self.discover_section = IncrateDiscoverSection(self)
        self.discover_section.discovery_done.connect(self._on_discovery_finished)
        self.discover_section.discovery_progress.connect(self._on_discovery_progress)
        self.discover_section.discover_btn.clicked.connect(self._on_discover_clicked)
        scroll_layout.addWidget(self.discover_section)

        self.results_section = IncrateResultsSection(self)
        scroll_layout.addWidget(self.results_section)

        self.playlist_section = IncratePlaylistSection(self)
        self.playlist_section.add_clicked.connect(self._on_add_to_playlist)
        scroll_layout.addWidget(self.playlist_section)

        scroll_layout.addStretch()
        scroll.setWidget(scroll_content)
        self.tabs.addTab(scroll, "Workflow")

        # Inventory tab: database viewer
        self.inventory_section = IncrateInventorySection(self)
        self.inventory_section.set_db_path(self._inventory.db_path)
        self.inventory_section.refresh_requested.connect(self._on_inventory_refresh)
        self.tabs.addTab(self.inventory_section, "Inventory")
        self.tabs.currentChanged.connect(self._on_tab_changed)

        layout.addWidget(self.tabs)

    def _set_playlist_name_default(self) -> None:
        fmt = "short"
        if self._config:
            try:
                fmt = str(self._config.get("incrate.playlist_name_format") or "short")
            except (TypeError, AttributeError):
                pass
        name = default_playlist_name(format=fmt or "short")
        self.playlist_section.set_default_name(name)

    def _on_reset_db_requested(self) -> None:
        """User confirmed reset: clear inventory DB and refresh stats."""
        self._inventory.reset_database()
        self._refresh_stats()
        self.import_section.set_progress("Inventory cleared. Import a collection.xml when ready.")
        self._load_inventory_tab()

    def _on_tab_changed(self, index: int) -> None:
        """When switching to Inventory tab, load table if needed."""
        if index == 1:
            self._load_inventory_tab()

    def _on_inventory_refresh(self) -> None:
        self._load_inventory_tab()

    def _load_inventory_tab(self) -> None:
        """Load inventory rows into the Inventory tab table."""
        try:
            search = self.inventory_section.get_search_text()
            rows = self._inventory.list_inventory(limit=5000, search=search or None)
            self.inventory_section.set_rows(rows)
        except Exception as e:
            _logger.warning("inCrate: could not load inventory for tab: %s", e)

    def _refresh_stats(self) -> None:
        try:
            stats = self._inventory.get_inventory_stats()
            total = stats.get("total", 0)
            artists = len(self._inventory.get_library_artists())
            labels = len(self._inventory.get_library_labels())
            self.import_section.set_stats(total, artists, labels)
            token = ""
            if self._config:
                try:
                    token = (self._config.get("incrate.beatport_access_token") or "").strip()
                except (TypeError, AttributeError):
                    pass
            if total == 0:
                self.discover_section.set_discover_enabled(False)
                self.discover_section.set_progress("Import Rekordbox XML first.")
            elif not token:
                self.discover_section.set_discover_enabled(False)
                self.discover_section.set_progress("Configure Beatport API token in Settings.")
            else:
                self.discover_section.set_discover_enabled(True)
                self.discover_section.set_progress("")
        except Exception:
            self.import_section.set_stats(0, 0, 0)
            self.discover_section.set_discover_enabled(False)

    def _load_genres(self) -> None:
        try:
            genres = self._beatport_api.list_genres()
            self.discover_section.set_genres(
                [{"id": g.id, "name": g.name} for g in genres]
            )
        except Exception:
            self.discover_section.set_genres([])

    def _on_import_clicked(self) -> None:
        path = self.import_section.get_xml_path()
        if not path:
            self.import_section.show_error("Select XML file first.")
            return
        _logger.info("inCrate import: user clicked Import for %s", path)
        self.import_section.set_importing(True)
        self.import_section.set_progress("Parsing XML...")
        self.import_section.show_progress_bar(True)
        thread = ImportThread(self._inventory, path, enrich=True, parent=self)
        thread.progress.connect(self._on_import_progress)
        thread.progress_range.connect(self._on_import_progress_range)
        thread.finished_result.connect(self._on_import_finished)
        thread.error.connect(self._on_import_error)
        self._import_thread = thread
        _logger.info("inCrate import: starting ImportThread")
        thread.start()

    def _on_import_progress(self, text: str) -> None:
        self.import_section.set_progress(text)

    def _on_import_progress_range(self, current: int, total: int) -> None:
        if total <= 0:
            self.import_section.progress_bar.setMaximum(0)
            self.import_section.progress_bar.setValue(0)
        else:
            self.import_section.set_progress_bar_range(current, total)

    def _on_import_finished(self, result: dict) -> None:
        _logger.info(
            "inCrate import: finished — imported=%s, enriched=%s, errors=%s",
            result.get("imported"),
            result.get("enriched"),
            result.get("errors"),
        )
        if self._import_thread and self._import_thread.isRunning():
            self._import_thread.quit()
            self._import_thread.wait(5000)
        self._import_thread = None
        self.import_section.set_importing(False)
        self.import_section.set_progress("")
        self.import_section.hide_progress_bar()
        self._refresh_stats()
        self.import_section.import_done.emit(result)

    def _on_import_done(self, result: dict) -> None:
        errors = result.get("errors", [])
        if errors:
            self.import_section.show_error(errors[0] if errors else "Import failed.")
        else:
            self._refresh_stats()

    def _on_import_error(self, message: str) -> None:
        _logger.warning("inCrate import: error — %s", message or "Import failed.")
        if self._import_thread and self._import_thread.isRunning():
            self._import_thread.quit()
            self._import_thread.wait(5000)
        self._import_thread = None
        self.import_section.set_importing(False)
        self.import_section.set_progress("")
        self.import_section.hide_progress_bar()
        self.import_section.show_error(message or "Import failed.")

    def _on_discover_clicked(self) -> None:
        genre_ids = self.discover_section.get_selected_genre_ids()
        to_date = date.today()
        from_date = to_date - timedelta(days=31)
        _logger.info(
            "inCrate discovery: user clicked Discover — genres=%s, from=%s, to=%s",
            len(genre_ids),
            from_date,
            to_date,
        )
        self.discover_section.set_discovering(True)
        self.discover_section.set_progress("Discovering...")
        self.discover_section.show_progress_bar(True)
        thread = DiscoveryThread(
            self._discovery,
            genre_ids,
            from_date,
            to_date,
            new_releases_days=30,
            parent=self,
        )
        thread.progress.connect(self._on_discovery_progress)
        thread.progress_range.connect(self._on_discovery_progress_range)
        thread.finished_result.connect(self._on_discovery_finished)
        thread.error.connect(self._on_discovery_error)
        self._discovery_thread = thread
        _logger.info("inCrate discovery: starting DiscoveryThread")
        thread.start()

    def _on_discovery_progress(self, text: str) -> None:
        self.discover_section.set_progress(text)

    def _on_discovery_progress_range(self, current: int, total: int) -> None:
        self.discover_section.set_progress_bar_range(current, total)

    def _on_discovery_finished(self, tracks: list) -> None:
        if self._discovery_thread and self._discovery_thread.isRunning():
            self._discovery_thread.quit()
            self._discovery_thread.wait(5000)
        self._discovery_thread = None
        self.discover_section.set_discovering(False)
        self.discover_section.set_progress("")
        self.discover_section.hide_progress_bar()
        self._discovered_tracks = list(tracks) if tracks else []
        self.results_section.set_tracks(self._discovered_tracks)
        _logger.info(
            "inCrate discovery: finished — %s tracks",
            len(self._discovered_tracks),
        )
        if not self._discovered_tracks:
            self.discover_section.set_progress(
                "No charts or new releases found for this month; try other genres or check inventory."
            )

    def _on_discovery_error(self, message: str) -> None:
        if self._discovery_thread and self._discovery_thread.isRunning():
            self._discovery_thread.quit()
            self._discovery_thread.wait(5000)
        self._discovery_thread = None
        self.discover_section.set_discovering(False)
        self.discover_section.set_progress(message or "Discovery failed.")
        self.discover_section.hide_progress_bar()
        _logger.warning("inCrate discovery: error — %s", message or "Discovery failed.")

    def _on_add_to_playlist(self, name: str) -> None:
        tracks = self.results_section.get_tracks()
        if not tracks:
            self.playlist_section.set_status("No tracks to add. Run Discover first.", is_error=True)
            return
        username = None
        password = None
        if self._config:
            try:
                username = (self._config.get("incrate.beatport_username") or "").strip() or None
                password = (self._config.get("incrate.beatport_password") or "").strip() or None
            except (TypeError, AttributeError):
                pass
        self.playlist_section.set_adding(True)
        result = create_playlist_and_add_tracks(
            name,
            list(tracks),
            api_client=self._beatport_api,
            browser_add_to_playlist=None,
            beatport_username=username,
            beatport_password=password,
        )
        self.playlist_section.set_adding(False)
        if result.success:
            self.playlist_section.set_status(
                f"Added {result.added_count} tracks to playlist."
                + (f" {result.playlist_url}" if result.playlist_url else "")
            )
        else:
            self.playlist_section.set_status(result.error or "Add to playlist failed.", is_error=True)
