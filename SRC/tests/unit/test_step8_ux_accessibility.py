#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Step 8: UX and Accessibility Integration Tests

Tests for Design 08-ux-and-accessibility.md:
- Centralized strings (EmptyState, ExportCopy, etc.)
- Autosave of last-used output path
- Contrast validation (WCAG AA)
- Preview outputs before writing
- Rekordbox undo guidance in run summary
"""

import os
import tempfile

import pytest

from cuepoint.models.result import TrackResult
from cuepoint.services.output_writer import preview_csv_output_paths, write_csv_files
from cuepoint.ui.strings import (
    ButtonCopy,
    EmptyState,
    ErrorCopy,
    ExportCopy,
    SuccessCopy,
    TooltipCopy,
)
from cuepoint.ui.widgets.theme_tokens import ColorTokens
from cuepoint.utils.accessibility import (
    ContrastValidator,
    check_contrast,
    get_contrast_ratio,
    hex_to_rgb,
)
from cuepoint.utils.utils import get_output_directory


class TestStep8Strings:
    """Test centralized UX strings (Design 8.38, 8.65-8.68)."""

    def test_empty_state_strings(self):
        """Empty state copy is externalized."""
        assert "XML" in EmptyState.NO_XML_TITLE or "Rekordbox" in EmptyState.NO_XML_TITLE
        assert "playlist" in EmptyState.NO_PLAYLIST_TITLE.lower()
        assert EmptyState.NO_XML_ACTION == "Browse" or "Browse" in EmptyState.NO_XML_ACTION
        assert "Browse" in EmptyState.BROWSE_FOR_XML or "XML" in EmptyState.BROWSE_FOR_XML

    def test_error_copy_actionable(self):
        """Error messages are actionable (Design 8.21)."""
        assert "re-export" in ErrorCopy.XML_UNREADABLE.lower() or "Rekordbox" in ErrorCopy.XML_UNREADABLE
        assert "permissions" in ErrorCopy.OUTPUT_UNWRITABLE.lower() or "folder" in ErrorCopy.OUTPUT_UNWRITABLE.lower()

    def test_success_copy_next_steps(self):
        """Success copy includes what to do next (Design 8.74-8.75)."""
        assert "Review" in SuccessCopy.STEP_REVIEW or "review" in SuccessCopy.STEP_REVIEW.lower()
        assert "Export" in SuccessCopy.STEP_EXPORT or "export" in SuccessCopy.STEP_EXPORT.lower()
        assert "Rekordbox" in SuccessCopy.STEP_REKORDBOX or "Import" in SuccessCopy.STEP_REKORDBOX
        assert "undo" in SuccessCopy.STEP_UNDO_GUIDANCE.lower() or "backup" in SuccessCopy.STEP_UNDO_GUIDANCE.lower()

    def test_export_preview_strings(self):
        """Export preview strings (Design 8.9)."""
        assert "Preview" in ExportCopy.PREVIEW_TITLE or "preview" in ExportCopy.PREVIEW_TITLE.lower()
        assert "files" in ExportCopy.PREVIEW_MESSAGE.lower() or "created" in ExportCopy.PREVIEW_MESSAGE.lower()

    def test_button_copy(self):
        """Button labels (Design 8.199)."""
        assert ButtonCopy.START == "Start"
        assert "Browse" in ButtonCopy.BROWSE
        assert "Export" in ButtonCopy.EXPORT


class TestStep8OutputDirectory:
    """Test autosave of last-used output path (Design 8.7)."""

    def test_get_output_directory_default(self):
        """Default returns valid directory."""
        out = get_output_directory()
        assert os.path.isdir(out)
        assert os.path.isabs(out)

    def test_get_output_directory_preferred_valid(self):
        """Preferred dir used when valid."""
        with tempfile.TemporaryDirectory() as tmp:
            out = get_output_directory(tmp)
            assert out == os.path.abspath(tmp)

    def test_get_output_directory_preferred_invalid(self):
        """Falls back to default when preferred invalid."""
        out = get_output_directory("/nonexistent/path/12345")
        assert os.path.isdir(out)
        assert "CuePoint" in out or "cuepoint" in out.lower() or "Documents" in out

    def test_get_output_directory_preferred_restricted_falls_back(self):
        """Falls back to default when preferred dir is inside app install (P024)."""
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as tmp:
            with patch(
                "cuepoint.utils.paths.StorageInvariants"
            ) as mock_inv:
                mock_inv.is_restricted_location.return_value = True
                out = get_output_directory(tmp)
            # Should return default, not the restricted path
            assert out != os.path.abspath(tmp)
            assert os.path.isdir(out)
            assert "CuePoint" in out or "cuepoint" in out.lower()


class TestStep8Contrast:
    """Test contrast validation (Design 8.17-8.18, WCAG AA)."""

    def test_hex_to_rgb(self):
        """Hex to RGB conversion."""
        assert hex_to_rgb("#ffffff") == (255, 255, 255)
        assert hex_to_rgb("#000000") == (0, 0, 0)
        assert hex_to_rgb("FF0000") == (255, 0, 0)

    def test_contrast_ratio_black_white(self):
        """Black on white has high contrast."""
        ratio = get_contrast_ratio("#000000", "#ffffff")
        assert ratio >= 20.0

    def test_contrast_ratio_same_color(self):
        """Same color has ratio 1."""
        assert get_contrast_ratio("#888888", "#888888") == 1.0

    def test_check_contrast_aa_pass(self):
        """Black on white passes AA."""
        meets, ratio = check_contrast("#000000", "#ffffff", "AA", "normal")
        assert meets is True
        assert ratio >= 4.5

    def test_check_contrast_aa_fail(self):
        """Low contrast fails AA."""
        meets, ratio = check_contrast("#888888", "#999999", "AA", "normal")
        assert meets is False
        assert ratio < 4.5

    def test_contrast_validator_theme_tokens(self):
        """ContrastValidator works with ColorTokens."""
        colors = ColorTokens.for_platform("win32")
        validator = ContrastValidator(colors)
        violations = validator.validate_all()
        # Our theme should pass - white text on dark background
        assert isinstance(violations, list)
        # text_primary #ffffff on background #1e1e1e should pass
        meets, _ = check_contrast(colors.text_primary, colors.background, "AA", "normal")
        assert meets is True


class TestStep8PreviewOutputs:
    """Test preview outputs before writing (Design 8.9)."""

    def test_preview_csv_output_paths_structure(self):
        """Preview returns same structure as write_csv_files."""
        with tempfile.TemporaryDirectory() as tmp:
            paths = preview_csv_output_paths("test.csv", tmp, ",", results=[])
            assert "main" in paths
            assert "candidates" in paths
            assert "queries" in paths
            assert paths["main"].endswith(".csv")
            assert tmp in paths["main"]

    def test_preview_csv_output_paths_with_review(self):
        """Preview includes review path when low-confidence tracks exist."""
        with tempfile.TemporaryDirectory() as tmp:
            # match_score < 70 triggers review per _get_review_indices
            results = [
                TrackResult(
                    playlist_index=1,
                    title="Test",
                    artist="Artist",
                    matched=True,
                    beatport_title="Test",
                    beatport_artists="Artist",
                    match_score=50.0,  # < 70 triggers review
                    artist_sim=40.0,
                    beatport_bpm="120",
                    beatport_key_camelot="8A",
                    candidates=[],
                )
            ]
            paths = preview_csv_output_paths("test.csv", tmp, ",", results=results)
            assert "review" in paths
            assert "review" in paths["review"]

    def test_preview_matches_write_structure(self):
        """Preview returns expected keys; write produces files in same dir."""
        with tempfile.TemporaryDirectory() as tmp:
            results = [
                TrackResult(
                    playlist_index=1,
                    title="A",
                    artist="B",
                    matched=True,
                    beatport_title="A",
                    beatport_artists="B",
                    confidence="high",
                    beatport_bpm="120",
                    beatport_key_camelot="8A",
                    candidates=[],
                )
            ]
            preview = preview_csv_output_paths("playlist.csv", tmp, ",", results=results)
            written = write_csv_files(results, "playlist.csv", tmp)
            assert "main" in preview and "main" in written
            assert tmp in preview["main"]
            assert os.path.exists(written["main"])


class TestStep8ThemeTokens:
    """Test theme tokens (Design 8.8)."""

    def test_color_tokens_platform(self):
        """ColorTokens has platform-specific values."""
        mac = ColorTokens.for_platform("darwin")
        win = ColorTokens.for_platform("win32")
        assert mac.primary != "" and win.primary != ""
        assert mac.text_primary == "#ffffff"
        assert win.text_primary == "#ffffff"


class TestStep8DisplayScaling:
    """Test display scaling (Design 8.1)."""

    def test_main_window_has_minimum_size(self):
        """Main window has minimum size for layout resilience."""
        from PySide6.QtWidgets import QApplication

        from cuepoint.ui.main_window import MainWindow
        from cuepoint.ui.widgets.styles import Layout

        app = QApplication.instance() or QApplication([])
        try:
            window = MainWindow()
            min_w = window.minimumWidth()
            min_h = window.minimumHeight()
            assert min_w >= Layout.WINDOW_MIN_WIDTH
            assert min_h >= Layout.WINDOW_MIN_HEIGHT
        finally:
            try:
                window.close()
            except Exception:
                pass

    def test_error_copy_file_not_found(self):
        """ErrorCopy.FILE_NOT_FOUND exists for consistent errors."""
        assert "file" in ErrorCopy.FILE_NOT_FOUND.lower() or "XML" in ErrorCopy.FILE_NOT_FOUND
        assert "file" in ErrorCopy.FILE_NOT_FOUND.lower() or "XML" in ErrorCopy.FILE_NOT_FOUND
