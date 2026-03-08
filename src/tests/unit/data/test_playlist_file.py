"""Unit tests for playlist_file.parse_m3u and read_title_artist_from_file."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.data.playlist_file import parse_m3u, read_title_artist_from_file


class TestParseM3u:
    """Tests for parse_m3u()."""

    def test_extinf_and_path_lines(self, tmp_path):
        """EXTINF + next line as path returns (path, title, artist)."""
        m3u = tmp_path / "test.m3u"
        m3u.write_text(
            "#EXTM3U\n"
            "#EXTINF:123,Artist A - Title One\n"
            "/absolute/path/track1.mp3\n"
            "#EXTINF:456,Artist B - Title Two\n"
            "relative/track2.flac\n",
            encoding="utf-8",
        )
        result = parse_m3u(str(m3u))
        assert len(result) == 2
        assert result[0][0].replace("\\", "/").endswith("/absolute/path/track1.mp3")
        assert result[0][1] == "Title One"
        assert result[0][2] == "Artist A"
        assert result[1][0] == str((tmp_path / "relative" / "track2.flac").resolve())
        assert result[1][1] == "Title Two"
        assert result[1][2] == "Artist B"

    def test_relative_path_resolution(self, tmp_path):
        """Relative paths are resolved against playlist directory."""
        sub = tmp_path / "sub"
        sub.mkdir()
        (sub / "track.mp3").write_bytes(b"x")
        m3u = tmp_path / "list.m3u"
        m3u.write_text(
            "#EXTM3U\n#EXTINF:0,S - T\nsub/track.mp3\n",
            encoding="utf-8",
        )
        result = parse_m3u(str(m3u))
        assert len(result) == 1
        assert result[0][0] == str((tmp_path / "sub" / "track.mp3").resolve())

    def test_encoding_utf8(self, tmp_path):
        """UTF-8 encoded file parses correctly; split on first ' - ' (ASCII)."""
        m3u = tmp_path / "utf8.m3u"
        m3u.write_text(
            "#EXTM3U\n#EXTINF:0,Artist - Title\n/track.mp3\n",
            encoding="utf-8",
        )
        result = parse_m3u(str(m3u))
        assert len(result) == 1
        assert result[0][1] == "Title"
        assert result[0][2] == "Artist"

    def test_encoding_fallback_latin1(self, tmp_path):
        """Non-UTF-8 (Latin-1) content uses fallback encoding."""
        m3u = tmp_path / "latin1.m3u"
        m3u.write_bytes(
            b"#EXTM3U\n#EXTINF:0,Artiste - Titre\n/track.mp3\n"
        )
        result = parse_m3u(str(m3u))
        assert len(result) == 1
        assert result[0][0].replace("\\", "/").endswith("/track.mp3")

    def test_encoding_fallback_cp1252_when_latin1_raises(self, tmp_path):
        """When UTF-8 and Latin-1 both raise, cp1252 fallback is used and parsing succeeds."""
        m3u = tmp_path / "cp1252.m3u"
        content = "#EXTM3U\n#EXTINF:0,Artist - Title\n/track.mp3\n"
        m3u.write_text(content, encoding="utf-8")  # ensure file exists with valid content

        def read_text_side_effect(self, encoding=None, **kwargs):
            if encoding == "utf-8":
                raise UnicodeDecodeError("utf-8", b"", 0, 1, "invalid")
            if encoding == "latin-1":
                raise UnicodeDecodeError("latin-1", b"", 0, 1, "invalid")
            return content

        with patch.object(Path, "read_text", read_text_side_effect):
            result = parse_m3u(str(m3u))
        assert len(result) == 1
        assert result[0][1] == "Title"
        assert result[0][2] == "Artist"

    def test_extinf_split_first_dash(self, tmp_path):
        """Display string is split on first ' - ' for artist/title."""
        m3u = tmp_path / "dash.m3u"
        m3u.write_text(
            "#EXTM3U\n#EXTINF:0,One - Two - Three\n/t.mp3\n",
            encoding="utf-8",
        )
        result = parse_m3u(str(m3u))
        assert result[0][2] == "One"
        assert result[0][1] == "Two - Three"

    def test_extinf_no_dash_title_only(self, tmp_path):
        """No ' - ' uses whole string as title, artist None."""
        m3u = tmp_path / "no_dash.m3u"
        m3u.write_text("#EXTM3U\n#EXTINF:0,Only Title\n/t.mp3\n", encoding="utf-8")
        result = parse_m3u(str(m3u))
        assert result[0][1] == "Only Title"
        assert result[0][2] is None

    def test_empty_or_missing_extinf(self, tmp_path):
        """Missing or empty EXTINF yields (path, None, None)."""
        m3u = tmp_path / "no_extinf.m3u"
        m3u.write_text("#EXTM3U\n/track.mp3\n", encoding="utf-8")
        result = parse_m3u(str(m3u))
        assert len(result) == 1
        assert result[0][0].endswith("track.mp3") or "/track.mp3" in result[0][0].replace("\\", "/")
        assert result[0][1] is None
        assert result[0][2] is None

    def test_m3u8_same_parsing(self, tmp_path):
        """Same parsing logic for .m3u8."""
        m3u = tmp_path / "test.m3u8"
        m3u.write_text(
            "#EXTM3U\n#EXTINF:0,A - B\n/t.mp3\n",
            encoding="utf-8",
        )
        result = parse_m3u(str(m3u))
        assert len(result) == 1
        assert result[0][1] == "B"
        assert result[0][2] == "A"

    def test_file_not_found_raises(self):
        """Missing playlist file raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError, match="not found"):
            parse_m3u("/nonexistent/path/list.m3u")

    def test_skip_empty_lines(self, tmp_path):
        """Empty lines and EXTM3U are skipped."""
        m3u = tmp_path / "empty.m3u"
        m3u.write_text(
            "#EXTM3U\n\n\n#EXTINF:0,S - T\n\n/t.mp3\n\n",
            encoding="utf-8",
        )
        result = parse_m3u(str(m3u))
        assert len(result) == 1
        assert result[0][0].endswith("t.mp3")


class TestReadTitleArtistFromFile:
    """Tests for read_title_artist_from_file()."""

    def test_missing_file_returns_none(self):
        """Missing file returns (None, None)."""
        title, artist = read_title_artist_from_file("/nonexistent/file.mp3")
        assert title is None
        assert artist is None

    def test_mp3_with_id3_returns_title_artist(self, tmp_path):
        """MP3 with ID3 TIT2/TPE1 returns title and artist."""
        try:
            from mutagen.id3 import ID3, TIT2, TPE1
        except ImportError:
            pytest.skip("mutagen not available")
        path = tmp_path / "track.mp3"
        path.write_bytes(b"x" * 1024)
        audio = ID3()
        audio.add(TPE1(encoding=3, text=["Test Artist"]))
        audio.add(TIT2(encoding=3, text=["Test Title"]))
        audio.save(str(path))
        title, artist = read_title_artist_from_file(str(path))
        assert title == "Test Title"
        assert artist == "Test Artist"

    def test_unreadable_returns_none(self, tmp_path):
        """Unreadable or non-audio file returns (None, None)."""
        path = tmp_path / "plain.txt"
        path.write_text("not audio")
        title, artist = read_title_artist_from_file(str(path))
        assert title is None
        assert artist is None

    def test_directory_path_returns_none(self, tmp_path):
        """When file_path is a directory, returns (None, None) without raising."""
        title, artist = read_title_artist_from_file(str(tmp_path))
        assert title is None
        assert artist is None
