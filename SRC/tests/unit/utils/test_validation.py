"""Unit tests for validation utility."""

import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.utils.validation import (
    validate_export_path,
    validate_playlist_selection,
    validate_xml_file,
)


class TestValidateXMLFile:
    """Test XML file validation."""

    def test_valid_xml_file(self):
        """Test validation of valid XML file."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(
                '<?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION></COLLECTION></DJ_PLAYLISTS>'
            )
            temp_path = Path(f.name)

        try:
            valid, error = validate_xml_file(temp_path)
            assert valid is True
            assert error is None
        finally:
            temp_path.unlink()

    def test_file_not_exists(self):
        """Test validation of non-existent file."""
        temp_path = Path("/nonexistent/file.xml")
        valid, error = validate_xml_file(temp_path)
        assert valid is False
        assert "does not exist" in error

    def test_wrong_extension(self):
        """Test validation of file with wrong extension."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("not xml")
            temp_path = Path(f.name)

        try:
            valid, error = validate_xml_file(temp_path)
            assert valid is False
            assert "XML file" in error
        finally:
            temp_path.unlink()

    def test_empty_file(self):
        """Test validation of empty file."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            temp_path = Path(f.name)

        try:
            valid, error = validate_xml_file(temp_path)
            assert valid is False
            assert "empty" in error
        finally:
            temp_path.unlink()

    def test_invalid_xml(self):
        """Test validation of invalid XML."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write("<invalid><xml>")
            temp_path = Path(f.name)

        try:
            valid, error = validate_xml_file(temp_path)
            assert valid is False
            assert "XML" in error
        finally:
            temp_path.unlink()

    def test_not_rekordbox_xml(self):
        """Test validation of XML that's not Rekordbox format."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write('<?xml version="1.0"?><OTHER_ROOT></OTHER_ROOT>')
            temp_path = Path(f.name)

        try:
            valid, error = validate_xml_file(temp_path)
            assert valid is False
            assert "Rekordbox" in error
        finally:
            temp_path.unlink()

    def test_missing_collection(self):
        """Test validation of XML missing COLLECTION element."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write('<?xml version="1.0"?><DJ_PLAYLISTS></DJ_PLAYLISTS>')
            temp_path = Path(f.name)

        try:
            valid, error = validate_xml_file(temp_path)
            assert valid is False
            assert "COLLECTION" in error
        finally:
            temp_path.unlink()

    def test_rejects_doctype(self):
        """DOCTYPE/ENTITY should be rejected (defense-in-depth)."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(
                '<?xml version="1.0"?>\n'
                '<!DOCTYPE DJ_PLAYLISTS [ <!ENTITY xxe "xxe"> ]>\n'
                '<DJ_PLAYLISTS><COLLECTION></COLLECTION></DJ_PLAYLISTS>'
            )
            temp_path = Path(f.name)

        try:
            valid, error = validate_xml_file(temp_path)
            assert valid is False
            assert "DOCTYPE" in (error or "")
        finally:
            temp_path.unlink()


class TestValidatePlaylistSelection:
    """Test playlist selection validation."""

    def test_valid_selection(self):
        """Test validation of valid playlist selection."""
        playlists = ["Playlist 1", "Playlist 2", "Playlist 3"]
        valid, error = validate_playlist_selection("Playlist 1", playlists)
        assert valid is True
        assert error is None

    def test_empty_selection(self):
        """Test validation of empty selection."""
        playlists = ["Playlist 1", "Playlist 2"]
        valid, error = validate_playlist_selection("", playlists)
        assert valid is False
        assert "select" in error.lower()

    def test_none_selection(self):
        """Test validation of None selection."""
        playlists = ["Playlist 1", "Playlist 2"]
        valid, error = validate_playlist_selection(None, playlists)
        assert valid is False
        assert "select" in error.lower()

    def test_not_in_list(self):
        """Test validation of playlist not in available list."""
        playlists = ["Playlist 1", "Playlist 2"]
        valid, error = validate_playlist_selection("Playlist 3", playlists)
        assert valid is False
        assert "not found" in error

    def test_whitespace_only(self):
        """Test validation of whitespace-only selection."""
        playlists = ["Playlist 1", "Playlist 2"]
        valid, error = validate_playlist_selection("   ", playlists)
        assert valid is False
        assert "empty" in error.lower()


class TestValidateExportPath:
    """Test export path validation."""

    def test_valid_path(self, tmp_path):
        """Test validation of valid export path."""
        export_file = tmp_path / "export.csv"
        valid, error = validate_export_path(export_file)
        assert valid is True
        assert error is None

    def test_parent_not_exists(self, tmp_path):
        """Test validation when parent directory doesn't exist."""
        export_file = tmp_path / "nonexistent" / "export.csv"
        valid, error = validate_export_path(export_file)
        assert valid is False
        assert "does not exist" in error

    def test_file_exists_no_overwrite(self, tmp_path):
        """Test validation when file exists and overwrite not allowed."""
        export_file = tmp_path / "export.csv"
        export_file.write_text("existing")
        valid, error = validate_export_path(export_file, overwrite=False)
        assert valid is False
        assert "already exists" in error

    def test_file_exists_with_overwrite(self, tmp_path):
        """Test validation when file exists and overwrite allowed."""
        export_file = tmp_path / "export.csv"
        export_file.write_text("existing")
        valid, error = validate_export_path(export_file, overwrite=True)
        assert valid is True
        assert error is None

    @patch("shutil.disk_usage")
    def test_insufficient_disk_space(self, mock_disk_usage, tmp_path):
        """Test validation when disk space is insufficient."""
        mock_disk_usage.return_value.free = 5 * 1024 * 1024  # 5MB
        export_file = tmp_path / "export.csv"
        valid, error = validate_export_path(export_file)
        assert valid is False
        assert "disk space" in error.lower()
