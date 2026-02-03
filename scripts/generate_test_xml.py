#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate synthetic Rekordbox XML fixtures for testing.

Design 3.7, 3.60. Produces small (10), medium (500), large (10k) track fixtures
with deterministic structure for performance and regression tests.

Usage:
    python scripts/generate_test_xml.py [--medium] [--large] [--output-dir path]
"""

import argparse
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def generate_xml(num_tracks: int, playlist_name: str = "Generated Playlist") -> str:
    """Generate Rekordbox-style XML with num_tracks. Deterministic structure."""
    collection_lines = []
    track_keys = []
    for i in range(1, num_tracks + 1):
        bpm = 120 + (i % 20)
        key = ["Am", "C", "Dm", "F", "G", "Em", "Bm"][i % 7]
        genre = ["House", "Techno", "Deep House", "Progressive"][i % 4]
        year = "2024" if i % 2 == 0 else "2023"
        collection_lines.append(
            f'        <TRACK TrackID="{i}" Name="Track {i}" Artist="Artist {i}" '
            f'BPM="{bpm}.0" Key="{key}" Genre="{genre}" Year="{year}"/>'
        )
        track_keys.append(f'                <TRACK Key="{i}"/>')

    collection = "\n".join(collection_lines)
    keys_block = "\n".join(track_keys)

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <PRODUCT Name="rekordbox" Version="6.7.0"/>
    <COLLECTION>
{collection}
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="{playlist_name}" Type="1">
{keys_block}
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>
'''


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Rekordbox XML fixtures (3.7).")
    parser.add_argument("--small", action="store_true", help="Generate benchmark_1k.xml (1k tracks)")
    parser.add_argument("--medium", action="store_true", help="Generate medium.xml (500 tracks)")
    parser.add_argument("--large", action="store_true", help="Generate large.xml (10k tracks)")
    parser.add_argument("--benchmark", action="store_true", help="Generate all benchmark fixtures (1k, 5k, 10k)")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Output directory (default: SRC/tests/fixtures/rekordbox)",
    )
    args = parser.parse_args()

    root = get_project_root()
    out_dir = args.output_dir or (root / "SRC" / "tests" / "fixtures" / "rekordbox")
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.small:
        path = out_dir / "benchmark_1k.xml"
        path.write_text(generate_xml(1000, "Benchmark 1k"), encoding="utf-8")
        print(f"Generated {path} (1000 tracks)")
    if args.medium:
        path = out_dir / "medium.xml"
        path.write_text(generate_xml(500, "Medium Playlist"), encoding="utf-8")
        print(f"Generated {path} (500 tracks)")
    if args.large:
        path = out_dir / "large.xml"
        path.write_text(generate_xml(10_000, "Large Playlist"), encoding="utf-8")
        print(f"Generated {path} (10000 tracks)")
    if args.benchmark:
        (out_dir / "benchmark_1k.xml").write_text(generate_xml(1000, "Benchmark 1k"), encoding="utf-8")
        print(f"Generated {out_dir / 'benchmark_1k.xml'} (1000 tracks)")
        (out_dir / "benchmark_5k.xml").write_text(generate_xml(5000, "Benchmark 5k"), encoding="utf-8")
        print(f"Generated {out_dir / 'benchmark_5k.xml'} (5000 tracks)")
        (out_dir / "benchmark_10k.xml").write_text(generate_xml(10_000, "Benchmark 10k"), encoding="utf-8")
        print(f"Generated {out_dir / 'benchmark_10k.xml'} (10000 tracks)")
    if not args.small and not args.medium and not args.large and not args.benchmark:
        # Default: generate medium and large
        (out_dir / "medium.xml").write_text(generate_xml(500, "Medium Playlist"), encoding="utf-8")
        print(f"Generated {out_dir / 'medium.xml'} (500 tracks)")
        (out_dir / "large.xml").write_text(generate_xml(10_000, "Large Playlist"), encoding="utf-8")
        print(f"Generated {out_dir / 'large.xml'} (10000 tracks)")


if __name__ == "__main__":
    main()
