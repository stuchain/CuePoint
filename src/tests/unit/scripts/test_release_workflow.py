"""Tests for the release workflows (DIST-04, DEC-170, DEC-177, DEC-178).

Nothing here runs a workflow; it reads the YAML and holds the order and the
rules that make a tag publish a release safely: gate, build, check the Macs,
draft, upload, and only then publish.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[4]
_WORKFLOWS = _REPO_ROOT / ".github" / "workflows"

pytestmark = pytest.mark.unit


def _load(name: str) -> dict:
    data = yaml.safe_load((_WORKFLOWS / name).read_text(encoding="utf-8"))
    # PyYAML reads the bare key `on` as the boolean True.
    if True in data:
        data["on"] = data.pop(True)
    return data


@pytest.fixture(scope="module")
def release() -> dict:
    return _load("release.yml")


@pytest.fixture(scope="module")
def build_workflow() -> dict:
    return _load("desktop-electron.yml")


def _runs(job: dict) -> str:
    return "\n".join(s.get("run", "") for s in job["steps"])


def _gh_steps(job: dict) -> list:
    """The steps that make the release; the website redeploy after it is not one (SITE-13)."""
    return [s for s in job["steps"] if "gh release" in s.get("run", "")]


def _index(text: str, needle: str) -> int:
    assert needle in text, f"{needle!r} not found"
    return text.index(needle)


class TestMirrorWorkflow:
    def test_runs_on_each_re_pin_and_by_hand_and_is_serialised(self):
        wf = _load("mirror-player-sidecar.yml")
        assert wf["on"] == {
            "push": {
                "branches": ["main", "feature"],
                "paths": ["scripts/player_sidecar_manifest.json"],
            },
            "workflow_dispatch": None,
        }
        assert wf["concurrency"]["group"]
        assert wf["permissions"] == {"contents": "write"}


class TestTrigger:
    def test_runs_on_v_tags_only(self, release):
        assert release["on"] == {"push": {"tags": ["v*"]}}

    def test_default_permissions_are_read_only(self, release):
        assert release["permissions"] == {"contents": "read"}

    def test_only_publish_can_write(self, release):
        for name, job in release["jobs"].items():
            perms = job.get("permissions", {})
            if name == "publish":
                assert perms.get("contents") == "write"
            else:
                assert perms.get("contents", "read") == "read"

    def test_publish_is_serialised_per_tag(self, release):
        group = release["jobs"]["publish"]["concurrency"]
        text = group["group"] if isinstance(group, dict) else group
        assert "github.ref_name" in text or "github.ref" in text


class TestJobOrder:
    def test_gate_build_check_publish(self, release):
        jobs = release["jobs"]
        assert "needs" not in jobs["gate"]
        assert jobs["build"]["needs"] == "gate"
        assert jobs["check-macs"]["needs"] == "build"
        assert jobs["scale"]["needs"] == "gate"
        assert jobs["acceptance"]["needs"] == "gate"
        assert set(jobs["publish"]["needs"]) == {
            "gate",
            "check-macs",
            "scale",
            "acceptance",
        }

    def test_scale_runs_before_a_normal_tag_is_published_and_not_for_a_test_tag(
        self, release
    ):
        scale = release["jobs"]["scale"]
        assert scale["uses"] == "./.github/workflows/scale.yml"
        # The gate's `prerelease` is true for `-test.` tags: no scale run for those.
        assert scale["if"] == "${{ needs.gate.outputs.prerelease != 'true' }}"
        assert scale["permissions"] == {"contents": "read"}

    def test_a_red_scale_run_stops_a_normal_tag_and_never_a_test_tag(self, release):
        # A skipped need would skip `publish`, so the condition is spelled out: scale green, or
        # skipped on a test tag. A red or cancelled scale run on a normal tag publishes nothing.
        condition = " ".join(release["jobs"]["publish"]["if"].split())
        assert "!cancelled()" in condition
        assert "needs.gate.result == 'success'" in condition
        assert "needs.check-macs.result == 'success'" in condition
        assert "needs.scale.result == 'success'" in condition
        assert (
            "needs.scale.result == 'skipped' && needs.gate.outputs.prerelease == 'true'"
            in condition
        )
        assert "needs.scale.result != 'failure'" not in condition

    def test_build_calls_the_build_workflow_as_a_release(self, release):
        build = release["jobs"]["build"]
        assert build["uses"] == "./.github/workflows/desktop-electron.yml"
        assert build["with"] == {"release": True}
        assert build["secrets"] == "inherit"


class TestGate:
    def test_validates_the_tag_and_the_changelog(self, release):
        text = _runs(release["jobs"]["gate"])
        assert 'validate_version.py --tag "${GITHUB_REF_NAME}"' in text
        assert "release_notes.py" in text
        assert "notes.md" in text

    def test_history_is_fetched_for_the_ancestry_check(self, release):
        checkout = next(
            s
            for s in release["jobs"]["gate"]["steps"]
            if str(s.get("uses", "")).startswith("actions/checkout")
        )
        assert checkout["with"]["fetch-depth"] == 0

    def test_a_normal_tag_must_be_on_main(self, release):
        text = _runs(release["jobs"]["gate"])
        assert 'git merge-base --is-ancestor "$GITHUB_SHA" origin/main' in text
        # Test tags skip it.
        assert "-test." in text
        assert _index(text, "-test.") < _index(text, "merge-base")

    def test_outputs_version_and_prerelease(self, release):
        outputs = release["jobs"]["gate"]["outputs"]
        assert set(outputs) >= {"version", "prerelease"}

    def test_notes_are_uploaded_for_publish(self, release):
        uploads = [
            s
            for s in release["jobs"]["gate"]["steps"]
            if str(s.get("uses", "")).startswith("actions/upload-artifact")
        ]
        assert any("notes.md" in str(u["with"]["path"]) for u in uploads)


class TestCheckMacs:
    def test_runs_on_a_mac_and_takes_both_chips(self, release):
        job = release["jobs"]["check-macs"]
        assert job["runs-on"] == "macos-latest"
        download = next(
            s for s in job["steps"] if "download-artifact" in str(s.get("uses", ""))
        )
        assert download["with"]["pattern"] == "release-macos-*"
        text = _runs(job)
        assert "arm64" in text and "x64" in text

    def test_verifies_the_bundle_and_the_signature(self, release):
        text = _runs(release["jobs"]["check-macs"])
        assert "ditto -x -k" in text
        assert "verify_macos_bundle.py" in text
        assert "codesign --verify --deep --strict" in text

    def test_no_hardened_runtime_is_demanded(self, release):
        # DEC-170: unsigned, so the ad hoc signature is all there is.
        assert "--expect-hardened-runtime" not in _runs(release["jobs"]["check-macs"])


class TestPublish:
    @pytest.fixture()
    def job(self, release):
        return release["jobs"]["publish"]

    def test_draft_then_upload_then_publish(self, job):
        text = _runs(job)
        create = _index(text, "gh release create")
        upload = _index(text, "gh release upload")
        edit = _index(text, "gh release edit")
        assert create < upload < edit
        assert "--draft" in text[create:upload]
        assert "--verify-tag" in text[create:upload]
        assert "--notes-file notes.md" in text[create:upload]
        assert "--clobber" in text[upload:edit]
        assert "--draft=false" in text[edit:]

    def test_the_edit_is_the_last_gh_step(self, job):
        steps = _gh_steps(job)
        assert "gh release edit" in steps[-1]["run"]
        assert sum("gh release edit" in s["run"] for s in steps) == 1
        assert "gh release create" in steps[0]["run"]

    def test_the_website_redeploys_after_the_publish_and_cannot_fail_it(self, job):
        steps = job["steps"]
        runs = [s.get("run", "") for s in steps]
        dispatch = next(
            i for i, r in enumerate(runs) if "gh workflow run website.yml" in r
        )
        edit = next(i for i, r in enumerate(runs) if "gh release edit" in r)
        assert dispatch > edit
        assert steps[dispatch].get("continue-on-error") is True
        assert job["permissions"].get("actions") == "write"

    def test_a_test_tag_is_a_pre_release_and_not_latest(self, job):
        text = _runs(job)
        create = text[
            _index(text, "gh release create") : _index(text, "gh release upload")
        ]
        edit = text[_index(text, "gh release edit") :]
        assert "--prerelease" in create
        assert "--prerelease" in edit
        assert "--latest=false" in edit

    def test_a_normal_tag_is_made_latest(self, job):
        edit = _runs(job)
        edit = edit[_index(edit, "gh release edit") :]
        assert "--latest" in edit.replace("--latest=false", "")

    def _step_index(self, job, needle):
        for i, step in enumerate(job["steps"]):
            if needle in step.get("run", ""):
                return i
        raise AssertionError(f"no step runs {needle!r}")

    def test_the_mac_manifests_are_merged_before_the_draft(self, job):
        merge = self._step_index(job, "merge_update_manifests.py")
        create = self._step_index(job, "gh release create")
        assert merge < create
        # The merged file is written into the folder that is uploaded.
        assert "upload/latest-mac.yml" in job["steps"][merge]["run"]

    def test_the_per_leg_mac_manifests_are_not_uploaded(self, job):
        gather = job["steps"][self._step_index(job, "merge_update_manifests.py")]["run"]
        assert "latest-mac.yml" in gather.split("merge_update_manifests.py", 1)[1]
        assert "continue" in gather

    def test_mac_checksums_name_the_merged_manifest_before_the_draft(self, job):
        sums = self._step_index(job, "prepare_release_assets.py mac-sums")
        merge = self._step_index(job, "merge_update_manifests.py")
        assert merge < sums < self._step_index(job, "gh release create")

    def test_every_file_is_checked_before_the_draft(self, job):
        check = self._step_index(job, "prepare_release_assets.py check")
        assert self._step_index(job, "mac-sums") < check
        assert check < self._step_index(job, "gh release create")
        assert "--version" in job["steps"][check]["run"]

    def test_a_rerun_reuses_a_draft_and_refuses_a_published_release(self, job):
        run = job["steps"][self._step_index(job, "gh release create")]["run"]
        assert "gh release view" in run and "isDraft" in run
        assert run.index("gh release view") < run.index("gh release create")
        assert "already published" in run
        # `create` is reached only through the branch where `view` failed.
        assert run.count("gh release create") == 2
        assert "elif" in run

    def test_uses_the_workflow_token(self, job):
        assert job["env"]["GH_TOKEN"] == "${{ github.token }}"


class TestBuildWorkflow:
    def test_is_callable_with_a_release_flag_and_keeps_its_triggers(
        self, build_workflow
    ):
        on = build_workflow["on"]
        assert "push" in on
        assert "pull_request" in on
        release_input = on["workflow_call"]["inputs"]["release"]
        assert release_input["type"] == "boolean"
        assert release_input["default"] is False

    def _step(self, wf, name):
        return next(
            s for s in wf["jobs"]["desktop-electron"]["steps"] if s.get("name") == name
        )

    def test_sentry_upload_is_required_for_a_release(self, build_workflow):
        step = self._step(build_workflow, "Upload source maps to Sentry")
        assert "inputs.release" in str(step["continue-on-error"])
        # A tag push reaches here as the caller's event: 'push'.
        assert "github.event_name == 'push'" in step["if"]
        assert "HAS_SENTRY_TOKEN" in step["if"]

    def test_a_release_without_the_sentry_secret_fails_the_leg(self, build_workflow):
        step = self._step(build_workflow, "Require the Sentry token for a release")
        assert "inputs.release" in step["if"]
        assert "HAS_SENTRY_TOKEN" in step["if"]
        assert "exit 1" in step["run"]
        names = [
            s.get("name") for s in build_workflow["jobs"]["desktop-electron"]["steps"]
        ]
        assert names.index("Require the Sentry token for a release") < names.index(
            "Upload source maps to Sentry"
        )

    def test_release_artifact_holds_only_the_distributables(self, build_workflow):
        step = self._step(build_workflow, "Upload release files")
        assert "inputs.release" in step["if"]
        assert step["with"]["name"] == "release-${{ matrix.leg }}"
        assert step["with"]["retention-days"] <= 14
        paths = step["with"]["path"]
        for needed in (
            "*.blockmap",
            "latest*.yml",
            "SHA256SUMS-${{ matrix.leg }}.txt",
            "CuePoint-*",
        ):
            assert needed in paths
        assert "**" not in paths


def _holds(
    expression: str, *, results: dict, prerelease: bool, cancelled: bool
) -> bool:
    """Evaluate a ``${{ }}`` condition made only of ``needs.X.result``, ``&&``, ``||``,
    ``==``, ``!=``, ``!cancelled()`` and parentheses (the subset ``publish`` uses)."""
    import re

    text = " ".join(expression.split())
    text = re.sub(r"^\$\{\{\s*|\s*\}\}$", "", text)
    text = text.replace("!cancelled()", "(not CANCELLED)")
    text = text.replace("&&", " and ").replace("||", " or ")
    text = text.replace("needs.gate.outputs.prerelease", "PRERELEASE")
    text = re.sub(r"needs\.([a-z-]+)\.result", r'RESULTS["\1"]', text)
    assert not re.search(r"needs\.|github\.|inputs\.", text), text
    scope = {
        "RESULTS": results,
        "PRERELEASE": "true" if prerelease else "false",
        "CANCELLED": cancelled,
    }
    return bool(eval(text, {"__builtins__": {}}, scope))  # noqa: S307


class TestPublishConditionTruthTable:
    """A normal or a test tag, and the scale run succeeding, failing, skipped or cancelled."""

    OUTCOMES = ("success", "failure", "skipped", "cancelled")

    def _publishes(
        self,
        release,
        *,
        test_tag: bool,
        scale: str,
        cancelled=False,
        acceptance: str = "success",
    ):
        # The scale and acceptance jobs are skipped on a test tag whatever else happens (their own
        # `if`, which the next tests pin), and run on a normal tag.
        result = "skipped" if test_tag else scale
        return _holds(
            release["jobs"]["publish"]["if"],
            results={
                "gate": "success",
                "check-macs": "success",
                "scale": result,
                "acceptance": "skipped" if test_tag else acceptance,
            },
            prerelease=test_tag,
            cancelled=cancelled,
        )

    @pytest.mark.parametrize("scale", OUTCOMES)
    def test_a_test_tag_publishes_whatever_scale_would_have_done(self, release, scale):
        assert self._publishes(release, test_tag=True, scale=scale) is True

    def test_a_normal_tag_publishes_only_on_a_green_scale_run(self, release):
        got = {
            o: self._publishes(release, test_tag=False, scale=o) for o in self.OUTCOMES
        }
        assert got == {
            "success": True,
            "failure": False,
            "skipped": False,
            "cancelled": False,
        }

    @pytest.mark.parametrize("test_tag", [False, True])
    def test_a_cancelled_run_publishes_nothing(self, release, test_tag):
        assert not self._publishes(
            release, test_tag=test_tag, scale="success", cancelled=True
        )

    @pytest.mark.parametrize("test_tag", [False, True])
    @pytest.mark.parametrize("failed", ["gate", "check-macs"])
    def test_a_failed_gate_or_mac_check_publishes_nothing(
        self, release, test_tag, failed
    ):
        results = {
            "gate": "success",
            "check-macs": "success",
            "scale": "success",
            "acceptance": "success",
        }
        results[failed] = "failure"
        assert not _holds(
            release["jobs"]["publish"]["if"],
            results=results,
            prerelease=test_tag,
            cancelled=False,
        )

    def test_the_scale_job_is_skipped_exactly_for_a_test_tag(self, release):
        assert (
            release["jobs"]["scale"]["if"]
            == "${{ needs.gate.outputs.prerelease != 'true' }}"
        )

    def test_a_release_runs_the_50000_job_only(self, release):
        assert release["jobs"]["scale"]["with"] == {"above_reference": False}

    @pytest.mark.parametrize("outcome", OUTCOMES)
    def test_a_test_tag_publishes_whatever_the_acceptance_list_says(
        self, release, outcome
    ):
        assert (
            self._publishes(release, test_tag=True, scale="success", acceptance=outcome)
            is True
        )

    def test_a_normal_tag_publishes_only_when_the_acceptance_list_is_clear(
        self, release
    ):
        got = {
            o: self._publishes(release, test_tag=False, scale="success", acceptance=o)
            for o in self.OUTCOMES
        }
        assert got == {
            "success": True,
            "failure": False,
            "skipped": False,
            "cancelled": False,
        }


class TestAcceptanceGate:
    """HARDEN-09 (DEC-188): `v1.0.0` waits for every owed check; a test tag does not."""

    def test_the_job_is_skipped_exactly_for_a_test_tag(self, release):
        assert (
            release["jobs"]["acceptance"]["if"]
            == "${{ needs.gate.outputs.prerelease != 'true' }}"
        )

    def test_it_runs_the_release_check_of_the_checklist(self, release):
        job = release["jobs"]["acceptance"]
        assert "python scripts/check_acceptance.py --release" in _runs(job)
        assert job["runs-on"] == "ubuntu-latest"

    def test_the_gate_job_does_not_run_it(self, release):
        # The gate runs for a test tag too; only the job above is skipped for one.
        assert "check_acceptance" not in _runs(release["jobs"]["gate"])

    def test_no_other_workflow_demands_the_release_rule(self):
        # Ordinary CI must stay green while checks are owed.
        for path in sorted(_WORKFLOWS.glob("*.yml")):
            if path.name == "release.yml":
                continue
            text = path.read_text(encoding="utf-8")
            assert "check_acceptance.py --release" not in text, path.name


# The CI-speed rules (one Python run per push, one e2e run per release, no repeated or superseded work).
_CANCEL = (
    "${{ github.ref != 'refs/heads/main' && !startsWith(github.ref, 'refs/tags/') }}"
)


@pytest.fixture(scope="module")
def release_gates() -> dict:
    return _load("release-gates.yml")


@pytest.fixture(scope="module")
def test_workflow() -> dict:
    return _load("test.yml")


def _step_named(job: dict, name: str) -> dict:
    return next(s for s in job["steps"] if s.get("name") == name)


class TestDesktopEndToEndRunsOncePerRelease:
    def test_the_dev_build_suite_is_skipped_on_a_release(self, build_workflow):
        job = build_workflow["jobs"]["desktop-electron"]
        step = _step_named(job, "Playwright Electron smoke")
        assert "!inputs.release" in step["if"]

    def test_the_packaged_run_is_unfiltered_on_a_release(self, build_workflow):
        job = build_workflow["jobs"]["desktop-electron"]
        step = _step_named(job, "Packaged app end-to-end")
        assert step["if"] == "${{ !cancelled() && steps.app.outcome == 'success' }}"
        assert (
            step["env"]["RELEASE_RUN"] == "${{ inputs.release && 'true' || 'false' }}"
        )
        run = step["run"]
        release_branch = run.split("else", 1)[0]
        assert 'filter=""' in release_branch
        assert "--grep" not in release_branch
        assert "@dom-only" not in run

    def test_a_release_still_builds_and_keeps_its_files_without_the_dev_run(
        self, build_workflow
    ):
        job = build_workflow["jobs"]["desktop-electron"]
        assert (
            "!cancelled()"
            in _step_named(job, "Build Electron installers + artifacts")["if"]
        )
        assert _step_named(job, "Upload release files")["if"] == "inputs.release"
        names = [s.get("name") for s in job["steps"]]
        assert (
            names.index("Playwright Electron smoke")
            < names.index("Build Electron installers + artifacts")
            < names.index("Packaged app end-to-end")
        )

    def test_the_dev_run_leaves_the_dom_only_specs_to_linux(self, build_workflow):
        job = build_workflow["jobs"]["desktop-electron"]
        run = _step_named(job, "Playwright Electron smoke")["run"]
        assert "--grep-invert @dom-only" in run
        # Linux (under Xvfb) runs everything; the filter belongs to the other branch.
        linux, other = run.split("else", 1)
        assert "xvfb-run" in linux and "@dom-only" not in linux
        assert "@dom-only" in other

    def test_the_a11y_spec_is_tagged_dom_only(self):
        spec = (
            _REPO_ROOT / "apps" / "desktop-electron" / "e2e" / "a11y.spec.ts"
        ).read_text(encoding="utf-8")
        assert "@dom-only" in spec


class TestDesktopTriggersAndRepeatedTests:
    def test_a_push_to_main_does_not_build_the_desktop_app(self, build_workflow):
        branches = build_workflow["on"]["push"]["branches"]
        assert "main" not in branches
        assert "feature" in branches
        # A pull request into main still builds.
        assert "main" in build_workflow["on"]["pull_request"]["branches"]

    def test_engine_unit_tests_are_left_to_release_gates(self, build_workflow):
        job = build_workflow["jobs"]["desktop-electron"]
        names = [s.get("name") for s in job["steps"]]
        assert "Engine unit tests (HTTP API)" not in names
        assert "Engine health smoke" in names

    def test_renderer_unit_tests_run_on_linux_only(self, build_workflow):
        job = build_workflow["jobs"]["desktop-electron"]
        step = _step_named(job, "Unit test renderer")
        assert step["if"] == "matrix.leg == 'linux-x64'"

    def test_downloads_are_cached_before_npm_ci(self, build_workflow):
        steps = build_workflow["jobs"]["desktop-electron"]["steps"]
        cache = next(
            i for i, s in enumerate(steps) if "actions/cache@v4" in s.get("uses", "")
        )
        install = next(i for i, s in enumerate(steps) if "npm ci" in s.get("run", ""))
        assert cache < install
        paths = steps[cache]["with"]["path"]
        for needed in (
            "~/.cache/ms-playwright",
            "~/.cache/electron-builder",
            "~/AppData/Local/ms-playwright",
        ):
            assert needed in paths
        assert "package-lock.json" in steps[cache]["with"]["key"]


class TestSupersededRunsAreCancelledExceptOnMainAndTags:
    @pytest.mark.parametrize(
        "name", ["desktop-electron.yml", "release-gates.yml", "test.yml"]
    )
    def test_concurrency(self, name):
        concurrency = _load(name)["concurrency"]
        assert concurrency["cancel-in-progress"] == _CANCEL
        assert "github.ref" in concurrency["group"]

    @pytest.mark.parametrize(
        "name", ["desktop-electron.yml", "release-gates.yml", "test.yml"]
    )
    def test_website_and_promo_video_pushes_start_nothing(self, name):
        on = _load(name)["on"]
        triggers = [t for t in ("push", "pull_request") if t in on]
        assert triggers, name
        for trigger in triggers:
            assert on[trigger]["paths-ignore"] == [
                "apps/website/**",
                "apps/promo-video/**",
            ]


class TestPythonSuiteRunsOncePerPush:
    def test_test_yml_runs_on_pull_requests_only(self, test_workflow):
        assert "push" not in test_workflow["on"]
        assert "pull_request" in test_workflow["on"]

    def _gates(self, release_gates):
        return release_gates["jobs"]["test-gates"]

    def test_release_gates_runs_the_system_and_regression_tests_after_integration(
        self, release_gates
    ):
        job = self._gates(release_gates)
        runs = [s.get("run", "") for s in job["steps"]]
        integration = next(
            i for i, r in enumerate(runs) if "src/tests/integration/" in r
        )
        for layer in ("system", "regression"):
            idx = next(i for i, r in enumerate(runs) if f"src/tests/{layer}/" in r)
            assert integration < idx, layer
            assert (
                'pytest src/tests/%s/ -q --timeout=300 -m "not slow"' % layer
                in runs[idx]
            )
            # No `if`: they run on every leg, the same legs as the integration tests.
            assert (
                "if" not in job["steps"][idx] and "if" not in job["steps"][integration]
            )

    def test_release_gates_runs_on_phase_branches_as_test_yml_did(self, release_gates):
        branches = release_gates["on"]["push"]["branches"]
        assert {"main", "feature", "phase_*"} <= set(branches)

    def test_release_gates_runs_the_dead_code_guard_and_the_qt_check(
        self, release_gates
    ):
        text = _runs(release_gates["jobs"]["code-quality-gates"])
        assert "python scripts/audit_dead_code.py --check" in text
        assert "python scripts/check_no_qt.py" in text


class TestParallelUnitTests:
    def _job(self, release_gates):
        return release_gates["jobs"]["test-gates"]

    def test_the_matrix_has_no_halves_and_python_311_is_linux_only(self, release_gates):
        matrix = self._job(release_gates)["strategy"]["matrix"]
        assert "part" not in matrix
        pairs = {(i["os"], i["python-version"]) for i in matrix["include"]}
        assert pairs == {
            ("ubuntu-latest", "3.11"),
            ("ubuntu-latest", "3.12"),
            ("macos-latest", "3.12"),
            ("windows-latest", "3.12"),
        }
        assert "windows-coverage" not in release_gates["jobs"]

    def test_unit_tests_run_in_parallel_then_the_serial_ones_alone(self, release_gates):
        step = _step_named(self._job(release_gates), "Run unit tests")
        run = step["run"]
        parallel, serial = (
            line
            for line in run.splitlines()
            if "pytest" in line and "src/tests/unit/" in line
        )
        assert "-n auto" in parallel and '-m "not serial"' in parallel
        assert "-n" not in serial.split() and "-m serial" in serial
        for line in (parallel, serial):
            assert "--timeout=300" in line and "--timeout-method=thread" in line
            assert "--durations=30" in line
        # Coverage: the first pass collects, the second appends and writes the xml.
        cov1 = next(ln for ln in run.splitlines() if ln.strip().startswith('cov1="--'))
        cov2 = next(ln for ln in run.splitlines() if ln.strip().startswith('cov2="--'))
        assert "--cov=src/cuepoint" in cov1 and "--cov-append" not in cov1
        assert "--cov-report=xml" not in cov1
        assert "--cov-append" in cov2 and "--cov-report=xml" in cov2
        assert "$cov1" in parallel and "$cov2" in serial

    def test_a_serial_pass_that_collects_nothing_is_not_a_failure(self, release_gates):
        run = _step_named(self._job(release_gates), "Run unit tests")["run"]
        tail = run[run.index("-m serial") :]
        assert "-ne 5" in tail
        # Only that pass tolerates exit code 5; the parallel one fails on it.
        assert "-ne 5" not in run[: run.index("-m serial")]

    def test_the_marker_is_registered_and_xdist_is_pinned(self):
        ini = (_REPO_ROOT / "pytest.ini").read_text(encoding="utf-8")
        assert "serial:" in ini
        dev = (_REPO_ROOT / "requirements-dev.txt").read_text(encoding="utf-8")
        assert "pytest-xdist==3." in dev

    def test_coverage_is_still_gated_on_python_312(self, release_gates):
        job = self._job(release_gates)
        check = _step_named(job, "Check test coverage")
        assert "coverage report --fail-under=35" in check["run"]
        assert check["if"] == "matrix.python-version != '3.11'"
        assert (
            _step_named(job, "Upload coverage")["if"]
            == "matrix.python-version != '3.11'"
        )
