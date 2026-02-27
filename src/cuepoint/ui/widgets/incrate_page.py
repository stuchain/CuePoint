"""inCrate main page: Import, Discover, Results, Playlist sections (Phase 5)."""

import logging
from datetime import date, datetime, timedelta
from typing import Any, Callable, List, Optional

from PySide6.QtCore import QObject, Qt, QThread, Signal
from PySide6.QtWidgets import (
    QDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.incrate.past_results_storage import (
    load_past_results,
    save_past_result,
    PastDiscoveryRun,
)
from cuepoint.incrate.beatport_oauth import (
    get_oauth_client_credentials,
    token_via_password,
)
from cuepoint.incrate.beatport_playlist_browser import add_to_playlist_via_browser
from cuepoint.incrate.playlist_name import default_playlist_name
from cuepoint.incrate.playlist_writer import PlaylistResult, create_playlist_and_add_tracks
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient
from cuepoint.ui.dialogs.beatport_playlist_signin_dialog import BeatportPlaylistSignInDialog
from cuepoint.ui.widgets.incrate_discover_section import IncrateDiscoverSection
from cuepoint.ui.widgets.incrate_import_section import IncrateImportSection
from cuepoint.ui.widgets.incrate_inventory_section import IncrateInventorySection
from cuepoint.ui.widgets.incrate_playlist_section import IncratePlaylistSection
from cuepoint.ui.widgets.incrate_results_section import IncrateResultsSection

_logger = logging.getLogger(__name__)


def _browser_add_to_playlist(
    name: str,
    tracks: list,
    username: str,
    password: str,
) -> PlaylistResult:
    """Playwright browser fallback: sign in and add tracks to a new playlist (visible browser window)."""
    return add_to_playlist_via_browser(name, tracks, username, password, headless=False)


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
        library_artist_names: Optional[List[str]] = None,
        library_label_names: Optional[List[str]] = None,
        parent: Optional[QObject] = None,
    ):
        super().__init__(parent)
        self._service = discovery_service
        self._genre_ids = genre_ids
        self._from_date = from_date
        self._to_date = to_date
        self._days = new_releases_days
        self._artist_names = library_artist_names
        self._label_names = library_label_names

    def run(self) -> None:
        try:
            _logger.info(
                "inCrate discovery: thread run() started — genres=%s, artists=%s, labels=%s, from=%s, to=%s, days=%s",
                len(self._genre_ids),
                len(self._artist_names) if self._artist_names else "all",
                len(self._label_names) if self._label_names else "all",
                self._from_date,
                self._to_date,
                self._days,
            )
            _logger.info(
                "inCrate discovery: thread params — genre_ids=%s, artist_names=%s, label_names=%s",
                self._genre_ids,
                self._artist_names or [],
                self._label_names or [],
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
                library_artist_names=self._artist_names,
                library_label_names=self._label_names,
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
        get_beatport_api: Optional[Callable[[], Any]] = None,
        parent: Optional[QWidget] = None,
    ):
        super().__init__(parent)
        self._inventory = inventory_service
        self._beatport_api = beatport_api
        self._get_beatport_api = get_beatport_api  # Optional factory for current token (e.g. after Test token)
        self._discovery = discovery_service
        self._config = config_service
        self._discovered_tracks: List[DiscoveredTrack] = []
        self._last_discovery_genre_ids: List[int] = []
        self._last_discovery_artist_names: List[str] = []
        self._last_discovery_label_names: List[str] = []
        self._past_runs: List[PastDiscoveryRun] = []
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
        # Workflow tab: Import, Discover, Results, Playlist (scrollable)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(scroll.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll_content = QWidget()
        scroll_content.setMinimumHeight(1600)
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setSpacing(20)

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

        # Past results tab: list of saved runs + results table
        past_widget = QWidget()
        past_layout = QVBoxLayout(past_widget)
        past_layout.addWidget(QLabel("Saved discovery runs (most recent first). Select one to view or use in Workflow."))
        self.past_runs_list = QListWidget()
        self.past_runs_list.currentRowChanged.connect(self._on_past_run_selected)
        past_layout.addWidget(self.past_runs_list)
        self.past_use_btn = QPushButton("Use in Workflow")
        self.past_use_btn.setToolTip("Copy this result set to Workflow tab so you can add to playlist")
        self.past_use_btn.clicked.connect(self._on_use_past_in_workflow)
        self.past_use_btn.setEnabled(False)
        past_layout.addWidget(self.past_use_btn)
        self.past_results_section = IncrateResultsSection(self)
        past_layout.addWidget(self.past_results_section)
        self.tabs.addTab(past_widget, "Past results")

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
        """When switching tabs, load tab content if needed."""
        if index == 1:
            self._load_inventory_tab()
        elif index == 2:
            self._load_past_results_tab()

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

    def _load_past_results_tab(self) -> None:
        """Load saved discovery runs into the Past results list."""
        self._past_runs = load_past_results()
        self.past_runs_list.clear()
        for run in self._past_runs:
            try:
                ts = run.timestamp
                if "T" in ts:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    label = dt.strftime("%d %b %Y %H:%M")
                else:
                    label = ts[:16] if len(ts) >= 16 else ts
                item = QListWidgetItem(f"{label} — {len(run.tracks)} tracks")
                item.setData(Qt.ItemDataRole.UserRole, run.run_id)
                self.past_runs_list.addItem(item)
            except Exception:
                item = QListWidgetItem(f"{len(run.tracks)} tracks")
                item.setData(Qt.ItemDataRole.UserRole, run.run_id)
                self.past_runs_list.addItem(item)
        self.past_use_btn.setEnabled(False)
        self.past_results_section.set_tracks([])

    def _on_past_run_selected(self, row: int) -> None:
        """Show selected past run's tracks in the results section."""
        if row < 0 or row >= len(self._past_runs):
            self.past_results_section.set_tracks([])
            self.past_use_btn.setEnabled(False)
            return
        run = self._past_runs[row]
        self.past_results_section.set_tracks(run.tracks)
        self.past_use_btn.setEnabled(True)

    def _on_use_past_in_workflow(self) -> None:
        """Copy selected past result to Workflow tab and switch to it."""
        row = self.past_runs_list.currentRow()
        if row < 0 or row >= len(self._past_runs):
            return
        run = self._past_runs[row]
        self._discovered_tracks = list(run.tracks)
        self.results_section.set_tracks(self._discovered_tracks)
        self.tabs.setCurrentIndex(0)

    def _refresh_stats(self) -> None:
        try:
            stats = self._inventory.get_inventory_stats()
            total = stats.get("total", 0)
            library_artists = self._inventory.get_library_artists()
            library_labels = self._inventory.get_library_labels()
            artists = len(library_artists)
            labels = len(library_labels)
            self.import_section.set_stats(total, artists, labels)
            saved_artists = self._get_saved_discover_artist_names()
            saved_labels = self._get_saved_discover_label_names()
            self.discover_section.set_artists(library_artists, selected_names=saved_artists)
            self.discover_section.set_labels(library_labels, selected_names=saved_labels)
            self._load_saved_discover_period()
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

    def _get_saved_discover_genre_ids(self) -> List[int]:
        if not self._config:
            return []
        raw = self._config.get("incrate.discover_genre_ids")
        if not isinstance(raw, list):
            return []
        return [int(x) for x in raw if x is not None and str(x).strip() != "" and (isinstance(x, int) or str(x).isdigit())]

    def _get_saved_discover_artist_names(self) -> List[str]:
        if not self._config:
            return []
        raw = self._config.get("incrate.discover_artist_names")
        if not isinstance(raw, list):
            return []
        return [str(x).strip() for x in raw if x is not None and str(x).strip()]

    def _get_saved_discover_label_names(self) -> List[str]:
        if not self._config:
            return []
        raw = self._config.get("incrate.discover_label_names")
        if not isinstance(raw, list):
            return []
        return [str(x).strip() for x in raw if x is not None and str(x).strip()]

    def _load_saved_discover_period(self) -> None:
        if not self._config:
            return
        try:
            from_str = self._config.get("incrate.discover_charts_from")
            to_str = self._config.get("incrate.discover_charts_to")
            days = self._config.get("incrate.discover_new_releases_days")
            if from_str and to_str:
                from_date = date.fromisoformat(str(from_str).strip())
                to_date = date.fromisoformat(str(to_str).strip())
                d = 30
                if days is not None:
                    try:
                        d = max(1, min(365, int(days)))
                    except (TypeError, ValueError):
                        pass
                self.discover_section.set_period(from_date, to_date, d)
            elif days is not None:
                try:
                    d = max(1, min(365, int(days)))
                    to_date = date.today()
                    from_date = to_date - timedelta(days=d)
                    self.discover_section.set_period(from_date, to_date, d)
                except (TypeError, ValueError):
                    pass
        except (ValueError, TypeError):
            pass

    def _save_discover_selection(
        self,
        genre_ids: List[int],
        artist_names: List[str],
        label_names: List[str],
        from_date: date,
        to_date: date,
        new_releases_days: int,
    ) -> None:
        """Persist Discover selections and period to config so they are restored next time."""
        if not self._config:
            return
        try:
            self._config.set("incrate.discover_genre_ids", genre_ids)
            self._config.set("incrate.discover_artist_names", artist_names)
            self._config.set("incrate.discover_label_names", label_names)
            self._config.set("incrate.discover_charts_from", from_date.isoformat())
            self._config.set("incrate.discover_charts_to", to_date.isoformat())
            self._config.set("incrate.discover_new_releases_days", new_releases_days)
            self._config.save()
        except Exception:
            pass

    def persist_discover_selection(self) -> None:
        """Save current Discover genre/artist/label and period to config (e.g. on app close)."""
        genre_ids = self.discover_section.get_selected_genre_ids()
        artist_names = self.discover_section.get_selected_artist_names()
        label_names = self.discover_section.get_selected_label_names()
        from_date = self.discover_section.get_charts_from_date()
        to_date = self.discover_section.get_charts_to_date()
        new_releases_days = self.discover_section.get_new_releases_days()
        self._save_discover_selection(
            list(genre_ids),
            list(artist_names),
            list(label_names),
            from_date,
            to_date,
            new_releases_days,
        )

    def _load_genres(self) -> None:
        try:
            api = self._get_beatport_api() if self._get_beatport_api else self._beatport_api
            genres = api.list_genres()
            saved_ids = self._get_saved_discover_genre_ids()
            self.discover_section.set_genres(
                [{"id": g.id, "name": g.name} for g in genres],
                selected_ids=saved_ids,
            )
        except Exception:
            self.discover_section.set_genres([])

    def refresh_genres(self) -> None:
        """Reload genres from API (e.g. after Test token succeeds in Settings)."""
        self._load_genres()

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
        artist_names = self.discover_section.get_selected_artist_names()
        label_names = self.discover_section.get_selected_label_names()
        from_date = self.discover_section.get_charts_from_date()
        to_date = self.discover_section.get_charts_to_date()
        new_releases_days = self.discover_section.get_new_releases_days()
        self._last_discovery_genre_ids = list(genre_ids)
        self._last_discovery_artist_names = list(artist_names)
        self._last_discovery_label_names = list(label_names)
        self._save_discover_selection(genre_ids, artist_names, label_names, from_date, to_date, new_releases_days)
        _logger.info(
            "inCrate discovery: user clicked Discover — genres=%s, artists=%s, labels=%s, from=%s, to=%s, days=%s",
            len(genre_ids),
            len(artist_names),
            len(label_names),
            from_date,
            to_date,
            new_releases_days,
        )
        self.discover_section.set_discovering(True)
        self.discover_section.set_progress("Discovering...")
        self.discover_section.show_progress_bar(True)
        thread = DiscoveryThread(
            self._discovery,
            genre_ids,
            from_date,
            to_date,
            new_releases_days=new_releases_days,
            library_artist_names=artist_names if artist_names else None,
            library_label_names=label_names if label_names else None,
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
        if self._discovered_tracks:
            save_past_result(
                self._last_discovery_genre_ids,
                self._last_discovery_artist_names,
                self._last_discovery_label_names,
                self._discovered_tracks,
            )
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
        self.playlist_section.set_adding(True)
        track_list = list(tracks)
        result = self._do_add_to_playlist(name, track_list)
        self.playlist_section.set_adding(False)
        if result.success:
            self._apply_playlist_result(result)
        else:
            self._apply_playlist_result(result)
            self._show_playlist_signin_and_retry(name, track_list, result.error or "Add to playlist failed.")

    def _do_add_to_playlist(
        self,
        name: str,
        tracks: list,
        api_client: Optional[Any] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        show_signin_on_fail: bool = False,
    ) -> PlaylistResult:
        if not username and not password and self._config:
            try:
                username = (self._config.get("incrate.beatport_username") or "").strip() or None
                password = (self._config.get("incrate.beatport_password") or "").strip() or None
            except (TypeError, AttributeError):
                pass
        api = api_client or (self._get_beatport_api() if self._get_beatport_api else self._beatport_api)
        return create_playlist_and_add_tracks(
            name,
            tracks,
            api_client=api,
            browser_add_to_playlist=_browser_add_to_playlist,
            beatport_username=username,
            beatport_password=password,
        )

    def _apply_playlist_result(self, result: PlaylistResult) -> None:
        if result.success:
            self.playlist_section.set_status(
                f"Added {result.added_count} tracks to playlist."
                + (f" {result.playlist_url}" if result.playlist_url else "")
            )
        else:
            self.playlist_section.set_status(result.error or "Add to playlist failed.", is_error=True)

    def _show_playlist_signin_and_retry(self, name: str, tracks: list, first_error: str) -> None:
        """Show sign-in dialog; on accept, try password grant and retry add to playlist."""
        username = (self._config.get("incrate.beatport_username") or "").strip() if self._config else ""
        password = (self._config.get("incrate.beatport_password") or "").strip() if self._config else ""
        dialog = BeatportPlaylistSignInDialog(
            parent=self,
            initial_username=username,
            initial_password=password,
            error_message=first_error,
        )
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        u = dialog.get_username()
        p = dialog.get_password()
        if not u or not p:
            self.playlist_section.set_status("Enter email and password to sign in.", is_error=True)
            return
        if dialog.get_remember() and self._config:
            try:
                self._config.set("incrate.beatport_username", u)
                self._config.set("incrate.beatport_password", p)
                self._config.save()
            except Exception:
                pass
        config_get = getattr(self._config, "get", None) if self._config else None
        client_id, client_secret = get_oauth_client_credentials(config_get=config_get)
        if client_id and client_secret:
            self.playlist_section.set_status("Signing in…", is_error=False)
            self.playlist_section.set_adding(True)
            try:
                token = token_via_password(client_id, client_secret, u, p)
                base_url = "https://api.beatport.com/v4"
                if self._config:
                    try:
                        base_url = (self._config.get("incrate.beatport_api_base_url") or base_url).strip() or base_url
                    except Exception:
                        pass
                client = BeatportApiClient(base_url=base_url, access_token=token, timeout=30)
                api = BeatportApi(client=client, cache_service=None)
                result = self._do_add_to_playlist(name, tracks, api_client=api, username=u, password=p, show_signin_on_fail=False)
                self._apply_playlist_result(result)
            except Exception as e:
                err = str(e)
                if "401" in err or "Unauthorized" in err:
                    self.playlist_section.set_status("Sign-in failed: wrong email or password.", is_error=True)
                else:
                    self.playlist_section.set_status(f"Sign-in failed: {err}", is_error=True)
            finally:
                self.playlist_section.set_adding(False)
        else:
            # No OAuth credentials: try browser automation with email/password
            self.playlist_section.set_status("Opening browser to sign in and add tracks…", is_error=False)
            self.playlist_section.set_adding(True)
            try:
                result = self._do_add_to_playlist(name, tracks, username=u, password=p)
                self._apply_playlist_result(result)
            finally:
                self.playlist_section.set_adding(False)
