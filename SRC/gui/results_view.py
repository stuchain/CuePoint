#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Results View Widget Module - Results display and export

This module contains the ResultsView widget for displaying processing results
and exporting them to CSV files.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidget, QTableWidgetItem, QGroupBox, QFileDialog,
    QMessageBox, QLineEdit, QComboBox, QHeaderView, QMenu, QDialog
)
from PySide6.QtCore import Qt, Signal
from typing import List, Optional, Dict, Any
import os
import subprocess
import platform

from gui_interface import TrackResult
from gui.candidate_dialog import CandidateDialog
from gui.export_dialog import ExportDialog
from output_writer import write_csv_files, write_json_file, write_excel_file
from utils import with_timestamp


class ResultsView(QWidget):
    """Widget for displaying processing results and exporting to CSV"""
    
    # Signal emitted when a result is updated (candidate selected)
    result_updated = Signal(int, TrackResult)  # playlist_index, updated_result
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results: List[TrackResult] = []
        self.output_files: dict = {}
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        
        # Summary statistics group
        summary_group = QGroupBox("Summary Statistics")
        summary_layout = QVBoxLayout()
        self.summary_label = QLabel("No results yet")
        self.summary_label.setWordWrap(True)
        summary_layout.addWidget(self.summary_label)
        summary_group.setLayout(summary_layout)
        layout.addWidget(summary_group)
        
        # Results table
        table_group = QGroupBox("Results")
        table_layout = QVBoxLayout()
        
        # Filter controls
        filter_layout = QHBoxLayout()
        
        # Search box
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search...")
        self.search_box.textChanged.connect(self.apply_filters)
        filter_layout.addWidget(QLabel("Search:"))
        filter_layout.addWidget(self.search_box)
        
        # Confidence filter
        filter_layout.addWidget(QLabel("Confidence:"))
        self.confidence_filter = QComboBox()
        self.confidence_filter.addItems(["All", "High", "Medium", "Low"])
        self.confidence_filter.currentTextChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.confidence_filter)
        
        filter_layout.addStretch()
        table_layout.addLayout(filter_layout)
        
        # Create table with key columns
        self.table = QTableWidget()
        self.table.setColumnCount(11)
        self.table.setHorizontalHeaderLabels([
            "Index", "Title", "Artist", "Matched", 
            "Beatport Title", "Beatport Artist", "Score", "Confidence", "Key", "BPM", "Year"
        ])
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
        
        table_layout.addWidget(self.table)
        table_group.setLayout(table_layout)
        layout.addWidget(table_group, 1)  # Give table stretch priority
        
        # Export buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.export_btn = QPushButton("Export...")
        self.export_btn.clicked.connect(self.show_export_dialog)
        button_layout.addWidget(self.export_btn)
        
        # Legacy export buttons (for backward compatibility)
        self.export_all_btn = QPushButton("Export All CSV Files")
        self.export_all_btn.clicked.connect(self.export_all_csv)
        button_layout.addWidget(self.export_all_btn)
        
        self.open_folder_btn = QPushButton("Open Output Folder")
        self.open_folder_btn.clicked.connect(self.open_output_folder)
        button_layout.addWidget(self.open_folder_btn)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
    
    def set_results(self, results: List[TrackResult], playlist_name: str = ""):
        """
        Set results to display.
        
        Args:
            results: List of TrackResult objects
            playlist_name: Name of processed playlist (for file naming)
        """
        self.results = results
        self.playlist_name = playlist_name or "playlist"
        
        # Update summary statistics
        self._update_summary()
        
        # Populate table
        self._populate_table()
    
    def _update_summary(self):
        """Update summary statistics display"""
        if not self.results:
            self.summary_label.setText("No results yet")
            return
        
        total = len(self.results)
        matched = sum(1 for r in self.results if r.matched)
        unmatched = total - matched
        match_rate = (matched / total * 100) if total > 0 else 0
        
        # Calculate average score for matched tracks
        matched_scores = [r.match_score for r in self.results if r.matched and r.match_score is not None]
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
    
    def _populate_table(self):
        """Populate table with results"""
        # Apply filters first
        filtered = self._filter_results()
        
        # Disable sorting temporarily to populate
        self.table.setSortingEnabled(False)
        self.table.setRowCount(len(filtered))
        
        for row, result in enumerate(filtered):
            # Index
            self.table.setItem(row, 0, QTableWidgetItem(str(result.playlist_index)))
            
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
            confidence_item = QTableWidgetItem(confidence_text.capitalize() if confidence_text else "")
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
        
        # Resize columns to content
        self.table.resizeColumnsToContents()
    
    def _filter_results(self) -> List[TrackResult]:
        """Apply filters to results"""
        filtered = self.results
        
        # Search filter
        search_text = self.search_box.text().lower()
        if search_text:
            filtered = [
                r for r in filtered
                if search_text in r.title.lower() 
                or search_text in (r.artist or "").lower()
                or search_text in (r.beatport_title or "").lower()
                or search_text in (r.beatport_artists or "").lower()
            ]
        
        # Confidence filter
        confidence = self.confidence_filter.currentText()
        if confidence != "All":
            filtered = [r for r in filtered if (r.confidence or "").lower() == confidence.lower()]
            
        return filtered
    
    def apply_filters(self):
        """Apply filters and update table"""
        self._populate_table()
    
    def show_export_dialog(self):
        """Show export dialog and handle export"""
        if not self.results:
            QMessageBox.warning(self, "No Results", "No results to export")
            return
        
        # Get results to export (filtered or all)
        dialog = ExportDialog(self)
        if dialog.exec() != QDialog.Accepted:
            return
        
        options = dialog.get_export_options()
        file_path = options.get('file_path')
        
        if not file_path:
            QMessageBox.warning(self, "No File Selected", "Please select a file location")
            return
        
        # Get results to export
        results_to_export = self._filter_results() if options.get('export_filtered', False) else self.results
        
        if not results_to_export:
            QMessageBox.warning(self, "No Results", "No results to export (filter may have excluded all results)")
            return
        
        try:
            format_type = options.get('format', 'csv')
            
            if format_type == 'json':
                # Export to JSON
                write_json_file(
                    results_to_export,
                    file_path,
                    playlist_name=self.playlist_name,
                    include_candidates=options.get('include_candidates', False),
                    include_queries=options.get('include_queries', False)
                )
                QMessageBox.information(
                    self,
                    "Export Complete",
                    f"JSON file exported to:\n{file_path}"
                )
                
            elif format_type == 'excel':
                # Export to Excel
                write_excel_file(
                    results_to_export,
                    file_path,
                    playlist_name=self.playlist_name
                )
                QMessageBox.information(
                    self,
                    "Export Complete",
                    f"Excel file exported to:\n{file_path}"
                )
                
            else:  # CSV
                # Export to CSV (use existing function)
                output_dir = os.path.dirname(file_path) or "output"
                base_filename = os.path.basename(file_path)
                # Remove extension if present
                if base_filename.endswith('.csv'):
                    base_filename = base_filename[:-4]
                
                output_files = write_csv_files(results_to_export, base_filename, output_dir)
                self.output_files = output_files
                
                if output_files.get('main'):
                    QMessageBox.information(
                        self,
                        "Export Complete",
                        f"CSV file exported to:\n{output_files['main']}"
                    )
                else:
                    QMessageBox.warning(self, "Export Failed", "Failed to export CSV file")
                    
        except ImportError as e:
            QMessageBox.critical(
                self,
                "Export Error",
                f"Missing dependency:\n{str(e)}\n\nPlease install required package."
            )
        except Exception as e:
            QMessageBox.critical(
                self,
                "Export Error",
                f"Error exporting file:\n{str(e)}"
            )
    
    def export_all_csv(self):
        """Export all CSV files (main, candidates, queries, review)"""
        if not self.results:
            QMessageBox.warning(self, "No Results", "No results to export")
            return
        
        # Get output directory
        output_dir = QFileDialog.getExistingDirectory(
            self,
            "Select Output Directory",
            "output"
        )
        
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
            if output_files.get('main'):
                files_list.append(f"Main: {os.path.basename(output_files['main'])}")
            if output_files.get('candidates'):
                files_list.append(f"Candidates: {os.path.basename(output_files['candidates'])}")
            if output_files.get('queries'):
                files_list.append(f"Queries: {os.path.basename(output_files['queries'])}")
            if output_files.get('review'):
                files_list.append(f"Review: {os.path.basename(output_files['review'])}")
            
            if files_list:
                message = f"Exported {len(files_list)} file(s) to:\n{output_dir}\n\n" + "\n".join(files_list)
                QMessageBox.information(self, "Export Complete", message)
            else:
                QMessageBox.warning(self, "Export Failed", "No files were exported")
                
        except Exception as e:
            QMessageBox.critical(
                self,
                "Export Error",
                f"Error exporting CSV files:\n{str(e)}"
            )
    
    def open_output_folder(self):
        """Open output folder in file explorer"""
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
            QMessageBox.warning(
                self,
                "Error",
                f"Could not open folder:\n{str(e)}"
            )
    
    def _show_context_menu(self, position):
        """Show context menu for table row"""
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
    
    def _on_row_double_clicked(self, index):
        """Handle double-click on table row"""
        row = index.row()
        self._view_candidates_for_row(row)
    
    def _view_candidates_for_row(self, row: int):
        """View candidates for a specific row"""
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
                f"No alternative candidates found for:\n{result.title} - {result.artist}"
            )
            return
        
        # Build current match dict if matched
        current_match = None
        if result.matched:
            current_match = {
                'beatport_title': result.beatport_title,
                'beatport_artists': result.beatport_artists,
                'beatport_url': result.beatport_url,
                'match_score': result.match_score,
                'title_sim': result.title_sim,
                'artist_sim': result.artist_sim,
                'beatport_key': result.beatport_key,
                'beatport_key_camelot': result.beatport_key_camelot,
                'beatport_bpm': result.beatport_bpm,
                'beatport_year': result.beatport_year,
            }
        
        # Show candidate dialog
        dialog = CandidateDialog(
            track_title=result.title,
            track_artist=result.artist or "",
            candidates=result.candidates,
            current_match=current_match,
            parent=self
        )
        
        # Connect candidate selection
        dialog.candidate_selected.connect(
            lambda candidate: self._on_candidate_selected(result.playlist_index, candidate)
        )
        
        dialog.exec()
    
    def _on_candidate_selected(self, playlist_index: int, candidate: Dict[str, Any]):
        """Handle candidate selection - update the result"""
        # Find the result by playlist_index
        result = None
        for r in self.results:
            if r.playlist_index == playlist_index:
                result = r
                break
        
        if result is None:
            return
        
        # Update result with selected candidate
        result.beatport_title = candidate.get('candidate_title', candidate.get('beatport_title', ''))
        result.beatport_artists = candidate.get('candidate_artists', candidate.get('beatport_artists', ''))
        result.beatport_url = candidate.get('candidate_url', candidate.get('beatport_url', ''))
        
        # Update scores
        try:
            result.match_score = float(candidate.get('final_score', candidate.get('match_score', 0)))
        except (ValueError, TypeError):
            result.match_score = None
        
        try:
            result.title_sim = float(candidate.get('title_sim', 0))
        except (ValueError, TypeError):
            result.title_sim = None
        
        try:
            result.artist_sim = float(candidate.get('artist_sim', 0))
        except (ValueError, TypeError):
            result.artist_sim = None
        
        # Update metadata
        result.beatport_key = candidate.get('candidate_key', candidate.get('beatport_key', ''))
        result.beatport_key_camelot = candidate.get('candidate_key_camelot', '')
        result.beatport_bpm = candidate.get('candidate_bpm', candidate.get('beatport_bpm', ''))
        result.beatport_year = candidate.get('candidate_year', candidate.get('beatport_year', ''))
        result.beatport_label = candidate.get('candidate_label', candidate.get('beatport_label', ''))
        result.beatport_genres = candidate.get('candidate_genres', candidate.get('beatport_genres', ''))
        result.beatport_release = candidate.get('candidate_release', candidate.get('beatport_release', ''))
        result.beatport_release_date = candidate.get('candidate_release_date', candidate.get('beatport_release_date', ''))
        
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
            self,
            "Candidate Selected",
            f"Updated match for:\n{result.title} - {result.artist}"
        )
    
    def clear(self):
        """Clear results display"""
        self.results = []
        self.output_files = {}
        self.table.setRowCount(0)
        self.summary_label.setText("No results yet")
        self.search_box.clear()
        self.confidence_filter.setCurrentIndex(0)  # Reset to "All"
