#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Non-Qt export validation and filename helpers.

Historically located in ``cuepoint.ui.controllers.export_controller`` even
though this logic is UI-independent and reused by the engine HTTP API.
"""

import os
from typing import Any, Dict, List, Optional

from cuepoint.models.result import TrackResult


class ExportController:
    """Controller for export operations."""

    def validate_export_options(
        self, options: Dict[str, Any]
    ) -> tuple[bool, Optional[str]]:
        file_path = options.get("file_path")
        if not file_path:
            return False, "Please select an output file location."

        output_dir = os.path.dirname(file_path)
        if output_dir and not os.path.exists(output_dir):
            try:
                os.makedirs(output_dir, exist_ok=True)
            except OSError as e:
                return False, f"Cannot create output directory: {output_dir}\n{str(e)}"

        format_type = options.get("format", "csv")
        if format_type not in ["csv", "json", "excel"]:
            return False, f"Unsupported export format: {format_type}"

        if format_type == "csv":
            delimiter = options.get("delimiter", ",")
            if delimiter not in [",", ";", "\t", "|"]:
                return (
                    False,
                    f"Invalid delimiter: {delimiter}. Must be one of: , ; \\t |",
                )

        return True, None

    def prepare_results_for_export(
        self,
        all_results: List[TrackResult],
        filtered_results: List[TrackResult],
        export_filtered: bool,
    ) -> List[TrackResult]:
        return filtered_results if export_filtered else all_results

    def get_export_file_extension(
        self, format_type: str, options: Dict[str, Any]
    ) -> str:
        if format_type == "json":
            if options.get("compress", False):
                return ".json.gz"
            return ".json"
        if format_type == "excel":
            return ".xlsx"

        delimiter = options.get("delimiter", ",")
        if delimiter == "\t":
            return ".tsv"
        if delimiter == "|":
            return ".psv"
        return ".csv"

    def sanitize_filename(self, filename: str) -> str:
        invalid_chars = '<>:"/\\|?*'
        sanitized = "".join(c for c in filename if c not in invalid_chars)
        sanitized = sanitized.strip(" .")
        return sanitized or "export"

    def prepare_export_data(
        self, results: List[TrackResult], options: Dict[str, Any]
    ) -> Dict[str, Any]:
        return {
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

    def get_default_output_directory(self) -> str:
        current_file = os.path.abspath(__file__)
        src_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_file)))
        output_dir = os.path.join(src_dir, "output")
        return os.path.abspath(output_dir)

    def generate_default_filename(
        self, playlist_name: str, format_type: str, options: Dict[str, Any]
    ) -> str:
        safe_name = self.sanitize_filename(playlist_name) or "playlist"
        extension = self.get_export_file_extension(format_type, options)
        return f"{safe_name}{extension}"
