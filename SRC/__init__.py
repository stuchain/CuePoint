#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CuePoint - Rekordbox → Beatport Metadata Enricher

A structured Python package for enriching Rekordbox playlists with Beatport metadata.
"""

# Import version from cuepoint.version (single source of truth)
try:
    from cuepoint.version import __version__
except ImportError:
    # Fallback if version module not available (shouldn't happen in normal usage)
    __version__ = "1.0.0"

# Import SETTINGS from the correct location
# Use try/except to handle cases where cuepoint package might not be available (e.g., during tests)
try:
    from cuepoint.models.config import SETTINGS
    __all__ = ["SETTINGS"]
except ImportError:
    # If import fails (e.g., during test setup), set SETTINGS to None
    # This allows tests to run without breaking
    SETTINGS = None
    __all__ = []

