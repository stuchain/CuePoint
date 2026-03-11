#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Diagnostic script for WAV/FLAC tag write using "to split test" playlist.

Parses a Rekordbox XML (default: collection-pc.xml), gets track IDs for the
"to split test" playlist, and calls write_key_comment_year_to_file for each
track. Logs path, suffix, status, and re-reads tags to confirm persistence.

Usage:
    python scripts/debug_sync_to_split_test.py [xml_path]
    # From project root; xml_path defaults to s:\\Downloads\\collection-pc.xml
"""

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SOURCE_DIR = PROJECT_ROOT / "src"
if str(SOURCE_DIR) not in sys.path:
    sys.path.insert(0, str(SOURCE_DIR))

# After path setup
from cuepoint.data.rekordbox import get_playlist_track_ids, get_track_locations
from cuepoint.data.tag_writer import write_key_comment_year_to_file


def _wav_chunk_order(path: Path) -> str:
    """Return RIFF chunk order for a WAV file (e.g. 'fmt, data, LIST, id3') for diagnostics."""
    try:
        from mutagen.wave import _WaveFile  # noqa: PLC2701
        with open(path, "rb") as f:
            w = _WaveFile(f)
            chunks = [c.id for c in w.root.subchunks()]
            return ", ".join(chunks) if chunks else "(none)"
    except Exception as e:
        return f"(error: {e})"


def main() -> None:
    xml_path = sys.argv[1] if len(sys.argv) > 1 else r"s:\Downloads\collection-pc.xml"
    playlist_name = "to split test"

    if not Path(xml_path).exists():
        print(f"XML not found: {xml_path}")
        sys.exit(1)

    print(f"XML: {xml_path}")
    print(f"Playlist: {playlist_name}")
    print("-" * 60)

    try:
        track_ids = get_playlist_track_ids(xml_path, playlist_name)
    except ValueError as e:
        print(f"Playlist not found: {e}")
        sys.exit(1)

    locations = get_track_locations(xml_path)
    test_attrs = ("Am", "ok", "2023", "Test", "120", "House")

    for tid in track_ids:
        path = locations.get(tid)
        if not path:
            print(f"[{tid}] NO LOCATION")
            continue
        suffix = Path(path).suffix.lower()
        exists = Path(path).exists()
        print(f"[{tid}] {path}")
        print(f"       suffix={suffix} exists={exists}")

        if not exists:
            print(f"       SKIP (file not found)")
            continue

        status, err = write_key_comment_year_to_file(path, *test_attrs)
        print(f"       status={status} err={err or '-'}")

        # Re-read tags to confirm
        try:
            if suffix == ".mp3":
                from mutagen.id3 import ID3
                audio = ID3(path)
                key = audio.get("TKEY")
                key_val = key.text[0] if key else None
                comm = audio.getall("COMM")
                comment = comm[0].text[0] if comm else None
            elif suffix == ".wav":
                from mutagen import File
                audio = File(path)
                key = audio.tags.get("TKEY") if audio.tags else None
                key_val = key.text[0] if key else None
                comm = audio.tags.getall("COMM") if audio.tags else []
                comment = comm[0].text[0] if comm else None
                print(f"       RIFF chunks: {_wav_chunk_order(Path(path))}")
            elif suffix == ".flac":
                from mutagen.flac import FLAC
                audio = FLAC(path)
                key_val = audio.get("KEY", [None])[0] if audio.get("KEY") else None
                initialkey = audio.get("INITIALKEY", [None])[0] if audio.get("INITIALKEY") else None
                comment = audio.get("COMMENT", [None])[0] if audio.get("COMMENT") else None
                print(f"       READ BACK: KEY={key_val!r} INITIALKEY={initialkey!r} COMMENT={comment!r}")
                continue
            else:
                key_val = comment = "(not read)"
            if suffix != ".flac":
                print(f"       READ BACK: KEY={key_val!r} COMMENT={comment!r}")
        except Exception as e:
            print(f"       READ BACK: exception {e}")
        print()

    print("Done.")


if __name__ == "__main__":
    main()
