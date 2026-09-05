#!/usr/bin/env python3
"""Regenerate the tiny audio fixtures the player format check decodes (PLAYER-01).

The fixtures live in ``src/tests/fixtures/audio/`` and are committed, so tests
never need a network or an encoder. This script exists so they are reproducible
artifacts with a stated provenance rather than five binary blobs nobody can
account for.

What each one is:

``tone.wav``
    Written here with the standard library: 0.25 s of a 441 Hz sine at 44.1 kHz,
    16-bit stereo. 441 Hz is an exact number of cycles at this rate, so there is
    no discontinuity at the end.

``tone.flac`` / ``tone.aiff`` / ``tone.m4a``
    Transcoded from ``tone.wav`` by the *bundled mpv itself*, which is the only
    encoder this repository has. Using the shipped binary keeps the fixtures
    consistent with what the app will decode.

``tone.mp3``
    Constructed byte by byte, not encoded. The bundled build has no working MP3
    encoder (``libmp3lame`` is absent and the MediaFoundation wrapper writes
    zero bytes), and this repository has no ffmpeg. So the fixture is a valid
    MPEG-1 Layer III stream — correct frame headers, zeroed side info — which
    decodes to silence. It proves the MP3 *decoder* parses frames and emits PCM,
    which is what the format check asks; it cannot prove tone fidelity, and the
    check knows that (``FORMAT_FIXTURES`` marks it as non-tonal).

Usage::

    python scripts/make_audio_fixtures.py            # regenerate all five
    python scripts/make_audio_fixtures.py --check    # verify, change nothing
"""

from __future__ import annotations

import argparse
import math
import struct
import subprocess
import sys
import wave
from pathlib import Path
from typing import List, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = PROJECT_ROOT / "src" / "tests" / "fixtures" / "audio"

SAMPLE_RATE = 44100
SECONDS = 0.25
FREQ_HZ = 441.0
AMPLITUDE = 20000  # ~0.61 full scale, comfortably above the check's RMS floor

# MPEG-1 Layer III, 44.1 kHz, 128 kbps, stereo, no CRC.
#   0xFF 0xFB -> 11 sync bits, MPEG 1, Layer III, no CRC
#   0x90      -> bitrate index 9 (128 kbps), sample-rate index 0 (44.1 kHz)
#   0x00      -> stereo, no copyright/original/emphasis
MP3_HEADER = bytes([0xFF, 0xFB, 0x90, 0x00])
MP3_FRAME_BYTES = 144 * 128000 // SAMPLE_RATE  # 417
MP3_FRAMES = 10  # 10 * 1152 samples = 0.261 s


def write_wav(path: Path) -> None:
    frames = int(SAMPLE_RATE * SECONDS)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        data = bytearray()
        for i in range(frames):
            value = int(AMPLITUDE * math.sin(2 * math.pi * FREQ_HZ * i / SAMPLE_RATE))
            data += struct.pack("<hh", value, value)
        wav.writeframes(bytes(data))


def write_mp3(path: Path) -> None:
    frame = MP3_HEADER + bytes(MP3_FRAME_BYTES - len(MP3_HEADER))
    path.write_bytes(frame * MP3_FRAMES)


def transcode(mpv: Path, source: Path, dest: Path, codec: str, container: str) -> None:
    dest.unlink(missing_ok=True)
    result = subprocess.run(
        [
            str(mpv),
            "--no-config",
            "--really-quiet",
            str(source),
            f"--o={dest}",
            f"--oac={codec}",
            f"--of={container}",
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if not dest.exists() or dest.stat().st_size == 0:
        raise SystemExit(
            f"mpv produced no output for {dest.name} ({codec}/{container}).\n"
            f"{result.stdout}\n{result.stderr}"
        )


def resolve_mpv() -> Path:
    """Locate the bundled player sidecar, which must be fetched first."""
    sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
    from fetch_player_sidecar import (  # noqa: E402
        DEFAULT_DEST,
        binary_path_for,
        host_target_key,
        load_manifest,
    )

    manifest = load_manifest()
    target = manifest.target(host_target_key())
    binary = binary_path_for(target, DEFAULT_DEST)
    if not binary.exists():
        raise SystemExit(
            f"Player sidecar not installed at {binary}.\n"
            "Run: python scripts/fetch_player_sidecar.py"
        )
    return binary


def expected_files() -> List[Path]:
    return [
        FIXTURE_DIR / name
        for name in ("tone.wav", "tone.flac", "tone.aiff", "tone.m4a", "tone.mp3")
    ]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Regenerate player audio fixtures")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only report whether every fixture is present and non-empty",
    )
    args = parser.parse_args(argv)

    if args.check:
        missing = [
            p for p in expected_files() if not p.exists() or p.stat().st_size == 0
        ]
        if missing:
            print("Missing or empty fixtures:", file=sys.stderr)
            for path in missing:
                print(f"  {path.relative_to(PROJECT_ROOT)}", file=sys.stderr)
            return 1
        for path in expected_files():
            print(f"OK {path.relative_to(PROJECT_ROOT)} ({path.stat().st_size} bytes)")
        return 0

    mpv = resolve_mpv()
    wav = FIXTURE_DIR / "tone.wav"

    write_wav(wav)
    print(f"wrote {wav.name} ({wav.stat().st_size} bytes)")

    for name, codec, container in (
        ("tone.flac", "flac", "flac"),
        ("tone.aiff", "pcm_s16be", "aiff"),
        ("tone.m4a", "alac", "ipod"),
    ):
        dest = FIXTURE_DIR / name
        transcode(mpv, wav, dest, codec, container)
        print(
            f"wrote {dest.name} ({dest.stat().st_size} bytes) via mpv {codec}/{container}"
        )

    mp3 = FIXTURE_DIR / "tone.mp3"
    write_mp3(mp3)
    print(
        f"wrote {mp3.name} ({mp3.stat().st_size} bytes) - constructed silence, see module docstring"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
