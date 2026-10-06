"""Where the CLI writes its output when none is given (``get_output_directory``).

Moved from ``test_step8_ux_accessibility.py`` when that Qt test file went
(PRUNE-02): these checks are of live code the CLI uses, and were never Qt's.
"""

from __future__ import annotations

import os
import tempfile
from unittest.mock import patch

import pytest

from cuepoint.utils.utils import get_output_directory

pytestmark = pytest.mark.unit


def test_the_default_is_an_existing_absolute_directory():
    out = get_output_directory()
    assert os.path.isdir(out)
    assert os.path.isabs(out)


def test_a_valid_preferred_directory_is_used():
    with tempfile.TemporaryDirectory() as tmp:
        assert get_output_directory(tmp) == os.path.abspath(tmp)


def test_an_invalid_preferred_directory_falls_back_to_the_default():
    out = get_output_directory("/nonexistent/path/12345")
    assert os.path.isdir(out)
    assert "CuePoint" in out or "cuepoint" in out.lower() or "Documents" in out


def test_a_restricted_preferred_directory_falls_back_to_the_default():
    """A directory inside the app's install is never written to (P024)."""
    with tempfile.TemporaryDirectory() as tmp:
        with patch("cuepoint.utils.paths.StorageInvariants") as invariants:
            invariants.is_restricted_location.return_value = True
            out = get_output_directory(tmp)
        assert out != os.path.abspath(tmp)
        assert os.path.isdir(out)
        assert "CuePoint" in out or "cuepoint" in out.lower()
