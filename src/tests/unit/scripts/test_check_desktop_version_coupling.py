"""The coupling check holds the version and the release name together (REPORT-07)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(_REPO_ROOT / "scripts"))
sys.path.insert(0, str(_REPO_ROOT / "src"))

import check_desktop_version_coupling as coupling  # noqa: E402

from cuepoint import version  # noqa: E402

BUILD_INFO = """
export const RELEASE_PREFIX = "cuepoint@";
export function computeBuildInfo(input) {
  return { release: `${RELEASE_PREFIX}${input.version}` };
}
"""

MAIN = "const build = currentBuildInfo(app.isPackaged, app.getVersion());\n"


ABOUT = 'export const DESKTOP_ENGINE_VERSION = "1.0.0";\n'


def _write(
    tmp_path: Path,
    declared: str = "1.0.0",
    ts: str = BUILD_INFO,
    main: str = MAIN,
):
    pkg = tmp_path / "package.json"
    pkg.write_text(json.dumps({"version": declared}), encoding="utf-8")
    info = tmp_path / "buildInfo.ts"
    info.write_text(ts, encoding="utf-8")
    (tmp_path / "AboutDialog.tsx").write_text(ABOUT, encoding="utf-8")
    (tmp_path / "main.ts").write_text(main, encoding="utf-8")
    return pkg, info


def _check(
    tmp_path,
    *,
    declared="1.0.0",
    ts=BUILD_INFO,
    release="cuepoint@1.0.0",
    engine="1.0.0",
    main=MAIN,
):
    pkg, info = _write(tmp_path, declared, ts, main)
    return coupling.check(
        pkg,
        info,
        lambda: {"status": "ok", "release": release},
        engine,
        tmp_path / "AboutDialog.tsx",
        tmp_path / "main.ts",
    )


@pytest.mark.unit
class TestCoupling:
    def test_the_repository_agrees_with_itself(self):
        assert coupling.check() == []

    def test_agreement_is_clean(self, tmp_path):
        assert _check(tmp_path) == []

    def test_a_missing_version_fails(self, tmp_path):
        pkg, info = _write(tmp_path)
        pkg.write_text("{}", encoding="utf-8")
        assert coupling.check(
            pkg,
            info,
            lambda: {},
            "1.0.0",
            tmp_path / "AboutDialog.tsx",
            tmp_path / "main.ts",
        ) == ["apps/desktop-electron/package.json missing version"]

    def test_a_placeholder_version_fails(self, tmp_path):
        (error,) = _check(tmp_path, declared="0.0.0")
        assert "0.0.0" in error

    def test_a_version_outside_the_scheme_fails(self, tmp_path):
        (error,) = _check(tmp_path, declared="1.0.0-feb1", engine="1.0.0-feb1")
        assert "1.0.0-feb1" in error

    def test_a_version_mismatch_fails(self, tmp_path):
        (error,) = _check(tmp_path, declared="1.0.1")
        assert "version mismatch" in error
        assert "'1.0.1'" in error and "'1.0.0'" in error

    def test_a_release_the_engine_names_differently_fails(self, tmp_path):
        (error,) = _check(tmp_path, release="cuepoint@9.9.9")
        assert "release mismatch" in error
        assert "cuepoint@1.0.0" in error and "cuepoint@9.9.9" in error

    def test_a_prefix_main_changes_alone_fails(self, tmp_path):
        ts = BUILD_INFO.replace('"cuepoint@"', '"app@"')
        (error,) = _check(tmp_path, ts=ts)
        assert "app@1.0.0" in error

    def test_an_engine_that_names_no_release_fails(self, tmp_path):
        pkg, info = _write(tmp_path)
        (error,) = coupling.check(
            pkg,
            info,
            lambda: {"status": "ok"},
            "1.0.0",
            tmp_path / "AboutDialog.tsx",
            tmp_path / "main.ts",
        )
        assert "release mismatch" in error

    def test_main_that_stops_deriving_its_release_from_the_prefix_fails(self, tmp_path):
        ts = BUILD_INFO.replace("`${RELEASE_PREFIX}${input.version}`", '"fixed"')
        errors = _check(tmp_path, ts=ts)
        assert any("RELEASE_PREFIX + the app version" in e for e in errors)

    def test_main_that_stops_passing_the_app_version_fails(self, tmp_path):
        main = "const build = currentBuildInfo(app.isPackaged, '1.0.0');\n"
        errors = _check(tmp_path, main=main)
        assert any("app.getVersion()" in e for e in errors)

    def test_a_call_whose_result_is_not_kept_fails(self, tmp_path):
        main = "currentBuildInfo(app.isPackaged, app.getVersion());\n"
        assert _check(tmp_path, main=main)

    def test_main_that_wraps_the_call_over_lines_still_passes(self, tmp_path):
        for tail in ("", ","):
            main = f"const build = currentBuildInfo(\n  app.isPackaged,\n  app.getVersion(){tail}\n)"
            assert _check(tmp_path, main=main) == []

    def test_a_stale_about_dialog_version_fails(self, tmp_path):
        pkg, info = _write(tmp_path)
        about = tmp_path / "AboutDialog.tsx"
        about.write_text(
            'export const DESKTOP_ENGINE_VERSION = "0.9.0";', encoding="utf-8"
        )
        health = lambda: {"release": "cuepoint@1.0.0"}  # noqa: E731
        (error,) = coupling.check(
            pkg, info, health, "1.0.0", about, tmp_path / "main.ts"
        )
        assert "DESKTOP_ENGINE_VERSION='0.9.0'" in error

    def test_an_about_dialog_without_the_constant_fails(self, tmp_path):
        pkg, info = _write(tmp_path)
        about = tmp_path / "AboutDialog.tsx"
        about.write_text("export {};", encoding="utf-8")
        health = lambda: {"release": "cuepoint@1.0.0"}  # noqa: E731
        (error,) = coupling.check(
            pkg, info, health, "1.0.0", about, tmp_path / "main.ts"
        )
        assert "does not declare DESKTOP_ENGINE_VERSION" in error

    def test_the_real_engine_reports_the_release_main_builds(self):
        assert (
            coupling.engine_health()["release"]
            == f"{version.RELEASE_PREFIX}{version.__version__}"
        )
