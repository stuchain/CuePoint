#!/usr/bin/env python3
"""One-off: set all ID3 frames we don't write (TALB, TPE2, TXXX, etc.) to '1' for a WAV."""

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from mutagen.wave import WAVE
from mutagen.wave import _WaveFile  # noqa: PLC2701
from mutagen.id3 import COMM, TKEY, TBPM, TCON, TPUB, TYER, TDRC, TXXX, Encoding

OUR_FRAMES = {"TKEY", "COMM", "TYER", "TDRC", "TPUB", "TBPM", "TCON"}


def main() -> None:
    path = PROJECT_ROOT / "nth" / "Sebastien Leger - Son of Sun (Orginal Mix).wav"
    if not path.exists():
        print("File not found:", path)
        sys.exit(1)

    audio = WAVE(str(path))
    if audio.tags is None:
        print("No tags")
        return

    enc = Encoding.LATIN1
    modified = []

    for key in list(audio.tags.keys()):
        base = key.split(":")[0] if ":" in key else key
        if base in OUR_FRAMES:
            continue

        if key.startswith("TXXX:"):
            parts = key.split(":", 2)
            desc = parts[1] if len(parts) >= 2 else ""
            audio.tags.delall(key)
            audio.tags.add(TXXX(encoding=enc, desc=desc, text=["1"]))
            modified.append(key)
        elif key.startswith("COMM"):
            audio.tags.delall(key)
            audio.tags.add(COMM(encoding=enc, lang="XXX", desc="", text=["1"]))
            modified.append(key)
        else:
            frame = audio.tags[key]
            audio.tags[key] = type(frame)(encoding=enc, text=["1"])
            modified.append(key)

    if not modified:
        print("No unwritten frames to change")
        return

    with open(path, "r+b") as f:
        w = _WaveFile(f)
        if "id3" in w:
            w.delete_chunk("id3")
    audio.save(v2_version=3)
    print("Set to '1':", modified)


if __name__ == "__main__":
    main()
