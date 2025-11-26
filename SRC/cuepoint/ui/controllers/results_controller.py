#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Results Controller - Business logic for results view

This controller handles filtering, sorting, and search logic for results display.
Separates business logic from UI presentation.
"""

from typing import List, Optional, Dict, Any
from cuepoint.ui.gui_interface import TrackResult


class ResultsController:
    """Controller for results view - handles filtering, sorting, and search."""
    
    def __init__(self):
        """Initialize results controller."""
        self.all_results: List[TrackResult] = []
        self.filtered_results: List[TrackResult] = []
        self.current_filters: Dict[str, Any] = {}
    
    def set_results(self, results: List[TrackResult]) -> None:
        """
        Set the results to display.
        
        Args:
            results: List of TrackResult objects
        """
        self.all_results = results
        self.filtered_results = results.copy()
        self.current_filters = {}
    
    def apply_filters(
        self,
        search_text: Optional[str] = None,
        confidence: Optional[str] = None,
        year_min: Optional[int] = None,
        year_max: Optional[int] = None,
        bpm_min: Optional[int] = None,
        bpm_max: Optional[int] = None,
        key: Optional[str] = None
    ) -> List[TrackResult]:
        """
        Apply filters to results.
        
        Args:
            search_text: Text to search in title, artist, or Beatport data
            confidence: Confidence level filter ("high", "medium", "low", or None for all)
            year_min: Minimum year (None for no minimum)
            year_max: Maximum year (None for no maximum)
            bpm_min: Minimum BPM (None for no minimum)
            bpm_max: Maximum BPM (None for no maximum)
            key: Musical key filter (None for all)
        
        Returns:
            Filtered list of TrackResult objects
        """
        # Store current filters
        self.current_filters = {
            "search_text": search_text,
            "confidence": confidence,
            "year_min": year_min,
            "year_max": year_max,
            "bpm_min": bpm_min,
            "bpm_max": bpm_max,
            "key": key
        }
        
        # Start with all results
        filtered = self.all_results.copy()
        
        # Apply search filter
        if search_text:
            search_lower = search_text.lower().strip()
            filtered = [
                r for r in filtered
                if (search_lower in r.title.lower() or
                    search_lower in (r.artist or "").lower() or
                    search_lower in (r.beatport_title or "").lower() or
                    search_lower in (r.beatport_artists or "").lower())
            ]
        
        # Apply confidence filter
        if confidence and confidence != "All":
            filtered = [
                r for r in filtered
                if r.matched and (r.confidence or "").lower() == confidence.lower()
            ]
        
        # Apply year filter
        if year_min is not None or year_max is not None:
            filtered = [
                r for r in filtered
                if self._year_in_range(r, year_min, year_max)
            ]
        
        # Apply BPM filter
        if bpm_min is not None or bpm_max is not None:
            filtered = [
                r for r in filtered
                if self._bpm_in_range(r, bpm_min, bpm_max)
            ]
        
        # Apply key filter
        if key and key != "All":
            filtered = [
                r for r in filtered
                if r.matched and r.beatport_key and r.beatport_key == key
            ]
        
        self.filtered_results = filtered
        return self.filtered_results
    
    def _year_in_range(
        self,
        result: TrackResult,
        year_min: Optional[int],
        year_max: Optional[int]
    ) -> bool:
        """
        Check if result's year is in range.
        
        Args:
            result: TrackResult object
            year_min: Minimum year (None for no minimum)
            year_max: Maximum year (None for no maximum)
        
        Returns:
            True if year is in range or no year data
        """
        if not result.matched or not result.beatport_year:
            return False  # Only filter matched tracks with year data
        
        try:
            year = int(result.beatport_year)
            if year_min and year < year_min:
                return False
            if year_max and year > year_max:
                return False
            return True
        except (ValueError, TypeError):
            # Invalid year data, exclude from filtered results
            return False
    
    def _bpm_in_range(
        self,
        result: TrackResult,
        bpm_min: Optional[int],
        bpm_max: Optional[int]
    ) -> bool:
        """
        Check if result's BPM is in range.
        
        Args:
            result: TrackResult object
            bpm_min: Minimum BPM (None for no minimum)
            bpm_max: Maximum BPM (None for no maximum)
        
        Returns:
            True if BPM is in range or no BPM data
        """
        if not result.matched or not result.beatport_bpm:
            return False  # Only filter matched tracks with BPM data
        
        try:
            bpm = float(result.beatport_bpm)
            if bpm_min and bpm < bpm_min:
                return False
            if bpm_max and bpm > bpm_max:
                return False
            return True
        except (ValueError, TypeError):
            # Invalid BPM data, exclude from filtered results
            return False
    
    def clear_filters(self) -> List[TrackResult]:
        """
        Clear all filters.
        
        Returns:
            Unfiltered list of all results
        """
        self.current_filters = {}
        self.filtered_results = self.all_results.copy()
        return self.filtered_results
    
    def sort_results(self, key: str, ascending: bool = True) -> List[TrackResult]:
        """
        Sort results by key.
        
        Args:
            key: Sort key ("title", "artist", "confidence", "year", "bpm", "index")
            ascending: If True, sort ascending; if False, sort descending
        
        Returns:
            Sorted list of filtered results
        """
        reverse = not ascending
        
        if key == "title":
            self.filtered_results.sort(key=lambda r: r.title.lower(), reverse=reverse)
        elif key == "artist":
            self.filtered_results.sort(key=lambda r: (r.artist or "").lower(), reverse=reverse)
        elif key == "confidence":
            # Sort by confidence level (high > medium > low > None)
            confidence_order = {"high": 3, "medium": 2, "low": 1, None: 0}
            self.filtered_results.sort(
                key=lambda r: confidence_order.get(r.confidence, 0),
                reverse=reverse
            )
        elif key == "year":
            self.filtered_results.sort(
                key=lambda r: self._get_year(r),
                reverse=reverse
            )
        elif key == "bpm":
            self.filtered_results.sort(
                key=lambda r: self._get_bpm(r),
                reverse=reverse
            )
        elif key == "index":
            self.filtered_results.sort(
                key=lambda r: r.playlist_index,
                reverse=reverse
            )
        elif key == "score":
            self.filtered_results.sort(
                key=lambda r: r.match_score if r.match_score is not None else 0.0,
                reverse=reverse
            )
        
        return self.filtered_results
    
    def _get_year(self, result: TrackResult) -> int:
        """Get year from result, returning 0 if not available."""
        if result.beatport_year:
            try:
                return int(result.beatport_year)
            except (ValueError, TypeError):
                pass
        return 0
    
    def _get_bpm(self, result: TrackResult) -> float:
        """Get BPM from result, returning 0.0 if not available."""
        if result.beatport_bpm:
            try:
                return float(result.beatport_bpm)
            except (ValueError, TypeError):
                pass
        return 0.0
    
    def get_summary_statistics(self) -> Dict[str, Any]:
        """
        Calculate summary statistics for results.
        
        Returns:
            Dictionary with statistics: total, matched, unmatched, match_rate, 
            avg_score, confidence_breakdown
        """
        if not self.all_results:
            return {
                "total": 0,
                "matched": 0,
                "unmatched": 0,
                "match_rate": 0.0,
                "avg_score": 0.0,
                "confidence_breakdown": {"high": 0, "medium": 0, "low": 0}
            }
        
        total = len(self.all_results)
        matched = sum(1 for r in self.all_results if r.matched)
        unmatched = total - matched
        match_rate = (matched / total * 100) if total > 0 else 0.0
        
        # Calculate average score for matched tracks
        matched_scores = [
            r.match_score for r in self.all_results 
            if r.matched and r.match_score is not None
        ]
        avg_score = sum(matched_scores) / len(matched_scores) if matched_scores else 0.0
        
        # Count by confidence
        high_conf = sum(1 for r in self.all_results if r.matched and r.confidence == "high")
        medium_conf = sum(1 for r in self.all_results if r.matched and r.confidence == "medium")
        low_conf = sum(1 for r in self.all_results if r.matched and r.confidence == "low")
        
        return {
            "total": total,
            "matched": matched,
            "unmatched": unmatched,
            "match_rate": match_rate,
            "avg_score": avg_score,
            "confidence_breakdown": {
                "high": high_conf,
                "medium": medium_conf,
                "low": low_conf
            }
        }
    
    def get_batch_summary_statistics(self, batch_results: Dict[str, List[TrackResult]]) -> Dict[str, Any]:
        """
        Calculate aggregate summary statistics for batch results.
        
        Args:
            batch_results: Dictionary mapping playlist_name -> List[TrackResult]
        
        Returns:
            Dictionary with aggregate statistics
        """
        if not batch_results:
            return {
                "playlist_count": 0,
                "total": 0,
                "matched": 0,
                "unmatched": 0,
                "match_rate": 0.0,
                "avg_score": 0.0,
                "confidence_breakdown": {"high": 0, "medium": 0, "low": 0}
            }
        
        # Aggregate statistics across all playlists
        total = 0
        matched = 0
        matched_scores = []
        high_conf = 0
        medium_conf = 0
        low_conf = 0
        
        for playlist_name, results in batch_results.items():
            if results:
                total += len(results)
                matched += sum(1 for r in results if r.matched)
                matched_scores.extend([
                    r.match_score for r in results 
                    if r.matched and r.match_score is not None
                ])
                high_conf += sum(1 for r in results if r.matched and r.confidence == "high")
                medium_conf += sum(1 for r in results if r.matched and r.confidence == "medium")
                low_conf += sum(1 for r in results if r.matched and r.confidence == "low")
        
        unmatched = total - matched
        match_rate = (matched / total * 100) if total > 0 else 0.0
        avg_score = sum(matched_scores) / len(matched_scores) if matched_scores else 0.0
        
        playlist_count = len([r for r in batch_results.values() if r])
        
        return {
            "playlist_count": playlist_count,
            "total": total,
            "matched": matched,
            "unmatched": unmatched,
            "match_rate": match_rate,
            "avg_score": avg_score,
            "confidence_breakdown": {
                "high": high_conf,
                "medium": medium_conf,
                "low": low_conf
            }
        }

