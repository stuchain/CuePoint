#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Input Validation Utilities

Provides validation functions for user inputs.
Implements reliability requirements from Step 1.11.
"""

import logging
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# Step 8.2 secure defaults: basic XML hardening limits
_MAX_XML_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100MB (kept consistent with existing behavior)
_MAX_XML_DEPTH = 100
_MAX_XML_ELEMENTS = 1_000_000


def _xml_max_depth(elem: ET.Element, current: int = 0) -> int:
    """Compute maximum depth of an ElementTree (defensive for DoS)."""
    if len(elem) == 0:
        return current
    max_depth = current
    for child in elem:
        max_depth = max(max_depth, _xml_max_depth(child, current + 1))
    return max_depth


def _contains_unsafe_doctype(file_path: Path) -> bool:
    """Detect unsafe DTD/ENTITY constructs before parsing.

    We intentionally do a small prefix scan to avoid reading huge files.
    """
    try:
        with open(file_path, "rb") as f:
            prefix = f.read(16 * 1024)  # 16KB should cover XML prolog/doctype
        upper = prefix.upper()
        return b"<!DOCTYPE" in upper or b"<!ENTITY" in upper
    except Exception:
        # If we can't read it, let normal validation path handle the error.
        return False


def validate_xml_file(file_path: Path) -> Tuple[bool, Optional[str]]:
    """Validate XML file exists and is parseable.

    Args:
        file_path: Path to XML file to validate.

    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message is None.
    """
    # Check file exists
    if not file_path.exists():
        return False, "File does not exist"

    # Check file is readable
    if not os.access(file_path, os.R_OK):
        return False, "File is not readable"

    # Check file extension
    if not file_path.suffix.lower() == ".xml":
        return False, "File must be an XML file"

    # Check file size (not empty, not too large)
    try:
        file_size = file_path.stat().st_size
        if file_size == 0:
            return False, "File is empty"
        if file_size > _MAX_XML_FILE_SIZE_BYTES:
            return False, f"File is too large (max {_MAX_XML_FILE_SIZE_BYTES // (1024 * 1024)}MB)"
    except OSError as e:
        return False, f"Error checking file size: {e}"

    # Reject potentially dangerous DTD/ENTITY usage (defense-in-depth)
    if _contains_unsafe_doctype(file_path):
        return False, "XML contains DOCTYPE/ENTITY declarations (not allowed)"

    # Try to parse XML
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()

        # Resource limits (DoS protection)
        try:
            element_count = sum(1 for _ in root.iter())
            if element_count > _MAX_XML_ELEMENTS:
                return False, f"XML has too many elements ({element_count} > {_MAX_XML_ELEMENTS})"
        except Exception:
            # If counting fails, continue—parsing succeeded and other checks apply.
            pass

        try:
            depth = _xml_max_depth(root, 0)
            if depth > _MAX_XML_DEPTH:
                return False, f"XML is too deeply nested ({depth} > {_MAX_XML_DEPTH})"
        except Exception:
            pass

        # Check for Rekordbox XML structure
        if root.tag != "DJ_PLAYLISTS":
            return False, "Not a valid Rekordbox collection XML file"

        # Check for required elements
        if root.find("COLLECTION") is None:
            return False, "XML file missing COLLECTION element"

        return True, None
    except ET.ParseError as e:
        return False, f"Invalid XML format: {str(e)}"
    except Exception as e:
        return False, f"Error reading XML file: {str(e)}"


def validate_playlist_selection(
    playlist_name: str, available_playlists: List[str]
) -> Tuple[bool, Optional[str]]:
    """Validate playlist selection.

    Args:
        playlist_name: Name of selected playlist.
        available_playlists: List of available playlist names.

    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message is None.
    """
    if not playlist_name:
        return False, "Please select a playlist"

    if not isinstance(playlist_name, str):
        return False, "Playlist name must be a string"

    if len(playlist_name.strip()) == 0:
        return False, "Playlist name cannot be empty"

    if playlist_name not in available_playlists:
        return False, f"Selected playlist '{playlist_name}' not found in XML file"

    return True, None


def validate_export_path(file_path: Path, overwrite: bool = False) -> Tuple[bool, Optional[str]]:
    """Validate export file path.

    Args:
        file_path: Path to export file.
        overwrite: Whether overwrite is allowed.

    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message is None.
    """
    # Check parent directory exists
    if not file_path.parent.exists():
        return False, f"Output directory does not exist: {file_path.parent}"

    # Check parent directory is writable
    if not os.access(file_path.parent, os.W_OK):
        return False, f"Output directory is not writable: {file_path.parent}"

    # Check file doesn't exist (unless overwrite allowed)
    if file_path.exists() and not overwrite:
        return False, f"File already exists: {file_path}. Use overwrite option to replace."

    # Check disk space (rough estimate)
    try:
        import shutil

        free_space = shutil.disk_usage(file_path.parent).free
        if free_space < 10 * 1024 * 1024:  # 10MB minimum
            return False, f"Insufficient disk space in {file_path.parent}"
    except Exception:
        pass  # Skip if can't check

    return True, None
