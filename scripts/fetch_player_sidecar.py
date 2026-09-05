#!/usr/bin/env python3
"""Fetch, verify and install the bundled mpv player sidecar (PLAYER-01, DEC-049).

The engine sidecar is *built* from this repository by ``build_engine_sidecar.py``.
The player sidecar is not ours to build: DEC-049 chose to ship the official
prebuilt ``mpv`` binary and drive it over JSON IPC, so this script's job is to
**acquire** one reproducibly rather than to compile one.

Reproducibly is the whole design. ``scripts/player_sidecar_manifest.json`` pins
an exact release asset per target with its SHA-256, and nothing is installed
until the bytes on disk hash to the pinned value. A mismatch is a hard failure,
never a warning — an unverified media decoder is not something to shrug at.

**The rotation problem, and why this script has an update mode.** mpv publishes
no binaries on its stable tags (``v0.40.0`` and friends carry zero assets); the
only first-party builds live on the rolling ``git-release`` tag, whose assets
are replaced whenever CI publishes a new build. A pin therefore has a shelf
life, and when it expires the asset 404s. That case is detected and reported as
what it is, with the command that fixes it, instead of failing as a generic
network error::

    python scripts/fetch_player_sidecar.py --update-manifest

which re-pins every target, refreshes the licence texts, and leaves the diff for
a human to review and commit.

Layout produced (mirroring ``resources/engine/`` so packaging is one pattern)::

    apps/desktop-electron/resources/player/win-x64/mpv.exe
    apps/desktop-electron/resources/player/mac-arm64/mpv.app/Contents/MacOS/mpv

The directory names are electron-builder's `${os}-${arch}` vocabulary, because
that is what `extraResources` expands when packaging.

Nothing here is committed: ``resources/player/`` is build output, exactly as
``resources/engine/`` is.

Usage::

    python scripts/fetch_player_sidecar.py                 # host platform
    python scripts/fetch_player_sidecar.py --target all    # every pinned target
    python scripts/fetch_player_sidecar.py --verify-only   # re-check an install
    python scripts/fetch_player_sidecar.py --check-formats # decode the fixtures
    python scripts/fetch_player_sidecar.py --print-path    # where the binary is
    python scripts/fetch_player_sidecar.py --update-manifest
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = PROJECT_ROOT / "scripts" / "player_sidecar_manifest.json"
DEFAULT_DEST = PROJECT_ROOT / "apps" / "desktop-electron" / "resources" / "player"
DEFAULT_CACHE = PROJECT_ROOT / ".cache" / "player-sidecar"
LICENSE_DIR = PROJECT_ROOT / "third_party" / "mpv"
FIXTURE_DIR = PROJECT_ROOT / "src" / "tests" / "fixtures" / "audio"

#: Written beside the installed binary so ``--verify-only`` can tell a good
#: install from a half-finished or corrupted one without re-downloading.
RECEIPT_NAME = "installed.json"

DOWNLOAD_TIMEOUT_SECONDS = 300
DOWNLOAD_ATTEMPTS = 3
CHUNK_BYTES = 1 << 20


class PlayerSidecarError(RuntimeError):
    """Any failure that should stop the build with an explanation."""


class AssetRotatedError(PlayerSidecarError):
    """The pinned asset is gone from the release — the pin needs refreshing.

    Distinct from a generic download failure on purpose: the fix is a manifest
    update and a review, not a retry, and saying so saves the reader the
    detective work.
    """


class ChecksumMismatchError(PlayerSidecarError):
    """Downloaded bytes did not hash to the pinned value."""


class SmokeTestError(PlayerSidecarError):
    """The installed binary is not the one the manifest promised."""


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Target:
    """One pinned artifact for one platform/architecture pair."""

    key: str
    supported: bool
    platform_dir: str
    asset: str = ""
    url: str = ""
    sha256: str = ""
    size: int = 0
    #: ``zip`` (members sit at the archive root) or ``zip+tar.gz`` (the zip
    #: holds a single tarball, which holds the payload — macOS ships this way).
    archive: str = "zip"
    inner_archive: str = ""
    #: Paths inside the archive to install. An explicit list, not everything:
    #: the Windows build ships ``mpv-register.bat``, which registers mpv as a
    #: system media player and has no business inside CuePoint's resources.
    install: Tuple[str, ...] = ()
    #: The executable, relative to the install directory.
    binary: str = ""
    note: str = ""

    @property
    def is_nested(self) -> bool:
        return self.archive == "zip+tar.gz"


@dataclass(frozen=True)
class Manifest:
    component: str
    version: str
    commit: str
    repo: str
    tag: str
    license_spdx: str
    license_files: Tuple[str, ...]
    source_url: str
    required_decoders: Tuple[str, ...]
    required_options: Tuple[str, ...]
    targets: Dict[str, Target]
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    def target(self, key: str) -> Target:
        try:
            return self.targets[key]
        except KeyError:
            known = ", ".join(sorted(self.targets)) or "(none)"
            raise PlayerSidecarError(
                f"No pinned player sidecar for target {key!r}. Pinned targets: {known}."
            ) from None


def _require(mapping: Dict[str, Any], key: str, where: str) -> Any:
    if key not in mapping:
        raise PlayerSidecarError(f"Manifest {where} is missing required key {key!r}")
    return mapping[key]


def parse_manifest(data: Dict[str, Any]) -> Manifest:
    """Validate and structure a manifest mapping.

    Split from :func:`load_manifest` so the validation rules are testable
    without a file, which is most of what is worth testing here.
    """
    if not isinstance(data, dict):
        raise PlayerSidecarError("Manifest must be a JSON object")

    targets: Dict[str, Target] = {}
    raw_targets = _require(data, "targets", "root")
    if not isinstance(raw_targets, dict) or not raw_targets:
        raise PlayerSidecarError("Manifest 'targets' must be a non-empty object")

    for key, raw in raw_targets.items():
        if not isinstance(raw, dict):
            raise PlayerSidecarError(f"Manifest target {key!r} must be an object")
        supported = bool(raw.get("supported", True))
        platform_dir = _require(raw, "platform_dir", f"target {key!r}")
        if not supported:
            targets[key] = Target(
                key=key,
                supported=False,
                platform_dir=str(platform_dir),
                note=str(raw.get("note", "")),
            )
            continue

        archive = str(raw.get("archive", "zip"))
        if archive not in ("zip", "zip+tar.gz"):
            raise PlayerSidecarError(
                f"Manifest target {key!r} has unsupported archive kind {archive!r}"
            )
        sha256 = str(_require(raw, "sha256", f"target {key!r}")).lower()
        if not re.fullmatch(r"[0-9a-f]{64}", sha256):
            raise PlayerSidecarError(
                f"Manifest target {key!r} has a malformed sha256: {sha256!r}"
            )
        install = tuple(str(p) for p in raw.get("install", ()))
        if not install:
            raise PlayerSidecarError(f"Manifest target {key!r} installs nothing")
        binary = str(_require(raw, "binary", f"target {key!r}"))
        if not any(
            binary == p or binary.startswith(p.rstrip("/") + "/") for p in install
        ):
            raise PlayerSidecarError(
                f"Manifest target {key!r} names binary {binary!r}, which is not "
                f"covered by its install list {install!r}"
            )
        targets[key] = Target(
            key=key,
            supported=True,
            platform_dir=str(platform_dir),
            asset=str(_require(raw, "asset", f"target {key!r}")),
            url=str(_require(raw, "url", f"target {key!r}")),
            sha256=sha256,
            size=int(raw.get("size", 0)),
            archive=archive,
            inner_archive=str(raw.get("inner_archive", "")),
            install=install,
            binary=binary,
            note=str(raw.get("note", "")),
        )

    lic = _require(data, "license", "root")
    return Manifest(
        component=str(_require(data, "component", "root")),
        version=str(_require(data, "version", "root")),
        commit=str(data.get("commit", "")),
        repo=str(_require(data, "repo", "root")),
        tag=str(_require(data, "tag", "root")),
        license_spdx=str(_require(lic, "spdx", "license")),
        license_files=tuple(str(f) for f in lic.get("files", ())),
        source_url=str(lic.get("source_url", "")),
        required_decoders=tuple(str(d) for d in data.get("required_decoders", ())),
        required_options=tuple(str(o) for o in data.get("required_options", ())),
        targets=targets,
        raw=data,
    )


def load_manifest(path: Path = DEFAULT_MANIFEST) -> Manifest:
    if not path.exists():
        raise PlayerSidecarError(f"Manifest not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PlayerSidecarError(f"Manifest is not valid JSON ({path}): {exc}") from exc
    return parse_manifest(data)


# ---------------------------------------------------------------------------
# Target resolution
# ---------------------------------------------------------------------------


def normalize_arch(machine: str) -> str:
    """Map a ``platform.machine()`` value onto the manifest's arch vocabulary."""
    m = machine.lower()
    if m in ("amd64", "x86_64", "x64"):
        return "x64"
    if m in ("arm64", "aarch64"):
        return "arm64"
    return m or "unknown"


def host_target_key(system: Optional[str] = None, machine: Optional[str] = None) -> str:
    """The manifest key for the machine this is running on.

    ``win32``/``darwin``/``linux`` rather than ``Windows``/``Darwin``/``Linux``
    so the vocabulary matches Node's ``process.platform``, which is what the
    Electron side of this contract speaks.
    """
    sys_name = (system or platform.system()).lower()
    plat = {"windows": "win32", "darwin": "darwin", "linux": "linux"}.get(
        sys_name, sys_name
    )
    return f"{plat}-{normalize_arch(machine or platform.machine())}"


def install_dir_for(target: Target, dest_root: Path) -> Path:
    return dest_root / target.platform_dir


def binary_path_for(target: Target, dest_root: Path) -> Path:
    return install_dir_for(target, dest_root) / target.binary


# ---------------------------------------------------------------------------
# Download and verification
# ---------------------------------------------------------------------------


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksum(path: Path, expected: str, *, what: str) -> None:
    actual = sha256_file(path)
    if actual != expected.lower():
        raise ChecksumMismatchError(
            f"Checksum mismatch for {what}\n"
            f"  file:     {path}\n"
            f"  expected: {expected}\n"
            f"  actual:   {actual}\n"
            "Refusing to install. Delete the cached file and retry; if it keeps "
            "failing, the pinned asset was replaced upstream — re-pin with "
            "`python scripts/fetch_player_sidecar.py --update-manifest` and review "
            "the diff before committing it."
        )


def _urlopen(url: str, timeout: int = DOWNLOAD_TIMEOUT_SECONDS):
    request = urllib.request.Request(
        url, headers={"User-Agent": "CuePoint-player-sidecar-fetch"}
    )
    return urllib.request.urlopen(request, timeout=timeout)  # noqa: S310 - pinned https


def download(
    url: str,
    dest: Path,
    *,
    expected_sha256: str = "",
    attempts: int = DOWNLOAD_ATTEMPTS,
    quiet: bool = False,
) -> Path:
    """Download ``url`` to ``dest``, retrying transient failures.

    A 404 is not retried: on this release tag it means the pinned asset was
    rotated out, and hammering it changes nothing.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_error: Optional[BaseException] = None
    show_progress = not quiet and sys.stdout.isatty()

    for attempt in range(1, attempts + 1):
        tmp = dest.with_suffix(dest.suffix + f".part{attempt}")
        try:
            with _urlopen(url) as response, tmp.open("wb") as handle:
                total = int(response.headers.get("Content-Length") or 0)
                seen = 0
                while True:
                    chunk = response.read(CHUNK_BYTES)
                    if not chunk:
                        break
                    handle.write(chunk)
                    seen += len(chunk)
                    if show_progress and total:
                        pct = seen * 100 // total
                        print(
                            f"\r  {dest.name}: {pct:3d}% ({seen >> 20}/{total >> 20} MiB)",
                            end="",
                            flush=True,
                        )
            if show_progress:
                print()
            elif not quiet:
                # CI logs are not terminals: one line at the end beats 50
                # carriage-returned ones on a single unreadable line.
                print(f"  downloaded {dest.name} ({seen >> 20} MiB)")
            if expected_sha256:
                verify_checksum(tmp, expected_sha256, what=url)
            tmp.replace(dest)
            return dest
        except urllib.error.HTTPError as exc:
            tmp.unlink(missing_ok=True)
            if exc.code == 404:
                raise AssetRotatedError(
                    f"Pinned asset is no longer published (HTTP 404):\n"
                    f"  {url}\n\n"
                    "mpv publishes binaries only on the rolling `git-release` tag, so "
                    "pins expire when CI republishes. Re-pin and review the diff:\n"
                    "  python scripts/fetch_player_sidecar.py --update-manifest"
                ) from exc
            last_error = exc
        except ChecksumMismatchError:
            tmp.unlink(missing_ok=True)
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            tmp.unlink(missing_ok=True)
            last_error = exc
        if attempt < attempts and not quiet:
            print(f"  retrying ({attempt}/{attempts - 1} failed): {last_error}")

    raise PlayerSidecarError(f"Failed to download {url}: {last_error}")


def cached_archive(
    target: Target, cache_dir: Path, *, offline: bool, quiet: bool = False
) -> Path:
    """Return a verified archive for ``target``, downloading only if needed."""
    archive = cache_dir / target.asset
    if archive.exists():
        try:
            verify_checksum(archive, target.sha256, what=target.asset)
            if not quiet:
                print(f"  cached: {archive.name}")
            return archive
        except ChecksumMismatchError:
            if offline:
                raise
            if not quiet:
                print(f"  cached copy of {archive.name} is corrupt; re-downloading")
            archive.unlink(missing_ok=True)

    if offline:
        raise PlayerSidecarError(
            f"--offline was given but {target.asset} is not in the cache ({cache_dir})"
        )
    if not quiet:
        print(f"  downloading {target.asset} ({target.size >> 20} MiB)")
    return download(target.url, archive, expected_sha256=target.sha256, quiet=quiet)


# ---------------------------------------------------------------------------
# Extraction and installation
# ---------------------------------------------------------------------------


def _safe_members(names: Iterable[str]) -> None:
    """Reject archive paths that would escape the destination directory."""
    for name in names:
        pure = Path(name)
        if pure.is_absolute() or ".." in pure.parts or name.startswith(("/", "\\")):
            raise PlayerSidecarError(f"Refusing to extract unsafe archive path: {name}")


def _wanted(name: str, install: Sequence[str]) -> bool:
    """True when an archive entry is one of the paths we install.

    An entry matches either exactly, or as a descendant of a directory in the
    install list — ``mpv.app`` selects the whole bundle.
    """
    normalized = name.replace("\\", "/").rstrip("/")
    for wanted in install:
        w = wanted.replace("\\", "/").rstrip("/")
        if normalized == w or normalized.startswith(w + "/"):
            return True
    return False


def extract_target(archive: Path, target: Target, install_dir: Path) -> List[Path]:
    """Extract the target's install list from ``archive`` into ``install_dir``.

    Returns the files written, in sorted order, so a receipt can record them.
    """
    if install_dir.exists():
        shutil.rmtree(install_dir)
    install_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(archive) as zf:
        _safe_members(zf.namelist())
        if target.is_nested:
            inner_name = target.inner_archive or _sole_entry(zf.namelist())
            payload = zf.read(inner_name)
            _extract_tar(payload, target, install_dir)
        else:
            for name in zf.namelist():
                if name.endswith("/") or not _wanted(name, target.install):
                    continue
                out = install_dir / name
                out.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(name) as src, out.open("wb") as dst:
                    shutil.copyfileobj(src, dst)

    written = sorted(p for p in install_dir.rglob("*") if p.is_file())
    if not written:
        raise PlayerSidecarError(
            f"Nothing was extracted for {target.key}; the archive layout has "
            f"changed. Expected entries matching {target.install!r} in {archive.name}."
        )
    _make_executable(target, install_dir)
    return written


def _sole_entry(names: Sequence[str]) -> str:
    files = [n for n in names if not n.endswith("/")]
    if len(files) != 1:
        raise PlayerSidecarError(
            f"Expected exactly one entry in the outer archive, found {len(files)}"
        )
    return files[0]


def _extract_tar(payload: bytes, target: Target, install_dir: Path) -> None:
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as tf:
        members = [m for m in tf.getmembers() if _wanted(m.name, target.install)]
        _safe_members(m.name for m in members)
        for member in members:
            if member.issym() or member.islnk():
                raise PlayerSidecarError(
                    f"Refusing to extract link entry {member.name!r}; the upstream "
                    "archive layout has changed and needs review."
                )
        try:
            tf.extractall(install_dir, members=members, filter="data")
        except TypeError:  # Python < 3.11.4 has no extraction filters
            tf.extractall(install_dir, members=members)  # noqa: S202 - members vetted


def _make_executable(target: Target, install_dir: Path) -> None:
    """Give the binary (and any bundled libraries) the exec bit on POSIX.

    ``zipfile`` drops permissions entirely, and the ``data`` tar filter trims
    group/other bits. A packaged macOS app is run by users who are not the one
    who built it, so 0o755 is restored explicitly rather than hoped for.
    """
    if os.name == "nt":
        return
    binary = install_dir / target.binary
    if binary.exists():
        binary.chmod(
            binary.stat().st_mode
            | stat.S_IRWXU
            | stat.S_IXGRP
            | stat.S_IXOTH
            | stat.S_IRGRP
            | stat.S_IROTH
        )
    for path in install_dir.rglob("*"):
        if path.is_file() and path.suffix in (".dylib", ".so"):
            path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def write_receipt(
    manifest: Manifest, target: Target, install_dir: Path, files: Sequence[Path]
) -> Path:
    receipt = {
        "component": manifest.component,
        "version": manifest.version,
        "commit": manifest.commit,
        "target": target.key,
        "asset": target.asset,
        "asset_sha256": target.sha256,
        "binary": target.binary,
        "license_spdx": manifest.license_spdx,
        "files": [
            {
                "path": p.relative_to(install_dir).as_posix(),
                "size": p.stat().st_size,
                "sha256": sha256_file(p),
            }
            for p in files
            if p.name != RECEIPT_NAME
        ],
    }
    path = install_dir / RECEIPT_NAME
    path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return path


def verify_install(target: Target, dest_root: Path) -> Dict[str, Any]:
    """Re-check an installed target against its receipt.

    Catches the failure mode a plain existence check misses: a truncated or
    partially-copied install that has all the right filenames.
    """
    install_dir = install_dir_for(target, dest_root)
    receipt_path = install_dir / RECEIPT_NAME
    if not receipt_path.exists():
        raise PlayerSidecarError(
            f"No install receipt at {receipt_path}. Run the fetch script first."
        )
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    problems: List[str] = []
    for entry in receipt.get("files", []):
        path = install_dir / entry["path"]
        if not path.exists():
            problems.append(f"missing: {entry['path']}")
            continue
        if path.stat().st_size != entry["size"]:
            problems.append(f"wrong size: {entry['path']}")
            continue
        if sha256_file(path) != entry["sha256"]:
            problems.append(f"content changed: {entry['path']}")
    if problems:
        raise PlayerSidecarError(
            f"Player sidecar install at {install_dir} is damaged:\n  "
            + "\n  ".join(problems)
            + "\nRe-run the fetch script with --force."
        )
    return receipt


# ---------------------------------------------------------------------------
# Smoke tests — is this the binary the manifest promised, and can it decode?
# ---------------------------------------------------------------------------


def _run(binary: Path, args: Sequence[str], timeout: int = 60) -> str:
    try:
        proc = subprocess.run(
            [str(binary), *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except OSError as exc:
        raise SmokeTestError(f"Could not execute {binary}: {exc}") from exc
    return (proc.stdout or "") + (proc.stderr or "")


def smoke_test(manifest: Manifest, binary: Path, *, quiet: bool = False) -> None:
    """Assert the installed binary is the pinned version and has what we need.

    Three separate questions, because they fail for different reasons and a
    single "it ran" check would pass while the app is unable to play a FLAC or
    open an IPC socket:

    1. Is it the version the manifest pinned?
    2. Does it carry every decoder DEC-005 promised?
    3. Does it expose every option Phase 5 drives it with?
    """
    if not binary.exists():
        raise SmokeTestError(f"Player binary not found: {binary}")

    version_output = _run(binary, ["--version"])
    if manifest.version not in version_output:
        raise SmokeTestError(
            f"Installed mpv is not the pinned build.\n"
            f"  expected version: {manifest.version}\n"
            f"  reported: {version_output.splitlines()[0] if version_output else '(no output)'}"
        )

    decoders = _run(binary, ["--ad=help"])
    missing = [d for d in manifest.required_decoders if not _lists_decoder(decoders, d)]
    if missing:
        raise SmokeTestError(
            "Installed mpv is missing decoders CuePoint depends on (DEC-005): "
            + ", ".join(missing)
        )

    options = _run(binary, ["--list-options"])
    missing_opts = [o for o in manifest.required_options if f"--{o}" not in options]
    if missing_opts:
        raise SmokeTestError(
            "Installed mpv is missing options Phase 5 drives it with: "
            + ", ".join(f"--{o}" for o in missing_opts)
        )

    if not quiet:
        print(
            f"  smoke: {manifest.version}, {len(manifest.required_decoders)} decoders, "
            f"{len(manifest.required_options)} options OK"
        )


def _lists_decoder(help_output: str, name: str) -> bool:
    """True if ``name`` appears as a decoder id in ``--ad=help`` output.

    Matched on the id at the start of the entry rather than anywhere in the
    line, so ``flac`` is not satisfied by a description mentioning FLAC.
    """
    pattern = re.compile(rf"^\s*{re.escape(name)}(\s|\s*\(|$)", re.MULTILINE)
    return bool(pattern.search(help_output))


#: Fixture -> (label, carries a tone). The five formats PLAYER-01's acceptance
#: names. Four hold a 441 Hz tone, so decoding them can be checked for actual
#: signal; the MP3 is constructed silence because no encoder ships in the
#: binary we bundle (see scripts/make_audio_fixtures.py), so only its frame
#: count is meaningful.
FORMAT_FIXTURES: Tuple[Tuple[str, str, bool], ...] = (
    ("tone.wav", "WAV / PCM", True),
    ("tone.flac", "FLAC", True),
    ("tone.aiff", "AIFF / PCM big-endian", True),
    ("tone.m4a", "ALAC", True),
    ("tone.mp3", "MP3", False),
)

#: A decoded tone should sit near this amplitude (the fixtures are written at
#: ~0.61 full scale). Generous lower bound: the point is to separate real audio
#: from a stream of zeros, not to measure the encoder.
MIN_TONE_RMS = 1000.0


def check_formats(
    binary: Path, fixture_dir: Path = FIXTURE_DIR, *, quiet: bool = False
) -> List[str]:
    """Decode each format fixture and assert real audio came out.

    Not an exit-code check: mpv is asked to decode the fixture *to a WAV* and
    the result is inspected, so a build that "succeeds" while producing silence
    or nothing at all fails here. This is the packaging-integration half of the
    format spike the roadmap has carried since Round 1 — with libmpv chosen, the
    question is whether the artifact we ship can decode these, not whether the
    codec exists at all.
    """
    import wave

    if not fixture_dir.exists():
        raise SmokeTestError(f"Audio fixtures not found: {fixture_dir}")

    checked: List[str] = []
    with tempfile.TemporaryDirectory(prefix="cuepoint-fmt-") as tmp:
        for name, label, tonal in FORMAT_FIXTURES:
            source = fixture_dir / name
            if not source.exists():
                raise SmokeTestError(f"Missing format fixture: {source}")
            out = Path(tmp) / f"{source.stem}-{source.suffix.lstrip('.')}.wav"
            output = _run(
                binary,
                [
                    "--no-config",
                    "--really-quiet",
                    "--vo=null",
                    f"--o={out}",
                    "--oac=pcm_s16le",
                    "--of=wav",
                    str(source),
                ],
                timeout=120,
            )
            if not out.exists() or out.stat().st_size == 0:
                raise SmokeTestError(
                    f"{label} ({name}) produced no decoded output.\n{output.strip()}"
                )
            with wave.open(str(out), "rb") as wav:
                frames = wav.getnframes()
                rate = wav.getframerate()
                width = wav.getsampwidth()
                pcm = wav.readframes(frames)
            if frames == 0 or rate == 0:
                raise SmokeTestError(f"{label} ({name}) decoded to an empty stream")
            duration = frames / rate
            if duration < 0.05:
                raise SmokeTestError(
                    f"{label} ({name}) decoded only {duration:.3f}s - expected the "
                    "fixture's full length"
                )
            rms = _rms_16bit(pcm) if width == 2 else float("nan")
            if tonal and not (rms >= MIN_TONE_RMS):
                raise SmokeTestError(
                    f"{label} ({name}) decoded {duration:.2f}s of near-silence "
                    f"(RMS {rms:.0f}); the fixture holds a 441 Hz tone, so the "
                    "decoder produced the wrong samples"
                )
            checked.append(f"{label}: {duration:.2f}s @ {rate} Hz, RMS {rms:.0f}")
            if not quiet:
                print(
                    f"  decode {label:24s} {duration:.2f}s @ {rate} Hz  RMS {rms:.0f}"
                )
    return checked


# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------


def _rms_16bit(pcm: bytes) -> float:
    """RMS amplitude of signed 16-bit PCM.

    Hand-rolled rather than ``audioop.rms``: that module was removed in Python
    3.13, and this is four lines.
    """
    import array

    samples = array.array("h")
    samples.frombytes(pcm[: len(pcm) - (len(pcm) % samples.itemsize)])
    if not samples:
        return 0.0
    return (sum(float(s) * s for s in samples) / len(samples)) ** 0.5


def install_target(
    manifest: Manifest,
    target: Target,
    *,
    dest_root: Path = DEFAULT_DEST,
    cache_dir: Path = DEFAULT_CACHE,
    offline: bool = False,
    force: bool = False,
    run_smoke: bool = True,
    quiet: bool = False,
) -> Path:
    """Fetch, verify, extract and smoke-test one target. Returns the binary."""
    install_dir = install_dir_for(target, dest_root)
    binary = binary_path_for(target, dest_root)

    if not force and (install_dir / RECEIPT_NAME).exists():
        try:
            receipt = verify_install(target, dest_root)
            if receipt.get("asset_sha256") == target.sha256:
                if not quiet:
                    print(f"  up to date: {binary}")
                if run_smoke:
                    smoke_test(manifest, binary, quiet=quiet)
                return binary
            if not quiet:
                print("  installed build differs from the manifest; reinstalling")
        except PlayerSidecarError as exc:
            if not quiet:
                print(
                    f"  existing install rejected ({exc.__class__.__name__}); reinstalling"
                )

    archive = cached_archive(target, cache_dir, offline=offline, quiet=quiet)
    files = extract_target(archive, target, install_dir)
    copy_license_files(manifest, install_dir, quiet=quiet)
    files = sorted(p for p in install_dir.rglob("*") if p.is_file())
    write_receipt(manifest, target, install_dir, files)
    if not quiet:
        total = sum(p.stat().st_size for p in files)
        print(f"  installed {len(files)} files ({total >> 20} MiB) -> {install_dir}")
    if run_smoke:
        smoke_test(manifest, binary, quiet=quiet)
    return binary


def copy_license_files(
    manifest: Manifest, install_dir: Path, *, quiet: bool = False
) -> None:
    """Ship the licence texts next to the binary.

    Required, not decorative: CuePoint distributes an mpv binary, and the
    licence has to travel with it. Missing texts are a hard error so a release
    cannot be built without them.
    """
    missing = [
        name for name in manifest.license_files if not (LICENSE_DIR / name).exists()
    ]
    if missing:
        raise PlayerSidecarError(
            "Licence texts are missing from third_party/mpv/: "
            + ", ".join(missing)
            + "\nRun `python scripts/fetch_player_sidecar.py --update-manifest` to "
            "refresh them from the pinned commit."
        )
    licenses = install_dir / "licenses"
    licenses.mkdir(parents=True, exist_ok=True)
    for name in manifest.license_files:
        shutil.copy2(LICENSE_DIR / name, licenses / name)
    notice = LICENSE_DIR / "NOTICE.md"
    if notice.exists():
        shutil.copy2(notice, licenses / "NOTICE.md")


# ---------------------------------------------------------------------------
# Manifest update (re-pinning)
# ---------------------------------------------------------------------------

#: Release asset suffix -> manifest target key.
ASSET_TARGETS: Dict[str, str] = {
    "x86_64-pc-windows-msvc": "win32-x64",
    "macos-14-arm": "darwin-arm64",
    "macos-15-intel": "darwin-x64",
}

ASSET_RE = re.compile(
    r"^mpv-(?P<version>v[\d.]+(?:-dev)?-g[0-9a-f]+)-(?P<build>\d+)-(?P<suffix>.+)\.zip$"
)

LICENSE_SOURCES: Dict[str, str] = {
    "LICENSE.GPL": "LICENSE.GPL",
    "LICENSE.LGPL": "LICENSE.LGPL",
    "Copyright": "Copyright",
}


def update_manifest(
    manifest_path: Path = DEFAULT_MANIFEST,
    *,
    cache_dir: Path = DEFAULT_CACHE,
    quiet: bool = False,
) -> Dict[str, Any]:
    """Re-pin every target from the current release, and refresh licence texts.

    Downloads each asset to hash it — there is no other honest way to record a
    checksum, and a pin whose checksum was copied from a webpage is not a pin.
    """
    existing = (
        json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest_path.exists()
        else {}
    )
    repo = existing.get("repo", "mpv-player/mpv")
    tag = existing.get("tag", "git-release")

    api = f"https://api.github.com/repos/{repo}/releases/tags/{tag}"
    if not quiet:
        print(f"Querying {api}")
    with _urlopen(api) as response:
        release = json.loads(response.read().decode("utf-8"))

    assets = {a["name"]: a for a in release.get("assets", [])}
    versions = set()
    new_targets: Dict[str, Any] = {}

    for name, asset in sorted(assets.items()):
        match = ASSET_RE.match(name)
        if not match:
            continue
        key = ASSET_TARGETS.get(match.group("suffix"))
        if key is None:
            continue
        versions.add(match.group("version"))
        if not quiet:
            print(f"  {key}: {name}")

        # GitHub publishes a SHA-256 per asset. Pinning against *that* rather
        # than against our own download means the manifest records what
        # upstream says it published, and a download corrupted in transit — or
        # a same-size stale file sitting in the cache — cannot become the pin.
        upstream = str(asset.get("digest") or "")
        expected = (
            upstream.split(":", 1)[1].lower() if upstream.startswith("sha256:") else ""
        )

        archive = cache_dir / name
        if archive.exists() and archive.stat().st_size == asset["size"] and expected:
            if sha256_file(archive) == expected:
                if not quiet:
                    print("    (cached, digest verified)")
            else:
                if not quiet:
                    print(
                        "    (cached copy does not match the published digest; re-downloading)"
                    )
                archive.unlink()
        if not archive.exists():
            archive = download(
                asset["browser_download_url"],
                archive,
                expected_sha256=expected,
                quiet=quiet,
            )
        digest = sha256_file(archive)
        if expected and digest != expected:
            raise PlayerSidecarError(
                f"{name} does not match the digest GitHub publishes for it "
                f"(expected {expected}, got {digest})"
            )
        if not expected and not quiet:
            print("    WARNING: no upstream digest published; pinning our own hash")
        previous = existing.get("targets", {}).get(key, {})
        new_targets[key] = {
            # `extraResources.from` is macro-expanded as
            # `resources/player/${os}-${arch}`. ${os} expands to mac/win/linux
            # (a Platform's buildConfigurationKey), NOT to process.platform's
            # darwin/win32, and ${arch} to x64/arm64. These directory names have
            # to match that vocabulary or electron-builder silently leaves the
            # payload out of the package with only a warning. The arch half also
            # keeps the two macOS pins from overwriting each other.
            "platform_dir": previous.get(
                "platform_dir",
                "win-x64" if key.startswith("win32") else f"mac-{key.split('-')[1]}",
            ),
            "asset": name,
            "url": asset["browser_download_url"],
            "sha256": digest,
            "size": asset["size"],
            "archive": previous.get(
                "archive", "zip" if key.startswith("win32") else "zip+tar.gz"
            ),
            "inner_archive": previous.get(
                "inner_archive", "" if key.startswith("win32") else "mpv.tar.gz"
            ),
            "install": previous.get(
                "install", ["mpv.exe"] if key.startswith("win32") else ["mpv.app"]
            ),
            "binary": previous.get(
                "binary",
                "mpv.exe" if key.startswith("win32") else "mpv.app/Contents/MacOS/mpv",
            ),
        }

    missing = set(ASSET_TARGETS.values()) - set(new_targets)
    if missing:
        raise PlayerSidecarError(
            "The release no longer publishes assets for: "
            + ", ".join(sorted(missing))
            + ". The upstream naming or matrix has changed and ASSET_TARGETS needs review."
        )
    if len(versions) != 1:
        raise PlayerSidecarError(
            f"Release assets disagree about the version: {sorted(versions)}"
        )

    version = versions.pop()
    commit_match = re.search(r"-g([0-9a-f]+)$", version)
    commit = commit_match.group(1) if commit_match else ""

    updated = dict(existing)
    updated.update(
        {
            "component": "mpv",
            "repo": repo,
            "tag": tag,
            "version": version,
            "commit": commit,
        }
    )
    updated.setdefault(
        "required_decoders",
        ["flac", "alac", "mp3", "pcm_s16be", "wavpack", "ape", "aac"],
    )
    updated.setdefault(
        "required_options",
        [
            "input-ipc-server",
            "gapless-audio",
            "audio-exclusive",
            "audio-device",
            "idle",
        ],
    )
    license_block = dict(existing.get("license", {}))
    license_block.setdefault("spdx", "GPL-2.0-or-later")
    license_block["files"] = sorted(LICENSE_SOURCES)
    license_block["source_url"] = (
        f"https://github.com/{repo}/tree/{commit}"
        if commit
        else f"https://github.com/{repo}"
    )
    updated["license"] = license_block
    for key, value in new_targets.items():
        merged = dict(existing.get("targets", {}).get(key, {}))
        merged.update(value)
        updated.setdefault("targets", {})
        updated["targets"][key] = merged
    updated.setdefault("targets", {})
    updated["targets"].setdefault(
        "linux-x64",
        {
            "supported": False,
            "platform_dir": "linux-x64",
            "note": (
                "No prebuilt Linux binary is pinned. Linux is best-effort for the "
                "desktop app; install mpv from the distribution and point CuePoint "
                "at it with CUEPOINT_MPV_PATH."
            ),
        },
    )

    fetch_license_texts(repo, commit, quiet=quiet)

    manifest_path.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
    parse_manifest(updated)  # fail here rather than at the next build
    if not quiet:
        print(f"Wrote {manifest_path} at {version}")
    return updated


def fetch_license_texts(repo: str, commit: str, *, quiet: bool = False) -> None:
    """Download mpv's licence texts at the pinned commit."""
    LICENSE_DIR.mkdir(parents=True, exist_ok=True)
    ref = commit or "master"
    for name, remote in LICENSE_SOURCES.items():
        url = f"https://raw.githubusercontent.com/{repo}/{ref}/{remote}"
        try:
            with _urlopen(url) as response:
                text = response.read()
        except urllib.error.HTTPError as exc:
            raise PlayerSidecarError(
                f"Could not fetch licence text {remote} at {ref}: {exc}"
            ) from exc
        (LICENSE_DIR / name).write_bytes(text)
        if not quiet:
            print(f"  licence: third_party/mpv/{name} ({len(text)} bytes)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fetch and verify the bundled mpv player sidecar (PLAYER-01)"
    )
    parser.add_argument(
        "--target",
        default="host",
        help="Manifest target key, 'host' (default) or 'all'",
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--offline", action="store_true", help="Use the cache only")
    parser.add_argument(
        "--force", action="store_true", help="Reinstall even if current"
    )
    parser.add_argument("--verify-only", action="store_true", help="Check an install")
    parser.add_argument(
        "--print-path", action="store_true", help="Print the binary path"
    )
    parser.add_argument(
        "--skip-smoke", action="store_true", help="Do not run the binary"
    )
    parser.add_argument(
        "--check-formats",
        action="store_true",
        help="Decode the audio fixtures with the installed binary",
    )
    parser.add_argument(
        "--update-manifest", action="store_true", help="Re-pin the manifest"
    )
    parser.add_argument("-q", "--quiet", action="store_true")
    return parser


def _selected_targets(manifest: Manifest, requested: str) -> List[Target]:
    if requested == "all":
        return [t for t in manifest.targets.values() if t.supported]
    key = host_target_key() if requested == "host" else requested
    return [manifest.target(key)]


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        if args.update_manifest:
            update_manifest(args.manifest, cache_dir=args.cache_dir, quiet=args.quiet)
            return 0

        manifest = load_manifest(args.manifest)
        requested = args.target
        if requested == "host":
            key = host_target_key()
            target = manifest.targets.get(key)
            if target is None:
                print(
                    f"No pinned player sidecar for this machine ({key}).\n"
                    f"Pinned targets: {', '.join(sorted(manifest.targets))}.",
                    file=sys.stderr,
                )
                return 2
            if not target.supported:
                # Not a failure: Linux is documented best-effort, and CI runs
                # this job on ubuntu too. Say why and let the build continue.
                print(f"NOTICE: no bundled player sidecar for {key}.")
                if target.note:
                    print(f"        {target.note}")
                return 0

        targets = _selected_targets(manifest, requested)

        if args.print_path:
            for target in targets:
                print(binary_path_for(target, args.dest))
            return 0

        if args.verify_only:
            for target in targets:
                receipt = verify_install(target, args.dest)
                print(
                    f"OK {target.key}: {receipt['version']} ({len(receipt['files'])} files)"
                )
            return 0

        host = host_target_key()
        for target in targets:
            if not args.quiet:
                print(f"{manifest.component} {manifest.version} -> {target.key}")
            is_host = target.key == host
            binary = install_target(
                manifest,
                target,
                dest_root=args.dest,
                cache_dir=args.cache_dir,
                offline=args.offline,
                force=args.force,
                run_smoke=is_host and not args.skip_smoke,
                quiet=args.quiet,
            )
            if not is_host and not args.quiet:
                print("  (cross-platform target: installed and verified, not executed)")
            if args.check_formats:
                if not is_host:
                    print("  (format check skipped: not the host platform)")
                else:
                    check_formats(binary, quiet=args.quiet)
        return 0

    except PlayerSidecarError as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
