"""Unit tests for tag_writer (write Key, Comment, Year to audio files)."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.data.tag_writer import (
    STATUS_FILE_NOT_FOUND,
    STATUS_OK,
    STATUS_UNSUPPORTED_FORMAT,
    STATUS_WRITE_ERROR,
    _normalize_year,
    write_key_comment_year_to_file,
)


class TestNormalizeYear:
    """Tests for _normalize_year."""

    def test_accepts_four_digit_string(self):
        assert _normalize_year("2023") == "2023"
        assert _normalize_year("1999") == "1999"

    def test_accepts_int(self):
        assert _normalize_year(2023) == "2023"
        assert _normalize_year(1999) == "1999"

    def test_float_normalized_to_four_digits(self):
        assert _normalize_year(2023.0) == "2023"
        assert _normalize_year("2023.0") == "2023"

    def test_rejects_invalid_range(self):
        assert _normalize_year(0) is None
        assert _normalize_year(1899) is None
        assert _normalize_year(2101) is None
        assert _normalize_year("") is None
        assert _normalize_year(None) is None

    def test_rejects_garbage_string(self):
        assert _normalize_year("n/a") is None
        assert _normalize_year("abc") is None

    def test_rejects_whitespace_only_string(self):
        """Whitespace-only string returns None."""
        assert _normalize_year("  ") is None
        assert _normalize_year("  \t  ") is None


class TestWriteKeyCommentYearToFile:
    """Tests for write_key_comment_year_to_file."""

    def test_missing_file_returns_file_not_found(self):
        """Non-existent path returns FILE_NOT_FOUND."""
        status, msg = write_key_comment_year_to_file(
            "/nonexistent/path/to/file.mp3", "Am", "ok", "2024"
        )
        assert status == STATUS_FILE_NOT_FOUND
        assert msg is not None and "not found" in msg.lower()

    def test_mp3_writes_key_comment_year(self):
        """Write to MP3 then reload with mutagen; Key, Comment, Year match."""
        try:
            from mutagen.id3 import ID3, COMM, TKEY, TYER
        except ImportError:
            pytest.skip("mutagen not installed")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path = f.name
        try:
            ID3().save(path)
            status, err = write_key_comment_year_to_file(
                path, "Am", "ok", "2024"
            )
            assert status == STATUS_OK, err
            assert err is None
            audio = ID3(path)
            assert audio.get("TKEY") is not None
            assert audio["TKEY"].text == ["Am"]
            comm = audio.getall("COMM")
            assert comm
            assert any(c.text == ["ok"] for c in comm)
            year_frame = audio.get("TYER") or audio.get("TDRC")
            assert year_frame is not None
            assert len(year_frame.text) == 1 and str(year_frame.text[0])[:4] == "2024"
        finally:
            Path(path).unlink(missing_ok=True)

    def test_mp3_year_normalized_from_float_string(self):
        """Year written as '2023.0' is stored as 4-digit '2023' in file."""
        try:
            from mutagen.id3 import ID3, TYER
        except ImportError:
            pytest.skip("mutagen not installed")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path = f.name
        try:
            ID3().save(path)
            status, err = write_key_comment_year_to_file(
                path, None, None, "2023.0", None
            )
            assert status == STATUS_OK, err
            audio = ID3(path)
            year_frame = audio.get("TYER") or audio.get("TDRC")
            assert year_frame is not None
            assert len(year_frame.text) == 1
            assert str(year_frame.text[0])[:4] == "2023"
        finally:
            Path(path).unlink(missing_ok=True)

    def test_mp3_writes_label_when_provided(self):
        """Write with label; TPUB (publisher/label) is set on MP3."""
        try:
            from mutagen.id3 import ID3, TPUB
        except ImportError:
            pytest.skip("mutagen not installed")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path = f.name
        try:
            ID3().save(path)
            status, err = write_key_comment_year_to_file(
                path, "Am", "ok", "2024", label="Test Label"
            )
            assert status == STATUS_OK, err
            audio = ID3(path)
            assert audio.get("TPUB") is not None
            assert audio["TPUB"].text == ["Test Label"]
        finally:
            Path(path).unlink(missing_ok=True)

    def test_unsupported_extension_returns_unsupported(self):
        """File with unsupported extension returns UNSUPPORTED_FORMAT."""
        with tempfile.NamedTemporaryFile(suffix=".xyz", delete=False) as f:
            f.write(b"fake content")
            path = f.name
        try:
            status, _ = write_key_comment_year_to_file(path, "Am", "ok", None)
            assert status == STATUS_UNSUPPORTED_FORMAT
        finally:
            Path(path).unlink(missing_ok=True)

    def test_directory_path_returns_error_without_raising(self):
        """Passing a directory path returns a non-OK status (WRITE_ERROR or UNSUPPORTED_FORMAT) and does not raise."""
        with tempfile.TemporaryDirectory() as tmpdir:
            status, msg = write_key_comment_year_to_file(
                tmpdir, "Am", "ok", "2024"
            )
            assert status in (STATUS_WRITE_ERROR, STATUS_UNSUPPORTED_FORMAT)
            assert status != STATUS_OK
            assert msg is not None

    def test_write_failure_returns_write_error(self):
        """When the underlying write raises (e.g. permission denied), returns STATUS_WRITE_ERROR."""
        try:
            from mutagen.id3 import ID3
        except ImportError:
            pytest.skip("mutagen not installed")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path = f.name
        try:
            ID3().save(path)
            with patch("mutagen.id3.ID3") as mock_id3:
                mock_id3.return_value.save.side_effect = OSError(13, "Permission denied")
                status, msg = write_key_comment_year_to_file(path, "Am", "ok", "2024")
                assert status == STATUS_WRITE_ERROR
                assert msg is not None
        finally:
            Path(path).unlink(missing_ok=True)
