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

import os
import platform
import subprocess
import sys
from datetime import datetime, timedelta

# For update system (Step 5)
from typing import TYPE_CHECKING, Dict, List, Optional

if TYPE_CHECKING:
    from cuepoint.update.update_manager import UpdateManager

from PySide6.QtCore import QSettings, Qt, QTimer
from PySide6.QtGui import QAction, QDragEnterEvent, QDropEvent, QKeyEvent, QKeySequence
from PySide6.QtWidgets import (
    QButtonGroup,
    QDialog,
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
    QSplitter,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from cuepoint.models.result import TrackResult
from cuepoint.services.output_writer import write_csv_files
from cuepoint.ui.controllers.config_controller import ConfigController
from cuepoint.ui.controllers.export_controller import ExportController
from cuepoint.ui.controllers.main_controller import GUIController
from cuepoint.ui.controllers.results_controller import ResultsController
from cuepoint.ui.gui_interface import ProcessingError, ProgressInfo
from cuepoint.ui.widgets.batch_processor import BatchProcessorWidget
from cuepoint.ui.widgets.config_panel import ConfigPanel
from cuepoint.ui.widgets.dialogs import AboutDialog, ErrorDialog, UserGuideDialog
from cuepoint.ui.widgets.file_selector import FileSelector
from cuepoint.ui.widgets.history_view import HistoryView
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
        self.config_controller = ConfigController()
        # Create shortcut manager
        self.shortcut_manager = ShortcutManager(self)
        self.shortcut_manager.shortcut_conflict.connect(self.on_shortcut_conflict)
        # Tool selection page state
        self.tool_selection_page = None
        self.current_page = "tool_selection"  # or "main"
        self.init_ui()
        self.setup_connections()
        self.setup_shortcuts()
        # Restore state after UI is initialized
        self.restore_state()
        # Step 9.4: first-run onboarding (shown asynchronously after window is visible)
        self._schedule_onboarding_if_needed()

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
                    tab_order.append(self.playlist_selector.combo)

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
            if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("CUEPOINT_DISABLE_ONBOARDING"):
                return

            from cuepoint.services.onboarding_service import OnboardingService

            self._onboarding_service = OnboardingService()
            if not self._onboarding_service.should_show_onboarding():
                return

            # Defer until the event loop is running and the window is shown.
            QTimer.singleShot(0, self._show_onboarding_dialog)
        except Exception:
            # Onboarding is best-effort; never block app startup.
            return

    def _show_onboarding_dialog(self) -> None:
        """Show onboarding dialog and persist the user's choice."""
        try:
            from PySide6.QtWidgets import QDialog

            from cuepoint.ui.dialogs.onboarding_dialog import OnboardingDialog

            dialog = OnboardingDialog(self)
            result = dialog.exec()

            # Persist onboarding outcome - always mark as complete when dialog closes
            # This ensures the onboarding doesn't show again even if user closes window
            if hasattr(self, "_onboarding_service"):
                if result == QDialog.DialogCode.Accepted:
                    if dialog.dont_show_again_checked():
                        self._onboarding_service.dismiss_onboarding(dont_show_again=True)
                    else:
                        self._onboarding_service.mark_first_run_complete()
                else:
                    # User skipped or closed dialog: mark complete
                    # Check if "don't show again" was checked before dialog closed
                    try:
                        dont_show = dialog.dont_show_again_checked()
                    except:
                        dont_show = False
                    self._onboarding_service.dismiss_onboarding(dont_show_again=dont_show)
        except Exception as e:
            # If anything goes wrong, still mark as complete to prevent infinite loop
            try:
                if hasattr(self, "_onboarding_service"):
                    self._onboarding_service.mark_first_run_complete()
            except:
                pass
            return

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

        # Create tool selection page
        self.tool_selection_page = ToolSelectionPage()
        self.tool_selection_page.tool_selected.connect(self.on_tool_selected)

        # Create tab widget
        self.tabs = QTabWidget()
        
        # Initially show tool selection page
        self.show_tool_selection_page()

        # Main tab (scrollable): keeps table scrollable AND allows whole-window scroll if needed
        main_tab_content = QWidget()
        main_layout = QVBoxLayout(main_tab_content)
        main_layout.setSpacing(8)
        main_layout.setContentsMargins(10, 10, 10, 10)

        # === ROW 1: Three equal boxes filling full width ===
        row1 = QHBoxLayout()
        row1.setSpacing(10)

        # BOX 1: Collection
        self.file_box = QGroupBox("Collection")
        self.file_box.setObjectName("panelBox")
        self.file_box.setFixedHeight(75)
        file_layout = QHBoxLayout(self.file_box)
        file_layout.setContentsMargins(0, 0, 0, 0)
        self.file_selector = FileSelector()
        self.file_selector.file_selected.connect(self.on_file_selected)
        file_layout.addWidget(self.file_selector)
        row1.addWidget(self.file_box, 1)  # Equal stretch

        # BOX 2: Mode
        self.mode_box = QGroupBox("Mode")
        self.mode_box.setObjectName("panelBox")
        self.mode_box.setFixedHeight(75)
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
        self.single_mode_radio.setAccessibleDescription("Process one playlist at a time")
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
        self.batch_mode_radio.setAccessibleDescription("Process multiple playlists in sequence")
        self.batch_mode_radio.toggled.connect(self.on_mode_changed)
        self.mode_button_group.addButton(self.batch_mode_radio, 1)
        mode_layout.addWidget(self.batch_mode_radio)
        mode_layout.addStretch()
        self.mode_box.setVisible(False)
        self.mode_group = self.mode_box
        row1.addWidget(self.mode_box, 1)  # Equal stretch

        # BOX 3: Playlist
        self.playlist_box = QGroupBox("Playlist")
        self.playlist_box.setObjectName("panelBox")
        self.playlist_box.setFixedHeight(75)
        playlist_layout = QHBoxLayout(self.playlist_box)
        playlist_layout.setContentsMargins(0, 0, 0, 0)
        self.playlist_selector = PlaylistSelector()
        self.playlist_selector.playlist_selected.connect(self.on_playlist_selected)
        playlist_layout.addWidget(self.playlist_selector)
        self.playlist_box.setVisible(False)
        self.single_playlist_group = self.playlist_box
        row1.addWidget(self.playlist_box, 1)  # Equal stretch

        main_layout.addLayout(row1)

        # === Empty state hint (Step 9.4) ===
        self.empty_state_hint = QWidget()
        self.empty_state_hint.setObjectName("cardContainer")
        hint_layout = QVBoxLayout(self.empty_state_hint)
        hint_layout.setContentsMargins(18, 16, 18, 16)
        hint_layout.setSpacing(10)
        hint_layout.setAlignment(Qt.AlignCenter)

        hint_title = QLabel("Get started by selecting your Collection XML")
        hint_title.setAlignment(Qt.AlignCenter)
        hint_title.setStyleSheet("font-size: 14px; font-weight: bold;")
        hint_layout.addWidget(hint_title)

        hint_body = QLabel(
            "Export your Rekordbox collection as XML, then select it here.\n"
            "After loading, choose Single or Batch mode to continue."
        )
        hint_body.setAlignment(Qt.AlignCenter)
        hint_body.setWordWrap(True)
        hint_body.setStyleSheet("font-size: 12px; color: #ccc;")
        hint_layout.addWidget(hint_body)

        hint_buttons = QHBoxLayout()
        hint_buttons.addStretch(1)

        browse_hint_btn = QPushButton("Browse for XML…")
        browse_hint_btn.setObjectName("secondaryActionButton")
        browse_hint_btn.clicked.connect(self.on_file_open)
        hint_buttons.addWidget(browse_hint_btn)

        instructions_hint_btn = QPushButton("View instructions…")
        instructions_hint_btn.setObjectName("secondaryActionButton")
        instructions_hint_btn.clicked.connect(self.file_selector.show_instructions)
        hint_buttons.addWidget(instructions_hint_btn)

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
        self.start_button = QPushButton("▶ Start Processing")
        self.start_button.setObjectName("primaryActionButton")
        self.start_button.setToolTip(
            "Start processing the selected playlist(s).\n"
            "Searches Beatport for each track and enriches with metadata.\n"
            "Shortcut: Enter"
        )
        self.start_button.setFixedWidth(220)
        self.start_button.setFocusPolicy(Qt.StrongFocus)
        self.start_button.setAccessibleName("Start processing button")
        self.start_button.setAccessibleDescription("Start processing the selected playlist(s)")
        self.start_button.clicked.connect(self.start_processing)
        self.start_button.setEnabled(False)
        start_layout.addWidget(self.start_button)
        start_layout.addStretch()
        self.start_button_container.setVisible(False)
        main_layout.addWidget(self.start_button_container)
        
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
        self.progress_pct.setStyleSheet("font-size: 16px; font-weight: bold; color: #fff; min-width: 50px; background: transparent; padding: 0px; border: none;")
        self.progress_pct.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        prog_row1.addWidget(self.progress_pct)
        progress_main.addLayout(prog_row1)

        # Track info
        self.progress_track = QLabel("Ready to start...")
        self.progress_track.setStyleSheet("font-size: 12px; color: #ccc; background: transparent; padding: 0px; border: none;")
        self.progress_track.setWordWrap(True)
        progress_main.addWidget(self.progress_track)

        # Stats + Cancel row
        prog_row2 = QHBoxLayout()
        prog_row2.setSpacing(20)
        self.progress_elapsed = QLabel("Elapsed: 0s")
        self.progress_elapsed.setStyleSheet("font-size: 12px; color: #aaa; background: transparent; padding: 0px;")
        prog_row2.addWidget(self.progress_elapsed)
        self.progress_remaining = QLabel("Remaining: --")
        self.progress_remaining.setStyleSheet("font-size: 12px; color: #aaa; background: transparent; padding: 0px;")
        prog_row2.addWidget(self.progress_remaining)
        prog_row2.addStretch()
        self.progress_matched = QLabel("✓ Matched: 0")
        self.progress_matched.setStyleSheet("font-size: 12px; color: #4CAF50; font-weight: bold; background: transparent; padding: 0px;")
        prog_row2.addWidget(self.progress_matched)
        self.progress_unmatched = QLabel("✗ Unmatched: 0")
        self.progress_unmatched.setStyleSheet("font-size: 12px; color: #F44336; font-weight: bold; background: transparent; padding: 0px;")
        prog_row2.addWidget(self.progress_unmatched)
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.setObjectName("dangerButton")
        self.cancel_button.setFixedWidth(110)
        self.cancel_button.setFocusPolicy(Qt.StrongFocus)
        self.cancel_button.setAccessibleName("Cancel processing button")
        self.cancel_button.setAccessibleDescription("Cancel the current processing operation")
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
        results_layout.addWidget(self.results_view)
        self.results_group.setVisible(False)
        main_layout.addWidget(self.results_group, 1)  # Takes remaining space
        
        # Add stretch at end to push everything to top when results hidden
        main_layout.addStretch()

        # Create config panel (but don't add to tabs - it will be in Settings dialog)
        # Keep it accessible for getting settings during processing
        self.config_panel = ConfigPanel(config_controller=self.config_controller)

        # History tab (Past Searches)
        history_tab_content = QWidget()
        history_layout = QVBoxLayout(history_tab_content)
        history_layout.setContentsMargins(Layout.MARGIN, Layout.MARGIN, Layout.MARGIN, Layout.MARGIN)
        self.history_view = HistoryView(export_controller=self.export_controller)
        self.history_view.rerun_requested.connect(self.on_rerun_requested)
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
        self.status_stats_label.setStyleSheet("color: #4CAF50; font-weight: bold; padding: 0 5px;")
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
            "open_file", "Ctrl+O", self.on_file_open, ShortcutContext.GLOBAL, "Open XML file"
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
            "fullscreen", "F11", self.toggle_fullscreen, ShortcutContext.GLOBAL, "Toggle fullscreen"
        )

        # Main window shortcuts
        self.shortcut_manager.register_shortcut(
            "new_session", "Ctrl+N", self.on_new_session, ShortcutContext.MAIN_WINDOW, "New session"
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
        if hasattr(self, 'start_button') and self.start_button.isEnabled() and self.start_button.isVisible():
            self.start_processing()
    
    def _on_escape_cancel(self) -> None:
        """Handle Escape key to cancel processing"""
        # Only cancel if processing is active
        if hasattr(self, 'controller') and self.controller.is_processing():
            self.on_cancel_requested()

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
        if self.tool_selection_page:
            self.setCentralWidget(self.tool_selection_page)
            self.current_page = "tool_selection"

    def show_main_interface(self) -> None:
        """Show the main interface (existing tabs)"""
        self.setCentralWidget(self.tabs)
        self.tabs.show()  # Ensure tabs are visible
        self.current_page = "main"

    def on_tool_selected(self, tool_name: str) -> None:
        """Handle tool selection"""
        if tool_name == "inkey":
            # Show the main interface (XML file selection page)
            self.show_main_interface()
            # Switch to Main tab
            self.tabs.setCurrentIndex(0)

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

        # Open XML File
        open_action = QAction("&Open XML File...", self)
        open_action.setShortcut(QKeySequence.Open)
        open_action.setToolTip("Open XML file (Ctrl+O)")
        open_action.triggered.connect(self.on_file_open)
        file_menu.addAction(open_action)

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

        # Support actions (Step 9.5)
        log_viewer_action = QAction("&Log Viewer...", self)
        log_viewer_action.setToolTip("View application logs")
        log_viewer_action.triggered.connect(self.on_show_log_viewer)
        help_menu.addAction(log_viewer_action)

        support_bundle_action = QAction("Export &Support Bundle...", self)
        support_bundle_action.setToolTip("Generate a support bundle zip with diagnostics and logs")
        support_bundle_action.triggered.connect(self.on_export_support_bundle)
        help_menu.addAction(support_bundle_action)

        open_logs_action = QAction("Open &Logs Folder", self)
        open_logs_action.setToolTip("Open the logs folder in your file manager")
        open_logs_action.triggered.connect(self.on_open_logs_folder)
        help_menu.addAction(open_logs_action)

        open_exports_action = QAction("Open &Exports Folder", self)
        open_exports_action.setToolTip("Open the exports folder in your file manager")
        open_exports_action.triggered.connect(self.on_open_exports_folder)
        help_menu.addAction(open_exports_action)

        report_issue_action = QAction("&Report Issue...", self)
        report_issue_action.setToolTip("Open the issue tracker (if configured)")
        report_issue_action.triggered.connect(self.on_report_issue)
        help_menu.addAction(report_issue_action)

        help_menu.addSeparator()

        # About
        about_action = QAction("&About CuePoint", self)
        about_action.triggered.connect(self.on_show_about)
        help_menu.addAction(about_action)

        # Changelog viewer (Step 9.6)
        changelog_action = QAction("&Changelog", self)
        changelog_action.setStatusTip("View release notes and changelog")
        changelog_action.triggered.connect(self.on_show_changelog)
        help_menu.addAction(changelog_action)

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

        Opens the file browser dialog to select an XML file for processing.
        """
        self.file_selector.browse_file()

    def on_file_selected(self, file_path: str) -> None:
        """Handle file selection from FileSelector widget.

        Validates the selected file, loads playlists into the playlist
        selector, updates the batch processor, and saves to recent files.
        Shows processing mode selection after valid file is selected (progressive disclosure).

        Args:
            file_path: Path to the selected XML file.
        """
        if self.file_selector.validate_file(file_path):
            self.statusBar().showMessage(f"Loading XML file: {os.path.basename(file_path)}...")
            try:
                # Load playlists into playlist selector
                self.playlist_selector.load_xml_file(file_path)
                playlist_count = len(self.playlist_selector.playlists)
                self.statusBar().showMessage(f"File loaded: {playlist_count} playlists found")

                # Update batch processor with playlists
                self.batch_processor.set_playlists(list(self.playlist_selector.playlists.keys()))

                # SHOW MODE BOX (progressive disclosure)
                self.mode_box.setVisible(True)
                
                # Update status bar with file path
                self._update_status_file_path(file_path)
                
                # Process events to ensure visibility update is applied
                from PySide6.QtWidgets import QApplication
                QApplication.processEvents()

                # Save to recent files (don't let this fail hide the mode_group)
                try:
                    if hasattr(self, 'save_recent_file'):
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
                self.start_button.setEnabled(False)
        else:
            self.statusBar().showMessage(f"Invalid file: {file_path}")
            # Clear playlist selector if file is invalid
            self.playlist_selector.clear()
            self.batch_processor.set_playlists([])
            # Hide mode/playlist for invalid file
            self._hide_mode_playlist_boxes()
            self.start_button_container.setVisible(False)
            self.start_button.setEnabled(False)

        self._update_empty_state_hint()

    def _hide_mode_playlist_boxes(self):
        """Hide mode and playlist boxes."""
        self.mode_box.setVisible(False)
        self.playlist_box.setVisible(False)
        self.start_button.setVisible(False)
        self._update_empty_state_hint()

    def _update_empty_state_hint(self) -> None:
        """Show/hide the onboarding-style empty hint based on current state."""
        try:
            if not hasattr(self, "empty_state_hint") or not hasattr(self, "file_selector"):
                return
            file_path = self.file_selector.get_file_path()
            show = not file_path or not self.file_selector.validate_file(file_path)
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
            # Single mode - button will be enabled when playlist is selected
            # (handled in on_playlist_selected)
            self.start_button.setEnabled(False)  # Disable until playlist is selected

        # Update batch processor with playlists if file is already loaded
        if is_batch_mode and hasattr(self.playlist_selector, "playlists"):
            playlists = list(self.playlist_selector.playlists.keys())
            self.batch_processor.set_playlists(playlists)

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
                        elif dt.date() == (now.date() - datetime.timedelta(days=1)).date():
                            time_str = "Yesterday"
                        else:
                            time_str = dt.strftime("%b %d")
                        
                        # Display: "filename.xml - Today, 2:30 PM"
                        display_text = f"{file_name} - {time_str}"
                    except:
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
            QMessageBox.warning(self, "File Not Found", f"The file no longer exists:\n{file_path}")

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
        if hasattr(self, 'recent_files_menu'):
            self.update_recent_files_menu()
    
    def clear_recent_files(self) -> None:
        """Clear all recent files from the list."""
        reply = QMessageBox.question(
            self,
            "Clear Recent Files",
            "Are you sure you want to clear all recent files?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
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
            QMessageBox.warning(self, "Shortcuts", f"Could not open shortcuts dialog:\n{e}")

    def on_show_privacy(self) -> None:
        """Show privacy information and data controls via Help > Privacy."""
        try:
            from cuepoint.ui.dialogs.privacy_dialog import PrivacyDialog

            dialog = PrivacyDialog(self)
            dialog.exec()
        except Exception as e:
            QMessageBox.warning(self, "Privacy", f"Could not open Privacy dialog:\n{e}")

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
            QMessageBox.critical(self, "Support Bundle", f"Failed to create support bundle:\n{e}")

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
            QMessageBox.warning(self, "Report Issue", f"Could not open issue reporter:\n{e}")

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
        from PySide6.QtGui import QIcon
        from PySide6.QtWidgets import QApplication
        
        # Try to get icon from QApplication first (set in gui_app.py)
        app = QApplication.instance()
        if app and not app.windowIcon().isNull():
            self.setWindowIcon(app.windowIcon())
            return
        
        # Fallback: load icon directly
        if getattr(sys, 'frozen', False):
            if hasattr(sys, '_MEIPASS'):
                base_path = Path(sys._MEIPASS)
            else:
                import os
                base_path = Path(os.path.dirname(sys.executable))
            icon_path = base_path / 'assets' / 'icons' / 'logo.png'
        else:
            base_path = Path(__file__).resolve().parent.parent
            icon_path = base_path / 'assets' / 'icons' / 'logo.png'
        
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
        if getattr(sys, 'frozen', False):
            # Running as packaged app
            if hasattr(sys, '_MEIPASS'):
                base_path = Path(sys._MEIPASS)
            else:
                base_path = Path(os.path.dirname(sys.executable))
            logo_path = base_path / 'assets' / 'icons' / 'logo.png'
        else:
            # Running as script - use SRC/cuepoint/ui/assets/icons
            base_path = Path(__file__).resolve().parent.parent
            logo_path = base_path / 'assets' / 'icons' / 'logo.png'
        
        if not logo_path.exists():
            return None
        
        try:
            pixmap = QPixmap(str(logo_path))
            if pixmap.isNull():
                return None
            
            # Scale to fit status bar (small size: 80px width)
            if pixmap.width() > 80:
                pixmap = pixmap.scaledToWidth(80, Qt.TransformationMode.SmoothTransformation)
            
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
            QMessageBox.warning(self, "Changelog", f"Could not open changelog viewer:\n{e}")

    def _setup_update_system(self) -> None:
        """Set up update system (Step 5.5)."""
        try:
            from cuepoint.update.update_manager import UpdateManager
            from cuepoint.update.update_ui import show_update_dialog, show_update_error_dialog
            from cuepoint.version import get_version

            current_version = get_version()
            feed_url = "https://stuchain.github.io/CuePoint/updates"

            # Create update manager
            self.update_manager = UpdateManager(current_version, feed_url)

            # Set callbacks
            self.update_manager.set_on_update_available(self._on_update_available)
            self.update_manager.set_on_check_complete(self._on_update_check_complete)
            self.update_manager.set_on_error(self._on_update_error)

            # Schedule startup check (after window is visible)
            QTimer.singleShot(2000, self._check_for_updates_on_startup)
        except Exception as e:
            # Update system is best-effort
            import logging

            logging.warning(f"Could not set up update system: {e}")
            self.update_manager = None

    def _check_for_updates_on_startup(self) -> None:
        """Check for updates on startup (Step 5.5)."""
        if hasattr(self, "update_manager") and self.update_manager:
            try:
                # Check if should check on startup
                from cuepoint.update.update_preferences import UpdatePreferences

                if self.update_manager.preferences.get_check_frequency() == UpdatePreferences.CHECK_ON_STARTUP:
                    self.update_manager.check_for_updates(force=False)
            except Exception as e:
                import logging

                logging.warning(f"Startup update check failed: {e}")

    def on_check_for_updates(self) -> None:
        """Check for updates manually via Help > Check for Updates (Step 5.5)."""
        if not hasattr(self, "update_manager") or not self.update_manager:
            QMessageBox.information(
                self,
                "Check for Updates",
                "Update system is not available.",
            )
            return

        # Show checking message
        self.statusBar().showMessage("Checking for updates...", 3000)

        # Force check
        if self.update_manager.check_for_updates(force=True):
            self.statusBar().showMessage("Checking for updates...", 0)
        else:
            self.statusBar().showMessage("Update check already in progress", 2000)

    def _on_update_available(self, update_info: Dict) -> None:
        """Handle update available callback (Step 5.5).

        Args:
            update_info: Update information dictionary.
        """
        try:
            from cuepoint.update.update_ui import show_update_dialog
            from cuepoint.version import get_version

            current_version = get_version()
            new_version = update_info.get("version") or update_info.get("short_version", "Unknown")

            # Show update dialog
            result = show_update_dialog(
                current_version=current_version,
                update_info=update_info,
                parent=self,
                on_install=self._on_update_install,
                on_later=self._on_update_later,
                on_skip=self._on_update_skip,
            )

            # Update status bar
            self.statusBar().showMessage(f"Update available: {new_version}", 5000)
        except Exception as e:
            import logging

            logging.error(f"Error showing update dialog: {e}")
            QMessageBox.warning(
                self,
                "Update Available",
                f"An update is available, but there was an error displaying it:\n{e}",
            )

    def _on_update_check_complete(self, update_available: bool, error: Optional[str]) -> None:
        """Handle update check complete callback (Step 5.5).

        Args:
            update_available: True if update is available.
            error: Error message if check failed.
        """
        if error:
            self.statusBar().showMessage(f"Update check failed: {error}", 5000)
        elif update_available:
            # Update dialog will be shown by _on_update_available
            pass
        else:
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
            QMessageBox.warning(self, "Update Error", f"Error checking for updates:\n{error_message}")

    def _on_update_install(self) -> None:
        """Handle update install action (Step 5.5)."""
        # For v1.0, we just open the download URL
        # Framework integration (Sparkle/WinSparkle) will handle actual installation
        if hasattr(self, "update_manager") and self.update_manager:
            update_info = self.update_manager._update_available
            if update_info:
                download_url = update_info.get("enclosure", {}).get("url") if isinstance(update_info.get("enclosure"), dict) else None
                if download_url:
                    from PySide6.QtCore import QUrl
                    from PySide6.QtGui import QDesktopServices

                    QDesktopServices.openUrl(QUrl(download_url))
                    self.statusBar().showMessage("Opening download page...", 3000)
                else:
                    QMessageBox.information(
                        self,
                        "Update",
                        "Download URL not available. Please check the release page manually.",
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
                    self.statusBar().showMessage(f"Version {version} will be skipped", 3000)

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
        self.controller.progress_updated.connect(self.batch_processor.on_playlist_progress)
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
            if hasattr(self.controller, "batch_index") and self.controller.batch_index >= len(
                self.batch_playlist_names
            ):
                # Batch complete - reconnect regular signals
                self._reconnect_regular_signals()
            elif hasattr(self.controller, "batch_index") and self.controller.batch_index < len(
                self.batch_playlist_names
            ):
                # Notify start of next playlist
                next_playlist_name = self.batch_playlist_names[self.controller.batch_index]
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
            if hasattr(self.controller, "batch_index") and self.controller.batch_index >= len(
                self.batch_playlist_names
            ):
                # Batch complete - reconnect regular signals
                self._reconnect_regular_signals()
            elif hasattr(self.controller, "batch_index") and self.controller.batch_index < len(
                self.batch_playlist_names
            ):
                # Notify start of next playlist
                next_playlist_name = self.batch_playlist_names[self.controller.batch_index]
                self.batch_processor.on_playlist_started(next_playlist_name)

    def _reconnect_regular_signals(self) -> None:
        """Reconnect regular processing signals after batch processing completes.

        Disconnects batch-specific signal handlers and reconnects the
        regular signal handlers for single playlist processing mode.
        """
        try:
            self.controller.progress_updated.disconnect(self.batch_processor.on_playlist_progress)
        except BaseException:
            pass
        try:
            self.controller.processing_complete.disconnect(self._on_batch_playlist_complete)
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
            name: results for name, results in results_dict.items() if results is not None
        }

        if not filtered_dict:
            self.statusBar().showMessage("Batch processing complete, but no results to display")
            return

        # Ensure we're on Main tab (should already be there, but just in case)
        self.tabs.setCurrentIndex(0)

        # Hide batch processor progress, show results
        # Note: batch processor has its own progress display, regular
        # progress_group is for single mode
        self.progress_group.setVisible(False)
        self.results_group.setVisible(True)

        # Re-enable start button
        self.start_button.setEnabled(True)

        # Disable cancel button
        self.cancel_button.setEnabled(False)

        # Automatically save results for each playlist
        for playlist_name, results in filtered_dict.items():
            if results:  # Only save if there are results
                self._auto_save_results(results, playlist_name)

        # Update results view with batch results (separate table per playlist)
        self.results_view.set_batch_results(filtered_dict)

        # Calculate summary statistics for status bar
        total = sum(len(results) for results in filtered_dict.values())
        matched = sum(sum(1 for r in results if r.matched) for results in filtered_dict.values())
        match_rate = (matched / total * 100) if total > 0 else 0

        # Update status bar
        self.statusBar().showMessage(
            f"Batch processing complete: {len(filtered_dict)} playlist(s), "
            f"{total} total tracks, {matched}/{total} matched ({match_rate:.1f}%)"
        )

    def _auto_save_results(self, results: List[TrackResult], playlist_name: str) -> None:
        """Automatically save results to CSV file after processing.

        Creates a sanitized filename from the playlist name and saves
        results to the output directory. Updates the history view to
        show the new file.

        Args:
            results: List of TrackResult objects to save.
            playlist_name: Name of the playlist for file naming.
        """
        if not results:
            return

        try:
            # Sanitize playlist name for filename (remove invalid characters)
            safe_playlist_name = "".join(
                c for c in playlist_name if c.isalnum() or c in (" ", "-", "_")
            ).strip()
            if not safe_playlist_name:
                safe_playlist_name = "playlist"

            # Create base filename (write_csv_files will add timestamp)
            base_filename = f"{safe_playlist_name}.csv"

            # Use the single, consistent output directory
            output_dir = get_output_directory()

            # Write CSV files (this will add timestamp automatically)
            output_files = write_csv_files(results, base_filename, output_dir)

            # Show success message in status bar
            if output_files.get("main"):
                main_file = output_files["main"]
                self.statusBar().showMessage(f"Results saved: {os.path.basename(main_file)}", 3000)

                # Refresh Past Searches tab to show the new file
                if hasattr(self, "history_view"):
                    # Use QTimer to refresh after a delay to ensure file system has updated
                    from PySide6.QtCore import QTimer

                    def refresh_with_file():
                        try:
                            # Refresh the history view to show the new file
                            self.history_view.refresh_recent_files()
                            # Also switch to Past Searches tab to show the new file
                            if hasattr(self, "tabs"):
                                # Find Past Searches tab index
                                for i in range(self.tabs.count()):
                                    if self.tabs.tabText(i) == "Past Searches":
                                        self.tabs.setCurrentIndex(i)
                                        break
                        except Exception as e:
                            # Log but don't fail - refresh is best-effort
                            import logging
                            logging.getLogger(__name__).warning(f"Could not refresh history view: {e}")

                    # Refresh after a short delay to ensure file system has updated
                    QTimer.singleShot(500, refresh_with_file)

        except Exception as e:
            # Show error in status bar for longer
            import traceback

            error_msg = f"Warning: Could not auto-save results: {str(e)}"
            self.statusBar().showMessage(error_msg, 10000)
            print(f"Auto-save error: {traceback.format_exc()}")

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
            # ENABLE START BUTTON when playlist is selected (progressive disclosure)
            self.start_button.setEnabled(True)
            # Ensure start button container is visible
            self.start_button_container.setVisible(True)
        else:
            # DISABLE START BUTTON if no playlist selected
            self.start_button.setEnabled(False)

    def start_processing(self) -> None:
        """Start processing the selected playlist.

        Validates inputs (XML file and playlist), resets progress widget,
        shows progress section, disables start button, and starts processing
        via the controller. Handles performance monitoring tab if enabled.
        """
        # Get file path and playlist name
        xml_path = self.file_selector.get_file_path()
        playlist_name = self.playlist_selector.get_selected_playlist()

        # Validate inputs
        if not xml_path or not self.file_selector.validate_file(xml_path):
            self.statusBar().showMessage("Please select a valid XML file")
            return

        if not playlist_name:
            self.statusBar().showMessage("Please select a playlist")
            return

        # Reset progress widget
        self._reset_progress()

        # Show progress section, hide results
        self.progress_group.setVisible(True)
        self.results_group.setVisible(False)

        # Disable start button during processing
        self.start_button.setEnabled(False)

        # Enable cancel button
        self.cancel_button.setEnabled(True)

        # Update status
        self.statusBar().showMessage(f"Starting processing: {playlist_name}...")

        # Get settings from config panel
        settings = self.config_panel.get_settings()
        auto_research = self.config_panel.get_auto_research()

        # Handle performance monitoring tab
        track_performance = settings.get("track_performance", False)
        print(f"[DEBUG] track_performance setting: {track_performance}")  # Debug output

        if track_performance:
            # Add performance tab if not already added
            if self.performance_tab_index is None:
                print("[DEBUG] Adding Performance tab")  # Debug output
                self.performance_tab_index = self.tabs.addTab(self.performance_view, "Performance")
                self.performance_view.start_monitoring()
                # Switch to performance tab to show it to the user
                self.tabs.setCurrentIndex(self.performance_tab_index)
                print(
                    f"[DEBUG] Performance tab added at index {self.performance_tab_index}"
                )  # Debug output
            else:
                # Tab already exists, just start monitoring
                print("[DEBUG] Performance tab already exists, starting monitoring")  # Debug output
                self.performance_view.start_monitoring()
                # Switch to performance tab to show it to the user
                self.tabs.setCurrentIndex(self.performance_tab_index)
        else:
            print("[DEBUG] track_performance is False, not adding Performance tab")  # Debug output
            # Remove performance tab if it exists
            if self.performance_tab_index is not None:
                self.performance_view.stop_monitoring()
                self.tabs.removeTab(self.performance_tab_index)
                self.performance_tab_index = None

        # Track processing start time for cancel confirmation
        self._processing_start_time = datetime.now()
        
        # Start processing via controller
        self.controller.start_processing(
            xml_path=xml_path,
            playlist_name=playlist_name,
            settings=settings,
            auto_research=auto_research,
        )

    def on_cancel_requested(self) -> None:
        """Handle cancel button click from ProgressWidget.

        Cancels the current processing operation with proper error handling
        to prevent crashes. Shows confirmation dialog if processing has been
        running for more than 5 seconds. Disables cancel button immediately
        and re-enables UI after cancellation completes.
        """
        try:
            # Prevent multiple cancel requests
            if hasattr(self, '_cancelling') and self._cancelling:
                return
            
            # Check if processing has been running for a while and show confirmation
            try:
                if hasattr(self, '_processing_start_time') and self._processing_start_time:
                    elapsed = (datetime.now() - self._processing_start_time).total_seconds()
                    if elapsed > 5:  # More than 5 seconds
                        reply = QMessageBox.question(
                            self,
                            "Cancel Processing?",
                            f"Processing is in progress.\n\n"
                            f"Are you sure you want to cancel?\n"
                            f"All progress will be lost.",
                            QMessageBox.Yes | QMessageBox.No,
                            QMessageBox.No
                        )
                        if reply == QMessageBox.No:
                            return
            except Exception:
                # If confirmation dialog fails, continue with cancellation anyway
                pass
            
            self._cancelling = True
            
            # Disable cancel button immediately to prevent multiple clicks
            try:
                if hasattr(self, 'cancel_button') and self.cancel_button:
                    self.cancel_button.setEnabled(False)
                    self.cancel_button.setText("Cancelling...")
            except Exception:
                pass
            
            # Cancel processing in a safe way
            try:
                if hasattr(self, 'controller') and self.controller:
                    if hasattr(self.controller, 'is_processing') and self.controller.is_processing():
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
                if hasattr(self, 'statusBar') and self.statusBar():
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
                if hasattr(self, 'statusBar') and self.statusBar():
                    self.statusBar().showMessage(error_msg, 5000)
            except:
                pass
            # Still try to reset UI
            try:
                from PySide6.QtCore import QTimer
                QTimer.singleShot(500, self._on_cancel_complete)
            except:
                # Last resort: reset cancelling flag directly
                try:
                    self._cancelling = False
                except:
                    pass

    def _on_cancel_complete(self) -> None:
        """Called after cancellation is complete - safely reset UI"""
        try:
            # Check if window still exists (prevent crash if window was closed)
            if not hasattr(self, 'isVisible') or not self.isVisible():
                return
            
            self._cancelling = False
            
            # Re-enable start button
            if hasattr(self, 'start_button') and self.start_button:
                try:
                    self.start_button.setEnabled(True)
                except RuntimeError:
                    # Widget might have been deleted
                    pass
            
            # Reset cancel button
            if hasattr(self, 'cancel_button'):
                try:
                    self.cancel_button.setEnabled(True)
                    self.cancel_button.setText("Cancel")
                except RuntimeError:
                    pass
            
            # Hide progress section
            if hasattr(self, 'progress_group') and self.progress_group:
                try:
                    self.progress_group.setVisible(False)
                except RuntimeError:
                    pass
            
            if hasattr(self, 'statusBar'):
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
                if hasattr(self, 'statusBar') and hasattr(self, 'isVisible') and self.isVisible():
                    self.statusBar().showMessage("Processing cancelled (with errors)", 3000)
            except:
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

        # Current track
        if progress_info.current_track:
            title = progress_info.current_track.get("title", "Unknown")
            artists = progress_info.current_track.get("artists", "Unknown")
            self.progress_track.setText(f"{progress_info.completed_tracks}/{progress_info.total_tracks}: {title} - {artists}")
        else:
            self.progress_track.setText(f"Processing track {progress_info.completed_tracks}/{progress_info.total_tracks}...")

        # Stats
        self.progress_matched.setText(f"✓ Matched: {progress_info.matched_count}")
        self.progress_unmatched.setText(f"✗ Unmatched: {progress_info.unmatched_count}")

        # Time
        if progress_info.elapsed_time > 0:
            self.progress_elapsed.setText(f"Elapsed: {self._format_time(progress_info.elapsed_time)}")
            if progress_info.completed_tracks > 0:
                avg = progress_info.elapsed_time / progress_info.completed_tracks
                remaining = avg * (progress_info.total_tracks - progress_info.completed_tracks)
                self.progress_remaining.setText(f"Remaining: {self._format_time(remaining)}")
        
        # Update status bar progress indicator
        if hasattr(self, 'status_progress') and self.controller.is_processing():
            if progress_info.total_tracks > 0:
                percentage = (progress_info.completed_tracks / progress_info.total_tracks) * 100
                self.status_progress.setMaximum(100)
                self.status_progress.setValue(int(percentage))
                self.status_progress.setVisible(True)
        else:
            if hasattr(self, 'status_progress'):
                self.status_progress.setVisible(False)

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
        if hasattr(self, 'status_progress'):
            self.status_progress.setVisible(False)

        # Switch to Main tab to show results
        self.tabs.setCurrentIndex(0)

        # Re-enable start button
        self.start_button.setEnabled(True)

        # Disable cancel button
        self.cancel_button.setEnabled(False)
        
        # Clear processing start time
        if hasattr(self, '_processing_start_time'):
            self._processing_start_time = None
        
        # Get playlist name for file naming
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
            self._auto_save_results(results, playlist_name)

        # Update status bar with completion message
        matched_count = sum(1 for r in results if r.matched)
        total_count = len(results)
        percentage = (matched_count / total_count * 100) if total_count > 0 else 0
        self.statusBar().showMessage(
            f"Processing complete: {matched_count}/{total_count} tracks matched ({percentage:.0f}%)",
            5000
        )
        self._update_status_stats_from_results(results)
    
    def _update_status_file_path(self, file_path: str) -> None:
        """Update file path in status bar"""
        if not hasattr(self, 'status_file_label'):
            return
        
        # Truncate path if too long
        display_path = self._truncate_path(file_path, max_length=50)
        self.status_file_label.setText(f"File: {display_path}")
        self.status_file_label.setToolTip(file_path)  # Full path in tooltip
        self.status_file_label.setVisible(True)
    
    def _update_status_playlist(self, playlist_name: str, track_count: int = 0) -> None:
        """Update playlist in status bar"""
        if not hasattr(self, 'status_playlist_label'):
            return
        
        playlist_text = f"Playlist: {playlist_name}"
        if track_count > 0:
            playlist_text += f" ({track_count} tracks)"
        
        self.status_playlist_label.setText(playlist_text)
        self.status_playlist_label.setVisible(True)
    
    def _update_status_stats(self, progress_info: ProgressInfo) -> None:
        """Update statistics in status bar"""
        if not hasattr(self, 'status_stats_label'):
            return
        
        if progress_info.total_tracks > 0 and progress_info.matched_count is not None:
            matched = progress_info.matched_count
            total = progress_info.total_tracks
            percentage = (matched / total * 100) if total > 0 else 0
            self.status_stats_label.setText(f"Matched: {matched}/{total} ({percentage:.0f}%)")
            self.status_stats_label.setVisible(True)
        else:
            self.status_stats_label.setVisible(False)
    
    def _update_status_stats_from_results(self, results: List[TrackResult]) -> None:
        """Update statistics in status bar from results"""
        if not hasattr(self, 'status_stats_label'):
            return
        
        if results:
            matched_count = sum(1 for r in results if r.matched)
            total_count = len(results)
            percentage = (matched_count / total_count * 100) if total_count > 0 else 0
            self.status_stats_label.setText(f"Matched: {matched_count}/{total_count} ({percentage:.0f}%)")
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
            return "..." + file_path[-(max_length - 3):]
        
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
            if hasattr(self, 'tool_selection_page') and self.tool_selection_page.isVisible():
                self.show_main_interface()
            
            # Load XML file
            if os.path.exists(xml_path):
                self.file_selector.set_file(xml_path)
                self.on_file_selected(xml_path)
                
                # Wait a bit for XML to load, then select playlist
                from PySide6.QtCore import QTimer
                QTimer.singleShot(500, lambda: self._select_playlist_after_load(playlist_name))
            else:
                QMessageBox.warning(
                    self,
                    "File Not Found",
                    f"The XML file could not be found:\n{xml_path}\n\n"
                    "Please select a different file."
                )
                # Allow user to browse for XML file
                new_path, _ = QFileDialog.getOpenFileName(
                    self,
                    "Select XML File",
                    os.path.dirname(xml_path) if xml_path else "",
                    "XML Files (*.xml);;All Files (*.*)"
                )
                if new_path and os.path.exists(new_path):
                    self.file_selector.set_file(new_path)
                    self.on_file_selected(new_path)
                    QTimer.singleShot(500, lambda: self._select_playlist_after_load(playlist_name))
            
            # Navigate to main tab
            self.tabs.setCurrentIndex(0)
            
            # Show message in status bar
            self.statusBar().showMessage(
                f"Re-run: Loaded {os.path.basename(xml_path)} - {playlist_name}",
                5000
            )
            
        except Exception as e:
            QMessageBox.warning(
                self,
                "Re-run Error",
                f"Error loading file for re-run:\n{str(e)}"
            )
    
    def _select_playlist_after_load(self, playlist_name: str) -> None:
        """Select playlist after XML file has been loaded"""
        try:
            if hasattr(self, 'playlist_selector'):
                # Try to set the selected playlist
                self.playlist_selector.set_selected_playlist(playlist_name)
                self.on_playlist_selected(playlist_name)
                
                # Focus on start button (user can review and start)
                if hasattr(self, 'start_button'):
                    self.start_button.setFocus()
        except Exception as e:
            print(f"Warning: Could not select playlist '{playlist_name}': {e}")

            # Automatically save results to CSV (after displaying)
            self._auto_save_results(results, playlist_name)
        else:
            self.statusBar().showMessage("Processing complete: No results to display", 5000)

    def on_error_occurred(self, error: ProcessingError) -> None:
        """Handle error from controller.

        Hides progress section, re-enables start button, updates status bar,
        and shows an error dialog with error details.

        Args:
            error: ProcessingError object containing error information.
        """
        # Hide progress section
        self.progress_group.setVisible(False)

        # Re-enable start button
        self.start_button.setEnabled(True)

        # Disable cancel button
        self.cancel_button.setEnabled(False)

        # Update status bar with error
        self.statusBar().showMessage(f"Error: {error.message}")

        # Show error dialog
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
                        # Don't restore paths from development directories
                        from pathlib import Path
                        xml_path = Path(last_xml)
                        # Check if path is in a typical user location (not in temp or dev directories)
                        user_home = Path.home()
                        # Allow paths in user's home directory, Documents, Downloads, Desktop, etc.
                        if not (str(xml_path).startswith(str(user_home)) or 
                                "AppData" in str(xml_path) or 
                                "Documents" in str(xml_path) or
                                "Downloads" in str(xml_path) or
                                "Desktop" in str(xml_path)):
                            # Skip restoring development/test paths in packaged app
                            last_xml = None
                    
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
                                        self.playlist_selector.set_selected_playlist(last_playlist)
                                    except Exception:
                                        pass  # Playlist may not exist anymore

                                QTimer.singleShot(500, restore_playlist)
                except Exception as e:
                    # Log but don't fail - state restoration is best-effort
                    import logging
                    logging.getLogger(__name__).warning(f"Could not restore last XML: {e}")
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
            if 0 <= last_tab < self.tabs.count():
                self.tabs.setCurrentIndex(last_tab)
