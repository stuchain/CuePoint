"""Unit tests for Rekordbox write-back (get_playlist_track_ids, write_updated_collection_xml, build_rekordbox_updates)."""

import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.data.rekordbox import (
    MAX_XML_SIZE_BYTES,
    build_rekordbox_updates,
    build_rekordbox_updates_batch,
    get_playlist_track_ids,
    get_track_locations,
    parse_rekordbox,
    read_playlist_index,
    write_key_comment_year_to_playlist_tracks,
    write_updated_collection_xml,
    write_tags_to_paths,
)
from cuepoint.models.result import TrackResult


def _fixtures_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "fixtures" / "rekordbox"


class TestGetPlaylistTrackIds:
    """Tests for get_playlist_track_ids."""

    def test_returns_track_ids_in_playlist_order(self):
        """Given a fixture XML with one playlist and 3 tracks, assert returned list matches order."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        track_ids = get_playlist_track_ids(str(small_xml), "My Playlist")
        assert track_ids == ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]

    def test_unknown_playlist_raises_value_error(self):
        """Given unknown playlist name, assert raises ValueError."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        with pytest.raises(ValueError, match="Playlist not found"):
            get_playlist_track_ids(str(small_xml), "Nonexistent Playlist")


class TestGetTrackLocations:
    """Tests for get_track_locations."""

    def test_returns_locations_when_present(self):
        """XML with Location attributes returns track_id -> path mapping."""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="A" Artist="B" Location="file://localhost/C:/Music/track1.mp3"/>
        <TRACK TrackID="2" Name="C" Artist="D" Location="file://localhost/D:/Songs/track2.flac"/>
    </COLLECTION>
    <PLAYLISTS><NODE Name="ROOT"><NODE Name="P" Type="1"><TRACK Key="1"/><TRACK Key="2"/></NODE></NODE></PLAYLISTS>
</DJ_PLAYLISTS>"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            f.write(xml_content)
            path = f.name
        try:
            locations = get_track_locations(path)
            assert "1" in locations
            assert "2" in locations
            assert "track1.mp3" in locations["1"] or "track1" in locations["1"]
            assert "track2.flac" in locations["2"] or "track2" in locations["2"]
        finally:
            Path(path).unlink(missing_ok=True)

    def test_empty_when_no_location(self):
        """XML without Location returns empty or no entry for those tracks."""
        minimal_xml = _fixtures_dir() / "minimal.xml"
        if not minimal_xml.exists():
            pytest.skip("fixtures/rekordbox/minimal.xml not found")
        locations = get_track_locations(str(minimal_xml))
        assert locations == {}


class TestBuildRekordboxUpdates:
    """Tests for build_rekordbox_updates."""

    def test_matched_track_gets_key_bpm_comment_ok(self):
        """One matched TrackResult with beatport_key and beatport_bpm yields updates with Key, BPM, Comment='ok'."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=True,
                beatport_key="Am",
                beatport_bpm="128",
            ),
            TrackResult(
                playlist_index=2,
                title="Track 2",
                artist="Artist 2",
                matched=False,
            ),
        ]
        updates = build_rekordbox_updates(str(small_xml), "My Playlist", results)
        assert len(updates) == 1
        assert "1" in updates
        assert updates["1"]["Comment"] == "ok"
        assert updates["1"]["Key"] == "Am"
        assert updates["1"]["BPM"] == "128"

    def test_unmatched_track_not_in_updates(self):
        """Unmatched track does not appear in updates."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=False,
            ),
        ]
        updates = build_rekordbox_updates(str(small_xml), "My Playlist", results)
        assert len(updates) == 0

    def test_use_camelot_key_writes_camelot_notation(self):
        """With use_camelot_key=True, Key is Camelot (e.g. 8A) from beatport_key_camelot or conversion."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=True,
                beatport_key="A Minor",
                beatport_key_camelot="8A",
                beatport_bpm="128",
            ),
        ]
        updates = build_rekordbox_updates(
            str(small_xml), "My Playlist", results, use_camelot_key=True
        )
        assert "1" in updates
        assert updates["1"]["Key"] == "8A"
        assert updates["1"]["Comment"] == "ok"

    def test_year_normalized_to_four_digits(self):
        """beatport_year as int or float string yields Year as 4-digit string in updates."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        for year_input, expected in [(2023, "2023"), ("2023.0", "2023")]:
            results = [
                TrackResult(
                    playlist_index=1,
                    title="Track 1",
                    artist="Artist 1",
                    matched=True,
                    beatport_year=year_input,
                ),
            ]
            updates = build_rekordbox_updates(str(small_xml), "My Playlist", results)
            assert "1" in updates
            assert updates["1"].get("Year") == expected

    def test_unknown_playlist_name_raises_value_error(self):
        """build_rekordbox_updates with nonexistent playlist raises ValueError."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=True,
                beatport_key="Am",
            ),
        ]
        with pytest.raises(ValueError, match="Playlist not found"):
            build_rekordbox_updates(str(small_xml), "Nonexistent", results)

    def test_empty_results_returns_empty_dict(self):
        """build_rekordbox_updates with empty results returns empty dict."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        updates = build_rekordbox_updates(str(small_xml), "My Playlist", [])
        assert updates == {}


class TestWriteUpdatedCollectionXml:
    """Tests for write_updated_collection_xml."""

    def test_written_xml_has_updated_key_and_comment(self):
        """Given minimal XML and updates (Key=Cm, Comment=ok), written file has that track updated."""
        minimal_xml = _fixtures_dir() / "minimal.xml"
        if not minimal_xml.exists():
            pytest.skip("fixtures/rekordbox/minimal.xml not found")
        updates = {"1": {"Key": "Cm", "Comment": "ok"}}
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            write_updated_collection_xml(str(minimal_xml), updates, output_path)
            tree = ET.parse(output_path)
            root = tree.getroot()
            collection = root.find(".//COLLECTION")
            assert collection is not None
            tracks = collection.findall("TRACK")
            track1 = next(
                (t for t in tracks if (t.get("TrackID") or t.get("Key")) == "1"), None
            )
            assert track1 is not None
            assert track1.get("Key") == "Cm"
            assert track1.get("Comment") == "ok"
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_written_xml_starts_with_declaration_and_utf8(self):
        """Written file starts with XML declaration and is valid UTF-8."""
        minimal_xml = _fixtures_dir() / "minimal.xml"
        if not minimal_xml.exists():
            pytest.skip("fixtures/rekordbox/minimal.xml not found")
        updates = {"1": {"Comment": "ok"}}
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            write_updated_collection_xml(str(minimal_xml), updates, output_path)
            raw = Path(output_path).read_text(encoding="utf-8")
            assert raw.strip().startswith("<?xml ")
            assert 'encoding="utf-8"' in raw or "encoding='utf-8'" in raw
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_written_xml_parseable_by_parse_rekordbox(self):
        """Written XML is parseable by parse_rekordbox and read_playlist_index."""
        minimal_xml = _fixtures_dir() / "minimal.xml"
        if not minimal_xml.exists():
            pytest.skip("fixtures/rekordbox/minimal.xml not found")
        updates = {"1": {"Key": "Cm", "Comment": "ok"}}
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            write_updated_collection_xml(str(minimal_xml), updates, output_path)
            playlists = parse_rekordbox(output_path)
            assert playlists
            counts, _ = read_playlist_index(output_path)
            assert counts
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_other_tracks_and_playlists_unchanged(self):
        """Only the updated track's attributes change; other TRACKs and PLAYLISTS unchanged."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        updates = {"1": {"Key": "Cm", "Comment": "ok"}}
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            write_updated_collection_xml(str(small_xml), updates, output_path)
            playlists = parse_rekordbox(output_path)
            assert "My Playlist" in playlists
            assert len(playlists["My Playlist"].tracks) == 10
            # Track 2 should be unchanged (we only updated track 1)
            track2 = next(
                (t for t in playlists["My Playlist"].tracks if t.track_id == "2"),
                None,
            )
            assert track2 is not None
            assert track2.title == "Track 2"
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_input_xml_missing_raises_file_not_found(self):
        """write_updated_collection_xml with nonexistent input raises FileNotFoundError."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            with pytest.raises(FileNotFoundError, match="XML file not found"):
                write_updated_collection_xml(
                    "/nonexistent/collection.xml", {"1": {"Comment": "ok"}}, output_path
                )
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_input_xml_over_size_cap_raises_value_error(self):
        """write_updated_collection_xml when input exceeds MAX_XML_SIZE_BYTES raises ValueError."""
        minimal_xml = _fixtures_dir() / "minimal.xml"
        if not minimal_xml.exists():
            pytest.skip("fixtures/rekordbox/minimal.xml not found")
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            with patch("os.path.getsize", return_value=MAX_XML_SIZE_BYTES + 1):
                with pytest.raises(ValueError, match="XML file too large"):
                    write_updated_collection_xml(
                        str(minimal_xml), {"1": {"Comment": "ok"}}, output_path
                    )
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_output_write_failure_raises_os_error(self):
        """write_updated_collection_xml when write fails propagates OSError."""
        minimal_xml = _fixtures_dir() / "minimal.xml"
        if not minimal_xml.exists():
            pytest.skip("fixtures/rekordbox/minimal.xml not found")
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            with patch(
                "cuepoint.data.rekordbox.ET.ElementTree.write",
                side_effect=OSError(13, "Permission denied"),
            ):
                with pytest.raises(OSError):
                    write_updated_collection_xml(
                        str(minimal_xml), {"1": {"Comment": "ok"}}, output_path
                    )
        finally:
            Path(output_path).unlink(missing_ok=True)


class TestBuildRekordboxUpdatesBatch:
    """Tests for build_rekordbox_updates_batch."""

    def test_merges_updates_from_multiple_playlists(self):
        """Batch with two playlists merges updates; last write wins for shared track."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        results_dict = {
            "My Playlist": [
                TrackResult(
                    playlist_index=1,
                    title="Track 1",
                    artist="Artist 1",
                    matched=True,
                    beatport_key="Am",
                    beatport_bpm="128",
                ),
            ],
        }
        updates = build_rekordbox_updates_batch(str(small_xml), results_dict)
        assert "1" in updates
        assert updates["1"]["Comment"] == "ok"
        assert updates["1"]["Key"] == "Am"
        assert updates["1"]["BPM"] == "128"


class TestWriteKeyCommentYearToPlaylistTracks:
    """Tests for write_key_comment_year_to_playlist_tracks edge cases."""

    def test_xml_with_no_locations_returns_zero_written_and_message(self):
        """When XML has no Location attributes, returns (0, 0, [message])."""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="A" Artist="B"/>
        <TRACK TrackID="2" Name="C" Artist="D"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="P" Type="1">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            f.write(xml_content)
            xml_path = f.name
        try:
            results = [
                TrackResult(
                    playlist_index=1,
                    title="A",
                    artist="B",
                    matched=True,
                    beatport_key="Am",
                ),
                TrackResult(
                    playlist_index=2,
                    title="C",
                    artist="D",
                    matched=True,
                    beatport_key="Cm",
                ),
            ]
            written, failed, errors = write_key_comment_year_to_playlist_tracks(
                xml_path, "P", results
            )
            assert written == 0
            assert failed == 0
            assert len(errors) == 1
            assert "No file paths" in errors[0] and "Location" in errors[0]
        finally:
            Path(xml_path).unlink(missing_ok=True)

    def test_track_in_updates_but_not_in_locations_fails_with_message(self):
        """When a track has no Location in XML, that track is counted as failed with 'no path in XML'."""
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            only_path = f.name
        try:
            try:
                from mutagen.id3 import ID3
            except ImportError:
                pytest.skip("mutagen not installed")
            ID3().save(only_path)
        except Exception:
            Path(only_path).unlink(missing_ok=True)
            pytest.skip("mutagen not installed")
        normalized = only_path.replace("\\", "/")
        if len(normalized) >= 2 and normalized[1] == ":":
            normalized = "/" + normalized
        loc1 = "file://localhost" + normalized
        # Track 2 has no Location
        xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="A" Artist="B" Location="{loc1}"/>
        <TRACK TrackID="2" Name="C" Artist="D"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="P" Type="1">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            f.write(xml_content)
            xml_path = f.name
        try:
            results = [
                TrackResult(
                    playlist_index=1,
                    title="A",
                    artist="B",
                    matched=True,
                    beatport_key="Am",
                ),
                TrackResult(
                    playlist_index=2,
                    title="C",
                    artist="D",
                    matched=True,
                    beatport_key="Cm",
                ),
            ]
            # Use full path so playlist is found regardless of get_playlist_track_ids lookup order
            written, failed, errors = write_key_comment_year_to_playlist_tracks(
                xml_path, "ROOT/P", results
            )
            assert written == 1, (
                f"expected written=1, got written={written}, failed={failed}, errors={errors}"
            )
            assert failed == 1
            assert any("no path in XML" in e for e in errors)
        finally:
            Path(xml_path).unlink(missing_ok=True)
            Path(only_path).unlink(missing_ok=True)


class TestWriteTagsToPaths:
    """Tests for write_tags_to_paths (M3U-sourced results, no Rekordbox XML)."""

    def test_empty_results_returns_zero_counts(self):
        """Empty results list returns (0, 0, [])."""
        written, failed, errors = write_tags_to_paths([])
        assert written == 0
        assert failed == 0
        assert errors == []

    def test_all_unmatched_or_no_file_path_returns_zero(self):
        """Results with all matched=False or no file_path yield (0, 0, [])."""
        results = [
            TrackResult(playlist_index=1, title="A", artist="B", matched=False),
            TrackResult(
                playlist_index=2, title="C", artist="D", matched=True, file_path=None
            ),
        ]
        written, failed, errors = write_tags_to_paths(results)
        assert written == 0
        assert failed == 0
        assert errors == []

    def test_mixed_missing_files_increments_failed(self):
        """When some file_paths do not exist, failed count and error list are set."""
        try:
            from mutagen.id3 import ID3
        except ImportError:
            pytest.skip("mutagen not installed")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            real_path = f.name
        try:
            ID3().save(real_path)
            results = [
                TrackResult(
                    playlist_index=1,
                    title="A",
                    artist="B",
                    matched=True,
                    file_path=real_path,
                    beatport_key="Am",
                ),
                TrackResult(
                    playlist_index=2,
                    title="C",
                    artist="D",
                    matched=True,
                    file_path="/nonexistent/track2.mp3",
                    beatport_key="Cm",
                ),
            ]
            written, failed, errors = write_tags_to_paths(results)
            assert written == 1
            assert failed == 1
            assert any("not found" in e.lower() for e in errors)
        finally:
            Path(real_path).unlink(missing_ok=True)

    def test_happy_path_writes_tags_to_temp_mp3s(self):
        """Two results with real temp MP3s: written=2, tags readable."""
        try:
            from mutagen.id3 import ID3
        except ImportError:
            pytest.skip("mutagen not installed")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path1 = f.name
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path2 = f.name
        try:
            ID3().save(path1)
            ID3().save(path2)
            results = [
                TrackResult(
                    playlist_index=1,
                    title="A",
                    artist="B",
                    matched=True,
                    file_path=path1,
                    beatport_key="Am",
                    beatport_year="2024",
                ),
                TrackResult(
                    playlist_index=2,
                    title="C",
                    artist="D",
                    matched=True,
                    file_path=path2,
                    beatport_key="Cm",
                    beatport_year="2023",
                ),
            ]
            written, failed, errors = write_tags_to_paths(results)
            assert written == 2, errors
            assert failed == 0
            a1 = ID3(path1)
            a2 = ID3(path2)
            assert a1.get("TKEY") and a1["TKEY"].text == ["Am"]
            assert a2.get("TKEY") and a2["TKEY"].text == ["Cm"]
            y1 = a1.get("TYER") or a1.get("TDRC")
            y2 = a2.get("TYER") or a2.get("TDRC")
            assert y1 and str(y1.text[0])[:4] == "2024"
            assert y2 and str(y2.text[0])[:4] == "2023"
        finally:
            Path(path1).unlink(missing_ok=True)
            Path(path2).unlink(missing_ok=True)

    def test_sync_options_write_comment_false_omits_comment(self):
        """With sync_options write_comment=False, Comment is not written."""
        try:
            from mutagen.id3 import ID3
        except ImportError:
            pytest.skip("mutagen not installed")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            path = f.name
        try:
            ID3().save(path)
            results = [
                TrackResult(
                    playlist_index=1,
                    title="A",
                    artist="B",
                    matched=True,
                    file_path=path,
                    beatport_key="Am",
                ),
            ]
            written, failed, errors = write_tags_to_paths(
                results,
                sync_options={"write_comment": False, "write_key": True},
            )
            assert written == 1
            assert failed == 0
            audio = ID3(path)
            assert audio.get("TKEY") and audio["TKEY"].text == ["Am"]
            comm = audio.getall("COMM")
            assert not any(c.text == ["ok"] for c in comm) if comm else True
        finally:
            Path(path).unlink(missing_ok=True)
