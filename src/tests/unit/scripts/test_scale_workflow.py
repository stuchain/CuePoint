"""The scale workflow runs every scale test and bench on the four builds (HARDEN-07, DEC-184).

Nothing here runs a workflow; it reads the YAML, as the other workflow tests do.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[4]
_WORKFLOWS = _REPO_ROOT / ".github" / "workflows"
_SCRIPTS = _REPO_ROOT / "scripts"

pytestmark = pytest.mark.unit


def _load(name: str) -> dict:
    data = yaml.safe_load((_WORKFLOWS / name).read_text(encoding="utf-8"))
    # PyYAML reads the bare key `on` as the boolean True.
    if True in data:
        data["on"] = data.pop(True)
    return data


@pytest.fixture(scope="module")
def scale() -> dict:
    return _load("scale.yml")


@pytest.fixture(scope="module")
def job(scale) -> dict:
    return scale["jobs"]["scale"]


def _runs(job: dict) -> str:
    return "\n".join(s.get("run", "") for s in job["steps"])


def _step(job: dict, name: str) -> dict:
    return next(s for s in job["steps"] if s.get("name") == name)


class TestTriggers:
    def test_weekly_by_hand_and_callable(self, scale):
        on = scale["on"]
        assert set(on) == {"schedule", "workflow_dispatch", "workflow_call"}
        assert len(on["schedule"]) == 1
        assert on["schedule"][0]["cron"].split()[4] != "*"

    def test_it_is_not_part_of_a_push(self, scale):
        assert "push" not in scale["on"] and "pull_request" not in scale["on"]

    def test_a_run_in_progress_is_never_cancelled(self, scale):
        assert scale["concurrency"]["cancel-in-progress"] is False
        # Not `github.workflow`: called from release.yml that is the caller's name, which the
        # build workflow's group would share.
        assert "github.workflow" not in scale["concurrency"]["group"]


class TestLegs:
    def test_the_four_legs_are_the_desktop_workflows(self, job):
        build = _load("desktop-electron.yml")["jobs"]["desktop-electron"]
        assert job["strategy"]["matrix"] == build["strategy"]["matrix"]
        assert job["strategy"]["fail-fast"] is False
        assert job["runs-on"] == "${{ matrix.runner }}"

    def test_each_leg_holds_itself_to_its_own_budgets(self, job):
        assert job["env"]["CUEPOINT_BENCH_LEG"] == "${{ matrix.leg }}"

    def test_the_timeout_is_generous(self, job):
        assert job["timeout-minutes"] >= 240


class TestSetup:
    def test_the_setup_is_the_desktop_workflows(self, job):
        build = _load("desktop-electron.yml")["jobs"]["desktop-electron"]
        theirs = {s["name"]: s for s in build["steps"] if "name" in s}
        for name in (
            "Checkout code",
            "Set up Node.js",
            "Set up Python",
            "Install Python dependencies",
            "Install desktop dependencies",
            "Build desktop shell",
            "Fetch player sidecar (mpv)",
            "Give the Windows runner a sound device",
            "Install Playwright Chromium",
        ):
            mine = _step(job, name)
            for key in ("uses", "with", "run", "if", "working-directory"):
                assert mine.get(key) == theirs[name].get(key), (name, key)

    def test_the_engine_sidecar_is_built_the_same_way(self, job):
        assert _step(job, "Build engine sidecar (packaged)")["run"] == (
            "python scripts/build_engine_sidecar.py"
        )

    def test_playwright_is_installed_without_system_dependencies(self, job):
        assert "--with-deps" not in _runs(job)


class TestScaleTests:
    PATHS = [
        f"src/tests/performance/test_{name}_scale.py"
        for name in ("library", "marks", "sets", "waveforms")
    ]

    @pytest.mark.parametrize("size", ["50000", "100000"])
    def test_the_four_scale_tests_run_by_path_at_the_size(self, job, size):
        step = next(
            s
            for s in job["steps"]
            if s.get("env", {}).get("CUEPOINT_SCALE") == size
            and "pytest" in s.get("run", "")
        )
        for path in self.PATHS:
            assert path in step["run"]
        # By path, not by marker: the marker would run the whole performance suite.
        assert "-m performance" not in step["run"]
        assert " -m " not in step["run"].replace("python -m pytest", "")

    def test_the_paths_exist(self):
        for path in self.PATHS:
            assert (_REPO_ROOT / path).is_file()


class TestBenches:
    def test_every_bench_script_runs_with_json(self, job):
        text = _runs(job)
        for script in sorted(_SCRIPTS.glob("bench_*.py")):
            needle = f"scripts/{script.name}"
            assert needle in text, f"{script.name} is not run by scale.yml"
            line = next(row for row in text.splitlines() if needle in row)
            assert "--json" in line, script.name

    def test_a_bench_that_misses_its_budget_fails_its_step(self, job):
        for step in job["steps"]:
            if "scripts/bench_" in step.get("run", "") and "scale-out/" in step["run"]:
                assert "continue-on-error" not in step
                assert "|| true" not in step["run"]

    def test_the_engine_starts_on_a_full_library_from_the_packaged_exe(self, job):
        step = _step(job, "Bench the packaged engine's start (50,000 tracks)")
        assert "bench_engine_start.py --library 50000" in step["run"]
        assert "--exe" in step["run"] and "resources/engine" in step["run"]

    def test_each_step_runs_after_a_failed_one(self, job):
        benches = [s for s in job["steps"] if s.get("name", "").startswith("Bench ")]
        assert len(benches) >= 12
        for step in benches:
            assert "!cancelled()" in step["if"]


class TestPackagedApp:
    def test_the_spec_runs_against_the_unpacked_app(self, job):
        unpack = _step(job, "Unpack the app")
        assert "npm run pack" in unpack["run"]
        assert "matrix.builder_arch" in unpack["run"]
        spec = _step(job, "Packaged app at 50,000 tracks")
        assert (
            spec["env"]["CUEPOINT_E2E_EXECUTABLE"] == "${{ steps.unpack.outputs.exe }}"
        )
        assert spec["env"]["CUEPOINT_SCALE_E2E"] == "1"
        assert "e2e/libraryScale.spec.ts" in spec["run"]
        assert "xvfb-run" in spec["run"]

    def test_its_numbers_are_held_to_the_budgets(self, job):
        step = _step(job, "Hold the packaged app to its budgets")
        assert "budget_check.py check e2e" in step["run"]

    def test_the_spec_exists_and_is_off_by_default(self):
        spec = (
            _REPO_ROOT / "apps/desktop-electron/e2e/libraryScale.spec.ts"
        ).read_text(encoding="utf-8")
        assert "CUEPOINT_SCALE_E2E" in spec and "CUEPOINT_E2E_EXECUTABLE" in spec


class TestHundredThousand:
    def _steps(self, job):
        return [
            s
            for s in job["steps"]
            if "100,000" in s.get("name", "") and "JSON" not in s.get("name", "")
        ]

    def test_it_is_recorded_and_never_fails_the_run(self, job):
        steps = self._steps(job)
        assert len(steps) >= 4
        for step in steps:
            assert step["continue-on-error"] is True, step["name"]

    def test_it_is_not_held_to_a_budget(self, job):
        for step in self._steps(job):
            assert "budget_check.py" not in step.get("run", "")

    def test_it_runs_at_that_size(self, job):
        assert _step(job, "Scale tests (100,000 tracks)")["env"]["CUEPOINT_SCALE"] == (
            "100000"
        )
        assert (
            "--tracks 100000" in _step(job, "Bench the library (100,000 tracks)")["run"]
        )
        engine = _step(job, "Bench the packaged engine's start (100,000 tracks)")
        assert "--library 100000" in engine["run"]
        app = _step(job, "Packaged app at 100,000 tracks")
        assert app["env"]["CUEPOINT_SCALE"] == "100000"


class TestArtifacts:
    def test_each_leg_uploads_its_json_even_when_it_failed(self, job):
        up = _step(job, "Upload the JSON")
        assert up["if"] == "always()"
        assert up["with"]["name"] == "scale-json-${{ matrix.leg }}"

    def test_the_100k_json_has_its_own_name(self, job):
        up = _step(job, "Upload the 100,000-track JSON")
        assert up["with"]["name"] == "scale-json-100k-${{ matrix.leg }}"

    def test_the_tables_are_written_from_what_every_leg_measured(self, scale):
        tables = scale["jobs"]["tables"]
        assert tables["needs"] == "scale"
        assert "performance_tables.py scale-results" in _runs(tables)
        download = next(
            s for s in tables["steps"] if "download-artifact" in s.get("uses", "")
        )
        assert download["with"]["pattern"] == "scale-json-*"
        assert "!cancelled()" in tables["if"]
