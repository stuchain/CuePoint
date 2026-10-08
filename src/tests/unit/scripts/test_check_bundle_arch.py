"""check_bundle_arch.py: every Mach-O file in a packaged app is for the leg's chip (DIST-02)."""

from __future__ import annotations

import importlib.util
import os
import struct
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "check_bundle_arch.py"
_spec = importlib.util.spec_from_file_location("check_bundle_arch", _SCRIPT)
cba = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cba)

MACHO_64 = bytes.fromhex("cffaedfe") + b"\x00" * 60
FAT = bytes.fromhex("cafebabe") + struct.pack(">I", 2) + b"\x00" * 60
JAVA = bytes.fromhex("cafebabe") + struct.pack(">I", 0x34) + b"\x00" * 60


def fake_lipo(table: dict[str, list[str]]):
    """A runner that answers `lipo -archs <file>` from a table keyed by file name."""

    def run(cmd: list[str]) -> list[str]:
        assert cmd[:2] == ["lipo", "-archs"]
        return table[Path(cmd[2]).name]

    return run


def make_app(tmp_path: Path) -> Path:
    app = tmp_path / "CuePoint.app" / "Contents" / "MacOS"
    app.mkdir(parents=True)
    return tmp_path / "CuePoint.app"


@pytest.mark.unit
class TestIsMachO:
    @pytest.mark.parametrize(
        "magic",
        ["feedface", "feedfacf", "cefaedfe", "cffaedfe"],
    )
    def test_thin_magics(self, tmp_path, magic):
        f = tmp_path / "x"
        f.write_bytes(bytes.fromhex(magic) + b"\x00" * 8)
        assert cba.is_macho(f)

    @pytest.mark.parametrize(
        ("magic", "count"),
        [
            ("cafebabe", struct.pack(">I", 2)),
            ("cafebabf", struct.pack(">I", 2)),
            ("bebafeca", struct.pack("<I", 2)),
            ("bfbafeca", struct.pack("<I", 2)),
        ],
    )
    def test_fat_and_fat64_magics_in_both_byte_orders(self, tmp_path, magic, count):
        f = tmp_path / "x"
        f.write_bytes(bytes.fromhex(magic) + count + b"\x00" * 8)
        assert cba.is_macho(f)

    def test_fat64_with_a_java_sized_count_is_not(self, tmp_path):
        f = tmp_path / "x"
        f.write_bytes(bytes.fromhex("cafebabf") + struct.pack(">I", 0x34) + b"\x00" * 8)
        assert not cba.is_macho(f)

    def test_fat_is_macho_but_java_class_is_not(self, tmp_path):
        (tmp_path / "fat").write_bytes(FAT)
        (tmp_path / "cls").write_bytes(JAVA)
        assert cba.is_macho(tmp_path / "fat")
        assert not cba.is_macho(tmp_path / "cls")

    def test_text_and_tiny_files_are_not(self, tmp_path):
        (tmp_path / "a.txt").write_text("hello world")
        (tmp_path / "tiny").write_bytes(b"\xca")
        assert not cba.is_macho(tmp_path / "a.txt")
        assert not cba.is_macho(tmp_path / "tiny")


@pytest.mark.unit
class TestCheck:
    def test_arm64_only_file_fails_on_x64(self, tmp_path):
        app = make_app(tmp_path)
        (app / "Contents/MacOS/CuePoint").write_bytes(MACHO_64)
        bad = cba.check(app, "x64", runner=fake_lipo({"CuePoint": ["arm64"]}))
        assert [p.name for p in bad] == ["CuePoint"]

    def test_arm64_only_file_passes_on_arm64(self, tmp_path):
        app = make_app(tmp_path)
        (app / "Contents/MacOS/CuePoint").write_bytes(MACHO_64)
        assert cba.check(app, "arm64", runner=fake_lipo({"CuePoint": ["arm64"]})) == []

    def test_universal_file_passes_either_chip(self, tmp_path):
        app = make_app(tmp_path)
        (app / "Contents/MacOS/mpv").write_bytes(FAT)
        run = fake_lipo({"mpv": ["x86_64", "arm64"]})
        assert cba.check(app, "x64", runner=run) == []
        assert cba.check(app, "arm64", runner=run) == []

    def test_non_macho_files_are_skipped_without_calling_lipo(self, tmp_path):
        app = make_app(tmp_path)
        (app / "Contents/Info.plist").write_text("<plist/>")
        (app / "Contents/MacOS/Foo.class").write_bytes(JAVA)

        def boom(cmd):
            raise AssertionError("lipo must not run")

        assert cba.check(app, "x64", runner=boom) == []

    def test_a_symlinked_directory_is_not_descended(self, tmp_path):
        app = make_app(tmp_path)
        real = app / "Contents/Frameworks/A"
        real.mkdir(parents=True)
        (real / "lib.dylib").write_bytes(MACHO_64)
        os.symlink(real, app / "Contents/Frameworks/Current")
        seen: list[str] = []

        def run(cmd):
            seen.append(cmd[2])
            return ["x86_64"]

        assert cba.check(app, "x64", runner=run) == []
        assert seen == [str(real / "lib.dylib")]

    def test_symlinks_are_skipped(self, tmp_path):
        app = make_app(tmp_path)
        real = app / "Contents/MacOS/real"
        real.write_bytes(MACHO_64)
        os.symlink(real, app / "Contents/MacOS/link")
        seen: list[str] = []

        def run(cmd):
            seen.append(Path(cmd[2]).name)
            return ["x86_64"]

        assert cba.check(app, "x64", runner=run) == []
        assert seen == ["real"]


@pytest.mark.unit
class TestMain:
    def test_missing_app_exits_2(self, tmp_path):
        assert cba.main([str(tmp_path / "nope.app"), "--arch", "x64"]) == 2

    def test_failure_prints_file_and_exits_1(self, tmp_path, capsys):
        app = make_app(tmp_path)
        (app / "Contents/MacOS/CuePoint").write_bytes(MACHO_64)
        code = cba.main(
            [str(app), "--arch", "x64"], runner=fake_lipo({"CuePoint": ["arm64"]})
        )
        out = capsys.readouterr()
        assert code == 1
        assert "CuePoint" in out.err + out.out

    def test_success_prints_count_and_exits_0(self, tmp_path, capsys):
        app = make_app(tmp_path)
        (app / "Contents/MacOS/CuePoint").write_bytes(MACHO_64)
        code = cba.main(
            [str(app), "--arch", "arm64"], runner=fake_lipo({"CuePoint": ["arm64"]})
        )
        assert code == 0
        assert "1" in capsys.readouterr().out

    def test_arch_is_required_and_limited(self, tmp_path):
        with pytest.raises(SystemExit):
            cba.main([str(tmp_path), "--arch", "ppc"])
