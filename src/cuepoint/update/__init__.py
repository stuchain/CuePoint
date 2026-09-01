#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CuePoint update/appcast utilities.

The Qt-based auto-update UI (update manager, dialogs, downloader, installer and
platform launchers) was removed when the desktop app moved to Electron: it was
never wired into the Electron shell and could not run, since PySide6 is not part
of the default requirements. CuePoint currently ships without in-app updates.

What remains here is the Qt-free appcast and versioning logic that release
tooling still uses:

- appcast parsing and update detection (:mod:`cuepoint.update.update_checker`)
- version parsing/comparison (:mod:`cuepoint.update.version_utils`)
- HTTPS feed and SHA-256 package verification (:mod:`cuepoint.update.security`,
  :mod:`cuepoint.update.signature_verifier`)
- update preference storage (:mod:`cuepoint.update.update_preferences`)

Consumers include ``scripts/inspect_appcast.py``, ``scripts/test_pre_release.py``
and :class:`cuepoint.services.security_service.SecurityService`.
"""

from cuepoint.update.signature_verifier import SignatureVerifier, VerificationResult
from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.update_preferences import UpdatePreferences
from cuepoint.update.version_utils import (
    compare_versions,
    extract_base_version,
    parse_version,
)

__all__ = [
    "UpdateChecker",
    "UpdatePreferences",
    "SignatureVerifier",
    "VerificationResult",
    "compare_versions",
    "extract_base_version",
    "parse_version",
]
