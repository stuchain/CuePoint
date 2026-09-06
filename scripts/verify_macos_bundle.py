#!/usr/bin/env python3
"""Check that a packaged macOS app is in a state Apple would notarize.

Notarization fails late. It needs credentials, a network round trip and several
minutes, and it reports its objections about a bundle that was built on someone
else's machine — usually a release machine, usually at the worst time. Nearly
everything it objects to is visible locally, immediately, without an Apple
Developer ID, and that is what this checks.

The bug that prompted it: upstream's ``mpv.app`` ships two empty ``.gitkeep``
files inside ``Contents/MacOS`` with their AppleDouble ``._`` companions.
Everything under ``Contents/MacOS`` is treated as code, so ``codesign`` refuses
the whole player bundle::

    mpv.app: code object is not signed at all
    In subcomponent: .../Contents/MacOS/._.gitkeep

The nested player therefore could not be signed, and an app whose nested code is
unsigned cannot be notarized. Nothing on Windows says a word about it, and the
macOS build only fails once someone has a certificate to fail with.

What is checked, in the order a submission would trip over it:

1. No AppleDouble or placeholder detritus anywhere in the bundle.
2. Every Mach-O binary carries a signature.
3. The app and both bundled sidecars run under the hardened runtime.
4. The app declares the entitlements Electron needs to start under it.
5. ``codesign --verify --deep --strict`` accepts the bundle.

An ad-hoc signature satisfies all five, so this is runnable on any Mac and in
CI. It deliberately does **not** claim the app is notarized: what it says is
that nothing structural stands in the way, which is the half that can be known
without Apple.

Usage::

    python scripts/verify_macos_bundle.py apps/desktop-electron/release/mac-arm64/CuePoint.app
    python scripts/verify_macos_bundle.py <app> --expect-hardened-runtime
"""

from __future__ import annotations

import argparse
import plistlib
import subprocess
import sys
from pathlib import Path
from typing import List, Tuple

#: Files that make a bundle unsignable. ``._name`` is an AppleDouble companion
#: carrying a resource fork; ``.gitkeep`` is an empty placeholder that has no
#: business in a shipped bundle and draws the same refusal when it sits in a
#: directory whose contents are treated as code.
DETRITUS_PREFIXES = ("._",)
DETRITUS_NAMES = (".DS_Store", ".gitkeep")

#: Entitlements an Electron app cannot start without under the hardened runtime.
#: V8 writes and executes JIT pages; without these the renderer crashes on
#: launch rather than failing at build time.
REQUIRED_ENTITLEMENTS = (
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-unsigned-executable-memory",
)

#: The bundled sidecars, relative to ``Contents/Resources``. Both are foreign
#: code — mpv is a third-party binary, the engine is PyInstaller's bootloader —
#: and both have to be signed by the submitting team with the hardened runtime.
SIDECARS = (
    "player/mpv.app",
    "engine/cuepoint-engine",
)


class BundleProblem(Exception):
    """Something that would stop a notarization submission."""


def _run(args: List[str]) -> Tuple[int, str]:
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.returncode, (proc.stderr or "") + (proc.stdout or "")


def find_detritus(app: Path) -> List[Path]:
    """Files whose mere presence makes ``codesign`` refuse the bundle."""
    found = []
    for path in app.rglob("*"):
        if not path.is_file():
            continue
        if path.name.startswith(DETRITUS_PREFIXES) or path.name in DETRITUS_NAMES:
            found.append(path)
    return sorted(found)


def is_macho(path: Path) -> bool:
    """Whether a file is a Mach-O image, by its magic rather than its name.

    Extensions are unreliable here: mpv's libraries are ``.dylib``, PyInstaller's
    bootloader has no extension at all, and neither does a helper executable.
    """
    try:
        with path.open("rb") as handle:
            magic = handle.read(4)
    except OSError:
        return False
    return magic in (
        b"\xcf\xfa\xed\xfe",  # 64-bit little-endian
        b"\xce\xfa\xed\xfe",  # 32-bit little-endian
        b"\xfe\xed\xfa\xcf",  # 64-bit big-endian
        b"\xfe\xed\xfa\xce",  # 32-bit big-endian
        b"\xca\xfe\xba\xbe",  # universal
    )


def unsigned_binaries(app: Path) -> List[Path]:
    """Mach-O images carrying no signature at all."""
    unsigned = []
    for path in app.rglob("*"):
        if not path.is_file() or path.is_symlink() or not is_macho(path):
            continue
        code, _ = _run(["codesign", "--verify", str(path)])
        if code != 0:
            # Re-ask for the detail: a *bad* signature and *no* signature are
            # different problems, and only the second is this check's business.
            _, detail = _run(["codesign", "-dv", str(path)])
            if "code object is not signed" in detail:
                unsigned.append(path)
    return sorted(unsigned)


def signing_flags(target: Path) -> str:
    code, out = _run(["codesign", "-dv", str(target)])
    if code != 0:
        raise BundleProblem(f"{target.name} carries no signature to inspect")
    for line in out.splitlines():
        if line.startswith("CodeDirectory"):
            return line
    return ""


def has_hardened_runtime(target: Path) -> bool:
    """Whether the code was signed with ``--options runtime``.

    ``codesign`` reports it in the CodeDirectory flags as ``runtime``; Apple
    rejects a submission containing any executable without it.
    """
    return "runtime" in signing_flags(target)


def entitlements(app: Path) -> dict:
    code, out = _run(["codesign", "-d", "--entitlements", ":-", str(app)])
    if code != 0 or not out.strip():
        return {}
    start = out.find("<?xml")
    if start < 0:
        return {}
    try:
        return plistlib.loads(out[start:].encode("utf-8"))
    except Exception:
        return {}


def check(app: Path, *, require_hardened: bool) -> List[str]:
    """Every problem found, rather than only the first.

    A release engineer fixing these one submission at a time is the failure mode
    this whole script exists to avoid.
    """
    problems: List[str] = []

    if not app.is_dir():
        return [f"{app} is not an app bundle"]

    detritus = find_detritus(app)
    if detritus:
        listed = "\n    ".join(str(p.relative_to(app)) for p in detritus[:10])
        problems.append(
            f"{len(detritus)} file(s) codesign refuses to have in a bundle:\n    {listed}\n"
            "    Strip them at install time — see `_strip_bundle_detritus` in "
            "scripts/fetch_player_sidecar.py."
        )

    for relative in SIDECARS:
        target = app / "Contents" / "Resources" / relative
        if not target.exists():
            problems.append(
                f"bundled sidecar missing: Contents/Resources/{relative}. "
                "A packaged build without it ships no engine or no player."
            )
            continue
        if require_hardened:
            try:
                if not has_hardened_runtime(target):
                    problems.append(
                        f"{relative} is not signed with the hardened runtime; "
                        "Apple rejects any executable in the bundle without it"
                    )
            except BundleProblem as exc:
                problems.append(str(exc))

    unsigned = unsigned_binaries(app)
    if unsigned:
        listed = "\n    ".join(str(p.relative_to(app)) for p in unsigned[:10])
        problems.append(f"{len(unsigned)} unsigned Mach-O binary/ies:\n    {listed}")

    if require_hardened:
        declared = entitlements(app)
        missing = [key for key in REQUIRED_ENTITLEMENTS if not declared.get(key)]
        if missing:
            problems.append(
                "the app does not declare "
                + ", ".join(missing)
                + "; Electron's renderer crashes on launch under the hardened "
                "runtime without them"
            )

    code, out = _run(["codesign", "--verify", "--deep", "--strict", str(app)])
    if code != 0:
        problems.append(f"codesign --verify --deep --strict failed:\n    {out.strip()}")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check a packaged macOS app is notarization-ready"
    )
    parser.add_argument("app", type=Path, help="Path to the .app bundle")
    parser.add_argument(
        "--expect-hardened-runtime",
        action="store_true",
        help=(
            "Also require the hardened runtime and entitlements. Off by default "
            "so an unsigned developer build can still be checked for the "
            "structural problems, which are the ones that surprise people."
        ),
    )
    args = parser.parse_args()

    if sys.platform != "darwin":
        print("Not macOS; nothing to check.")
        return 0

    problems = check(args.app, require_hardened=args.expect_hardened_runtime)
    if problems:
        print(f"\n{args.app} is NOT ready to notarize:\n", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    print(f"OK {args.app.name}: nothing structural stands in the way of notarization")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
