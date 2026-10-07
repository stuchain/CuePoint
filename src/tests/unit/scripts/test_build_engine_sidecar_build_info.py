"""The sidecar records its build, and a build never claims to be another (REPORT-07)."""

from __future__ import annotations

import importlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(_REPO_ROOT / "scripts"))
sys.path.insert(0, str(_REPO_ROOT / "src"))

import build_engine_sidecar  # noqa: E402

NOW = datetime(2026, 10, 7, 12, 0, 0, tzinfo=timezone.utc)
SHA = "e069c0a9d30f125488e8ca2ba7240e73eb124b62"


@pytest.mark.unit
class TestBuildInfo:
    def test_records_the_commit_ci_names_and_the_date(self):
        info = build_engine_sidecar.build_info(
            {"CUEPOINT_BUILD_COMMIT": SHA.upper()}, NOW
        )
        assert info == {"commit_sha": SHA, "build_date": "2026-10-07T12:00:00+00:00"}

    @pytest.mark.parametrize("value", [None, "", "  ", "unknown", "main", "abc12"])
    def test_records_no_commit_unless_given_a_real_one(self, value):
        environ = {} if value is None else {"CUEPOINT_BUILD_COMMIT": value}
        assert build_engine_sidecar.build_info(environ, NOW)["commit_sha"] is None

    def test_file_name_matches_the_one_version_py_reads(self):
        from cuepoint import version

        assert build_engine_sidecar.BUILD_INFO_FILENAME == version.BUILD_INFO_FILENAME

    def test_spec_bundles_the_file_the_script_names(self):
        spec = (_REPO_ROOT / "build" / "engine-sidecar.spec").read_text(
            encoding="utf-8"
        )
        assert build_engine_sidecar.BUILD_INFO_FILE_ENV in spec

    def test_main_hands_the_spec_a_temporary_file_and_writes_nothing_in_the_repository(
        self, monkeypatch
    ):
        def tree():
            return sorted(
                p.relative_to(_REPO_ROOT).as_posix()
                for root in ("src/cuepoint", "scripts", "build")
                for p in (_REPO_ROOT / root).rglob("*")
                if "__pycache__" not in p.parts
            )

        seen = {}

        def fake_run(cmd, **kwargs):
            path = Path(kwargs["env"][build_engine_sidecar.BUILD_INFO_FILE_ENV])
            seen["path"] = path
            seen["info"] = json.loads(path.read_text("utf-8"))
            return type("Done", (), {"returncode": 1})()

        monkeypatch.setenv("CUEPOINT_BUILD_COMMIT", SHA)
        monkeypatch.setattr(build_engine_sidecar.subprocess, "run", fake_run)
        before = tree()

        assert (
            build_engine_sidecar.main() == 1
        )  # PyInstaller "failed": nothing more is run

        assert seen["info"]["commit_sha"] == SHA
        assert seen["path"].name == build_engine_sidecar.BUILD_INFO_FILENAME
        assert not seen["path"].exists()  # the temporary folder is gone
        assert _REPO_ROOT not in seen["path"].parents
        assert tree() == before


@pytest.mark.unit
class TestFrozenVersionReadsIt:
    def _frozen(self, monkeypatch, bundle: Path):
        import cuepoint.version as version

        monkeypatch.setattr(sys, "frozen", True, raising=False)
        monkeypatch.setattr(sys, "_MEIPASS", str(bundle), raising=False)
        return importlib.reload(version)

    @pytest.fixture(autouse=True)
    def _reload_after(self, monkeypatch):
        yield
        import cuepoint.version as version

        monkeypatch.undo()
        importlib.reload(version)

    def test_reads_commit_and_date_from_the_bundle(self, monkeypatch, tmp_path):
        build_engine_sidecar.write_build_info(
            tmp_path, {"commit_sha": SHA, "build_date": "2026-10-07T12:00:00+00:00"}
        )
        version = self._frozen(monkeypatch, tmp_path)
        assert version.get_commit_sha() == SHA
        assert version.get_short_commit_sha() == SHA[:7]
        assert version.get_build_date() == "2026-10-07T12:00:00+00:00"
        assert version.is_dev_build() is False

    def test_a_bundle_without_the_file_claims_nothing(self, monkeypatch, tmp_path):
        version = self._frozen(monkeypatch, tmp_path)
        assert version.get_commit_sha() is None
        assert version.get_build_date() is None
        assert version.get_build_number() is None
        assert version.is_dev_build() is True

    def test_a_damaged_file_claims_nothing(self, monkeypatch, tmp_path):
        (tmp_path / "cuepoint_build.json").write_text("{not json", encoding="utf-8")
        version = self._frozen(monkeypatch, tmp_path)
        assert version.get_commit_sha() is None


@pytest.mark.unit
def test_a_source_checkout_records_no_build():
    from cuepoint import version

    assert version.get_commit_sha() is None
    assert version.get_build_number() is None
    assert version.get_build_date() is None
    assert version.get_release() == f"cuepoint@{version.__version__}"
