#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CuePoint Auto-Update System

This module provides auto-update functionality for CuePoint using:
- Sparkle framework for macOS
- WinSparkle framework for Windows

The update system supports:
- Automatic update checking
- Manual update checking
- Update notifications
- Secure update downloads
- Version comparison
- Update preferences management
"""

from cuepoint.update.signature_verifier import SignatureVerifier, VerificationResult
from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.update_downloader import UpdateDownloader
from cuepoint.update.update_installer import UpdateInstaller
from cuepoint.update.update_manager import UpdateManager
from cuepoint.update.update_preferences import UpdatePreferences
from cuepoint.update.version_utils import compare_versions, parse_version

__all__ = [
    'UpdateManager',
    'UpdateChecker',
    'UpdateDownloader',
    'UpdateInstaller',
    'UpdatePreferences',
    'SignatureVerifier',
    'VerificationResult',
    'compare_versions',
    'parse_version',
]
