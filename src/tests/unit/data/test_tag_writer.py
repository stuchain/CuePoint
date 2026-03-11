"""Unit tests for tag_writer (write Key, Comment, Year to audio files)."""

import struct
import tempfile
import wave
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.data.tag_writer import (
    STATUS_FILE_NOT_FOUND,
    STATUS_OK,
    STATUS_UNSUPPORTED_FORMAT,
    STATUS_WRITE_ERROR,
    _build_wav_list_info_data,
    _normalize_year,
    _str_opt,
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
            from mutagen.id3 import ID3
        except ImportError:
            pytest.skip("mutagen not installed")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path = f.name
        try:
            ID3().save(path)
            status, err = write_key_comment_year_to_file(path, "Am", "ok", "2024")
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
            from mutagen.id3 import ID3
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
            from mutagen.id3 import ID3
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
            status, msg = write_key_comment_year_to_file(tmpdir, "Am", "ok", "2024")
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
                mock_id3.return_value.save.side_effect = OSError(
                    13, "Permission denied"
                )
                status, msg = write_key_comment_year_to_file(path, "Am", "ok", "2024")
                assert status == STATUS_WRITE_ERROR
                assert msg is not None
        finally:
            Path(path).unlink(missing_ok=True)


class TestBuildWavListInfoData:
    """Tests for _build_wav_list_info_data (RIFF LIST-INFO for WAV / Rekordbox)."""

    def test_returns_empty_when_no_fields(self):
        assert _build_wav_list_info_data(None, None, None, None, None) == b""

    def test_includes_icmt_ikey_icrd_subchunks(self):
        data = _build_wav_list_info_data("a comment", "Am", "2023", "A Label", "House")
        assert b"ICMT" in data
        assert b"IKEY" in data
        assert b"ICRD" in data
        assert b"IPRD" in data
        assert b"IGNR" in data
        assert b"a comment" in data
        assert b"Am" in data
        assert b"2023" in data
        assert b"A Label" in data
        assert b"House" in data

    def test_year_normalized_for_icrd(self):
        data = _build_wav_list_info_data(None, None, "2022.0", None, None)
        assert b"2022" in data
        assert b"2022.0" not in data


def _make_minimal_wav(path: str) -> None:
    """Write a minimal valid WAV file so mutagen can add ID3/LIST-INFO."""
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\x00\x00" * 8000)


def _make_minimal_flac(path: str) -> None:
    """Write a minimal valid FLAC file (fLaC + STREAMINFO) so mutagen can add Vorbis comments."""
    # fLaC magic + one metadata block (STREAMINFO, last block, 34 bytes)
    header = b"fLaC"
    block_header = struct.pack(">I", 0x80 << 24 | 34)
    # STREAMINFO: min/max block 16, min/max frame 0
    streaminfo = struct.pack(">HH", 16, 16)
    streaminfo += (
        struct.pack(">I", 0)[:3] + struct.pack(">I", 0)[:3]
    )  # min/max frame (3 bytes each)
    # Sample rate 44100 (20 bits), channels 1 (3 bits), bps 16 (5 bits), total samples 0 (36 bits) = 8 bytes BE
    streaminfo += struct.pack(
        ">Q", (44100 << 44) | (0 << 41) | (15 << 36) | 0
    )  # 20+3+5+36 bits
    streaminfo += b"\x00" * 16  # MD5
    assert len(streaminfo) == 34
    with open(path, "wb") as f:
        f.write(header + block_header + streaminfo)


class TestRoundTripAllFormats:
    """Round-trip tests: write all six tags (key, comment, year, label, bpm, genre) then read back."""

    def test_mp3_roundtrip_all_six_fields(self):
        """MP3: write key, comment, year, label, bpm, genre; read back and assert all present."""
        pytest.importorskip("mutagen")
        from mutagen.id3 import ID3

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path = f.name
        try:
            ID3().save(path)
            status, err = write_key_comment_year_to_file(
                path,
                key="F#m",
                comment="test comment",
                year="2023",
                label="Test Label",
                bpm="128",
                genre="House",
            )
            assert status == STATUS_OK, err
            audio = ID3(path)
            assert audio.get("TKEY") is not None and audio["TKEY"].text == ["F#m"]
            comm = audio.getall("COMM")
            assert any(c.text == ["test comment"] for c in comm)
            year_frame = audio.get("TYER") or audio.get("TDRC")
            assert year_frame is not None and str(year_frame.text[0])[:4] == "2023"
            assert audio.get("TPUB") is not None and audio["TPUB"].text == [
                "Test Label"
            ]
            assert audio.get("TBPM") is not None and audio["TBPM"].text == ["128"]
            assert audio.get("TCON") is not None and audio["TCON"].text == ["House"]
        finally:
            Path(path).unlink(missing_ok=True)

    def test_wav_roundtrip_all_six_fields(self):
        """WAV: write all six tags (ID3 only, Latin-1); read back ID3 and verify key, comment, year, label, bpm, genre."""
        pytest.importorskip("mutagen")
        from mutagen import File

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            path = f.name
        try:
            _make_minimal_wav(path)
            status, err = write_key_comment_year_to_file(
                path,
                key="Am",
                comment="wav comment",
                year="2022",
                label="Wav Label",
                bpm="125",
                genre="Techno",
            )
            assert status == STATUS_OK, err
            audio = File(path)
            assert audio is not None and audio.tags is not None
            assert audio.tags.get("TKEY") is not None and audio.tags["TKEY"].text == [
                "Am"
            ]
            comm = audio.tags.getall("COMM")
            assert any(c.text == ["wav comment"] for c in comm)
            year_frame = audio.tags.get("TYER") or audio.tags.get("TDRC")
            assert year_frame is not None and str(year_frame.text[0])[:4] == "2022"
            assert audio.tags.get("TPUB") is not None and audio.tags["TPUB"].text == [
                "Wav Label"
            ]
            assert audio.tags.get("TBPM") is not None and audio.tags["TBPM"].text == [
                "125"
            ]
            assert audio.tags.get("TCON") is not None and audio.tags["TCON"].text == [
                "Techno"
            ]
        finally:
            Path(path).unlink(missing_ok=True)

    def test_wav_id3_uses_latin1_encoding(self):
        """WAV ID3 frames use encoding 0 (Latin-1) for ID3v2.3 compatibility with Rekordbox."""
        pytest.importorskip("mutagen")
        from mutagen import File
        from mutagen.id3 import Encoding

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            path = f.name
        try:
            _make_minimal_wav(path)
            status, err = write_key_comment_year_to_file(
                path,
                key="Cm",
                comment="test",
                year="2023",
                label="Lbl",
                bpm="120",
                genre="House",
            )
            assert status == STATUS_OK, err
            audio = File(path)
            assert audio.tags is not None
            tkey = audio.tags.get("TKEY")
            assert tkey is not None, "TKEY should be present"
            assert tkey.encoding == Encoding.LATIN1, (
                "WAV should use Latin-1 (0) for ID3v2.3"
            )
            comm = audio.tags.getall("COMM")
            assert comm, "COMM should be present"
            assert comm[0].encoding == Encoding.LATIN1
            year_frame = audio.tags.get("TYER") or audio.tags.get("TDRC")
            if year_frame is not None:
                assert year_frame.encoding == Encoding.LATIN1
        finally:
            Path(path).unlink(missing_ok=True)

    def test_flac_roundtrip_all_six_fields(self):
        """FLAC: write key, comment, year, label, bpm, genre; read back and assert all present."""
        pytest.importorskip("mutagen")
        from mutagen.flac import FLAC

        with tempfile.NamedTemporaryFile(suffix=".flac", delete=False) as f:
            path = f.name
        try:
            _make_minimal_flac(path)
            status, err = write_key_comment_year_to_file(
                path,
                key="C",
                comment="flac comment",
                year="2024",
                label="Flac Label",
                bpm="120",
                genre="Minimal",
            )
            assert status == STATUS_OK, err
            audio = FLAC(path)
            assert audio.get("KEY") == ["C"]
            assert audio.get("INITIALKEY") == ["C"]
            assert audio.get("COMMENT") == ["flac comment"]
            assert audio.get("DATE") == ["2024"]
            assert audio.get("LABEL") == ["Flac Label"]
            assert audio.get("BPM") == ["120"]
            assert audio.get("GENRE") == ["Minimal"]
        finally:
            Path(path).unlink(missing_ok=True)

    def test_flac_writes_both_key_and_initialkey(self):
        """FLAC gets KEY and INITIALKEY so Windows and Rekordbox both can read key."""
        pytest.importorskip("mutagen")
        from mutagen.flac import FLAC

        with tempfile.NamedTemporaryFile(suffix=".flac", delete=False) as f:
            path = f.name
        try:
            _make_minimal_flac(path)
            status, err = write_key_comment_year_to_file(path, "F#m", "ok", "2022")
            assert status == STATUS_OK, err
            audio = FLAC(path)
            assert audio.get("KEY") == ["F#m"], (
                "KEY should be written for Rekordbox/others"
            )
            assert audio.get("INITIALKEY") == ["F#m"], (
                "INITIALKEY should be written for Windows/Serato"
            )
        finally:
            Path(path).unlink(missing_ok=True)

    def test_key_stripped_and_written(self):
        """Key with surrounding whitespace is stripped and still written (not skipped)."""
        pytest.importorskip("mutagen")
        from mutagen.id3 import ID3

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path = f.name
        try:
            ID3().save(path)
            status, err = write_key_comment_year_to_file(
                path, key="  Bm  ", comment="ok", year="2021"
            )
            assert status == STATUS_OK, err
            audio = ID3(path)
            assert audio.get("TKEY") is not None and audio["TKEY"].text == ["Bm"]
        finally:
            Path(path).unlink(missing_ok=True)


class TestStrOpt:
    """Tests for _str_opt normalization."""

    def test_none_returns_none(self):
        assert _str_opt(None) is None

    def test_empty_string_returns_none(self):
        assert _str_opt("") is None
        assert _str_opt("   ") is None

    def test_stripped_non_empty(self):
        assert _str_opt("  Am  ") == "Am"
        assert _str_opt("ok") == "ok"
