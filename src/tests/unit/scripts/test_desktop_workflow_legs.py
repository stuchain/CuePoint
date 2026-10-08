"""The desktop workflow builds four legs named by system and chip (DIST-02, DEC-129)."""

from __future__ import annotations

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

    def test_packaged_e2e_runs_on_the_intel_leg_only(self):
        step = _step("Packaged app end-to-end (Intel Mac)")
        assert step["if"] == "matrix.leg == 'macos-x64'"
        assert step["working-directory"] == "apps/desktop-electron"
        assert step["env"]["CUEPOINT_E2E_EXECUTABLE"] == (
            "${{ github.workspace }}/apps/desktop-electron/release/mac/"
            "CuePoint.app/Contents/MacOS/CuePoint"
        )
        assert step["run"].startswith("npm run test:e2e -- ")

    def test_packaged_e2e_runs_exactly_the_specs_that_launch_the_packaged_app(self):
        e2e = _REPO_ROOT / "apps" / "desktop-electron" / "e2e"
        honouring = {
            f"e2e/{p.name}"
            for p in e2e.glob("*.spec.ts")
            if "CUEPOINT_E2E_EXECUTABLE" in p.read_text(encoding="utf-8")
        }
        run = _step("Packaged app end-to-end (Intel Mac)")["run"]
        named = set(run.split(" -- ", 1)[1].split())
        assert named == honouring
        assert "e2e/smoke.spec.ts" in named


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
            "Packaged app end-to-end (Intel Mac)"
        )


@pytest.mark.unit
class TestChecksums:
    def test_each_leg_writes_its_own_sums_file(self):
        run = _step("Generate SHA256SUMS")["run"]
        assert "generate_sha256_sums.py release --leg ${{ matrix.leg }}" in run
