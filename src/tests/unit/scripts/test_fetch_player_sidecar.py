"""Unit tests for the player sidecar fetcher (PLAYER-01, DEC-049).

None of these touch the network or the real mpv binary. What is worth testing
here is the logic that decides whether an artifact is trustworthy and how it is
laid out on disk — checksum enforcement, archive shapes, path safety, the
receipt, and the error a rotated pin produces. Archives are synthesized in the
tests, so the shapes under test are the ones the manifest actually declares
rather than whatever happened to be downloaded.

The tests that need a real binary live in
`src/tests/integration/test_player_sidecar_binary.py` and skip when it is absent.
"""

from __future__ import annotations

import email.message
import hashlib
import importlib.util
import io
import json
import sys
import tarfile
import urllib.error
import zipfile
from pathlib import Path
from typing import Dict

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "fetch_player_sidecar.py"


def _load_script_module():
    """Import fetch_player_sidecar.py as a module (scripts/ is not a package).

    Registered in ``sys.modules`` *before* execution: the module defines
    dataclasses, and ``@dataclass`` resolves annotations through
    ``sys.modules[cls.__module__]``, which does not exist yet during
    ``exec_module``.
    """
    spec = importlib.util.spec_from_file_location("fetch_player_sidecar", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


fps = _load_script_module()

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _flat_zip(path: Path, entries: Dict[str, bytes]) -> str:
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _nested_zip(
    path: Path, entries: Dict[str, bytes], inner: str = "mpv.tar.gz"
) -> str:
    """A zip holding a single tar.gz, the way macOS builds ship."""
    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode="w:gz") as tf:
        for name, data in entries.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755
            tf.addfile(info, io.BytesIO(data))
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(inner, tar_buffer.getvalue())
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _manifest_dict(**overrides) -> dict:
    base = {
        "component": "mpv",
        "repo": "mpv-player/mpv",
        "tag": "git-release",
        "version": "v0.41.0-dev-gabc123",
        "commit": "abc123",
        "required_decoders": ["flac"],
        "required_options": ["input-ipc-server"],
        "license": {
            "spdx": "GPL-2.0-or-later",
            "files": ["LICENSE.GPL"],
            "source_url": "https://github.com/mpv-player/mpv/tree/abc123",
        },
        "targets": {
            "win32-x64": {
                "platform_dir": "win",
                "asset": "mpv.zip",
                "url": "https://example.invalid/mpv.zip",
                "sha256": "0" * 64,
                "size": 10,
                "archive": "zip",
                "install": ["mpv.exe"],
                "binary": "mpv.exe",
            }
        },
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Manifest validation
# ---------------------------------------------------------------------------


class TestManifestValidation:
    def test_parses_a_well_formed_manifest(self):
        manifest = fps.parse_manifest(_manifest_dict())
        assert manifest.component == "mpv"
        assert manifest.target("win32-x64").binary == "mpv.exe"

    def test_rejects_a_malformed_checksum(self):
        data = _manifest_dict()
        data["targets"]["win32-x64"]["sha256"] = "not-a-hash"
        with pytest.raises(fps.PlayerSidecarError, match="malformed sha256"):
            fps.parse_manifest(data)

    def test_rejects_a_binary_outside_the_install_list(self):
        """A pin that installs one thing and points at another is a typo that
        would otherwise surface as a confusing missing-file error at runtime."""
        data = _manifest_dict()
        data["targets"]["win32-x64"]["binary"] = "somewhere/else.exe"
        with pytest.raises(
            fps.PlayerSidecarError, match="not covered by its install list"
        ):
            fps.parse_manifest(data)

    def test_accepts_a_binary_inside_an_installed_directory(self):
        data = _manifest_dict()
        data["targets"]["win32-x64"].update(
            {"install": ["mpv.app"], "binary": "mpv.app/Contents/MacOS/mpv"}
        )
        assert fps.parse_manifest(data).target("win32-x64").binary.endswith("mpv")

    def test_rejects_an_unknown_archive_kind(self):
        data = _manifest_dict()
        data["targets"]["win32-x64"]["archive"] = "rar"
        with pytest.raises(fps.PlayerSidecarError, match="unsupported archive"):
            fps.parse_manifest(data)

    def test_rejects_a_target_that_installs_nothing(self):
        data = _manifest_dict()
        data["targets"]["win32-x64"]["install"] = []
        with pytest.raises(fps.PlayerSidecarError, match="installs nothing"):
            fps.parse_manifest(data)

    def test_unsupported_targets_need_no_artifact(self):
        """Linux is pinned as unsupported and must not require a checksum."""
        data = _manifest_dict()
        data["targets"]["linux-x64"] = {
            "supported": False,
            "platform_dir": "linux",
            "note": "use the system mpv",
        }
        manifest = fps.parse_manifest(data)
        assert manifest.target("linux-x64").supported is False

    def test_reports_unknown_targets_with_the_known_ones(self):
        manifest = fps.parse_manifest(_manifest_dict())
        with pytest.raises(fps.PlayerSidecarError, match="win32-x64"):
            manifest.target("solaris-sparc")


class TestShippedManifest:
    """The manifest that is actually committed must stay valid and honest."""

    def test_repository_manifest_parses(self):
        manifest = fps.load_manifest()
        assert manifest.component == "mpv"
        assert manifest.targets, "no targets pinned"

    def test_every_supported_target_pins_a_real_checksum(self):
        for target in fps.load_manifest().targets.values():
            if target.supported:
                assert len(target.sha256) == 64
                assert target.sha256 != "0" * 64
                assert target.url.startswith("https://")

    def test_platform_dirs_match_electron_builder_macros(self):
        """`extraResources` uses `${os}-${arch}`.

        ${os} expands to mac/win/linux and ${arch} to x64/arm64 — not to
        process.platform's darwin/win32. Getting this wrong makes
        electron-builder skip the payload with only a warning and produce an app
        with no player in it, which is exactly what the engine sidecar's own
        packaging used to do. `test_packaging_resource_paths.py` now guards both.
        """
        allowed_os = {"mac", "win", "linux"}
        allowed_arch = {"x64", "arm64"}
        for target in fps.load_manifest().targets.values():
            os_part, _, arch_part = target.platform_dir.partition("-")
            assert os_part in allowed_os, (
                f"{target.key} uses platform_dir {target.platform_dir!r}, whose "
                f"os half ${{os}} never expands to"
            )
            assert arch_part in allowed_arch, (
                f"{target.key} uses platform_dir {target.platform_dir!r}, whose "
                f"arch half ${{arch}} never expands to"
            )

    def test_no_two_targets_share_an_install_directory(self):
        """Two macOS pins (arm64 and x64) must not overwrite each other."""
        dirs = [t.platform_dir for t in fps.load_manifest().targets.values()]
        assert len(dirs) == len(set(dirs)), f"colliding install directories: {dirs}"

    def test_required_capabilities_cover_what_phase_5_needs(self):
        manifest = fps.load_manifest()
        # DEC-005 promised these formats; Phase 5 drives these options.
        assert {"flac", "alac", "mp3"} <= set(manifest.required_decoders)
        assert {"input-ipc-server", "gapless-audio", "audio-exclusive"} <= set(
            manifest.required_options
        )


# ---------------------------------------------------------------------------
# Target resolution
# ---------------------------------------------------------------------------


class TestTargetResolution:
    @pytest.mark.parametrize(
        ("machine", "expected"),
        [
            ("AMD64", "x64"),
            ("x86_64", "x64"),
            ("arm64", "arm64"),
            ("aarch64", "arm64"),
        ],
    )
    def test_normalizes_architectures(self, machine, expected):
        assert fps.normalize_arch(machine) == expected

    @pytest.mark.parametrize(
        ("system", "machine", "expected"),
        [
            ("Windows", "AMD64", "win32-x64"),
            ("Darwin", "arm64", "darwin-arm64"),
            ("Darwin", "x86_64", "darwin-x64"),
            ("Linux", "x86_64", "linux-x64"),
        ],
    )
    def test_host_key_uses_node_platform_names(self, system, machine, expected):
        assert fps.host_target_key(system, machine) == expected


# ---------------------------------------------------------------------------
# Checksums
# ---------------------------------------------------------------------------


class TestChecksums:
    def test_accepts_matching_bytes(self, tmp_path):
        path = tmp_path / "a.bin"
        path.write_bytes(b"hello")
        fps.verify_checksum(path, hashlib.sha256(b"hello").hexdigest(), what="a.bin")

    def test_rejects_mismatched_bytes_and_says_how_to_recover(self, tmp_path):
        path = tmp_path / "a.bin"
        path.write_bytes(b"tampered")
        with pytest.raises(fps.ChecksumMismatchError) as excinfo:
            fps.verify_checksum(path, "0" * 64, what="a.bin")
        assert "--update-manifest" in str(excinfo.value)

    def test_is_case_insensitive_about_the_pin(self, tmp_path):
        path = tmp_path / "a.bin"
        path.write_bytes(b"hello")
        fps.verify_checksum(
            path, hashlib.sha256(b"hello").hexdigest().upper(), what="a.bin"
        )


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


class TestExtraction:
    def _target(self, tmp_path, **overrides):
        data = _manifest_dict()
        data["targets"]["win32-x64"].update(overrides)
        return fps.parse_manifest(data).target("win32-x64")

    def test_installs_only_the_listed_entries(self, tmp_path):
        """The Windows archive ships mpv-register.bat, which must not be shipped
        on to users: it registers mpv as a system media handler."""
        archive = tmp_path / "mpv.zip"
        _flat_zip(
            archive,
            {
                "mpv.exe": b"binary",
                "mpv-register.bat": b"do not ship me",
                "vulkan-1.dll": b"lib",
            },
        )
        target = self._target(tmp_path, install=["mpv.exe"], binary="mpv.exe")
        install_dir = tmp_path / "out"

        written = fps.extract_target(archive, target, install_dir)

        assert [p.name for p in written] == ["mpv.exe"]
        assert not (install_dir / "mpv-register.bat").exists()

    def test_extracts_a_nested_tarball_bundle(self, tmp_path):
        """macOS ships a zip containing a tar.gz containing mpv.app."""
        archive = tmp_path / "mpv-mac.zip"
        _nested_zip(
            archive,
            {
                "mpv.app/Contents/MacOS/mpv": b"macho",
                "mpv.app/Contents/MacOS/lib/libx.dylib": b"dylib",
                "mpv.app/Contents/Info.plist": b"<plist/>",
            },
        )
        target = self._target(
            tmp_path,
            archive="zip+tar.gz",
            inner_archive="mpv.tar.gz",
            install=["mpv.app"],
            binary="mpv.app/Contents/MacOS/mpv",
        )
        install_dir = tmp_path / "out"

        fps.extract_target(archive, target, install_dir)

        assert (install_dir / "mpv.app/Contents/MacOS/mpv").read_bytes() == b"macho"
        assert (install_dir / "mpv.app/Contents/MacOS/lib/libx.dylib").exists()

    def test_replaces_a_previous_install_rather_than_merging(self, tmp_path):
        archive = tmp_path / "mpv.zip"
        _flat_zip(archive, {"mpv.exe": b"new"})
        target = self._target(tmp_path)
        install_dir = tmp_path / "out"
        install_dir.mkdir()
        (install_dir / "stale.exe").write_bytes(b"from an older pin")

        fps.extract_target(archive, target, install_dir)

        assert not (install_dir / "stale.exe").exists()

    def test_rejects_an_archive_whose_layout_changed(self, tmp_path):
        archive = tmp_path / "mpv.zip"
        _flat_zip(archive, {"somethingelse.exe": b"x"})
        target = self._target(tmp_path)
        with pytest.raises(fps.PlayerSidecarError, match="Nothing was extracted"):
            fps.extract_target(archive, target, tmp_path / "out")

    def test_refuses_path_traversal(self, tmp_path):
        archive = tmp_path / "evil.zip"
        _flat_zip(archive, {"../escaped.exe": b"x", "mpv.exe": b"ok"})
        target = self._target(tmp_path)
        with pytest.raises(fps.PlayerSidecarError, match="unsafe archive path"):
            fps.extract_target(archive, target, tmp_path / "out")

    def test_refuses_links_in_the_bundle(self, tmp_path):
        """Upstream ships no links today; if that changes it needs review, not
        silent extraction."""
        archive = tmp_path / "mpv-mac.zip"
        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode="w:gz") as tf:
            info = tarfile.TarInfo("mpv.app/Contents/MacOS/mpv")
            info.size = 5
            tf.addfile(info, io.BytesIO(b"macho"))
            link = tarfile.TarInfo("mpv.app/Contents/MacOS/evil")
            link.type = tarfile.SYMTYPE
            link.linkname = "/etc/passwd"
            tf.addfile(link)
        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr("mpv.tar.gz", tar_buffer.getvalue())

        target = self._target(
            tmp_path,
            archive="zip+tar.gz",
            inner_archive="mpv.tar.gz",
            install=["mpv.app"],
            binary="mpv.app/Contents/MacOS/mpv",
        )
        with pytest.raises(fps.PlayerSidecarError, match="link entry"):
            fps.extract_target(archive, target, tmp_path / "out")


# ---------------------------------------------------------------------------
# Receipt and verification
# ---------------------------------------------------------------------------


class TestReceipt:
    def _install(self, tmp_path):
        archive = tmp_path / "mpv.zip"
        _flat_zip(archive, {"mpv.exe": b"binary-bytes"})
        manifest = fps.parse_manifest(_manifest_dict())
        target = manifest.target("win32-x64")
        install_dir = tmp_path / "player" / "win"
        files = fps.extract_target(archive, target, install_dir)
        fps.write_receipt(manifest, target, install_dir, files)
        return manifest, target, install_dir

    def test_records_what_was_installed(self, tmp_path):
        manifest, target, install_dir = self._install(tmp_path)
        receipt = json.loads((install_dir / "installed.json").read_text())
        assert receipt["version"] == manifest.version
        assert receipt["license_spdx"] == "GPL-2.0-or-later"
        assert [f["path"] for f in receipt["files"]] == ["mpv.exe"]

    def test_verify_passes_for_an_intact_install(self, tmp_path):
        _, target, _ = self._install(tmp_path)
        assert fps.verify_install(target, tmp_path / "player")["target"] == "win32-x64"

    def test_verify_detects_a_truncated_file(self, tmp_path):
        """The failure a mere existence check misses."""
        _, target, install_dir = self._install(tmp_path)
        (install_dir / "mpv.exe").write_bytes(b"trunc")
        with pytest.raises(fps.PlayerSidecarError, match="wrong size"):
            fps.verify_install(target, tmp_path / "player")

    def test_verify_detects_swapped_content_of_the_same_size(self, tmp_path):
        _, target, install_dir = self._install(tmp_path)
        (install_dir / "mpv.exe").write_bytes(b"BINARY-BYTES")
        with pytest.raises(fps.PlayerSidecarError, match="content changed"):
            fps.verify_install(target, tmp_path / "player")

    def test_verify_detects_a_missing_file(self, tmp_path):
        _, target, install_dir = self._install(tmp_path)
        (install_dir / "mpv.exe").unlink()
        with pytest.raises(fps.PlayerSidecarError, match="missing"):
            fps.verify_install(target, tmp_path / "player")

    def test_verify_without_an_install_says_so(self, tmp_path):
        target = fps.parse_manifest(_manifest_dict()).target("win32-x64")
        with pytest.raises(fps.PlayerSidecarError, match="No install receipt"):
            fps.verify_install(target, tmp_path / "nothing-here")


# ---------------------------------------------------------------------------
# Download behaviour
# ---------------------------------------------------------------------------


class TestDownload:
    def test_a_rotated_pin_is_reported_as_such(self, tmp_path, monkeypatch):
        """404 on this release tag means the pin expired, and the message has to
        say which command fixes it — not 'HTTP Error 404'."""

        def fake_urlopen(url, timeout=0):
            raise urllib.error.HTTPError(
                url, 404, "Not Found", email.message.Message(), None
            )

        monkeypatch.setattr(fps, "_urlopen", fake_urlopen)
        with pytest.raises(fps.AssetRotatedError) as excinfo:
            fps.download(
                "https://example.invalid/gone.zip", tmp_path / "x.zip", quiet=True
            )
        assert "--update-manifest" in str(excinfo.value)

    def test_a_rotated_pin_is_not_retried(self, tmp_path, monkeypatch):
        calls = []

        def fake_urlopen(url, timeout=0):
            calls.append(url)
            raise urllib.error.HTTPError(
                url, 404, "Not Found", email.message.Message(), None
            )

        monkeypatch.setattr(fps, "_urlopen", fake_urlopen)
        with pytest.raises(fps.AssetRotatedError):
            fps.download(
                "https://example.invalid/gone.zip", tmp_path / "x.zip", quiet=True
            )
        assert len(calls) == 1

    def test_offline_refuses_rather_than_reaching_the_network(
        self, tmp_path, monkeypatch
    ):
        def explode(*args, **kwargs):  # pragma: no cover - must not be called
            raise AssertionError("offline mode tried to open the network")

        monkeypatch.setattr(fps, "_urlopen", explode)
        target = fps.parse_manifest(_manifest_dict()).target("win32-x64")
        with pytest.raises(fps.PlayerSidecarError, match="--offline"):
            fps.cached_archive(target, tmp_path, offline=True, quiet=True)

    def test_a_verified_cache_entry_is_reused(self, tmp_path, monkeypatch):
        payload = b"cached archive bytes"
        digest = hashlib.sha256(payload).hexdigest()
        data = _manifest_dict()
        data["targets"]["win32-x64"]["sha256"] = digest
        target = fps.parse_manifest(data).target("win32-x64")
        (tmp_path / target.asset).write_bytes(payload)

        def explode(*args, **kwargs):  # pragma: no cover - must not be called
            raise AssertionError("re-downloaded a file already in the cache")

        monkeypatch.setattr(fps, "_urlopen", explode)
        assert fps.cached_archive(target, tmp_path, offline=False, quiet=True).exists()

    def test_a_corrupt_cache_entry_is_discarded_and_refetched(
        self, tmp_path, monkeypatch
    ):
        payload = b"good bytes"
        digest = hashlib.sha256(payload).hexdigest()
        data = _manifest_dict()
        data["targets"]["win32-x64"]["sha256"] = digest
        target = fps.parse_manifest(data).target("win32-x64")
        (tmp_path / target.asset).write_bytes(b"corrupt")

        downloaded = {}

        def fake_download(url, dest, expected_sha256="", quiet=False, **kwargs):
            downloaded["url"] = url
            dest.write_bytes(payload)
            return dest

        monkeypatch.setattr(fps, "download", fake_download)
        result = fps.cached_archive(target, tmp_path, offline=False, quiet=True)
        assert downloaded["url"] == target.url
        assert result.read_bytes() == payload


# ---------------------------------------------------------------------------
# Smoke test logic
# ---------------------------------------------------------------------------


class TestSmokeTestLogic:
    def test_decoder_ids_match_at_the_start_of_an_entry(self):
        listing = "    flac - FLAC (Free Lossless Audio Codec)\n    alac - ALAC\n"
        assert fps._lists_decoder(listing, "flac")
        assert fps._lists_decoder(listing, "alac")

    def test_a_description_mentioning_a_codec_does_not_count(self):
        """`--ad=help` describes 'FLAC' in prose; only the id column counts."""
        listing = "    pcm_s16le - PCM signed 16-bit (not flac)\n"
        assert not fps._lists_decoder(listing, "flac")

    def test_missing_binary_is_a_smoke_failure(self, tmp_path):
        manifest = fps.parse_manifest(_manifest_dict())
        with pytest.raises(fps.SmokeTestError, match="not found"):
            fps.smoke_test(manifest, tmp_path / "nope.exe", quiet=True)

    def test_wrong_version_is_rejected(self, tmp_path, monkeypatch):
        binary = tmp_path / "mpv.exe"
        binary.write_bytes(b"x")
        manifest = fps.parse_manifest(_manifest_dict())
        monkeypatch.setattr(fps, "_run", lambda *a, **k: "mpv v0.30.0-something")
        with pytest.raises(fps.SmokeTestError, match="not the pinned build"):
            fps.smoke_test(manifest, binary, quiet=True)

    def test_missing_decoder_is_rejected(self, tmp_path, monkeypatch):
        binary = tmp_path / "mpv.exe"
        binary.write_bytes(b"x")
        manifest = fps.parse_manifest(_manifest_dict())

        def fake_run(_binary, args, timeout=60):
            if args[0] == "--version":
                return f"mpv {manifest.version}"
            if args[0] == "--ad=help":
                return "    alac - ALAC\n"  # no flac
            return "--input-ipc-server"

        monkeypatch.setattr(fps, "_run", fake_run)
        with pytest.raises(fps.SmokeTestError, match="missing decoders"):
            fps.smoke_test(manifest, binary, quiet=True)

    def test_missing_option_is_rejected(self, tmp_path, monkeypatch):
        binary = tmp_path / "mpv.exe"
        binary.write_bytes(b"x")
        manifest = fps.parse_manifest(_manifest_dict())

        def fake_run(_binary, args, timeout=60):
            if args[0] == "--version":
                return f"mpv {manifest.version}"
            if args[0] == "--ad=help":
                return "    flac - FLAC\n"
            return "--audio-device --gapless-audio"  # no --input-ipc-server

        monkeypatch.setattr(fps, "_run", fake_run)
        with pytest.raises(fps.SmokeTestError, match="missing options"):
            fps.smoke_test(manifest, binary, quiet=True)

    def test_a_matching_binary_passes(self, tmp_path, monkeypatch):
        binary = tmp_path / "mpv.exe"
        binary.write_bytes(b"x")
        manifest = fps.parse_manifest(_manifest_dict())

        def fake_run(_binary, args, timeout=60):
            if args[0] == "--version":
                return f"mpv {manifest.version} (build)"
            if args[0] == "--ad=help":
                return "    flac - FLAC\n"
            return " --input-ipc-server  --audio-device"

        monkeypatch.setattr(fps, "_run", fake_run)
        fps.smoke_test(manifest, binary, quiet=True)  # must not raise


class TestRmsHelper:
    def test_silence_is_zero(self):
        assert fps._rms_16bit(b"\x00" * 100) == 0.0

    def test_a_tone_is_not(self):
        import struct

        pcm = b"".join(
            struct.pack("<h", 10000 if i % 2 else -10000) for i in range(100)
        )
        assert fps._rms_16bit(pcm) == pytest.approx(10000, rel=0.01)

    def test_odd_trailing_byte_does_not_crash(self):
        assert fps._rms_16bit(b"\x00\x01\x02") >= 0.0


# ---------------------------------------------------------------------------
# CLI behaviour
# ---------------------------------------------------------------------------


class TestCli:
    def test_unsupported_platform_is_a_notice_not_a_failure(self, monkeypatch, capsys):
        """CI runs this job on ubuntu too; Linux is documented best-effort, so
        the build must continue rather than fail."""
        monkeypatch.setattr(fps, "host_target_key", lambda *a, **k: "linux-x64")
        data = _manifest_dict()
        data["targets"]["linux-x64"] = {
            "supported": False,
            "platform_dir": "linux",
            "note": "use CUEPOINT_MPV_PATH",
        }
        monkeypatch.setattr(
            fps, "load_manifest", lambda *a, **k: fps.parse_manifest(data)
        )

        assert fps.main([]) == 0
        out = capsys.readouterr().out
        assert "NOTICE" in out and "CUEPOINT_MPV_PATH" in out

    def test_unpinned_platform_fails_with_the_known_targets(self, monkeypatch, capsys):
        monkeypatch.setattr(fps, "host_target_key", lambda *a, **k: "freebsd-x64")
        monkeypatch.setattr(
            fps, "load_manifest", lambda *a, **k: fps.parse_manifest(_manifest_dict())
        )
        assert fps.main([]) == 2
        assert "win32-x64" in capsys.readouterr().err

    def test_print_path_reports_the_installed_location(
        self, monkeypatch, capsys, tmp_path
    ):
        monkeypatch.setattr(fps, "host_target_key", lambda *a, **k: "win32-x64")
        monkeypatch.setattr(
            fps, "load_manifest", lambda *a, **k: fps.parse_manifest(_manifest_dict())
        )
        assert fps.main(["--print-path", "--dest", str(tmp_path)]) == 0
        printed = capsys.readouterr().out.strip()
        assert printed == str(tmp_path / "win" / "mpv.exe")

    def test_errors_are_reported_without_a_traceback(self, monkeypatch, capsys):
        def boom(*a, **k):
            raise fps.PlayerSidecarError("something specific went wrong")

        monkeypatch.setattr(fps, "load_manifest", boom)
        assert fps.main(["--target", "win32-x64"]) == 1
        assert "something specific went wrong" in capsys.readouterr().err
