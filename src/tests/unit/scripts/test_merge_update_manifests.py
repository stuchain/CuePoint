"""merge_update_manifests.py: one latest-mac.yml naming both Mac chips (DIST-03, DEC-129)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
import yaml

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "merge_update_manifests.py"
_spec = importlib.util.spec_from_file_location("merge_update_manifests", _SCRIPT)
mum = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mum)


def manifest(
    chip: str, version: str = "1.0.0-test.1", date: str = "2026-10-08T10:00:00.000Z"
):
    name = f"CuePoint-{version}-mac-{chip}.zip"
    return {
        "version": version,
        "files": [
            {
                "url": name,
                "sha512": f"sha-{chip}",
                "size": 100 if chip == "arm64" else 200,
            }
        ],
        "path": name,
        "sha512": f"sha-{chip}",
        "releaseDate": date,
    }


def write(tmp_path: Path, name: str, data: dict) -> Path:
    p = tmp_path / name
    p.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return p


@pytest.mark.unit
class TestMerge:
    def test_two_manifests_merge_with_both_files_and_one_version(self, tmp_path):
        a = write(tmp_path, "arm64.yml", manifest("arm64"))
        x = write(tmp_path, "x64.yml", manifest("x64", date="2026-10-09T10:00:00.000Z"))
        out = tmp_path / "latest-mac.yml"
        assert mum.main([str(a), str(x), "-o", str(out)]) == 0
        merged = yaml.safe_load(out.read_text(encoding="utf-8"))
        assert merged["version"] == "1.0.0-test.1"
        assert [f["url"] for f in merged["files"]] == [
            "CuePoint-1.0.0-test.1-mac-arm64.zip",
            "CuePoint-1.0.0-test.1-mac-x64.zip",
        ]
        assert [f["sha512"] for f in merged["files"]] == ["sha-arm64", "sha-x64"]
        assert [f["size"] for f in merged["files"]] == [100, 200]
        # Legacy top-level fields come from the arm64 manifest; the date is the later one.
        assert merged["path"] == "CuePoint-1.0.0-test.1-mac-arm64.zip"
        assert merged["sha512"] == "sha-arm64"
        assert str(merged["releaseDate"]).startswith("2026-10-09")

    def test_argument_order_does_not_matter(self, tmp_path):
        a = write(tmp_path, "arm64.yml", manifest("arm64"))
        x = write(tmp_path, "x64.yml", manifest("x64"))
        out = tmp_path / "o.yml"
        mum.main([str(x), str(a), "-o", str(out)])
        merged = yaml.safe_load(out.read_text(encoding="utf-8"))
        assert "arm64" in merged["files"][0]["url"]
        assert merged["sha512"] == "sha-arm64"

    def test_default_output_is_latest_mac_yml(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        a = write(tmp_path, "arm64.yml", manifest("arm64"))
        x = write(tmp_path, "x64.yml", manifest("x64"))
        assert mum.main([str(a), str(x)]) == 0
        assert (tmp_path / "latest-mac.yml").is_file()

    def test_differing_versions_fail(self, tmp_path, capsys):
        a = write(tmp_path, "arm64.yml", manifest("arm64"))
        x = write(tmp_path, "x64.yml", manifest("x64", version="1.0.0-test.2"))
        out = tmp_path / "o.yml"
        assert mum.main([str(a), str(x), "-o", str(out)]) == 1
        assert "version" in capsys.readouterr().err
        assert not out.exists()

    def test_a_file_name_without_a_chip_fails(self, tmp_path, capsys):
        bad = manifest("x64")
        bad["files"][0]["url"] = "CuePoint-1.0.0-test.1-mac.zip"
        a = write(tmp_path, "arm64.yml", manifest("arm64"))
        x = write(tmp_path, "x64.yml", bad)
        assert mum.main([str(a), str(x), "-o", str(tmp_path / "o.yml")]) == 1
        assert "mac.zip" in capsys.readouterr().err

    def test_same_chip_twice_fails(self, tmp_path, capsys):
        a = write(tmp_path, "a.yml", manifest("arm64"))
        b = write(tmp_path, "b.yml", manifest("arm64"))
        assert mum.main([str(a), str(b), "-o", str(tmp_path / "o.yml")]) == 1
        assert "arm64" in capsys.readouterr().err

    def test_missing_file_fails_cleanly(self, tmp_path):
        a = write(tmp_path, "a.yml", manifest("arm64"))
        assert mum.main([str(a), str(tmp_path / "nope.yml")]) == 1


def realistic(chip: str, date: str) -> dict:
    """What electron-builder 25 writes for a Mac leg: the zip and the dmg, with block map sizes."""
    base = f"CuePoint-1.0.0-test.1-mac-{chip}"
    return {
        "version": "1.0.0-test.1",
        "files": [
            {
                "url": f"{base}.zip",
                "sha512": f"zip-{chip}",
                "size": 111,
                "blockMapSize": 11,
            },
            {
                "url": f"{base}.dmg",
                "sha512": f"dmg-{chip}",
                "size": 222,
                "blockMapSize": 22,
            },
        ],
        "path": f"{base}.zip",
        "sha512": f"zip-{chip}",
        "releaseDate": date,
    }


@pytest.mark.unit
class TestRealisticManifests:
    def test_all_four_entries_and_their_keys_survive(self, tmp_path):
        a = write(tmp_path, "arm64.yml", realistic("arm64", "2026-10-08T10:00:00.000Z"))
        x = write(tmp_path, "x64.yml", realistic("x64", "2026-10-08T11:00:00.000Z"))
        out = tmp_path / "latest-mac.yml"
        assert mum.main([str(a), str(x), "-o", str(out)]) == 0
        merged = yaml.safe_load(out.read_text(encoding="utf-8"))
        assert [f["url"] for f in merged["files"]] == [
            "CuePoint-1.0.0-test.1-mac-arm64.zip",
            "CuePoint-1.0.0-test.1-mac-arm64.dmg",
            "CuePoint-1.0.0-test.1-mac-x64.zip",
            "CuePoint-1.0.0-test.1-mac-x64.dmg",
        ]
        for entry in merged["files"]:
            assert set(entry) == {"url", "sha512", "size", "blockMapSize"}
        assert merged["files"][3] == realistic("x64", "")["files"][1]
        assert merged["path"].endswith("-mac-arm64.zip")
        assert merged["sha512"] == "zip-arm64"
        assert str(merged["releaseDate"]).startswith("2026-10-08T11")
