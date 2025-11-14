#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
History View Widget Module - Past searches history viewer

This module contains the HistoryView class for viewing past search results from CSV files.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidget, QTableWidgetItem, QFileDialog, QGroupBox,
    QListWidget, QListWidgetItem, QMessageBox, QHeaderView
)
from PySide6.QtCore import Qt
from typing import List, Optional, Dict, Any
import os
import csv
import sys
from datetime import datetime
from gui.candidate_dialog import CandidateDialog


class HistoryView(QWidget):
    """Widget for viewing past search results from CSV files"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_csv_path: Optional[str] = None
        self.csv_rows: List[dict] = []  # Store loaded CSV rows for updates
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 10, 10, 10)
        
        # File selection section
        file_group = QGroupBox("Select Past Search")
        file_layout = QVBoxLayout()
        
        # Browse button
        browse_layout = QHBoxLayout()
        self.file_path_label = QLabel("No file selected")
        self.file_path_label.setWordWrap(True)
        browse_layout.addWidget(self.file_path_label, 1)
        
        self.browse_btn = QPushButton("Browse CSV File...")
        self.browse_btn.clicked.connect(self.on_browse_csv)
        browse_layout.addWidget(self.browse_btn)
        
        file_layout.addLayout(browse_layout)
        
        # Recent CSV files list
        recent_label = QLabel("Recent CSV Files:")
        file_layout.addWidget(recent_label)
        
        self.recent_list = QListWidget()
        self.recent_list.itemDoubleClicked.connect(self.on_recent_file_selected)
        file_layout.addWidget(self.recent_list)
        
        # Refresh recent files button
        refresh_btn = QPushButton("Refresh List")
        refresh_btn.clicked.connect(self.refresh_recent_files)
        file_layout.addWidget(refresh_btn)
        
        file_group.setLayout(file_layout)
        layout.addWidget(file_group)
        
        # Results display section
        results_group = QGroupBox("Search Results")
        results_layout = QVBoxLayout()
        
        # Summary info
        self.summary_label = QLabel("No file loaded")
        self.summary_label.setWordWrap(True)
        results_layout.addWidget(self.summary_label)
        
        # Results table (reuse same structure as ResultsView)
        self.table = QTableWidget()
        self.table.setSortingEnabled(True)
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
        # Enable context menu and double-click for viewing candidates
        self.table.setContextMenuPolicy(Qt.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self._show_context_menu)
        self.table.doubleClicked.connect(self._on_row_double_clicked)
        results_layout.addWidget(self.table, 1)
        
        results_group.setLayout(results_layout)
        layout.addWidget(results_group, 1)
        
        # Load recent files on init
        self.refresh_recent_files()
    
    def on_browse_csv(self):
        """Browse for CSV file to load"""
        # Default to first output directory if it exists
        output_dirs = self._get_output_dirs()
        default_dir = output_dirs[0] if output_dirs else ""
        
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select CSV File",
            default_dir,
            "CSV Files (*.csv);;All Files (*.*)"
        )
        
        if file_path:
            self.load_csv_file(file_path)
    
    def on_recent_file_selected(self, item: QListWidgetItem):
        """Load CSV file from recent list"""
        file_path = item.data(Qt.UserRole)
        if file_path and os.path.exists(file_path):
            self.load_csv_file(file_path)
        else:
            QMessageBox.warning(
                self,
                "File Not Found",
                f"The file no longer exists:\n{file_path}"
            )
            # Refresh the list to remove missing files
            self.refresh_recent_files()
    
    def load_csv_file(self, file_path: str):
        """Load and display CSV file contents"""
        try:
            if not os.path.exists(file_path):
                QMessageBox.warning(self, "File Not Found", f"File not found: {file_path}")
                return
            
            # Read CSV file
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            
            if not rows:
                QMessageBox.warning(self, "Empty File", "The selected CSV file is empty")
                return
            
            self.current_csv_path = file_path
            self.file_path_label.setText(f"Loaded: {os.path.basename(file_path)}")
            
            # Update summary
            total = len(rows)
            # Check for matched tracks (presence of beatport_url or beatport_title)
            matched = sum(1 for row in rows if row.get('beatport_url', '').strip() or row.get('beatport_title', '').strip())
            match_rate = (matched / total * 100) if total > 0 else 0
            
            # Try to extract timestamp from filename
            timestamp_info = ""
            try:
                # Filename format: playlist_name (dd-mm-yy HH-MM).csv (dashes for Windows compatibility, no colons)
                basename = os.path.basename(file_path)
                if '(' in basename and ')' in basename:
                    # Extract timestamp from parentheses
                    start_idx = basename.rfind('(')
                    end_idx = basename.rfind(')')
                    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                        timestamp_str = basename[start_idx + 1:end_idx]
                        # Try to parse the timestamp (dd-mm-yy HH-MM) - new format with dashes (no colons)
                        dt = datetime.strptime(timestamp_str, "%d-%m-%y %H-%M")
                        timestamp_info = f"\nSearch Date: {dt.strftime('%d/%m/%y %H:%M')}"
            except:
                # Fallback: try old format with slashes
                try:
                    # Filename format: playlist_name (dd/mm/yy HH:MM).csv
                    basename = os.path.basename(file_path)
                    if '(' in basename and ')' in basename:
                        # Extract timestamp from parentheses
                        start_idx = basename.rfind('(')
                        end_idx = basename.rfind(')')
                        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                            timestamp_str = basename[start_idx + 1:end_idx]
                            # Try to parse the timestamp (dd/mm/yy HH:MM)
                            dt = datetime.strptime(timestamp_str, "%d/%m/%y %H:%M")
                            timestamp_info = f"\nSearch Date: {dt.strftime('%d/%m/%y %H:%M')}"
                except:
                    # Fallback to old formats
                    try:
                        # Try old format: playlist_name (YYYY-MM-DD HH:MM:SS).csv
                        basename = os.path.basename(file_path)
                        if '(' in basename and ')' in basename:
                            start_idx = basename.rfind('(')
                            end_idx = basename.rfind(')')
                            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                                timestamp_str = basename[start_idx + 1:end_idx]
                                dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                                timestamp_info = f"\nSearch Date: {dt.strftime('%d/%m/%y %H:%M')}"
                    except:
                        # Fallback to very old format: playlist_20250127_123456.csv
                        try:
                            basename = os.path.basename(file_path)
                            parts = basename.replace('.csv', '').split('_')
                            if len(parts) >= 3:
                                date_str = parts[-2]
                                time_str = parts[-1]
                                if len(date_str) == 8 and len(time_str) == 6:
                                    dt = datetime.strptime(f"{date_str}_{time_str}", "%Y%m%d_%H%M%S")
                                    timestamp_info = f"\nSearch Date: {dt.strftime('%d/%m/%y %H:%M')}"
                        except:
                            pass
            
            summary_text = (
                f"File: {os.path.basename(file_path)}\n"
                f"Total tracks: {total}\n"
                f"Matched: {matched} ({match_rate:.1f}%)"
                f"{timestamp_info}"
            )
            self.summary_label.setText(summary_text)
            
            # Store rows for potential updates
            self.csv_rows = rows
            
            # Populate table
            self._populate_table(rows)
            
            # Add to recent files if not already there
            self._add_to_recent_files(file_path)
            
        except Exception as e:
            QMessageBox.critical(
                self,
                "Error Loading File",
                f"Error loading CSV file:\n{str(e)}"
            )
    
    def _populate_table(self, rows: List[dict]):
        """Populate table with CSV data"""
        if not rows:
            self.table.setRowCount(0)
            return
        
        # Get column names from first row
        columns = list(rows[0].keys())
        
        # Set up table
        self.table.setColumnCount(len(columns))
        self.table.setHorizontalHeaderLabels(columns)
        self.table.setRowCount(len(rows))
        
        # Populate rows
        for row_idx, row_data in enumerate(rows):
            for col_idx, col_name in enumerate(columns):
                value = row_data.get(col_name, "")
                item = QTableWidgetItem(str(value))
                self.table.setItem(row_idx, col_idx, item)
        
        # Resize columns to content
        self.table.resizeColumnsToContents()
    
    def _on_candidate_selected(self, row: int, playlist_index: int, original_title: str, original_artists: str, candidate: Dict[str, Any]):
        """Handle candidate selection - update the CSV row and table display"""
        if row < 0 or row >= len(self.csv_rows):
            return
        
        # Update the CSV row data
        csv_row = self.csv_rows[row]
        
        # Update match information
        csv_row['beatport_title'] = candidate.get('candidate_title', candidate.get('beatport_title', ''))
        csv_row['beatport_artists'] = candidate.get('candidate_artists', candidate.get('beatport_artists', ''))
        csv_row['beatport_url'] = candidate.get('beatport_url', candidate.get('candidate_url', ''))
        csv_row['beatport_key'] = candidate.get('beatport_key', candidate.get('candidate_key', ''))
        csv_row['beatport_key_camelot'] = candidate.get('beatport_key_camelot', candidate.get('candidate_key_camelot', ''))
        csv_row['beatport_year'] = candidate.get('beatport_year', candidate.get('candidate_year', ''))
        csv_row['beatport_bpm'] = candidate.get('beatport_bpm', candidate.get('candidate_bpm', ''))
        csv_row['beatport_label'] = candidate.get('beatport_label', candidate.get('candidate_label', ''))
        csv_row['title_sim'] = str(candidate.get('title_sim', ''))
        csv_row['artist_sim'] = str(candidate.get('artist_sim', ''))
        csv_row['match_score'] = str(candidate.get('match_score', candidate.get('final_score', '')))
        
        # Update confidence based on score
        try:
            score = float(csv_row.get('match_score', 0))
            if score >= 90:
                csv_row['confidence'] = 'high'
            elif score >= 75:
                csv_row['confidence'] = 'medium'
            else:
                csv_row['confidence'] = 'low'
        except (ValueError, TypeError):
            csv_row['confidence'] = ''
        
        # Update candidate_index if available
        csv_row['candidate_index'] = candidate.get('candidate_index', '')
        
        # Update the table display
        self._update_table_row(row, csv_row)
        
        # Show confirmation
        QMessageBox.information(
            self,
            "Candidate Updated",
            f"Updated match for:\n{original_title} - {original_artists}"
        )
    
    def _update_table_row(self, row: int, csv_row: dict):
        """Update a specific row in the table with new CSV data"""
        # Find columns by header name
        for col in range(self.table.columnCount()):
            header = self.table.horizontalHeaderItem(col)
            if header:
                col_name = header.text()
                # Map column names to CSV row keys
                value = ""
                if col_name == "Beatport Title":
                    value = csv_row.get('beatport_title', '')
                elif col_name == "Beatport Artist" or col_name == "Beatport Artists":
                    value = csv_row.get('beatport_artists', '')
                elif col_name == "Score":
                    value = csv_row.get('match_score', '')
                elif col_name == "Confidence":
                    value = csv_row.get('confidence', '').capitalize()
                elif col_name == "Key":
                    value = csv_row.get('beatport_key', '')
                elif col_name == "BPM":
                    value = csv_row.get('beatport_bpm', '')
                elif col_name == "Year":
                    value = csv_row.get('beatport_year', '')
                elif col_name == "Title Sim":
                    value = csv_row.get('title_sim', '')
                elif col_name == "Artist Sim":
                    value = csv_row.get('artist_sim', '')
                elif col_name == "Matched":
                    # Update matched status
                    matched = bool(csv_row.get('beatport_url', '').strip() or csv_row.get('beatport_title', '').strip())
                    matched_item = QTableWidgetItem("✓" if matched else "✗")
                    matched_item.setTextAlignment(Qt.AlignCenter)
                    if matched:
                        matched_item.setForeground(Qt.darkGreen)
                    else:
                        matched_item.setForeground(Qt.darkRed)
                    self.table.setItem(row, col, matched_item)
                    continue
                else:
                    # Try direct column name match (lowercase, replace spaces with underscores)
                    key = col_name.lower().replace(' ', '_')
                    value = csv_row.get(key, '')
                
                if value or col_name in ["Beatport Title", "Beatport Artist", "Beatport Artists", "Score", "Confidence", "Key", "BPM", "Year"]:
                    item = QTableWidgetItem(str(value))
                    self.table.setItem(row, col, item)
        
        # Update summary
        self._update_summary()
    
    def _update_summary(self):
        """Update summary statistics after candidate update"""
        if not self.csv_rows:
            return
        
        total = len(self.csv_rows)
        matched = sum(1 for row in self.csv_rows if row.get('beatport_url', '').strip() or row.get('beatport_title', '').strip())
        match_rate = (matched / total * 100) if total > 0 else 0
        
        # Try to extract timestamp from filename
        timestamp_info = ""
        if self.current_csv_path:
            try:
                basename = os.path.basename(self.current_csv_path)
                if '(' in basename and ')' in basename:
                    start_idx = basename.rfind('(')
                    end_idx = basename.rfind(')')
                    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                        timestamp_str = basename[start_idx + 1:end_idx]
                        dt = datetime.strptime(timestamp_str, "%d-%m-%y %H-%M")
                        timestamp_info = f"\nSearch Date: {dt.strftime('%d/%m/%y %H:%M')}"
            except:
                pass
        
        summary_text = (
            f"File: {os.path.basename(self.current_csv_path) if self.current_csv_path else 'No file'}\n"
            f"Total tracks: {total}\n"
            f"Matched: {matched} ({match_rate:.1f}%)"
            f"{timestamp_info}"
        )
        self.summary_label.setText(summary_text)
    
    def _get_candidates_csv_path(self, main_csv_path: str) -> Optional[str]:
        """Get the path to the candidates CSV file for a given main CSV file"""
        # Replace main CSV filename with candidates CSV filename
        base_path = main_csv_path.replace('.csv', '')
        candidates_path = f"{base_path}_candidates.csv"
        if os.path.exists(candidates_path):
            return candidates_path
        return None
    
    def _load_candidates_for_track(self, playlist_index: int, original_title: str, original_artists: str) -> List[Dict[str, Any]]:
        """Load candidates for a specific track from the candidates CSV"""
        if not self.current_csv_path:
            return []
        
        candidates_path = self._get_candidates_csv_path(self.current_csv_path)
        if not candidates_path:
            return []
        
        try:
            candidates = []
            with open(candidates_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Match by playlist_index and original title/artists
                    if (row.get('playlist_index') == str(playlist_index) and
                        row.get('original_title', '').strip() == original_title.strip() and
                        row.get('original_artists', '').strip() == original_artists.strip()):
                        # Convert CSV row to candidate dict format expected by CandidateDialog
                        candidate = {
                            'candidate_title': row.get('candidate_title', ''),
                            'candidate_artists': row.get('candidate_artists', ''),
                            'beatport_url': row.get('candidate_url', ''),
                            'match_score': float(row.get('final_score', 0)) if row.get('final_score') else 0.0,
                            'title_sim': float(row.get('title_sim', 0)) if row.get('title_sim') else 0.0,
                            'artist_sim': float(row.get('artist_sim', 0)) if row.get('artist_sim') else 0.0,
                            'beatport_key': row.get('candidate_key', ''),
                            'beatport_key_camelot': row.get('candidate_key_camelot', ''),
                            'beatport_bpm': row.get('candidate_bpm', ''),
                            'beatport_year': row.get('candidate_year', ''),
                            'beatport_label': row.get('candidate_label', ''),
                        }
                        candidates.append(candidate)
            
            # Sort by final_score (descending) to rank them
            candidates.sort(key=lambda x: x.get('match_score', 0), reverse=True)
            return candidates
        except Exception as e:
            return []
    
    def _show_context_menu(self, position):
        """Show context menu for table row"""
        from PySide6.QtWidgets import QMenu
        
        item = self.table.itemAt(position)
        if not item:
            return
        
        row = item.row()
        menu = QMenu(self)
        
        # Get track info to check if candidates exist
        playlist_index_item = self.table.item(row, 0)
        if playlist_index_item:
            try:
                playlist_index = int(playlist_index_item.text())
                title_item = self.table.item(row, 1)
                artist_item = self.table.item(row, 2) if self.table.columnCount() > 2 else None
                
                if title_item:
                    original_title = title_item.text()
                    original_artists = artist_item.text() if artist_item else ""
                    
                    # Check if candidates CSV exists and has candidates for this track
                    candidates = self._load_candidates_for_track(playlist_index, original_title, original_artists)
                    
                    if candidates:
                        view_action = menu.addAction("View Candidates...")
                        view_action.triggered.connect(lambda: self._on_row_double_clicked(self.table.indexFromItem(item)))
                    else:
                        no_candidates_action = menu.addAction("No candidates available")
                        no_candidates_action.setEnabled(False)
            except (ValueError, IndexError):
                pass
        
        if menu.actions():
            menu.exec(self.table.viewport().mapToGlobal(position))
    
    def _on_row_double_clicked(self, index):
        """Handle double-click on table row to view candidates"""
        row = index.row()
        if row < 0 or row >= self.table.rowCount():
            return
        
        # Get track information from the table
        playlist_index_item = self.table.item(row, 0)  # Assuming first column is playlist_index
        title_item = self.table.item(row, 1)  # Assuming second column is title
        artist_item = self.table.item(row, 2)  # Assuming third column is artist
        
        if not playlist_index_item or not title_item:
            return
        
        playlist_index = int(playlist_index_item.text())
        original_title = title_item.text()
        original_artists = artist_item.text() if artist_item else ""
        
        # Load candidates for this track
        candidates = self._load_candidates_for_track(playlist_index, original_title, original_artists)
        
        if not candidates:
            QMessageBox.information(
                self,
                "No Candidates",
                "No candidates available for this track.\n\n"
                "The candidates CSV file may not exist or this track had no candidates during the search."
            )
            return
        
        # Get current match info if track is matched
        current_match = None
        # Check if there's a beatport_url or beatport_title in the row
        # We need to find which column has the beatport data
        beatport_title_item = None
        beatport_url_item = None
        for col in range(self.table.columnCount()):
            header = self.table.horizontalHeaderItem(col)
            if header:
                header_text = header.text().lower()
                if 'beatport' in header_text and 'title' in header_text:
                    beatport_title_item = self.table.item(row, col)
                elif 'beatport' in header_text and 'url' in header_text:
                    beatport_url_item = self.table.item(row, col)
        
        if beatport_title_item and beatport_title_item.text().strip():
            # Find the matched candidate
            beatport_title = beatport_title_item.text().strip()
            for candidate in candidates:
                if candidate.get('candidate_title', '').strip() == beatport_title:
                    current_match = candidate
                    break
        
        # Show candidate dialog
        dialog = CandidateDialog(
            track_title=original_title,
            track_artist=original_artists,
            candidates=candidates,
            current_match=current_match,
            parent=self
        )
        
        # Connect candidate selection to update handler
        dialog.candidate_selected.connect(
            lambda candidate: self._on_candidate_selected(row, playlist_index, original_title, original_artists, candidate)
        )
        
        dialog.exec()
    
    def _get_output_dirs(self):
        """Get list of output directory paths (only SRC/output folder)"""
        # Determine SRC directory
        current_file = os.path.abspath(__file__)  # SRC/gui/history_view.py
        src_dir = os.path.dirname(os.path.dirname(current_file))  # SRC/
        
        output_dirs = []
        # Only use SRC output folder
        src_output = os.path.join(src_dir, "output")
        if os.path.exists(src_output):
            output_dirs.append(src_output)
        
        return output_dirs
    
    def refresh_recent_files(self):
        """Refresh list of recent CSV files from output directories"""
        self.recent_list.clear()
        
        output_dirs = self._get_output_dirs()
        if not output_dirs:
            return
        
        # Find all CSV files from all output directories
        csv_files = []
        for output_dir in output_dirs:
            if not os.path.exists(output_dir):
                continue
            
            # Use glob to find files, which may bypass some caching issues
            import glob
            pattern = os.path.join(output_dir, "*.csv")
            all_csv_files = glob.glob(pattern)
            
            # Also try os.listdir as fallback
            try:
                dir_files = os.listdir(output_dir)
            except Exception as e:
                dir_files = []
            
            # Combine both methods and use set to deduplicate
            found_files = set()
            for file_path in all_csv_files:
                filename = os.path.basename(file_path)
                if not filename.endswith('_candidates.csv') and not filename.endswith('_queries.csv') and not filename.endswith('_review.csv'):
                    found_files.add(file_path)
            
            # Also check files from os.listdir
            for filename in dir_files:
                if filename.endswith('.csv'):
                    if not filename.endswith('_candidates.csv') and not filename.endswith('_queries.csv') and not filename.endswith('_review.csv'):
                        file_path = os.path.join(output_dir, filename)
                        found_files.add(file_path)
            
            # Add to csv_files list with modification time
            for file_path in found_files:
                if os.path.exists(file_path):
                    try:
                        mtime = os.path.getmtime(file_path)
                        csv_files.append((file_path, mtime))
                    except Exception:
                        pass
        
        # Sort by modification time (newest first)
        csv_files.sort(key=lambda x: x[1], reverse=True)
        
        # Add to list (show last 20)
        for file_path, mtime in csv_files[:20]:
            item = QListWidgetItem(os.path.basename(file_path))
            item.setData(Qt.UserRole, file_path)
            # Add timestamp tooltip with folder info
            dt = datetime.fromtimestamp(mtime)
            folder_name = os.path.basename(os.path.dirname(file_path))
            item.setToolTip(f"{file_path}\nFolder: {folder_name}\nModified: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
            self.recent_list.addItem(item)
    
    def _add_to_recent_files(self, file_path: str):
        """Add file to recent files (for quick access)"""
        # This could use QSettings to persist across sessions
        # For now, just refresh the list
        self.refresh_recent_files()
        
        # Highlight the selected file in the list
        for i in range(self.recent_list.count()):
            item = self.recent_list.item(i)
            if item.data(Qt.UserRole) == file_path:
                self.recent_list.setCurrentItem(item)
                self.recent_list.scrollToItem(item)
                break

