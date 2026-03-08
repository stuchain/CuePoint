#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Batch Processor Widget Module

This module contains the BatchProcessorWidget class for processing multiple playlists.
Supports hierarchical tree (folders + playlists) with tri-state folder checkboxes,
search filter, and Select All / Deselect All / Expand All / Collapse All.
"""

import time
from typing import Any, Dict, List, Optional

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from cuepoint.data.rekordbox import playlist_path_for_display
from cuepoint.models.result import TrackResult
from cuepoint.ui.gui_interface import ProcessingError, ProgressInfo

# Role for storing playlist path on leaf items (same as playlist_selector)
_PATH_ROLE = Qt.ItemDataRole.UserRole


class BatchProcessorWidget(QWidget):
    """Widget for batch processing multiple playlists"""

    # Signals
    batch_started = Signal(list)  # List of playlist names
    batch_completed = Signal(dict)  # Dict[playlist_name, List[TrackResult]]
    batch_cancelled = Signal()
    playlist_completed = Signal(str, list)  # playlist_name, results

    def __init__(self, parent=None):
        super().__init__(parent)
        self.playlists: List[str] = []
        self._tree_roots: List[Dict[str, Any]] = []
        self._playlists_by_path: Dict[str, Any] = {}
        self._ignore_item_changed: bool = False  # Block recursive itemChanged
        self._filter_text: str = ""
        self.results: Dict[
            str, List[TrackResult]
        ] = {}  # playlist_name -> List[TrackResult]
        self.current_playlist_index: int = -1
        self.selected_playlists: List[str] = []
        self.is_processing: bool = False
        self.batch_start_time: Optional[float] = None
        self.current_playlist_start_time: Optional[float] = None
        self.total_elapsed_time: float = 0.0
        self.timer = QTimer()
        self.timer.timeout.connect(self._update_time_display)
        self.init_ui()

    def init_ui(self):
        """Initialize batch processing UI"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 10, 10, 10)

        # Playlist selection: search + tree + buttons
        playlist_group = QGroupBox("Select Playlists")
        playlist_layout = QVBoxLayout()

        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText("Search playlists...")
        self.search_edit.setClearButtonEnabled(True)
        self.search_edit.setStyleSheet(
            "QLineEdit { color: #e0e0e0; font-size: 11px; }"
            " QLineEdit::placeholder { color: #888; }"
        )
        self.search_edit.textChanged.connect(self._on_search_changed)
        playlist_layout.addWidget(self.search_edit)

        self.playlist_tree = QTreeWidget()
        self.playlist_tree.setHeaderHidden(True)
        self.playlist_tree.setStyleSheet("font-size: 11px; color: #e0e0e0;")
        self.playlist_tree.setIndentation(16)
        self.playlist_tree.itemChanged.connect(self._on_tree_item_changed)
        playlist_layout.addWidget(self.playlist_tree)

        # Select all / Deselect all / Expand all / Collapse all
        btn_layout = QHBoxLayout()
        self.select_all_btn = QPushButton("Select All")
        self.select_all_btn.clicked.connect(self.select_all_playlists)
        btn_layout.addWidget(self.select_all_btn)

        self.deselect_all_btn = QPushButton("Deselect All")
        self.deselect_all_btn.clicked.connect(self.deselect_all_playlists)
        btn_layout.addWidget(self.deselect_all_btn)

        self.expand_all_btn = QPushButton("Expand All")
        self.expand_all_btn.clicked.connect(self.expand_all_playlists)
        btn_layout.addWidget(self.expand_all_btn)

        self.collapse_all_btn = QPushButton("Collapse All")
        self.collapse_all_btn.clicked.connect(self.collapse_all_playlists)
        btn_layout.addWidget(self.collapse_all_btn)

        btn_layout.addStretch()
        playlist_layout.addLayout(btn_layout)

        playlist_group.setLayout(playlist_layout)
        layout.addWidget(playlist_group)

        # Processing controls
        control_layout = QHBoxLayout()
        control_layout.addStretch()

        self.start_batch_btn = QPushButton("Start Batch Processing")
        self.start_batch_btn.clicked.connect(self._on_start_batch)
        control_layout.addWidget(self.start_batch_btn)

        self.cancel_batch_btn = QPushButton("Cancel")
        self.cancel_batch_btn.clicked.connect(self._on_cancel_batch)
        self.cancel_batch_btn.setEnabled(False)
        control_layout.addWidget(self.cancel_batch_btn)

        control_layout.addStretch()
        layout.addLayout(control_layout)

        # Progress display
        self.progress_group = QGroupBox("Batch Progress")
        progress_layout = QVBoxLayout()

        # Overall progress
        overall_label = QLabel("Overall Progress:")
        progress_layout.addWidget(overall_label)

        self.overall_progress = QProgressBar()
        self.overall_progress.setFormat("%p% (%v/%m)")
        self.overall_progress.setMinimum(0)
        self.overall_progress.setMaximum(100)
        self.overall_progress.setValue(0)
        progress_layout.addWidget(self.overall_progress)

        # Current playlist label
        self.current_playlist_label = QLabel("Ready")
        self.current_playlist_label.setWordWrap(True)
        progress_layout.addWidget(self.current_playlist_label)

        # Current playlist progress
        current_label = QLabel("Current Playlist Progress:")
        progress_layout.addWidget(current_label)

        self.current_progress = QProgressBar()
        self.current_progress.setFormat("%p% (%v/%m)")
        self.current_progress.setMinimum(0)
        self.current_progress.setMaximum(100)
        self.current_progress.setValue(0)
        progress_layout.addWidget(self.current_progress)

        # Per-playlist progress list (scrollable)
        per_playlist_label = QLabel("Per-Playlist Progress:")
        progress_layout.addWidget(per_playlist_label)

        from PySide6.QtWidgets import QScrollArea

        self.playlist_progress_scroll = QScrollArea()
        self.playlist_progress_scroll.setWidgetResizable(True)
        self.playlist_progress_scroll.setMaximumHeight(200)
        self.playlist_progress_widget = QWidget()
        self.playlist_progress_layout = QVBoxLayout(self.playlist_progress_widget)
        self.playlist_progress_layout.setContentsMargins(0, 0, 0, 0)
        self.playlist_progress_scroll.setWidget(self.playlist_progress_widget)
        progress_layout.addWidget(self.playlist_progress_scroll)

        # Store per-playlist progress widgets
        self.playlist_progress_widgets: Dict[str, Dict] = {}

        # Time information
        time_layout = QHBoxLayout()
        self.elapsed_label = QLabel("Elapsed: 0s")
        self.remaining_label = QLabel("Remaining: --")
        time_layout.addWidget(self.elapsed_label)
        time_layout.addWidget(self.remaining_label)
        time_layout.addStretch()
        progress_layout.addLayout(time_layout)

        self.progress_group.setLayout(progress_layout)
        layout.addWidget(self.progress_group)

        layout.addStretch()

    def set_playlists(self, playlists: List[str]):
        """Set available playlists (flat list). Empty list clears the tree."""
        self.playlists = playlists
        self._tree_roots = []
        self._playlists_by_path = {}
        self.playlist_tree.clear()
        self.search_edit.clear()

    def set_playlist_tree(
        self,
        tree_roots: List[Dict[str, Any]],
        playlists_by_path: Dict[str, Any],
    ) -> None:
        """Build hierarchical tree from folder/playlist structure (same as single mode)."""
        self._tree_roots = tree_roots
        self._playlists_by_path = playlists_by_path
        self.playlists = list(playlists_by_path.keys()) if playlists_by_path else []
        self._filter_text = ""
        self._ignore_item_changed = True
        try:
            self.playlist_tree.clear()
            self.search_edit.clear()
            self._add_nodes(tree_roots, None)
            self._refresh_folder_states()
        finally:
            self._ignore_item_changed = False

    def _add_nodes(
        self,
        nodes: List[Dict[str, Any]],
        parent: Optional[QTreeWidgetItem],
    ) -> None:
        for node in nodes:
            name = node.get("name", "Unnamed")
            path = node.get("path", name)
            node_type = node.get("type", "playlist")
            if node_type == "playlist":
                display = playlist_path_for_display(path) or name
                label = f"{display} ({node.get('track_count', 0)})"
                item = QTreeWidgetItem([label])
                item.setData(0, _PATH_ROLE, path)
                item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
                item.setCheckState(0, Qt.CheckState.Unchecked)
                if parent:
                    parent.addChild(item)
                else:
                    self.playlist_tree.addTopLevelItem(item)
            else:
                if name.upper() == "ROOT":
                    self._add_nodes(node.get("children", []), parent)
                    continue
                folder_item = QTreeWidgetItem([name])
                folder_item.setData(0, _PATH_ROLE, None)  # No path = folder
                folder_item.setFlags(folder_item.flags() | Qt.ItemIsUserCheckable)
                folder_item.setCheckState(0, Qt.CheckState.Unchecked)
                if parent:
                    parent.addChild(folder_item)
                else:
                    self.playlist_tree.addTopLevelItem(folder_item)
                self._add_nodes(node.get("children", []), folder_item)

    def _refresh_folder_states(self) -> None:
        """Recompute folder tri-state from leaf check states."""
        def count_leaves(item: QTreeWidgetItem) -> tuple:
            """Return (checked_count, total_leaf_count) for this subtree."""
            path = item.data(0, _PATH_ROLE)
            if path is not None:
                return (1 if item.checkState(0) == Qt.CheckState.Checked else 0, 1)
            checked, total = 0, 0
            for i in range(item.childCount()):
                c = item.child(i)
                ch, tot = count_leaves(c)
                checked += ch
                total += tot
            if total > 0:
                if checked == 0:
                    item.setCheckState(0, Qt.CheckState.Unchecked)
                elif checked == total:
                    item.setCheckState(0, Qt.CheckState.Checked)
                else:
                    item.setCheckState(0, Qt.CheckState.PartiallyChecked)
            return (checked, total)
        for i in range(self.playlist_tree.topLevelItemCount()):
            count_leaves(self.playlist_tree.topLevelItem(i))

    def _on_tree_item_changed(self, item: QTreeWidgetItem, column: int) -> None:
        if self._ignore_item_changed or column != 0:
            return
        path = item.data(0, _PATH_ROLE)
        state = item.checkState(0)
        self._ignore_item_changed = True
        try:
            if path is not None:
                # Leaf: update parent folder states
                self._refresh_folder_states()
            else:
                # Folder: set all descendant playlist leaves to this state
                def set_leaves_only(parent_item: QTreeWidgetItem, checked: bool) -> None:
                    for i in range(parent_item.childCount()):
                        c = parent_item.child(i)
                        if c.data(0, _PATH_ROLE) is not None:
                            c.setCheckState(0, Qt.CheckState.Checked if checked else Qt.CheckState.Unchecked)
                        else:
                            set_leaves_only(c, checked)
                set_leaves_only(item, state == Qt.CheckState.Checked)
                self._refresh_folder_states()
        finally:
            self._ignore_item_changed = False

    def _on_search_changed(self, text: str) -> None:
        self._filter_text = (text or "").strip().lower()
        self._apply_filter()

    def _apply_filter(self) -> None:
        if not getattr(self, "_filter_text", None):
            self._set_all_visible_collapsed()
            return
        self._filter_visible()

    def _set_all_visible_collapsed(self) -> None:
        def _walk(item: QTreeWidgetItem) -> None:
            item.setHidden(False)
            for i in range(item.childCount()):
                _walk(item.child(i))
            if item.childCount() > 0:
                item.setExpanded(False)
        for i in range(self.playlist_tree.topLevelItemCount()):
            _walk(self.playlist_tree.topLevelItem(i))

    def _filter_visible(self) -> None:
        ft = getattr(self, "_filter_text", "") or ""

        def _filter(item: QTreeWidgetItem) -> bool:
            path = item.data(0, _PATH_ROLE)
            name = item.text(0)
            is_leaf = path is not None
            match = ft in (path or "").lower() or ft in name.lower()
            if is_leaf:
                item.setHidden(not match)
                return match
            any_child = False
            for i in range(item.childCount()):
                if _filter(item.child(i)):
                    any_child = True
            item.setHidden(not any_child)
            if any_child:
                item.setExpanded(True)
            return any_child

        for i in range(self.playlist_tree.topLevelItemCount()):
            _filter(self.playlist_tree.topLevelItem(i))

    def get_selected_playlists(self) -> List[str]:
        """Get list of selected playlist paths (leaves only)."""
        selected: List[str] = []

        def walk(item: QTreeWidgetItem) -> None:
            path = item.data(0, _PATH_ROLE)
            if path is not None and item.checkState(0) == Qt.CheckState.Checked:
                selected.append(path)
            for i in range(item.childCount()):
                walk(item.child(i))

        for i in range(self.playlist_tree.topLevelItemCount()):
            walk(self.playlist_tree.topLevelItem(i))
        return selected

    def select_all_playlists(self) -> None:
        def set_leaves(item: QTreeWidgetItem, checked: bool) -> None:
            if item.data(0, _PATH_ROLE) is not None:
                item.setCheckState(0, Qt.CheckState.Checked if checked else Qt.CheckState.Unchecked)
            for i in range(item.childCount()):
                set_leaves(item.child(i), checked)
        for i in range(self.playlist_tree.topLevelItemCount()):
            set_leaves(self.playlist_tree.topLevelItem(i), True)
        self._ignore_item_changed = True
        try:
            self._refresh_folder_states()
        finally:
            self._ignore_item_changed = False

    def deselect_all_playlists(self) -> None:
        def set_leaves(item: QTreeWidgetItem, checked: bool) -> None:
            if item.data(0, _PATH_ROLE) is not None:
                item.setCheckState(0, Qt.CheckState.Checked if checked else Qt.CheckState.Unchecked)
            for i in range(item.childCount()):
                set_leaves(item.child(i), checked)
        for i in range(self.playlist_tree.topLevelItemCount()):
            set_leaves(self.playlist_tree.topLevelItem(i), False)
        self._ignore_item_changed = True
        try:
            self._refresh_folder_states()
        finally:
            self._ignore_item_changed = False

    def expand_all_playlists(self) -> None:
        def _expand(item: QTreeWidgetItem) -> None:
            if item.childCount() > 0:
                item.setExpanded(True)
                for i in range(item.childCount()):
                    _expand(item.child(i))
        for i in range(self.playlist_tree.topLevelItemCount()):
            _expand(self.playlist_tree.topLevelItem(i))

    def collapse_all_playlists(self) -> None:
        def _collapse(item: QTreeWidgetItem) -> None:
            if item.childCount() > 0:
                item.setExpanded(False)
                for i in range(item.childCount()):
                    _collapse(item.child(i))
        for i in range(self.playlist_tree.topLevelItemCount()):
            _collapse(self.playlist_tree.topLevelItem(i))

    def _set_playlist_selection_enabled(self, enabled: bool) -> None:
        """Enable or disable tree, search, and selection buttons during/after processing."""
        self.playlist_tree.setEnabled(enabled)
        self.search_edit.setEnabled(enabled)
        self.select_all_btn.setEnabled(enabled)
        self.deselect_all_btn.setEnabled(enabled)
        self.expand_all_btn.setEnabled(enabled)
        self.collapse_all_btn.setEnabled(enabled)

    def _on_start_batch(self):
        """Handle start batch button click"""
        selected = self.get_selected_playlists()
        if not selected:
            QMessageBox.warning(
                self,
                "No Playlists Selected",
                "Please select at least one playlist to process.",
            )
            return

        # Show detailed confirmation dialog with summary
        playlist_list = "\n".join(f"  • {name}" for name in selected)
        estimated_time = self._estimate_time(len(selected))

        reply = QMessageBox.question(
            self,
            "Start Batch Processing?",
            f"You are about to process:\n\n"
            f"Playlists ({len(selected)}):\n{playlist_list}\n\n"
            f"Estimated Time: {estimated_time}\n\n"
            f"Continue?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )

        if reply == QMessageBox.Yes:
            self.start_batch_processing(selected)

    def _estimate_time(self, playlist_count: int) -> str:
        """Estimate processing time based on playlist count"""
        # Rough estimate: ~2-5 minutes per playlist
        min_time = playlist_count * 2
        max_time = playlist_count * 5
        if min_time < 60:
            return f"~{min_time}-{max_time} minutes"
        else:
            hours = min_time // 60
            return f"~{hours} hour(s) or more"

    def start_batch_processing(self, playlist_names: List[str]):
        """Start processing selected playlists"""
        self.selected_playlists = playlist_names
        self.results = {}
        self.current_playlist_index = (
            -1
        )  # Start at -1, will be 0 after first completion
        self.is_processing = True

        # Clear previous per-playlist progress widgets
        while self.playlist_progress_layout.count():
            item = self.playlist_progress_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self.playlist_progress_widgets = {}

        # Create per-playlist progress widgets
        for playlist_name in playlist_names:
            playlist_widget = QWidget()
            playlist_layout = QVBoxLayout(playlist_widget)
            playlist_layout.setContentsMargins(5, 5, 5, 5)

            status_label = QLabel(f"⏳ {playlist_name} - Pending")
            status_label.setStyleSheet("font-weight: bold;")
            playlist_layout.addWidget(status_label)

            progress_bar = QProgressBar()
            progress_bar.setValue(0)
            progress_bar.setFormat("%p%")
            playlist_layout.addWidget(progress_bar)

            self.playlist_progress_widgets[playlist_name] = {
                "widget": playlist_widget,
                "status_label": status_label,
                "progress_bar": progress_bar,
            }
            self.playlist_progress_layout.addWidget(playlist_widget)

        # Initialize time tracking
        self.batch_start_time = time.time()
        self.current_playlist_start_time = None
        self.total_elapsed_time = 0.0

        # Start timer to update time display every second
        self.timer.start(1000)  # Update every 1 second

        # Update UI
        self.start_batch_btn.setEnabled(False)
        self.cancel_batch_btn.setEnabled(True)
        self.overall_progress.setMaximum(len(playlist_names))
        self.overall_progress.setValue(0)
        self.current_playlist_label.setText("Starting batch processing...")
        self.elapsed_label.setText("Elapsed: 0s")
        self.remaining_label.setText("Remaining: --")

        # Disable playlist selection during processing
        self._set_playlist_selection_enabled(False)

        # Emit signal to start batch processing
        self.batch_started.emit(playlist_names)

    def _on_cancel_batch(self):
        """Handle cancel batch button click"""
        reply = QMessageBox.question(
            self,
            "Cancel Batch Processing",
            "Are you sure you want to cancel batch processing?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )

        if reply == QMessageBox.Yes:
            self.cancel_batch_processing()

    def cancel_batch_processing(self):
        """Cancel batch processing"""
        self.is_processing = False

        # Stop timer
        self.timer.stop()

        # Update UI
        self.start_batch_btn.setEnabled(True)
        self.cancel_batch_btn.setEnabled(False)
        self.current_playlist_label.setText("Batch processing cancelled")

        # Re-enable playlist selection
        self._set_playlist_selection_enabled(True)

        # Emit cancel signal
        self.batch_cancelled.emit()

    def _update_time_display(self):
        """Update elapsed and remaining time display"""
        if not self.is_processing or not self.batch_start_time:
            return

        # Calculate total elapsed time
        current_time = time.time()
        if self.current_playlist_start_time:
            # Add time from current playlist
            current_playlist_elapsed = current_time - self.current_playlist_start_time
            total_elapsed = self.total_elapsed_time + current_playlist_elapsed
        else:
            total_elapsed = self.total_elapsed_time

        # Update elapsed time
        elapsed_str = self._format_time(total_elapsed)
        self.elapsed_label.setText(f"Elapsed: {elapsed_str}")

        # Calculate remaining time estimate
        completed_playlists = (
            self.current_playlist_index + 1
        )  # Number of fully completed playlists
        total_playlists = len(self.selected_playlists)
        remaining_playlists = total_playlists - completed_playlists

        # If we're currently processing a playlist, we need to account for it
        if self.current_playlist_start_time:
            remaining_playlists -= 1  # Subtract current playlist from remaining count

        if remaining_playlists <= 0:
            # All playlists are done or being processed
            self.remaining_label.setText("Remaining: --")
        elif completed_playlists > 0:
            # We have completed at least one playlist, use average
            avg_time_per_playlist = self.total_elapsed_time / completed_playlists
            estimated_remaining = avg_time_per_playlist * remaining_playlists
            remaining_str = self._format_time(estimated_remaining)
            self.remaining_label.setText(f"Remaining: {remaining_str}")
        elif self.current_playlist_start_time and total_elapsed > 5:
            # First playlist, use current elapsed time as estimate
            # Only estimate if we've spent at least 5 seconds (to avoid showing same small values)
            # Estimate: if we've spent X time on this playlist, and there are N more playlists,
            # estimate remaining as X * N
            current_playlist_elapsed = current_time - self.current_playlist_start_time
            if current_playlist_elapsed > 5:  # Only estimate after 5 seconds
                estimated_remaining = current_playlist_elapsed * remaining_playlists
                remaining_str = self._format_time(estimated_remaining)
                self.remaining_label.setText(f"Remaining: {remaining_str}")
            else:
                self.remaining_label.setText("Remaining: Calculating...")
        else:
            self.remaining_label.setText("Remaining: --")

    def _format_time(self, seconds: float) -> str:
        """Format time in human-readable format"""
        if seconds < 60:
            return f"{seconds:.0f}s"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours}h {minutes}m"

    def on_playlist_started(self, playlist_name: str):
        """Handle when a playlist starts processing"""
        if not self.is_processing:
            return

        # Track start time for current playlist
        self.current_playlist_start_time = time.time()

        self.current_playlist_label.setText(f"Processing: {playlist_name}")
        self.current_progress.setValue(0)

        # Update per-playlist progress
        if playlist_name in self.playlist_progress_widgets:
            widget_info = self.playlist_progress_widgets[playlist_name]
            widget_info["status_label"].setText(f"→ {playlist_name} - Processing...")
            widget_info["status_label"].setStyleSheet(
                "font-weight: bold; color: #0078d4;"
            )

    def on_playlist_progress(self, progress_info: ProgressInfo):
        """Handle progress update for current playlist"""
        if not self.is_processing:
            return

        # Update current playlist progress
        if progress_info.total_tracks > 0:
            self.current_progress.setMaximum(progress_info.total_tracks)
            self.current_progress.setValue(progress_info.completed_tracks)

            # Update per-playlist progress for current playlist
            current_playlist = (
                self.selected_playlists[self.current_playlist_index + 1]
                if (self.current_playlist_index + 1) < len(self.selected_playlists)
                else None
            )
            if current_playlist and current_playlist in self.playlist_progress_widgets:
                widget_info = self.playlist_progress_widgets[current_playlist]
                widget_info["progress_bar"].setMaximum(progress_info.total_tracks)
                widget_info["progress_bar"].setValue(progress_info.completed_tracks)
                widget_info["status_label"].setText(
                    f"→ {current_playlist} - Processing... ({progress_info.completed_tracks}/{progress_info.total_tracks})"
                )

        # Update time display (will also be updated by timer, but this ensures accuracy)
        self._update_time_display()

    def on_playlist_completed(self, playlist_name: str, results: List[TrackResult]):
        """Handle when a playlist completes"""
        if not self.is_processing:
            return

        # Update total elapsed time (add time spent on this playlist)
        if self.current_playlist_start_time:
            playlist_elapsed = time.time() - self.current_playlist_start_time
            self.total_elapsed_time += playlist_elapsed
            self.current_playlist_start_time = None

        # Store results
        self.results[playlist_name] = results

        # Update per-playlist progress
        if playlist_name in self.playlist_progress_widgets:
            widget_info = self.playlist_progress_widgets[playlist_name]
            matched_count = sum(1 for r in results if r.matched)
            total_count = len(results)
            percentage = (matched_count / total_count * 100) if total_count > 0 else 0
            widget_info["progress_bar"].setValue(100)
            widget_info["status_label"].setText(
                f"✓ {playlist_name} - Complete ({matched_count}/{total_count} matched, {percentage:.0f}%)"
            )
            widget_info["status_label"].setStyleSheet(
                "font-weight: bold; color: #4CAF50;"
            )

        # Update overall progress (increment first, then set value)
        self.current_playlist_index += 1
        completed_count = self.current_playlist_index + 1  # +1 because index is 0-based
        self.overall_progress.setValue(completed_count)

        # Update time display
        self._update_time_display()

        # Emit signal
        self.playlist_completed.emit(playlist_name, results)

        # Check if batch is complete
        if completed_count >= len(self.selected_playlists):
            self.on_batch_completed()

    def on_playlist_error(self, playlist_name: str, error: ProcessingError):
        """Handle error for a playlist"""
        if not self.is_processing:
            return

        # Show error but continue with next playlist
        QMessageBox.warning(
            self,
            f"Error Processing {playlist_name}",
            f"An error occurred while processing '{playlist_name}':\n\n{error.message}\n\nContinuing with next playlist...",
        )

        # Mark as completed (with no results)
        self.results[playlist_name] = []
        self.current_playlist_index += 1
        completed_count = self.current_playlist_index + 1  # +1 because index is 0-based
        self.overall_progress.setValue(completed_count)

        # Check if batch is complete
        if completed_count >= len(self.selected_playlists):
            self.on_batch_completed()

    def on_batch_completed(self):
        """Handle batch completion"""
        self.is_processing = False

        # Stop timer
        self.timer.stop()

        # Final time update
        if self.batch_start_time:
            total_time = time.time() - self.batch_start_time
            elapsed_str = self._format_time(total_time)
            self.elapsed_label.setText(f"Total Time: {elapsed_str}")
            self.remaining_label.setText("")  # Clear remaining time

        # Update UI
        self.start_batch_btn.setEnabled(True)
        self.cancel_batch_btn.setEnabled(False)
        self.current_playlist_label.setText("Batch processing complete!")

        # Re-enable playlist selection
        self._set_playlist_selection_enabled(True)

        # Show batch summary dialog
        self._show_batch_summary()

        # Emit completion signal
        self.batch_completed.emit(self.results)

    def _show_batch_summary(self):
        """Show batch processing summary dialog"""
        from PySide6.QtWidgets import QDialog, QDialogButtonBox, QListWidget

        summary_dialog = QDialog(self)
        summary_dialog.setWindowTitle("Batch Processing Complete")
        summary_dialog.setMinimumSize(500, 400)

        layout = QVBoxLayout(summary_dialog)

        # Overall statistics
        total_playlists = len(self.results)
        total_tracks = sum(len(r) for r in self.results.values())
        total_matched = sum(
            sum(1 for t in r if t.matched) for r in self.results.values()
        )
        total_unmatched = total_tracks - total_matched
        match_rate = (total_matched / total_tracks * 100) if total_tracks > 0 else 0

        # Calculate total time
        total_time_str = "Unknown"
        if self.batch_start_time:
            total_time = time.time() - self.batch_start_time
            total_time_str = self._format_time(total_time)

        summary_text = QLabel(
            f"<b>Summary:</b><br/>"
            f"• Total Playlists: {total_playlists}<br/>"
            f"• Total Tracks: {total_tracks}<br/>"
            f"• Matched: {total_matched} ({match_rate:.0f}%)<br/>"
            f"• Unmatched: {total_unmatched} ({100 - match_rate:.0f}%)<br/>"
            f"• Processing Time: {total_time_str}"
        )
        summary_text.setWordWrap(True)
        layout.addWidget(summary_text)

        # Per-playlist breakdown
        playlist_label = QLabel("<b>Per Playlist:</b>")
        layout.addWidget(playlist_label)

        playlist_list = QListWidget()
        for playlist_name, playlist_results in self.results.items():
            matched = sum(1 for r in playlist_results if r.matched)
            total = len(playlist_results)
            percentage = (matched / total * 100) if total > 0 else 0
            item_text = f"✓ {playlist_name}: {matched}/{total} ({percentage:.0f}%)"
            playlist_list.addItem(item_text)

        layout.addWidget(playlist_list)

        # Buttons
        button_box = QDialogButtonBox(QDialogButtonBox.Ok)
        button_box.accepted.connect(summary_dialog.accept)
        layout.addWidget(button_box)

        summary_dialog.exec()

        # Show summary with time
        total_playlists = len(self.selected_playlists)
        successful = len([r for r in self.results.values() if r])
        total_time = time.time() - self.batch_start_time if self.batch_start_time else 0
        time_str = self._format_time(total_time)
        QMessageBox.information(
            self,
            "Batch Processing Complete",
            f"Batch processing completed!\n\n"
            f"Processed: {total_playlists} playlist(s)\n"
            f"Successful: {successful}\n"
            f"Failed: {total_playlists - successful}\n"
            f"Total Time: {time_str}",
        )

    def reset(self):
        """Reset batch processor state"""
        self.results = {}
        self.current_playlist_index = -1
        self.selected_playlists = []
        self.is_processing = False
        self.overall_progress.setValue(0)
        self.current_progress.setValue(0)
        self.current_playlist_label.setText("Ready")
        self.start_batch_btn.setEnabled(True)
        self.cancel_batch_btn.setEnabled(False)
