"""The desktop workflow builds four legs named by system and chip (DIST-02, DEC-129)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[4]
_WORKFLOW = (
    Path(__file__).resolve().parents[4]
    / ".github"
    / "workflows"
    / "desktop-electron.yml"
)


def _job() -> dict:
    return yaml.safe_load(_WORKFLOW.read_text(encoding="utf-8"))["jobs"][
        "desktop-electron"
    ]


def _legs() -> dict[str, dict]:
    return {leg["leg"]: leg for leg in _job()["strategy"]["matrix"]["include"]}


def _step(name: str) -> dict:
    return next(s for s in _job()["steps"] if s.get("name") == name)


@pytest.mark.unit
class TestLegs:
    def test_four_legs_with_runners_and_chips(self):
        legs = _legs()
        assert {k: (v["runner"], v["builder_arch"]) for k, v in legs.items()} == {
            "windows-x64": ("windows-latest", ""),
            "linux-x64": ("ubuntu-latest", ""),
            "macos-arm64": ("macos-latest", "--arm64"),
            "macos-x64": ("macos-15-intel", "--x64"),
        }

    def test_mac_legs_name_their_output_folder(self):
        legs = _legs()
        assert legs["macos-arm64"]["mac_dir"] == "mac-arm64"
        assert legs["macos-x64"]["mac_dir"] == "mac"

    def test_fail_fast_is_off_and_runner_and_artifact_come_from_the_leg(self):
        job = _job()
        assert job["strategy"]["fail-fast"] is False
        assert job["runs-on"] == "${{ matrix.runner }}"
        upload = _step("Upload Electron artifacts")
        assert upload["with"]["name"] == "desktop-electron-${{ matrix.leg }}"

    def test_package_passes_the_chip(self):
        assert _step("Build Electron installers + artifacts")["run"] == (
            "npm run package -- ${{ matrix.builder_arch }}"
        )


@pytest.mark.unit
class TestMacGuards:
    @pytest.mark.parametrize("leg", ["macos-arm64", "macos-x64"])
    def test_mac_legs_check_arch_and_bundle_after_packaging(self, leg):
        steps = _job()["steps"]
        names = [s.get("name") for s in steps]
        pkg = names.index("Build Electron installers + artifacts")
        arch = steps[names.index("Check bundle architecture")]
        verify = steps[names.index("Verify macOS bundle")]
        assert names.index("Check bundle architecture") > pkg
        assert names.index("Verify macOS bundle") > pkg
        assert "matrix.mac_dir" in arch["run"]
        assert "check_bundle_arch.py" in arch["run"]
        assert "--arch ${{ matrix.chip }}" in arch["run"]
        assert "verify_macos_bundle.py" in verify["run"]
        assert "--expect-hardened-runtime" not in verify["run"]
        for s in (arch, verify):
            assert "startsWith(matrix.leg, 'macos')" in s["if"]
        assert _legs()[leg]["chip"] in ("arm64", "x64")

    def test_chips_match_the_legs(self):
        legs = _legs()
        assert legs["macos-arm64"]["chip"] == "arm64"
        assert legs["macos-x64"]["chip"] == "x64"

    def test_the_bundle_check_is_for_an_unsigned_bundle_on_a_push(self):
        # DEC-170: no Developer ID, so no hardened-runtime demand, and no `release` condition:
        # it runs on pushes (HARDEN-09), after the package is built.
        verify = _step("Verify macOS bundle")
        assert "--expect-hardened-runtime" not in verify["run"]
        assert "inputs.release" not in verify["if"]
        names = [s.get("name") for s in _job()["steps"]]
        assert names.index("Verify macOS bundle") > names.index(
            "Build Electron installers + artifacts"
        )


@pytest.mark.unit
class TestPackagedRun:
    """HARDEN-09: the packaged app is run on every leg, the whole suite on a release."""

    def test_the_packaged_app_is_found_per_system_the_way_electron_builder_writes_it(
        self,
    ):
        step = _step("Locate the packaged app")
        assert step["id"] == "app"
        assert step["working-directory"] == "apps/desktop-electron"
        run = step["run"]
        assert "release/win-unpacked/CuePoint.exe" in run
        assert (
            "release/${{ matrix.mac_dir }}/CuePoint.app/Contents/MacOS/CuePoint" in run
        )
        # The Linux file is named by the builder's own config, not a copy of it.
        assert "build.linux.executableName" in run
        assert "release/linux-unpacked/${name}" in run
        assert 'test -f "$exe"' in run

    def test_the_names_it_looks_for_are_what_the_builder_is_configured_to_write(self):
        package = json.loads(
            (_REPO_ROOT / "apps" / "desktop-electron" / "package.json").read_text(
                encoding="utf-8"
            )
        )["build"]
        assert package["linux"]["executableName"] == "cuepoint"
        assert package["productName"] == "CuePoint"
        assert package["win"]["target"] == ["nsis"]

    def test_it_runs_after_packaging_and_the_mac_bundle_check(self):
        names = [s.get("name") for s in _job()["steps"]]
        assert names.index("Locate the packaged app") > names.index(
            "Verify macOS bundle"
        )
        assert names.index("Packaged app end-to-end") > names.index(
            "Locate the packaged app"
        )

    def test_it_runs_on_every_leg_against_the_located_app(self):
        step = _step("Packaged app end-to-end")
        assert step["id"] == "packaged-e2e"
        # No leg condition: all four run it.
        assert "matrix.leg" not in step["if"]
        assert step["working-directory"] == "apps/desktop-electron"
        assert step["env"]["CUEPOINT_E2E_EXECUTABLE"] == "${{ steps.app.outputs.exe }}"
        assert step["shell"] == "bash"

    def test_a_push_runs_the_smoke_subset_and_a_release_the_whole_suite(self):
        step = _step("Packaged app end-to-end")
        assert (
            step["env"]["RELEASE_RUN"] == "${{ inputs.release && 'true' || 'false' }}"
        )
        run = step["run"]
        assert 'if [ "$RELEASE_RUN" = "true" ]' in run
        assert 'filter=""' in run
        assert 'filter="--grep @packaged-smoke"' in run
        assert "playwright test $filter" in run

    def test_linux_runs_it_under_xvfb_with_the_sound_device_set_up(self):
        run = _step("Packaged app end-to-end")["run"]
        assert 'if [ "$RUNNER_OS" = "Linux" ]' in run
        assert "xvfb-run -a npx playwright test $filter" in run
        audio = _step("Install mpv and a null sound device (Linux)")
        assert audio["if"] == "runner.os == 'Linux'"
        assert "GITHUB_ENV" in audio["run"]
        names = [s.get("name") for s in _job()["steps"]]
        assert names.index(audio["name"]) < names.index("Playwright Electron smoke")

    def test_the_development_suite_still_runs_whole_on_every_leg(self):
        # The Intel leg used to skip the specs that could launch a packaged app, because it ran
        # them packaged; a push now runs only the smoke subset packaged, so nothing is skipped.
        run = _step("Playwright Electron smoke")["run"]
        assert "grep -L" not in run and "macos-x64" not in run

    def test_no_source_map_may_ship_and_every_leg_looks(self):
        step = _step("Check no source map ships")
        assert "matrix.leg" not in step["if"]
        assert step["env"]["APP_EXE"] == "${{ steps.app.outputs.exe }}"
        run = step["run"]
        # The archive is app.asar: beside the exe on Windows and Linux, in Resources on a Mac.
        assert "/../Resources" in run and "/resources" in run
        assert "asar list" in run
        names = [s.get("name") for s in _job()["steps"]]
        assert names.index("Locate the packaged app") < names.index(step["name"])

    def test_the_packaged_run_keeps_its_failures(self):
        for name in (
            "Print the packaged run's failure snapshots",
            "Upload the packaged run's failures",
        ):
            assert _step(name)["if"] == (
                "failure() && steps.packaged-e2e.outcome == 'failure'"
            )

    def test_playwright_is_installed_without_system_dependencies(self):
        # `--with-deps` must not be used on Ubuntu 26.04.
        runs = "\n".join(s.get("run", "") for s in _job()["steps"])
        assert "--with-deps" not in runs
        assert (
            _step("Install Playwright Chromium")["run"]
            == "npx playwright install chromium"
        )

    def test_a_run_in_progress_is_not_cancelled(self):
        workflow = yaml.safe_load(_WORKFLOW.read_text(encoding="utf-8"))
        assert workflow["concurrency"]["cancel-in-progress"] is False

    def test_every_spec_starts_the_app_through_the_helper(self):
        e2e = _REPO_ROOT / "apps" / "desktop-electron" / "e2e"
        helper = (e2e / "support" / "launchApp.ts").read_text(encoding="utf-8")
        assert "CUEPOINT_E2E_EXECUTABLE" in helper
        offenders = [
            path.name
            for path in sorted([*e2e.glob("*.ts"), *e2e.glob("capture/*.ts")])
            if re.search(r"\belectron\.launch\(", path.read_text(encoding="utf-8"))
        ]
        assert offenders == [], f"start the app with launchElectron: {offenders}"

    def test_the_smoke_subset_covers_start_import_play_export_and_quit(self):
        e2e = _REPO_ROOT / "apps" / "desktop-electron" / "e2e"
        tagged = {
            path.name
            for path in e2e.glob("*.spec.ts")
            if '"@packaged-smoke"' in path.read_text(encoding="utf-8")
        }
        assert tagged == {
            "smoke.spec.ts",  # start
            "libraryImport.spec.ts",  # import
            "playerQueue.spec.ts",  # play
            "rekordboxExport.spec.ts",  # export
            "engineLifetime.spec.ts",  # quit
        }


@pytest.mark.unit
class TestTheSmokeHasAScreen:
    def test_linux_runs_the_e2e_under_xvfb(self):
        # Regression: with no display each test waited out Playwright's launch timeout.
        step = _step("Playwright Electron smoke")
        assert step["shell"] == "bash"
        assert 'if [ "$RUNNER_OS" = "Linux" ]' in step["run"]
        assert "xvfb-run -a npm run test:e2e" in step["run"]


@pytest.mark.unit
class TestKeepsFilesOnFailure:
    def test_checksums_and_upload_run_after_a_failed_check_once_packaged(self):
        steps = _job()["steps"]
        package = _step("Build Electron installers + artifacts")
        assert package["id"] == "package"
        names = [s.get("name") for s in steps]
        for name in ("Generate SHA256SUMS", "Upload Electron artifacts"):
            assert _step(name)["if"] == "always() && steps.package.outcome == 'success'"
        # They come after the checks they must outlive.
        assert names.index("Generate SHA256SUMS") > names.index("Verify macOS bundle")
        assert names.index("Generate SHA256SUMS") > names.index(
            "Packaged app end-to-end"
        )


@pytest.mark.unit
class TestChecksums:
    def test_each_leg_writes_its_own_sums_file(self):
        run = _step("Generate SHA256SUMS")["run"]
        assert "generate_sha256_sums.py release --leg ${{ matrix.leg }}" in run
