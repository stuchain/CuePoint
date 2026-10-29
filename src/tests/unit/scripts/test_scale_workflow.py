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
        # The weekly run and a release's do not queue behind (or replace) each other.
        assert "github.event_name" in scale["concurrency"]["group"]


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

    @pytest.mark.parametrize(
        ("which", "size"), [("scale", "50000"), ("scale-100k", "100000")]
    )
    def test_the_four_scale_tests_run_by_path_at_the_size(self, scale, which, size):
        job = scale["jobs"][which]
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
    @pytest.fixture()
    def big(self, scale) -> dict:
        return scale["jobs"]["scale-100k"]

    def test_it_is_its_own_job_that_can_never_fail_the_run(self, scale, big):
        assert big["continue-on-error"] is True
        assert big["needs"] == "scale"
        assert big["timeout-minutes"] >= 240
        assert big["strategy"]["matrix"] == scale["jobs"]["scale"]["strategy"]["matrix"]
        # Not in the 50,000 job: nothing there can be slowed or failed by it.
        for step in scale["jobs"]["scale"]["steps"]:
            assert "100,000" not in step.get("name", "").replace("100,000-track", "")

    def test_a_release_leaves_it_out_and_an_input_less_run_keeps_it(self, scale, big):
        for trigger in ("workflow_call", "workflow_dispatch"):
            option = scale["on"][trigger]["inputs"]["above_reference"]
            assert option["type"] == "boolean" and option["default"] is True
        # `format` makes an absent input (the weekly run) read as true; only `false` skips it.
        assert "format('{0}', inputs.above_reference) != 'false'" in big["if"]
        assert "!cancelled()" in big["if"]

    def test_it_is_not_held_to_a_budget(self, big):
        assert "budget_check.py" not in _runs(big)

    def test_it_runs_at_that_size(self, big):
        assert _step(big, "Scale tests (100,000 tracks)")["env"]["CUEPOINT_SCALE"] == (
            "100000"
        )
        assert (
            "--tracks 100000" in _step(big, "Bench the library (100,000 tracks)")["run"]
        )
        engine = _step(big, "Bench the packaged engine's start (100,000 tracks)")
        assert "--library 100000" in engine["run"]
        assert _step(big, "Packaged app at 100,000 tracks")["env"][
            "CUEPOINT_SCALE"
        ] == ("100000")

    def test_it_builds_its_own_app_and_reads_nothing_from_the_50000_job(self, big):
        names = [s.get("name") for s in big["steps"]]
        assert names.index("Unpack the app") < names.index(
            "Packaged app at 100,000 tracks"
        )
        app = _step(big, "Packaged app at 100,000 tracks")
        assert "steps.unpack.outcome == 'success'" in app["if"]
        assert (
            app["env"]["CUEPOINT_E2E_EXECUTABLE"] == "${{ steps.unpack.outputs.exe }}"
        )
        # A step id is the job's own, so the only `needs` it may read is none at all.
        assert "needs." not in str(big["steps"])

    def test_its_failures_and_json_are_kept_under_its_own_names(self, scale, big):
        shots = _step(big, "Upload Playwright failures (100,000 tracks)")
        assert shots["if"] == "always()"
        assert (
            shots["with"]["name"] == "scale-100k-playwright-failures-${{ matrix.leg }}"
        )
        fifty = _step(scale["jobs"]["scale"], "Upload Playwright failures")
        assert fifty["with"]["name"] != shots["with"]["name"]
        last = big["steps"][-1]
        assert (
            last["name"] == "Upload the 100,000-track JSON" and last["if"] == "always()"
        )


class TestArtifacts:
    def test_each_leg_uploads_its_json_even_when_it_failed(self, job):
        up = _step(job, "Upload the JSON")
        assert up["if"] == "always()"
        assert up["with"]["name"] == "scale-json-${{ matrix.leg }}"

    def test_the_100k_json_has_its_own_name(self, scale):
        up = _step(scale["jobs"]["scale-100k"], "Upload the 100,000-track JSON")
        assert up["with"]["name"] == "scale-json-100k-${{ matrix.leg }}"

    def test_the_tables_are_written_from_what_every_leg_measured(self, scale):
        tables = scale["jobs"]["tables"]
        assert tables["needs"] == ["scale", "scale-100k"]
        assert "performance_tables.py scale-results" in _runs(tables)
        download = next(
            s for s in tables["steps"] if "download-artifact" in s.get("uses", "")
        )
        assert download["with"]["pattern"] == "scale-json-*"
        assert "!cancelled()" in tables["if"]


class TestOrderAndTolerance:
    def test_the_50000_json_is_uploaded_before_the_100000_job_starts(self, scale):
        # `needs` waits for the whole job, upload step included, and the upload is `always()`.
        assert scale["jobs"]["scale-100k"]["needs"] == "scale"
        job = scale["jobs"]["scale"]
        names = [s.get("name") for s in job["steps"]]
        assert names.index("Upload the JSON") > names.index(
            "Packaged app at 50,000 tracks"
        )
        assert _step(job, "Upload the JSON")["if"] == "always()"

    def test_the_tables_job_runs_when_a_leg_or_the_big_run_is_missing(self, scale):
        tables = scale["jobs"]["tables"]
        assert "!cancelled()" in tables["if"]
        assert "scale-100k" in tables["needs"]

    def test_the_tables_script_takes_a_run_with_missing_legs(self, tmp_path):
        import sys

        sys.path.insert(0, str(_SCRIPTS))
        import performance_tables as tables

        assert tables.load_runs(tmp_path / "no-such-folder") == []
        (tmp_path / "windows-x64").mkdir()  # a leg that uploaded nothing
        assert tables.load_runs(tmp_path) == []
        assert tables.render([]).count(tables.PLACEHOLDER) > 0


class TestLinuxApp:
    def test_the_executable_is_named_by_package_json(self, job):
        import json

        package = json.loads(
            (_REPO_ROOT / "apps/desktop-electron/package.json").read_text(
                encoding="utf-8"
            )
        )
        name = package["build"]["linux"]["executableName"]
        assert name
        run = _step(job, "Unpack the app")["run"]
        assert "build.linux.executableName" in run
        assert "find " not in run and "head -n" not in run
