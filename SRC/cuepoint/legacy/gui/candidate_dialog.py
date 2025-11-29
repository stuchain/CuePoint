#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Candidate Comparison Dialog Module

This module contains the CandidateDialog class for viewing and selecting
alternative candidates for a track match.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QTableWidget, QTableWidgetItem, QHeaderView
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QBrush, QColor
from typing import List, Dict, Any, Optional


class CandidateDialog(QDialog):
    """Dialog for comparing and selecting multiple candidates"""
    
    candidate_selected = Signal(dict)  # Emit selected candidate
    
    def __init__(self, track_title: str, track_artist: str, candidates: List[Dict[str, Any]], 
                 current_match: Optional[Dict[str, Any]] = None, parent=None):
        """
        Initialize candidate dialog.
        
        Args:
            track_title: Original track title
            track_artist: Original track artist
            candidates: List of candidate dictionaries
            current_match: Currently selected match (if any)
            parent: Parent widget
        """
        super().__init__(parent)
        self.track_title = track_title
        self.track_artist = track_artist
        self.candidates = candidates
        self.current_match = current_match
        self.selected_candidate = None
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI components"""
        self.setWindowTitle(f"Candidates for: {self.track_title} - {self.track_artist}")
        self.setMinimumSize(1000, 600)
        
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        
        # Header info
        header_label = QLabel(
            f"<b>Track:</b> {self.track_title} - {self.track_artist}<br>"
            f"<b>Found {len(self.candidates)} candidate(s)</b>"
        )
        header_label.setWordWrap(True)
        layout.addWidget(header_label)
        
        # Candidates table
        self.table = QTableWidget()
        self.table.setColumnCount(11)
        self.table.setHorizontalHeaderLabels([
            "Rank", "Title", "Artists", "Score", "Title Sim", 
            "Artist Sim", "Key", "BPM", "Year", "Label", "URL"
        ])
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setSelectionMode(QTableWidget.SingleSelection)
        self.table.setAlternatingRowColors(True)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.doubleClicked.connect(self._on_row_double_clicked)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
        
        # Populate table
        self._populate_table()
        
        layout.addWidget(self.table, 1)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.select_btn = QPushButton("Select Candidate")
        self.select_btn.clicked.connect(self._select_candidate)
        self.select_btn.setEnabled(False)
        button_layout.addWidget(self.select_btn)
        
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        layout.addLayout(button_layout)
        
        # Enable select button when row is selected
        self.table.itemSelectionChanged.connect(self._on_selection_changed)
    
    def _populate_table(self):
        """Populate table with candidates"""
        # Sort candidates by final_score (descending)
        sorted_candidates = sorted(
            self.candidates,
            key=lambda c: float(c.get('final_score', c.get('match_score', 0))),
            reverse=True
        )
        
        self.table.setRowCount(len(sorted_candidates))
        
        for row_idx, candidate in enumerate(sorted_candidates):
            rank = row_idx + 1
            
            # Rank
            rank_item = QTableWidgetItem(str(rank))
            rank_item.setTextAlignment(Qt.AlignCenter)
            self.table.setItem(row_idx, 0, rank_item)
            
            # Title
            title = candidate.get('candidate_title', candidate.get('beatport_title', ''))
            self.table.setItem(row_idx, 1, QTableWidgetItem(title))
            
            # Artists
            artists = candidate.get('candidate_artists', candidate.get('beatport_artists', ''))
            self.table.setItem(row_idx, 2, QTableWidgetItem(artists))
            
            # Score
            score = candidate.get('final_score', candidate.get('match_score', '0'))
            score_item = QTableWidgetItem(str(score))
            score_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.table.setItem(row_idx, 3, score_item)
            
            # Title similarity
            title_sim = candidate.get('title_sim', '0')
            title_sim_item = QTableWidgetItem(str(title_sim))
            title_sim_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.table.setItem(row_idx, 4, title_sim_item)
            
            # Artist similarity
            artist_sim = candidate.get('artist_sim', '0')
            artist_sim_item = QTableWidgetItem(str(artist_sim))
            artist_sim_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.table.setItem(row_idx, 5, artist_sim_item)
            
            # Key
            key = candidate.get('candidate_key_camelot', candidate.get('candidate_key', candidate.get('beatport_key', '')))
            self.table.setItem(row_idx, 6, QTableWidgetItem(key))
            
            # BPM
            bpm = candidate.get('candidate_bpm', candidate.get('beatport_bpm', ''))
            self.table.setItem(row_idx, 7, QTableWidgetItem(bpm))
            
            # Year
            year = candidate.get('candidate_year', candidate.get('beatport_year', ''))
            self.table.setItem(row_idx, 8, QTableWidgetItem(year))
            
            # Label
            label = candidate.get('candidate_label', candidate.get('beatport_label', ''))
            self.table.setItem(row_idx, 9, QTableWidgetItem(label))
            
            # URL
            url = candidate.get('candidate_url', candidate.get('beatport_url', ''))
            url_item = QTableWidgetItem(url)
            url_item.setToolTip(url)
            self.table.setItem(row_idx, 10, url_item)
            
            # Highlight if this is the current match
            if self.current_match:
                current_url = self.current_match.get('beatport_url', self.current_match.get('candidate_url', ''))
                if url == current_url:
                    # Highlight the row
                    for col in range(11):
                        item = self.table.item(row_idx, col)
                        if item:
                            item.setBackground(QBrush(QColor(200, 255, 200)))  # Light green
                            item.setForeground(QBrush(QColor(0, 100, 0)))  # Dark green text
        
        # Resize columns to content
        self.table.resizeColumnsToContents()
    
    def _on_selection_changed(self):
        """Handle selection change"""
        has_selection = self.table.currentRow() >= 0
        self.select_btn.setEnabled(has_selection)
    
    def _on_row_double_clicked(self, index):
        """Handle double-click on row"""
        self._select_candidate()
    
    def _select_candidate(self):
        """Select current candidate"""
        row = self.table.currentRow()
        if row >= 0:
            # Get the candidate from sorted list
            sorted_candidates = sorted(
                self.candidates,
                key=lambda c: float(c.get('final_score', c.get('match_score', 0))),
                reverse=True
            )
            self.selected_candidate = sorted_candidates[row]
            self.candidate_selected.emit(self.selected_candidate)
            self.accept()
    
    def get_selected_candidate(self) -> Optional[Dict[str, Any]]:
        """Get the selected candidate"""
        return self.selected_candidate

