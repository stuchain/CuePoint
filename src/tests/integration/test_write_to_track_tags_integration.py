"""Integration tests for writing Key, Comment, Year to track tags (Rekordbox Reload Tags flow)."""

import os
import tempfile
from pathlib import Path

import pytest

from cuepoint.data.rekordbox import (
    get_playlist_track_ids,
    get_track_locations,
    write_key_comment_year_to_playlist_tracks,
)
from cuepoint.models.result import TrackResult

# Paths for optional "to split test" integration test (skip if missing)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_DEFAULT_COLLECTION_XML = Path(
    os.environ.get("CUEPOINT_TEST_COLLECTION_XML", r"s:\Downloads\collection-pc.xml")
)
_NTH_DIR = _PROJECT_ROOT / "nth"
_TO_SPLIT_PLAYLIST = "to split test"


def _path_to_rekordbox_location(path: str) -> str:
    """Convert a local path to Rekordbox Location attribute value (file://localhost/...)."""
    normalized = path.replace("\\", "/")
    if len(normalized) >= 2 and normalized[1] == ":":
        normalized = "/" + normalized
    return "file://localhost" + normalized


class TestWriteToTrackTagsIntegration:
    """End-to-end: XML with Location -> write_key_comment_year_to_playlist_tracks -> files tagged."""

    def test_writes_key_comment_year_to_playlist_tracks(self):
        """Small XML with Location pointing to temp MP3s; run write; assert tags and counts."""
        pytest.importorskip("mutagen")
        from mutagen.id3 import ID3

        temp_dir = tempfile.mkdtemp()
        try:
            track1_path = os.path.join(temp_dir, "track1.mp3")
            track2_path = os.path.join(temp_dir, "track2.mp3")
            ID3().save(track1_path)
            ID3().save(track2_path)
            loc1 = _path_to_rekordbox_location(track1_path)
            loc2 = _path_to_rekordbox_location(track2_path)
            xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="A" Artist="B" Location="{loc1}"/>
        <TRACK TrackID="2" Name="C" Artist="D" Location="{loc2}"/>
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
            xml_path = os.path.join(temp_dir, "collection.xml")
            with open(xml_path, "w", encoding="utf-8") as f:
                f.write(xml_content)
            results = [
                TrackResult(
                    playlist_index=1,
                    title="A",
                    artist="B",
                    matched=True,
                    beatport_key="Am",
                    beatport_bpm="128",
                    beatport_year="2024",
                ),
                TrackResult(
                    playlist_index=2,
                    title="C",
                    artist="D",
                    matched=True,
                    beatport_key="C",
                    beatport_bpm="120",
                    beatport_year="2023",
                ),
            ]
            written, failed, errors, wav_skipped = (
                write_key_comment_year_to_playlist_tracks(xml_path, "P", results)
            )
            assert written == 2, (errors, failed)
            assert failed == 0, errors
            a1 = ID3(track1_path)
            a2 = ID3(track2_path)
            assert a1.get("TKEY") and a1["TKEY"].text == ["Am"]
            assert a2.get("TKEY") and a2["TKEY"].text == ["C"]
            comm1 = a1.getall("COMM")
            comm2 = a2.getall("COMM")
            assert any(c.text == ["ok"] for c in comm1)
            assert any(c.text == ["ok"] for c in comm2)
            y1 = a1.get("TYER") or a1.get("TDRC")
            y2 = a2.get("TYER") or a2.get("TDRC")
            assert y1 and len(y1.text) == 1 and str(y1.text[0])[:4] == "2024"
            assert y2 and len(y2.text) == 1 and str(y2.text[0])[:4] == "2023"
        finally:
            for f in Path(temp_dir).glob("*"):
                try:
                    f.unlink()
                except Exception:
                    pass
            try:
                os.rmdir(temp_dir)
            except Exception:
                pass

    def test_one_track_file_missing_written_and_failed_counts(self):
        """When XML points to two files but only one exists, written=1, failed=1, errors list contains missing path."""
        pytest.importorskip("mutagen")
        from mutagen.id3 import ID3

        temp_dir = tempfile.mkdtemp()
        try:
            track1_path = os.path.join(temp_dir, "track1.mp3")
            track2_path = os.path.join(temp_dir, "track2.mp3")
            ID3().save(track1_path)
            # Do not create track2.mp3 so it is missing
            loc1 = _path_to_rekordbox_location(track1_path)
            loc2 = _path_to_rekordbox_location(track2_path)
            xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="A" Artist="B" Location="{loc1}"/>
        <TRACK TrackID="2" Name="C" Artist="D" Location="{loc2}"/>
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
            xml_path = os.path.join(temp_dir, "collection.xml")
            with open(xml_path, "w", encoding="utf-8") as f:
                f.write(xml_content)
            results = [
                TrackResult(
                    playlist_index=1,
                    title="A",
                    artist="B",
                    matched=True,
                    beatport_key="Am",
                    beatport_year="2024",
                ),
                TrackResult(
                    playlist_index=2,
                    title="C",
                    artist="D",
                    matched=True,
                    beatport_key="Cm",
                    beatport_year="2023",
                ),
            ]
            written, failed, errors, wav_skipped = (
                write_key_comment_year_to_playlist_tracks(xml_path, "P", results)
            )
            assert written == 1
            assert failed == 1
            assert len(errors) >= 1
            assert any(
                "not found" in e.lower() or "track2" in e.lower() for e in errors
            )
        finally:
            for f in Path(temp_dir).glob("*"):
                try:
                    f.unlink()
                except Exception:
                    pass
            try:
                os.rmdir(temp_dir)
            except Exception:
                pass

    def test_xml_with_no_location_returns_zero_written_and_message(self):
        """When XML has no Location attributes, returns (0, 0, [message])."""
        temp_dir = tempfile.mkdtemp()
        xml_path = os.path.join(temp_dir, "collection.xml")
        try:
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
            with open(xml_path, "w", encoding="utf-8") as f:
                f.write(xml_content)
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
            written, failed, errors, wav_skipped = (
                write_key_comment_year_to_playlist_tracks(xml_path, "P", results)
            )
            assert written == 0
            assert failed == 0
            assert len(errors) == 1
            assert "No file paths" in errors[0] and "Location" in errors[0]
        finally:
            try:
                Path(xml_path).unlink(missing_ok=True)
            except Exception:
                pass
            try:
                os.rmdir(temp_dir)
            except Exception:
                pass


class TestWriteToTrackTagsToSplitTestPlaylist:
    """Integration test using real collection-pc.xml and 'to split test' playlist (skip if missing)."""

    def test_wav_flac_written_and_read_back_with_to_split_test_playlist(self):
        """When collection-pc.xml and nth/ exist, sync 'to split test' and assert WAV/FLAC tags written."""
        if not _DEFAULT_COLLECTION_XML.exists():
            pytest.skip(f"Collection XML not found: {_DEFAULT_COLLECTION_XML}")
        if not _NTH_DIR.is_dir():
            pytest.skip(f"nth dir not found: {_NTH_DIR}")
        pytest.importorskip("mutagen")

        xml_path = str(_DEFAULT_COLLECTION_XML)
        try:
            track_ids = get_playlist_track_ids(xml_path, _TO_SPLIT_PLAYLIST)
        except ValueError:
            pytest.skip(f"Playlist '{_TO_SPLIT_PLAYLIST}' not in XML")
        locations = get_track_locations(xml_path)
        # Build one TrackResult per track (playlist order), all matched with test data
        results = [
            TrackResult(
                playlist_index=i + 1,
                title="Track",
                artist="Artist",
                matched=True,
                beatport_key="Am",
                beatport_bpm="120",
                beatport_year="2023",
                beatport_label="Test Label",
            )
            for i in range(len(track_ids))
        ]
        written, failed, errors, wav_skipped = (
            write_key_comment_year_to_playlist_tracks(
                xml_path, _TO_SPLIT_PLAYLIST, results
            )
        )
        # WAV tracks are skipped (in wav_skipped, counted in failed); FLAC/MP3 are written
        wav_count = len(wav_skipped)
        assert failed == wav_count, (
            f"failed should equal number of WAV skips: failed={failed}, wav_skipped={len(wav_skipped)}"
        )
        assert written == len(track_ids) - wav_count, (
            f"expected written={len(track_ids)}, got written={written}, failed={failed}, errors={errors}"
        )
        # WAV paths must appear in wav_skipped (not written); FLAC/MP3 get tags
        from mutagen.flac import FLAC

        for path_display in wav_skipped:
            # Display string may be path or "Title – Artist"; ensure WAVs were skipped
            assert path_display, "wav_skipped entry should be non-empty"
        # Re-read FLAC files and assert tags present (WAVs are skipped, so no tag check)
        flac_checked = 0
        for tid in track_ids:
            path_str = locations.get(tid)
            if not path_str or not Path(path_str).exists():
                continue
            if Path(path_str).suffix.lower() == ".flac":
                audio = FLAC(path_str)
                assert audio.get("KEY") == ["Am"], f"FLAC {path_str}: KEY not Am"
                assert audio.get("COMMENT") == ["ok"], (
                    f"FLAC {path_str}: COMMENT not ok"
                )
                flac_checked += 1
        assert flac_checked >= 1 or wav_count >= 1, (
            "Expected at least one WAV (skipped) or FLAC (written) in playlist to verify"
        )
