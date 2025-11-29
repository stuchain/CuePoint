#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Export Controller - Business logic for export operations

This controller handles export logic, separating business logic from UI presentation.
"""

import os
from typing import Any, Dict, List, Optional

from cuepoint.models.result import TrackResult


class ExportController:
    """Controller for export operations - handles export logic."""

    def __init__(self):
        """Initialize export controller."""
        pass

    def validate_export_options(self, options: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validate export options.

        Args:
            options: Dictionary of export options

        Returns:
            Tuple of (is_valid, error_message)
        """
        file_path = options.get("file_path")
        if not file_path:
            return False, "Please select an output file location."

        # Check if directory exists and is writable
        output_dir = os.path.dirname(file_path)
        if output_dir and not os.path.exists(output_dir):
            try:
                os.makedirs(output_dir, exist_ok=True)
            except OSError as e:
                return False, f"Cannot create output directory: {output_dir}\n{str(e)}"

        # Validate format
        format_type = options.get("format", "csv")
        if format_type not in ["csv", "json", "excel"]:
            return False, f"Unsupported export format: {format_type}"

        # Validate delimiter for CSV
        if format_type == "csv":
            delimiter = options.get("delimiter", ",")
            if delimiter not in [",", ";", "\t", "|"]:
                return False, f"Invalid delimiter: {delimiter}. Must be one of: , ; \\t |"

        return True, None

    def prepare_results_for_export(
        self,
        all_results: List[TrackResult],
        filtered_results: List[TrackResult],
        export_filtered: bool,
    ) -> List[TrackResult]:
        """
        Prepare results for export based on filter option.

        Args:
            all_results: All results (unfiltered)
            filtered_results: Filtered results
            export_filtered: If True, export filtered results; if False, export all

        Returns:
            List of TrackResult objects to export
        """
        if export_filtered:
            return filtered_results
        else:
            return all_results

    def get_export_file_extension(self, format_type: str, options: Dict[str, Any]) -> str:
        """
        Get file extension for export format.

        Args:
            format_type: Export format ('csv', 'json', 'excel')
            options: Export options (may contain delimiter, compress, etc.)

        Returns:
            File extension (e.g., '.csv', '.json', '.xlsx')
        """
        if format_type == "json":
            if options.get("compress", False):
                return ".json.gz"
            return ".json"
        elif format_type == "excel":
            return ".xlsx"
        else:  # CSV
            delimiter = options.get("delimiter", ",")
            if delimiter == "\t":
                return ".tsv"
            elif delimiter == "|":
                return ".psv"
            else:
                return ".csv"

    def sanitize_filename(self, filename: str) -> str:
        """
        Sanitize filename by removing invalid characters.

        Args:
            filename: Original filename

        Returns:
            Sanitized filename safe for filesystem
        """
        # Remove invalid characters for Windows/Linux/Mac
        invalid_chars = '<>:"/\\|?*'
        sanitized = "".join(c for c in filename if c not in invalid_chars)
        # Remove leading/trailing spaces and dots
        sanitized = sanitized.strip(" .")
        # Ensure not empty
        if not sanitized:
            sanitized = "export"
        return sanitized

    def prepare_export_data(
        self, results: List[TrackResult], options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Prepare export data structure based on options.

        Args:
            results: List of TrackResult objects to export
            options: Export options

        Returns:
            Dictionary with prepared export data
        """
        export_data = {
            "results": results,
            "format": options.get("format", "csv"),
            "file_path": options.get("file_path"),
            "playlist_name": options.get("playlist_name", "playlist"),
            "include_metadata": options.get("include_metadata", True),
            "include_candidates": options.get("include_candidates", False),
            "include_queries": options.get("include_queries", False),
            "include_processing_info": options.get("include_processing_info", False),
            "compress": options.get("compress", False),
            "delimiter": options.get("delimiter", ","),
            "settings": options.get("settings"),
        }

        return export_data

    def get_default_output_directory(self) -> str:
        """
        Get default output directory.

        Returns:
            Path to default output directory
        """
        # Try to find SRC directory
        current_file = os.path.abspath(__file__)
        # Navigate from controllers/export_controller.py to SRC/
        src_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_file))))
        output_dir = os.path.join(src_dir, "output")
        return os.path.abspath(output_dir)

    def generate_default_filename(
        self, playlist_name: str, format_type: str, options: Dict[str, Any]
    ) -> str:
        """
        Generate default filename for export.

        Args:
            playlist_name: Name of playlist
            format_type: Export format
            options: Export options

        Returns:
            Default filename (without path)
        """
        # Sanitize playlist name
        safe_name = self.sanitize_filename(playlist_name)
        if not safe_name:
            safe_name = "playlist"

        # Get extension
        extension = self.get_export_file_extension(format_type, options)

        # Generate filename
        base_filename = f"{safe_name}{extension}"

        return base_filename
