#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Results View Widget Module - Results display and export.

This module contains the ResultsView widget, which provides a comprehensive
interface for displaying and managing processing results. Features include:

- Summary statistics display
- Filterable results table (search, confidence, year, BPM, key)
- Support for single playlist and batch processing modes
- Candidate viewing and selection
- Export functionality (CSV, JSON, Excel)
- Keyboard shortcuts for common operations

The widget handles both single playlist results and batch results with
separate tables per playlist in batch mode.
"""

import os
import platform
import subprocess
import time
from typing import Any, Dict, List, Optional

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMenu,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from cuepoint.services.output_writer import write_csv_files, write_excel_file, write_json_file
from cuepoint.ui.dialogs.export_dialog import ExportDialog
from cuepoint.ui.gui_interface import TrackResult
from cuepoint.ui.widgets.candidate_dialog import CandidateDialog
from cuepoint.ui.widgets.shortcut_manager import ShortcutContext, ShortcutManager
from cuepoint.utils.utils import with_timestamp

try:
    from performance import performance_collector

    PERFORMANCE_AVAILABLE = True
except ImportError:
    PERFORMANCE_AVAILABLE = False
    performance_collector = None


class ResultsView(QWidget):
    """Widget for displaying processing results and exporting to various formats.

    This widget provides a comprehensive view of processing results including:
    - Summary statistics display
    - Filterable results table (single playlist mode)
    - Tabbed results view (batch mode with multiple playlists)
    - Export functionality (CSV, JSON, Excel)
    - Candidate selection and viewing

    The widget supports both single playlist and batch processing modes,
    with separate UI layouts for each mode.

    Attributes:
        results: List of TrackResult objects for single playlist mode.
        batch_results: Dictionary mapping playlist names to TrackResult lists.
        output_files: Dictionary of exported file paths.
        is_batch_mode: Boolean indicating if in batch mode.
        playlist_tables: Dictionary mapping playlist names to QTableWidget instances.
        playlist_filters: Dictionary mapping playlist names to filter widget dictionaries.
        filtered_results: List of filtered TrackResult objects for single mode.
        playlist_name: Name of the current playlist (for file naming).

    Signals:
        result_updated: Emitted when a candidate is selected for a result.
            Args:
                playlist_index: Index of the track in the playlist.
                updated_result: Updated TrackResult object.

    Example:
        >>> view = ResultsView()
        >>> view.set_results(results, "My Playlist")
        >>> view.show_export_dialog()
    """

    # Signal emitted when a result is updated (candidate selected)
    result_updated = Signal(int, TrackResult)  # playlist_index, updated_result

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.results: List[TrackResult] = []
        self.batch_results: Dict[str, List[TrackResult]] = {}  # For batch mode
        self.output_files: dict = {}
        self.is_batch_mode = False
        self.playlist_tables: Dict[str, QTableWidget] = {}  # Store tables for each playlist
        self.playlist_filters: Dict[str, Dict[str, Any]] = {}  # Store filters for each playlist
        self.filtered_results: List[TrackResult] = []  # Store filtered results for single mode
        self._filter_debounce_timer = QTimer()
        self._filter_debounce_timer.setSingleShot(True)
        self._filter_debounce_timer.timeout.connect(self._apply_filters_debounced)
        # Create shortcut manager
        self.shortcut_manager = ShortcutManager(self)
        self.init_ui()
        self.setup_shortcuts()

    def init_ui(self) -> None:
        """Initialize all UI components and layout.

        Sets up the results view structure including:
        - Summary statistics group
        - Filter controls (search, confidence, advanced filters)
        - Results table for single playlist mode
        - Tab widget for batch mode
        - Export buttons
        """
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(5, 5, 5, 5)

        # Create vertical splitter for resizable sections
        splitter = QSplitter(Qt.Vertical)
        splitter.setChildrenCollapsible(False)  # Prevent sections from being collapsed completely

        # Top section: Summary and filters
        top_widget = QWidget()
        top_layout = QVBoxLayout(top_widget)
        top_layout.setSpacing(10)
        top_layout.setContentsMargins(0, 0, 0, 0)

        # Summary statistics group
        summary_group = QGroupBox("Summary Statistics")
        summary_layout = QVBoxLayout()
        self.summary_label = QLabel("No results yet")
        self.summary_label.setWordWrap(True)
        summary_layout.addWidget(self.summary_label)
        summary_group.setLayout(summary_layout)
        top_layout.addWidget(summary_group)

        # Filter controls section (in top widget)
        filters_group = QGroupBox("Filters")
        filters_layout = QVBoxLayout()

        # Basic filter controls
        filter_layout = QHBoxLayout()

        # Search box
        search_label = QLabel("Search:")
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search...")
        self.search_box.textChanged.connect(self._trigger_filter_debounced)
        search_label.setBuddy(self.search_box)  # Associate label with input
        self.search_box.setToolTip("Search for tracks by title, artist, or Beatport data (Ctrl+F)")
        self.search_box.setAccessibleName("Search input field")
        self.search_box.setAccessibleDescription(
            "Enter text to search for tracks. Keyboard shortcut: Ctrl+F"
        )
        self.search_box.setFocusPolicy(Qt.StrongFocus)
        filter_layout.addWidget(search_label)
        filter_layout.addWidget(self.search_box)

        # Confidence filter
        confidence_label = QLabel("Confidence:")
        self.confidence_filter = QComboBox()
        self.confidence_filter.addItems(["All", "High", "Medium", "Low"])
        self.confidence_filter.currentTextChanged.connect(self._trigger_filter_debounced)
        confidence_label.setBuddy(self.confidence_filter)  # Associate label with input
        self.confidence_filter.setToolTip("Filter results by match confidence level")
        self.confidence_filter.setAccessibleName("Confidence filter")
        self.confidence_filter.setAccessibleDescription("Select confidence level to filter results")
        self.confidence_filter.setFocusPolicy(Qt.StrongFocus)
        filter_layout.addWidget(confidence_label)
        filter_layout.addWidget(self.confidence_filter)

        filter_layout.addStretch()
        filters_layout.addLayout(filter_layout)

        # Advanced Filters Group
        advanced_filters_group = QGroupBox("Advanced Filters")
        advanced_filters_group.setCheckable(True)
        advanced_filters_group.setChecked(False)  # Unchecked by default
        advanced_filters_layout = QVBoxLayout()

        # Container widget for filter controls (to show/hide)
        self.advanced_filters_container = QWidget()
        container_layout = QVBoxLayout(self.advanced_filters_container)
        container_layout.setContentsMargins(0, 0, 0, 0)

        # Year range filter
        year_layout = QHBoxLayout()
        year_layout.addWidget(QLabel("Year Range:"))
        self.year_min = QSpinBox()
        self.year_min.setMinimum(1900)
        self.year_min.setMaximum(2100)
        self.year_min.setValue(1900)
        self.year_min.setSpecialValueText("Any")
        self.year_min.setToolTip("Minimum year (leave at 1900 for no minimum)")
        self.year_min.setSuffix(" -")
        self.year_min.valueChanged.connect(self._trigger_filter_debounced)
        year_layout.addWidget(self.year_min)

        self.year_max = QSpinBox()
        self.year_max.setMinimum(1900)
        self.year_max.setMaximum(2100)
        self.year_max.setValue(2100)
        self.year_max.setSpecialValueText("Any")
        self.year_max.setToolTip("Maximum year (leave at 2100 for no maximum)")
        self.year_max.valueChanged.connect(self._trigger_filter_debounced)
        year_layout.addWidget(self.year_max)
        year_layout.addStretch()
        container_layout.addLayout(year_layout)

        # BPM range filter
        bpm_layout = QHBoxLayout()
        bpm_layout.addWidget(QLabel("BPM Range:"))
        self.bpm_min = QSpinBox()
        self.bpm_min.setMinimum(60)
        self.bpm_min.setMaximum(200)
        self.bpm_min.setValue(60)
        self.bpm_min.setSpecialValueText("Any")
        self.bpm_min.setToolTip("Minimum BPM (leave at 60 for no minimum)")
        self.bpm_min.setSuffix(" -")
        self.bpm_min.valueChanged.connect(self._trigger_filter_debounced)
        bpm_layout.addWidget(self.bpm_min)

        self.bpm_max = QSpinBox()
        self.bpm_max.setMinimum(60)
        self.bpm_max.setMaximum(200)
        self.bpm_max.setValue(200)
        self.bpm_max.setSpecialValueText("Any")
        self.bpm_max.setToolTip("Maximum BPM (leave at 200 for no maximum)")
        self.bpm_max.valueChanged.connect(self._trigger_filter_debounced)
        bpm_layout.addWidget(self.bpm_max)
        bpm_layout.addStretch()
        container_layout.addLayout(bpm_layout)

        # Key filter
        key_layout = QHBoxLayout()
        key_layout.addWidget(QLabel("Musical Key:"))
        self.key_filter = QComboBox()
        keys = (
            ["All"]
            + [f"{k} Major" for k in "C C# D D# E F F# G G# A A# B".split()]
            + [f"{k} Minor" for k in "C C# D D# E F F# G G# A A# B".split()]
        )
        self.key_filter.addItems(keys)
        self.key_filter.setToolTip(
            "Filter by musical key (only shows matched tracks with key data)"
        )
        self.key_filter.setMinimumWidth(150)
        self.key_filter.currentTextChanged.connect(self._trigger_filter_debounced)
        key_layout.addWidget(self.key_filter)
        key_layout.addStretch()
        container_layout.addLayout(key_layout)

        # Clear filters button
        clear_button = QPushButton("Clear All Filters")
        clear_button.setToolTip("Reset all filters to default values (Ctrl+Shift+F)")
        clear_button.setAccessibleName("Clear all filters button")
        clear_button.setAccessibleDescription(
            "Click to reset all filters. Keyboard shortcut: Ctrl+Shift+F"
        )
        clear_button.setFocusPolicy(Qt.StrongFocus)
        clear_button.clicked.connect(self.clear_filters)
        container_layout.addWidget(clear_button)

        # Hide container by default
        self.advanced_filters_container.setVisible(False)

        # Connect checkbox to show/hide container
        advanced_filters_group.toggled.connect(self.advanced_filters_container.setVisible)

        advanced_filters_layout.addWidget(self.advanced_filters_container)
        advanced_filters_group.setLayout(advanced_filters_layout)
        filters_layout.addWidget(advanced_filters_group)

        filters_group.setLayout(filters_layout)
        top_layout.addWidget(filters_group)

        # Add top section to splitter
        top_widget.setMaximumHeight(400)  # Set max height for top section
        splitter.addWidget(top_widget)

        # Bottom section: Results table (single playlist mode)
        self.single_table_group = QGroupBox("Results")
        single_table_layout = QVBoxLayout()

        # Result count and filter status
        status_layout = QHBoxLayout()
        self.result_count_label = QLabel("0 results")
        self.result_count_label.setStyleSheet("font-weight: bold;")
        status_layout.addWidget(self.result_count_label)

        self.filter_status_label = QLabel("")
        self.filter_status_label.setStyleSheet("color: gray;")
        status_layout.addStretch()
        status_layout.addWidget(self.filter_status_label)
        single_table_layout.addLayout(status_layout)

        # Create table with key columns
        self.table = QTableWidget()
        self.table.setColumnCount(11)
        self.table.setHorizontalHeaderLabels(
            [
                "Index",
                "Title",
                "Artist",
                "Matched",
                "Beatport Title",
                "Beatport Artist",
                "Score",
                "Confidence",
                "Key",
                "BPM",
                "Year",
            ]
        )
        self.table.setSortingEnabled(True)
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)

        # Enable context menu for viewing candidates
        self.table.setContextMenuPolicy(Qt.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self._show_context_menu)

        # Enable double-click to view candidates
        self.table.doubleClicked.connect(self._on_row_double_clicked)

        single_table_layout.addWidget(self.table, 1)  # Give table stretch priority
        self.single_table_group.setLayout(single_table_layout)

        # Create bottom widget for single mode
        self.single_table_widget = QWidget()
        single_table_widget_layout = QVBoxLayout(self.single_table_widget)
        single_table_widget_layout.setContentsMargins(0, 0, 0, 0)
        single_table_widget_layout.addWidget(self.single_table_group)
        splitter.addWidget(self.single_table_widget)

        # Set initial splitter sizes (30% top, 70% bottom)
        splitter.setSizes([300, 700])

        # Batch mode - Tab widget for multiple playlists (hidden in single mode)
        self.batch_tabs = QTabWidget()
        self.batch_tabs.setVisible(False)

        # Create bottom widget for batch mode
        self.batch_widget = QWidget()
        batch_widget_layout = QVBoxLayout(self.batch_widget)
        batch_widget_layout.setContentsMargins(0, 0, 0, 0)
        batch_widget_layout.addWidget(self.batch_tabs)
        splitter.addWidget(self.batch_widget)

        # Add splitter to main layout
        layout.addWidget(splitter, 1)  # Give splitter stretch priority

        # Export buttons (outside splitter, at bottom)
        button_layout = QHBoxLayout()
        button_layout.addStretch()

        self.export_btn = QPushButton("Export...")
        self.export_btn.clicked.connect(self.show_export_dialog)
        self.export_btn.setToolTip("Export results to CSV, JSON, or Excel format (Ctrl+E)")
        self.export_btn.setAccessibleName("Export button")
        self.export_btn.setAccessibleDescription(
            "Click to export results. Keyboard shortcut: Ctrl+E"
        )
        self.export_btn.setFocusPolicy(Qt.StrongFocus)
        button_layout.addWidget(self.export_btn)

        # Legacy export buttons (for backward compatibility)
        self.export_all_btn = QPushButton("Export All CSV Files")
        self.export_all_btn.clicked.connect(self.export_all_csv)
        self.export_all_btn.setToolTip("Export all CSV files (main, candidates, queries, review)")
        self.export_all_btn.setAccessibleName("Export all CSV files button")
        self.export_all_btn.setAccessibleDescription("Click to export all CSV files")
        self.export_all_btn.setFocusPolicy(Qt.StrongFocus)
        button_layout.addWidget(self.export_all_btn)

        self.open_folder_btn = QPushButton("Open Output Folder")
        self.open_folder_btn.clicked.connect(self.open_output_folder)
        self.open_folder_btn.setToolTip("Open the output folder in file explorer")
        self.open_folder_btn.setAccessibleName("Open output folder button")
        self.open_folder_btn.setAccessibleDescription("Click to open the output folder")
        self.open_folder_btn.setFocusPolicy(Qt.StrongFocus)
        button_layout.addWidget(self.open_folder_btn)

        button_layout.addStretch()
        layout.addLayout(button_layout)

    def setup_shortcuts(self) -> None:
        """Set up keyboard shortcuts for the results view.

        Registers shortcuts for:
        - Focus search box (Ctrl+F)
        - Clear filters (Ctrl+Shift+F)
        - Focus filters (Ctrl+Y, Ctrl+B, Ctrl+K)
        - Select all (Ctrl+A)
        - Copy (Ctrl+C)
        - View candidates (Enter)
        """
        self.shortcut_manager.register_shortcut(
            "focus_search",
            "Ctrl+F",
            self.focus_search_box,
            ShortcutContext.RESULTS_VIEW,
            "Focus search box",
        )

        self.shortcut_manager.register_shortcut(
            "clear_filters",
            "Ctrl+Shift+F",
            self.clear_filters,
            ShortcutContext.RESULTS_VIEW,
            "Clear all filters",
        )

        self.shortcut_manager.register_shortcut(
            "focus_year_filter",
            "Ctrl+Y",
            lambda: self.year_min.setFocus(),
            ShortcutContext.RESULTS_VIEW,
            "Focus year filter",
        )

        self.shortcut_manager.register_shortcut(
            "focus_bpm_filter",
            "Ctrl+B",
            lambda: self.bpm_min.setFocus(),
            ShortcutContext.RESULTS_VIEW,
            "Focus BPM filter",
        )

        self.shortcut_manager.register_shortcut(
            "focus_key_filter",
            "Ctrl+K",
            lambda: self.key_filter.setFocus(),
            ShortcutContext.RESULTS_VIEW,
            "Focus key filter",
        )

        self.shortcut_manager.register_shortcut(
            "select_all",
            "Ctrl+A",
            self.select_all_results,
            ShortcutContext.RESULTS_VIEW,
            "Select all results",
        )

        self.shortcut_manager.register_shortcut(
            "copy",
            "Ctrl+C",
            self.copy_selected,
            ShortcutContext.RESULTS_VIEW,
            "Copy selected results",
        )

        self.shortcut_manager.register_shortcut(
            "view_candidates",
            "Enter",
            self.view_selected_candidates,
            ShortcutContext.RESULTS_VIEW,
            "View candidates for selected row",
        )

        # Set context
        self.shortcut_manager.set_context(ShortcutContext.RESULTS_VIEW)

    def focus_search_box(self) -> None:
        """Focus the search box and select all text.

        Called via keyboard shortcut (Ctrl+F) to quickly access search.
        """
        self.search_box.setFocus()
        self.search_box.selectAll()

    def select_all_results(self) -> None:
        """Select all results in the table.

        Called via keyboard shortcut (Ctrl+A) to select all rows.
        """
        if hasattr(self, "table"):
            self.table.selectAll()

    def copy_selected(self) -> None:
        """Copy selected results to clipboard.

        Called via keyboard shortcut (Ctrl+C) to copy selected table items
        as text to the clipboard.
        """
        if not hasattr(self, "table"):
            return
        selected = self.table.selectedItems()
        if selected:
            # Copy to clipboard
            from PySide6.QtWidgets import QApplication

            text = "\n".join([item.text() for item in selected])
            QApplication.clipboard().setText(text)

    def view_selected_candidates(self) -> None:
        """View candidates for the selected row.

        Called via keyboard shortcut (Enter) to open the candidate dialog
        for the currently selected row.
        """
        if not hasattr(self, "table"):
            return
        selected_rows = self.table.selectionModel().selectedRows()
        if selected_rows:
            row = selected_rows[0].row()
            self._view_candidates_for_row(row)

    def set_results(self, results: List[TrackResult], playlist_name: str = ""):
        """
        Set results to display (single playlist mode).

        Args:
            results: List of TrackResult objects
            playlist_name: Name of processed playlist (for file naming)
        """
        self.is_batch_mode = False
        self.results = results
        self.filtered_results = results.copy()
        self.playlist_name = playlist_name or "playlist"

        # Switch to single mode UI
        self.single_table_group.setVisible(True)
        self.single_table_widget.setVisible(True)
        self.batch_tabs.setVisible(False)
        self.batch_widget.setVisible(False)

        # Update summary statistics
        self._update_summary()

        # Populate table
        self._populate_table()

    def set_batch_results(self, results_dict: Dict[str, List[TrackResult]]):
        """
        Set batch results to display (multiple playlists mode).

        Args:
            results_dict: Dictionary mapping playlist_name -> List[TrackResult]
        """
        self.is_batch_mode = True
        self.batch_results = results_dict

        # Switch to batch mode UI
        self.single_table_group.setVisible(False)
        self.single_table_widget.setVisible(False)
        self.batch_tabs.setVisible(True)
        self.batch_widget.setVisible(True)

        # Clear existing tabs
        self.batch_tabs.clear()
        self.playlist_tables.clear()
        self.playlist_filters.clear()

        # Create a tab for each playlist
        for playlist_name, results in results_dict.items():
            # Create tab even if results list is empty (to show that playlist was processed)
            # But only if results is not None
            if results is not None:
                tab_widget = self._create_playlist_tab(playlist_name, results)
                self.batch_tabs.addTab(tab_widget, playlist_name)

        # Update summary statistics (aggregate for all playlists)
        self._update_batch_summary()

    def _create_playlist_tab(self, playlist_name: str, results: List[TrackResult]) -> QWidget:
        """Create a tab widget for a single playlist with its own table and filters.

        Creates a complete tab widget with filter controls and results table
        for displaying results from a single playlist in batch mode.

        Args:
            playlist_name: Name of the playlist.
            results: List of TrackResult objects for this playlist.

        Returns:
            QWidget containing the tab layout with filters and table.
        """
        tab_widget = QWidget()
        tab_layout = QVBoxLayout(tab_widget)
        tab_layout.setSpacing(10)
        tab_layout.setContentsMargins(5, 5, 5, 5)

        # Create vertical splitter for resizable sections
        tab_splitter = QSplitter(Qt.Vertical)
        tab_splitter.setChildrenCollapsible(False)

        # Top section: Filters
        top_filter_widget = QWidget()
        top_filter_layout = QVBoxLayout(top_filter_widget)
        top_filter_layout.setSpacing(10)
        top_filter_layout.setContentsMargins(0, 0, 0, 0)

        # Filter controls for this playlist
        filter_group = QGroupBox("Filters")
        filter_layout = QHBoxLayout()

        # Search box
        search_box = QLineEdit()
        search_box.setPlaceholderText("Search...")
        filter_layout.addWidget(QLabel("Search:"))
        filter_layout.addWidget(search_box)

        # Confidence filter
        confidence_filter = QComboBox()
        confidence_filter.addItems(["All", "High", "Medium", "Low"])
        filter_layout.addWidget(QLabel("Confidence:"))
        filter_layout.addWidget(confidence_filter)

        filter_layout.addStretch()
        filter_group.setLayout(filter_layout)
        top_filter_layout.addWidget(filter_group)

        # Advanced Filters Group for batch mode
        advanced_filters_group = QGroupBox("Advanced Filters")
        advanced_filters_group.setCheckable(True)
        advanced_filters_group.setChecked(False)  # Unchecked by default
        advanced_filters_layout = QVBoxLayout()

        # Container widget for filter controls (to show/hide)
        advanced_filters_container = QWidget()
        container_layout = QVBoxLayout(advanced_filters_container)
        container_layout.setContentsMargins(0, 0, 0, 0)

        # Year range filter
        year_layout = QHBoxLayout()
        year_layout.addWidget(QLabel("Year Range:"))
        year_min = QSpinBox()
        year_min.setMinimum(1900)
        year_min.setMaximum(2100)
        year_min.setValue(1900)
        year_min.setSpecialValueText("Any")
        year_min.setToolTip("Minimum year (leave at 1900 for no minimum)")
        year_min.setSuffix(" -")
        year_layout.addWidget(year_min)

        year_max = QSpinBox()
        year_max.setMinimum(1900)
        year_max.setMaximum(2100)
        year_max.setValue(2100)
        year_max.setSpecialValueText("Any")
        year_max.setToolTip("Maximum year (leave at 2100 for no maximum)")
        year_layout.addWidget(year_max)
        year_layout.addStretch()
        container_layout.addLayout(year_layout)

        # BPM range filter
        bpm_layout = QHBoxLayout()
        bpm_layout.addWidget(QLabel("BPM Range:"))
        bpm_min = QSpinBox()
        bpm_min.setMinimum(60)
        bpm_min.setMaximum(200)
        bpm_min.setValue(60)
        bpm_min.setSpecialValueText("Any")
        bpm_min.setToolTip("Minimum BPM (leave at 60 for no minimum)")
        bpm_min.setSuffix(" -")
        bpm_layout.addWidget(bpm_min)

        bpm_max = QSpinBox()
        bpm_max.setMinimum(60)
        bpm_max.setMaximum(200)
        bpm_max.setValue(200)
        bpm_max.setSpecialValueText("Any")
        bpm_max.setToolTip("Maximum BPM (leave at 200 for no maximum)")
        bpm_layout.addWidget(bpm_max)
        bpm_layout.addStretch()
        container_layout.addLayout(bpm_layout)

        # Key filter
        key_layout = QHBoxLayout()
        key_layout.addWidget(QLabel("Musical Key:"))
        key_filter = QComboBox()
        keys = (
            ["All"]
            + [f"{k} Major" for k in "C C# D D# E F F# G G# A A# B".split()]
            + [f"{k} Minor" for k in "C C# D D# E F F# G G# A A# B".split()]
        )
        key_filter.addItems(keys)
        key_filter.setToolTip("Filter by musical key (only shows matched tracks with key data)")
        key_filter.setMinimumWidth(150)
        key_layout.addWidget(key_filter)
        key_layout.addStretch()
        container_layout.addLayout(key_layout)

        # Clear filters button
        clear_button = QPushButton("Clear All Filters")
        clear_button.setToolTip("Reset all filters to default values")
        container_layout.addWidget(clear_button)

        # Hide container by default
        advanced_filters_container.setVisible(False)

        # Connect checkbox to show/hide container
        advanced_filters_group.toggled.connect(advanced_filters_container.setVisible)

        advanced_filters_layout.addWidget(advanced_filters_container)
        advanced_filters_group.setLayout(advanced_filters_layout)
        top_filter_layout.addWidget(advanced_filters_group)

        # Add top filter section to splitter
        top_filter_widget.setMaximumHeight(300)
        tab_splitter.addWidget(top_filter_widget)

        # Create table for this playlist
        table = QTableWidget()
        table.setColumnCount(11)
        table.setHorizontalHeaderLabels(
            [
                "Index",
                "Title",
                "Artist",
                "Matched",
                "Beatport Title",
                "Beatport Artist",
                "Score",
                "Confidence",
                "Key",
                "BPM",
                "Year",
            ]
        )
        table.setSortingEnabled(True)
        table.setAlternatingRowColors(True)
        table.setSelectionBehavior(QTableWidget.SelectRows)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)

        # Enable context menu and double-click
        table.setContextMenuPolicy(Qt.CustomContextMenu)
        table.customContextMenuRequested.connect(
            lambda pos: self._show_context_menu_for_table(pos, table, results)
        )
        table.doubleClicked.connect(
            lambda index: self._on_row_double_clicked_for_table(index, table, results)
        )

        # Store table and filters
        self.playlist_tables[playlist_name] = table
        self.playlist_filters[playlist_name] = {
            "search": search_box,
            "confidence": confidence_filter,
            "year_min": year_min,
            "year_max": year_max,
            "bpm_min": bpm_min,
            "bpm_max": bpm_max,
            "key": key_filter,
        }

        # Connect filter signals
        search_box.textChanged.connect(
            lambda text: self._apply_filters_for_playlist(playlist_name, results)
        )
        confidence_filter.currentTextChanged.connect(
            lambda text: self._apply_filters_for_playlist(playlist_name, results)
        )
        year_min.valueChanged.connect(
            lambda val: self._apply_filters_for_playlist(playlist_name, results)
        )
        year_max.valueChanged.connect(
            lambda val: self._apply_filters_for_playlist(playlist_name, results)
        )
        bpm_min.valueChanged.connect(
            lambda val: self._apply_filters_for_playlist(playlist_name, results)
        )
        bpm_max.valueChanged.connect(
            lambda val: self._apply_filters_for_playlist(playlist_name, results)
        )
        key_filter.currentTextChanged.connect(
            lambda text: self._apply_filters_for_playlist(playlist_name, results)
        )
        clear_button.clicked.connect(
            lambda: self._clear_filters_for_playlist(playlist_name, results)
        )

        # Bottom section: Table
        bottom_table_widget = QWidget()
        bottom_table_layout = QVBoxLayout(bottom_table_widget)
        bottom_table_layout.setContentsMargins(0, 0, 0, 0)
        bottom_table_layout.addWidget(table, 1)  # Give table stretch priority

        tab_splitter.addWidget(bottom_table_widget)

        # Set initial splitter sizes (30% top, 70% bottom)
        tab_splitter.setSizes([300, 700])

        # Add splitter to tab layout
        tab_layout.addWidget(tab_splitter, 1)  # Give splitter stretch priority

        # Populate table (even if results is empty, we still want to show the table)
        if results:
            self._populate_table_for_playlist(table, results)
        else:
            # Show empty table with message
            table.setRowCount(0)
            table.setSortingEnabled(True)

        return tab_widget

    def _update_summary(self) -> None:
        """Update summary statistics display for single playlist mode.

        Calculates and displays:
        - Total tracks, matched/unmatched counts
        - Match rate percentage
        - Average match score
        - Confidence breakdown (high/medium/low)
        """
        if not self.results:
            self.summary_label.setText("No results yet")
            return

        total = len(self.results)
        matched = sum(1 for r in self.results if r.matched)
        unmatched = total - matched
        match_rate = (matched / total * 100) if total > 0 else 0

        # Calculate average score for matched tracks
        matched_scores = [
            r.match_score for r in self.results if r.matched and r.match_score is not None
        ]
        avg_score = sum(matched_scores) / len(matched_scores) if matched_scores else 0.0

        # Count by confidence
        high_conf = sum(1 for r in self.results if r.matched and r.confidence == "high")
        medium_conf = sum(1 for r in self.results if r.matched and r.confidence == "medium")
        low_conf = sum(1 for r in self.results if r.matched and r.confidence == "low")

        summary_text = (
            f"✅ Processing Complete!\n\n"
            f"Total tracks: {total}\n"
            f"Matched: {matched} ({match_rate:.1f}%)\n"
            f"Unmatched: {unmatched}\n"
            f"Average match score: {avg_score:.1f}\n"
            f"Confidence breakdown: High: {high_conf}, Medium: {medium_conf}, Low: {low_conf}"
        )

        self.summary_label.setText(summary_text)

    def _update_batch_summary(self) -> None:
        """Update summary statistics display for batch mode.

        Aggregates statistics across all playlists and displays:
        - Number of playlists processed
        - Total tracks across all playlists
        - Matched/unmatched counts and match rate
        - Average match score
        - Confidence breakdown (high/medium/low)
        """
        if not self.batch_results:
            self.summary_label.setText("No results yet")
            return

        # Aggregate statistics across all playlists
        total = 0
        matched = 0
        matched_scores = []
        high_conf = 0
        medium_conf = 0
        low_conf = 0

        for playlist_name, results in self.batch_results.items():
            if results:
                total += len(results)
                matched += sum(1 for r in results if r.matched)
                matched_scores.extend(
                    [r.match_score for r in results if r.matched and r.match_score is not None]
                )
                high_conf += sum(1 for r in results if r.matched and r.confidence == "high")
                medium_conf += sum(1 for r in results if r.matched and r.confidence == "medium")
                low_conf += sum(1 for r in results if r.matched and r.confidence == "low")

        unmatched = total - matched
        match_rate = (matched / total * 100) if total > 0 else 0
        avg_score = sum(matched_scores) / len(matched_scores) if matched_scores else 0.0

        playlist_count = len([r for r in self.batch_results.values() if r])

        summary_text = (
            f"✅ Batch Processing Complete!\n\n"
            f"Playlists processed: {playlist_count}\n"
            f"Total tracks: {total}\n"
            f"Matched: {matched} ({match_rate:.1f}%)\n"
            f"Unmatched: {unmatched}\n"
            f"Average match score: {avg_score:.1f}\n"
            f"Confidence breakdown: High: {high_conf}, Medium: {medium_conf}, Low: {low_conf}"
        )

        self.summary_label.setText(summary_text)

    def _populate_table(self) -> None:
        """Populate the results table with filtered results.

        Applies current filters, populates the table with TrackResult data,
        and restores the previous sort state. Handles index padding for
        proper numeric sorting.
        """
        # Apply filters first
        filtered = self._filter_results()

        # Store current sort state
        sort_column = self.table.horizontalHeader().sortIndicatorSection()
        sort_order = self.table.horizontalHeader().sortIndicatorOrder()

        # Disable sorting temporarily to populate
        self.table.setSortingEnabled(False)
        self.table.setRowCount(len(filtered))

        # Calculate padding for index column (once, before loop)
        max_index = max((r.playlist_index for r in filtered), default=1) if filtered else 1
        padding = len(str(max_index))

        for row, result in enumerate(filtered):
            # Index (pad with zeros for proper string sorting: 001, 002, ..., 099, 100)
            index_str = str(result.playlist_index).zfill(padding)
            index_item = QTableWidgetItem(index_str)
            index_item.setData(
                Qt.EditRole, result.playlist_index
            )  # Store numeric value for sorting
            index_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.table.setItem(row, 0, index_item)

            # Title
            self.table.setItem(row, 1, QTableWidgetItem(result.title))

            # Artist
            self.table.setItem(row, 2, QTableWidgetItem(result.artist or ""))

            # Matched status
            matched_item = QTableWidgetItem("✓" if result.matched else "✗")
            matched_item.setTextAlignment(Qt.AlignCenter)
            if result.matched:
                matched_item.setForeground(Qt.darkGreen)
            else:
                matched_item.setForeground(Qt.darkRed)
            self.table.setItem(row, 3, matched_item)

            # Beatport Title
            beatport_title = result.beatport_title or ""
            self.table.setItem(row, 4, QTableWidgetItem(beatport_title))

            # Beatport Artist (NEW COLUMN)
            beatport_artists = result.beatport_artists or ""
            self.table.setItem(row, 5, QTableWidgetItem(beatport_artists))

            # Score
            score_text = f"{result.match_score:.1f}" if result.match_score is not None else "N/A"
            score_item = QTableWidgetItem(score_text)
            score_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.table.setItem(row, 6, score_item)

            # Confidence
            confidence_text = result.confidence or ""
            confidence_item = QTableWidgetItem(
                confidence_text.capitalize() if confidence_text else ""
            )
            self.table.setItem(row, 7, confidence_item)

            # Key (Camelot)
            key_text = result.beatport_key_camelot or result.beatport_key or ""
            self.table.setItem(row, 8, QTableWidgetItem(key_text))

            # BPM
            bpm_text = result.beatport_bpm or ""
            self.table.setItem(row, 9, QTableWidgetItem(bpm_text))

            # Year
            year_text = result.beatport_year or ""
            self.table.setItem(row, 10, QTableWidgetItem(year_text))

        # Re-enable sorting
        self.table.setSortingEnabled(True)

        # Always default to Index column (column 0) in ascending order
        # Only restore user's sort if they sorted by a different column
        if sort_column >= 0 and sort_column != 0 and sort_order is not None:
            # User sorted by a different column, restore that
            self.table.sortItems(sort_column, sort_order)
        else:
            # Default: sort by Index column (column 0) in ascending order
            # Clear any previous sort indicator first
            self.table.horizontalHeader().setSortIndicator(-1, Qt.AscendingOrder)
            self.table.sortItems(0, Qt.AscendingOrder)
            self.table.horizontalHeader().setSortIndicator(0, Qt.AscendingOrder)

        # Resize columns to content
        self.table.resizeColumnsToContents()

        # Set minimum column widths
        for col in range(self.table.columnCount()):
            current_width = self.table.columnWidth(col)
            self.table.setColumnWidth(col, max(current_width, 80))

    def _trigger_filter_debounced(self) -> None:
        """Trigger filter with debouncing for performance.

        Resets and starts a debounce timer (300ms) to avoid applying
        filters on every keystroke, improving performance for large result sets.
        """
        # Reset timer (debounce: wait 300ms after last change)
        self._filter_debounce_timer.stop()
        self._filter_debounce_timer.start(300)

    def _apply_filters_debounced(self) -> None:
        """Apply filters after debounce delay.

        Called by the debounce timer to actually apply filters after
        the user has stopped typing/changing filter values.
        """
        self.apply_filters()

    def _year_in_range(
        self, result: TrackResult, min_year: Optional[int], max_year: Optional[int]
    ) -> bool:
        """
        Check if result year is in range.

        Args:
            result: TrackResult object
            min_year: Minimum year (None for no minimum)
            max_year: Maximum year (None for no maximum)

        Returns:
            True if year is in range or no year data
        """
        if not result.matched or not result.beatport_year:
            return False  # Only filter matched tracks with year data

        try:
            year = int(result.beatport_year)
            if min_year and year < min_year:
                return False
            if max_year and year > max_year:
                return False
            return True
        except (ValueError, TypeError):
            # Invalid year data, exclude from filtered results
            return False

    def _bpm_in_range(
        self, result: TrackResult, min_bpm: Optional[int], max_bpm: Optional[int]
    ) -> bool:
        """
        Check if result BPM is in range.

        Args:
            result: TrackResult object
            min_bpm: Minimum BPM (None for no minimum)
            max_bpm: Maximum BPM (None for no maximum)

        Returns:
            True if BPM is in range or no BPM data
        """
        if not result.matched or not result.beatport_bpm:
            return False  # Only filter matched tracks with BPM data

        try:
            bpm = float(result.beatport_bpm)
            if min_bpm and bpm < min_bpm:
                return False
            if max_bpm and bpm > max_bpm:
                return False
            return True
        except (ValueError, TypeError):
            # Invalid BPM data, exclude from filtered results
            return False

    def _update_filter_status(self) -> None:
        """Update filter status label to show active filters.

        Analyzes current filter values and displays a summary of
        active filters in the filter status label.
        """
        active_filters = []

        # Check year filter
        if self.year_min.value() > 1900 or self.year_max.value() < 2100:
            min_val = self.year_min.value() if self.year_min.value() > 1900 else None
            max_val = self.year_max.value() if self.year_max.value() < 2100 else None
            if min_val and max_val:
                active_filters.append(f"Year: {min_val}-{max_val}")
            elif min_val:
                active_filters.append(f"Year: ≥{min_val}")
            elif max_val:
                active_filters.append(f"Year: ≤{max_val}")

        # Check BPM filter
        if self.bpm_min.value() > 60 or self.bpm_max.value() < 200:
            min_val = self.bpm_min.value() if self.bpm_min.value() > 60 else None
            max_val = self.bpm_max.value() if self.bpm_max.value() < 200 else None
            if min_val and max_val:
                active_filters.append(f"BPM: {min_val}-{max_val}")
            elif min_val:
                active_filters.append(f"BPM: ≥{min_val}")
            elif max_val:
                active_filters.append(f"BPM: ≤{max_val}")

        # Check key filter
        if self.key_filter.currentText() != "All":
            active_filters.append(f"Key: {self.key_filter.currentText()}")

        # Check search box
        if self.search_box.text():
            active_filters.append("Search")

        # Check confidence filter
        if self.confidence_filter.currentText() != "All":
            active_filters.append(f"Confidence: {self.confidence_filter.currentText()}")

        if active_filters:
            self.filter_status_label.setText(f"Active filters: {', '.join(active_filters)}")
        else:
            self.filter_status_label.setText("No filters active")

    def _filter_results(self) -> List[TrackResult]:
        """Apply filters to results including advanced filters"""
        filter_start_time = time.time()

        # Start with all results
        filtered = self.results.copy()
        initial_count = len(filtered)

        # Search filter
        search_text = self.search_box.text().lower().strip()
        if search_text:
            filtered = [
                r
                for r in filtered
                if search_text in r.title.lower()
                or search_text in (r.artist or "").lower()
                or search_text in (r.beatport_title or "").lower()
                or search_text in (r.beatport_artists or "").lower()
            ]

        # Confidence filter
        confidence = self.confidence_filter.currentText()
        if confidence != "All":
            filtered = [
                r
                for r in filtered
                if r.matched and (r.confidence or "").lower() == confidence.lower()
            ]

        # Year range filter
        year_min_val = self.year_min.value() if self.year_min.value() > 1900 else None
        year_max_val = self.year_max.value() if self.year_max.value() < 2100 else None

        if year_min_val or year_max_val:
            filtered = [r for r in filtered if self._year_in_range(r, year_min_val, year_max_val)]

        # BPM range filter
        bpm_min_val = self.bpm_min.value() if self.bpm_min.value() > 60 else None
        bpm_max_val = self.bpm_max.value() if self.bpm_max.value() < 200 else None

        if bpm_min_val or bpm_max_val:
            filtered = [r for r in filtered if self._bpm_in_range(r, bpm_min_val, bpm_max_val)]

        # Key filter
        key_filter_val = self.key_filter.currentText()
        if key_filter_val != "All":
            filtered = [
                r
                for r in filtered
                if r.matched and r.beatport_key and r.beatport_key == key_filter_val
            ]

        # Store filtered results
        self.filtered_results = filtered

        # Track performance
        filter_duration = time.time() - filter_start_time
        if PERFORMANCE_AVAILABLE and performance_collector:
            performance_collector.record_filter_operation(
                duration=filter_duration,
                initial_count=initial_count,
                filtered_count=len(filtered),
                filters_applied={
                    "search": bool(search_text),
                    "confidence": confidence if confidence != "All" else None,
                    "year_range": (year_min_val, year_max_val),
                    "bpm_range": (bpm_min_val, bpm_max_val),
                    "key": key_filter_val if key_filter_val != "All" else None,
                },
            )

        return filtered

    def apply_filters(self) -> None:
        """Apply filters and update the table display.

        Filters results based on current filter values, updates the table,
        updates filter status, and updates the result count label.
        """
        self._populate_table()
        self._update_filter_status()

        # Update result count
        count_text = f"{len(self.filtered_results)} of {len(self.results)} results"
        if len(self.filtered_results) < len(self.results):
            count_text += " (filtered)"
        self.result_count_label.setText(count_text)

        # Show message if no results
        if len(self.filtered_results) == 0 and len(self.results) > 0:
            self.result_count_label.setStyleSheet("font-weight: bold; color: red;")
            self.result_count_label.setText("No results match the current filters")
        else:
            self.result_count_label.setStyleSheet("font-weight: bold;")

    def _populate_table_for_playlist(self, table: QTableWidget, results: List[TrackResult]) -> None:
        """Populate a specific table with results for a playlist in batch mode.

        Applies filters for the playlist, populates the table with TrackResult
        data, and restores sort state. Handles empty results gracefully.

        Args:
            table: QTableWidget to populate.
            results: List of TrackResult objects for this playlist.
        """
        if not results:
            # Empty results - show empty table
            table.setSortingEnabled(False)
            table.setRowCount(0)
            table.setSortingEnabled(True)
            return

        # Apply filters first
        filtered = self._filter_results_for_playlist(results, table)

        # Store current sort state
        sort_column = table.horizontalHeader().sortIndicatorSection()
        sort_order = table.horizontalHeader().sortIndicatorOrder()

        # Disable sorting temporarily to populate
        table.setSortingEnabled(False)
        table.setRowCount(len(filtered))

        # Calculate padding for index column (once, before loop)
        max_index = max((r.playlist_index for r in filtered), default=1) if filtered else 1
        padding = len(str(max_index))

        for row, result in enumerate(filtered):
            # Index (pad with zeros for proper string sorting: 001, 002, ..., 099, 100)
            index_str = str(result.playlist_index).zfill(padding)
            index_item = QTableWidgetItem(index_str)
            index_item.setData(
                Qt.EditRole, result.playlist_index
            )  # Store numeric value for sorting
            index_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            table.setItem(row, 0, index_item)

            # Title
            table.setItem(row, 1, QTableWidgetItem(result.title))

            # Artist
            table.setItem(row, 2, QTableWidgetItem(result.artist or ""))

            # Matched status
            matched_item = QTableWidgetItem("✓" if result.matched else "✗")
            matched_item.setTextAlignment(Qt.AlignCenter)
            if result.matched:
                matched_item.setForeground(Qt.darkGreen)
            else:
                matched_item.setForeground(Qt.darkRed)
            table.setItem(row, 3, matched_item)

            # Beatport Title
            beatport_title = result.beatport_title or ""
            table.setItem(row, 4, QTableWidgetItem(beatport_title))

            # Beatport Artist
            beatport_artists = result.beatport_artists or ""
            table.setItem(row, 5, QTableWidgetItem(beatport_artists))

            # Score
            score_text = f"{result.match_score:.1f}" if result.match_score is not None else "N/A"
            score_item = QTableWidgetItem(score_text)
            score_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            table.setItem(row, 6, score_item)

            # Confidence
            confidence_text = result.confidence or ""
            confidence_item = QTableWidgetItem(
                confidence_text.capitalize() if confidence_text else ""
            )
            table.setItem(row, 7, confidence_item)

            # Key (Camelot)
            key_text = result.beatport_key_camelot or result.beatport_key or ""
            table.setItem(row, 8, QTableWidgetItem(key_text))

            # BPM
            bpm_text = str(result.beatport_bpm) if result.beatport_bpm else ""
            table.setItem(row, 9, QTableWidgetItem(bpm_text))

            # Year
            year_text = result.beatport_year or ""
            table.setItem(row, 10, QTableWidgetItem(year_text))

        # Re-enable sorting
        table.setSortingEnabled(True)

        # Always default to Index column (column 0) in ascending order
        # Only restore user's sort if they sorted by a different column
        if sort_column >= 0 and sort_column != 0 and sort_order is not None:
            # User sorted by a different column, restore that
            table.sortItems(sort_column, sort_order)
        else:
            # Default: sort by Index column (column 0) in ascending order
            # Clear any previous sort indicator first
            table.horizontalHeader().setSortIndicator(-1, Qt.AscendingOrder)
            table.sortItems(0, Qt.AscendingOrder)
            table.horizontalHeader().setSortIndicator(0, Qt.AscendingOrder)

    def _filter_results_for_playlist(
        self, results: List[TrackResult], table: QTableWidget
    ) -> List[TrackResult]:
        """Apply filters to results for a specific playlist table including advanced filters"""
        # Find which playlist this table belongs to
        playlist_name = None
        for name, t in self.playlist_tables.items():
            if t == table:
                playlist_name = name
                break

        # If we can't find the playlist or filters, return all results (no filtering)
        if playlist_name is None or playlist_name not in self.playlist_filters:
            return results

        filters = self.playlist_filters[playlist_name]
        filtered = list(results)  # Make a copy to avoid modifying original

        # Search filter
        search_text = filters["search"].text().lower().strip()
        if search_text:
            filtered = [
                r
                for r in filtered
                if search_text in r.title.lower()
                or search_text in (r.artist or "").lower()
                or search_text in (r.beatport_title or "").lower()
                or search_text in (r.beatport_artists or "").lower()
            ]

        # Confidence filter
        confidence = filters["confidence"].currentText()
        if confidence != "All":
            filtered = [
                r
                for r in filtered
                if r.matched and (r.confidence or "").lower() == confidence.lower()
            ]

        # Year range filter
        year_min_val = filters["year_min"].value() if filters["year_min"].value() > 1900 else None
        year_max_val = filters["year_max"].value() if filters["year_max"].value() < 2100 else None

        if year_min_val or year_max_val:
            filtered = [r for r in filtered if self._year_in_range(r, year_min_val, year_max_val)]

        # BPM range filter
        bpm_min_val = filters["bpm_min"].value() if filters["bpm_min"].value() > 60 else None
        bpm_max_val = filters["bpm_max"].value() if filters["bpm_max"].value() < 200 else None

        if bpm_min_val or bpm_max_val:
            filtered = [r for r in filtered if self._bpm_in_range(r, bpm_min_val, bpm_max_val)]

        # Key filter
        key_filter_val = filters["key"].currentText()
        if key_filter_val != "All":
            filtered = [
                r
                for r in filtered
                if r.matched and r.beatport_key and r.beatport_key == key_filter_val
            ]

        return filtered

    def _clear_filters_for_playlist(self, playlist_name: str, results: List[TrackResult]) -> None:
        """Clear all filters for a specific playlist in batch mode.

        Resets all filter widgets to default values and reapplies filters
        to update the table display.

        Args:
            playlist_name: Name of the playlist.
            results: List of TrackResult objects for this playlist.
        """
        if playlist_name not in self.playlist_filters:
            return

        filters = self.playlist_filters[playlist_name]
        filters["year_min"].setValue(1900)
        filters["year_max"].setValue(2100)
        filters["bpm_min"].setValue(60)
        filters["bpm_max"].setValue(200)
        filters["key"].setCurrentText("All")
        filters["search"].clear()
        filters["confidence"].setCurrentText("All")
        self._apply_filters_for_playlist(playlist_name, results)

    def _apply_filters_for_playlist(self, playlist_name: str, results: List[TrackResult]) -> None:
        """Apply filters and update table for a specific playlist in batch mode.

        Applies current filter values and repopulates the table for the
        specified playlist.

        Args:
            playlist_name: Name of the playlist.
            results: List of TrackResult objects for this playlist.
        """
        if playlist_name in self.playlist_tables:
            table = self.playlist_tables[playlist_name]
            self._populate_table_for_playlist(table, results)

    def _show_context_menu_for_table(
        self, position: Any, table: QTableWidget, results: List[TrackResult]
    ) -> None:
        """Show context menu for a specific table row in batch mode.

        Creates and displays a context menu with options to view candidates
        for the row at the specified position.

        Args:
            position: Position where context menu was requested.
            table: QTableWidget containing the row.
            results: List of TrackResult objects for this playlist.
        """
        item = table.itemAt(position)
        if item is None:
            return

        row = item.row()

        # Get the result (need to account for filtering)
        filtered = self._filter_results_for_playlist(results, table)
        if row < 0 or row >= len(filtered):
            return

        result = filtered[row]

        # Create context menu
        menu = QMenu(self)

        # View candidates action (only if candidates exist)
        if result.candidates:
            view_candidates_action = menu.addAction("View Candidates...")
            view_candidates_action.triggered.connect(
                lambda: self._view_candidates_for_table_row(row, table, results)
            )
        else:
            view_candidates_action = menu.addAction("No candidates available")
            view_candidates_action.setEnabled(False)

        menu.exec(table.viewport().mapToGlobal(position))

    def _on_row_double_clicked_for_table(
        self, index: Any, table: QTableWidget, results: List[TrackResult]
    ) -> None:
        """Handle double-click on a specific table row in batch mode.

        Opens the candidate dialog for the double-clicked row.

        Args:
            index: QModelIndex of the double-clicked row.
            table: QTableWidget containing the row.
            results: List of TrackResult objects for this playlist.
        """
        row = index.row()
        self._view_candidates_for_table_row(row, table, results)

    def _view_candidates_for_table_row(
        self, row: int, table: QTableWidget, results: List[TrackResult]
    ) -> None:
        """View candidates for a specific row in a playlist table.

        Opens the candidate dialog to view and select alternative matches
        for the track at the specified row.

        Args:
            row: Row index in the table.
            table: QTableWidget containing the row.
            results: List of TrackResult objects for this playlist.
        """
        # Get filtered results
        filtered = self._filter_results_for_playlist(results, table)
        if row < 0 or row >= len(filtered):
            return

        result = filtered[row]

        # Check if there are candidates
        if not result.candidates:
            QMessageBox.information(
                self, "No Candidates", "No candidates available for this track."
            )
            return

        # Get current match info
        current_match = None
        if result.matched:
            current_match = {
                "candidate_title": result.beatport_title,
                "candidate_artists": result.beatport_artists,
                "beatport_url": result.beatport_url,
                "match_score": result.match_score,
                "title_sim": result.title_sim,
                "artist_sim": result.artist_sim,
                "beatport_key": result.beatport_key,
                "beatport_key_camelot": result.beatport_key_camelot,
                "beatport_bpm": result.beatport_bpm,
                "beatport_year": result.beatport_year,
            }

        # Show candidate dialog
        dialog = CandidateDialog(
            track_title=result.title,
            track_artist=result.artist or "",
            candidates=result.candidates,
            current_match=current_match,
            parent=self,
        )

        # Connect candidate selection
        dialog.candidate_selected.connect(
            lambda candidate: self._on_candidate_selected_for_playlist(
                result.playlist_index, candidate, results
            )
        )

        dialog.exec()

    def _on_candidate_selected_for_playlist(
        self, playlist_index: int, candidate: Dict[str, Any], results: List[TrackResult]
    ) -> None:
        """Handle candidate selection for a playlist table in batch mode.

        Updates the TrackResult with the selected candidate's data and
        refreshes the table display.

        Args:
            playlist_index: Index of the track in the playlist.
            candidate: Dictionary containing candidate data.
            results: List of TrackResult objects for this playlist.
        """
        # Find the result by playlist_index
        result = None
        for r in results:
            if r.playlist_index == playlist_index:
                result = r
                break

        if result is None:
            return

        # Update result with selected candidate
        result.beatport_title = candidate.get(
            "candidate_title", candidate.get("beatport_title", "")
        )
        result.beatport_artists = candidate.get(
            "candidate_artists", candidate.get("beatport_artists", "")
        )
        result.beatport_url = candidate.get("candidate_url", candidate.get("beatport_url", ""))

        # Update scores
        try:
            result.match_score = float(
                candidate.get("final_score", candidate.get("match_score", 0))
            )
        except (ValueError, TypeError):
            result.match_score = None

        try:
            result.title_sim = float(candidate.get("title_sim", 0))
        except (ValueError, TypeError):
            result.title_sim = None

        try:
            result.artist_sim = float(candidate.get("artist_sim", 0))
        except (ValueError, TypeError):
            result.artist_sim = None

        # Update other fields
        result.beatport_key = candidate.get("beatport_key", "")
        result.beatport_key_camelot = candidate.get("beatport_key_camelot", "")
        result.beatport_bpm = candidate.get("beatport_bpm", "")
        result.beatport_year = candidate.get("beatport_year", "")

        # Mark as matched
        result.matched = True
        result.confidence = candidate.get("confidence", "medium")

        # Find which playlist this belongs to and refresh its table
        for playlist_name, playlist_results in self.batch_results.items():
            if result in playlist_results:
                if playlist_name in self.playlist_tables:
                    table = self.playlist_tables[playlist_name]
                    self._populate_table_for_playlist(table, playlist_results)
                break

    def show_export_dialog(self) -> None:
        """Show export dialog and handle export operation.

        Opens the export dialog, gets export options, and exports results
        in the selected format (CSV, JSON, or Excel) with user-specified
        options (filtered vs all, metadata, candidates, etc.).
        """
        if not self.results:
            QMessageBox.warning(self, "No Results", "No results to export")
            return

        # Get results to export (filtered or all)
        dialog = ExportDialog(self)
        if dialog.exec() != QDialog.Accepted:
            return

        options = dialog.get_export_options()
        file_path = options.get("file_path")

        if not file_path:
            QMessageBox.warning(self, "No File Selected", "Please select a file location")
            return

        # Get results to export
        results_to_export = (
            self._filter_results() if options.get("export_filtered", False) else self.results
        )

        if not results_to_export:
            QMessageBox.warning(
                self, "No Results", "No results to export (filter may have excluded all results)"
            )
            return

        try:
            format_type = options.get("format", "csv")

            # Get settings for processing info if needed
            settings = None
            if options.get("include_processing_info", False):
                try:
                    from config import SETTINGS

                    settings = SETTINGS.copy() if SETTINGS else {}
                except ImportError:
                    settings = {}

            if format_type == "json":
                # Export to JSON with enhanced options
                write_json_file(
                    results_to_export,
                    file_path,
                    playlist_name=self.playlist_name,
                    include_candidates=options.get("include_candidates", False),
                    include_queries=options.get("include_queries", False),
                    include_metadata=options.get("include_metadata", True),
                    include_processing_info=options.get("include_processing_info", False),
                    compress=options.get("compress", False),
                    settings=settings,
                )
                QMessageBox.information(
                    self, "Export Complete", f"JSON file exported to:\n{file_path}"
                )

            elif format_type == "excel":
                # Export to Excel (with metadata option)
                write_excel_file(results_to_export, file_path, playlist_name=self.playlist_name)
                QMessageBox.information(
                    self, "Export Complete", f"Excel file exported to:\n{file_path}"
                )

            else:  # CSV
                # Export to CSV with enhanced options
                output_dir = os.path.dirname(file_path) or "output"
                base_filename = os.path.basename(file_path)
                # Remove extension if present
                for ext in [".csv", ".tsv", ".psv"]:
                    if base_filename.endswith(ext):
                        base_filename = base_filename[: -len(ext)]
                        break

                output_files = write_csv_files(
                    results_to_export,
                    base_filename,
                    output_dir,
                    delimiter=options.get("delimiter", ","),
                    include_metadata=options.get("include_metadata", True),
                )
                self.output_files = output_files

                if output_files.get("main"):
                    QMessageBox.information(
                        self, "Export Complete", f"CSV file exported to:\n{output_files['main']}"
                    )
                else:
                    QMessageBox.warning(self, "Export Failed", "Failed to export CSV file")

        except ImportError as e:
            QMessageBox.critical(
                self,
                "Export Error",
                f"Missing dependency:\n{str(e)}\n\nPlease install required package.",
            )
        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Error exporting file:\n{str(e)}")

    def export_all_csv(self) -> None:
        """Export all CSV files (main, candidates, queries, review).

        Prompts for output directory and exports all CSV file types:
        - Main results file
        - Candidates file
        - Queries file
        - Review file

        Shows a summary message with all exported file names.
        """
        if not self.results:
            QMessageBox.warning(self, "No Results", "No results to export")
            return

        # Get output directory
        output_dir = QFileDialog.getExistingDirectory(self, "Select Output Directory", "output")

        if not output_dir:
            return

        try:
            # Generate filename from playlist name
            base_filename = f"{self.playlist_name.replace(' ', '_')}.csv"
            timestamped_filename = with_timestamp(base_filename)

            # Write all CSV files
            output_files = write_csv_files(self.results, timestamped_filename, output_dir)

            self.output_files = output_files

            # Build message with all exported files
            files_list = []
            if output_files.get("main"):
                files_list.append(f"Main: {os.path.basename(output_files['main'])}")
            if output_files.get("candidates"):
                files_list.append(f"Candidates: {os.path.basename(output_files['candidates'])}")
            if output_files.get("queries"):
                files_list.append(f"Queries: {os.path.basename(output_files['queries'])}")
            if output_files.get("review"):
                files_list.append(f"Review: {os.path.basename(output_files['review'])}")

            if files_list:
                message = f"Exported {len(files_list)} file(s) to:\n{output_dir}\n\n" + "\n".join(
                    files_list
                )
                QMessageBox.information(self, "Export Complete", message)
            else:
                QMessageBox.warning(self, "Export Failed", "No files were exported")

        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Error exporting CSV files:\n{str(e)}")

    def open_output_folder(self) -> None:
        """Open output folder in file explorer.

        Opens the output directory (from last export or default "output")
        in the system's file explorer. Creates the directory if it doesn't exist.
        """
        # Use last export directory or default
        output_dir = "output"
        if self.output_files:
            # Get directory from any output file
            first_file = next(iter(self.output_files.values()), None)
            if first_file:
                output_dir = os.path.dirname(first_file)

        # Create directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)

        # Open in file explorer
        try:
            if platform.system() == "Windows":
                subprocess.Popen(f'explorer "{output_dir}"')
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", output_dir])
            else:
                subprocess.Popen(["xdg-open", output_dir])
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Could not open folder:\n{str(e)}")

    def _show_context_menu(self, position: Any) -> None:
        """Show context menu for table row in single playlist mode.

        Creates and displays a context menu with options to view candidates
        for the row at the specified position.

        Args:
            position: Position where context menu was requested.
        """
        item = self.table.itemAt(position)
        if item is None:
            return

        row = item.row()

        # Get the result (need to account for filtering)
        filtered = self._filter_results()
        if row < 0 or row >= len(filtered):
            return

        result = filtered[row]

        # Create context menu
        menu = QMenu(self)

        # View candidates action (only if candidates exist)
        if result.candidates:
            view_candidates_action = menu.addAction("View Candidates...")
            view_candidates_action.triggered.connect(lambda: self._view_candidates_for_row(row))
        else:
            view_candidates_action = menu.addAction("No candidates available")
            view_candidates_action.setEnabled(False)

        menu.exec(self.table.viewport().mapToGlobal(position))

    def _on_row_double_clicked(self, index: Any) -> None:
        """Handle double-click on table row in single playlist mode.

        Opens the candidate dialog for the double-clicked row.

        Args:
            index: QModelIndex of the double-clicked row.
        """
        row = index.row()
        self._view_candidates_for_row(row)

    def _view_candidates_for_row(self, row: int) -> None:
        """View candidates for a specific row in single playlist mode.

        Opens the candidate dialog to view and select alternative matches
        for the track at the specified row.

        Args:
            row: Row index in the table.
        """
        # Get filtered results
        filtered = self._filter_results()
        if row < 0 or row >= len(filtered):
            return

        result = filtered[row]

        # Check if there are candidates
        if not result.candidates:
            QMessageBox.information(
                self,
                "No Candidates",
                f"No alternative candidates found for:\n{result.title} - {result.artist}",
            )
            return

        # Build current match dict if matched
        current_match = None
        if result.matched:
            current_match = {
                "beatport_title": result.beatport_title,
                "beatport_artists": result.beatport_artists,
                "beatport_url": result.beatport_url,
                "match_score": result.match_score,
                "title_sim": result.title_sim,
                "artist_sim": result.artist_sim,
                "beatport_key": result.beatport_key,
                "beatport_key_camelot": result.beatport_key_camelot,
                "beatport_bpm": result.beatport_bpm,
                "beatport_year": result.beatport_year,
            }

        # Show candidate dialog
        dialog = CandidateDialog(
            track_title=result.title,
            track_artist=result.artist or "",
            candidates=result.candidates,
            current_match=current_match,
            parent=self,
        )

        # Connect candidate selection
        dialog.candidate_selected.connect(
            lambda candidate: self._on_candidate_selected(result.playlist_index, candidate)
        )

        dialog.exec()

    def _on_candidate_selected(self, playlist_index: int, candidate: Dict[str, Any]) -> None:
        """Handle candidate selection in single playlist mode.

        Updates the TrackResult with the selected candidate's data,
        refreshes the table display, updates summary, and emits the
        result_updated signal.

        Args:
            playlist_index: Index of the track in the playlist.
            candidate: Dictionary containing candidate data.
        """
        # Find the result by playlist_index
        result = None
        for r in self.results:
            if r.playlist_index == playlist_index:
                result = r
                break

        if result is None:
            return

        # Update result with selected candidate
        result.beatport_title = candidate.get(
            "candidate_title", candidate.get("beatport_title", "")
        )
        result.beatport_artists = candidate.get(
            "candidate_artists", candidate.get("beatport_artists", "")
        )
        result.beatport_url = candidate.get("candidate_url", candidate.get("beatport_url", ""))

        # Update scores
        try:
            result.match_score = float(
                candidate.get("final_score", candidate.get("match_score", 0))
            )
        except (ValueError, TypeError):
            result.match_score = None

        try:
            result.title_sim = float(candidate.get("title_sim", 0))
        except (ValueError, TypeError):
            result.title_sim = None

        try:
            result.artist_sim = float(candidate.get("artist_sim", 0))
        except (ValueError, TypeError):
            result.artist_sim = None

        # Update metadata
        result.beatport_key = candidate.get("candidate_key", candidate.get("beatport_key", ""))
        result.beatport_key_camelot = candidate.get("candidate_key_camelot", "")
        result.beatport_bpm = candidate.get("candidate_bpm", candidate.get("beatport_bpm", ""))
        result.beatport_year = candidate.get("candidate_year", candidate.get("beatport_year", ""))
        result.beatport_label = candidate.get(
            "candidate_label", candidate.get("beatport_label", "")
        )
        result.beatport_genres = candidate.get(
            "candidate_genres", candidate.get("beatport_genres", "")
        )
        result.beatport_release = candidate.get(
            "candidate_release", candidate.get("beatport_release", "")
        )
        result.beatport_release_date = candidate.get(
            "candidate_release_date", candidate.get("beatport_release_date", "")
        )

        # Update confidence based on score
        if result.match_score:
            if result.match_score >= 90:
                result.confidence = "high"
            elif result.match_score >= 75:
                result.confidence = "medium"
            else:
                result.confidence = "low"

        # Ensure matched is True
        result.matched = True

        # Emit signal
        self.result_updated.emit(playlist_index, result)

        # Refresh table display
        self._populate_table()

        # Update summary
        self._update_summary()

        QMessageBox.information(
            self, "Candidate Selected", f"Updated match for:\n{result.title} - {result.artist}"
        )

    def clear_filters(self) -> None:
        """Clear all filters to default values.

        Resets all filter widgets (search, confidence, year, BPM, key)
        to their default values and reapplies filters.
        """
        self.year_min.setValue(1900)
        self.year_max.setValue(2100)
        self.bpm_min.setValue(60)
        self.bpm_max.setValue(200)
        self.key_filter.setCurrentText("All")
        self.search_box.clear()
        self.confidence_filter.setCurrentText("All")
        self.apply_filters()

    def clear(self) -> None:
        """Clear results display.

        Clears all results, filtered results, output files, table data,
        summary label, and resets all filter widgets to default values.
        """
        self.results = []
        self.filtered_results = []
        self.output_files = {}
        self.table.setRowCount(0)
        self.summary_label.setText("No results yet")
        self.search_box.clear()
        self.confidence_filter.setCurrentIndex(0)  # Reset to "All"
        self.result_count_label.setText("0 results")
        self.filter_status_label.setText("")
