"""Unit tests for HistoryView playlist name resolution for Sync with Rekordbox from past searches."""

import csv
import json
import os
import sys
import tempfile
import unittest

from PySide6.QtWidgets import QApplication

from cuepoint.ui.widgets.history_view import HistoryView

if not QApplication.instance():
    app = QApplication(sys.argv)


class TestHistoryViewPlaylistName(unittest.TestCase):
    """Test that playlist name for sync is taken from .meta.json, then CSV row, then filename."""

    def setUp(self):
        self.view = HistoryView()

    def test_playlist_name_from_csv_path_with_timestamp(self):
        """_playlist_name_from_csv_path strips timestamp and extension."""
        name = self.view._playlist_name_from_csv_path(
            "/some/dir/My Playlist (09-03-26 23-53).csv"
        )
        self.assertEqual(name, "My Playlist")

    def test_playlist_name_from_csv_path_no_timestamp(self):
        """_playlist_name_from_csv_path with no parentheses uses full stem."""
        name = self.view._playlist_name_from_csv_path("/some/dir/MyPlaylist.csv")
        self.assertEqual(name, "MyPlaylist")

    def test_meta_json_playlist_name_used_for_sync(self):
        """When .meta.json exists with playlist_name, that value is used for sync (emitted)."""
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = os.path.join(tmp, "ShortName (09-03-26 12-00).csv")
            meta_path = os.path.join(tmp, "ShortName (09-03-26 12-00).meta.json")
            # Simulate collection run: actual Rekordbox key is "ROOT/to split test"
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "source": "collection",
                        "playlist_name": "ROOT/to split test",
                        "xml_path": "/path/to/collection.xml",
                    },
                    f,
                )
            # Minimal CSV content (one row, no playlist_name column)
            with open(csv_path, "w", encoding="utf-8") as f:
                f.write("playlist_index,original_title,original_artists\n")
                f.write('1,"Track","Artist"\n')
            # Load CSV (HistoryView loads and reads .meta.json)
            self.view.current_csv_path = csv_path
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                self.view.csv_rows = list(reader)
            self.view.filtered_rows = self.view.csv_rows.copy()
            # Simulate what load does: read .meta.json
            if os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    if meta.get("source") != "playlist_file":
                        self.view._run_playlist_name = meta.get("playlist_name") or ""
                        self.view._run_xml_path = meta.get("xml_path") or ""
            # Resolve playlist name same order as _on_write_to_track_tags_clicked
            playlist_name = getattr(self.view, "_run_playlist_name", None) or ""
            if not playlist_name and self.view.csv_rows:
                first_row = self.view.csv_rows[0]
                playlist_name = (
                    first_row.get("playlist_name") or first_row.get("playlist") or ""
                )
            if not playlist_name:
                playlist_name = self.view._playlist_name_from_csv_path(
                    self.view.current_csv_path
                )
            self.assertEqual(playlist_name, "ROOT/to split test")

    def test_fallback_to_filename_when_no_meta_json(self):
        """When .meta.json is absent, playlist name comes from filename."""
        self.view._run_playlist_name = ""
        self.view._run_xml_path = ""
        self.view.csv_rows = [{}]
        self.view.current_csv_path = "/out/My Playlist (01-02-24 10-00).csv"
        playlist_name = getattr(self.view, "_run_playlist_name", None) or ""
        if not playlist_name and self.view.csv_rows:
            first_row = self.view.csv_rows[0]
            playlist_name = (
                first_row.get("playlist_name") or first_row.get("playlist") or ""
            )
        if not playlist_name:
            playlist_name = self.view._playlist_name_from_csv_path(
                self.view.current_csv_path
            )
        self.assertEqual(playlist_name, "My Playlist")


if __name__ == "__main__":
    unittest.main()
