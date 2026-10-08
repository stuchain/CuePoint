#!/usr/bin/env python3
"""Check that every Mach-O file in a packaged macOS app is for the leg's chip (DIST-02, DEC-129).

CI builds the Mac app twice, on an Apple Silicon runner and on an Intel runner.
A bundle is only as good as its least compatible file: one arm64-only library
inside the Intel app (the engine sidecar, mpv or a library either carries) and
the app starts on no Intel Mac, which nothing at build time says. This walks the
bundle and asks ``lipo -archs`` about each Mach-O file.

A universal file passes if it contains the chip. Symlinks are skipped (the
target is checked where it lives) and so is anything that is not Mach-O.

Usage::

    python scripts/check_bundle_arch.py apps/desktop-electron/release/mac-arm64/CuePoint.app --arch arm64
    python scripts/check_bundle_arch.py apps/desktop-electron/release/mac/CuePoint.app --arch x64

Exit 0 when every Mach-O file has the chip, 1 when any does not, 2 when the app
path does not exist.
"""

from __future__ import annotations

import argparse
import struct
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

#: The leg's chip as ``--arch`` spells it, and as ``lipo -archs`` does.
LIPO_ARCH = {"arm64": "arm64", "x64": "x86_64"}

#: Thin Mach-O magics, in both byte orders (32 and 64 bit).
_THIN_MAGICS = {
    bytes.fromhex(m) for m in ("feedface", "feedfacf", "cefaedfe", "cffaedfe")
}
#: Fat (universal) magics. ``cafebabe`` is also the Java class file magic.
_FAT_MAGICS = {
    bytes.fromhex(m) for m in ("cafebabe", "bebafeca", "cafebabf", "bfbafeca")
}
#: The byte-swapped fat magics, whose architecture count is little-endian.
_FAT_SWAPPED = {bytes.fromhex("bebafeca"), bytes.fromhex("bfbafeca")}
#: A fat header counts its architectures; a Java class has a version number
#: there (45 and up), so a small count separates the two.
_MAX_FAT_ARCHS = 20

Runner = Callable[[list[str]], list[str]]


def is_macho(path: Path) -> bool:
    """True if the file starts like a Mach-O or fat binary (and not a Java class)."""
    try:
        with path.open("rb") as f:
            head = f.read(8)
    except OSError:
        return False
    if len(head) < 4:
        return False
    magic = head[:4]
    if magic in _THIN_MAGICS:
        return True
    if magic in _FAT_MAGICS:
        if len(head) < 8:
            return False
        # The architecture count is big-endian in a fat header, whichever magic.
        (count,) = struct.unpack(">I", head[4:8])
        if magic in _FAT_SWAPPED:
            (count,) = struct.unpack("<I", head[4:8])
        return 0 < count < _MAX_FAT_ARCHS
    return False


def run_lipo(cmd: list[str]) -> list[str]:
    """Run ``lipo -archs <file>`` and return the architectures it names."""
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed: {result.stderr.strip()}")
    return result.stdout.split()


def check(app: Path, arch: str, runner: Runner = run_lipo) -> list[Path]:
    """Return the Mach-O files under ``app`` that lack the chip for ``arch``."""
    return [p for p, _ in _scan(app, arch, runner)[1]]


def _scan(app: Path, arch: str, runner: Runner):
    want = LIPO_ARCH[arch]
    checked = 0
    bad: list = []
    for path in sorted(app.rglob("*")):
        if path.is_symlink() or not path.is_file() or not is_macho(path):
            continue
        checked += 1
        try:
            archs = runner(["lipo", "-archs", str(path)])
        except RuntimeError as err:
            bad.append((path, str(err)))
            continue
        if want not in archs:
            bad.append((path, f"has {' '.join(archs) or 'nothing'}, needs {want}"))
    return checked, bad


def main(argv: Sequence[str] | None = None, runner: Runner = run_lipo) -> int:
    parser = argparse.ArgumentParser(
        description="Check every Mach-O file in a packaged app is for one chip"
    )
    parser.add_argument("app", type=Path, help="Path to the .app bundle")
    parser.add_argument("--arch", required=True, choices=sorted(LIPO_ARCH))
    args = parser.parse_args(argv)

    if not args.app.exists():
        print(f"App not found: {args.app}", file=sys.stderr)
        return 2

    checked, bad = _scan(args.app, args.arch, runner)
    if bad:
        print(
            f"{len(bad)} file(s) in {args.app.name} are not for {args.arch}:",
            file=sys.stderr,
        )
        for path, why in bad:
            print(f"  {path.relative_to(args.app)}: {why}", file=sys.stderr)
        return 1

    print(
        f"OK {args.app.name}: {checked} Mach-O file(s), all contain {LIPO_ARCH[args.arch]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
