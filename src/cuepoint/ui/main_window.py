#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Main Window Module - Main application window.

This module contains the MainWindow class, which is the primary window
of the CuePoint application. It provides the main user interface including:

- File and playlist selection
- Processing mode selection (single vs batch)
- Progress monitoring
- Results display
- Menu bar with File, Edit, View, and Help menus
- Keyboard shortcuts management
- Drag and drop support

The MainWindow coordinates between various UI components and the
GUIController for processing operations.
"""

import json
import os
import platform
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

# For update system (Step 5)
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    pass

from PySide6.QtCore import QSettings, Qt, QSize, QTimer
from PySide6.QtGui import (
    QAction,
    QDragEnterEvent,
    QDropEvent,
    QIcon,
    QKeyEvent,
    QKeySequence,
)
from PySide6.QtWidgets import (
    QButtonGroup,
    QDialog,
    QFileDialog,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMenu,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QRadioButton,
    QScrollArea,
    QStackedWidget,
    QStyle,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from cuepoint.data import (
    build_rekordbox_updates,
    get_track_locations,
    playlist_path_for_display,
    write_key_comment_year_to_playlist_tracks,
    write_key_comment_year_to_playlist_tracks_batch,
    write_tags_to_paths,
)
from cuepoint.models.result import TrackResult
from cuepoint.services.output_writer import write_csv_files
from cuepoint.ui.controllers.config_controller import ConfigController
from cuepoint.ui.controllers.export_controller import ExportController
from cuepoint.ui.controllers.main_controller import GUIController
from cuepoint.ui.controllers.results_controller import ResultsController
from cuepoint.ui.gui_interface import (
    ErrorType,
    ProcessingError,
    ProgressInfo,
    ReliabilityState,
)
from cuepoint.ui.strings import EmptyState
from cuepoint.ui.widgets.batch_processor import BatchProcessorWidget
from cuepoint.ui.widgets.config_panel import ConfigPanel
from cuepoint.ui.dialogs import SyncCompleteDialog, SyncTagsDialog
from cuepoint.ui.widgets.dialogs import AboutDialog, ErrorDialog, UserGuideDialog
from cuepoint.ui.widgets.file_selector import FileSelector
from cuepoint.ui.widgets.history_view import HistoryView
from cuepoint.ui.widgets.playlist_file_selector import PlaylistFileSelector
from cuepoint.ui.widgets.performance_view import PerformanceView
from cuepoint.ui.widgets.playlist_selector import PlaylistSelector

# ProgressWidget no longer used - progress is inline in MainWindow
from cuepoint.ui.widgets.results_view import ResultsView
from cuepoint.ui.widgets.shortcut_manager import ShortcutContext, ShortcutManager
from cuepoint.ui.widgets.styles import Layout
from cuepoint.ui.widgets.tool_selection_page import ToolSelectionPage
from cuepoint.utils.utils import get_output_directory


class MainWindow(QMainWindow):
    """Main application window for CuePoint Beatport Metadata Enricher.

    This is the primary window of the application, containing all UI components
    including file selection, playlist selection, processing controls, progress
    display, and results view. It manages the overall application state and
    coordinates between different UI components.

    Attributes:
        controller: GUIController instance for processing operations.
        shortcut_manager: ShortcutManager instance for keyboard shortcuts.
        file_selector: FileSelector widget for XML file selection.
        playlist_selector: PlaylistSelector widget for playlist selection.
        progress_widget: ProgressWidget for displaying processing progress.
        results_view: ResultsView widget for displaying processing results.
        config_panel: ConfigPanel widget for configuration settings.
        batch_processor: BatchProcessorWidget for batch processing mode.
        history_view: HistoryView widget for viewing past searches.
        performance_view: PerformanceView widget for performance monitoring.
        tabs: QTabWidget containing main, settings, and history tabs.
        performance_tab_index: Optional index of performance monitoring tab.
        batch_playlist_names: List of playlist names for batch processing.

    Example:
        >>> app = QApplication(sys.argv)
        >>> window = MainWindow()
        >>> window.show()
        >>> sys.exit(app.exec())
    """

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        # Create GUI controller for processing
        self.controller = GUIController()
        # Create controllers for UI components
        self.results_controller = ResultsController()
        self.export_controller = ExportController()
        self._config_service = None
        try:
            from cuepoint.services.interfaces import IConfigService
            from cuepoint.utils.di_container import get_container

            container = get_container()
            self._config_service = container.resolve(IConfigService)
        except Exception:
            self._config_service = None
        # Fallback: ensure config persists even if DI fails (e.g. bootstrap not run)
        if self._config_service is None:
            try:
                from cuepoint.services.config_service import ConfigService

                self._config_service = ConfigService()
            except Exception:
                pass
        self.config_controller = ConfigController(config_service=self._config_service)
        # Create shortcut manager
        self.shortcut_manager = ShortcutManager(self)
        self.shortcut_manager.shortcut_conflict.connect(self.on_shortcut_conflict)
        # Tool selection page state
        self.tool_selection_page = None
        self._incrate_page = None
        self.current_page = "tool_selection"  # or "main"
        self.init_ui()
        self.setup_connections()
        self.setup_shortcuts()
        # Restore state after UI is initialized
        self.restore_state()
        # Step 9.4: first-run onboarding (shown asynchronously after window is visible)
        self._schedule_onboarding_if_needed()
        # Beatport token: if missing, show get-token dialog (after window ready / onboarding)
        self._schedule_beatport_token_check_if_needed()

        # Step 9.2: Set up focus management for accessibility
        self._setup_focus_management()

        # Step 5: Initialize update system
        self._setup_update_system()

    def _setup_focus_management(self) -> None:
        """Set up focus management for keyboard navigation (Step 9.2)."""
        try:
            from cuepoint.ui.widgets.focus_manager import FocusManager

            self.focus_manager = FocusManager(self)

            # Set up tab order for main window widgets
            # This will be populated when widgets are created
            # For now, we'll set it up after UI initialization
            QTimer.singleShot(100, self._setup_tab_order)
        except Exception as e:
            # Focus management is best-effort
            import logging

            logging.warning(f"Could not set up focus management: {e}")

    def _setup_tab_order(self) -> None:
        """Set up logical tab order for keyboard navigation (Step 9.2)."""
        try:
            if not hasattr(self, "focus_manager"):
                return

            # Collect focusable widgets in logical order
            tab_order = []

            # File selector widgets
            if hasattr(self, "file_selector"):
                if hasattr(self.file_selector, "path_input"):
                    tab_order.append(self.file_selector.path_input)
                if hasattr(self.file_selector, "browse_button"):
                    tab_order.append(self.file_selector.browse_button)

            # Mode selection
            if hasattr(self, "single_mode_radio"):
                tab_order.append(self.single_mode_radio)
            if hasattr(self, "batch_mode_radio"):
                tab_order.append(self.batch_mode_radio)

            # Playlist selector
            if hasattr(self, "playlist_selector"):
                if hasattr(self.playlist_selector, "combo"):
                    tab_order.append(self.playlist_selector._trigger_edit)

            # Start button
            if hasattr(self, "start_button"):
                tab_order.append(self.start_button)

            # Results view widgets
            if hasattr(self, "results_view"):
                if hasattr(self.results_view, "search_input"):
                    tab_order.append(self.results_view.search_input)
                if hasattr(self.results_view, "status_filter"):
                    tab_order.append(self.results_view.status_filter)
                if hasattr(self.results_view, "table"):
                    tab_order.append(self.results_view.table)

            # Export buttons
            if hasattr(self, "export_csv_button"):
                tab_order.append(self.export_csv_button)
            if hasattr(self, "export_json_button"):
                tab_order.append(self.export_json_button)

            # Set tab order
            if tab_order and len(tab_order) > 1:
                self.focus_manager.set_tab_order(tab_order)
        except Exception as e:
            # Tab order setup is best-effort
            import logging

            logging.warning(f"Could not set up tab order: {e}")

    def _schedule_onboarding_if_needed(self) -> None:
        """Schedule first-run onboarding dialog (non-blocking startup)."""
        try:
            # Never show onboarding during automated tests (pytest-qt processes events
            # and a modal dialog here will hang the test run).
            if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get(
                "CUEPOINT_DISABLE_ONBOARDING"
            ):
                return

            from cuepoint.services.interfaces import IConfigService
            from cuepoint.services.onboarding_service import OnboardingService
            from cuepoint.utils.di_container import get_container

            config_service = None
            try:
                container = get_container()
                config_service = container.resolve(IConfigService)
            except Exception:
                config_service = None

            self._onboarding_service = OnboardingService(config_service=config_service)
            if not self._onboarding_service.should_show_onboarding():
                return

            # Defer until the event loop is running and the window is shown.
            # Use a small delay to ensure the main window is fully visible first
            def show_onboarding_after_window_ready():
                # Ensure main window is visible before showing onboarding
                self.show()
                self.raise_()
                from PySide6.QtWidgets import QApplication

                QApplication.processEvents()
                self._show_onboarding_dialog()

            QTimer.singleShot(100, show_onboarding_after_window_ready)
        except Exception:
            # Onboarding is best-effort; never block app startup.
            return

    def _show_onboarding_dialog(self) -> None:
        """Show onboarding dialog and persist the user's choice."""
        try:
            from PySide6.QtCore import QTimer
            from PySide6.QtWidgets import QApplication, QDialog

            from cuepoint.ui.dialogs.onboarding_dialog import OnboardingDialog

            # Ensure main window is visible and raised before showing dialog
            # Process events to ensure the window is actually shown
            self.show()
            self.raise_()
            self.activateWindow()
            QApplication.processEvents()

            dialog = OnboardingDialog(self)
            result = dialog.exec()

            # Ensure main window is visible and raised after dialog closes
            # This prevents the app from exiting if Qt thinks there are no visible windows
            # Use processEvents to ensure the window state is updated
            self.show()
            self.raise_()
            self.activateWindow()
            QApplication.processEvents()

            # Also ensure window is visible after a short delay (in case of timing issues)
            def ensure_window_visible():
                self.show()
                self.raise_()
                self.activateWindow()

            QTimer.singleShot(100, ensure_window_visible)

            # Persist onboarding outcome - always mark as complete when dialog closes
            # This ensures the onboarding doesn't show again even if user closes window
            if hasattr(self, "_onboarding_service"):
                if result == QDialog.DialogCode.Accepted:
                    if dialog.dont_show_again_checked():
                        self._onboarding_service.dismiss_onboarding(
                            dont_show_again=True
                        )
                    else:
                        self._onboarding_service.mark_first_run_complete()
                else:
                    # User skipped or closed dialog: mark complete
                    # Check if "don't show again" was checked before dialog closed
                    try:
                        dont_show = dialog.dont_show_again_checked()
                    except Exception:
                        dont_show = False
                    self._onboarding_service.dismiss_onboarding(
                        dont_show_again=dont_show
                    )

            # Final check - ensure main window is definitely visible
            self.show()
            self.raise_()
            self.activateWindow()
            QApplication.processEvents()
        except Exception:
            # If anything goes wrong, still mark as complete to prevent infinite loop
            # And ensure main window is visible
            try:
                self.show()
                self.raise_()
                self.activateWindow()
                if hasattr(self, "_onboarding_service"):
                    self._onboarding_service.mark_first_run_complete()
            except Exception:
                pass
            return

    def _schedule_beatport_token_check_if_needed(self) -> None:
        # Beatport API token dialog is shown only when entering inCrate (_show_incrate_page)
        pass

    def init_ui(self) -> None:
        """Initialize all UI components and layout.

        Sets up the main window structure including:
        - Window properties (title, size, geometry)
        - Menu bar with File, Edit, View, and Help menus
        - Tab widget with Main and Past Searches tabs (Settings moved to menu bar)
        - File selection and playlist selection widgets
        - Processing mode selection (single vs batch)
        - Progress widget and results view
        - Status bar
        - Drag and drop support
        """
        # Window properties - use platform-specific sizes
        self.setWindowTitle("CuePoint - Beatport Metadata Enricher")
        self.setMinimumSize(Layout.WINDOW_MIN_WIDTH, Layout.WINDOW_MIN_HEIGHT)
        self.setGeometry(100, 100, Layout.DEFAULT_WIDTH, Layout.DEFAULT_HEIGHT)

        # Set window icon (inherits from application icon, but set explicitly for compatibility)
        self._set_window_icon()

        # Create menu bar
        self.create_menu_bar()

        # Create tool selection page and stack (so switching views never deletes pages)
        self.tool_selection_page = ToolSelectionPage()
        self.tool_selection_page.tool_selected.connect(self.on_tool_selected)
        self._stack = QStackedWidget()
        self._stack.addWidget(self.tool_selection_page)
        self.setCentralWidget(self._stack)
        self._stack.setCurrentWidget(self.tool_selection_page)
        self.current_page = "tool_selection"

        # Create tab widget
        self.tabs = QTabWidget()

        # Main tab (scrollable): keeps table scrollable AND allows whole-window scroll if needed
        main_tab_content = QWidget()
        main_layout = QVBoxLayout(main_tab_content)
        main_layout.setSpacing(8)
        main_layout.setContentsMargins(10, 10, 10, 10)

        # === ROW 1: Three equal boxes filling full width ===
        row1 = QHBoxLayout()
        row1.setSpacing(10)

        # BOX 1: Source choice (Collection or Playlist file) - two buttons only
        self.file_box = QGroupBox("Source")
        self.file_box.setObjectName("panelBox")
        self.file_box.setFixedHeight(90)
        file_layout = QHBoxLayout(self.file_box)
        file_layout.setContentsMargins(0, 0, 0, 0)
        self.source_collection_btn = QPushButton("Collection")
        self.source_collection_btn.setObjectName("sourceModeButton")
        self.source_collection_btn.setCheckable(True)
        self.source_collection_btn.setChecked(True)  # Default
        self.source_collection_btn.clicked.connect(self._on_source_collection_clicked)
        self.source_playlist_file_btn = QPushButton("Playlist file")
        self.source_playlist_file_btn.setObjectName("sourceModeButton")
        self.source_playlist_file_btn.setCheckable(True)
        self.source_playlist_file_btn.clicked.connect(self._on_source_playlist_file_clicked)
        file_layout.addWidget(self.source_collection_btn)
        file_layout.addWidget(self.source_playlist_file_btn)
        file_layout.addStretch()
        row1.addWidget(self.file_box, 1)  # Equal stretch

        # Second box: XML picker or M3U picker (hidden until user clicks Collection or Playlist file)
        self.source_content_stack = QStackedWidget()
        self.file_selector = FileSelector()
        self.file_selector.file_selected.connect(self.on_file_selected)
        self.source_content_stack.addWidget(self.file_selector)
        self.playlist_file_selector = PlaylistFileSelector()
        self.playlist_file_selector.playlist_file_selected.connect(
            self.on_playlist_file_selected
        )
        self.source_content_stack.addWidget(self.playlist_file_selector)
        self.source_content_box = QGroupBox("File")
        self.source_content_box.setFixedHeight(90)
        self.source_content_box.setObjectName("panelBox")
        source_content_layout = QVBoxLayout(self.source_content_box)
        source_content_layout.setContentsMargins(0, 0, 0, 0)
        source_content_layout.addWidget(self.source_content_stack)
        self.source_content_box.setVisible(False)  # Hidden by default
        self._source_mode = "collection"

        # BOX 2: Mode
        self.mode_box = QGroupBox("Mode")
        self.mode_box.setObjectName("panelBox")
        self.mode_box.setFixedHeight(90)
        mode_layout = QHBoxLayout(self.mode_box)
        mode_layout.setContentsMargins(0, 0, 0, 0)
        mode_layout.setSpacing(15)
        self.mode_button_group = QButtonGroup()
        self.single_mode_radio = QRadioButton("Single")
        self.single_mode_radio.setStyleSheet("""
            QRadioButton {
                color: #fff;
                font-size: 12px;
            }
            QRadioButton::indicator {
                width: 16px;
                height: 16px;
            }
            QRadioButton::indicator:unchecked {
                border: 2px solid #888;
                border-radius: 8px;
                background-color: transparent;
            }
            QRadioButton::indicator:checked {
                border: 2px solid #007AFF;
                border-radius: 8px;
                background-color: #007AFF;
            }
        """)
        self.single_mode_radio.setAccessibleName("Single mode radio button")
        self.single_mode_radio.setAccessibleDescription(
            "Process one playlist at a time"
        )
        self.single_mode_radio.toggled.connect(self.on_mode_changed)
        self.mode_button_group.addButton(self.single_mode_radio, 0)
        mode_layout.addWidget(self.single_mode_radio)
        self.batch_mode_radio = QRadioButton("Batch")
        self.batch_mode_radio.setStyleSheet("""
            QRadioButton {
                color: #fff;
                font-size: 12px;
            }
            QRadioButton::indicator {
                width: 16px;
                height: 16px;
            }
            QRadioButton::indicator:unchecked {
                border: 2px solid #888;
                border-radius: 8px;
                background-color: transparent;
            }
            QRadioButton::indicator:checked {
                border: 2px solid #007AFF;
                border-radius: 8px;
                background-color: #007AFF;
            }
        """)
        self.batch_mode_radio.setAccessibleName("Batch mode radio button")
        self.batch_mode_radio.setAccessibleDescription(
            "Process multiple playlists in sequence"
        )
        self.batch_mode_radio.toggled.connect(self.on_mode_changed)
        self.mode_button_group.addButton(self.batch_mode_radio, 1)
        mode_layout.addWidget(self.batch_mode_radio)
        mode_layout.addStretch()
        self.mode_box.setVisible(False)
        self.mode_group = self.mode_box
        row1.addWidget(self.mode_box, 1)  # Equal stretch

        # BOX 3: Playlist (tree for Collection, or filename label for Playlist file)
        self.playlist_box = QGroupBox("Playlist")
        self.playlist_box.setObjectName("panelBox")
        self.playlist_box.setFixedHeight(90)
        playlist_layout = QHBoxLayout(self.playlist_box)
        playlist_layout.setContentsMargins(0, 0, 0, 0)
        self.playlist_selector = PlaylistSelector()
        self.playlist_selector.playlist_selected.connect(self.on_playlist_selected)
        self.playlist_filename_label = QLabel("")
        self.playlist_filename_label.setStyleSheet("font-size: 12px; color: #ccc;")
        self.playlist_filename_label.setObjectName("playlistFilenameLabel")
        playlist_stack = QStackedWidget()
        playlist_stack.addWidget(self.playlist_selector)
        playlist_stack.addWidget(self.playlist_filename_label)
        self.playlist_stack = playlist_stack
        playlist_layout.addWidget(playlist_stack)
        self.playlist_box.setVisible(False)
        self.single_playlist_group = self.playlist_box
        row1.addWidget(self.playlist_box, 1)  # Equal stretch

        main_layout.addLayout(row1)

        # === ROW 2: Content box (XML or M3U picker) directly below Source, same size ===
        row2 = QHBoxLayout()
        row2.setSpacing(10)
        row2.addWidget(self.source_content_box, 1)  # Same stretch as Source box
        row2.addStretch(1)  # Empty under Mode
        row2.addStretch(1)  # Empty under Playlist
        main_layout.addLayout(row2)

        # === Empty state hint (Step 9.4) ===
        self.empty_state_hint = QWidget()
        self.empty_state_hint.setObjectName("cardContainer")
        hint_layout = QVBoxLayout(self.empty_state_hint)
        hint_layout.setContentsMargins(18, 16, 18, 16)
        hint_layout.setSpacing(10)
        hint_layout.setAlignment(Qt.AlignCenter)

        self.hint_title = QLabel(EmptyState.GET_STARTED_TITLE)
        self.hint_title.setAlignment(Qt.AlignCenter)
        self.hint_title.setStyleSheet("font-size: 14px; font-weight: bold;")
        hint_layout.addWidget(self.hint_title)

        self.hint_body = QLabel(EmptyState.GET_STARTED_BODY)
        self.hint_body.setAlignment(Qt.AlignCenter)
        self.hint_body.setWordWrap(True)
        self.hint_body.setStyleSheet("font-size: 12px; color: #ccc;")
        hint_layout.addWidget(self.hint_body)

        hint_buttons = QHBoxLayout()
        hint_buttons.addStretch(1)

        self.browse_hint_btn = QPushButton(EmptyState.BROWSE_FOR_XML)
        self.browse_hint_btn.setObjectName("secondaryActionButton")
        self.browse_hint_btn.clicked.connect(self.on_file_open)
        self.browse_hint_btn.setAccessibleName(EmptyState.NO_XML_ACTION)
        hint_buttons.addWidget(self.browse_hint_btn)

        self.instructions_hint_btn = QPushButton(EmptyState.VIEW_INSTRUCTIONS)
        self.instructions_hint_btn.setObjectName("secondaryActionButton")
        self.instructions_hint_btn.clicked.connect(self._on_empty_state_instructions)
        hint_buttons.addWidget(self.instructions_hint_btn)

        hint_buttons.addStretch(1)
        hint_layout.addLayout(hint_buttons)

        main_layout.addWidget(self.empty_state_hint)

        # === Batch processor (shown only in batch mode) ===
        self.batch_processor = BatchProcessorWidget()
        self.batch_processor.setVisible(False)
        main_layout.addWidget(self.batch_processor)

        # === ROW 3: Start button ===
        self.start_button_container = QWidget()
        start_layout = QHBoxLayout(self.start_button_container)
        start_layout.setContentsMargins(0, 8, 0, 8)
        start_layout.addStretch()
        self.start_button = QPushButton("Start Processing")
        self.start_button.setObjectName("primaryActionButton")

        # Set play icon using Qt's standard icons (better rendering than Unicode)
        try:
            # Use Qt's standard play icon from style
            play_icon = self.style().standardIcon(QStyle.StandardPixmap.SP_MediaPlay)
            if not play_icon.isNull():
                self.start_button.setIcon(play_icon)
        except Exception:
            # Fallback: if icon fails, just use text without Unicode character
            pass

        self.start_button.setToolTip(
            "Start processing the selected playlist(s).\n"
            "Searches Beatport for each track and enriches with metadata.\n"
            "Shortcut: Enter"
        )
        self.start_button.setFixedWidth(220)
        self.start_button.setFocusPolicy(Qt.StrongFocus)
        self.start_button.setAccessibleName("Start processing button")
        self.start_button.setAccessibleDescription(
            "Start processing the selected playlist(s)"
        )
        self.start_button.clicked.connect(self.start_processing)
        self._set_start_enabled(False)
        start_layout.addWidget(self.start_button)
        start_layout.addStretch()
        self.start_button_container.setVisible(False)
        main_layout.addWidget(self.start_button_container)

        # Set default mode after playlist_box, start_button, and batch_processor exist so on_mode_changed can use them
        self.single_mode_radio.setChecked(True)  # Default to Single mode (not Batch)

        # Backward compat
        self.start_row = self.start_button
        self.controls_row = None
        self._mode_label = None
        self._sep1 = None
        self._sep2 = None

        # === ROW 4: Progress section ===
        self.progress_container = QWidget()
        self.progress_container.setObjectName("cardContainer")
        progress_main = QVBoxLayout(self.progress_container)
        progress_main.setContentsMargins(15, 12, 15, 12)
        progress_main.setSpacing(10)

        # Progress bar row
        prog_row1 = QHBoxLayout()
        prog_row1.setSpacing(12)
        self.progress_bar = QProgressBar()
        self.progress_bar.setFixedHeight(22)
        self.progress_bar.setFormat("%p% (%v/%m tracks)")
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #555;
                border-radius: 5px;
                text-align: center;
                font-size: 11px;
                font-weight: bold;
                background: #333;
                color: #fff;
            }
            QProgressBar::chunk { background: #007AFF; border-radius: 4px; }
        """)
        prog_row1.addWidget(self.progress_bar, 1)
        self.progress_pct = QLabel("0%")
        self.progress_pct.setStyleSheet(
            "font-size: 16px; font-weight: bold; color: #fff; min-width: 50px; background: transparent; padding: 0px; border: none;"
        )
        self.progress_pct.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        prog_row1.addWidget(self.progress_pct)
        progress_main.addLayout(prog_row1)

        # Track info
        self.progress_track = QLabel("Ready to start...")
        self.progress_track.setStyleSheet(
            "font-size: 12px; color: #ccc; background: transparent; padding: 0px; border: none;"
        )
        self.progress_track.setWordWrap(True)
        progress_main.addWidget(self.progress_track)

        # Stats + Cancel row
        prog_row2 = QHBoxLayout()
        prog_row2.setSpacing(20)
        self.progress_elapsed = QLabel("Elapsed: 0s")
        self.progress_elapsed.setStyleSheet(
            "font-size: 12px; color: #aaa; background: transparent; padding: 0px;"
        )
        prog_row2.addWidget(self.progress_elapsed)
        self.progress_remaining = QLabel("Remaining: --")
        self.progress_remaining.setStyleSheet(
            "font-size: 12px; color: #aaa; background: transparent; padding: 0px;"
        )
        prog_row2.addWidget(self.progress_remaining)
        prog_row2.addStretch()
        self.progress_matched = QLabel("✓ Matched: 0")
        self.progress_matched.setStyleSheet(
            "font-size: 12px; color: #4CAF50; font-weight: bold; background: transparent; padding: 0px;"
        )
        prog_row2.addWidget(self.progress_matched)
        self.progress_unmatched = QLabel("✗ Unmatched: 0")
        self.progress_unmatched.setStyleSheet(
            "font-size: 12px; color: #F44336; font-weight: bold; background: transparent; padding: 0px;"
        )
        prog_row2.addWidget(self.progress_unmatched)
        # Design 5.12, 5.40: Pause / Resume button
        self.pause_button = QPushButton("Pause")
        self.pause_button.setFixedWidth(90)
        self.pause_button.setFocusPolicy(Qt.StrongFocus)
        self.pause_button.setAccessibleName("Pause processing button")
        self.pause_button.setAccessibleDescription(
            "Pause the current processing; click Resume to continue"
        )
        self.pause_button.clicked.connect(self.on_pause_resume_clicked)
        self.pause_button.setEnabled(False)
        prog_row2.addWidget(self.pause_button)
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.setObjectName("dangerButton")
        self.cancel_button.setFixedWidth(90)
        self.cancel_button.setFocusPolicy(Qt.StrongFocus)
        self.cancel_button.setAccessibleName("Cancel processing button")
        self.cancel_button.setAccessibleDescription(
            "Cancel the current processing operation"
        )
        self.cancel_button.clicked.connect(self.on_cancel_requested)
        prog_row2.addWidget(self.cancel_button)
        progress_main.addLayout(prog_row2)

        self.progress_container.setVisible(False)
        self.progress_group = self.progress_container
        self.progress_widget = None
        main_layout.addWidget(self.progress_container)

        # === ROW 5: Results (takes remaining space) ===
        self.results_group = QWidget()
        self.results_group.setObjectName("cardContainer")
        results_layout = QVBoxLayout(self.results_group)
        results_layout.setContentsMargins(10, 10, 10, 10)
        self.results_view = ResultsView(
            results_controller=self.results_controller,
            export_controller=self.export_controller,
        )
        self.results_view.write_to_track_tags_requested.connect(
            self.on_write_to_track_tags_requested
        )
        results_layout.addWidget(self.results_view)
        self.results_group.setVisible(False)
        main_layout.addWidget(self.results_group, 1)  # Takes remaining space

        # Add stretch at end to push everything to top when results hidden
        main_layout.addStretch()

        # Create config panel (but don't add to tabs - it will be in Settings dialog)
        # Keep it accessible for getting settings during processing
        self.config_panel = ConfigPanel(config_controller=self.config_controller)
        self.config_panel.token_test_succeeded.connect(self._on_incrate_token_test_succeeded)

        # History tab (Past Searches)
        history_tab_content = QWidget()
        history_layout = QVBoxLayout(history_tab_content)
        history_layout.setContentsMargins(
            Layout.MARGIN, Layout.MARGIN, Layout.MARGIN, Layout.MARGIN
        )
        self.history_view = HistoryView(export_controller=self.export_controller)
        self.history_view.rerun_requested.connect(self.on_rerun_requested)
        self.history_view.rerun_m3u_requested.connect(self.on_rerun_m3u_requested)
        self.history_view.write_to_track_tags_requested.connect(
            self.on_write_to_track_tags_from_history
        )
        history_layout.addWidget(self.history_view)

        history_scroll = QScrollArea()
        history_scroll.setWidgetResizable(True)
        history_scroll.setFrameShape(QFrame.NoFrame)
        history_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        history_scroll.setWidget(history_tab_content)

        # Wrap main content in a scroll area
        main_scroll = QScrollArea()
        main_scroll.setWidgetResizable(True)
        main_scroll.setFrameShape(QFrame.NoFrame)
        main_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        main_scroll.setWidget(main_tab_content)

        # Add tabs (Settings tab removed - now accessible via menu)
        self.tabs.addTab(main_scroll, "Main")
        self.tabs.addTab(history_scroll, "Past Searches")

        # inKey wrapper: back button (top-left) + tabs, so we can show back when on main interface
        self._inkey_wrapper = QWidget()
        inkey_layout = QVBoxLayout(self._inkey_wrapper)
        inkey_layout.setContentsMargins(0, 0, 0, 0)
        inkey_layout.setSpacing(0)
        back_row = QHBoxLayout()
        back_row.setContentsMargins(8, 6, 0, 4)
        self._inkey_back_btn = QPushButton()
        self._inkey_back_btn.setToolTip("Back to tool selection")
        self._inkey_back_btn.setFixedHeight(28)
        self._inkey_back_btn.setFixedWidth(32)
        self._inkey_back_btn.setFocusPolicy(Qt.StrongFocus)
        style = self.style()
        if style:
            icon = style.standardIcon(QStyle.StandardPixmap.SP_ArrowBack)
            self._inkey_back_btn.setIcon(icon)
            self._inkey_back_btn.setIconSize(QSize(20, 20))
        self._inkey_back_btn.clicked.connect(self.show_tool_selection_page)
        self._inkey_back_btn.setStyleSheet(
            "QPushButton { border: none; background: transparent; }"
            " QPushButton:hover { background-color: rgba(255,255,255,0.1); border-radius: 4px; }"
        )
        back_row.addWidget(self._inkey_back_btn)
        back_row.addStretch()
        inkey_layout.addLayout(back_row)
        inkey_layout.addWidget(self.tabs, 1)

        self._stack.addWidget(self._inkey_wrapper)

        # Performance monitoring view (created but not added to tabs yet)
        self.performance_view = PerformanceView()
        self.performance_tab_index = None  # Will be set when tab is added

        # Status bar
        self.statusBar().showMessage("Ready")

        # Add status bar widgets (permanent widgets on the right)
        # File path label
        self.status_file_label = QLabel()
        self.status_file_label.setStyleSheet("color: #666; padding: 0 5px;")
        self.status_file_label.setVisible(False)
        self.statusBar().addPermanentWidget(self.status_file_label)

        # Playlist label
        self.status_playlist_label = QLabel()
        self.status_playlist_label.setStyleSheet("color: #666; padding: 0 5px;")
        self.status_playlist_label.setVisible(False)
        self.statusBar().addPermanentWidget(self.status_playlist_label)

        # Stats label
        self.status_stats_label = QLabel()
        self.status_stats_label.setStyleSheet(
            "color: #4CAF50; font-weight: bold; padding: 0 5px;"
        )
        self.status_stats_label.setVisible(False)
        self.statusBar().addPermanentWidget(self.status_stats_label)

        # Progress indicator (initially hidden)
        self.status_progress = QProgressBar()
        self.status_progress.setMaximumWidth(200)
        self.status_progress.setMaximumHeight(20)
        self.status_progress.setVisible(False)
        self.statusBar().addPermanentWidget(self.status_progress)

        # Logo in status bar removed per user request

        # Enable drag and drop for the window
        self.setAcceptDrops(True)

        # Set accessible name for main window
        self.setAccessibleName("CuePoint main window")
        self.setAccessibleDescription(
            "Main application window for CuePoint Beatport Metadata Enricher"
        )

        # High-level tab order (Step 9.2 spec)
        try:
            self.setTabOrder(self.file_selector, self.single_mode_radio)
            self.setTabOrder(self.single_mode_radio, self.batch_mode_radio)
            self.setTabOrder(self.batch_mode_radio, self.playlist_selector)
            self.setTabOrder(self.playlist_selector, self.start_button)
        except Exception:
            # Best-effort: tab order can vary by platform/widget availability
            pass

        # Initial empty-state visibility
        self._update_empty_state_hint()

    def setup_connections(self) -> None:
        """Set up signal connections between controller and UI components.

        Connects controller signals (progress_updated, processing_complete,
        error_occurred) to UI handlers, and connects batch processor signals
        for batch processing mode.
        """
        # Connect controller signals to handlers
        self.controller.progress_updated.connect(self.on_progress_updated)
        self.controller.processing_complete.connect(self.on_processing_complete)
        self.controller.error_occurred.connect(self.on_error_occurred)

        # Connect batch processor signals
        self.batch_processor.batch_started.connect(self.on_batch_started)
        self.batch_processor.batch_cancelled.connect(self.on_batch_cancelled)
        self.batch_processor.batch_completed.connect(self.on_batch_completed)

    def setup_shortcuts(self) -> None:
        """Set up all keyboard shortcuts for the application.

        Registers global shortcuts (Ctrl+O, Ctrl+E, Ctrl+Q, F1, F11, F5)
        and context-specific shortcuts for main window and settings.
        """
        # Global shortcuts
        self.shortcut_manager.register_shortcut(
            "open_file",
            "Ctrl+O",
            self.on_file_open,
            ShortcutContext.GLOBAL,
            "Open XML file",
        )

        self.shortcut_manager.register_shortcut(
            "export_results",
            "Ctrl+E",
            self.on_export_results,
            ShortcutContext.GLOBAL,
            "Export results",
        )

        self.shortcut_manager.register_shortcut(
            "quit", "Ctrl+Q", self.close, ShortcutContext.GLOBAL, "Quit application"
        )

        self.shortcut_manager.register_shortcut(
            "help", "F1", self.on_show_user_guide, ShortcutContext.GLOBAL, "Show help"
        )

        self.shortcut_manager.register_shortcut(
            "shortcuts",
            "Ctrl+?",
            self.on_show_shortcuts,
            ShortcutContext.GLOBAL,
            "Show keyboard shortcuts",
        )

        self.shortcut_manager.register_shortcut(
            "fullscreen",
            "F11",
            self.toggle_fullscreen,
            ShortcutContext.GLOBAL,
            "Toggle fullscreen",
        )

        # Main window shortcuts
        self.shortcut_manager.register_shortcut(
            "new_session",
            "Ctrl+N",
            self.on_new_session,
            ShortcutContext.MAIN_WINDOW,
            "New session",
        )

        self.shortcut_manager.register_shortcut(
            "start_processing",
            "F5",
            self.start_processing,
            ShortcutContext.GLOBAL,  # Changed to GLOBAL so it works from anywhere
            "Start processing",
        )

        self.shortcut_manager.register_shortcut(
            "restart_processing",
            "Ctrl+R",
            self.on_restart_processing,
            ShortcutContext.MAIN_WINDOW,
            "Restart processing",
        )

        # Settings shortcuts (now in menu bar, so GLOBAL context)
        self.shortcut_manager.register_shortcut(
            "open_settings",
            "Ctrl+,",
            self.on_open_settings,
            ShortcutContext.GLOBAL,
            "Open settings",
        )

        # Enter key to start processing (only when button is enabled)
        self.shortcut_manager.register_shortcut(
            "enter_start",
            "Return",
            self._on_enter_start,
            ShortcutContext.MAIN_WINDOW,
            "Start processing (Enter)",
        )

        # Escape key to cancel (only when processing)
        self.shortcut_manager.register_shortcut(
            "escape_cancel",
            "Escape",
            self._on_escape_cancel,
            ShortcutContext.GLOBAL,
            "Cancel processing (Esc)",
        )

        # Set initial context
        self.shortcut_manager.set_context(ShortcutContext.MAIN_WINDOW)

    def _on_enter_start(self) -> None:
        """Handle Enter key to start processing"""
        # Only start if button is enabled and visible
        if (
            hasattr(self, "start_button")
            and self.start_button.isEnabled()
            and self.start_button.isVisible()
        ):
            self.start_processing()

    def _on_escape_cancel(self) -> None:
        """Handle Escape key to cancel processing"""
        # Only cancel if processing is active
        if hasattr(self, "controller") and self.controller.is_processing():
            self.on_cancel_requested()

    def _set_start_enabled(self, enabled: bool) -> None:
        """Enable/disable Start button and menu action (Step 8: keyboard accessibility)."""
        if hasattr(self, "start_button"):
            self.start_button.setEnabled(enabled)
        if hasattr(self, "start_action"):
            self.start_action.setEnabled(enabled)

    def on_shortcut_conflict(self, action_id1: str, action_id2: str) -> None:
        """Handle keyboard shortcut conflicts.

        Args:
            action_id1: ID of first conflicting action.
            action_id2: ID of second conflicting action.
        """
        QMessageBox.warning(
            self,
            "Shortcut Conflict",
            f"Shortcut conflict detected between '{action_id1}' and '{action_id2}'",
        )

    def show_tool_selection_page(self) -> None:
        """Show the tool selection page"""
        if self.tool_selection_page and hasattr(self, "_stack"):
            self._stack.setCurrentWidget(self.tool_selection_page)
            self.current_page = "tool_selection"
            self.menuBar().show()

    def _restore_source_from_config(self) -> None:
        """Restore last source (Collection vs Playlist file) and path from config."""
        if not getattr(self, "_config_service", None):
            return
        last_source = (
            self._config_service.get("product.last_source") or "collection"
        ).strip().lower()
        if last_source == "playlist_file":
            self.source_collection_btn.setChecked(False)
            self.source_playlist_file_btn.setChecked(True)
            self._source_mode = "playlist_file"
            self.source_content_box.setVisible(True)
            self.source_content_stack.setCurrentIndex(1)
            self.batch_mode_radio.setVisible(False)
            self.batch_mode_radio.setEnabled(False)
            self.playlist_stack.setCurrentIndex(1)
            last_m3u = (
                self._config_service.get("product.last_m3u_path") or ""
            ).strip()
            if last_m3u and os.path.exists(last_m3u):
                self.playlist_file_selector.set_file(last_m3u)
                self.on_playlist_file_selected(last_m3u)
            else:
                if last_m3u:
                    self.playlist_file_selector.clear()
                self._hide_mode_playlist_boxes()
                self.start_button_container.setVisible(False)
                self._set_start_enabled(False)
        else:
            self.source_playlist_file_btn.setChecked(False)
            self.source_collection_btn.setChecked(True)
            self._source_mode = "collection"
            self.source_content_box.setVisible(True)
            self.source_content_stack.setCurrentIndex(0)
            self.batch_mode_radio.setVisible(True)
            self.batch_mode_radio.setEnabled(True)
            self.batch_mode_radio.setToolTip("")
            self.playlist_stack.setCurrentIndex(0)
            # last_xml_path is restored elsewhere (e.g. recent files or onboarding)
        self._update_empty_state_hint()

    def show_main_interface(self) -> None:
        """Show the main interface (inKey: back button + tabs)"""
        self._stack.setCurrentWidget(self._inkey_wrapper)
        self.menuBar().show()
        self._inkey_wrapper.show()
        self.current_page = "main"
        self._restore_source_from_config()

    def _show_incrate_page(self) -> None:
        """Show the inCrate page (lazy-create with DI services)."""
        if not self._ensure_incrate_page_created():
            QMessageBox.warning(
                self,
                "inCrate",
                "Could not load inCrate. Check that services are registered.",
            )
            return
        if self._incrate_page is not None:
            if self._incrate_page.parent() is None:
                self._stack.addWidget(self._incrate_page)
            self._stack.setCurrentWidget(self._incrate_page)
            self.current_page = "incrate"
            self.menuBar().show()
            # Show Beatport API token dialog only when entering inCrate (if token missing)
            QTimer.singleShot(0, self._maybe_show_beatport_token_dialog)

    def _maybe_show_beatport_token_dialog(self) -> None:
        """If Beatport API token is missing, show get-token dialog (only called when entering inCrate)."""
        if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get(
            "CUEPOINT_DISABLE_ONBOARDING"
        ):
            return
        try:
            token = (os.environ.get("BEATPORT_ACCESS_TOKEN") or "").strip()
            if not token and self._config_service:
                token = (
                    self._config_service.get("incrate.beatport_access_token") or ""
                ).strip()
            if token:
                return
            from cuepoint.ui.dialogs.beatport_token_dialog import BeatportTokenDialog

            dialog = BeatportTokenDialog(parent=self, initial_token="")
            if dialog.exec() == QDialog.DialogCode.Accepted:
                new_token = dialog.get_token()
                if new_token and self._config_service:
                    self._config_service.set(
                        "incrate.beatport_access_token", new_token
                    )
                    try:
                        self._config_service.save()
                    except Exception:
                        pass
        except Exception:
            pass

    def _ensure_incrate_page_created(self) -> bool:
        """Create inCrate page if not yet created (so it loads with current config/token). Does not switch UI."""
        if self._incrate_page is not None:
            return True
        try:
            from cuepoint.services.beatport_api import BeatportApi
            from cuepoint.services.incrate_discovery_service import (
                IncrateDiscoveryService,
            )
            from cuepoint.services.inventory_service import InventoryService
            from cuepoint.ui.widgets.incrate_page import IncratePage
            from cuepoint.utils.di_container import get_container

            container = get_container()
            inventory = container.resolve(InventoryService)
            beatport_api = container.resolve(BeatportApi)
            discovery = container.resolve(IncrateDiscoveryService)
            self._incrate_page = IncratePage(
                inventory_service=inventory,
                beatport_api=beatport_api,
                discovery_service=discovery,
                config_service=self._config_service,
                get_beatport_api=lambda: container.resolve(BeatportApi),
            )
            self._incrate_page.back_to_tools_requested.connect(
                self.show_tool_selection_page
            )
            return True
        except Exception:
            return False

    def _on_incrate_token_test_succeeded(self) -> None:
        """After Test connection succeeds in Settings, ensure inCrate page exists and refresh genres."""
        self._ensure_incrate_page_created()
        if self._incrate_page is not None:
            # Defer so the "connection OK" message shows first, then genres load
            QTimer.singleShot(0, self._incrate_page.refresh_genres)

    def on_tool_selected(self, tool_name: str) -> None:
        """Handle tool selection"""
        if tool_name == "inkey":
            # Show the main interface (XML file selection page)
            self.show_main_interface()
            # Switch to Main tab
            self.tabs.setCurrentIndex(0)
        elif tool_name == "incrate":
            self._show_incrate_page()

    def on_new_session(self) -> None:
        """Start a new session by clearing all results and resetting progress.

        Prompts the user for confirmation before clearing results. Resets
        the results view, progress widget, and hides the results group.
        """
        reply = QMessageBox.question(
            self,
            "New Session",
            "Clear all results and start a new session?",
            QMessageBox.Yes | QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            if hasattr(self, "results_view"):
                self.results_view.clear()
            self._reset_progress()
            if hasattr(self, "results_group"):
                self.results_group.setVisible(False)
            self.statusBar().showMessage("New session started", 2000)

    def on_restart_processing(self) -> None:
        """Restart processing of the current playlist.

        Cancels any ongoing processing and starts processing again with
        the same playlist and settings.
        """
        if self.controller.is_processing():
            self.controller.cancel_processing()
        self.start_processing()

    def on_export_results(self) -> None:
        """Export results via keyboard shortcut (Ctrl+E).

        Opens the export dialog if results are available, otherwise
        shows a status message indicating no results to export.
        """
        if hasattr(self, "results_view") and self.results_view.results:
            self.results_view.show_export_dialog()
        else:
            self.statusBar().showMessage("No results to export", 2000)

    def on_write_to_track_tags_requested(self) -> None:
        """Handle Sync with Rekordbox: write selected tags into audio files."""
        if not hasattr(self, "results_view"):
            return
        single_list, batch_dict, playlist_name = (
            self.results_view.get_results_selected_for_tag_write()
        )
        if self.results_view.is_batch_mode:
            if not batch_dict:
                self.statusBar().showMessage(
                    "No tracks selected for writing. Tick the Write box for tracks you want to update.",
                    5000,
                )
                return
        else:
            if not single_list:
                self.statusBar().showMessage(
                    "No tracks selected for writing. Tick the Write box for tracks you want to update.",
                    5000,
                )
                return
        sync_dialog = SyncTagsDialog(self)
        if sync_dialog.exec() != QDialog.DialogCode.Accepted:
            return
        opts = sync_dialog.get_options_dict()
        if not opts:
            return

        if getattr(self, "_source_mode", "collection") == "playlist_file":
            written, failed, errors = write_tags_to_paths(single_list, sync_options=opts)
        else:
            if not hasattr(self, "file_selector"):
                return
            xml_path = self.file_selector.get_file_path()
            if not xml_path or not self.file_selector.validate_file(xml_path):
                self.statusBar().showMessage("Select a Rekordbox XML file first.", 4000)
                return
            try:
                locations = get_track_locations(xml_path)
            except (ValueError, FileNotFoundError, ET.ParseError) as e:
                QMessageBox.warning(
                    self,
                    "Sync with Rekordbox",
                    f"Could not read XML: {e}",
                )
                return
            if not locations:
                self.statusBar().showMessage(
                    "No file paths in this XML. Rekordbox export must include file paths (Location).",
                    6000,
                )
                return
            if self.results_view.is_batch_mode:
                written, failed, errors = write_key_comment_year_to_playlist_tracks_batch(
                    xml_path, batch_dict, sync_options=opts
                )
            else:
                written, failed, errors = write_key_comment_year_to_playlist_tracks(
                    xml_path,
                    playlist_name or "",
                    single_list,
                    sync_options=opts,
                )

        if written == 0 and failed == 0:
            if errors:
                self.statusBar().showMessage(errors[0], 5000)
            else:
                self.statusBar().showMessage("No matched tracks to write.", 5000)
            return
        SyncCompleteDialog(written, failed, errors, self).exec()

    def on_write_to_track_tags_from_history(
        self, csv_rows: List[Dict[str, Any]], playlist_name: str
    ) -> None:
        """Write Key, Comment, Year (and Label) to audio files from a past search CSV.

        For M3U runs (rows have file_path), uses path-based write without XML.
        For Collection runs, requires XML and uses write_key_comment_year_to_playlist_tracks.
        """
        # Convert CSV rows to TrackResult list (playlist order; matched from beatport data)
        results: List[TrackResult] = []
        for i, row in enumerate(csv_rows):
            title = (row.get("original_title") or "").strip() or "Unknown"
            artist = (row.get("original_artists") or "").strip() or "Unknown"
            pi = row.get("playlist_index")
            try:
                playlist_index = int(pi) if pi not in (None, "") else (i + 1)
            except (TypeError, ValueError):
                playlist_index = i + 1
            if playlist_index < 1:
                playlist_index = i + 1
            key_s = (str(row.get("beatport_key") or "")).strip()
            title_s = (str(row.get("beatport_title") or "")).strip()
            matched = bool(key_s or title_s)
            d = dict(row)
            d["playlist_index"] = playlist_index
            d["original_title"] = title
            d["original_artists"] = artist
            d["matched"] = matched
            try:
                results.append(TrackResult.from_dict(d))
            except Exception:
                results.append(
                    TrackResult(
                        playlist_index=playlist_index,
                        title=title,
                        artist=artist,
                        matched=matched,
                        beatport_key=str(row.get("beatport_key") or "").strip() or None,
                        beatport_key_camelot=(
                            str(row.get("beatport_key_camelot") or "").strip() or None
                        ),
                        beatport_year=str(row.get("beatport_year") or "").strip() or None,
                        beatport_label=str(row.get("beatport_label") or "").strip() or None,
                    )
                )
        if not results:
            self.statusBar().showMessage("No rows to write.", 4000)
            return
        sync_dialog = SyncTagsDialog(self)
        if sync_dialog.exec() != QDialog.DialogCode.Accepted:
            return
        opts = sync_dialog.get_options_dict()
        if not opts:
            return

        # M3U run: path-based write (no XML); rows have file_path
        if any(getattr(r, "file_path", None) for r in results):
            written, failed, errors = write_tags_to_paths(results, sync_options=opts)
        else:
            if not hasattr(self, "file_selector"):
                return
            xml_path = self.file_selector.get_file_path()
            if not xml_path or not self.file_selector.validate_file(xml_path):
                self.statusBar().showMessage(
                    "Select a Rekordbox XML file on the main tab first.", 5000
                )
                return
            try:
                locations = get_track_locations(xml_path)
            except (ValueError, FileNotFoundError, ET.ParseError) as e:
                QMessageBox.warning(
                    self,
                    "Sync with Rekordbox",
                    f"Could not read XML: {e}",
                )
                return
            if not locations:
                self.statusBar().showMessage(
                    "No file paths in this XML. Rekordbox export must include file paths (Location).",
                    6000,
                )
                return
            written, failed, errors = write_key_comment_year_to_playlist_tracks(
                xml_path,
                playlist_name or "Playlist",
                results,
                sync_options=opts,
            )

        if written == 0 and failed == 0:
            if errors:
                self.statusBar().showMessage(errors[0], 5000)
            else:
                self.statusBar().showMessage(
                    "No matched tracks to write. Rows need Beatport key/title data.", 5000
                )
            return
        SyncCompleteDialog(written, failed, errors, self).exec()

    def on_open_settings(self) -> None:
        """Open the Settings dialog via menu or keyboard shortcut (Ctrl+,).

        Opens a dialog window with the settings panel.
        """
        from PySide6.QtWidgets import QDialog

        from cuepoint.ui.dialogs.settings_dialog import SettingsDialog

        dialog = SettingsDialog(config_controller=self.config_controller, parent=self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            # Settings are saved automatically by ConfigPanel
            # Update our config_panel reference to match dialog's panel
            # (They share the same config_controller, so settings are synced)
            self.statusBar().showMessage("Settings saved", 2000)

    def keyPressEvent(self, event: QKeyEvent) -> None:
        """Handle key press events for keyboard shortcuts.

        Shows the shortcuts dialog when '?' is pressed (without Ctrl).
        Other key events are passed to the parent class.

        Args:
            event: QKeyEvent containing key press information.
        """
        # Show shortcuts dialog when '?' is pressed (without Ctrl)
        if event.key() == Qt.Key_Question and event.modifiers() == Qt.NoModifier:
            self.on_show_shortcuts()
        else:
            super().keyPressEvent(event)

    def create_menu_bar(self) -> None:
        """Create the application menu bar with all menus and actions.

        Creates the following menus:
        - File: Open XML file, recent files, exit
        - Settings: Open settings dialog
        - Edit: Copy, select all, clear results
        - View: Toggle progress/results visibility, fullscreen
        - Help: User guide, keyboard shortcuts, about
        """
        menubar = self.menuBar()

        # File Menu
        file_menu = menubar.addMenu("&File")

        # Open XML File (Step 8: shortcuts in menus - Design 8.14)
        open_action = QAction("&Open XML File...", self)
        open_action.setShortcut(QKeySequence.Open)
        open_action.setToolTip("Open XML file (Ctrl+O)")
        open_action.triggered.connect(self.on_file_open)
        file_menu.addAction(open_action)

        # Start Processing (Step 8: keyboard-accessible - Design 8.61)
        self.start_action = QAction("&Start Processing", self)
        self.start_action.setShortcut(QKeySequence("F5"))
        self.start_action.setToolTip("Start processing (F5)")
        self.start_action.triggered.connect(self._on_enter_start)
        self.start_action.setEnabled(False)
        file_menu.addAction(self.start_action)

        file_menu.addSeparator()

        # Recent Files submenu
        self.recent_files_menu = QMenu("Recent Files", self)
        self.recent_files_menu.aboutToShow.connect(self.update_recent_files_menu)
        file_menu.addMenu(self.recent_files_menu)

        file_menu.addSeparator()

        # Exit
        exit_action = QAction("E&xit", self)
        exit_action.setShortcut(QKeySequence.Quit)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        # Settings Menu - ADDED AFTER FILE MENU
        settings_menu = menubar.addMenu("&Settings")

        # Open Settings
        settings_action = QAction("&Settings...", self)
        settings_action.setShortcut(QKeySequence("Ctrl+,"))
        settings_action.setToolTip("Open settings (Ctrl+,)")
        settings_action.triggered.connect(self.on_open_settings)
        settings_menu.addAction(settings_action)

        # Edit Menu
        edit_menu = menubar.addMenu("&Edit")

        # Copy selected results
        copy_action = QAction("&Copy", self)
        copy_action.setShortcut(QKeySequence.Copy)
        copy_action.setToolTip("Copy selected results (Ctrl+C)")
        copy_action.triggered.connect(self.on_copy_selected)
        edit_menu.addAction(copy_action)

        # Select All
        select_all_action = QAction("Select &All", self)
        select_all_action.setShortcut(QKeySequence.SelectAll)
        select_all_action.setToolTip("Select all results (Ctrl+A)")
        select_all_action.triggered.connect(self.on_select_all)
        edit_menu.addAction(select_all_action)

        edit_menu.addSeparator()

        # Clear Results
        clear_action = QAction("&Clear Results", self)
        clear_action.triggered.connect(self.on_clear_results)
        edit_menu.addAction(clear_action)

        # View Menu
        view_menu = menubar.addMenu("&View")

        # Show/Hide Progress
        self.toggle_progress_action = QAction("Show &Progress", self)
        self.toggle_progress_action.setCheckable(True)
        self.toggle_progress_action.setChecked(True)
        self.toggle_progress_action.triggered.connect(self.on_toggle_progress)
        view_menu.addAction(self.toggle_progress_action)

        # Show/Hide Results
        self.toggle_results_action = QAction("Show &Results", self)
        self.toggle_results_action.setCheckable(True)
        self.toggle_results_action.setChecked(True)
        self.toggle_results_action.triggered.connect(self.on_toggle_results)
        view_menu.addAction(self.toggle_results_action)

        view_menu.addSeparator()

        # Full Screen
        fullscreen_action = QAction("&Full Screen", self)
        fullscreen_action.setShortcut(QKeySequence.FullScreen)
        fullscreen_action.setToolTip("Toggle fullscreen mode (F11)")
        fullscreen_action.setCheckable(True)
        fullscreen_action.triggered.connect(self.toggle_fullscreen)
        view_menu.addAction(fullscreen_action)

        # Help Menu
        help_menu = menubar.addMenu("&Help")

        # User Guide
        guide_action = QAction("&User Guide", self)
        guide_action.setShortcut(QKeySequence.HelpContents)
        guide_action.setToolTip("Show user guide (F1)")
        guide_action.triggered.connect(self.on_show_user_guide)
        help_menu.addAction(guide_action)

        # Keyboard Shortcuts
        shortcuts_action = QAction("&Keyboard Shortcuts", self)
        shortcuts_action.setShortcut(QKeySequence("Ctrl+?"))
        shortcuts_action.setToolTip("Show keyboard shortcuts (Ctrl+?)")
        shortcuts_action.triggered.connect(self.on_show_shortcuts)
        help_menu.addAction(shortcuts_action)

        # Privacy
        privacy_action = QAction("&Privacy", self)
        privacy_action.setToolTip("Show privacy information and controls")
        privacy_action.triggered.connect(self.on_show_privacy)
        help_menu.addAction(privacy_action)

        # Terms of Use (Step 11)
        terms_action = QAction("Terms of &Use", self)
        terms_action.setToolTip("View terms of use")
        terms_action.triggered.connect(self.on_show_terms)
        help_menu.addAction(terms_action)

        # Third-Party Licenses (Step 11)
        licenses_action = QAction("Third-Party &Licenses", self)
        licenses_action.setToolTip("View third-party license notices")
        licenses_action.triggered.connect(self.on_show_licenses)
        help_menu.addAction(licenses_action)

        # Support Policy (Step 11)
        support_policy_action = QAction("Support &Policy", self)
        support_policy_action.setToolTip("View support SLA and response expectations")
        support_policy_action.triggered.connect(self.on_show_support_policy)
        help_menu.addAction(support_policy_action)

        # Onboarding tour
        onboarding_action = QAction("&Onboarding Tour...", self)
        onboarding_action.setToolTip("Show the first-run onboarding tour")
        onboarding_action.triggered.connect(self.on_show_onboarding)
        help_menu.addAction(onboarding_action)

        help_menu.addSeparator()

        # Check for Updates (Step 5)
        check_updates_action = QAction("Check for &Updates...", self)
        check_updates_action.setToolTip("Check for application updates")
        check_updates_action.triggered.connect(self.on_check_for_updates)
        help_menu.addAction(check_updates_action)

        help_menu.addSeparator()

        # Support & Diagnostics submenu (Step 9.5, Design 7.132)
        diagnostics_menu = help_menu.addMenu("Support & &Diagnostics")

        diagnostics_panel_action = QAction("&Diagnostics Panel...", self)
        diagnostics_panel_action.setToolTip("Show log path, run ID, and service health")
        diagnostics_panel_action.triggered.connect(self._on_show_diagnostics_panel)
        diagnostics_menu.addAction(diagnostics_panel_action)

        analytics_dashboard_action = QAction("&Analytics Dashboard...", self)
        analytics_dashboard_action.setToolTip(
            "View usage trends (run success rate, match rate)"
        )
        analytics_dashboard_action.triggered.connect(self._on_show_analytics_dashboard)
        diagnostics_menu.addAction(analytics_dashboard_action)

        log_viewer_action = QAction("&Log Viewer...", self)
        log_viewer_action.setToolTip("View application logs")
        log_viewer_action.triggered.connect(self.on_show_log_viewer)
        diagnostics_menu.addAction(log_viewer_action)

        support_bundle_action = QAction("Export &Support Bundle...", self)
        support_bundle_action.setToolTip(
            "Generate a support bundle zip with diagnostics and logs"
        )
        support_bundle_action.triggered.connect(self.on_export_support_bundle)
        diagnostics_menu.addAction(support_bundle_action)

        diagnostics_menu.addSeparator()

        open_logs_action = QAction("Open &Logs Folder", self)
        open_logs_action.setToolTip("Open the logs folder in your file manager")
        open_logs_action.triggered.connect(self.on_open_logs_folder)
        diagnostics_menu.addAction(open_logs_action)

        open_exports_action = QAction("Open &Exports Folder", self)
        open_exports_action.setToolTip("Open the exports folder in your file manager")
        open_exports_action.triggered.connect(self.on_open_exports_folder)
        diagnostics_menu.addAction(open_exports_action)

        diagnostics_menu.addSeparator()

        report_issue_action = QAction("&Report Issue...", self)
        report_issue_action.setToolTip("Open the issue tracker (if configured)")
        report_issue_action.triggered.connect(self.on_report_issue)
        diagnostics_menu.addAction(report_issue_action)

        test_sentry_action = QAction("Send &test event to Sentry", self)
        test_sentry_action.setToolTip(
            "Send a test error to Sentry to verify reporting is working"
        )
        test_sentry_action.triggered.connect(self._on_test_sentry_report)
        diagnostics_menu.addAction(test_sentry_action)

        help_menu.addSeparator()

        # About (includes changelog)
        about_action = QAction("&About CuePoint", self)
        about_action.triggered.connect(self.on_show_about)
        help_menu.addAction(about_action)

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        """Handle drag enter event for drag-and-drop file support.

        Accepts the drag operation if a single XML file is being dragged.

        Args:
            event: QDragEnterEvent containing drag information.
        """
        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if len(urls) == 1 and urls[0].toLocalFile().endswith(".xml"):
                event.acceptProposedAction()

    def dropEvent(self, event: QDropEvent) -> None:
        """Handle drop event for drag-and-drop file support.

        Processes the dropped file and forwards it to the file selector
        if it's a valid XML file.

        Args:
            event: QDropEvent containing drop information.
        """
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files and files[0].lower().endswith(".xml"):
            # Forward to file selector
            self.file_selector.set_file(files[0])
            event.acceptProposedAction()

    def on_file_open(self) -> None:
        """Handle File > Open menu action.

        Opens the file browser for the current source (Collection XML or Playlist file).
        """
        if getattr(self, "_source_mode", "collection") == "playlist_file":
            self.playlist_file_selector.browse_file()
        else:
            self.file_selector.browse_file()

    def _on_source_collection_clicked(self) -> None:
        """Switch to Collection source; show XML picker; keep M3U path when switching."""
        self.source_playlist_file_btn.setChecked(False)
        self.source_collection_btn.setChecked(True)
        self._source_mode = "collection"
        self.source_content_box.setVisible(True)
        self.source_content_stack.setCurrentIndex(0)
        self.batch_mode_radio.setVisible(True)
        self.batch_mode_radio.setEnabled(True)
        self.batch_mode_radio.setToolTip("")
        self.playlist_stack.setCurrentIndex(0)
        if self._config_service:
            try:
                self._config_service.set("product.last_source", "collection")
                self._config_service.save()
            except Exception:
                pass
        xml_path = self.file_selector.get_file_path()
        if xml_path and self.file_selector.validate_file(xml_path):
            self.on_file_selected(xml_path)
        else:
            self._hide_mode_playlist_boxes()
            self.start_button_container.setVisible(False)
            self._set_start_enabled(False)
        self._update_empty_state_hint()

    def _on_source_playlist_file_clicked(self) -> None:
        """Switch to Playlist file source; show M3U picker; keep XML path when switching."""
        self.source_collection_btn.setChecked(False)
        self.source_playlist_file_btn.setChecked(True)
        self._source_mode = "playlist_file"
        self.source_content_box.setVisible(True)
        self.source_content_stack.setCurrentIndex(1)
        self.batch_mode_radio.setVisible(False)
        self.batch_mode_radio.setEnabled(False)
        self.playlist_stack.setCurrentIndex(1)
        if self._config_service:
            try:
                self._config_service.set("product.last_source", "playlist_file")
                self._config_service.save()
            except Exception:
                pass
        m3u_path = self.playlist_file_selector.get_file_path()
        if m3u_path and self.playlist_file_selector.validate_file(m3u_path):
            self.on_playlist_file_selected(m3u_path)
        else:
            self._hide_mode_playlist_boxes()
            self.start_button_container.setVisible(False)
            self._set_start_enabled(False)
        self._update_empty_state_hint()

    def on_playlist_file_selected(self, file_path: str) -> None:
        """Handle playlist file (M3U/M3U8) selection. Show mode (Single only), playlist filename, enable Start."""
        if self.playlist_file_selector.validate_file(file_path):
            self.mode_box.setVisible(True)
            self.single_mode_radio.setChecked(True)
            self.batch_mode_radio.setVisible(False)
            self.batch_mode_radio.setEnabled(False)
            self.playlist_box.setVisible(True)
            self.playlist_stack.setCurrentIndex(1)
            self.playlist_filename_label.setText(f"Playlist: {os.path.basename(file_path)}")
            self.start_button_container.setVisible(True)
            self.start_button.setVisible(True)
            self._set_start_enabled(True)
            self.statusBar().showMessage(f"Playlist file loaded: {os.path.basename(file_path)}")
            if self._config_service:
                try:
                    self._config_service.set("product.last_m3u_path", file_path)
                    self._config_service.save()
                except Exception:
                    pass
        else:
            self._hide_mode_playlist_boxes()
            self.start_button_container.setVisible(False)
            self._set_start_enabled(False)
            self.statusBar().showMessage(f"Invalid file: {file_path}")
        self._update_empty_state_hint()

    def on_file_selected(self, file_path: str) -> None:
        """Handle file selection from FileSelector widget.

        Validates the selected file, loads playlists into the playlist
        selector, updates the batch processor, and saves to recent files.
        Shows processing mode selection after valid file is selected (progressive disclosure).

        Args:
            file_path: Path to the selected XML file.
        """
        if self.file_selector.validate_file(file_path):
            self.statusBar().showMessage(
                f"Loading XML file: {os.path.basename(file_path)}..."
            )
            try:
                # Load playlists into playlist selector
                self.playlist_selector.load_xml_file(file_path)
                playlist_count = len(self.playlist_selector.playlists)
                self.statusBar().showMessage(
                    f"File loaded: {playlist_count} playlists found"
                )

                # Update batch processor with tree (same hierarchy as single mode)
                if self.playlist_selector.playlists and self.playlist_selector.get_tree_roots():
                    self.batch_processor.set_playlist_tree(
                        self.playlist_selector.get_tree_roots(),
                        self.playlist_selector.playlists,
                    )
                else:
                    self.batch_processor.set_playlists([])

                # SHOW MODE BOX (progressive disclosure); Batch is available for Collection
                self.mode_box.setVisible(True)
                self.batch_mode_radio.setVisible(True)
                self.batch_mode_radio.setEnabled(True)

                # Update status bar with file path
                self._update_status_file_path(file_path)

                if self._config_service:
                    try:
                        self._config_service.set("product.last_xml_path", file_path)
                        self._config_service.save()
                    except Exception:
                        pass

                # Process events to ensure visibility update is applied
                from PySide6.QtWidgets import QApplication

                QApplication.processEvents()

                # Save to recent files (don't let this fail hide the mode_group)
                try:
                    if hasattr(self, "save_recent_file"):
                        self.save_recent_file(file_path)
                except Exception as save_error:
                    # Log but don't fail - recent files is optional
                    import traceback

                    print(f"Warning: Could not save to recent files: {save_error}")
                    traceback.print_exc()
            except Exception as e:
                import traceback

                print(f"Error in on_file_selected: {e}")
                traceback.print_exc()
                self.statusBar().showMessage(f"Error loading XML: {str(e)}")
                # Hide mode/playlist on error
                self._hide_mode_playlist_boxes()
                self.start_button_container.setVisible(False)
                self._set_start_enabled(False)
        else:
            self.statusBar().showMessage(f"Invalid file: {file_path}")
            # Clear playlist selector if file is invalid
            self.playlist_selector.clear()
            self.batch_processor.set_playlists([])
            # Hide mode/playlist for invalid file
            self._hide_mode_playlist_boxes()
            self.start_button_container.setVisible(False)
            self._set_start_enabled(False)

        self._update_empty_state_hint()

    def _hide_mode_playlist_boxes(self):
        """Hide mode and playlist boxes."""
        self.mode_box.setVisible(False)
        self.playlist_box.setVisible(False)
        self.start_button.setVisible(False)
        self._update_empty_state_hint()

    def _on_empty_state_instructions(self) -> None:
        """Open instructions for current source (Collection XML or Playlist file export)."""
        if getattr(self, "_source_mode", "collection") == "playlist_file":
            self.playlist_file_selector.show_instructions()
        else:
            self.file_selector.show_instructions()

    def _update_empty_state_hint(self) -> None:
        """Show/hide the onboarding-style empty hint based on current state and source."""
        try:
            if not hasattr(self, "empty_state_hint") or not hasattr(
                self, "file_selector"
            ):
                return
            source = getattr(self, "_source_mode", "collection")
            if source == "playlist_file":
                path = self.playlist_file_selector.get_file_path()
                valid = path and self.playlist_file_selector.validate_file(path)
                # Show "Get started" only the first time (persisted flag)
                already_seen = bool(
                    self._config_service.get("product.playlist_file_get_started_seen", False)
                    if getattr(self, "_config_service", None) else False
                )
                show = not valid and not already_seen
                if hasattr(self, "hint_title"):
                    self.hint_title.setText("Get started")
                if hasattr(self, "hint_body"):
                    self.hint_body.setText(
                        "Select a playlist file (.m3u or .m3u8) to process tracks without loading the full collection."
                    )
                if hasattr(self, "browse_hint_btn"):
                    self.browse_hint_btn.setText("Select playlist file...")
                if show and getattr(self, "_config_service", None):
                    try:
                        self._config_service.set("product.playlist_file_get_started_seen", True)
                        self._config_service.save()
                    except Exception:
                        pass
            else:
                file_path = self.file_selector.get_file_path()
                show = not file_path or not self.file_selector.validate_file(file_path)
                if hasattr(self, "hint_title"):
                    self.hint_title.setText(EmptyState.GET_STARTED_TITLE)
                if hasattr(self, "hint_body"):
                    self.hint_body.setText(EmptyState.GET_STARTED_BODY)
                if hasattr(self, "browse_hint_btn"):
                    self.browse_hint_btn.setText(EmptyState.BROWSE_FOR_XML)
            self.empty_state_hint.setVisible(show)
        except Exception:
            # Never let hint logic break the UI.
            return

    def on_mode_changed(self) -> None:
        """Handle processing mode change between single and batch modes."""
        is_batch_mode = self.batch_mode_radio.isChecked()
        is_single_mode = self.single_mode_radio.isChecked()

        if not is_batch_mode and not is_single_mode:
            self.playlist_box.setVisible(False)
            self.start_button.setVisible(False)
            self.batch_processor.setVisible(False)
            return

        if is_single_mode:
            self.playlist_box.setVisible(True)
            self.start_button.setVisible(True)
            self.batch_processor.setVisible(False)
        else:
            self.playlist_box.setVisible(False)
            self.start_button.setVisible(False)
            self.batch_processor.setVisible(True)

        # ENABLE START BUTTON if mode is selected (but it will be enabled/disabled based on playlist selection)
        if is_batch_mode:
            # Batch mode - button enabled by batch processor
            pass
        else:
            # Single mode - enable when playlist is selected (Collection) or when M3U is set (Playlist file)
            if getattr(self, "_source_mode", "collection") == "playlist_file":
                m3u = getattr(self, "playlist_file_selector", None)
                if m3u and m3u.get_file_path() and m3u.validate_file(m3u.get_file_path()):
                    self._set_start_enabled(True)
                else:
                    self._set_start_enabled(False)
            else:
                self._set_start_enabled(False)  # Disable until playlist is selected

        # Update batch processor with playlists if file is already loaded
        if is_batch_mode and hasattr(self.playlist_selector, "playlists"):
            if self.playlist_selector.playlists and self.playlist_selector.get_tree_roots():
                self.batch_processor.set_playlist_tree(
                    self.playlist_selector.get_tree_roots(),
                    self.playlist_selector.playlists,
                )
            else:
                self.batch_processor.set_playlists([])

        # Update status bar
        mode_text = "Multiple Playlists" if is_batch_mode else "Single Playlist"
        self.statusBar().showMessage(f"Mode: {mode_text}")

    def update_recent_files_menu(self) -> None:
        """Update the Recent Files submenu with saved file paths.

        Loads recent files from QSettings and populates the menu with
        up to 10 most recent files. Shows "No recent files" if empty.
        Includes timestamps and file paths in tooltips.
        """
        self.recent_files_menu.clear()

        settings = QSettings("CuePoint", "CuePoint")
        recent_files = settings.value("recent_files", [])

        if not recent_files:
            action = QAction("No recent files", self)
            action.setEnabled(False)
            self.recent_files_menu.addAction(action)
        else:
            # Filter out files that no longer exist
            valid_files = [f for f in recent_files[:10] if os.path.exists(f)]

            # Update settings if any files were removed
            if len(valid_files) < len(recent_files[:10]):
                settings.setValue("recent_files", valid_files + recent_files[10:])

            if not valid_files:
                action = QAction("No recent files", self)
                action.setEnabled(False)
                self.recent_files_menu.addAction(action)
            else:
                for file_path in valid_files:
                    file_name = os.path.basename(file_path)
                    # Get file modification time for display
                    try:
                        mtime = os.path.getmtime(file_path)
                        from datetime import datetime

                        dt = datetime.fromtimestamp(mtime)
                        # Format: "Today, 2:30 PM" or "Yesterday" or "Jan 15"
                        now = datetime.now()
                        if dt.date() == now.date():
                            time_str = f"Today, {dt.strftime('%I:%M %p')}"
                        elif (
                            dt.date()
                            == (now.date() - datetime.timedelta(days=1)).date()
                        ):
                            time_str = "Yesterday"
                        else:
                            time_str = dt.strftime("%b %d")

                        # Display: "filename.xml - Today, 2:30 PM"
                        display_text = f"{file_name} - {time_str}"
                    except Exception:
                        display_text = file_name

                    action = QAction(display_text, self)
                    action.setData(file_path)
                    # Tooltip with full path
                    action.setToolTip(file_path)
                    action.triggered.connect(
                        lambda checked, path=file_path: self.on_open_recent_file(path)
                    )
                    self.recent_files_menu.addAction(action)

                # Add separator and Clear Recent Files option
                self.recent_files_menu.addSeparator()
                clear_action = QAction("Clear Recent Files", self)
                clear_action.triggered.connect(self.clear_recent_files)
                self.recent_files_menu.addAction(clear_action)

    def on_open_recent_file(self, file_path: str) -> None:
        """Open a file from the Recent Files menu.

        Validates that the file exists, then loads it. If the file
        no longer exists, removes it from recent files and shows a warning.

        Args:
            file_path: Path to the file to open.
        """
        if os.path.exists(file_path):
            self.file_selector.set_file(file_path)
            # set_file will emit file_selected signal, which will call on_file_selected
        else:
            # Remove invalid file from recent files
            settings = QSettings("CuePoint", "CuePoint")
            recent_files = settings.value("recent_files", [])
            if file_path in recent_files:
                recent_files.remove(file_path)
                settings.setValue("recent_files", recent_files)
            self.update_recent_files_menu()
            QMessageBox.warning(
                self, "File Not Found", f"The file no longer exists:\n{file_path}"
            )

    def save_recent_file(self, file_path: str) -> None:
        """Save a file path to the recent files list.

        Adds the file to the top of the recent files list and maintains
        a maximum of 10 recent files. Saves to QSettings for persistence.
        Also updates the recent files menu.

        Args:
            file_path: Path to the file to save.
        """
        if not file_path or not os.path.exists(file_path):
            return  # Don't save invalid files

        settings = QSettings("CuePoint", "CuePoint")
        recent_files = settings.value("recent_files", [])

        if not isinstance(recent_files, list):
            recent_files = []

        if file_path in recent_files:
            recent_files.remove(file_path)
        recent_files.insert(0, file_path)

        # Keep only last 10
        recent_files = recent_files[:10]
        settings.setValue("recent_files", recent_files)

        # Update menu if it exists
        if hasattr(self, "recent_files_menu"):
            self.update_recent_files_menu()

    def clear_recent_files(self) -> None:
        """Clear all recent files from the list."""
        reply = QMessageBox.question(
            self,
            "Clear Recent Files",
            "Are you sure you want to clear all recent files?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )

        if reply == QMessageBox.Yes:
            settings = QSettings("CuePoint", "CuePoint")
            settings.setValue("recent_files", [])
            self.update_recent_files_menu()

    def on_copy_selected(self) -> None:
        """Copy selected results to clipboard via Edit > Copy (Ctrl+C).

        Extracts selected rows from the results table and copies them
        as tab-separated text to the clipboard.
        """
        # Get selected items from results table
        if hasattr(self, "results_view") and self.results_view.results:
            selected_items = self.results_view.table.selectedItems()
            if selected_items:
                # Get selected rows
                selected_rows = set()
                for item in selected_items:
                    selected_rows.add(item.row())

                # Build text to copy
                lines = []
                for row in sorted(selected_rows):
                    row_data = []
                    for col in range(self.results_view.table.columnCount()):
                        item = self.results_view.table.item(row, col)
                        row_data.append(item.text() if item else "")
                    lines.append("\t".join(row_data))

                if lines:
                    from PySide6.QtWidgets import QApplication

                    clipboard = QApplication.clipboard()
                    clipboard.setText("\n".join(lines))
                    self.statusBar().showMessage("Copied to clipboard", 2000)
            else:
                self.statusBar().showMessage("No items selected", 2000)
        else:
            self.statusBar().showMessage("No results to copy", 2000)

    def on_select_all(self) -> None:
        """Select all items in results table via Edit > Select All (Ctrl+A).

        Selects all rows in the results table if results are available.
        """
        if hasattr(self, "results_view") and self.results_view.table.rowCount() > 0:
            self.results_view.table.selectAll()
            self.statusBar().showMessage("All items selected", 2000)
        else:
            self.statusBar().showMessage("No results to select", 2000)

    def on_clear_results(self) -> None:
        """Clear results display via Edit > Clear Results.

        Prompts the user for confirmation before clearing all results
        and hiding the results group.
        """
        if hasattr(self, "results_view"):
            reply = QMessageBox.question(
                self,
                "Clear Results",
                "Are you sure you want to clear all results?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )
            if reply == QMessageBox.Yes:
                self.results_view.clear()
                self.results_group.setVisible(False)
                self.statusBar().showMessage("Results cleared", 2000)

    def on_toggle_progress(self) -> None:
        """Toggle progress section visibility via View > Show/Hide Progress.

        Shows or hides the progress group based on the menu action state
        and updates the menu text accordingly.
        """
        is_visible = self.toggle_progress_action.isChecked()
        self.progress_group.setVisible(is_visible)
        # Update menu text based on current state
        if is_visible:
            self.toggle_progress_action.setText("Hide &Progress")
        else:
            self.toggle_progress_action.setText("Show &Progress")

    def on_toggle_results(self) -> None:
        """Toggle results section visibility via View > Show/Hide Results.

        Shows or hides the results group based on the menu action state
        and updates the menu text accordingly.
        """
        is_visible = self.toggle_results_action.isChecked()
        self.results_group.setVisible(is_visible)
        # Update menu text based on current state
        if is_visible:
            self.toggle_results_action.setText("Hide &Results")
        else:
            self.toggle_results_action.setText("Show &Results")

    def toggle_fullscreen(self) -> None:
        """Toggle fullscreen mode via View > Full Screen (F11).

        Switches between normal and fullscreen window modes.
        """
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()

    def on_show_user_guide(self) -> None:
        """Show user guide dialog via Help > User Guide (F1).

        Opens a dialog displaying the user guide documentation.
        """
        dialog = UserGuideDialog(self)
        dialog.exec()

    def on_show_onboarding(self) -> None:
        """Show the onboarding tour via Help menu."""
        try:
            from cuepoint.ui.dialogs.onboarding_dialog import OnboardingDialog

            dialog = OnboardingDialog(self)
            dialog.exec()
        except Exception as e:
            QMessageBox.warning(self, "Onboarding", f"Could not open onboarding:\n{e}")

    def on_show_shortcuts(self) -> None:
        """Show keyboard shortcuts dialog via Help > Keyboard Shortcuts (Ctrl+?).

        Opens a dialog displaying all available keyboard shortcuts.
        """
        try:
            from cuepoint.ui.dialogs.shortcuts_dialog import ShortcutsDialog

            dialog = ShortcutsDialog(self.shortcut_manager, self)
            dialog.exec()
        except Exception as e:
            QMessageBox.warning(
                self, "Shortcuts", f"Could not open shortcuts dialog:\n{e}"
            )

    def on_show_privacy(self) -> None:
        """Show privacy information and data controls via Help > Privacy."""
        try:
            from cuepoint.ui.dialogs.privacy_dialog import PrivacyDialog

            dialog = PrivacyDialog(self)
            dialog.exec()
        except Exception as e:
            QMessageBox.warning(self, "Privacy", f"Could not open Privacy dialog:\n{e}")

    def on_show_terms(self) -> None:
        """Show terms of use via Help > Terms of Use (Step 11)."""
        try:
            from PySide6.QtWidgets import (
                QDialog,
                QDialogButtonBox,
                QTextEdit,
                QVBoxLayout,
            )

            from cuepoint.utils.policy_docs import find_terms_of_use, load_policy_text

            path = find_terms_of_use()
            text = load_policy_text(
                path,
                "Terms of use could not be loaded. See docs/policy/terms-of-use.md",
            )
            dlg = QDialog(self)
            dlg.setWindowTitle("Terms of Use")
            dlg.setMinimumSize(700, 520)
            v = QVBoxLayout(dlg)
            view = QTextEdit()
            view.setReadOnly(True)
            view.setPlainText(text)
            v.addWidget(view)
            bb = QDialogButtonBox(QDialogButtonBox.Ok)
            bb.accepted.connect(dlg.accept)
            v.addWidget(bb)
            dlg.exec()
        except Exception as e:
            QMessageBox.warning(self, "Terms of Use", f"Could not open terms:\n{e}")

    def on_show_licenses(self) -> None:
        """Show third-party licenses via Help > Third-Party Licenses (Step 11)."""
        try:
            from PySide6.QtWidgets import (
                QDialog,
                QDialogButtonBox,
                QTextEdit,
                QVBoxLayout,
            )

            from cuepoint.utils.policy_docs import (
                find_third_party_licenses,
                load_policy_text,
            )

            path = find_third_party_licenses()
            text = load_policy_text(
                path,
                "Third-party licenses could not be loaded. See THIRD_PARTY_LICENSES.txt",
            )
            dlg = QDialog(self)
            dlg.setWindowTitle("Third-Party Licenses")
            dlg.setMinimumSize(700, 520)
            v = QVBoxLayout(dlg)
            view = QTextEdit()
            view.setReadOnly(True)
            view.setPlainText(text)
            v.addWidget(view)
            bb = QDialogButtonBox(QDialogButtonBox.Ok)
            bb.accepted.connect(dlg.accept)
            v.addWidget(bb)
            dlg.exec()
        except Exception as e:
            QMessageBox.warning(
                self, "Third-Party Licenses", f"Could not open licenses:\n{e}"
            )

    def on_show_support_policy(self) -> None:
        """Show support policy via Help > Support Policy (Step 11)."""
        try:
            from PySide6.QtWidgets import (
                QDialog,
                QDialogButtonBox,
                QTextEdit,
                QVBoxLayout,
            )

            from cuepoint.utils.policy_docs import find_support_policy, load_policy_text

            path = find_support_policy()
            text = load_policy_text(
                path,
                "Support policy could not be loaded. See docs/policy/support-sla.md",
            )
            dlg = QDialog(self)
            dlg.setWindowTitle("Support Policy")
            dlg.setMinimumSize(700, 520)
            v = QVBoxLayout(dlg)
            view = QTextEdit()
            view.setReadOnly(True)
            view.setPlainText(text)
            v.addWidget(view)
            bb = QDialogButtonBox(QDialogButtonBox.Ok)
            bb.accepted.connect(dlg.accept)
            v.addWidget(bb)
            dlg.exec()
        except Exception as e:
            QMessageBox.warning(
                self, "Support Policy", f"Could not open support policy:\n{e}"
            )

    def _on_show_analytics_dashboard(self) -> None:
        """Show analytics dashboard (Step 14) via Help > Support & Diagnostics."""
        try:
            from cuepoint.ui.dialogs.telemetry_dashboard_dialog import (
                TelemetryDashboardDialog,
            )

            dialog = TelemetryDashboardDialog(self)
            dialog.exec()
        except Exception as e:
            from PySide6.QtWidgets import QMessageBox

            QMessageBox.warning(
                self,
                "Analytics Dashboard",
                f"Could not open analytics dashboard:\n{e}",
            )

    def _on_show_diagnostics_panel(self) -> None:
        """Show diagnostics panel (Design 7.132): log path, run ID, health checks."""
        try:
            from cuepoint.ui.dialogs.diagnostics_panel_dialog import (
                DiagnosticsPanelDialog,
            )

            dialog = DiagnosticsPanelDialog(self)
            dialog.exec()
        except Exception as e:
            QMessageBox.warning(
                self, "Diagnostics", f"Could not open diagnostics panel:\n{e}"
            )

    def on_show_log_viewer(self) -> None:
        """Show the log viewer dialog."""
        try:
            from cuepoint.ui.widgets.log_viewer import LogViewer

            dialog = LogViewer(self)
            dialog.exec()
        except Exception as e:
            QMessageBox.warning(self, "Log Viewer", f"Could not open log viewer:\n{e}")

    def on_export_support_bundle(self) -> None:
        """Generate and export a support bundle zip (Step 9.5)."""
        try:
            from cuepoint.ui.dialogs.support_dialog import SupportBundleDialog

            dialog = SupportBundleDialog(self)
            if dialog.exec() == QDialog.DialogCode.Accepted:
                # Bundle was generated successfully
                pass
        except Exception as e:
            QMessageBox.critical(
                self, "Support Bundle", f"Failed to create support bundle:\n{e}"
            )

    def on_open_logs_folder(self) -> None:
        """Open the logs folder in the OS file manager (Step 9.5)."""
        from cuepoint.utils.paths import AppPaths

        self._open_folder(AppPaths.logs_dir())

    def on_open_exports_folder(self) -> None:
        """Open the exports folder in the OS file manager (Step 9.5)."""
        from cuepoint.utils.paths import AppPaths

        self._open_folder(AppPaths.exports_dir())

    def on_report_issue(self) -> None:
        """Open the issue reporting dialog (Step 9.5).

        Shows a dialog for reporting issues with pre-filled information.
        """
        try:
            from cuepoint.ui.dialogs.report_issue_dialog import ReportIssueDialog

            dialog = ReportIssueDialog(self)
            dialog.exec()
        except Exception as e:
            QMessageBox.warning(
                self, "Report Issue", f"Could not open issue reporter:\n{e}"
            )

    def _on_test_sentry_report(self) -> None:
        """Send a test event to Sentry so the user can verify reporting works."""
        try:
            from cuepoint.utils.error_reporting_prefs import ErrorReportingPrefs

            prefs = ErrorReportingPrefs()
            if not (prefs.is_enabled() and prefs.has_user_consented()):
                QMessageBox.warning(
                    self,
                    "Sentry test",
                    "Error reporting is off.\n\n"
                    'Enable it in Settings → Privacy → "Send error reports to help fix bugs", '
                    "then try again.",
                    QMessageBox.Ok,
                )
                return
        except Exception:
            pass
        import logging

        logger = logging.getLogger(__name__)
        logger.error("CuePoint Sentry test event (user-triggered)")
        QMessageBox.information(
            self,
            "Sentry test",
            "A test event was sent to Sentry.\n\n"
            "Check your Sentry project (Issues) in a few seconds.",
            QMessageBox.Ok,
        )

    def _open_folder(self, folder_path) -> None:
        """Open a folder in the OS file manager."""
        try:
            folder_str = str(folder_path)
            if platform.system() == "Windows":
                subprocess.Popen(f'explorer "{folder_str}"')
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", folder_str])
            else:
                subprocess.Popen(["xdg-open", folder_str])
        except Exception as e:
            QMessageBox.warning(self, "Open Folder", f"Could not open folder:\n{e}")

    def _reveal_file(self, file_path) -> None:
        """Reveal a file in the OS file manager (best-effort)."""
        try:
            file_str = str(file_path)
            if platform.system() == "Windows":
                subprocess.Popen(f'explorer /select,"{file_str}"')
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", "-R", file_str])
            else:
                # Linux: open the parent folder (no standard "reveal" API)
                from pathlib import Path

                subprocess.Popen(["xdg-open", str(Path(file_str).parent)])
        except Exception:
            return

    def _set_window_icon(self) -> None:
        """Set the window icon from application icon or logo."""
        from pathlib import Path

        from PySide6.QtWidgets import QApplication

        # Try to get icon from QApplication first (set in gui_app.py)
        app = QApplication.instance()
        if app and not app.windowIcon().isNull():
            self.setWindowIcon(app.windowIcon())
            return

        # Fallback: load icon directly (use platform-specific when frozen)
        if getattr(sys, "frozen", False):
            if hasattr(sys, "_MEIPASS"):
                base_path = Path(sys._MEIPASS)
            else:
                import os

                base_path = Path(os.path.dirname(sys.executable))
            if sys.platform == "win32":
                ico = base_path / "icon.ico"
                icon_path = (
                    ico if ico.exists() else base_path / "assets" / "icons" / "logo.png"
                )
            elif sys.platform == "darwin":
                icns = base_path / "icon.icns"
                icon_path = (
                    icns
                    if icns.exists()
                    else base_path / "assets" / "icons" / "logo.png"
                )
            else:
                icon_path = base_path / "assets" / "icons" / "logo.png"
        else:
            # Running as script - use src/cuepoint/ui/assets/icons
            base_path = Path(__file__).resolve().parent
            icon_path = base_path / "assets" / "icons" / "logo.png"

        if icon_path.exists():
            try:
                icon = QIcon(str(icon_path))
                if not icon.isNull():
                    self.setWindowIcon(icon)
            except Exception:
                pass

    def _load_logo_for_statusbar(self) -> Optional[QLabel]:
        """Load logo for status bar (top right corner).

        Returns:
            QLabel with logo pixmap, or None if logo not found.
        """
        from pathlib import Path

        from PySide6.QtGui import QPixmap

        # Determine the logo path
        if getattr(sys, "frozen", False):
            # Running as packaged app
            if hasattr(sys, "_MEIPASS"):
                base_path = Path(sys._MEIPASS)
            else:
                base_path = Path(os.path.dirname(sys.executable))
            logo_path = base_path / "assets" / "icons" / "logo.png"
        else:
            # Running as script - use src/cuepoint/ui/assets/icons
            base_path = Path(__file__).resolve().parent
            logo_path = base_path / "assets" / "icons" / "logo.png"

        if not logo_path.exists():
            return None

        try:
            pixmap = QPixmap(str(logo_path))
            if pixmap.isNull():
                return None

            # Scale to fit status bar (small size: 80px width)
            if pixmap.width() > 80:
                pixmap = pixmap.scaledToWidth(
                    80, Qt.TransformationMode.SmoothTransformation
                )

            logo_label = QLabel()
            logo_label.setPixmap(pixmap)
            logo_label.setAlignment(Qt.AlignCenter)
            return logo_label
        except Exception:
            return None

    def on_show_about(self) -> None:
        """Show about dialog via Help > About CuePoint.

        Opens a dialog displaying application information and version.
        """
        dialog = AboutDialog(self)
        dialog.exec()

    def on_show_changelog(self) -> None:
        """Show changelog viewer via Help > Changelog (Step 9.6)."""
        try:
            from cuepoint.ui.widgets.changelog_viewer import ChangelogViewer

            dialog = ChangelogViewer(self)
            dialog.exec()
        except Exception as e:
            QMessageBox.warning(
                self, "Changelog", f"Could not open changelog viewer:\n{e}"
            )

    def _setup_update_system(self) -> None:
        """Set up update system (Step 5.5)."""
        import logging
        import sys

        logger = logging.getLogger(__name__)

        # Skip update system during pytest/CI - avoids scheduled timers and network
        # calls that can hang on Windows (Design: test stability)
        if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get(
            "CUEPOINT_SKIP_UPDATE_CHECK"
        ):
            self.update_manager = None
            return

        logger.info("=" * 60)
        logger.info("UPDATE SYSTEM SETUP - Starting initialization")
        logger.info("=" * 60)

        # For packaged apps, be extra defensive - if anything fails, disable update system
        is_frozen = getattr(sys, "frozen", False)
        logger.info(f"Environment: frozen={is_frozen}, executable={sys.executable}")

        try:
            # First, verify Qt is fully initialized before proceeding
            logger.info("Step 1: Verifying Qt initialization...")
            from PySide6.QtCore import (
                QTimer,  # Import QTimer unconditionally (already imported at top, but ensure it's available)
            )
            from PySide6.QtWidgets import QApplication

            app = QApplication.instance()
            if app is None:
                logger.warning(
                    "QApplication not initialized, skipping update system setup"
                )
                self.update_manager = None
                return
            logger.info(f"✓ QApplication instance found: {app}")

            # For frozen apps, add extra validation
            if is_frozen:
                logger.info("Step 2: Running Qt validation for frozen app...")
                # Verify we can import Qt modules and create objects
                try:
                    from PySide6.QtCore import QObject

                    # Test creating a simple QObject to verify Qt is working
                    test_obj = QObject()
                    del test_obj
                    logger.info("✓ Qt validation passed for frozen app")
                except Exception as qt_error:
                    logger.error(
                        f"✗ Qt validation failed in frozen app: {qt_error}",
                        exc_info=True,
                    )
                    self.update_manager = None
                    return  # Don't proceed if Qt isn't working
            else:
                logger.info("Step 2: Skipping Qt validation (not frozen)")

            logger.info("Step 3: Importing update system modules...")
            from cuepoint.update.update_manager import UpdateManager
            from cuepoint.version import get_version

            logger.info("✓ Update system modules imported")

            current_version = get_version()
            feed_url = "https://stuchain.github.io/CuePoint/updates"
            logger.info(
                f"Step 4: Creating UpdateManager (version={current_version}, feed={feed_url})..."
            )

            # Create update manager with error handling
            try:
                self.update_manager = UpdateManager(current_version, feed_url)
                logger.info("✓ Update manager created successfully")
            except Exception as create_error:
                logger.error(
                    f"✗ Failed to create update manager: {create_error}", exc_info=True
                )
                self.update_manager = None
                if is_frozen:
                    # In frozen apps, if update manager creation fails, disable entirely
                    logger.warning(
                        "Update system disabled in packaged app due to initialization failure"
                    )
                return  # Can't continue without update manager

            logger.info("Step 5: Setting up callbacks...")
            # Set callbacks with error handling
            try:
                logger.info("  - Setting on_update_available callback...")
                self.update_manager.set_on_update_available(self._on_update_available)
                logger.info("  ✓ on_update_available callback set")

                logger.info("  - Setting on_check_complete callback...")
                self.update_manager.set_on_check_complete(
                    self._on_update_check_complete
                )
                logger.info("  ✓ on_check_complete callback set")

                logger.info("  - Setting on_error callback...")
                self.update_manager.set_on_error(self._on_update_error)
                logger.info("  ✓ on_error callback set")

                logger.info("✓ All update manager callbacks set successfully")
            except Exception as callback_error:
                logger.error(
                    f"✗ Failed to set update manager callbacks: {callback_error}",
                    exc_info=True,
                )
                if is_frozen:
                    # In frozen apps, if callbacks fail, disable update system entirely
                    logger.warning(
                        "Update system disabled in packaged app due to callback failure"
                    )
                    self.update_manager = None
                    return
                # Continue anyway for non-frozen apps - update manager exists but callbacks may not work

            # Schedule startup check (after window is visible and fully initialized)
            # Use a longer delay for packaged apps to ensure everything is ready
            logger.info("Step 6: Scheduling startup update check...")
            try:
                # Longer delay for frozen apps: Qt init + macOS security settle
                # (user may have just allowed app in Privacy & Security)
                delay_ms = (
                    20000 if is_frozen else 5000
                )  # 20 seconds for frozen, 5 for dev
                QTimer.singleShot(delay_ms, self._check_for_updates_on_startup)
                logger.info(
                    f"✓ Startup update check scheduled (delay: {delay_ms}ms, frozen={is_frozen})"
                )
            except Exception as schedule_error:
                logger.error(
                    f"✗ Failed to schedule startup update check: {schedule_error}",
                    exc_info=True,
                )
                if is_frozen:
                    # In frozen apps, if scheduling fails, disable update system
                    logger.warning(
                        "Update system disabled in packaged app due to scheduling failure"
                    )
                    self.update_manager = None
                # Continue anyway for non-frozen apps - app can still work without startup check

            logger.info("=" * 60)
            logger.info("UPDATE SYSTEM SETUP - Completed successfully")
            logger.info("=" * 60)
        except Exception as e:
            # Update system is best-effort
            logger.error("=" * 60)
            logger.error(
                f"UPDATE SYSTEM SETUP - Failed with exception: {e}", exc_info=True
            )
            logger.error("=" * 60)
            if is_frozen:
                # In frozen apps, any exception means disable update system entirely
                logger.warning(
                    "Update system disabled in packaged app due to exception"
                )
            # Don't set to None if it already exists (might be partially initialized)
            if not hasattr(self, "update_manager"):
                self.update_manager = None

    def _check_for_updates_on_startup(self) -> None:
        """Check for updates on startup (Step 5.5)."""
        import logging

        logger = logging.getLogger(__name__)

        logger.info("=" * 60)
        logger.info("STARTUP UPDATE CHECK - Beginning check process")
        logger.info("=" * 60)

        try:
            logger.info("Step 1: Verifying update manager availability...")
            if not hasattr(self, "update_manager") or not self.update_manager:
                logger.warning("✗ Update manager not available for startup check")
                return
            logger.info("✓ Update manager is available")

            try:
                # Check if should check on startup
                logger.info("Step 2: Checking update preferences...")
                from cuepoint.update.update_preferences import UpdatePreferences

                check_frequency = self.update_manager.preferences.get_check_frequency()
                logger.info(f"  - Check frequency: {check_frequency}")
                logger.info(
                    f"  - CHECK_ON_STARTUP constant: {UpdatePreferences.CHECK_ON_STARTUP}"
                )

                if check_frequency == UpdatePreferences.CHECK_ON_STARTUP:
                    logger.info("✓ Update check on startup is enabled")
                    # Show update check dialog on startup (same as manual check)
                    # First, ensure the main window is fully visible and ready
                    try:
                        logger.info("Step 3: Verifying main window state...")
                        # Verify window is ready
                        is_visible = self.isVisible()
                        logger.info(f"  - Window visible: {is_visible}")
                        logger.info(f"  - Window geometry: {self.geometry()}")
                        logger.info(f"  - Window isMinimized: {self.isMinimized()}")
                        logger.info(f"  - Window isMaximized: {self.isMaximized()}")

                        if not is_visible:
                            logger.warning(
                                "✗ Main window not visible yet, skipping startup update check"
                            )
                            return

                        logger.info("✓ Main window is visible and ready")
                        # On macOS, use longer delay - windowing system needs more time
                        delay_ms = 1200 if sys.platform == "darwin" else 500
                        logger.info(
                            f"Step 4: Scheduling dialog creation ({delay_ms}ms delay)..."
                        )
                        from PySide6.QtCore import QTimer as QTimer2

                        QTimer2.singleShot(
                            delay_ms, lambda: self._do_startup_update_check()
                        )
                        logger.info("✓ Dialog creation scheduled")
                    except Exception as dialog_error:
                        logger.error(
                            f"✗ Error scheduling startup update check dialog: {dialog_error}",
                            exc_info=True,
                        )
                        # Don't crash the app if dialog fails

                        # Start the check - use force=True to ensure check runs on startup
                        # (force=False would check _should_check() which returns False for CHECK_ON_STARTUP)
                        logger.info("Step 5: Starting update check (force=True)...")
                        if self.update_manager.check_for_updates(force=True):
                            # Status will be updated via callbacks
                            logger.info("✓ Startup update check initiated")
                        else:
                            logger.warning(
                                "✗ Update check already in progress or failed to start"
                            )
                            if (
                                hasattr(self, "update_check_dialog")
                                and self.update_check_dialog
                            ):
                                self.update_check_dialog.set_error(
                                    "Update check already in progress"
                                )
                else:
                    logger.info(
                        f"✗ Update check on startup is disabled (frequency={check_frequency})"
                    )
                    return

            except Exception as dialog_error:
                logger.error(
                    f"✗ Error showing update check dialog: {dialog_error}",
                    exc_info=True,
                )
                # Don't crash the app if dialog fails
        except Exception as e:
            logger.warning(f"✗ Startup update check failed: {e}", exc_info=True)
            # Don't crash the app if update check fails
        except Exception as fatal_error:
            # Catch-all to prevent any update-related code from crashing the app
            logger.error(
                f"✗ Fatal error in startup update check: {fatal_error}", exc_info=True
            )

        logger.info("=" * 60)
        logger.info("STARTUP UPDATE CHECK - Process completed")
        logger.info("=" * 60)

    def _do_startup_update_check(self) -> None:
        """Actually perform the startup update check (called after delay)."""
        import logging

        logger = logging.getLogger(__name__)

        logger.info("=" * 60)
        logger.info("DO STARTUP UPDATE CHECK - Creating dialog and starting check")
        logger.info("=" * 60)

        try:
            # Safety: Verify MainWindow is still valid (not destroyed)
            try:
                if not self.isVisible() or not self.windowHandle():
                    logger.warning("Main window no longer valid, skipping update check")
                    return
            except (RuntimeError, AttributeError):
                logger.warning("Main window destroyed, skipping update check")
                return

            logger.info("Step 1: Verifying update manager...")
            if not hasattr(self, "update_manager") or not self.update_manager:
                logger.warning("✗ Update manager not available")
                return
            logger.info("✓ Update manager is available")

            logger.info("Step 2: Importing modules...")
            from cuepoint.update.update_ui import show_update_check_dialog
            from cuepoint.version import get_version

            logger.info("✓ Modules imported")

            # Show update check dialog on startup
            logger.info("Step 3: Creating update check dialog...")
            try:
                current_version = get_version()
                logger.info(f"  - Current version: {current_version}")
                logger.info(f"  - Parent widget: {self} (type: {type(self)})")
                logger.info(f"  - Parent visible: {self.isVisible()}")
                logger.info(f"  - Parent windowTitle: {self.windowTitle()}")

                self.update_check_dialog = show_update_check_dialog(
                    current_version, self
                )
                logger.info(
                    f"✓ Update check dialog created: {self.update_check_dialog}"
                )
                logger.info(f"  - Dialog type: {type(self.update_check_dialog)}")
                logger.info(
                    f"  - Dialog visible: {self.update_check_dialog.isVisible()}"
                )
                logger.info(f"  - Dialog modal: {self.update_check_dialog.isModal()}")

                logger.info("Step 4: Setting dialog to 'checking' state...")
                self.update_check_dialog.set_checking()
                logger.info("✓ Dialog set to checking state")

                # Start the check - use force=True to ensure check runs on startup
                logger.info("Step 5: Starting update check (force=True)...")
                check_started = self.update_manager.check_for_updates(force=True)
                if check_started:
                    logger.info("✓ Startup update check initiated successfully")
                else:
                    logger.warning(
                        "✗ Update check failed to start or already in progress"
                    )
                    if (
                        hasattr(self, "update_check_dialog")
                        and self.update_check_dialog
                    ):
                        self.update_check_dialog.set_error(
                            "Update check already in progress"
                        )
            except Exception as dialog_error:
                logger.error(
                    f"✗ Error showing update check dialog: {dialog_error}",
                    exc_info=True,
                )
                # Don't crash the app if dialog fails
        except Exception as e:
            logger.error(f"✗ Error in _do_startup_update_check: {e}", exc_info=True)

        logger.info("=" * 60)
        logger.info("DO STARTUP UPDATE CHECK - Completed")
        logger.info("=" * 60)

    def on_check_for_updates(self) -> None:
        """Check for updates manually via Help > Check for Updates (Step 5.5)."""
        # Try to set up update system if it's not available
        if not hasattr(self, "update_manager") or not self.update_manager:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning("Update manager not available, attempting to set it up...")

            try:
                self._setup_update_system()
            except Exception as e:
                logger.error(f"Failed to set up update system: {e}", exc_info=True)
                QMessageBox.warning(
                    self,
                    "Check for Updates",
                    f"Update system is not available.\n\nError: {str(e)}\n\nPlease restart the application.",
                )
                return

        if not hasattr(self, "update_manager") or not self.update_manager:
            QMessageBox.warning(
                self,
                "Check for Updates",
                "Update system is not available.\n\nPlease restart the application.",
            )
            return

        # Show update check dialog
        from cuepoint.update.update_ui import show_update_check_dialog
        from cuepoint.version import get_version

        self.update_check_dialog = show_update_check_dialog(get_version(), self)
        self.update_check_dialog.set_checking()

        # Force check
        if self.update_manager.check_for_updates(force=True):
            # Status will be updated via callbacks
            pass
        else:
            self.update_check_dialog.set_error("Update check already in progress")

    def _on_update_available(self, update_info: Dict) -> None:
        """Handle update available callback (Step 5.5).

        Args:
            update_info: Update information dictionary.
        """
        import logging

        logger = logging.getLogger(__name__)

        logger.info("=" * 60)
        logger.info("ON UPDATE AVAILABLE - Update found, processing callback")
        logger.info("=" * 60)
        logger.info(f"  - Update info: {update_info}")
        if update_info:
            logger.info(f"  - Version: {update_info.get('short_version', 'N/A')}")
            logger.info(f"  - Download URL: {update_info.get('download_url', 'N/A')}")
            logger.info(f"  - File size: {update_info.get('file_size', 'N/A')}")

        # Note: Thread safety is handled by UpdateManager using QTimer.singleShot
        # This method should already be called on the main thread, but we add
        # a safety check that won't crash if it fails
        try:
            from PySide6.QtCore import QThread, QTimer
            from PySide6.QtWidgets import QApplication

            app = QApplication.instance()
            if app is not None:
                current_thread = QThread.currentThread()
                main_thread = app.thread()
                if current_thread != main_thread:
                    logger.warning(
                        "_on_update_available called from non-main thread, marshaling to main thread"
                    )
                    # Capture update_info in a way that won't cause issues
                    update_info_copy = (
                        update_info.copy()
                        if isinstance(update_info, dict)
                        else update_info
                    )

                    # Use a function reference instead of lambda to avoid closure issues
                    def marshal_callback():
                        try:
                            self._on_update_available(update_info_copy)
                        except Exception as marshal_error:
                            logger.error(
                                f"Error in marshaled callback: {marshal_error}",
                                exc_info=True,
                            )

                    QTimer.singleShot(0, marshal_callback)
                    return
        except Exception:
            # Thread check failed - continue anyway (UpdateManager should have handled threading)
            logger.debug("Thread check failed, continuing anyway (non-critical)")

        # We're on the main thread now - safe to access Qt widgets
        try:
            from cuepoint.version import get_version

            current_version = get_version()
            new_version = update_info.get("version") or update_info.get(
                "short_version", "Unknown"
            )

            logger.info(
                f"Update available: current={current_version}, new={new_version}"
            )

            # Update the check dialog if it's open
            # Check if dialog exists and is still valid (not destroyed)
            dialog_exists = (
                hasattr(self, "update_check_dialog")
                and self.update_check_dialog is not None
            )
            if dialog_exists:
                try:
                    # Try to access a property to verify dialog is still valid
                    _ = self.update_check_dialog.windowTitle()
                except (RuntimeError, AttributeError):
                    # Dialog was destroyed
                    logger.warning(
                        "Update check dialog was destroyed, creating new one"
                    )
                    dialog_exists = False
                    self.update_check_dialog = None

            if dialog_exists:
                logger.info("Updating check dialog with update info")
                try:
                    self.update_check_dialog.set_update_found(update_info)
                except (RuntimeError, AttributeError) as e:
                    logger.error(
                        f"Error updating dialog (may have been destroyed): {e}"
                    )
                    # Dialog was destroyed, create a new one
                    dialog_exists = False
                    self.update_check_dialog = None

                # Only continue if dialog still exists
                if dialog_exists:
                    # Verify button exists and is visible
                    if not hasattr(self.update_check_dialog, "download_button"):
                        logger.error("Download button not found in dialog!")
                        dialog_exists = False
                    elif not self.update_check_dialog.download_button.isVisible():
                        logger.warning("Download button is not visible!")

                    # Always ensure button is connected (even if already connected, reconnect to be safe)
                    # Store update_info in dialog for download FIRST (before connection)
                    if dialog_exists:
                        self.update_check_dialog.update_info = update_info
                        logger.info(
                            f"Stored update_info in dialog: {update_info.get('short_version', 'unknown')}"
                        )

                        # Also store in update_manager as fallback
                        if hasattr(self, "update_manager") and self.update_manager:
                            self.update_manager._update_available = update_info
                            logger.info(
                                "Stored update_info in update_manager as fallback"
                            )

                        # Disconnect any existing handler first (including dialog's own _on_download)
                        try:
                            self.update_check_dialog.download_button.clicked.disconnect()
                            logger.info("Disconnected existing button handlers")
                        except TypeError:
                            # No connections to disconnect
                            logger.info("No existing button handlers to disconnect")
                            pass
                        except Exception as e:
                            logger.warning(
                                f"Error disconnecting button: {e}, continuing anyway"
                            )

                        # Connect to our handler that will trigger download
                        logger.info("Connecting download button to download handler")

                        # Store reference to self for the closure
                        main_window_self = self

                        # Use a proper function reference instead of lambda to avoid closure issues
                        def on_download_clicked():
                            import logging

                            from PySide6.QtWidgets import QMessageBox

                            btn_logger = logging.getLogger(__name__)
                            btn_logger.info(
                                "Download button clicked - proceeding with download"
                            )

                            # Show immediate visual feedback
                            try:
                                main_window_self.statusBar().showMessage(
                                    "Starting download...", 3000
                                )
                            except Exception:
                                pass

                            try:
                                btn_logger.info(
                                    "Calling _on_update_install_from_dialog..."
                                )
                                main_window_self._on_update_install_from_dialog()
                                btn_logger.info(
                                    "_on_update_install_from_dialog completed"
                                )
                            except Exception as e:
                                btn_logger.error(
                                    f"Error in download handler: {e}", exc_info=True
                                )
                                import traceback

                                btn_logger.error(traceback.format_exc())

                                # Show error message to user
                                QMessageBox.critical(
                                    main_window_self,
                                    "Download Error",
                                    f"Failed to start download:\n\n{str(e)}\n\nPlease check the logs for details.",
                                )

                        # Ensure button is enabled and visible
                        try:
                            self.update_check_dialog.download_button.setEnabled(True)
                            self.update_check_dialog.download_button.setVisible(True)
                        except Exception as e:
                            logger.error(f"Failed to enable/show button: {e}")
                            dialog_exists = False

                        # Connect the button with error handling (only if dialog still exists)
                        if dialog_exists:
                            try:
                                self.update_check_dialog.download_button.clicked.connect(
                                    on_download_clicked
                                )
                                self.update_check_dialog._download_connected = True
                                logger.info("Download button connected successfully")

                                # Verify button state
                                logger.info("Button state after connection:")
                                logger.info(
                                    f"  - Text: {self.update_check_dialog.download_button.text()}"
                                )
                                logger.info(
                                    f"  - Visible: {self.update_check_dialog.download_button.isVisible()}"
                                )
                                logger.info(
                                    f"  - Enabled: {self.update_check_dialog.download_button.isEnabled()}"
                                )
                                logger.info(
                                    f"  - Default: {self.update_check_dialog.download_button.isDefault()}"
                                )

                                # Test connection by checking receivers (PySide6 way)
                                try:
                                    # Get signal index
                                    signal_index = self.update_check_dialog.download_button.metaObject().indexOfSignal(
                                        "clicked()"
                                    )
                                    if signal_index >= 0:
                                        logger.info(
                                            f"Button signal found at index: {signal_index}"
                                        )
                                        # Check if we can get receiver count (PySide6 doesn't expose this easily, but we can try)
                                        logger.info(
                                            "Button connection verified - signal exists"
                                        )
                                except Exception as e:
                                    logger.warning(
                                        f"Could not verify button connection details: {e}"
                                    )
                                    logger.info(
                                        "Button connection should still work despite verification warning"
                                    )
                            except Exception as connect_error:
                                logger.error(
                                    f"CRITICAL: Failed to connect download button: {connect_error}",
                                    exc_info=True,
                                )
                                # Show visible error to user
                                try:
                                    from PySide6.QtWidgets import QMessageBox

                                    QMessageBox.critical(
                                        self,
                                        "Update Error",
                                        f"Failed to connect download button.\n\n"
                                        f"Error: {str(connect_error)}\n\n"
                                        f"Please try checking for updates again or download manually.",
                                    )
                                except Exception:
                                    pass
                                dialog_exists = False
            else:
                # Show update dialog if check dialog not open
                from cuepoint.update.update_ui import show_update_dialog

                result = show_update_dialog(
                    current_version=current_version,
                    update_info=update_info,
                    parent=self,
                    on_install=self._on_update_install,
                    on_later=self._on_update_later,
                    on_skip=self._on_update_skip,
                )

                logger.info(f"Update dialog result: {result}")

            # Update status bar (only if we're on main thread)
            try:
                from PySide6.QtCore import QThread
                from PySide6.QtWidgets import QApplication

                app = QApplication.instance()
                if app and QThread.currentThread() == app.thread():
                    self.statusBar().showMessage(
                        f"Update available: {new_version}", 5000
                    )
                else:
                    # Not on main thread - marshal to main thread
                    from PySide6.QtCore import QTimer

                    QTimer.singleShot(
                        0,
                        lambda: self.statusBar().showMessage(
                            f"Update available: {new_version}", 5000
                        ),
                    )
            except Exception as status_error:
                logger.warning(f"Could not update status bar: {status_error}")
        except Exception as e:
            import logging
            import traceback

            logger.error(f"Error in _on_update_available: {e}")
            logger.error(traceback.format_exc())

            # Try to update check dialog if open (safely)
            try:
                if (
                    hasattr(self, "update_check_dialog")
                    and self.update_check_dialog is not None
                ):
                    try:
                        # Verify dialog is still valid
                        _ = self.update_check_dialog.windowTitle()
                        self.update_check_dialog.set_error(str(e))
                    except (RuntimeError, AttributeError):
                        # Dialog was destroyed, ignore
                        pass
            except Exception as dialog_error:
                logger.warning(f"Could not update dialog: {dialog_error}")

            # Try to show error message (but don't crash if it fails)
            try:
                from PySide6.QtWidgets import QMessageBox

                QMessageBox.warning(
                    self,
                    "Update Available",
                    f"An update is available, but there was an error displaying it:\n{e}",
                )
            except Exception as msg_error:
                logger.error(f"Could not show error message: {msg_error}")
                # Last resort: just log it
                logger.error(
                    "Update is available but UI could not be updated. Check logs for details."
                )

    def _on_update_check_complete(
        self, update_available: bool, error: Optional[str]
    ) -> None:
        """Handle update check complete callback (Step 5.5).

        Args:
            update_available: True if update is available.
            error: Error message if check failed.
        """
        import logging

        logger = logging.getLogger(__name__)

        # Update the check dialog if it's open
        if hasattr(self, "update_check_dialog") and self.update_check_dialog:
            if error:
                logger.error(f"Update check failed: {error}")
                self.update_check_dialog.set_error(error)
                self.statusBar().showMessage(f"Update check failed: {error}", 5000)
            elif update_available:
                # Update dialog will be shown by _on_update_available
                logger.info(
                    "Update available - dialog should be shown by _on_update_available callback"
                )
                # Double-check that callback was called
                if hasattr(self, "update_manager") and self.update_manager:
                    update_info = self.update_manager.get_update_info()
                    if update_info:
                        logger.info(
                            f"Update info available: {update_info.get('short_version')}"
                        )
                        # Update dialog if not already updated
                        if not self.update_check_dialog.update_info:
                            self.update_check_dialog.set_update_found(update_info)
                    else:
                        logger.warning(
                            "Update available flag is True but no update_info found!"
                        )
            else:
                logger.info("No update available - user is on latest version")
                self.update_check_dialog.set_no_update()
                self.statusBar().showMessage("You are using the latest version", 3000)
        else:
            # No dialog open, use status bar
            if error:
                logger.error(f"Update check failed: {error}")
                self.statusBar().showMessage(f"Update check failed: {error}", 5000)
            elif update_available:
                logger.info(
                    "Update available - dialog should be shown by _on_update_available callback"
                )
            else:
                logger.info("No update available - user is on latest version")
                self.statusBar().showMessage("You are using the latest version", 3000)

    def _on_update_error(self, error_message: str) -> None:
        """Handle update error callback (Step 5.5).

        Args:
            error_message: Error message.
        """
        try:
            from cuepoint.update.update_ui import show_update_error_dialog

            show_update_error_dialog(error_message, parent=self)
            self.statusBar().showMessage(f"Update error: {error_message}", 5000)
        except Exception as e:
            import logging

            logging.error(f"Error showing update error dialog: {e}")
            QMessageBox.warning(
                self, "Update Error", f"Error checking for updates:\n{error_message}"
            )

    def _on_update_install(self) -> None:
        """Handle update install action (Step 10.9.3 - Automatic download and installation)."""
        if not hasattr(self, "update_manager") or not self.update_manager:
            return

        update_info = self.update_manager._update_available
        if not update_info:
            QMessageBox.warning(self, "Update", "Update information not available.")
            return

        self._download_and_install_update(update_info)

    def _on_update_install_from_dialog(self) -> None:
        """Handle update install from update check dialog."""
        import logging

        logger = logging.getLogger(__name__)

        logger.info("=" * 60)
        logger.info("DOWNLOAD BUTTON CLICKED - Starting handler")
        logger.info("=" * 60)

        # Log build environment info for debugging
        logger.info(
            f"Build environment: frozen={getattr(sys, 'frozen', False)}, "
            f"python={sys.version_info.major}.{sys.version_info.minor}, "
            f"platform={platform.system()}"
        )

        # Show immediate visual feedback
        try:
            self.statusBar().showMessage("Preparing download...", 2000)
        except Exception:
            pass

        # Debug: Check if dialog exists
        if not hasattr(self, "update_check_dialog"):
            logger.error("update_check_dialog attribute not found on MainWindow")
            QMessageBox.warning(
                self,
                "Update Error",
                "Update dialog not found. Please try checking for updates again.",
            )
            return

        if not self.update_check_dialog:
            logger.error("update_check_dialog is None")
            QMessageBox.warning(
                self,
                "Update Error",
                "Update dialog is not available. Please try checking for updates again.",
            )
            return

        # Get update info - try multiple sources
        update_info = getattr(self.update_check_dialog, "update_info", None)

        # Fallback: try to get from update_manager if available
        if not update_info and hasattr(self, "update_manager") and self.update_manager:
            update_info = getattr(self.update_manager, "_update_available", None)
            if update_info:
                logger.info("Retrieved update_info from update_manager as fallback")

        logger.info(f"Update info from dialog: {update_info}")
        if update_info:
            logger.info(
                f"Update info details: version={update_info.get('short_version', 'unknown')}, download_url={update_info.get('download_url', 'none')}"
            )

        if not update_info:
            logger.error(
                "Update info is None or missing from both dialog and update_manager"
            )
            QMessageBox.warning(
                self,
                "Update Error",
                "Update information not available in dialog.\n\n"
                "Please check for updates again.",
            )
            return

        # Verify download URL exists
        download_url = update_info.get("download_url")
        if not download_url:
            enclosure = update_info.get("enclosure", {})
            if isinstance(enclosure, dict):
                download_url = enclosure.get("url")

        if not download_url:
            logger.error("No download URL found in update_info")
            QMessageBox.warning(
                self,
                "Update Error",
                "Download URL not found in update information.\n\n"
                "Please check for updates again or download manually from the release page.",
            )
            return

        logger.info(
            f"Starting download from dialog, version: {update_info.get('short_version', 'unknown')}, URL: {download_url}"
        )

        # Show download location
        import tempfile
        from pathlib import Path

        download_dir = Path(tempfile.gettempdir()) / "CuePoint_Updates"
        logger.info(f"Download will be saved to: {download_dir}")

        # Close the update check dialog first
        try:
            self.update_check_dialog.accept()
            logger.info("Update check dialog closed")
        except Exception as e:
            logger.warning(f"Error closing dialog: {e}, continuing anyway")

        # Start download and install
        try:
            logger.info("Calling _download_and_install_update...")
            self._download_and_install_update(update_info)
            logger.info("_download_and_install_update completed")
        except Exception as e:
            logger.error(f"Error in _download_and_install_update: {e}", exc_info=True)
            QMessageBox.critical(
                self,
                "Download Error",
                f"Failed to start download:\n\n{str(e)}\n\nPlease check the logs for details.",
            )

    def _download_and_install_update(self, update_info: Dict) -> None:
        """Download and install update with progress dialog.

        Args:
            update_info: Update information dictionary
        """
        from PySide6.QtWidgets import QMessageBox

        # Get download URL
        download_url = update_info.get("download_url")
        if not download_url:
            # Try alternative location
            enclosure = update_info.get("enclosure", {})
            if isinstance(enclosure, dict):
                download_url = enclosure.get("url")

        if not download_url:
            QMessageBox.information(
                self,
                "Update",
                "Download URL not available. Please check the release page manually.",
            )
            return

        # Show diagnostic dialog first (QMessageBox is from module-level import)
        try:
            import logging

            from PySide6.QtWidgets import QDialog

            from cuepoint.ui.dialogs.download_progress_dialog import (
                DownloadProgressDialog,
            )
            from cuepoint.ui.dialogs.update_diagnostic_dialog import (
                UpdateDiagnosticDialog,
            )

            logger = logging.getLogger(__name__)

            # Show diagnostic dialog (parent=None on macOS to avoid crash)
            diag_parent = None if sys.platform == "darwin" else self
            diagnostic_dialog = UpdateDiagnosticDialog(update_info, parent=diag_parent)
            diagnostic_result = diagnostic_dialog.exec()

            if diagnostic_result != QDialog.DialogCode.Accepted:
                # User chose "Update Later"
                logger.info("Update cancelled by user (Update Later)")
                self.statusBar().showMessage("Update postponed", 2000)
                return

            # User chose "Update Now" - proceed with download
            logger.info(f"Starting download from: {download_url}")

            # Verify URL format (GitHub Releases format)
            if "github.com" in download_url and "/releases/download/" in download_url:
                logger.info(
                    "Download URL appears to be a GitHub Releases URL - should be publicly accessible"
                )
            else:
                logger.warning(
                    f"Download URL format: {download_url} (may not be GitHub Releases)"
                )

            download_dialog = DownloadProgressDialog(download_url, parent=self)
            result = download_dialog.exec()

            if (
                result == QDialog.DialogCode.Accepted
                and download_dialog.get_downloaded_file()
            ):
                # Download completed; verify checksum before install (Design 4.9, 4.36)
                downloaded_file = download_dialog.get_downloaded_file()
                logger.info(f"Download completed: {downloaded_file}")
                expected_checksum = update_info.get("checksum")
                if expected_checksum:
                    from pathlib import Path

                    from cuepoint.update.security import PackageIntegrityVerifier

                    ok, err = PackageIntegrityVerifier.verify_checksum(
                        Path(downloaded_file), expected_checksum
                    )
                    if not ok:
                        logger.error(f"Update checksum verification failed: {err}")
                        QMessageBox.critical(
                            self,
                            "Update Verification Failed",
                            f"Checksum verification failed. The update will not be installed.\n\n{err or 'S002: Checksum mismatch'}\n\nPlease download the latest release manually from the release page.",
                        )
                        return
                else:
                    logger.warning(
                        "Update has no checksum in appcast (e.g. EdDSA only)"
                    )
                    reply = QMessageBox.warning(
                        self,
                        "Update Not Verified",
                        "This update does not include a checksum in the feed, so the download could not be verified.\n\n"
                        "You can install anyway (download was over HTTPS from the release server), or open the release page to download manually.",
                        QMessageBox.StandardButton.Ok
                        | QMessageBox.StandardButton.Cancel,
                        QMessageBox.StandardButton.Ok,
                    )
                    if reply != QMessageBox.StandardButton.Ok:
                        return
                self._install_update(downloaded_file)
            elif download_dialog.cancelled:
                logger.info("Download cancelled by user")
                self.statusBar().showMessage("Download cancelled", 2000)
            else:
                logger.warning("Download failed or was cancelled")
                self.statusBar().showMessage("Download failed", 3000)

        except Exception as e:
            import logging
            import traceback

            logger = logging.getLogger(__name__)
            logger.error(f"Update download failed: {e}")
            logger.error(traceback.format_exc())
            QMessageBox.warning(
                self,
                "Update Error",
                f"Failed to download update:\n\n{str(e)}\n\nPlease download manually from the release page.",
            )

    def _open_installer_folder(self, installer_path: str) -> None:
        """Open the folder containing the installer in the system file manager."""
        from pathlib import Path

        path = Path(installer_path)
        if not path.exists():
            path = path.parent
        folder = path.parent if path.is_file() else path
        folder_str = str(folder.resolve())
        try:
            if platform.system() == "Darwin":
                subprocess.Popen(["open", folder_str], start_new_session=True)
            elif platform.system() == "Windows":
                subprocess.Popen(["explorer", folder_str])
            else:
                subprocess.Popen(["xdg-open", folder_str], start_new_session=True)
        except (OSError, FileNotFoundError):
            pass

    def _show_manual_install_dialog(
        self, title: str, message: str, installer_path: str
    ) -> None:
        """Show a dialog for manual install with Cancel and Update manually buttons."""
        msg = QMessageBox(self)
        msg.setWindowTitle(title)
        msg.setText(message)
        msg.addButton(QMessageBox.StandardButton.Cancel)
        update_btn = msg.addButton("Update manually", QMessageBox.ButtonRole.ActionRole)
        msg.exec()
        if msg.clickedButton() == update_btn:
            self._open_installer_folder(installer_path)

    def _install_update(self, installer_path: str) -> None:
        """Install downloaded update (Step 10.9.3)."""
        try:
            from PySide6.QtWidgets import QMessageBox

            from cuepoint.update.update_installer import UpdateInstaller

            installer = UpdateInstaller()

            if not installer.can_install():
                self._show_manual_install_dialog(
                    "Installation Not Supported",
                    "Automatic installation is not supported on this platform.\n\n"
                    "Please install the update manually.",
                    installer_path,
                )
                return

            # Confirm installation
            reply = QMessageBox.question(
                self,
                "Install Update",
                "The application will close and the update will be installed.\n\n"
                "Do you want to continue?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes,
            )

            if reply == QMessageBox.StandardButton.Yes:
                # Show message that app will close and installer will launch
                import logging

                logger = logging.getLogger(__name__)
                logger.info(
                    "User confirmed installation, preparing to launch installer..."
                )

                # Show brief message (non-blocking)
                try:
                    self.statusBar().showMessage("Launching installer...", 2000)
                    # Process events to show the message
                    from PySide6.QtWidgets import QApplication

                    QApplication.processEvents()
                except Exception:
                    pass

                # Perform installation (this will close the app)
                success, error = installer.install(installer_path)

                if not success:
                    # If we get here, installation failed before app closed
                    self._show_manual_install_dialog(
                        "Installation Failed",
                        f"Failed to install update:\n\n{error}\n\n"
                        "Please install manually.",
                        installer_path,
                    )
                # If successful, installer.install() will have closed the app
            else:
                self.statusBar().showMessage("Installation cancelled", 2000)

        except Exception as e:
            import logging

            logging.error(f"Update installation failed: {e}")
            self._show_manual_install_dialog(
                "Installation Error",
                f"Failed to install update:\n\n{str(e)}\n\nPlease install manually.",
                installer_path,
            )

    def _on_update_later(self) -> None:
        """Handle update later action (Step 5.5)."""
        self.statusBar().showMessage("Update check postponed", 2000)

    def _on_update_skip(self) -> None:
        """Handle update skip action (Step 5.5)."""
        if hasattr(self, "update_manager") and self.update_manager:
            update_info = self.update_manager._update_available
            if update_info:
                version = update_info.get("version") or update_info.get("short_version")
                if version:
                    self.update_manager.preferences.ignore_version(version)
                    self.statusBar().showMessage(
                        f"Version {version} will be skipped", 3000
                    )

    def on_batch_started(self, playlist_names: List[str]) -> None:
        """Handle batch processing started signal from batch processor.

        Validates the XML file, gets settings, and starts batch processing
        via the controller. Connects controller signals to batch processor
        for progress updates.

        Args:
            playlist_names: List of playlist names to process in batch.
        """
        xml_path = self.file_selector.get_file_path()
        if not xml_path or not self.file_selector.validate_file(xml_path):
            QMessageBox.warning(
                self,
                "No File Selected",
                "Please select a valid XML file before starting batch processing.",
            )
            self.batch_processor.cancel_batch_processing()
            return

        # Get settings
        settings = self.config_panel.get_settings()
        auto_research = self.config_panel.get_auto_research()

        # Store playlist names for tracking
        self.batch_playlist_names = playlist_names

        # Disconnect regular processing signals temporarily (if connected)
        try:
            self.controller.progress_updated.disconnect(self.on_progress_updated)
        except BaseException:
            pass
        try:
            self.controller.processing_complete.disconnect(self.on_processing_complete)
        except BaseException:
            pass
        try:
            self.controller.error_occurred.disconnect(self.on_error_occurred)
        except BaseException:
            pass

        # Connect controller signals to batch processor
        self.controller.progress_updated.connect(
            self.batch_processor.on_playlist_progress
        )
        self.controller.processing_complete.connect(self._on_batch_playlist_complete)
        self.controller.error_occurred.connect(self._on_batch_playlist_error)

        # Start batch processing via controller
        self.controller.start_batch_processing(
            xml_path=xml_path,
            playlist_names=playlist_names,
            settings=settings,
            auto_research=auto_research,
        )

        # Notify batch processor of first playlist start
        if playlist_names:
            self.batch_processor.on_playlist_started(playlist_names[0])

    def _on_batch_playlist_complete(self, results: List[TrackResult]) -> None:
        """Handle completion of a single playlist in batch processing.

        Notifies the batch processor of completion and checks if the batch
        is complete. Reconnects regular signals when batch is finished.

        Args:
            results: List of TrackResult objects for the completed playlist.
        """
        # Get playlist name from controller (stored before processing next)
        if (
            hasattr(self.controller, "last_completed_playlist_name")
            and self.controller.last_completed_playlist_name
        ):
            playlist_name = self.controller.last_completed_playlist_name
            self.batch_processor.on_playlist_completed(playlist_name, results)

            # Check if batch is complete
            if hasattr(
                self.controller, "batch_index"
            ) and self.controller.batch_index >= len(self.batch_playlist_names):
                # Batch complete - reconnect regular signals
                self._reconnect_regular_signals()
            elif hasattr(
                self.controller, "batch_index"
            ) and self.controller.batch_index < len(self.batch_playlist_names):
                # Notify start of next playlist
                next_playlist_name = self.batch_playlist_names[
                    self.controller.batch_index
                ]
                self.batch_processor.on_playlist_started(next_playlist_name)

    def _on_batch_playlist_error(self, error: ProcessingError) -> None:
        """Handle error for a single playlist in batch processing.

        Notifies the batch processor of the error and continues with the
        next playlist. Reconnects regular signals when batch is finished.

        Args:
            error: ProcessingError object containing error information.
        """
        # Get playlist name from controller (stored before processing next)
        if (
            hasattr(self.controller, "last_completed_playlist_name")
            and self.controller.last_completed_playlist_name
        ):
            playlist_name = self.controller.last_completed_playlist_name
            self.batch_processor.on_playlist_error(playlist_name, error)

            # Check if batch is complete
            if hasattr(
                self.controller, "batch_index"
            ) and self.controller.batch_index >= len(self.batch_playlist_names):
                # Batch complete - reconnect regular signals
                self._reconnect_regular_signals()
            elif hasattr(
                self.controller, "batch_index"
            ) and self.controller.batch_index < len(self.batch_playlist_names):
                # Notify start of next playlist
                next_playlist_name = self.batch_playlist_names[
                    self.controller.batch_index
                ]
                self.batch_processor.on_playlist_started(next_playlist_name)

    def _reconnect_regular_signals(self) -> None:
        """Reconnect regular processing signals after batch processing completes.

        Disconnects batch-specific signal handlers and reconnects the
        regular signal handlers for single playlist processing mode.
        """
        try:
            self.controller.progress_updated.disconnect(
                self.batch_processor.on_playlist_progress
            )
        except BaseException:
            pass
        try:
            self.controller.processing_complete.disconnect(
                self._on_batch_playlist_complete
            )
        except BaseException:
            pass
        try:
            self.controller.error_occurred.disconnect(self._on_batch_playlist_error)
        except BaseException:
            pass

        self.controller.progress_updated.connect(self.on_progress_updated)
        self.controller.processing_complete.connect(self.on_processing_complete)
        self.controller.error_occurred.connect(self.on_error_occurred)

    def on_batch_cancelled(self) -> None:
        """Handle batch processing cancellation.

        Cancels the current processing operation and reconnects regular
        processing signals.
        """
        self.controller.cancel_processing()
        self.statusBar().showMessage("Batch processing cancelled")

        # Reconnect regular processing signals
        self._reconnect_regular_signals()

    def on_batch_completed(self, results_dict: Dict[str, List[TrackResult]]) -> None:
        """Handle batch processing completion.

        Displays results in separate tables per playlist, automatically
        saves results for each playlist, and updates the status bar with
        summary statistics.

        Args:
            results_dict: Dictionary mapping playlist names to lists of TrackResult objects.
        """
        # Pass all playlists, even empty ones (so user can see what was processed)
        # Filter out None values only
        filtered_dict = {
            name: results
            for name, results in results_dict.items()
            if results is not None
        }

        if not filtered_dict:
            self.statusBar().showMessage(
                "Batch processing complete, but no results to display"
            )
            return

        # Ensure we're on Main tab (should already be there, but just in case)
        self.tabs.setCurrentIndex(0)

        # Hide batch processor progress, show results
        # Note: batch processor has its own progress display, regular
        # progress_group is for single mode
        self.progress_group.setVisible(False)
        self.results_group.setVisible(True)

        # Re-enable start button
        self._set_start_enabled(True)

        # Disable cancel and pause buttons
        self.cancel_button.setEnabled(False)
        if hasattr(self, "pause_button") and self.pause_button:
            self.pause_button.setEnabled(False)

        # Automatically save results for each playlist
        for playlist_name, results in filtered_dict.items():
            if results:  # Only save if there are results
                self._auto_save_results(results, playlist_name)

        # Update results view with batch results (separate table per playlist)
        self.results_view.set_batch_results(filtered_dict)

        # Calculate summary statistics for status bar
        total = sum(len(results) for results in filtered_dict.values())
        matched = sum(
            sum(1 for r in results if r.matched) for results in filtered_dict.values()
        )
        match_rate = (matched / total * 100) if total > 0 else 0

        # Update status bar
        self.statusBar().showMessage(
            f"Batch processing complete: {len(filtered_dict)} playlist(s), "
            f"{total} total tracks, {matched}/{total} matched ({match_rate:.1f}%)"
        )

    def _auto_save_results(
        self,
        results: List[TrackResult],
        playlist_name: str,
        source_type: str = "collection",
        m3u_path: Optional[str] = None,
    ) -> Optional[Dict[str, str]]:
        """Automatically save results to CSV file after processing.

        Creates a sanitized filename from the playlist name and saves
        results to the output directory. For M3U runs, writes a .meta.json
        with source and m3u_path so rerun and sync from history work.

        Args:
            results: List of TrackResult objects to save.
            playlist_name: Name of the playlist for file naming.
            source_type: "collection" or "playlist_file".
            m3u_path: Path to M3U file when source_type is playlist_file.
        """
        if not results:
            return None

        try:
            # Use display name (no ROOT prefix) so filenames are "Untitled Playlist", not "ROOTUntitled Playlist"
            name_for_file = playlist_path_for_display(playlist_name or "")
            # Sanitize playlist name for filename (remove invalid characters)
            safe_playlist_name = "".join(
                c for c in name_for_file if c.isalnum() or c in (" ", "-", "_")
            ).strip()
            if not safe_playlist_name:
                safe_playlist_name = "playlist"

            # Create base filename (write_csv_files will add timestamp)
            base_filename = f"{safe_playlist_name}.csv"

            # Always save to exports_dir so Past Searches (HistoryView) sees the file.
            from cuepoint.utils.paths import AppPaths

            exports_dir = AppPaths.exports_dir()
            exports_dir.mkdir(parents=True, exist_ok=True)
            output_dir = str(exports_dir)
            if self._config_service:
                try:
                    self._config_service.set("product.last_output_dir", output_dir)
                    self._config_service.save()
                except Exception:
                    pass

            # Write CSV files (this will add timestamp automatically)
            output_files = write_csv_files(results, base_filename, output_dir)

            # For M3U runs, write .meta.json so Past Searches can rerun and sync without the M3U file
            if source_type == "playlist_file" and m3u_path and output_files.get("main"):
                main_path = output_files["main"]
                meta_path = os.path.splitext(main_path)[0] + ".meta.json"
                try:
                    with open(meta_path, "w", encoding="utf-8") as f:
                        json.dump({"source": "playlist_file", "m3u_path": m3u_path}, f)
                except Exception:
                    pass

            # Show success message in status bar
            if output_files.get("main"):
                main_file = output_files["main"]
                self.statusBar().showMessage(
                    f"Results saved: {os.path.basename(main_file)}", 3000
                )

                # Refresh Past Searches tab to show the new file
                if hasattr(self, "history_view"):
                    # Use QTimer to refresh after a delay to ensure file system has updated
                    from PySide6.QtCore import QTimer

                    def refresh_with_file():
                        try:
                            # Refresh the history view to show the new file (stay on current tab)
                            self.history_view.refresh_recent_files()
                        except Exception as e:
                            # Log but don't fail - refresh is best-effort
                            import logging

                            logging.getLogger(__name__).warning(
                                f"Could not refresh history view: {e}"
                            )

                    # Refresh after a short delay to ensure file system has updated
                    QTimer.singleShot(500, refresh_with_file)

            return output_files
        except Exception as e:
            # Show error in status bar for longer
            import traceback

            error_msg = f"Warning: Could not auto-save results: {str(e)}"
            self.statusBar().showMessage(error_msg, 10000)
            print(f"Auto-save error: {traceback.format_exc()}")
            return None

    def on_playlist_selected(self, playlist_name: str) -> None:
        """Handle playlist selection from PlaylistSelector widget.

        Updates the status bar with the selected playlist name and
        track count. Enables start button when playlist is selected (progressive disclosure).

        Args:
            playlist_name: Name of the selected playlist.
        """
        if playlist_name:
            track_count = self.playlist_selector.get_playlist_track_count(playlist_name)
            self.statusBar().showMessage(
                f"Selected playlist: {playlist_name} ({track_count} tracks)"
            )
            if self._config_service:
                try:
                    self._config_service.set("product.default_playlist", playlist_name)
                    self._config_service.save()
                except Exception:
                    pass
            # ENABLE START BUTTON when playlist is selected (progressive disclosure)
            self._set_start_enabled(True)
            # Ensure start button container is visible
            self.start_button_container.setVisible(True)
        else:
            # DISABLE START BUTTON if no playlist selected
            self._set_start_enabled(False)

    def start_processing(self) -> None:
        """Start processing the selected playlist or M3U file.

        Validates inputs (XML + playlist or M3U path), resets progress widget,
        shows progress section, disables start button, and starts processing
        via the controller. Handles performance monitoring tab if enabled.
        """
        settings = self.config_panel.get_settings()
        auto_research = self.config_panel.get_auto_research()

        if getattr(self, "_source_mode", "collection") == "playlist_file":
            self._start_processing_from_m3u(settings)
            return

        # Collection path
        xml_path = self.file_selector.get_file_path()
        playlist_name = self.playlist_selector.get_selected_playlist()

        if not xml_path or not self.file_selector.validate_file(xml_path):
            self.statusBar().showMessage("Please select a valid XML file")
            return

        if not playlist_name:
            self.statusBar().showMessage("Please select a playlist")
            return

        if not self._run_preflight_checks(xml_path, playlist_name, settings):
            return

        self._start_processing_common_ui()
        self.statusBar().showMessage(f"Starting processing: {playlist_name}...")

        self._start_processing_performance_tab(settings)
        self._processing_start_time = datetime.now()
        self._emit_run_start_telemetry()
        checkpoint_service, resume_checkpoint = self._get_checkpoint_for_run(
            xml_path, playlist_name
        )

        self.controller.start_processing(
            xml_path=xml_path,
            playlist_name=playlist_name,
            settings=settings,
            auto_research=auto_research,
            checkpoint_service=checkpoint_service,
            resume_checkpoint=resume_checkpoint,
        )

    def _start_processing_from_m3u(self, settings: Dict[str, Any]) -> None:
        """Start processing from the selected M3U/M3U8 file."""
        m3u_path = self.playlist_file_selector.get_file_path()
        if not m3u_path or not self.playlist_file_selector.validate_file(m3u_path):
            self.statusBar().showMessage("Please select a valid playlist file (.m3u or .m3u8)")
            return

        import os

        self._last_m3u_playlist_name = os.path.basename(m3u_path)
        self._last_m3u_path_for_save = m3u_path
        self._start_processing_common_ui()
        self.statusBar().showMessage(
            f"Starting processing: {self._last_m3u_playlist_name}..."
        )
        self._start_processing_performance_tab(settings)
        self._processing_start_time = datetime.now()
        self._emit_run_start_telemetry()
        self.controller.start_processing_from_m3u(m3u_path=m3u_path, settings=settings)

    def _start_processing_common_ui(self) -> None:
        """Reset progress, show progress section, disable Start, enable Cancel/Pause."""
        self._reset_progress()
        self.progress_group.setVisible(True)
        self.results_group.setVisible(False)
        self._set_start_enabled(False)
        self.cancel_button.setEnabled(True)
        self.pause_button.setEnabled(True)
        self.pause_button.setText("Pause")

    def _start_processing_performance_tab(self, settings: Dict[str, Any]) -> None:
        """Show or hide performance tab based on settings."""
        track_performance = settings.get("track_performance", False)
        if track_performance:
            # Add performance tab if not already added
            if self.performance_tab_index is None:
                print("[DEBUG] Adding Performance tab")  # Debug output
                self.performance_tab_index = self.tabs.addTab(
                    self.performance_view, "Performance"
                )
                self.performance_view.start_monitoring()
                # Switch to performance tab to show it to the user
                self.tabs.setCurrentIndex(self.performance_tab_index)
                print(
                    f"[DEBUG] Performance tab added at index {self.performance_tab_index}"
                )  # Debug output
            else:
                # Tab already exists, just start monitoring
                print(
                    "[DEBUG] Performance tab already exists, starting monitoring"
                )  # Debug output
                self.performance_view.start_monitoring()
                # Switch to performance tab to show it to the user
                self.tabs.setCurrentIndex(self.performance_tab_index)
        else:
            print(
                "[DEBUG] track_performance is False, not adding Performance tab"
            )  # Debug output
            # Remove performance tab if it exists
            if self.performance_tab_index is not None:
                self.performance_view.stop_monitoring()
                self.tabs.removeTab(self.performance_tab_index)
                self.performance_tab_index = None

    def _emit_run_start_telemetry(self) -> None:
        try:
            from cuepoint.utils.run_context import get_current_run_id
            from cuepoint.utils.telemetry_helper import get_telemetry

            get_telemetry().track(
                "run_start",
                {"run_id": get_current_run_id() or "", "track_count": 0},
            )
        except Exception:
            pass

    def _get_checkpoint_for_run(
        self, xml_path: str, playlist_name: str
    ) -> tuple:
        """Return (checkpoint_service, resume_checkpoint) for Collection runs."""
        try:
            from cuepoint.services.checkpoint_service import (
                CheckpointService,
                get_checkpoint_dir,
            )

            checkpoint_service = CheckpointService(checkpoint_dir=get_checkpoint_dir())
            resume_checkpoint = checkpoint_service.validate_and_load(xml_path)
            if resume_checkpoint and resume_checkpoint.playlist == playlist_name:
                from PySide6.QtWidgets import QMessageBox

                reply = QMessageBox.question(
                    self,
                    "Resume previous run?",
                    "We found an incomplete run. Resume?",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                    QMessageBox.StandardButton.Yes,
                )
                if reply != QMessageBox.StandardButton.Yes:
                    checkpoint_service.discard()
                    resume_checkpoint = None
                    checkpoint_service = None
            else:
                resume_checkpoint = None
                checkpoint_service = None
            return (checkpoint_service, resume_checkpoint)
        except Exception:
            return (None, None)

    def _run_preflight_checks(
        self, xml_path: str, playlist_name: str, settings: Dict[str, Any]
    ) -> bool:
        """Run preflight checks and show dialog if needed."""
        try:
            from cuepoint.services.interfaces import IProcessorService
            from cuepoint.ui.dialogs.preflight_dialog import PreflightDialog
            from cuepoint.utils.di_container import get_container

            last_out = ""
            if self._config_service:
                last_out = self._config_service.get("product.last_output_dir", "") or ""
            output_dir = get_output_directory(last_out if last_out else None)
            container = get_container()
            processor_service: IProcessorService = container.resolve(IProcessorService)
            if self._config_service:
                preflight_enabled = self._config_service.get(
                    "product.preflight_enabled", False
                )
                if preflight_enabled is None:
                    preflight_enabled = False
                preflight_enabled = bool(preflight_enabled)
                if not preflight_enabled:
                    return True
            preflight = processor_service.run_preflight(
                xml_path=xml_path,
                playlist_name=playlist_name,
                output_dir=output_dir,
                settings=settings,
            )
        except Exception as e:
            self.statusBar().showMessage(f"Preflight failed to run: {e}")
            return False

        if not preflight.errors and not preflight.warnings:
            return True

        dialog = PreflightDialog(preflight=preflight, parent=self)
        result = dialog.exec()
        return result == QDialog.DialogCode.Accepted

    def on_cancel_requested(self) -> None:
        """Handle cancel button click from ProgressWidget.

        Cancels the current processing operation with proper error handling
        to prevent crashes. Shows confirmation dialog if processing has been
        running for more than 5 seconds. Disables cancel button immediately
        and re-enables UI after cancellation completes.
        """
        try:
            # Prevent multiple cancel requests
            if hasattr(self, "_cancelling") and self._cancelling:
                return

            # Check if processing has been running for a while and show confirmation
            try:
                if (
                    hasattr(self, "_processing_start_time")
                    and self._processing_start_time
                ):
                    elapsed = (
                        datetime.now() - self._processing_start_time
                    ).total_seconds()
                    if elapsed > 5:  # More than 5 seconds
                        reply = QMessageBox.question(
                            self,
                            "Cancel Processing?",
                            "Processing is in progress.\n\n"
                            "Are you sure you want to cancel?\n"
                            "All progress will be lost.",
                            QMessageBox.Yes | QMessageBox.No,
                            QMessageBox.No,
                        )
                        if reply == QMessageBox.No:
                            return
            except Exception:
                # If confirmation dialog fails, continue with cancellation anyway
                pass

            self._cancelling = True

            # Disable cancel button immediately to prevent multiple clicks
            try:
                if hasattr(self, "cancel_button") and self.cancel_button:
                    self.cancel_button.setEnabled(False)
                    self.cancel_button.setText("Cancelling...")
                if hasattr(self, "pause_button") and self.pause_button:
                    self.pause_button.setEnabled(False)
            except Exception:
                pass

            # Cancel processing in a safe way
            try:
                if hasattr(self, "controller") and self.controller:
                    if (
                        hasattr(self.controller, "is_processing")
                        and self.controller.is_processing()
                    ):
                        try:
                            self.controller.cancel_processing()
                        except Exception as e:
                            print(f"Error in controller.cancel_processing: {e}")
                            import traceback

                            traceback.print_exc()
            except Exception as e:
                print(f"Error accessing controller: {e}")
                import traceback

                traceback.print_exc()

            try:
                if hasattr(self, "statusBar") and self.statusBar():
                    self.statusBar().showMessage("Cancelling processing...")
            except Exception:
                pass

            # Use QTimer to safely reset UI after cancellation
            from PySide6.QtCore import QTimer

            QTimer.singleShot(1000, self._on_cancel_complete)

        except Exception as e:
            # Log error but don't crash - ensure UI is reset
            import traceback

            error_msg = f"Error cancelling processing: {str(e)}"
            print(error_msg)
            print(traceback.format_exc())
            try:
                if hasattr(self, "statusBar") and self.statusBar():
                    self.statusBar().showMessage(error_msg, 5000)
            except Exception:
                pass
            # Still try to reset UI
            try:
                from PySide6.QtCore import QTimer

                QTimer.singleShot(500, self._on_cancel_complete)
            except Exception:
                # Last resort: reset cancelling flag directly
                try:
                    self._cancelling = False
                except Exception:
                    pass

    def _on_cancel_complete(self) -> None:
        """Called after cancellation is complete - safely reset UI"""
        try:
            # Check if window still exists (prevent crash if window was closed)
            if not hasattr(self, "isVisible") or not self.isVisible():
                return

            self._cancelling = False

            # Re-enable start button
            if hasattr(self, "start_button") and self.start_button:
                try:
                    self._set_start_enabled(True)
                except RuntimeError:
                    # Widget might have been deleted
                    pass

            # Reset cancel button
            if hasattr(self, "cancel_button"):
                try:
                    self.cancel_button.setEnabled(True)
                    self.cancel_button.setText("Cancel")
                except RuntimeError:
                    pass

            # Hide progress section
            if hasattr(self, "progress_group") and self.progress_group:
                try:
                    self.progress_group.setVisible(False)
                except RuntimeError:
                    pass

            if hasattr(self, "statusBar"):
                try:
                    self.statusBar().showMessage("Processing cancelled", 2000)
                except RuntimeError:
                    pass

        except Exception as e:
            import traceback

            print(f"Error in cancel complete: {e}")
            print(traceback.format_exc())
            # Try to at least show a message, but don't crash if window is closed
            try:
                if (
                    hasattr(self, "statusBar")
                    and hasattr(self, "isVisible")
                    and self.isVisible()
                ):
                    self.statusBar().showMessage(
                        "Processing cancelled (with errors)", 3000
                    )
            except Exception:
                pass

    def on_progress_updated(self, progress_info: ProgressInfo) -> None:
        """Handle progress update from controller.

        Updates the inline progress elements and status bar.

        Args:
            progress_info: ProgressInfo object containing progress details.
        """
        # Update inline progress elements
        if progress_info.total_tracks > 0:
            self.progress_bar.setMaximum(progress_info.total_tracks)
            self.progress_bar.setValue(progress_info.completed_tracks)
            pct = (progress_info.completed_tracks / progress_info.total_tracks) * 100
            self.progress_pct.setText(f"{pct:.0f}%")

        # Current track (Design 5.12, 5.40: show status_message e.g. "Paused", "Retrying...")
        status_msg = getattr(progress_info, "status_message", None)
        rel_state = getattr(progress_info, "reliability_state", None)
        if progress_info.current_track:
            title = progress_info.current_track.get("title", "Unknown")
            artists = progress_info.current_track.get("artists", "Unknown")
            line = f"{progress_info.completed_tracks}/{progress_info.total_tracks}: {title} - {artists}"
        else:
            line = f"Processing track {progress_info.completed_tracks}/{progress_info.total_tracks}..."
        if status_msg:
            line = f"{status_msg} | {line}"
        self.progress_track.setText(line)
        # Pause/Resume button: show "Resume" when paused (Design 5.12)
        if rel_state == ReliabilityState.PAUSED:
            self.pause_button.setText("Resume")
        else:
            self.pause_button.setText("Pause")

        # Stats
        self.progress_matched.setText(f"✓ Matched: {progress_info.matched_count}")
        self.progress_unmatched.setText(f"✗ Unmatched: {progress_info.unmatched_count}")

        # Time
        if progress_info.elapsed_time > 0:
            self.progress_elapsed.setText(
                f"Elapsed: {self._format_time(progress_info.elapsed_time)}"
            )
            if progress_info.completed_tracks > 0:
                avg = progress_info.elapsed_time / progress_info.completed_tracks
                remaining = avg * (
                    progress_info.total_tracks - progress_info.completed_tracks
                )
                self.progress_remaining.setText(
                    f"Remaining: {self._format_time(remaining)}"
                )

        # Update status bar progress indicator
        if hasattr(self, "status_progress") and self.controller.is_processing():
            if progress_info.total_tracks > 0:
                percentage = (
                    progress_info.completed_tracks / progress_info.total_tracks
                ) * 100
                self.status_progress.setMaximum(100)
                self.status_progress.setValue(int(percentage))
                self.status_progress.setVisible(True)
        else:
            if hasattr(self, "status_progress"):
                self.status_progress.setVisible(False)

        # Step 8: Process events so Cancel button stays responsive (Design 8.4)
        if (
            progress_info.completed_tracks % 5 == 0
            or progress_info.completed_tracks <= 1
        ):
            try:
                from PySide6.QtWidgets import QApplication

                QApplication.processEvents()
            except Exception:
                pass

        # Update status bar message
        if progress_info.current_track:
            title = progress_info.current_track.get("title", "Unknown")
            track_info = f"{title} ({progress_info.completed_tracks}/{progress_info.total_tracks})"
            self.statusBar().showMessage(f"Processing: {track_info}")

    def _format_time(self, seconds: float) -> str:
        """Format seconds into human readable time."""
        if seconds < 60:
            return f"{int(seconds)}s"
        elif seconds < 3600:
            m, s = divmod(int(seconds), 60)
            return f"{m}m {s}s" if s else f"{m}m"
        else:
            h, rem = divmod(int(seconds), 3600)
            m = rem // 60
            return f"{h}h {m}m" if m else f"{h}h"

    def _reset_progress(self) -> None:
        """Reset inline progress elements to initial state."""
        self.progress_bar.setValue(0)
        self.progress_bar.setMaximum(100)
        self.progress_pct.setText("0%")
        self.progress_track.setText("Ready to start...")
        self.progress_elapsed.setText("Elapsed: 0s")
        self.progress_remaining.setText("Remaining: --")
        self.progress_matched.setText("✓ Matched: 0")
        self.progress_unmatched.setText("✗ Unmatched: 0")
        self.cancel_button.setEnabled(True)
        self.cancel_button.setText("Cancel")
        self.pause_button.setEnabled(False)
        self.pause_button.setText("Pause")
        self.pause_button.setEnabled(False)
        self.pause_button.setText("Pause")

    def on_pause_resume_clicked(self) -> None:
        """Design 5.12, 5.40: Pause or Resume processing."""
        if not hasattr(self, "controller") or not self.controller.is_processing():
            return
        if self.controller.is_processing_paused():
            self.controller.resume_processing()
            self.pause_button.setText("Pause")
        else:
            self.controller.request_pause()
            self.pause_button.setText("Resume")

    def on_processing_complete(self, results: List[TrackResult]) -> None:
        """Handle processing completion.

        Stops performance monitoring if active, hides progress section,
        shows results, updates results view, calculates summary statistics,
        and automatically saves results to CSV.

        Args:
            results: List of TrackResult objects from processing.
        """
        # Stop performance monitoring if active
        if self.performance_view and self.performance_tab_index is not None:
            self.performance_view.stop_monitoring()

        # Hide progress, show results
        self.progress_group.setVisible(False)
        self.results_group.setVisible(True)

        # Hide status bar progress
        if hasattr(self, "status_progress"):
            self.status_progress.setVisible(False)

        # Switch to Main tab to show results
        self.tabs.setCurrentIndex(0)

        # Re-enable start button
        self._set_start_enabled(True)

        # Disable cancel and pause buttons
        self.cancel_button.setEnabled(False)
        if hasattr(self, "pause_button") and self.pause_button:
            self.pause_button.setEnabled(False)

        # Capture processing duration for summary
        processing_start_time = getattr(self, "_processing_start_time", None)
        processing_end_time = datetime.now()
        duration_sec = 0.0
        if processing_start_time:
            duration_sec = (processing_end_time - processing_start_time).total_seconds()
        # Clear processing start time
        if hasattr(self, "_processing_start_time"):
            self._processing_start_time = None

        # Get playlist name for file naming (M3U: use stored basename)
        if getattr(self, "_source_mode", "collection") == "playlist_file":
            playlist_name = (
                getattr(self, "_last_m3u_playlist_name", None) or "playlist"
            )
            worker = getattr(self.controller, "current_worker", None)
            if worker and getattr(worker, "warning_message", None):
                self.statusBar().showMessage(worker.warning_message, 8000)
        else:
            playlist_name = self.playlist_selector.get_selected_playlist() or "playlist"

        # Update results view with results
        if results:
            # Ensure results group is visible and shown
            self.results_group.setVisible(True)
            self.results_group.show()

            # Update results view with results
            self.results_view.set_results(results, playlist_name)

            # Force update the results view
            self.results_view.update()
            self.results_view.repaint()

            # Automatically save results to CSV so they appear in Past Searches
            source_type = getattr(self, "_source_mode", "collection")
            m3u_path_for_save = getattr(self, "_last_m3u_path_for_save", None)
            output_files = self._auto_save_results(
                results, playlist_name,
                source_type=source_type,
                m3u_path=m3u_path_for_save,
            )

            # Step 14: run_complete and export_complete telemetry
            try:
                from cuepoint.utils.run_context import get_current_run_id
                from cuepoint.utils.telemetry_helper import get_telemetry

                total = len(results)
                matched = sum(1 for r in results if r.matched)
                match_rate = matched / total if total else 0.0
                telemetry = get_telemetry()
                telemetry.track(
                    "run_complete",
                    {
                        "run_id": get_current_run_id() or "",
                        "duration_ms": int(duration_sec * 1000),
                        "tracks": total,
                        "match_rate": round(match_rate, 2),
                        "tracks_matched": matched,
                        "tracks_unmatched": total - matched,
                    },
                )
                telemetry.track(
                    "export_complete",
                    {"output_count": len(output_files) if output_files else 0},
                )
                telemetry.flush()
            except Exception:
                pass

            # Show run summary dialog
            try:
                from cuepoint.models.run_summary import RunSummary
                from cuepoint.ui.dialogs.run_summary_dialog import RunSummaryDialog

                output_paths = list(output_files.values()) if output_files else []
                input_xml_path = self.file_selector.get_file_path()
                redact_paths = True
                if self._config_service:
                    redact_paths_value = self._config_service.get(
                        "product.redact_paths_in_logs", True
                    )
                    if redact_paths_value is None:
                        redact_paths_value = True
                    redact_paths = bool(redact_paths_value)
                summary = RunSummary.from_results(
                    results=results,
                    playlist=playlist_name,
                    duration_sec=duration_sec,
                    output_paths=output_paths,
                    input_xml_path=input_xml_path,
                    start_time=processing_start_time,
                    end_time=processing_end_time,
                    redact_paths=redact_paths,
                )
                dialog = RunSummaryDialog(summary, self)
                dialog.exec()

                if self._config_service and bool(
                    self._config_service.get("run_summary.write_json", False)
                ):
                    json_path = self._config_service.get("run_summary.json_path", "")
                    if not json_path:
                        last_out = ""
                        if self._config_service:
                            last_out = (
                                self._config_service.get("product.last_output_dir", "")
                                or ""
                            )
                        json_path = os.path.join(
                            get_output_directory(last_out if last_out else None),
                            f"run_summary_{summary.run_id}.json",
                        )
                    try:
                        import json

                        with open(json_path, "w", encoding="utf-8") as handle:
                            json.dump(summary.to_dict(), handle, indent=2)
                    except Exception:
                        pass
            except Exception:
                # Summary dialog is best-effort
                pass

        # Update status bar with completion message
        matched_count = sum(1 for r in results if r.matched)
        total_count = len(results)
        percentage = (matched_count / total_count * 100) if total_count > 0 else 0
        self.statusBar().showMessage(
            f"Processing complete: {matched_count}/{total_count} tracks matched ({percentage:.0f}%)",
            5000,
        )
        self._update_status_stats_from_results(results)

    def _update_status_file_path(self, file_path: str) -> None:
        """Update file path in status bar"""
        if not hasattr(self, "status_file_label"):
            return

        # Truncate path if too long
        display_path = self._truncate_path(file_path, max_length=50)
        self.status_file_label.setText(f"File: {display_path}")
        self.status_file_label.setToolTip(file_path)  # Full path in tooltip
        self.status_file_label.setVisible(True)

    def _update_status_playlist(self, playlist_name: str, track_count: int = 0) -> None:
        """Update playlist in status bar"""
        if not hasattr(self, "status_playlist_label"):
            return

        playlist_text = f"Playlist: {playlist_name}"
        if track_count > 0:
            playlist_text += f" ({track_count} tracks)"

        self.status_playlist_label.setText(playlist_text)
        self.status_playlist_label.setVisible(True)

    def _update_status_stats(self, progress_info: ProgressInfo) -> None:
        """Update statistics in status bar"""
        if not hasattr(self, "status_stats_label"):
            return

        if progress_info.total_tracks > 0 and progress_info.matched_count is not None:
            matched = progress_info.matched_count
            total = progress_info.total_tracks
            percentage = (matched / total * 100) if total > 0 else 0
            self.status_stats_label.setText(
                f"Matched: {matched}/{total} ({percentage:.0f}%)"
            )
            self.status_stats_label.setVisible(True)
        else:
            self.status_stats_label.setVisible(False)

    def _update_status_stats_from_results(self, results: List[TrackResult]) -> None:
        """Update statistics in status bar from results"""
        if not hasattr(self, "status_stats_label"):
            return

        if results:
            matched_count = sum(1 for r in results if r.matched)
            total_count = len(results)
            percentage = (matched_count / total_count * 100) if total_count > 0 else 0
            self.status_stats_label.setText(
                f"Matched: {matched_count}/{total_count} ({percentage:.0f}%)"
            )
            self.status_stats_label.setVisible(True)
        else:
            self.status_stats_label.setVisible(False)

    def _truncate_path(self, file_path: str, max_length: int = 50) -> str:
        """Truncate file path to fit in status bar"""
        if len(file_path) <= max_length:
            return file_path

        # Try to show beginning and end
        if max_length < 20:
            # Too short, just show end
            return "..." + file_path[-(max_length - 3) :]

        # Show beginning and end
        start_len = (max_length - 3) // 2
        end_len = max_length - 3 - start_len
        return file_path[:start_len] + "..." + file_path[-end_len:]

    def on_rerun_requested(self, xml_path: str, playlist_name: str) -> None:
        """Handle re-run request from history view.

        Loads the XML file and playlist, then navigates to the main tab
        with pre-filled selections.

        Args:
            xml_path: Path to the XML file to load
            playlist_name: Name of the playlist to select
        """
        try:
            # Switch to main interface if on tool selection page
            if (
                hasattr(self, "tool_selection_page")
                and self.tool_selection_page.isVisible()
            ):
                self.show_main_interface()

            # Load XML file
            if os.path.exists(xml_path):
                self.file_selector.set_file(xml_path)
                self.on_file_selected(xml_path)

                # Wait a bit for XML to load, then select playlist
                from PySide6.QtCore import QTimer

                QTimer.singleShot(
                    500, lambda: self._select_playlist_after_load(playlist_name)
                )
            else:
                QMessageBox.warning(
                    self,
                    "File Not Found",
                    f"The XML file could not be found:\n{xml_path}\n\n"
                    "Please select a different file.",
                )
                # Allow user to browse for XML file
                new_path, _ = QFileDialog.getOpenFileName(
                    self,
                    "Select XML File",
                    os.path.dirname(xml_path) if xml_path else "",
                    "XML Files (*.xml);;All Files (*.*)",
                )
                if new_path and os.path.exists(new_path):
                    self.file_selector.set_file(new_path)
                    self.on_file_selected(new_path)
                    QTimer.singleShot(
                        500, lambda: self._select_playlist_after_load(playlist_name)
                    )

            # Navigate to main tab
            self.tabs.setCurrentIndex(0)

            # Show message in status bar
            self.statusBar().showMessage(
                f"Re-run: Loaded {os.path.basename(xml_path)} - {playlist_name}", 5000
            )

        except Exception as e:
            QMessageBox.warning(
                self, "Re-run Error", f"Error loading file for re-run:\n{str(e)}"
            )

    def on_rerun_m3u_requested(self, m3u_path: str) -> None:
        """Handle re-run from Past Searches for an M3U run.

        Switches UI to Playlist file source, clears Collection path,
        sets M3U path, then starts processing from the M3U file.
        """
        try:
            if (
                hasattr(self, "tool_selection_page")
                and self.tool_selection_page.isVisible()
            ):
                self.show_main_interface()

            self._source_mode = "playlist_file"
            self.source_playlist_file_btn.setChecked(True)
            self.source_collection_btn.setChecked(False)
            self.source_content_stack.setCurrentIndex(1)
            self.source_content_box.setVisible(True)
            self.file_selector.clear()
            self.playlist_file_selector.set_file(m3u_path)
            if m3u_path and self.playlist_file_selector.validate_file(m3u_path):
                self.playlist_filename_label.setText(
                    f"Playlist: {os.path.basename(m3u_path)}"
                )
                self.playlist_stack.setCurrentIndex(1)
                self.mode_box.setVisible(True)
                self.batch_mode_radio.setVisible(False)
                self.batch_mode_radio.setEnabled(False)
                self.playlist_box.setVisible(True)
                self.start_button_container.setVisible(True)
                self._set_start_enabled(True)
                self._last_m3u_playlist_name = os.path.basename(m3u_path)
                self._last_m3u_path_for_save = m3u_path
                self.start_processing()
            else:
                self.statusBar().showMessage(
                    f"M3U file not found: {m3u_path}. Select a playlist file to re-run.",
                    6000,
                )

            self.tabs.setCurrentIndex(0)
            self.statusBar().showMessage(
                f"Re-run: Playlist file {os.path.basename(m3u_path)}", 5000
            )
        except Exception as e:
            QMessageBox.warning(
                self,
                "Re-run Error",
                f"Error loading playlist file for re-run:\n{str(e)}",
            )

    def _select_playlist_after_load(self, playlist_name: str) -> None:
        """Select playlist after XML file has been loaded"""
        try:
            if hasattr(self, "playlist_selector"):
                # Try to set the selected playlist
                self.playlist_selector.set_selected_playlist(playlist_name)
                self.on_playlist_selected(playlist_name)

                # Focus on start button (user can review and start)
                if hasattr(self, "start_button"):
                    self.start_button.setFocus()
        except Exception as e:
            print(f"Warning: Could not select playlist '{playlist_name}': {e}")

    def on_error_occurred(self, error: ProcessingError) -> None:
        """Handle error from controller.

        Hides progress section, re-enables start button, updates status bar,
        and shows an error dialog with error details.

        Args:
            error: ProcessingError object containing error information.
        """
        # Step 14: run_error telemetry
        try:
            from cuepoint.utils.run_context import get_current_run_id
            from cuepoint.utils.telemetry_helper import get_telemetry

            get_telemetry().track(
                "run_error",
                {
                    "run_id": get_current_run_id() or "",
                    "error_code": getattr(
                        error,
                        "error_code",
                        str(getattr(error, "error_type", "UNKNOWN")),
                    ),
                    "stage": "processing",
                },
            )
            get_telemetry().flush()
        except Exception:
            pass

        # Hide progress section
        self.progress_group.setVisible(False)

        # Re-enable start button
        self._set_start_enabled(True)

        # Disable cancel and pause buttons
        self.cancel_button.setEnabled(False)
        if hasattr(self, "pause_button") and self.pause_button:
            self.pause_button.setEnabled(False)

        # Update status bar with error
        self.statusBar().showMessage(f"Error: {error.message}")

        # Design 5.38, 5.40: Circuit open -> Retry now / Close (manual retry)
        if error.error_type == ErrorType.CIRCUIT_OPEN:
            from cuepoint.services.circuit_breaker import get_network_circuit_breaker

            msg = QMessageBox(self)
            msg.setIcon(QMessageBox.Icon.Warning)
            msg.setWindowTitle("Network Paused")
            msg.setText("Paused due to repeated failures.")
            msg.setInformativeText(
                "The circuit breaker tripped after 5 consecutive network failures. "
                "Wait 30 seconds or click Retry now to try again."
            )
            retry_btn = msg.addButton("Retry now", QMessageBox.ButtonRole.AcceptRole)
            msg.addButton("Close", QMessageBox.ButtonRole.RejectRole)
            msg.exec()
            if msg.clickedButton() == retry_btn:
                get_network_circuit_breaker().allow_retry()
                self.start_processing()
            return

        # Show standard error dialog
        error_dialog = ErrorDialog(error, self)
        error_dialog.exec()

    def closeEvent(self, event) -> None:
        """Handle window close event.

        Saves window state, geometry, and current settings before closing.
        Implements the "Reliability Outcome" from Step 1.4 - state persistence.

        Args:
            event: Close event.
        """
        # Step 8.4 privacy controls (best-effort, off by default)
        try:
            from cuepoint.services.privacy_service import PrivacyService

            PrivacyService().apply_exit_policies()
        except Exception:
            pass

        self.save_state()
        super().closeEvent(event)

    def save_state(self) -> None:
        """Save window state and settings.

        Saves:
        - Window geometry and state
        - Last XML file path (only if file exists and is accessible)
        - Last playlist selection
        - Last processing mode
        - Tab selection
        """
        # Use QSettings with organization/application name (set in gui_app.py)
        # This ensures consistent settings location across dev and packaged app
        settings = QSettings()

        # Save window geometry and state
        settings.setValue("geometry", self.saveGeometry())
        settings.setValue("windowState", self.saveState())

        # Save last XML file path
        if hasattr(self, "file_selector"):
            xml_path = self.file_selector.get_file_path()
            if xml_path:
                settings.setValue("last_xml", xml_path)

        # Save last playlist selection
        if hasattr(self, "playlist_selector"):
            selected_playlist = self.playlist_selector.get_selected_playlist()
            if selected_playlist:
                settings.setValue("last_playlist", selected_playlist)

        # Save last processing mode (0 = single, 1 = batch)
        if hasattr(self, "single_mode_radio") and hasattr(self, "batch_mode_radio"):
            if self.single_mode_radio.isChecked():
                settings.setValue("last_mode", 0)
            elif self.batch_mode_radio.isChecked():
                settings.setValue("last_mode", 1)

        # Save current tab
        if hasattr(self, "tabs"):
            settings.setValue("last_tab", self.tabs.currentIndex())

        # Save inCrate Discover selection (artists, labels, genres, period) so it restores next time
        if getattr(self, "_incrate_page", None) is not None:
            try:
                self._incrate_page.persist_discover_selection()
            except Exception:
                pass

        settings.sync()

    def restore_state(self) -> None:
        """Restore window state and settings.

        Restores:
        - Window geometry and state
        - Last XML file (if exists and is accessible)
        - Last playlist selection
        - Last processing mode
        - Tab selection
        """
        # Use QSettings with organization/application name (set in gui_app.py)
        # This ensures consistent settings location across dev and packaged app
        settings = QSettings()

        # Restore window geometry
        geometry = settings.value("geometry")
        if geometry:
            self.restoreGeometry(geometry)

        # Restore window state (maximized, etc.)
        window_state = settings.value("windowState")
        if window_state:
            self.restoreState(window_state)

        # Restore last XML file (if exists and valid)
        last_xml = settings.value("last_xml")
        if last_xml:
            # Validate that the file exists and is accessible
            # Also check if it's from a development path that might not exist in packaged app
            if os.path.exists(last_xml) and os.path.isfile(last_xml):
                try:
                    # Additional validation: check if path looks like a development path
                    # that shouldn't be restored in packaged app
                    is_packaged = getattr(sys, "frozen", False)
                    if is_packaged:
                        # In packaged app, only restore if file is in user-accessible location
                        # Don't restore paths from development directories (Step 8 fix)
                        from pathlib import Path

                        xml_path = Path(last_xml)
                        user_home = Path.home()
                        if not str(xml_path.resolve()).startswith(
                            str(user_home.resolve())
                        ):
                            last_xml = None  # Skip dev/test paths outside user home

                    if last_xml:
                        # Load XML file
                        if hasattr(self, "file_selector"):
                            self.file_selector.set_file(last_xml)
                            # This will trigger on_file_selected which loads playlists

                            # Restore last playlist after a short delay (allow XML to load)
                            last_playlist = settings.value("last_playlist")
                            if last_playlist and hasattr(self, "playlist_selector"):
                                # Use QTimer to restore playlist after XML loads
                                from PySide6.QtCore import QTimer

                                def restore_playlist():
                                    try:
                                        self.playlist_selector.set_selected_playlist(
                                            last_playlist
                                        )
                                    except Exception:
                                        pass  # Playlist may not exist anymore

                                QTimer.singleShot(500, restore_playlist)
                except Exception as e:
                    # Log but don't fail - state restoration is best-effort
                    import logging

                    logging.getLogger(__name__).warning(
                        f"Could not restore last XML: {e}"
                    )
            else:
                # File doesn't exist anymore, clear it from settings
                settings.remove("last_xml")
                settings.sync()

        # Restore last processing mode
        last_mode = settings.value("last_mode", 0, type=int)
        if hasattr(self, "single_mode_radio") and hasattr(self, "batch_mode_radio"):
            if last_mode == 0:
                self.single_mode_radio.setChecked(True)
            elif last_mode == 1:
                self.batch_mode_radio.setChecked(True)
            # Trigger mode change to update UI
            self.on_mode_changed()

        # Restore last tab
        if hasattr(self, "tabs"):
            last_tab = settings.value("last_tab", 0, type=int)
            if 0 <= last_tab < self.tabs.count():
                self.tabs.setCurrentIndex(last_tab)
